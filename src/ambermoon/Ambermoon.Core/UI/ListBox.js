// Port of Ambermoon.Core/UI/ListBox.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// List box UI element inside popups
//
// Items are a list of KeyValuePair<string, Action<int, string>?> which are represented
// as plain objects { Key: string, Value: ((index, text) => void) | null }.

import { Event, isNullOrWhiteSpace, toByte } from '../../../runtime.js';
import { Position } from '../../Ambermoon.Common/Position.js';
import { Rect } from '../../Ambermoon.Common/Rect.js';
import { Size } from '../../Ambermoon.Common/Size.js';
import { Util } from '../../Ambermoon.Common/Util.js';
import { Color as TextColor } from '../../Ambermoon.Data.Common/Enumerations/Color.js';
import { TextAlign } from '../Render/TextAlign.js';
import { Global } from './Global.js';
import { TextInput } from './TextInput.js';

/** KeyValuePair.Create(key, value) */
function keyValuePair(Key, Value) {
	return { Key, Value };
}

/** $"{value,2}" */
function alignRight2(value) {
	return String(value).padStart(2, ' ');
}

export class ListBox {
	// Note: Private constructor in C#. Use the static Create* methods.
	constructor(renderView, game, popup, items, area, itemBasePosition, itemHeight, hoverBoxWidth, relativeHoverBoxOffset,
		withIndex, maxItems, fallbackChar = null, canEdit = false, colorProvider = null) {
		this.itemAreas = [];
		this.itemIndices = [];
		this.itemTexts = [];
		this.editInput = null;
		this.hoveredItem = -1;
		this.scrollOffset = 0;
		this.editingItem = -1;
		this.canEdit = false;
		this.lastHoverPosition = new Position();
		this.HoverItem = new Event();

		this.game = game;
		this.renderView = renderView;
		this.items = items;
		this.relativeHoverBoxOffset = relativeHoverBoxOffset;
		this.maxItems = maxItems;
		this.canEdit = canEdit;
		this.colorProvider = colorProvider;
		this.Bounds = new Rect(area);

		popup.AddSunkenBox(area);
		this.hoverBox = popup.FillArea(new Rect(Position.op_Addition(itemBasePosition, relativeHoverBoxOffset), new Size(hoverBoxWidth, itemHeight)),
			game.GetTextColor(TextColor.Bright), 3);
		this.hoverBox.Visible = false;

		for (let i = 0; i < Util.Min(maxItems, items.length); ++i) {
			const color = items[i].Value == null ? TextColor.Disabled
				: colorProvider?.(items[i].Key) ?? TextColor.Bright;

			if (withIndex) {
				const y = itemBasePosition.Y + i * itemHeight;
				this.itemIndices.push(popup.AddText(new Position(itemBasePosition.X, y), alignRight2(i + 1), color, true, 4));
				this.itemTexts.push(popup.AddText(new Position(itemBasePosition.X + 17, y), items[i].Key, color, true, 4, fallbackChar));
			} else {
				this.itemTexts.push(popup.AddText(new Position(itemBasePosition.X, itemBasePosition.Y + i * itemHeight),
					items[i].Key, color, true, 4, fallbackChar));
			}
			this.itemAreas.push(new Rect(itemBasePosition.X, itemBasePosition.Y + i * itemHeight, area.Right - itemBasePosition.X - 1, itemHeight));
		}

		if (canEdit && this.itemTexts.length !== 0) {
			this.editInput = new TextInput(game, renderView, new Position(), 38,
				toByte(popup.DisplayLayer + 6), TextInput.ClickAction.Submit, TextInput.ClickAction.Abort, TextAlign.Left);
			this.editInput.ClearOnNewInput = false;
			this.editInput.DigitsOnly = false;
			this.editInput.ReactToGlobalClicks = true;
			this.editInput.InputSubmitted.add(_ => this.CommitEdit());
			this.editInput.Aborted.add(() => this.AbortEdit());
		}
	}

	get ScrollRange() {
		return this.items.length - this.itemAreas.length;
	}

	get Editing() {
		return this.editingItem !== -1;
	}

