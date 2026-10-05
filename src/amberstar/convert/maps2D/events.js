// Amberstar map events -> Ambermoon events (see AMBERSTAR.md, converter 2).
//
// Amberstar (amberstar/src/data/events.js, amberstar/src/game/events.js, FileSpecs/Events.md):
//   Every map has 254 event slots of 10 bytes. The hotspot map stores per tile the 1-based event id.
//   Events are single actions (no chains). Byte 5 is a per map "save index": if it is non-zero the
//   event disables itself after it was executed (doors/chests: after they were unlocked).
//   Triggers: Move (enter tile), Eye, Ear, Mouth. Most events only react on Move.
//
// Ambermoon (Ambermoon.Data.Common/Event.js, Ambermoon.Core/EventExtensions.js, MapExtensions.js):
//   Map.Events holds all events (Event.Index = 1-based position), events are chained with Next,
//   Map.EventList holds the chain heads. Tiles/blocks store MapEventId = 1-based EventList index.
//   A chain head is active as long as the savegame event bit (map, EventList index) is not set.
//   Only 64 event bits per map exist (Savegame.GetEventBit throws above 63), so EventList is limited
//   to 64 entries. Branch indices (UnlockFailedEventIndex, ContinueIfFalseWithMapEventIndex) are
//   0-based indices into Map.Events.
//
// Conversion:
//   - Only events referenced by the hotspot map (or by a DoorExit event) are converted. The EventList
//     is compacted in Amberstar event id order. The mapping is stored on the Ambermoon map:
//     `AmberstarEventSlots` (Map amberstar event id -> 0-based EventList index) and
//     `AmberstarSaveIndexSlots` (Map amberstar save index -> 0-based EventList index), so the
//     savegame converter can transfer Amberstar event bits.
//   - Amberstar "save" -> an ActionEvent SetEventBit for the own EventList entry at the end of the chain
//     (or right before an event which ends the chain like teleports and battles).
//   - Move-only effects get a trigger guard as chain head: either a PopupTextEvent with trigger Move
//     (when there is a text anyway) or a ConditionEvent "MultiCursor(hand/eye/mouth) not used".
//     Teleport, battle, place, trap, spinner and riddlemouth events check the trigger themselves.
//   - Texts are kept in their original order, so text indices stay the same.

import {
	EventType, TeleportEvent, DoorEvent, ChestEvent, PopupTextEvent, SpinnerEvent, TrapEvent, ChangeBuffsEvent,
	RiddlemouthEvent, RewardEvent, ChangeTileEvent, StartBattleEvent, EnterPlaceEvent, ConditionEvent, ActionEvent,
	Dice100RollEvent, EventTrigger as PopupTrigger,
} from '../../../ambermoon/Ambermoon.Data.Common/Event.js';
import { PlaceType } from '../../../ambermoon/Ambermoon.Data.Common/Enumerations/PlaceType.js';
import { GenderFlag } from '../../../ambermoon/Ambermoon.Data.Common/Enumerations/Gender.js';
import { TravelType } from '../../../ambermoon/Ambermoon.Data.Common/Enumerations/TravelType.js';
import { AutomapType } from '../../../ambermoon/Ambermoon.Data.Common/Enumerations/AutomapType.js';
import { CharacterDirection } from '../../../ambermoon/Ambermoon.Common/Direction.js';
import { Map as AmbermoonMap } from '../../../ambermoon/Ambermoon.Data.Common/Map.js';
import { AmberstarAltarEvent, AmberstarAltarEventType } from '../../extensions/altarEvent.js';
import { convertMapTexts, convertMessage } from './texts.js';

/** Amberstar event types (amberstar/src/data/enums.js EventType) */
export const AmberstarEventType = Object.freeze({
	None: 0, MapExit: 1, Door: 2, ShowPictureText: 3, Chest: 4, TrapDoor: 5, Teleporter: 6, WindGate: 7,
	Spinner: 8, DamageField: 9, AntiMagic: 10, HPRegeneration: 11, SPRegeneration: 12, ExecuteTrap: 13,
	RiddleMouth: 14, AttributeChange: 15, ChangeTile: 16, Encounter: 17, Place: 18, UseItem: 19, DoorExit: 20,
	TravelExit: 21, Altar: 22, Outro: 23,
});

/** Max number of EventList entries (savegame event bits per map). */
export const MaxEventListEntries = 64;

/** Amberstar map texts have at most 26 entries, 26 (and above) means "no text". */
const NoAmberstarText = 26;

