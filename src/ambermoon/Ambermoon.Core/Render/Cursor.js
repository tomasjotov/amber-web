// Port of Ambermoon.Core/Render/Cursor.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { getValue } from '../../../runtime.js';
import { Position } from '../../Ambermoon.Common/Position.js';
import { CursorType } from '../../Ambermoon.Data.Common/CursorType.js';
import { Layer } from './Layer.js';
import { TextureAtlasManager } from './TextureAtlasManager.js';

export class Cursor {
	get Visible() {
		return this.sprite.Visible;
	}
	set Visible(value) {
		this.sprite.Visible = value;
	}

	constructor(renderView, cursorHotspots, textureAtlasManager = null) {
		this.cursorHotspots = new Map();
		this.type = CursorType.Sword;
		this.Hotspot = null;
		this.renderView = renderView;
		this.textureAtlas = (textureAtlasManager ?? TextureAtlasManager.Instance).GetOrCreate(Layer.Cursor);
		this.sprite = renderView.SpriteFactory.Create(16, 16, true);
		this.sprite.PaletteIndex = 0;
		this.sprite.Layer = renderView.GetLayer(Layer.Cursor);

		for (let i = 0; i < cursorHotspots.length; ++i)
			this.cursorHotspots.set(i, cursorHotspots[i]);

		this.UpdateCursor();
	}

	Destroy() {
		this.sprite?.Delete();
	}

	get Type() {
		return this.type;
	}
	set Type(value) {
		if (this.type === value)
			return;

		this.type = value;

		if (this.Type === CursorType.None) {
			this.Visible = false;
		} else {
			this.UpdateCursor();
			this.Visible = true;
		}
	}

	UpdateCursor() {
		const hotspot = this.Hotspot ?? new Position();
		const x = this.sprite.X + hotspot.X;
		const y = this.sprite.Y + hotspot.Y;
		this.Hotspot = getValue(this.cursorHotspots, this.type);
		this.sprite.X = x - this.Hotspot.X;
		this.sprite.Y = y - this.Hotspot.Y;
		this.sprite.TextureAtlasOffset = this.textureAtlas.GetOffset(this.type);
	}

	UpdatePosition(screenPosition, game) {
		const viewPosition = this.renderView.ScreenToGame(screenPosition);

		if (viewPosition != null) {
			this.sprite.PaletteIndex = game?.UIPaletteIndex ?? 0;
			this.sprite.X = viewPosition.X - this.Hotspot.X;
			this.sprite.Y = viewPosition.Y - this.Hotspot.Y;
			this.Visible = this.Type !== CursorType.None;
		}
	}

	UpdatePalette(game) {
		this.sprite.PaletteIndex = game?.UIPaletteIndex ?? 0;
	}
}

export class InvisibleCursor extends Cursor {
	constructor(renderView, cursorHotspots, textureAtlasManager = null) {
		super(renderView, cursorHotspots, textureAtlasManager);
	}

	get Visible() {
		return false;
	}
	set Visible(value) {
		super.Visible = false;
	}
}
