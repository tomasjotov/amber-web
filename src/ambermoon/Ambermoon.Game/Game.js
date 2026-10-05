// Port of Ambermoon.Game/Game.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { Event, cloneStruct, hasFlag, isNullOrWhiteSpace, repeat, getValue } from '../runtime.js';
import { Rect } from '../Ambermoon.Common/Rect.js';
import { Position } from '../Ambermoon.Common/Position.js';
import { CursorType } from '../Ambermoon.Data.Common/CursorType.js';
import { Features } from '../Ambermoon.Data.Common/Enumerations/Features.js';
import { Gender } from '../Ambermoon.Data.Common/Enumerations/Gender.js';
import { Song } from '../Ambermoon.Data.Common/Enumerations/Song.js';
import { Spell } from '../Ambermoon.Data.Common/Enumerations/Spells.js';
import { SpellApplicationArea } from '../Ambermoon.Data.Common/SpellInfo.js';
import { GameCore } from '../Ambermoon.Core/GameCore.js';
import { Key } from '../Ambermoon.Core/Key.js';
import { KeyModifiers } from '../Ambermoon.Core/KeyModifiers.js';
import { MouseButtons } from '../Ambermoon.Core/MouseButtons.js';
import { Global } from '../Ambermoon.Core/UI/Global.js';
import { LayoutType } from '../Ambermoon.Core/UI/Layout.js';
import { CharacterCreator } from './CharacterCreator.js';
import { CustomOutro } from './CustomOutro.js';

export class Game extends GameCore {
	static NumAdditionalSavegameSlots = 20;

	//#region Hooks

	Hook_NewGameCleanup() {
		this.customOutro = null;
	}

	Hook_NewGame() {
		this.characterCreator = new CharacterCreator(this.renderView, this, (name, female, portraitIndex) => {
			this.LoadInitialCustom(name, female, portraitIndex, savegame => this.FixSavegameValues(savegame));
			this.showMobileTouchPadHandler?.(false); // This avoids showing it briefly and then immediately enter the grandfather event window
			this.characterCreator = null;
		});
	}

	Hook_GameLoaded(savegame, slot, updateSlot) {
		if (updateSlot && slot > 0) {
			if (slot <= 10)
				this.SavegameManager.SetActiveSavegame(this.renderView.GameData, slot);

			if (this.Configuration.AdditionalSavegameSlots != null) {
				const additionalSavegameSlots = this.GetAdditionalSavegameSlots();

				if (additionalSavegameSlots != null)
					additionalSavegameSlots.ContinueSavegameSlot = slot;
			}
		}

		// Upgrade old Ambermoon Advanced save games
		if (this.renderView.GameData.Advanced && slot > 0) {
			// TODO: will only work for legacy data for now!
			let sourceEpisode;
			const targetEpisode = 3; // TODO: increase when there is a new one

			if (!savegame.PartyMembers.has(16)) // If Kasimir is not there, it is episode 1
				sourceEpisode = 1;
			else if (!savegame.Chests.has(280)) // If chest 280 is not there it is episode 2
				sourceEpisode = 2;
			else // If both are there, it is episode 3
				sourceEpisode = 3;

			if (sourceEpisode < targetEpisode) {
				savegame = this.RequestAdvancedSavegamePatching.invoke(this.renderView.GameData, slot, sourceEpisode, targetEpisode, savegame);
			}
		}

		return savegame;
	}

	Hook_GameSaved(slot, name) {
		const NumAdditionalSavegameSlots = Game.NumAdditionalSavegameSlots;
		const NumBaseSavegameSlots = Game.NumBaseSavegameSlots;

		if (this.Configuration.ExtendedSavegameSlots) { // extended slots
			const additionalSavegameSlots = this.GetAdditionalSavegameSlots();

			if (additionalSavegameSlots != null) {
				if (additionalSavegameSlots.Names == null || additionalSavegameSlots.Names.length < NumAdditionalSavegameSlots)
					additionalSavegameSlots.Names = [...(additionalSavegameSlots.Names ?? []),
						...repeat('', NumAdditionalSavegameSlots - (additionalSavegameSlots.Names?.length ?? 0))];
				else if (additionalSavegameSlots.Names.length > NumAdditionalSavegameSlots)
					additionalSavegameSlots.Names = additionalSavegameSlots.Names.slice(0, NumAdditionalSavegameSlots);

				if (additionalSavegameSlots.BaseNames == null || additionalSavegameSlots.BaseNames.length < NumBaseSavegameSlots)
					additionalSavegameSlots.BaseNames = [...(additionalSavegameSlots.BaseNames ?? []),
						...repeat('', NumBaseSavegameSlots - (additionalSavegameSlots.BaseNames?.length ?? 0))];

				if (slot > NumBaseSavegameSlots) // 1-based slot
					additionalSavegameSlots.Names[slot - Game.NumBaseSavegameSlots - 1] = name;
				else
					additionalSavegameSlots.BaseNames[slot - 1] = name;

				additionalSavegameSlots.ContinueSavegameSlot = slot;

				this.additionalSaveSlotProvider?.RequestSave(this.SavegameManager, this.renderView.GameData);
			}
		}
	}

