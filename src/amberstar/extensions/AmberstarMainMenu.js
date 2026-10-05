// Main menu of Amberstar on the Ambermoon engine (used by the host instead of Ambermoon.net/MainMenu.js).
//
// Same look and behavior as the Ambermoon main menu (fade in/out, color cycling hover effect with the large intro
// font, loading text) but with the Amberstar title picture (INTRO.UDO, see titlePicture.js) and the entries
// "Continue" (only with a savegame), "New game" and "Quit". Amberstar's intro is a separate demo program
// (INTRO_P.UDO), so there is no intro entry. The music is the Amberstar menu song (Song.Menu -> Fanfares, see
// convert/music.js).
//
// The interface matches MainMenu (Closed event with MainMenu.CloseAction values, FadeOutAndDestroy, Update, Render,
// OnKeyDown, OnMouseDown, OnMouseMove, Destroy) so the host can use both the same way.
import { Event, toByte } from '../../runtime.js';
import { Fader } from '../../ambermoon/Ambermoon.net/Fader.js';
import { MainMenu } from '../../ambermoon/Ambermoon.net/MainMenu.js';
import { Color as TextColor } from '../../ambermoon/Ambermoon.Data.Common/Enumerations/Color.js';
import { Song } from '../../ambermoon/Ambermoon.Data.Common/Enumerations/Song.js';
import { CursorType } from '../../ambermoon/Ambermoon.Data.Common/CursorType.js';
import { Rect } from '../../ambermoon/Ambermoon.Common/Rect.js';
import { Size } from '../../ambermoon/Ambermoon.Common/Size.js';
import { Layer } from '../../ambermoon/Ambermoon.Core/Render/Layer.js';
import { TextAlign } from '../../ambermoon/Ambermoon.Core/Render/TextAlign.js';
import { TextureAtlasManager } from '../../ambermoon/Ambermoon.Core/Render/TextureAtlasManager.js';
import { Global } from '../../ambermoon/Ambermoon.Core/UI/Global.js';
import { UIText } from '../../ambermoon/Ambermoon.Core/UI/UIText.js';
import { Color } from '../../ambermoon/Ambermoon.Core/Render/Color.js';
import { Key } from '../../ambermoon/Ambermoon.Core/Key.js';
import { MouseButtons } from '../../ambermoon/Ambermoon.Core/MouseButtons.js';

const CloseAction = MainMenu.CloseAction;
const FadeInTime = 1000;
const FadeOutTime = 1000;

/** Menu layout (virtual screen coordinates). The entries are drawn on the dark lower part of the picture. */
export const MenuLayout = Object.freeze({
	FirstEntryY: 126,
	EntryHeight: 22,
	EntrySpacing: 0,
});

export class AmberstarMainMenu {
	static CloseAction = CloseAction;

	/**
	 * @param texture       texture key of the title picture in the MainMenuGraphics atlas
	 * @param paletteIndex  sprite palette index of the title picture
	 * @param texts         [continue, new game, quit]
	 */
	constructor(renderView, cursor, texture, paletteIndex, introFont, texts, canContinue, continueLoadingText,
		newLoadingText, playMusicAction) {
		this.mainMenuTexts = [];
		this.band = [];
		this.hoveredTextIndex = -1;
		this.hoverStartTime = null;
		this.GameDataLoaded = false;
		this.closed = false;
		this.started = false;
		this.Closed = new Event();
		this.renderView = renderView;
		this.cursor = cursor;
		this.continueLoadingText = continueLoadingText;
		this.newLoadingText = newLoadingText;
		this.playMusicAction = playMusicAction;
		const textureAtlas = TextureAtlasManager.Instance.GetOrCreate(Layer.MainMenuGraphics);

		this.mainMenuFader = new Fader(renderView, 0xff, 0x00, 50, false, true);

		this.background = renderView.SpriteFactory.Create(320, 200, true);
		this.background.Layer = renderView.GetLayer(Layer.MainMenuGraphics);
		this.background.PaletteIndex = toByte(paletteIndex);
		this.background.TextureAtlasOffset = textureAtlas.GetOffset(texture);
		this.background.TextureSize = new Size(320, 200);
		this.background.X = 0;
		this.background.Y = 0;
		this.background.Visible = true;

		const entries = [
			{ action: CloseAction.Continue, text: texts[0], visible: canContinue },
			{ action: CloseAction.NewGame, text: texts[1], visible: true },
			{ action: CloseAction.Exit, text: texts[2], visible: true },
		].filter(e => e.visible);
		let y = MenuLayout.FirstEntryY + (3 - entries.length) * Math.trunc((MenuLayout.EntryHeight + MenuLayout.EntrySpacing) / 2);
		this.#addBand(y - 6, entries.length * (MenuLayout.EntryHeight + MenuLayout.EntrySpacing) + 8);
		for (const entry of entries) {
			const area = new Rect(0, y, Global.VirtualScreenWidth, MenuLayout.EntryHeight);
			const clickArea = new Rect(0, y - 2, Global.VirtualScreenWidth, MenuLayout.EntryHeight + 2);
			const text = introFont.CreateText(renderView, Layer.MainMenuText, area, entry.text, 3);
			text.Visible = true;
			this.mainMenuTexts.push({ Key: clickArea, Value: text, Action: entry.action });
			y += MenuLayout.EntryHeight + MenuLayout.EntrySpacing;
		}

		const loading = renderView.TextProcessor.CreateText('');
		this.loadingText = new UIText(renderView, toByte(renderView.GraphicInfoProvider.SecondaryUIPaletteIndex - 1), loading,
			Global.GetTextRect(renderView, new Rect(0, Math.trunc(Global.VirtualScreenHeight / 2) - 3, Global.VirtualScreenWidth, 6)),
			254, TextColor.White, false, TextAlign.Center);
		this.loadingText.Visible = false;

		cursor.Type = CursorType.Sword;
		this.playMusicAction?.(Song.Menu);
		this.mainMenuFader.Start(FadeInTime);
	}

