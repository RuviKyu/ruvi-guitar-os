// Extract numeric preset/zone metadata from the MIT-licensed FluidR3Mono bank.
// alphaTab's SoundFont reader (MPL-2.0, with TinySoundFont MIT components) is a
// development tool only; audio is decoded lazily by the browser at runtime.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sourceUrl='https://raw.githubusercontent.com/musescore/MuseScore/v2.1.0/share/sound/FluidR3Mono_GM.sf3';
const expectedHash='cfcd66d89e8386823400eca64934b14fbea7bf48ba1f00d21189af1262794ec2';
const bankPath=process.argv[2]||path.join(root,'.soundbank-cache/FluidR3Mono_GM.sf3');
let bytes;try{bytes=await fs.readFile(bankPath);}catch{const response=await fetch(sourceUrl);if(!response.ok)throw Error('Soundbank download failed');bytes=Buffer.from(await response.arrayBuffer());await fs.mkdir(path.dirname(bankPath),{recursive:true});await fs.writeFile(bankPath,bytes);}
if(createHash('sha256').update(bytes).digest('hex')!==expectedHash)throw Error('Soundbank checksum mismatch');
const source=await fs.readFile(path.join(root,'node_modules/@coderline/alphatab/dist/alphaTab.core.mjs'),'utf8');
const end=source.lastIndexOf('\nexport {');if(end<0)throw Error('Unexpected alphaTab source');
const temporary=path.join(root,'scripts/.extractor-cache.mjs');
// The reader's unsigned conversion wraps negative loop-generator offsets at
// 65536. SoundFont offsets are signed; retain their sign when extracting data.
const extractor=source.slice(0,end).replaceAll('TypeConversions.int16ToUint32(amount.shortAmount)','amount.shortAmount');
await fs.writeFile(temporary,extractor+'\nexport {Hydra,TinySoundFont,ByteBuffer};\n');
let api;try{api=await import(pathToFileURL(temporary).href);}finally{await fs.unlink(temporary);}
const hydra=new api.Hydra();hydra.load(api.ByteBuffer.fromBuffer(new Uint8Array(bytes)));
const originalHeaders=hydra.sHdrs.map(s=>({...s}));
// Browsers can reject very short but valid Vorbis streams (single-cycle synth
// waves). Preserve those original waveforms as compact PCM rather than replace
// them with an oscillator. This data remains covered by the bank's MIT licence.
const shortSamples={};
for(let id=0;id<originalHeaders.length-1;id++){
 const s=originalHeaders[id],ogg=Buffer.from(hydra.sampleData.subarray(s.start,s.end));
 const page=ogg.lastIndexOf('OggS');if(page<0||page+14>ogg.length)continue;
 const frames=Number(ogg.readBigUInt64LE(page+6));if(frames>4096)continue;
 const pcm=hydra.decodeSamples(s.start,s.end,!!(s.sampleType&16)),out=Buffer.alloc(pcm.length*2);
 for(let n=0;n<pcm.length;n++)out.writeInt16LE(Math.round(Math.max(-1,Math.min(1,pcm[n]))*32767),n*2);
 shortSamples[id]=out.toString('base64');
}
// Keep the linked channels that TinySoundFont's mono renderer otherwise skips.
// Browser playback decodes each compressed channel and pans the linked pair.
for(const s of hydra.sHdrs)if(s.sampleType&6)s.sampleType=(s.sampleType&~6)|1;
const ids=new Map(hydra.sHdrs.map((s,i)=>[`${s.start}_${s.end}`,i]));
const fakeSamples=new Map();hydra.decodeSamples=(start,end)=>{const key=`${start}_${end}`;if(!fakeSamples.has(key)){const a=new Float32Array(1);a.sampleId=ids.get(key);fakeSamples.set(key,a);}return fakeSamples.get(key);};
const synth=new api.TinySoundFont();synth.loadPresets(hydra,new Set(Array.from({length:128},(_,i)=>i)),new Set(Array.from({length:128},(_,i)=>i)),false);
const fields=['sample','loKey','hiKey','loVel','hiVel','root','keyTrack','transpose','tune','attenuation','pan','loopStart','loopEnd','loopMode','group','filterFc','filterQ','delay','attack','hold','decay','sustain','release','keyHold','keyDecay','modDelay','modAttack','modHold','modDecay','modSustain','modRelease','modKeyHold','modKeyDecay','modFilter','modPitch','vibDelay','vibFreq','vibPitch','lfoDelay','lfoFreq','lfoPitch','lfoFilter','lfoVolume'];
const round=x=>Number(Number(x).toFixed(8));
const presets=synth.presets.filter(p=>p.bank===0||p.bank===128).map(p=>({bank:p.bank,program:p.presetNumber,name:p.name,zones:p.regions.filter(Boolean).map(r=>[
 r.samples.sampleId,r.loKey,r.hiKey,r.loVel,r.hiVel,r.pitchKeyCenter,r.pitchKeyTrack,r.transpose,r.tune,r.attenuation,r.pan,r.loopStart,r.loopEnd,r.loopMode,r.group,r.initialFilterFc,r.initialFilterQ,
 r.ampEnv.delay,r.ampEnv.attack,r.ampEnv.hold,r.ampEnv.decay,r.ampEnv.sustain,r.ampEnv.release,r.ampEnv.keynumToHold,r.ampEnv.keynumToDecay,r.modEnv.delay,r.modEnv.attack,r.modEnv.hold,r.modEnv.decay,r.modEnv.sustain,r.modEnv.release,r.modEnv.keynumToHold,r.modEnv.keynumToDecay,r.modEnvToFilterFc,r.modEnvToPitch,r.delayVibLFO,r.freqVibLFO,r.vibLfoToPitch,r.delayModLFO,r.freqModLFO,r.modLfoToPitch,r.modLfoToFilterFc,r.modLfoToVolume
 ].map(round))}));
