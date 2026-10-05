// Port of Ambermoon.Data.Legacy/Serialization/EventWriter.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { EventType } from '../../Ambermoon.Data.Common/Event.js';

export class EventWriter {
	static WriteEvents(dataWriter, events, eventList) {
		dataWriter.WriteWord(eventList.length);

		for (const event of eventList) {
			dataWriter.WriteWord(events.indexOf(event));
		}

		dataWriter.WriteWord(events.length);

		for (const event of events) {
			dataWriter.WriteEnumAsByte(event.Type);
			EventWriter.WriteEventData(dataWriter, event);
			dataWriter.WriteWord(event.Next == null ? 0xffff : events.indexOf(event.Next));
		}
	}

	/**
	 * Note that this only writes the 9 event data bytes. It assumes that the event type
	 * byte is writter already and it won't write the next event word.
	 */
	static WriteEventData(dataWriter, event) {
		switch (event.Type) {
			case EventType.Teleport: {
				// 1. byte is the x coordinate
				// 2. byte is the y coordinate
				// 3. byte is the character direction
				// Then 1 byte for the new travel type (0xff means keep the same)
				// Then 1 byte for the transtion type (0-5)
				// Then a word for the map index
				// Then 2 unknown bytes (seem to be 00 FF)
				const teleportEvent = event;
				dataWriter.WriteByte(teleportEvent.X);
				dataWriter.WriteByte(teleportEvent.Y);
				dataWriter.WriteEnumAsByte(teleportEvent.Direction);
				dataWriter.WriteByte(teleportEvent.NewTravelType == null ? 0xff : teleportEvent.NewTravelType);
				dataWriter.WriteByte(teleportEvent.Transition);
				dataWriter.WriteWord(teleportEvent.MapIndex);
				dataWriter.Write(teleportEvent.Unknown2);
				break;
			}
			case EventType.Door: {
				// 1. byte is a lockpicking chance reduction (0: already open, 100: can't open via lockpicking)
				// 2. byte is the door index (used for unlock bits in savegame)
				// 3. byte is an optional text index (0xff = no text)
				// 4. byte is unknown
				// 5. byte is unknown
				// word at position 6 is the key index if a key must unlock it
				// last word is the event index (0-based) of the event that is called when unlocking fails
				const doorEvent = event;
				dataWriter.WriteByte(doorEvent.LockpickingChanceReduction);
				dataWriter.WriteByte(doorEvent.DoorIndex);
				dataWriter.WriteByte(doorEvent.TextIndex);
				dataWriter.WriteByte(doorEvent.UnlockTextIndex);
				dataWriter.WriteByte(doorEvent.Unused);
				dataWriter.WriteWord(doorEvent.KeyIndex);
				dataWriter.WriteWord(doorEvent.UnlockFailedEventIndex);
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
				const chestEvent = event;
				dataWriter.WriteByte(chestEvent.LockpickingChanceReduction);
				dataWriter.WriteByte(chestEvent.FindChanceReduction);
				dataWriter.WriteByte(chestEvent.TextIndex);
				dataWriter.WriteByte(chestEvent.ChestIndex);
				dataWriter.WriteByte(chestEvent.Flags);
				dataWriter.WriteWord(chestEvent.KeyIndex);
				dataWriter.WriteWord(chestEvent.UnlockFailedEventIndex);
				break;
			}
			case EventType.MapText: {
				// event image index (0xff = no image)
				// trigger (1 = move, 2 = cursor, 3 = both)
				// unknown boolean
				// map text index as word
				// 4 unknown bytes
				const textEvent = event;
				dataWriter.WriteByte(textEvent.EventImageIndex);
				dataWriter.WriteEnumAsByte(textEvent.PopupTrigger);
				dataWriter.WriteByte(textEvent.TriggerIfBlind ? 1 : 0);
				dataWriter.WriteByte(0);
				dataWriter.WriteByte(textEvent.TextIndex);
				dataWriter.Write(textEvent.Unknown);
				break;
			}
			case EventType.Spinner: {
				const spinnerEvent = event;
				dataWriter.WriteEnumAsByte(spinnerEvent.Direction);
				dataWriter.Write(spinnerEvent.Unused);
				break;
			}
			case EventType.Trap: {
				const trapEvent = event;
				dataWriter.WriteEnumAsByte(trapEvent.Ailment);
				dataWriter.WriteEnumAsByte(trapEvent.Target);
				dataWriter.WriteEnumAsByte(trapEvent.AffectedGenders);
				dataWriter.WriteByte(trapEvent.BaseDamage);
				dataWriter.Write(trapEvent.Unused);
				break;
			}
			case EventType.ChangeBuffs: {
				const removeBuffsEvent = event;
				dataWriter.WriteByte(removeBuffsEvent.AffectedBuff == null ? 0 : 1 + removeBuffsEvent.AffectedBuff);
				dataWriter.WriteByte(removeBuffsEvent.Add ? 1 : 0);
				dataWriter.WriteByte(removeBuffsEvent.Unused1);
				dataWriter.WriteWord(removeBuffsEvent.Value);
				dataWriter.WriteWord(removeBuffsEvent.Duration);
				dataWriter.Write(removeBuffsEvent.Unused2);
				break;
			}
			case EventType.Riddlemouth: {
				const riddleMouthEvent = event;
				dataWriter.WriteByte(riddleMouthEvent.RiddleTextIndex);
				dataWriter.WriteByte(riddleMouthEvent.SolutionTextIndex);
				dataWriter.Write(riddleMouthEvent.Unused);
				dataWriter.WriteWord(riddleMouthEvent.CorrectAnswerDictionaryIndex1);
				dataWriter.WriteWord(riddleMouthEvent.CorrectAnswerDictionaryIndex2);
				break;
			}
			case EventType.Reward: {
				const rewardEvent = event;
				dataWriter.WriteEnumAsByte(rewardEvent.TypeOfReward);
				dataWriter.WriteEnumAsByte(rewardEvent.Operation);
				dataWriter.WriteByte(rewardEvent.Random ? 1 : 0);
				dataWriter.WriteEnumAsByte(rewardEvent.Target);
				dataWriter.WriteByte(rewardEvent.Unused);
				dataWriter.WriteWord(rewardEvent.RewardTypeValue);
				dataWriter.WriteWord(rewardEvent.Value);
				break;
			}
			case EventType.ChangeTile: {
				const changeTileEvent = event;
				dataWriter.WriteByte(changeTileEvent.X);
				dataWriter.WriteByte(changeTileEvent.Y);
				dataWriter.Write(changeTileEvent.Unknown);
				dataWriter.WriteWord(changeTileEvent.FrontTileIndex);
				dataWriter.WriteWord(changeTileEvent.MapIndex);
				break;
			}
			case EventType.StartBattle: {
				const startBattleEvent = event;
				dataWriter.Write(startBattleEvent.Unknown1);
				dataWriter.WriteByte(startBattleEvent.MonsterGroupIndex);
				dataWriter.Write(startBattleEvent.Unknown2);
				break;
			}
			case EventType.EnterPlace: {
				const enterPlaceEvent = event;
				dataWriter.WriteByte(enterPlaceEvent.ClosedTextIndex);
				dataWriter.WriteEnumAsByte(enterPlaceEvent.PlaceType);
				dataWriter.WriteByte(enterPlaceEvent.OpeningHour);
				dataWriter.WriteByte(enterPlaceEvent.ClosingHour);
				dataWriter.WriteByte(enterPlaceEvent.UsePlaceTextIndex);
				dataWriter.WriteWord(enterPlaceEvent.PlaceIndex);
				dataWriter.WriteWord(enterPlaceEvent.MerchantDataIndex);
				break;
			}
			case EventType.Condition: {
				const conditionEvent = event;
				dataWriter.WriteEnumAsByte(conditionEvent.TypeOfCondition);
				dataWriter.WriteByte(conditionEvent.Value);
				dataWriter.WriteByte(conditionEvent.Count);
				dataWriter.WriteWord(conditionEvent.DisallowedAilments);
				dataWriter.WriteWord(conditionEvent.ObjectIndex);
				dataWriter.WriteWord(conditionEvent.ContinueIfFalseWithMapEventIndex);
				break;
			}
			case EventType.Action: {
				const actionEvent = event;
				dataWriter.WriteEnumAsByte(actionEvent.TypeOfAction);
				dataWriter.WriteByte(actionEvent.Value);
				dataWriter.WriteByte(actionEvent.Count);
				dataWriter.Write(actionEvent.Unknown1);
				dataWriter.WriteWord(actionEvent.ObjectIndex);
				dataWriter.Write(actionEvent.Unknown2);
				break;
			}
			case EventType.Dice100Roll: {
				const dice100Event = event;
				dataWriter.WriteByte(dice100Event.Chance);
				dataWriter.Write(dice100Event.Unused);
				dataWriter.WriteWord(dice100Event.ContinueIfFalseWithMapEventIndex);
				break;
			}
			case EventType.Conversation: {
				const conversationEvent = event;
				dataWriter.WriteEnumAsByte(conversationEvent.Interaction);
				dataWriter.Write(conversationEvent.Unused1);
				dataWriter.WriteWord(conversationEvent.Value);
				dataWriter.Write(conversationEvent.Unused2);
				break;
			}
			case EventType.PrintText: {
				const printTextEvent = event;
				dataWriter.WriteByte(printTextEvent.NPCTextIndex);
				dataWriter.Write(printTextEvent.Unused);
				break;
			}
			case EventType.Create: {
				const createEvent = event;
				dataWriter.WriteEnumAsByte(createEvent.TypeOfCreation);
				dataWriter.Write(createEvent.Unused);
				dataWriter.WriteWord(createEvent.Amount);
				dataWriter.WriteWord(createEvent.ItemIndex);
				break;
			}
			case EventType.Decision: {
				const decisionEvent = event;
				dataWriter.WriteByte(decisionEvent.TextIndex);
				dataWriter.Write(decisionEvent.Unknown1);
				dataWriter.WriteWord(decisionEvent.NoEventIndex);
				break;
			}
			case EventType.ChangeMusic: {
				const musicEvent = event;
				dataWriter.WriteWord(musicEvent.MusicIndex);
				dataWriter.WriteByte(musicEvent.Volume);
				dataWriter.Write(musicEvent.Unknown1);
				break;
			}
			case EventType.Exit: {
				const exitEvent = event;
				dataWriter.Write(exitEvent.Unused);
				break;
			}
			case EventType.Spawn: {
				const spawnEvent = event;
				dataWriter.WriteByte(spawnEvent.X);
				dataWriter.WriteByte(spawnEvent.Y);
				dataWriter.WriteEnumAsByte(spawnEvent.TravelType);
				dataWriter.Write(spawnEvent.Unknown1);
				dataWriter.WriteWord(spawnEvent.MapIndex);
				dataWriter.Write(spawnEvent.Unknown2);
				break;
			}
			case EventType.Interact: {
				const interactEvent = event;
				dataWriter.Write(interactEvent.Unused);
				break;
			}
			case EventType.RemovePartyMember: {
				const removePartyMemberEvent = event;
				dataWriter.WriteByte(removePartyMemberEvent.CharacterIndex);
				dataWriter.WriteByte(removePartyMemberEvent.ChestIndexEquipment);
				dataWriter.WriteByte(removePartyMemberEvent.ChestIndexInventory);
				dataWriter.Write(removePartyMemberEvent.Unused);
				break;
			}
			case EventType.Delay: {
				const delayEvent = event;
				dataWriter.Write(delayEvent.Unused1);
				dataWriter.WriteWord(delayEvent.Milliseconds);
				dataWriter.WriteWord(delayEvent.Unused2);
				break;
			}
			case EventType.PartyMemberCondition: {
				const conditionEvent = event;
				dataWriter.WriteEnumAsByte(conditionEvent.TypeOfCondition);
				dataWriter.WriteByte(conditionEvent.ConditionValueIndex);
				dataWriter.WriteByte(conditionEvent.Target);
				dataWriter.WriteWord(conditionEvent.DisallowedAilments);
				dataWriter.WriteWord(conditionEvent.Value);
				dataWriter.WriteWord(conditionEvent.ContinueIfFalseWithMapEventIndex);
				break;
			}
			case EventType.Shake: {
				const shakeEvent = event;
				dataWriter.Write(shakeEvent.Unused1);
				dataWriter.WriteWord(shakeEvent.Shakes);
				dataWriter.WriteWord(shakeEvent.Unused2);
				break;
			}
			case EventType.ShowMap: {
				const showMapEvent = event;
				dataWriter.WriteEnumAsByte(showMapEvent.Options);
				dataWriter.Write(showMapEvent.Unused);
				break;
			}
			case EventType.ToggleSwitch: {
				const toggleSwitchEvent = event;
				dataWriter.Write(toggleSwitchEvent.GlobalVariableBytes);
				dataWriter.WriteWord(toggleSwitchEvent.FrontTileIndexOff);
				dataWriter.WriteWord(toggleSwitchEvent.FrontTileIndexOn);
				break;
			}
			case EventType.DynamicChangeTile: {
				const dynamicChangeTileEvent = event;
				const frontTileIndexWord = ((dynamicChangeTileEvent.FrontTileIndexOff << 4) | ((dynamicChangeTileEvent.FrontTileIndexOn >>> 8) & 0xf)) & 0xffff;
				const frontTileIndexByte = dynamicChangeTileEvent.FrontTileIndexOn & 0xff;

				dataWriter.WriteByte(dynamicChangeTileEvent.X);
				dataWriter.WriteByte(dynamicChangeTileEvent.Y);
				dataWriter.WriteWord(dynamicChangeTileEvent.GlobalVariable);
				dataWriter.WriteWord(frontTileIndexWord);
				dataWriter.WriteByte(frontTileIndexByte);
				dataWriter.WriteWord(dynamicChangeTileEvent.MapIndex);
				break;
			}
			case EventType.RectangularExploration: {
				const rectangularExplorationEvent = event;
				dataWriter.WriteByte(rectangularExplorationEvent.X);
				dataWriter.WriteByte(rectangularExplorationEvent.Y);
				dataWriter.WriteByte(rectangularExplorationEvent.Width);
				dataWriter.WriteByte(rectangularExplorationEvent.Height);
				dataWriter.WriteEnumAsByte(rectangularExplorationEvent.Exploration);
				dataWriter.WriteWord(rectangularExplorationEvent.MapIndex);
				dataWriter.WriteWord(rectangularExplorationEvent.Unused);
				break;
			}
			case EventType.VerticalLineReveal: {
				const verticalLineRevealEvent = event;
				dataWriter.WriteByte(verticalLineRevealEvent.X1);
				dataWriter.WriteByte(verticalLineRevealEvent.Y1);
				dataWriter.WriteByte(verticalLineRevealEvent.Height1);
				dataWriter.WriteByte(verticalLineRevealEvent.X2);
				dataWriter.WriteByte(verticalLineRevealEvent.Y2);
				dataWriter.WriteByte(verticalLineRevealEvent.Height2);
				dataWriter.WriteByte(verticalLineRevealEvent.X3);
				dataWriter.WriteByte(verticalLineRevealEvent.Y3);
				dataWriter.WriteByte(verticalLineRevealEvent.Height3);
				break;
			}
			default: {
				const debugEvent = event;
				dataWriter.Write(debugEvent.Data);
				break;
			}
		}
	}
}
