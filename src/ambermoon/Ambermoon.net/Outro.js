// Port of Ambermoon.net/Outro.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
import { toByte, round, getValue, removeItem } from '../../runtime.js';
import { OutroOption, OutroCommand } from '../Ambermoon.Data.Common/IOutroData.js';
import { Option } from '../Ambermoon.Data.Common/Enumerations/Option.js';
import { Rect } from '../Ambermoon.Common/Rect.js';
import { Color } from '../Ambermoon.Core/Render/Color.js';
import { Layer } from '../Ambermoon.Core/Render/Layer.js';
import { TextAlign } from '../Ambermoon.Core/Render/TextAlign.js';
import { TextureAtlasManager } from '../Ambermoon.Core/Render/TextureAtlasManager.js';
import { Global } from '../Ambermoon.Core/UI/Global.js';
import { GameCore } from '../Ambermoon.Core/GameCore.js';

export class Outro {
	static textureAtlas = null;
	static PixelScrollPerSecond = [0.0, 6.0, 12.0, 24.0, 48.0, 96.0];
	static get HalfFadeDurationInTicks() { return Math.trunc(3 * GameCore.TicksPerSecond / 4); }

	static EnsureTextures(renderView, outroData, outroFont, outroFontLarge) {
		if (Outro.textureAtlas == null) {
			const textureAtlasManager = TextureAtlasManager.Instance;

			if (outroData.GraphicAtlas != null) {
				textureAtlasManager.AddAtlas(Layer.OutroGraphics, outroData.GraphicAtlas);
			} else {
				const graphics = new Map();
				outroData.Graphics.forEach((g, i) => graphics.set(i, g));
				textureAtlasManager.AddFromGraphics(Layer.OutroGraphics, graphics);
			}
			Outro.textureAtlas = textureAtlasManager.GetOrCreate(Layer.OutroGraphics);
			renderView.GetLayer(Layer.OutroGraphics).Texture = Outro.textureAtlas.Texture;
			textureAtlasManager.AddFromGraphics(Layer.OutroText, outroFont.GlyphGraphics);
			textureAtlasManager.AddFromGraphics(Layer.OutroText, outroFontLarge.GlyphGraphics);
			renderView.GetLayer(Layer.OutroText).Texture = textureAtlasManager.GetOrCreate(Layer.OutroText).Texture;
		}
	}

	constructor(renderView, outroData, outroFont, outroFontLarge, finishAction) {
		this.ticks = 0;
		this.speedIndex = 2;
		this.actions = null;
		this.actionIndex = 0;
		this.scrolledAmount = 0;
		this.scrollStartTicks = 0;
		this.nextActionTicks = 0;
		this.waitForClick = false;
		this.texts = [];
		this.fadeMidAction = null;
		this.fadeStartTicks = 0;
		this.Active = false;

		this.finishAction = finishAction;
		this.outroData = outroData;
		this.outroFont = outroFont;
		this.outroFontLarge = outroFontLarge;
		this.renderView = renderView;
		this.renderLayer = renderView.GetLayer(Layer.OutroGraphics);
		this.picture = renderView.SpriteFactory.Create(160, 128, true, 1);
		this.picture.Layer = this.renderLayer;
		this.picture.PaletteIndex = this.paletteOffset = renderView.GraphicInfoProvider.FirstOutroPaletteIndex;
		this.picture.Visible = false;

		this.fadeArea = renderView.ColoredRectFactory.Create(Global.VirtualScreenWidth, Global.VirtualScreenHeight, Color.Black, 255);
		this.fadeArea.Layer = renderView.GetLayer(Layer.Effects);
		this.fadeArea.X = 0;
		this.fadeArea.Y = 0;
		this.fadeArea.Visible = false;

		this.graphicInfos = outroData.GraphicInfos;

		Outro.EnsureTextures(renderView, outroData, outroFont, outroFontLarge);
	}

	Start(savegame) {
		this.ticks = 0;
		this.Active = true;
		this.actionIndex = 0;
		this.scrolledAmount = 0;
		this.scrollStartTicks = 0;
		this.nextActionTicks = 0;
		this.waitForClick = false;
		this.speedIndex = 2;

		let option = OutroOption.ValdynNotInParty;

		if (savegame.CurrentPartyMemberIndices.includes(12)) { // Valdyn in party
			if (savegame.IsGameOptionActive(Option.FoundYellowSphere))
				option = OutroOption.ValdynInPartyWithYellowSphere;
			else
				option = OutroOption.ValdynInPartyNoYellowSphere;
		}

		this.actions = getValue(this.outroData.OutroActions, option);

		this.Process();
	}

	Update(deltaTime) {
		if (this.waitForClick || this.fadeMidAction != null || this.speedIndex !== 0)
			this.ticks += round(GameCore.TicksPerSecond * deltaTime);

		if (this.fadeArea.Visible || this.fadeMidAction != null) {
			const HalfFadeDurationInTicks = Outro.HalfFadeDurationInTicks;
			const fadeDuration = this.ticks - this.fadeStartTicks;

			if (fadeDuration >= HalfFadeDurationInTicks * 2) {
				this.fadeMidAction = null;
				this.fadeArea.Visible = false;
				this.nextActionTicks = this.ticks;
			} else {
				const alpha = toByte(255 - Math.trunc(Math.abs(HalfFadeDurationInTicks - fadeDuration) * 255 / HalfFadeDurationInTicks));
				this.fadeArea.Color = new Color(this.fadeArea.Color, alpha);
				this.fadeArea.Visible = true;

				if (this.fadeMidAction != null && fadeDuration >= HalfFadeDurationInTicks) {
					this.fadeMidAction?.();
					this.fadeMidAction = null;
				}

				return;
			}
		}

		this.Process();
	}

