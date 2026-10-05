// Port of Ambermoon.Game/CharacterCreator.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// CharacterCreator.cs - Character creator window

import { isNullOrWhiteSpace } from '../../runtime.js';
import { Position } from '../Ambermoon.Common/Position.js';
import { Size } from '../Ambermoon.Common/Size.js';
import { Rect } from '../Ambermoon.Common/Rect.js';
import { Util } from '../Ambermoon.Common/Util.js';
import { ButtonType } from '../Ambermoon.Data.Common/Enumerations/ButtonType.js';
import { UICustomGraphic } from '../Ambermoon.Data.Common/Enumerations/UICustomGraphic.js';
import { Color as TextColor } from '../Ambermoon.Data.Common/Enumerations/Color.js';
import { Color as RenderColor } from '../Ambermoon.Core/Render/Color.js';
import { Graphics } from '../Ambermoon.Core/Render/Graphics.js';
import { Layer } from '../Ambermoon.Core/Render/Layer.js';
import { TextAlign } from '../Ambermoon.Core/Render/TextAlign.js';
import { TextureAtlasManager } from '../Ambermoon.Core/Render/TextureAtlasManager.js';
import { Global } from '../Ambermoon.Core/UI/Global.js';
import { Button } from '../Ambermoon.Core/UI/Button.js';
import { PopupFrame } from '../Ambermoon.Core/UI/PopupFrame.js';
import { TextInput } from '../Ambermoon.Core/UI/TextInput.js';
import { Tutorial } from '../Ambermoon.Core/Tutorial.js';
import { Key } from '../Ambermoon.Core/Key.js';
import { MouseButtons } from '../Ambermoon.Core/MouseButtons.js';

const FadeTime = 250;

export class CharacterCreator {
	static MalePortraitIndices = [
		2, 25, 7, 23,
		// New in remake
		3, 16, 9, 17, 21
	];

	static FemalePortraitIndices = [
		31, 38, 44, 51,
		// New in remake
		39, 40, 41, 47, 52
	];

	static FadeTime = FadeTime;

