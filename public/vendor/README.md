# Guitar Pro reader dependency

`alphatab-1.9.0.mjs` is a reader-only derivative of `@coderline/alphatab` version 1.9.0, licensed under MPL-2.0. Modified on 2026-11-03: the reader environment and public exports are limited to Guitar Pro binary import and playback timeline generation. Unused score rendering, browser UI, notation export, non-Guitar-Pro importers and audio synthesis modules are omitted. Ruvi draws and synthesizes its own notes. License text and additional notices are included as `alphatab-LICENSE.txt` and `alphatab-LICENSE.header.txt`.

- [Upstream project and source](https://github.com/CoderLine/alphaTab)
- [Pinned source release](https://github.com/CoderLine/alphaTab/tree/v1.9.0)
- [Exact npm package](https://registry.npmjs.org/@coderline/alphatab/-/alphatab-1.9.0.tgz)
- [API documentation](https://docs.alphatab.net/docs/guides/lowlevel-apis)

`guitarpro-import.mjs` and `guitarpro-worker.mjs` are Ruvi's adapter and worker. The dependency is loaded only for Guitar Pro imports; no soundfont or rendering font is required. Serve this directory beside `index.html` as `/vendor/`. Cloudflare serves these files from `public/vendor/`.

Rebuild the distributed module with `npm ci && npm run build:gp-reader`. The complete source transformation is in `scripts/build-gp-reader.cjs`; it uses the exact pinned upstream source package and esbuild version recorded in `package-lock.json`. The source retains MPL-2.0 notices. The build is not an upstream alphaTab release, and does not expose the full alphaTab API. Regression fixtures are authored with the upstream development package and parsed using this reader-only build.
