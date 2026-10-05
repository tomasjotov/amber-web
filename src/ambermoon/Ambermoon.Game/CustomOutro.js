// Port of Ambermoon.Game/CustomOutro.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// CustomOutro.cs - Remake outro sequence

import { Queue, getValue, count, lastOrDefault, newArray } from '../../runtime.js';
import { Position } from '../Ambermoon.Common/Position.js';
import { Size } from '../Ambermoon.Common/Size.js';
import { Rect } from '../Ambermoon.Common/Rect.js';
import { CharacterDirection } from '../Ambermoon.Common/Direction.js';
import { SpecialGlyph } from '../Ambermoon.Data.Common/IText.js';
import { GameLanguage } from '../Ambermoon.Data.Common/IGameData.js';
import { CursorType } from '../Ambermoon.Data.Common/CursorType.js';
import { Color as TextColor } from '../Ambermoon.Data.Common/Enumerations/Color.js';
import { Gender } from '../Ambermoon.Data.Common/Enumerations/Gender.js';
import { Song } from '../Ambermoon.Data.Common/Enumerations/Song.js';
import { TravelType } from '../Ambermoon.Data.Common/Enumerations/TravelType.js';
import { UICustomGraphic } from '../Ambermoon.Data.Common/Enumerations/UICustomGraphic.js';
import { Color as RenderColor } from '../Ambermoon.Core/Render/Color.js';
import { Credits } from '../Ambermoon.Core/Render/Credits.js';
import { Graphics } from '../Ambermoon.Core/Render/Graphics.js';
import { Layer } from '../Ambermoon.Core/Render/Layer.js';
import { TextAlign } from '../Ambermoon.Core/Render/TextAlign.js';
import { Global } from '../Ambermoon.Core/UI/Global.js';
import { FadeEffectType } from '../Ambermoon.Core/UI/Layout.js';
import { Popup } from '../Ambermoon.Core/UI/Popup.js';
import { GameCore } from '../Ambermoon.Core/GameCore.js';

const EgilPortraiIndex = 5;
const PyrdacorPortraitIndex = 95;

export class CustomOutro {
	static EgilPortraiIndex = EgilPortraiIndex;
	static PyrdacorPortraitIndex = PyrdacorPortraitIndex;

	get CreditsActive() { return this.credits != null; }

