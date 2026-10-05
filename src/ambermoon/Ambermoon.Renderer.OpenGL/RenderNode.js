// Port of Ambermoon.Renderer.OpenGL/RenderNode.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// RenderNode.cs - Base class for all 2D render nodes
//
// Note: This module must not import RenderLayer/RenderBuffer (they import the node classes,
// which extend RenderNode). The "is RenderLayer" check is done by duck typing.

import { InvalidOperationException } from '../../runtime.js';
import { Rect } from '../Ambermoon.Common/Rect.js';

const ShortMaxValue = 32767;

function isRenderLayer(layer) {
	return layer != null && typeof layer.GetDrawIndex === 'function' && typeof layer.FreeDrawIndex === 'function' &&
		typeof layer.GetColoredRectDrawIndex === 'function';
}

export class RenderNode {
	constructor(width, height, virtualScreen) {
		this.x = ShortMaxValue;
		this.y = ShortMaxValue;
		this.visible = false;
		this.layer = null;
		this.visibleRequest = false;
		this.deleted = false;
		this.notOnScreen = true;
		this.virtualScreen = null;
		this.clipArea = null;

		this.Width = width;
		this.Height = height;
		this.virtualScreen = virtualScreen;
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

		this.OnVisibilityChanged();
	}

	get Layer() {
		return this.layer;
	}

	set Layer(value) {
		if (value != null && !isRenderLayer(value))
			throw new InvalidOperationException('The given layer is not valid for this renderer.'); // InvalidCastException

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

	get ClipArea() {
		return this.clipArea;
	}

	set ClipArea(value) {
		if (Rect.op_Equality(this.clipArea, value))
			return;

		this.clipArea = new Rect(value);
		const handled = this.CheckOnScreen();
		this.OnClipAreaChanged(!this.notOnScreen, !handled);
	}

	Resize(width, height) {
		if (this.Width !== width || this.Height !== height) {
			this.Width = width;
			this.Height = height;

			if (!this.deleted) {
				if (!this.CheckOnScreen())
					this.UpdatePosition();
			}
		}
	}

	AddToLayer() {
		throw new Error('abstract');
	}

	RemoveFromLayer() {
		throw new Error('abstract');
	}

	UpdatePosition() {
		throw new Error('abstract');
	}

	OnVisibilityChanged() {
		if (this.Visible)
			this.AddToLayer();
		else
			this.RemoveFromLayer();
	}

	OnClipAreaChanged(onScreen, needUpdate) {
		throw new Error('abstract');
	}

	/**
	 * CheckOnScreen(bounds) (private protected) or the virtual CheckOnScreen() which
	 * checks the node's own bounds. Subclasses override the no-argument version.
	 */
	CheckOnScreen(bounds) {
		if (arguments.length === 0)
			return this.CheckOnScreen(new Rect(this.X, this.Y, this.Width, this.Height));

		const oldNotOnScreen = this.notOnScreen;
		const oldVisible = this.Visible;
		const area = this.clipArea ?? this.virtualScreen;

		this.notOnScreen = !area.IntersectsWith(bounds);

		if (oldNotOnScreen !== this.notOnScreen) {
			if (oldVisible !== this.Visible) {
				this.OnVisibilityChanged();
				return true; // handled
			}
		}

		return false;
	}

	Delete() {
		if (!this.deleted) {
			this.RemoveFromLayer();
			this.deleted = true;
			this.visible = false;
			this.visibleRequest = false;
		}
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

	InsideClipArea(area) {
		if (area == null)
			return true;

		return area.IntersectsWith(this.X, this.Y, this.Width, this.Height);
	}
}