/** Amberstar message index of the altar text ("... only when 13 ... are at the same place"). */
const AltarMessageIndex = 201;

/**
 * Amberstar quest bit q (savegame quest bits, used by Encounter events) <-> Ambermoon global variable
 * AmberstarQuestBitGlobalVariableOffset + q. The savegame/conversation converter must use the same mapping.
 */
export const AmberstarQuestBitGlobalVariableOffset = 0;

/**
 * Amberstar place type (event byte 3) -> Ambermoon PlaceType. The Places entries (characters converter)
 * must provide the data in the format of the Ambermoon place class for this type.
 *  1-8 guilds (join + level up)   -> Trainer (closest Ambermoon place: training for gold)
 *  9 merchant -> Merchant, 10 food -> FoodDealer, 12 horse -> HorseDealer, 13 healer -> Healer,
 *  14 sage -> Sage, 15 raft -> RaftDealer, 16 boat -> ShipDealer, 17 inn -> Inn, 18 library -> Library
 *  11 is unused/invalid in Amberstar -> null (no event)
 */
export function ambermoonPlaceType(amberstarPlaceType) {
	if (amberstarPlaceType >= 1 && amberstarPlaceType <= 8)
		return PlaceType.Trainer;
	switch (amberstarPlaceType) {
		case 9: return PlaceType.Merchant;
		case 10: return PlaceType.FoodDealer;
		case 12: return PlaceType.HorseDealer;
		case 13: return PlaceType.Healer;
		case 14: return PlaceType.Sage;
		case 15: return PlaceType.RaftDealer;
		case 16: return PlaceType.ShipDealer;
		case 17: return PlaceType.Inn;
		case 18: return PlaceType.Library;
		default: return null;
	}
}

/**
 * Amberstar trap types (doors, chests, ExecuteTrap) -> [TrapAilment, TrapTarget].
 * 1 damage (all), 2 poison needle (active), 3 poison gas (all), 4 blinding flash (all),
 * 5 paralyzing gas (all), 6 stone gaze (active), 7 disease (active)
 */
function trapInfo(trapType) {
	const A = TrapEvent.TrapAilment, T = TrapEvent.TrapTarget;
	switch (trapType) {
		case 1: return [A.None, T.All];
		case 2: return [A.Poisoned, T.ActivePlayer];
		case 3: return [A.Poisoned, T.All];
		case 4: return [A.Blind, T.All];
		case 5: return [A.Paralyzed, T.All];
		case 6: return [A.Petrified, T.ActivePlayer];
		case 7: return [A.Diseased, T.ActivePlayer];
		default: return null;
	}
}

/**
 * Amberstar damage is random in 1..max. The Ambermoon trap damage is BaseDamage + rand(0, BaseDamage/2 - 1)
 * (EventHandling.TriggerTrap). A base damage of 40% of the maximum gives the same average damage.
 */
function trapBaseDamage(maxDamage) {
	return maxDamage <= 0 ? 0 : Math.max(1, Math.round(maxDamage * 0.4));
}

// ---- door indices (savegame door bits, max 128) ----

const doorTables = new WeakMap();

/**
 * Global Ambermoon door index (savegame DoorUnlockStates bit, 0..127) for the Door/DoorExit event
 * `eventId` (1-based) of Amberstar map `mapIndex`. Assigned over all Amberstar maps in map/event order,
 * so 2D and 3D maps (and the savegame converter) get the same indices.
 * Returns null if the event is no door.
 */
export function getDoorIndex(ctx, mapIndex, eventId) {
	let table = doorTables.get(ctx);
	if (!table) {
		table = new globalThis.Map();
		let next = 0;
		const keys = ctx.source.keys('MAP_DATA.AMB').slice().sort((a, b) => a - b);
		for (const key of keys) {
			const map = ctx.source.loadMap(key);
			const used = usedEventIds(map);
			for (const id of used) {
				const ev = map.events[id - 1];
				if (ev && (ev.type === AmberstarEventType.Door || ev.type === AmberstarEventType.DoorExit))
					table.set(`${key}:${id}`, next++);
			}
		}
		if (next > 128)
			console.warn(`Amberstar: ${next} doors but the Ambermoon savegame only supports 128.`);
		doorTables.set(ctx, table);
	}
	return table.get(`${mapIndex}:${eventId}`) ?? null;
}

