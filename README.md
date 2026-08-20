# jazzsamba-demo

Project page for **JazzSAMBA**: paper overview, mix-only dataset explorer, recording story, and the band.

Live site: [pnlong.github.io/jazzsamba-demo](https://pnlong.github.io/jazzsamba-demo/)

## Related repos

| | |
|--|--|
| **Dataset download** | Zenodo (DOI forthcoming) — full FLAC stems, worse takes, MIDI, annotations |
| **Python API** | [`pnlong/jazzsamba`](https://github.com/pnlong/jazzsamba) |
| **Processing pipeline** | [`pnlong/jazz-standard-dataset`](https://github.com/pnlong/jazz-standard-dataset) — builds the release and exports these web assets |

This site plays **better-take stereo mixes** only (24 kHz / 192 kbps MP3). Stems and worse takes are in the Zenodo download, not here.

## Local preview

Assets are generated from an assembled `JAZZSAMBA_DIR` in the processing repo:

```bash
# in jazz-standard-dataset
uv run python -m preprocessing.scripts.export_project_page_assets
cd jazzsamba-demo && python -m http.server 8080
# open http://127.0.0.1:8080
```

Use `--skip-audio` to refresh catalog / annotations / peaks without re-encoding MP3s.

## Featured samples

Edit `data/catalog.json` → `featured.async` and `featured.sync` (two `song_id`s each). Re-running the export keeps manually set IDs.

## Submodule

Also checked out under `jazz-standard-dataset/jazzsamba-demo`. Clone the processing repo **without** `--recurse-submodules` unless you want ~760 MB of demo audio.
