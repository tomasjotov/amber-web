// Test for the labyrinth converter (src/amberstar/convert/labyrinths.js).
// Builds the Amberstar game data, checks the shapes of the Labdata / 3D maps and writes previews to tools/out/:
//   as-labdata<n>.png       wall textures, objects, floor/ceiling textures, horizon of every labdata
//   as-combat-converted.png all converted combat backgrounds (day palettes) + night variants
//   as-view<map>.png        a simple raycast view of a 3D map (node tools/test-amberstar-labyrinths.mjs --view 67 10 20 0)
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { Canvas } from './test-amberstar-labyrinths-png.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const out = path.join(here, 'out');
fs.mkdirSync(out, { recursive: true });

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
const { createAmberstarGameData, GraphicType } = await imp('src/amberstar/AmberstarGameData.js');
const { MapType } = await imp('src/ambermoon/Ambermoon.Data.Common/Enumerations/MapType.js');
const { Tileset } = await imp('src/ambermoon/Ambermoon.Data.Common/Tileset.js');

const ambermoon = new GameData(GameData.LoadPreference.PreferExtracted, null, false);
ambermoon.LoadFromFiles(collect(path.join(root, 'data/Ambermoon'), '', new Map()));
const { gameData, context: ctx } = createAmberstarGameData(ambermoon, collect(path.join(root, 'data/Amberstar'), '', new Map(), true), null);
const gip = gameData.GraphicInfoProvider;
const mm = gameData.MapManager;
const args = process.argv.slice(2);

// ---- shape checks ----
let errors = 0;
const fail = m => { errors++; console.log('ERROR', m); };
mm.Labdata.forEach((l, i) => {
	if (l.Index !== i + 1) fail(`labdata ${i} index ${l.Index}`);
	if (l.Walls.length !== l.WallGraphics.length) fail(`labdata ${l.Index} walls/graphics`);
	l.WallGraphics.forEach((g, w) => { if (g.Width !== 128 || g.Height !== 80 || g.Data.length !== 128 * 80) fail(`labdata ${l.Index} wall ${w} size`); });
	if (l.ObjectInfos.length !== l.ObjectGraphics.length) fail(`labdata ${l.Index} object infos/graphics`);
	l.ObjectInfos.forEach((o, k) => {
		const g = l.ObjectGraphics[k];
		if (g.Width !== o.TextureWidth * o.NumAnimationFrames || g.Height !== o.TextureHeight) fail(`labdata ${l.Index} object ${k} size`);
		if (o.TextureIndex < 1 || o.TextureIndex >= 1000) fail(`labdata ${l.Index} object ${k} texture index`);
	});
	if (l.Objects.length > 100 || l.Walls.length > 154) fail(`labdata ${l.Index} too many walls/objects`);
	if (l.FloorGraphic && (l.FloorGraphic.Width !== 64 || l.FloorGraphic.Height !== 64)) fail(`labdata ${l.Index} floor`);
	if (!gip.Palettes.has(l.PaletteIndex)) fail(`labdata ${l.Index} palette`);
	console.log(`labdata ${l.Index}: walls ${l.Walls.length} objects ${l.Objects.length} infos ${l.ObjectInfos.length} wallHeight ${l.WallHeight} ` +
		`floorColor ${l.FloorColorIndex} ceilingColor ${l.CeilingColorIndex} combatBg ${l.CombatBackground} outdoor ${l.Outdoor}`);
});
const maps3D = mm.Maps.filter(m => m.Type === MapType.Map3D);
for (const m of maps3D) {
	const l = mm.GetLabdataForMap(m);
	if (!l) { fail(`map ${m.Index} labdata`); continue; }
	for (let x = 0; x < m.Width; x++) {
		for (let y = 0; y < m.Height; y++) {
			const b = m.Blocks[x][y];
			if (b.WallIndex > l.Walls.length || b.ObjectIndex > l.Objects.length) fail(`map ${m.Index} block ${x},${y}`);
			if (b.MapEventId > m.EventList.length) fail(`map ${m.Index} event id ${x},${y}`);
		}
	}
	for (const ref of m.CharacterReferences) {
		if (ref && (ref.GraphicIndex < 1 || ref.GraphicIndex > l.Objects.length || l.Objects[ref.GraphicIndex - 1].SubObjects.length === 0))
			fail(`map ${m.Index} character graphic ${ref.GraphicIndex}`);
	}
	console.log(`map ${m.Index} ${m.Name}: ${m.Width}x${m.Height} lab ${m.TilesetOrLabdataIndex} flags 0x${m.Flags.toString(16)} events ${m.EventList.length}/${m.Events.length} ` +
		`texts ${m.Texts.length} chars ${m.CharacterReferences.filter(Boolean).length} music ${m.MusicIndex}`);
}
const cb = gip.Get2DCombatBackground(0);
const cbg = gip.GetGraphics(GraphicType.CombatBackground);
if (cbg.length !== 14 || cbg.some(g => g.Width !== 320 || g.Height !== 95)) fail('combat backgrounds');
if (!cb.Palettes.every(p => gip.Palettes.has(p))) fail('combat palettes');
const horizons = gip.GetGraphics(GraphicType.LabBackground);
if (!horizons.length || horizons[0].Width !== 144 || horizons[0].Height !== 20) fail('lab background');
for (const h of [0, 6, 7, 12, 19, 21]) {
	const parts = gameData.LightEffectProvider.GetSkyParts(mm.GetMap(67), h, 0);
	const rep = gameData.LightEffectProvider.GetLightPaletteReplacement(mm.GetMap(67), h, 0, 0, gip);
	if (parts.reduce((s, p) => s + p.Height, 0) !== 72 || rep.ColorData.length !== 64) fail('sky');
}
console.log(errors ? `${errors} errors` : 'all checks passed');

