// Port of Ambermoon.Renderer.OpenGL/RenderBuffer.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// RenderBuffer.cs - Vertex data of all render nodes of a layer and the drawing of them

import { ValueMap, getValue, toShort, toUShort } from '../../runtime.js';
import { Position, FloatPosition } from '../Ambermoon.Common/Position.js';
import { Size, FloatSize } from '../Ambermoon.Common/Size.js';
import { Util } from '../Ambermoon.Common/Util.js';
import { AmbermoonException, ExceptionScope } from '../Ambermoon.Common/Exception.js';
import { SurfaceType, WallOrientation } from '../Ambermoon.Core/Render/ISurface3D.js';
import { VertexArrayObject } from './VertexArrayObject.js';
import { VectorBuffer } from './VectorBuffer.js';
import { FloatPositionBuffer } from './FloatPositionBuffer.js';
import { PositionBuffer } from './PositionBuffer.js';
import { WordBuffer } from './WordBuffer.js';
import { ColorBuffer } from './ColorBuffer.js';
import { ByteBuffer } from './ByteBuffer.js';
import { IndexBuffer } from './IndexBuffer.js';
import { FloatBuffer } from './FloatBuffer.js';
import { ColorShader } from './ColorShader.js';
import { TextureShader } from './TextureShader.js';
import { OpaqueTextureShader } from './OpaqueTextureShader.js';
import { Texture3DShader } from './Texture3DShader.js';
import { Billboard3DShader } from './Billboard3DShader.js';
import { TextShader } from './TextShader.js';
import { SubPixelTextShader } from './SubPixelTextShader.js';
import { FowShader } from './FowShader.js';
import { SkyShader } from './SkyShader.js';
import { AlphaTextureShader } from './AlphaTextureShader.js';
import { ImageShader } from './ImageShader.js';
import { FadingTextureShader } from './FadingTextureShader.js';
import { Fow } from './Fow.js';
import { ColoredRect } from './ColoredRect.js';
import { Surface3D } from './Surface3D.js';
import { AlphaSprite } from './Sprite.js';

const UShortMaxValue = 65535;
const FloatMaxValue = 3.4028234663852886e38;

function isSurface3D(node) {
	return node instanceof Surface3D;
}

function isLayerSprite(sprite) {
	// Render.ILayerSprite
	return sprite != null && typeof sprite.DisplayLayer === 'number';
}

export class RenderBuffer {
	// State -> shader (State implements value equality like in C#)
	static colorShaders = new ValueMap();
	static textureShaders = new ValueMap();
	static opaqueTextureShaders = new ValueMap();
	static texture3DShaders = new ValueMap();
	static billboard3DShaders = new ValueMap();
	static textShaders = new ValueMap();
	static subPixelTextShaders = new ValueMap();
	static fowShaders = new ValueMap();
	static skyShaders = new ValueMap();
	static alphaTextureShaders = new ValueMap();
	static imageShaders = new ValueMap();
	static fadingTextureShaders = new ValueMap();

