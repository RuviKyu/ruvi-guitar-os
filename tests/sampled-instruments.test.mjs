import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {expandMap,selectPreset,selectZones,pitchRatio,curveAt,SampledInstruments,MAX_DECODED_BYTES} from '../public/vendor/sampled-instruments.mjs';
const compact=JSON.parse(gunzipSync(fs.readFileSync(new URL('../public/sounds/fluidr3-map.json.gz',import.meta.url)))),map=expandMap(compact);
test('pinned library contains all 128 GM programs, standard percussion and valid sample slices',()=>{
 assert.equal(map.presets.filter(p=>p.bank===0).length,128);assert.equal(map.presets.filter(p=>p.bank===128).length,35);
 for(const [start,end,sr] of map.samples){assert(start>=0&&end>start&&end+map.sampleDataOffset<=map.bytes);assert(sr>=8000&&sr<=96000);}
 assert.throws(()=>expandMap({...compact,sha256:'bad'}),/Unexpected/);
});
test('every GM pitch and normal velocity selects instrument zones; extreme notes retain exact pitch',()=>{
 for(let p=0;p<128;p++)for(const velocity of [32,64,100,127])for(const key of [0,24,40,60,84,108,127])assert(selectZones(selectPreset(map,p),key,velocity).length,`${p}:${key}:${velocity}`);
 const zone=selectZones(selectPreset(map,0),120,100)[0];assert.equal(pitchRatio(zone,zone.root),2**((zone.transpose+zone.tune/100)/12));assert(Math.abs(pitchRatio(zone,zone.root+12)/pitchRatio(zone,zone.root)-2)<1e-10);
});
test('percussion kits select exact keys and retain hat choke groups rather than transposing missing keys',()=>{
 const kit=selectPreset(map,0,true),closed=selectZones(kit,42,100),open=selectZones(kit,46,100);assert(closed.length&&open.length);assert(closed.some(c=>open.some(o=>c.group&&c.group===o.group)));assert.equal(selectZones(kit,0,100).length,0);assert.equal(selectPreset(map,127,true).bank,128);
});
test('short original waveforms are preserved as PCM and all zone references are complete',()=>{
 assert(compact.shortSamples[642]);assert(Buffer.from(compact.shortSamples[642],'base64').length>0);
 for(const p of map.presets)for(const z of p.zones){assert(map.samples[z.sample]);assert(z.loKey<=z.hiKey&&z.loVel<=z.hiVel);assert(z.loopEnd>=z.loopStart);assert(Number.isFinite(pitchRatio(z,60)));}
});
test('pitch curves interpolate bends and releases without quantizing semitones',()=>{
 const c=[{pos:0,semitones:0},{pos:.5,semitones:2},{pos:1,semitones:0}];assert.equal(curveAt(c,.25),1);assert.equal(curveAt(c,.75),1);assert.equal(curveAt(c,1),0);
});
test('preparation deduplicates sample IDs, checks readiness and bounds memory',()=>{
 const e=new SampledInstruments({},{});e.map=map;e.loaded=true;const requests=[{program:30,drum:false,key:64,velocity:100}];assert.deepEqual([...e.requiredSamples(requests)],[...e.requiredSamples([...requests,...requests])]);assert.equal(e.ready(requests),false);for(const id of e.requiredSamples(requests))e.buffers.set(id,{});assert.equal(e.ready(requests),true);assert.equal(MAX_DECODED_BYTES,192*1048576);
});
