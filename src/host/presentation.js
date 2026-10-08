// Presentation around the game canvas: sizing (fit / pixel-perfect integer scaling), ambient background
// ("Ambilight" glow from the game image), vignette, ornamental frame, fullscreen and a small settings overlay.
// Nothing here ever draws over game pixels: the game canvas is sized exactly to the 16:10 game area
// (device-pixel exact, so the renderer needs no letterbox) and everything else lives outside of it.

const SettingsKey = 'amber-web-ui';
const MuteKey = 'amber-web-mute';

export const DefaultSettings = Object.freeze({
	background: 'ambient', // ambient | dusk | black
	frame: 'gilded', // gilded | thin | none
	scaling: 'fit', // fit | integer
	vignette: true,
});

const Choices = {
	background: [['ambient', 'Ambient'], ['dusk', 'Dusk'], ['black', 'Black']],
	frame: [['gilded', 'Gilded'], ['thin', 'Thin'], ['none', 'None']],
	scaling: [['fit', 'Fit'], ['integer', 'Pixel-perfect']],
};

export function loadSettings() {
	try {
		const stored = JSON.parse(localStorage.getItem(SettingsKey) ?? '{}');
		const settings = { ...DefaultSettings };
		for (const key of Object.keys(DefaultSettings)) {
			const value = stored?.[key];
			if (value === undefined)
				continue;
			if (Choices[key] ? Choices[key].some(([v]) => v === value) : typeof value === typeof DefaultSettings[key])
				settings[key] = value;
		}
		return settings;
	} catch {
		return { ...DefaultSettings };
	}
}

function saveSettings(settings) {
	try {
		localStorage.setItem(SettingsKey, JSON.stringify(settings));
	} catch {
		// private mode etc.
	}
}

export function isMuted() {
	try {
		return new URLSearchParams(location.search).has('mute') || localStorage.getItem(MuteKey) === '1';
	} catch {
		return false;
	}
}

function storeMuted(muted) {
	try {
		if (muted)
			localStorage.setItem(MuteKey, '1');
		else
			localStorage.removeItem(MuteKey);
	} catch {
		// ignore
	}
}

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

const el = (tag, className, attributes = {}) => {
	const e = document.createElement(tag);
	if (className)
		e.className = className;
	for (const [k, v] of Object.entries(attributes)) {
		if (k === 'text')
			e.textContent = v;
		else if (k === 'html')
			e.innerHTML = v;
		else
			e.setAttribute(k, v);
	}
	return e;
};

const GearIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L14.9 3h-4l-.4 2.9a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.4 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1l.4 2.9h4l.4-2.9c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5zM12.9 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" transform="translate(-.9 0)"/></svg>';
const FullscreenIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
const ExitFullscreenIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';

/**
 * options:
 *  - canvas: the game canvas
 *  - managed (default true): the presentation positions and sizes the canvas (Ambermoon host).
 *    false: the canvas is sized by someone else (Phaser) inside options.container; the presentation only
 *    insets the container for the frame and decorates around the canvas.
 *  - container: (unmanaged) element whose inset reserves the frame space
 *  - virtualWidth/virtualHeight: 320x200
 *  - backHref: link back to the game selection
 *  - onMuteChanged(muted)
 *  - sampleSource: () => canvas|null (unmanaged: polled for the ambient glow; managed: call sample(canvas))
 */