	constructor(state, is3D, supportAnimations, layered,
		noTexture = false, isBillboard = false, isText = false, opaque = false,
		fow = false, sky = false, texturesWithAlpha = false, imageWithoutPalette = false,
		textureFactor = 1, fading = false, subPixel = false) {
		this.Opaque = false;
		this.disposed = false;
		this.textureFactor = 1;
		this.indexOrderChecked = true;

		this.vertexArrayObject = null;
		this.vectorBuffer = null;
		this.positionBuffer = null;
		this.textureAtlasOffsetBuffer = null;
		this.baseLineBuffer = null;
		this.colorBuffer = null;
		this.maskColorBuffer = null;
		this.layerBuffer = null;
		this.indexBuffer = null;
		this.paletteIndexBuffer = null;
		this.textColorIndexBuffer = null;
		this.textureEndCoordBuffer = null;
		this.textureSizeBuffer = null;
		this.billboardCenterBuffer = null;
		this.billboardOrientationBuffer = null;
		this.alphaBuffer = null;
		this.extrudeBuffer = null;
		this.centerBuffer = null;
		this.radiusBuffer = null;

		this.state = state;
		this.textureFactor = textureFactor;
		this.Opaque = opaque;

		const R = RenderBuffer;

		if (is3D) {
			if (layered || noTexture)
				throw new AmbermoonException(ExceptionScope.Render, '3D render buffers can\'t be masked nor layered and must not lack a texture.');
		}

		if (fading) {
			if (!R.fadingTextureShaders.has(state))
				R.fadingTextureShaders.set(state, FadingTextureShader.Create(state));
			this.vertexArrayObject = new VertexArrayObject(state, R.fadingTextureShaders.get(state).ShaderProgram);
		} else if (imageWithoutPalette) {
			if (!R.imageShaders.has(state))
				R.imageShaders.set(state, ImageShader.Create(state));
			this.vertexArrayObject = new VertexArrayObject(state, R.imageShaders.get(state).ShaderProgram);
		} else if (texturesWithAlpha) {
			if (!R.alphaTextureShaders.has(state))
				R.alphaTextureShaders.set(state, AlphaTextureShader.Create(state));
			this.vertexArrayObject = new VertexArrayObject(state, R.alphaTextureShaders.get(state).ShaderProgram);
		} else if (sky) {
			if (!R.skyShaders.has(state))
				R.skyShaders.set(state, SkyShader.Create(state));
			this.vertexArrayObject = new VertexArrayObject(state, R.skyShaders.get(state).ShaderProgram);
		} else if (fow) {
			if (!R.fowShaders.has(state))
				R.fowShaders.set(state, FowShader.Create(state));
			this.vertexArrayObject = new VertexArrayObject(state, R.fowShaders.get(state).ShaderProgram);
		} else if (noTexture) {
			if (!R.colorShaders.has(state))
				R.colorShaders.set(state, ColorShader.Create(state));
			this.vertexArrayObject = new VertexArrayObject(state, R.colorShaders.get(state).ShaderProgram);
		} else if (isText) {
			if (subPixel) {
				if (!R.subPixelTextShaders.has(state))
					R.subPixelTextShaders.set(state, SubPixelTextShader.Create(state));
				this.vertexArrayObject = new VertexArrayObject(state, R.subPixelTextShaders.get(state).ShaderProgram);
			} else {
				if (!R.textShaders.has(state))
					R.textShaders.set(state, TextShader.Create(state));
				this.vertexArrayObject = new VertexArrayObject(state, R.textShaders.get(state).ShaderProgram);
			}
		} else {
			if (is3D) {
				if (isBillboard) {
					if (!R.billboard3DShaders.has(state))
						R.billboard3DShaders.set(state, Billboard3DShader.Create(state));
					this.vertexArrayObject = new VertexArrayObject(state, R.billboard3DShaders.get(state).ShaderProgram);
				} else {
					if (!R.texture3DShaders.has(state))
						R.texture3DShaders.set(state, Texture3DShader.Create(state));
					this.vertexArrayObject = new VertexArrayObject(state, R.texture3DShaders.get(state).ShaderProgram);
				}
			} else {
				if (opaque) {
					if (!R.opaqueTextureShaders.has(state))
						R.opaqueTextureShaders.set(state, OpaqueTextureShader.Create(state));
					this.vertexArrayObject = new VertexArrayObject(state, R.opaqueTextureShaders.get(state).ShaderProgram);
				} else {
					if (!R.textureShaders.has(state))
						R.textureShaders.set(state, TextureShader.Create(state));
					this.vertexArrayObject = new VertexArrayObject(state, R.textureShaders.get(state).ShaderProgram);
				}
			}
		}

		if (is3D) {
			this.vectorBuffer = new VectorBuffer(state, false);
			this.alphaBuffer = new ByteBuffer(state, true);
		} else
			this.positionBuffer = new FloatPositionBuffer(state, false);
		this.indexBuffer = new IndexBuffer(state);

		if (texturesWithAlpha || imageWithoutPalette)
			this.alphaBuffer = new ByteBuffer(state, false);

		if (fow) {
			this.baseLineBuffer = new WordBuffer(state, true);
			this.centerBuffer = new FloatPositionBuffer(state, false);
			this.radiusBuffer = new ByteBuffer(state, false);

			this.vertexArrayObject.AddBuffer(ColorShader.DefaultLayerName, this.baseLineBuffer);
			this.vertexArrayObject.AddBuffer(FowShader.DefaultCenterName, this.centerBuffer);
			this.vertexArrayObject.AddBuffer(FowShader.DefaultRadiusName, this.radiusBuffer);
		} else if (noTexture) {
			this.colorBuffer = new ColorBuffer(state, true);
			this.layerBuffer = new ByteBuffer(state, true);

			this.vertexArrayObject.AddBuffer(ColorShader.DefaultColorName, this.colorBuffer);
			this.vertexArrayObject.AddBuffer(ColorShader.DefaultLayerName, this.layerBuffer);
		} else {
			if (!imageWithoutPalette)
				this.paletteIndexBuffer = new ByteBuffer(state, true);
			this.textureAtlasOffsetBuffer = new PositionBuffer(state, !supportAnimations);

			if (isText) {
				this.textColorIndexBuffer = new ByteBuffer(state, true);

				this.vertexArrayObject.AddBuffer(TextShader.DefaultTextColorIndexName, this.textColorIndexBuffer);
			}

			if (!isText && !is3D && !imageWithoutPalette) {
				this.maskColorBuffer = new ByteBuffer(state, !supportAnimations);

				this.vertexArrayObject.AddBuffer(TextureShader.DefaultMaskColorIndexName, this.maskColorBuffer);
			}

			if (layered || isText) {
				this.layerBuffer = new ByteBuffer(state, true);

				this.vertexArrayObject.AddBuffer(ColorShader.DefaultLayerName, this.layerBuffer);
			} else if (!is3D) {
				this.baseLineBuffer = new WordBuffer(state, false);

				this.vertexArrayObject.AddBuffer(ColorShader.DefaultLayerName, this.baseLineBuffer);
			} else {
				this.textureSizeBuffer = new PositionBuffer(state, true);
				this.textureEndCoordBuffer = new PositionBuffer(state, true);

				this.vertexArrayObject.AddBuffer(Texture3DShader.DefaultTexSizeName, this.textureSizeBuffer);
				this.vertexArrayObject.AddBuffer(Texture3DShader.DefaultTexEndCoordName, this.textureEndCoordBuffer);
			}
		}

		if (isBillboard) {
			this.billboardCenterBuffer = new VectorBuffer(state, false);
			this.billboardOrientationBuffer = new ByteBuffer(state, true);
			this.extrudeBuffer = new FloatBuffer(state, true);

			this.vertexArrayObject.AddBuffer(Billboard3DShader.DefaultBillboardCenterName, this.billboardCenterBuffer);
			this.vertexArrayObject.AddBuffer(Billboard3DShader.DefaultBillboardOrientationName, this.billboardOrientationBuffer);
			this.vertexArrayObject.AddBuffer(Billboard3DShader.DefaultExtrudeName, this.extrudeBuffer);
		}

		if (is3D) {
			this.vertexArrayObject.AddBuffer(ColorShader.DefaultPositionName, this.vectorBuffer);
			this.vertexArrayObject.AddBuffer(Texture3DShader.DefaultAlphaName, this.alphaBuffer);
		} else
			this.vertexArrayObject.AddBuffer(ColorShader.DefaultPositionName, this.positionBuffer);
		this.vertexArrayObject.AddBuffer('index', this.indexBuffer);

		if (texturesWithAlpha || imageWithoutPalette)
			this.vertexArrayObject.AddBuffer(AlphaTextureShader.DefaultAlphaName, this.alphaBuffer);

		if (!fow && !noTexture) {
			if (!imageWithoutPalette)
				this.vertexArrayObject.AddBuffer(TextureShader.DefaultPaletteIndexName, this.paletteIndexBuffer);
			this.vertexArrayObject.AddBuffer(TextureShader.DefaultTexCoordName, this.textureAtlasOffsetBuffer);
		}
	}

	SetTextureFactor(factor) {
		if (this.textureFactor !== factor) {
			if (this.textureAtlasOffsetBuffer?.Size > 0 ||
				this.textureEndCoordBuffer?.Size > 0 ||
				this.textureSizeBuffer?.Size > 0)
				throw new AmbermoonException(ExceptionScope.Application, 'Texture factors cannot be changed after texture coordinates have been added.');

			this.textureFactor = factor;
		}
	}

	get ColorShader() { return getValue(RenderBuffer.colorShaders, this.state); }
	get TextureShader() { return getValue(RenderBuffer.textureShaders, this.state); }
	get OpaqueTextureShader() { return getValue(RenderBuffer.opaqueTextureShaders, this.state); }
	get Texture3DShader() { return getValue(RenderBuffer.texture3DShaders, this.state); }
	get Billboard3DShader() { return getValue(RenderBuffer.billboard3DShaders, this.state); }
	get TextShader() { return getValue(RenderBuffer.textShaders, this.state); }
	get SubPixelTextShader() { return getValue(RenderBuffer.subPixelTextShaders, this.state); }
	get FowShader() { return getValue(RenderBuffer.fowShaders, this.state); }
	get SkyShader() { return getValue(RenderBuffer.skyShaders, this.state); }
	get AlphaTextureShader() { return getValue(RenderBuffer.alphaTextureShaders, this.state); }
	get ImageShader() { return getValue(RenderBuffer.imageShaders, this.state); }
	get FadingTextureShader() { return getValue(RenderBuffer.fadingTextureShaders, this.state); }

	/**
	 * GetDrawIndex(fow, positionTransformation, sizeTransformation)
	 * GetDrawIndex(coloredRect, positionTransformation, sizeTransformation)
	 * GetDrawIndex(sprite, positionTransformation, sizeTransformation, textColorIndex = null)
	 * GetDrawIndex(surface)
	 */
	GetDrawIndex(node, positionTransformation, sizeTransformation, textColorIndex = null) {
		if (node instanceof Fow)
			return this.GetFowDrawIndex(node, positionTransformation, sizeTransformation);
		if (node instanceof ColoredRect)
			return this.GetColoredRectDrawIndex(node, positionTransformation, sizeTransformation);
		if (isSurface3D(node))
			return this.GetSurfaceDrawIndex(node);

		return this.GetSpriteDrawIndex(node, positionTransformation, sizeTransformation, textColorIndex);
	}

