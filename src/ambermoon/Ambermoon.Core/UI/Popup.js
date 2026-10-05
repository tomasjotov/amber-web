// Port of Ambermoon.Core/UI/Popup.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// Popup window

import { Event, firstOrDefault, toByte } from '../../../runtime.js';
import { Position } from '../../Ambermoon.Common/Position.js';
import { Rect } from '../../Ambermoon.Common/Rect.js';
import { Size } from '../../Ambermoon.Common/Size.js';
import { Util } from '../../Ambermoon.Common/Util.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { CursorType } from '../../Ambermoon.Data.Common/CursorType.js';
import { ButtonType } from '../../Ambermoon.Data.Common/Enumerations/ButtonType.js';
import { Color } from '../Render/Color.js';
import { Layer } from '../Render/Layer.js';
import { TextAlign } from '../Render/TextAlign.js';
import { Graphics } from '../Render/Graphics.js';
import { TextureAtlasManager } from '../Render/TextureAtlasManager.js';
import { Key } from '../Key.js';
import { MouseButtons } from '../MouseButtons.js';
import { Global } from './Global.js';
import { Button } from './Button.js';
import { ListBox } from './ListBox.js';
import { PopupFrame } from './PopupFrame.js';
import { Scrollbar } from './Scrollbar.js';
import { ScrollbarType } from './ScrollbarType.js';
import { TextInput } from './TextInput.js';
import { UIText } from './UIText.js';

// Overload helper: AddText(Position position, string text, TextColor textColor, bool shadow = true, byte displayLayer = 1, char? fallbackChar = null)
function addTextAtPosition(self, position, text, textColor, shadow = true, displayLayer = 1, fallbackChar = null) {
	const renderView = self.renderView;
	position = Global.GetTextRect(renderView, new Rect(position, new Size(Global.GlyphWidth, Global.GlyphLineHeight))).Position;
	const renderText = renderView.RenderTextFactory.Create(
		toByte(renderView.GraphicInfoProvider.DefaultTextPaletteIndex - 1),
		renderView.GetLayer(Layer.Text),
		renderView.TextProcessor.CreateText(text, fallbackChar), textColor, shadow);
	renderText.DisplayLayer = toByte(Util.Min(255, self.DisplayLayer + displayLayer));
	renderText.PaletteIndex = self.game.UIPaletteIndex;
	renderText.X = position.X;
	renderText.Y = position.Y;
	renderText.Visible = true;
	self.texts.push(new UIText(renderText));
	return renderText;
}

// Overload helper: AddText(Rect bounds, string text, ...)
function addTextInBoundsFromString(self, bounds, text, textColor, textAlign = TextAlign.Left,
	shadow = true, displayLayer = 1, scrolling = false, layout = null) {
	return addTextInBounds(self, bounds, self.renderView.TextProcessor.CreateText(text), textColor, textAlign,
		shadow, toByte(Util.Min(255, displayLayer)), scrolling, layout);
}

// Overload helper: AddText(Rect bounds, IText text, ...)
function addTextInBounds(self, bounds, text, textColor, textAlign = TextAlign.Left,
	shadow = true, displayLayer = 1, scrolling = false, layout = null) {
	const game = self.game;
	let uiText;
	displayLayer = toByte(Util.Min(255, self.DisplayLayer + displayLayer));

	if (scrolling && layout != null)
		uiText = layout.CreateScrollableText(bounds, text, textColor, textAlign, displayLayer, shadow, game.TextPaletteIndex);
	else {
		uiText = new UIText(self.renderView, game.TextPaletteIndex, text, Global.GetTextRect(self.renderView, bounds), displayLayer,
			textColor, shadow, textAlign, scrolling, (timeSpan, action) => game.AddTimedEvent(timeSpan, action));
	}
	self.texts.push(uiText);
	if (scrolling) {
		const closeAfterScroll = self.CloseOnClick;
		self.CloseOnClick = false;
		if (closeAfterScroll) {
			if (layout != null) {
				uiText.FreeScrollingEnded.add(() => {
					if (closeAfterScroll)
						game.ClosePopup(true, game.CoreConfiguration.IsMobile);
				});
			} else {
				uiText.Scrolled.add(scrolledToEnd => {
					if (closeAfterScroll && scrolledToEnd)
						game.ClosePopup();
				});
			}
		}
	}
	return uiText;
}

