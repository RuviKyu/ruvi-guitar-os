# Guitar Respec OS v4.0

## Import and export

- Open `.mid` / `.midi` in Import / Export, from the File button, or by dropping onto the import box.
- Preview the instrument parts, choose the guitar's playable part and octave, then import. Other MIDI parts become the backing arrangement.
- Use **PLAY PART** above the highway to change the line you practise. **Mix** opens per-instrument mute, solo, level and guitar-octave controls.
- For exports that split guitar strings across channels, enable **Combine matching instruments** before import. This groups matching instruments within the same source track; leave it off for individual channel selection.
- Export the current chart as complete JSON, a format-1 MIDI arrangement, or a full-song text tab. JSON backups retain all parts, mixer choices and edited charts. MIDI exports replace edited parts with their guitar-chart pitches and retain the other instrument notes.

## Edit mode

- **EDIT** opens the full score with a note inspector. Select a fret to change beat, duration, string, fret, technique, octave fret or section.
- Add/delete notes, rename sections across a beat range, and undo/redo draft changes.
- Save explicitly (or Ctrl+S); closing a changed draft offers Save, Discard or Keep editing. Starter charts save as a custom copy.
- Edited MIDI parts remember their chart when switching away and back. A concurrent chart change from another device blocks an overwrite and offers draft export.

## Full tabs

- **Tabs**, **FULL TABS**, and the right-hand tab bookmark open the complete score generated from actual chart notes.
- Six-string measures include frets, techniques, rhythmic stems, duration tails, sustained-note continuations, rests, bar numbers, meter and tempo labels.
- All measures are reachable, in pages of 48 bars. Jump to any bar, click to seek, and follow the playback cursor. Playback in this view auditions the score without game penalties.
- Scroll stays inside the score on desktop and phone. The page viewport remains locked.

## Format and limits

The existing RuviSong v4 JSON remains supported. Optional `midi` holds `sourceName`, `ppq`, `tempoMap`, `timeSignatures`, `markers`, `selectedTrackId` and `tracks`. Each track has an id, name, zero-based MIDI channel/program, drum flag, note events (`beat`, `dur`, `midi`, `velocity`), mute/solo/volume, guitar transpose and optional saved `chartNotes`. Top-level `notes` is the currently selected playable chart. The importer and state sanitizer validate this extension.

SMF formats 0 and 1 with PPQ timing are supported, including running status, velocity-zero note-off, sustain pedal, program changes, tempo maps, time signatures and markers. Format 2 and SMPTE timing produce explicit messages. MIDI files stay in the browser; a stored arrangement syncs through the existing personal state service.

Limits: 8 MB input, 64 instrument parts, 40,000 arrangement notes, 12,000 playable chart notes and 32,768 onset beats. Oversized arrangements are refused rather than silently truncated. The existing cloud state size limit still applies.

Fingerings are generated for standard six-string guitar; unplayable pitches or chord voices are counted in the preview. Preview sounds use synthesized instrument families and a drum kit, not sampled General MIDI soundfonts. Pitch bends, expression controllers, bank selections and original fingering information are not reproduced. Export preserves note timing, tempo, meter and instrument programs, rather than the original MIDI bytes or every controller. The full score shows the chart's actual scope; importing a short riff does not invent the rest of a song.

## Verification

Run `node --test tests/midi.test.cjs` for 12 dependency-free regression tests: script syntax, identical HTML mirrors, unique static ids, formats 0/1, multiple instruments/drums, running status, sustain, tempo/meter changes, guitar mapping, schema round-trip, edited MIDI export, mixer state and malformed-file rejection.

29 additional headless Chrome checks covered file selection and import, the user's ReoNa MIDI (1,405 notes across six distortion-guitar channels, approximately 194 BPM, two 3/4 measures), playable-part switching, UI handlers, editing, undo/redo, deletion/addition, sections, unsaved/conflicting changes, starter copies, backup reload, real Web Audio playback, score paging, MIDI export bytes/download initiation and viewport locking at 1440×900 and 390×844. Screenshots of import, score and editor layouts were inspected. No uncaught browser errors occurred.

The automated host canceled Chrome's final download-to-disk capture; the generated Blob was read and parsed successfully, and the requested `.mid` filename was verified. Cloud state requests were isolated during browser tests so tests did not write personal live data. `worker.js` is unchanged.
