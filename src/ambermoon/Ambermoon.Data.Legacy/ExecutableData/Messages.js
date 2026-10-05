// Port of Ambermoon.Data.Legacy/ExecutableData/Messages.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { AmigaExecutable } from '../Serialization/AmigaExecutable.js';

/**
 * All kind of game messages.
 *
 * They follow after the WorldNames.
 *
 * There are two text chunks. The first one can
 * contain placeholders.
 *
 * First chunk:
 * ============
 *
 * The messages are stored as sections. A section can contain
 * just null-terminated texts after each other or a
 * offset section. These sections are used for split
 * texts that are filled with values at runtime.
 *
 * An offset section starts with a word-aligned 0-longword which
 * must be skipped then. I also found some additional 0-longwords.
 * They should be skipped as well.
 *
 * Each offset entry contains 8 bytes. First 4 bytes are the absolute
 * offset to the text string inside the data hunk. The last 4 bytes
 * seem to be always 0. Maybe they can adjust the index of the value
 * to insert/replace? The resulting string is produced by reading the
 * partial strings at all offsets and concatenate them. Between each
 * of the partial strings there will be a value provide by the game
 * at runtime. So you can add C# format placeholders like {0} there.
 *
 * I am not sure yet if I understand this encoding correctly
 * but it works for now to parse all messages.
 *
 * Second chunk:
 * =============
 *
 * The second chunk starts with the size of entries (should be 300)
 * as a dword. Then this amount of words follow which give the
 * lengths of each entry.
 *
 * Then the entries follow which are plain texts. They are null-
 * terminated in most cases but not always so use the length to
 * read them and trim the terminating nulls.
 */
