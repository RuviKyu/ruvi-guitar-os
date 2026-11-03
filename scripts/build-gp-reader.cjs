const fs=require('node:fs');
const path=require('node:path');
const esbuild=require('esbuild');
let source=fs.readFileSync(path.resolve(__dirname,'../node_modules/@coderline/alphatab/dist/alphaTab.core.mjs'),'utf8');
// Exclude application rendering, browser UI and synthesizer modules entirely.
// None are used by binary import, the score model or timeline generation.
const modulePattern=/^\/\/ (src\/[^\n]+)\n/gm;
const boundaries=[...source.matchAll(modulePattern)];
source=source.slice(0,boundaries[0].index)+boundaries.map((m,i)=>{
 const name=m[1],section=source.slice(m.index,boundaries[i+1]?.index??source.length);
 if(name.startsWith('src/rendering/')||(name.startsWith('src/synth/')&&!name.startsWith('src/synth/SynthConstants.ts')&&!name.startsWith('src/synth/PlaybackRange.ts'))||name.startsWith('src/platform/javascript/')||name.startsWith('src/AlphaTabApi')||name.startsWith('src/exporter/')||name.startsWith('src/importer/alphaTex/')||name.startsWith('src/importer/MusicXml')||name.startsWith('src/importer/Capella')||name.startsWith('src/importer/AlphaTex'))return '';
 return section;
}).join('');
// The app uses its own score drawing and Web Audio. Replace the browser/render
// environment with the reader-only environment before normal tree shaking.
const environmentStart=source.indexOf('class Environment {');
const environmentEnd=source.indexOf('// src/CoreSettings.ts',environmentStart);
if(environmentStart<0||environmentEnd<0)throw Error('Unexpected Environment boundary');
source=source.slice(0,environmentStart)+`class Environment {
 static highDpiFactor=1;static webPlatform=typeof window==='undefined'?1:0;
 static get globalThis(){return globalThis;}static get isRunningInWorker(){return typeof WorkerGlobalScope!=='undefined'&&globalThis instanceof WorkerGlobalScope;}
 static scriptFile='';static fontDirectory='';static isWebPackBundled=false;static isViteBundled=false;static isTurbopackBundled=false;
 static buildImporters(){return [new Gp3To5Importer(),new GpxImporter(),new Gp7To8Importer()];}
 static prepareForPostMessage(value){return value;}static quoteJsonString(text){return JSON.stringify(text);}static sortDescending(array){array.sort((a,b)=>b-a);}
}\n`+source.slice(environmentEnd);
// Keep only binary Guitar Pro loading; URL loading, alphaTex and score export
// are not part of the browser reader. Tests use the upstream package to author fixtures.
const loaderStart=source.indexOf('class ScoreLoader {');
const loaderMethod=source.indexOf('\tstatic loadScoreFromBytes(data, settings) {',loaderStart);
const loaderEnd=source.indexOf('\n// src/',loaderMethod)+1;
if(loaderStart<0||loaderMethod<0||loaderEnd<0)throw Error('Unexpected ScoreLoader boundary');
source=source.slice(0,loaderStart)+'class ScoreLoader {\n'+source.slice(loaderMethod,loaderEnd)+source.slice(loaderEnd);
const end=source.lastIndexOf('\nexport {');
if(end<0)throw Error('Unexpected alphaTab module format');
source=source.slice(0,end)+`\nconst ruviImporter={ScoreLoader};const ruviMidi={MidiFileGenerator};export {Settings,ruviImporter as importer,ruviMidi as midi};\n`;
const result=esbuild.buildSync({stdin:{contents:source,resolveDir:process.cwd(),sourcefile:'alphatab-1.9.0-core.mjs',loader:'js'},bundle:true,write:false,format:'esm',target:'es2022',minify:true,treeShaking:true,legalComments:'inline',banner:{js:'// Reader-only alphaTab 1.9.0 derivative. Modified 2026-11-03; see README.md for source and rebuild instructions.'}});
fs.writeFileSync(path.resolve(__dirname,'../public/vendor/alphatab-1.9.0.mjs'),result.outputFiles[0].contents);
console.log('Lean reader bytes:',result.outputFiles[0].contents.length);
