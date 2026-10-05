// Port of Ambermoon.net/MainMenu.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
import { Event, toByte, getValue } from '../../runtime.js';
import { Fader } from './Fader.js';
import { Color as TextColor } from '../Ambermoon.Data.Common/Enumerations/Color.js';
import { Song } from '../Ambermoon.Data.Common/Enumerations/Song.js';
import { CursorType } from '../Ambermoon.Data.Common/CursorType.js';
import { IntroGraphic } from '../Ambermoon.Data.Common/IIntroData.js';
import { Rect } from '../Ambermoon.Common/Rect.js';
import { Size } from '../Ambermoon.Common/Size.js';
import { Layer } from '../Ambermoon.Core/Render/Layer.js';
import { Color } from '../Ambermoon.Core/Render/Color.js';
import { TextAlign } from '../Ambermoon.Core/Render/TextAlign.js';
import { TextureAtlasManager } from '../Ambermoon.Core/Render/TextureAtlasManager.js';
import { Global } from '../Ambermoon.Core/UI/Global.js';
import { UIText } from '../Ambermoon.Core/UI/UIText.js';
import { Key } from '../Ambermoon.Core/Key.js';
import { MouseButtons } from '../Ambermoon.Core/MouseButtons.js';

const CloseAction = Object.freeze({
	Continue: 0,
	NewGame: 1,
	Intro: 2,
	Exit: 3
});

const HoverColorTime = 125;
const FadeInTime = 1000;
const FadeOutTime = 1000;

export class MainMenu {
	static CloseAction = CloseAction;
	static HoverColorTime = HoverColorTime;
	static FadeInTime = FadeInTime;
	static FadeOutTime = FadeOutTime;

	static hoveredColorIndices = [
		toByte(TextColor.White),
		toByte(TextColor.LightYellow),
		toByte(TextColor.LightRed),
		toByte(TextColor.Red),
		toByte(TextColor.Pink),
		toByte(TextColor.Red),
		toByte(TextColor.LightRed),
		toByte(TextColor.LightYellow)
	];

	constructor(renderView, cursor, paletteIndices, introFont, texts, canContinue, continueLoadingText, newLoadingText,
		playMusicAction, fromIntro) {
		this.cursor = null;
		this.background = null;
		this.mainMenuFader = null;
		this.loadingText = null;
		/** List<KeyValuePair<Rect, Text>> -> array of { Key, Value } */
		this.mainMenuTexts = [];
		this.hoveredTextIndex = -1;
		this.hoverStartTime = null;
		this.GameDataLoaded = false;
		this.closed = false;
		this.Closed = new Event();
		this.started = false;

		this.renderView = renderView;
		this.cursor = cursor;
		this.continueLoadingText = continueLoadingText;
		this.newLoadingText = newLoadingText;
		this.playMusicAction = playMusicAction;
		const textureAtlas = TextureAtlasManager.Instance.GetOrCreate(Layer.MainMenuGraphics);

		this.mainMenuFader = new Fader(renderView, 0xff, 0x00, 50, false, true);

		this.background = renderView.SpriteFactory.Create(320, 200, true);
		this.background.Layer = renderView.GetLayer(Layer.MainMenuGraphics);
		this.background.PaletteIndex = toByte(renderView.GraphicInfoProvider.FirstIntroPaletteIndex + getValue(paletteIndices, IntroGraphic.MainMenuBackground) - 1);
		this.background.TextureAtlasOffset = textureAtlas.GetOffset(IntroGraphic.MainMenuBackground);
		this.background.TextureSize = new Size(320, 256);
		this.background.X = 0;
		this.background.Y = 0;
		this.background.Visible = true;

		let y = 48;
		for (let i = 0; i < 4; ++i) {
			const area = new Rect(0, y, Global.VirtualScreenWidth, 22);
			const clickArea = new Rect(0, y - 5, Global.VirtualScreenWidth, 22 + 8);
			const mainMenuText = introFont.CreateText(renderView, Layer.MainMenuText, area, texts[i], 1);
			mainMenuText.Visible = i !== 0 || canContinue;
			this.mainMenuTexts.push({ Key: clickArea, Value: mainMenuText });
			y += 22 + 8;
		}

		const text = renderView.TextProcessor.CreateText('');
		this.loadingText = new UIText(renderView, toByte(renderView.GraphicInfoProvider.SecondaryUIPaletteIndex - 1), text,
			Global.GetTextRect(renderView, new Rect(0, Math.trunc(Global.VirtualScreenHeight / 2) - 3, Global.VirtualScreenWidth, 6)),
			254, TextColor.White, false, TextAlign.Center);
		this.loadingText.Visible = false;

		cursor.Type = CursorType.Sword;

		if (fromIntro) {
			this.ShowMainMenu();
			this.mainMenuFader?.SetColor(Color.Transparent);
		} else
			this.FadeInMainMenu();
	}

