// Port of Ambermoon.Data.Legacy/DataNameProvider.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { enumName, getValue } from '../../runtime.js';
import { Gender, GenderFlag } from '../Ambermoon.Data.Common/Enumerations/Gender.js';
import { Song } from '../Ambermoon.Data.Common/Enumerations/Song.js';
import { CharacterElement } from '../Ambermoon.Data.Common/Enumerations/CharacterElement.js';
import { ItemElement } from '../Ambermoon.Data.Common/Enumerations/ItemElement.js';
import { SpellSchool } from '../Ambermoon.Data.Common/Enumerations/SpellSchool.js';
import { Messages } from './ExecutableData/Messages.js';
import { UITextIndex } from './ExecutableData/UITexts.js';

export class DataNameProvider {
	constructor(executableData) {
		this.executableData = executableData;
	}

	get On() { return getValue(this.executableData.UITexts.Entries, UITextIndex.On); }
	get Off() { return getValue(this.executableData.UITexts.Entries, UITextIndex.Off); }
	get DataVersionString() { return this.executableData.DataVersionString; }
	get DataInfoString() { return this.executableData.DataInfoString; }
	get CharacterInfoAgeString() { return getValue(this.executableData.UITexts.Entries, UITextIndex.AgeDisplay); }
	get CharacterInfoAPRString() { return getValue(this.executableData.UITexts.Entries, UITextIndex.APR); }
	get CharacterInfoExperiencePointsString() { return getValue(this.executableData.UITexts.Entries, UITextIndex.EPDisplay); }
	get CharacterInfoGoldAndFoodString() { return getValue(this.executableData.UITexts.Entries, UITextIndex.GoldAndFoodDisplay); }
	get CharacterInfoHitPointsString() { return getValue(this.executableData.UITexts.Entries, UITextIndex.LPDisplay); }
	get CharacterInfoSpellPointsString() { return getValue(this.executableData.UITexts.Entries, UITextIndex.SPDisplay); }
	get CharacterInfoSpellLearningPointsString() { return getValue(this.executableData.UITexts.Entries, UITextIndex.SLPDisplay); }
	get CharacterInfoTrainingPointsString() { return getValue(this.executableData.UITexts.Entries, UITextIndex.TPDisplay); }
	get CharacterInfoWeightHeaderString() { return getValue(this.executableData.UITexts.Entries, UITextIndex.Weight); }
	get CharacterInfoWeightString() { return getValue(this.executableData.UITexts.Entries, UITextIndex.WeightKilogramDisplay); }
	get CharacterInfoDamageString() { return getValue(this.executableData.UITexts.Entries, UITextIndex.LabeledValueDisplay); }
	get CharacterInfoDefenseString() { return getValue(this.executableData.UITexts.Entries, UITextIndex.LabeledValueDisplay); }
	GetConditionName(condition) { return getValue(this.executableData.ConditionNames.Entries, condition); }
	GetClassName(class_) { return getValue(this.executableData.ClassNames.Entries, class_); }
	/**
	 * Note: C# has two overloads GetGenderName(Gender) and GetGenderName(GenderFlag) which can not be
	 * distinguished at runtime (both are numbers and the values overlap). Pass the enum object as the
	 * second argument to select the overload: GetGenderName(item.Genders, GenderFlag).
	 * Without it, Gender is assumed (values > 1 can only be GenderFlag values and are treated as such).
	 */
	GetGenderName(gender, enumType = null) {
		if (enumType === GenderFlag || (enumType == null && gender > 1)) {
			switch (gender) {
				case GenderFlag.Male: return getValue(this.executableData.UITexts.Entries, UITextIndex.Male);
				case GenderFlag.Female: return getValue(this.executableData.UITexts.Entries, UITextIndex.Female);
				case GenderFlag.Both: return getValue(this.executableData.UITexts.Entries, UITextIndex.BothSexes);
				default: return null;
			}
		}

		switch (gender) {
			case Gender.Male: return getValue(this.executableData.UITexts.Entries, UITextIndex.Male);
			case Gender.Female: return getValue(this.executableData.UITexts.Entries, UITextIndex.Female);
			default: return null;
		}
	}
	GetLanguageName(language) { return getValue(this.executableData.LanguageNames.Entries, language); }
	GetRaceName(race) { return getValue(this.executableData.RaceNames.Entries, race); }
	GetSpellName(spell) { return getValue(this.executableData.SpellNames.Entries, spell); }
	GetWorldName(world) { return getValue(this.executableData.WorldNames.Entries, world); }
	GetItemTypeName(itemType) { return getValue(this.executableData.ItemTypeNames.Entries, itemType); }
	GetSongName(song) {
		switch (song) {
			case Song.Default: return '';
			case Song.Intro: return 'Intro';
			case Song.Outro: return 'Extro';
			case Song.Menu: return 'MainMenu';
			default: return getValue(this.executableData.SongNames.Entries, song);
		}
	}

	/**
	 * Note: C# has two overloads GetElementName(CharacterElement) and GetElementName(ItemElement) which can not
	 * be distinguished at runtime. Pass the enum object as the second argument to select the overload:
	 * GetElementName(element, ItemElement). Without it, CharacterElement is assumed.
	 */
	GetElementName(element, enumType = null) {
		if (enumType === ItemElement)
			return this.executableData.Messages.GetEntry(Messages.Index.ElementNone + element);

		let index = Messages.Index.ElementNone;

		if (element !== CharacterElement.None) {
			if ((element & (element - 1)) === 0) // single bit set
			{
				// Enum.GetNames returns the names ordered by value
				const names = Object.entries(CharacterElement).sort((a, b) => (a[1] >>> 0) - (b[1] >>> 0)).map(e => e[0]);
				const elementIndex = names.indexOf(enumName(CharacterElement, element));
				index = Messages.Index.ElementNone + elementIndex;
			}
			else {
				index = Messages.Index.ElementMultiple;
			}
		}

		return this.executableData.Messages.GetEntry(index);
	}

