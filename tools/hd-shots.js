// HD graphics test helpers (browser console): `await import('/tools/hd-shots.js')` -> window.H (uses tools/gfx-shots.js)
// Screenshots go to tools/out via the dev server (/__shot).
import G from './gfx-shots.js';

const H = window.H = {};
H.G = G;
H.sleep = ms => new Promise(r => setTimeout(r, ms));
H.g = () => window.ambermoonGame;

/** Sets the canvas to the given size in device pixels (default Full HD), independent of the page layout. */
H.size = async (width = 1920, height = 1080) => {
	H.wanted = [width, height];
	const c = document.getElementById('game');
	const dpr = window.devicePixelRatio || 1;
	const set = (k, v) => c.style.setProperty(k, v, 'important'); // the page presentation manages the canvas size otherwise
	set('position', 'fixed');
	set('left', '0px');
	set('top', '0px');
	set('width', width / dpr + 'px');
	set('height', height / dpr + 'px');
	set('z-index', '10000');
	set('opacity', '1');
	await H.sleep(300);
	return [c.width, c.height];
};

/** Average frame time (ms) of n rendered frames (render only, synchronous) */
H.renderTime = (n = 60) => {
	const t0 = performance.now();
	for (let i = 0; i < n; ++i)
		host.renderView.Render(H.g()?.ViewportOffset ?? null);
	host.renderView.State.Gl.finish();
	return (performance.now() - t0) / n;
};

/** Measures real frame intervals via requestAnimationFrame */
H.fps = (ms = 2000) => new Promise(resolve => {
	const times = [];
	const start = performance.now();
	const step = t => {
		times.push(t);
		if (t - start < ms)
			requestAnimationFrame(step);
		else {
			const d = times.slice(1).map((t, i) => t - times[i]);
			d.sort((a, b) => a - b);
			resolve({ frames: d.length, avg: d.reduce((a, b) => a + b, 0) / d.length, p95: d[Math.floor(d.length * 0.95)] });
		}
	};
	requestAnimationFrame(step);
});

H.stats = () => host.renderView.HDStats;

/** Teleports (daytime) and waits */
H.tp = async (map, x, y, dir = 0) => {
	await G.teleport(map, x, y, dir, 12);
	return { map: H.g().Map.Index, pos: { ...H.g().player.Position } };
};

/** Click in game coordinates (320x200) */
H.click = async (x, y, button = 0) => {
	const canvas = document.getElementById('game');
	const p = host.renderView.GameToScreen({ X: x, Y: y }); // window (CSS) coordinates relative to the canvas
	const rect = canvas.getBoundingClientRect();
	const o = { clientX: rect.left + p.X, clientY: rect.top + p.Y, button, bubbles: true };
	canvas.dispatchEvent(new MouseEvent('mousemove', o));
	canvas.dispatchEvent(new MouseEvent('mousedown', o));
	window.dispatchEvent(new MouseEvent('mouseup', o));
	await H.sleep(300);
};

H.key = async (code, key) => {
	const o = { code, key: key ?? code, bubbles: true };
	window.dispatchEvent(new KeyboardEvent('keydown', o));
	window.dispatchEvent(new KeyboardEvent('keyup', o));
	await H.sleep(300);
};

/** Starts a new game from the character creator (call after ?newgame) */
H.newGame = async () => {
	while (!window.ambermoonGame) await H.sleep(200);
	await H.sleep(800);
	await H.click(254, 115); // OK
	await H.sleep(1000);
	for (let i = 0; i < 12 && !H.g().CurrentSavegame; i++) {
		await H.click(212, 86);
		await H.sleep(600);
	}
	for (let i = 0; i < 6; i++) { // intro texts
		await H.click(160, 150);
		await H.sleep(500);
	}
	await H.sleep(1000);
	for (let i = 0; i < 10 && !H.g().layout?.PopupActive; i++) // welcome popup "Do you need a little introduction?"
		await H.sleep(300);
	if (H.g().layout?.PopupActive) {
		await H.click(160, 145); // No
		await H.sleep(800);
	}
	return !!H.g().CurrentSavegame;
};