export class Presentation {
	constructor(options) {
		this.options = options;
		this.canvas = options.canvas ?? null;
		this.managed = options.managed !== false;
		this.virtualWidth = options.virtualWidth ?? 320;
		this.virtualHeight = options.virtualHeight ?? 200;
		this.settings = loadSettings();
		this.layout = null;
		this.lastSample = 0;
		this.hasSample = false;
		this.uiTimer = 0;
		this.panelOpen = false;
		this.ready = false;

		const root = this.root = document.documentElement;
		root.classList.add('aw-root');
		const stage = this.stage = el('div', 'aw-stage');
		this.ambient = el('canvas', 'aw-ambient');
		this.vignette = el('div', 'aw-vignette');
		this.frameCanvas = el('canvas', 'aw-frame');
		stage.append(this.ambient, this.vignette, this.frameCanvas);
		document.body.prepend(stage);
		this.ambientContext = this.ambient.getContext('2d');
		this.frameContext = this.frameCanvas.getContext('2d');
		// The sample canvas is big enough to be GPU backed in Chrome (drawImage from WebGL stays on the GPU).
		this.sampleCanvas = el('canvas');
		this.sampleCanvas.width = 256;
		this.sampleCanvas.height = 160;
		this.sampleContext = this.sampleCanvas.getContext('2d');

		if (this.canvas)
			this.attachCanvas(this.canvas);

		this.#buildControls();
		this.#applySettings();

		const relayout = () => this.update();
		window.addEventListener('resize', relayout);
		document.addEventListener('fullscreenchange', () => {
			this.#updateFullscreenButtons();
			relayout();
		});
		this.#watchDevicePixelRatio(relayout);
		// F11 / Alt+Enter: browser fullscreen (capture phase: runs before the game's key handlers)
		window.addEventListener('keydown', e => {
			if ((e.code === 'F11' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) || (e.code === 'Enter' && e.altKey)) {
				e.preventDefault();
				e.stopImmediatePropagation();
				if (!e.repeat)
					this.toggleFullscreen();
			} else if (e.code === 'Escape' && this.panelOpen) {
				e.preventDefault();
				e.stopImmediatePropagation();
				this.setPanelOpen(false);
			}
		}, true);
		window.addEventListener('keyup', e => {
			if (e.code === 'F11')
				e.stopImmediatePropagation();
		}, true);
		window.addEventListener('mousemove', e => this.#onPointerMove(e), { passive: true });
		window.addEventListener('pointerdown', e => {
			if (this.panelOpen && !this.panel.contains(e.target) && !this.gear.contains(e.target))
				this.setPanelOpen(false);
		}, true);

		if (!this.managed && options.sampleSource) {
			const poll = () => {
				const source = options.sampleSource();
				if (source)
					this.sample(source);
				requestAnimationFrame(poll);
			};
			requestAnimationFrame(poll);
		}
		this.update();
	}

	attachCanvas(canvas) {
		this.canvas = canvas;
		canvas.classList.add(this.managed ? 'aw-game' : 'aw-game-external');
		if (!this.managed) {
			// Phaser resizes its canvas itself: follow it
			new ResizeObserver(() => this.#scheduleDecor()).observe(canvas);
		}
		this.update();
	}

	/** Shows the game (fade-in) and enables the settings overlay. */
	reveal() {
		this.ready = true;
		this.root.classList.add('aw-ready');
		this.#showUi();
	}

	// --- layout ---

	#watchDevicePixelRatio(callback) {
		let media = null;
		const listen = () => {
			media?.removeEventListener('change', onChange);
			media = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
			media.addEventListener('change', onChange);
		};
		const onChange = () => {
			listen();
			callback();
		};
		listen();
	}

	/** Frame thickness in device pixels for the given window size (device pixels). */
	#frameThickness(width, height, dpr) {
		const min = Math.min(width, height);
		switch (this.settings.frame) {
			case 'gilded':
				return Math.round(clamp(min * 0.021, 7 * dpr, 34 * dpr));
			case 'thin':
				return Math.round(clamp(min * 0.005, 3 * dpr, 7 * dpr));
			default:
				return 0;
		}
	}

