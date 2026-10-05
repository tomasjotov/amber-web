# Amber Web

Ambermoon and Amberstar (Thalion, 1992/1993) in the browser.

- **Ambermoon** — a JavaScript port of [Ambermoon.net](https://github.com/Pyrdacor/Ambermoon.net) (the C# remake by Pyrdacor)
  with a WebGL2 renderer, running on the original Amiga data.
- **Amberstar** — the first game of the trilogy running on the same engine: the Amberstar world (maps, events, characters,
  items, texts, music) is converted from the original Amiga data at startup, the user interface, controls and graphics
  style come from Ambermoon, and the labyrinths are real textured 3D instead of pre-rendered pictures.
- **Amberstar (classic)** — the earlier port with the original Amberstar look (`amberstar/`).

License: GPL-3.0 (because of Ambermoon.net). The Sonic Arranger player is MIT (Pyrdacor), the COSO player is based on
NostalgicPlayer (MIT).

## Running

```
node tools/serve.mjs 8090
```

Open http://localhost:8090/ and pick a game (keys 1, 2, 3).

The original game data must be in `data/Ambermoon/` (Amiga `Amberfiles` folder of Ambermoon, English) and
`data/Amberstar/` (Amiga `Amberfiles` of Amberstar, English 1.96, with `_new/` containing the fresh new-game files).
Savegames and settings are stored in the browser (IndexedDB).

URL parameters: `ambermoon.html?skipintro`, `?mute` (no sound; also `localStorage['amber-web-mute'] = '1'`).

Keys (as in Ambermoon.net): F8/F9 graphic filter/overlay, F10 effects, Ctrl+M music on/off, F1-F6 inventories,
numpad/arrows/WASD movement, Esc options.

## Structure

- `src/runtime.js` — .NET replacement helpers used by the port
- `src/ambermoon/<C# project>/...` — the port, file by file (see `PORTING.md`)
- `src/host/` — browser host (canvas, input, game loop, storage) replacing GameWindow.cs
- `src/amberstar/` — Amberstar → Ambermoon engine conversion (see `AMBERSTAR.md`)
- `amberstar/` — the classic Amberstar web port
- `tools/` — dev server and test scripts (`test-gamedata.mjs`, `test-amberstar*.mjs`, `import-all.mjs`, `render-ambermoon-song.mjs`, ...)