	GetExtendedLanguageName(language) {
		// As our values are always of form 2^n this will exactly return n.
		const value = language & 0xff;
		const index = value === 0 ? 32 : 31 - Math.clz32(value & -value); // BitOperations.TrailingZeroCount

		return this.executableData.Messages.GetEntry(Messages.Index.ExtendedLanguage1 + index);
	}
	get InventoryTitleString() { return getValue(this.executableData.UITexts.Entries, UITextIndex.Inventory); }
	get AttributesHeaderString() { return getValue(this.executableData.UITexts.Entries, UITextIndex.Attributes); }
	get SkillsHeaderString() { return getValue(this.executableData.UITexts.Entries, UITextIndex.Skills); }
	get LanguagesHeaderString() { return getValue(this.executableData.UITexts.Entries, UITextIndex.Languages); }
	get ConditionsHeaderString() { return getValue(this.executableData.UITexts.Entries, UITextIndex.Conditions); }
	get DataHeaderString() { return getValue(this.executableData.UITexts.Entries, UITextIndex.DataHeader); }
	GetAttributeShortName(attribute) { return getValue(this.executableData.AttributeNames.ShortNames, attribute); }
	GetSkillShortName(skill) { return getValue(this.executableData.SkillNames.ShortNames, skill); }
	GetAttributeName(attribute) { return getValue(this.executableData.AttributeNames.Entries, attribute); }
	GetSkillName(skill) { return getValue(this.executableData.SkillNames.Entries, skill); }
	get OptionsHeader() { return this.executableData.Messages.GetEntry(Messages.Index.Options); }
	get ClassesHeaderString() { return getValue(this.executableData.UITexts.Entries, UITextIndex.ClassHeader); }
	get GenderHeaderString() { return getValue(this.executableData.UITexts.Entries, UITextIndex.Sex); }
	get ChooseCharacter() { return getValue(this.executableData.UITexts.Entries, UITextIndex.ChooseCharacter); }
	get ConfirmCharacter() { return this.executableData.Messages.GetEntry(Messages.Index.HappyWithCharacter); }
	get LoadWhichSavegame() { return this.executableData.Messages.GetEntry(Messages.Index.LoadWhichSavegame); }
	get SaveWhichSavegame() { return this.executableData.Messages.GetEntry(Messages.Index.SaveWhichSavegame); }
	get ReallyLoad() { return this.executableData.Messages.GetEntry(Messages.Index.ReallyLoad); }
	get ReallyOverwriteSave() { return this.executableData.Messages.GetEntry(Messages.Index.ReallyOverwriteSave); }
	get WrongRiddlemouthSolutionText() { return this.executableData.Messages.GetEntry(Messages.Index.IsNotTheRightAnswer); }
	get NotAllowingToLookIntoBackpack() { return this.executableData.Messages.GetEntry(Messages.Index.NotAllowingToLookIntoBackpack); }
	// <summary>
	// This is used if the entered word is not part of the dictionary.
	// </summary>
	get That() { return this.executableData.Messages.GetEntry(Messages.Index.That); }
	get DropItemQuestion() { return this.executableData.Messages.GetEntry(Messages.Index.ReallyDropIt); }
	get DropGoldQuestion() { return this.executableData.Messages.GetEntry(Messages.Index.ReallyDropGold); }
	get DropFoodQuestion() { return this.executableData.Messages.GetEntry(Messages.Index.ReallyDropFood); }
	get NotEnoughSP() { return this.executableData.Messages.GetEntry(Messages.Index.NotEnoughSP); }
	get WrongArea() { return this.executableData.Messages.GetEntry(Messages.Index.WrongArea); }
	get WrongWorld() { return this.executableData.Messages.GetEntry(Messages.Index.WrongWorld); }
	get WrongClassToUseItem() { return this.executableData.Messages.GetEntry(Messages.Index.WrongClassToUseItem); }
	get WrongPlaceToUseItem() { return this.executableData.Messages.GetEntry(Messages.Index.WrongPlaceToUseItem); }
	get WrongWorldToUseItem() { return this.executableData.Messages.GetEntry(Messages.Index.WrongWorldToUseItem); }
	get WrongClassToEquipItem() { return this.executableData.Messages.GetEntry(Messages.Index.WrongClassToEquip); }
	get WrongSexToEquipItem() { return this.executableData.Messages.GetEntry(Messages.Index.WrongSexToEquip); }
	get NotEnoughFreeFingers() { return this.executableData.Messages.GetEntry(Messages.Index.NotEnoughFreeFingers); }
	get NotEnoughFreeHands() { return this.executableData.Messages.GetEntry(Messages.Index.NotEnoughFreeHands); }
	get CannotEquip() { return this.executableData.Messages.GetEntry(Messages.Index.ThisCannotBeEquipped); }
	get CannotEquipInFight() { return this.executableData.Messages.GetEntry(Messages.Index.CannotEquipInCombat); }
	get CannotUnequipInFight() { return this.executableData.Messages.GetEntry(Messages.Index.CannotUnequipInCombat); }
	get ItemHasNoEffectHere() { return this.executableData.Messages.GetEntry(Messages.Index.ItemCannotBeUsedHere); }
	get ItemCannotBeUsedHere() { return this.executableData.Messages.GetEntry(Messages.Index.CannotUseItHere); }
	get CannotUseBrokenItems() { return this.executableData.Messages.GetEntry(Messages.Index.CannotUseBrokenItems); }
	get WhichItemToUseMessage() { return this.executableData.Messages.GetEntry(Messages.Index.WhichItemToUse); }
	get WhichItemToExamineMessage() { return this.executableData.Messages.GetEntry(Messages.Index.WhichItemToExamine); }
	get WhichItemToDropMessage() { return this.executableData.Messages.GetEntry(Messages.Index.WhichItemToDrop); }
	get WhichItemToStoreMessage() { return this.executableData.Messages.GetEntry(Messages.Index.WhichItemToPutInChest); }
	get GoldName() { return getValue(this.executableData.UITexts.Entries, UITextIndex.Gold); }
	get FoodName() { return getValue(this.executableData.UITexts.Entries, UITextIndex.Food); }
	get DropHowMuchItemsMessage() { return this.executableData.Messages.GetEntry(Messages.Index.DropHowMany); }
	get DropHowMuchGoldMessage() { return this.executableData.Messages.GetEntry(Messages.Index.DropHowMuchGold); }
	get DropHowMuchFoodMessage() { return this.executableData.Messages.GetEntry(Messages.Index.DropHowMuchFood); }
	get StoreHowMuchItemsMessage() { return this.executableData.Messages.GetEntry(Messages.Index.StoreHowMany); }
	get StoreHowMuchGoldMessage() { return this.executableData.Messages.GetEntry(Messages.Index.StoreHowMuchGold); }
	get StoreHowMuchFoodMessage() { return this.executableData.Messages.GetEntry(Messages.Index.StoreHowMuchFood); }
	get GiveHowMuchGoldMessage() { return this.executableData.Messages.GetEntry(Messages.Index.GiveHowMuchGold); }
	get GiveHowMuchFoodMessage() { return this.executableData.Messages.GetEntry(Messages.Index.GiveHowMuchFood); }
	get GiveToWhom() { return this.executableData.Messages.GetEntry(Messages.Index.WhomGiveItTo); }
	get WhereToMoveIt() { return this.executableData.Messages.GetEntry(Messages.Index.WhereToMoveItTo); }
	get TakeHowManyMessage() { return this.executableData.Messages.GetEntry(Messages.Index.TakeHowMany); }
	get PersonAsleepMessage() { return this.executableData.Messages.GetEntry(Messages.Index.ThisPersonIsAsleep); }
	get WantToFightMessage() { return this.executableData.Messages.GetEntry(Messages.Index.AttackWantToFight); }
	get CompassDirections() { return getValue(this.executableData.UITexts.Entries, UITextIndex.CardinalDirections); }
	get AttackEscapeFailedMessage() { return this.executableData.Messages.GetEntry(Messages.Index.CouldNotEscape); }
	get SelectNewLeaderMessage() { return this.executableData.Messages.GetEntry(Messages.Index.SelectNewLeader); }
	get He() { return getValue(this.executableData.UITexts.Entries, UITextIndex.He); }
	get She() { return getValue(this.executableData.UITexts.Entries, UITextIndex.She); }
	get His() { return getValue(this.executableData.UITexts.Entries, UITextIndex.His); }
	get Her() { return getValue(this.executableData.UITexts.Entries, UITextIndex.Her); }
	get DontForgetItems() { return this.executableData.Messages.GetEntry(Messages.Index.DontForgetItems); }
	get LeaveConversationWithoutItems() { return this.executableData.Messages.GetEntry(Messages.Index.DontWantToTakeItemsWithYou); }
	get LootAfterBattle() { return this.executableData.Messages.GetEntry(Messages.Index.LootAfterBattle); }
	get ReceiveExp() { return this.executableData.Messages.GetEntry(Messages.Index.ReceiveExp); }
	get ChooseBattlePositions() { return this.executableData.Messages.GetEntry(Messages.Index.EnterBattlePositions); }
	get WaitHowManyHours() { return this.executableData.Messages.GetEntry(Messages.Index.WaitHowManyHours); }
	get CannotWaitBecauseOfNearbyMonsters() { return this.executableData.Messages.GetEntry(Messages.Index.WaitingIsTooDangerous); }
	get ItemWeightDisplay() { return getValue(this.executableData.UITexts.Entries, UITextIndex.WeightGramDisplay); }
	get ItemHandsDisplay() { return getValue(this.executableData.UITexts.Entries, UITextIndex.HandsDisplay); }
	get ItemFingersDisplay() { return getValue(this.executableData.UITexts.Entries, UITextIndex.FingersDisplay); }
	get ItemDamageDisplay() { return getValue(this.executableData.UITexts.Entries, UITextIndex.DamageDisplay); }
	get ItemDefenseDisplay() { return getValue(this.executableData.UITexts.Entries, UITextIndex.DefenseDisplay); }
	get ReviveMessage() { return this.executableData.Messages.GetEntry(Messages.Index.ReviveMessage); }
	get DustChangedToAshes() { return this.executableData.Messages.GetEntry(Messages.Index.DustChangedToAshes); }
	get AshesChangedToBody() { return this.executableData.Messages.GetEntry(Messages.Index.AshesChangedToBody); }
	get BodyBurnsUp() { return this.executableData.Messages.GetEntry(Messages.Index.BodyBurnsUp); }
	get AshesFallToDust() { return this.executableData.Messages.GetEntry(Messages.Index.AshesFallToDust); }
	get IsNotDead() { return this.executableData.Messages.GetEntry(Messages.Index.IsNotDead); }
	get IsNotAsh() { return this.executableData.Messages.GetEntry(Messages.Index.IsNotAsh); }
	get IsNotDust() { return this.executableData.Messages.GetEntry(Messages.Index.IsNotDust); }
	get CannotBeResurrected() { return this.executableData.Messages.GetEntry(Messages.Index.CannotBeResurrected); }
	get YouDontKnowAnySpellsYet() { return this.executableData.Messages.GetEntry(Messages.Index.YouDontKnowAnySpellsYet); }
	get CantLearnSpellsOfType() { return this.executableData.Messages.GetEntry(Messages.Index.CantLearnSpellsOfType); }
	get AlreadyKnowsSpell() { return this.executableData.Messages.GetEntry(Messages.Index.AlreadyKnowsSpell); }
	get FailedToLearnSpell() { return this.executableData.Messages.GetEntry(Messages.Index.FailedToLearnSpell); }
	get SpellFailed() { return this.executableData.Messages.GetEntry(Messages.Index.SpellFailed); }
	get ThatsNotASpellScroll() { return this.executableData.Messages.GetEntry(Messages.Index.ThatsNotASpellScroll); }
	get NotEnoughSpellLearningPoints() { return this.executableData.Messages.GetEntry(Messages.Index.NotEnoughSpellLearningPoints); }
	get ManagedToLearnSpell() { return this.executableData.Messages.GetEntry(Messages.Index.ManagedToLearnSpell); }
	get TheSpellFailed() { return this.executableData.Messages.GetEntry(Messages.Index.TheSpellFailed); }
	get UseSpellOnlyInCitiesOrDungeons() { return this.executableData.Messages.GetEntry(Messages.Index.UseSpellOnlyInCitiesOrDungeons); }
	get WhichScrollToRead() { return this.executableData.Messages.GetEntry(Messages.Index.WhichScrollToRead); }
	get RestingTooDangerous() { return this.executableData.Messages.GetEntry(Messages.Index.RestingTooDangerous); }
	get ItemIsNotBroken() { return this.executableData.Messages.GetEntry(Messages.Index.ItemIsNotBroken); }
	get ItemIsBroken() { return this.executableData.Messages.GetEntry(Messages.Index.ItemIsBroken); }
	get NoCursedItemFound() { return this.executableData.Messages.GetEntry(Messages.Index.NoCursedItemFound); }
	get ItemIsCursed() { return this.executableData.Messages.GetEntry(Messages.Index.ThisItemIsCursed); }
	get ThisIsNotAMagicalItem() { return this.executableData.Messages.GetEntry(Messages.Index.ThisIsNotAMagicalItem); }
	get ItemAlreadyFullyCharged() { return this.executableData.Messages.GetEntry(Messages.Index.ItemAlreadyFullyCharged); }
	get ItemAlreadyIdentified() { return this.executableData.Messages.GetEntry(Messages.Index.ItemAlreadyIdentified); }
	get CannotBeDuplicated() { return this.executableData.Messages.GetEntry(Messages.Index.CannotBeDuplicated); }
	get NoRoomForItem() { return this.executableData.Messages.GetEntry(Messages.Index.NoRoomForItem); }
	get MaxLPDisplay() { return getValue(this.executableData.UITexts.Entries, UITextIndex.MaxLPDisplay); }
	get MaxSPDisplay() { return getValue(this.executableData.UITexts.Entries, UITextIndex.MaxSPDisplay); }
	get MBWDisplay() { return getValue(this.executableData.UITexts.Entries, UITextIndex.MBWDisplay); }
	get MBRDisplay() { return getValue(this.executableData.UITexts.Entries, UITextIndex.MBRDisplay); }
	get AttributeHeader() { return getValue(this.executableData.UITexts.Entries, UITextIndex.Attribute); }
	get SkillHeader() { return getValue(this.executableData.UITexts.Entries, UITextIndex.Skill); }
	get FunctionHeader() { return getValue(this.executableData.SpellTypeNames.Entries, SpellSchool.Function); }
	get Cursed() { return getValue(this.executableData.UITexts.Entries, UITextIndex.Cursed); }
	get TiredMessage() { return this.executableData.Messages.GetEntry(Messages.Index.GettingTired); }
	get ExhaustedMessage() { return this.executableData.Messages.GetEntry(Messages.Index.CompletelyExhausted); }
	get SleepUntilDawn() { return this.executableData.Messages.GetEntry(Messages.Index.SleepUntilDawn); }
	get Sleep8Hours() { return this.executableData.Messages.GetEntry(Messages.Index.PartyRestsFor8Hours); }
	get RestingWouldHaveNoEffect() { return this.executableData.Messages.GetEntry(Messages.Index.RestingWouldHaveNoEffect); }
	get HasNoMoreFood() { return this.executableData.Messages.GetEntry(Messages.Index.HasNoMoreFood); }
	get RecoveredLP() { return this.executableData.Messages.GetEntry(Messages.Index.RegainsLP); }
	get RecoveredLPAndSP() { return this.executableData.Messages.GetEntry(Messages.Index.RegainsLPAndSP); }
	get HasAged() { return this.executableData.Messages.GetEntry(Messages.Index.HasAged); }
	get HasDiedOfAge() { return this.executableData.Messages.GetEntry(Messages.Index.HasDiedOfAge); }
	get LockpickBreaks() { return this.executableData.Messages.GetEntry(Messages.Index.LockpickBreaks); }
	get UnableToPickTheLock() { return this.executableData.Messages.GetEntry(Messages.Index.UnableToPickTheLock); }
	get UnlockedChestWithLockpick() { return this.executableData.Messages.GetEntry(Messages.Index.UnlockedChestWithLockpick); }
	get UnlockedDoorWithLockpick() { return this.executableData.Messages.GetEntry(Messages.Index.UnlockedDoorWithLockpick); }
	get YouNoticeATrap() { return this.executableData.Messages.GetEntry(Messages.Index.YouNoticeATrap); }
	get DisarmTrap() { return this.executableData.Messages.GetEntry(Messages.Index.DisarmTrap); }
	get FindTrap() { return this.executableData.Messages.GetEntry(Messages.Index.DiscoverTrap); }
	get DoesNotFindTrap() { return this.executableData.Messages.GetEntry(Messages.Index.DoesNotDiscoverTraps); }
	get UnableToDisarmTrap() { return this.executableData.Messages.GetEntry(Messages.Index.HearStrangeSound); }
	get EscapedTheTrap() { return this.executableData.Messages.GetEntry(Messages.Index.EscapedTheTrap); }
	get WhichItemToOpenChest() { return this.executableData.Messages.GetEntry(Messages.Index.WhichItemToOpenChest); }
	get WhichItemToOpenDoor() { return this.executableData.Messages.GetEntry(Messages.Index.WhichItemToOpenDoor); }
	get HasOpenedChest() { return this.executableData.Messages.GetEntry(Messages.Index.HasOpenedChest); }
	get HasOpenedDoor() { return this.executableData.Messages.GetEntry(Messages.Index.HasOpenedDoor); }
	get ThisItemDoesNotOpenChest() { return this.executableData.Messages.GetEntry(Messages.Index.ThisItemDoesNotOpenChest); }
	get ThisItemDoesNotOpenDoor() { return this.executableData.Messages.GetEntry(Messages.Index.ThisItemDoesNotOpenDoor); }
	get HasReachedLevel() { return this.executableData.Messages.GetEntry(Messages.Index.HasReachedLevel); }
	get MaxLevelReached() { return this.executableData.Messages.GetEntry(Messages.Index.MaxLevelReached); }
	get NextLevelAt() { return this.executableData.Messages.GetEntry(Messages.Index.NextLevelAt); }
	get LPAreNow() { return this.executableData.Messages.GetEntry(Messages.Index.LPAreNow); }
	get SPAreNow() { return this.executableData.Messages.GetEntry(Messages.Index.SPAreNow); }
	get SLPAreNow() { return this.executableData.Messages.GetEntry(Messages.Index.SLPAreNow); }
	get TPAreNow() { return this.executableData.Messages.GetEntry(Messages.Index.TPAreNow); }
	get APRAreNow() { return this.executableData.Messages.GetEntry(Messages.Index.APRAreNow); }
	get EP() { return getValue(this.executableData.UITexts.Entries, UITextIndex.EP); }
	get SpecialItemActivated() { return this.executableData.Messages.GetEntry(Messages.Index.ThisItemFulfillsSpecialPurpose); }
	get SpecialItemAlreadyInUse() { return this.executableData.Messages.GetEntry(Messages.Index.SameItemAlreadyInUse); }
	get NoChargesLeft() { return this.executableData.Messages.GetEntry(Messages.Index.NoChargesLeft); }
	get CannotCallEagleIfNotOnFoot() { return this.executableData.Messages.GetEntry(Messages.Index.CannotCallEagleIfNotOnFoot); }
	get BlowsTheFlute() { return this.executableData.Messages.GetEntry(Messages.Index.BlowsTheFlute); }
	get MountTheWasp() { return this.executableData.Messages.GetEntry(Messages.Index.MountTheWasp); }
	get CannotUseItHere() { return this.executableData.Messages.GetEntry(Messages.Index.CannotUseItHere); }
	get CannotUseMagicDiscHere() { return this.executableData.Messages.GetEntry(Messages.Index.CannotUseMagicDiscHere); }
	get CannotJumpThroughWalls() { return this.executableData.Messages.GetEntry(Messages.Index.CannotJumpThroughWalls); }
	get MarksPosition() { return this.executableData.Messages.GetEntry(Messages.Index.MarksPosition); }
	get HasntMarkedAPosition() { return this.executableData.Messages.GetEntry(Messages.Index.HasntMarkedAPosition); }
	get ReturnToMarkedPosition() { return this.executableData.Messages.GetEntry(Messages.Index.ReturnToMarkedPosition); }
	get SeeRoundDiskInFloor() { return this.executableData.Messages.GetEntry(Messages.Index.SeeRoundDiskInFloor); }
	get CannotClimbHere() { return this.executableData.Messages.GetEntry(Messages.Index.CannotClimbHere); }
	get YouLevitate() { return this.executableData.Messages.GetEntry(Messages.Index.YouLevitate); }
	get WhichNumber() { return this.executableData.Messages.GetEntry(Messages.Index.WhichNumber); }
	get AutomapperNotWorkingHere() { return this.executableData.Messages.GetEntry(Messages.Index.AutomapperNotWorkingHere); }
	get GameOverLoadOrQuit() { return this.executableData.Messages.GetEntry(Messages.Index.GameOverLoadOrQuit); }
	get GameOverMessage() { return this.executableData.Messages.GetEntry(Messages.Index.GameOver); }
	get ReallyQuit() { return this.executableData.Messages.GetEntry(Messages.Index.ReallyQuit); }
	get ItemIsImportant() { return this.executableData.Messages.GetEntry(Messages.Index.YouNeedThisItem); }
	get ChestFull() { return this.executableData.Messages.GetEntry(Messages.Index.ChestFull); }
	get ChestNowFull() { return this.executableData.Messages.GetEntry(Messages.Index.ChestNowFull); }
	get NoOneCanCarryThatMuch() { return this.executableData.Messages.GetEntry(Messages.Index.NoOneCanCarryThatMuch); }
	get CannotCarryAllGold() { return this.executableData.Messages.GetEntry(Messages.Index.CannotCarryAllGold); }
	get MapViewNotWorkingHere() { return this.executableData.Messages.GetEntry(Messages.Index.MapViewNotWorkingHere); }
	get TurnOnTuneInAndDropOut() { return this.executableData.Messages.GetEntry(Messages.Index.TurnOnTuneInAndDropOut); }
	get TextBlockMissing() { return this.executableData.Messages.GetEntry(Messages.Index.TextBlockMissing); }
	get ReviveCatMessage() { return this.executableData.Messages.GetEntry(Messages.Index.ReviveCat); }
	get CannotExchangeExpWithAnimals() { return this.executableData.Messages.GetEntry(Messages.Index.CannotExchangeExpWithAnimals); }
	get CannotExchangeExpWithDead() { return this.executableData.Messages.GetEntry(Messages.Index.CannotExchangeExpWithDead); }
	get ThisCantBeMoved() { return this.executableData.Messages.GetEntry(Messages.Index.ThisCantBeMoved); }
	get ElementLabel() { return this.executableData.Messages.GetEntry(Messages.Index.ElementLabel); }