	/** C# overload GetDrawIndex(IFow, ...) */
	GetFowDrawIndex(fow, positionTransformation, sizeTransformation) {
		let position = new FloatPosition(fow.X, fow.Y);
		let size = new FloatSize(fow.Width, fow.Height);
		let center = new FloatPosition(fow.Center);

		if (positionTransformation != null) {
			position = positionTransformation(position);
			center = positionTransformation(center);
		}

		if (sizeTransformation != null)
			size = sizeTransformation(size);

		const index = this.positionBuffer.Add(position.X, position.Y);
		this.positionBuffer.Add(position.X + size.Width, position.Y, index + 1);
		this.positionBuffer.Add(position.X + size.Width, position.Y + size.Height, index + 2);
		this.positionBuffer.Add(position.X, position.Y + size.Height, index + 3);

		this.indexBuffer.InsertQuad(Math.trunc(index / 4));
		this.indexOrderChecked = false;

		let baseLineOffsetSize = new FloatSize(0, fow.BaseLineOffset);

		if (sizeTransformation != null)
			baseLineOffsetSize = sizeTransformation(baseLineOffsetSize);

		const baseLine = toUShort(Math.trunc(Math.min(UShortMaxValue, position.Y + size.Height + Util.Round(baseLineOffsetSize.Height))));

		this.baseLineBuffer.Add(baseLine, index);
		this.baseLineBuffer.Add(baseLine, index + 1);
		this.baseLineBuffer.Add(baseLine, index + 2);
		this.baseLineBuffer.Add(baseLine, index + 3);

		this.centerBuffer.Add(center.X, center.Y, index);
		this.centerBuffer.Add(center.X, center.Y, index + 1);
		this.centerBuffer.Add(center.X, center.Y, index + 2);
		this.centerBuffer.Add(center.X, center.Y, index + 3);

		this.radiusBuffer.Add(fow.Radius, index);
		this.radiusBuffer.Add(fow.Radius, index + 1);
		this.radiusBuffer.Add(fow.Radius, index + 2);
		this.radiusBuffer.Add(fow.Radius, index + 3);

		return index;
	}

	/** C# overload GetDrawIndex(IColoredRect, ...) */
	GetColoredRectDrawIndex(coloredRect, positionTransformation, sizeTransformation) {
		let position = new FloatPosition(coloredRect.X, coloredRect.Y);
		let size = new FloatSize(coloredRect.Width, coloredRect.Height);

		if (positionTransformation != null)
			position = positionTransformation(position);

		if (sizeTransformation != null)
			size = sizeTransformation(size);

		const index = this.positionBuffer.Add(position.X, position.Y);
		this.positionBuffer.Add(position.X + size.Width, position.Y, index + 1);
		this.positionBuffer.Add(position.X + size.Width, position.Y + size.Height, index + 2);
		this.positionBuffer.Add(position.X, position.Y + size.Height, index + 3);

		this.indexBuffer.InsertQuad(Math.trunc(index / 4));
		this.indexOrderChecked = false;

		if (this.layerBuffer != null) {
			const layerBufferIndex = this.layerBuffer.Add(coloredRect.DisplayLayer, index);
			this.layerBuffer.Add(coloredRect.DisplayLayer, layerBufferIndex + 1);
			this.layerBuffer.Add(coloredRect.DisplayLayer, layerBufferIndex + 2);
			this.layerBuffer.Add(coloredRect.DisplayLayer, layerBufferIndex + 3);
		}

		if (this.colorBuffer != null) {
			const color = coloredRect.Color;

			const colorBufferIndex = this.colorBuffer.Add(color, index);
			this.colorBuffer.Add(color, colorBufferIndex + 1);
			this.colorBuffer.Add(color, colorBufferIndex + 2);
			this.colorBuffer.Add(color, colorBufferIndex + 3);
		}

		return index;
	}

	/**
	 * Clipping of the texture coordinates (shared by GetDrawIndex(ISprite) and UpdateTextureAtlasOffset(ISprite)).
	 * Returns [position, spriteSize, textureAtlasOffset, textureSize].
	 */
	clipSpriteTexture(sprite) {
		const position = new FloatPosition(sprite.X, sprite.Y);
		const spriteSize = new Size(sprite.Width, sprite.Height);
		const textureAtlasOffset = new Position(sprite.TextureAtlasOffset);
		const textureSize = new Size(sprite.TextureSize ?? spriteSize);

		if (sprite.ClipArea != null) {
			const textureWidthFactor = Math.fround(spriteSize.Width / textureSize.Width);
			const textureHeightFactor = Math.fround(spriteSize.Height / textureSize.Height);
			const oldX = position.X;
			const oldY = position.Y;
			const oldWidth = spriteSize.Width;
			const oldHeight = spriteSize.Height;
			sprite.ClipArea.ClipRect(position, spriteSize);
			textureAtlasOffset.Y += Util.Round((position.Y - oldY) / textureHeightFactor);
			textureSize.Width -= Util.Round((oldWidth - spriteSize.Width) / textureWidthFactor);
			textureSize.Height -= Util.Round((oldHeight - spriteSize.Height) / textureHeightFactor);

			if (sprite.MirrorX) {
				const oldRight = oldX + oldWidth;
				const newRight = position.X + spriteSize.Width;
				textureAtlasOffset.X += Util.Round((oldRight - newRight) / textureWidthFactor);
			} else {
				textureAtlasOffset.X += Util.Round((position.X - oldX) / textureWidthFactor);
			}
		}

		return [position, spriteSize, textureAtlasOffset, textureSize];
	}