// Overload helper: AddText(IRenderText renderText, byte displayLayer = 1)
function addRenderText(self, renderText, displayLayer = 1) {
	renderText.DisplayLayer = toByte(Util.Min(255, self.DisplayLayer + displayLayer));
	renderText.Visible = true;
	const uiText = new UIText(renderText);
	self.texts.push(uiText);
	return uiText;
}

export class Popup {
	static BaseDisplayLayer = 20;

	constructor(game, renderView, position, columns, rows, transparent, displayLayerOffset = 0) {
		this.borders = [];
		this.fill = null;
		this.texts = [];
		this.filledAreas = [];
		this.sprites = [];
		this.buttons = [];
		this.inputs = [];
		this.listBox = null;
		this.scrollbar = null;
		this.popup = null;
		this.ReturnAction = null;
		this.Scrolled = new Event();
		this.CloseOnClick = true;
		this.DisableButtons = false;
		this.CanAbort = true;
		this.Closed = new Event();

		if (columns < 3 || rows < 3)
			throw new AmbermoonException(ExceptionScope.Application, 'Popups must at least have 3 columns and 3 rows.');

		this.DisplayLayer = toByte(Math.min(255, Popup.BaseDisplayLayer + displayLayerOffset));
		this.game = game;
		this.renderView = renderView;
		this.textureAtlas = TextureAtlasManager.Instance.GetOrCreate(Layer.UI);

		const AddBorder = (frame, column, row) => {
			const sprite = renderView.SpriteFactory.Create(16, 16, true, this.DisplayLayer);
			sprite.Layer = renderView.GetLayer(Layer.UI);
			sprite.TextureAtlasOffset = this.textureAtlas.GetOffset(Graphics.GetPopupFrameGraphicIndex(frame));
			sprite.PaletteIndex = game.UIPaletteIndex;
			sprite.X = position.X + column * 16;
			sprite.Y = position.Y + row * 16;
			sprite.Visible = true;
			this.borders.push(sprite);
		};

		if (!transparent) {
			// 4 corners
			AddBorder(PopupFrame.FrameUpperLeft, 0, 0);
			AddBorder(PopupFrame.FrameUpperRight, columns - 1, 0);
			AddBorder(PopupFrame.FrameLowerLeft, 0, rows - 1);
			AddBorder(PopupFrame.FrameLowerRight, columns - 1, rows - 1);

			// top and bottom border
			for (let i = 0; i < columns - 2; ++i) {
				AddBorder(PopupFrame.FrameTop, i + 1, 0);
				AddBorder(PopupFrame.FrameBottom, i + 1, rows - 1);
			}

			// left and right border
			for (let i = 0; i < rows - 2; ++i) {
				AddBorder(PopupFrame.FrameLeft, 0, i + 1);
				AddBorder(PopupFrame.FrameRight, columns - 1, i + 1);
			}

			// fill
			// TODO: use named palette color
			this.fill = renderView.ColoredRectFactory.Create((columns - 2) * 16, (rows - 2) * 16,
				game.GetUIColor(28), this.DisplayLayer);
			this.fill.Layer = renderView.GetLayer(Layer.UI);
			this.fill.X = position.X + 16;
			this.fill.Y = position.Y + 16;
			this.fill.Visible = true;

			this.ContentArea = new Rect(this.fill.X, this.fill.Y, this.fill.Width, this.fill.Height);
		} else {
			this.ContentArea = new Rect(position.X + 16, position.Y + 16, (columns - 2) * 16, (rows - 2) * 16);
		}

		if (game.CursorType === CursorType.Click)
			game.ShowMobileClickIndicatorForPopup();
	}

	get HasChildPopup() {
		return this.popup != null;
	}

