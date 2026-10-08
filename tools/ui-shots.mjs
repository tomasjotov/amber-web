// Screenshots of the game pages at different window sizes / pixel ratios with headless Chrome (CDP).
// Needs the dev server (node tools/serve.mjs 8090) and Chrome. Saves tools/out/ui_*.png.
//   node tools/ui-shots.mjs [filter]
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const outDir = join(root, 'tools', 'out');
mkdirSync(outDir, { recursive: true });
const base = process.env.AMBER_URL ?? 'http://localhost:8090/';
const filter = process.argv[2] ?? '';
const chromePaths = [
	process.env.CHROME,
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/usr/bin/google-chrome', '/usr/bin/chromium',
	'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const chromePath = chromePaths.find(p => existsSync(p));
if (!chromePath)
	throw new Error('Chrome not found (set CHROME)');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), 'amber-ui-'));
const chrome = spawn(chromePath, [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--headless=new',
	'--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--mute-audio', '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });

let target = null;
for (let i = 0; i < 50 && !target; i++) {
	await sleep(200);
	try {
		const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
		target = list.find(t => t.type === 'page');
	} catch {
		// not ready yet
	}
}
if (!target)
	throw new Error('Chrome did not start');

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let nextId = 1;
const pending = new Map();
ws.onmessage = e => {
	const message = JSON.parse(e.data);
	if (message.id && pending.has(message.id)) {
		const { resolve, reject } = pending.get(message.id);
		pending.delete(message.id);
		message.error ? reject(new Error(message.error.message)) : resolve(message.result);
	} else if (message.method === 'Runtime.exceptionThrown')
		console.log('  page exception:', message.params.exceptionDetails?.exception?.description?.split('\n')[0]);
	else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error')
		console.log('  console.error:', message.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 300));
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
	const id = nextId++;
	pending.set(id, { resolve, reject });
	ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => {
	const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
	if (result.exceptionDetails)
		throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
	return result.result.value;
};
const waitFor = async (expression, timeout = 60000) => {
	const start = Date.now();
	while (Date.now() - start < timeout) {
		try {
			if (await evaluate(expression))
				return true;
		} catch {
			// page navigating
		}
		await sleep(250);
	}
	throw new Error(`timeout: ${expression}`);
};
const shot = async name => {
	const { data } = await send('Page.captureScreenshot', { format: 'png' });
	writeFileSync(join(outDir, `ui_${name}.png`), Buffer.from(data, 'base64'));
	console.log(`  saved tools/out/ui_${name}.png`);
};
const mouse = async (type, x, y, button = 'left') =>
	send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : button, clickCount: type === 'mouseMoved' ? 0 : 1 });
const click = async (x, y) => {
	await mouse('mouseMoved', x, y);
	await sleep(50);
	await mouse('mousePressed', x, y);
	await sleep(80);
	await mouse('mouseReleased', x, y);
};

await send('Page.enable');
await send('Runtime.enable');

async function open(page, { width, height, dpr = 1, mobile = false, settings = null, throttle = false }) {
	await send('Network.enable');
	await send('Network.emulateNetworkConditions', { offline: false, latency: throttle ? 40 : 0, downloadThroughput: throttle ? 1.5e6 : -1, uploadThroughput: -1 });
	await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile, screenWidth: width, screenHeight: height });
	await send('Emulation.setTouchEmulationEnabled', { enabled: mobile });
	await send('Page.navigate', { url: base + 'index.html' });
	await waitFor('document.readyState === "complete"');
	await evaluate(`localStorage.setItem('amber-web-mute', '1'); localStorage.setItem('amber-web-ui', ${JSON.stringify(JSON.stringify(settings ?? {}))}); true`);
	await send('Page.navigate', { url: base + page });
}

const ready = 'document.documentElement.classList.contains("aw-ready") && !document.querySelector(".aw-loader")';
const mainMenu = `${ready} && !!window.host?.mainMenu`;
/** game rect in CSS pixels */
const gameRect = () => evaluate('(r => ({ x: r.x, y: r.y, width: r.width, height: r.height }))(document.getElementById("game").getBoundingClientRect())');
const canvasInfo = () => evaluate('({ w: document.getElementById("game").width, h: document.getElementById("game").height, dpr: devicePixelRatio, area: (a => [a.X, a.Y, a.Width, a.Height])(host.renderView.RenderScreenArea) })');

