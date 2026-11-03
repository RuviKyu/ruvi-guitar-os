// Dependency-free MIDI/score regressions. Run: node --test tests/midi.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('const DEFAULT_APP_STATE'));
const window={addEventListener(){},innerWidth:1440};
const context=vm.createContext({window,navigator:{userAgent:'node test'},document:{getElementById(){return null;}},console,URL,TextDecoder,TextEncoder,Uint8Array,DataView,performance,setTimeout,clearTimeout});
vm.runInContext(script,context);
const run=code=>vm.runInContext(code,context);
const plain=value=>JSON.parse(JSON.stringify(value));
const variable=n=>{const a=[n&127];while((n=Math.floor(n/128)))a.unshift((n&127)|128);return a;};
const track=data=>[77,84,114,107,(data.length>>>24)&255,(data.length>>>16)&255,(data.length>>>8)&255,data.length&255,...data];
const midi=(tracks,format=1)=>new Uint8Array([77,84,104,100,0,0,0,6,0,format,0,tracks.length,1,224,...tracks.flatMap(track)]);
const fixture=midi([
 [0,255,81,3,7,161,32,0,255,88,4,3,2,24,8,...variable(960),255,81,3,15,66,64,0,255,47,0],
 [0,192,30,0,176,64,127,0,144,60,100,...variable(240),64,100,0,60,0,...variable(240),64,0,...variable(480),176,64,0,0,193,40,0,145,69,100,...variable(240),129,69,0,0,153,36,100,...variable(120),137,36,0,0,255,47,0]
]);
context.fixture=fixture;
run('var parsed = parseStandardMidi(fixture)');
test('HTML copies and script syntax remain valid',()=>{
 assert.equal(fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8'),html);
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
 for(const s of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(s[1]);
});
test('format 1: separate guitar, strings and percussion parts',()=>{
 assert.equal(run('parsed.tracks.length'),3);assert.equal(run('parsed.tracks[0].program'),30);assert.equal(run('parsed.tracks[2].isDrum'),true);
});
test('running status, zero-velocity note-off and sustain pedal',()=>{
 assert.deepEqual(plain(run('parsed.tracks[0].notes.map(n=>[n.midi,n.beat,n.dur])')),[[60,0,2],[64,.5,1.5]]);
});
test('conductor keeps tempo and non-4/4 meter',()=>{
 assert.deepEqual(plain(run('parsed.tempoMap')), [{beat:0,bpm:120},{beat:2,bpm:60}]);
 assert.deepEqual(plain(run('parsed.timeSignatures')), [{beat:0,numerator:3,denominator:4}]);
});
test('format 0 splits channel/program parts',()=>{
 context.single=midi([[0,192,30,0,144,60,100,0,193,40,0,145,72,100,...variable(480),128,60,0,0,129,72,0,0,255,47,0]],0);
 assert.equal(run('parseStandardMidi(single).tracks.length'),2);
});
test('tempo integration is reversible at changes and during lead-in',()=>{
 run('var clockSong={bpm:120,midi:{tempoMap:parsed.tempoMap}}');
 assert.equal(run('songBeatToSeconds(clockSong,4)'),3);assert.equal(run('songSecondsToBeat(clockSong,3)'),4);assert.equal(run('songSecondsToBeat(clockSong,-1)'),-2);
});
test('guitar mapping preserves pitch and keeps simultaneous notes on unique strings',()=>{
 run('var mapped=midiTrackChart({notes:[{beat:0,dur:1,midi:64},{beat:0,dur:1,midi:60},{beat:1,dur:1,midi:1}],transpose:0})');
 assert.equal(run('mapped.notes.length'),2);assert.equal(run('mapped.skipped'),1);assert.equal(run('new Set(mapped.notes.map(n=>n.string)).size'),2);
 assert.deepEqual(plain(run('mapped.notes.map(n=>STRING_BASE_MIDI[n.string]+n.fret).sort((a,b)=>a-b)')),[60,64]);
});
test('JSON validator preserves extended MIDI schema and saved guitar edits',()=>{
 run('var example={id:"midi_test",title:"Test",bpm:120,totalBeats:8,notes:midiTrackChart(parsed.tracks[0]).notes,midi:{...parsed,selectedTrackId:parsed.tracks[0].id}}; var normal=normalizeRuviSong(example,null)');
 assert.deepEqual(plain(run('normal.errors')),[]);assert.equal(run('normal.song.midi.tracks.length'),3);assert.equal(run('selectedMidiPart(normal.song).chartNotes.length'),2);
});
test('MIDI export round-trips parts, tempo, meter and edited guitar pitch',()=>{
 run('var exportSong=scoreClone(normal.song);exportSong.notes[0].fret+=1;var roundTrip=parseStandardMidi(encodeSongMidi(exportSong))');
 assert.equal(run('roundTrip.tracks.length'),3);assert.equal(run('roundTrip.tracks[0].notes[0].midi'),61);
 assert.deepEqual(plain(run('roundTrip.tempoMap')),plain(run('parsed.tempoMap')));assert.deepEqual(plain(run('roundTrip.timeSignatures')),plain(run('parsed.timeSignatures')));
});
test('measure boundaries follow meter changes',()=>{
 assert.deepEqual(plain(run('scoreMeasures({midi:{timeSignatures:[{beat:0,numerator:3,denominator:4},{beat:6,numerator:4,denominator:4}]}},10).map(b=>[b.start,b.end])')),[[0,3],[3,6],[6,10]]);
});
test('mute, solo and zero level survive sanitization',()=>{
 run('var mix=scoreClone(example.midi);mix.tracks[0].muted=true;mix.tracks[1].solo=true;mix.tracks[1].volume=0;var clean=sanitizeMidiArrangement(mix)');
 assert.equal(run('clean.tracks[0].muted'),true);assert.equal(run('clean.tracks[1].solo'),true);assert.equal(run('clean.tracks[1].volume'),0);
});
test('malformed, truncated, SMPTE and format-2 files fail explicitly',()=>{
 for(const kind of ['truncated','smpte','format2','running']) {
  const b=new Uint8Array(fixture);
  if(kind==='smpte')b[12]=255;if(kind==='format2')b[9]=2;
  context.bad=kind==='truncated'?b.subarray(0,b.length-1):kind==='running'?midi([[0,60,100,0,255,47,0]],0):b;
  assert.throws(()=>run('parseStandardMidi(bad)'));
 }
});
