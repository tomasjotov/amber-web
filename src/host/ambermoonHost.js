// Browser host for the Ambermoon port: replaces Ambermoon.net/GameWindow.cs (Silk.NET window, input,
// game loop) with a canvas, DOM events and requestAnimationFrame.
// Based on GameWindow.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus).
import { Size } from '../ambermoon/Ambermoon.Common/Size.js';
import { Rect } from '../ambermoon/Ambermoon.Common/Rect.js';
import { Position } from '../ambermoon/Ambermoon.Common/Position.js';
import { Graphic } from '../ambermoon/Ambermoon.Data.Common/Graphic.js';
import { CursorType } from '../ambermoon/Ambermoon.Data.Common/CursorType.js';
import { Song } from '../ambermoon/Ambermoon.Data.Common/Enumerations/Song.js';
import { Features } from '../ambermoon/Ambermoon.Data.Common/Enumerations/Features.js';
import { Color as TextColor } from '../ambermoon/Ambermoon.Data.Common/Enumerations/Color.js';
import { GameData } from '../ambermoon/Ambermoon.Data.Legacy/GameData.js';
import { DataReader } from '../ambermoon/Ambermoon.Data.Legacy/Serialization/DataReader.js';
import { SavegameSerializer } from '../ambermoon/Ambermoon.Data.Legacy/Serialization/SavegameSerializer.js';
import { TextProcessor } from '../ambermoon/Ambermoon.Data.Legacy/Text.js';
import { ExecutableData } from '../ambermoon/Ambermoon.Data.Legacy/ExecutableData/ExecutableData.js';
import { IntroData } from '../ambermoon/Ambermoon.Data.Legacy/Serialization/IntroData.js';
import { GameCore } from '../ambermoon/Ambermoon.Core/GameCore.js';
import { Key } from '../ambermoon/Ambermoon.Core/Key.js';
import { KeyModifiers } from '../ambermoon/Ambermoon.Core/KeyModifiers.js';
import { MouseButtons } from '../ambermoon/Ambermoon.Core/MouseButtons.js';
import { Layer } from '../ambermoon/Ambermoon.Core/Render/Layer.js';
import { TextAlign } from '../ambermoon/Ambermoon.Core/Render/TextAlign.js';
import { TextureAtlasManager } from '../ambermoon/Ambermoon.Core/Render/TextureAtlasManager.js';
import { Cursor } from '../ambermoon/Ambermoon.Core/Render/Cursor.js';
import { Global } from '../ambermoon/Ambermoon.Core/UI/Global.js';
import { GraphicFilter, GraphicFilterOverlay, Effects } from '../ambermoon/Ambermoon.Core/ICoreConfiguration.js';
import { Game } from '../ambermoon/Ambermoon.Game/Game.js';
import { GameRenderView } from '../ambermoon/Ambermoon.Renderer.OpenGL/RenderView.js';
import { CreateContextProvider } from '../ambermoon/Ambermoon.Renderer.OpenGL/IContextProvider.js';
import { Resources } from '../ambermoon/Ambermoon.net/Resources.js';
import { Configuration } from '../ambermoon/Ambermoon.net/Configuration.js';
import { Font, IngameFontProvider } from '../ambermoon/Ambermoon.net/Font.js';
import { Intro } from '../ambermoon/Ambermoon.net/Intro.js';
import { FantasyIntro } from '../ambermoon/Ambermoon.net/FantasyIntro.js';
import { MainMenu } from '../ambermoon/Ambermoon.net/MainMenu.js';
import { OutroFactory } from '../ambermoon/Ambermoon.net/Outro.js';
import { MusicManager } from '../ambermoon/Ambermoon.net/MusicManager.js';
import { AudioOutput } from '../ambermoon/Ambermoon.net/AudioOutput.js';
import { RemakeSavegameManager } from '../ambermoon/Ambermoon.net/RemakeSavegameManager.js';
import { PersistentStorage } from './storage.js';