// ---- previews ----
function sheet(labdata) {
	const pal = gip.Palettes.get(labdata.PaletteIndex);
	const cols = 4;
	const wallRows = Math.ceil(labdata.WallGraphics.length / cols);
	const objHeight = Math.max(0, ...labdata.ObjectGraphics.map(g => g.Height)) + 4;
	const objWidth = labdata.ObjectGraphics.reduce((s, g) => s + g.Width + 4, 0);
	const width = Math.max(cols * 132 + 4, Math.min(1600, objWidth) + 4, 64 * 2 + 160 + 12);
	const objLines = Math.max(1, Math.ceil(objWidth / 1600));
	const height = 4 + wallRows * 84 + objLines * objHeight + 4 + 68;
	const c = new Canvas(width, height, [255, 0, 255, 255]);
	labdata.WallGraphics.forEach((g, i) => c.drawIndexed(g, 4 + (i % cols) * 132, 4 + Math.floor(i / cols) * 84, pal, { transparent0: true }));
	let x = 4, y = 4 + wallRows * 84;
	for (const g of labdata.ObjectGraphics) {
		if (x + g.Width > 1600) { x = 4; y += objHeight; }
		c.drawIndexed(g, x, y, pal);
		x += g.Width + 4;
	}
	y += objHeight + 4;
	if (labdata.FloorGraphic) c.drawIndexed(labdata.FloorGraphic, 4, y, pal);
	if (labdata.CeilingGraphic) c.drawIndexed(labdata.CeilingGraphic, 72, y, pal);
	c.fillRect(140, y, 10, 30, pal.Data.slice(labdata.FloorColorIndex * 4, labdata.FloorColorIndex * 4 + 3));
	c.fillRect(140, y + 32, 10, 30, pal.Data.slice(labdata.CeilingColorIndex * 4, labdata.CeilingColorIndex * 4 + 3));
	if (labdata.Outdoor) c.drawIndexed(horizons[labdata.HorizonIndex ?? 0], 156, y, pal);
	c.save(path.join(out, `as-labdata${labdata.Index}.png`));
}
if (!args.includes('--view')) {
	mm.Labdata.forEach(sheet);
	const c = new Canvas(640, 7 * 97 + 2 * 97);
	cbg.forEach((g, i) => {
		const info = gip.Get2DCombatBackground(i);
		c.drawIndexed(g, (i % 2) * 320, Math.floor(i / 2) * 97, gip.Palettes.get(info.Palettes[0]), { transparent0: false });
	});
	[0, 7].forEach((i, k) => {
		const info = gip.Get2DCombatBackground(i);
		c.drawIndexed(cbg[i], k * 320, 7 * 97, gip.Palettes.get(info.Palettes[1]), { transparent0: false });
		c.drawIndexed(cbg[i], k * 320, 8 * 97, gip.Palettes.get(info.Palettes[2]), { transparent0: false });
	});
	c.save(path.join(out, 'as-combat-converted.png'));
}