	/** Translucent dark band with soft edges behind the entries (the title picture is very colorful). */
	#addBand(top, height) {
		const layer = this.renderView.GetLayer(Layer.MainMenuEffects);
		const add = (y, h, alpha) => {
			const rect = this.renderView.ColoredRectFactory.Create(Global.VirtualScreenWidth, h, new Color(0, 0, 0, alpha), 1);
			rect.Layer = layer;
			rect.X = 0;
			rect.Y = y;
			rect.Visible = true;
			this.band.push(rect);
		};
		const Steps = 6;
		for (let i = 0; i < Steps; i++) {
			const alpha = Math.round(140 * (i + 1) / (Steps + 1));
			add(top - (Steps - i) * 2, 2, alpha);
			add(top + height + (Steps - 1 - i) * 2, 2, alpha);
		}
		add(top, height, 140);
	}

	Destroy() {
		this.closed = true;
		this.band.forEach(rect => rect.Delete());
		this.band.length = 0;
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
				const duration = Math.trunc((Date.now() - this.hoverStartTime) / MainMenu.HoverColorTime);
				this.mainMenuTexts[i].Value.TextColor = MainMenu.hoveredColorIndices[duration % MainMenu.hoveredColorIndices.length];
			} else {
				this.mainMenuTexts[i].Value.TextColor = TextColor.White;
			}
		}
		if (this.background != null && this.GameDataLoaded)
			this.Destroy();
	}

	#select(index) {
		this.started = true;
		this.Closed.invoke(this.mainMenuTexts[index].Action);
	}

	OnKeyDown(key) {
		if (this.closed || this.loadingText.Visible || this.started)
			return;
		if (key === Key.Space || key === Key.Return)
			this.#select(this.hoveredTextIndex >= 0 ? this.hoveredTextIndex : 0);
		else if (key === Key.Up || key === Key.Down) {
			const count = this.mainMenuTexts.length;
			this.hoveredTextIndex = this.hoveredTextIndex < 0 ? 0 : (this.hoveredTextIndex + (key === Key.Up ? count - 1 : 1)) % count;
			this.hoverStartTime = Date.now();
		} else if (key === Key.Escape) {
			this.started = true;
			this.Closed.invoke(CloseAction.Exit);
		}
	}

	OnMouseUp() {
		// not used
	}

	OnMouseDown(position, buttons) {
		if (this.closed || this.loadingText.Visible || this.started || buttons !== MouseButtons.Left)
			return;
		position = this.renderView.ScreenToLayer(position, Layer.MainMenuText);
		const index = this.mainMenuTexts.findIndex(t => t.Key.Contains(position));
		if (index >= 0)
			this.#select(index);
	}

	OnMouseMove(position) {
		if (this.closed || this.started)
			return;
		this.cursor.UpdatePosition(position, null);
		position = this.renderView.ScreenToLayer(position, Layer.MainMenuText);
		const index = this.mainMenuTexts.findIndex(t => t.Key.Contains(position));
		if (index !== this.hoveredTextIndex) {
			this.hoveredTextIndex = index;
			this.hoverStartTime = index >= 0 ? Date.now() : null;
		}
	}
}