H.closeAll = async () => {
	const g = H.g();
	for (let i = 0; i < 4; i++) {
		if (g.layout?.PopupActive)
			g.layout.ClosePopup();
		if (g.WindowActive)
			g.CloseWindow();
		await H.sleep(400);
	}
};

/** Takes the screenshots of all test scenes (suffix 'before' / 'after') */
H.scenes = async (suffix, only = null) => {
	const g = H.g();
	const want = name => only == null || only.includes(name);
	const shots = [];
	const shot = async name => { await H.sleep(300); shots.push(await H.shot(`hd_${name}_${suffix}`)); };
	if (want('house')) { await H.tp(258, 6, 9); await shot('house258'); }
	if (want('world')) { await H.tp(9, 25, 25); await shot('world'); }
	if (want('3d')) { await H.tp(263, 15, 16, 0); await shot('spannenberg263'); }
	if (want('automap')) { await H.tp(263, 15, 16, 0); g.ShowAutomap(); await H.sleep(1200); await shot('automap'); await H.closeAll(); }
	if (want('inventory')) { await H.tp(258, 6, 9); g.OpenPartyMember(0, true); await H.sleep(1200); await shot('inventory'); await H.closeAll(); }
	if (want('charinfo')) { g.OpenPartyMember(0, false); await H.sleep(1200); await shot('charinfo'); await H.closeAll(); }
	if (want('popup')) { g.ShowMessagePopup('Welcome to the HD remaster of Ambermoon! All graphics are upscaled 4x.'); await H.sleep(800); await shot('popup'); await H.closeAll(); }
	if (want('battle')) {
		await H.tp(9, 25, 25);
		const groups = [...g.CharacterManager.MonsterGroups.keys()];
		g.StartBattle(only?.battleGroup ?? groups[Math.min(groups.length - 1, 10)]);
		await H.sleep(4000);
		await shot('battle');
	}
	return shots;
};

/** Reads an R8 or RGBA texture (WebGLTexture) back as Uint8Array of the red channel */
H.readTexture = (texture, width, height) => {
	const gl = host.renderView.State.Gl;
	const fb = gl.createFramebuffer();
	const prev = gl.getParameter(gl.FRAMEBUFFER_BINDING);
	gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
	const rgba = new Uint8Array(width * height * 4);
	gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
	gl.bindFramebuffer(gl.FRAMEBUFFER, prev);
	gl.deleteFramebuffer(fb);
	return rgba;
};

/** Compares the GPU upscaled atlas of a layer with the CPU reference implementation. */
H.verify = async (layer, noiseThreshold = undefined) => {
	const { UpscaleAtlasCPU, CreateLumaTable, CreateColorTable } = await import('/src/ambermoon/Ambermoon.Renderer.OpenGL/PixelArtUpscaler.js?t=' + Date.now());
	const rv = host.renderView;
	const texture = rv.GetLayer(layer).Texture;
	texture.Upscale(rv.hdUpscaler);
	const gpu = H.readTexture(texture.Index, texture.Width, texture.Height);
	const pal = rv.hdUpscaler.palette;
	const palRGBA = H.readTexture(pal.Index, pal.Width, pal.Height);
	const regions = texture.Regions.map(r => ({ ...r, lumaTable: CreateLumaTable(palRGBA.subarray(r.palette * 128, r.palette * 128 + 128), (r.flags & 4) !== 0), colorTable: CreateColorTable(palRGBA.subarray(r.palette * 128, r.palette * 128 + 128), (r.flags & 4) !== 0) }));
	const t0 = performance.now();
	const cpu = UpscaleAtlasCPU(texture.SourceData, texture.SourceWidth, texture.SourceHeight, regions, texture.Factor, noiseThreshold ?? rv.hdUpscaler.NoiseThreshold, rv.hdUpscaler.Algorithm);
	const cpuMs = performance.now() - t0;
	let diff = 0;
	for (let i = 0; i < cpu.length; ++i)
		if (cpu[i] !== gpu[i * 4]) diff++;
	return { pixels: cpu.length, diff, cpuMs };
};

/**
 * Saves a part of a layer's atlas (original and upscaled, side by side, with palette colors) as PNG.
 * x, y, w, h in original pixels, zoom = output pixels per upscaled texel.
 */
