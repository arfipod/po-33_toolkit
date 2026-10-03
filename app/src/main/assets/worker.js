import {autoTune,makeBank,samplePitch} from './dsp.js';
self.onmessage=({data:m})=>{try{let result;if(m.type==='tune')result=autoTune(m.source,m.root,m.scale,m.strength);else if(m.type==='bank')result=makeBank(m.source,m.base,m.entries,m.seconds,m.preserve);else result=samplePitch(m.source);self.postMessage({id:m.id,result});}catch(e){self.postMessage({id:m.id,error:e.message});}};
