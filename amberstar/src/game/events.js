// Port of Amberstar.Game.Events (EventHandler and event implementations).
import { EventType, Direction } from '../data/enums.js';
import { CursorType } from '../data/enums.js';
import { Gender, fillHitPoints, healHitPoints, fillSpellPoints, healSpellPoints, damage, Condition } from '../data/characters.js';
import { random } from './util.js';

export const EventTrigger = { Eye: 0, Move: 1, Ear: 2, Mouth: 3, UseItem: 4 };

export function cursorToEventTrigger(cursorType) {
	switch (cursorType) {
		case CursorType.Eye: return EventTrigger.Eye;
		case CursorType.Ear: return EventTrigger.Ear;
		case CursorType.Mouth: return EventTrigger.Mouth;
		default: throw new Error(`Cursor type ${cursorType} has no event trigger.`);
	}
}

export class EventHandler {
	constructor(game) {
		this.game = game;
		this.currentEventProvider = null;
		this.currentEvent = null;
	}

	get currentEventMap() { return this.currentEventProvider?.map ?? this.currentEventProvider ?? null; }

	get currentEventMapIndex() {
		return this.currentEventMap?.index ?? this.game.state.getIndexOfMapWithPlayer();
	}

	handleEvent(trigger, event, eventProvider) {
		this.currentEventProvider = eventProvider;
		this.currentEvent = event;
		const result = event.handle(trigger, this.game, eventProvider);
		if (result && event.saveEvent && event.autoSave)
			this.game.saveEvent(event.index);
		return result;
	}
}

/**
 * Wraps the raw map event into a handler object (port of Event.CreateEvent).
 * Returns null for events which are not implemented.
 */
export function createEvent(data, eventIndex) {
	const handler = HANDLERS[data.type];
	if (!handler)
		return null;
	return {
		...data,
		index: eventIndex,
		autoSave: handler.autoSave ?? true,
		isTextEvent: handler.textEvent ?? false,
		handle: (trigger, game, provider) => handler.handle(data, trigger, game, provider, eventIndex),
	};
}

function withText(game, ev, action) {
	if (ev.textIndex)
		game.showText(action);
	else
		action();
}

