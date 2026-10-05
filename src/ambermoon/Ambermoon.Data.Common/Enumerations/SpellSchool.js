// Port of Ambermoon.Data.Common/Enumerations/SpellSchool.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { Class } from './Class.js';

export const SpellSchool = Object.freeze({
	Healing: 0,
	Alchemistic: 1,
	Mystic: 2,
	Destruction: 3,
	Unknown1: 4,
	Unknown2: 5,
	Function: 6 // lockpicking, call eagle, play elf harp etc
});

export const SpellTypeMastery = Object.freeze({
	None: 0,
	Healing: 1,
	Alchemistic: 2,
	Mystic: 4,
	Destruction: 8,
	Unused1: 0x10,
	Unused2: 0x20,
	Function: 0x40,
	All: 0x7f,
	Mastered: 0x80
});

export const SpellTypeImmunity = Object.freeze({
	None: 0,
	Healing: 1,
	Alchemistic: 2,
	Mystic: 4,
	Destruction: 8,
	Unused1: 0x10,
	Unused2: 0x20,
	Function: 0x40,
	Unused: 0x80
});

export class SpellSchoolExtensions {
	/** returns SpellSchool or null */
	static ToSpellSchool(_class) {
		switch (_class) {
			case Class.Adventurer: return SpellSchool.Alchemistic;
			case Class.Paladin: return SpellSchool.Healing;
			case Class.Ranger: return SpellSchool.Mystic;
			case Class.Healer: return SpellSchool.Healing;
			case Class.Alchemist: return SpellSchool.Alchemistic;
			case Class.Mystic: return SpellSchool.Mystic;
			case Class.Mage: return SpellSchool.Destruction;
			default: return null;
		}
	}
}