/** Sorted list of the 1-based event ids which are used on the map (hotspots + DoorExit targets). */
export function usedEventIds(amberstarMap) {
	const used = new Set();
	for (const tile of amberstarMap.tiles) {
		if (tile.event !== 0 && amberstarMap.events[tile.event - 1])
			used.add(tile.event);
	}
	for (const id of [...used]) {
		const ev = amberstarMap.events[id - 1];
		if (ev.type === AmberstarEventType.DoorExit && ev.openedEventIndex > 0 && amberstarMap.events[ev.openedEventIndex - 1])
			used.add(ev.openedEventIndex);
	}
	return [...used].sort((a, b) => a - b);
}

function automapTypeOf(ev) {
	switch (ev?.type) {
		case AmberstarEventType.MapExit:
		case AmberstarEventType.TravelExit:
			return AutomapType.Exit;
		case AmberstarEventType.Door:
		case AmberstarEventType.DoorExit:
			return AutomapType.Door;
		case AmberstarEventType.Chest:
			return AutomapType.Chest;
		case AmberstarEventType.Teleporter:
		case AmberstarEventType.WindGate:
			return AutomapType.Teleporter;
		case AmberstarEventType.RiddleMouth:
			return AutomapType.Riddlemouth;
		case AmberstarEventType.Spinner:
			return AutomapType.Spinner;
		case AmberstarEventType.TrapDoor:
			return AutomapType.Trapdoor;
		case AmberstarEventType.ExecuteTrap:
		case AmberstarEventType.DamageField:
			return AutomapType.Trap;
		case AmberstarEventType.Place:
			return ev.placeType === 17 ? AutomapType.Tavern : AutomapType.Merchant;
		default:
			return AutomapType.None;
	}
}

class EventBuilder {
	constructor(ctx, amberstarMap, map, options) {
		this.ctx = ctx;
		this.amberstarMap = amberstarMap;
		this.map = map;
		this.is3D = map.Blocks != null || amberstarMap.is3D;
		this.textCount = map.Texts.length;
		this.slots = new globalThis.Map(); // amberstar event id -> EventList index
		this.chains = new globalThis.Map(); // amberstar event id -> chain head (or null)
		this.building = new Set();
		this.convertTileIndex = options.convertTileIndex
			?? (typeof map.AmberstarTileIndexToBlockValue === 'function' ? i => map.AmberstarTileIndexToBlockValue(i) : null)
			?? (i => i);
	}

	add(event, type) {
		event.Type = type;
		event.Index = this.map.Events.length + 1;
		event.Next = null;
		this.map.Events.push(event);
		return event;
	}

	/** Links the given events (nulls are skipped) and returns the head. */
	link(...events) {
		const list = events.flat().filter(e => e != null);
		for (let i = 0; i < list.length - 1; i++)
			list[i].Next = list[i + 1];
		return list[0] ?? null;
	}

	validText(index) { return index >= 0 && index < NoAmberstarText && index < this.textCount; }
	/** Optional text of most events: 0 means no text (amberstar/src/game/events.js withText) */
	optionalText(index) { return index !== 0 && this.validText(index) ? index : null; }

	// ---- event factories ----

	popup(textIndex, trigger, imageIndex = 0xff) {
		const e = new PopupTextEvent();
		e.TextIndex = textIndex;
		e.EventImageIndex = imageIndex;
		e.PopupTrigger = trigger;
		e.TriggerIfBlind = true; // Amberstar shows texts regardless of blindness
		e.Unknown = new Uint8Array(4);
		return this.add(e, EventType.MapText);
	}

	/** Condition: none of hand, eye or mouth was used (= moved onto the tile or chained). */
	guard() {
		return this.condition(ConditionEvent.ConditionType.MultiCursor, 0x7, 0);
	}

	condition(type, objectIndex, value, count = 0, falseEventIndex = 0xffff) {
		const e = new ConditionEvent();
		e.TypeOfCondition = type;
		e.ObjectIndex = objectIndex;
		e.Value = value;
		e.Count = count;
		e.DisallowedAilments = 0;
		e.ContinueIfFalseWithMapEventIndex = falseEventIndex;
		return this.add(e, EventType.Condition);
	}

	action(type, objectIndex, value, count = 0) {
		const e = new ActionEvent();
		e.TypeOfAction = type;
		e.ObjectIndex = objectIndex;
		e.Value = value;
		e.Count = count;
		e.Unknown1 = new Uint8Array(2);
		e.Unknown2 = new Uint8Array(2);
		return this.add(e, EventType.Action);
	}