	get HasButtons() {
		return this.buttons.length !== 0;
	}

	get HasList() {
		return this.listBox != null;
	}

	get ClickCursor() {
		return this.CloseOnClick || this.texts.some(text => text.WithScrolling);
	}

	OnClosed() {
		this.Closed.invoke();
	}

	Destroy() {
		this.Scrolled.clear();

		this.borders.forEach(border => border?.Delete());
		this.borders.length = 0;

		this.fill?.Delete();

		this.texts.forEach(text => text?.Destroy());
		this.texts.length = 0;

		this.filledAreas.forEach(filledArea => filledArea?.Delete());
		this.filledAreas.length = 0;

		this.sprites.forEach(sprite => sprite?.Delete());
		this.sprites.length = 0;

		this.buttons.forEach(button => button?.Destroy());
		this.buttons.length = 0;

		this.inputs.forEach(input => input?.Destroy());
		this.inputs.length = 0;

		this.listBox?.Destroy();
		this.listBox = null;

		this.scrollbar?.Destroy();
		this.scrollbar = null;

		this.popup?.Destroy();
		this.popup = null;
	}

	CloseChildPopup() {
		this.popup?.Destroy();
		this.popup = null;
	}

	/**
	 * Overloads:
	 * - AddText(position: Position, text: string, textColor, shadow = true, displayLayer = 1, fallbackChar = null): IRenderText
	 * - AddText(bounds: Rect, text: string, textColor, textAlign = Left, shadow = true, displayLayer = 1, scrolling = false, layout = null): UIText
	 * - AddText(bounds: Rect, text: IText, textColor, textAlign = Left, shadow = true, displayLayer = 1, scrolling = false, layout = null): UIText
	 * - AddText(renderText: IRenderText, displayLayer = 1): UIText
	 */
	AddText(...args) {
		if (args[0] instanceof Position)
			return addTextAtPosition(this, ...args);
		if (args[0] instanceof Rect) {
			if (typeof args[1] === 'string')
				return addTextInBoundsFromString(this, ...args);
			return addTextInBounds(this, ...args);
		}
		return addRenderText(this, ...args);
	}

	FillArea(area, color, displayLayer = 1) {
		const filledArea = this.renderView.ColoredRectFactory.Create(area.Width, area.Height, color,
			toByte(Util.Min(255, this.DisplayLayer + displayLayer)));
		filledArea.Layer = this.renderView.GetLayer(Layer.UI);
		filledArea.X = area.Left;
		filledArea.Y = area.Top;
		filledArea.Visible = true;
		this.filledAreas.push(filledArea);
		return filledArea;
	}

	AddImage(area, imageIndex, layer, displayLayer, paletteIndex) {
		const sprite = this.renderView.SpriteFactory.Create(area.Width, area.Height, true,
			toByte(Util.Min(255, this.DisplayLayer + displayLayer)));
		sprite.Layer = this.renderView.GetLayer(layer);
		sprite.PaletteIndex = paletteIndex;
		sprite.TextureAtlasOffset = TextureAtlasManager.Instance.GetOrCreate(layer).GetOffset(imageIndex);
		sprite.X = area.X;
		sprite.Y = area.Y;
		sprite.Visible = true;
		this.sprites.push(sprite);
		return sprite;
	}

	AddItemImage(area, imageIndex, displayLayer = 1) {
		this.AddImage(area, imageIndex, Layer.Items, displayLayer, this.game.PrimaryUIPaletteIndex);
	}

	AddSunkenBox(area, displayLayer = 1) {
		// TODO: use named palette colors
		const darkBorderColor = this.game.GetUIColor(26);
		const brightBorderColor = this.game.GetUIColor(31);
		const fillColor = this.game.GetUIColor(27);

		// upper dark border
		this.FillArea(new Rect(area.X, area.Y, area.Width - 1, 1), darkBorderColor, displayLayer);
		// left dark border
		this.FillArea(new Rect(area.X, area.Y + 1, 1, area.Height - 2), darkBorderColor, displayLayer);
		// fill
		this.FillArea(new Rect(area.X + 1, area.Y + 1, area.Width - 2, area.Height - 2), fillColor, displayLayer);
		// right bright border
		this.FillArea(new Rect(area.Right - 1, area.Y + 1, 1, area.Height - 2), brightBorderColor, displayLayer);
		// lower bright border
		this.FillArea(new Rect(area.X + 1, area.Bottom - 1, area.Width - 1, 1), brightBorderColor, displayLayer);
	}

