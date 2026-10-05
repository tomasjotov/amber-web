// Port of Ambermoon.Core/MapExtensions.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// MapExtensions.cs - Extensions for maps

import { Position } from '../Ambermoon.Common/Position.js';
import { MapType } from '../Ambermoon.Data.Common/Enumerations/MapType.js';
import { EventType } from '../Ambermoon.Data.Common/Event.js';
import { EventExtensions } from './EventExtensions.js';

export const EventTrigger = Object.freeze({
	Always: 0,
	Move: 1,
	Hand: 2,
	Eye: 3,
	Mouth: 4,
	Levitating: 5,
	/** If a specific item is needed for triggering use Item0 + ItemIndex */
	Item0: 6
});

function getMapEventId(map, x, y) {
	return map.Type === MapType.Map2D ? map.Tiles[x][y].MapEventId : map.Blocks[x][y].MapEventId;
}

export class MapExtensions {
	static LastMapEventIndexMap = null;
	static LastMapEventIndex = null;
	static LastMapEventPosition = null;

	static Reset() {
		MapExtensions.LastMapEventIndexMap = null;
		MapExtensions.LastMapEventIndex = null;
		MapExtensions.LastMapEventPosition = null;
	}

	static PositionToTileIndex(map, x, y) {
		return x + y * map.Width;
	}

	static GetEvent(map, x, y, savegame) {
		const mapEventId = getMapEventId(map, x, y);
		const hasMapEvent = mapEventId !== 0 && savegame.IsEventActive(map.Index, mapEventId - 1);

		if (!hasMapEvent)
			return null;

		return map.EventList[mapEventId - 1];
	}

	/** Returns uint? (number or null) */
	static GetEventIndex(map, x, y, savegame) {
		const mapEventId = getMapEventId(map, x, y);
		const hasMapEvent = mapEventId !== 0 && savegame.IsEventActive(map.Index, mapEventId - 1);

		return hasMapEvent ? mapEventId : null;
	}

	/**
	 * Two C# overloads:
	 * - TriggerEvents(map, game, trigger, x, y, savegame) -> bool (exactly 6 arguments)
	 * - TriggerEvents(map, game, trigger, x, y, savegame, out bool hasMapEvent, Func<Event, bool>? filter = null)
	 *   -> [bool, hasMapEvent]. In JS this variant is selected by passing a 7th argument (the filter, may be null/undefined).
	 */
	static TriggerEvents(map, game, trigger, x, y, savegame, filter) {
		if (arguments.length <= 6)
			return MapExtensions.TriggerEventsWithInfo(map, game, trigger, x, y, savegame)[0];
		return MapExtensions.TriggerEventsWithInfo(map, game, trigger, x, y, savegame, filter);
	}

	/** Port helper for the out-variant of TriggerEvents: returns [bool, hasMapEvent]. */
	static TriggerEventsWithInfo(map, game, trigger, x, y, savegame, filter = null) {
		const mapEventId = getMapEventId(map, x, y);

		const hasMapEvent = mapEventId !== 0 && savegame.IsEventActive(map.Index, mapEventId - 1);

		if (!hasMapEvent)
			return [false, hasMapEvent];

		const event = map.EventList[mapEventId - 1];

		if (filter != null && !filter(event))
			return [false, hasMapEvent];

		if (trigger === EventTrigger.Move && MapExtensions.LastMapEventIndexMap === map.Index && MapExtensions.LastMapEventIndex === mapEventId) {
			let ev = event;
			let hasRandomness = false;

			while (ev?.Type === EventType.Condition ||
				ev?.Type === EventType.Dice100Roll) {
				if (ev.Type === EventType.Dice100Roll)
					hasRandomness = true;

				ev = ev.Next;
			}

			let hadText = false;

			if (ev != null && ev.Type === EventType.MapText) {
				if (ev.Next == null)
					return [false, hasMapEvent];

				ev = ev.Next;
				hadText = true;
			}

			// avoid triggering the same event twice, but only for some events
			if (ev != null &&
				ev.Type !== EventType.Teleport &&
				ev.Type !== EventType.Chest &&
				ev.Type !== EventType.Door &&
				ev.Type !== EventType.EnterPlace &&
				ev.Type !== EventType.ChangeBuffs &&
				ev.Type !== EventType.Riddlemouth &&
				ev.Type !== EventType.Reward &&
				ev.Type !== EventType.Action &&
				ev.Type !== EventType.ChangeTile &&
				((Position.op_Equality(MapExtensions.LastMapEventPosition, new Position(x, y)) && map.Type === MapType.Map3D) || ev.Type !== EventType.Trap) &&
				(ev.Type !== EventType.StartBattle || (!hasRandomness && !hadText))) {
				return [false, hasMapEvent];
			}

			if (ev?.Type === EventType.StartBattle && hasRandomness) {
				// Avoid triggering random encounters while moving on the same tile.
				if (Position.op_Equality(MapExtensions.LastMapEventPosition, new Position(x, y)) && map.Type === MapType.Map3D)
					return [false, hasMapEvent];
			}
		}

		MapExtensions.LastMapEventIndexMap = map.Index;
		MapExtensions.LastMapEventIndex = mapEventId;
		MapExtensions.LastMapEventPosition = new Position(x, y);

		if (!EventExtensions.TriggerEventChain(map, game, trigger, x, y, event)) {
			MapExtensions.LastMapEventIndexMap = null;
			MapExtensions.LastMapEventIndex = null;
			MapExtensions.LastMapEventPosition = null;
			return [false, hasMapEvent];
		}

		return [true, hasMapEvent];
	}

	static ClearLastEvent(map) {
		MapExtensions.LastMapEventIndexMap = map.Index;
		MapExtensions.LastMapEventIndex = 0;
		MapExtensions.LastMapEventPosition = null;
	}
}
