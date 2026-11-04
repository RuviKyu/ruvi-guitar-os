// Ruvi sampled-instrument renderer. Sound library: FluidR3Mono GM, MIT.
// Numeric SoundFont zones are extracted at build time; the browser decodes only
// the Ogg samples needed by the current arrangement, using native Web Audio.
export const MAX_DECODED_BYTES=192*1048576;
export function selectPreset(map,program,drum=false){return map.presets.find(p=>p.bank===(drum?128:0)&&p.program===program)||map.presets.find(p=>p.bank===(drum?128:0)&&p.program===0);}
export function selectZones(preset,key,velocity){
  const candidates=preset?.zones.filter(z=>velocity>=z.loVel&&velocity<=z.hiVel)||[],exact=candidates.filter(z=>key>=z.loKey&&key<=z.hiKey);
  if(exact.length||preset?.bank===128)return exact;
  // Extreme MIDI pitches can lie outside an acoustic instrument's sampled
  // range. Transpose its nearest real zone, retaining the requested pitch.
  const distance=z=>Math.max(z.loKey-key,key-z.hiKey,0),nearest=Math.min(...candidates.map(distance));return candidates.filter(z=>distance(z)===nearest);
}
export function pitchRatio(zone,midi){return 2**(((midi-zone.root)*(zone.keyTrack/100)+zone.transpose+zone.tune/100)/12);}
export function curveAt(curve,pos){for(let i=1;i<curve.length;i++)if(pos<=curve[i].pos){const a=curve[i-1],b=curve[i];return a.semitones+(b.semitones-a.semitones)*(pos-a.pos)/(b.pos-a.pos||1);}return curve.at(-1)?.semitones||0;}
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const centsHz=c=>8.176*2**(c/1200);
function envelopeDuration(value,keyFactor,key){return clamp(keyFactor?2**((value+keyFactor*(60-key))/1200):value,0,90);}
function shapeEnvelope(param,zone,key,start,gate,peak,releaseScale=1){
  const delay=clamp(zone.delay,0,1),attack=clamp(zone.attack,.002,3),hold=envelopeDuration(zone.hold,zone.keyHold,key),decay=envelopeDuration(zone.decay,zone.keyDecay,key),sustain=clamp(zone.sustain,0,1),release=clamp(zone.release*releaseScale,.012,5);
  const decaySeconds=Math.max(.005,decay*Math.min(1,Math.log(Math.max(.0001,sustain))/-9.226));
  const points=[[start,.00001],[start+delay,.00001],[start+delay+attack,peak],[start+delay+attack+hold,peak],[start+delay+attack+hold+decaySeconds,Math.max(.00001,peak*sustain),true]];
  const levelAt=time=>{for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],pos=clamp((time-a[0])/(b[0]-a[0]||1),0,1);if(time<=b[0])return b[2]?a[1]*(b[1]/a[1])**pos:a[1]+(b[1]-a[1])*pos;}return points.at(-1)[1];};
  param.cancelScheduledValues(start);param.setValueAtTime(.00001,start);
  for(const [time,value,exponential] of points.slice(1))if(time<gate)param[exponential?'exponentialRampToValueAtTime':'linearRampToValueAtTime'](value,time);
  const level=Math.max(.00001,levelAt(gate)),decaying=gate>=start+delay+attack+hold;param[decaying?'exponentialRampToValueAtTime':'linearRampToValueAtTime'](level,gate);param.exponentialRampToValueAtTime(.00001,gate+release);
  return {release,levelAt};
}
export function expandMap(data){
  if(data.format!=='RuviSampleMap1'||data.bytes!==14563174||data.sha256!=='cfcd66d89e8386823400eca64934b14fbea7bf48ba1f00d21189af1262794ec2')throw Error('Unexpected instrument-library manifest.');
  return {...data,presets:data.presets.map(p=>({...p,zones:p.zones.map(row=>Object.fromEntries(data.zoneFields.map((field,i)=>[field,row[i]])))}))};
}
async function verifiedBank(map,progress,provided){
  let bytes=provided;const key=map.sourceUrl;let cache;
  if(!bytes){try{cache=await caches.open('ruvi-fluidr3mono-2.312');const saved=await cache.match(key);if(saved)bytes=await saved.arrayBuffer();}catch{}}
  const verify=async bytes=>bytes.byteLength===map.bytes&&Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('')===map.sha256;
  if(bytes&&await verify(bytes))return bytes;
  if(bytes&&cache)try{await cache.delete(key);}catch{}
  if(provided)throw Error('Instrument-library checksum mismatch.');
  let lastError;
  for(const url of [map.sourceUrl,map.mirrorUrl])try{
    progress?.({phase:'download',label:'Downloading sampled instruments · 14 MB'});
    const response=await fetch(url,{signal:AbortSignal.timeout(60000),mode:'cors'});if(!response.ok)throw Error(`Sound library download failed (${response.status}).`);
    bytes=await response.arrayBuffer();if(!await verify(bytes))throw Error('Instrument-library checksum mismatch.');
    if(cache)try{await cache.put(key,new Response(bytes,{headers:{'Content-Type':'application/octet-stream'}}));}catch{}
    return bytes;
  }catch(error){lastError=error;}
  throw lastError||Error('Could not download the instrument library.');
}
export class SampledInstruments {
  constructor(context,destination){this.context=context;this.destination=destination;this.buffers=new Map();this.pending=new Map();this.voices=new Set();this.partGains=new Map();this.partBuses=new Map();this.bytesDecoded=0;this.loaded=false;this.roomAmount=.12;this.maxVoices=80;}
  partBus(id){if(!this.partBuses.has(id)){const bus=this.context.createGain();bus.gain.value=this.partGains.get(id)??1;bus.connect(this.destination);bus.connect(this.roomInput);this.partBuses.set(id,bus);}return this.partBuses.get(id);}
  setPartGains(levels){this.partGains=new Map(levels);for(const [id,bus] of this.partBuses){if(!this.partGains.has(id)&&![...this.voices].some(v=>v.partId===id)){bus.disconnect();this.partBuses.delete(id);}else bus.gain.setTargetAtTime(this.partGains.get(id)??0,this.context.currentTime,.025);}}
  async initialize(progress,{manifestUrl=new URL('../sounds/fluidr3-map.json.gz',import.meta.url),bankBytes}={}){
    if(this.loaded)return;
    if(!this.loading)this.loading=(async()=>{
      progress?.({phase:'map',label:'Opening instrument library…'});
      const r=await fetch(manifestUrl);if(!r.ok)throw Error('Instrument map could not load.');
      const raw=new Uint8Array(await r.arrayBuffer()),compressed=raw[0]===31&&raw[1]===139;
      // Some static hosts transparently decompress gzip responses.
      const json=compressed?await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'))).text():new TextDecoder().decode(raw);const map=expandMap(JSON.parse(json));
      this.data=await verifiedBank(map,progress,bankBytes);this.map=map;this.createRoom();this.loaded=true;
    })().finally(()=>{this.loading=null;});
    return this.loading;
  }
  createRoom(){
    if(this.roomInput)return;const c=this.context,convolver=c.createConvolver(),send=c.createGain(),input=c.createGain();
    const impulse=c.createBuffer(2,Math.floor(c.sampleRate*1.25),c.sampleRate);let seed=314159;
    for(let ch=0;ch<2;ch++){const data=impulse.getChannelData(ch);for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=((seed/4294967296)*2-1)*(1-i/data.length)**3*.55;}}
    convolver.buffer=impulse;send.gain.value=this.roomAmount;input.connect(convolver);convolver.connect(send);send.connect(this.destination);this.roomInput=input;this.roomSend=send;this.convolver=convolver;
  }
  setRoom(amount){this.roomAmount=clamp(Number(amount)||0,0,.35);if(this.roomSend)this.roomSend.gain.setTargetAtTime(this.roomAmount,this.context.currentTime,.03);}
  async decode(id){
    if(this.buffers.has(id))return this.buffers.get(id);
    if(this.pending.has(id))return this.pending.get(id);
    const task=(async()=>{
      const s=this.map.samples[id];if(!s)throw Error('Missing instrument sample.');
      const bytes=this.data.slice(this.map.sampleDataOffset+s[0],this.map.sampleDataOffset+s[1]);
      let audio;
      if(this.map.shortSamples?.[id]){const raw=Uint8Array.from(atob(this.map.shortSamples[id]),v=>v.charCodeAt(0)),view=new DataView(raw.buffer);audio=this.context.createBuffer(1,raw.length/2,s[2]);const pcm=audio.getChannelData(0);for(let i=0;i<pcm.length;i++)pcm[i]=view.getInt16(i*2,true)/32767;}
      else try{audio=await this.context.decodeAudioData(bytes);}catch{throw Error(`Could not decode instrument sample ${id} (${s[3]}).`);}const size=audio.length*audio.numberOfChannels*4;
      if(this.bytesDecoded+size>MAX_DECODED_BYTES)throw Error('This arrangement exceeds the sample-memory budget. Choose Basic synth or a smaller arrangement.');
      this.buffers.set(id,audio);this.bytesDecoded+=size;return audio;
    })().finally(()=>this.pending.delete(id));this.pending.set(id,task);return task;
  }
  requiredSamples(requests){const ids=new Set();for(const r of requests){const p=selectPreset(this.map,r.program,r.drum);const zones=selectZones(p,r.key,r.velocity);if(!zones.length&&!r.drum)throw Error(`No sample for ${p?.name||'instrument'} at MIDI ${r.key}.`);zones.forEach(z=>ids.add(z.sample));}return ids;}
  ready(requests){if(!this.loaded)return false;try{return [...this.requiredSamples(requests)].every(id=>this.buffers.has(id));}catch{return false;}}
  async prepare(requests,progress){
    await this.initialize(progress);const ids=[...this.requiredSamples(requests)],keep=new Set(ids);
    if(!this.voices.size)for(const [id,b] of this.buffers)if(!keep.has(id)){this.bytesDecoded-=b.length*b.numberOfChannels*4;this.buffers.delete(id);}
    let index=0,done=0,failed=false;const worker=async()=>{try{while(!failed&&index<ids.length){const id=ids[index++];await this.decode(id);if(failed)return;progress?.({phase:'decode',label:`Preparing instruments · ${++done}/${ids.length} samples`,done,total:ids.length});await new Promise(r=>setTimeout(r,0));}}catch(error){failed=true;throw error;}};
    const results=await Promise.allSettled(Array.from({length:3},worker)),error=results.find(r=>r.status==='rejected');if(error)throw error.reason;return {samples:ids.length,decodedBytes:this.bytesDecoded};
  }
  stop(partId=null){for(const v of [...this.voices])if(!partId||v.partId===partId)v.stop();}
  remap(ids){for(const v of this.voices)if(ids.has(v.partId))v.partId=ids.get(v.partId);this.partGains=new Map([...this.partGains].map(([id,v])=>[ids.get(id)||id,v]));this.partBuses=new Map([...this.partBuses].map(([id,v])=>[ids.get(id)||id,v]));}
  play({program=30,drum=false,key=60,velocity=100,duration=1,volume=1,partId='lead',string=0,effects=[],curve=[{pos:0,semitones:0},{pos:1,semitones:0}],when}){
    if(!this.loaded||volume<=0||this.partGains.get(partId)<=0)return null;
    const preset=selectPreset(this.map,program,drum),zones=selectZones(preset,Math.round(key),clamp(Math.round(velocity),1,127));if(!zones.length||zones.some(z=>!this.buffers.has(z.sample)))return null;
    const c=this.context,start=Math.max(when??c.currentTime+.005,c.currentTime),legato=effects.includes('H')||effects.includes('P');
    // A linked hammer/pull on the same string can continue the current waveform.
    const previous=!drum&&legato?[...this.voices].reverse().find(v=>v.partId===partId&&v.string===string&&string&&v.program===program&&v.gate>=start-.025&&v.layers.every(l=>!l.ended&&l.zone.loopMode!==2)):null;
    if(previous&&previous.retarget({key,duration,curve,start,volume,effects}))return previous;
    while(this.voices.size>=this.maxVoices)this.voices.values().next().value.stop();
    const groups=new Set(zones.map(z=>z.group).filter(Boolean));if(drum&&groups.size)for(const v of this.voices)if(v.partId===partId&&v.groups.some(g=>groups.has(g)))v.stop();
    const voice={partId,string,program,groups:[...groups],layers:[],gate:start+duration,stop:()=>{if(voice.stopped)return;voice.stopped=true;for(const layer of voice.layers){layer.gain.gain.cancelScheduledValues(c.currentTime);layer.gain.gain.setTargetAtTime(.00001,c.currentTime,.004);for(const node of layer.sources)try{node.stop(c.currentTime+.025);}catch{}}this.voices.delete(voice);}};
    const addLayer=(z)=>{
      const buffer=this.buffers.get(z.sample),source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain(),pan=c.createStereoPanner();source.buffer=buffer;filter.type='lowpass';pan.pan.value=clamp(z.pan*2,-1,1);
      const peak=.55*volume*(clamp(velocity,1,127)/127)**1.7*10**(-z.attenuation/20)*(effects.includes('GHOST')?.45:1)*(legato?.85:1);
      let hold=clamp(duration,.025,30);if(effects.includes('PM'))hold=Math.min(.16,hold*.5);if(effects.includes('DEAD'))hold=.055;
      if(drum)hold=Math.min(10,buffer.duration/Math.max(.1,pitchRatio(z,key)));
      const gate=start+hold;voice.gate=Math.max(voice.gate,gate);const env=shapeEnvelope(gain.gain,z,key,start,gate,peak,effects.includes('PM')||effects.includes('DEAD')?.25:1);
      const cutoff=clamp(centsHz(z.filterFc),50,c.sampleRate*.46);filter.frequency.setValueAtTime(effects.includes('PM')?Math.min(2600,cutoff):cutoff,start);filter.Q.value=clamp(10**(z.filterQ/200),.01,12);
      if(z.modFilter){const attack=clamp(z.modAttack,.005,2),decay=clamp(z.modDecay,.01,4);filter.frequency.linearRampToValueAtTime(clamp(centsHz(z.filterFc+z.modFilter),50,c.sampleRate*.46),Math.min(gate,start+attack));filter.frequency.exponentialRampToValueAtTime(clamp(centsHz(z.filterFc+z.modFilter*z.modSustain),50,c.sampleRate*.46),Math.min(gate+.01,start+attack+decay));}
      if(z.loopMode&&z.loopEnd>z.loopStart){const sr=this.map.samples[z.sample][2];source.loopStart=clamp(z.loopStart/sr,0,buffer.duration);source.loopEnd=clamp((z.loopEnd+1)/sr,0,buffer.duration);source.loop=source.loopEnd>source.loopStart+.001;}
      const schedule=(src,midi,pitchCurve,time,seconds)=>{const initial=pitchRatio(z,midi+curveAt(pitchCurve,0));src.playbackRate.setValueAtTime(initial,time);for(const p of pitchCurve.slice(1))src.playbackRate.exponentialRampToValueAtTime(pitchRatio(z,midi+p.semitones),time+clamp(p.pos,0,1)*seconds);};
      schedule(source,key,curve,start,hold);source.connect(filter);filter.connect(gain);gain.connect(pan);pan.connect(this.partBus(partId));
      const layer={zone:z,source,gain,filter,pan,sources:[source],schedule,peak,env,cleanup:[]};voice.layers.push(layer);
      // SoundFont modulation belongs to the instrument, independently of
      // authored bend/slide automation on playbackRate.
      if(z.modPitch){source.detune.setValueAtTime(0,start);source.detune.linearRampToValueAtTime(z.modPitch,Math.min(gate,start+Math.max(.005,z.modAttack)));source.detune.linearRampToValueAtTime(z.modPitch*z.modSustain,Math.min(gate+.001,start+Math.max(.005,z.modAttack)+Math.max(.005,z.modDecay)));}
      if(z.lfoPitch||z.lfoFilter||z.lfoVolume){const lfo=c.createOscillator();lfo.frequency.value=clamp(centsHz(z.lfoFreq),.1,20);const depths=[];const connect=(param,amount)=>{const depth=c.createGain();depth.gain.setValueAtTime(0,start);depth.gain.setValueAtTime(amount,start+Math.min(hold,z.lfoDelay));lfo.connect(depth);depth.connect(param);depths.push(depth);};if(z.lfoPitch)connect(source.detune,z.lfoPitch);if(z.lfoFilter)connect(filter.detune,z.lfoFilter);if(z.lfoVolume){const trem=c.createGain(),depth=(1-10**(-Math.abs(z.lfoVolume)/20))*.5;gain.disconnect();gain.connect(trem);trem.connect(pan);trem.gain.value=1-depth;connect(trem.gain,depth);layer.cleanup.push(trem);}lfo.start(start);lfo.stop(gate+env.release+.02);layer.sources.push(lfo);lfo.onended=()=>{lfo.disconnect();depths.forEach(d=>d.disconnect());};}
      if(effects.includes('vib')||z.vibPitch){const lfo=c.createOscillator(),depth=c.createGain();lfo.frequency.value=effects.includes('vib')?5.5:clamp(centsHz(z.vibFreq),1,10);depth.gain.setValueAtTime(0,start);depth.gain.linearRampToValueAtTime(effects.includes('vib')?22:z.vibPitch,start+Math.min(hold*.3,Math.max(.08,z.vibDelay)));lfo.connect(depth);depth.connect(source.detune);lfo.start(start);lfo.stop(gate+env.release+.02);layer.sources.push(lfo);lfo.onended=()=>{lfo.disconnect();depth.disconnect();};}
      const cleanup=()=>{source.disconnect();filter.disconnect();gain.disconnect();pan.disconnect();layer.cleanup.forEach(n=>n.disconnect());for(const n of layer.sources)if(n!==source)try{n.stop(c.currentTime+.01);}catch{}layer.ended=true;if(voice.layers.every(l=>l.ended)){this.voices.delete(voice);voice.stopped=true;}};
      if(z.loopMode===2&&source.loop&&source.loopEnd<buffer.duration-.001){const tail=c.createBufferSource();tail.buffer=buffer;tail.playbackRate.setValueAtTime(pitchRatio(z,key+curveAt(curve,1)),gate);tail.connect(filter);tail.start(gate,source.loopEnd);tail.stop(gate+env.release+.04);layer.sources.push(tail);source.start(start);source.stop(gate);source.onended=()=>source.disconnect();tail.onended=()=>{tail.disconnect();cleanup();};}
      else {source.start(start);source.stop(gate+env.release+.04);source.onended=cleanup;}
    };
    zones.forEach(addLayer);
    voice.retarget=({key,duration,curve,start,volume,effects})=>{
      if(voice.stopped||voice.layers.some(l=>l.ended))return false;for(const l of voice.layers){const value=Math.max(.0001,l.env.levelAt(start));l.source.playbackRate.cancelScheduledValues(start);l.source.playbackRate.setValueAtTime(l.source.playbackRate.value,start);l.source.playbackRate.exponentialRampToValueAtTime(pitchRatio(l.zone,key+curveAt(curve,0)),start+.014);for(const p of curve.slice(1))l.source.playbackRate.exponentialRampToValueAtTime(pitchRatio(l.zone,key+p.semitones),start+Math.max(.015,p.pos*duration));const gate=start+duration;l.gain.gain.cancelScheduledValues(start);l.gain.gain.setValueAtTime(value,start);l.gain.gain.setValueAtTime(value,gate);l.gain.gain.exponentialRampToValueAtTime(.00001,gate+clamp(l.zone.release,.03,3));for(const n of l.sources)n.stop(gate+clamp(l.zone.release,.03,3)+.04);l.env.levelAt=()=>value;}voice.gate=start+duration;return true;
    };
    this.voices.add(voice);return voice;
  }
}
