// Port of Ambermoon.Core/UI/TextInput.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// Text input UI element

import { Event, Exception, isNullOrEmpty, isNullOrWhiteSpace, toByte } from '../../../runtime.js';
import { Position } from '../../Ambermoon.Common/Position.js';
import { Rect } from '../../Ambermoon.Common/Rect.js';
import { Color as TextColor } from '../../Ambermoon.Data.Common/Enumerations/Color.js';
import { Color } from '../Render/Color.js';
import { Layer } from '../Render/Layer.js';
import { TextAlign } from '../Render/TextAlign.js';
import { Key } from '../Key.js';
import { MouseButtons } from '../MouseButtons.js';
import { Global } from './Global.js';
import { UIText } from './UIText.js';

const ClickAction = Object.freeze({
	Submit: 0,
	Focus: 1,
	FocusOrSubmit: 2,
	Abort: 3,
	LoseFocus: 4
});

/** uint.Parse */
function parseUInt(s) {
	if (!/^\s*\+?[0-9]+\s*$/.test(s))
		throw new Exception(`Input string '${s}' was not in a correct format.`);
	const value = Number.parseInt(s.trim(), 10);
	if (value > 0xffffffff)
		throw new Exception('Value was either too large or too small for a UInt32.');
	return value;
}

/**
 * This will not draw any frame or background. It only
 * displays the text and blinking cursor and handles
 * the key inputs.
 */
export class TextInput {
	static ClickAction = ClickAction;

	static FocusedInput = null;

	static FocusChanged = new Event();

	constructor(game, renderView, position, inputLength, displayLayer,
		leftClickAction, rightClickAction, textAlign) {
		this.currentInput = '';
		this.currentText = '';
		this.visible = true;
		this.InputSubmitted = new Event();
		this.Aborted = new Event();
		this.InputChanged = new Event();
		this.ReactToGlobalClicks = false;
		this.DigitsOnly = false;
		this.MaxIntegerValue = null;
		this.AllowEmpty = false;
		/** If true losing focus will also submit the current input. */
		this.AutoSubmit = false;
		this.ClearOnNewInput = false;

		this.leftClickAction = leftClickAction;
		this.rightClickAction = rightClickAction;
		this.renderView = renderView;
		this.inputLength = inputLength;
		this.textAlign = textAlign;

		// Note: There is always 1 char-slot more as the input length.
		this.area = new Rect(position.X, position.Y, (inputLength + 1) * Global.GlyphWidth - 2, Global.GlyphLineHeight);
		this.text = new UIText(renderView, game?.UIPaletteIndex ?? toByte(renderView.GraphicInfoProvider.PrimaryUIPaletteIndex - 1),
			renderView.TextProcessor.CreateText(''), Global.GetTextRect(renderView, this.area), displayLayer, TextColor.BrightGray, true, textAlign);

		this.blinkingCursor = renderView.ColoredRectFactory.Create(5, 5, game?.GetUIColor(28) ?? new Color(0x66, 0x66, 0x55), displayLayer);
		this.blinkingCursor.Layer = renderView.GetLayer(Layer.UI);
		this.blinkingCursor.X = position.X;
		this.blinkingCursor.Y = position.Y;
		this.blinkingCursor.Visible = false;
		this.lastBlinkTime = Date.now();
	}

	get Text() {
		return this.currentText;
	}

	set Text(value) {
		if (this.currentText === value)
			return;

		this.currentText = value;
		this.UpdateText();
	}

	SetText(text) {
		this.currentInput = text;
		this.currentText = text;
		this.UpdateText();
	}

	get Visible() {
		return this.visible;
	}

	set Visible(value) {
		this.visible = value;
		this.text.Visible = value;

		if (!value)
			this.blinkingCursor.Visible = false;
	}

	get Value() {
		return this.Text.length === 0 ? 0 : parseUInt(this.Text);
	}

	get Empty() {
		return isNullOrEmpty(this.currentInput);
	}

	get Whitespace() {
		return isNullOrWhiteSpace(this.currentInput);
	}

	MoveTo(position) {
		this.area.Position = new Position(position);
		this.text.SetPosition(position);
		this.blinkingCursor.X = position.X;
		this.blinkingCursor.Y = position.Y;
	}

