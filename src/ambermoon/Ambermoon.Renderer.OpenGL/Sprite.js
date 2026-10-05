// Port of Ambermoon.Renderer.OpenGL/Sprite.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// Sprite.cs - Textured render nodes

import { toByte } from '../../runtime.js';
import { Position } from '../Ambermoon.Common/Position.js';
import { Size } from '../Ambermoon.Common/Size.js';
import { Util } from '../Ambermoon.Common/Util.js';
import { RenderNode } from './RenderNode.js';

/**
 * A sprite has a fixed size and an offset into the layer's texture atlas.
 * The layer will sort sprites by size and then by the texture atlas offset.
 */
export class Sprite extends RenderNode {
	constructor(width, height, textureAtlasX, textureAtlasY, virtualScreen) {
		super(width, height, virtualScreen);

		this.drawIndex = -1;
		this.textureAtlasOffset = null;
		this.baseLineOffset = 0;
		this.paletteIndex = 0;
		this.textureSize = null;
		this.mirrorX = false;
		this.maskColor = null;

		this.textureAtlasOffset = new Position(textureAtlasX, textureAtlasY);
	}

	get PaletteIndex() {
		return this.paletteIndex;
	}

	set PaletteIndex(value) {
		if (this.paletteIndex === value)
			return;

		this.paletteIndex = value;

		this.UpdatePaletteIndex();
	}

	get TextureAtlasOffset() {
		return this.textureAtlasOffset;
	}

	set TextureAtlasOffset(value) {
		if (Position.op_Equality(this.textureAtlasOffset, value))
			return;

		this.textureAtlasOffset = new Position(value);

		this.UpdateTextureAtlasOffset();
	}

	get TextureSize() {
		return this.textureSize;
	}

	set TextureSize(value) {
		if (Size.op_Equality(this.textureSize, value))
			return;

		if (value == null)
			this.textureSize = null;
		else
			this.textureSize = new Size(value);

		this.UpdateTextureAtlasOffset();
	}

	get BaseLineOffset() {
		return this.baseLineOffset;
	}

	set BaseLineOffset(value) {
		if (this.baseLineOffset === value)
			return;

		this.baseLineOffset = value;

		this.UpdatePosition();
	}

	get MirrorX() {
		return this.mirrorX;
	}

	set MirrorX(value) {
		if (this.mirrorX === value)
			return;

		this.mirrorX = value;

		this.UpdateTextureAtlasOffset();
	}

	get MaskColor() {
		return this.maskColor;
	}

	set MaskColor(value) {
		if (value === undefined)
			value = null;

		if (this.maskColor === value)
			return;

		this.maskColor = value;

		this.UpdateMaskColor();
	}

	AddToLayer() {
		this.drawIndex = this.Layer.GetDrawIndex(this);
	}

	RemoveFromLayer() {
		if (this.drawIndex !== -1) {
			this.Layer.FreeDrawIndex(this.drawIndex);
			this.drawIndex = -1;
		}
	}

	OnClipAreaChanged(onScreen, needUpdate) {
		if (onScreen && needUpdate) {
			this.UpdatePosition();
		}
	}

	UpdatePosition() {
		if (this.drawIndex !== -1) { // -1 means not attached to a layer
			this.Layer.UpdatePosition(this.drawIndex, this);

			if (this.ClipArea != null) // We need to adjust tex coords if clipped
				this.UpdateTextureAtlasOffset();
		}
	}

	UpdateTextureAtlasOffset() {
		if (this.drawIndex !== -1) // -1 means not attached to a layer
			this.Layer.UpdateTextureAtlasOffset(this.drawIndex, this);
	}

	UpdateMaskColor() {
		if (this.drawIndex !== -1) // -1 means not attached to a layer
			this.Layer.UpdateMaskColor(this.drawIndex, this.maskColor);
	}

	UpdatePaletteIndex() {
		if (this.drawIndex !== -1) // -1 means not attached to a layer
			this.Layer.UpdatePaletteIndex(this.drawIndex, this.PaletteIndex);
	}

	Resize(width, height) {
		if (this.Width === width && this.Height === height)
			return;

		super.Resize(width, height);

		this.UpdatePosition();

		if (this.ClipArea == null)
			this.UpdateTextureAtlasOffset();
	}
}

export class LayerSprite extends Sprite {
	constructor(width, height, textureAtlasX, textureAtlasY, displayLayer, virtualScreen) {
		super(width, height, textureAtlasX, textureAtlasY, virtualScreen);

		this.displayLayer = 0;
		this.displayLayer = displayLayer;
	}

