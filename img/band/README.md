# Band headshots for the project page.

Name files by `musician_id` from JazzSAMBA `musicians.csv` / `js/site.js`:

- `0.jpg` Jace Hosto
- `1.jpg` Jett Takazawa
- `2.jpg` Jacob Nguyen
- `3.jpg` Phillip Long
- `4.jpg` Gage Hosto
- `5.jpg` Fares Nofal
- `6.jpg` Jungyeon Bac
- `7.jpg` Sebastian Stade

Any aspect ratio is fine. Then center-crop in place (overwrites):

```bash
# from processing repo root
uv run python jazzsamba-demo/scripts/crop_band_photos.py
```
