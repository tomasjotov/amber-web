// Port of Ambermoon.Core/UI/UIText.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// Advanced UI text element

import { Event, toByte } from '../../../runtime.js';
import { Rect } from '../../Ambermoon.Common/Rect.js';
import { Size } from '../../Ambermoon.Common/Size.js';
import { Color as TextColor } from '../../Ambermoon.Data.Common/Enumerations/Color.js';
import { Layer } from '../Render/Layer.js';
import { TextAlign } from '../Render/TextAlign.js';
import { Global } from './Global.js';

export class UIText {
	/**
	 * Overloads:
	 * - UIText(renderText)
	 * - UIText(renderView, paletteIndex, text, bounds, displayLayer = 1, textColor = BrightGray, shadow = true,
	 *          textAlign = Left, allowScrolling = false, timedEventCreator = null)
	 *   timedEventCreator: (timeSpanInMs, action) => void
	 */
	constructor(renderViewOrRenderText, paletteIndex, text, bounds, displayLayer = 1,
		textColor = TextColor.BrightGray, shadow = true, textAlign = TextAlign.Left,
		allowScrolling = false, timedEventCreator = null) {
		this.renderView = null;
		this.text = null;
		this.renderText = null;
		this.bounds = null;
		this.allowScrolling = false;
		this.freeScrolling = false;
		this.isScrolling = false;
		this.lineOffset = 0;
		this.numVisibleLines = 0;
		this.timedEventCreator = null;
		this.textColorsPerLine = null;
		this.defaultTextColor = TextColor.BrightGray;
		this.WithScrolling = false;
		this.FreeScrollingStarted = new Event();
		this.FreeScrollingEnded = new Event();
		/**
		 * The boolean gives information if the
		 * text was scrolled to the end. It is
		 * true for non-scrollable texts.
		 */
		this.Clicked = new Event();
		/**
		 * The boolean gives information if the
		 * text was just scrolled to the end.
		 */
		this.Scrolled = new Event();

		if (arguments.length === 1) {
			const renderText = renderViewOrRenderText;
			this.allowScrolling = false;
			this.renderText = renderText;
			this.defaultTextColor = renderText.TextColor;
			this.textColorsPerLine = renderText.GetTextColorPerLine(null);
			return;
		}

		const renderView = renderViewOrRenderText;
		this.renderView = renderView;
		this.text = renderView.TextProcessor.WrapText(text, bounds, new Size(Global.GlyphWidth, Global.GlyphLineHeight));
		this.bounds = bounds;
		this.allowScrolling = allowScrolling;
		this.renderText = renderView.RenderTextFactory.Create(
			toByte(renderView.GraphicInfoProvider.DefaultTextPaletteIndex - 1),
			renderView.GetLayer(Layer.Text),
			this.text, textColor, shadow, bounds, textAlign);
		this.renderText.DisplayLayer = displayLayer;
		this.renderText.PaletteIndex = paletteIndex;
		this.renderText.Visible = true;
		this.defaultTextColor = textColor;
		this.numVisibleLines = Math.trunc((bounds.Height + 1) / Global.GlyphLineHeight);
		this.WithScrolling = allowScrolling;
		this.timedEventCreator = timedEventCreator;
		this.textColorsPerLine = this.renderText.GetTextColorPerLine(this.text);

		if (allowScrolling && this.text.LineCount > this.numVisibleLines) {
			this.lineOffset = -this.numVisibleLines;
			this.ScrollTo(0);
		}
	}

	get CanScroll() {
		return this.WithScrolling && this.text?.LineCount > this.numVisibleLines;
	}

	get NumVisibleLines() {
		return this.numVisibleLines;
	}

	get Visible() {
		return this.renderText.Visible;
	}

	set Visible(value) {
		this.renderText.Visible = value;
	}

	get PaletteIndex() {
		return this.renderText.PaletteIndex;
	}

	set PaletteIndex(value) {
		this.renderText.PaletteIndex = value;
	}

	get Area() {
		return new Rect(this.renderText.X, this.renderText.Y, this.renderText.Width, this.renderText.Height);
	}

	Destroy() {
		this.renderText?.Delete();
	}