	/** Computes the game rectangle in device pixels. */
	computeLayout() {
		const dpr = window.devicePixelRatio || 1;
		const width = Math.max(1, Math.round(window.innerWidth * dpr));
		const height = Math.max(1, Math.round(window.innerHeight * dpr));
		const vw = this.virtualWidth, vh = this.virtualHeight;
		const desired = this.#frameThickness(width, height, dpr);
		// the gilded corner ornaments reach a bit beyond the frame: keep them inside the window
		const overhang = this.settings.frame === 'gilded' ? 0.36 : 0;
		const reserveFor = t => t + Math.ceil(t * overhang);
		let gameWidth, gameHeight, thickness = desired, scale = 0;

		if (this.settings.scaling === 'integer' && this.managed) {
			scale = Math.floor(Math.min(width / vw, height / vh));
			if (scale >= 1) {
				gameWidth = vw * scale;
				gameHeight = vh * scale;
				const slack = Math.floor(Math.min(width - gameWidth, height - gameHeight) / 2);
				thickness = Math.min(desired, Math.floor(slack / (1 + overhang)));
				if (thickness < 3 * dpr)
					thickness = 0;
			}
		}
		if (!gameWidth) {
			// Fit: keep the exact 16:10 ratio in device pixels (multiples of 8x5) so the renderer needs no letterbox.
			scale = 0;
			const g = this.#gcdRatio(vw, vh);
			const reserve = reserveFor(thickness);
			const k = Math.max(1, Math.min(Math.floor((width - 2 * reserve) / g.w), Math.floor((height - 2 * reserve) / g.h)));
			gameWidth = g.w * k;
			gameHeight = g.h * k;
			if (gameWidth > width || gameHeight > height)
				thickness = 0;
		}
		const x = Math.floor((width - gameWidth) / 2);
		const y = Math.floor((height - gameHeight) / 2);
		return { dpr, width, height, x, y, gameWidth, gameHeight, thickness, reserve: thickness ? reserveFor(thickness) : 0, scale };
	}