H.dumpAtlas = async (layer, x, y, w, h, paletteRow, name, zoom = 2, cpuFactor = 0, noiseThreshold = undefined) => {
	const rv = host.renderView;
	const texture = rv.GetLayer(layer).Texture;
	texture.Upscale(rv.hdUpscaler);
	const f = texture.Factor;
	let hd = H.readTexture(texture.Index, texture.Width, texture.Height);
	const pal = rv.hdUpscaler.palette;
	const palRGBA = H.readTexture(pal.Index, pal.Width, pal.Height);
	if (cpuFactor) {
		// CPU reference of the given factor (e.g. 2), nearest neighbor scaled to the texture factor
		const { UpscaleAtlasCPU, CreateLumaTable, CreateColorTable } = await import('/src/ambermoon/Ambermoon.Renderer.OpenGL/PixelArtUpscaler.js?t=' + Date.now());
		const regions = texture.Regions.filter(r => r.x < x + w && r.x + r.width > x && r.y < y + h && r.y + r.height > y)
			.map(r => ({ ...r, lumaTable: CreateLumaTable(palRGBA.subarray(r.palette * 128, r.palette * 128 + 128), (r.flags & 4) !== 0), colorTable: CreateColorTable(palRGBA.subarray(r.palette * 128, r.palette * 128 + 128), (r.flags & 4) !== 0) }));
		const scaled = UpscaleAtlasCPU(texture.SourceData, texture.SourceWidth, texture.SourceHeight, regions, cpuFactor, noiseThreshold, rv.hdUpscaler.Algorithm);
		const k = f / cpuFactor;
		hd = new Uint8Array(texture.Width * texture.Height * 4);
		for (let yy = y * f; yy < (y + h) * f; yy++)
			for (let xx = x * f; xx < (x + w) * f; xx++)
				hd[(yy * texture.Width + xx) * 4] = scaled[Math.floor(yy / k) * texture.SourceWidth * cpuFactor + Math.floor(xx / k)];
	}
	const c = document.createElement('canvas');
	c.width = (w * f * zoom) * 2 + 8;
	c.height = h * f * zoom;
	const ctx = c.getContext('2d');
	ctx.fillStyle = '#f0f';
	ctx.fillRect(0, 0, c.width, c.height);
	const color = i => {
		const k = paletteRow * 128 + (i >= 32 ? 0 : i) * 4;
		return i === 0 ? 'rgb(255,0,255)' : `rgb(${palRGBA[k]},${palRGBA[k + 1]},${palRGBA[k + 2]})`;
	};
	for (let yy = 0; yy < h; yy++)
		for (let xx = 0; xx < w; xx++) {
			ctx.fillStyle = color(texture.SourceData[(y + yy) * texture.SourceWidth + x + xx]);
			ctx.fillRect(xx * f * zoom, yy * f * zoom, f * zoom, f * zoom);
		}
	const ox = w * f * zoom + 8;
	for (let yy = 0; yy < h * f; yy++)
		for (let xx = 0; xx < w * f; xx++) {
			ctx.fillStyle = color(hd[((y * f + yy) * texture.Width + x * f + xx) * 4]);
			ctx.fillRect(ox + xx * zoom, yy * zoom, zoom, zoom);
		}
	await fetch('/__shot?name=' + encodeURIComponent(name), { method: 'POST', body: c.toDataURL('image/png') });
	return [c.width, c.height];
};

/** Changes the noise threshold of the upscaler and upscales all HD textures again (0 = no noise detection) */
H.noise = async (threshold, algorithm = null) => {
	const rv = host.renderView;
	rv.hdUpscaler.NoiseThreshold = threshold;
	if (algorithm)
		rv.hdUpscaler.Algorithm = algorithm;
	for (const texture of [...rv.hdTextures])
		texture.ReleaseHD();
	rv.hdTextures.clear();
	await H.sleep(300);
	return H.stats();
};

H.shot = async name => {
	const c = document.getElementById("game");
	if (H.wanted && (c.width !== H.wanted[0] || c.height !== H.wanted[1]))
		await H.size(...H.wanted);
	return G.shot(name);
};
H.crop = (outName, names, x, y, w, h, scale = 3) => G.crop(outName, names, x, y, w, h, scale);

export default H;
