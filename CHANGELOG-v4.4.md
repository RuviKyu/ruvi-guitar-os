# Guitar Respec OS v4.4

The instrument mix now starts with the selected PLAY PART at **100%** and every accompaniment part at **85%**. Changing the selected instrument moves that focus automatically. The built-in band follows the same levels: lead 100%, rhythm, bass and drums 85%.

## Balanced instrument output

Sampled instruments have different natural output levels. During sound preparation, the app renders a small set of reference notes from each program's actual register and measures their stereo RMS and peak levels. Reference velocity is fixed at 100; performance velocities, expression, envelopes and timbres are preserved. Calibration boosts quieter instruments and reduces louder ones, with bounded gain and transient peak protection. Measurements are reused within the audio session, and no additional sound library is downloaded.

Each part has a shared gain bus. Sustained-note overlap compensates for chord density, so a three-note rhythm part does not automatically overpower a single-note line. Drum balance uses hit onsets in real seconds and a one-second energy window, accounting for overlapping sample tails rather than short MIDI gate lengths. Arrangements with more than eight audible parts receive proportional headroom while keeping the same focus ratio.

The 100% / 85% faders apply after this calibration. Gain changes use short, smooth ramps and affect already sounding notes. The selected line's fader is applied once; it is no longer multiplied into both its source envelope and its instrument bus. Mute, solo, zero levels, pause/seek/reset voice stopping and equivalent cloud part-id remapping continue to work.

## Mixer controls

- The MIDI/Guitar Pro mixer shows each part's percentage and marks the selected line as MAIN.
- **Balance mix · 100% / 85%** restores the preset while preserving mute, solo, playhead and score.
- Fine-tuned faders persist through local/cloud state and Ruvi JSON reloads. Selecting another PLAY PART or pressing Balance mix reapplies the focus preset.
- Existing arrangements receive the new preset when first activated; a version marker prevents later reloads from overwriting manual adjustments.
- The highway's **Mix** button and the left cabinet's **Open instrument mixer** now expand and scroll directly to the instrument controls.
- The MIDI import preview describes sampled playback and expression accurately.

The visual design, song notes, techniques, tab layout and original uploaded files are retained. Calibration is local playback behavior. Standard MIDI exports still use the external player's own instrument library; Ruvi JSON retains mixer levels.

## Verification

40 automated regression tests pass. The existing 54 browser checks and 13 sound checks pass, including MIDI/Guitar Pro imports, expressive voices, playback, state preservation and sample decoding. Eleven focused balance/browser checks cover 100% / 85% defaults and part switching, the two supplied arrangements, measured reference output, live fader ramps, mute/solo, reset behavior, persistence, an audible full arrangement and desktop/phone controls.

At equal reference dynamics, sampled guitar measured 0.0350 RMS; bass and clarinet at 85% measured 0.02975 RMS. Drum transients use a separate peak bound. In a dense five-part Guitar Pro passage, isolated stems measured approximately 0.0354–0.0395 RMS; the complete mix peaked at 0.3954 before any user boost beyond the tested default. These are waveform checks in Chrome, not a guarantee of equal perceived loudness for every note, arrangement or listening system. Musical dynamics and intentional mute/solo remain in effect.

Both release HTML mirrors are byte-identical. Browser tests isolate personal cloud state. The sample bank, its licence and its checksum remain unchanged.
