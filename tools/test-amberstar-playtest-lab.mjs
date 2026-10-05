// Inspects the lab tiles of an Amberstar map (play-test helper). Usage: node tools/test-amberstar-playtest-lab.mjs <map>
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
function collect(dir, prefix, files) {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, e.name), name = prefix ? `${prefix}/${e.name}` : e.name;
		if (e.isDirectory()) collect(full, name, files); else files.set(name.toUpperCase(), new Uint8Array(fs.readFileSync(full)));
	}
	return files;
}
const { AssetProvider } = await import(pathToFileURL(path.join(root, 'amberstar/src/data/assets.js')).href);
const src = new AssetProvider(collect(path.join(root, 'data/Amberstar'), '', new Map()));
const map = src.loadMap(+process.argv[2]);
const lab = src.loadLabData(map.tileset);
console.log('map', map.index, map.name, 'lab', map.tileset);
map.labTiles.forEach((t, i) => {
	const p = lab.labBlocks[t.primaryLabBlockIndex - 1], s = lab.labBlocks[t.secondaryLabBlockIndex - 1];
	const fr = b => { const q = b?.perspectives.find(q => q.location === 8 && q.facing === 0); return q ? `${q.renderX},${q.renderY} ${q.frames[0].width}x${q.frames[0].height}` : '-'; };
	console.log(`tile ${i + 1}: flags ${t.flags.toString(16)} primary ${t.primaryLabBlockIndex} type ${p?.type} [${fr(p)}] secondary ${t.secondaryLabBlockIndex} type ${s?.type} [${fr(s)}]`);
});
