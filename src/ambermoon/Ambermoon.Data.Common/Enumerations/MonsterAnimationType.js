// Port of Ambermoon.Data.Common/Enumerations/MonsterAnimationType.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

export const MonsterAnimationType = Object.freeze({
	Move: 0, // also used for random idle animation
	CloseRangedAttack: 1,
	LongRangedAttack: 2,
	Cast: 3,
	Hurt: 4,
	Die: 5,
	Start: 6, // played at start of battle
	Unknown3: 7
});
