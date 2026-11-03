import {loadGuitarProBytes} from './guitarpro-import.mjs';
self.onmessage=e=>{try{self.postMessage({score:loadGuitarProBytes(new Uint8Array(e.data.bytes),e.data.name)});}catch(error){self.postMessage({error:error.message||'Could not read Guitar Pro score.'});}};
