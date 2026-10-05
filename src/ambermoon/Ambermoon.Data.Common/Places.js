// Port of Ambermoon.Data.Common/Places.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { enumName, newArray2D } from '../../runtime.js';
import { PlaceType } from './Enumerations/PlaceType.js';
import { Condition } from './Enumerations/Condition.js';
import { Skill } from './Enumerations/Skill.js';
import { TravelType } from './Enumerations/TravelType.js';
import { Merchant } from './Merchant.js';

// IPlace is a pure interface (implemented by Merchant and NonItemPlace) and therefore not ported.

export class NonItemPlace {
	constructor(place) {
		/** C# ItemSlot[6, 2] -> jagged array Slots[column][row] */
		this.Slots = newArray2D(6, 2);
		this.AvailableGold = 0;

		this.place = place;
	}

	ResetItem(slot, item) { } // eslint-disable-line no-unused-vars
	GetSlot(slot) { return null; } // eslint-disable-line no-unused-vars
	GetWord(offset) { return this.place.GetWord(offset); }

	get AllowsItemDrop() { return false; }
	set AllowsItemDrop(value) { } // eslint-disable-line no-unused-vars

	get Name() { return this.place.Name; }
	get PlaceType() { throw new Error('abstract'); }

	ToString() { return this.toString(); }
}

export class Place {
	constructor() {
		this.Data = null; // 32 bytes
		this.Name = null;
	}

	GetWord(offset) { return (this.Data[offset] << 8) | this.Data[offset + 1]; }
}

class Trainer extends NonItemPlace {
	constructor(place) {
		super(place);
	}

	get PlaceType() { return PlaceType.Trainer; }
	get Skill() { return this.GetWord(0); }
	get Cost() { return this.GetWord(2); }

	toString() {
		return `${enumName(Skill, this.Skill)} Trainer, Cost: ${this.Cost}`;
	}
}

class Healer extends NonItemPlace {
	constructor(place) {
		super(place);
	}

	get PlaceType() { return PlaceType.Healer; }

	get HealLamedCost() { return this.GetWord(0); }
	get HealPoisonedCost() { return this.GetWord(2); }
	get HealPetrifiedCost() { return this.GetWord(4); }
	get HealDiseasedCost() { return this.GetWord(6); }
	get HealAgingCost() { return this.GetWord(8); }
	get HealDeadCorpseCost() { return this.GetWord(10); }
	get HealDeadAshesCost() { return this.GetWord(12); }
	get HealDeadDustCost() { return this.GetWord(14); }
	get HealCrazyCost() { return this.GetWord(16); }
	get HealBlindCost() { return this.GetWord(18); }
	get HealDruggedCost() { return this.GetWord(20); }
	get HealLPCost() { return this.GetWord(22); }
	get RemoveCurseCost() { return this.GetWord(24); }

	GetCostForHealingCondition(condition) {
		switch (condition) {
			case Condition.Crazy: return this.HealCrazyCost;
			case Condition.Blind: return this.HealBlindCost;
			case Condition.Drugged: return this.HealDruggedCost;
			case Condition.Lamed: return this.HealLamedCost;
			case Condition.Poisoned: return this.HealPoisonedCost;
			case Condition.Petrified: return this.HealPetrifiedCost;
			case Condition.Diseased: return this.HealDiseasedCost;
			case Condition.Aging: return this.HealAgingCost;
			case Condition.DeadCorpse: return this.HealDeadCorpseCost;
			case Condition.DeadAshes: return this.HealDeadAshesCost;
			case Condition.DeadDust: return this.HealDeadDustCost;
			default: return 0;
		}
	}

	toString() {
		let text = `Healer, Heal LP: ${this.HealLPCost}, RemoveCurses: ${this.RemoveCurseCost}`;

		const AddCondition = condition => {
			text += `, Heal${enumName(Condition, condition)}: ${this.GetCostForHealingCondition(condition)}`;
		};

		AddCondition(Condition.Crazy);
		AddCondition(Condition.Blind);
		AddCondition(Condition.Drugged);
		AddCondition(Condition.Lamed);
		AddCondition(Condition.Poisoned);
		AddCondition(Condition.Petrified);
		AddCondition(Condition.Diseased);
		AddCondition(Condition.Aging);
		AddCondition(Condition.DeadCorpse);
		AddCondition(Condition.DeadAshes);
		AddCondition(Condition.DeadDust);

		return text;
	}
}

class Sage extends NonItemPlace {
	constructor(place) {
		super(place);
	}

