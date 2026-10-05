// Graphics comparison helpers (browser console): `await import('/tools/gfx-shots.js')` -> window.G
// Saves canvas screenshots to tools/out via the dev server (/__shot).
const G = window.G = {};
G.sleep = ms => new Promise(r => setTimeout(r, ms));
G.g = () => window.ambermoonGame;
G.cfg = () => host.configuration;
// Renders one frame synchronously and returns the canvas as PNG data URL (works without preserveDrawingBuffer)
G.grab = () => {
	const c = document.getElementById('game');
	host.renderView.Render(G.g()?.ViewportOffset ?? null);
	return c.toDataURL('image/png');
};
G.shot = async name => {
	const data = G.grab();
	await fetch('/__shot?name=' + encodeURIComponent(name), { method: 'POST', body: data });
	return name;
};
// Sets graphic options: filter (GraphicFilter), enhanced 3D (bool)
G.set = (filter, enhanced3D) => {
	const c = G.cfg();
	if (filter != null) {
		c.GraphicFilter = filter;
		G.g()?.ExternalGraphicFilterChanged?.();
	}
	if (enhanced3D != null && 'Enhanced3D' in c) {
		c.Enhanced3D = enhanced3D;
		G.g()?.ExternalGraphicFilterChanged?.();
	}
};
// Takes a before/after pair: original (None, no enhancements) and the new default
G.pair = async (name, after = { filter: 3, enhanced3D: true }) => {
	G.set(0, false);
	await G.sleep(150);
	await G.shot(name + '_before');
	G.set(after.filter, after.enhanced3D);
	await G.sleep(150);
	await G.shot(name + '_after');
};
// Saves an enlarged crop (fractions 0..1 of the image) of saved shots side by side: G.crop('out', ['a','b'], x, y, w, h, scale)
G.crop = async (outName, names, x, y, w, h, scale = 3) => {
	const imgs = await Promise.all(names.map(n => new Promise((res, rej) => {
		const i = new Image();
		i.onload = () => res(i);
		i.onerror = rej;
		i.src = '/tools/out/' + n + '.png?' + Date.now();
	})));
	const sw = Math.round(w * imgs[0].width), sh = Math.round(h * imgs[0].height);
	const c = document.createElement('canvas');
	c.width = sw * scale * imgs.length + 4 * (imgs.length - 1);
	c.height = sh * scale;
	const ctx = c.getContext('2d');
	ctx.imageSmoothingEnabled = false;
	ctx.fillStyle = '#f0f';
	ctx.fillRect(0, 0, c.width, c.height);
	imgs.forEach((img, k) => ctx.drawImage(img, Math.round(x * img.width), Math.round(y * img.height), sw, sh, k * (sw * scale + 4), 0, sw * scale, sh * scale));
	await fetch('/__shot?name=' + encodeURIComponent(outName), { method: 'POST', body: c.toDataURL('image/png') });
	return [c.width, c.height];
};
// Reload helper: starts a new game and teleports (call after location.reload())
G.start = async (map = 258, x = 10, y = 10, dir = 0) => {
	while (!window.host?.mainMenu && !window.ambermoonGame) await G.sleep(200);
	const T = (await import('/tools/amberstar-playtest.js')).default;
	await T.newGame();
	await G.teleport(map, x, y, dir);
	return T.st();
};
G.teleport = async (map, x, y, dir = 0, hour = 12) => {
	const g = G.g();
	g.CurrentSavegame.Hour = hour;
	g.Teleport(map, x, y, dir, true);
	await G.sleep(1500);
	g.CurrentSavegame.Hour = hour;
	await G.sleep(800);
};
export default G;
