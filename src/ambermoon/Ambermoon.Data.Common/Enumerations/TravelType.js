// Port of Ambermoon.Data.Common/Enumerations/TravelType.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { enumName } from '../../../runtime.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { Song } from './Song.js';

export const TravelType = Object.freeze({
	Walk: 0,
	Horse: 1,
	Raft: 2,
	Ship: 3,
	MagicalDisc: 4,
	Eagle: 5,
	Fly: 6, // never seen it but looks like flying with a cape like superman :D
	Swim: 7,
	WitchBroom: 8,
	SandLizard: 9,
	SandShip: 10,
	Wasp: 11 // Ambermoon Advanced only
});

export class TravelTypeExtensions {
	static UsesMapObject(travelType) {
		switch (travelType) {
			case TravelType.Horse:
			case TravelType.Raft:
			case TravelType.Ship:
			case TravelType.SandLizard:
			case TravelType.SandShip:
				return true;
			default:
				return false;
		}
	}

	static CanStandOn(travelType) {
		switch (travelType) {
			case TravelType.Raft:
			case TravelType.Ship:
			case TravelType.SandShip:
				return true;
			default:
				return false;
		}
	}

	static CanCampOn(travelType) {
		switch (travelType) {
			case TravelType.Walk:
			case TravelType.Horse:
			case TravelType.Raft:
			case TravelType.Ship:
			case TravelType.SandLizard:
			case TravelType.SandShip:
			case TravelType.MagicalDisc:
			case TravelType.Fly:
				return true;
			default:
				return false;
		}
	}

	static IsStoppable(travelType) {
		switch (travelType) {
			case TravelType.Walk:
			case TravelType.Swim:
				return false;
			default:
				return true;
		}
	}

	static BlockedByWater(travelType) {
		switch (travelType) {
			case TravelType.Horse:
			case TravelType.SandLizard:
				return true;
			default:
				return false;
		}
	}

	static BlockedByTeleport(travelType) {
		switch (travelType) {
			case TravelType.Horse:
			case TravelType.Raft:
			case TravelType.Ship:
			case TravelType.MagicalDisc:
			case TravelType.SandLizard:
			case TravelType.SandShip:
				return true;
			default:
				return false;
		}
	}

	static IgnoreEvents(travelType) {
		switch (travelType) {
			case TravelType.Eagle:
			case TravelType.WitchBroom:
			case TravelType.Fly:
			case TravelType.Wasp:
				return true;
			default:
				return false;
		}
	}

	static IgnoreAutoPoison(travelType) {
		switch (travelType) {
			case TravelType.Raft:
			case TravelType.Ship:
			case TravelType.Eagle:
			case TravelType.WitchBroom:
			case TravelType.Fly:
			case TravelType.SandShip:
			case TravelType.Wasp:
				return true;
			default:
				return false;
		}
	}

	static TravelSong(travelType) {
		switch (travelType) {
			case TravelType.Walk: return Song.Default;
			case TravelType.Horse: return Song.HorseIsNoDisgrace;
			case TravelType.Raft: return Song.RiversideTravellingBlues;
			case TravelType.Ship: return Song.Ship;
			case TravelType.MagicalDisc: return Song.CompactDisc;
			case TravelType.Eagle: return Song.WholeLottaDove;
			case TravelType.Fly: return Song.ChickenSoup;
			case TravelType.Swim: return Song.Default;
			case TravelType.WitchBroom: return Song.BurnBabyBurn;
			case TravelType.SandLizard: return Song.MellowCamelFunk;
			case TravelType.SandShip: return Song.PsychedelicDuneGroove;
			case TravelType.Wasp: return Song.WholeLottaDove;
			default: return Song.Default;
		}
	}

	static AsStationaryImageIndex(travelType) {
		switch (travelType) {
			case TravelType.Horse: return 0;
			case TravelType.Raft: return 1;
			case TravelType.Ship: return 2;
			case TravelType.SandLizard: return 3;
			case TravelType.SandShip: return 4;
			default:
				throw new AmbermoonException(ExceptionScope.Application, `Stationary image for travel type ${enumName(TravelType, travelType)} does not exist.`);
		}
	}
}
