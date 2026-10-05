// Port of Ambermoon.Core/UI/Scrollbar.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// Scrollbar UI element

import { Event, idiv, toByte } from '../../../runtime.js';
import { Position } from '../../Ambermoon.Common/Position.js';
import { Rect } from '../../Ambermoon.Common/Rect.js';
import { Size } from '../../Ambermoon.Common/Size.js';
import { Util } from '../../Ambermoon.Common/Util.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { UICustomGraphic } from '../../Ambermoon.Data.Common/Enumerations/UICustomGraphic.js';
import { Layer } from '../Render/Layer.js';
import { Graphics } from '../Render/Graphics.js';
import { TextureAtlasManager } from '../Render/TextureAtlasManager.js';
import { ScrollbarType } from './ScrollbarType.js';

function getDisabledGraphic(type) {
	switch (type) {
		case ScrollbarType.SmallVertical:
			return UICustomGraphic.ScrollbarSmallVerticalDisabled;
		case ScrollbarType.LargeVertical:
			return UICustomGraphic.ScrollbarLargeVerticalDisabled;
		default:
			throw new AmbermoonException(ExceptionScope.Application, 'Invalid scrollbar type.');
	}
}

function getBackgroundGraphic(type) {
	switch (type) {
		case ScrollbarType.SmallVertical:
			return UICustomGraphic.ScrollbarBackgroundSmallVertical;
		case ScrollbarType.LargeVertical:
			return UICustomGraphic.ScrollbarBackgroundLargeVertical;
		default:
			throw new AmbermoonException(ExceptionScope.Application, 'Invalid scrollbar type.');
	}
}

export class Scrollbar {
	constructor(game, layout, type, scrollArea, width, height, scrollRange, displayLayer = 1) {
		this.Scrolling = false;
		this.scrollStartPosition = null;
		this.disabled = false;
		this.Scrolled = new Event();
		this.ScrollOffset = 0;

		this.scrollArea = scrollArea;
		this.vertical = type === ScrollbarType.SmallVertical || type === ScrollbarType.LargeVertical; // Note: There are no horizontal ones in Ambermoon.
		this.ScrollRange = scrollRange;
		this.barSize = this.vertical ? height : width;
		this.position = new Position(scrollArea.Position);
		this.baseType = type; // the highlighted one is always 1 above

		this.backgroundSprite = layout.RenderView.SpriteFactory.Create(scrollArea.Width, scrollArea.Height, true);
		this.backgroundSprite.Layer = layout.RenderView.GetLayer(Layer.UI);
		this.backgroundSprite.TextureAtlasOffset = TextureAtlasManager.Instance.GetOrCreate(Layer.UI).GetOffset(Graphics.UICustomGraphicOffset + getBackgroundGraphic(type));
		this.backgroundSprite.DisplayLayer = displayLayer;
		this.backgroundSprite.PaletteIndex = game.UIPaletteIndex;
		this.backgroundSprite.X = scrollArea.X;
		this.backgroundSprite.Y = scrollArea.Y;
		this.backgroundSprite.Visible = true;

		// We add 1 to height because there is 1 pixel row for a shadow.
		this.sprite = layout.RenderView.SpriteFactory.Create(width, height + 1, true);
		this.sprite.Layer = layout.RenderView.GetLayer(Layer.UI);
		this.sprite.TextureAtlasOffset = TextureAtlasManager.Instance.GetOrCreate(Layer.UI).GetOffset(Graphics.UICustomGraphicOffset + type);
		this.sprite.DisplayLayer = toByte(Math.min(255, displayLayer + 2));
		this.sprite.PaletteIndex = game.UIPaletteIndex;
		this.sprite.X = this.position.X;
		this.sprite.Y = this.position.Y;
		this.sprite.Visible = true;

		if (scrollRange === 0)
			this.Disabled = true;
	}

	get BarArea() {
		return new Rect(this.position, new Size(this.vertical ? this.scrollArea.Width : this.barSize, this.vertical ? this.barSize : this.scrollArea.Height));
	}

	get Disabled() {
		return this.disabled;
	}

	set Disabled(value) {
		if (this.disabled === value)
			return;

		this.disabled = value;

		if (this.disabled) {
			this.backgroundSprite.TextureAtlasOffset = TextureAtlasManager.Instance.GetOrCreate(Layer.UI).GetOffset(Graphics.UICustomGraphicOffset + getDisabledGraphic(this.baseType));
		} else {
			this.backgroundSprite.TextureAtlasOffset = TextureAtlasManager.Instance.GetOrCreate(Layer.UI).GetOffset(Graphics.UICustomGraphicOffset + getBackgroundGraphic(this.baseType));
		}

		this.sprite.Visible = !this.disabled;
	}

	SetBarPosition(position) {
		if (Position.op_Equality(this.position, position))
			return;

		this.position = position;

		this.sprite.X = this.vertical ? position.X : Util.Limit(this.scrollArea.Left, position.X, this.scrollArea.Right - this.barSize);
		this.sprite.Y = this.vertical ? Util.Limit(this.scrollArea.Top, position.Y, this.scrollArea.Bottom - this.barSize) : position.Y;
	}

