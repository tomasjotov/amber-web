// Port of Ambermoon.Core/PlayerMovementAbility.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// PlayerMovementAbility.cs - Enumeration of possible movement abilities

import { TravelType } from '../Ambermoon.Data.Common/Enumerations/TravelType.js';

export const PlayerMovementAbility = Object.freeze({
	NoMovement: 0,
	Walking: 1,
	Swimming: 2,
	FlyingDisc: 3,
	Rafting: 4, // raft
	Sailing: 5, // boat, sand ship
	WitchBroom: 6,
	Eagle: 7, // also used for wasp
	Flying: 8
});

export class PlayerMovementAbilityExtensions {
	static ToPlayerMovementAbility(travelType) {
		switch (travelType) {
			case TravelType.Walk: return PlayerMovementAbility.Walking;
			case TravelType.Horse: return PlayerMovementAbility.Walking;
			case TravelType.SandLizard: return PlayerMovementAbility.Walking;
			case TravelType.Swim: return PlayerMovementAbility.Swimming;
			case TravelType.MagicalDisc: return PlayerMovementAbility.FlyingDisc;
			case TravelType.SandShip: return PlayerMovementAbility.Sailing;
			case TravelType.Raft: return PlayerMovementAbility.Rafting;
			case TravelType.Ship: return PlayerMovementAbility.Sailing;
			case TravelType.WitchBroom: return PlayerMovementAbility.WitchBroom;
			case TravelType.Fly: return PlayerMovementAbility.Flying;
			case TravelType.Eagle: return PlayerMovementAbility.Eagle;
			case TravelType.Wasp: return PlayerMovementAbility.Eagle;
			default: return PlayerMovementAbility.NoMovement;
		}
	}
}

export const ToPlayerMovementAbility = PlayerMovementAbilityExtensions.ToPlayerMovementAbility;