	/** C# overload GetDrawIndex(ISprite, ...) */
	GetSpriteDrawIndex(sprite, positionTransformation, sizeTransformation, textColorIndex = null) {
		let [position, spriteSize, textureAtlasOffset, textureSize] = this.clipSpriteTexture(sprite);

		let size = new FloatSize(spriteSize);

		if (positionTransformation != null)
			position = positionTransformation(position);

		if (sizeTransformation != null)
			size = sizeTransformation(size);

		const index = this.positionBuffer.Add(position.X, position.Y);
		this.positionBuffer.Add(position.X + size.Width, position.Y, index + 1);
		this.positionBuffer.Add(position.X + size.Width, position.Y + size.Height, index + 2);
		this.positionBuffer.Add(position.X, position.Y + size.Height, index + 3);

		this.indexBuffer.InsertQuad(Math.trunc(index / 4));
		this.indexOrderChecked = false;

		if (this.paletteIndexBuffer != null) {
			const paletteIndexBufferIndex = this.paletteIndexBuffer.Add(sprite.PaletteIndex, index);
			this.paletteIndexBuffer.Add(sprite.PaletteIndex, paletteIndexBufferIndex + 1);
			this.paletteIndexBuffer.Add(sprite.PaletteIndex, paletteIndexBufferIndex + 2);
			this.paletteIndexBuffer.Add(sprite.PaletteIndex, paletteIndexBufferIndex + 3);
		}

		if (this.textureAtlasOffsetBuffer != null) {
			textureSize = Size.op_Multiply(textureSize, Math.trunc(this.textureFactor));

			const buffer = this.textureAtlasOffsetBuffer;

			if (sprite.MirrorX) {
				const textureAtlasOffsetBufferIndex = buffer.Add(toShort(textureAtlasOffset.X + textureSize.Width), toShort(textureAtlasOffset.Y), index);
				buffer.Add(toShort(textureAtlasOffset.X), toShort(textureAtlasOffset.Y), textureAtlasOffsetBufferIndex + 1);
				buffer.Add(toShort(textureAtlasOffset.X), toShort(textureAtlasOffset.Y + textureSize.Height), textureAtlasOffsetBufferIndex + 2);
				buffer.Add(toShort(textureAtlasOffset.X + textureSize.Width), toShort(textureAtlasOffset.Y + textureSize.Height), textureAtlasOffsetBufferIndex + 3);
			} else {
				const textureAtlasOffsetBufferIndex = buffer.Add(toShort(textureAtlasOffset.X), toShort(textureAtlasOffset.Y), index);
				buffer.Add(toShort(textureAtlasOffset.X + textureSize.Width), toShort(textureAtlasOffset.Y), textureAtlasOffsetBufferIndex + 1);
				buffer.Add(toShort(textureAtlasOffset.X + textureSize.Width), toShort(textureAtlasOffset.Y + textureSize.Height), textureAtlasOffsetBufferIndex + 2);
				buffer.Add(toShort(textureAtlasOffset.X), toShort(textureAtlasOffset.Y + textureSize.Height), textureAtlasOffsetBufferIndex + 3);
			}
		}

		if (this.baseLineBuffer != null) {
			let baseLineOffsetSize = new FloatSize(0, sprite.BaseLineOffset);

			if (sizeTransformation != null)
				baseLineOffsetSize = sizeTransformation(baseLineOffsetSize);

			const baseLine = toUShort(Math.trunc(Math.min(UShortMaxValue, position.Y + size.Height + Util.Round(baseLineOffsetSize.Height))));
			const baseLineBufferIndex = this.baseLineBuffer.Add(baseLine, index);
			this.baseLineBuffer.Add(baseLine, baseLineBufferIndex + 1);
			this.baseLineBuffer.Add(baseLine, baseLineBufferIndex + 2);
			this.baseLineBuffer.Add(baseLine, baseLineBufferIndex + 3);
		}

		if (this.layerBuffer != null) {
			const layer = isLayerSprite(sprite) ? sprite.DisplayLayer : 0;
			const layerBufferIndex = this.layerBuffer.Add(layer, index);
			this.layerBuffer.Add(layer, layerBufferIndex + 1);
			this.layerBuffer.Add(layer, layerBufferIndex + 2);
			this.layerBuffer.Add(layer, layerBufferIndex + 3);
		}

		if (this.maskColorBuffer != null) {
			const color = sprite.MaskColor ?? 0;
			const maskColorBufferIndex = this.maskColorBuffer.Add(color, index);
			this.maskColorBuffer.Add(color, maskColorBufferIndex + 1);
			this.maskColorBuffer.Add(color, maskColorBufferIndex + 2);
			this.maskColorBuffer.Add(color, maskColorBufferIndex + 3);
		}

		if (this.textColorIndexBuffer != null) {
			if (textColorIndex == null)
				throw new AmbermoonException(ExceptionScope.Render, 'No text color index given but text color index buffer is active.');

			const textColorIndexBufferIndex = this.textColorIndexBuffer.Add(textColorIndex, index);
			this.textColorIndexBuffer.Add(textColorIndex, textColorIndexBufferIndex + 1);
			this.textColorIndexBuffer.Add(textColorIndex, textColorIndexBufferIndex + 2);
			this.textColorIndexBuffer.Add(textColorIndex, textColorIndexBufferIndex + 3);
		}

		if (this.alphaBuffer != null) {
			const alpha = sprite instanceof AlphaSprite ? sprite.Alpha : 0xff;
			const alphaBufferIndex = this.alphaBuffer.Add(alpha, index);
			this.alphaBuffer.Add(alpha, alphaBufferIndex + 1);
			this.alphaBuffer.Add(alpha, alphaBufferIndex + 2);
			this.alphaBuffer.Add(alpha, alphaBufferIndex + 3);
		}

		return index;
	}

