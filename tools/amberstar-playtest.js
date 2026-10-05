// Play-test helpers for amberstar-am.html (browser console): `await import('/tools/amberstar-playtest.js')` -> window.T
const T = window.T = {};
const canvas = () => document.getElementById('game');
T.sleep = ms => new Promise(r => setTimeout(r, ms));
T.g = () => window.ambermoonGame;
// Mouse click in screenshot coordinates of an 800 px wide screenshot
T.clk = (x, y, b = 0) => {
	const s = innerWidth / 800;
	const o = { clientX: x * s, clientY: y * s, button: b, bubbles: true };
	// Synthetic mouse jumps would accumulate the offset of a trapped mouse (relative movement): reset it
	const g = window.ambermoonGame;
	if (g?.trappedMousePositionOffset) { g.trappedMousePositionOffset.X = 0; g.trappedMousePositionOffset.Y = 0; }
	if (g?.lastMousePosition) { g.lastMousePosition.X = Math.round(x * s); g.lastMousePosition.Y = Math.round(y * s); }
	canvas().dispatchEvent(new MouseEvent('mousemove', o));
	canvas().dispatchEvent(new MouseEvent('mousedown', o));
	window.dispatchEvent(new MouseEvent('mouseup', o));
};
// Click in game coordinates (320x200)
T.gclk = (x, y, b = 0) => {
	const g = T.g();
	const p = g.renderView.GameToScreen ? g.renderView.GameToScreen({ X: x, Y: y }) : null;
	const rect = canvas().getBoundingClientRect();
	const sx = p ? p.X / (canvas().width / rect.width) : x * rect.width / 320;
	const sy = p ? p.Y / (canvas().height / rect.height) : y * rect.height / 200;
	const o = { clientX: rect.left + sx, clientY: rect.top + sy, button: b, bubbles: true };
	canvas().dispatchEvent(new MouseEvent('mousemove', o));
	canvas().dispatchEvent(new MouseEvent('mousedown', o));
	window.dispatchEvent(new MouseEvent('mouseup', o));
};
T.key = (code, key) => {
	const o = { code, key: key ?? code, bubbles: true };
	window.dispatchEvent(new KeyboardEvent('keydown', o));
	window.dispatchEvent(new KeyboardEvent('keyup', o));
};
T.hold = async (code, ms) => {
	const o = { code, key: code, bubbles: true };
	window.dispatchEvent(new KeyboardEvent('keydown', o));
	await T.sleep(ms);
	window.dispatchEvent(new KeyboardEvent('keyup', o));
};
T.type = async text => {
	for (const ch of text) {
		const code = /[a-z]/i.test(ch) ? 'Key' + ch.toUpperCase() : /\d/.test(ch) ? 'Digit' + ch : ch === ' ' ? 'Space' : '';
		const o = { code, key: ch, bubbles: true };
		window.dispatchEvent(new KeyboardEvent('keydown', o));
		window.dispatchEvent(new KeyboardEvent('keyup', o));
		await T.sleep(30);
	}
};
T.err = () => document.getElementById('error').textContent;
T.st = () => {
	const g = T.g();
	return { map: g.Map?.Index, name: g.Map?.Name, pos: { ...g.player.Position }, dir: g.player.Direction, is3D: g.is3D, err: T.err().slice(-1500) };
};
T.events = (m = T.g().Map) => {
	const d3 = m.Type === 1;
	const out = [];
	const desc = e => {
		const extra = [];
		for (const k of ['MapIndex', 'X', 'Y', 'TextIndex', 'ChestIndex', 'PlaceIndex', 'PlaceType', 'Damage', 'DoorIndex', 'LockpickingChanceReduction', 'KeyIndex', 'ItemIndex', 'MonsterGroupIndex', 'EventImageIndex', 'Direction'])
			if (e[k] != null && e[k] !== 0) extra.push(k + '=' + e[k]);
		return e.constructor.name.replace('Event', '') + '(' + extra.join(' ') + ')';
	};
	for (let x = 0; x < m.Width; x++)
		for (let y = 0; y < m.Height; y++) {
			const id = d3 ? m.Blocks[x][y].MapEventId : m.Tiles[x][y].MapEventId;
			if (id) {
				let e = m.EventList[id - 1]; const chain = []; let n = 0;
				while (e && n++ < 6) { chain.push(desc(e)); e = e.Next; }
				out.push(`${x},${y}:#${id} ${chain.join('>')}`);
			}
		}
	return out;
};
T.step2D = async (dx, dy) => {
	const g = T.g();
	const p0 = { ...g.player.Position }, m0 = g.Map.Index;
	const code = dx > 0 ? 'ArrowRight' : dx < 0 ? 'ArrowLeft' : dy > 0 ? 'ArrowDown' : 'ArrowUp';
	const o = { code, key: code, bubbles: true };
	window.dispatchEvent(new KeyboardEvent('keydown', o));
	let t = 0;
	while (t < 1200) {
		await T.sleep(20); t += 20;
		const p = g.player.Position;
		if (p.X !== p0.X || p.Y !== p0.Y || g.Map.Index !== m0) break;
	}
	window.dispatchEvent(new KeyboardEvent('keyup', o));
	await T.sleep(60);
	const p = g.player.Position;
	return p.X !== p0.X || p.Y !== p0.Y || g.Map.Index !== m0;
};
T.passable = (x, y) => {
	const g = T.g(), m = g.Map;
	if (m.Type === 1)
		return !m.Blocks[x][y].BlocksPlayer(host.gameData.MapManager.GetLabdataForMap(m));
	return m.Tiles[x][y].AllowMovement(host.gameData.MapManager.GetTilesetForMap(m), g.TravelType ?? 0);
};
T.hasEvent = (x, y) => {
	const m = T.g().Map;
	const id = m.Type === 1 ? m.Blocks[x][y].MapEventId : m.Tiles[x][y].MapEventId;
	if (!id) return false;
	for (let e = m.EventList[id - 1], n = 0; e && n < 8; e = e.Next, n++)
		if (!/PopupText|Condition|Action/.test(e.constructor.name)) return true;
	return false;
};
T.path = (tx, ty) => {
	const g = T.g(), m = g.Map;
	const s = g.player.Position;
	const key = (x, y) => x + ',' + y;
	const prev = new Map([[key(s.X, s.Y), null]]);
	const q = [[s.X, s.Y]];
	while (q.length) {
		const [x, y] = q.shift();
		if (x === tx && y === ty) break;
		for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const nx = x + dx, ny = y + dy;
			if (nx < 0 || ny < 0 || nx >= m.Width || ny >= m.Height) continue;
			const k = key(nx, ny);
			if (prev.has(k)) continue;
			if (!(nx === tx && ny === ty) && (!T.passable(nx, ny) || T.hasEvent(nx, ny))) continue;
			prev.set(k, [x, y]); q.push([nx, ny]);
		}
	}
	if (!prev.has(key(tx, ty))) return null;
	const path = [];
	let c = [tx, ty];
	while (c) { path.unshift(c); c = prev.get(key(...c)); }
	return path;
};
// 3D: turn to a direction (0 up, 1 right, 2 down, 3 left) and move forward one block
T.face = async dir => {
	const g = T.g();
	g.player3D.TurnTowards(dir * 90);
	await T.sleep(50);
	return g.player.Direction === dir;
};
// Snaps the 3D camera to the center of the current block (keeps the angle)
T.center = () => {
	const g = T.g();
	const p = g.player3D.Position, a = g.player3D.Angle;
	g.player3D.SetPosition(p.X, p.Y, g.CurrentTicks, false);
	g.player3D.TurnTowards(a);
};
T.step3D = async (dx, dy) => {
	const g = T.g();
	const dir = dy < 0 ? 0 : dx > 0 ? 1 : dy > 0 ? 2 : 3;
	await T.face(dir);
	const p0 = { ...g.player.Position }, m0 = g.Map.Index;
	const o = { code: 'ArrowUp', key: 'ArrowUp', bubbles: true };
	window.dispatchEvent(new KeyboardEvent('keydown', o));
	let t = 0;
	while (t < 1500) {
		await T.sleep(20); t += 20;
		const p = g.player.Position;
		if (p.X !== p0.X || p.Y !== p0.Y || g.Map.Index !== m0) break;
	}
	window.dispatchEvent(new KeyboardEvent('keyup', o));
	await T.sleep(150);
	if (g.Map.Index === m0 && g.is3D && !g.WindowActive) T.center();
	const p = g.player.Position;
	return p.X !== p0.X || p.Y !== p0.Y || g.Map.Index !== m0;
};
// Screenshot coordinates (800 px wide) of the center of a 2D map tile
T.tileXY = (x, y) => {
	const r = T.g().renderMap2D;
	return [40 + (x - r.ScrollX) * 40 + 20, 150 + (y - r.ScrollY) * 40 + 20];
};
// Uses eye (0), hand (1) or mouth (2) on a map tile (2D) or in front (3D)
T.act = async (which, x, y) => {
	if (T.g().layout.ButtonGridPage === 0) { T.clk(640, 450, 2); await T.sleep(250); } // action buttons
	T.clk([560, 640, 720][which], 407); await T.sleep(250);
	if (x != null) { T.clk(...T.tileXY(x, y)); await T.sleep(600); }
};
// Background tabs get no animation frames (the host then only runs 5 frames per second): extra game updates
T.boost = () => {
	if (T._boost) return;
	let last = performance.now();
	T._boost = setInterval(() => {
		const now = performance.now();
		const dt = Math.min(0.1, (now - last) / 1000);
		last = now;
		const host = window.host;
		if (host && now - host.lastTime > 40 && host.Game && !host.mainMenu)
			try { host.Game.Update(dt); } catch (e) { console.error(e); }
	}, 16);
};
T.boost();
T.charPos = i => { const c = [...T.g().renderMap2D.mapCharacters.values()][i]; return [c.Position.X, c.Position.Y]; };
T.chars = () => [...T.g().renderMap2D.mapCharacters.values()].map((c, i) => [i, c.characterReference.Type, c.characterReference.Index, c.Position.X, c.Position.Y, c.active]);
// Walks next to map character i and talks/looks (which: 0 eye, 1 hand, 2 mouth)
T.approach = async i => {
	let r;
	for (let k = 0; k < 6; k++) {
		r = await T.walkNextTo(...T.charPos(i));
		const [cx, cy] = T.charPos(i), me = T.g().player.Position;
		if (Math.abs(cx - me.X) + Math.abs(cy - me.Y) === 1) return 'ok';
	}
	return r;
};
T.grid = () => {
	const g = T.g(), m = g.Map, d3 = m.Type === 1;
	const r = [];
	for (let y = 0; y < m.Height; y++) {
		let s = '';
		for (let x = 0; x < m.Width; x++) {
			const b = d3 ? m.Blocks[x][y] : m.Tiles[x][y];
			s += g.player.Position.X === x && g.player.Position.Y === y ? '@' : b.MapEventId ? (T.passable(x, y) ? 'e' : 'E') : T.passable(x, y) ? '.' : '#';
		}
		r.push(String(y).padStart(2) + ' ' + s);
	}
	return r.join('\n');
};
T.autoClose = true;
T.popupOpen = () => {
	const l = T.g().layout;
	return !!(l?.PopupActive ?? l?.activePopup);
};
T.walkTo = async (tx, ty, tries = 4) => {
	let r;
	for (let i = 0; i < tries; i++) {
		r = await T.walkTo1(tx, ty);
		if (r === 'ok' || r.startsWith('mapchanged') || r === 'nopath' || r.startsWith('popup')) return r;
		const p = T.g().player.Position;
		if (p.X === tx && p.Y === ty) return 'ok';
	}
	return r;
};
// Walks next to (x, y)
T.walkNextTo = async (x, y) => {
	const p = T.path(x, y);
	if (!p) return 'nopath';
	if (p.length <= 2) return 'ok';
	return T.walkTo(...p[p.length - 2]);
};
T.walkTo1 = async (tx, ty) => {
	const g = T.g();
	const m0 = g.Map.Index;
	const path = T.path(tx, ty);
	if (!path) return 'nopath';
	for (let i = 1; i < path.length; i++) {
		const p = g.player.Position;
		const [nx, ny] = path[i];
		if (g.Map.Index !== m0) return 'mapchanged ' + g.Map.Index;
		let ok = false;
		for (let attempt = 0; attempt < 3 && !ok; attempt++) {
			ok = g.Map.Type === 1 ? await T.step3D(nx - p.X, ny - p.Y) : await T.step2D(nx - p.X, ny - p.Y);
			if (!ok && T.popupOpen()) {
				if (!T.autoClose) return 'popup at ' + p.X + ',' + p.Y;
				T.clk(400, 250); await T.sleep(400);
			}
		}
		if (!ok) return 'blocked at ' + p.X + ',' + p.Y + ' -> ' + nx + ',' + ny;
	}
	return 'ok';
};
// Magnified view of a screen region (screenshot coordinates of an 800 px wide screenshot); click it to close
T.zoom = (x, y, w, h, scale = 3) => {
	const c = canvas();
	host.renderView.Render(T.g()?.ViewportOffset ?? null);
	const s = c.width / 800;
	const off = document.createElement('canvas');
	off.width = w * scale; off.height = h * scale;
	const ctx = off.getContext('2d');
	ctx.imageSmoothingEnabled = false;
	ctx.drawImage(c, x * s, y * s, w * s, h * s, 0, 0, w * scale, h * scale);
	let o = document.getElementById('zoomov');
	if (!o) {
		o = document.createElement('img');
		o.id = 'zoomov';
		o.style.cssText = 'position:fixed;left:0;top:0;z-index:10;image-rendering:pixelated;border:2px solid red;width:auto';
		document.body.appendChild(o);
	}
	o.src = off.toDataURL();
	o.style.width = (w * scale / devicePixelRatio) + 'px';
	return true;
};
T.unzoom = () => document.getElementById('zoomov')?.remove();
// Starts a new game from the main menu / character creation
T.newGame = async () => {
	while (!window.ambermoonGame) await T.sleep(200);
	await T.sleep(500);
	T.clk(641, 316); // OK in the character creator
	for (let i = 0; i < 6; i++) { await T.sleep(700); T.clk(530, 265); }
	await T.sleep(1500);
	return T.st();
};
T.texts = () => {
	// All texts of visible UI texts (layout)
	const g = T.g();
	return g.layout?.activePopup ? 'popup' : '';
};
export default T;
