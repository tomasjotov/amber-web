// Port of Ambermoon.Data.Common/Enumerations/BattleFlags.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

export const BattleFlags = Object.freeze({
	None: 0,
	Undead: 1, // can be killed by holy spells
	Demon: 2,
	Boss: 4, // immune to Fear, Paralyze, Petrify, DissolveVictim, Madness, Drugs, Irritation and won't flee
	Animal: 8,
	EarthSpellDamageBonus: 0x10,
	WindSpellDamageBonus: 0x20,
	FireSpellDamageBonus: 0x40
});