	/** C# overload GetDrawIndex(ISurface3D) */
	GetSurfaceDrawIndex(surface) {
		const vectorBuffer = this.vectorBuffer;
		let index;

		switch (surface.Type) {
			case SurfaceType.Billboard:
				index = vectorBuffer.Add(surface.X - 0.5 * surface.Width, surface.Y, surface.Z);
				break;
			case SurfaceType.BillboardFloor:
				index = vectorBuffer.Add(surface.X - 0.5 * surface.Width, surface.Y + 0.5 * surface.Height, surface.Z);
				break;
			default:
				index = vectorBuffer.Add(surface.X, surface.Y, surface.Z);
				break;
		}

		switch (surface.Type) {
			case SurfaceType.Floor:
				vectorBuffer.Add(surface.X, surface.Y, surface.Z + surface.Height);
				vectorBuffer.Add(surface.X + surface.Width, surface.Y, surface.Z + surface.Height);
				vectorBuffer.Add(surface.X + surface.Width, surface.Y, surface.Z);
				break;
			case SurfaceType.Ceiling:
				vectorBuffer.Add(surface.X, surface.Y, surface.Z - surface.Height);
				vectorBuffer.Add(surface.X + surface.Width, surface.Y, surface.Z - surface.Height);
				vectorBuffer.Add(surface.X + surface.Width, surface.Y, surface.Z);
				break;
			case SurfaceType.Wall:
				switch (surface.WallOrientation) {
					case WallOrientation.Normal:
						vectorBuffer.Add(surface.X + surface.Width, surface.Y, surface.Z);
						vectorBuffer.Add(surface.X + surface.Width, surface.Y - surface.Height, surface.Z);
						vectorBuffer.Add(surface.X, surface.Y - surface.Height, surface.Z);
						break;
					case WallOrientation.Rotated90:
						vectorBuffer.Add(surface.X, surface.Y, surface.Z + surface.Width);
						vectorBuffer.Add(surface.X, surface.Y - surface.Height, surface.Z + surface.Width);
						vectorBuffer.Add(surface.X, surface.Y - surface.Height, surface.Z);
						break;
					case WallOrientation.Rotated180:
						vectorBuffer.Add(surface.X - surface.Width, surface.Y, surface.Z);
						vectorBuffer.Add(surface.X - surface.Width, surface.Y - surface.Height, surface.Z);
						vectorBuffer.Add(surface.X, surface.Y - surface.Height, surface.Z);
						break;
					case WallOrientation.Rotated270:
						vectorBuffer.Add(surface.X, surface.Y, surface.Z - surface.Width);
						vectorBuffer.Add(surface.X, surface.Y - surface.Height, surface.Z - surface.Width);
						vectorBuffer.Add(surface.X, surface.Y - surface.Height, surface.Z);
						break;
				}
				break;
			case SurfaceType.Billboard:
				vectorBuffer.Add(surface.X + 0.5 * surface.Width, surface.Y, surface.Z);
				vectorBuffer.Add(surface.X + 0.5 * surface.Width, surface.Y - surface.Height, surface.Z);
				vectorBuffer.Add(surface.X - 0.5 * surface.Width, surface.Y - surface.Height, surface.Z);
				break;
			case SurfaceType.BillboardFloor:
			{
				vectorBuffer.Add(surface.X + 0.5 * surface.Width, surface.Y + 0.5 * surface.Height, surface.Z);
				vectorBuffer.Add(surface.X + 0.5 * surface.Width, surface.Y - 0.5 * surface.Height, surface.Z);
				vectorBuffer.Add(surface.X - 0.5 * surface.Width, surface.Y - 0.5 * surface.Height, surface.Z);
				break;
			}
		}

		this.indexBuffer.InsertQuad(Math.trunc(index / 4));
		this.indexOrderChecked = false;

		if (this.paletteIndexBuffer != null) {
			const paletteIndexBufferIndex = this.paletteIndexBuffer.Add(surface.PaletteIndex, index);
			this.paletteIndexBuffer.Add(surface.PaletteIndex, paletteIndexBufferIndex + 1);
			this.paletteIndexBuffer.Add(surface.PaletteIndex, paletteIndexBufferIndex + 2);
			this.paletteIndexBuffer.Add(surface.PaletteIndex, paletteIndexBufferIndex + 3);
		}

		if (this.alphaBuffer != null) {
			const alpha = surface.Alpha ? 1 : surface.Type === SurfaceType.Wall ? 2 : 0;
			const alphaBufferIndex = this.alphaBuffer.Add(alpha, index);
			this.alphaBuffer.Add(alpha, alphaBufferIndex + 1);
			this.alphaBuffer.Add(alpha, alphaBufferIndex + 2);
			this.alphaBuffer.Add(alpha, alphaBufferIndex + 3);
		}

		const textureFactor = this.textureFactor;
		const offset = surface.TextureAtlasOffset;

		if (this.textureAtlasOffsetBuffer != null) {
			const buffer = this.textureAtlasOffsetBuffer;
			const mappedTextureSize = new Size(Math.trunc(surface.MappedTextureWidth * textureFactor), Math.trunc(surface.MappedTextureHeight * textureFactor));

			if (surface.Type === SurfaceType.Floor) {
				const textureAtlasOffsetBufferIndex = buffer.Add(toShort(offset.X), toShort(offset.Y + mappedTextureSize.Height), index);
				buffer.Add(toShort(offset.X), toShort(offset.Y), textureAtlasOffsetBufferIndex + 1);
				buffer.Add(toShort(offset.X + mappedTextureSize.Width), toShort(offset.Y), textureAtlasOffsetBufferIndex + 2);
				buffer.Add(toShort(offset.X + mappedTextureSize.Width), toShort(offset.Y + mappedTextureSize.Height), textureAtlasOffsetBufferIndex + 3);
			} else if (surface.Type === SurfaceType.Ceiling) {
				const textureAtlasOffsetBufferIndex = buffer.Add(toShort(offset.X), toShort(offset.Y), index);
				buffer.Add(toShort(offset.X), toShort(offset.Y + mappedTextureSize.Height), textureAtlasOffsetBufferIndex + 1);
				buffer.Add(toShort(offset.X + mappedTextureSize.Width), toShort(offset.Y + mappedTextureSize.Height), textureAtlasOffsetBufferIndex + 2);
				buffer.Add(toShort(offset.X + mappedTextureSize.Width), toShort(offset.Y), textureAtlasOffsetBufferIndex + 3);
			} else if (surface.Type === SurfaceType.Billboard) {
				const textureAtlasOffsetBufferIndex = buffer.Add(toShort(offset.X), toShort(offset.Y), index);
				buffer.Add(toShort(offset.X + mappedTextureSize.Width), toShort(offset.Y), textureAtlasOffsetBufferIndex + 1);
				buffer.Add(toShort(offset.X + mappedTextureSize.Width), toShort(offset.Y + mappedTextureSize.Height), textureAtlasOffsetBufferIndex + 2);
				buffer.Add(toShort(offset.X), toShort(offset.Y + mappedTextureSize.Height), textureAtlasOffsetBufferIndex + 3);
			} else if (surface.Type === SurfaceType.BillboardFloor) {
				const textureAtlasOffsetBufferIndex = buffer.Add(toShort(offset.X), toShort(offset.Y + mappedTextureSize.Height), index);
				buffer.Add(toShort(offset.X + mappedTextureSize.Width), toShort(offset.Y + mappedTextureSize.Height), textureAtlasOffsetBufferIndex + 1);
				buffer.Add(toShort(offset.X + mappedTextureSize.Width), toShort(offset.Y), textureAtlasOffsetBufferIndex + 2);
				buffer.Add(toShort(offset.X), toShort(offset.Y), textureAtlasOffsetBufferIndex + 3);
			} else if (surface.Type === SurfaceType.Wall) {
				const textureAtlasOffsetBufferIndex = buffer.Add(toShort(offset.X + mappedTextureSize.Width), toShort(offset.Y), index);
				buffer.Add(toShort(offset.X), toShort(offset.Y), textureAtlasOffsetBufferIndex + 1);
				buffer.Add(toShort(offset.X), toShort(offset.Y + mappedTextureSize.Height), textureAtlasOffsetBufferIndex + 2);
				buffer.Add(toShort(offset.X + mappedTextureSize.Width), toShort(offset.Y + mappedTextureSize.Height), textureAtlasOffsetBufferIndex + 3);
			}
		}

		const textureSize = new Size(Math.trunc(surface.TextureWidth * textureFactor), Math.trunc(surface.TextureHeight * textureFactor));

		if (this.textureEndCoordBuffer != null) {
			// web port: the texture atlas offset of animated surfaces already points to the current frame, so the frame
			// ends one frame width after it (the enhanced 3D shaders derive the texture start from the end coordinate)
			const endX = toShort(offset.X + textureSize.Width);
			const endY = toShort(offset.Y + textureSize.Height);
			const textureEndCoordBufferIndex = this.textureEndCoordBuffer.Add(endX, endY, index);
			this.textureEndCoordBuffer.Add(endX, endY, textureEndCoordBufferIndex + 1);
			this.textureEndCoordBuffer.Add(endX, endY, textureEndCoordBufferIndex + 2);
			this.textureEndCoordBuffer.Add(endX, endY, textureEndCoordBufferIndex + 3);
		}

		if (this.textureSizeBuffer != null) {
			const width = toShort(textureSize.Width);
			const height = toShort(textureSize.Height);
			const textureSizeBufferIndex = this.textureSizeBuffer.Add(width, height, index);
			this.textureSizeBuffer.Add(width, height, textureSizeBufferIndex + 1);
			this.textureSizeBuffer.Add(width, height, textureSizeBufferIndex + 2);
			this.textureSizeBuffer.Add(width, height, textureSizeBufferIndex + 3);
		}

		if (this.billboardCenterBuffer != null) {
			const billboardCenterBufferIndex = this.billboardCenterBuffer.Add(surface.X, surface.Y, surface.Z, index);
			this.billboardCenterBuffer.Add(surface.X, surface.Y, surface.Z, billboardCenterBufferIndex + 1);
			this.billboardCenterBuffer.Add(surface.X, surface.Y, surface.Z, billboardCenterBufferIndex + 2);
			this.billboardCenterBuffer.Add(surface.X, surface.Y, surface.Z, billboardCenterBufferIndex + 3);
		}

		if (this.billboardOrientationBuffer != null) {
			const floor = surface.Type === SurfaceType.BillboardFloor ? 1 : 0;
			const billboardOrientationBufferIndex = this.billboardOrientationBuffer.Add(floor, index);
			this.billboardOrientationBuffer.Add(floor, billboardOrientationBufferIndex + 1);
			this.billboardOrientationBuffer.Add(floor, billboardOrientationBufferIndex + 2);
			this.billboardOrientationBuffer.Add(floor, billboardOrientationBufferIndex + 3);
		}

		if (this.extrudeBuffer != null) {
			const extrudeBufferIndex = this.extrudeBuffer.Add(surface.Extrude, index);
			this.extrudeBuffer.Add(surface.Extrude, extrudeBufferIndex + 1);
			this.extrudeBuffer.Add(surface.Extrude, extrudeBufferIndex + 2);
			this.extrudeBuffer.Add(surface.Extrude, extrudeBufferIndex + 3);
		}

		return index;
	}