const Index = Object.freeze({
		None: 0,
		IOErrorOccured: 1,
		InsertDisk: 2,
		InsertSaveDisk: 3,
		TextBlockMissing: 4,
		DeactivateMusicLackOfMem: 5,
		RestartOutOfMem: 6,
		DontForgetItems: 18,
		Comma: 19,
		FullStop: 20,
		HasNoMoreFood: 21,
		RegainsLP: 22,
		RegainsLPAndSP: 23,
		HasAged: 24,
		HasDiedOfAge: 25,
		AgreeOnPrice: 26,
		AgreeOnFoodPrice: 27,
		HasReachedLevel: 28,
		AttacksWith: 29,
		Attacks: 30,
		WasBroken: 31,
		DidPointsOfDamage: 32,
		ReceiveExp: 33,
		CastsSpell: 34,
		CastsSpellFrom: 35,
		IsNotTheRightAnswer: 36,
		That: 37,
		NothingToRespond: 38, // = 38, in original code this is the first message so subtract 38 and you have the message id there
		OSOutOfMemory: 39,
		FileInUse: 40,
		FileAlreadyExists: 41,
		DirectoryNotFound: 42,
		FileNotFound: 43,
		FileTooLarge: 44,
		InvalidFilename: 45,
		ObjectNotOfRequiredType: 46,
		DiskNotValidated: 47,
		Empty: 48,
		SeekError: 49,
		DiskFull: 50,
		IncompleteRead: 51,
		FileIsWriteProtected: 52,
		FileIsReadProtected: 53,
		NotADosDisk: 54,
		IncompleteWrite: 55,
		EnterBattlePositions: 56,
		WhichScrollToRead: 57,
		ThatsNotASpellScroll: 58,
		CantLearnSpellsOfType: 59,
		ManagedToLearnSpell: 60,
		FailedToLearnSpell: 61,
		PartyRestsFor8Hours: 62,
		NotEnoughSpellLearningPoints: 63,
		NotEnoughSP: 64,
		WrongArea: 65,
		WhichItemToDrop: 66,
		YouNeedThisItem: 67,
		WhichItemToUse: 68,
		WhichItemToExamine: 69,
		DropHowMuchGold: 70,
		DropHowMuchFood: 71,
		ThisCannotBeEquipped: 72,
		WrongClassToEquip: 73,
		WrongSexToEquip: 74,
		NotEnoughFreeHands: 75,
		NotEnoughFreeFingers: 76,
		RestingTooDangerous: 77,
		DropHowMany: 78,
		CannotUseMagicDiscHere: 79,
		ThisItemIsCursed: 80,
		ThisItemFulfillsSpecialPurpose: 81,
		WhomGiveItTo: 82,
		CannotEquipInCombat: 83,
		BlowsTheFlute: 84,
		ReallyDropIt: 85,
		SameItemAlreadyInUse: 86,
		ReallyDropGold: 87,
		ReallyDropFood: 88,
		DarkDontFindWayBack: 89,
		GiveHowMuchGold: 90,
		GiveHowMuchFood: 91,
		TakeHowMany: 92,
		WhereToMoveItTo: 93,
		CannotUnequipInCombat: 94,
		ReviveMessage: 95,
		SeeRoundDiskInFloor: 96,
		YouNoticeATrap: 97,
		ReallyQuit: 98,
		AlreadyKnowsSpell: 99,
		CannotUseBrokenItems: 100,
		CannotUseItHere: 101,
		YouLevitate: 102,
		WhichNumber: 103,
		CannotJumpThroughWalls: 104,
		WhichMemberShouldBeBlinked: 105,
		HasOpenedDoor: 106,
		HearStrangeSound: 107,
		HasUnlockedDoor: 108,
		DiscoverTrap: 109,
		DoesNotDiscoverTraps: 110,
		DisarmTrap: 111,
		UnlockedDoorWithLockpick: 112,
		LockpickBreaks: 113,
		UnableToPickTheLock: 114,
		WhichItemToOpenDoor: 115,
		WhichItemToOpenChest: 116,
		HasUnlockedChest: 117,
		HasOpenedChest: 118,
		UnlockedChestWithLockpick: 119,
		ThisItemDoesNotOpenDoor: 120,
		ThisItemDoesNotOpenChest: 121,
		WhichItemToPutInChest: 122,
		StoreHowMany: 123,
		StoreHowMuchGold: 124,
		StoreHowMuchFood: 125,
		NoMoreGoldFitsIntoChest: 126,
		NoMoreFoodFitsIntoChest: 127,
		NoOneCanCarryThatMuch: 128,
		ChestFull: 129,
		ChestNowFull: 130,
		ReadWriteError: 131,
		ReallyLoad: 132,
		ReallyOverwriteSave: 133,
		SaveWhichSavegame: 134,
		DenyLeavingPartyOnMoon: 135,
		CannotSendDeadPeopleAway: 136,
		CrazyPeopleDontFollowCommands: 137,
		PetrifiedPeopleCantGoHome: 138,
		SleepUntilDawn: 139,
		HowAboutSomeMore: 140,
		WhoToTalkTo: 141,
		SelfTalkingIsMad: 142,
		ThisPersonIsAsleep: 143,
		YouDontSpeakSameLanguage: 144,
		DontKnowAnythingSpecialAboutIt: 145,
		WhichItemToShow: 146,
		WhichItemToGive: 147,
		GiveHowMuchGoldToNPC: 148,
		GiveHowMuchFoodToNPC: 149,
		NotInterestedInGold: 150,
		NotInterestedInFood: 151,
		NotInterestedInItem: 152,
		DenyJoiningParty: 153,
		WellShouldLeave: 154,
		Hello: 155,
		GoodBye: 156,
		YesWhatIsIt: 157,
		YouCantConversate: 158,
		PartyFull: 159,
		WelcomeCriticalHitTrainer: 160,
		WelcomeHealer: 161,
		WelcomeSage: 162,
		WelcomeRecharger: 163,
		WelcomeInnkeeper: 164,
		WelcomeMerchant: 165,
		WelcomeFoodDealer: 166,
		WelcomeMagician: 167,
		WelcomeRaftSeller: 168,
		WelcomeShipSeller: 169,
		WelcomeHorseSeller: 170,
		LootAfterBattle: 171,
		NoOneReceivesExp: 172,
		WhichItemToSell: 173,
		SellHowMany: 174,
		WayBackTooDangerous: 175,
		PleaseRemoveWriteProtection: 176,
		CannotCarryAllGold: 177,
		ForThisIllGiveYou: 178,
		ReallyWantToGoThere: 179,
		Flees: 180,
		AlreadyAtGotoPoint: 181,
		GotoPointSaved: 182,
		CannotBuyAnymore: 183,
		WhichItemToBuy: 184,
		BuyHowMany: 185,
		ThisWillCost: 186,
		WhichMerchantItemToExamine: 187,
		NotEnoughMoney: 188,
		StayWillCost: 189,
		PriceForRaft: 190,
		PriceForShip: 191,
		PriceForHorse: 192,
		WhichItemToEnchant: 193,
		MoveHowMuchFood: 194,
		BuyHowMuchFood: 195,
		PriceOfFood: 196,
		FoodLeftAfterDividing: 197,
		FoodDividedEqually: 198,
		WantToLeaveRestOfFood: 199,
		LeaveBoughtGoods: 200,
		CannotEnchantOrdinaryItem: 201,
		AlreadyFullyCharged: 202,
		CannotRechargeAnymore: 203,
		PriceForEnchanting: 204,
		LastTimeEnchanting: 205,
		HowManyCharges: 206,
		WhichItemToExamineSage: 207,
		ItemAlreadyIdentified: 208,
		PriceForExamining: 209,
		HowManyLP: 210,
		PriceForHealing: 211,
		WhichConditionToHeal: 212,
		CompletelyExhausted: 213,
		RestingWouldHaveNoEffect: 214,
		PriceForHealingCondition: 215,
		PriceForRemovingCurses: 216,
		TrainHowOften: 217,
		PriceForTraining: 218,
		NotEnoughTrainingPoints: 219,
		IncreasedAfterTraining: 220,
		WelcomeAttackTrainer: 221,
		WelcomeParryTrainer: 222,
		WelcomeSwimTrainer: 223,
		WelcomeFindTrapTrainer: 224,
		WelcomeDisarmTrapTrainer: 225,
		WelcomeLockPickingTrainer: 226,
		WelcomeSearchTrainer: 227,
		WelcomeReadMagicTrainer: 228,
		WelcomeUseMagicTrainer: 229,
		Empty1: 230,
		LPAreNow: 231,
		SPAreNow: 232,
		SLPAreNow: 233,
		TPAreNow: 234,
		APRAreNow: 235,
		NextLevelAt: 236,
		MaxLevelReached: 237,
		AttackWantToFight: 238,
		WhereToMoveTo: 239,
		NowhereToMoveTo: 240,
		CouldNotEscape: 241,
		NoAmmunition: 242,
		WhatToAttack: 243,
		CannotReachAnyone: 244,
		ItemIsBroken: 245,
		WelcomeBlacksmith: 246,
		WhichItemToRepair: 247,
		WontBuyBrokenStuff: 248,
		MissedTheTarget: 249,
		CannotPenetrateMagicalAura: 250,
		AttackFailed: 251,
		AttackWasDeflected: 252,
		AttackDidNoDamage: 253,
		MadeCriticalHit: 254,
		UsedLastAmmunition: 255,
		CannotMove: 256,
		TooFarAway: 257,
		UnableToAttack: 258,
		SomeoneAlreadyGoingThere: 259,
		SelectNewLeader: 260,
		Empty2: 261,
		GettingTired: 262,
		WaitHowManyHours: 263,
		MonstersAdvance: 264,
		MoreFoodWouldBeGood: 265,
		Moves: 266,
		WayWasBlocked: 267,
		LoadWhichSavegame: 268,
		HasDroppedWeapon: 269,
		Retreats: 270,
		PartyAdvances: 271,
		Options: 272,
		WhichPartyMemberAsTarget: 273,
		WhichMonsterAsTarget: 274,
		WhichInventoryAsTarget: 275,
		WhichPartyMemberRowAsTarget: 276,
		WhichMonsterRowAsTarget: 277,
		WhichItemAsTarget: 278,
		WrongWorld: 279,
		SpellFailed: 280,
		WrongClassToUseItem: 281,
		WrongPlaceToUseItem: 282,
		WrongWorldToUseItem: 283,
		DeflectedSpell: 284,
		ImmuneToSpellType: 285,
		TheSpellFailed: 286,
		IsNotDead: 287,
		CannotBeResurrected: 288,
		IsNotAsh: 289,
		IsNotDust: 290,
		AshesChangedToBody: 291,
		DustChangedToAshes: 292,
		AshesFallToDust: 293,
		BodyBurnsUp: 294,
		ItemAlreadyFullyCharged: 295,
		UseSpellOnlyInCitiesOrDungeons: 296,
		MarksPosition: 297,
		ReturnToMarkedPosition: 298,
		HasntMarkedAPosition: 299,
		CannotDamagePetrifiedMonsters: 300,
		ImmuneToSpell: 301,
		ThisIsNotAMagicalItem: 302,
		NoChargesLeft: 303,
		WhereToBlinkTo: 304,
		HasBlinked: 305,
		CannotBlink: 306,
		CannotBeDuplicated: 307,
		CannotClimbHere: 308,
		ItemIsNotBroken: 309,
		NoRoomForItem: 310,
		NoCursedItemFound: 311,
		CannotRepairUnbreakableItem: 312,
		PriceForRepair: 313,
		MapViewNotWorkingHere: 314,
		HappyWithCharacter: 315,
		YouDontKnowAnySpellsYet: 316,
		EscapedTheTrap: 317,
		CannotParry: 318,
		InnkeeperGoodSleepWish: 319,
		ItemCannotBeUsedHere: 320,
		CannotCallEagleIfNotOnFoot: 321,
		UseItOnWhom: 322,
		NotInterestedInTrinket: 323,
		NotAllowingToLookIntoBackpack: 324,
		DontWantToTakeItemsWithYou: 325,
		WaitingIsTooDangerous: 326,
		AutomapperNotWorkingHere: 327,
		GameOver: 328,
		GameOverLoadOrQuit: 329,
		NoSavegamesYetOnlyInitialGame: 330,
		DontDeleteSavedGames: 331,
		TurnOnTuneInAndDropOut: 332,
		// Ambermoon Advanced
		ReviveCat: 338,
		CannotExchangeExpWithAnimals: 339,
		CannotExchangeExpWithDead: 340,
		ThisCantBeMoved: 341,
		ElementNone: 342,
		ElementMental: 343,
		ElementSpirit: 344,
		ElementPhysical: 345,
		ElementUndead: 346,
		ElementEarth: 347,
		ElementWind: 348,
		ElementFire: 349,
		ElementWater: 350,
		ElementMultiple: 351,
		ElementLabel: 352,
		SageIdentifyScroll: 353,
		SageSLP: 354,
		MountTheWasp: 355,
		ImmuneToAttack: 356,
		ExtendedLanguage1: 357,
		ExtendedLanguage2: 358,
		ExtendedLanguage3: 359,
		ExtendedLanguage4: 360,
		ExtendedLanguage5: 361,
		ExtendedLanguage6: 362,
		ExtendedLanguage7: 363,
		ExtendedLanguage8: 364,
		Count: 365,
	})