	get DisplayLayer() {
		return this.displayLayer;
	}

	set DisplayLayer(value) {
		if (this.displayLayer === value)
			return;

		this.displayLayer = value;

		this.UpdateDisplayLayer();
	}

	UpdateDisplayLayer() {
		if (this.drawIndex !== -1) // -1 means not attached to a layer
			this.Layer.UpdateDisplayLayer(this.drawIndex, this.displayLayer);
	}
}

export class AlphaSprite extends LayerSprite {
	constructor(width, height, displayLayer, virtualScreen) {
		super(width, height, 0, 0, displayLayer, virtualScreen);

		this.alpha = 0xff;
	}

	get Alpha() {
		return this.alpha;
	}

	set Alpha(value) {
		if (this.alpha === value)
			return;

		const wasSemiTransparent = this.IsSemiTransparent;
		const newAlpha = toByte(Util.Limit(0, value, 255));
		const isSemiTransparent = newAlpha > 0 && newAlpha < 255;

		if (wasSemiTransparent === isSemiTransparent) {
			this.alpha = newAlpha;
			this.UpdateAlpha();
		} else if (this.drawIndex !== -1) {
			// We need to re-create the sprite.
			this.RemoveFromLayer();
			this.alpha = newAlpha;
			this.AddToLayer();
		} else {
			this.alpha = newAlpha;
		}
	}

	UpdateAlpha() {
		if (this.drawIndex !== -1) { // -1 means not attached to a layer
			this.Layer.UpdateAlpha(this.drawIndex, this.alpha);
		}
	}

	AddToLayer() {
		const renderLayer = this.Layer;

		if (this.IsSemiTransparent)
			this.drawIndex = renderLayer.GetDrawIndexWithAlpha(this);
		else
			this.drawIndex = renderLayer.GetDrawIndex(this);
	}

	RemoveFromLayer() {
		if (this.drawIndex !== -1) {
			const renderLayer = this.Layer;

			if (this.IsSemiTransparent)
				renderLayer.FreeDrawIndexWithAlpha(this.drawIndex);
			else
				renderLayer.FreeDrawIndex(this.drawIndex);

			this.drawIndex = -1;
		}
	}

	get IsSemiTransparent() { return this.alpha > 0 && this.alpha < 255; }

	UpdatePosition() {
		if (this.drawIndex !== -1) { // -1 means not attached to a layer
			const renderLayer = this.Layer;

			if (this.IsSemiTransparent)
				renderLayer.UpdatePositionWithAlpha(this.drawIndex, this);
			else
				renderLayer.UpdatePosition(this.drawIndex, this);

			if (this.ClipArea != null) // We need to adjust tex coords if clipped
				this.UpdateTextureAtlasOffset();
		}
	}

	UpdateTextureAtlasOffset() {
		if (this.drawIndex !== -1) { // -1 means not attached to a layer
			const renderLayer = this.Layer;

			if (this.IsSemiTransparent)
				renderLayer.UpdateTextureAtlasOffsetWithAlpha(this.drawIndex, this);
			else
				renderLayer.UpdateTextureAtlasOffset(this.drawIndex, this);
		}
	}

	UpdateMaskColor() {
		if (this.drawIndex !== -1) { // -1 means not attached to a layer
			const renderLayer = this.Layer;

			if (this.IsSemiTransparent)
				renderLayer.UpdateMaskColorWithAlpha(this.drawIndex, this.MaskColor);
			else
				renderLayer.UpdateMaskColor(this.drawIndex, this.MaskColor);
		}
	}

	UpdatePaletteIndex() {
		if (this.drawIndex !== -1) { // -1 means not attached to a layer
			const renderLayer = this.Layer;

			if (this.IsSemiTransparent)
				renderLayer.UpdatePaletteIndexWithAlpha(this.drawIndex, this.PaletteIndex);
			else
				renderLayer.UpdatePaletteIndex(this.drawIndex, this.PaletteIndex);
		}
	}
}

export class AnimatedSprite extends Sprite {
	constructor(width, height, textureAtlasX, textureAtlasY, virtualScreen, numFrames, textureAtlasWidth) {
		super(width, height, textureAtlasX, textureAtlasY, virtualScreen);

		this.initialTextureOffset = null;
		this.currentFrame = 0;
		this.alternate = false;
		this.TextureAtlasWidth = 0;
		this.NumFrames = 0;
		this.BaseFrame = 0;

		this.TextureAtlasWidth = textureAtlasWidth;
		this.initialTextureOffset = new Position(textureAtlasX, textureAtlasY);
		this.NumFrames = numFrames;
		this.CurrentFrame = 0;
	}