	Click(right) {
		if (!this.waitForClick) {
			this.ToggleSpeed(!right);
			return;
		}

		this.waitForClick = false;
		this.nextActionTicks = 0; // this ensures immediate processing of next action
	}

	ToggleSpeed(up) {
		if (up) {
			if (this.speedIndex === Outro.PixelScrollPerSecond.length - 1)
				return;

			++this.speedIndex;
		} else { // down
			if (this.speedIndex === 0)
				return;

			--this.speedIndex;
		}

		if (this.speedIndex === 0)
			return; // paused

		const pixelsPerTick = Outro.PixelScrollPerSecond[this.speedIndex] / GameCore.TicksPerSecond;
		const scrollTicks = round((this.actions[this.actionIndex - 1].ScrollAmount - this.scrolledAmount) / pixelsPerTick);
		this.scrolledAmount = 0;
		this.scrollStartTicks = this.ticks;
		this.nextActionTicks = this.ticks + scrollTicks;
	}

	Scroll() {
		const scrollTicks = this.ticks - this.scrollStartTicks;
		const pixelsPerTick = Outro.PixelScrollPerSecond[this.speedIndex] / GameCore.TicksPerSecond;
		const scrollAmount = round(scrollTicks * pixelsPerTick);
		const delta = scrollAmount - this.scrolledAmount;

		if (delta === 0)
			return;

		this.scrolledAmount = scrollAmount;

		for (const text of this.texts.slice()) {
			text.Move(0, -delta);

			if (!text.OnScreen) { // not on screen anymore
				text.Destroy();
				removeItem(this.texts, text);
			}
		}
	}

	Process() {
		if (this.waitForClick || this.fadeMidAction != null || this.speedIndex === 0)
			return;

		if (this.nextActionTicks > this.ticks) {
			this.Scroll();
			return;
		}

		if (this.actionIndex === this.actions.length) {
			this.Active = false;
			this.finishAction?.();
			return;
		}

		const action = this.actions[this.actionIndex];

		switch (action.Command) {
			case OutroCommand.ChangePicture:
			{
				this.Fade(() => {
					this.texts.forEach(text => text.Destroy());
					this.texts.length = 0;
					const graphicInfo = getValue(this.graphicInfos, action.ImageOffset);
					this.picture.PaletteIndex = toByte(this.paletteOffset + graphicInfo.PaletteIndex - 1);
					this.picture.TextureAtlasOffset = Outro.textureAtlas.GetOffset(graphicInfo.GraphicIndex);
					this.picture.Resize(graphicInfo.Width, graphicInfo.Height);
					this.picture.X = Math.trunc((Global.VirtualScreenWidth - graphicInfo.Width) / 2);
					this.picture.Y = Math.trunc((Global.VirtualScreenHeight - graphicInfo.Height) / 2);
					this.picture.Visible = true;
					++this.actionIndex;
				});
				break;
			}
			case OutroCommand.WaitForClick:
			{
				++this.actionIndex;
				this.waitForClick = true;
				break;
			}
			case OutroCommand.PrintTextAndScroll:
			{
				if (action.TextIndex != null)
					this.PrintText(action.TextDisplayX, this.outroData.Texts[action.TextIndex], action.LargeText);
				const pixelsPerTick = Outro.PixelScrollPerSecond[this.speedIndex] / GameCore.TicksPerSecond;
				const scrollTicks = round(action.ScrollAmount / pixelsPerTick);
				++this.actionIndex;
				this.scrolledAmount = 0;
				this.scrollStartTicks = this.ticks;
				this.nextActionTicks = this.ticks + scrollTicks;
				break;
			}
		}
	}

	Fade(midAction) {
		this.fadeStartTicks = this.ticks;
		this.fadeMidAction = midAction;
	}

	PrintText(x, text, large) {
		let textEntry;

		if (large) {
			textEntry = this.outroFontLarge.CreateText(this.renderView, Layer.OutroText,
				new Rect(x, Global.VirtualScreenHeight - 1, Global.VirtualScreenWidth, 22), text, 10, TextAlign.Left, 208);
		} else {
			textEntry = this.outroFont.CreateText(this.renderView, Layer.OutroText,
				new Rect(x, Global.VirtualScreenHeight - 1, Global.VirtualScreenWidth, 11), text, 10, TextAlign.Left, 208);
		}

		textEntry.Visible = true;

		this.texts.push(textEntry);
	}

	Abort() {
		if (this.Active) {
			this.Active = false;
			this.finishAction?.();
		}
	}

	Destroy() {
		this.Active = false;
		this.picture.Visible = false;
		this.texts.forEach(text => text.Destroy());
		this.texts.length = 0;
		this.fadeArea.Delete();
	}
}

export class OutroFactory {
	constructor(renderView, outroData, outroFont, outroFontLarge) {
		this.renderView = renderView;
		this.outroData = outroData;
		this.outroFont = outroFont;
		this.outroFontLarge = outroFontLarge;
	}

	Create(finishAction) {
		return new Outro(this.renderView, this.outroData, this.outroFont, this.outroFontLarge, finishAction);
	}
}
