# jazzsamba-demo

Public project page for **JazzSAMBA**: Home, Explore (mix-only lane viewer), About, and The Band.

Hosted as GitHub Pages. Prefer repo name `jazzsamba-demo` so the `jazzsamba` name stays free for the Python package.

## Local preview

```bash
# from jazz-standard-dataset
uv run python -m preprocessing.scripts.export_project_page_assets
cd jazzsamba-demo && python -m http.server 8080
# open http://127.0.0.1:8080
```

Audio encode: better takes only, stereo, 24 kHz, 192 kbps MP3 (~709 MB). Use `--skip-audio` for catalog/JSON only.

## Featured samples

Edit `data/catalog.json` → `featured.async` / `featured.sync` (two `song_id`s each). Re-running the export preserves manually set IDs if you patch after export, or edit the export script’s catalog builder later.

## Submodule

This directory is its own git repository, intended as a submodule of `jazz-standard-dataset`. Clone the parent **without** `--recurse-submodules` unless you want the ~700 MB of demo audio.

## Deferred

- Featured song IDs, About story copy, band headshots/bios
- Zenodo DOI / paper PDF / final BibTeX
- Enable GitHub Pages on the remote (`Settings → Pages → Deploy from branch main / root`)
