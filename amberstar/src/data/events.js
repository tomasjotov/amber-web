// Map events (port of Amberstar.GameData.Legacy.Event).
import { EventType } from './enums.js';

export const EVENT_SIZE = 10;

/** Reads the raw 10 byte event and returns an object with named properties per event type */
export function readEvent(reader) {
	const raw = {
		type: reader.readByte(),
		b1: reader.readByte(),
		b2: reader.readByte(),
		b3: reader.readByte(),
		b4: reader.readByte(),
		save: reader.readByte(),
		w6: reader.readWord(),
		w8: reader.readWord(),
	};
	return namedEvent(raw);
}

export function namedEvent(e) {
	const ev = { type: e.type, saveEvent: e.save !== 0, raw: e };
	switch (e.type) {
		case EventType.MapExit:
		case EventType.TravelExit:
			Object.assign(ev, { x: e.b1, y: e.b2, direction: e.b3, mapIndex: e.w6 });
			break;
		case EventType.Door:
			Object.assign(ev, { lockpickReduction: e.b1, trapType: e.b2, trapDamage: e.b3, itemIndex: e.w6 });
			break;
		case EventType.ShowPictureText:
			Object.assign(ev, { picture: e.b1, textIndex: e.b2, trigger: e.b3, setWordBit: e.w6 });
			break;
		case EventType.Chest:
			Object.assign(ev, { lockpickReduction: e.b1, trapType: e.b2, trapDamage: e.b3, hidden: e.b4 !== 0, chestIndex: e.w6, textIndex: e.w8 });
			break;
		case EventType.TrapDoor:
			Object.assign(ev, { x: e.b1, y: e.b2, floor: e.b3 !== 0, textIndex: e.b4, mapIndex: e.w6, maxFallDamage: e.w8 });
			break;
		case EventType.Teleporter:
		case EventType.WindGate:
			Object.assign(ev, { x: e.b1, y: e.b2, direction: e.b3, textIndex: e.b4, mapIndex: e.w6 });
			break;
		case EventType.Spinner:
			Object.assign(ev, { direction: e.b1, textIndex: e.b4 });
			break;
		case EventType.DamageField:
			Object.assign(ev, { damage: e.b1, targetGender: e.b2, textIndex: e.b4 });
			break;
		case EventType.AntiMagic:
			Object.assign(ev, { activeSpell: e.b1, textIndex: e.b4 });
			break;
		case EventType.HPRegeneration:
		case EventType.SPRegeneration:
			Object.assign(ev, { amount: e.b1, textIndex: e.b4, fill: e.b1 === 0 });
			break;
		case EventType.ExecuteTrap:
			Object.assign(ev, { trapType: e.b1, damage: e.b3, textIndex: e.b4 });
			break;
		case EventType.RiddleMouth:
			Object.assign(ev, { x: e.b1, y: e.b2, riddleTextIndex: e.b3, solvedTextIndex: e.b4, wordIndex: e.w6, iconIndex: e.w8 });
			break;
		case EventType.AttributeChange:
			Object.assign(ev, { attribute: e.b1, add: e.b2 !== 0, random: e.b3 !== 0, textIndex: e.b4, affectAllPlayers: e.w6 === 0, amount: e.w8 });
			break;
		case EventType.ChangeTile:
			Object.assign(ev, { x: e.b1, y: e.b2, textIndex: e.b4, iconIndex: e.w6 });
			break;
		case EventType.Encounter:
			Object.assign(ev, { chance: e.b1, quest: e.b2, questTextIndex: e.b3, noQuestTextIndex: e.b4, monsterGroupIndex: e.w6 });
			break;
		case EventType.Place:
			Object.assign(ev, { openingHour: e.b1, closingHour: e.b2, placeType: e.b3, closedTextIndex: e.b4, placeIndex: e.w6, waresIndex: e.w8, alwaysOpen: e.b1 === 0 });
			break;
		case EventType.UseItem:
			Object.assign(ev, { x: e.b1, y: e.b2, textIndex: e.b4, itemIndex: e.w6, iconIndex: e.w8 });
			break;
		case EventType.DoorExit:
			Object.assign(ev, { lockpickReduction: e.b1, trapType: e.b2, trapDamage: e.b3, openedEventIndex: e.b4, itemIndex: e.w6 });
			break;
	}
	return ev;
}
