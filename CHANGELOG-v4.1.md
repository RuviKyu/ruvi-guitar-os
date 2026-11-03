# Guitar Respec OS v4.1

## Guitar Pro

Import `.gp`, `.gpx`, `.gp3`, `.gp4` and `.gp5` from Import / Export or by dropping a file on the import box. A bundled, pinned alphaTab 1.9.0 reader parses files locally in a worker. No external parser service receives the file. Existing personal chart synchronization still applies to saved arrangements.

Track names, instruments, tempo, meter, sections, written repeats/alternate endings, ties, six-string frets, tuning and articulation are mapped into the existing part-selection workflow. The worker has a 20-second timeout; ZIP archives are inspected before decompression (32 MB per entry / 64 MB total). The existing arrangement/note limits still apply. Non-six-string instruments map into the guitar's playable range; choose a guitar octave where needed. Unsupported score features are not a claim of complete Guitar Pro rendering or playback fidelity.

The supplied Yorushika score imported as lead guitar, rhythm guitar, bass, clarinet and drums: 6,581 note events across 180 measures. The 812-note lead chart includes 19 bend notes, 37 slides, 10 hammer-ons, 16 pull-offs, plus vibrato, muted and dead notes. Author fret/string positions are used on six-string parts. User-supplied scores are not committed to this public repository.

## Techniques in the game and sound

Notes may carry combined `effects`, a `slideToFret`, `bendSemitones`, and a `pitchCurve` of `{pos, semitones}` points. Position 0–1 runs through the note's sustain; pitch is relative to its base MIDI note. The importer, JSON validator, state reload, editor, highway and full tab score retain this data.

- Slides and bends draw pitch ribbons; hammer-ons/pull-offs have legato arcs. Full tabs show combined labels and curves.
- Synth oscillators follow pitch curves; legato uses a softer attack, vibrato modulates pitch, palm mute shortens decay, and dead notes produce a muted attack. Voices stop on pause, seek and restart.
- With guitar input, moving-pitch notes are judged at onset and through sustain checkpoints. Holding only the root is insufficient for a full bend. Practice without input and manual test hits retain their existing behavior.
- The microphone measures pitch/energy. It cannot identify fingering, distinguish a picked note from a physical hammer-on, or certify technique. H/P are musical cues; full-chord polyphonic recognition remains outside the current pitch detector.
- Edit mode exposes slide target, bend amount, combined effects and custom pitch-curve points. Changing bend amount/slide target replaces an existing custom curve; entering a curve gives direct control.

## MIDI

Export emits standard pitch-wheel messages, explicit RPN pitch range (±12 semitones), per-note expressive channel allocation, reset events, legato controller hints and velocity/duration shaping. Bent notes use independent channels so an accompanying chord is not bent with them. MIDI 1.0 has 15 melodic channels; passages exceeding the available independent voices are refused with an explanation rather than sharing a bent channel.

The exporter also writes a `RUVIEXP1:` sequencer-specific metadata event for each note. Ruvi re-import uses it to retain precise techniques, combined effects, curves, frets and part grouping. Other MIDI players may ignore this metadata or legato controller hints; pitch-wheel movement remains standard MIDI. Plain MIDI pitch bends and RPN bend sensitivity are imported as pitch curves, but unlabelled MIDI cannot identify whether a wheel movement was physically a slide or a bend. A supplied pitch curve takes precedence over default bend/slide values.

Lightweight instrument voices remain synth approximations, not Guitar Pro soundfonts or recorded guitar. Not every Guitar Pro ornament, controller, bank, tremolo-bar effect, grace-note interpretation or player-specific articulation is reproduced.

## Validation

Run `npm ci` then `npm test`: 23 regression tests, including synthetic real GP ZIP export/import, repeat unfolding, archive bounds, expressive MIDI, bend isolation, raw pitch-wheel import and technique sanitization.

38 additional headless Chrome checks used the supplied ReoNa MIDI and Yorushika `.gp` file. Coverage includes local worker loading, original positions, all five GP parts, JSON/state/MIDI round trips, pitch-follow judging, technique editing, real Web Audio, stopping voices, reload persistence, original measure count, desktop and phone layouts, and the previous library/editor behavior. Screenshots were inspected; there were no uncaught browser errors. The test state including both sample arrangements was approximately 1.13 MB, below the existing cloud state cap.

The automated host canceled the final browser download-to-disk capture; generated MIDI bytes and requested download filenames were validated. Browser tests isolated cloud state requests to avoid changing personal live data. Both HTML mirrors are byte-identical and retain LF line endings. The backend is unchanged.

## Third-party reader

The alphaTab 1.9.0 reader-only derivative is in `public/vendor/alphatab-1.9.0.mjs`, with its license and notices alongside it. Its reader environment and exported APIs are limited to Guitar Pro binary import and playback timeline generation; unused rendering, UI, notation export and synth modules are omitted. The reproducible transformation is in `scripts/build-gp-reader.cjs` (`npm ci && npm run build:gp-reader`). See [vendor source and license information](public/vendor/README.md). Guitar Pro import depends on these bundled assets; copying only `index.html` to another host does not include the GP reader.
