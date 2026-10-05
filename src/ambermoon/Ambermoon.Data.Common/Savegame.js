// Port of Ambermoon.Data.Common/Savegame.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { IndexOutOfRangeException, getValue, max, newArray, toUShort } from '../../runtime.js';
import { EnumHelper } from '../Ambermoon.Common/EnumHelper.js';
import { Util } from '../Ambermoon.Common/Util.js';
import { ActiveSpellType } from './Enumerations/ActiveSpellType.js';

/// <summary>
/// Location of a horse, raft, ship, etc.
/// </summary>
export class TransportLocation {
	constructor() {
		this.TravelType = 0;
		this.MapIndex = 0;
		this.Position = null;
	}
}

export class ActiveSpell {
	constructor() {
		this.Type = 0;
		this.Duration = 0; // in 5 minute chunks
		this.Level = 0;
	}
}

const toULong = v => BigInt.asUintN(64, BigInt(v));

export class SavegameData {
	constructor() {
		// Map
		this.CurrentMapIndex = 0;
		this.CurrentMapX = 0;
		this.CurrentMapY = 0;
		/// <summary>
		/// Note: Also in 3D only 4 directions are saved. So if
		/// you save and look in diagonal direction you will
		/// look in another direction after loading in original game.
		/// </summary>
		this.CharacterDirection = 0;
		this.TravelType = 0;
		this.TransportLocations = newArray(32);
		this.GlobalVariables = new Uint8Array(1024);
		/// <summary>
		/// 64 events bits per map.
		/// Each bit activates (0) or deactivates (1) an event.
		/// The bit index corresponds to the event list index (0 to 63).
		/// 76543210 FEDCBA98 ...
		/// </summary>
		/** C# ulong[] -> array of BigInt values (64 bit). Numbers written into it by readers are accepted as well. */
		this.MapEventBits = newArray(1024, 0n); // valid maps are 1 to 528, but these bits allow for maps 1 to 1024
		/// <summary>
		/// 32 events bits per map.
		/// Each bit disables (1) or enables (0) a character on the map.
		/// The bit index corresponds to the character index (0 to 31).
		/// </summary>
		this.CharacterBits = newArray(1024, 0); // valid maps are 1 to 528, but these bits allow for maps 1 to 1024
		this.GotoPointBits = new Uint8Array(32);

		// Party
		this.CurrentPartyMemberIndices = newArray(6, 0);
		this.ActivePartyMemberSlot = 0; // 0 - 5
		this.BattlePositions = new Uint8Array(6);
		this.ActiveSpells = newArray(6);
		/// <summary>
		/// One bit for each available dictionary word.
		/// If the bit is set the word is available in conversations.
		/// </summary>
		this.DictionaryWords = new Uint8Array(128);

		// Chests and merchants
		this.ChestUnlockStates = null;
		this.DoorUnlockStates = null;
		this.ExtendedChestUnlockStates = null;

		// Events

		// After chest locked states there can be tile change events with 6 bytes each.
		// They are encoded as:
		//  word MapIndex;
		//  byte X; // 1-based
		//  byte Y; // 1-based
		//  word NewFrontTileIndex;
		//
		// The key is the map index and the value a list of change tile events
		// which should be executed when entering the map or loading a game which
		// starts on that map.
		/** Map<number, ChangeTileEvent[]> */
		this.TileChangeEvents = new Map();

		// Misc
		this.Year = 0;
		this.Month = 0;
		this.DayOfMonth = 0;
		this.Hour = 0;
		this.Minute = 0; // a multiple of 5
		this.HoursWithoutSleep = 0;
		this.YearsPassed = 0;
		this.SpecialItemsActive = 0;
		this.GameOptions = 0;
	}

	// #region Map

	GetGlobalVariable(index) {
		if (index > 8192)
			throw new IndexOutOfRangeException('Variable index must be between 0 and 8192');

		const byteIndex = Math.trunc(index / 8);
		const bitIndex = index % 8;

		return (this.GlobalVariables[byteIndex] & (1 << bitIndex)) !== 0;
	}

	SetGlobalVariable(index, value) {
		if (index > 8192)
			throw new IndexOutOfRangeException('Variable index must be between 0 and 8192');

		const byteIndex = Math.trunc(index / 8);
		const bitIndex = index % 8;
		const mask = 1 << bitIndex;

		if (value)
			this.GlobalVariables[byteIndex] |= mask & 0xff;
		else
			this.GlobalVariables[byteIndex] &= (~mask) & 0xff;
	}

	IsEventActive(mapIndex, eventIndex) { return !this.GetEventBit(mapIndex, eventIndex); }
	ActivateEvent(mapIndex, eventIndex, activate) { this.SetEventBit(mapIndex, eventIndex, !activate); }

