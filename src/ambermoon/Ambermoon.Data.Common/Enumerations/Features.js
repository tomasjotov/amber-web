// Port of Ambermoon.Data.Common/Enumerations/Features.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

export const Features = Object.freeze({
	None: 0,
	Elements: 1,
	AdjustedSpellDamage: 2,
	SpellDamageBonus: 4,
	ReducedFoodWeight: 8,
	AdjustedSPAndSLP: 0x10,
	AdjustedEPFactors: 0x20,
	SageScrollIdentification: 0x40,
	AdvancedSpells: 0x80,
	WaspTransport: 0x100,
	AdvancedCombatBackgrounds: 0x200,
	ClairvoyanceGrantsSearchSkill: 0x400,
	ExtendedCurseEffects: 0x800,
	AdvancedMonsterFlags: 0x1000, // TODO: Later add to AmbermoonAdvanced
	ItemElements: 0x2000, // TODO: Later add to AmbermoonAdvanced
	ExtendedLanguages: 0x4000, // TODO: Later add to AmbermoonAdvanced
	AdvancedAPRCalculation: 0x8000,
	AdjustedWeaponDamage: 0x10000,
	StaminaHPOnLevelUp: 0x20000,
	LevelShards: 0x40000, // TODO: Later add to AmbermoonAdvanced
	Mod: 0x80000000,
	AmbermoonAdvanced: 0x38fff
});
