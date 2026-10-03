// Dependency-free offline DSP shared by the Android UI and Node regression tests.
export const RATE = 44100;
export const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
export const hz = midi => 440 * 2 ** ((midi-69)/12);
export function noteName(midi) { const n=Math.round(midi); return ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][((n%12)+12)%12]+(Math.floor(n/12)-1); }
export function parseNote(text) {
  let t=text.trim().replace(/♯/g,'#').replace(/♭/g,'b');
  t=t.replace(/^(do|re|mi|fa|sol|la|si)/i,(_,n)=>({do:'C',re:'D',mi:'E',fa:'F',sol:'G',la:'A',si:'B'})[n.toLowerCase()]);
  const m=/^([A-Ga-g])([#b]?)(-?\d)$/.exec(t);
  if(!m) throw Error(`Nota no válida: ${text}. Usa C4, Do4, F#3 o Bb3.`);
  const midi=(Number(m[3])+1)*12+({C:0,D:2,E:4,F:5,G:7,A:9,B:11})[m[1].toUpperCase()]+(m[2]==='#'?1:m[2]==='b'?-1:0);
  if(midi<24 || midi>108) throw Error('Las notas deben estar entre C1 y C8.');
  return midi;
}
export function targets(text) {
  const types={maj:[0,4,7],min:[0,3,7],m:[0,3,7],maj7:[0,4,7,11],m7:[0,3,7,10],'7':[0,4,7,10],sus2:[0,2,7],sus4:[0,5,7],dim:[0,3,6]};
  const tokens=text.trim().split(/[\s,;]+/).filter(Boolean);
  if(!tokens.length || tokens.length>16) throw Error('Escribe entre 1 y 16 notas/acordes.');
  return tokens.map(token=>{
    if(token==='-' || token==='0') return {name:'Silencio',notes:[]};
    const [root,type,...extra]=token.split(':');
    if(extra.length || (type && !types[type])) throw Error(`Acorde no válido: ${token}. Ejemplo C4:maj o A3:min.`);
    const midi=parseNote(root);
    return {name:token,notes:(type?types[type]:[0]).map(i=>midi+i)};
  });
}
export function normalize(data, peak=.89) {
  let max=0; for(const x of data) {if(!Number.isFinite(x))throw Error('Audio no válido');max=Math.max(max,Math.abs(x));}
  const out=data.slice(); if(max>1e-8) for(let i=0;i<out.length;i++)out[i]*=peak/max;return out;
}
export function fades(data, samples=220) {const out=data.slice();const n=Math.min(samples,Math.floor(out.length/2));for(let i=0;i<n;i++){const f=i/n;out[i]*=f;out[out.length-1-i]*=f;}return out;}
export function resample(data, from, to=RATE) {
  if(from===to)return data.slice();return rateShift(data,from/to,Math.round(data.length*to/from));
}
export function rateShift(data,ratio,length=Math.max(1,Math.round(data.length/ratio))) {
  const out=new Float32Array(length);
  for(let i=0;i<length;i++) {const p=i*ratio,j=Math.floor(p);if(j>=data.length)break;out[i]=data[j]*(1-(p-j))+(data[j+1]||0)*(p-j);}
  return out;
}
// YIN-style normalized difference on a downsampled frame. Best for one voice/note.
export function detectPitch(data, rate=RATE) {
  if(data.length<512)return null;
  const stride=Math.max(1,Math.floor(rate/11025)),sr=rate/stride;
  const size=Math.min(2048,Math.floor(data.length/stride));
  const x=new Float32Array(size);let energy=0;
  for(let i=0;i<size;i++){x[i]=data[i*stride];energy+=x[i]*x[i];}
  if(energy/size<1e-6)return null;
  const max=Math.min(Math.floor(sr/55),Math.floor(size/2)),min=Math.max(2,Math.floor(sr/1100));
  const diff=new Float64Array(max+1);let sum=0;
  for(let tau=1;tau<=max;tau++){
    let d=0; for(let i=0;i<size-max;i++){const v=x[i]-x[i+tau];d+=v*v;}
    sum+=d;diff[tau]=sum ? d*tau/sum : 1;
  }
  let best=-1;
  for(let tau=min;tau<max-1;tau++)if(diff[tau]<.16){while(tau<max-1&&diff[tau+1]<diff[tau])tau++;best=tau;break;}
  if(best<0)return null;
  const a=diff[best-1],b=diff[best],c=diff[best+1];
  const delta=Number.isFinite(c)&&a+c-2*b!==0 ? clamp((a-c)/(2*(a+c-2*b)),-.5,.5) : 0;
  const frequency=sr/(best+delta),midi=69+12*Math.log2(frequency/440);
  return {hz:frequency,midi,confidence:1-b,cents:Math.round(100*(midi-Math.round(midi))),name:noteName(midi)};
}
export function samplePitch(data, rate=RATE) {
  const found=[];const frame=Math.min(data.length,8192);
  for(let n=0;n<5;n++){const start=Math.floor((data.length-frame)*n/4);const p=detectPitch(data.subarray(start,start+frame),rate);if(p)found.push(p);}
  if(!found.length)return null;found.sort((a,b)=>a.midi-b.midi);return found[Math.floor(found.length/2)];
}
// Pitch-synchronous overlap-add (TD-PSOLA), intended for monophonic sources.
// Synthesis epochs run at the target pitch; source epochs follow waveform peaks.
export function pitchShift(data,semitones,preserve=true) {
  const ratio=2**(semitones/12);
  if(Math.abs(semitones)<.001)return data.slice();
  if(!preserve)return fades(rateShift(data,ratio));
  const p=samplePitch(data);
  if(!p)throw Error('Para conservar duración hace falta una nota monofónica clara. Usa modo Sampler para percusión/acordes.');
  return psola(data,()=>RATE/p.hz,()=>ratio);
}
function psola(data,periodAt,ratioAt) {
  const marks=[];let predicted=0;
  while(predicted<data.length){
    const period=periodAt(predicted),radius=period*.22;
    let best=Math.max(0,Math.round(predicted-radius)),value=-Infinity;
    const end=Math.min(data.length-1,Math.round(predicted+radius));
    for(let i=best;i<=end;i++)if(data[i]>value){value=data[i];best=i;}
    if(marks.length && best<=marks[marks.length-1])best=Math.round(predicted);
    marks.push(best);predicted=best+period;
  }
  const out=new Float32Array(data.length),weights=new Float32Array(data.length);
  let center=0,markIndex=0;
  while(center<data.length){
    while(markIndex+1<marks.length&&Math.abs(marks[markIndex+1]-center)<Math.abs(marks[markIndex]-center))markIndex++;
    const mark=marks[markIndex],period=periodAt(mark);
    const ratio=clamp(ratioAt(center),1/128,128),width=Math.ceil(period/ratio);
    for(let j=-width;j<=width;j++){
      const dst=Math.round(center+j),pos=mark+j*ratio,src=Math.floor(pos);
      if(dst<0||dst>=out.length||src<0||src+1>=data.length)continue;
      const w=.5+.5*Math.cos(Math.PI*j/width);
      out[dst]+=(data[src]*(1-(pos-src))+data[src+1]*(pos-src))*w;weights[dst]+=w;
    }
    center+=period/ratio;
  }
  for(let i=0;i<out.length;i++)if(weights[i]>1e-5)out[i]/=weights[i];
  return fades(out);
}
export function autoTune(data, root=0, scale='chromatic', strength=1) {
  const scales={chromatic:[0,1,2,3,4,5,6,7,8,9,10,11],major:[0,2,4,5,7,9,11],minor:[0,2,3,5,7,8,10]};
  const allowed=scales[scale];if(!allowed)throw Error('Escala no válida');
  const frame=8192,hop=2048,ratios=[],periods=[],voicing=[];let voiced=0,lastPeriod=RATE/220;
  for(let i=0;i<data.length;i+=hop){
    const start=clamp(i-frame/2,0,Math.max(0,data.length-frame));
    const p=detectPitch(data.subarray(start,start+frame));
    if(!p){ratios.push(1);periods.push(lastPeriod);voicing.push(false);continue;}voiced++;
    let target=Math.round(p.midi),dist=Infinity;
    for(let m=Math.floor(p.midi)-12;m<=Math.ceil(p.midi)+12;m++)if(allowed.includes(((m-root)%12+12)%12)&&Math.abs(m-p.midi)<dist){target=m;dist=Math.abs(m-p.midi);}
    ratios.push(2**((target-p.midi)*strength/12));lastPeriod=RATE/p.hz;periods.push(lastPeriod);voicing.push(true);
  }
  if(!voiced)throw Error('No se detecta una voz o nota estable. Prueba un sonido monofónico más limpio.');
  if(strength===0)return data.slice();
  const idx=center=>clamp(Math.round(center/hop),0,ratios.length-1);
  const output=psola(data,center=>periods[idx(center)],center=>ratios[idx(center)]);
  // Preserve unvoiced consonants/noise with a smooth voicing mix.
  let mix=0;for(let i=0;i<output.length;i++){mix+=((voicing[idx(i)]?1:0)-mix)*.002;output[i]=output[i]*mix+data[i]*(1-mix);}
  return fades(output);
}
export function makeBank(source, baseMidi, entries, slotSeconds=1, preserve=true) {
  if(!(slotSeconds>=.1&&slotSeconds<=2.5))throw Error('Cada posición debe durar entre 0,1 y 2,5 s.');
  const len=Math.round(slotSeconds*RATE),sounds=[],map=[];
  for(let i=0;i<16;i++){
    const entry=entries[i]||{name:'Silencio',notes:[]};let out=new Float32Array(len);
    for(const note of entry.notes){const shifted=pitchShift(source,note-baseMidi,preserve);for(let j=0;j<Math.min(len-1323,shifted.length);j++)out[j]+=shifted[j]/Math.max(1,entry.notes.length);}
    const audible=Math.max(0,len-1323);out.set(fades(out.slice(0,audible)));sounds.push({name:entry.name,data:out});map.push({pad:i+1,name:entry.name,start:i*len/RATE,end:(i+1)*len/RATE});
  }
  const full=new Float32Array(len*16);sounds.forEach((s,i)=>full.set(s.data,i*len));
  // One shared gain keeps relative levels consistent across all 16 slices.
  let peak=0;for(const x of full)peak=Math.max(peak,Math.abs(x));const gain=peak>0?.89/peak:1;
  for(let i=0;i<full.length;i++)full[i]*=gain;
  sounds.forEach((s,i)=>s.data=full.slice(i*len,(i+1)*len));
  return {sounds,full,map};
}
export function wav(data,rate=RATE) {
  const out=new ArrayBuffer(44+data.length*2),v=new DataView(out);
  const text=(p,s)=>{for(let i=0;i<s.length;i++)v.setUint8(p+i,s.charCodeAt(i));};
  text(0,'RIFF');v.setUint32(4,36+data.length*2,true);text(8,'WAVE');text(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,data.length*2,true);
  for(let i=0;i<data.length;i++){const s=clamp(data[i],-1,1);v.setInt16(44+i*2,Math.round(s*(s<0?32768:32767)),true);}return new Uint8Array(out);
}
export function emptyClip(name='Clip A') {return {name,bars:1,tracks:Array.from({length:4},(_,i)=>({pad:i<3?9+i:0,gain:.8,semitones:0,steps:Array(64).fill(0)}))};}
export function renderClip(clip,sounds,bpm=100,swing=0) {
  const step=60/bpm/4,steps=clip.bars*16,length=Math.round(steps*step*RATE),out=new Float32Array(length);
  if(length>RATE*40)throw Error('El clip supera 40 s. Sube los BPM o reduce compases.');
  for(const track of clip.tracks){const sample=sounds[track.pad];if(!sample)continue;const data=pitchShift(sample.data,track.semitones,false);
    for(let s=0;s<steps;s++)if(track.steps[s]){const offset=Math.round((s*step+(s%2?step*swing:0))*RATE);for(let j=0;j<data.length&&j+offset<length;j++)out[offset+j]+=data[j]*track.gain*track.steps[s];}
  }
  let peak=0;for(const x of out)peak=Math.max(peak,Math.abs(x));if(peak>.89)for(let i=0;i<length;i++)out[i]*=.89/peak;
  return fades(out,110);
}