	/** Deactivates the EventList entry `slot` of this map. */
	setEventBit(slot) {
		return this.action(ActionEvent.ActionType.SetEventBit, (this.map.Index - 1) * 64 + slot, 1);
	}

	teleport(mapIndex, x, y, direction, transition, newTravelType = null) {
		const e = new TeleportEvent();
		e.MapIndex = mapIndex;
		e.X = x;
		e.Y = y;
		e.Direction = direction > 4 ? CharacterDirection.Keep : direction;
		e.NewTravelType = newTravelType;
		e.Transition = transition;
		e.Unknown2 = new Uint8Array([0x00, 0xff]);
		return this.add(e, EventType.Teleport);
	}

	trap(ailment, target, baseDamage, genders = GenderFlag.Both) {
		const e = new TrapEvent();
		e.Ailment = ailment;
		e.Target = target;
		e.BaseDamage = Math.min(255, baseDamage);
		e.AffectedGenders = genders;
		e.Unused = new Uint8Array(5);
		return this.add(e, EventType.Trap);
	}

	/** Trap event for Amberstar trap type + max damage (null if no trap) */
	amberstarTrap(trapType, maxDamage) {
		const info = trapInfo(trapType);
		if (!info)
			return null;
		const [ailment, target] = info;
		return this.trap(ailment, target, ailment === TrapEvent.TrapAilment.None ? trapBaseDamage(maxDamage) : 0);
	}

	reward(type, typeValue, operation, target, value, random = false) {
		const e = new RewardEvent();
		e.TypeOfReward = type;
		e.RewardTypeValue = typeValue;
		e.Operation = operation;
		e.Target = target;
		e.Value = value;
		e.Random = random;
		e.Unused = 0;
		return this.add(e, EventType.Reward);
	}

	changeTile(x, y, tileIndex) {
		const e = new ChangeTileEvent();
		e.X = x;
		e.Y = y;
		e.FrontTileIndex = tileIndex;
		e.MapIndex = 0; // same map
		e.Unknown = new Uint8Array(3);
		return this.add(e, EventType.ChangeTile);
	}

	// ---- chains ----

	/** Converts the Amberstar event `id` into an event chain and returns its head (null if unsupported). */
	chain(id) {
		if (this.chains.has(id))
			return this.chains.get(id);
		if (this.building.has(id))
			return null; // DoorExit cycle (should not happen)
		this.building.add(id);
		const ev = this.amberstarMap.events[id - 1];
		const head = ev ? this.build(id, ev) : null;
		this.building.delete(id);
		this.chains.set(id, head);
		return head;
	}

	/**
	 * Builds a chain: [text], effects..., with the save action inserted before the first terminal
	 * effect (teleport, battle) or appended. A guard is prepended for move-only chains whose head
	 * does not check the trigger.
	 */
	compose(id, ev, { text = null, textTrigger = PopupTrigger.Move, effects = [], moveOnly = true }) {
		const sequence = [];
		if (text != null)
			sequence.push(this.popup(text, textTrigger));
		const terminalIndex = effects.findIndex(e => e instanceof TeleportEvent || e instanceof StartBattleEvent);
		const slot = this.slots.get(id);
		const save = ev.saveEvent && slot != null ? this.setEventBit(slot) : null;
		if (save && terminalIndex !== -1) {
			sequence.push(...effects.slice(0, terminalIndex), save, ...effects.slice(terminalIndex));
		} else {
			sequence.push(...effects);
			if (save)
				sequence.push(save);
		}
		if (moveOnly && sequence.length !== 0 && !this.checksTrigger(sequence[0]))
			sequence.unshift(this.guard());
		return this.link(sequence);
	}

	/** True if the event (as chain head) does not execute for eye/hand/mouth triggers by itself. */
	checksTrigger(event) {
		if (event instanceof PopupTextEvent)
			return event.PopupTrigger === PopupTrigger.Move;
		return event instanceof TeleportEvent || event instanceof StartBattleEvent || event instanceof EnterPlaceEvent ||
			event instanceof TrapEvent || event instanceof SpinnerEvent || event instanceof RiddlemouthEvent ||
			(event instanceof ConditionEvent && event.TypeOfCondition !== ConditionEvent.ConditionType.GlobalVariable);
	}