	#gcdRatio(a, b) {
		const gcd = (p, q) => q ? gcd(q, p % q) : p;
		const d = gcd(a, b);
		return { w: a / d, h: b / d };
	}

	/** Recomputes the layout and redraws the decoration (called on resize, settings changes etc.). */
	update() {
		const layout = this.layout = this.computeLayout();
		const { dpr } = layout;
		if (this.managed && this.canvas) {
			const style = this.canvas.style;
			style.left = `${layout.x / dpr}px`;
			style.top = `${layout.y / dpr}px`;
			style.width = `${layout.gameWidth / dpr}px`;
			style.height = `${layout.gameHeight / dpr}px`;
		} else if (!this.managed && this.options.container) {
			this.options.container.style.inset = `${layout.reserve / dpr}px`;
		}
		// ambient canvas resolution: small, the browser scales it up smoothly
		const longSide = 192;
		const aspect = layout.width / layout.height;
		const aw = aspect >= 1 ? longSide : Math.max(16, Math.round(longSide * aspect));
		const ah = aspect >= 1 ? Math.max(16, Math.round(longSide / aspect)) : longSide;
		if (this.ambient.width !== aw || this.ambient.height !== ah) {
			this.ambient.width = aw;
			this.ambient.height = ah;
			if (this.hasSample)
				this.#drawAmbient();
		}
		this.#scheduleDecor();
	}

	/** Game rectangle in device pixels (unmanaged: measured from the canvas). */
	#gameRect() {
		const layout = this.layout;
		if (this.managed || !this.canvas)
			return { x: layout.x, y: layout.y, width: layout.gameWidth, height: layout.gameHeight };
		const r = this.canvas.getBoundingClientRect();
		const dpr = layout.dpr;
		return { x: Math.round(r.left * dpr), y: Math.round(r.top * dpr), width: Math.round(r.width * dpr), height: Math.round(r.height * dpr) };
	}

	#scheduleDecor() {
		if (this.decorScheduled)
			return;
		this.decorScheduled = true;
		requestAnimationFrame(() => {
			this.decorScheduled = false;
			this.#drawDecor();
		});
	}

	// --- frame ---

	#drawDecor() {
		const layout = this.layout ?? this.computeLayout();
		const canvas = this.frameCanvas;
		const ctx = this.frameContext;
		const rect = this.#gameRect();
		const t = this.managed ? layout.thickness : Math.min(layout.thickness, Math.max(0, Math.min(rect.x, rect.y, layout.width - rect.x - rect.width, layout.height - rect.y - rect.height)));
		this.gameRectCss = { x: rect.x / layout.dpr, y: rect.y / layout.dpr, width: rect.width / layout.dpr, height: rect.height / layout.dpr };
		if (t <= 0 || rect.width <= 0 || this.settings.frame === 'none') {
			canvas.width = canvas.height = 1;
			canvas.style.display = 'none';
			return;
		}
		// The frame canvas only covers the frame plus room for its shadow (not the whole window).
		const pad = Math.ceil(t * 2.5);
		const left = Math.max(0, rect.x - t - pad), top = Math.max(0, rect.y - t - pad);
		const right = Math.min(layout.width, rect.x + rect.width + t + pad), bottom = Math.min(layout.height, rect.y + rect.height + t + pad);
		canvas.style.display = '';
		canvas.width = right - left;
		canvas.height = bottom - top;
		canvas.style.left = `${left / layout.dpr}px`;
		canvas.style.top = `${top / layout.dpr}px`;
		canvas.style.width = `${(right - left) / layout.dpr}px`;
		canvas.style.height = `${(bottom - top) / layout.dpr}px`;
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		const inner = { x: rect.x - left, y: rect.y - top, width: rect.width, height: rect.height };
		if (this.settings.frame === 'gilded')
			drawGildedFrame(ctx, inner, t);
		else
			drawThinFrame(ctx, inner, t);
		// never cover game pixels
		ctx.clearRect(inner.x, inner.y, inner.width, inner.height);
	}

	// --- ambient glow ---

	/** Called after the game rendered a frame (same task, so the WebGL drawing buffer is still valid). */
	sample(source) {
		if (this.settings.background !== 'ambient' || document.hidden)
			return;
		const now = performance.now();
		if (now - this.lastSample < 66)
			return;
		this.lastSample = now;
		try {
			const ctx = this.sampleContext;
			ctx.globalAlpha = this.hasSample ? 0.3 : 1;
			ctx.drawImage(source, 0, 0, this.sampleCanvas.width, this.sampleCanvas.height);
			this.hasSample = true;
			this.#drawAmbient();
		} catch {
			// e.g. canvas not ready
		}
	}

	#drawAmbient() {
		const ctx = this.ambientContext;
		const w = this.ambient.width, h = this.ambient.height;
		const layout = this.layout;
		const rect = this.gameRectCss && layout ? this.gameRectCss : null;
		const blur = Math.max(2, Math.round(Math.min(w, h) / 14));
		ctx.save();
		ctx.globalAlpha = 1;
		ctx.filter = `blur(${blur}px)`;
		// background: the game image stretched to the whole window, then the game image at its real
		// place, slightly enlarged, so the glow continues the colors at the game's edges
		ctx.drawImage(this.sampleCanvas, -w * 0.1, -h * 0.1, w * 1.2, h * 1.2);
		if (rect) {
			const sx = w / (layout.width / layout.dpr), sy = h / (layout.height / layout.dpr);
			const grow = 1.12;
			const gw = rect.width * sx * grow, gh = rect.height * sy * grow;
			const cx = (rect.x + rect.width / 2) * sx, cy = (rect.y + rect.height / 2) * sy;
			ctx.drawImage(this.sampleCanvas, cx - gw / 2, cy - gh / 2, gw, gh);
		}
		ctx.restore();
	}

	// --- settings ---

	set(key, value) {
		if (this.settings[key] === value)
			return;
		this.settings[key] = value;
		saveSettings(this.settings);
		this.#applySettings();
		this.update();
	}

	#applySettings() {
		const s = this.settings;
		const root = this.root;
		root.dataset.awBackground = s.background;
		root.dataset.awFrame = s.frame;
		root.classList.toggle('aw-vignette-on', !!s.vignette);
		if (s.background !== 'ambient') {
			this.hasSample = false;
			this.ambientContext.clearRect(0, 0, this.ambient.width, this.ambient.height);
		}
		for (const [key, group] of Object.entries(this.choiceGroups ?? {})) {
			for (const button of group.querySelectorAll('button'))
				button.setAttribute('aria-pressed', String(button.dataset.value === String(s[key])));
		}
		this.vignetteToggle?.setAttribute('aria-pressed', String(!!s.vignette));
		this.muteToggle?.setAttribute('aria-pressed', String(!isMuted()));
	}

	get fullscreenAvailable() {
		return !!(document.fullscreenEnabled && document.documentElement.requestFullscreen);
	}

	async toggleFullscreen() {
		try {
			if (document.fullscreenElement)
				await document.exitFullscreen();
			else if (this.fullscreenAvailable)
				await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
		} catch (e) {
			console.warn('Fullscreen not available', e);
		}
		this.canvas?.focus?.();
	}

	#updateFullscreenButtons() {
		const on = !!document.fullscreenElement;
		for (const button of [this.fullscreenButton, this.panelFullscreenButton]) {
			if (!button)
				continue;
			button.setAttribute('aria-pressed', String(on));
			button.title = on ? 'Exit fullscreen (F11)' : 'Fullscreen (F11)';
		}
		if (this.fullscreenButton)
			this.fullscreenButton.innerHTML = on ? ExitFullscreenIcon : FullscreenIcon;
		if (this.panelFullscreenButton)
			this.panelFullscreenButton.textContent = on ? 'Exit fullscreen' : 'Enter fullscreen';
	}

	setPanelOpen(open) {
		this.panelOpen = open;
		this.root.classList.toggle('aw-panel-open', open);
		this.gear.setAttribute('aria-expanded', String(open));
		this.panel.hidden = !open;
		if (open)
			this.panel.querySelector('button')?.focus({ preventScroll: true });
		else {
			this.canvas?.focus?.({ preventScroll: true });
			this.#showUi();
		}
	}

	#buildControls() {
		const cluster = this.cluster = el('div', 'aw-controls');
		const back = el('a', 'aw-pill aw-back', { href: this.options.backHref ?? 'index.html', title: 'Back to the game selection', html: '<span aria-hidden="true">‹</span> Games' });
		const fullscreen = this.fullscreenButton = el('button', 'aw-icon-button', { type: 'button', 'aria-label': 'Fullscreen', title: 'Fullscreen (F11)', html: FullscreenIcon });
		fullscreen.addEventListener('click', () => this.toggleFullscreen());
		if (!this.fullscreenAvailable)
			fullscreen.hidden = true;
		const gear = this.gear = el('button', 'aw-icon-button aw-gear', { type: 'button', 'aria-label': 'Display settings', title: 'Display settings', 'aria-expanded': 'false', html: GearIcon });
		gear.addEventListener('click', () => this.setPanelOpen(!this.panelOpen));
		cluster.append(back, fullscreen, gear);

		const panel = this.panel = el('div', 'aw-panel', { role: 'dialog', 'aria-label': 'Display settings' });
		panel.hidden = true;
		panel.append(el('h2', '', { text: 'Display' }));
		this.choiceGroups = {};
		const addRow = (label, control) => {
			const row = el('div', 'aw-row');
			row.append(el('span', 'aw-label', { text: label }), control);
			panel.append(row);
		};
		const addChoices = (key, label) => {
			const group = el('div', 'aw-segmented', { role: 'group', 'aria-label': label });
			for (const [value, text] of Choices[key]) {
				const button = el('button', '', { type: 'button', 'data-value': value, text });
				button.addEventListener('click', () => this.set(key, value));
				group.append(button);
			}
			this.choiceGroups[key] = group;
			addRow(label, group);
		};
		const toggle = (onClick, onText = 'On', offText = 'Off') => {
			const button = el('button', 'aw-toggle', { type: 'button' });
			button.append(el('span', 'aw-on', { text: onText }), el('span', 'aw-off', { text: offText }));
			button.addEventListener('click', onClick);
			return button;
		};
		addChoices('background', 'Background');
		addChoices('frame', 'Frame');
		if (this.managed)
			addChoices('scaling', 'Scaling');
		this.vignetteToggle = toggle(() => this.set('vignette', !this.settings.vignette));
		addRow('Vignette', this.vignetteToggle);
		this.muteToggle = toggle(() => {
			const muted = !isMuted();
			storeMuted(muted);
			this.options.onMuteChanged?.(muted);
			this.#applySettings();
		});
		addRow('Sound', this.muteToggle);
		if (this.fullscreenAvailable) {
			const button = this.panelFullscreenButton = el('button', 'aw-wide', { type: 'button', text: 'Enter fullscreen' });
			button.addEventListener('click', () => this.toggleFullscreen());
			addRow('Screen', button);
		}
		panel.append(el('p', 'aw-hint', { html: this.options.hint ?? '<kbd>F11</kbd> fullscreen &middot; <kbd>F8</kbd>&ndash;<kbd>F10</kbd> graphic filters &middot; <kbd>Ctrl</kbd>+<kbd>M</kbd> music' }));
		const footer = el('div', 'aw-panel-footer');
		footer.append(el('a', '', { href: this.options.backHref ?? 'index.html', text: '‹ Game selection' }));
		panel.append(footer);

		document.body.append(cluster, panel);
		this.#updateFullscreenButtons();
		cluster.addEventListener('mouseenter', () => { this.overControls = true; this.#showUi(); });
		cluster.addEventListener('mouseleave', () => { this.overControls = false; this.#showUi(); });
	}

	#showUi() {
		if (!this.ready)
			return;
		this.root.classList.add('aw-ui-visible');
		clearTimeout(this.uiTimer);
		this.uiTimer = setTimeout(() => {
			if (!this.panelOpen && !this.overControls)
				this.root.classList.remove('aw-ui-visible');
		}, 2200);
	}

	#onPointerMove(e) {
		if (!this.ready)
			return;
		const nearCorner = e.clientX > window.innerWidth - 240 && e.clientY < 120;
		const r = this.gameRectCss;
		const overGame = r && e.clientX >= r.x && e.clientX < r.x + r.width && e.clientY >= r.y && e.clientY < r.y + r.height;
		if (nearCorner || !overGame)
			this.#showUi();
	}
}