	/**
	 * @param renderView IGameRenderView
	 * @param game Game
	 * @param selectHandler (name: string, female: boolean, portraitIndex: number) => void
	 */
	constructor(renderView, game, selectHandler) {
		// field initializers
		this.borders = [];
		this.backgroundFill = null;
		this.header = null;
		this.leftButton = null;
		this.rightButton = null;
		this.maleButton = null;
		this.femaleButton = null;
		this.okButton = null;
		this.tutorialButton = null;
		this.tutorialText = null;
		this.portraitBackground = null;
		this.portrait = null;
		this.nameInput = null;
		this.portraitBorders = [];
		this.sunkenBoxParts = [];
		this.fadeArea = null;
		this.fadeInStartTime = null;
		this.fadeOutStartTime = null;
		this.fadeIn = true;
		this.fadeOut = false;
		this.afterFadeOutAction = null;
		this.isFemale = false;
		this.portraitIndex = CharacterCreator.MalePortraitIndices[0];

		this.renderView = renderView;
		this.textureAtlas = TextureAtlasManager.Instance.GetOrCreate(Layer.UI);
		const fontTextureAtlas = TextureAtlasManager.Instance.GetOrCreate(Layer.Text);
		const spriteFactory = renderView.SpriteFactory;
		const layer = renderView.GetLayer(Layer.UI);

		//#region Window
		const windowSize = new Size(16, 6);
		const windowArea = new Rect
		(
			Math.trunc((Global.VirtualScreenWidth - windowSize.Width * 16) / 2),
			Math.trunc((Global.VirtualScreenHeight - windowSize.Height * 16) / 2) - 8,
			windowSize.Width * 16,
			windowSize.Height * 16
		);
		const AddBorder = (frame, column, row) => {
			const sprite = spriteFactory.Create(16, 16, true);
			sprite.Layer = layer;
			sprite.TextureAtlasOffset = this.textureAtlas.GetOffset(Graphics.GetPopupFrameGraphicIndex(frame));
			sprite.PaletteIndex = 0;
			sprite.X = windowArea.X + column * 16;
			sprite.Y = windowArea.Y + row * 16;
			sprite.Visible = true;
			this.borders.push(sprite);
		};
		// 4 corners
		AddBorder(PopupFrame.FrameUpperLeft, 0, 0);
		AddBorder(PopupFrame.FrameUpperRight, windowSize.Width - 1, 0);
		AddBorder(PopupFrame.FrameLowerLeft, 0, windowSize.Height - 1);
		AddBorder(PopupFrame.FrameLowerRight, windowSize.Width - 1, windowSize.Height - 1);
		// top and bottom border
		for (let i = 0; i < windowSize.Width - 2; ++i) {
			AddBorder(PopupFrame.FrameTop, i + 1, 0);
			AddBorder(PopupFrame.FrameBottom, i + 1, windowSize.Height - 1);
		}
		// left and right border
		for (let i = 0; i < windowSize.Height - 2; ++i) {
			AddBorder(PopupFrame.FrameLeft, 0, i + 1);
			AddBorder(PopupFrame.FrameRight, windowSize.Width - 1, i + 1);
		}
		this.backgroundFill = this.FillArea(new Rect(windowArea.X + 16, windowArea.Y + 16,
			windowSize.Width * 16 - 32, windowSize.Height * 16 - 32), game.GetUIColor(28), 0);
		//#endregion

		//#region Buttons
		const offset = windowArea.Position;
		this.maleButton = this.CreateButton(game, Position.op_Addition(offset, new Position(16, 26)));
		this.maleButton.ButtonType = ButtonType.Male;
		this.maleButton.Visible = true;
		this.maleButton.LeftClickAction = () => this.ChangeMale(false);
		this.femaleButton = this.CreateButton(game, Position.op_Addition(offset, new Position(16, 45)));
		this.femaleButton.ButtonType = ButtonType.Female;
		this.femaleButton.Visible = true;
		this.femaleButton.LeftClickAction = () => this.ChangeMale(true);
		this.leftButton = this.CreateButton(game, Position.op_Addition(offset, new Position(64 + 8, 35)));
		this.leftButton.ButtonType = ButtonType.MoveLeft;
		this.leftButton.Visible = true;
		this.leftButton.LeftClickAction = () => this.SwapPortrait(-1);
		this.rightButton = this.CreateButton(game, Position.op_Addition(offset, new Position(160 - 8, 35)));
		this.rightButton.ButtonType = ButtonType.MoveRight;
		this.rightButton.Visible = true;
		this.rightButton.LeftClickAction = () => this.SwapPortrait(1);
		this.okButton = this.CreateButton(game, new Position(windowArea.Right - 16 - 32, windowArea.Bottom - 16 - 17));
		this.okButton.ButtonType = ButtonType.Ok;
		this.okButton.ToggleButton = game.Configuration.IsMobile;
		this.okButton.Visible = true;
		this.okButton.LeftClickAction = () => {
			this.nameInput.Submit();
			this.afterFadeOutAction = () => selectHandler?.(this.nameInput.Text.toUpperCase(), this.isFemale, this.portraitIndex);
			this.DestroyAndFadeOut();
		};
		this.tutorialButton = this.CreateButton(game, new Position(this.okButton.Area.X, this.maleButton.Area.Y));
		this.tutorialButton.ButtonType = ButtonType.ReadScroll;
		this.tutorialButton.Visible = true;
		this.tutorialButton.Disabled = game.Configuration.FirstStart;
		this.tutorialButton.Pressed = game.Configuration.FirstStart;
		this.tutorialButton.ToggleButton = true;
		this.tutorialButton.LeftClickAction = () => {
			game.Configuration.FirstStart = !game.Configuration.FirstStart;
		};
		//#endregion

		this.portraitBackground = spriteFactory.Create(32, 34, true, 1);
		this.portraitBackground.Layer = layer;
		this.portraitBackground.X = offset.X + 112;
		this.portraitBackground.Y = offset.Y + 32;
		this.portraitBackground.TextureAtlasOffset = this.textureAtlas.GetOffset(Graphics.UICustomGraphicOffset + UICustomGraphic.PortraitBackground);
		this.portraitBackground.PaletteIndex = (renderView.GraphicInfoProvider.PrimaryUIPaletteIndex + 3 - 1) & 0xff;
		this.portraitBackground.Visible = true;

		this.portrait = spriteFactory.Create(32, 34, true, 2);
		this.portrait.Layer = layer;
		this.portrait.X = this.portraitBackground.X;
		this.portrait.Y = this.portraitBackground.Y;
		this.portrait.TextureAtlasOffset = this.textureAtlas.GetOffset(Graphics.PortraitOffset + this.portraitIndex - 1);
		this.portrait.PaletteIndex = (renderView.GraphicInfoProvider.PrimaryUIPaletteIndex - 1) & 0xff;
		this.portrait.Visible = true;

		// draw border around portrait
		const area = new Rect(this.portraitBackground.X - 1, this.portraitBackground.Y - 1, 34, 36);
		// TODO: use named palette colors
		const darkBorderColor = game.GetUIColor(26);
		const brightBorderColor = game.GetUIColor(31);
		// upper dark border
		this.portraitBorders.push(this.FillArea(new Rect(area.X, area.Y, area.Width - 1, 1), darkBorderColor, 1));
		// left dark border
		this.portraitBorders.push(this.FillArea(new Rect(area.X, area.Y + 1, 1, area.Height - 2), darkBorderColor, 1));
		// right bright border
		this.portraitBorders.push(this.FillArea(new Rect(area.Right - 1, area.Y + 1, 1, area.Height - 2), brightBorderColor, 1));
		// lower bright border
		this.portraitBorders.push(this.FillArea(new Rect(area.X + 1, area.Bottom - 1, area.Width - 1, 1), brightBorderColor, 1));

		const inputWidth = 16 * Global.GlyphWidth - 2;
		this.nameInput = new TextInput(null, renderView, new Position(windowArea.Center.X - Math.trunc(inputWidth / 2), offset.Y + 32 + 40),
			15, 2, TextInput.ClickAction.FocusOrSubmit, TextInput.ClickAction.Abort, TextAlign.Left);
		this.nameInput.AllowEmpty = true;
		this.nameInput.AutoSubmit = true;
		this.nameInput.SetText('Thalion');
		this.nameInput.InputChanged.add(text => { this.okButton.Disabled = isNullOrWhiteSpace(text); });
		this.AddSunkenBox(game, new Rect(windowArea.Center.X - Math.trunc(inputWidth / 2) - 2, offset.Y + 32 + 38, inputWidth + 6, Global.GlyphLineHeight + 3));

		const headerText = game.DataNameProvider.ChooseCharacter.trim();
		let textWidth = headerText.length * Global.GlyphWidth;
		let textOffset = Math.trunc((windowArea.Width - textWidth) / 2);
		this.header = this.AddText(Position.op_Addition(offset, new Position(textOffset, 16)), headerText, TextColor.BrightGray);
		let tutorialText = Tutorial.GetIntroductionTooltip(game.GameLanguage);
		if (tutorialText.length > 8)
			tutorialText = tutorialText.substring(0, 6) + '..';
		textWidth = tutorialText.length * Global.GlyphWidth;
		textOffset = windowArea.Right - textWidth - 12;
		this.tutorialText = this.AddText(new Position(textOffset, this.tutorialButton.Area.Bottom + 3), tutorialText, TextColor.BrightGray);

		this.fadeArea = renderView.ColoredRectFactory.Create(Global.VirtualScreenWidth, Global.VirtualScreenHeight, RenderColor.Black, 255);
		this.fadeArea.Layer = renderView.GetLayer(Layer.Effects);
		this.fadeArea.X = 0;
		this.fadeArea.Y = 0;
		this.fadeArea.Visible = true;
		this.fadeInStartTime = Date.now();
	}

