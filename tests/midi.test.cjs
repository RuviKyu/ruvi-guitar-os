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
 assert.deepEqual(plain(run('normal.errors')),[]);assert.equal(run('normal.song.midi.tracks.length'),3);assert.equal(run('midiTrackChart(selectedMidiPart(normal.song)).notes.length'),2);
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
test('combined effects and bend curves survive JSON normalization',()=>{
 run('var fxSong={id:"fx",title:"FX",bpm:120,totalBeats:8,notes:[{beat:0,dur:2,string:2,fret:7,tech:"B",effects:["B","vib"],pitchCurve:[{pos:0,semitones:0},{pos:.6,semitones:2},{pos:1,semitones:0}],section:"SOLO"},{beat:2,dur:1,string:2,fret:9,tech:"H",section:"SOLO"}]};var fxNormal=normalizeRuviSong(fxSong,null).song');
 assert.deepEqual(plain(run('fxNormal.notes[0].effects')),['B','vib']);assert.equal(run('fxNormal.notes[0].pitchCurve[1].semitones'),2);
});
test('slides infer the next fret and expose a continuous pitch target',()=>{
 run('var sliding=resolveNoteTechniques([{beat:0,dur:1,string:3,fret:7,tech:"SL"},{beat:1,dur:1,string:3,fret:10,tech:"pick"}])[0]');
 assert.equal(run('sliding.slideToFret'),10);assert.equal(run('notePitchAt(sliding,1)'),65);assert(run('notePitchAt(sliding,.7)>62&&notePitchAt(sliding,.7)<65'));
});
test('expressive MIDI retains exact technique metadata and emits audible pitch bends',()=>{
 run('var fxBytes=encodeSongMidi(fxSong);var fxMidi=parseStandardMidi(fxBytes)');
 assert.equal(run('fxMidi.tracks.length'),1);assert.equal(run('fxMidi.tracks[0].notes[0].effects.includes("vib")'),true);assert.equal(run('fxMidi.tracks[0].notes[1].tech'),'H');
 assert(run('Array.from(fxBytes).some((b,i)=>b>=224&&b<240&&((fxBytes[i+1]||0)+(fxBytes[i+2]||0)*128)!==8192)'));
});
test('plain MIDI pitch wheel plus RPN sensitivity is imported as a pitch curve',()=>{
 context.bendMidi=midi([[0,192,30,0,176,101,0,0,176,100,0,0,176,6,12,0,144,60,100,...variable(240),224,0,80,...variable(240),128,60,0,0,255,47,0]],0);
 run('var importedBend=parseStandardMidi(bendMidi).tracks[0].notes[0]');assert.equal(run('importedBend.pitchCurve[1].semitones'),3);assert.equal(run('importedBend.tech'),'B');
});
test('expressive channels isolate a bent voice from a simultaneous plain chord',()=>{
 run('var poly={...fxSong,notes:[fxSong.notes[0],{beat:0,dur:2,string:3,fret:7,tech:"pick",section:"SOLO"}]};var polyRound=parseStandardMidi(encodeSongMidi(poly)).tracks[0].notes');
 assert.equal(run('polyRound.find(n=>n.midi===62).pitchCurve===undefined'),true);
 assert.equal(run('polyRound.find(n=>n.midi===66).pitchCurve[1].semitones'),2);
});
test('authored six-string positions are retained without redundant chart copies',()=>{
 run('var authored={notes:[{beat:0,dur:1,midi:74,string:2,fret:15,tech:"SL",effects:["SL"],slideToFret:13}],tuning:[64,59,55,50,45,40],transpose:0}');
 assert.equal(run('midiTrackChart(authored).notes[0].fret'),15);assert.equal(run('midiTrackChart(authored).notes[0].string'),2);
});
test('effect sanitization clamps imported curves and rejects unknown effect labels',()=>{
 const r=plain(run('sanitizeNoteExpression({effects:["B","<script>","B"],pitchCurve:[{pos:-10,semitones:999},{pos:9,semitones:-999}]})'));
 assert.deepEqual(r.effects,['B']);assert.deepEqual(r.pitchCurve,[{pos:0,semitones:12},{pos:1,semitones:-12}]);
});
test('connected systems pack multiple bars without internal gaps',()=>{
 run('var scoreBars=scoreMeasures({bpm:120},32);var scoreGroups=groupScoreNotes(scoreBars,[{beat:0,dur:6,string:3,fret:7}]);var systems=layoutScoreSystems(scoreBars,scoreGroups,0,8,1300,1)');
 assert.equal(run('systems[0].measures.length'),4);assert.equal(run('scoreGroups[1][0].carry'),true);
 assert.equal(run('systems[0].measures.every((m,i,row)=>!i||Math.abs(m.x-row[i-1].x-row[i-1].width)<.00001)'),true);
});
test('measure lookup follows boundaries and mixed meter accurately',()=>{
 run('var mixed=scoreMeasures({midi:{timeSignatures:[{beat:0,numerator:3,denominator:4},{beat:6,numerator:4,denominator:4}]}},14)');
 assert.equal(run('scoreBarIndex(mixed,2.99)'),0);assert.equal(run('scoreBarIndex(mixed,3)'),1);assert.equal(run('scoreBarIndex(mixed,10)'),3);assert.equal(run('scoreBarIndex(mixed,14)'),-1);
});
test('dense narrow systems retain a usable measure width and source indexes',()=>{
 run('var dense=groupScoreNotes(scoreBars,Array.from({length:64},(_,i)=>({beat:i*.0625,dur:.0625,string:3,fret:7})));var narrow=layoutScoreSystems(scoreBars,dense,0,8,320,1.2)');
 assert(run('narrow[0].measures[0].width>1000'));assert.equal(run('narrow.flatMap(r=>r.measures.map(m=>m.index)).join(",")'),'0,1,2,3,4,5,6,7');
});
test('mixer flags do not change the prepared audio/chart fingerprint',()=>{
 run('var fingerprintSong=scoreClone(normal.song);var beforeFingerprint=playbackFingerprint(fingerprintSong);fingerprintSong.midi.tracks[0].muted=true;fingerprintSong.midi.tracks[0].volume=0;fingerprintSong.midi.tracks[1].solo=true');
 assert.equal(run('playbackFingerprint(fingerprintSong)'),run('beforeFingerprint'));
});
test('editor timing display is readable while triplets keep useful precision',()=>{
 assert.equal(run('editorNumber(.4999186197916667)'),.5);assert.equal(run('editorNumber(1/3)'),.333333);
});