// --- frame drawing (device pixels) ---

function ringPath(ctx, outer, inner) {
	ctx.beginPath();
	ctx.rect(outer.x, outer.y, outer.width, outer.height);
	ctx.rect(inner.x, inner.y, inner.width, inner.height);
}

/**
 * Draws one band of the frame between the distances d0 and d1 (from the outer edge) as four mitered
 * trapezoids. stops: [[offset, color], ...] from outside to inside. Light comes from the top left.
 */
function band(ctx, outer, d0, d1, stops, light = 1) {
	const { x, y, width: w, height: h } = outer;
	const sides = [
		{ poly: [[x + d0, y + d0], [x + w - d0, y + d0], [x + w - d1, y + d1], [x + d1, y + d1]], g: [0, y + d0, 0, y + d1], shade: 'rgba(255,236,190,0.10)' },
		{ poly: [[x + d0, y + d0], [x + d1, y + d1], [x + d1, y + h - d1], [x + d0, y + h - d0]], g: [x + d0, 0, x + d1, 0], shade: 'rgba(255,236,190,0.04)' },
		{ poly: [[x + d0, y + h - d0], [x + d1, y + h - d1], [x + w - d1, y + h - d1], [x + w - d0, y + h - d0]], g: [0, y + h - d0, 0, y + h - d1], shade: 'rgba(0,0,0,0.30)' },
		{ poly: [[x + w - d0, y + d0], [x + w - d0, y + h - d0], [x + w - d1, y + h - d1], [x + w - d1, y + d1]], g: [x + w - d0, 0, x + w - d1, 0], shade: 'rgba(0,0,0,0.20)' },
	];
	for (const side of sides) {
		const gradient = ctx.createLinearGradient(...side.g);
		for (const [offset, color] of stops)
			gradient.addColorStop(offset, color);
		ctx.beginPath();
		side.poly.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py));
		ctx.closePath();
		ctx.fillStyle = gradient;
		ctx.fill();
		if (light) {
			ctx.fillStyle = side.shade;
			ctx.fill();
		}
	}
}