	ShowMainMenu() {
		if (this.background != null)
			this.background.Visible = true;
	}

	FadeInMainMenu() {
		this.playMusicAction?.(Song.Menu);
		this.ShowMainMenu();
		this.mainMenuFader.Start(FadeInTime);
	}

	Destroy() {
		this.closed = true;
		this.mainMenuFader?.Destroy();
		this.mainMenuFader = null;
		this.background?.Delete();
		this.background = null;
		this.mainMenuTexts?.forEach(t => t.Value?.Destroy());
		this.mainMenuTexts = null;
		this.loadingText?.Destroy();
		this.loadingText = null;
	}

	FadeOutAndDestroy(continued, finished) {
		this.mainMenuFader.AttachFinishEvent(() => {
			this.loadingText.SetText(this.renderView.TextProcessor.CreateText(continued ? this.continueLoadingText : this.newLoadingText));
			this.loadingText.Visible = true;
			finished?.();
		});
		this.mainMenuFader.Start(FadeOutTime, true);
	}

	Render() {
		if (!this.closed)
			this.renderView.Render(null);
	}

	Update() {
		if (this.closed)
			return;

		this.mainMenuFader?.Update();

		for (let i = 0; i < this.mainMenuTexts.length; ++i) {
			if (i === this.hoveredTextIndex) {
				const duration = Math.trunc(Math.trunc(Date.now() - this.hoverStartTime) / HoverColorTime);
				const colorIndex = MainMenu.hoveredColorIndices[duration % MainMenu.hoveredColorIndices.length];
				this.mainMenuTexts[i].Value.TextColor = colorIndex;
			} else {
				this.mainMenuTexts[i].Value.TextColor = TextColor.White;
			}
		}

		if (this.background != null) {
			if (this.GameDataLoaded)
				this.Destroy();
		}
	}

	OnKeyDown(key) {
		if (this.closed || this.loadingText.Visible || this.started)
			return;

		if (key === Key.Space || key === Key.Return) {
			this.started = true;

			if (this.mainMenuTexts[0].Value.Visible)
				this.Closed.invoke(CloseAction.Continue);
			else
				this.Closed.invoke(CloseAction.NewGame);
		}
	}

	OnMouseUp(position, buttons) {
		// not used
	}

	OnMouseDown(position, buttons) {
		if (this.closed || this.loadingText.Visible || this.started)
			return;

		if (buttons === MouseButtons.Left) {
			position = this.renderView.ScreenToLayer(position, Layer.MainMenuText);

			for (let i = 0; i < this.mainMenuTexts.length; ++i) {
				if (this.mainMenuTexts[i].Value.Visible && this.mainMenuTexts[i].Key.Contains(position)) {
					this.started = true;
					this.Closed.invoke(i);
					break;
				}
			}
		}
	}

	OnMouseMove(position, buttons) {
		if (this.closed || this.started)
			return;

		this.cursor.UpdatePosition(position, null);

		position = this.renderView.ScreenToLayer(position, Layer.MainMenuText);

		for (let i = 0; i < this.mainMenuTexts.length; ++i) {
			if (this.mainMenuTexts[i].Key.Contains(position)) {
				if (this.hoveredTextIndex !== i) {
					this.hoveredTextIndex = i;
					this.hoverStartTime = Date.now();
				}
				return;
			}
		}

		this.hoveredTextIndex = -1;
		this.hoverStartTime = null;
	}
}

export { CloseAction as MainMenu_CloseAction };