	UpdateText(lineOffset) {
		if (this.textColorsPerLine != null && lineOffset >= 0 && lineOffset < this.textColorsPerLine.length)
			this.renderText.TextColor = this.textColorsPerLine[lineOffset];
		this.renderText.Text = this.renderView.TextProcessor.WrapText(
			this.renderView.TextProcessor.GetLines(this.text, lineOffset, this.numVisibleLines), this.bounds,
			new Size(Global.GlyphWidth, Global.GlyphLineHeight));
	}

	SetText(text) {
		this.text = this.renderView.TextProcessor.WrapText(text, this.bounds, new Size(Global.GlyphWidth, Global.GlyphLineHeight));
		this.renderText.TextColor = this.defaultTextColor;
		this.textColorsPerLine = this.renderText.GetTextColorPerLine(this.text);
		this.allowScrolling = this.WithScrolling;
		this.freeScrolling = false;
		this.lineOffset = 0;

		if (this.allowScrolling && this.text.LineCount > this.numVisibleLines) {
			this.lineOffset = -this.numVisibleLines;
			this.ScrollTo(0);
		} else
			this.UpdateText(0);
	}

	SetTextColor(textColor) {
		this.renderText.TextColor = this.defaultTextColor = textColor;
		this.textColorsPerLine = this.renderText.GetTextColorPerLine(this.text);
	}

	SetTextAlign(textAlign) {
		this.renderText.TextAlign = textAlign;
	}

	SetBounds(bounds) {
		this.renderText.Place(bounds, this.renderText.TextAlign);
	}

	SetPosition(position) {
		this.renderText.Place(position.X, position.Y);
	}

	MouseMove(y, mobile) {
		if (this.freeScrolling) {
			if (y < 0) {
				if (this.lineOffset > 0) {
					if (mobile) {
						this.lineOffset = Math.max(0, this.lineOffset - Math.trunc(this.NumVisibleLines / 2));
						this.UpdateText(this.lineOffset);
					} else {
						this.UpdateText(--this.lineOffset);
					}
				}
			} else if (y > 0) {
				if (this.lineOffset < this.text.LineCount - this.numVisibleLines) {
					if (mobile) {
						this.lineOffset = Math.min(this.text.LineCount - this.numVisibleLines, this.lineOffset + Math.trunc(this.NumVisibleLines / 2));
						this.UpdateText(this.lineOffset);
					} else {
						this.UpdateText(++this.lineOffset);
					}
				}
			}
		}
	}

	InvokeClickEvent() {
		this.Clicked.invoke(true);
	}

	Click(position) {
		if (this.isScrolling)
			return true;

		if (this.freeScrolling) {
			this.freeScrolling = false;
			this.FreeScrollingEnded.invoke();
			this.Scrolled.invoke(true);
			this.Clicked.invoke(true);
			return true;
		}

		if (this.allowScrolling) {
			if (this.lineOffset >= this.text.LineCount - this.numVisibleLines) {
				this.allowScrolling = false;
				const wasScrollable = this.text.LineCount > this.numVisibleLines;

				if (wasScrollable) {
					this.freeScrolling = true;
					this.FreeScrollingStarted.invoke();
				} else {
					this.Scrolled.invoke(true);
					this.Clicked.invoke(true);
				}
			} else {
				this.ScrollTo(Math.min(this.lineOffset + this.numVisibleLines, this.text.LineCount - this.numVisibleLines));
			}

			return true;
		}

		this.Clicked.invoke(true);

		return false;
	}

	ScrollTo(lineOffset) {
		if (this.lineOffset === lineOffset) {
			this.isScrolling = false;
			this.Scrolled.invoke(false);
			this.Clicked.invoke(false);
		} else {
			this.isScrolling = true;
			this.UpdateText(++this.lineOffset);
			this.timedEventCreator?.(50, () => this.ScrollTo(lineOffset));
		}
	}

	Clip(area) {
		this.renderText.ClipArea = area;
	}

	IncreaseClipWidth(amount) {
		this.renderText.ClipArea = this.renderText.ClipArea.CreateModified(0, 0, amount, 0);
	}
}
