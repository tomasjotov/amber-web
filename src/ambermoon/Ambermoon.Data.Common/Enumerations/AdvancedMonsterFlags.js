// Port of Ambermoon.Data.Common/Enumerations/AdvancedMonsterFlags.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

export const AdvancedMonsterFlags = Object.freeze({
	None: 0,
	ImmuneToNonElementalAttacks: 1,
	ImmuneToSpiritAttacks: 2,
	ImmuneToUndeadAttacks: 8,
	ImmuneToEarthAttacks: 0x10,
	ImmuneToWindAttacks: 0x20,
	ImmuneToFireAttacks: 0x40,
	ImmuneToWaterAttacks: 0x80
});