	DestroyAndFadeOut() {
		this.fadeOutStartTime = Date.now();
		this.fadeOut = true;
		this.fadeArea.Color = RenderColor.Transparent;
		this.fadeArea.Visible = true;
	}

	Cleanup() {
		this.borders.forEach(b => b?.Delete());
		this.backgroundFill?.Delete();
		this.header?.Delete();
		this.leftButton?.Destroy();
		this.rightButton?.Destroy();
		this.maleButton?.Destroy();
		this.femaleButton?.Destroy();
		this.okButton?.Destroy();
		this.tutorialButton?.Destroy();
		this.tutorialText?.Delete();
		this.portraitBackground?.Delete();
		this.portrait?.Delete();
		this.portraitBorders.forEach(b => b?.Delete());
		this.nameInput?.Destroy();
		this.sunkenBoxParts.forEach(b => b?.Delete());
		this.fadeArea?.Delete();
		this.fadeArea = null;
	}

	ChangeMale(female) {
		this.isFemale = female;
		this.portraitIndex = this.isFemale ? CharacterCreator.FemalePortraitIndices[0] : CharacterCreator.MalePortraitIndices[0];
		this.UpdatePortrait();
	}

	SwapPortrait(offset) {
		const portraits = this.isFemale ? CharacterCreator.FemalePortraitIndices : CharacterCreator.MalePortraitIndices;
		const listIndex = portraits.indexOf(this.portraitIndex);

		if (listIndex === -1)
			this.portraitIndex = portraits[0];
		else
			this.portraitIndex = portraits[(listIndex + offset + portraits.length) % portraits.length];

		this.UpdatePortrait();
	}

