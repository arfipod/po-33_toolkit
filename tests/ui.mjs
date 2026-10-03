import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=resolve('app/src/main/assets');
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+(req.url==='/'?'/index.html':req.url));if(!path.startsWith(root+'/'))throw Error('blocked');res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.wav':'audio/wav','.zip':'application/zip'})[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:412,height:850},deviceScaleFactor:1,isMobile:true,hasTouch:true,acceptDownloads:true});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await mkdir('test-results',{recursive:true});
async function noOverflow(){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Horizontal overflow');}
async function download(button,name){const pending=page.waitForEvent('download');await page.locator(button).click();const file=await pending;await file.saveAs('test-results/'+name);return readFile('test-results/'+name);}
try{
 await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#gameboy').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('16 sonidos cargados'));
 assert.equal(await page.locator('.pad:not(.empty)').count(),16);await noOverflow();await page.screenshot({path:'test-results/samples.png',fullPage:true});
 await page.locator('.pad').first().click();await page.locator('#toTune').click();await page.locator('#detect').click();await page.waitForFunction(()=>document.querySelector('#status').textContent==='Nota detectada. Puedes corregirla manualmente.');assert.equal(await page.locator('#baseNote').inputValue(),'C5');
 await page.locator('#eightPreset').click();await page.locator('#generate').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Banco generado'),{timeout:30000});
 await page.locator('[data-tab=export]').click();const wav=await download('#saveTransfer','bank.wav');assert.equal(wav.readUInt32LE(40),16*44100*2);assert.equal(wav.subarray(44+8*44100*2).some(v=>v!==0),false,'Second half must be silent');
 const map=await download('#saveMap','map.txt');assert.ok(map.toString().includes('Silencio'));await noOverflow();
 await page.locator('[data-tab=board]').click();await page.locator('#gameboy').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('16 sonidos cargados'));
 await page.locator('[data-tab=compose]').click();await page.locator('#demoClip').click();await page.locator('#playClip').click();await page.waitForTimeout(150);await page.locator('#stop').click();const clip=await download('#exportClip','clip.wav');assert.equal(clip.readUInt32LE(40),Math.round(16*60/100/4*44100)*2);assert.ok(clip.subarray(44).some(v=>v!==0));await page.screenshot({path:'test-results/clips.png',fullPage:true});await noOverflow();
 await page.locator('[data-tab=export]').click();const project=await download('#backup','project.po33.json');const saved=JSON.parse(project);assert.equal(saved.sounds.length,16);assert.ok(saved.clips[0].tracks[0].steps[0]);
 await page.waitForTimeout(800);await page.reload();await page.waitForFunction(()=>document.querySelector('#status').textContent==='Sesión anterior recuperada.');assert.equal(await page.locator('.pad:not(.empty)').count(),16);
 await page.locator('[data-tab=export]').click();const fc=page.waitForEvent('filechooser');await page.locator('#restore').click();await(await fc).setFiles('test-results/project.po33.json');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Proyecto restaurado'));
 await page.setViewportSize({width:360,height:740});for(const id of ['board','tune','compose','export']){await page.locator(`[data-tab=${id}]`).click();await noOverflow();}
 assert.deepEqual(errors,[]);console.log('UI passed: packs, pitch detection, bank generation, silent slots, WAV/map, clip playback/export, project round trip, autosave, 360/412px layout.');
}finally{await browser.close();server.close();}