	AddPopup(position, columns, rows) {
		return this.popup = new Popup(this.game, this.renderView, position, columns, rows, false, toByte(Math.min(250, this.DisplayLayer + 50)));
	}

	AddButton(position) {
		const brightBorderColor = this.game.GetUIColor(31);
		const darkBorderColor = this.game.GetUIColor(26);

		this.FillArea(new Rect(position.X, position.Y, Button.Width + 1, Button.Height + 1), brightBorderColor, 1);
		this.FillArea(new Rect(position.X - 1, position.Y - 1, Button.Width + 1, Button.Height + 1), darkBorderColor, 2);
		this.FillArea(new Rect(position.X, position.Y, Button.Width, Button.Height), Color.Black, 3);

		const button = new Button(this.renderView, position, null);

		button.PaletteIndex = this.game.UIPaletteIndex;
		button.DisplayLayer = toByte(Util.Min(255, this.DisplayLayer + 4));

		this.buttons.push(button);

		return button;
	}

	ScrollTo(offset) {
		this.scrollbar?.SetScrollPosition(offset, true);
	}

	KeyChar(ch) {
		if (this.listBox?.KeyChar(ch) === true)
			return true;

		// Note: Key may remove inputs or close the popup.
		for (let i = this.inputs.length - 1; i >= 0; --i) {
			if (i >= this.inputs.length)
				continue;

			if (this.inputs[i].KeyChar(ch))
				return true;
		}

		ch = ch.toLowerCase();

		if (ch === 'y' || ch === 'j' || ch === 'o') {
			const yesButton = firstOrDefault(this.buttons, button => button.ButtonType === ButtonType.Yes);

			if (yesButton != null) {
				yesButton.PressImmediately(this.game, false, true);
				return true;
			}
		} else if (ch === 'n') {
			const noButton = firstOrDefault(this.buttons, button => button.ButtonType === ButtonType.No);

			if (noButton != null) {
				noButton.PressImmediately(this.game, false, true);
				return true;
			}
		}

		return false;
	}

	Scroll(down, yScroll) {
		const scrollbar = this.scrollbar;

		if (scrollbar != null && !scrollbar.Disabled) {
			const scrollOffset = scrollbar.ScrollOffset;

			if (down) {
				if (scrollOffset < scrollbar.ScrollRange)
					this.ScrollTo(scrollOffset + 1);
			} else { // up
				if (scrollOffset > 0)
					this.ScrollTo(scrollOffset - 1);
			}

			return true;
		}

		if (this.Scrolled.hasHandlers) {
			this.Scrolled.invoke(down);
			return true;
		}

		if (this.game.CoreConfiguration.IsMobile && this.game.Layout.FreeTextScrollingActive && this.texts.length > 0) {
			this.texts[0]?.MouseMove(yScroll, true);
			return true;
		}

		return false;
	}