const PlaceHolderRegex = /\{[0-9]\}/g;

export class Messages {
	static Index = Index;

	/**
	 * Messages(formatMessages, messages) or Messages(dataReader)
	 */
	constructor(formatMessagesOrDataReader, messages) {
		this.entries = [];

		if (Array.isArray(formatMessagesOrDataReader)) {
			const formatMessages = formatMessagesOrDataReader;

			if (formatMessages.length !== 26 || messages.length < 300)
				throw new AmbermoonException(ExceptionScope.Data, 'Invalid number of messages.');

			this.entries.push(''); // None
			this.entries.push(...formatMessages.slice(0, 6));
			for (let i = 0; i < 11; ++i)
				this.entries.push('');
			this.entries.push(...formatMessages.slice(6).map(Messages.FixMessage));
			this.entries.push(...messages);

			const textBlockMissingMessage = this.entries.length <= Index.TextBlockMissing ? '' : this.GetEntry(Index.TextBlockMissing);

			while (this.entries.length < Index.Count)
				this.entries.push(textBlockMissingMessage);
		} else {
			/**
			 * The position of the data reader should be at
			 * the start of the message sections just behind the
			 * insert disk messages.
			 *
			 * It will be behind all the message sections after this.
			 */
			const dataReader = formatMessagesOrDataReader;

			while (this.ReadText(dataReader))
				;

			const numTextEntries = dataReader.ReadDword() | 0;
			const textEntryLengths = [];

			for (let i = 0; i < numTextEntries; ++i)
				textEntryLengths.push(dataReader.ReadWord());

			for (let i = 0; i < numTextEntries; ++i)
				this.entries.push(dataReader.ReadString(textEntryLengths[i], AmigaExecutable.Encoding).replace(/\0+$/, ''));

			dataReader.AlignToWord();

			if (dataReader.PeekWord() === 0)
				dataReader.Position += 2;

			while (this.entries.length < Index.Count)
				this.entries.push('');
		}
	}

