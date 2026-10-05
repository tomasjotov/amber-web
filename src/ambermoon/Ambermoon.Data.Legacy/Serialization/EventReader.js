// Port of Ambermoon.Data.Legacy/Serialization/EventReader.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import {
	EventType, TeleportEvent, DoorEvent, ChestEvent, PopupTextEvent, SpinnerEvent, TrapEvent, ChangeBuffsEvent,
	RiddlemouthEvent, RewardEvent, ChangeTileEvent, StartBattleEvent, EnterPlaceEvent, ConditionEvent, ActionEvent,
	Dice100RollEvent, ConversationEvent, PrintTextEvent, CreateEvent, DecisionEvent, ChangeMusicEvent, ExitEvent,
	SpawnEvent, InteractEvent, RemovePartyMemberEvent, DelayEvent, PartyMemberConditionEvent, ShakeEvent, ShowMapEvent,
	ToggleSwitchEvent, DynamicChangeTileEvent, RectangularExplorationEvent, VerticalLineRevealEvent, DebugEvent
} from '../../Ambermoon.Data.Common/Event.js';

/** Object initializer: construct, then assign the properties in order. */
function init(obj, props) {
	for (const key of Object.keys(props))
		obj[key] = props[key];
	return obj;
}

export class EventReader {
	static ReadEvents(dataReader, events, eventList) {
		const numEvents = dataReader.ReadWord();

		// There are numEvents 16 bit values.
		// Each gives the offset of the event to use.
		// Each event data is 12 bytes in size.

		// After this the total number of events is given.
		// Events can be chained (linked list). Each chain
		// is identified by an event id on some map tiles
		// or inside NPCs etc.

		// The last two bytes of each event data contain the
		// offset of the next event data or 0xFFFF if this is
		// the last event of the chain/list.
		// Note that the linked list can have a non-linear order.

		// E.g. in map 8 the first map event (index 0) references
		// map event 2 and this references map event 1 which is the
		// end chunk of the first map event chain.
		const eventOffsets = new Array(numEvents).fill(0);

		for (let i = 0; i < numEvents; ++i)
			eventOffsets[i] = dataReader.ReadWord();

		events.length = 0;

		let numTotalEvents = 0;

		if (dataReader.Position <= dataReader.Size - 4)
			numTotalEvents = dataReader.ReadWord();

		if (numEvents > 0) {
			const eventInfos = [];

			// read all events and the next event index
			for (let i = 0; i < numTotalEvents; ++i) {
				const event = EventReader.ParseEvent(dataReader);
				event.Index = i + 1;
				eventInfos.push({ Item1: event, Item2: dataReader.ReadWord() });
				events.push(event);
			}

			for (const event of eventInfos) {
				event.Item1.Next = event.Item2 === 0xffff ? null : eventInfos[event.Item2].Item1;
			}

			for (const eventOffset of eventOffsets)
				eventList.push(eventInfos[eventOffset].Item1);
		}
	}

