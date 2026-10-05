// Port of Ambermoon.Data.Common/PartyMember.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { firstOrDefault, hasFlag, toByte, toUShort, tryGetValue } from '../../runtime.js';
import { Util } from '../Ambermoon.Common/Util.js';
import { Character } from './Character.js';
import { CharacterType } from './Enumerations/CharacterType.js';
import { Attribute } from './Enumerations/Attribute.js';
import { Class, ClassFlag, ClassExtensions } from './Enumerations/Class.js';
import { ItemFlags } from './Enumerations/ItemFlags.js';
import { ItemSlotFlags } from './Enumerations/ItemSlotFlags.js';
import { ItemType } from './Enumerations/ItemType.js';
import { EquipmentSlot } from './Enumerations/EquipmentSlot.js';
import { Features } from './Enumerations/Features.js';

let levelShardAttributeUpgrades = null;

function getLevelShardAttributeUpgrades() {
	if (levelShardAttributeUpgrades === null) {
		levelShardAttributeUpgrades = new Map([
			[
				Class.Adventurer,
				[Attribute.Stamina, Attribute.Intelligence, Attribute.Speed, Attribute.AntiMagic, Attribute.Strength]
			],
			[
				Class.Warrior,
				[Attribute.Stamina, Attribute.Strength, Attribute.Speed, Attribute.AntiMagic, Attribute.Strength]
			],
			[
				Class.Paladin,
				[Attribute.Stamina, Attribute.Intelligence, Attribute.Speed, Attribute.AntiMagic, Attribute.Strength]
			],
			[
				Class.Thief,
				[Attribute.Stamina, Attribute.Dexterity, Attribute.Speed, Attribute.AntiMagic, Attribute.Strength]
			],
			[
				Class.Ranger,
				[Attribute.Stamina, Attribute.Intelligence, Attribute.Speed, Attribute.AntiMagic, Attribute.Strength]
			],
			[
				Class.Healer,
				[Attribute.Intelligence, Attribute.Stamina, Attribute.Speed, Attribute.AntiMagic, Attribute.Intelligence]
			],
			[
				Class.Alchemist,
				[Attribute.Intelligence, Attribute.Stamina, Attribute.Speed, Attribute.AntiMagic, Attribute.Intelligence]
			],
			[
				Class.Mystic,
				[Attribute.Intelligence, Attribute.Stamina, Attribute.Speed, Attribute.AntiMagic, Attribute.Intelligence]
			],
			[
				Class.Mage,
				[Attribute.Intelligence, Attribute.Stamina, Attribute.Speed, Attribute.AntiMagic, Attribute.Intelligence]
			],
		]);
	}
	return levelShardAttributeUpgrades;
}

export class PartyMember extends Character {
	constructor() {
		super(CharacterType.PartyMember);

		this.MarkOfReturnMapIndex = 0;
		this.MarkOfReturnX = 0;
		this.MarkOfReturnY = 0;
		this.MaxReachedLevel = 0;
		this.Texts = null;
		this.Events = [];
		this.EventList = [];
	}

	static get LevelShardAttributeUpgrades() { return getLevelShardAttributeUpgrades(); }

	get LookAtTextIndex() { return this.LookAtCharTextIndex; }
	get MaxWeight() { return 999 + this.Attributes[Attribute.Strength].TotalCurrentValue * 1000; }
	get Overweight() { return Math.trunc(this.TotalWeight / 1000) > Math.trunc(this.MaxWeight / 1000); }
	get MaxGoldToTake() {
		return Math.max(0, Math.min(0xffff - this.Gold, Math.trunc((this.MaxWeight - this.TotalWeight) / Character.GoldWeight)));
	}
	get MaxFoodToTake() {
		return Math.max(0, Math.min(0xffff - this.Food, Math.trunc((this.MaxWeight - this.TotalWeight) / Character.FoodWeight)));
	}

