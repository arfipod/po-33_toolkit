package com.arfipod.po33toolkit;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.*;
import android.widget.FrameLayout;
import android.widget.Toast;
import org.json.JSONObject;
import java.io.*;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Offline app: only packaged assets can be loaded in the privileged WebView. */
public class MainActivity extends Activity {
    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private volatile boolean recording;
    private volatile boolean recordingBusy;
    private byte[] pendingExport;
    private ByteArrayOutputStream exportStream;
    private String exportName, exportMime;
    private static final int PICK = 10, SAVE = 11, MIC = 12;
    private static final String ORIGIN = "https://appassets.androidplatform.net/";

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        FrameLayout frame = new FrameLayout(this);
        frame.setBackgroundColor(Color.rgb(243,213,28));
        if (Build.VERSION.SDK_INT >= 27) getWindow().getDecorView().setSystemUiVisibility(android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        web = new WebView(this);
        frame.addView(web, new FrameLayout.LayoutParams(-1,-1));
        setContentView(frame);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            frame.setOnApplyWindowInsetsListener((v,insets) -> {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return WindowInsets.CONSUMED;
            });
        } else frame.setFitsSystemWindows(true);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false); s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        web.addJavascriptInterface(new Bridge(), "Android");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return true; }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri u=request.getUrl();
                if (!"https".equals(u.getScheme()) || !"appassets.androidplatform.net".equals(u.getHost())) return blocked();
                String path=u.getPath();
                if (path==null || path.contains("..")) return blocked();
                if (path.equals("/")) path="/index.html";
                String mime=path.endsWith(".html")?"text/html":path.endsWith(".css")?"text/css":path.endsWith(".js")?"text/javascript":path.endsWith(".wav")?"audio/wav":"application/octet-stream";
                try { return new WebResourceResponse(mime,"UTF-8",getAssets().open(path.substring(1))); }
                catch(IOException e) { return blocked(); }
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if(fileCallback!=null) fileCallback.onReceiveValue(null);
                fileCallback=cb;
                Intent pick=new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE);
                startActivityForResult(pick,PICK); return true;
            }
        });
        web.loadUrl(ORIGIN+"index.html");
    }
    private WebResourceResponse blocked() { return new WebResourceResponse("text/plain","UTF-8",403,"Blocked",null,new ByteArrayInputStream(new byte[0])); }
    private void js(String code) { runOnUiThread(() -> { if(web!=null) web.evaluateJavascript(code,null); }); }
    private void message(String text) { js("window.nativeMessage && window.nativeMessage("+JSONObject.quote(text)+")"); }
    public final class Bridge {
        @JavascriptInterface public void record() { runOnUiThread(() -> {
            if(recordingBusy) { recording=false; return; }
            if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED) requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},MIC);
            else startRecording();
        }); }
        @JavascriptInterface public synchronized void beginExport(String name,String mime) {
            if (pendingExport!=null) { message("Termina primero el guardado abierto."); return; }
            exportStream=new ByteArrayOutputStream();
            exportName=name.replaceAll("[^a-zA-Z0-9._-]","_"); exportMime=mime;
        }
        @JavascriptInterface public synchronized void exportChunk(String base64) {
            if(exportStream==null) return;
            byte[] b=Base64.decode(base64,Base64.DEFAULT);
            if(exportStream.size()+b.length>48*1024*1024) {exportStream=null;message("El archivo supera 48 MB.");return;}
            exportStream.write(b,0,b.length);
        }
        @JavascriptInterface public synchronized void finishExport() {
            if(exportStream==null) return;
            pendingExport=exportStream.toByteArray(); exportStream=null;
            runOnUiThread(() -> startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).setType(exportMime).addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE,exportName),SAVE));
        }
    }
    private void startRecording() {
        if(recordingBusy) return;
        recordingBusy=true; recording=true;
        io.execute(() -> {
            AudioRecord recorder=null;
            try {
                if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED) throw new SecurityException("Permiso de micrófono revocado");
                int size=Math.max(4096,AudioRecord.getMinBufferSize(44100,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT));
                recorder=new AudioRecord(MediaRecorder.AudioSource.MIC,44100,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT,size);
                if(recorder.getState()!=AudioRecord.STATE_INITIALIZED) throw new IOException("Micrófono no disponible");
                recorder.startRecording(); js("window.nativeRecording(true)");
                ByteArrayOutputStream pcm=new ByteArrayOutputStream(); byte[] buf=new byte[size];
                int max=44100*2*40;
                while(recording && pcm.size()<max) {int n=recorder.read(buf,0,Math.min(buf.length,max-pcm.size())); if(n<0) throw new IOException("Error del micrófono: "+n); if(n>0) pcm.write(buf,0,n);}
                recorder.stop();
                byte[] raw=pcm.toByteArray();
                if(raw.length>0) {
                    ByteBuffer out=ByteBuffer.allocate(44+raw.length).order(ByteOrder.LITTLE_ENDIAN);
                    out.put("RIFF".getBytes()).putInt(36+raw.length).put("WAVEfmt ".getBytes()).putInt(16).putShort((short)1).putShort((short)1).putInt(44100).putInt(88200).putShort((short)2).putShort((short)16).put("data".getBytes()).putInt(raw.length).put(raw);
                    String encoded=Base64.encodeToString(out.array(),Base64.NO_WRAP);
                    js("window.nativeAudio("+JSONObject.quote(encoded)+")");
                }
            } catch(Exception e) { message("No se pudo grabar: "+e.getMessage()); }
            finally { if(recorder!=null) recorder.release(); recording=false;recordingBusy=false;js("window.nativeRecording(false)"); }
        });
    }
    @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] grants) {
        super.onRequestPermissionsResult(request,permissions,grants);
        if(request==MIC && grants.length>0 && grants[0]==PackageManager.PERMISSION_GRANTED) startRecording();
        else message("Permite el micrófono en Ajustes para grabar. Puedes importar audio sin ese permiso.");
    }
    @Override protected void onActivityResult(int request,int result,Intent data) {
        super.onActivityResult(request,result,data);
        if(request==PICK && fileCallback!=null) {fileCallback.onReceiveValue(result==RESULT_OK && data!=null?new Uri[]{data.getData()}:null);fileCallback=null;}
        if(request==SAVE) {
            final byte[] bytes=pendingExport; pendingExport=null;
            if(result==RESULT_OK && data!=null && bytes!=null) {
                Uri uri=data.getData();
                io.execute(() -> {try(OutputStream out=getContentResolver().openOutputStream(uri)){if(out==null)throw new IOException("Destino no disponible");out.write(bytes);message("Archivo guardado.");}catch(Exception e){message("No se pudo guardar: "+e.getMessage());}});
            } else message("Guardado cancelado.");
        }
    }
    @Override protected void onPause() {recording=false;js("window.pauseApp && window.pauseApp()");super.onPause();}
    @Override protected void onDestroy() {recording=false;io.shutdown();if(fileCallback!=null)fileCallback.onReceiveValue(null);web.removeJavascriptInterface("Android");web.destroy();web=null;super.onDestroy();}
}
