// Writes data/<Game>/files.json with the list of all data files, so the games also work on a
// plain static web server (Apache, nginx, ...) which cannot list directories.
// Run again whenever the data folders change: node tools/make-file-lists.mjs
import { readdirSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const root = fileURLToPath(new URL('../data/', import.meta.url));
for (const game of readdirSync(root)) {
	const dir = join(root, game);
	if (!statSync(dir).isDirectory())
		continue;
	const list = [];
	const walk = (path, prefix) => {
		for (const entry of readdirSync(path, { withFileTypes: true })) {
			if (entry.name === 'files.json')
				continue;
			if (entry.isDirectory())
				walk(join(path, entry.name), prefix + entry.name + '/');
			else
				list.push(prefix + entry.name);
		}
	};
	walk(dir, '');
	writeFileSync(join(dir, 'files.json'), JSON.stringify(list, null, 1));
	console.log(`${game}: ${list.length} files`);
}
