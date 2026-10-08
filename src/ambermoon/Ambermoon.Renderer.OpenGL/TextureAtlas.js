// Port of Ambermoon.Renderer.OpenGL/TextureAtlas.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// TextureAtlas.cs - Texture atlas, builder and factory
//
// Dictionaries are JS Maps: graphicAtlas.Offsets is Map<uint, Position>,
// graphicAtlasesWithOffsets is Map<uint, IGraphicAtlas>.

import { getValue, ArgumentException, InvalidOperationException } from '../../runtime.js';
import { Position } from '../Ambermoon.Common/Position.js';
import { Texture as RenderTexture } from '../Ambermoon.Core/Render/Texture.js';
import { Texture } from './Texture.js';
import { MutableTexture } from './MutableTexture.js';

function offsetDictionary(offsets, offset) {
	const result = new Map();

	for (const [key, value] of offsets) {
		const newKey = (offset + key) >>> 0;

		if (result.has(newKey))
			throw new ArgumentException('An item with the same key has already been added.');

		result.set(newKey, value);
	}

	return result;
}

function addToDictionary(map, key, value) {
	if (map.has(key))
		throw new ArgumentException('An item with the same key has already been added.');

	map.set(key, value);
}

export class TextureAtlas {
	/**
	 * new TextureAtlas(state, graphicAtlas, offset)
	 * new TextureAtlas(state, graphicAtlasesWithOffsets: Map<uint, IGraphicAtlas>)
	 * new TextureAtlas(texture: Texture, textureOffsets: Map<uint, Position>)
	 */
	constructor(a, b, c) {
		this.textureOffsets = new Map();
		this.Texture = null;
		/** Web port: atlases of the HD graphics mode are upscaled by this factor (offsets are in texture pixels). */
		this.TextureFactor = 1;

		if (a instanceof Texture) {
			// internal TextureAtlas(Texture texture, Dictionary<uint, Position> textureOffsets)
			this.Texture = a;
			this.textureOffsets = b;
		} else if (arguments.length >= 3) {
			// internal TextureAtlas(State state, IGraphicAtlas graphicAtlas, uint offset)
			const state = a;
			const graphicAtlas = b;
			const offset = c;
			const texture = new MutableTexture(state, graphicAtlas.Graphic);

			if (offset === 0)
				this.textureOffsets = graphicAtlas.Offsets;
			else
				this.textureOffsets = offsetDictionary(graphicAtlas.Offsets, offset);

			texture.Finish(0);

			this.Texture = texture;
		} else {
			// internal TextureAtlas(State state, Dictionary<uint, IGraphicAtlas> graphicAtlasesWithOffsets)
			const state = a;
			const graphicAtlasesWithOffsets = b;

			if (graphicAtlasesWithOffsets.size === 0) {
				this.Texture = new Texture(state, 0, 0, RenderTexture.PixelFormat.RGBA8, new Uint8Array(0));
				this.textureOffsets = new Map();
			} else if (graphicAtlasesWithOffsets.size === 1) {
				const [key, value] = graphicAtlasesWithOffsets.entries().next().value;
				const texture = new MutableTexture(state, value.Graphic);
				const offset = key;

				this.textureOffsets = offset === 0 ? value.Offsets : offsetDictionary(value.Offsets, offset);

				texture.Finish(0);
				this.Texture = texture;
			} else {
				const builder = new TextureAtlasBuilder(state);

				for (const [key, value] of graphicAtlasesWithOffsets) {
					builder.AddTexture(key, value.Graphic);
				}

				const first = graphicAtlasesWithOffsets.values().next().value;
				const textureAtlas = builder.Create(first.Graphic.IndexedGraphic ? 1 : 4);

				this.Texture = textureAtlas.Texture;
				this.textureOffsets = new Map();

				for (const [key, value] of graphicAtlasesWithOffsets) {
					const basePosition = textureAtlas.GetOffset(key);

					for (const [offsetKey, offsetValue] of value.Offsets) {
						addToDictionary(this.textureOffsets, (key + offsetKey) >>> 0, Position.op_Addition(basePosition, offsetValue));
					}
				}
			}
		}
	}

	GetOffset(index) {
		return new Position(getValue(this.textureOffsets, index));
	}
}

export class TextureAtlasBuilder {
	constructor(state) {
		this.state = state;
		this.textures = new Map();
	}

	AddTexture(index, texture) {
		addToDictionary(this.textures, index, texture);
	}

	ReplaceTexture(index, texture) {
		this.textures.set(index, texture);
	}