	/**
	 * @param game Game
	 * @param layout Layout
	 * @param savegame Savegame
	 */
	constructor(game, layout, savegame) {
		// field initializers
		this.credits = null;
		this.popups = [];
		this.images = [];
		this.texts = [];
		this.areas = [];
		this.panels = [];
		this.eagle = null;
		/** Queue of { Key: delay in ms, Value: action } */
		this.actions = new Queue();

		this.game = game;
		this.layout = layout;
		this.renderView = layout.RenderView;
		this.savegame = savegame;

		game.EnableTimeEvents(false);

		const hero = savegame.PartyMembers[1];
		const ProcessText = text => text.replaceAll('~HERO~', hero.Name);

		const AddConversationText = (delay, rect, textIndex, textColor = TextColor.Bright) => {
			this.AddAction(delay, new ShowConversationTextAction(rect,
				ProcessText(getValue(CustomOutro.LanguageDependentStrings, game.GameLanguage)[textIndex]), 50, textColor));
		};

		const conversationImagePosition = new Position(31, 64);
		const conversationArea = new Rect(62, 61, 120, 56);

		this.AddAction(0, new ShowConversationPortraitAction(EgilPortraiIndex, conversationImagePosition));
		AddConversationText(250, conversationArea, 0);
		AddConversationText(1250, conversationArea, 1);
		this.AddAction(1250, new ClearAction());
		this.AddAction(250, new ShowConversationPortraitAction(hero.PortraitIndex, conversationImagePosition));
		AddConversationText(250, conversationArea, 2);
		this.AddAction(1250, new ClearAction());
		this.AddAction(0, new CustomAction(finished => game.RemovePartyMember(1, false, finished)));
		this.AddAction(3000, new CustomAction(finished => {
			let numMoves = 7;

			const MoveShipLeft = () => {
				--game.CurrentSavegame.TransportLocations[0].Position.X;
				game.UpdateTransportPosition(0);

				if (--numMoves === 0)
					finished?.();
				else
					game.AddTimedEvent(300, MoveShipLeft);
			};

			MoveShipLeft();
		}));
		this.AddAction(2500, new CustomAction(finished => {
			game.Move(false, 0.0, CursorType.ArrowRight);
			finished?.();
		}));
		this.AddAction(500, new CustomAction(finished => {
			game.Move(false, 0.0, CursorType.ArrowRight);
			finished?.();
		}));
		this.AddAction(500, new CustomAction(finished => {
			game.Move(false, 0.0, CursorType.ArrowRight);
			finished?.();
		}));
		this.AddAction(500, new CustomAction(finished => {
			game.EnableMusicChange(false);
			game.ToggleTransport();
			game.EnableMusicChange(true);
			finished?.();
		}));
		this.AddAction(500, new CustomAction(finished => {
			game.Move(false, 0.0, CursorType.ArrowRight);
			finished?.();
		}));
		this.AddAction(250, new CustomAction(finished => {
			game.Move(false, 0.0, CursorType.ArrowRight);
			finished?.();
		}));
		this.AddAction(250, new CustomAction(finished => {
			game.Move(false, 0.0, CursorType.ArrowRight);
			finished?.();
		}));
		this.AddAction(250, new CustomAction(finished => {
			game.Move(false, 0.0, CursorType.ArrowRight);
			finished?.();
		}));
		this.AddAction(2000, new ShowConversationPortraitAction(hero.PortraitIndex, conversationImagePosition));
		AddConversationText(250, conversationArea, 3);
		this.AddAction(2500, new ClearAction());
		this.AddAction(800, new CustomAction(finished => {
			let numMoves = 10;
			const xPerMove = -8;
			const yPerMove = 6;
			let numDownMoves = 8;

			const travelInfoEagle = this.renderView.GameData.GetTravelGraphicInfo(TravelType.Eagle, CharacterDirection.Left);
			this.eagle = layout.AddMapCharacterSprite(new Rect(new Position(198, 58), new Size(travelInfoEagle.Width, travelInfoEagle.Height)),
				Graphics.TravelGraphicOffset + TravelType.Eagle * 4 + 3, 0xffff);
			this.eagle.ClipArea = GameCore.Map2DViewArea;

			const MoveEagleDownLeft = () => {
				this.eagle.X += xPerMove;
				if (numDownMoves-- > 0)
					this.eagle.Y += yPerMove;

				if (--numMoves === 0) {
					game.PlayMusic(Song.TheUhOhSong);
					game.AddTimedEvent((game.GetCurrentSongDuration() ?? 11000) * 2 - 10,
						() => game.PlayMusic(Song.Ship));
					finished?.();
				} else
					game.AddTimedEvent(100, MoveEagleDownLeft);
			};

			MoveEagleDownLeft();
		}));
		this.AddAction(1000, new ShowConversationPortraitAction(PyrdacorPortraitIndex, conversationImagePosition));
		AddConversationText(250, conversationArea, 4);
		this.AddAction(1250, new ClearAction());
		this.AddAction(1000, new ShowConversationPortraitAction(hero.PortraitIndex, conversationImagePosition));
		AddConversationText(250, conversationArea, 5);
		this.AddAction(1250, new ClearAction());
		this.AddAction(1000, new ShowConversationPortraitAction(PyrdacorPortraitIndex, conversationImagePosition));
		AddConversationText(250, conversationArea, 6);
		AddConversationText(1250, conversationArea, 7);
		this.AddAction(1250, new ClearAction());
		this.AddAction(1000, new ShowConversationPortraitAction(hero.PortraitIndex, conversationImagePosition));
		AddConversationText(250, conversationArea, 8);
		this.AddAction(1250, new ClearAction());
		this.AddAction(1000, new ShowConversationPortraitAction(PyrdacorPortraitIndex, conversationImagePosition));
		AddConversationText(250, conversationArea, 9);
		this.AddAction(2000, new ClearAction());
		this.AddAction(1000, new ShowConversationPortraitAction(hero.PortraitIndex, conversationImagePosition));
		AddConversationText(250, conversationArea, 10);
		this.AddAction(1250, new ClearAction());
		this.AddAction(1000, new ShowConversationPortraitAction(PyrdacorPortraitIndex, conversationImagePosition));
		AddConversationText(250, conversationArea, 11);
		const volume = game.AudioOutput.Volume;
		this.AddAction(3500, new CustomAction(finished => {
			let factor = 0.99;
			const ReduceVolume = () => {
				game.AudioOutput.Volume *= factor;
				factor -= 0.02;
			};
			ReduceVolume();
			for (let i = 0; i < 10; ++i)
				game.AddTimedEvent(100 + i * 100, ReduceVolume);
			finished?.();
		}));
		this.AddAction(1050, new CustomAction(finished => {
			game.Pause();
			game.StartSequence();
			layout.AddFadeEffect(new Rect(0, 0, Global.VirtualScreenWidth, Global.VirtualScreenHeight), RenderColor.Black, FadeEffectType.FadeIn, GameCore.FadeTime);
			game.AddTimedEvent(GameCore.FadeTime, () => {
				this.Clear();
				game.EnableTimeEvents(true);
				game.PrepareOutro();
				game.PlayMusic(Song.VoiceOfTheBagpipe);
				game.AudioOutput.Volume = volume;
				this.ShowCredits();
			});
		}));
	}