	Submit() {
		if ((!this.AllowEmpty || this.DigitsOnly) && isNullOrEmpty(this.currentInput)) {
			this.Abort();
		} else {
			if (this.DigitsOnly) {
				let digits = '';
				for (const ch of this.currentInput) {
					if (ch >= '0' && ch <= '9')
						digits += ch;
					else
						break;
				}

				if (digits.length === 0) {
					this.Text = '0';
				} else {
					const digitString = digits.replace(/^0+/, '');

					if (digitString.length === 0) {
						this.Text = '0';
					} else {
						let value = parseUInt(digitString);

						if (this.MaxIntegerValue != null && value > this.MaxIntegerValue)
							value = this.MaxIntegerValue;

						this.Text = String(value);
					}
				}
			} else {
				this.Text = this.currentInput;
			}

			this.currentInput = this.Text;
			this.LoseFocus();
			this.UpdateText();
			this.InputSubmitted.invoke(this.Text);
		}
	}

	SetFocus() {
		if (!this.Visible)
			return;

		const prevFocusedInput = TextInput.FocusedInput;
		TextInput.FocusedInput = this;

		if (prevFocusedInput != null && prevFocusedInput !== this)
			prevFocusedInput.blinkingCursor.Visible = false;

		this.blinkingCursor.Visible = true;
		this.text.SetTextAlign(TextAlign.Left); // always left if writing
		this.lastBlinkTime = Date.now();

		if (this.ClearOnNewInput) {
			this.currentInput = '';
			this.UpdateText();
		}

		TextInput.FocusChanged.invoke();
	}

	LoseFocus() {
		if (TextInput.FocusedInput === this) {
			TextInput.FocusedInput = null;
			this.blinkingCursor.Visible = false;
			this.text.SetTextAlign(this.textAlign);

			if (this.AutoSubmit)
				this.Submit();

			TextInput.FocusChanged.invoke();
		}
	}

	Update() {
		if (TextInput.FocusedInput !== this)
			return;

		const elapsed = Date.now() - this.lastBlinkTime;

		if (elapsed >= 350) {
			this.blinkingCursor.Visible = !this.blinkingCursor.Visible;
			this.lastBlinkTime = Date.now();
		}
	}

	Destroy() {
		this.LoseFocus();
		this.text?.Destroy();
		this.blinkingCursor?.Delete();
	}

	UpdateText() {
		const currentText = TextInput.FocusedInput === this ? this.currentInput : this.Text;
		this.text.SetText(this.renderView.TextProcessor.CreateText(currentText));
		this.blinkingCursor.X = this.area.X + this.currentInput.length * Global.GlyphWidth;
		this.InputChanged.invoke(currentText);
	}

	MouseDown(position, mouseButtons) {
		if (!this.ReactToGlobalClicks && !this.area.Contains(position))
			return false;

		const clickedInArea = this.area.Contains(position);

		let action;
		switch (mouseButtons) {
			case MouseButtons.Left:
				action = this.leftClickAction;
				break;
			case MouseButtons.Right:
				action = this.rightClickAction;
				break;
			default:
				action = null;
				break;
		}

		if (action == null)
			return false;

		switch (action) {
			case ClickAction.Submit:
				this.Submit();
				break;
			case ClickAction.Focus:
				if (clickedInArea)
					this.SetFocus();
				break;
			case ClickAction.FocusOrSubmit:
				if (TextInput.FocusedInput === this)
					this.Submit();
				else if (clickedInArea)
					this.SetFocus();
				break;
			case ClickAction.Abort:
				this.Abort();
				break;
			case ClickAction.LoseFocus:
				this.Text = this.currentInput;
				this.LoseFocus();
				this.UpdateText();
				break;
		}

		return true;
	}

	Abort() {
		this.currentInput = this.Text;
		this.LoseFocus();
		this.UpdateText();
		this.Aborted.invoke();
	}

	KeyChar(ch) {
		if (TextInput.FocusedInput !== this)
			return false;

		if (this.currentInput.length < this.inputLength && this.renderView.TextProcessor.IsValidCharacter(ch)) {
			this.currentInput += ch;
			this.UpdateText();
		}

		return true;
	}

	KeyDown(key) {
		if (TextInput.FocusedInput !== this)
			return false;

		switch (key) {
			case Key.Backspace:
				if (this.currentInput.length !== 0) {
					this.currentInput = this.currentInput.substring(0, this.currentInput.length - 1);
					this.UpdateText();
				}
				break;
			case Key.Return:
				this.Submit();
				break;
			case Key.Escape:
				this.Abort();
				break;
		}

		return true;
	}
}

export { ClickAction as TextInput_ClickAction };
