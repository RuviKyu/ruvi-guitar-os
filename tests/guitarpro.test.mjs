import {test} from 'node:test';
import assert from 'node:assert/strict';
import {importer,exporter,model,Settings} from '@coderline/alphatab/core';
import {loadGuitarProBytes,validateGpArchive} from '../public/vendor/guitarpro-import.mjs';

function fixture(){
  const score=importer.ScoreLoader.loadAlphaTex('\\title "Technique fixture" \\tempo 120 . 7.3 9.3 10.3 12.3 | 12.2 14.2 15.2 17.2');
  const beats=score.tracks[0].staves[0].bars[0].voices[0].beats;
  beats[0].notes[0].isHammerPullOrigin=true;
  beats[1].notes[0].slideOutType=1;
  beats[2].notes[0].addBendPoint(new model.BendPoint(0,0));
  beats[2].notes[0].addBendPoint(new model.BendPoint(60,4));
  score.masterBars[0].isRepeatStart=true;score.masterBars[1].repeatCount=2;
  score.finish(new Settings());
  return new exporter.Gp7Exporter().export(score);
}
test('a real Guitar Pro ZIP round-trip keeps authored frets and guitar techniques',()=>{
  const parsed=loadGuitarProBytes(fixture());
  assert.equal(parsed.title,'Technique fixture');assert.equal(parsed.tracks.length,1);
  const notes=parsed.tracks[0].notes;
  assert(notes.some(n=>n.string===3&&n.fret===7));
  assert(notes.some(n=>n.effects.includes('H')));assert(notes.some(n=>n.effects.includes('SL')));
  assert(notes.some(n=>n.pitchCurve?.some(p=>p.semitones===2)));
});
test('playback repeats unfold into consecutive absolute note positions',()=>{
  const parsed=loadGuitarProBytes(fixture());
  assert.equal(parsed.totalBeats,16);assert.equal(parsed.tracks[0].notes.length,16);
  assert(parsed.tracks[0].notes.every((n,i,notes)=>!i||n.beat>=notes[i-1].beat));
});
test('truncated ZIP directories and oversized input fail before parsing',()=>{
  const bytes=fixture();assert.throws(()=>validateGpArchive(bytes.subarray(0,bytes.length-30)));
  assert.throws(()=>validateGpArchive(new Uint8Array(8*1048576+1)));
});
test('GP archives claiming excessive expanded size are refused',()=>{
  const bytes=new Uint8Array(fixture()),v=new DataView(bytes.buffer);
  let central=-1;for(let i=0;i<bytes.length-46;i++)if(v.getUint32(i,true)===0x02014b50){central=i;break;}
  assert(central>=0);v.setUint32(central+24,40*1048576,true);assert.throws(()=>validateGpArchive(bytes));
});