	CanTakeItems(itemManager, itemSlot) {
		const item = itemManager.GetItem(itemSlot.ItemIndex);

		if (this.Class === Class.Animal && !hasFlag(item.Classes, ClassFlag.Animal))
			return false;

		// First test if we can carry that much weight.
		const weight = itemSlot.Amount * item.Weight;

		if (this.TotalWeight + weight > this.MaxWeight)
			return false;

		// Then test if we have enough inventory slots to store the items.
		if (!this.Inventory.Slots.some(s => s.Empty)) {
			if (!hasFlag(item.Flags, ItemFlags.Stackable))
				return false;

			// If no slot is empty but the item is stackable we check
			// if there are slots with the same item and look if the
			// items would fit into these slots.
			let remainingCount = itemSlot.Amount;

			for (const slot of this.Inventory.Slots.filter(s => s.ItemIndex === itemSlot.ItemIndex))
				remainingCount -= (99 - slot.Amount);

			if (remainingCount > 0)
				return false;
		}

		return true;
	}

	static Load(index, partyMemberReader, dataReader, partyTextReader, fallbackDataReader = null) {
		const partyMember = new PartyMember();
		partyMember.Index = index;

		partyMemberReader.ReadPartyMember(partyMember, dataReader, partyTextReader, fallbackDataReader);

		return partyMember;
	}

	CanMove(battle = true) {
		if (battle)
			return super.CanMove(true);
		else
			return !this.Overweight;
	}

	CanFlee() {
		return super.CanFlee();
	}

	HasAmmunition(itemManager, ammunitionType) {
		const ammunitionSlot = this.Equipment.Slots.get(EquipmentSlot.LeftHand);

		if (ammunitionSlot.Empty)
			return false;

		const ammunition = itemManager.GetItem(ammunitionSlot.ItemIndex);

		return ammunition.Type === ItemType.Ammunition && ammunition.AmmunitionType === ammunitionType;
	}

	HasWorkingWeapon(itemManager) {
		const weaponSlot = this.Equipment.Slots.get(EquipmentSlot.RightHand);

		if (weaponSlot.Empty || weaponSlot.ItemIndex === 0 || hasFlag(weaponSlot.Flags, ItemSlotFlags.Broken))
			return false;

		const weapon = itemManager.GetItem(weaponSlot.ItemIndex);

		if (weapon.Type === ItemType.LongRangeWeapon)
			return this.HasAmmunition(itemManager, weapon.UsedAmmunitionType);

		return true;
	}

	HasItem(itemIndex) {
		return this.Inventory.Slots.some(s => s.ItemIndex === itemIndex);
	}

	// This will not add anything if there is no free slot.
	// It also won't not adjust weight and other things.
	// The item is simply added to the inventory.
	AddItem(itemIndex, stackable) {
		if (stackable) {
			const slotWithSameItem = firstOrDefault(this.Inventory.Slots, s => s.ItemIndex === itemIndex && s.Amount < 99);

			if (slotWithSameItem != null) {
				slotWithSameItem.Amount = toByte(Math.min(99, slotWithSameItem.Amount + 1));
				return;
			}
		}

		const emptySlot = firstOrDefault(this.Inventory.Slots, s => s.Empty);

		if (emptySlot != null) {
			emptySlot.ItemIndex = itemIndex;
			emptySlot.Amount = 1;
		}
	}

	AddGold(gold) {
		const newGold = toUShort(Math.min(0xffff, this.Gold + gold));
		this.TotalWeight += (newGold - this.Gold) * Character.GoldWeight;
		this.Gold = newGold;
	}

	AddFood(food) {
		const newFood = toUShort(Math.min(0xffff, this.Food + food));
		this.TotalWeight += (newFood - this.Food) * Character.FoodWeight;
		this.Food = newFood;
	}

	RemoveGold(gold) {
		const newGold = toUShort(Math.max(0, this.Gold - gold));
		this.TotalWeight -= (this.Gold - newGold) * Character.GoldWeight;
		this.Gold = newGold;
	}

	RemoveFood(food) {
		const newFood = toUShort(Math.max(0, this.Food - food));
		this.TotalWeight -= (this.Food - newFood) * Character.FoodWeight;
		this.Food = newFood;
	}

	SetGold(gold) {
		this.RemoveGold(this.Gold);
		this.AddGold(gold);
	}