	/** out proceedWithUpdate -> returns [proceedWithUpdate] */
	Hook_PreUpdate(deltaTime) {
		if (this.outro?.Active === true) {
			this.outro.Update(deltaTime);
			return [false];
		}

		if (this.customOutro?.CreditsActive === true) {
			this.customOutro.Update(deltaTime);
			return [false];
		}

		if (this.characterCreator != null) {
			this.characterCreator.Update(deltaTime);
			return [false];
		}

		return [true];
	}

	/** out proceedWithUpdate -> returns [proceedWithUpdate] */
	Hook_AfterTimedEventUpdate(deltaTime) {
		// Might be activated by a timed event and we don't want to
		// process other things in this case.
		return [!(this.outro?.Active === true)];
	}

	Hook_DestroyCleanup() {
		this.outro?.Destroy();
	}

	//#endregion

	//#region Providers

	Provider_ContinueSavegameSlot() {
		let current = this.Configuration.ExtendedSavegameSlots ? this.GetAdditionalSavegameSlots()?.ContinueSavegameSlot ?? 0 : 0;

		if (current <= 0)
			[, current] = this.SavegameManager.GetSavegameNames(this.renderView.GameData, Game.NumBaseSavegameSlots);

		return current;
	}

	Provider_NumSavegameSlots() {
		return this.Configuration.ExtendedSavegameSlots ? 30 : 10;
	}

	Provider_HasSavegames() {
		const [names] = this.SavegameManager.GetSavegameNames(this.renderView.GameData, this.Provider_NumSavegameSlots());
		let hasSavegames = names.some(n => !isNullOrWhiteSpace(n));
		if (!hasSavegames)
			hasSavegames = this.Configuration.ExtendedSavegameSlots && this.GetAdditionalSavegameSlots()?.Names?.some(s => !isNullOrWhiteSpace(s)) === true;

		return hasSavegames;
	}

	Provider_AdditionalSavegameNames() {
		const NumAdditionalSavegameSlots = Game.NumAdditionalSavegameSlots;
		const additionalSavegameSlots = this.GetAdditionalSavegameSlots();
		const remaining = NumAdditionalSavegameSlots - Math.min(NumAdditionalSavegameSlots, additionalSavegameSlots?.Names?.length ?? 0);

		let additionalSavegameNames = [];

		if (additionalSavegameSlots?.Names != null)
			additionalSavegameNames = additionalSavegameNames.concat(additionalSavegameSlots.Names.slice(0, NumAdditionalSavegameSlots).map(n => n ?? ''));
		if (remaining !== 0)
			additionalSavegameNames = additionalSavegameNames.concat(repeat('', remaining));

		return additionalSavegameNames;
	}

	Provider_ContinueGameSlotUpdater() {
		return slot => {
			const additionalSavegameSlots = this.GetAdditionalSavegameSlots();

			if (additionalSavegameSlots != null)
				additionalSavegameSlots.ContinueSavegameSlot = slot;
		};
	}

	//#endregion

	//#region Misc

	get Advanced() { return this.renderView.GameData.Advanced; }

	//#endregion

	//#region Outros

	PrepareOutro() {
		this.Cleanup();
		this.layout.ShowPortraitArea(false);
		this.layout.SetLayout(LayoutType.None);
		this.HideWindowTitle();
		this.TrapMouse(new Rect(0, 0, Global.VirtualScreenWidth, Global.VirtualScreenHeight));
		this.CursorType = CursorType.None;
		this.UpdateCursor();
		this.SetCurrentUIPaletteIndex(0);
		this.Pause();
	}

	Hook_Outro() {
		this.ShowOutro();
	}

	ShowOutro() {
		this.showMobileTouchPadHandler?.(false);

		this.ClosePopup();
		this.CloseWindow();
		this.Pause();
		this.StartSequence();
		this.ExecuteNextUpdateCycle(() => {
			this.PrepareOutro();

			this.PlayMusic(Song.Outro);
			// web port: the Amberstar outro (src/amberstar/extensions/outro.js) returns to the main menu
			this.outro ??= this.outroFactory.Create(() => this.renderView.GameData?.OutroData?.IsAmberstarOutro
				? this.QuitRequested.invoke() : this.ShowCustomOutro());
			this.outro.Start(this.CurrentSavegame);
		});
	}

	ShowCustomOutro() {
		this.showMobileTouchPadHandler?.(false);

		this.customOutro = new CustomOutro(this, this.layout, this.CurrentSavegame);
		this.customOutro.Start();
	}

	//#endregion

	//#region Savegames