	build(id, ev) {
		const T = AmberstarEventType;
		const Transition = TeleportEvent.TransitionType;
		const map = this.map;

		switch (ev.type) {
			case T.MapExit:
				// Fades in Amberstar (teleport with fade = true)
				return this.compose(id, ev, { effects: [this.teleport(ev.mapIndex, ev.x, ev.y, ev.direction, Transition.MapChange)] });
			case T.TravelExit:
				// Like MapExit but the travel type is reset to walking.
				return this.compose(id, ev, { effects: [this.teleport(ev.mapIndex, ev.x, ev.y, ev.direction, Transition.MapChange, TravelType.Walk)] });
			case T.Teleporter:
			case T.WindGate: {
				// Amberstar only fades if the map changes.
				const transition = ev.type === T.WindGate ? Transition.WindGate
					: ev.mapIndex === this.amberstarMap.index || ev.mapIndex === 0 ? Transition.Teleporter : Transition.MapChange;
				return this.compose(id, ev, {
					text: this.optionalText(ev.textIndex),
					effects: [this.teleport(ev.mapIndex, ev.x, ev.y, ev.direction, transition)],
				});
			}
			case T.TrapDoor: {
				if (ev.floor) {
					// Fall down: optional text, random fall damage to all, then teleport.
					const damage = ev.maxFallDamage > 0 ? this.trap(TrapEvent.TrapAilment.None, TrapEvent.TrapTarget.All, trapBaseDamage(ev.maxFallDamage)) : null;
					return this.compose(id, ev, {
						text: this.optionalText(ev.textIndex),
						effects: [damage, this.teleport(ev.mapIndex, ev.x, ev.y, CharacterDirection.Keep, Transition.Falling)].filter(Boolean),
					});
				}
				// Hole in the ceiling: only usable while levitating.
				const levitating = this.condition(ConditionEvent.ConditionType.Levitating, 0, 1);
				const text = this.optionalText(ev.textIndex);
				const rest = this.compose(id, ev, {
					text: null,
					effects: [text != null ? this.popup(text, PopupTrigger.Always) : null,
						this.teleport(ev.mapIndex, ev.x, ev.y, CharacterDirection.Keep, Transition.Climbing)].filter(Boolean),
					moveOnly: false,
				});
				return this.link(levitating, rest);
			}
			case T.Door:
			case T.DoorExit: {
				const door = new DoorEvent();
				door.LockpickingChanceReduction = ev.lockpickReduction;
				door.DoorIndex = getDoorIndex(this.ctx, this.amberstarMap.index, id) ?? 0;
				door.TextIndex = 0xff;
				door.UnlockTextIndex = 0xff;
				door.Unused = 0;
				door.KeyIndex = ev.itemIndex;
				door.UnlockFailedEventIndex = 0xffff;
				this.add(door, EventType.Door);
				const trap = this.amberstarTrap(ev.trapType, ev.trapDamage);
				if (trap)
					door.UnlockFailedEventIndex = trap.Index - 1;
				// DoorExit: the referenced event is executed once the door is open (also later when the door
				// is already unlocked, as Ambermoon continues with Next for unlocked doors).
				if (ev.type === T.DoorExit && ev.openedEventIndex > 0)
					door.Next = this.chain(ev.openedEventIndex);
				// Note: Ambermoon deactivates a door event without follow-up events itself when it is unlocked
				// (Amberstar saves the door event when it is unlocked), so no save action is needed.
				return door;
			}
			case T.Chest: {
				const chest = new ChestEvent();
				chest.LockpickingChanceReduction = ev.lockpickReduction;
				// Amberstar shows the chest text if the index is < 26 (Amberstar.Game ChestScreen)
				chest.TextIndex = this.validText(ev.textIndex) ? ev.textIndex : 0xff;
				chest.ChestIndex = Math.max(0, ev.chestIndex - 1); // RealChestIndex = Amberstar chest index
				chest.Flags = ChestEvent.ChestFlags.None; // a real chest (items can be put back)
				chest.KeyIndex = 0; // Amberstar chests can only be opened by lockpicking (skill or lockpick item)
				chest.UnlockFailedEventIndex = 0xffff;
				chest.SearchSkillCheck = ev.hidden;
				this.add(chest, EventType.Chest);
				const trap = this.amberstarTrap(ev.trapType, ev.trapDamage);
				if (trap)
					chest.UnlockFailedEventIndex = trap.Index - 1;
				// Note: Amberstar chest events are always active (the unlock state is the save bit). Ambermoon keeps
				// the unlock state in the chest unlock bits, so no save action is used.
				return chest;
			}
			case T.ShowPictureText: {
				// Trigger: 0 = eye, 1 = move, >= 2 both (see Amberstar.Game ShowPictureTextEvent: the trigger
				// value + 1 is a mask of eye (1) and move (2)).
				const trigger = ev.trigger === 0 ? PopupTrigger.EyeCursor : ev.trigger === 1 ? PopupTrigger.Move : PopupTrigger.Always;
				if (!this.validText(ev.textIndex))
					return null;
				// Event pictures: Amberstar picture p (PICS80.AMB picture p) -> Ambermoon event picture p - 1.
				const popup = this.popup(ev.textIndex, trigger, ev.picture > 0 ? ev.picture - 1 : 0xff);
				// The party learns the word (dictionary index = Amberstar text fragment index).
				const learn = ev.setWordBit ? this.action(ActionEvent.ActionType.AddKeyword, ev.setWordBit, 1) : null;
				const slot = this.slots.get(id);
				const save = ev.saveEvent && slot != null ? this.setEventBit(slot) : null;
				return this.link(popup, learn, save);
			}
			case T.Spinner:
				return this.compose(id, ev, {
					text: this.optionalText(ev.textIndex),
					effects: [this.spinner(ev.direction)],
				});
			case T.DamageField: {
				const genders = ev.targetGender === 0 ? GenderFlag.Male : ev.targetGender === 1 ? GenderFlag.Female : GenderFlag.Both;
				return this.compose(id, ev, {
					text: this.optionalText(ev.textIndex),
					effects: [this.trap(TrapEvent.TrapAilment.None, TrapEvent.TrapTarget.All, trapBaseDamage(ev.damage), genders)],
				});
			}
			case T.AntiMagic: {
				const e = new ChangeBuffsEvent();
				// Amberstar: 0 all, 1 light, 2 magic armor, 3 magic weapon, 4 anti magic, 5 clairvoyance, 6 invisibility
				// Ambermoon active spell slots have the same order (slot 5 is mystic map instead of invisibility).
				e.AffectedBuff = ev.activeSpell === 0 ? null : ev.activeSpell - 1;
				e.Add = false;
				e.Unused1 = 0;
				e.Value = 0;
				e.Duration = 0;
				e.Unused2 = new Uint8Array(2);
				this.add(e, EventType.ChangeBuffs);
				return this.compose(id, ev, { text: this.optionalText(ev.textIndex), effects: [e] });
			}
			case T.HPRegeneration:
			case T.SPRegeneration: {
				const type = ev.type === T.HPRegeneration ? RewardEvent.RewardType.HitPoints : RewardEvent.RewardType.SpellPoints;
				const op = ev.fill ? RewardEvent.RewardOperation.Fill : RewardEvent.RewardOperation.Increase;
				// Shown "in the style of a message" for every trigger in Amberstar.
				return this.compose(id, ev, {
					text: this.optionalText(ev.textIndex),
					textTrigger: PopupTrigger.Always,
					effects: [this.reward(type, 0, op, RewardEvent.RewardTarget.All, ev.amount)],
					moveOnly: false,
				});
			}
			case T.ExecuteTrap: {
				const trap = this.amberstarTrap(ev.trapType, ev.damage);
				if (!trap)
					return null;
				return this.compose(id, ev, { text: this.optionalText(ev.textIndex), effects: [trap] });
			}
			case T.RiddleMouth: {
				const e = new RiddlemouthEvent();
				e.RiddleTextIndex = ev.riddleTextIndex;
				e.SolutionTextIndex = ev.solvedTextIndex;
				// dictionary index = Amberstar text fragment index of the answer
				e.CorrectAnswerDictionaryIndex1 = ev.wordIndex;
				e.CorrectAnswerDictionaryIndex2 = ev.wordIndex;
				e.Unused = new Uint8Array(3);
				this.add(e, EventType.Riddlemouth);
				const change = ev.iconIndex !== 0 && ev.x !== 0 && ev.y !== 0
					? this.changeTile(ev.x, ev.y, this.convertTileIndex(ev.iconIndex)) : null;
				const slot = this.slots.get(id);
				const save = ev.saveEvent && slot != null ? this.setEventBit(slot) : null;
				return this.link(e, change, save);
			}
			case T.AttributeChange: {
				if (ev.attribute < 1 || ev.attribute > 9)
					return null;
				const reward = this.reward(RewardEvent.RewardType.Attribute, ev.attribute - 1,
					ev.add ? RewardEvent.RewardOperation.Increase : RewardEvent.RewardOperation.Decrease,
					ev.affectAllPlayers ? RewardEvent.RewardTarget.All : RewardEvent.RewardTarget.ActivePlayer,
					ev.amount, ev.random);
				return this.compose(id, ev, { text: this.optionalText(ev.textIndex), effects: [reward] });
			}
			case T.ChangeTile:
				return this.compose(id, ev, {
					text: this.optionalText(ev.textIndex),
					effects: [this.changeTile(ev.x, ev.y, this.convertTileIndex(ev.iconIndex))],
				});
			case T.Encounter: {
				const effects = [];
				let questCondition = null;
				if (ev.quest !== 0)
					questCondition = this.condition(ConditionEvent.ConditionType.GlobalVariable, AmberstarQuestBitGlobalVariableOffset + ev.quest, 1);
				if (ev.chance < 100) {
					const dice = new Dice100RollEvent();
					dice.Chance = ev.chance;
					dice.ContinueIfFalseWithMapEventIndex = 0xffff;
					dice.Unused = new Uint8Array(6);
					effects.push(this.add(dice, EventType.Dice100Roll));
				}
				const textIndex = this.optionalText(ev.quest !== 0 ? ev.questTextIndex : ev.noQuestTextIndex);
				if (textIndex != null)
					effects.push(this.popup(textIndex, PopupTrigger.Always));
				const battle = new StartBattleEvent();
				battle.MonsterGroupIndex = ev.monsterGroupIndex;
				battle.Unknown1 = new Uint8Array(6);
				battle.Unknown2 = new Uint8Array(2);
				effects.push(this.add(battle, EventType.StartBattle));
				const chain = this.compose(id, ev, { effects, moveOnly: false });
				const head = this.link(questCondition, chain);
				// trigger guard (the dice/condition do not check the trigger)
				return head instanceof StartBattleEvent ? head : this.link(this.guard(), head);
			}
			case T.Place: {
				const placeType = ambermoonPlaceType(ev.placeType);
				if (placeType == null)
					return null;
				const e = new EnterPlaceEvent();
				e.OpeningHour = ev.alwaysOpen ? 0 : ev.openingHour;
				e.ClosingHour = ev.alwaysOpen ? 0 : ev.closingHour; // 0 = 24
				e.PlaceIndex = ev.placeIndex; // 1-based like Places.Entries[PlaceIndex - 1]
				e.ClosedTextIndex = this.validText(ev.closedTextIndex) ? ev.closedTextIndex : 0xff;
				e.PlaceType = placeType;
				e.UsePlaceTextIndex = 0xff;
				// Ambermoon: GetMerchant(1 + MerchantDataIndex), merchants keep the Amberstar wares index
				e.MerchantDataIndex = Math.max(0, ev.waresIndex - 1);
				this.add(e, EventType.EnterPlace);
				return e;
			}
			case T.UseItem: {
				// Using item `itemIndex` while standing on (or next to) the tile changes the tile at x,y.
				const condition = this.condition(ConditionEvent.ConditionType.UseItem, ev.itemIndex, 1);
				const text = this.optionalText(ev.textIndex);
				const rest = this.compose(id, ev, {
					text: null,
					effects: [text != null ? this.popup(text, PopupTrigger.Always) : null,
						this.changeTile(ev.x, ev.y, this.convertTileIndex(ev.iconIndex))].filter(Boolean),
					moveOnly: false,
				});
				return this.link(condition, rest);
			}
			case T.Altar: {
				// Amberstar checks for the 13 pieces of the Amberstar and lets the party assemble it (puzzle).
				// Engine extension: the custom AmberstarAltarEvent (src/amberstar/extensions/altar.js) shows the
				// altar message (appended map text) without the pieces, otherwise the altar puzzle.
				const message = convertMessage(this.ctx, AltarMessageIndex);
				if (message == null)
					return null;
				map.Texts.push(message);
				this.textCount = map.Texts.length;
				const altar = new AmberstarAltarEvent();
				altar.TextIndex = map.Texts.length - 1;
				return this.add(altar, AmberstarAltarEventType);
			}
			case T.Outro: {
				const e = this.teleport(0, 0, 0, CharacterDirection.Keep, Transition.Outro);
				return e;
			}
			default:
				return null;
		}
	}

