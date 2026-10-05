// Port of Ambermoon.Core/UI/Window.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

export const Window = Object.freeze({
	MapView: 0,
	Inventory: 1,
	Stats: 2,
	Door: 3,
	Chest: 4,
	Merchant: 5,
	Event: 6,
	Riddlemouth: 7,
	Conversation: 8,
	Battle: 9,
	BattleLoot: 10,
	BattlePositions: 11,
	Trainer: 12,
	FoodDealer: 13,
	Healer: 14,
	Camp: 15,
	Inn: 16,
	HorseSalesman: 17,
	RaftSalesman: 18,
	ShipSalesman: 19,
	Sage: 20,
	Blacksmith: 21,
	Enchanter: 22,
	Automap: 23
});

export class WindowInfo {
	constructor() {
		this.Window = Window.MapView;
		this.WindowParameters = null; // party member index, chest event, etc
	}

	get Closable() { return this.Window !== Window.Battle && this.Window !== Window.MapView; } // TODO: add more (windows without exit button)

	clone() {
		const copy = new WindowInfo();
		copy.Window = this.Window;
		copy.WindowParameters = this.WindowParameters;
		return copy;
	}
}
