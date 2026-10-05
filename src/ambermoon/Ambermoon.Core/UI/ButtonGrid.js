// Port of Ambermoon.Core/UI/ButtonGrid.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// The 3x3 button grid at the lower right

import { Event, hasFlag, newArray } from '../../../runtime.js';
import { Position } from '../../Ambermoon.Common/Position.js';
import { Rect } from '../../Ambermoon.Common/Rect.js';
import { MouseButtons } from '../MouseButtons.js';
import { Button } from './Button.js';
import { Global } from './Global.js';

// Created lazily (static constructor uses imported classes).
let buttonAreas = null;

/**
 * The 3x3 button grid at the lower right.
 */
export class ButtonGrid {
	static get ButtonAreas() {
		if (buttonAreas == null) {
			buttonAreas = newArray(9);

			for (let i = 0; i < 9; ++i) {
				buttonAreas[i] = new Rect(Global.ButtonGridX + (i % 3) * Button.Width,
					Global.ButtonGridY + Math.trunc(i / 3) * Button.Height, Button.Width, Button.Height);
			}
		}

		return buttonAreas;
	}

	constructor(renderView) {
		this.buttons = newArray(9);
		this.RightMouseClicked = new Event();
		this.rightMouseDown = false;
		this.visible = true;
		this.Disabled = false;

		this.area = new Rect(Global.ButtonGridArea);

		for (let i = 0; i < 9; ++i) {
			this.buttons[i] = new Button(renderView, new Position(ButtonGrid.ButtonAreas[i].Position));
		}
	}

	GetButtonAction(index) {
		return this.buttons[index].LeftClickAction;
	}

	IsButtonPressed(index) {
		return this.buttons[index].Pressed;
	}

	PressButton(index, currentTicks) {
		return this.Disabled || this.buttons[index].Disabled ? null : this.buttons[index].Press(currentTicks);
	}

	ReleaseButton(index, immediately = false) {
		if (!this.Disabled && !this.buttons[index].Disabled)
			this.buttons[index].Release(immediately);
	}

	SetButtonAction(slot, action) {
		this.buttons[slot].LeftClickAction = action;
	}

	EnableButton(slot, enable) {
		this.buttons[slot].Disabled = !enable;
	}

	GetButton(index) {
		return this.buttons[index];
	}

	SetButton(slot, buttonType, disabled, action, instantAction, tooltip = null, cursorChangeAction = null,
		continuousActionDelayInTicks = null) {
		this.buttons[slot].ButtonType = buttonType;
		this.buttons[slot].LeftClickAction = action;
		this.buttons[slot].InstantAction = instantAction;
		this.buttons[slot].CursorChangeAction = cursorChangeAction;
		this.buttons[slot].ContinuousActionDelayInTicks = continuousActionDelayInTicks;
		this.buttons[slot].Disabled = disabled;
		this.buttons[slot].Tooltip = tooltip;
	}

	HideTooltips() {
		for (const button of this.buttons)
			button?.HideTooltip();
	}

	Hover(position) {
		for (const button of this.buttons) {
			if (button != null && !button.Disabled && button.Visible)
				button.Hover(position);
		}
	}

	/** C#: MouseUp(position, mouseButtons, out newCursorType, currentTicks) -> returns [newCursorType] */
	MouseUp(position, mouseButtons, currentTicks) {
		let newCursorType = null;

		if (this.Disabled)
			return [newCursorType];

		if (hasFlag(mouseButtons, MouseButtons.Right)) {
			if (this.rightMouseDown) {
				this.rightMouseDown = false;
				this.RightMouseClicked.invoke();
			}
			return [newCursorType];
		}

		for (let i = 0; i < 9; ++i)
			[newCursorType] = this.buttons[i].LeftMouseUp(position, newCursorType, currentTicks);

		return [newCursorType];
	}

	/** C#: MouseDown(position, mouseButtons, out newCursorType, currentTicks) -> returns [bool, newCursorType] */
	MouseDown(position, mouseButtons, currentTicks) {
		let newCursorType = null;

		if (this.Disabled)
			return [false, newCursorType];

		if (mouseButtons === MouseButtons.Left) {
			for (let i = 0; i < 9; ++i) {
				let result;
				[result, newCursorType] = this.buttons[i].LeftMouseDown(position, newCursorType, currentTicks);
				if (result)
					return [true, newCursorType];
			}
		} else if (mouseButtons === MouseButtons.Right) {
			if (this.area.Contains(position))
				this.rightMouseDown = true;
		}

		return [false, newCursorType];
	}

	Update(currentTicks) {
		for (const button of this.buttons)
			button.Update(currentTicks);
	}

	get Visible() {
		return this.visible;
	}

	set Visible(value) {
		if (this.visible === value)
			return;

		this.visible = value;

		for (const button of this.buttons)
			button.Visible = this.visible;
	}

	get PaletteIndex() {
		return this.buttons[0].PaletteIndex;
	}

	set PaletteIndex(value) {
		for (const button of this.buttons)
			button.PaletteIndex = value;
	}
}