	/**
	 * UpdatePosition(index, renderNode, baseLineOffset, positionTransformation, sizeTransformation)
	 * UpdatePosition(index, surface)
	 */
	UpdatePosition(index, renderNode, baseLineOffset, positionTransformation, sizeTransformation) {
		if (isSurface3D(renderNode)) {
			this.UpdateSurfacePosition(index, renderNode);
			return;
		}

		let position = new FloatPosition(renderNode.X, renderNode.Y);
		let size = new FloatSize(renderNode.Width, renderNode.Height);

		renderNode.ClipArea?.ClipRect(position, size);

		if (positionTransformation != null)
			position = positionTransformation(position);

		if (sizeTransformation != null)
			size = sizeTransformation(size);

		this.positionBuffer.Update(index, position.X, position.Y);
		this.positionBuffer.Update(index + 1, position.X + size.Width, position.Y);
		this.positionBuffer.Update(index + 2, position.X + size.Width, position.Y + size.Height);
		this.positionBuffer.Update(index + 3, position.X, position.Y + size.Height);

		if (this.baseLineBuffer != null) {
			let baseLineOffsetSize = new Size(0, baseLineOffset);

			if (sizeTransformation != null)
				baseLineOffsetSize = sizeTransformation(new FloatSize(baseLineOffsetSize)).ToSize();

			const baseLine = toUShort(Math.trunc(Math.min(UShortMaxValue, position.Y + size.Height + baseLineOffsetSize.Height)));

			this.baseLineBuffer.Update(index, baseLine);
			this.baseLineBuffer.Update(index + 1, baseLine);
			this.baseLineBuffer.Update(index + 2, baseLine);
			this.baseLineBuffer.Update(index + 3, baseLine);
		}
	}

	/** C# overload UpdatePosition(int index, ISurface3D surface) */
	UpdateSurfacePosition(index, surface) {
		const vectorBuffer = this.vectorBuffer;

		if (surface.Type === SurfaceType.Billboard) {
			const x = surface.X - surface.Width * 0.5;

			vectorBuffer.Update(index, x, surface.Y, surface.Z);
			vectorBuffer.Update(index + 1, x + surface.Width, surface.Y, surface.Z);
			vectorBuffer.Update(index + 2, x + surface.Width, surface.Y - surface.Height, surface.Z);
			vectorBuffer.Update(index + 3, x, surface.Y - surface.Height, surface.Z);

			if (this.billboardCenterBuffer != null) {
				this.billboardCenterBuffer.Update(index, surface.X, surface.Y, surface.Z);
				this.billboardCenterBuffer.Update(index + 1, surface.X, surface.Y, surface.Z);
				this.billboardCenterBuffer.Update(index + 2, surface.X, surface.Y, surface.Z);
				this.billboardCenterBuffer.Update(index + 3, surface.X, surface.Y, surface.Z);
			}

			if (this.billboardOrientationBuffer != null) {
				this.billboardOrientationBuffer.Update(index, 0);
				this.billboardOrientationBuffer.Update(index + 1, 0);
				this.billboardOrientationBuffer.Update(index + 2, 0);
				this.billboardOrientationBuffer.Update(index + 3, 0);
			}
		} else if (surface.Type === SurfaceType.BillboardFloor) {
			const x = surface.X - surface.Width * 0.5;

			vectorBuffer.Update(index, x, surface.Y + 0.5 * surface.Height, surface.Z);
			vectorBuffer.Update(index + 1, x + surface.Width, surface.Y + 0.5 * surface.Height, surface.Z);
			vectorBuffer.Update(index + 2, x + surface.Width, surface.Y - 0.5 * surface.Height, surface.Z);
			vectorBuffer.Update(index + 3, x, surface.Y - 0.5 * surface.Height, surface.Z);

			if (this.billboardCenterBuffer != null) {
				this.billboardCenterBuffer.Update(index, surface.X, surface.Y, surface.Z);
				this.billboardCenterBuffer.Update(index + 1, surface.X, surface.Y, surface.Z);
				this.billboardCenterBuffer.Update(index + 2, surface.X, surface.Y, surface.Z);
				this.billboardCenterBuffer.Update(index + 3, surface.X, surface.Y, surface.Z);
			}

			if (this.billboardOrientationBuffer != null) {
				this.billboardOrientationBuffer.Update(index, 1);
				this.billboardOrientationBuffer.Update(index + 1, 1);
				this.billboardOrientationBuffer.Update(index + 2, 1);
				this.billboardOrientationBuffer.Update(index + 3, 1);
			}
		} else {
			vectorBuffer.Update(index, surface.X, surface.Y, surface.Z);

			switch (surface.Type) {
				case SurfaceType.Floor:
					vectorBuffer.Update(index + 1, surface.X, surface.Y, surface.Z + surface.Height);
					vectorBuffer.Update(index + 2, surface.X + surface.Width, surface.Y, surface.Z + surface.Height);
					vectorBuffer.Update(index + 3, surface.X + surface.Width, surface.Y, surface.Z);
					break;
				case SurfaceType.Ceiling:
					vectorBuffer.Update(index + 1, surface.X, surface.Y, surface.Z - surface.Height);
					vectorBuffer.Update(index + 2, surface.X + surface.Width, surface.Y, surface.Z - surface.Height);
					vectorBuffer.Update(index + 3, surface.X + surface.Width, surface.Y, surface.Z);
					break;
				case SurfaceType.Wall:
					switch (surface.WallOrientation) {
						case WallOrientation.Normal:
							vectorBuffer.Update(index + 1, surface.X + surface.Width, surface.Y, surface.Z);
							vectorBuffer.Update(index + 2, surface.X + surface.Width, surface.Y - surface.Height, surface.Z);
							vectorBuffer.Update(index + 3, surface.X, surface.Y - surface.Height, surface.Z);
							break;
						case WallOrientation.Rotated90:
							vectorBuffer.Update(index + 1, surface.X, surface.Y, surface.Z + surface.Width);
							vectorBuffer.Update(index + 2, surface.X, surface.Y - surface.Height, surface.Z + surface.Width);
							vectorBuffer.Update(index + 3, surface.X, surface.Y - surface.Height, surface.Z);
							break;
						case WallOrientation.Rotated180:
							vectorBuffer.Update(index + 1, surface.X - surface.Width, surface.Y, surface.Z);
							vectorBuffer.Update(index + 2, surface.X - surface.Width, surface.Y - surface.Height, surface.Z);
							vectorBuffer.Update(index + 3, surface.X, surface.Y - surface.Height, surface.Z);
							break;
						case WallOrientation.Rotated270:
							vectorBuffer.Update(index + 1, surface.X, surface.Y, surface.Z - surface.Width);
							vectorBuffer.Update(index + 2, surface.X, surface.Y - surface.Height, surface.Z - surface.Width);
							vectorBuffer.Update(index + 3, surface.X, surface.Y - surface.Height, surface.Z);
							break;
						default:
							throw new AmbermoonException(ExceptionScope.Render, 'Invalid wall orientation.');
					}
					break;
				default:
					throw new AmbermoonException(ExceptionScope.Render, 'Invalid surface type.');
			}
		}
	}

