// Software renderer emulating the layered palette renderer of the C# version
// (Amber.Renderer.OpenGL). Everything is drawn into a 320x200 RGBA framebuffer.
//
// Depth handling mirrors the OpenGL implementation: every drawable gets a depth
// value of 1 - layer.baseZ - displayLayer * 0.00001 and the depth test is LEQUAL.
// Instead of floats we use an integer priority (higher = nearer).

export const LayerFeatures = {
	None: 0,
	Transparency: 0x1,
	DisplayLayers: 0x2,
	Alpha: 0x4,
};

export class TextureAtlas {
	/** @param {Map<number, import('../data/graphic.js').Graphic>|Array} graphics */
	constructor(graphics) {
		const entries = graphics instanceof Map ? [...graphics.entries()] : graphics.map((g, i) => [i, g]);
		const offsets = new Map();
		// simple shelf packing, max width 2048
		const maxWidth = 2048;
		let x = 0, y = 0, rowHeight = 0, width = 0;
		for (const [key, g] of entries) {
			if (!g)
				continue;
			if (x + g.width > maxWidth) {
				x = 0;
				y += rowHeight;
				rowHeight = 0;
			}
			offsets.set(key, { x, y });
			x += g.width;
			width = Math.max(width, x);
			rowHeight = Math.max(rowHeight, g.height);
		}
		const height = y + rowHeight;
		this.width = Math.max(1, width);
		this.height = Math.max(1, height);
		this.data = new Uint8Array(this.width * this.height);
		for (const [key, g] of entries) {
			if (!g)
				continue;
			const o = offsets.get(key);
			for (let row = 0; row < g.height; row++)
				this.data.set(g.data.subarray(row * g.width, (row + 1) * g.width), (o.y + row) * this.width + o.x);
		}
		this.offsets = offsets;
	}

	getOffset(index) {
		const o = this.offsets.get(index);
		if (!o)
			throw new Error(`Texture index ${index} not found in atlas`);
		return { x: o.x, y: o.y };
	}
}

let nextDrawOrder = 1;

class Drawable {
	constructor(layer) {
		this.layer = layer;
		this._visible = false;
		this.x = 0;
		this.y = 0;
		this.width = 0;
		this.height = 0;
		this.displayLayer = 0;
		this.baseLineOffset = 0;
		this.clipRect = null; // {x, y, w, h}
		this.order = 0;
	}

	get visible() { return this._visible; }
	set visible(v) {
		v = !!v;
		if (v === this._visible)
			return;
		this._visible = v;
		if (v) {
			this.order = nextDrawOrder++;
			this.layer.drawables.add(this);
		} else {
			this.layer.drawables.delete(this);
		}
	}

	get position() { return { x: this.x, y: this.y }; }
	set position(p) { this.x = p.x; this.y = p.y; }
	get size() { return { width: this.width, height: this.height }; }
	set size(s) { this.width = s.width; this.height = s.height; }

	/** Effective display layer used for depth sorting */
	effectiveDisplayLayer() {
		if (this.layer.features & LayerFeatures.DisplayLayers)
			return this.displayLayer;
		return Math.max(0, Math.min(255, this.y + this.height + this.baseLineOffset));
	}
}

export class Sprite extends Drawable {
	constructor(layer) {
		super(layer);
		this.textureOffset = { x: 0, y: 0 };
		this.textureSize = null; // {width, height}
		this.paletteIndex = 0;
		this.maskColorIndex = null;
		this.transparentColorIndex = null;
		this.mirrorX = false;
		this.opaque = false;
		this.alpha = 255;
		// animation
		this._currentFrameIndex = 0;
		this._frameCount = 1;
	}

	get currentFrameIndex() { return this._currentFrameIndex; }
	set currentFrameIndex(v) {
		v %= this._frameCount;
		if (v < 0)
			v += this._frameCount;
		this._currentFrameIndex = v;
	}

	get frameCount() { return this._frameCount; }
	set frameCount(v) {
		if (v < 1)
			v = 1;
		this._frameCount = v;
		if (this._currentFrameIndex >= v)
			this._currentFrameIndex = v - 1;
	}
}

export class ColoredRect extends Drawable {
	constructor(layer) {
		super(layer);
		this.color = { r: 0, g: 0, b: 0, a: 255 };
	}
}

export class RenderLayer {
	/**
	 * @param {number} index
	 * @param {{baseZ:number, features:number, texture?:TextureAtlas, usesPalette?:boolean}} config
	 */
	constructor(index, config) {
		this.index = index;
		this.config = config;
		this.features = config.features ?? 0;
		this.visible = true;
		this.drawables = new Set();
	}

	createSprite() { return new Sprite(this); }
	createAnimatedSprite() { return new Sprite(this); }
	createAlphaSprite() { return new Sprite(this); }
	createColoredRect() { return new ColoredRect(this); }
}

