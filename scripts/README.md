# Local preview

Run `python3 scripts/preview.py` from the checkout, then open `http://127.0.0.1:8009/`. Stop with Ctrl-C. Binary model loading needs HTTP; opening index.html directly as a file is no longer supported. This serves only on your computer and does not publish anything.

# Model asset packaging

The Base64 JavaScript model bundles are preserved in `work/source-bundles/` for baseline captures and source provenance. Runtime packages live beside their former paths as `models/**/*.glb` and deterministic gzip level-6 `models/**/*.glb.gz` files.

Regenerate the binary assets and manifest:

```sh
node scripts/extract-glbs.mjs --source work/source-bundles
```

Verify all committed GLB and gzip hashes without JavaScript source bundles:

```sh
node scripts/extract-glbs.mjs --verify
```

Also compare every GLB against its decoded source payload:

```sh
node scripts/extract-glbs.mjs --verify --source work/source-bundles
```

`--report` is a read-only GLB structure inspection. Packaging never optimizes or otherwise changes GLB content: gzip decompression and raw GLB bytes must exactly match the source payload.

# Archive photo packaging

The gallery reads ordinary local image files from `assets/media/runtime/`, avoiding
the old blocking Base64 JavaScript bundle. Regenerate these exact decoded bytes
after changing the legacy source bundle:

```sh
node scripts/extract-archive-photos.mjs
```

The extraction is lossless: it keeps the embedded image bytes unchanged and
chooses each output extension from the data URL MIME type.
