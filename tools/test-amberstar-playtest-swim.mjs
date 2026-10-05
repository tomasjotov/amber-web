// Checks the walk/swim flags of the Ambermoon world tileset (play-test helper)
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
function collect(dir, prefix, files) {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, e.name), name = prefix ? `${prefix}/${e.name}` : e.name;
		if (e.isDirectory()) collect(full, name, files); else files.set(name, new Uint8Array(fs.readFileSync(full)));
	}
	return files;
}
const imp = p => import(pathToFileURL(path.join(root, p)).href);
await imp('src/ambermoon/Ambermoon.Core/GameCore.js');
const { GameData } = await imp('src/ambermoon/Ambermoon.Data.Legacy/GameData.js');
const gd = new GameData(GameData.LoadPreference.PreferExtracted, null, false);
gd.LoadFromFiles(collect(path.join(root, 'data/Ambermoon'), '', new Map()));
const ts = gd.MapManager.GetTilesetForMap(gd.MapManager.GetMap(1));
let swimOnly = 0, swimWalk = 0;
ts.Tiles.forEach(t => { const f = t.Flags ?? t.flags; if (f & 0x8000) { if (f & 0x100) swimWalk++; else swimOnly++; } });
console.log('Ambermoon tileset', ts.Index, 'swim+walk', swimWalk, 'swim only', swimOnly);