	get TextureAtlasOffset() {
		return super.TextureAtlasOffset;
	}

	set TextureAtlasOffset(value) {
		if (Position.op_Equality(this.TextureAtlasOffset, value))
			return;

		super.TextureAtlasOffset = value;
		this.initialTextureOffset = value;
	}

	get CurrentFrame() {
		return this.currentFrame;
	}

	set CurrentFrame(value) {
		if (this.NumFrames > 1) {
			let frameOffset = value >>> 0;
			if (this.alternate) {
				const animateForward = Math.trunc(frameOffset / this.NumFrames) % 2 === 0;
				frameOffset %= this.NumFrames;
				if (!animateForward)
					frameOffset = this.NumFrames - frameOffset - 1;
			} else
				frameOffset %= this.NumFrames;
			this.currentFrame = (this.BaseFrame + frameOffset) >>> 0;
			const size = this.TextureSize ?? new Size(this.Width, this.Height);
			const textureFactor = Math.trunc(this.Layer?.TextureFactor ?? 1);
			let newTextureOffsetX = this.initialTextureOffset.X + this.currentFrame * size.Width * textureFactor;
			let newTextureOffsetY = this.initialTextureOffset.Y;

			while (newTextureOffsetX >= this.TextureAtlasWidth) {
				newTextureOffsetX -= this.TextureAtlasWidth;
				newTextureOffsetY += size.Height * textureFactor;
			}

			super.TextureAtlasOffset = new Position(newTextureOffsetX, newTextureOffsetY);
		} else {
			this.currentFrame = this.BaseFrame;
		}
	}

	get Alternate() {
		return this.alternate;
	}

	set Alternate(value) {
		if (this.alternate === value)
			return;

		this.alternate = value;

		// This update the frame after alternate change.
		this.CurrentFrame = this.CurrentFrame;
	}
}

export class AnimatedLayerSprite extends AnimatedSprite {
	constructor(width, height, textureAtlasX, textureAtlasY, displayLayer, virtualScreen, numFrames, textureAtlasWidth) {
		super(width, height, textureAtlasX, textureAtlasY, virtualScreen, numFrames, textureAtlasWidth);

		this.displayLayer = 0;
		this.displayLayer = displayLayer;
	}

	get DisplayLayer() {
		return this.displayLayer;
	}

	set DisplayLayer(value) {
		if (this.displayLayer === value)
			return;

		this.displayLayer = value;

		this.UpdateDisplayLayer();
	}

	UpdateDisplayLayer() {
		if (this.drawIndex !== -1) // -1 means not attached to a layer
			this.Layer.UpdateDisplayLayer(this.drawIndex, this.displayLayer);
	}
}

export class TextCharacterSprite extends LayerSprite {
	constructor(width, height, textureAtlasX, textureAtlasY, virtualScreen, displayLayer) {
		super(width, height, textureAtlasX, textureAtlasY, displayLayer, virtualScreen);

		this.TextColorIndex = 0;
	}

	AddToLayer() {
		this.drawIndex = this.Layer.GetDrawIndex(this, this.TextColorIndex);
	}

	UpdateTextColorIndex() {
		if (this.drawIndex !== -1) // -1 means not attached to a layer
			this.Layer.UpdateTextColorIndex(this.drawIndex, this.TextColorIndex);
	}
}

export class SpriteFactory {
	constructor(virtualScreen) {
		this.VirtualScreen = null;
		this.VirtualScreen = virtualScreen;
	}

	Create(width, height, layered, displayLayer = 0) {
		if (layered)
			return new LayerSprite(width, height, 0, 0, displayLayer, this.VirtualScreen);
		else
			return new Sprite(width, height, 0, 0, this.VirtualScreen);
	}

	CreateAnimated(width, height, textureAtlasWidth, numFrames, layered = false, displayLayer = 0) {
		if (layered)
			return new AnimatedLayerSprite(width, height, 0, 0, displayLayer, this.VirtualScreen, numFrames, textureAtlasWidth);
		else
			return new AnimatedSprite(width, height, 0, 0, this.VirtualScreen, numFrames, textureAtlasWidth);
	}

	CreateWithAlpha(width, height, displayLayer = 0) {
		return new AlphaSprite(width, height, displayLayer, this.VirtualScreen);
	}
}