const GoldOuter = [[0, '#fff1bf'], [0.3, '#f0c66e'], [0.65, '#b07f2c'], [1, '#5c3e12']];
const GoldInner = [[0, '#5c3e12'], [0.4, '#b9893a'], [0.75, '#efc56c'], [1, '#fbe3a2']];

function goldFill(ctx, x0, y0, x1, y1) {
	const g = ctx.createLinearGradient(x0, y0, x1, y1);
	g.addColorStop(0, '#fff3c4');
	g.addColorStop(0.35, '#e9bd62');
	g.addColorStop(0.7, '#a8772a');
	g.addColorStop(1, '#4e340e');
	return g;
}

function gem(ctx, cx, cy, r) {
	const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
	g.addColorStop(0, '#ffe7a3');
	g.addColorStop(0.35, '#f29a2e');
	g.addColorStop(0.75, '#a3410b');
	g.addColorStop(1, '#3d1203');
	ctx.beginPath();
	ctx.arc(cx, cy, r, 0, Math.PI * 2);
	ctx.fillStyle = g;
	ctx.fill();
	ctx.lineWidth = Math.max(1, r * 0.18);
	ctx.strokeStyle = '#2a1606';
	ctx.stroke();
	// sparkle
	ctx.beginPath();
	ctx.ellipse(cx - r * 0.35, cy - r * 0.4, r * 0.28, r * 0.16, -Math.PI / 4, 0, Math.PI * 2);
	ctx.fillStyle = 'rgba(255,255,255,0.75)';
	ctx.fill();
}