	// region Conversations

	get DontKnowAnythingSpecialAboutIt() { return this.executableData.Messages.GetEntry(Messages.Index.DontKnowAnythingSpecialAboutIt); }
	get DenyJoiningParty() { return this.executableData.Messages.GetEntry(Messages.Index.DenyJoiningParty); }
	get PartyFull() { return this.executableData.Messages.GetEntry(Messages.Index.PartyFull); }
	get DenyLeavingPartyOnMoon() { return this.executableData.Messages.GetEntry(Messages.Index.DenyLeavingPartyOnMoon); }
	get CannotSendDeadPeopleAway() { return this.executableData.Messages.GetEntry(Messages.Index.CannotSendDeadPeopleAway); }
	get CrazyPeopleDontFollowCommands() { return this.executableData.Messages.GetEntry(Messages.Index.CrazyPeopleDontFollowCommands); }
	get PetrifiedPeopleCantGoHome() { return this.executableData.Messages.GetEntry(Messages.Index.PetrifiedPeopleCantGoHome); }
	get YouDontSpeakSameLanguage() { return this.executableData.Messages.GetEntry(Messages.Index.YouDontSpeakSameLanguage); }
	get WhoToTalkTo() { return this.executableData.Messages.GetEntry(Messages.Index.WhoToTalkTo); }
	get SelfTalkingIsMad() { return this.executableData.Messages.GetEntry(Messages.Index.SelfTalkingIsMad); }
	get UnableToTalk() { return this.executableData.Messages.GetEntry(Messages.Index.YouCantConversate); }
	get WhichItemToGive() { return this.executableData.Messages.GetEntry(Messages.Index.WhichItemToGive); }
	get WhichItemToShow() { return this.executableData.Messages.GetEntry(Messages.Index.WhichItemToShow); }
	get GiveHowMuchGoldToNPC() { return this.executableData.Messages.GetEntry(Messages.Index.GiveHowMuchGoldToNPC); }
	get GiveHowMuchFoodToNPC() { return this.executableData.Messages.GetEntry(Messages.Index.GiveHowMuchFoodToNPC); }
	get NotInterestedInItem() { return this.executableData.Messages.GetEntry(Messages.Index.NotInterestedInItem); }
	get NotInterestedInGold() { return this.executableData.Messages.GetEntry(Messages.Index.NotInterestedInGold); }
	get NotInterestedInFood() { return this.executableData.Messages.GetEntry(Messages.Index.NotInterestedInFood); }
	get MoreGoldNeeded() { return this.executableData.Messages.GetEntry(Messages.Index.HowAboutSomeMore); }
	get MoreFoodNeeded() { return this.executableData.Messages.GetEntry(Messages.Index.MoreFoodWouldBeGood); }
	get Hello() { return this.executableData.Messages.GetEntry(Messages.Index.Hello); }
	get GoodBye() { return this.executableData.Messages.GetEntry(Messages.Index.GoodBye); }
	get WellIShouldLeave() { return this.executableData.Messages.GetEntry(Messages.Index.WellShouldLeave); }