/** clicks at a position given in game coordinates (320x200) */
const clickGame = async (gx, gy) => {
	const r = await gameRect();
	await click(r.x + (gx + 0.5) * r.width / 320, r.y + (gy + 0.5) * r.height / 200);
};
const inputTest = async name => {
	// main menu: "START NEW QUEST" is the second line (game y ~ 92)
	await clickGame(160, 92);
	await waitFor('!!window.ambermoonGame', 20000);
	await sleep(2500);
	await shot(name + '_create');
	// character creation: OK button
	await clickGame(256, 116);
	await sleep(4000);
	const state = await evaluate('({ mainMenu: !!host.mainMenu, mapName: window.ambermoonGame?.Map?.Name ?? null, partyX: window.ambermoonGame?.RenderPlayer?.Position?.X ?? null })');
	console.log('  after OK:', JSON.stringify(state));
	// mouse over the frame/background: the game cursor is hidden, the corner controls appear
	await mouse('mouseMoved', 20, 500);
	await sleep(600);
	const hidden = await evaluate('({ cursorVisible: host.cursor.Visible, controls: document.documentElement.classList.contains("aw-ui-visible") })');
	console.log('  pointer outside:', JSON.stringify(hidden));
};

const clickSelector = async selector => {
	const r = await evaluate(`(r => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 }))(document.querySelector('${selector}').getBoundingClientRect())`);
	await click(r.x, r.y);
	await sleep(400);
};
const settingsTest = async () => {
	await mouse('mouseMoved', 1880, 30);
	await sleep(400);
	await clickSelector('.aw-gear');
	const results = [];
	for (const [key, value] of [['scaling', 'integer'], ['frame', 'thin'], ['frame', 'none'], ['background', 'dusk'], ['background', 'black'], ['scaling', 'fit'], ['frame', 'gilded'], ['background', 'ambient']]) {
		await clickSelector(`.aw-segmented button[data-value="${value}"]`);
		await sleep(300);
		const info = await canvasInfo();
		const rect = await gameRect();
		const stored = await evaluate('localStorage.getItem("amber-web-ui")');
		results.push(`${key}=${value}: canvas ${info.w}x${info.h} area ${info.area.join(',')} css ${rect.width}x${rect.height}@${rect.x},${rect.y} stored ${stored}`);
	}
	await clickSelector('.aw-panel .aw-wide'); // fullscreen button
	await sleep(500);
	results.push('fullscreen after button: ' + await evaluate('!!document.fullscreenElement'));
	await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'F11', code: 'F11', windowsVirtualKeyCode: 122 });
	await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'F11', code: 'F11', windowsVirtualKeyCode: 122 });
	await sleep(500);
	results.push('fullscreen after F11: ' + await evaluate('!!document.fullscreenElement'));
	await clickSelector('.aw-toggle'); // vignette off
	results.push('vignette class: ' + await evaluate('document.documentElement.classList.contains("aw-vignette-on")'));
	await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
	await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
	await sleep(300);
	results.push('panel open after Escape: ' + await evaluate('!document.querySelector(".aw-panel").hidden') + ', main menu still open: ' + await evaluate('!!host.mainMenu'));
	for (const line of results)
		console.log('  ' + line);
};

