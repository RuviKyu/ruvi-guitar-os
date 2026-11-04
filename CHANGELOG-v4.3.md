# Guitar Respec OS v4.3

MIDI Band playback now uses sampled General MIDI instruments by default. Imported MIDI and Guitar Pro arrangements use their actual instrument programs; the built-in band uses sampled distortion guitar, fingered bass and acoustic drums. The obsidian/neon design and connected, highlighted tabs are retained.

## Instrument sound

- FluidR3Mono GM 2.312 provides all 128 GM programs, 35 percussion kits and 1,037 source samples. It is released under MIT; the full notices, contributor acknowledgements, pinned source and checksum are included under `public/sounds/`.
- Samples retain the bank's key and velocity zones, original root tuning, fine tuning, layered voices, pan, envelopes, filters, modulation and sustain loops. Nearest instrument zones cover pitches beyond an acoustic instrument's recorded range while keeping the requested MIDI pitch. Drum mappings remain exact.
- Bends, slides and whammy curves continuously change sampled pitch. Vibrato remains independent. Hammer-ons and pull-offs on the same string can reuse the active waveform without another picked attack. Palm mutes/dead notes use shorter envelopes; ghost notes reduce level. Percussion uses natural one-shot tails and exclusive groups, including closed hats choking open hats.
- Optional room ambience is adjustable from 0–35%; 0 is fully dry. The effect is generated locally and needs no extra sound download.
- Very short Vorbis source waveforms that Chromium rejects are preserved as original PCM data in the compressed map. The extraction build preserves signed loop offsets, avoiding wrapped loop boundaries on several synth-wave samples. The runtime uses native Web Audio rather than an always-running JavaScript sample mixer.

## Loading and controls

Choose **Sampled instruments** or **Basic synth** in the left Mixer or Import / Export panel. A preparation button and progress messages show the current state. Play automatically prepares the arrangement before starting, so a song does not switch sounds mid-performance. Clicking Play again cancels the pending start; closing the score, changing sound quality, changing audio mode or resetting the stage also cancels it. A failed load stays stopped and offers Retry or Basic synth.

The first sampled playback downloads approximately 14 MB from the pinned upstream source, with a second CDN available if needed. Size and SHA-256 are verified before use. The bank is cached on the device where storage is available; decoded audio is limited to the samples needed by the arrangement, including muted instruments so they can be unmuted immediately. There is no bank download on initial app load or for YouTube playback. Preparation uses three concurrent decoders, bounded decoded buffers (192 MiB), inactive-buffer eviction and an 80-note voice limit. Cache storage failures do not prevent playback.

Imported mute/solo and volume-zero controls stop active sampled voices. Built-in drum/bass/chord mute and volume-zero controls also stop their corresponding samples. Pause, restart, seek and stage resets stop registered sampled voices. Equivalent cloud changes remap active part identifiers alongside backing events. Audio mode switches park playback before changing sources.

## Verification

- 34 automated regression tests pass, including the existing MIDI/Guitar Pro/editor/tab checks and new library selection, pitch, drum choke, short-waveform, sample-reference, preparation and memory-limit checks.
- 54 existing browser checks pass in Chrome at desktop and phone sizes, with cloud requests isolated from personal live state.
- 13 additional audio/browser checks cover on-demand loading, cancellation, all 128 programs, decoding all 1,037 samples, built-in accompaniment/muting, both supplied arrangements, sampled pitch curves, hammer-on waveform reuse, hi-hat choke, offline waveform rendering, caching, saved preferences, checksum rejection, failed loading/retry and responsive sound controls. No uncaught browser errors occur.
- The ReoNa arrangement prepares 7 guitar samples (~5.0 MiB decoded). The Yorushika Guitar Pro arrangement prepares 38 samples (~20.6 MiB decoded) for guitars, bass, clarinet and drums.
- The release HTML mirrors are byte-identical with LF endings. The bank map can be reproduced with `npm run build:sample-map` using the pinned development dependencies and source bank.

This is a General MIDI sample library, with articulation modeled from samples and envelopes; it does not reproduce every nuance of a live player or a multi-gigabyte commercial instrument. MIDI exports preserve programs and expression data, but standard MIDI does not embed these sounds. External MIDI players use their own library. As previously documented, the host cancels automated download-to-disk capture; export bytes and initiation remain verified by the existing browser suite.