	SetFood(food) {
		this.RemoveFood(this.Food);
		this.AddFood(food);
	}

	GetNextLevelExperiencePoints(features = null) {
		const nextLevel = this.Level + 1;
		return Math.trunc(ClassExtensions.GetExpFactor(this.Class, features) * (nextLevel * nextLevel + nextLevel) / 2);
	}

	/// <summary>
	/// Adds the given amount of experience points to the
	/// party member. Returns true if the party members
	/// gained at least one level up.
	/// </summary>
	AddExperiencePoints(amount, random, features = null) {
		this.ExperiencePoints += amount;

		if (this.Level === 50)
			return false;

		let nextLevelExperiencePoints = this.GetNextLevelExperiencePoints(features);

		if (this.ExperiencePoints < nextLevelExperiencePoints)
			return false;

		do {
			++this.Level;
			nextLevelExperiencePoints = this.GetNextLevelExperiencePoints(features);
			this.AddLevelUpEffects(random, features);
		}
		while (this.ExperiencePoints >= nextLevelExperiencePoints && this.Level < 50);

		return true;
	}

	AddLevelShardEffects(random, features) {
		if (this.Level < 50 || this.Level >= 55)
			return;

		const [found, attributeUpgrades] = tryGetValue(getLevelShardAttributeUpgrades(), this.Class);

		if (!found) {
			this.Level++;
			this.AddLevelUpEffects(random, features);
			return;
		}

		const attribute = attributeUpgrades[this.Level++ - 50];

		this.Attributes[attribute].MaxValue += 5;

		this.AddLevelUpEffects(random, features);
	}

	AddLevelUpEffects(random, features) {
		const intelligence = this.Attributes[Attribute.Intelligence].TotalCurrentValue;
		const magicClass = ClassExtensions.IsMagic(this.Class);
		let lpAdd = Math.trunc(this.HitPointsPerLevel * random(50, 100) / 100);
		const spAdd = magicClass ? Math.trunc(this.SpellPointsPerLevel * random(50, 100) / 100) + Math.trunc(intelligence / 25) : 0;
		const slpAdd = magicClass ? Math.trunc(this.SpellLearningPointsPerLevel * random(50, 100) / 100) + Math.trunc(intelligence / 25) : 0;
		const tpAdd = Math.trunc(this.TrainingPointsPerLevel * random(50, 100) / 100);

		if (features != null && hasFlag(features, Features.StaminaHPOnLevelUp))
			lpAdd += Math.trunc(this.Attributes[Attribute.Stamina].TotalCurrentValue / 25);

		// In Ambermoon Advanced the level can decrease through exp exchanging.
		// SLP and TP won't be removed (as you might have spent parts of it).
		// But to avoid exploits, the max level a character ever reached is tracked.
		// And only if the character exceeds this, it will get SLP and TP.
		const addSLPAndTP = this.MaxReachedLevel < this.Level;

		this.HitPoints.MaxValue += lpAdd;
		this.HitPoints.CurrentValue += lpAdd;
		if (magicClass && addSLPAndTP) {
			this.SpellPoints.MaxValue += spAdd;
			this.SpellPoints.CurrentValue += spAdd;
			this.SpellLearningPoints = toUShort(Math.min(0xffff, this.SpellLearningPoints + slpAdd));
		}
		if (addSLPAndTP)
			this.TrainingPoints = toUShort(Math.min(0xffff, this.TrainingPoints + tpAdd));

		if (features == null || !hasFlag(features, Features.AdvancedAPRCalculation))
			this.AttacksPerRound = toByte(this.AttacksPerRoundIncreaseLevels === 0 ? 1 : Util.Limit(this.AttacksPerRound, Math.trunc(this.Level / this.AttacksPerRoundIncreaseLevels), 255));
		else
			this.AttacksPerRound = toByte(this.AttacksPerRoundIncreaseLevels === 0 ? 1 : Util.Limit(this.AttacksPerRound, 1 + Math.trunc(this.Level / this.AttacksPerRoundIncreaseLevels), 255));

		this.MaxReachedLevel = Math.max(this.MaxReachedLevel, this.Level); // Update max reached level
	}
}
