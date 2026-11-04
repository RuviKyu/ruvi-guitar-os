import {test} from 'node:test';
import assert from 'node:assert/strict';
import {focusLevel,activePolyphony,createBalancePlan} from '../public/vendor/instrument-balance.mjs';
import {SampledInstruments} from '../public/vendor/sampled-instruments.mjs';
test('silent part buses cannot consume voices needed by the main instrument',()=>{const engine=new SampledInstruments({},{});engine.loaded=true;engine.setPartGains([['silent',0]]);assert.equal(engine.play({partId:'silent'}),null);assert.equal(engine.voices.size,0);});
test('focus uses 100% for the main instrument and 85% for accompaniment',()=>{assert.equal(focusLevel(true),100);assert.equal(focusLevel(false),85);});
test('polyphony balances chords without penalizing rests or monophonic phrases',()=>{
 const mono=[{beat:0,dur:1},{beat:10,dur:1}],chord=[{beat:0,dur:1},{beat:0,dur:1},{beat:0,dur:1}];assert.equal(activePolyphony(mono),1);assert.equal(activePolyphony(chord),3);assert.equal(activePolyphony(chord,true),3);assert.equal(activePolyphony([]),1);
});
test('overlapping sustained notes use their actual active duration',()=>{assert.equal(activePolyphony([{beat:0,dur:2},{beat:1,dur:2}]),4/3);});
test('drum-kit balance accounts for hit density in seconds rather than short MIDI gates',()=>{const hits=Array.from({length:8},(_,i)=>({beat:i,dur:.01,seconds:i*.125}));assert(activePolyphony(hits,true)>4);assert.equal(activePolyphony([{beat:0,dur:.01,seconds:0},{beat:8,dur:.01,seconds:4}],true),1);});
test('reference notes cover the actual register and do not flatten note dynamics',()=>{
 const parts=[{id:'main',program:29,drum:false,notes:[{key:40,beat:0,dur:1,velocity:45},{key:52,beat:1,dur:1,velocity:120},{key:64,beat:2,dur:1,velocity:80}]},{id:'backing',program:29,drum:false,notes:[{key:76,beat:0,dur:1}]}],copy=JSON.stringify(parts),plan=createBalancePlan(parts);
 assert.equal(plan.calibrations.length,1);assert.deepEqual(plan.calibrations[0].keys,[40,64,76]);assert(plan.requests.every(n=>n.velocity===100));assert.equal(JSON.stringify(parts),copy);assert.deepEqual(plan.parts.map(p=>p.id),['main','backing']);
});
test('percussion references choose common exact drum keys and stay bounded',()=>{
 const plan=createBalancePlan([{id:'drums',program:0,drum:true,notes:Array.from({length:100},(_,i)=>({key:i%3?42:38,beat:i,dur:.25}))}]);assert.deepEqual(plan.calibrations[0].keys,[42,38]);assert.equal(plan.parts[0].polyphony,1);assert.equal(plan.requests.length,2);
});