	UpdatePortrait() {
		this.portrait.TextureAtlasOffset = this.textureAtlas.GetOffset(Graphics.PortraitOffset + this.portraitIndex - 1);
	}

	CreateButton(game, position) {
		this.AddSunkenBox(game, new Rect(position.X - 1, position.Y - 1, Button.Width + 2, Button.Height + 2), 2, 0);
		const button = new Button(this.renderView, position);
		button.Disabled = false;
		button.DisplayLayer = 1;
		return button;
	}

	AddSunkenBox(game, area, displayLayer = 1, fillColorIndex = 27) {
		const darkBorderColor = game.GetUIColor(26);
		const brightBorderColor = game.GetUIColor(31);
		const fillColor = game.GetUIColor(fillColorIndex);

		// upper dark border
		this.sunkenBoxParts.push(this.FillArea(new Rect(area.X, area.Y, area.Width - 1, 1), darkBorderColor, displayLayer));
		// left dark border
		this.sunkenBoxParts.push(this.FillArea(new Rect(area.X, area.Y + 1, 1, area.Height - 2), darkBorderColor, displayLayer));
		// fill
		this.sunkenBoxParts.push(this.FillArea(new Rect(area.X + 1, area.Y + 1, area.Width - 2, area.Height - 2), fillColor, displayLayer));
		// right bright border
		this.sunkenBoxParts.push(this.FillArea(new Rect(area.Right - 1, area.Y + 1, 1, area.Height - 2), brightBorderColor, displayLayer));
		// lower bright border
		this.sunkenBoxParts.push(this.FillArea(new Rect(area.X + 1, area.Bottom - 1, area.Width - 1, 1), brightBorderColor, displayLayer));
	}

	FillArea(area, color, displayLayer = 1) {
		const filledArea = this.renderView.ColoredRectFactory.Create(area.Width, area.Height, color, displayLayer);
		filledArea.Layer = this.renderView.GetLayer(Layer.UI);
		filledArea.X = area.Left;
		filledArea.Y = area.Top;
		filledArea.Visible = true;
		return filledArea;
	}