// ---- simple raycast view (walls textured, floor/ceiling colors or textures, billboards) ----
if (args.includes('--view')) {
	const [mapIndex, px, py, dir] = args.slice(args.indexOf('--view') + 1).map(Number);
	const map = mm.GetMap(mapIndex);
	const l = mm.GetLabdataForMap(map);
	const pal = gip.Palettes.get(map.PaletteIndex);
	const W = 288, H = 288, scale = 1;
	const c = new Canvas(W, H, [0, 0, 0, 255]);
	const color = i => [pal.Data[i * 4], pal.Data[i * 4 + 1], pal.Data[i * 4 + 2]];
	const posX = px - 0.5, posY = py - 0.5; // 1-based map coordinates -> center
	const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
	const [dx, dy] = dirs[dir];
	const planeX = -dy * 0.75, planeY = dx * 0.75; // ~73 degree fov
	const wallH = l.WallHeight / 512;
	const eye = 0.5 * 341 / 512 * 1.04;
	const focal = W / 2 / 0.75;
	const zbuf = new Array(W).fill(Infinity);
	// floor / ceiling
	for (let y = 0; y < H; y++) {
		for (let x = 0; x < W; x++) {
			const below = y > H / 2;
			const height = below ? eye : (wallH - eye);
			const rowDist = height * focal / Math.abs(y + 0.5 - H / 2);
			const camX = 2 * x / W - 1;
			const wx = posX + rowDist * (dx + planeX * camX), wy = posY + rowDist * (dy + planeY * camX);
			const g = below ? l.FloorGraphic : l.CeilingGraphic;
			let ci = below ? l.FloorColorIndex : l.CeilingColorIndex;
			if (g) ci = g.Data[Math.floor(((wx % 1) + 1) % 1 * 64) + Math.floor(((wy % 1) + 1) % 1 * 64) * 64];
			const col = color(ci);
			c.data.set([...col, 255], (x + y * W) * 4);
		}
	}
	for (let x = 0; x < W; x++) {
		const camX = 2 * x / W - 1;
		const rdx = dx + planeX * camX, rdy = dy + planeY * camX;
		let mx = Math.floor(posX), my = Math.floor(posY);
		const ddx = Math.abs(1 / rdx), ddy = Math.abs(1 / rdy);
		let stepX, stepY, sdx, sdy;
		if (rdx < 0) { stepX = -1; sdx = (posX - mx) * ddx; } else { stepX = 1; sdx = (mx + 1 - posX) * ddx; }
		if (rdy < 0) { stepY = -1; sdy = (posY - my) * ddy; } else { stepY = 1; sdy = (my + 1 - posY) * ddy; }
		for (let n = 0; n < 64; n++) {
			let side;
			if (sdx < sdy) { sdx += ddx; mx += stepX; side = 0; } else { sdy += ddy; my += stepY; side = 1; }
			if (mx < 0 || my < 0 || mx >= map.Width || my >= map.Height) break;
			const b = map.Blocks[mx][my];
			if (!b.WallIndex) continue;
			const wall = l.Walls[b.WallIndex - 1];
			const g = l.WallGraphics[b.WallIndex - 1];
			const dist = side === 0 ? sdx - ddx : sdy - ddy;
			let wallX = side === 0 ? posY + dist * rdy : posX + dist * rdx;
			wallX -= Math.floor(wallX);
			if ((side === 0 && rdx < 0) || (side === 1 && rdy > 0)) wallX = 1 - wallX;
			const tx = Math.min(127, Math.floor(wallX * 128));
			const top = H / 2 - (wallH - eye) * focal / dist, bottom = H / 2 + eye * focal / dist;
			let opaque = false;
			for (let y = Math.max(0, Math.floor(top)); y < Math.min(H, Math.ceil(bottom)); y++) {
				const ty = Math.min(79, Math.floor((y - top) / (bottom - top) * 80));
				let ci = g.Data[tx + ty * 128];
				if (ci === 0) continue;
				if (map.Flags & 0x2 && ci === l.CeilingColorIndex) ci = 11; // sky
				const col = color(ci).map(v => side ? Math.round(v * 0.85) : v);
				c.data.set([...col, 255], (x + y * W) * 4);
			}
			opaque = !(wall.Flags & Tileset.TileFlags.Transparency);
			if (opaque) { zbuf[x] = dist; break; }
		}
	}
	// billboards (objects and characters at their start position)
	const sprites = [];
	for (let x = 0; x < map.Width; x++) for (let y = 0; y < map.Height; y++)
		if (map.Blocks[x][y].ObjectIndex) sprites.push([x + 0.5, y + 0.5, l.Objects[map.Blocks[x][y].ObjectIndex - 1]]);
	for (const ref of map.CharacterReferences) if (ref && ref.Positions[0].X) sprites.push([ref.Positions[0].X - 0.5, ref.Positions[0].Y - 0.5, l.Objects[ref.GraphicIndex - 1]]);
	sprites.sort((a, b) => ((b[0] - posX) ** 2 + (b[1] - posY) ** 2) - ((a[0] - posX) ** 2 + (a[1] - posY) ** 2));
	const inv = 1 / (planeX * dy - dx * planeY);
	for (const [sx, sy, obj] of sprites) {
		for (const sub of obj.SubObjects) {
			const info = sub.Object;
			if (info.Flags & Tileset.TileFlags.Floor) continue;
			const rx = sx - posX, ry = sy - posY;
			const tX = inv * (dy * rx - dx * ry), tY = inv * (-planeY * rx + planeX * ry);
			if (tY <= 0.2) continue;
			const screenX = W / 2 * (1 + tX / tY);
			const hWorld = info.MappedTextureHeight / 341 * wallH, wWorld = info.MappedTextureWidth / 512;
			const zWorld = sub.Z / 341 * wallH;
			const bottom = H / 2 + (eye - zWorld) * focal / tY, top = bottom - hWorld * focal / tY;
			const half = wWorld * focal / tY / 2;
			const gi = l.ObjectInfos.indexOf(info), g = l.ObjectGraphics[gi];
			for (let x = Math.max(0, Math.floor(screenX - half)); x < Math.min(W, screenX + half); x++) {
				if (tY >= zbuf[x]) continue;
				const tx = Math.min(info.TextureWidth - 1, Math.floor((x - (screenX - half)) / (2 * half) * info.TextureWidth));
				for (let y = Math.max(0, Math.floor(top)); y < Math.min(H, bottom); y++) {
					const ty = Math.min(info.TextureHeight - 1, Math.floor((y - top) / (bottom - top) * info.TextureHeight));
					const ci = g.Data[tx + ty * g.Width];
					if (ci) c.data.set([...color(ci), 255], (x + y * W) * 4);
				}
			}
		}
	}
	c.save(path.join(out, `as-view${mapIndex}-${px}-${py}-${dir}.png`));
	console.log('written', `as-view${mapIndex}-${px}-${py}-${dir}.png`);
}