	SetScrollPosition(position, raiseEvent = false, force = false) {
		if (!force && this.ScrollOffset === position)
			return;

		const scrolled = this.ScrollOffset !== position;
		this.ScrollOffset = position;

		if (this.vertical) {
			this.SetBarPosition(new Position(this.position.X, this.scrollArea.Top + Util.Round(position * (this.scrollArea.Height - this.barSize) / this.ScrollRange)));
		} else { // horizontal
			this.SetBarPosition(new Position(this.scrollArea.Left + Util.Round(position * (this.scrollArea.Width - this.barSize) / this.ScrollRange), this.position.Y));
		}

		if (scrolled && raiseEvent)
			this.Scrolled.invoke(this.ScrollOffset);
	}

	Destroy() {
		this.sprite?.Delete();
		this.backgroundSprite?.Delete();
	}

	Drag(position) {
		if (!this.Scrolling)
			return false;

		const scrollArea = this.scrollArea;
		const barSize = this.barSize;

		if (this.vertical) {
			if (position.Y <= scrollArea.Top + Math.trunc(barSize / 2))
				this.SetScrollPosition(0);
			else if (position.Y >= scrollArea.Bottom - Math.trunc(barSize / 2))
				this.SetScrollPosition(this.ScrollRange);
			else {
				// There are (n + 1) areas where n is the scroll range.
				// But they start at half bar size from both ends.
				// The bar's center will jump to the center of an area
				// if the cursor is closest to this center.
				// The correct area can be calculated by dividing the
				// cursor position by the area size.
				let areaSize;
				let entriesPerScroll = 0;
				do {
					areaSize = idiv(scrollArea.Height - barSize, idiv(this.ScrollRange + 1, ++entriesPerScroll));
				} while (areaSize === 0);
				const newPosition = Math.min(this.ScrollRange, idiv(entriesPerScroll * (position.Y - (scrollArea.Top + Math.trunc(barSize / 2))), areaSize));
				if (newPosition !== this.ScrollOffset) {
					this.ScrollOffset = newPosition;
					this.Scrolled.invoke(newPosition);
				}
				this.SetBarPosition(new Position(this.position.X, scrollArea.Top + Util.Round(newPosition * (scrollArea.Height - barSize) / this.ScrollRange)));
			}
		} else { // horizontal
			if (position.X <= scrollArea.Left)
				this.SetScrollPosition(0);
			else if (position.X >= scrollArea.Right)
				this.SetScrollPosition(this.ScrollRange);
			else {
				let areaSize;
				let entriesPerScroll = 0;
				do {
					areaSize = idiv(scrollArea.Width - barSize, idiv(this.ScrollRange + 1, ++entriesPerScroll));
				} while (areaSize === 0);
				const newPosition = Math.min(this.ScrollRange, idiv(entriesPerScroll * (position.X - (scrollArea.Left + Math.trunc(barSize / 2))), areaSize));
				if (newPosition !== this.ScrollOffset) {
					this.ScrollOffset = newPosition;
					this.Scrolled.invoke(newPosition);
				}
				this.SetBarPosition(new Position(scrollArea.Left + Util.Round(newPosition * (scrollArea.Width - barSize) / this.ScrollRange), this.position.Y));
			}
		}

		return true;
	}

	LeftMouseUp() {
		if (this.Scrolling) {
			this.sprite.TextureAtlasOffset = TextureAtlasManager.Instance.GetOrCreate(Layer.UI).GetOffset(Graphics.UICustomGraphicOffset + this.baseType);
			this.Scrolling = false;

			if (this.scrollStartPosition !== this.ScrollOffset)
				this.Scrolled.invoke(this.ScrollOffset);
		}

		this.scrollStartPosition = null;
	}

	LeftClick(position) {
		if (this.BarArea.Contains(position)) {
			this.Scrolling = true;
			this.scrollStartPosition = this.ScrollOffset;
			this.sprite.TextureAtlasOffset = TextureAtlasManager.Instance.GetOrCreate(Layer.UI).GetOffset(Graphics.UICustomGraphicOffset + this.baseType + 1);

			return true;
		} else if (this.scrollArea.Contains(position)) {
			const scrollAmount = Util.Limit(1, Math.trunc(this.ScrollRange / 2), 2);

			if (position.Y > this.BarArea.Y) {
				if (this.ScrollOffset < this.ScrollRange)
					this.SetScrollPosition(Math.min(this.ScrollRange, this.ScrollOffset + scrollAmount), true);
				else // The bar might be positioned in-between
					this.SetScrollPosition(this.ScrollRange, true, true);
			} else if (position.Y < this.BarArea.Y) {
				if (this.ScrollOffset > 0)
					this.SetScrollPosition(Math.max(0, this.ScrollOffset - scrollAmount), true);
				else // The bar might be positioned in-between
					this.SetScrollPosition(0, true, true);
			}

			return true;
		}

		return false;
	}
}