	AddText(position, text, textColor, shadow = true, displayLayer = 1, fallbackChar = null) {
		const renderText = this.renderView.RenderTextFactory.Create(
			(this.renderView.GraphicInfoProvider.DefaultTextPaletteIndex - 1) & 0xff,
			this.renderView.GetLayer(Layer.Text),
			this.renderView.TextProcessor.CreateText(text, fallbackChar), textColor, shadow);
		renderText.DisplayLayer = displayLayer;
		renderText.X = position.X;
		renderText.Y = position.Y + Global.GlyphLineHeight - this.renderView.FontProvider.GetFont().GlyphHeight;
		renderText.Visible = true;
		return renderText;
	}

	Update(deltaTime) {
		if (this.fadeIn) {
			const blackness = 1.0 - (Date.now() - this.fadeInStartTime) / FadeTime;

			if (blackness <= 0.0) {
				this.fadeArea.Visible = false;
				this.fadeIn = false;
			} else
				this.fadeArea.Color = new RenderColor(0, 0, 0, Util.Round(blackness * 255));
		} else if (this.fadeOut) {
			if (this.fadeArea != null) {
				const blackness = (Date.now() - this.fadeOutStartTime) / FadeTime;

				if (blackness >= 1.0) {
					this.afterFadeOutAction?.();
					this.Cleanup();
				} else
					this.fadeArea.Color = new RenderColor(0, 0, 0, Util.Round(blackness * 255));
			}
		} else {
			this.maleButton?.Update(0);
			this.femaleButton?.Update(0);
			this.leftButton?.Update(0);
			this.rightButton?.Update(0);
			this.okButton?.Update(0);
			this.nameInput?.Update();
		}
	}

	OnKeyDown(key, modifiers) {
		if (this.fadeIn || this.fadeOut)
			return;

		if (TextInput.FocusedInput === this.nameInput) {
			this.nameInput?.KeyDown(key);
			return;
		}

		switch (key) {
			case Key.PageUp:
			case Key.Up:
			case Key.Left:
				this.SwapPortrait(-1);
				break;
			case Key.PageDown:
			case Key.Down:
			case Key.Right:
				this.SwapPortrait(1);
				break;
			case Key.Return:
				if (!this.okButton.Disabled)
					this.okButton.Press(0);
				break;
		}
	}

	OnKeyChar(keyChar) {
		if (this.fadeIn || this.fadeOut)
			return;

		if (TextInput.FocusedInput === this.nameInput) {
			this.nameInput?.KeyChar(keyChar);
			return;
		}
	}

	OnMouseUp(position, buttons) {
		if (this.fadeIn || this.fadeOut)
			return;

		if (buttons === MouseButtons.Left) {
			position = this.renderView.ScreenToGame(position);
			this.maleButton?.LeftMouseUp(position, 0);
			this.femaleButton?.LeftMouseUp(position, 0);
			this.leftButton?.LeftMouseUp(position, 0);
			this.rightButton?.LeftMouseUp(position, 0);
			this.okButton?.LeftMouseUp(position, 0);
			this.tutorialButton?.LeftMouseUp(position, 0);
		}
	}

	OnMouseDown(position, buttons) {
		if (this.fadeIn || this.fadeOut)
			return;

		position = this.renderView.ScreenToGame(position);

		if (this.nameInput?.MouseDown(position, buttons) === true)
			return;

		if (buttons === MouseButtons.Left) {
			this.maleButton?.LeftMouseDown(position, 0);
			this.femaleButton?.LeftMouseDown(position, 0);
			this.leftButton?.LeftMouseDown(position, 0);
			this.rightButton?.LeftMouseDown(position, 0);
			this.okButton?.LeftMouseDown(position, 0);
			this.tutorialButton?.LeftMouseDown(position, 0);
		}
	}

	OnMouseWheel(xScroll, yScroll, mousePosition, mobile) {
		if (this.fadeIn || this.fadeOut)
			return;

		if (!mobile) {
			if (xScroll === 0 && yScroll !== 0)
				xScroll = yScroll;
		}

		if (xScroll !== 0) {
			if (xScroll > 0) // left
				this.SwapPortrait(-1);
			else
				this.SwapPortrait(1);
		} else if (yScroll !== 0) {
			this.ChangeMale(!this.isFemale);
		}
	}
}