function diamond(ctx, cx, cy, rx, ry) {
	ctx.beginPath();
	ctx.moveTo(cx, cy - ry);
	ctx.lineTo(cx + rx, cy);
	ctx.lineTo(cx, cy + ry);
	ctx.lineTo(cx - rx, cy);
	ctx.closePath();
}

function plate(ctx, cx, cy, rx, ry, t, gemRadius) {
	const line = Math.max(1, t / 14);
	ctx.save();
	ctx.shadowColor = 'rgba(0,0,0,0.6)';
	ctx.shadowBlur = t * 0.5;
	ctx.shadowOffsetY = t * 0.12;
	diamond(ctx, cx, cy, rx, ry);
	ctx.fillStyle = goldFill(ctx, cx - rx, cy - ry, cx + rx, cy + ry);
	ctx.fill();
	ctx.restore();
	diamond(ctx, cx, cy, rx, ry);
	ctx.lineWidth = line;
	ctx.strokeStyle = '#2b1b07';
	ctx.stroke();
	diamond(ctx, cx, cy, rx * 0.66, ry * 0.66);
	ctx.fillStyle = '#1c1224';
	ctx.fill();
	ctx.strokeStyle = 'rgba(255,230,160,0.55)';
	ctx.lineWidth = line * 0.8;
	ctx.stroke();
	gem(ctx, cx, cy, gemRadius);
}