	// Created lazily (avoids using imported enums at module evaluation time).
	static get LanguageDependentStrings() {
		return CustomOutro._languageDependentStrings ??= new Map([
		[GameLanguage.German, [
			'Es war ein fantastisches Abenteuer, doch nun muss auch ich Lebewohl sagen.',
			'Die Zwerge in Gemstone brauchen Freiwillige beim Aufbau ihrer Stadt.',
			'Ich hoffe wir werden uns wiedersehen. Gute Reise mein Freund!',
			'$^...',
			'$^Nicht so schnell ~HERO~!',
			'$^Wer bist du?',
			'Mein Name ist ~INK 17~Pyrdacor~INK 31~. Ich habe nicht viel Zeit.',
			'Aber so viel sei gesagt: Das Abenteuer ist noch nicht vorbei.',
			'$^Was meinst du damit?',
			'$^~INK 17~Der dritte Teil der Amber-Triologie~INK 31~ ist geplant.',
			'$^Krass!',
			'Danke, dass du ~INK 22~Ambermoon~INK 31~ gespielt hast! Ich hoffe du hattest Spaß.'
		]],
		[GameLanguage.English, [
			'It was an amazing adventure but now I have to say Goodbye.',
			'The dwarfs of Gemstone need volunteers to rebuild their capital.',
			'I hope we see each other again. Have a good trip my friend!',
			'$^...',
			'$^Not so fast ~HERO~!',
			'$^Who are you?',
			'My name is ~INK 17~Pyrdacor~INK 31~. I don\'t have much time.',
			'But I can tell you this: The adventure is not over yet.',
			'$^What are you talking about?',
			'$^~INK 17~The third part of the Amber trilogy~INK 31~ is planned.',
			'$^Awesome!',
			'Thank you for playing ~INK 22~Ambermoon~INK 31~! I hope you had fun.'
		]],
		[GameLanguage.French, [
			'Ce fut une aventure extraordinaire, mais je dois maintenant dire au revoir..',
			'Les nains de Gemstone ont besoin de volontaires pour reconstruire leur capitale.',
			'J\'espère que nous nous reverrons. Bon voyage mon ami !',
			'$^...',
			'$^Pas si vite ~HERO~!',
			'$^Qui êtes-vous ?',
			'Je m\'appelle ~INK 17~Pyrdacor~INK 31~. Je n\'ai pas beaucoup de temps.',
			'Mais je peux vous dire ceci : L\'aventure n\'est pas encore terminée.',
			'$^De quoi parlez-vous ?',
			'$^~INK 17~Le troisième volet de la trilogie Amber~INK 31~ est prévu.',
			'$^Épatant !',
			'Merci d\'avoir joué à ~INK 22~Ambermoon~INK 31~ ! J\'espère que vous vous êtes bien amusés.'
		]],
		[GameLanguage.Polish, [
			'To była niesamowita przygoda, ale teraz muszę się pożegnać.',
			'Krasnoludy z Gemstone potrzebują ochotników do odbudowy swojej stolicy.',
			'Mam nadzieję, że jeszcze się spotkamy. Udanej podróży przyjacielu!',
			'$^...',
			'$^Nie tak szybko ~HERO~!',
			'$^Kim jesteś?',
			'Moje imię to ~INK 17~Pyrdacor~INK 31~. Nie mam zbyt wiele czasu.',
			'Ale mogę powiedzieć jedno: Przygoda jeszcze się nie skończyła.',
			'$^O czym ty mówisz?',
			'$^Planowana jest ~INK 17~Trzecia część trylogii Amber~INK 31~.',
			'$^ Wspaniale!',
			'Dziękuję za grę w ~INK 22~Ambermoon~INK 31~! Mam nadzieję, że dobrze się bawiliście.'
		]],
		[GameLanguage.Czech, [
			'Bylo to úžasné dobrodružství, ale teď se musím rozloučit.',
			'Trpaslíci z Gemstone potřebují dobrovolníky na obnovu svého hlavního města.',
			'Doufám, že se ještě uvidíme. Šťastnou cestu, příteli!',
			'$^...',
			'$^Ne tak rychle ~HERO~!',
			'$^Kdo jsi?',
			'Jmenuji se ~INK 17~Pyrdacor~INK 31~. Nemám mnoho času.',
			'Ale mohu vám říci toto: Dobrodružství ještě nekončí.',
			'$^O čem to mluvíš?',
			'$^~INK 17~Je v plánu třetí část~INK 31~ trilogie Amber.',
			'$^Úžasné!',
			'Děkuji, že jsi si zahrál ~INK 22~Ambermoon~INK 31~! Doufám, že jsi se bavil.'
		]]
	]);
	}

