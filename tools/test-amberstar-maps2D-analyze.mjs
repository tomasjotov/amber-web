import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
function collect(dir, prefix, files) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		const name = prefix ? `${prefix}/${entry.name}` : entry.name;
		if (entry.isDirectory()) collect(full, name, files);
		else files.set(name.toUpperCase(), new Uint8Array(fs.readFileSync(full)));
	}
	return files;
}
const { AssetProvider } = await import(pathToFileURL(path.join(root, 'amberstar/src/data/assets.js')).href);
const a = new AssetProvider(collect(path.join(root, 'data/Amberstar'), '', new Map()));
const typeNames = ['None', 'MapExit', 'Door', 'ShowPictureText', 'Chest', 'TrapDoor', 'Teleporter', 'WindGate','Spinner', 'DamageField', 'AntiMagic', 'HPRegeneration', 'SPRegeneration', 'ExecuteTrap','RiddleMouth', 'AttributeChange', 'ChangeTile', 'Encounter', 'Place', 'UseItem', 'DoorExit','TravelExit', 'Altar', 'Outro'];
const mode = process.argv[2] ?? 'summary';
const keys = a.keys('MAP_DATA.AMB');
const typeCount = {};
const saveVals = {};
for (const k of keys) {
	const m = a.loadMap(k);
	const used = new Set(m.tiles.map(t => t.event).filter(e => e));
	const evs = m.events.map((e, i) => e ? i + 1 : 0).filter(Boolean);
	const maxId = Math.max(0, ...evs);
	const saved = m.events.map((e, i) => e && e.saveEvent ? i + 1 : 0).filter(Boolean);
	for (const e of m.events) if (e) { typeCount[typeNames[e.type]] = (typeCount[typeNames[e.type]] ?? 0) + 1; if (e.raw.save) saveVals[e.raw.save] = (saveVals[e.raw.save] ?? 0) + 1; }
	if (mode === 'summary')
		console.log(k, m.name, m.is3D ? '3D' : '2D', `ts${m.tileset}`, `fl${m.flags.toString(16)}`, `song${m.songIndex}`, `${m.width}x${m.height}`, 'events', evs.length, 'max', maxId, 'usedOnTiles', used.size, 'saved', saved.length ? Math.max(...saved) : 0, 'chars', m.characters.filter(c => c.index).length);
	if (mode === 'events' && (process.argv[3] == null || +process.argv[3] === k))
		m.events.forEach((e, i) => { if (e) { const { raw, ...rest } = e; console.log(k, i + 1, typeNames[e.type], JSON.stringify(rest), 'save', raw.save); } });
	if (mode === 'chars' && (process.argv[3] == null || +process.argv[3] === k))
		m.characters.forEach((c, i) => { if (c.index) console.log(k, i, JSON.stringify(c), JSON.stringify(m.characterPositions[i].slice(0, 3))); });
}
console.log(typeCount, saveVals);
if (mode === 'blocked') {
	const ts = [null, a.loadTileset(1), a.loadTileset(2)];
	const blocks = (t, f) => (f & 0x80) || !(f & 0x100);
	const res = {};
	for (const k of keys) {
		const m = a.loadMap(k);
		if (m.is3D) continue;
		const tiles = ts[m.tileset].tiles;
		for (let i = 0; i < m.tiles.length; i++) {
			const t = m.tiles[i];
			if (!t.event) continue;
			const ev = m.events[t.event - 1];
			let b;
			if (t.overlay && !(tiles[t.overlay - 1].flags & 0x20)) b = blocks(0, tiles[t.overlay - 1].flags);
			else b = t.underlay ? blocks(0, tiles[t.underlay - 1].flags) : false;
			const key = typeNames[ev.type] + (b ? ' BLOCKED' : '');
			res[key] = (res[key] ?? 0) + 1;
			if (b && process.argv[3]) console.log(k, i % m.width, Math.floor(i / m.width), typeNames[ev.type], t.underlay, t.overlay);
		}
	}
	console.log(res);
}
if (mode === 'texts') {
	const k = +process.argv[3];
	const t = a.text('map', k);
	for (let i = 0; i < t.textBlockCount; i++) {
		const b = t.getTextBlock(i);
		console.log(i, JSON.stringify(b.getParagraphs(1000)), JSON.stringify(b.indices.slice(0, 12).map(x => a.textFragments[x])));
	}
}