	static CreateOptionsListbox(renderView, game, popup, items) {
		return new ListBox(renderView, game, popup, items, new Rect(64, 85, 191, 52), new Position(67, 87), 7, 189, new Position(-2, -1), false, 7);
	}

	static CreateSavegameListbox(renderView, game, popup, items, canEdit, maxItems, yOffset) {
		return new ListBox(renderView, game, popup, items, new Rect(32, 85 + yOffset, 256, maxItems * Global.GlyphLineHeight + 3),
			new Position(33, 87 + yOffset), 7, 237, new Position(16, -1), true, maxItems, '?', canEdit);
	}

	static CreateDictionaryListbox(renderView, game, popup, items, colorProvider) {
		return new ListBox(renderView, game, popup, items, new Rect(48, 48, 130, 115),
			new Position(52, 50), 7, 127, new Position(-3, -1), false, 16, null, false, colorProvider);
	}

	static CreateSpellListbox(renderView, game, popup, items) {
		return new ListBox(renderView, game, popup, items, new Rect(48, 56, 162, 115),
			new Position(52, 58), 7, 159, new Position(-3, -1), false, 16);
	}

	static CreateSongListbox(renderView, game, popup, items) {
		return new ListBox(renderView, game, popup, items, new Rect(32, 50, 192, 115),
			new Position(36, 52), 7, 189, new Position(-3, -1), false, 16);
	}

	Destroy() {
		this.items.length = 0;
		this.itemAreas.length = 0;
		this.itemIndices.forEach(t => t?.Delete());
		this.itemIndices.length = 0;
		this.itemTexts.forEach(t => t?.Delete());
		this.itemTexts.length = 0;
		this.hoverBox?.Delete();
		this.hoveredItem = -1;
		this.scrollOffset = 0;
		this.editInput?.Destroy();
	}

	SetItemText(index, text, fallbackChar = null) {
		this.itemTexts[index - this.scrollOffset].Text = this.renderView.TextProcessor.CreateText(text, fallbackChar);
		this.items[index] = keyValuePair(text, this.items[index].Value);
		this.itemTexts[index - this.scrollOffset].Visible = !isNullOrWhiteSpace(text);
		this.PostScrollUpdate();
	}

	SetTextHovered(text, hovered, enabled, textEntry) {
		text.Shadow = !enabled || !hovered;
		text.TextColor = !enabled ? TextColor.Disabled : hovered ? TextColor.Dark
			: this.colorProvider?.(textEntry) ?? TextColor.Bright;
	}

	SetHoveredItem(index) {
		if (this.hoveredItem !== -1) {
			const realIndex = this.scrollOffset + this.hoveredItem;
			this.SetTextHovered(this.itemTexts[this.hoveredItem], false, this.items[realIndex].Value != null, this.items[realIndex].Key);
		}

		if (this.hoveredItem !== index)
			this.HoverItem.invoke(this.scrollOffset + index);

		this.hoveredItem = index;

		if (this.hoveredItem !== -1) {
			const realIndex = this.scrollOffset + this.hoveredItem;
			const enabled = this.items[realIndex].Value != null;
			this.SetTextHovered(this.itemTexts[this.hoveredItem], true, enabled, this.items[realIndex].Key);
			this.hoverBox.Y = this.itemAreas[index].Y + this.relativeHoverBoxOffset.Y;
			this.hoverBox.Visible = enabled;

			if (this.hoverBox.Visible)
				this.hoverBox.Color = this.game.GetTextColor(this.colorProvider?.(this.items[realIndex].Key) ?? TextColor.Bright);
		} else {
			this.hoverBox.Visible = false;
		}
	}

	Hover(position) {
		this.lastHoverPosition = position;

		if (!this.Editing) {
			for (let i = 0; i < Util.Min(this.maxItems, this.items.length); ++i) {
				if (this.itemAreas[i].Contains(position)) {
					this.SetHoveredItem(i);
					return;
				}
			}
		}

		this.SetHoveredItem(-1);
	}