	/** Web port: upscaled atlas for the HD graphics mode (see createHDAtlas). Returns null if not possible. */
	CreateHD(options) {
		return createHDAtlas(this.state, this.textures, options);
	}

	/** Web port: the added textures (Map<index, Graphic>) */
	get Textures() { return this.textures; }

	CreateUnpacked(maxWidth, bytesPerPixel) {
		let width = 0;
		let height = 0;
		let xOffset = 0;
		let yOffset = 0;
		const textureOffsets = new Map();

		for (const [textureIndex, texture] of this.textures) {
			if (xOffset + texture.Width <= maxWidth) {
				if (yOffset + texture.Height > height)
					height = yOffset + texture.Height;

				addToDictionary(textureOffsets, textureIndex, new Position(xOffset, yOffset));

				xOffset += texture.Width;

				if (xOffset > width)
					width = xOffset;
			} else {
				xOffset = 0;
				yOffset = height;

				height = yOffset + texture.Height;

				addToDictionary(textureOffsets, textureIndex, new Position(xOffset, yOffset));

				xOffset += texture.Width;

				if (xOffset > width)
					width = xOffset;
			}
		}

		// create texture
		const atlasTexture = new MutableTexture(this.state, width, height, bytesPerPixel);

		for (const [key, offset] of textureOffsets) {
			const subTexture = getValue(this.textures, key);

			atlasTexture.AddSubTexture(offset, subTexture.Data, subTexture.Width, subTexture.Height);
		}

		atlasTexture.Finish(0);

		return new TextureAtlas(atlasTexture, textureOffsets);
	}

	// Note: It is not the best texture packing algorithm but it will do its job
	Create(bytesPerPixel) {
		// sort textures by similar heights (16-pixel bands)
		// heights of items are < key * 16
		// value = list of texture indices
		const textureCategories = new Map();
		const textureCategoryMinValues = new Map();
		const textureCategoryMaxValues = new Map();
		const textureCategoryTotalWidth = new Map();

		for (const [key, value] of this.textures) {
			const category = Math.trunc(value.Height / 16);

			if (!textureCategories.has(category)) {
				textureCategories.set(category, []);
				textureCategoryMinValues.set(category, value.Height);
				textureCategoryMaxValues.set(category, value.Height);
				textureCategoryTotalWidth.set(category, value.Width);
			} else {
				if (value.Height < textureCategoryMinValues.get(category))
					textureCategoryMinValues.set(category, value.Height);
				if (value.Height > textureCategoryMaxValues.get(category))
					textureCategoryMaxValues.set(category, value.Height);
				textureCategoryTotalWidth.set(category, textureCategoryTotalWidth.get(category) + value.Width);
			}

			textureCategories.get(category).push(key);
		}

		const filteredTextureCategories = [];

		for (const [categoryKey] of textureCategories) {
			if (textureCategories.get(categoryKey).length === 0)
				continue; // was merged with lower category

			// merge categories with minimal differences
			if (textureCategoryMinValues.get(categoryKey) >= categoryKey * 16 + 8 &&
				textureCategories.has(categoryKey + 1) &&
				textureCategoryMaxValues.get(categoryKey + 1) <= (categoryKey + 1) * 16 + 8) {
				textureCategories.get(categoryKey).push(...textureCategories.get(categoryKey + 1));
				textureCategoryMaxValues.set(categoryKey, Math.max(textureCategoryMaxValues.get(categoryKey), textureCategoryMaxValues.get(categoryKey + 1)));
				textureCategories.get(categoryKey + 1).length = 0;
			}

			filteredTextureCategories.push([textureCategoryMaxValues.get(categoryKey), textureCategories.get(categoryKey)]);
		}

		// TextureCategorySorter: key = max height of category
		filteredTextureCategories.sort((x, y) => x[0] - y[0]);

		// now we have a sorted category list with all texture indices

		let maxValue = 0;
		let anyCategory = false;

		for (const value of textureCategoryMaxValues.values()) {
			if (!anyCategory || value > maxValue)
				maxValue = value;
			anyCategory = true;
		}

		if (!anyCategory)
			throw new InvalidOperationException('Sequence contains no elements'); // Enumerable.Max

		const maxWidth = Math.max(512, maxValue);
		let width = 0;
		let height = 0;
		let xOffset = 0;
		let yOffset = 0;
		const textureOffsets = new Map();

		// create texture offsets
		for (const category of filteredTextureCategories) {
			for (const textureIndex of category[1]) {
				const texture = getValue(this.textures, textureIndex);

				if (xOffset + texture.Width <= maxWidth) {
					if (yOffset + texture.Height > height)
						height = yOffset + texture.Height;

					addToDictionary(textureOffsets, textureIndex, new Position(xOffset, yOffset));

					xOffset += texture.Width;

					if (xOffset > width)
						width = xOffset;
				} else {
					xOffset = 0;
					yOffset = height;

					height = yOffset + texture.Height;

					addToDictionary(textureOffsets, textureIndex, new Position(xOffset, yOffset));

					xOffset += texture.Width;

					if (xOffset > width)
						width = xOffset;
				}
			}

			if (xOffset > maxWidth - 320) { // we do not expect textures with a width greater than 320
				xOffset = 0;
				yOffset = height;
			}
		}

		// create texture
		const atlasTexture = new MutableTexture(this.state, width, height, bytesPerPixel);

		for (const [key, offset] of textureOffsets) {
			const subTexture = getValue(this.textures, key);

			atlasTexture.AddSubTexture(offset, subTexture.Data, subTexture.Width, subTexture.Height);
		}

		atlasTexture.Finish(0);

		return new TextureAtlas(atlasTexture, textureOffsets);
	}
}