	AddAction(time, action) { this.actions.Enqueue({ Key: time, Value: action }); }

	Start() {
		// Load initial save but use current game hero portrait and name.
		const hero = this.savegame.PartyMembers[1];
		const StopGame = () => {
			this.game.Pause();
			this.game.StartSequence();
		};
		this.game.LoadInitialCustom(hero.Name, hero.Gender === Gender.Female, hero.PortraitIndex, newSavegame => {
			// Add Egil to second slot
			newSavegame.CurrentPartyMemberIndices[1] = 8;
			// Place ship at the docks
			newSavegame.TransportLocations[0].MapIndex = 156;
			newSavegame.TransportLocations[0].Position = new Position(12, 33);
			newSavegame.TransportLocations[0].TravelType = TravelType.Ship;
			// Place horse on the docks
			newSavegame.TransportLocations[1].MapIndex = 156;
			newSavegame.TransportLocations[1].Position = new Position(16, 33);
			newSavegame.TransportLocations[1].TravelType = TravelType.Horse;
			// Place the player on the docks
			newSavegame.CurrentMapIndex = 156;
			newSavegame.CurrentMapX = 13;
			newSavegame.CurrentMapY = 33;
			newSavegame.CharacterDirection = CharacterDirection.Left;
			// Set to day
			newSavegame.Hour = 13;
			newSavegame.Minute = 37;
			newSavegame.HoursWithoutSleep = 0;
			// Activate all special items
			newSavegame.SpecialItemsActive = 0xffff;
		}, () => {
			StopGame();
			this.game.AddTimedEvent(2000, () => this.ProcessActions());
		});
		StopGame();
		this.game.CursorType = CursorType.None;
		this.game.PlayMusic(Song.Ship);
	}

	ShowCredits() {
		this.game.Pause();
		this.game.StartSequence();
		this.game.CursorType = CursorType.None;
		this.credits = new Credits(this.renderView, this.layout, preAction => {
			this.credits = null;
			this.game.SetClickHandler(() => {
				preAction?.();
				this.game.NewGame(true);
			});
			this.game.EndSequence();
		});
	}

	Update(deltaTime) {
		this.credits?.Update(deltaTime);
	}

	Clear(keepEagle = false) {
		for (const text of this.texts)
			text.Destroy();
		for (const image of this.images)
			image.Delete();
		for (const area of this.areas)
			area.Delete();
		for (const popup of this.popups)
			popup.Destroy();
		for (const panel of this.panels)
			panel.Destroy();

		this.texts.length = 0;
		this.images.length = 0;
		this.areas.length = 0;
		this.popups.length = 0;
		this.panels.length = 0;

		if (!keepEagle) {
			this.eagle?.Delete();
			this.eagle = null;
		}
	}

	RemoveTexts() {
		for (const text of this.texts)
			text.Destroy();

		this.texts.length = 0;
	}

	ProcessActions() {
		if (this.actions.Count !== 0) {
			const action = this.actions.Dequeue();

			const RunAction = () => action.Value.Run(this, () => this.ProcessActions());

			if (action.Key === 0)
				this.game.ExecuteNextUpdateCycle(RunAction);
			else
				this.game.AddTimedEvent(action.Key, RunAction);
		} else {
			// Note: Finished handling is done by the last action which starts the credits.
		}
	}

	AddImage(layer, index, rect, displayLayer = 0, paletteIndex = null, withPortraitBackground = false) {
		if (withPortraitBackground) {
			this.images.push(this.layout.AddSprite(rect, Graphics.UICustomGraphicOffset + UICustomGraphic.PortraitBackground,
				(this.renderView.GraphicInfoProvider.PrimaryUIPaletteIndex + 3 - 1) & 0xff, displayLayer));
		}

		this.images.push(this.layout.AddSprite(rect, index, paletteIndex ?? this.game.PrimaryUIPaletteIndex,
			withPortraitBackground ? ((displayLayer + 1) & 0xff) : displayLayer, null, null, layer));
	}

