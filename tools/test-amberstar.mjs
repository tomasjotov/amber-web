// Builds the Amberstar-on-Ambermoon game data in Node and prints statistics.
// Usage: node tools/test-amberstar.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

function collect(dir, prefix, files, upper = false) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		const name = prefix ? `${prefix}/${entry.name}` : entry.name;
		if (entry.isDirectory())
			collect(full, name, files, upper);
		else
			files.set(upper ? name.toUpperCase() : name, new Uint8Array(fs.readFileSync(full)));
	}
	return files;
}

const imp = p => import(pathToFileURL(path.join(root, p)).href);
await imp('src/ambermoon/Ambermoon.Core/GameCore.js');
const { GameData } = await imp('src/ambermoon/Ambermoon.Data.Legacy/GameData.js');
const { createAmberstarGameData } = await imp('src/amberstar/AmberstarGameData.js');

const ambermoon = new GameData(GameData.LoadPreference.PreferExtracted, null, false);
ambermoon.LoadFromFiles(collect(path.join(root, 'data/Ambermoon'), '', new Map()));
const amberstarFiles = collect(path.join(root, 'data/Amberstar'), '', new Map(), true);
// the new game files are stored as _NEW/NAME like in the Amberstar web port
const start = performance.now();
const { gameData, savegameManager } = createAmberstarGameData(ambermoon, amberstarFiles, { info: m => console.log(m) });
console.log(`Built in ${Math.round(performance.now() - start)} ms`);
const mm = gameData.MapManager;
console.log('Maps:', mm.Maps.length, 'Tilesets:', mm.Tilesets.length, 'Labdata:', mm.Labdata.length);
for (const i of [1, 65, 67, 69])
	console.log(' map', i, mm.GetMap(i) ? `${mm.GetMap(i).Name} ${mm.GetMap(i).Width}x${mm.GetMap(i).Height} type ${mm.GetMap(i).Type} events ${mm.GetMap(i).Events.length} texts ${mm.GetMap(i).Texts.length}` : 'missing');
console.log('Palettes:', gameData.GraphicInfoProvider.Palettes.size);
console.log('Party members:', gameData.CharacterManager.InitialPartyMembers?.length, 'NPCs:', gameData.CharacterManager.NPCs?.length, 'Monsters:', gameData.CharacterManager.Monsters?.length);
console.log('Items:', gameData.ItemManager?.Items?.length);
console.log('Savegame manager:', !!savegameManager, 'Song manager:', !!gameData.SongManager);
