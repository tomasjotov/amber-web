// Port of Ambermoon.Renderer.OpenGL/ColoredRect.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// ColoredRect.cs - Colored rectangle render node

import { Color } from '../Ambermoon.Core/Render/Color.js';
import { RenderNode } from './RenderNode.js';

export class ColoredRect extends RenderNode {
	constructor(width, height, color, displayLayer, virtualScreen) {
		super(width, height, virtualScreen);

		this.drawIndex = -1;
		this.color = color;
		this.displayLayer = displayLayer;
	}

	get Color() {
		return this.color;
	}

	set Color(value) {
		if (Color.op_Equality(this.color, value))
			return;

		this.color = value;

		this.UpdateColor();
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
			this.Layer.UpdateColoredRectDisplayLayer(this.drawIndex, this.displayLayer);
	}

	AddToLayer() {
		this.drawIndex = this.Layer.GetColoredRectDrawIndex(this);
	}

	RemoveFromLayer() {
		if (this.drawIndex !== -1) {
			this.Layer.FreeColoredRectDrawIndex(this.drawIndex);
			this.drawIndex = -1;
		}
	}

	UpdatePosition() {
		if (this.drawIndex !== -1) // -1 means not attached to a layer
			this.Layer.UpdateColoredRectPosition(this.drawIndex, this);
	}

	UpdateColor() {
		if (this.drawIndex !== -1) // -1 means not attached to a layer
			this.Layer.UpdateColoredRectColor(this.drawIndex, this.color);
	}

	Resize(width, height) {
		if (this.Width === width && this.Height === height)
			return;

		super.Resize(width, height);

		this.UpdatePosition();
	}

	OnClipAreaChanged(onScreen, needUpdate) {
		if (onScreen && needUpdate) {
			this.UpdatePosition();
		}
	}
}

export class ColoredRectFactory {
	constructor(virtualScreen) {
		this.VirtualScreen = null;
		this.VirtualScreen = virtualScreen;
	}

	Create(width, height, color, displayLayer) {
		return new ColoredRect(width, height, color, displayLayer, this.VirtualScreen);
	}
}