	get Entries() { return this.entries; }
	GetEntry(index) { return index >= this.entries.length ? '' : this.entries[index]; }

	static FixMessage(message) {
		// The new Text.amb often prepends a format
		// placeholder for the subject like "{0}'s weapon was broken!".
		// In the old loader from the executable those placeholders
		// were not added and the remake code is based on that. So if
		// we encounter a placeholder at the start of the message, we
		// remove it and adjust the following placeholder indices.
		if (message.startsWith('{0}')) {
			message = message.substring(3);

			const matches = [...message.matchAll(PlaceHolderRegex)];

			for (let i = 0; i < matches.length; ++i) {
				const match = matches[i];
				const c = match[0][1];
				message = message.substring(0, match.index + 1) + String.fromCharCode(c.charCodeAt(0) - 1) + message.substring(match.index + 2);
			}
		}

		return message;
	}

	ReadText(dataReader) {
		// The next section starts with an amount of 300 as a dword.
		// If we find it we stop reading by returning false. For safety
		// we will check if the value is lower than 0x1000 as the offsets
		// here will be over 0x8000.
		const next = dataReader.PeekDword();
		let nextWord = next >>> 8;

		if (nextWord > 0x100 && nextWord < 0x1000) {
			--dataReader.Position;
			return false;
		}

		nextWord >>>= 8;

		if (nextWord > 0x100 && nextWord < 0x1000) {
			dataReader.Position -= 2;
			return false;
		}

		nextWord >>>= 8;

		if (nextWord > 0x100 && nextWord < 0x1000) {
			dataReader.Position -= 3;
			return false;
		}

		if (dataReader.PeekWord() === 0) // offset section / split text with placeholders
		{
			dataReader.AlignToWord();

			if (dataReader.PeekWord() !== 0)
				throw new AmbermoonException(ExceptionScope.Data, 'Invalid text section.');

			while (dataReader.PeekDword() === 0)
				dataReader.Position += 4;

			if (dataReader.PeekByte() !== 0)
				dataReader.Position -= 2;

			let text = '';
			const offsets = [];
			let endOffset = dataReader.Position;
			let firstOffset = 0xffffffff; // uint.MaxValue

			while (dataReader.PeekByte() === 0 && dataReader.Position < firstOffset) {
				const offset = dataReader.ReadDword();

				if (offset !== 0) {
					if (offset < firstOffset)
						firstOffset = offset;

					offsets.push(offset);
				}
			}

			for (let i = 0; i < offsets.length; ++i) {
				dataReader.Position = offsets[i];
				text += dataReader.ReadNullTerminatedString(AmigaExecutable.Encoding);

				if (i !== offsets.length - 1) // Insert placeholder
					text += '{' + i + '}';

				if (dataReader.Position > endOffset)
					endOffset = dataReader.Position;
			}

			this.entries.push(text);
			dataReader.Position = endOffset;
		}
		else // just a text
		{
			this.entries.push(dataReader.ReadNullTerminatedString(AmigaExecutable.Encoding));

			let sectionFollows = dataReader.PeekDword() === 0;

			while (dataReader.PeekByte() === 0 || dataReader.PeekByte() === 0xff) {
				if (sectionFollows) {
					if ((dataReader.PeekDword() & 0x0000ffff) > 0xff)
						break;
				}
				else
					sectionFollows = dataReader.PeekDword() === 0;

				++dataReader.Position;
			}
		}

		return true;
	}
}

export { Index as Messages_Index };
