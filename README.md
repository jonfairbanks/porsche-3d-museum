# Porsche 3D Museum

A cinematic, first-person Porsche museum built with Three.js: thirteen chronological exhibits, local 3D vehicles, archival wall photography, and guided exploration.

## Run locally

Open `index.html` in Chrome. Keep `assets/`, `models/`, and `vendor/` beside it. There is no build or package installation step. The opening screen prepares the collection before entry; Google Fonts is optional and falls back to installed fonts.

- Move: **W A S D** or arrow keys.
- Look: click the gallery for mouse look; **Escape** releases it. Touch dragging is supported.
- Explore a nearby exhibit: **E**. Press **E** or **Escape** to close its details.
- Use **Guided timeline** or the chapter rail to explore the collection.

## GitHub Pages

The site is arranged for static hosting from the root of `main`, with relative asset paths and `.nojekyll`. Pages publishing is not enabled yet.

When ready, configure GitHub Pages to publish `main` / `/ (root)`, or add a GitHub Actions Pages workflow. The expected project URL is `https://jonfairbanks.github.io/porsche-3d-museum/` once publishing is enabled and verified.

GitHub Pages from a private personal repository requires GitHub Pro (or an eligible higher plan). A private source repository does not by itself make the published site private. See [GitHub Pages documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

## Assets and attribution

Vehicle attributions and their stated licences appear in the exhibit details. Photograph provenance is recorded in [the media manifest](assets/media/MANIFEST.md). Third-party assets retain their respective rights; this repository does not grant a blanket licence for them. Some supplied photographs and auxiliary models have unconfirmed redistribution rights in that manifest, which need resolving before public publication.

This is an independent museum study, not an official Porsche website.

## Rendering notes

The collection uses serial model preparation, capped texture sizes, a bounded light pool, and static transforms to keep walking responsive. Vehicle fitting preserves authored proportions using precise mesh bounds and a shared presentation scale; it is not a factory dimensional survey. The floor treatment is preserved from the original experience.

The packaged models total about 254 MiB, so the initial collection download is substantial. Local Chrome captures and working review files are excluded from Git; the maintained site consists of the HTML and its sibling asset directories.