	static ParseEvent(dataReader) {
		let event;
		const type = dataReader.ReadByte();

		switch (type) {
			case EventType.Teleport: {
				// 1. byte is the x coordinate
				// 2. byte is the y coordinate
				// 3. byte is the character direction
				// Then 1 byte for the new travel type (0xff means keep the current one)
				// Then 1 byte for the transtion type (0-5)
				// Then a word for the map index
				// Then 2 unknown bytes (seem to be 00 FF)
				const x = dataReader.ReadByte();
				const y = dataReader.ReadByte();
				const direction = dataReader.ReadByte();
				const newTravelType = dataReader.ReadByte();
				const transition = dataReader.ReadByte();
				const mapIndex = dataReader.ReadWord();
				const unknown2 = dataReader.ReadBytes(2);
				event = init(new TeleportEvent(), {
					MapIndex: mapIndex,
					X: x,
					Y: y,
					Direction: direction,
					NewTravelType: newTravelType === 0xff ? null : newTravelType,
					Transition: transition,
					Unknown2: unknown2,
				});
				break;
			}
			case EventType.Door: {
				// 1. byte is a lockpicking chance reduction (0: already open, 100: can't open via lockpicking)
				// 2. byte is the door index (used for unlock bits in savegame)
				// 3. byte is an optional text index that is shown initially (0xff = no text)
				// 4. byte is an optional text index if the door was unlocked (0xff = no text)
				// 5. byte is unknown (always 0)
				// word at position 6 is the key index if a key must unlock it
				// last word is the event index (0-based) of the event that is called when unlocking fails
				const lockpickingChanceReduction = dataReader.ReadByte();
				const doorIndex = dataReader.ReadByte();
				const textIndex = dataReader.ReadByte();
				const unlockTextIndex = dataReader.ReadByte();
				const unused = dataReader.ReadByte();
				const keyIndex = dataReader.ReadWord();
				const unlockFailEventIndex = dataReader.ReadWord();

				event = init(new DoorEvent(), {
					LockpickingChanceReduction: lockpickingChanceReduction,
					DoorIndex: doorIndex,
					TextIndex: textIndex,
					UnlockTextIndex: unlockTextIndex,
					Unused: unused,
					KeyIndex: keyIndex,
					UnlockFailedEventIndex: unlockFailEventIndex
				});
				break;
			}
			case EventType.Chest: {
				// 1. byte is a lockpicking chance reduction (0: already open, 100: can't open via lockpicking)
				// 2. byte is a search chance reduction (0: always found)
				// 3. byte is an optional text index (0xff = no text)
				// 4. byte is the chest index (0-based)
				// 5. byte are the chest flags
				// word at position 6 is the key index if a key must unlock it
				// last word is the event index (0-based) of the event that is called when unlocking fails
				const lockpickingChanceReduction = dataReader.ReadByte();
				const findChanceReduction = dataReader.ReadByte();
				const textIndex = dataReader.ReadByte();
				const chestIndex = dataReader.ReadByte();
				const flags = dataReader.ReadByte();
				const keyIndex = dataReader.ReadWord();
				const unlockFailEventIndex = dataReader.ReadWord();
				event = init(new ChestEvent(), {
					LockpickingChanceReduction: lockpickingChanceReduction,
					FindChanceReduction: findChanceReduction,
					TextIndex: textIndex,
					ChestIndex: chestIndex,
					Flags: flags,
					KeyIndex: keyIndex,
					UnlockFailedEventIndex: unlockFailEventIndex
				});
				break;
			}
			case EventType.MapText: {
				// event image index (0xff = no image)
				// trigger (1 = move, 2 = eye cursor, 3 = both)
				// unknown boolean
				// map text index as word
				// 4 unknown bytes
				const eventImageIndex = dataReader.ReadByte();
				const popupTrigger = dataReader.ReadByte();
				const triggerIfBlind = dataReader.ReadByte() !== 0;
				// Actually the 4th byte was planned to be
				// a search skill check like for chest events.
				// However, this is not implemented in the original
				// code so we can consider this as unused.
				dataReader.Position++;
				const textIndex = dataReader.ReadByte();
				const unknown = dataReader.ReadBytes(4);
				event = init(new PopupTextEvent(), {
					EventImageIndex: eventImageIndex,
					PopupTrigger: popupTrigger,
					TextIndex: textIndex,
					TriggerIfBlind: triggerIfBlind,
					Unknown: unknown
				});
				break;
			}
			case EventType.Spinner: {
				const direction = dataReader.ReadByte();
				const unused = dataReader.ReadBytes(8);
				event = init(new SpinnerEvent(), {
					Direction: direction,
					Unused: unused
				});
				break;
			}
			case EventType.Trap: {
				const ailment = dataReader.ReadByte();
				const target = dataReader.ReadByte();
				const affectedGenders = dataReader.ReadByte();
				const baseDamage = dataReader.ReadByte();
				const unused = dataReader.ReadBytes(5); // unused
				event = init(new TrapEvent(), {
					Ailment: ailment,
					Target: target,
					AffectedGenders: affectedGenders,
					BaseDamage: baseDamage,
					Unused: unused
				});
				break;
			}
			case EventType.ChangeBuffs: {
				const affectedBuffs = dataReader.ReadByte();
				const add = dataReader.ReadByte() !== 0;
				const unused1 = dataReader.ReadByte();
				const value = dataReader.ReadWord();
				const duration = dataReader.ReadWord();
				const unused2 = dataReader.ReadBytes(2);
				event = init(new ChangeBuffsEvent(), {
					AffectedBuff: affectedBuffs === 0 ? null : affectedBuffs - 1,
					Add: add,
					Value: value,
					Duration: duration,
					Unused1: unused1,
					Unused2: unused2
				});
				break;
			}
			case EventType.Riddlemouth: {
				const introTextIndex = dataReader.ReadByte();
				const solutionTextIndex = dataReader.ReadByte();
				const unused = dataReader.ReadBytes(3);
				const correctAnswerTextIndex1 = dataReader.ReadWord();
				const correctAnswerTextIndex2 = dataReader.ReadWord();
				event = init(new RiddlemouthEvent(), {
					RiddleTextIndex: introTextIndex,
					SolutionTextIndex: solutionTextIndex,
					CorrectAnswerDictionaryIndex1: correctAnswerTextIndex1,
					CorrectAnswerDictionaryIndex2: correctAnswerTextIndex2,
					Unused: unused
				});
				break;
			}
			case EventType.Reward: {
				const rewardType = dataReader.ReadByte();
				const rewardOperation = dataReader.ReadByte();
				const random = dataReader.ReadByte() !== 0;
				const rewardTarget = dataReader.ReadByte();
				const unknown = dataReader.ReadByte();
				const rewardTypeValue = dataReader.ReadWord();
				const value = dataReader.ReadWord();
				event = init(new RewardEvent(), {
					TypeOfReward: rewardType,
					Operation: rewardOperation,
					Random: random,
					Target: rewardTarget,
					RewardTypeValue: rewardTypeValue,
					Value: value,
					Unused: unknown
				});
				break;
			}
			case EventType.ChangeTile: {
				const x = dataReader.ReadByte();
				const y = dataReader.ReadByte();
				const unknown = dataReader.ReadBytes(3);
				const frontTileIndex = dataReader.ReadWord(); // also wall/object index in lower byte
				const mapIndex = dataReader.ReadWord();
				event = init(new ChangeTileEvent(), {
					X: x,
					Y: y,
					FrontTileIndex: frontTileIndex,
					MapIndex: mapIndex,
					Unknown: unknown
				});
				break;
			}
			case EventType.StartBattle: {
				const unknown1 = dataReader.ReadBytes(6);
				const monsterGroupIndex = dataReader.ReadByte();
				const unknown2 = dataReader.ReadBytes(2);
				event = init(new StartBattleEvent(), {
					MonsterGroupIndex: monsterGroupIndex,
					Unknown1: unknown1,
					Unknown2: unknown2
				});
				break;
			}
			case EventType.EnterPlace: {
				// map text index when closed (0xff is default message)
				// place type (see PlaceType)
				// opening hour
				// closing hour
				// text index for using the place (sleep, train, buy, etc)
				// place index (1-based, word)
				// 2 unknown bytes
				const textIndexWhenClosed = dataReader.ReadByte();
				const placeType = dataReader.ReadByte();
				const openingHour = dataReader.ReadByte();
				const closingHour = dataReader.ReadByte();
				const usePlaceTextIndex = dataReader.ReadByte();
				const placeIndex = dataReader.ReadWord();
				const merchantIndex = dataReader.ReadWord();
				event = init(new EnterPlaceEvent(), {
					ClosedTextIndex: textIndexWhenClosed,
					PlaceType: placeType,
					OpeningHour: openingHour,
					ClosingHour: closingHour,
					PlaceIndex: placeIndex,
					UsePlaceTextIndex: usePlaceTextIndex,
					MerchantDataIndex: merchantIndex
				});
				break;
			}
			case EventType.Condition: {
				const conditionType = dataReader.ReadByte();
				const value = dataReader.ReadByte();
				const count = dataReader.ReadByte();
				const disallowedAilments = dataReader.ReadWord();
				const objectIndex = dataReader.ReadWord();
				const jumpToIfNotFulfilled = dataReader.ReadWord();
				event = init(new ConditionEvent(), {
					TypeOfCondition: conditionType,
					ObjectIndex: objectIndex,
					Value: value,
					Count: count,
					DisallowedAilments: disallowedAilments,
					ContinueIfFalseWithMapEventIndex: jumpToIfNotFulfilled
				});
				break;
			}
			case EventType.Action: {
				const actionType = dataReader.ReadByte();
				const value = dataReader.ReadByte();
				const count = dataReader.ReadByte();
				const unknown1 = dataReader.ReadBytes(2);
				const objectIndex = dataReader.ReadWord();
				const unknown2 = dataReader.ReadBytes(2);
				event = init(new ActionEvent(), {
					TypeOfAction: actionType,
					ObjectIndex: objectIndex,
					Value: value,
					Count: count,
					Unknown1: unknown1,
					Unknown2: unknown2
				});
				break;
			}
			case EventType.Dice100Roll: {
				const chance = dataReader.ReadByte();
				const unused = dataReader.ReadBytes(6);
				const jumpToIfNotFulfilled = dataReader.ReadWord();
				event = init(new Dice100RollEvent(), {
					Chance: chance,
					Unused: unused,
					ContinueIfFalseWithMapEventIndex: jumpToIfNotFulfilled
				});
				break;
			}
			case EventType.Conversation: {
				const interaction = dataReader.ReadByte();
				const unused1 = dataReader.ReadBytes(4); // unused
				const value = dataReader.ReadWord();
				const unused2 = dataReader.ReadBytes(2); // unused
				event = init(new ConversationEvent(), {
					Interaction: interaction,
					Value: value,
					Unused1: unused1,
					Unused2: unused2
				});
				break;
			}
			case EventType.PrintText: {
				const npcTextIndex = dataReader.ReadByte();
				const unused = dataReader.ReadBytes(8); // unused
				event = init(new PrintTextEvent(), {
					NPCTextIndex: npcTextIndex,
					Unused: unused
				});
				break;
			}
			case EventType.Create: {
				const createType = dataReader.ReadByte();
				const unused = dataReader.ReadBytes(4);
				const amount = dataReader.ReadWord();
				const itemIndex = dataReader.ReadWord();
				event = init(new CreateEvent(), {
					TypeOfCreation: createType,
					Unused: unused,
					Amount: amount,
					ItemIndex: itemIndex
				});
				break;
			}
			case EventType.Decision: {
				const textIndex = dataReader.ReadByte();
				const unknown1 = dataReader.ReadBytes(6);
				const noEventIndex = dataReader.ReadWord();
				event = init(new DecisionEvent(), {
					TextIndex: textIndex,
					NoEventIndex: noEventIndex,
					Unknown1: unknown1
				});
				break;
			}
			case EventType.ChangeMusic: {
				const musicIndex = dataReader.ReadWord();
				const volume = dataReader.ReadByte();
				const unknown1 = dataReader.ReadBytes(6);
				event = init(new ChangeMusicEvent(), {
					MusicIndex: musicIndex,
					Volume: volume,
					Unknown1: unknown1
				});
				break;
			}
			case EventType.Exit: {
				event = init(new ExitEvent(), {
					Unused: dataReader.ReadBytes(9)
				});
				break;
			}
			case EventType.Spawn: {
				// byte0: x
				// byte1: y
				// byte2: travel type (see TravelType)
				// byte3-4: unused?
				// byte5-6: map index
				// byte7-8: unused?
				const x = dataReader.ReadByte();
				const y = dataReader.ReadByte();
				const travelType = dataReader.ReadByte();
				const unknown1 = dataReader.ReadBytes(2); // unknown
				const mapIndex = dataReader.ReadWord();
				const unknown2 = dataReader.ReadBytes(2); // unknown
				event = init(new SpawnEvent(), {
					X: x,
					Y: y,
					TravelType: travelType,
					Unknown1: unknown1,
					MapIndex: mapIndex,
					Unknown2: unknown2
				});
				break;
			}
			case EventType.Interact: {
				event = init(new InteractEvent(), {
					Unused: dataReader.ReadBytes(9)
				});
				break;
			}
			case EventType.RemovePartyMember: {
				const characterIndex = dataReader.ReadByte();
				const chestIndexEquipment = dataReader.ReadByte();
				const chestIndexInventory = dataReader.ReadByte();
				const unused = dataReader.ReadBytes(6);
				event = init(new RemovePartyMemberEvent(), {
					CharacterIndex: characterIndex,
					ChestIndexEquipment: chestIndexEquipment,
					ChestIndexInventory: chestIndexInventory,
					Unused: unused
				});
				break;
			}
			case EventType.Delay: {
				const unused1 = dataReader.ReadBytes(5);
				const milliseconds = dataReader.ReadWord();
				const unused2 = dataReader.ReadWord();
				event = init(new DelayEvent(), {
					Unused1: unused1,
					Milliseconds: milliseconds,
					Unused2: unused2
				});
				break;
			}
			case EventType.PartyMemberCondition: {
				const conditionType = dataReader.ReadByte();
				const conditionValueIndex = dataReader.ReadByte();
				const target = dataReader.ReadByte();
				const disallowedAilments = dataReader.ReadWord();
				const value = dataReader.ReadWord();
				const jumpToIfNotFulfilled = dataReader.ReadWord();
				event = init(new PartyMemberConditionEvent(), {
					TypeOfCondition: conditionType,
					ConditionValueIndex: conditionValueIndex,
					Target: target,
					DisallowedAilments: disallowedAilments,
					Value: value,
					ContinueIfFalseWithMapEventIndex: jumpToIfNotFulfilled
				});
				break;
			}
			case EventType.Shake: {
				const unused1 = dataReader.ReadBytes(5);
				const shakes = dataReader.ReadWord();
				const unused2 = dataReader.ReadWord();
				event = init(new ShakeEvent(), {
					Unused1: unused1,
					Shakes: shakes,
					Unused2: unused2
				});
				break;
			}
			case EventType.ShowMap: {
				const options = dataReader.ReadByte();
				const unused = dataReader.ReadBytes(8);
				event = init(new ShowMapEvent(), {
					Options: options,
					Unused: unused
				});
				break;
			}
			case EventType.ToggleSwitch: {
				const globalVarBytes = dataReader.ReadBytes(5);
				const frontTileOff = dataReader.ReadWord();
				const frontTileOn = dataReader.ReadWord();
				event = init(new ToggleSwitchEvent(), {
					GlobalVariableBytes: globalVarBytes,
					FrontTileIndexOff: frontTileOff,
					FrontTileIndexOn: frontTileOn,
				});
				break;
			}
			case EventType.DynamicChangeTile: {
				const x = dataReader.ReadByte();
				const y = dataReader.ReadByte();
				// Global var needs 10 bits
				// And we have 2 front tile indexes
				// We only have 5 bytes (= 40 bits) for that.
				// Easiest way: GlobalVar has full 16 bits
				// Remaining 24 bits are split into two 12 bit front tile indexes.
				const globalVar = dataReader.ReadWord();
				let frontTileIndexOff = dataReader.ReadWord();
				let frontTileIndexOn = dataReader.ReadByte();
				frontTileIndexOn |= ((frontTileIndexOff << 8) & 0xf00);
				frontTileIndexOff >>>= 4;
				const mapIndex = dataReader.ReadWord();
				event = init(new DynamicChangeTileEvent(), {
					X: x,
					Y: y,
					GlobalVariable: globalVar,
					FrontTileIndexOff: frontTileIndexOff,
					FrontTileIndexOn: frontTileIndexOn,
					MapIndex: mapIndex
				});
				break;
			}
			case EventType.RectangularExploration: {
				const x = dataReader.ReadByte();
				const y = dataReader.ReadByte();
				const width = dataReader.ReadByte();
				const height = dataReader.ReadByte();
				const explorationType = dataReader.ReadByte();
				const mapIndex = dataReader.ReadWord();
				const unused = dataReader.ReadWord();

				event = init(new RectangularExplorationEvent(), {
					X: x,
					Y: y,
					Width: width,
					Height: height,
					Exploration: explorationType,
					MapIndex: mapIndex,
					Unused: unused
				});
				break;
			}
			case EventType.VerticalLineReveal: {
				const x1 = dataReader.ReadByte();
				const y1 = dataReader.ReadByte();
				const height1 = dataReader.ReadByte();
				const x2 = dataReader.ReadByte();
				const y2 = dataReader.ReadByte();
				const height2 = dataReader.ReadByte();
				const x3 = dataReader.ReadByte();
				const y3 = dataReader.ReadByte();
				const height3 = dataReader.ReadByte();

				event = init(new VerticalLineRevealEvent(), {
					X1: x1,
					Y1: y1,
					Height1: height1,
					X2: x2,
					Y2: y2,
					Height2: height2,
					X3: x3,
					Y3: y3,
					Height3: height3,
				});
				break;
			}
			default: {
				event = init(new DebugEvent(), {
					Data: dataReader.ReadBytes(9)
				});
				break;
			}
		}

		event.Type = type;

		return event;
	}
}
