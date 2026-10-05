// Exploration helper for the labyrinth converter: dumps Amberstar lab blocks, lab data, backgrounds and 3D maps.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AssetProvider } from '../amberstar/src/data/assets.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
function collect(dir, prefix, files) {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, e.name);
		const name = prefix ? `${prefix}/${e.name}` : e.name;
		if (e.isDirectory()) collect(full, name, files);
		else files.set(name.toUpperCase(), new Uint8Array(fs.readFileSync(full)));
	}
	return files;
}
const src = new AssetProvider(collect(path.join(root, 'data/Amberstar'), '', new Map()));
const blocks = src.loadAllLabBlocks();
for (const [k, b] of blocks) {
	console.log('block', k, 'type', b.type, 'persp', b.perspectives.length, 'frames', b.perspectives[0].frames.length,
		b.perspectives.map((p, i) => `${i}:L${p.location}F${p.facing} ${p.frames[0].width}x${p.frames[0].height}@${p.renderX},${p.renderY}${p.special ? 'S' + p.special.x + ',' + p.special.y : ''}`).join(' '));
}
for (const k of src.keys('LAB_DATA.AMB')) {
	const l = src.loadLabData(k);
	console.log('lab', k, 'ceil', l.ceilingIndex, 'floor', l.floorIndex, 'pal', l.paletteIndex, 'out', l.outdoors, 'blocks', l.labBlocks.map(b => `${b.index}/${b.type}`).join(','));
}
for (const k of src.backgroundKeys) {
	const b = src.loadBackground(k), c = src.loadCloud(k);
	console.log('bg', k, b.width + 'x' + b.height, c ? 'cloud ' + c.width + 'x' + c.height : '');
}
for (const k of src.keys('MAP_DATA.AMB')) {
	const m = src.loadMap(k);
	if (!m.is3D) continue;
	console.log(`map ${k}: ${m.name} (${m.width}x${m.height} lab${m.tileset} flags 0x${m.flags.toString(16)} song ${m.songIndex} labtiles ${m.labTiles.length})`);
	if (process.argv.includes('-v'))
		m.labTiles.forEach((t, i) => console.log(`   tile ${i + 1}: p${t.primaryLabBlockIndex} s${t.secondaryLabBlockIndex} c${t.minimapColorIndex} f${(t.flags >>> 0).toString(16)}`));
}

// Raw sheets: node tools/test-amberstar-labyrinths-explore.mjs --sheets
if (process.argv.includes('--sheets')) {
	const { Canvas } = await import('./test-amberstar-labyrinths-png.mjs');
	const channel = v => (v % 32 === 0 && v <= 224) ? Math.round(v / 32 * 255 / 7) : v;
	for (const k of src.keys('LAB_DATA.AMB')) {
		const l = src.loadLabData(k);
		const pal = src.loadPalette(l.paletteIndex).map(c => c.map(channel));
		const rows = l.labBlocks.map(b => b.perspectives.map(p => p.frames[0]));
		const width = Math.min(4000, Math.max(...rows.map(r => r.reduce((s, g) => s + g.width + 4, 0))) + 4);
		const height = rows.reduce((s, r) => s + Math.max(...r.map(g => g.height)) + 4, 0) + 4 + 150;
		const canvas = new Canvas(width, height, [255, 0, 255, 255]);
		let y = 4;
		for (const r of rows) {
			let x = 4;
			for (const g of r) { canvas.drawIndexed(g, x, y, pal, { transparent0: false }); x += g.width + 4; }
			y += Math.max(...r.map(g => g.height)) + 4;
		}
		let x = 4;
		for (const bi of [l.ceilingIndex, l.floorIndex]) {
			const bg = src.loadBackground(bi);
			canvas.drawIndexed(bg, x, y, pal, { transparent0: false }); x += 150;
			const cl = src.loadCloud(bi);
			if (cl) { canvas.drawIndexed(cl, x, y, pal, { transparent0: false }); x += 150; }
		}
		for (let i = 0; i < 16; i++) canvas.fillRect(x + i * 10, y, 10, 10, pal[i]);
		canvas.save(path.join(root, `tools/out/as-lab${k}-raw.png`));
	}
}

// Raw combat backgrounds: --combat
if (process.argv.includes('--combat')) {
	const { Canvas } = await import('./test-amberstar-labyrinths-png.mjs');
	const pals = src.loadCombatPalettes();
	const canvas = new Canvas(2 * 180, 7 * 116);
	for (let i = 1; i <= 14; i++) {
		const g = src.loadCombatBackground(i);
		canvas.drawIndexed(g, ((i - 1) % 2) * 180, Math.floor((i - 1) / 2) * 116, pals[i - 1], { transparent0: false });
	}
	canvas.save(path.join(root, 'tools/out/as-combat-raw.png'));
	console.log(pals.map(p => JSON.stringify(p)).join('\n'));
}