for(const preset of presets){const extra=[];for(const zone of preset.zones){const sample=originalHeaders[zone[0]];if(!(sample?.sampleType&6))continue;const left=!!(sample.sampleType&4),buddy=sample.sampleLink;zone[10]=left?-.5:.5;zone[9]+=3;if(!preset.zones.some(z=>z[0]===buddy&&z[1]===zone[1]&&z[2]===zone[2]&&z[3]===zone[3]&&z[4]===zone[4])){const copy=[...zone];copy[0]=buddy;copy[10]=left?.5:-.5;extra.push(copy);}}preset.zones.push(...extra);}
if(presets.filter(p=>p.bank===0).length!==128)throw Error('Expected all 128 GM programs');
if(presets.some(p=>p.zones.some(z=>!Number.isFinite(z[0]))))throw Error('Unmapped sample');
const samples=originalHeaders.slice(0,-1).map(s=>[s.start,s.end,s.sampleRate,s.sampleName]);
const manifest={format:'RuviSampleMap1',library:'FluidR3Mono GM 2.312',license:'MIT',copyright:'Frank Wen 2000–2002, 2008; Michael Cowgill 2014–2016; Ethan Winer 2002; Michael Schorsch 2016',sourceUrl,mirrorUrl:'https://cdn.jsdelivr.net/gh/musescore/MuseScore@v2.1.0/share/sound/FluidR3Mono_GM.sf3',sha256:expectedHash,bytes:bytes.length,sampleDataOffset:414,zoneFields:fields,sampleFields:['byteStart','byteEnd','sampleRate','name'],samples,shortSamples,presets};
const out=path.join(root,'public/sounds/fluidr3-map.json.gz');await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,gzipSync(JSON.stringify(manifest)+'\n',{level:9}));
console.log(JSON.stringify({programs:128,kits:presets.filter(p=>p.bank===128).length,zones:presets.reduce((n,p)=>n+p.zones.length,0),samples:samples.length,mapBytes:(await fs.stat(out)).size}));
