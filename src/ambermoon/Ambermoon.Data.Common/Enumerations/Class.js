// Port of Ambermoon.Data.Common/Enumerations/Class.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { Features } from './Features.js';

export const Class = Object.freeze({
	Adventurer: 0,
	Warrior: 1,
	Paladin: 2,
	Thief: 3,
	Ranger: 4,
	Healer: 5,
	Alchemist: 6,
	Mystic: 7,
	Mage: 8,
	Animal: 9, // only Necros the cat NPC on Nera's isle (I guess a cat party member was planned)
	Monster: 10 // monsters who use none of the above classes
});

export const ClassFlag = Object.freeze({
	None: 0,
	Adventurer: 1,
	Warrior: 2,
	Paladin: 4,
	Thief: 8,
	Ranger: 0x10,
	Healer: 0x20,
	Alchemist: 0x40,
	Mystic: 0x80,
	Mage: 0x100,
	Animal: 0x200,
	Monster: 0x400,
	Unknown1: 0x800,
	Unknown2: 0x1000,
	Unknown3: 0x2000,
	Unknown4: 0x4000,
	AllWithUnused: 0x7fff,
	AllWithoutAnimal: 0x1ff,
	All: 0x3ff
});

export class ClassExtensions {
	static Contains(classes, _class) {
		const flag = 1 << _class;
		return (classes & flag) === flag;
	}

	// TODO: This is stored in AM2_CPU (slothsoft said at 0x451F0, I guess in v1.05 german)
	static GetExpFactor(_class, features = null) {
		const adjusted = features != null && (features & Features.AdjustedEPFactors) === Features.AdjustedEPFactors;

		switch (_class) {
			case Class.Adventurer: return adjusted ? 85 : 75;
			case Class.Warrior: return adjusted ? 110 : 150;
			case Class.Paladin: return adjusted ? 115 : 180;
			case Class.Thief: return 100;
			case Class.Ranger: return adjusted ? 105 : 125;
			case Class.Healer: return 90;
			case Class.Alchemist: return 90;
			case Class.Mystic: return 90;
			case Class.Mage: return 95;
			default: return 32767;
		}
	}

	static IsMagic(_class) {
		return _class !== Class.Warrior && _class !== Class.Thief && _class < Class.Animal;
	}
}
