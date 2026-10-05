// Lists named imports that the target module does not export.
import { readdirSync, statSync, readFileSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
const files = [];
const walk = d => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } };
walk('src');
const exportCache = new Map();
function exportsOf(file) {
	if (exportCache.has(file)) return exportCache.get(file);
	const src = readFileSync(file, 'utf8');
	const names = new Set();
	let star = false;
	for (const m of src.matchAll(/export\s+(?:default\s+)?(?:async\s+)?(?:class|function\*?|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
	for (const m of src.matchAll(/export\s*\{([^}]*)\}/g))
		for (const part of m[1].split(',')) { const p = part.trim(); if (!p) continue; const mm = /(?:[\w$]+\s+as\s+)?([\w$]+)$/.exec(p); if (mm) names.add(mm[1]); }
	if (/export\s*\*\s*from/.test(src)) star = true;
	const r = { names, star };
	exportCache.set(file, r);
	return r;
}
let problems = 0;
for (const f of files) {
	const src = readFileSync(f, 'utf8');
	for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"](\.[^'"]+)['"]/g)) {
		const target = resolve(dirname(f), m[2]);
		if (!existsSync(target)) continue;
		const ex = exportsOf(target);
		if (ex.star) continue;
		for (const part of m[1].split(',')) {
			const p = part.trim();
			if (!p) continue;
			const name = p.split(/\s+as\s+/)[0].trim();
			if (!ex.names.has(name)) { problems++; console.log(`${f}: '${name}' not exported by ${m[2]}`); }
		}
	}
}
console.log('problems', problems);
