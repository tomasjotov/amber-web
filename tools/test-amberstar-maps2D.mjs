// Validates the output of the Amberstar maps2D converter (src/amberstar/convert/maps2D.js).
// Usage: node tools/test-amberstar-maps2D.mjs [mapIndex]   (with a map index: dumps that map's events)
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
const { createContext } = await imp('src/amberstar/AmberstarGameData.js');
const Graphics2D = await imp('src/amberstar/convert/graphics2D.js');
const Maps2D = await imp('src/amberstar/convert/maps2D.js');
const { TextProcessor } = await imp('src/ambermoon/Ambermoon.Data.Legacy/Text.js');
const { EventType, ConditionEvent, Dice100RollEvent, DoorEvent, ChestEvent, DecisionEvent } = await imp('src/ambermoon/Ambermoon.Data.Common/Event.js');
const { MapType } = await imp('src/ambermoon/Ambermoon.Data.Common/Enumerations/MapType.js');
const { CharacterType } = await imp('src/ambermoon/Ambermoon.Data.Common/Enumerations/CharacterType.js');
const { enumName } = await imp('src/runtime.js');

const ambermoon = new GameData(GameData.LoadPreference.PreferExtracted, null, false);
ambermoon.LoadFromFiles(collect(path.join(root, 'data/Ambermoon'), '', new Map()));
const ctx = createContext(ambermoon, collect(path.join(root, 'data/Amberstar'), '', new Map(), true));
Graphics2D.convert(ctx);
Maps2D.convert(ctx);

// Also convert the events of the 3D maps (without blocks) to validate the event conversion of all maps.
const { Map: AmbermoonMap } = await imp('src/ambermoon/Ambermoon.Data.Common/Map.js');
const maps3D = [];
for (const key of ctx.source.keys('MAP_DATA.AMB')) {
	const a = ctx.source.loadMap(key);
	if (!a.is3D)
		continue;
	const m = new AmbermoonMap();
	m.Index = key;
	m.Type = MapType.Map3D;
	m.Width = a.width;
	m.Height = a.height;
	m.Blocks = Array.from({ length: a.width }, () => Array.from({ length: a.height }, () => new AmbermoonMap.Block()));
	m.InitialBlocks = Array.from({ length: a.width }, () => Array.from({ length: a.height }, () => new AmbermoonMap.Block()));
	Maps2D.convertCharacterReferences(ctx, a, m, { graphicIndex: () => 1 });
	Maps2D.convertEvents(ctx, a, m);
	maps3D.push([a, m]);
}

const errors = [];
const err = (map, msg) => errors.push(`map ${map.Index}: ${msg}`);
const textProcessor = new TextProcessor(94);
const typeCounts = {};
let totalEvents = 0, maxList = 0, maxListMap = 0;

function validate(map, a) {
	if (map.EventList.length > 64)
		err(map, `EventList has ${map.EventList.length} entries`);
	if (map.EventList.length > maxList) { maxList = map.EventList.length; maxListMap = map.Index; }
	map.Events.forEach((e, i) => {
		if (e.Index !== i + 1)
			err(map, `event ${i} has Index ${e.Index}`);
		if (e.Next && !map.Events.includes(e.Next))
			err(map, `event ${i} Next not in Events`);
		typeCounts[enumName(EventType, e.Type)] = (typeCounts[enumName(EventType, e.Type)] ?? 0) + 1;
		const branch = e instanceof ConditionEvent || e instanceof Dice100RollEvent ? e.ContinueIfFalseWithMapEventIndex
			: e instanceof DoorEvent || e instanceof ChestEvent ? e.UnlockFailedEventIndex : e instanceof DecisionEvent ? e.NoEventIndex : 0xffff;
		if (branch !== 0xffff && !map.Events[branch])
			err(map, `event ${i} branch ${branch} invalid`);
		if ('TextIndex' in e && e.TextIndex !== 0xff && e.TextIndex >= map.Texts.length)
			err(map, `event ${i} text ${e.TextIndex} >= ${map.Texts.length}`);
		e.toString();
	});
	totalEvents += map.Events.length;
	for (const e of map.EventList)
		if (!map.Events.includes(e))
			err(map, 'EventList entry not in Events');
	const grid = map.Type === MapType.Map2D ? map.Tiles : map.Blocks;
	for (let x = 0; x < map.Width; x++)
		for (let y = 0; y < map.Height; y++) {
			const id = grid[x][y].MapEventId;
			if (id > map.EventList.length)
				err(map, `tile ${x},${y} event id ${id} > ${map.EventList.length}`);
			if (map.Type === MapType.Map2D && map.InitialTiles[x][y].MapEventId !== id)
				err(map, `initial tile ${x},${y} differs`);
		}
	// lost events
	const used = new Set(a.tiles.map(t => t.event).filter(Boolean));
	for (const id of used)
		if (!map.AmberstarEventSlots.has(id))
			err(map, `amberstar event ${id} has no slot`);
	for (const text of map.Texts) {
		try {
			textProcessor.ProcessText(text, null, []);
		} catch (e) {
			err(map, `text "${text.slice(0, 40)}": ${e.message}`);
		}
	}
	for (const ref of map.CharacterReferences) {
		if (!ref)
			continue;
		if (ref.Positions.length !== 1 && ref.Positions.length !== 288)
			err(map, `character with ${ref.Positions.length} positions`);
		if (ref.EventIndex > map.EventList.length)
			err(map, 'character event index invalid');
	}
	const clone = map.Clone();
	if (clone.Events.length !== map.Events.length)
		err(map, 'clone failed');
}