	KeyDown(key) {
		if (this.CloseOnClick && (key === Key.Space || key === Key.Return || key === Key.Escape)) {
			this.game.ClosePopup();
			return true;
		}

		if (this.listBox?.KeyDown(key) === true)
			return true;

		// Note: Key may remove inputs or close the popup.
		for (let i = this.inputs.length - 1; i >= 0; --i) {
			if (i >= this.inputs.length)
				continue;

			if (this.inputs[i].KeyDown(key))
				return true;
		}

		const scrollbar = this.scrollbar;

		if (scrollbar != null && !scrollbar.Disabled) {
			const scrollOffset = scrollbar.ScrollOffset;

			switch (key) {
				case Key.Up:
					if (scrollOffset > 0)
						this.ScrollTo(scrollOffset - 1);
					return true;
				case Key.Down:
					if (scrollOffset < scrollbar.ScrollRange)
						this.ScrollTo(scrollOffset + 1);
					return true;
				case Key.PageUp:
					if (scrollOffset > 0)
						this.ScrollTo(Math.max(0, scrollOffset - 5));
					return true;
				case Key.PageDown:
					if (scrollOffset < scrollbar.ScrollRange)
						this.ScrollTo(Math.min(scrollbar.ScrollRange, scrollOffset + 5));
					return true;
				case Key.Home:
					this.ScrollTo(0);
					return true;
				case Key.End:
					this.ScrollTo(scrollbar.ScrollRange);
					return true;
			}
		}

		if (key === Key.Return && this.ReturnAction != null) {
			this.ReturnAction?.();
			return true;
		}

		if (key === Key.Escape && this.CanAbort) {
			this.game.ClosePopup();
			return true;
		}

		if (key === Key.Up || key === Key.PageUp || key === Key.End) {
			const upButton = firstOrDefault(this.buttons, button => button.ButtonType === ButtonType.MoveUp);

			if (upButton != null) {
				upButton.PressImmediately(this.game, key === Key.PageUp || key === Key.End);
				return true;
			}
		}

		if (key === Key.Down || key === Key.PageDown || key === Key.Home) {
			const downButton = firstOrDefault(this.buttons, button => button.ButtonType === ButtonType.MoveDown);

			if (downButton != null) {
				downButton.PressImmediately(this.game, key === Key.PageDown || key === Key.Home);
				return true;
			}
		}

		return false;
	}

	Drag(position) {
		if (this.scrollbar == null || this.scrollbar.Disabled)
			return false;

		return this.scrollbar.Drag(position);
	}

	TestButtonRightClick(position) {
		// Note: RightMouseDown may remove buttons or close the popup.
		for (let i = this.buttons.length - 1; i >= 0; --i) {
			if (i >= this.buttons.length)
				continue;

			if (this.buttons[i]?.RightMouseDown(position, this.game.CurrentPopupTicks) === true)
				return true;
		}

		return false;
	}

	/** C#: Click(position, mouseButtons, out ignoreNextMouseUp) -> returns [bool, ignoreNextMouseUp] */
	Click(position, mouseButtons) {
		let ignoreNextMouseUp = false;

		if (mouseButtons === MouseButtons.Left && this.listBox?.Editing === true) {
			this.listBox.CommitEdit();
			return [true, ignoreNextMouseUp];
		}

		if (mouseButtons === MouseButtons.Left && TextInput.FocusedInput == null) {
			if (this.scrollbar != null && !this.scrollbar.Disabled && this.scrollbar.LeftClick(position))
				return [true, ignoreNextMouseUp];

			if (this.listBox?.Click(position) === true) {
				ignoreNextMouseUp = true;
				return [true, ignoreNextMouseUp];
			}

			// Note: LeftMouseDown may remove buttons or close the popup.
			for (let i = this.buttons.length - 1; i >= 0; --i) {
				if (i >= this.buttons.length)
					continue;

				if (this.buttons[i]?.LeftMouseDown(position, this.game.CurrentPopupTicks) === true)
					return [true, ignoreNextMouseUp];
			}

			// Note: Click may remove texts or close the popup.
			for (let i = this.texts.length - 1; i >= 0; --i) {
				if (i >= this.texts.length)
					continue;

				if (this.texts[i].Click(position))
					return [true, ignoreNextMouseUp];
			}
		}

		if (mouseButtons === MouseButtons.Right && this.listBox?.Editing === true) {
			this.listBox.AbortEdit();
			return [true, ignoreNextMouseUp];
		}

		// Note: Click may remove inputs or close the popup.
		for (let i = this.inputs.length - 1; i >= 0; --i) {
			if (i >= this.inputs.length)
				continue;

			if (this.inputs[i].MouseDown(position, mouseButtons))
				return [true, ignoreNextMouseUp];
		}

		return [false, ignoreNextMouseUp];
	}