	UpdateMaskColor(index, maskColor) {
		if (this.maskColorBuffer != null) {
			const color = maskColor ?? 0;
			this.maskColorBuffer.Update(index, color);
			this.maskColorBuffer.Update(index + 1, color);
			this.maskColorBuffer.Update(index + 2, color);
			this.maskColorBuffer.Update(index + 3, color);
		}
	}

	/**
	 * UpdateTextureAtlasOffset(index, sprite) or UpdateTextureAtlasOffset(index, surface)
	 */
	UpdateTextureAtlasOffset(index, node) {
		if (isSurface3D(node)) {
			this.UpdateSurfaceTextureAtlasOffset(index, node);
			return;
		}

		const sprite = node;

		if (this.textureAtlasOffsetBuffer == null)
			return;

		let [, , textureAtlasOffset, textureSize] = this.clipSpriteTexture(sprite);

		textureSize = Size.op_Multiply(textureSize, Math.trunc(this.textureFactor));

		const buffer = this.textureAtlasOffsetBuffer;

		if (sprite.MirrorX) {
			buffer.Update(index, toShort(textureAtlasOffset.X + textureSize.Width), toShort(textureAtlasOffset.Y));
			buffer.Update(index + 1, toShort(textureAtlasOffset.X), toShort(textureAtlasOffset.Y));
			buffer.Update(index + 2, toShort(textureAtlasOffset.X), toShort(textureAtlasOffset.Y + textureSize.Height));
			buffer.Update(index + 3, toShort(textureAtlasOffset.X + textureSize.Width), toShort(textureAtlasOffset.Y + textureSize.Height));
		} else {
			buffer.Update(index, toShort(textureAtlasOffset.X), toShort(textureAtlasOffset.Y));
			buffer.Update(index + 1, toShort(textureAtlasOffset.X + textureSize.Width), toShort(textureAtlasOffset.Y));
			buffer.Update(index + 2, toShort(textureAtlasOffset.X + textureSize.Width), toShort(textureAtlasOffset.Y + textureSize.Height));
			buffer.Update(index + 3, toShort(textureAtlasOffset.X), toShort(textureAtlasOffset.Y + textureSize.Height));
		}
	}

	/** C# overload UpdateTextureAtlasOffset(int index, ISurface3D surface) */
	UpdateSurfaceTextureAtlasOffset(index, surface) {
		const textureFactor = this.textureFactor;
		const offset = surface.TextureAtlasOffset;

		if (this.textureAtlasOffsetBuffer != null) {
			const buffer = this.textureAtlasOffsetBuffer;
			const mappedTextureSize = new Size(Math.trunc(surface.MappedTextureWidth * textureFactor), Math.trunc(surface.MappedTextureHeight * textureFactor));

			if (surface.Type === SurfaceType.Floor) {
				buffer.Update(index, toShort(offset.X), toShort(offset.Y + mappedTextureSize.Height));
				buffer.Update(index + 1, toShort(offset.X), toShort(offset.Y));
				buffer.Update(index + 2, toShort(offset.X + mappedTextureSize.Width), toShort(offset.Y));
				buffer.Update(index + 3, toShort(offset.X + mappedTextureSize.Width), toShort(offset.Y + mappedTextureSize.Height));
			} else if (surface.Type === SurfaceType.Ceiling) {
				buffer.Update(index, toShort(offset.X), toShort(offset.Y));
				buffer.Update(index + 1, toShort(offset.X), toShort(offset.Y + mappedTextureSize.Height));
				buffer.Update(index + 2, toShort(offset.X + mappedTextureSize.Width), toShort(offset.Y + mappedTextureSize.Height));
				buffer.Update(index + 3, toShort(offset.X + mappedTextureSize.Width), toShort(offset.Y));
			} else if (surface.Type === SurfaceType.Billboard) {
				buffer.Update(index, toShort(offset.X), toShort(offset.Y));
				buffer.Update(index + 1, toShort(offset.X + mappedTextureSize.Width), toShort(offset.Y));
				buffer.Update(index + 2, toShort(offset.X + mappedTextureSize.Width), toShort(offset.Y + mappedTextureSize.Height));
				buffer.Update(index + 3, toShort(offset.X), toShort(offset.Y + mappedTextureSize.Height));
			} else if (surface.Type === SurfaceType.BillboardFloor) {
				buffer.Update(index, toShort(offset.X), toShort(offset.Y + mappedTextureSize.Height));
				buffer.Update(index + 1, toShort(offset.X + mappedTextureSize.Width), toShort(offset.Y + mappedTextureSize.Height));
				buffer.Update(index + 2, toShort(offset.X + mappedTextureSize.Width), toShort(offset.Y));
				buffer.Update(index + 3, toShort(offset.X), toShort(offset.Y));
			} else if (surface.Type === SurfaceType.Wall) {
				buffer.Update(index, toShort(offset.X + mappedTextureSize.Width), toShort(offset.Y));
				buffer.Update(index + 1, toShort(offset.X), toShort(offset.Y));
				buffer.Update(index + 2, toShort(offset.X), toShort(offset.Y + mappedTextureSize.Height));
				buffer.Update(index + 3, toShort(offset.X + mappedTextureSize.Width), toShort(offset.Y + mappedTextureSize.Height));
			}
		}

		if (this.textureEndCoordBuffer != null) {
			const textureSize = new Size(Math.trunc(surface.TextureWidth * textureFactor), Math.trunc(surface.TextureHeight * textureFactor));
			// web port: the texture atlas offset of animated surfaces already points to the current frame, so the frame
			// ends one frame width after it (the enhanced 3D shaders derive the texture start from the end coordinate)
			const endX = toShort(offset.X + textureSize.Width);
			const endY = toShort(offset.Y + textureSize.Height);
			this.textureEndCoordBuffer.Update(index, endX, endY);
			this.textureEndCoordBuffer.Update(index + 1, endX, endY);
			this.textureEndCoordBuffer.Update(index + 2, endX, endY);
			this.textureEndCoordBuffer.Update(index + 3, endX, endY);
		}
	}