const scenarios = [
	{ name: 'am_error', page: 'ambermoon.html?skipintro&mute', width: 1920, height: 1080, wait: mainMenu, action: async () => {
		await evaluate("host.onError(new Error('Example runtime error (screenshot test)')); true");
		await sleep(400);
	} },
	{ name: 'am_settings_runtime', page: 'ambermoon.html?skipintro&mute', width: 1920, height: 1080, wait: mainMenu, action: settingsTest },
	{ name: 'am_input_1080p', page: 'ambermoon.html?skipintro&mute', width: 1920, height: 1080, wait: mainMenu, action: () => inputTest('am_input_1080p') },
	{ name: 'am_input_dpr15_integer', page: 'ambermoon.html?skipintro&mute', width: 1280, height: 720, dpr: 1.5, settings: { scaling: 'integer' }, wait: mainMenu, action: () => inputTest('am_input_dpr15_integer') },
	{ name: 'am_1080p_menu', page: 'ambermoon.html?skipintro&mute', width: 1920, height: 1080, wait: mainMenu,
		crops: [{ name: 'corner', clip: { x: 100, y: 0, width: 260, height: 160 } }, { name: 'edge', clip: { x: 820, y: 0, width: 280, height: 120 } }] },
	{ name: 'am_loading', page: 'ambermoon.html?skipintro&mute', width: 1920, height: 1080, throttle: true, wait: 'parseFloat(document.querySelector(".aw-progress-fill")?.style.width) > 35', delay: 0 },
	{ name: 'am_1080p_settings', page: 'ambermoon.html?skipintro&mute', width: 1920, height: 1080, wait: mainMenu, action: async () => {
		await mouse('mouseMoved', 1880, 30);
		await sleep(400);
		await click(1890, 27);
		await sleep(500);
	} },
	{ name: 'am_1080p_newgame', page: 'ambermoon.html?skipintro&newgame&mute', width: 1920, height: 1080, wait: `${ready} && !!window.ambermoonGame`, delay: 2500 },
	{ name: 'am_1440p_integer', page: 'ambermoon.html?skipintro&mute', width: 2560, height: 1440, wait: mainMenu, settings: { scaling: 'integer' } },
	{ name: 'am_1366_thin', page: 'ambermoon.html?skipintro&mute', width: 1366, height: 768, wait: mainMenu, settings: { frame: 'thin' } },
	{ name: 'am_1080p_dpr15', page: 'ambermoon.html?skipintro&mute', width: 1280, height: 720, dpr: 1.5, wait: mainMenu },
	{ name: 'am_1080p_dpr2_integer', page: 'ambermoon.html?skipintro&mute', width: 960, height: 540, dpr: 2, wait: mainMenu, settings: { scaling: 'integer' } },
	{ name: 'am_mobile_portrait', page: 'ambermoon.html?skipintro&mute', width: 390, height: 844, dpr: 3, mobile: true, wait: mainMenu },
	{ name: 'am_1610_noframe', page: 'ambermoon.html?skipintro&mute', width: 1680, height: 1050, wait: mainMenu, settings: { frame: 'none', background: 'dusk' } },
	{ name: 'as_1080p_menu', page: 'amberstar-am.html?mute', width: 1920, height: 1080, wait: mainMenu },
	{ name: 'asc_1080p', page: 'amberstar/index.html?mute', width: 1920, height: 1080, wait: '!!document.querySelector("#game canvas") && document.documentElement.classList.contains("aw-ready")', delay: 3000 },
	{ name: 'asc_loading', page: 'amberstar/index.html?mute', width: 1920, height: 1080, throttle: true, wait: '!!document.querySelector(".aw-loader")', delay: 800 },
	{ name: 'asc_mobile_portrait', page: 'amberstar/index.html?mute', width: 390, height: 844, dpr: 3, mobile: true, wait: '!!document.querySelector("#game canvas") && document.documentElement.classList.contains("aw-ready")', delay: 3000 },
];

const report = [];
for (const s of scenarios) {
	if (filter && !s.name.includes(filter))
		continue;
	console.log(s.name);
	try {
		await open(s.page, s);
		await waitFor(s.wait, 90000);
		await sleep(s.delay ?? 1800);
		if (s.action)
			await s.action();
		const info = s.page.startsWith('amberstar/') ? null : await canvasInfo().catch(() => null);
		const rect = await gameRect().catch(() => null);
		report.push({ name: s.name, rect, info });
		console.log('  game rect', JSON.stringify(rect), 'canvas', JSON.stringify(info));
		await shot(s.name);
		for (const crop of s.crops ?? []) {
			const { data } = await send('Page.captureScreenshot', { format: 'png', clip: { ...crop.clip, scale: crop.scale ?? 3 } });
			writeFileSync(join(outDir, `ui_${s.name}_${crop.name}.png`), Buffer.from(data, 'base64'));
			console.log(`  saved tools/out/ui_${s.name}_${crop.name}.png`);
		}
	} catch (e) {
		console.log('  FAILED', e.message);
	}
}

ws.close();
chrome.kill();
await sleep(500);
try {
	rmSync(profile, { recursive: true, force: true });
} catch {
	// still locked
}
