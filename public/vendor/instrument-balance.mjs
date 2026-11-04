// Instrument-level calibration uses the actual decoded library, independently
// of note velocity and performance dynamics. The user-facing faders stay linear.
import {SampledInstruments,selectPreset,selectZones} from './sampled-instruments.mjs';
export const MAIN_LEVEL=100, BACKING_LEVEL=85, BALANCE_VERSION=1;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function focusLevel(selected){return selected?MAIN_LEVEL:BACKING_LEVEL;}
export function activePolyphony(notes,drum=false){
  if(!notes.length)return 1;
  // Percussion energy is measured over a one-second reference hit. Its MIDI
  // gate can be much shorter than the audible sample tail, so use actual onset
  // seconds and that same energy window when balancing a complete drum kit.
  const edges=[];for(const n of notes){const start=drum?(n.seconds??n.beat):n.beat,duration=drum?1:n.dur;if(Number.isFinite(start)&&Number.isFinite(duration)&&duration>0)edges.push([start,1],[start+duration,-1]);}
  edges.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);let active=0,last=edges[0]?.[0]||0,area=0,audible=0;
  for(const [at,delta] of edges){const dt=at-last;if(active>0){audible+=dt;area+=dt*active;}active+=delta;last=at;}
  return clamp(audible?area/audible:1,1,12);
}
export function createBalancePlan(parts){
  const programs=new Map();
  for(const part of parts){const id=`${part.program}|${!!part.drum}`;if(!programs.has(id))programs.set(id,{id,program:part.program,drum:!!part.drum,keys:[]});const group=programs.get(id);for(const n of part.notes)if(Number.isFinite(n.key))group.keys.push(Math.round(n.key));}
  const calibrations=[...programs.values()].map(p=>{const keys=p.keys.sort((a,b)=>a-b),counts=new Map();for(const key of keys)counts.set(key,(counts.get(key)||0)+1);const chosen=p.drum?[...counts].sort((a,b)=>b[1]-a[1]||a[0]-b[0]).slice(0,5).map(([key])=>key):[...new Set([.2,.5,.8].map(q=>keys[Math.min(keys.length-1,Math.floor(keys.length*q))]).filter(Number.isFinite))];return {...p,keys:chosen,cacheKey:`${p.id}|${chosen.join(',')}`};});
  return {calibrations,parts:parts.map(p=>({id:p.id,programKey:`${p.program}|${!!p.drum}`,polyphony:activePolyphony(p.notes,p.drum)})),requests:calibrations.flatMap(p=>p.keys.map(key=>({program:p.program,drum:p.drum,key,velocity:100})))};
}
function estimatedLevel(engine,profile,key){
  const zones=selectZones(selectPreset(engine.map,profile.program,profile.drum),key,100);let power=0,peak=0;
  for(const z of zones){const b=engine.buffers.get(z.sample);if(!b)continue;const pcm=b.getChannelData(0),scale=.55*(100/127)**1.7*10**(-z.attenuation/20);let energy=0,max=0;for(let i=0;i<pcm.length;i+=8){energy+=pcm[i]**2;max=Math.max(max,Math.abs(pcm[i]));}power+=energy/Math.max(1,Math.ceil(pcm.length/8))*scale**2;peak+=max*scale;}
  return {rms:Math.sqrt(power),peak};
}
async function measureNote(engine,profile,key){
  const Offline=globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext;if(!Offline)return estimatedLevel(engine,profile,key);
  const sampleRate=32000,ctx=new Offline(2,Math.ceil(sampleRate*1.05),sampleRate),probe=new SampledInstruments(ctx,ctx.destination);
  probe.map=engine.map;probe.data=engine.data;probe.buffers=engine.buffers;probe.loaded=true;probe.roomInput=ctx.createGain();
  probe.play({program:profile.program,drum:profile.drum,key,velocity:100,duration:.95,when:0,volume:1,partId:'reference'});
  const buffer=await ctx.startRendering();let power=0,peak=0,count=0;
  for(let ch=0;ch<2;ch++){const pcm=buffer.getChannelData(ch);for(let i=0;i<Math.floor(sampleRate*.95);i++){peak=Math.max(peak,Math.abs(pcm[i]));if(i>=sampleRate*.02){power+=pcm[i]**2;count++;}}}
  return {rms:Math.sqrt(power/Math.max(1,count)),peak};
}
export async function calibratePrograms(engine,plan,progress){
  engine.balanceMeasurements??=new Map();const levels=new Map();let done=0;
  for(const profile of plan.calibrations){let result=engine.balanceMeasurements.get(profile.cacheKey);
    if(!result){const measures=[];for(const key of profile.keys)measures.push(await measureNote(engine,profile,key));const rms=Math.sqrt(measures.reduce((sum,m)=>sum+m.rms**2,0)/Math.max(1,measures.length)),peak=Math.max(.0001,...measures.map(m=>m.peak));const gain=rms>.00001?clamp(Math.min(.035/rms,.7/peak),.15,6):1;result={gain,rms,peak,referenceKeys:profile.keys};engine.balanceMeasurements.set(profile.cacheKey,result);if(engine.balanceMeasurements.size>128)engine.balanceMeasurements.delete(engine.balanceMeasurements.keys().next().value);}
    levels.set(profile.id,result);progress?.({phase:'balance',label:`Balancing instruments · ${++done}/${plan.calibrations.length}`});
  }
  return new Map(plan.parts.map(p=>[p.id,{...levels.get(p.programKey),polyphony:p.polyphony,gain:(levels.get(p.programKey)?.gain||1)/Math.sqrt(p.polyphony)}]));
}