	// endregion


	// region Automap

	get LegendHeader() { return getValue(this.executableData.UITexts.Entries, UITextIndex.Legend); }
	GetAutomapName(automapType) { return getValue(this.executableData.AutomapNames.Entries, automapType); }
	get Location() { return getValue(this.executableData.UITexts.Entries, UITextIndex.Location); }
	get AlreadyAtGotoPoint() { return this.executableData.Messages.GetEntry(Messages.Index.AlreadyAtGotoPoint); }
	get GotoPointSaved() { return this.executableData.Messages.GetEntry(Messages.Index.GotoPointSaved); }
	get WayBackTooDangerous() { return this.executableData.Messages.GetEntry(Messages.Index.WayBackTooDangerous); }
	get ReallyWantToGoThere() { return this.executableData.Messages.GetEntry(Messages.Index.ReallyWantToGoThere); }
	get DarkDontFindWayBack() { return this.executableData.Messages.GetEntry(Messages.Index.DarkDontFindWayBack); }

	// endregion


	// region Battle messages

	get BattleMessageAttacksWith() { return this.executableData.Messages.GetEntry(Messages.Index.AttacksWith); }
	get BattleMessageAttacks() { return this.executableData.Messages.GetEntry(Messages.Index.Attacks); }
	get BattleMessageWasBroken() { return this.executableData.Messages.GetEntry(Messages.Index.WasBroken); }
	get BattleMessageDidPointsOfDamage() { return this.executableData.Messages.GetEntry(Messages.Index.DidPointsOfDamage); }
	get BattleMessageCastsSpell() { return this.executableData.Messages.GetEntry(Messages.Index.CastsSpell); }
	get BattleMessageCastsSpellFrom() { return this.executableData.Messages.GetEntry(Messages.Index.CastsSpellFrom); }
	get BattleMessageWhoToBlink() { return this.executableData.Messages.GetEntry(Messages.Index.WhichMemberShouldBeBlinked); }
	get BattleMessageFlees() { return this.executableData.Messages.GetEntry(Messages.Index.Flees); }
	get BattleMessageWhereToMoveTo() { return this.executableData.Messages.GetEntry(Messages.Index.WhereToMoveTo); }
	get BattleMessageNowhereToMoveTo() { return this.executableData.Messages.GetEntry(Messages.Index.NowhereToMoveTo); }
	get BattleMessageNoAmmunition() { return this.executableData.Messages.GetEntry(Messages.Index.NoAmmunition); }
	get BattleMessageWhatToAttack() { return this.executableData.Messages.GetEntry(Messages.Index.WhatToAttack); }
	get BattleMessageCannotReachAnyone() { return this.executableData.Messages.GetEntry(Messages.Index.CannotReachAnyone); }
	get BattleMessageMissedTheTarget() { return this.executableData.Messages.GetEntry(Messages.Index.MissedTheTarget); }
	get BattleMessageCannotPenetrateMagicalAura() { return this.executableData.Messages.GetEntry(Messages.Index.CannotPenetrateMagicalAura); }
	get BattleMessageAttackFailed() { return this.executableData.Messages.GetEntry(Messages.Index.AttackFailed); }
	get BattleMessageImmuneToAttack() { return this.executableData.Messages.GetEntry(Messages.Index.ImmuneToAttack); }
	get BattleMessageAttackWasParried() { return this.executableData.Messages.GetEntry(Messages.Index.AttackWasDeflected); }
	get BattleMessageAttackDidNoDamage() { return this.executableData.Messages.GetEntry(Messages.Index.AttackDidNoDamage); }
	get BattleMessageMadeCriticalHit() { return this.executableData.Messages.GetEntry(Messages.Index.MadeCriticalHit); }
	get BattleMessageUsedLastAmmunition() { return this.executableData.Messages.GetEntry(Messages.Index.UsedLastAmmunition); }
	get BattleMessageCannotMove() { return this.executableData.Messages.GetEntry(Messages.Index.CannotMove); }
	get BattleMessageTooFarAway() { return this.executableData.Messages.GetEntry(Messages.Index.TooFarAway); }
	get BattleMessageUnableToAttack() { return this.executableData.Messages.GetEntry(Messages.Index.UnableToAttack); }
	get BattleMessageSomeoneAlreadyGoingThere() { return this.executableData.Messages.GetEntry(Messages.Index.SomeoneAlreadyGoingThere); }
	get BattleMessageMonstersAdvance() { return this.executableData.Messages.GetEntry(Messages.Index.MonstersAdvance); }
	get BattleMessageMoves() { return this.executableData.Messages.GetEntry(Messages.Index.Moves); }
	get BattleMessageWayWasBlocked() { return this.executableData.Messages.GetEntry(Messages.Index.WayWasBlocked); }
	get BattleMessageHasDroppedWeapon() { return this.executableData.Messages.GetEntry(Messages.Index.HasDroppedWeapon); }
	get BattleMessageRetreats() { return this.executableData.Messages.GetEntry(Messages.Index.Retreats); }
	get BattleMessagePartyAdvances() { return this.executableData.Messages.GetEntry(Messages.Index.PartyAdvances); }
	get BattleMessageWhichPartyMemberAsTarget() { return this.executableData.Messages.GetEntry(Messages.Index.WhichPartyMemberAsTarget); }
	get BattleMessageWhichMonsterAsTarget() { return this.executableData.Messages.GetEntry(Messages.Index.WhichMonsterAsTarget); }
	get BattleMessageWhichPartyMemberRowAsTarget() { return this.executableData.Messages.GetEntry(Messages.Index.WhichPartyMemberRowAsTarget); }
	get BattleMessageWhichMonsterRowAsTarget() { return this.executableData.Messages.GetEntry(Messages.Index.WhichMonsterRowAsTarget); }
	get BattleMessageDeflectedSpell() { return this.executableData.Messages.GetEntry(Messages.Index.DeflectedSpell); }
	get BattleMessageImmuneToSpellType() { return this.executableData.Messages.GetEntry(Messages.Index.ImmuneToSpellType); }
	get BattleMessageCannotDamagePetrifiedMonsters() { return this.executableData.Messages.GetEntry(Messages.Index.CannotDamagePetrifiedMonsters); }
	get BattleMessageImmuneToSpell() { return this.executableData.Messages.GetEntry(Messages.Index.ImmuneToSpell); }
	get BattleMessageWhereToBlinkTo() { return this.executableData.Messages.GetEntry(Messages.Index.WhereToBlinkTo); }
	get BattleMessageHasBlinked() { return this.executableData.Messages.GetEntry(Messages.Index.HasBlinked); }
	get BattleMessageCannotBlink() { return this.executableData.Messages.GetEntry(Messages.Index.CannotBlink); }
	get BattleMessageCannotParry() { return this.executableData.Messages.GetEntry(Messages.Index.CannotParry); }
	get BattleMessageUseItOnWhom() { return this.executableData.Messages.GetEntry(Messages.Index.UseItOnWhom); }