	GetEventBit(mapIndex, eventIndex) {
		if (mapIndex < 1 || mapIndex > 1024)
			throw new IndexOutOfRangeException('Map index must be between 1 and 1024');
		if (eventIndex > 63)
			throw new IndexOutOfRangeException('Event index must be between 0 and 63');

		const byteIndex = Math.trunc(eventIndex / 8);
		const bitIndex = eventIndex % 8;
		const bitValue = 1n << BigInt((7 - byteIndex) * 8 + bitIndex);

		return (toULong(this.MapEventBits[mapIndex - 1]) & bitValue) !== 0n;
	}

	SetEventBit(mapIndex, eventIndex, bit) {
		if (mapIndex < 1 || mapIndex > 1024)
			throw new IndexOutOfRangeException('Map index must be between 1 and 1024');
		if (eventIndex > 63)
			throw new IndexOutOfRangeException('Event index must be between 0 and 63');

		const byteIndex = Math.trunc(eventIndex / 8);
		const bitIndex = eventIndex % 8;
		const bitValue = 1n << BigInt((7 - byteIndex) * 8 + bitIndex);
		const current = toULong(this.MapEventBits[mapIndex - 1]);

		if (bit)
			this.MapEventBits[mapIndex - 1] = current | bitValue;
		else
			this.MapEventBits[mapIndex - 1] = toULong(current & ~bitValue);
	}

	GetCharacterBit(mapIndex, characterIndex) {
		if (mapIndex < 1 || mapIndex > 1024)
			throw new IndexOutOfRangeException('Map index must be between 1 and 1024');
		if (characterIndex > 31)
			throw new IndexOutOfRangeException('Character index must be between 0 and 31');

		const byteIndex = Math.trunc(characterIndex / 8);
		const bitIndex = characterIndex % 8;
		const bitValue = (1 << ((3 - byteIndex) * 8 + bitIndex)) >>> 0;
		return ((this.CharacterBits[mapIndex - 1] & bitValue) >>> 0) !== 0;
	}

	SetCharacterBit(mapIndex, characterIndex, bit) {
		if (mapIndex < 1 || mapIndex > 1024)
			throw new IndexOutOfRangeException('Map index must be between 1 and 1024');
		if (characterIndex > 31)
			throw new IndexOutOfRangeException('Character index must be between 0 and 31');

		const byteIndex = Math.trunc(characterIndex / 8);
		const bitIndex = characterIndex % 8;
		const bitValue = (1 << ((3 - byteIndex) * 8 + bitIndex)) >>> 0;

		if (bit)
			this.CharacterBits[mapIndex - 1] = (this.CharacterBits[mapIndex - 1] | bitValue) >>> 0;
		else
			this.CharacterBits[mapIndex - 1] = (this.CharacterBits[mapIndex - 1] & ~bitValue) >>> 0;
	}

	IsGotoPointActive(index) {
		const byteIndex = Math.trunc(index / 8);
		const bitIndex = index % 8;
		return (this.GotoPointBits[byteIndex] & (1 << bitIndex)) !== 0;
	}

	ActivateGotoPoint(index) {
		const byteIndex = Math.trunc(index / 8);
		const bitIndex = index % 8;
		this.GotoPointBits[byteIndex] |= (1 << bitIndex) & 0xff;
	}

	// #endregion

	// #region Party

	/// <summary>
	/// Activates a spell.
	/// </summary>
	/// <param name="type">Active spell type</param>
	/// <param name="duration">Duration in 5 minute chunks (e.g. 120 for 10 ingame hours).</param>
	/// <param name="level">Level of the spell or 0 if not used.</param>
	ActivateSpell(type, duration, level) {
		if (this.ActiveSpells[type] == null) {
			const activeSpell = new ActiveSpell();
			activeSpell.Type = type;
			activeSpell.Duration = duration;
			activeSpell.Level = level;
			this.ActiveSpells[type] = activeSpell;
		} else {
			const activeSpell = this.ActiveSpells[type];

			if (activeSpell.Level < level)
				activeSpell.Level = level;
			activeSpell.Duration = Util.Limit(activeSpell.Duration, duration, 200);
		}
	}

	/// <summary>
	/// Updates all active spells and end them if they run out.
	/// </summary>
	/// <param name="elapsedSinceLastUpdate">Time elapsed since last update in 5 minute chunks.</param>
	UpdateActiveSpells(elapsedSinceLastUpdate) {
		for (const type of EnumHelper.GetValues(ActiveSpellType)) {
			const activeSpell = this.ActiveSpells[type];

			if (activeSpell != null) {
				if (activeSpell.Duration <= elapsedSinceLastUpdate)
					this.ActiveSpells[type] = null;
				else
					activeSpell.Duration -= elapsedSinceLastUpdate;
			}
		}
	}

	IsSpellActive(activeSpellType) {
		return this.ActiveSpells.some(s => s?.Type === activeSpellType && s?.Duration > 0);
	}

