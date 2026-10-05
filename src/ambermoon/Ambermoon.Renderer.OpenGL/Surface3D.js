// Port of Ambermoon.Renderer.OpenGL/Surface3D.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// Surface3D.cs - 3D surface (floor, ceiling, wall, billboard)

import { Position } from '../Ambermoon.Common/Position.js';
import { AmbermoonException, ExceptionScope } from '../Ambermoon.Common/Exception.js';
import { WallOrientation } from '../Ambermoon.Core/Render/ISurface3D.js';

const FloatMaxValue = 3.4028234663852886e38;

function isRenderLayer(layer) {
	return layer != null && typeof layer.GetDrawIndex === 'function' && typeof layer.FreeDrawIndex === 'function' &&
		typeof layer.GetColoredRectDrawIndex === 'function';
}

export class Surface3D {
	constructor(type, width, height, textureAtlasX, textureAtlasY, textureWidth, textureHeight,
		mappedTextureWidth, mappedTextureHeight, virtualScreen, wallOrientation, alpha, frameCount,
		extrude) {
		this.x = FloatMaxValue;
		this.y = FloatMaxValue;
		this.z = FloatMaxValue;
		this.visible = false;
		this.drawIndex = -1;
		this.layer = null;
		this.visibleRequest = false;
		this.deleted = false;
		this.notOnScreen = true;
		this.virtualScreen = null;
		this.textureAtlasOffset = null;
		this.paletteIndex = 0;
		this.extrude = 0.0;
		this.WallOrientation = WallOrientation.Normal;
		this.TextureWidth = 0;
		this.TextureHeight = 0;
		this.MappedTextureWidth = 0;
		this.MappedTextureHeight = 0;
		this.Alpha = false;
		this.FrameCount = 1;

		this.Type = type;
		this.Width = width;
		this.Height = height;
		this.virtualScreen = virtualScreen;
		this.textureAtlasOffset = new Position(textureAtlasX, textureAtlasY);
		this.WallOrientation = wallOrientation;
		this.TextureWidth = textureWidth;
		this.TextureHeight = textureHeight;
		this.MappedTextureWidth = mappedTextureWidth;
		this.MappedTextureHeight = mappedTextureHeight;
		this.Alpha = alpha;
		this.FrameCount = frameCount;
		this.extrude = extrude;
	}

	get Visible() {
		return this.visible && !this.deleted && !this.notOnScreen;
	}

	set Visible(value) {
		if (this.deleted)
			return;

		if (this.layer == null) {
			this.visibleRequest = value;
			this.visible = false;
			return;
		}

		this.visibleRequest = false;

		if (this.visible === value)
			return;

		this.visible = value;

		if (this.Visible)
			this.AddToLayer();
		else if (!this.visible)
			this.RemoveFromLayer();
	}

	get Layer() {
		return this.layer;
	}

	set Layer(value) {
		if (value != null && !isRenderLayer(value))
			throw new AmbermoonException(ExceptionScope.Render, 'The given layer is not valid for this renderer.');

		if (this.layer === value)
			return;

		if (this.layer != null && this.Visible)
			this.RemoveFromLayer();

		this.layer = value;

		if (this.layer != null && this.visibleRequest && !this.deleted) {
			this.visible = true;
			this.visibleRequest = false;
			this.CheckOnScreen();
		}

		if (this.layer == null) {
			this.visibleRequest = false;
			this.visible = false;
			this.notOnScreen = true;
		}

		if (this.layer != null && this.Visible)
			this.AddToLayer();
	}

	get Extrude() {
		return this.extrude;
	}

	set Extrude(value) {
		if (this.extrude === value)
			return;

		this.extrude = value;

		this.UpdateExtrude();
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

	get X() {
		return this.x;
	}

	set X(value) {
		if (this.x === value)
			return;

		this.x = value;

		if (!this.deleted) {
			if (!this.CheckOnScreen())
				this.UpdatePosition();
		}
	}

	get Y() {
		return this.y;
	}

	set Y(value) {
		if (this.y === value)
			return;

		this.y = value;

		if (!this.deleted) {
			if (!this.CheckOnScreen())
				this.UpdatePosition();
		}
	}

	get Z() {
		return this.z;
	}

	set Z(value) {
		if (this.z === value)
			return;

		this.z = value;

		if (!this.deleted) {
			if (!this.CheckOnScreen())
				this.UpdatePosition();
		}
	}

	Delete() {
		if (!this.deleted) {
			this.RemoveFromLayer();
			this.deleted = true;
			this.visible = false;
			this.visibleRequest = false;
		}
	}

	CheckOnScreen() {
		const oldNotOnScreen = this.notOnScreen;
		const oldVisible = this.Visible;

		// TODO
		this.notOnScreen = false;// !virtualScreen.IntersectsWith(new Rect(X, Y, Width, Height));

		if (oldNotOnScreen !== this.notOnScreen) {
			if (oldVisible !== this.Visible) {
				if (this.Visible)
					this.AddToLayer();
				else
					this.RemoveFromLayer();

				return true; // handled
			}
		}

		return false;
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

	UpdatePosition() {
		if (this.drawIndex !== -1) // -1 means not attached to a layer
			this.Layer.UpdatePosition(this.drawIndex, this);
	}

	UpdateTextureAtlasOffset() {
		if (this.drawIndex !== -1) // -1 means not attached to a layer
			this.Layer.UpdateTextureAtlasOffset(this.drawIndex, this);
	}

	UpdatePaletteIndex() {
		if (this.drawIndex !== -1) // -1 means not attached to a layer
			this.Layer.UpdatePaletteIndex(this.drawIndex, this.PaletteIndex);
	}

	UpdateExtrude() {
		if (this.drawIndex !== -1) // -1 means not attached to a layer
			this.Layer.UpdateExtrude(this.drawIndex, this.Extrude);
	}
}

export class Surface3DFactory {
	constructor(virtualScreen) {
		this.VirtualScreen = null;
		this.VirtualScreen = virtualScreen;
	}

	Create(type, width, height, textureWidth, textureHeight,
		mappedTextureWidth, mappedTextureHeight, alpha, frameCount = 1, extrude = 0.0,
		wallOrientation = WallOrientation.Normal, textureAtlasX = 0, textureAtlasY = 0) {
		return new Surface3D(type, width, height, textureAtlasX, textureAtlasY, textureWidth, textureHeight,
			mappedTextureWidth, mappedTextureHeight, this.VirtualScreen, wallOrientation, alpha, frameCount, extrude);
	}
}
