// Tests the Amberstar graphics2D converter and writes previews to tools/out/.
// Usage: node tools/test-amberstar-graphics2D.mjs [--base]
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
function collect(dir, prefix, files, upper = false) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		const name = prefix ? `${prefix}/${entry.name}` : entry.name;
		if (entry.isDirectory()) collect(full, name, files, upper);
		else files.set(upper ? name.toUpperCase() : name, new Uint8Array(fs.readFileSync(full)));
	}
	return files;
}
const imp = p => import(pathToFileURL(path.join(root, p)).href);
await imp('src/ambermoon/Ambermoon.Core/GameCore.js');
const { GameData } = await imp('src/ambermoon/Ambermoon.Data.Legacy/GameData.js');
const ambermoon = new GameData(GameData.LoadPreference.PreferExtracted, null, false);
ambermoon.LoadFromFiles(collect(path.join(root, 'data/Ambermoon'), '', new Map()));
const { createContext } = await imp('src/amberstar/AmberstarGameData.js');
const G = await imp('src/amberstar/convert/graphics2D.js');
const { GraphicType } = await imp('src/ambermoon/Ambermoon.Data.Common/IGraphicProvider.js');
const { encodePNG, sheet, scale } = await import(pathToFileURL(path.join(here, 'png.mjs')).href);

const ctx = createContext(ambermoon, collect(path.join(root, 'data/Amberstar'), '', new Map(), true));
ctx.log = m => console.log(m);
G.convert(ctx);
const r = ctx.result;
let errors = 0;
const check = (cond, msg) => { if (!cond) { errors++; console.log('ERROR:', msg); } };

const paletteRGBA = key => { const p = ctx.palettes.palettes.get(key); return Array.from({ length: 32 }, (_, i) => [...p.Data.subarray(i * 4, i * 4 + 4)]); };
for (const ts of r.tilesets) {
	const key = G.tilesetPaletteIndex(ctx, ts.Index);
	const gfx = ctx.graphics.get(GraphicType.Tileset1 + ts.Index - 1);
	console.log(`Tileset ${ts.Index}: ${ts.Tiles.length} tiles, ${gfx.length} graphics, palette key ${key}`);
	check(ts.Tiles.length === 250, 'tile count');
	ts.Tiles.forEach((t, i) => {
		check(t.GraphicIndex >= 1 && t.GraphicIndex - 1 + t.NumAnimationFrames <= gfx.length, `tile ${i + 1} graphic range`);
		check(gfx[t.GraphicIndex - 1].Width === 16 && gfx[t.GraphicIndex - 1].Height === 16, 'tile graphic size');
	});
	const sits = ts.Tiles.map((t, i) => t.SitDirection != null || t.Sleep ? `${i + 1}:${t.Sleep ? 'sleep' : t.SitDirection}` : null).filter(Boolean);
	console.log('  seats', sits.join(' '), 'swim tiles', ts.Tiles.filter(t => t.AllowMovement(7)).length,
		'combat bg', [...new Set(ts.Tiles.map(t => t.CombatBackgroundIndex))].join(','));
	// minimap preview: each tile's color through the engine mapping
	const pal = paletteRGBA(key);
	console.log('  palette', pal.map(c => c[3] ? c.slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join('') : '----').join(' '));
}
const player = ctx.graphics.get(GraphicType.Player);
check(player.length === 51 && player.every(g => g.Width === 16 && g.Height === 32), 'player graphics');
const travel = ctx.graphics.get(GraphicType.TravelGfx);
check(travel.length === 44, 'travel graphics');
for (let t = 0; t < 11; t++) for (let d = 0; d < 4; d++) { const i = r.travelGraphicInfo(t, d); const g = travel[t * 4 + d]; check(i.Width === g.Width && i.Height === g.Height, 'travel info size'); }
const transports = ctx.graphics.get(GraphicType.Transports);
check(transports.length === 5, 'transports');
[...r.stationaryImageInfos.values()].forEach((info, i) => check(info.Width === transports[i].Width && info.Height === transports[i].Height, 'stationary size'));
const npc = ctx.graphics.get(GraphicType.NPC);
console.log('NPC graphics', npc.length, 'offsets', JSON.stringify([...r.npcGraphicOffsets]), 'animated', [...r.npcGraphicFrameCounts].map(([k, v]) => `${k}:${v.filter(c => c > 1).length}`).join(' '));
for (const [k, counts] of r.npcGraphicFrameCounts) counts.forEach((c, i) => { const g = npc[r.npcGraphicOffsets.get(k) + i]; check(g.Width === 16 * c && g.Height === 32, 'npc size'); });

// previews
function writeSheet(name, graphics, paletteKey, columns, f = 3) {
	const pal = paletteRGBA(paletteKey);
	const cw = Math.max(...graphics.map(g => g.Width)) + 2, ch = Math.max(...graphics.map(g => g.Height)) + 2;
	const rows = Math.ceil(graphics.length / columns);
	const W = cw * columns, H = ch * rows;
	const items = graphics.map((g, i) => ({ x: (i % columns) * cw, y: Math.floor(i / columns) * ch, width: g.Width, height: g.Height, data: g.Data, palette: pal }));
	fs.mkdirSync(path.join(here, 'out'), { recursive: true });
	fs.writeFileSync(path.join(here, 'out', name), encodePNG(W * f, H * f, scale(W, H, sheet(W, H, items), f)));
}
const k1 = G.tilesetPaletteIndex(ctx, 1), k2 = G.tilesetPaletteIndex(ctx, 2);
writeSheet('am-player-ts2.png', player.slice(0, 17), k2, 17);
writeSheet('am-player-ts1.png', player.slice(0, 17), k1, 17);
writeSheet('am-travel.png', travel, k1, 4);
writeSheet('am-transports.png', transports, k1, 5);
writeSheet('am-npc-ts2.png', npc.slice(r.npcGraphicOffsets.get(2) + 120, r.npcGraphicOffsets.get(2) + 250), k2, 10, 2);
// minimap of a world map region and an indoor map (tile colors through the engine's ColorIndexMapping)
const { ColorIndexMapping } = await imp('src/amberstar/convert/graphics2D/palettePlan.js');
for (const [mapIndex, world] of [[29, true], [71, false], [91, false]]) {
	const m = ctx.source.loadMap(mapIndex);
	const ts = r.tilesets[m.tileset - 1];
	const pal = paletteRGBA(G.tilesetPaletteIndex(ctx, m.tileset));
	const rgba = new Uint8Array(m.width * m.height * 4);
	m.tiles.forEach((t, i) => {
		const idx = t.overlay || t.underlay;
		const c = idx ? pal[ColorIndexMapping[(world ? 16 : 0) + ts.Tiles[idx - 1].ColorIndex % 16]] : [0, 0, 0, 255];
		rgba.set([c[0], c[1], c[2], 255], i * 4);
	});
	fs.writeFileSync(path.join(here, 'out', `am-minimap-${mapIndex}.png`), encodePNG(m.width * 4, m.height * 4, scale(m.width, m.height, rgba, 4)));
}
console.log(errors ? `${errors} errors` : 'OK');