	GetActiveSpellLevel(activeSpellType) {
		const levels = this.ActiveSpells.filter(s => s?.Type === activeSpellType && s?.Duration > 0).map(s => s.Level);
		return max(levels.length === 0 ? [0] : levels);
	}

	GetActiveSpellDuration(activeSpellType) {
		const durations = this.ActiveSpells.filter(s => s?.Type === activeSpellType && s?.Duration > 0).map(s => s.Duration);
		return max(durations.length === 0 ? [0] : durations);
	}

	IsDictionaryWordKnown(index) {
		return (this.DictionaryWords[Math.trunc(index / 8)] & (1 << (index % 8))) !== 0;
	}

	AddDictionaryWord(index) {
		this.DictionaryWords[Math.trunc(index / 8)] |= (1 << (index % 8)) & 0xff;
	}

	// #endregion

	// #region Chests and merchants

	IsChestLocked(chestIndex) {
		if (chestIndex > 383)
			throw new IndexOutOfRangeException(`Chest index must be 0..383 but was ${chestIndex}.`);

		if (chestIndex > 255) {
			chestIndex -= 256;
			return (this.ExtendedChestUnlockStates[Math.trunc(chestIndex / 8)] & (1 << (chestIndex % 8))) === 0;
		}

		return (this.ChestUnlockStates[Math.trunc(chestIndex / 8)] & (1 << (chestIndex % 8))) === 0;
	}

	LockChest(chestIndex) {
		if (chestIndex > 383)
			throw new IndexOutOfRangeException(`Chest index must be 0..383 but was ${chestIndex}.`);

		if (chestIndex > 255) {
			chestIndex -= 256;
			this.ExtendedChestUnlockStates[Math.trunc(chestIndex / 8)] &= (~(1 << (chestIndex % 8))) & 0xff;
		} else {
			this.ChestUnlockStates[Math.trunc(chestIndex / 8)] &= (~(1 << (chestIndex % 8))) & 0xff;
		}
	}

	UnlockChest(chestIndex) {
		if (chestIndex > 383)
			throw new IndexOutOfRangeException(`Chest index must be 0..383 but was ${chestIndex}.`);

		if (chestIndex > 255) {
			chestIndex -= 256;
			this.ExtendedChestUnlockStates[Math.trunc(chestIndex / 8)] |= (1 << (chestIndex % 8)) & 0xff;
		} else {
			this.ChestUnlockStates[Math.trunc(chestIndex / 8)] |= (1 << (chestIndex % 8)) & 0xff;
		}
	}

	IsDoorLocked(doorIndex) {
		if (doorIndex > 127)
			throw new IndexOutOfRangeException(`Door index must be 0..127 but was ${doorIndex}.`);

		return (this.DoorUnlockStates[Math.trunc(doorIndex / 8)] & (1 << (doorIndex % 8))) === 0;
	}

	LockDoor(doorIndex) {
		if (doorIndex > 127)
			throw new IndexOutOfRangeException(`Door index must be 0..127 but was ${doorIndex}.`);

		this.DoorUnlockStates[Math.trunc(doorIndex / 8)] &= (~(1 << (doorIndex % 8))) & 0xff;
	}

	UnlockDoor(doorIndex) {
		if (doorIndex > 127)
			throw new IndexOutOfRangeException(`Door index must be 0..127 but was ${doorIndex}.`);

		this.DoorUnlockStates[Math.trunc(doorIndex / 8)] |= (1 << (doorIndex % 8)) & 0xff;
	}

	// #endregion

	// #region Misc

	IsSpecialItemActive(specialItemPurpose) {
		return (this.SpecialItemsActive & (1 << specialItemPurpose)) !== 0;
	}

	ActivateSpecialItem(specialItemPurpose) {
		this.SpecialItemsActive = toUShort(this.SpecialItemsActive | toUShort(1 << specialItemPurpose));
	}

	IsGameOptionActive(option) {
		return (this.GameOptions & (1 << option)) !== 0;
	}

	SetGameOption(option, active) {
		const bit = toUShort(1 << option);

		if (active)
			this.GameOptions = toUShort(this.GameOptions | bit);
		else
			this.GameOptions = toUShort(this.GameOptions & toUShort(~bit));
	}

	// #endregion
}

export class Savegame extends SavegameData {
	constructor() {
		super();

		/** Map<number, Automap> */
		this.Automaps = new Map();
		/** Map<number, PartyMember> */
		this.PartyMembers = new Map();
		/** Map<number, Chest> */
		this.Chests = new Map();
		/** Map<number, Merchant> */
		this.Merchants = new Map();
	}

	GetPartyMember(slot) {
		return this.CurrentPartyMemberIndices[slot] === 0 ? null : getValue(this.PartyMembers, this.CurrentPartyMemberIndices[slot]);
	}

	static Load(savegameSerializer, savegameFiles, partyTextsContainer) {
		const savegame = new Savegame();

		savegameSerializer.Read(savegame, savegameFiles, partyTextsContainer);

		return savegame;
	}
}