function drawGildedFrame(ctx, inner, t) {
	const outer = { x: inner.x - t, y: inner.y - t, width: inner.width + 2 * t, height: inner.height + 2 * t };
	const d = f => Math.round(f * t);
	// drop shadow and a faint golden halo
	ctx.save();
	ringPath(ctx, outer, inner);
	ctx.fillStyle = '#0b0705';
	ctx.shadowColor = 'rgba(0,0,0,0.85)';
	ctx.shadowBlur = t * 2;
	ctx.shadowOffsetY = t * 0.35;
	ctx.fill('evenodd');
	ctx.shadowColor = 'rgba(227,180,90,0.14)';
	ctx.shadowBlur = t * 5;
	ctx.shadowOffsetY = 0;
	ctx.fill('evenodd');
	ctx.restore();

	band(ctx, outer, 0, Math.max(1, d(0.06)), [[0, '#120b04'], [1, '#1d1308']], 0);
	band(ctx, outer, Math.max(1, d(0.06)), d(0.3), GoldOuter);
	band(ctx, outer, d(0.3), d(0.35), [[0, '#2a1a08'], [1, '#160d05']], 0);
	// central enamel band (deep Ambermoon purple)
	band(ctx, outer, d(0.35), d(0.65), [[0, '#1b1028'], [0.5, '#2c1c3d'], [1, '#160c20']]);
	band(ctx, outer, d(0.65), d(0.7), [[0, '#160d05'], [1, '#2a1a08']], 0);
	band(ctx, outer, d(0.7), t - Math.max(1, d(0.08)), GoldInner);
	band(ctx, outer, t - Math.max(1, d(0.08)), t, [[0, '#1a1006'], [1, '#050302']], 0);

	// pearls along the enamel band
	const mid = t * 0.5;
	const step = Math.max(6, t * 0.8);
	const beadRadius = Math.max(0.8, t * 0.075);
	const bead = (bx, by) => {
		const g = ctx.createRadialGradient(bx - beadRadius * 0.3, by - beadRadius * 0.3, 0, bx, by, beadRadius);
		g.addColorStop(0, '#fff4cf');
		g.addColorStop(0.6, '#d6a24a');
		g.addColorStop(1, '#6b4714');
		ctx.beginPath();
		ctx.arc(bx, by, beadRadius, 0, Math.PI * 2);
		ctx.fillStyle = g;
		ctx.fill();
	};
	const keepOut = 2.2 * t; // corners and middle ornaments
	const pearls = (length, place) => {
		const count = Math.floor((length - 2 * keepOut) / step);
		const start = (length - count * step) / 2;
		for (let i = 0; i <= count; i++) {
			const p = start + i * step;
			if (Math.abs(p - length / 2) < keepOut)
				continue;
			place(p);
		}
	};
	pearls(outer.width, p => { bead(outer.x + p, outer.y + mid); bead(outer.x + p, outer.y + outer.height - mid); });
	pearls(outer.height, p => { bead(outer.x + mid, outer.y + p); bead(outer.x + outer.width - mid, outer.y + p); });

	// middle ornaments (stay inside the band) and corner ornaments (only extend outwards)
	const cx = outer.x + outer.width / 2, cy = outer.y + outer.height / 2;
	plate(ctx, cx, outer.y + mid, t * 1.7, t * 0.46, t, t * 0.2);
	plate(ctx, cx, outer.y + outer.height - mid, t * 1.7, t * 0.46, t, t * 0.2);
	plate(ctx, outer.x + mid, cy, t * 0.46, t * 1.7, t, t * 0.2);
	plate(ctx, outer.x + outer.width - mid, cy, t * 0.46, t * 1.7, t, t * 0.2);
	for (const [px, py] of [[outer.x + mid, outer.y + mid], [outer.x + outer.width - mid, outer.y + mid],
		[outer.x + mid, outer.y + outer.height - mid], [outer.x + outer.width - mid, outer.y + outer.height - mid]])
		plate(ctx, px, py, t * 0.84, t * 0.84, t, t * 0.3);
}

function drawThinFrame(ctx, inner, t) {
	const outer = { x: inner.x - t, y: inner.y - t, width: inner.width + 2 * t, height: inner.height + 2 * t };
	ctx.save();
	ringPath(ctx, outer, inner);
	ctx.fillStyle = '#0b0705';
	ctx.shadowColor = 'rgba(0,0,0,0.8)';
	ctx.shadowBlur = t * 4;
	ctx.shadowOffsetY = t * 0.6;
	ctx.fill('evenodd');
	ctx.restore();
	const edge = Math.max(1, Math.round(t * 0.2));
	band(ctx, outer, 0, edge, [[0, '#120b04'], [1, '#120b04']], 0);
	band(ctx, outer, edge, t - edge, [[0, '#f6d891'], [0.5, '#c7953f'], [1, '#6a4816']]);
	band(ctx, outer, t - edge, t, [[0, '#1a1006'], [1, '#050302']], 0);
}
