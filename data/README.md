# Game data

The original game data is not part of this repository (it is copyrighted).

- `data/Ambermoon/` — the contents of the `Amberfiles` folder of the Amiga version of Ambermoon (English).
- `data/Amberstar/` — the contents of the `Amberfiles` folder of the Amiga version of Amberstar (English 1.96),
  plus a subfolder `_new/` with the fresh new-game files (`PARTYDAT.SAV`, `CHARDATA.AMB`, `AUTOMAP.AMB`, `CHESTDAT.AMB`).

After copying the data run `node tools/make-file-lists.mjs`. It writes `files.json` into both folders, which the
games need on static web servers (Apache, nginx, GitHub Pages ...).