const KeyMap = {
	ArrowLeft: Key.Left, ArrowRight: Key.Right, ArrowUp: Key.Up, ArrowDown: Key.Down, Escape: Key.Escape,
	F1: Key.F1, F2: Key.F2, F3: Key.F3, F4: Key.F4, F5: Key.F5, F6: Key.F6, F7: Key.F7, F8: Key.F8, F9: Key.F9,
	F10: Key.F10, F11: Key.F11, F12: Key.F12, Enter: Key.Return, NumpadEnter: Key.Return, Delete: Key.Delete,
	Backspace: Key.Backspace, Tab: Key.Tab, Numpad0: Key.Num0, Numpad1: Key.Num1, Numpad2: Key.Num2, Numpad3: Key.Num3,
	Numpad4: Key.Num4, Numpad5: Key.Num5, Numpad6: Key.Num6, Numpad7: Key.Num7, Numpad8: Key.Num8, Numpad9: Key.Num9,
	PageUp: Key.PageUp, PageDown: Key.PageDown, Home: Key.Home, End: Key.End, Space: Key.Space,
	KeyW: Key.W, KeyA: Key.A, KeyS: Key.S, KeyD: Key.D, KeyQ: Key.Q, KeyE: Key.E, KeyM: Key.M,
	Digit0: Key.Number0, Digit1: Key.Number1, Digit2: Key.Number2, Digit3: Key.Number3, Digit4: Key.Number4,
	Digit5: Key.Number5, Digit6: Key.Number6, Digit7: Key.Number7, Digit8: Key.Number8, Digit9: Key.Number9,
};

const LoadingTexts = ['Starting game ...', 'Preparing new game ...'];

const getModifiers = e => (e.shiftKey ? KeyModifiers.Shift : 0) | (e.ctrlKey ? KeyModifiers.Control : 0) | (e.altKey ? KeyModifiers.Alt : 0);

/**
 * Loads all files of a data folder. The file names come from `<folder>/files.json` (static web servers,
 * created by tools/make-file-lists.mjs) or from the directory listing of the dev server (tools/serve.mjs).
 */
export async function fetchDataFolder(baseUrl) {
	let names = null;
	try {
		const response = await fetch(`${baseUrl}/files.json`, { cache: 'no-cache' });
		if (response.ok)
			names = await response.json();
	} catch {
		// try the dev server
	}
	if (!names) {
		// relative URL so it also works when the site is not at the server root
		const listResponse = await fetch(`__list?dir=${encodeURIComponent(baseUrl)}`);
		if (!listResponse.ok)
			throw new Error(`Cannot list ${baseUrl} (missing ${baseUrl}/files.json - run node tools/make-file-lists.mjs)`);
		names = await listResponse.json();
	}
	const files = new Map();
	await Promise.all(names.map(async name => {
		const response = await fetch(`${baseUrl}/${name.split('/').map(encodeURIComponent).join('/')}`);
		if (response.ok)
			files.set(name, new Uint8Array(await response.arrayBuffer()));
	}));
	return files;
}

/** Test browsers can mute all audio: localStorage['amber-web-mute'] = '1' or ?mute in the URL. */
function isMuted() {
	try {
		return new URLSearchParams(location.search).has('mute') || localStorage.getItem('amber-web-mute') === '1';
	} catch {
		return false;
	}
}

export class AmbermoonHost {
	static get muted() { return isMuted(); }

	constructor(canvas, options = {}) {
		this.canvas = canvas;
		this.options = options;
		this.renderView = null;
		this.Game = null;
		this.mainMenu = null;
		this.intro = null;
		this.fantasyIntro = null;
		this.gameCreator = null;
		this.pressedKeys = new Set();
		this.mouseButtons = MouseButtons.None;
		this.mousePosition = new Position(0, 0);
		this.lastTime = 0;
		this.running = false;
		this.onError = options.onError ?? (e => console.error(e));
	}

	get windowSize() {
		const rect = this.canvas.getBoundingClientRect();
		return new Size(Math.max(1, Math.round(rect.width)), Math.max(1, Math.round(rect.height)));
	}

