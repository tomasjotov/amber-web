// Port of Ambermoon.Core/Game/DataProviders.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { Window } from '../UI/Window.js';
import { Gender } from '../../Ambermoon.Data.Common/Enumerations/Gender.js';
import { CustomTexts } from './CustomTexts.js';
import { firstOrDefault } from '../../../runtime.js';

// Nested class GameCore.NameProvider (implements ITextNameProvider)
export class NameProvider {
	constructor(game) {
		this.game = game;
	}

	get Subject() {
		const game = this.game;
		switch (game.currentWindow.Window) {
			case Window.Healer:
				return game.currentlyHealedMember;
			case Window.Battle:
				return game.BattleRoundActive ? game.CurrentPartyMember : game.CurrentSpellTarget ?? game.CurrentPartyMember;
			default:
				return game.CurrentSpellTarget ?? game.CurrentPartyMember;
		}
	}

	/** @inheritdoc */
	get LeadName() { return this.game.CurrentPartyMember?.Name ?? ''; }
	/** @inheritdoc */
	get SelfName() {
		const partyMembers = this.game?.PartyMembers;
		return (partyMembers == null ? null : firstOrDefault(partyMembers))?.Name ?? this.LeadName;
	}
	/** @inheritdoc */
	get CastName() { return this.game.CurrentCaster?.Name ?? this.LeadName; }
	/** @inheritdoc */
	get InvnName() { return this.game.CurrentInventory?.Name ?? this.LeadName; }
	/** @inheritdoc */
	get SubjName() { return this.Subject?.Name ?? this.LeadName; }
	/** @inheritdoc */
	get Sex1Name() { return this.Subject?.Gender === Gender.Male ? this.game.DataNameProvider.He : this.game.DataNameProvider.She; }
	/** @inheritdoc */
	get Sex2Name() { return this.Subject?.Gender === Gender.Male ? this.game.DataNameProvider.His : this.game.DataNameProvider.Her; }
}

export class GameCore_DataProviders {
	// readonly NameProvider nameProvider; readonly TextDictionary textDictionary;
	// internal IDataNameProvider DataNameProvider { get; }; public ICharacterManager CharacterManager { get; }
	// All of them are assigned in the GameCore constructor.

	// TODO: Optimize to not query this every time (e.g. by updating it when a word is learned)
	get Dictionary() {
		return this.CurrentSavegame == null ? null : this.textDictionary.Entries.filter((word, index) =>
			this.CurrentSavegame.IsDictionaryWordKnown(index));
	}

	GetCustomText(index) { return CustomTexts.GetText(this.GameLanguage, index); }
}