	AddPopup(position, columns, rows) {
		const popup = new Popup(this.game, this.renderView, position, columns, rows,
			false, 0);

		this.popups.push(popup);

		return popup;
	}

	AddText(text, rect, color, textAlign = TextAlign.Left, displayLayer = 0) {
		const uiText = this.layout.AddText(rect, text, color, textAlign, displayLayer);
		uiText.PaletteIndex = this.game.PrimaryUIPaletteIndex;
		this.texts.push(uiText);
		return uiText;
	}
}

// interface IAction { void Run(CustomOutro outro, Action finished); } is not ported (pure interface).

class ShowConversationPortraitAction {
	constructor(portraitIndex, position) {
		this.portraitIndex = portraitIndex;
		this.rect = new Rect(position, new Size(32, 32));
	}

	Run(outro, finished) {
		outro.AddPopup(Position.op_Subtraction(this.rect.Position, new Position(15, 16)), 11, 4);
		outro.AddImage(Layer.UI, Graphics.PortraitOffset + this.portraitIndex - 1, this.rect, Popup.BaseDisplayLayer + 2, null, true);
		finished?.();
	}
}

class ClearAction {
	Run(outro, finished) {
		outro.Clear(true);
		finished?.();
	}
}

class CustomAction {
	constructor(action) {
		this.action = action;
	}

	Run(outro, finished) {
		this.action?.(finished);
	}
}

class ShowConversationTextAction {
	constructor(rect, text, millisecondsPerCharacter, textColor) {
		this.rect = new Rect(rect);
		this.text = text;
		this.millisecondsPerCharacter = millisecondsPerCharacter;
		this.textColor = textColor;
	}

	Run(outro, finished) {
		outro.RemoveTexts();

		let processedLines = 0;
		let processedLineCharacters = 1;
		let processedTextLength = 1;
		const textRect = this.rect.CreateShrinked(2);
		let clip = outro.layout.GetTextRect(textRect.Position, new Size(Global.GlyphWidth, Global.GlyphLineHeight));
		const wrappedText = outro.game.ProcessText(this.text, textRect);
		const texts = newArray(wrappedText.LineCount);
		const position = new Position(textRect.Position);
		const totalLength = count(wrappedText.GlyphIndices, c => c < SpecialGlyph.NewLine);
		let lineSize = count(wrappedText.Lines[0], c => c < SpecialGlyph.NewLine);
		let currentTextColor = this.textColor;

		for (let i = 0; i < wrappedText.LineCount; ++i) {
			const textLine = outro.renderView.TextProcessor.GetLines(wrappedText, i, 1);
			texts[i] = outro.AddText(textLine, new Rect(position, new Size(textRect.Width, Global.GlyphLineHeight)),
				currentTextColor, TextAlign.Left, Popup.BaseDisplayLayer + 4);
			texts[i].Visible = i === 0;
			texts[i].Clip(clip);
			clip = clip.CreateModified(0, Global.GlyphLineHeight, 0, 0);
			if (i === 0)
				clip.Size.Width = 0;
			position.Y += Global.GlyphLineHeight;
			const colorChange = lastOrDefault(textLine.GlyphIndices, c => c >= SpecialGlyph.FirstColor, 0);
			if (colorChange !== 0)
				currentTextColor = colorChange - SpecialGlyph.FirstColor;
		}

		if (lineSize <= 1) { // First line already processed?
			++processedLines;
			processedLineCharacters = 0;

			if (wrappedText.LineCount === 1) {
				finished?.();
				return;
			}

			lineSize = count(wrappedText.Lines[1], c => c < SpecialGlyph.NewLine);

			if (lineSize === 0) {
				finished?.();
				return;
			}

			texts[1].Visible = true;
		}

		const DrawNextCharacter = () => {
			if (processedTextLength === totalLength)
				finished?.();
			else {
				++processedTextLength;
				texts[processedLines].IncreaseClipWidth(Global.GlyphWidth);

				if (++processedLineCharacters === lineSize) {
					++processedLines;
					processedLineCharacters = 0;
					if (processedLines < texts.length) {
						texts[processedLines].Visible = true;
						lineSize = count(wrappedText.Lines[processedLines], c => c < SpecialGlyph.NewLine);
					}
				}

				outro.game.AddTimedEvent(this.millisecondsPerCharacter, DrawNextCharacter);
			}
		};

		DrawNextCharacter();
	}
}

CustomOutro.ShowConversationPortraitAction = ShowConversationPortraitAction;
CustomOutro.ClearAction = ClearAction;
CustomOutro.CustomAction = CustomAction;
CustomOutro.ShowConversationTextAction = ShowConversationTextAction;