// #region Web port: HD graphics (upscaled texture atlases)

/** Layout of CreateUnpacked: textures in insertion order, row by row (animation frames rely on this order). */
function sequentialLayout(textures, maxWidth) {
	let width = 0;
	let height = 0;
	let xOffset = 0;
	let yOffset = 0;
	const offsets = new Map();

	for (const [index, texture] of textures) {
		if (xOffset + texture.Width > maxWidth) {
			xOffset = 0;
			yOffset = height;
		}

		if (yOffset + texture.Height > height)
			height = yOffset + texture.Height;

		offsets.set(index, new Position(xOffset, yOffset));
		xOffset += texture.Width;

		if (xOffset > width)
			width = xOffset;
	}

	return { width, height, offsets };
}

/** Shelf packing (sorted by height) for atlases whose graphics are independent (e.g. intro pictures). */
function shelfLayout(textures, maxWidth) {
	const sorted = [...textures].sort((a, b) => b[1].Height - a[1].Height || b[1].Width - a[1].Width);
	let width = 0;
	let height = 0;
	let xOffset = 0;
	let yOffset = 0;
	const offsets = new Map();

	for (const [index, texture] of sorted) {
		if (xOffset + texture.Width > maxWidth) {
			xOffset = 0;
			yOffset = height;
		}

		if (yOffset + texture.Height > height)
			height = yOffset + texture.Height;

		offsets.set(index, new Position(xOffset, yOffset));
		xOffset += texture.Width;

		if (xOffset > width)
			width = xOffset;
	}

	return { width, height, offsets };
}

/** The layout of TextureAtlasBuilder.Create (packed by height categories). */
function packedLayout(textures) {
	const textureCategories = new Map();
	const textureCategoryMinValues = new Map();
	const textureCategoryMaxValues = new Map();

	for (const [key, value] of textures) {
		const category = Math.trunc(value.Height / 16);

		if (!textureCategories.has(category)) {
			textureCategories.set(category, []);
			textureCategoryMinValues.set(category, value.Height);
			textureCategoryMaxValues.set(category, value.Height);
		} else {
			if (value.Height < textureCategoryMinValues.get(category))
				textureCategoryMinValues.set(category, value.Height);
			if (value.Height > textureCategoryMaxValues.get(category))
				textureCategoryMaxValues.set(category, value.Height);
		}

		textureCategories.get(category).push(key);
	}

	const filteredTextureCategories = [];

	for (const [categoryKey] of textureCategories) {
		if (textureCategories.get(categoryKey).length === 0)
			continue;

		if (textureCategoryMinValues.get(categoryKey) >= categoryKey * 16 + 8 &&
			textureCategories.has(categoryKey + 1) &&
			textureCategoryMaxValues.get(categoryKey + 1) <= (categoryKey + 1) * 16 + 8) {
			textureCategories.get(categoryKey).push(...textureCategories.get(categoryKey + 1));
			textureCategoryMaxValues.set(categoryKey, Math.max(textureCategoryMaxValues.get(categoryKey), textureCategoryMaxValues.get(categoryKey + 1)));
			textureCategories.get(categoryKey + 1).length = 0;
		}

		filteredTextureCategories.push([textureCategoryMaxValues.get(categoryKey), textureCategories.get(categoryKey)]);
	}

	filteredTextureCategories.sort((x, y) => x[0] - y[0]);

	const maxWidth = Math.max(512, ...textureCategoryMaxValues.values());
	let width = 0;
	let height = 0;
	let xOffset = 0;
	let yOffset = 0;
	const offsets = new Map();

	for (const category of filteredTextureCategories) {
		for (const textureIndex of category[1]) {
			const texture = textures.get(textureIndex);

			if (xOffset + texture.Width > maxWidth) {
				xOffset = 0;
				yOffset = height;
			}

			if (yOffset + texture.Height > height)
				height = yOffset + texture.Height;

			offsets.set(textureIndex, new Position(xOffset, yOffset));
			xOffset += texture.Width;

			if (xOffset > width)
				width = xOffset;
		}

		if (xOffset > maxWidth - 320) {
			xOffset = 0;
			yOffset = height;
		}
	}

	return { width, height, offsets };
}

