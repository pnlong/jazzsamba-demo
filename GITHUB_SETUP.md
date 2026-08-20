# Hooking up GitHub remotes

Local commits are ready. Push was skipped from this environment — run these on your machine.

## 1. `jazzsamba` (Python package)

```bash
cd /home/pnlong/jazz-standard-dataset/.tmp-jazzsamba-pkg
git push -u origin main
```

Remote: `git@github.com:pnlong/jazzsamba.git`

**On GitHub (package repo):**
- Leave it as a normal code repo (no Pages).
- Optional: add topics `jazz`, `dataset`, `mir`, `python`.
- Optional later: link PyPI, enable Issues.

After the first push, convert the monorepo copy to a submodule (from `jazz-standard-dataset`):

```bash
cd /home/pnlong/jazz-standard-dataset
# Remove the in-tree package (keep a backup if you want)
mv packages/jazz-samba packages/jazz-samba.bak
git submodule add -b main git@github.com:pnlong/jazzsamba.git packages/jazz-samba
# Update pyproject / uv to still install from packages/jazz-samba
rm -rf packages/jazz-samba.bak .tmp-jazzsamba-pkg
```

## 2. `jazzsamba-demo` (project page)

```bash
cd /home/pnlong/jazz-standard-dataset/jazzsamba-demo
git push -u origin main
```

Remote: `git@github.com:pnlong/jazzsamba-demo.git`  
(~760 MB with MP3s — first push can take a few minutes. Do **not** use Git LFS; Pages does not serve LFS.)

**On GitHub (demo repo) — required for the site:**
1. **Settings → Pages**
2. **Build and deployment → Source:** Deploy from a branch
3. **Branch:** `main` / `/ (root)`
4. Save — site will be at `https://pnlong.github.io/jazzsamba-demo/`

Optional:
- Custom domain later under Pages → Custom domain
- Soft size warning: repo is under ~1 GB guideline; avoid adding worse takes / stems

After the first push, register it as a submodule of this processing repo:

```bash
cd /home/pnlong/jazz-standard-dataset
# jazzsamba-demo/ already exists with its own .git — convert carefully:
git submodule add -b main git@github.com:pnlong/jazzsamba-demo.git jazzsamba-demo
# If git complains the path is taken:
#   1) push demo first
#   2) mv jazzsamba-demo jazzsamba-demo-local
#   3) git submodule add ...
#   4) compare, then remove jazzsamba-demo-local
```

Clone this processing repo **without** `--recurse-submodules` by default so people do not download ~760 MB of demo audio.

## Checklist

| Repo | Push | GitHub UI |
|------|------|-----------|
| `pnlong/jazzsamba` | `git push -u origin main` from `.tmp-jazzsamba-pkg` | Nothing special (code only) |
| `pnlong/jazzsamba-demo` | `git push -u origin main` from `jazzsamba-demo` | **Enable Pages** from `main` / root |
