// Lists relative imports that point to missing files.
import { readdirSync, statSync, readFileSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
const root = 'src';
const files = [];
const walk = d => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } };
walk(root);
const missing = new Map();
for (const f of files) {
	for (const m of readFileSync(f, 'utf8').matchAll(/(?:import|export)\s[^'"]*?from\s*['"](\.[^'"]+)['"]/g)) {
		const target = resolve(dirname(f), m[1]);
		if (!existsSync(target)) {
			if (!missing.has(target)) missing.set(target, []);
			missing.get(target).push(f);
		}
	}
}
for (const [t, fs] of missing) console.log(t, '<-', fs.length, fs[0]);
console.log('missing', missing.size);