	#updateCanvasSize() {
		const size = this.windowSize;
		const dpr = window.devicePixelRatio || 1;
		const w = Math.round(size.Width * dpr);
		const h = Math.round(size.Height * dpr);
		if (this.canvas.width !== w || this.canvas.height !== h) {
			this.canvas.width = w;
			this.canvas.height = h;
			this.renderView?.Resize(w, h, size.Width, size.Height);
		}
	}

	async start(files, setStatus = () => { }) {
		setStatus('Loading resources ...');
		await Resources.load(this.options.assetsUrl ?? 'assets/');
		this.storage = await PersistentStorage.open(this.options.storageName ?? 'ambermoon-web');
		const configStorage = this.storage.jsonView('ambermoon.cfg');
		const configuration = this.configuration = Configuration.Load(configStorage) ?? Object.assign(new Configuration(), { FirstStart: true });
		configuration.UpgradeAdditionalSavegameSlots?.();
		configuration.SaveRequested.add(() => configuration.Save(configStorage));
		if (this.options.skipIntro) {
			configuration.ShowFantasyIntro = false;
			configuration.ShowIntro = false;
		}

		setStatus('Loading game data ...');
		let gameData = new GameData(GameData.LoadPreference.PreferExtracted, null, false);
		gameData.LoadFromFiles(files);
		if (!gameData.Loaded)
			throw new Error('The Ambermoon game data could not be loaded.');
		// Another game (Amberstar) can replace the world data while keeping the Ambermoon engine assets.
		if (this.options.transformGameData) {
			setStatus('Converting game data ...');
			const transformed = await this.options.transformGameData(gameData);
			gameData = transformed.gameData;
			this.savegameManagerFactory = transformed.savegameManagerFactory ?? null;
		}
		this.gameData = gameData;

		const features = gameData.Advanced ? Features.AmbermoonAdvanced : Features.None;
		this.#startGame(gameData, gameData.Language, features);
		this.#setupInput();
		this.running = true;
		requestAnimationFrame(t => this.#frame(t));
		// Keep the game running if animation frames are throttled (hidden or embedded views)
		setInterval(() => {
			if (performance.now() - this.lastTime > 200)
				this.#frame(performance.now(), false);
		}, 50);
	}

	// --- GameWindow.StartGame ---

	#createRenderView(gameData, configuration, graphicInfoProvider, fontProvider, additionalPalettes, textureAtlasManagerProvider) {
		const anyIntroActive = () => this.fantasyIntro != null;
		this.#updateCanvasSize();
		const contextProvider = CreateContextProvider(this.canvas, 'ambermoon');
		const useFrameBuffer = { value: true };
		const useEffects = { value: configuration.Effects !== Effects.None };
		const renderView = new GameRenderView(contextProvider, gameData, graphicInfoProvider, fontProvider,
			new TextProcessor(fontProvider.GetFont().GlyphCount), textureAtlasManagerProvider, this.canvas.width, this.canvas.height,
			this.windowSize, useFrameBuffer, useEffects,
			() => ({ Key: anyIntroActive() ? 0 : configuration.GraphicFilter, Value: anyIntroActive() ? 0 : configuration.GraphicFilterOverlay }),
			() => anyIntroActive() ? 0 : configuration.Effects,
			additionalPalettes);
		if (!useFrameBuffer.value) {
			configuration.GraphicFilter = GraphicFilter.None;
			configuration.GraphicFilterOverlay = GraphicFilterOverlay.None;
		}
		if (!useEffects.value)
			configuration.Effects = Effects.None;
		return renderView;
	}

	#initGlyphs(fontProvider) {
		const glyphCount = fontProvider.GetFont().GlyphCount;
		const textureAtlas = TextureAtlasManager.Instance.GetOrCreate(Layer.Text);
		const mapping = new Map();
		for (let i = 0; i < glyphCount; i++)
			mapping.set(i, textureAtlas.GetOffset(i));
		this.renderView.RenderTextFactory.GlyphTextureMapping = mapping;
		const digitAtlas = TextureAtlasManager.Instance.GetOrCreate(Layer.SmallDigits);
		const digitMapping = new Map();
		for (let i = 0; i < 10; i++)
			digitMapping.set(ExecutableData.DigitGlyphOffset + i, digitAtlas.GetOffset(i));
		this.renderView.RenderTextFactory.DigitGlyphTextureMapping = digitMapping;
	}

	#startGame(gameData, gameLanguage, features) {
		const configuration = this.configuration;
		const fantasyIntroData = gameData.FantasyIntroData;
		const introData = gameData.IntroData;
		const introFont = new Font(introData.Glyphs, 6, 0);
		const introFontLarge = new Font(introData.LargeGlyphs, 10, introData.Glyphs.size);
		const outroData = gameData.OutroData;
		const outroFont = new Font(outroData.Glyphs, 6, 0);
		const outroFontLarge = new Font(outroData.LargeGlyphs, 10, outroData.Glyphs.size);
		const graphicInfoProvider = gameData.GraphicInfoProvider;

		const audioOutput = this.audioOutput = new AudioOutput();
		audioOutput.Volume = Math.max(0, Math.min(100, configuration.Volume)) / 100;
		audioOutput.Enabled = audioOutput.Available && configuration.Music && !AmbermoonHost.muted;
		if (AmbermoonHost.muted)
			Object.defineProperty(audioOutput, 'Enabled', { get: () => false, set: () => { } });
		const additionalPalettes = [Object.assign(new Graphic(), { Width: 32, Height: 1, IndexedGraphic: false, Data: new Uint8Array(32 * 4) })];

		const musicManager = this.musicManager = new MusicManager(configuration, gameData);
		const fontProvider = new IngameFontProvider(DataReader.FromData(Resources.IngameFont), gameData.FontProvider.GetFont());

		const renderView = this.renderView = this.#createRenderView(gameData, configuration, graphicInfoProvider, fontProvider, additionalPalettes, () => {
			const textureAtlasManager = TextureAtlasManager.Instance;
			const introGraphics = new Map(introData.Graphics);
			let twinlakeFrameOffset = Math.max(...introData.Graphics.keys());
			for (const part of introData.TwinlakeImageParts)
				introGraphics.set(++twinlakeFrameOffset, part.Graphic);
			// Amberstar: own main menu picture (src/amberstar/extensions/index.js)
			const customMainMenu = gameData.AmberstarExtensions?.mainMenu;
			if (customMainMenu)
				introGraphics.set(customMainMenu.textureKey, customMainMenu.graphic);
			textureAtlasManager.AddAll(gameData, graphicInfoProvider, fontProvider, introFont.GlyphGraphics,
				introFontLarge.GlyphGraphics, introGraphics, features, 10);
			return textureAtlasManager;
		});
		renderView.SetTextureFactor(Layer.Text, 2);
		renderView.SetTextureFactor(Layer.SubPixelText, 2);

		const showIntro = (showMainMenuAction) => {
			this.mainMenu?.Destroy();
			this.mainMenu = null;
			if (configuration.Music) {
				musicManager.Stop();
				musicManager.GetSong(Song.Intro)?.Stop();
			}
			this.intro = new Intro(renderView, introData, introFont, introFontLarge, byClick => {
				this.intro = null;
				showMainMenuAction?.(byClick);
			}, () => {
				if (configuration.Music)
					musicManager.GetSong(Song.Intro)?.Play(audioOutput);
			});
		};

		let initialIntroEndedByClick = false;

		if (configuration.ShowFantasyIntro) {
			this.fantasyIntro = new FantasyIntro(renderView, fantasyIntroData, () => {
				this.fantasyIntro = null;
				if (configuration.ShowIntro)
					showIntro(byClick => { initialIntroEndedByClick = byClick; this.#afterIntro?.(byClick); });
				else
					this.#afterIntro?.(false);
			});
		} else if (configuration.ShowIntro) {
			showIntro(byClick => { initialIntroEndedByClick = byClick; this.#afterIntro?.(byClick); });
		}

		this.#initGlyphs(fontProvider);

		// Savegames
		const savePath = Configuration.GetSavePath(Configuration.GetVersionSavegameFolder({ ExternalData: false, Info: gameData.Advanced ? 'Advanced' : '', Language: gameData.Language }));
		const savegameManager = this.savegameManagerFactory?.(this.storage) ?? new RemakeSavegameManager(savePath, configuration, this.storage);
		let [, currentSavegame] = savegameManager.GetSavegameNames(gameData, GameCore.NumBaseSavegameSlots);
		if (currentSavegame === 0 && configuration.ExtendedSavegameSlots)
			currentSavegame = savegameManager.ContinueSavegameSlot ?? 0;
		const canContinue = currentSavegame !== 0;
		const cursor = this.cursor = new Cursor(renderView, gameData.CursorHotspots);
		cursor.UpdatePosition(this.mousePosition, null);
		cursor.Type = CursorType.None;

		const setupGameCreator = continueGame => {
			const savegameSerializer = new SavegameSerializer();
			this.gameCreator = () => {
				const game = new Game(configuration, gameLanguage, renderView, graphicInfoProvider,
					savegameManager, savegameSerializer, gameData.Dictionary, cursor, audioOutput,
					musicManager, () => { }, () => { }, () => [...this.pressedKeys],
					new OutroFactory(renderView, outroData, outroFont, outroFontLarge), features,
					'Saves', 'Ambermoon.net (web)', null, savegameManager);
				game.QuitRequested.add(() => location.reload());
				game.Run(continueGame, this.mousePosition);
				return game;
			};
		};

		const showMainMenu = fromIntro => {
			if (configuration.FirstStart)
				configuration.ShowIntro = false;
			renderView.PaletteFading = null;
			const playMusic = song => {
				if (configuration.Music)
					musicManager.GetSong(song)?.Play(audioOutput);
			};
			this.intro?.Destroy?.();
			this.intro = null;
			const texts = [...introData.Texts.values()].slice(8, 12);
			const customMainMenu = gameData.AmberstarExtensions?.mainMenu;
			this.mainMenu = customMainMenu
				? customMainMenu.Create(renderView, cursor, introFontLarge, [texts[0], texts[1], texts[3]], canContinue,
					LoadingTexts[0], LoadingTexts[1], playMusic)
				: new MainMenu(renderView, cursor, IntroData.GraphicPalettes, introFontLarge, texts, canContinue,
					LoadingTexts[0], LoadingTexts[1], playMusic, fromIntro);
			this.mainMenu.Closed.add(closeAction => {
				switch (closeAction) {
					case MainMenu.CloseAction.NewGame:
						cursor.Type = CursorType.None;
						this.mainMenu.FadeOutAndDestroy(false, () => setTimeout(() => setupGameCreator(false), 0));
						break;
					case MainMenu.CloseAction.Continue:
						configuration.FirstStart = false;
						cursor.Type = CursorType.None;
						this.mainMenu.FadeOutAndDestroy(true, () => setTimeout(() => setupGameCreator(true), 0));
						break;
					case MainMenu.CloseAction.Intro:
						cursor.Type = CursorType.None;
						showIntro(byClick => showMainMenu(!byClick));
						break;
					case MainMenu.CloseAction.Exit:
						this.mainMenu?.Destroy();
						this.mainMenu = null;
						this.options.onExit?.();
						break;
				}
			});
		};

		this.#afterIntro = byClick => showMainMenu(!byClick);

		if (this.fantasyIntro == null && this.intro == null)
			showMainMenu(false);
	}

	#afterIntro = null;

	// --- input ---

	#toGamePosition(e) {
		const rect = this.canvas.getBoundingClientRect();
		return new Position(Math.round(e.clientX - rect.left), Math.round(e.clientY - rect.top));
	}

	#setupInput() {
		const canvas = this.canvas;
		canvas.tabIndex = 0;
		canvas.focus();
		const unlockAudio = () => this.audioOutput?.unlock?.();
		const buttonOf = e => e.button === 0 ? MouseButtons.Left : e.button === 2 ? MouseButtons.Right : e.button === 1 ? MouseButtons.Middle : MouseButtons.None;

		canvas.addEventListener('contextmenu', e => e.preventDefault());
		canvas.addEventListener('mousedown', e => {
			e.preventDefault();
			canvas.focus();
			unlockAudio();
			const position = this.#toGamePosition(e);
			this.mouseButtons |= buttonOf(e);
			this.#guard(() => {
				if (this.fantasyIntro != null)
					this.fantasyIntro.Abort();
				else if (this.mainMenu != null)
					this.mainMenu.OnMouseDown(position, buttonOf(e));
				else if (this.intro != null)
					this.intro.Click();
				else
					this.Game?.OnMouseDown(position, this.mouseButtons, getModifiers(e));
			});
		});
		window.addEventListener('mouseup', e => {
			const position = this.#toGamePosition(e);
			this.mouseButtons &= ~buttonOf(e);
			this.#guard(() => {
				if (this.mainMenu != null)
					this.mainMenu.OnMouseUp?.(position, buttonOf(e));
				else
					this.Game?.OnMouseUp(position, buttonOf(e));
			});
		});
		canvas.addEventListener('mousemove', e => {
			const position = this.mousePosition = this.#toGamePosition(e);
			this.#guard(() => {
				if (this.mainMenu != null)
					this.mainMenu.OnMouseMove(position, this.mouseButtons);
				else
					this.Game?.OnMouseMove(position, this.mouseButtons);
			});
		});
		canvas.addEventListener('wheel', e => {
			e.preventDefault();
			const position = this.#toGamePosition(e);
			this.#guard(() => this.Game?.OnMouseWheel(Math.round(-e.deltaX / 100), Math.round(-e.deltaY / 100), position));
		}, { passive: false });

		window.addEventListener('keydown', e => {
			if (document.activeElement !== canvas && document.activeElement !== document.body)
				return;
			unlockAudio();
			const key = KeyMap[e.code] ?? Key.Invalid;
			if (key !== Key.Invalid || e.key.length === 1)
				e.preventDefault();
			if (key !== Key.Invalid)
				this.pressedKeys.add(key);
			this.#guard(() => {
				if (e.code === 'KeyM' && e.ctrlKey) {
					this.configuration.Music = !this.configuration.Music;
					this.audioOutput.Enabled = this.configuration.Music;
					if (this.audioOutput.Available && this.audioOutput.Enabled)
						this.Game?.ContinueMusic();
					this.Game?.ExternalMusicChanged();
					return;
				}
				if (e.code === 'F8' || e.code === 'F9' || e.code === 'F10') {
					this.#cycleGraphics(e.code, e.shiftKey ? -1 : 1);
					return;
				}
				if (this.fantasyIntro != null)
					this.fantasyIntro.Abort();
				else if (this.intro != null && key === Key.Escape)
					this.intro.Click();
				else if (this.mainMenu != null)
					this.mainMenu.OnKeyDown(key);
				else if (key !== Key.Invalid)
					this.Game?.OnKeyDown(key, getModifiers(e));
				if (e.key.length === 1 && !e.ctrlKey && !e.altKey && this.mainMenu == null)
					this.Game?.OnKeyChar(e.key);
			});
		});
		window.addEventListener('keyup', e => {
			const key = KeyMap[e.code] ?? Key.Invalid;
			this.pressedKeys.delete(key);
			if (key !== Key.Invalid)
				this.#guard(() => this.Game?.OnKeyUp(key, getModifiers(e)));
		});
		window.addEventListener('blur', () => this.pressedKeys.clear());
		window.addEventListener('resize', () => this.#updateCanvasSize());
	}

	#cycleGraphics(code, direction) {
		const c = this.configuration;
		const cycle = (value, enumObject) => {
			const n = Object.keys(enumObject).length;
			return (value + direction + n) % n;
		};
		if (code === 'F8') {
			c.GraphicFilter = cycle(c.GraphicFilter, GraphicFilter);
			this.Game?.ExternalGraphicFilterChanged();
		} else if (code === 'F9') {
			c.GraphicFilterOverlay = cycle(c.GraphicFilterOverlay, GraphicFilterOverlay);
			this.Game?.ExternalGraphicFilterOverlayChanged();
		} else {
			c.Effects = cycle(c.Effects, Effects);
			if (!this.renderView.TryUseEffects())
				c.Effects = Effects.None;
			this.Game?.ExternalEffectsChanged();
		}
	}

	#guard(action) {
		try {
			action();
		} catch (e) {
			this.onError(e);
		}
	}

	// --- loop (Window_Update + Window_Render) ---

	#frame(time, schedule = true) {
		if (!this.running)
			return;
		const delta = this.lastTime ? Math.min(0.25, (time - this.lastTime) / 1000) : 1 / 60;
		this.lastTime = time;
		this.#guard(() => this.#update(delta));
		this.#guard(() => this.#render());
		if (schedule)
			requestAnimationFrame(t => this.#frame(t));
	}

	#update(delta) {
		this.#updateCanvasSize();
		if (this.fantasyIntro != null)
			this.fantasyIntro.Update(delta);
		else if (this.intro != null)
			this.intro.Update(delta);
		else if (this.mainMenu != null) {
			this.mainMenu.Update();
			if (this.gameCreator != null) {
				const creator = this.gameCreator;
				this.gameCreator = null;
				this.Game = creator();
				window.ambermoonGame = this.Game;
				this.mainMenu?.Destroy();
				this.mainMenu = null;
			}
		} else if (this.gameCreator != null) {
			const creator = this.gameCreator;
			this.gameCreator = null;
			this.Game = creator();
			window.ambermoonGame = this.Game;
		} else if (this.Game != null)
			this.Game.Update(delta);
	}

	#render() {
		if (this.renderView != null && this.configuration != null)
			this.renderView.Enhanced3D = this.configuration.Enhanced3D !== false;
		if (this.mainMenu != null)
			this.mainMenu.Render();
		else if (this.Game != null)
			this.renderView.Render(this.Game.ViewportOffset);
		else
			this.renderView?.Render(null);
	}
}