/**
 * Texture of an upscaled (HD) atlas. The atlas is built at its original size (palette indices) and upscaled on the GPU
 * the first time it is needed (see RenderView.EnsureHDTextures). Width/Height are the upscaled dimensions.
 */
export class HDAtlasTexture extends Texture {
	constructor(state, width, height, factor, data, regions) {
		super(state, width * factor, height * factor);

		this.Factor = factor;
		this.SourceWidth = width;
		this.SourceHeight = height;
		this.SourceData = data;
		this.regions = typeof regions === 'function' ? null : regions;
		this.regionsFactory = typeof regions === 'function' ? regions : null;
		this.Upscaled = false;
	}

	/** Upscaler regions (created on first use, see createHDAtlas) */
	get Regions() {
		if (this.regions == null && this.regionsFactory != null) {
			this.regions = this.regionsFactory();
			this.regionsFactory = null;
		}

		return this.regions ?? [];
	}

	get NeedsUpscale() { return !this.Upscaled && !this.disposed; }

	get ByteSize() { return this.Width * this.Height; }

	Upscale(upscaler) {
		if (!this.NeedsUpscale)
			return;

		if (!upscaler.Ready) {
			// The upscaler shaders are still compiling: show the original graphics meanwhile. The texture coordinates
			// are normalized, so the original size texture is displayed the same way (just without the details).
			if (!this.PreviewUploaded) {
				const gl = this.state.Gl;
				gl.activeTexture(gl.TEXTURE0);
				gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
				gl.bindTexture(gl.TEXTURE_2D, this.Index);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, this.SourceWidth, this.SourceHeight, 0, gl.RED, gl.UNSIGNED_BYTE, this.SourceData);
				gl.bindTexture(gl.TEXTURE_2D, null);
				Texture.ActiveTexture = null;
				this.PreviewUploaded = true;
			}

			return;
		}

		upscaler.Upscale(this.Index, this.SourceData, this.SourceWidth, this.SourceHeight, this.Regions, this.Factor);
		this.Upscaled = true;
		this.PreviewUploaded = false;
	}

	/** Frees the GPU memory of the upscaled texture (it is recreated when used again). */
	ReleaseHD() {
		if (!this.Upscaled || this.disposed)
			return;

		if (Texture.ActiveTexture === this)
			this.Unbind();

		const gl = this.state.Gl;
		gl.deleteTexture(this.Index);
		this.Index = gl.createTexture();
		this.Upscaled = false;
		this.PreviewUploaded = false;
	}

	Dispose() {
		super.Dispose();
		this.SourceData = null;
	}
}

/**
 * Creates the upscaled atlas of the builder's (indexed) textures.
 * options:
 *   factor: 2 or 4
 *   layout: 'sequential' (like CreateUnpacked, keeps the order for animations), 'packed' (like Create) or 'shelf'
 *   maxWidth: initial maximum width of the sequential layout (320 like CreateUnpacked)
 *   maxTextureSize: GL limit; the layout gets wider if the upscaled atlas would be too high
 *   regionInfo: (key, graphic) => ({ flags, palette }) - upscaling options per graphic
 * Graphics may define `FrameWidth` / `FrameHeight` (web port hints): compound graphics (animation frames side by side)
 * are then upscaled frame by frame, so frames don't bleed into each other.
 */
