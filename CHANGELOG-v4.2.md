# Guitar Respec OS v4.2

## Connected music tabs

The full tab view now lays out measures on connected six-string systems, rather than separate cards for every bar. Each row shares one set of continuous string lines. The active measure is tinted magenta, its bar number is accented, and the playhead moves within it. Existing frets, chords, techniques, pitch ribbons, rests, meter changes and sustained-note continuations remain available.

Rows adapt to the viewport and note density, with up to four measures per row. Zoom ranges from 70% to 150%. Very dense measures scroll within their system, without adding a page scrollbar. The score remains bounded at 48 measures per page; Follow advances pages automatically during playback. Every bar can be reached with the jump control.

## Practice and editing QoL

- Select an instrument part or change playback speed from inside the score. The stage and score speed controls stay consistent.
- Loop the current bar directly from the score. Seeking to another bar moves the bar loop with the selection.
- Follow advances by systems instead of repeatedly moving the page at every bar. Wheel/touch browsing releases Follow; Back to playhead restores it. Explicit page browsing also releases Follow while music continues.
- Click a bar number or fret to seek. Left/Right moves a bar, Home/End jumps to the first/last bar, and Space plays/pauses when focus is on the score. Opening the dialog focuses the score itself, so Space no longer activates Close.
- Keyboard focus stays inside the dialog and returns to the originating control on close. Frets use a limited Tab stop sequence; in Edit mode, Left/Right moves between notes. Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y provide undo/redo.
- Undo/redo retains the selected note. Selecting a different note returns the inspector to its top. Rendering retains scroll position, and zoom keeps the selected editing measure or visible score region in view.
- Imported durations near common grid values are displayed clearly, while untouched imported timing is retained on save. Triplets remain supported. Valid imported values no longer appear invalid because of restrictive number-input steps.
- The browser warns before leaving a changed draft. This supplements the existing in-app Save/Discard guard; drafts are not automatically persisted across reloads.
- Phone controls have larger touch targets. Part, speed and zoom controls stay within the viewport. Reduced-motion preferences are respected.

The obsidian palette, cyan/magenta/amber accents, monospaced labels, DAW shell, cabinets and highway design are retained.

## Robustness and efficiency

- Mixer/UI refreshes preserve beat position, judged notes, synth flags, combo and score when chart data is unchanged. Equivalent cloud snapshots also retain the prepared stage. Instrument-id normalization remaps backing events and active voice identifiers so accompaniment remains connected.
- A genuine chart change parks and refreshes the stage, avoiding an old clock or score against new notes. The existing editor conflict guard protects an open draft.
- Zero on a band-volume slider now means zero. Muting an instrument stops its active expressive voices; solo applies immediately. Voice stopping is scoped to the relevant part where possible.
- Backing events are sorted once and consumed with a cursor rather than scanning every event on every animation frame. Seek and loop reset that cursor.
- Score measure lookup uses binary search and cached DOM references. Follow scrolls when entering a new system. Score resize work is debounced and pages remain bounded.
- Rejected cloud saves set an honest offline status and show a one-time message while keeping the local copy. No backend or conflict-resolution contract changes were made.

## Verification

`npm test` passes 28 regression tests, including connected-system packing, measure boundaries, dense narrow layouts, mixer-independent playback fingerprints and timing display. The Guitar Pro reader build is unchanged.

54 additional headless Chrome checks passed at 1440×900 and 390×844, using the ReoNa MIDI and Yorushika Guitar Pro fixtures. They cover import/export, techniques, editing, connected strings, exactly one highlighted measure, page following, manual browsing, score controls, bar loops, mixer/runtime preservation, equivalent cloud snapshots and part-id changes, actual remote chart changes, rejected cloud saves, keyboard/focus behavior, narrow layouts and zoom anchoring. Desktop and phone screenshots were inspected. No uncaught browser errors occurred.

As previously documented, automated download-to-disk capture is canceled by the host; export Blob contents and download initiation are verified. Tests isolate cloud requests and do not change personal live state. Both HTML mirrors are byte-identical and retain LF line endings.