const HANDLERS = {
	[EventType.MapExit]: {
		handle(ev, trigger, game) {
			if (trigger !== EventTrigger.Move)
				return false;
			game.teleport(ev.x, ev.y, ev.direction, ev.mapIndex, true);
			return true;
		},
	},
	[EventType.TravelExit]: {
		handle(ev, trigger, game) {
			if (trigger !== EventTrigger.Move)
				return false;
			game.state.travelType = 0;
			game.teleport(ev.x, ev.y, ev.direction, ev.mapIndex, true);
			return true;
		},
	},
	[EventType.Door]: {
		autoSave: false,
		handle(ev, trigger, game) {
			if (trigger === EventTrigger.Move)
				game.showDoor();
			return true;
		},
	},
	[EventType.DoorExit]: {
		autoSave: false,
		handle(ev, trigger, game) {
			if (trigger === EventTrigger.Move)
				game.showDoor();
			return true;
		},
	},
	[EventType.Chest]: {
		autoSave: false,
		handle(ev, trigger, game) {
			if (trigger === EventTrigger.Move || trigger === EventTrigger.Eye)
				game.showChest();
			return true;
		},
	},
	[EventType.ShowPictureText]: {
		textEvent: true,
		handle(ev, trigger, game) {
			const expectedTriggerMask = ev.trigger + 1;
			const triggerMask = (trigger + 1) & 0x3;
			if ((triggerMask & expectedTriggerMask) === 0)
				return false;
			if (ev.setWordBit)
				game.state.learnWord(ev.setWordBit);
			if (ev.picture === 0)
				game.showText();
			else
				game.showPictureWithText();
			return true;
		},
	},
	[EventType.Teleporter]: {
		textEvent: true,
		handle(ev, trigger, game) {
			if (trigger !== EventTrigger.Move)
				return false;
			withText(game, ev, () => game.teleport(ev.x, ev.y, ev.direction, ev.mapIndex, false));
			return true;
		},
	},
	[EventType.WindGate]: {
		textEvent: true,
		handle(ev, trigger, game) {
			if (trigger !== EventTrigger.Move)
				return false;
			if (!game.state.hasWindChain)
				return false;
			withText(game, ev, () => game.teleport(ev.x, ev.y, ev.direction, ev.mapIndex, false));
			return true;
		},
	},
	[EventType.TrapDoor]: {
		textEvent: true,
		handle(ev, trigger, game) {
			if (trigger !== EventTrigger.Move)
				return false;
			if (!ev.floor)
				return false; // only via levitation
			const fall = () => {
				if (ev.maxFallDamage > 0)
					game.foreachPartyMember(pm => damage(pm, random(1, ev.maxFallDamage + 1)), Condition.DeadAshesDust);
				game.afterPartyChange();
				game.teleport(ev.x, ev.y, Direction.Keep, ev.mapIndex, true);
			};
			withText(game, ev, fall);
			return true;
		},
	},
	[EventType.Place]: {
		handle(ev, trigger, game) {
			if (trigger !== EventTrigger.Move)
				return false;
			game.openPlace(ev);
			return true;
		},
	},
	[EventType.ExecuteTrap]: {
		textEvent: true,
		handle(ev, trigger, game) {
			const execute = () => game.triggerTrap(ev.trapType, ev.damage);
			withText(game, ev, execute);
			return false;
		},
	},
	[EventType.HPRegeneration]: {
		textEvent: true,
		handle(ev, trigger, game) {
			const regenerate = () => {
				game.foreachPartyMember(pm => ev.fill ? fillHitPoints(pm) : healHitPoints(pm, ev.amount), Condition.DeadAshesDust);
				game.afterPartyChange();
			};
			withText(game, ev, regenerate);
			return true;
		},
	},
	[EventType.SPRegeneration]: {
		textEvent: true,
		handle(ev, trigger, game) {
			const regenerate = () => {
				game.foreachPartyMember(pm => ev.fill ? fillSpellPoints(pm) : healSpellPoints(pm, ev.amount), Condition.DeadAshesDust);
				game.afterPartyChange();
			};
			withText(game, ev, regenerate);
			return true;
		},
	},
	[EventType.DamageField]: {
		textEvent: true,
		handle(ev, trigger, game) {
			const gender = ev.targetGender === 0 ? Gender.Male : ev.targetGender === 1 ? Gender.Female : null;
			const damageParty = () => {
				game.foreachPartyMemberAsync((pm, next) => damage(pm, random(1, ev.damage + 1), next),
					() => game.afterPartyChange(), Condition.DeadAshesDust, gender);
			};
			withText(game, ev, damageParty);
			return true;
		},
	},
	[EventType.Spinner]: {
		textEvent: true,
		handle(ev, trigger, game) {
			if (trigger !== EventTrigger.Move)
				return false;
			const spin = () => {
				let dir = ev.direction;
				if (dir === Direction.Random) {
					const old = game.state.partyDirection;
					do { dir = random(0, 4); } while (dir === old);
				}
				game.state.partyDirection = dir;
				game.screenHandler.activeScreen?.refreshView?.();
			};
			withText(game, ev, spin);
			return true;
		},
	},
	[EventType.ChangeTile]: {
		textEvent: true,
		handle(ev, trigger, game) {
			if (trigger !== EventTrigger.Move)
				return false;
			const change = () => {
				const mapIndex = game.eventHandler.currentEventMapIndex;
				game.state.saveTileChange(mapIndex, ev.x, ev.y, ev.iconIndex);
				game.screenHandler.activeScreen?.tileChanged?.(mapIndex, ev.x, ev.y, ev.iconIndex);
			};
			withText(game, ev, change);
			return true;
		},
	},
	[EventType.AntiMagic]: {
		textEvent: true,
		handle(ev, trigger, game) {
			if (trigger !== EventTrigger.Move)
				return false;
			const remove = () => {
				for (let i = 0; i < game.state.activeSpells.length; i++) {
					if (ev.activeSpell === 0 || ev.activeSpell === i + 1)
						game.state.activeSpells[i] = { duration: 0, value: 0 };
				}
			};
			withText(game, ev, remove);
			return true;
		},
	},
	[EventType.AttributeChange]: {
		textEvent: true,
		handle(ev, trigger, game) {
			if (trigger !== EventTrigger.Move)
				return false;
			const change = pm => {
				const attribute = pm.attributes[ev.attribute];
				if (!attribute)
					return;
				const amount = ev.random ? random(1, ev.amount + 1) : ev.amount;
				if (ev.add)
					attribute.currentValue = Math.min(attribute.maxValue, attribute.currentValue + amount);
				else
					attribute.currentValue = Math.max(0, attribute.currentValue - amount);
			};
			withText(game, ev, () => {
				if (ev.affectAllPlayers)
					game.foreachPartyMember(change, Condition.DeadAshesDust);
				else if (game.state.activePartyMember)
					change(game.state.activePartyMember);
			});
			return true;
		},
	},
	[EventType.Encounter]: {
		handle(ev, trigger, game) {
			if (trigger !== EventTrigger.Move)
				return false;
			if (ev.quest !== 0 && !game.state.isQuestBitSet(ev.quest))
				return false;
			if (!game.probe(ev.chance))
				return false;
			const textIndex = ev.quest !== 0 ? ev.questTextIndex : ev.noQuestTextIndex;
			const fight = () => game.startBattle?.(ev.monsterGroupIndex);
			if (textIndex)
				game.showTextMessage(game.getCurrentMapText(textIndex), fight);
			else
				fight();
			return true;
		},
	},
	[EventType.RiddleMouth]: {
		handle(ev, trigger, game) {
			if (trigger !== EventTrigger.Eye && trigger !== EventTrigger.Move)
				return false;
			if (!game.openRiddlemouth)
				return false;
			game.openRiddlemouth(ev);
			return true;
		},
	},
};