	CommitEdit() {
		if (!this.Editing)
			return;

		const itemIndex = this.editingItem;
		this.editingItem = -1;
		if (this.editInput === TextInput.FocusedInput)
			this.editInput?.Submit();
		this.AbortEdit(itemIndex);
		this.itemTexts[itemIndex - this.scrollOffset].Text = this.renderView.TextProcessor.CreateText(this.editInput.Text);
		this.items[itemIndex] = keyValuePair(this.editInput.Text, this.items[itemIndex].Value);
		this.items[itemIndex].Value?.(itemIndex, this.items[itemIndex].Key);
		this.Hover(this.lastHoverPosition);
	}

	AbortEdit(index = null) {
		if (!this.Editing && index == null)
			return;

		this.itemTexts[(index ?? this.editingItem) - this.scrollOffset].Visible = true;
		this.editingItem = -1;
		this.editInput.LoseFocus();
		this.editInput.Visible = false;
		this.Hover(this.lastHoverPosition);
	}

	StartEdit(row, itemIndex) {
		this.editingItem = itemIndex;
		this.SetHoveredItem(-1);
		this.itemTexts[row].Visible = false;
		this.editInput.MoveTo(new Position(this.itemTexts[row].X, this.itemTexts[row].Y));
		this.editInput.Visible = true;
		this.editInput.SetText(this.items[itemIndex].Key);
		this.editInput.SetFocus();
	}

	Update(ticks) {
		this.editInput?.Update();
	}

	KeyChar(ch) {
		return this.editInput?.KeyChar(ch) ?? false;
	}

	KeyDown(key) {
		return this.editInput?.KeyDown(key) ?? false;
	}

	Click(position) {
		if (this.Editing) {
			this.CommitEdit();
			return true;
		}

		for (let i = 0; i < Util.Min(this.maxItems, this.items.length); ++i) {
			if (this.itemAreas[i].Contains(position)) {
				if (this.canEdit) {
					if (!this.Editing)
						this.StartEdit(i, this.scrollOffset + i);
					return true;
				}

				if (this.items[this.scrollOffset + i].Value == null)
					return false;

				this.items[this.scrollOffset + i].Value?.(this.scrollOffset + i, this.items[this.scrollOffset + i].Key);
				return true;
			}
		}

		return false;
	}

	ScrollUp() {
		if (this.scrollOffset > 0) {
			--this.scrollOffset;
			this.PostScrollUpdate();
		}
	}

	ScrollDown() {
		if (this.scrollOffset < this.ScrollRange) {
			++this.scrollOffset;
			this.PostScrollUpdate();
		}
	}

	ScrollToBegin() {
		if (this.scrollOffset !== 0) {
			this.scrollOffset = 0;
			this.PostScrollUpdate();
		}
	}

	ScrollToEnd() {
		if (this.scrollOffset !== this.ScrollRange) {
			this.scrollOffset = this.ScrollRange;
			this.PostScrollUpdate();
		}
	}

	ScrollTo(offset) {
		offset = Math.max(0, Math.min(offset, this.ScrollRange));

		if (this.scrollOffset !== offset) {
			this.scrollOffset = offset;
			this.PostScrollUpdate();
		}
	}

	PostScrollUpdate() {
		const withIndex = this.itemIndices.length !== 0;

		for (let i = 0; i < this.itemAreas.length; ++i) {
			const textColor = this.items[this.scrollOffset + i].Value == null ? TextColor.Disabled
				: this.colorProvider?.(this.items[this.scrollOffset + i].Key) ?? TextColor.Bright;

			if (withIndex) {
				this.itemIndices[i].Text = this.renderView.TextProcessor.CreateText(alignRight2(this.scrollOffset + i + 1));
				this.itemIndices[i].TextColor = textColor;
			}
			this.itemTexts[i].Text = this.renderView.TextProcessor.CreateText(this.items[this.scrollOffset + i].Key);
			this.itemTexts[i].TextColor = textColor;
		}
	}

	SetItemAction(index, action) {
		this.items[index] = keyValuePair(this.items[index].Key, action);
		this.PostScrollUpdate();
	}
}