	UpdateColor(index, color) {
		if (this.colorBuffer != null) {
			this.colorBuffer.Update(index, color);
			this.colorBuffer.Update(index + 1, color);
			this.colorBuffer.Update(index + 2, color);
			this.colorBuffer.Update(index + 3, color);
		}
	}

	UpdateDisplayLayer(index, displayLayer) {
		if (this.layerBuffer != null) {
			this.layerBuffer.Update(index, displayLayer);
			this.layerBuffer.Update(index + 1, displayLayer);
			this.layerBuffer.Update(index + 2, displayLayer);
			this.layerBuffer.Update(index + 3, displayLayer);
		}
	}

	UpdateAlpha(index, alpha) {
		if (this.alphaBuffer != null) {
			this.alphaBuffer.Update(index, alpha);
			this.alphaBuffer.Update(index + 1, alpha);
			this.alphaBuffer.Update(index + 2, alpha);
			this.alphaBuffer.Update(index + 3, alpha);
		}
	}

	UpdateExtrude(index, extrude) {
		if (this.extrudeBuffer != null) {
			this.extrudeBuffer.Update(index, extrude);
			this.extrudeBuffer.Update(index + 1, extrude);
			this.extrudeBuffer.Update(index + 2, extrude);
			this.extrudeBuffer.Update(index + 3, extrude);
		}
	}

	UpdatePaletteIndex(index, paletteIndex) {
		if (this.paletteIndexBuffer != null) {
			this.paletteIndexBuffer.Update(index, paletteIndex);
			this.paletteIndexBuffer.Update(index + 1, paletteIndex);
			this.paletteIndexBuffer.Update(index + 2, paletteIndex);
			this.paletteIndexBuffer.Update(index + 3, paletteIndex);
		}
	}

	UpdateTextColorIndex(index, textColorIndex) {
		if (this.textColorIndexBuffer != null) {
			this.textColorIndexBuffer.Update(index, textColorIndex);
			this.textColorIndexBuffer.Update(index + 1, textColorIndex);
			this.textColorIndexBuffer.Update(index + 2, textColorIndex);
			this.textColorIndexBuffer.Update(index + 3, textColorIndex);
		}
	}

	UpdateRadius(index, radius) {
		if (this.radiusBuffer != null) {
			this.radiusBuffer.Update(index, radius);
			this.radiusBuffer.Update(index + 1, radius);
			this.radiusBuffer.Update(index + 2, radius);
			this.radiusBuffer.Update(index + 3, radius);
		}
	}

	UpdateCenter(index, center, positionTransformation) {
		if (this.centerBuffer != null) {
			let floatCenter = new FloatPosition(center);

			if (positionTransformation != null)
				floatCenter = positionTransformation(floatCenter);

			this.centerBuffer.Update(index, floatCenter.X, floatCenter.Y);
			this.centerBuffer.Update(index + 1, floatCenter.X, floatCenter.Y);
			this.centerBuffer.Update(index + 2, floatCenter.X, floatCenter.Y);
			this.centerBuffer.Update(index + 3, floatCenter.X, floatCenter.Y);
		}
	}

	FreeDrawIndex(index) {
		/*int newSize = -1;

		if (index == (positionBuffer.Size - 8) / 8)
		{
			int i = (index - 1) * 4;
			newSize = positionBuffer.Size - 8;

			while (i >= 0 && !positionBuffer.IsPositionValid(i))
			{
				i -= 4;
				newSize -= 8;
			}
		}*/

		for (let i = 3; i >= 0; --i) {
			if (this.positionBuffer != null) {
				this.positionBuffer.Update(index + i, FloatMaxValue, FloatMaxValue); // ensure it is not visible
				this.positionBuffer.Remove(index + i);
			} else if (this.vectorBuffer != null) {
				this.vectorBuffer.Update(index + i, FloatMaxValue, FloatMaxValue, FloatMaxValue); // ensure it is not visible
				this.vectorBuffer.Remove(index + i);
			}

			this.paletteIndexBuffer?.Remove(index + i);
			this.textureAtlasOffsetBuffer?.Remove(index + i);
			this.baseLineBuffer?.Remove(index + i);
			this.colorBuffer?.Remove(index + i);
			this.maskColorBuffer?.Remove(index + i);
			this.layerBuffer?.Remove(index + i);
			this.textColorIndexBuffer?.Remove(index + i);
			this.alphaBuffer?.Remove(index + i);
			this.billboardCenterBuffer?.Remove(index + i);
			this.textureSizeBuffer?.Remove(index + i);
			this.textureEndCoordBuffer?.Remove(index + i);
			this.billboardOrientationBuffer?.Remove(index + i);
			this.extrudeBuffer?.Remove(index + i);
			this.centerBuffer?.Remove(index + i);
			this.radiusBuffer?.Remove(index + i);
		}

		// TODO: this code causes problems. commented out for now
		/*if (newSize != -1)
		{
			positionBuffer.ReduceSizeTo(newSize);
			...
		}*/
	}

	Render() {
		if (this.disposed)
			return;

		const gl = this.state.Gl;

		this.vertexArrayObject.Bind();

		this.vertexArrayObject.Lock();

		try {
			// WebGL: drawElements without a bound element array buffer is an error even with count 0
			// (empty render buffers never bind their buffers), so empty buffers are not drawn.
			if (this.positionBuffer != null) {
				const count = Math.trunc(this.positionBuffer.Size / 4) * 3;
				if (count !== 0)
					gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_INT, 0);
			} else if (this.vectorBuffer != null) {
				const count = Math.trunc(this.vectorBuffer.Size / 2);
				if (count !== 0)
					gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_INT, 0);
			} else
				throw new AmbermoonException(ExceptionScope.Render, 'Neither position nor vector buffer exists.');
		} catch {
			// ignore for now
		} finally {
			this.vertexArrayObject.Unlock();
		}
	}

	EnsureCorrectRenderOrder() {
		// Already checked
		if (this.indexOrderChecked)
			return;

		// We need an index buffer
		if (this.indexBuffer == null)
			return;

		// We only support this for layer buffers right now as this is the only use case
		if (this.layerBuffer == null)
			return;

		this.indexBuffer.EnsureCorrectRenderOrder(this.layerBuffer);

		this.indexOrderChecked = true;
	}

	Dispose() {
		if (!this.disposed) {
			this.vertexArrayObject?.Dispose();

			this.alphaBuffer?.Dispose();
			this.baseLineBuffer?.Dispose();
			this.billboardCenterBuffer?.Dispose();
			this.billboardOrientationBuffer?.Dispose();
			this.centerBuffer?.Dispose();
			this.colorBuffer?.Dispose();
			this.extrudeBuffer?.Dispose();
			this.layerBuffer?.Dispose();
			this.maskColorBuffer?.Dispose();
			this.paletteIndexBuffer?.Dispose();
			this.positionBuffer?.Dispose();
			this.radiusBuffer?.Dispose();
			this.textColorIndexBuffer?.Dispose();
			this.textureAtlasOffsetBuffer?.Dispose();
			this.textureEndCoordBuffer?.Dispose();
			this.textureSizeBuffer?.Dispose();
			this.vectorBuffer?.Dispose();

			this.indexBuffer?.Dispose();

			this.disposed = true;
		}
	}
}
