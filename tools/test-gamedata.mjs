// Loads all files of an extracted Amberfiles folder into a Map and calls GameData.LoadFromFiles.
// Usage: node tools/test-gamedata.mjs [path-to-Amberfiles]
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const folder = process.argv[2] ?? 'C:/Work/Apps/Amiga/Disk/HDD/Games/Ambermoon/Amberfiles';

function collect(dir, prefix, files) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		const name = prefix ? `${prefix}/${entry.name}` : entry.name;
		if (entry.isDirectory())
			collect(full, name, files);
		else
			files.set(name, new Uint8Array(fs.readFileSync(full)));
	}
	return files;
}

const files = collect(folder, '', new Map());
console.log(`Read ${files.size} files from ${folder}`);

const { GameData } = await import(pathToFileURL(path.join(here, '../src/ambermoon/Ambermoon.Data.Legacy/GameData.js')).href);

const log = {
	Append: text => process.stdout.write(text),
	AppendLine: text => console.log(text)
};
const verbose = process.argv.includes('--verbose');
const gameData = new GameData(GameData.LoadPreference.PreferExtracted, verbose ? log : null, true);
const start = performance.now();
gameData.LoadFromFiles(files);
console.log(`Loaded in ${Math.round(performance.now() - start)} ms`);

const count = x => x == null ? 'null' : (x.length ?? x.size ?? '?');
console.log('Loaded:', gameData.Loaded);
console.log('Version:', gameData.Version, 'Language:', gameData.Language, 'Advanced:', gameData.Advanced, 'Source:', gameData.GameDataSource);
console.log('Containers:', gameData.Files.size, 'Dictionaries:', gameData.Dictionaries.size);
const exe = gameData.ExecutableData;
console.log('Exe version:', exe?.DataVersionString, '/', exe?.DataInfoString);
console.log('File list entries:', count(exe?.FileList?.Entries));
console.log('World names:', exe ? [...exe.WorldNames.Entries.values()].join(', ') : null);
console.log('Messages:', count(exe?.Messages?.Entries), 'UI texts:', count(exe?.UITexts?.Entries));
console.log('Items:', count(gameData.ItemManager?.Items), 'first item:', gameData.ItemManager?.GetItem(1)?.Name);
console.log('Cursors:', count(gameData.CursorHotspots));
console.log('Palettes:', count(gameData.GraphicInfoProvider?.Palettes));
console.log('Party members:', count(gameData.CharacterManager?.InitialPartyMembers),
	gameData.CharacterManager?.InitialPartyMembers.map(p => p.Name).join(', '));
console.log('NPCs:', count(gameData.CharacterManager?.NPCs), 'Monsters:', count(gameData.CharacterManager?.Monsters),
	'Monster groups:', count(gameData.CharacterManager?.MonsterGroups));
console.log('Maps:', count(gameData.MapManager?.Maps), 'Tilesets:', count(gameData.MapManager?.Tilesets), 'Labdata:', count(gameData.MapManager?.Labdata));
console.log('Dictionary entries:', count(gameData.Dictionary?.Entries));
console.log('Places:', gameData.Places != null);
console.log('Font glyphs:', gameData.FontProvider?.GetFont().GlyphCount);
console.log('Data name sample:', gameData.DataNameProvider?.GetWorldName(0), '/', gameData.DataNameProvider?.GoldName);
console.log('Intro/Outro/Fantasy:', gameData.IntroData != null, gameData.OutroData != null, gameData.FantasyIntroData != null);
console.log('SongManager:', gameData.SongManager != null);
