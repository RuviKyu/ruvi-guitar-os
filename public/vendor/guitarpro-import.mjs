// Ruvi GP adapter. alphaTab is unmodified, separately licensed under MPL-2.0.
import {importer, midi, Settings} from './alphatab-1.9.0.mjs';

export function validateGpArchive(bytes) {
  if(bytes.length>8*1048576)throw Error('Guitar Pro files must be under 8 MB.');
  if(bytes[0]!==80||bytes[1]!==75)return; // Legacy GP3–5 / GPX are validated by alphaTab.
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let e=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(v.getUint32(i,true)===0x06054b50){e=i;break;}
  if(e<0)throw Error('Invalid Guitar Pro ZIP directory.');
  const count=v.getUint16(e+10,true);let p=v.getUint32(e+16,true),size=0;
  if(count>4000)throw Error('Guitar Pro archive has too many entries.');
  for(let i=0;i<count;i++){
    if(p+46>bytes.length||v.getUint32(p,true)!==0x02014b50)throw Error('Truncated Guitar Pro ZIP directory.');
    const unpacked=v.getUint32(p+24,true);size+=unpacked;
    if(unpacked>32*1048576||size>64*1048576)throw Error('Unpacked Guitar Pro score exceeds the 64 MB limit.');
    p+=46+v.getUint16(p+28,true)+v.getUint16(p+30,true)+v.getUint16(p+32,true);
  }
}
const num=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
function gpExpression(n) {
  const effects=[];let curve;
  if(n.hasBend){effects.push('B');curve=n.bendPoints.map(p=>({pos:p.offset/60,semitones:p.value/2}));}
  if(n.slideOutType||n.slideInType){
    effects.push('SL');
    if(!curve){
      if(n.slideTarget)curve=[{pos:0,semitones:0},{pos:.5,semitones:0},{pos:1,semitones:n.slideTarget.realValue-n.realValue}];
      else if(n.slideOutType)curve=[{pos:0,semitones:0},{pos:.6,semitones:0},{pos:1,semitones:n.slideOutType===3?3:-3}];
      else curve=[{pos:0,semitones:n.slideInType===1?-2:2},{pos:.25,semitones:0},{pos:1,semitones:0}];
    }
  }
  if(n.isHammerPullDestination&&n.hammerPullOrigin)effects.push(n.realValue>=n.hammerPullOrigin.realValue?'H':'P');
  if(n.vibrato||n.beat.vibrato)effects.push('vib');
  if(n.isPalmMute)effects.push('PM');
  if(n.isDead)effects.push('DEAD');
  if(n.isGhost)effects.push('GHOST');
  if(n.isLetRing)effects.push('LET');
  if(n.isLeftHandTapped||n.beat.tap)effects.push('TAP');
  if(n.isHarmonic)effects.push('HARM');
  return {tech:effects[0]||'pick',effects,...(curve?{pitchCurve:curve}:{}),...(n.slideTarget?{slideToFret:n.slideTarget.fret}:{}),legato:n.isHammerPullDestination||n.slideOutType===2};
}
export function loadGuitarProBytes(input,sourceName='Guitar Pro') {
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);validateGpArchive(bytes);
  const score=importer.ScoreLoader.loadScoreFromBytes(bytes);
  if(score.masterBars.length>8192||score.tracks.length>64)throw Error('This score is too large. Split it before importing.');
  // alphaTab's playback timeline unfolds repeats, alternate endings and jumps.
  const generator=new midi.MidiFileGenerator(score,new Settings(),new Proxy({},{get:()=>()=>{}}));generator.generate();
  const timeline=generator.tickLookup.masterBars;
  if(!timeline.length||timeline.at(-1).end/960>32768)throw Error('Expanded score exceeds 32,768 beats.');
  const tracks=[],tempoMap=[],timeSignatures=[],markers=[];let count=0;
  for(const item of timeline){
    const b=item.masterBar,beat=item.start/960;
    for(const t of item.tempoChanges)if(!tempoMap.length||tempoMap.at(-1).bpm!==t.tempo)tempoMap.push({beat:t.tick/960,bpm:t.tempo});
    const sig={beat,numerator:b.timeSignatureNumerator,denominator:b.timeSignatureDenominator};
    if(!timeSignatures.length||timeSignatures.at(-1).numerator!==sig.numerator||timeSignatures.at(-1).denominator!==sig.denominator)timeSignatures.push(sig);
    if(b.section)markers.push({beat,name:b.section.text||b.section.marker||'SECTION'});
  }
  for(const track of score.tracks)for(const staff of track.staves){
    const t={id:`gp_${track.index}_${staff.index}`,name:track.name+(track.staves.length>1?` · Staff ${staff.index+1}`:''),program:track.playbackInfo.program,channel:staff.isPercussion?9:track.playbackInfo.primaryChannel,isDrum:staff.isPercussion,notes:[],muted:track.playbackInfo.isMute,solo:track.playbackInfo.isSolo,volume:Math.round(track.playbackInfo.volume/16*100),transpose:0,tuning:staff.tuning.map(p=>p+staff.capo-staff.transpositionPitch),source:'guitar-pro'};
    if(tracks.length>=64)throw Error('More than 64 instrument staves.');
    const latest=new Map();let authored=0;
    for(const item of timeline){
      const bar=staff.bars[item.masterBar.index];if(!bar)continue;
      let local=[];for(const voice of bar.voices)for(const beat of voice.beats)for(const n of beat.notes)local.push({beat,n});
      local.sort((a,b)=>a.beat.playbackStart-b.beat.playbackStart);
      for(const {beat,n} of local){
        const start=(item.start+beat.playbackStart)/960,dur=Math.max(1/960,beat.playbackDuration/960*num(n.durationPercent,1));
        const fx=gpExpression(n),pitch=n.realValue;
        const note={beat:Math.max(0,start),dur,midi:Math.max(0,Math.min(127,pitch)),velocity:Math.min(127,35+num(n.dynamics,5)*13),...fx,section:markers.findLast(m=>m.beat<=start)?.name||`PART ${Math.floor(start/32)+1}`};
        // alphaTab strings count from the bass side; Ruvi strings count from treble.
        if(!staff.isPercussion&&staff.tuning.length===6&&n.string>=1&&n.string<=6&&n.fret>=0&&n.fret<=24){note.string=7-n.string;note.fret=n.fret;authored++;}
        const prior=n.isTieDestination&&n.tieOrigin?latest.get(n.tieOrigin.id):null;
        if(prior&&Math.abs(prior.beat+prior.dur-note.beat)<.02){
          const oldDur=prior.dur,newDur=note.beat+note.dur-prior.beat;
          const first=prior.pitchCurve||[{pos:0,semitones:0},{pos:1,semitones:0}];
          prior.pitchCurve=first.map(p=>({pos:p.pos*oldDur/newDur,semitones:p.semitones}));
          const tail=note.pitchCurve||[{pos:0,semitones:0},{pos:1,semitones:0}];
          prior.pitchCurve.push(...tail.map(p=>({pos:(oldDur+p.pos*note.dur)/newDur,semitones:p.semitones})));
          prior.effects=[...new Set([...prior.effects,...note.effects])];prior.tech=prior.effects[0]||'pick';prior.dur=newDur;latest.set(n.id,prior);continue;
        }
        t.notes.push(note);latest.set(n.id,note);if(++count>40000)throw Error('Expanded arrangement exceeds 40,000 notes.');
      }
    }
    t.notes.sort((a,b)=>a.beat-b.beat||a.string-b.string||a.midi-b.midi);
    if(t.notes.length)tracks.push(t);
  }
  if(!tracks.some(t=>!t.isDrum))throw Error('No melodic instrument part found.');
  if(!tempoMap.length)tempoMap.push({beat:0,bpm:score.tempo||120});
  return {title:score.title||sourceName,artist:score.artist||'Guitar Pro arrangement',tracks,tempoMap,timeSignatures,markers,ppq:960,totalBeats:Math.ceil(timeline.at(-1).end/960),scoreBeats:timeline.at(-1).end/960,sourceName,source:'guitar-pro',warnings:['Written repeats and alternate endings are expanded into the playback chart. Original notation is preserved for six-string parts; other instruments are mapped for guitar.']};
}