	// endregion


	// region Places

	get WelcomeAttackTrainer() { return this.executableData.Messages.GetEntry(Messages.Index.WelcomeAttackTrainer); }
	get WelcomeBlacksmith() { return this.executableData.Messages.GetEntry(Messages.Index.WelcomeBlacksmith); }
	get WelcomeCriticalHitTrainer() { return this.executableData.Messages.GetEntry(Messages.Index.WelcomeCriticalHitTrainer); }
	get WelcomeDisarmTrapTrainer() { return this.executableData.Messages.GetEntry(Messages.Index.WelcomeDisarmTrapTrainer); }
	get WelcomeFindTrapTrainer() { return this.executableData.Messages.GetEntry(Messages.Index.WelcomeFindTrapTrainer); }
	get WelcomeFoodDealer() { return this.executableData.Messages.GetEntry(Messages.Index.WelcomeFoodDealer); }
	get WelcomeHealer() { return this.executableData.Messages.GetEntry(Messages.Index.WelcomeHealer); }
	get WelcomeHorseSeller() { return this.executableData.Messages.GetEntry(Messages.Index.WelcomeHorseSeller); }
	get WelcomeInnkeeper() { return this.executableData.Messages.GetEntry(Messages.Index.WelcomeInnkeeper); }
	get WelcomeLockPickingTrainer() { return this.executableData.Messages.GetEntry(Messages.Index.WelcomeLockPickingTrainer); }
	get WelcomeMagician() { return this.executableData.Messages.GetEntry(Messages.Index.WelcomeMagician); }
	get WelcomeMerchant() { return this.executableData.Messages.GetEntry(Messages.Index.WelcomeMerchant); }
	get WelcomeParryTrainer() { return this.executableData.Messages.GetEntry(Messages.Index.WelcomeParryTrainer); }
	get WelcomeRaftSeller() { return this.executableData.Messages.GetEntry(Messages.Index.WelcomeRaftSeller); }
	get WelcomeReadMagicTrainer() { return this.executableData.Messages.GetEntry(Messages.Index.WelcomeReadMagicTrainer); }
	get WelcomeEnchanter() { return this.executableData.Messages.GetEntry(Messages.Index.WelcomeRecharger); }
	get WelcomeSage() { return this.executableData.Messages.GetEntry(Messages.Index.WelcomeSage); }
	get WelcomeSearchTrainer() { return this.executableData.Messages.GetEntry(Messages.Index.WelcomeSearchTrainer); }
	get WelcomeShipSeller() { return this.executableData.Messages.GetEntry(Messages.Index.WelcomeShipSeller); }
	get WelcomeSwimTrainer() { return this.executableData.Messages.GetEntry(Messages.Index.WelcomeSwimTrainer); }
	get WelcomeUseMagicTrainer() { return this.executableData.Messages.GetEntry(Messages.Index.WelcomeUseMagicTrainer); }
	get BuyWhichItem() { return this.executableData.Messages.GetEntry(Messages.Index.WhichItemToBuy); }
	get SellWhichItem() { return this.executableData.Messages.GetEntry(Messages.Index.WhichItemToSell); }
	get ExamineWhichItem() { return this.executableData.Messages.GetEntry(Messages.Index.WhichItemToExamine); }
	get ExamineWhichItemMerchant() { return this.executableData.Messages.GetEntry(Messages.Index.WhichMerchantItemToExamine); }
	get ExamineWhichItemSage() { return this.executableData.Messages.GetEntry(Messages.Index.WhichItemToExamineSage); }
	get ThisWillCost() { return this.executableData.Messages.GetEntry(Messages.Index.ThisWillCost); }
	get ForThisIllGiveYou() { return this.executableData.Messages.GetEntry(Messages.Index.ForThisIllGiveYou); }
	get AgreeOnPrice() { return this.executableData.Messages.GetEntry(Messages.Index.AgreeOnPrice); }
	get OneFoodCosts() { return this.executableData.Messages.GetEntry(Messages.Index.AgreeOnFoodPrice); }
	get MerchantFull() { return this.executableData.Messages.GetEntry(Messages.Index.CannotBuyAnymore); }
	get BuyHowMuchItems() { return this.executableData.Messages.GetEntry(Messages.Index.BuyHowMany); }
	get SellHowMuchItems() { return this.executableData.Messages.GetEntry(Messages.Index.SellHowMany); }
	get NotEnoughMoneyToBuy() { return this.executableData.Messages.GetEntry(Messages.Index.NotEnoughMoney); }
	get NotInterestedInItemMerchant() { return this.executableData.Messages.GetEntry(Messages.Index.NotInterestedInTrinket); }
	get WontBuyBrokenStuff() { return this.executableData.Messages.GetEntry(Messages.Index.WontBuyBrokenStuff); }
	get WantToGoWithoutItemsMerchant() { return this.executableData.Messages.GetEntry(Messages.Index.LeaveBoughtGoods); }
	get TrainHowOften() { return this.executableData.Messages.GetEntry(Messages.Index.TrainHowOften); }
	get PriceForTraining() { return this.executableData.Messages.GetEntry(Messages.Index.PriceForTraining); }
	get IncreasedAfterTraining() { return this.executableData.Messages.GetEntry(Messages.Index.IncreasedAfterTraining); }
	get NotEnoughTrainingPoints() { return this.executableData.Messages.GetEntry(Messages.Index.NotEnoughTrainingPoints); }
	get NotEnoughMoney() { return this.executableData.Messages.GetEntry(Messages.Index.NotEnoughMoney); }
	get BuyHowMuchFood() { return this.executableData.Messages.GetEntry(Messages.Index.BuyHowMuchFood); }
	get FoodDividedEqually() { return this.executableData.Messages.GetEntry(Messages.Index.FoodDividedEqually); }
	get FoodLeftAfterDividing() { return this.executableData.Messages.GetEntry(Messages.Index.FoodLeftAfterDividing); }
	get WantToLeaveRestOfFood() { return this.executableData.Messages.GetEntry(Messages.Index.WantToLeaveRestOfFood); }
	get PriceOfFood() { return this.executableData.Messages.GetEntry(Messages.Index.PriceOfFood); }
	get PriceForHealing() { return this.executableData.Messages.GetEntry(Messages.Index.PriceForHealing); }
	get PriceForHealingCondition() { return this.executableData.Messages.GetEntry(Messages.Index.PriceForHealingCondition); }
	get PriceForRemovingCurses() { return this.executableData.Messages.GetEntry(Messages.Index.PriceForRemovingCurses); }
	get HowManyLP() { return this.executableData.Messages.GetEntry(Messages.Index.HowManyLP); }
	get WhichConditionToHeal() { return this.executableData.Messages.GetEntry(Messages.Index.WhichConditionToHeal); }
	get WhichInventoryAsTarget() { return this.executableData.Messages.GetEntry(Messages.Index.WhichInventoryAsTarget); }
	get WhichItemAsTarget() { return this.executableData.Messages.GetEntry(Messages.Index.WhichItemAsTarget); }
	get InnkeeperGoodSleepWish() { return this.executableData.Messages.GetEntry(Messages.Index.InnkeeperGoodSleepWish); }
	get CannotRepairUnbreakableItem() { return this.executableData.Messages.GetEntry(Messages.Index.CannotRepairUnbreakableItem); }
	get CannotEnchantOrdinaryItem() { return this.executableData.Messages.GetEntry(Messages.Index.CannotEnchantOrdinaryItem); }
	get StayWillCost() { return this.executableData.Messages.GetEntry(Messages.Index.StayWillCost); }
	get PriceForHorse() { return this.executableData.Messages.GetEntry(Messages.Index.PriceForHorse); }
	get PriceForRaft() { return this.executableData.Messages.GetEntry(Messages.Index.PriceForRaft); }
	get PriceForShip() { return this.executableData.Messages.GetEntry(Messages.Index.PriceForShip); }
	get PriceForExamining() { return this.executableData.Messages.GetEntry(Messages.Index.PriceForExamining); }
	get PriceForRepair() { return this.executableData.Messages.GetEntry(Messages.Index.PriceForRepair); }
	get WhichItemToRepair() { return this.executableData.Messages.GetEntry(Messages.Index.WhichItemToRepair); }
	get WhichItemToEnchant() { return this.executableData.Messages.GetEntry(Messages.Index.WhichItemToEnchant); }
	get HowManyCharges() { return this.executableData.Messages.GetEntry(Messages.Index.HowManyCharges); }
	get AlreadyFullyCharged() { return this.executableData.Messages.GetEntry(Messages.Index.AlreadyFullyCharged); }
	get PriceForEnchanting() { return this.executableData.Messages.GetEntry(Messages.Index.PriceForEnchanting); }
	get LastTimeEnchanting() { return this.executableData.Messages.GetEntry(Messages.Index.LastTimeEnchanting); }
	get CannotRechargeAnymore() { return this.executableData.Messages.GetEntry(Messages.Index.CannotRechargeAnymore); }
	get SageIdentifyScroll() { return this.executableData.Messages.GetEntry(Messages.Index.SageIdentifyScroll); }
	get SageSLP() { return this.executableData.Messages.GetEntry(Messages.Index.SageSLP); }

	// endregion
}