	LeftMouseUp(position) {
		if (this.popup != null) {
			this.CloseChildPopup();
			return;
		}

		if (this.scrollbar != null && !this.scrollbar.Disabled) {
			this.scrollbar.LeftMouseUp();

			if (this.game.CursorType === CursorType.None)
				this.game.CursorType = CursorType.Sword;
		}

		if (TextInput.FocusedInput != null)
			return;

		// Note: LeftMouseUp may remove buttons or close the popup.
		for (let i = this.buttons.length - 1; i >= 0; --i) {
			if (i >= this.buttons.length)
				continue;

			this.buttons[i]?.LeftMouseUp(position, this.game.CurrentPopupTicks);
		}
	}

	RightMouseUp(position) {
		if (this.popup != null) {
			this.CloseChildPopup();
			return;
		}

		// Note: RightMouseUp may remove buttons or close the popup.
		for (let i = this.buttons.length - 1; i >= 0; --i) {
			if (i >= this.buttons.length)
				continue;

			this.buttons[i]?.RightMouseUp(position, this.game.CurrentPopupTicks);
		}
	}

	Hover(position) {
		this.listBox?.Hover(position);

		this.buttons.forEach(button => button.Hover(position));
	}

	AddOptionsListBox(items) {
		if (this.listBox != null)
			throw new AmbermoonException(ExceptionScope.Application, 'Only one list box can be added.');

		return this.listBox = ListBox.CreateOptionsListbox(this.renderView, this.game, this, items);
	}

	AddSavegameListBox(items, canEdit, maxItems, yOffset) {
		if (this.listBox != null)
			throw new AmbermoonException(ExceptionScope.Application, 'Only one list box can be added.');

		return this.listBox = ListBox.CreateSavegameListbox(this.renderView, this.game, this, items, canEdit, maxItems, yOffset);
	}

	AddDictionaryListBox(items, colorProvider) {
		if (this.listBox != null)
			throw new AmbermoonException(ExceptionScope.Application, 'Only one list box can be added.');

		return this.listBox = ListBox.CreateDictionaryListbox(this.renderView, this.game, this, items, colorProvider);
	}

	AddSpellListBox(items) {
		if (this.listBox != null)
			throw new AmbermoonException(ExceptionScope.Application, 'Only one list box can be added.');

		return this.listBox = ListBox.CreateSpellListbox(this.renderView, this.game, this, items);
	}

	AddSongListBox(items) {
		if (this.listBox != null)
			throw new AmbermoonException(ExceptionScope.Application, 'Only one list box can be added.');

		return this.listBox = ListBox.CreateSongListbox(this.renderView, this.game, this, items);
	}

	AddScrollbar(layout, scrollRange, displayLayer = 1, yOffset = 0) {
		return this.scrollbar = new Scrollbar(this.game, layout, ScrollbarType.LargeVertical, new Rect(this.ContentArea.Right - 9, this.ContentArea.Top + yOffset, 6, 112),
			6, 56, scrollRange, toByte(Util.Min(255, this.DisplayLayer + displayLayer)));
	}

	HasTextInput() {
		return this.inputs.length !== 0 || this.listBox?.Editing === true;
	}

	AddTextInput(position, inputLength, textAlign, leftClickAction, rightClickAction) {
		this.AddSunkenBox(new Rect(position, new Size((inputLength + 1) * Global.GlyphWidth + 3, 10)), 1);
		const input = new TextInput(this.game, this.renderView, Position.op_Addition(position, new Position(2, 2)), inputLength, toByte(Math.min(255, this.DisplayLayer + 2)),
			leftClickAction, rightClickAction, textAlign);
		this.inputs.push(input);
		return input;
	}

	Update(currentTicks) {
		for (const button of this.buttons)
			button?.Update(currentTicks);

		for (const input of this.inputs)
			input.Update();

		this.listBox?.Update(currentTicks);
	}
}