	get PlaceType() { return PlaceType.Sage; }
	get IdentificationCost() { return this.GetWord(0); }
	get TellingSLPCost() { return this.GetWord(2); }

	toString() {
		if (this.TellingSLPCost === 0)
			return `Sage, Identification Cost: ${this.IdentificationCost}`;

		return `Sage, Identification Cost: ${this.IdentificationCost}, Tell SLP Cost: ${this.TellingSLPCost}`;
	}
}

class Enchanter extends NonItemPlace {
	constructor(place) {
		super(place);
	}

	get PlaceType() { return PlaceType.Enchanter; }
	get Cost() { return this.GetWord(0); }

	toString() {
		return `Enchanter, Cost: ${this.Cost}`;
	}
}

class Inn extends NonItemPlace {
	constructor(place) {
		super(place);
	}

	get PlaceType() { return PlaceType.Inn; }
	get Cost() { return this.GetWord(0); }
	get BedroomX() { return this.GetWord(2); }
	get BedroomY() { return this.GetWord(4); }
	get BedroomMapIndex() { return this.GetWord(6); }

	get Healing() { return this.GetWord(8); } // in percent

	toString() {
		return `Inn, Cost: ${this.Cost}, Healing: ${this.Healing}%, Spawn: Map ${this.BedroomMapIndex} at ${this.BedroomX},${this.BedroomY}`;
	}
}

class FoodDealer extends NonItemPlace {
	constructor(place) {
		super(place);

		this.AvailableFood = 0;
	}

	get PlaceType() { return PlaceType.FoodDealer; }
	get Cost() { return this.GetWord(0); }

	toString() {
		return `FoodDealer, Cost: ${this.Cost}`;
	}
}

class Library extends Merchant {
	get PlaceType() { return PlaceType.Library; }
}

class Salesman extends NonItemPlace {
	constructor(place) {
		super(place);
	}

	get Cost() { return this.GetWord(0); }
	get SpawnX() { return this.GetWord(2); }
	get SpawnY() { return this.GetWord(4); }
	get SpawnMapIndex() { return this.GetWord(6); }
	get TravelType() { return this.GetWord(8); }

	toString() {
		return `${enumName(TravelType, this.TravelType)}Dealer, Cost: ${this.Cost}, Spawn: Map ${this.SpawnMapIndex} at ${this.SpawnX},${this.SpawnY}`;
	}
}

class RaftSalesman extends Salesman {
	constructor(place) {
		super(place);
	}

	get PlaceType() { return PlaceType.RaftDealer; }
	get TravelType() { return TravelType.Raft; }
}

class ShipSalesman extends Salesman {
	constructor(place) {
		super(place);
	}

	get PlaceType() { return PlaceType.ShipDealer; }
	get TravelType() { return TravelType.Ship; }
}

class HorseSalesman extends Salesman {
	constructor(place) {
		super(place);
	}

	get PlaceType() { return PlaceType.HorseDealer; }
	get TravelType() { return TravelType.Horse; }
}

class Blacksmith extends NonItemPlace {
	constructor(place) {
		super(place);
	}

	get PlaceType() { return PlaceType.Blacksmith; }
	get Cost() { return this.GetWord(0); }

	toString() {
		return `Blacksmith, Cost: ${this.Cost}`;
	}
}

export class Places {
	static Trainer = Trainer;
	static Healer = Healer;
	static Sage = Sage;
	static Enchanter = Enchanter;
	static Inn = Inn;
	static FoodDealer = FoodDealer;
	static Library = Library;
	static Salesman = Salesman;
	static RaftSalesman = RaftSalesman;
	static ShipSalesman = ShipSalesman;
	static HorseSalesman = HorseSalesman;
	static Blacksmith = Blacksmith;

	constructor() {
		this.Entries = [];
	}

	static Load(placesReader, dataReader) {
		const places = new Places();

		placesReader.ReadPlaces(places, dataReader);

		return places;
	}
}

export {
	Trainer as Places_Trainer,
	Healer as Places_Healer,
	Sage as Places_Sage,
	Enchanter as Places_Enchanter,
	Inn as Places_Inn,
	FoodDealer as Places_FoodDealer,
	Library as Places_Library,
	Salesman as Places_Salesman,
	RaftSalesman as Places_RaftSalesman,
	ShipSalesman as Places_ShipSalesman,
	HorseSalesman as Places_HorseSalesman,
	Blacksmith as Places_Blacksmith
};