export class Renderer {
	constructor(width = 320, height = 200) {
		this.width = width;
		this.height = height;
		this.layers = [];
		this.frame = new Uint8ClampedArray(width * height * 4);
		this.frame32 = new Uint32Array(this.frame.buffer);
		this.depth = new Int32Array(width * height);
		/** @type {Array<Array<number[]>>} palettes as arrays of [r,g,b] */
		this.palettes = [];
		this.packedPalettes = [];
	}

	addLayer(layer) {
		this.layers.push(layer);
	}

	setPalettes(palettes) {
		this.palettes = palettes;
		this.packedPalettes = palettes.map(p => Uint32Array.from({ length: 256 }, (_, i) => {
			const c = p[i] ?? [0, 0, 0];
			return (0xff << 24) | (c[2] << 16) | (c[1] << 8) | c[0];
		}));
	}

	render() {
		const W = this.width, H = this.height;
		const frame32 = this.frame32;
		const depth = this.depth;
		frame32.fill(0xff000000);
		depth.fill(-1);

		for (const layer of this.layers) {
			if (!layer.visible || layer.drawables.size === 0)
				continue;

			const items = [...layer.drawables];
			// Like the GL version: all colored rects of a layer are drawn before its sprites.
			items.sort((a, b) => ((a instanceof ColoredRect ? 0 : 1) - (b instanceof ColoredRect ? 0 : 1)) || (a.order - b.order));
			const basePriority = Math.round(layer.config.baseZ * 100000);
			const allowTransparency = (layer.features & LayerFeatures.Transparency) !== 0;
			const allowAlpha = (layer.features & LayerFeatures.Alpha) !== 0;
			const atlas = layer.config.texture;

			for (const d of items) {
				const priority = basePriority + d.effectiveDisplayLayer();

				// Clip area
				let x0 = d.x, y0 = d.y, x1 = d.x + d.width, y1 = d.y + d.height;
				if (d.clipRect) {
					x0 = Math.max(x0, d.clipRect.x);
					y0 = Math.max(y0, d.clipRect.y);
					x1 = Math.min(x1, d.clipRect.x + d.clipRect.w);
					y1 = Math.min(y1, d.clipRect.y + d.clipRect.h);
				}
				x0 = Math.max(0, x0); y0 = Math.max(0, y0);
				x1 = Math.min(W, x1); y1 = Math.min(H, y1);
				if (x0 >= x1 || y0 >= y1)
					continue;

				if (d instanceof ColoredRect) {
					const c = d.color;
					const a = allowAlpha ? c.a : 255;
					if (a === 0)
						continue;
					const packed = (0xff << 24) | (c.b << 16) | (c.g << 8) | c.r;
					for (let y = y0; y < y1; y++) {
						let idx = y * W + x0;
						for (let x = x0; x < x1; x++, idx++) {
							if (priority < depth[idx])
								continue;
							if (a === 255) {
								frame32[idx] = packed;
								depth[idx] = priority;
							} else {
								blend(this.frame, idx, c.r, c.g, c.b, a);
							}
						}
					}
					continue;
				}

				// Sprite
				const pal = this.packedPalettes[d.paletteIndex] ?? this.packedPalettes[0];
				const tex = atlas.data;
				const texW = atlas.width;
				const tsW = d.textureSize?.width ?? d.width;
				const tsH = d.textureSize?.height ?? d.height;
				const tox = d.textureOffset.x + d._currentFrameIndex * tsW;
				const toy = d.textureOffset.y;
				const scaleX = tsW / d.width;
				const scaleY = tsH / d.height;
				const transparentIndex = d.transparentColorIndex ?? 0;
				const noTransparency = d.opaque || !allowTransparency;
				const mask = d.maskColorIndex;
				const a = allowAlpha ? d.alpha : 255;
				if (a === 0)
					continue;

				for (let y = y0; y < y1; y++) {
					const ty = toy + Math.floor((y - d.y) * scaleY);
					const rowBase = ty * texW;
					let idx = y * W + x0;
					for (let x = x0; x < x1; x++, idx++) {
						if (priority < depth[idx])
							continue;
						let rx = Math.floor((x - d.x) * scaleX);
						if (d.mirrorX)
							rx = tsW - 1 - rx;
						let colorIndex = tex[rowBase + tox + rx];
						if (colorIndex === transparentIndex && !noTransparency)
							continue;
						if (colorIndex > 15)
							colorIndex = 0;
						if (mask != null && mask < 16)
							colorIndex = mask;
						const color = pal[colorIndex];
						if (a === 255) {
							frame32[idx] = color;
							depth[idx] = priority;
						} else {
							blend(this.frame, idx, color & 0xff, (color >> 8) & 0xff, (color >> 16) & 0xff, a);
						}
					}
				}
			}
		}
	}
}

function blend(frame, idx, r, g, b, a) {
	const i = idx * 4;
	const inv = 255 - a;
	frame[i] = (r * a + frame[i] * inv) / 255;
	frame[i + 1] = (g * a + frame[i + 1] * inv) / 255;
	frame[i + 2] = (b * a + frame[i + 2] * inv) / 255;
}