function createHDAtlas(state, textures, options) {
	const factor = options.factor;
	const maxTextureSize = options.maxTextureSize ?? 16384;
	let layout;

	if (options.layout === 'packed') {
		layout = packedLayout(textures);
	} else {
		const widest = Math.max(1, ...[...textures.values()].map(t => t.Width));
		let maxWidth = Math.max(options.maxWidth ?? 320, widest);

		if (options.layout === 'shelf') {
			const area = [...textures.values()].reduce((sum, t) => sum + t.Width * t.Height, 0);
			maxWidth = Math.max(widest, Math.ceil(Math.sqrt(area * 1.15)));
			layout = shelfLayout(textures, maxWidth);
		} else {
			layout = sequentialLayout(textures, maxWidth);

			while (layout.height * factor > maxTextureSize && maxWidth * 2 * factor <= maxTextureSize) {
				maxWidth *= 2;
				layout = sequentialLayout(textures, maxWidth);
			}
		}
	}

	const width = Math.max(1, layout.width);
	const height = Math.max(1, layout.height);

	if (width * factor > maxTextureSize || height * factor > maxTextureSize)
		return null; // not possible -> caller uses the original atlas

	const data = new Uint8Array(width * height);
	const scaledOffsets = new Map();

	for (const [key, offset] of layout.offsets) {
		const graphic = textures.get(key);
		const graphicWidth = graphic.Width;

		for (let y = 0; y < graphic.Height; ++y)
			data.set(graphic.Data.subarray(y * graphicWidth, (y + 1) * graphicWidth), (offset.Y + y) * width + offset.X);

		scaledOffsets.set(key, new Position(offset.X * factor, offset.Y * factor));
	}

	// The upscaler regions are determined when the atlas is upscaled for the first time (the region infos may need
	// some work like the neighbor tiles of the map tiles, which is only done for the tilesets which are used).
	const regionsFactory = () => {
		const regions = [];

		for (const [key, offset] of layout.offsets) {
			const graphic = textures.get(key);
			const graphicWidth = graphic.Width;
			const graphicHeight = graphic.Height;

			if (graphicWidth === 0 || graphicHeight === 0)
				continue;

			const info = options.regionInfo?.(key, graphic) ?? {};
			const flags = (info.flags ?? 0) | (graphic.HDFlags ?? 0);
			const palette = graphic.HDPalette ?? info.palette ?? 0;
			let frameWidth = graphic.FrameWidth ?? info.frameWidth ?? graphicWidth;
			let frameHeight = graphic.FrameHeight ?? info.frameHeight ?? graphicHeight;

			if (!(frameWidth > 0) || graphicWidth % frameWidth !== 0)
				frameWidth = graphicWidth;
			if (!(frameHeight > 0) || graphicHeight % frameHeight !== 0)
				frameHeight = graphicHeight;

			for (let fy = 0; fy < graphicHeight; fy += frameHeight) {
				for (let fx = 0; fx < graphicWidth; fx += frameWidth)
					regions.push({ x: offset.X + fx, y: offset.Y + fy, width: frameWidth, height: frameHeight, flags, palette });
			}

			// Neighbor graphics (keys [left, right, top, bottom], e.g. the most common neighbor tiles on the maps):
			// the upscaler reads the pixels outside of the graphic from them instead of repeating the border pixels.
			if (info.neighbors != null && frameWidth === graphicWidth && frameHeight === graphicHeight) {
				const neighbors = info.neighbors.map(neighborKey => {
					const neighbor = neighborKey == null ? null : textures.get(neighborKey);
					const neighborOffset = neighbor == null ? null : layout.offsets.get(neighborKey);

					return neighborOffset != null && neighbor.Width === graphicWidth && neighbor.Height === graphicHeight
						? [neighborOffset.X, neighborOffset.Y] : [-1, -1];
				});
				regions[regions.length - 1].neighbors = neighbors.flat();
			}
		}

		return regions;
	};

	const texture = new HDAtlasTexture(state, width, height, factor, data, regionsFactory);
	const atlas = new TextureAtlas(texture, scaledOffsets);
	atlas.TextureFactor = factor;
	return atlas;
}


// #endregion

export class TextureAtlasBuilderFactory {
	constructor(state) {
		this.state = state;
	}

	/**
	 * Convert(graphicAtlas, offset) or Convert(graphicAtlasesWithOffsets: Map<uint, IGraphicAtlas>)
	 */
	Convert(graphicAtlas, offset) {
		if (arguments.length >= 2)
			return new TextureAtlas(this.state, graphicAtlas, offset);

		return new TextureAtlas(this.state, graphicAtlas);
	}

	Create() {
		return new TextureAtlasBuilder(this.state);
	}
}