for (const map of ctx.result.maps.values())
	validate(map, ctx.source.loadMap(map.Index));
for (const [a, m] of maps3D)
	validate(m, a);

const refTypes = {};
for (const map of ctx.result.maps.values())
	for (const r of map.CharacterReferences)
		if (r) refTypes[enumName(CharacterType, r.Type) + (r.CharacterFlags & 4 ? '+popup' : '')] = (refTypes[enumName(CharacterType, r.Type) + (r.CharacterFlags & 4 ? '+popup' : '')] ?? 0) + 1;

console.log('2D maps:', ctx.result.maps.size, '3D maps (events only):', maps3D.length);
console.log('Events:', totalEvents, 'max EventList', maxList, 'on map', maxListMap);
console.log('Event types:', typeCounts);
console.log('Character references:', refTypes);
const world = ctx.result.maps.get(1);
console.log('World map 1:', world.Name, 'flags', world.Flags.toString(16), 'left', world.LeftMapIndex, 'up', world.UpMapIndex, 'offset', world.MapOffset.X, world.MapOffset.Y, 'palette', world.PaletteIndex);
console.log(errors.length ? errors.slice(0, 50).join('\n') : 'No errors', errors.length > 50 ? `... ${errors.length} errors` : '');

const dump = +process.argv[2];
if (dump) {
	const map = ctx.result.maps.get(dump) ?? maps3D.find(([, m]) => m.Index === dump)?.[1];
	console.log(`\n${map.Name ?? map.Index} texts:`);
	map.Texts.forEach((t, i) => console.log(` ${i}: ${t}`));
	console.log('EventList:');
	map.EventList.forEach((head, slot) => {
		let line = ` [${slot + 1}]`;
		for (let e = head, n = 0; e && n < 10; e = e.Next, n++)
			line += ` -> #${e.Index} ${e.toString()}`;
		console.log(line);
	});
	console.log('Characters:');
	map.CharacterReferences.forEach((r, i) => r && console.log(` ${i}: ${enumName(CharacterType, r.Type)} index ${r.Index} flags ${r.CharacterFlags} gfx ${r.GraphicIndex} pos ${r.Positions[0].X},${r.Positions[0].Y} (${r.Positions.length}) event ${r.EventIndex} cbg ${r.CombatBackgroundIndex}`));
}

// Event tiles which the player can not enter (Ambermoon only triggers special events on enterable tiles)
if (process.argv.includes('--blocked')) {
	const { TravelType } = await imp('src/ambermoon/Ambermoon.Data.Common/Enumerations/TravelType.js');
	const typeCount = {};
	for (const map of ctx.result.maps.values()) {
		const tileset = ctx.result.tilesets[map.TilesetOrLabdataIndex - 1];
		for (let x = 0; x < map.Width; x++)
			for (let y = 0; y < map.Height; y++) {
				const tile = map.Tiles[x][y];
				typeCount[tile.Type] = (typeCount[tile.Type] ?? 0) + 1;
				if (tile.MapEventId === 0)
					continue;
				const head = map.EventList[tile.MapEventId - 1];
				let e = head;
				while (e && (e instanceof ConditionEvent || e.Type === EventType.MapText || e.Type === EventType.Action))
					e = e.Next;
				if (!e || e.Type !== EventType.Teleport)
					continue;
				if (!tile.AllowMovement(tileset, TravelType.Walk) && !tile.AllowMovement(tileset, TravelType.Ship))
					console.log('blocked teleport', map.Index, x + 1, y + 1, tile.BackTileIndex, tile.FrontTileIndex);
			}
	}
	console.log('tile types', typeCount);
	let spawn = 0;
	for (const map of ctx.result.maps.values())
		for (const r of map.CharacterReferences)
			if (r?.AmberstarSpawnDay != null) spawn++;
	console.log('characters with spawn date', spawn);
}

// Unsupported Amberstar events (EventList placeholders)
{
	let placeholders = 0;
	for (const map of [...ctx.result.maps.values(), ...maps3D.map(([, m]) => m)])
		for (const e of map.EventList)
			if (e instanceof ConditionEvent && e.TypeOfCondition === ConditionEvent.ConditionType.GlobalVariable && e.Value === 2) {
				placeholders++;
				const id = [...map.AmberstarEventSlots].find(([, slot]) => map.EventList[slot] === e)?.[0];
				console.log(`placeholder on map ${map.Index} for amberstar event ${id}`, JSON.stringify(ctx.source.loadMap(map.Index).events[id - 1]));
			}
	console.log('placeholders', placeholders);
}