	spinner(direction) {
		const e = new SpinnerEvent();
		e.Direction = direction > 4 ? CharacterDirection.Random : direction;
		e.Unused = new Uint8Array(8);
		return this.add(e, EventType.Spinner);
	}
}

/**
 * Converts the events of an Amberstar map (amberstar/src/data/maps.js loadMap) into the Ambermoon map:
 * sets Map.Events, Map.EventList, Map.EventAutomapTypes and MapEventId on Tiles/InitialTiles (2D) or
 * Blocks/InitialBlocks (3D, if they exist). If Map.Texts is empty the map texts are converted as well.
 * Text popup characters (CharacterReference flag TextPopup) get an event chain so they also react to the eye.
 *
 * options.convertTileIndex(amberstarTileIndex) -> value for ChangeTileEvent.FrontTileIndex (3D maps:
 * Ambermoon wall (100 + wall) / object index for an Amberstar lab tile). Alternatively the 3D converter
 * can set the function `ambermoonMap.AmberstarTileIndexToBlockValue`. Default: identity (2D tiles).
 */
export function convertEvents(ctx, amberstarMap, ambermoonMap, options = {}) {
	const map = ambermoonMap;
	if (!map.Texts || map.Texts.length === 0)
		map.Texts = convertMapTexts(ctx, amberstarMap.index);
	map.Events = [];
	map.EventList = [];
	map.EventAutomapTypes = [];

	const builder = new EventBuilder(ctx, amberstarMap, map, options);
	const used = usedEventIds(amberstarMap);
	const tileIds = new Set(amberstarMap.tiles.map(t => t.event).filter(e => e !== 0));
	// Only events on tiles need EventList entries (DoorExit targets are chained).
	const listIds = used.filter(id => tileIds.has(id));

	if (listIds.length > MaxEventListEntries)
		console.warn(`Amberstar map ${amberstarMap.index}: ${listIds.length} events but only ${MaxEventListEntries} are supported.`);

	listIds.slice(0, MaxEventListEntries).forEach((id, slot) => builder.slots.set(id, slot));

	const saveIndexSlots = new globalThis.Map();
	for (const [id, slot] of builder.slots) {
		const save = amberstarMap.events[id - 1]?.raw?.save ?? 0;
		if (save !== 0)
			saveIndexSlots.set(save, slot);
	}

	// Build the chains
	const idToMapEventId = new globalThis.Map();
	for (const [id, slot] of builder.slots) {
		const head = builder.chain(id);
		// Unsupported events keep an (inactive) slot so the slot numbering stays stable.
		map.EventList[slot] = head ?? builder.condition(ConditionEvent.ConditionType.GlobalVariable, 0, 2); // never true
		map.EventAutomapTypes[slot] = head ? automapTypeOf(amberstarMap.events[id - 1]) : AutomapType.None;
		idToMapEventId.set(id, slot + 1);
	}

	// Text popup characters: event chain "eye or mouth -> show text" (Amberstar shows the text for both).
	const characterRefs = map.CharacterReferences ?? [];
	for (const ref of characterRefs) {
		if (ref == null || (ref.CharacterFlags & AmbermoonMap.CharacterReference.Flags.TextPopup) === 0)
			continue;
		if (map.EventList.length >= MaxEventListEntries || !builder.validText(ref.Index))
			continue;
		const condition = builder.condition(ConditionEvent.ConditionType.MultiCursor, 0x2 | 0x4, 1);
		const popup = builder.popup(ref.Index, PopupTrigger.Always);
		builder.link(condition, popup);
		map.EventList.push(condition);
		map.EventAutomapTypes.push(AutomapType.None);
		ref.EventIndex = map.EventList.length;
	}

	// Map event ids on tiles / blocks
	const width = amberstarMap.width, height = amberstarMap.height;
	const setId = (grid, x, y, id) => {
		const cell = grid?.[x]?.[y];
		if (cell)
			cell.MapEventId = id;
	};
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const eventId = amberstarMap.tiles[x + y * width].event;
			const mapEventId = eventId === 0 ? 0 : idToMapEventId.get(eventId) ?? 0;
			if (map.Tiles) {
				setId(map.Tiles, x, y, mapEventId);
				setId(map.InitialTiles, x, y, mapEventId);
			}
			if (map.Blocks) {
				setId(map.Blocks, x, y, mapEventId);
				setId(map.InitialBlocks, x, y, mapEventId);
			}
		}
	}

	map.AmberstarEventSlots = builder.slots;
	map.AmberstarSaveIndexSlots = saveIndexSlots;
	return map;
}
