// Port of Ambermoon.Data.Common/Enumerations/ActiveSpellType.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

export const ActiveSpellType = Object.freeze({
	Light: 0,
	Protection: 1,
	Attack: 2,
	AntiMagic: 3,
	Clairvoyance: 4,
	MysticMap: 5
});

export class ActiveSpellTypeExtensions {
	static AvailableInBattle(activeSpellType) {
		switch (activeSpellType) {
			case ActiveSpellType.Protection: return true;
			case ActiveSpellType.Attack: return true;
			case ActiveSpellType.AntiMagic: return true;
			default: return false;
		}
	}
}
