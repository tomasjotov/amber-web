// Port of Ambermoon.Renderer.OpenGL/Fow.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// Fow.cs - Fog of war render node (light circle in dark 2D maps)

import { Position } from '../Ambermoon.Common/Position.js';
import { RenderNode } from './RenderNode.js';

export class Fow extends RenderNode {
	constructor(width, height, center, radius, virtualScreen) {
		super(width, height, virtualScreen);

		this.drawIndex = -1;
		this.center = new Position();
		this.radius = 0;
		this.baseLineOffset = 0;

		this.center = center;
		this.radius = radius;
	}

	get Center() {
		return this.center;
	}

	set Center(value) {
		if (this.center?.X === value?.X && this.center?.Y === value?.Y)
			return;

		this.center = value == null ? new Position() : new Position(value);

		this.UpdateCenter();
	}

	get Radius() {
		return this.radius;
	}

	set Radius(value) {
		if (this.radius === value)
			return;

		this.radius = value;

		this.UpdateRadius();
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

	UpdateCenter() {
		if (this.drawIndex !== -1) // -1 means not attached to a layer
			this.Layer.UpdateFOWCenter(this.drawIndex, this.center);
	}

	UpdateRadius() {
		if (this.drawIndex !== -1) // -1 means not attached to a layer
			this.Layer.UpdateFOWRadius(this.drawIndex, this.radius);
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

export class FowFactory {
	constructor(virtualScreen) {
		this.VirtualScreen = null;
		this.VirtualScreen = virtualScreen;
	}

	Create(width, height, center, radius) {
		return new Fow(width, height, center, radius, this.VirtualScreen);
	}
}
