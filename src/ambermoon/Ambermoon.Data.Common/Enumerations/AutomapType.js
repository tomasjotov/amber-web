// Port of Ambermoon.Data.Common/Enumerations/AutomapType.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { AutomapGraphic } from './AutomapGraphic.js';

export const AutomapType = Object.freeze({
	None: 0, // not in legend / no text
	Wall: 1, // not in legend / no text
	Riddlemouth: 2,
	Teleporter: 3,
	Spinner: 4,
	Trap: 5,
	Trapdoor: 6,
	Special: 7,
	Monster: 8,
	Door: 9, // closed
	DoorOpen: 10, // not in legend / no text
	Merchant: 11,
	Tavern: 12,
	Chest: 13, // closed
	Exit: 14,
	ChestOpened: 15, // not in legend / no text
	Pile: 16,
	Person: 17,
	GotoPoint: 18,
	Invalid: 65535 // this seems to be used by map objects that are characters and the type should be determined by character type
});

export class AutomapExtensions {
	/** returns AutomapGraphic or null */
	static ToGraphic(automapType) {
		switch (automapType) {
			case AutomapType.Riddlemouth: return AutomapGraphic.Riddlemouth;
			case AutomapType.Teleporter: return AutomapGraphic.Teleport;
			case AutomapType.Spinner: return AutomapGraphic.Spinner;
			case AutomapType.Trap: return AutomapGraphic.Trap;
			case AutomapType.Trapdoor: return AutomapGraphic.TrapDoor;
			case AutomapType.Special: return AutomapGraphic.Special;
			case AutomapType.Monster: return AutomapGraphic.Monster;
			case AutomapType.Door: return AutomapGraphic.DoorClosed;
			case AutomapType.DoorOpen: return AutomapGraphic.DoorOpen;
			case AutomapType.Merchant: return AutomapGraphic.Merchant;
			case AutomapType.Tavern: return AutomapGraphic.Inn;
			case AutomapType.Chest: return AutomapGraphic.ChestClosed;
			case AutomapType.Exit: return AutomapGraphic.Exit;
			case AutomapType.ChestOpened: return AutomapGraphic.ChestOpen;
			case AutomapType.Pile: return AutomapGraphic.Pile;
			case AutomapType.Person: return AutomapGraphic.Person;
			case AutomapType.GotoPoint: return AutomapGraphic.GotoPoint;
			default: return null;
		}
	}

	static GetEventAutomapType(map, eventIndex) {
		return eventIndex >= map.EventAutomapTypes.length ? AutomapType.None : map.EventAutomapTypes[eventIndex];
	}
}