	// Used for the custom outro
	LoadInitialCustom(name, female, portraitIndex, setup = null, postStartAction = null) {
		const initialSavegame = this.SavegameManager.LoadInitial(this.renderView.GameData, this.savegameSerializer);
		const partyMember = getValue(initialSavegame.PartyMembers, 1);

		partyMember.Name = name;
		partyMember.Gender = female ? Gender.Female : Gender.Male;
		partyMember.PortraitIndex = portraitIndex & 0xff;

		setup?.(initialSavegame);

		this.Start(initialSavegame, postStartAction);
	}

	GetAdditionalSavegameSlots() { return this.additionalSaveSlotProvider?.GetOrCreateAdditionalSavegameNames(this.GameVersionName) ?? null; }

	//#endregion

	constructor(configuration, gameLanguage, renderView, graphicInfoProvider,
		savegameManager, savegameSerializer, textDictionary,
		cursor, audioOutput, songManager, fullscreenChangeHandler,
		resolutionChangeHandler, pressedKeyProvider, outroFactory,
		features, gameVersionName, version, keyboardRequest,
		additionalSaveSlotProvider, drawTouchFingerRequest = null,
		showMobileTouchPadHandler = null) {
		super(configuration, gameLanguage, renderView, graphicInfoProvider, savegameManager, savegameSerializer,
			textDictionary, cursor, audioOutput, songManager, fullscreenChangeHandler, resolutionChangeHandler,
			pressedKeyProvider, features, gameVersionName, version, keyboardRequest, drawTouchFingerRequest,
			showMobileTouchPadHandler);

		// Field initializers

		//#region Configuration
		this.Configuration = null;
		//#endregion

		//#region Misc
		this.characterCreator = null;
		//#endregion

		//#region Outros
		this.outroFactory = null;
		this.outro = null;
		this.customOutro = null;
		//#endregion

		//#region Savegames
		this.additionalSaveSlotProvider = null;
		// Func<ILegacyGameData, int, int, int, Savegame, Savegame> event; invoke() returns the last handler's result
		this.RequestAdvancedSavegamePatching = new Event();
		//#endregion

		// In Advanced limit All Healing to Camp and Battle
		if (hasFlag(features, Features.AdvancedSpells)) {
			const spellInfo = cloneStruct(this.spellInfos.get(Spell.AllHealing));
			spellInfo.ApplicationArea = SpellApplicationArea.CampAndBattle;
			this.spellInfos.set(Spell.AllHealing, spellInfo);
		}

		this.Configuration = configuration;

		this.additionalSaveSlotProvider = additionalSaveSlotProvider;
		this.outroFactory = outroFactory;
	}

	OnMouseWheel(xScroll, yScroll, mousePosition) {
		if (this.characterCreator != null) {
			this.characterCreator.OnMouseWheel(xScroll, yScroll, mousePosition, this.CoreConfiguration.IsMobile);
			return;
		}

		super.OnMouseWheel(xScroll, yScroll, mousePosition);
	}

	OnMouseDown(position, buttons, keyModifiers = KeyModifiers.None) {
		if (this.characterCreator != null) {
			this.characterCreator.OnMouseDown(position, buttons);
			return;
		}

		if (this.outro?.Active === true) {
			this.outro.Click(buttons === MouseButtons.Right);
			return;
		}

		super.OnMouseDown(position, buttons, keyModifiers);
	}

	OnMouseUp(cursorPosition, buttons) {
		if (this.characterCreator != null) {
			this.characterCreator.OnMouseUp(cursorPosition, buttons);
			return;
		}

		super.OnMouseUp(cursorPosition, buttons);
	}

	OnMouseMove(position, buttons) {
		if (this.outro?.Active !== true && !this.InputEnable && !this.layout.PopupActive)
			this.UntrapMouse();

		if (this.outro?.Active === true) {
			this.SetLastMousePosition(new Position(position));
			this.CursorType = CursorType.None;
		} else {
			super.OnMouseMove(position, buttons);
		}
	}

	OnKeyDown(key, modifiers, tapped = false) {
		// Note: The C# code breaks into the debugger on Ctrl+F5 in DEBUG builds (not ported).
		if (this.characterCreator != null) {
			this.characterCreator.OnKeyDown(key, modifiers);
			return;
		}

		if (this.outro?.Active === true) {
			if (key === Key.Escape)
				this.outro.Abort();

			return;
		}

		super.OnKeyDown(key, modifiers, tapped);
	}

	OnKeyUp(key, modifiers) {
		if (this.characterCreator != null)
			return;

		super.OnKeyUp(key, modifiers);
	}

	OnKeyChar(keyChar) {
		if (this.characterCreator != null) {
			this.characterCreator.OnKeyChar(keyChar);
			return;
		}

		super.OnKeyChar(keyChar);
	}

	//#region Game Over

	Hook_GameOver() {
		this.GameOver();
	}

	GameOver() {
		this.PlayMusic(Song.GameOver);
		// web port: other games (Amberstar) have their own game over picture
		const picture = this.renderView.GameData?.AmberstarExtensions?.gameOverPictureIndex ?? 8;
		this.ShowEvent(this.ProcessText(this.DataNameProvider.GameOverMessage), picture, null, true);
	}

	//#endregion
}
