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
