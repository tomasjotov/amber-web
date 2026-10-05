// Port of Ambermoon.Core/EventExtensions.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// EventExtensions.cs - Makes triggering events easier

import {
	Event as RuntimeEvent, hasFlag, toUInt, toUShort, firstOrDefault, min, max, average, enumName
} from '../runtime.js';
import { AmbermoonException, ExceptionScope } from '../Ambermoon.Common/Exception.js';
import { Position } from '../Ambermoon.Common/Position.js';
import {
	EventType, TeleportEvent, DoorEvent, ChestEvent, PopupTextEvent, SpinnerEvent, TrapEvent, ChangeBuffsEvent,
	RiddlemouthEvent, RewardEvent, ChangeTileEvent, StartBattleEvent, EnterPlaceEvent, ConditionEvent, ActionEvent,
	Dice100RollEvent, ConversationEvent, DecisionEvent, ChangeMusicEvent, SpawnEvent, DelayEvent,
	PartyMemberConditionEvent, ShakeEvent, ShowMapEvent, ToggleSwitchEvent, DynamicChangeTileEvent,
	RectangularExplorationEvent, VerticalLineRevealEvent
} from '../Ambermoon.Data.Common/Event.js';
import { Skill } from '../Ambermoon.Data.Common/Enumerations/Skill.js';
import { Features } from '../Ambermoon.Data.Common/Enumerations/Features.js';
import { ActiveSpellType } from '../Ambermoon.Data.Common/Enumerations/ActiveSpellType.js';
import { Condition } from '../Ambermoon.Data.Common/Enumerations/Condition.js';
import { Race } from '../Ambermoon.Data.Common/Enumerations/Race.js';
import { ItemSlotFlags } from '../Ambermoon.Data.Common/Enumerations/ItemSlotFlags.js';
import { Attribute } from '../Ambermoon.Data.Common/Enumerations/Attribute.js';
import { Character } from '../Ambermoon.Data.Common/Character.js';
import { EventTrigger } from './MapExtensions.js';
import { GameCore } from './GameCore.js';
import { ConversationItems } from './Game/Conversations.js';
import { AutomapOptions } from './Game/MapHandling.js';

class EventProvider {
	constructor() {
		this.Event = null;
		this.Provided = new RuntimeEvent();
	}

	Provide(event) {
		this.Event = event;
		this.Provided.invoke(event);
	}
}

export class EventExtensions {
	static EventProvider = EventProvider;

	/**
	 * C#: Event? ExecuteEvent(this Event @event, Map map, GameCore game, ref EventTrigger trigger, uint x, uint y,
	 *     ref bool lastEventStatus, out bool aborted, out EventProvider? eventProvider,
	 *     IConversationPartner? conversationPartner = null, uint? characterIndex = null)
	 * Returns [nextEvent, trigger, lastEventStatus, aborted, eventProvider].
	 */
	static ExecuteEvent(event, map, game, trigger, x, y, lastEventStatus, conversationPartner = null, characterIndex = null) {
		let eventProvider = null;

		// Note: Aborted means that an event is not even executed. It does not mean that a decision
		// box is answered with No for example. It is used when:
		// - A condition of a condition event is not met and there is no event that is triggered in that case.
		// - A text popup does not accept the given trigger.
		// This is important in 3D when there might be an event on the current block and on the next one.
		// For example buttons use 2 events (one for Eye interaction and one for Hand interaction).

		let aborted = false;
		const events = conversationPartner == null ? map.Events : conversationPartner.Events;

		const result = next => [next, trigger, lastEventStatus, aborted, eventProvider];

		switch (event.Type) {
			case EventType.Teleport:
			{
				if (trigger !== EventTrigger.Move &&
					trigger !== EventTrigger.Always) {
					aborted = true;
					return result(null);
				}

				if (!(event instanceof TeleportEvent))
					throw new AmbermoonException(ExceptionScope.Data, 'Invalid teleport event.');
				const teleportEvent = event;

				game.Teleport(teleportEvent, x, y);

				// Note: The teleporter from Mine 1 to 2 has a teleport event which has another
				// one as its next event. We have to avoid further event execution by just return
				// null here. Teleport events are not allowed to chain anything and this
				// might be a data bug. In original code, teleport events will always break the chain.
				return result(null);
			}
			case EventType.Door:
			{
				if (!(event instanceof DoorEvent))
					throw new AmbermoonException(ExceptionScope.Data, 'Invalid door event.');
				const doorEvent = event;

				if (!game.ShowDoor(doorEvent, false, false, map, x, y, true, trigger === EventTrigger.Move,
					trigger >= EventTrigger.Item0 ? (trigger - EventTrigger.Item0) : 0)) {
					// already unlocked
					// Note that the original sets last event status to false in this case!
					lastEventStatus = false;
					return result(doorEvent.Next);
				}
				return result(null);
			}
			case EventType.Chest:
			{
				if (trigger === EventTrigger.Mouth) {
					aborted = true;
					return result(null);
				}

				if (!(event instanceof ChestEvent))
					throw new AmbermoonException(ExceptionScope.Data, 'Invalid chest event.');
				const chestEvent = event;

				let totalSearchValue = game.CurrentPartyMember.Skills[Skill.Searching].TotalCurrentValue;

				// Search bonus in AA
				if (hasFlag(game.Features, Features.ClairvoyanceGrantsSearchSkill) &&
					game.CurrentSavegame.IsSpellActive(ActiveSpellType.Clairvoyance)) {
					totalSearchValue += game.CurrentSavegame.GetActiveSpellLevel(ActiveSpellType.Clairvoyance);
				}

				if (chestEvent.SearchSkillCheck &&
					game.RandomInt(0, 99) >= totalSearchValue) {
					aborted = true;
					return result(null);
				}

				aborted = !game.ShowChest(chestEvent, false, false, map, new Position(x, y), true, false,
					trigger >= EventTrigger.Item0 ? (trigger - EventTrigger.Item0) : 0);
				return result(null);
			}
			case EventType.MapText:
			{
				if (!(event instanceof PopupTextEvent))
					throw new AmbermoonException(ExceptionScope.Data, 'Invalid text popup event.');
				const popupTextEvent = event;

				// Only check trigger if this is the first event of the chain.
				if (map.EventList.includes(event)) {
					switch (trigger) {
						case EventTrigger.Move:
							if (!popupTextEvent.CanTriggerByMoving) {
								aborted = true;
								return result(null);
							}
							break;
						case EventTrigger.Eye:
							if (!popupTextEvent.CanTriggerByCursor) {
								aborted = true;
								return result(null);
							}
							break;
						case EventTrigger.Always:
							break;
						default:
							aborted = true;
							return result(null);
					}

					if (!popupTextEvent.TriggerIfBlind && !game.CanSee()) {
						aborted = true;
						return result(null);
					}
				}

				const eventStatus = lastEventStatus;
				let provider = null;

				if (conversationPartner != null)
					provider = eventProvider = new EventProvider();

				game.ShowTextPopup(map, popupTextEvent, _ => {
					if (event.Next != null) {
						if (conversationPartner == null) {
							EventExtensions.TriggerEventChain(map, game, EventTrigger.Always, x, y, event.Next, eventStatus);
						} else {
							provider?.Provide(popupTextEvent.Next);
						}
					} else {
						game.ResetMapCharacterInteraction(map);
						if (conversationPartner != null)
							provider?.Provide(null);
					}
				});
				return result(null); // next event is only executed after popup response
			}
			case EventType.Spinner:
			{
				if (trigger === EventTrigger.Eye) {
					game.ShowMessagePopup(game.DataNameProvider.SeeRoundDiskInFloor);
					return result(null);
				}

				if (trigger !== EventTrigger.Move &&
					trigger !== EventTrigger.Always)
					return result(null);

				if (!(event instanceof SpinnerEvent))
					throw new AmbermoonException(ExceptionScope.Data, 'Invalid spinner event.');
				const spinnerEvent = event;

				game.Spin(spinnerEvent.Direction, spinnerEvent.Next);
				break;
			}
			case EventType.Trap:
			{
				if (!(event instanceof TrapEvent))
					throw new AmbermoonException(ExceptionScope.Data, 'Invalid trap event.');
				const trapEvent = event;

				if (trigger === EventTrigger.Eye) {
					// Note: Eye will only detect the trap, not trigger it!
					game.ShowMessagePopup(game.DataNameProvider.YouNoticeATrap);
					aborted = true;
					return result(null);
				} else if (trigger !== EventTrigger.Move && trigger !== EventTrigger.Always) {
					aborted = true;
					return result(null);
				}

				game.TriggerTrap(trapEvent, lastEventStatus, x, y);
				return result(null); // next event is only executed after trap effect
			}
			case EventType.ChangeBuffs:
			{
				if (!(event instanceof ChangeBuffsEvent))
					throw new AmbermoonException(ExceptionScope.Data, 'Invalid change buffs event.');
				const changeBuffsEvent = event;

				if (changeBuffsEvent.AffectedBuff == null) { // all
					for (let i = 0; i < 6; ++i) {
						if (changeBuffsEvent.Add)
							game.ActivateBuff(i, changeBuffsEvent.Value, changeBuffsEvent.Duration);
						else
							game.CurrentSavegame.ActiveSpells[i] = null;
					}

					if (!changeBuffsEvent.Add)
						game.UpdateLight();
				} else {
					const index = changeBuffsEvent.AffectedBuff;

					if (index < 6) {
						if (changeBuffsEvent.Add) {
							game.ActivateBuff(index, changeBuffsEvent.Value, changeBuffsEvent.Duration);
						} else {
							game.CurrentSavegame.ActiveSpells[index] = null;

							if (index === ActiveSpellType.Light)
								game.UpdateLight();
						}
					}
				}
				break;
			}
			case EventType.Riddlemouth:
			{
				if (trigger !== EventTrigger.Always &&
					trigger !== EventTrigger.Eye &&
					trigger !== EventTrigger.Hand &&
					trigger !== EventTrigger.Mouth)
					return result(null);

				if (!(event instanceof RiddlemouthEvent))
					throw new AmbermoonException(ExceptionScope.Data, 'Invalid riddle mouth event.');
				const riddleMouthEvent = event;

				game.ShowRiddlemouth(map, riddleMouthEvent, () => {
					EventExtensions.TriggerEventChain(map, game, EventTrigger.Always, x, y, event.Next, true);
				});
				return result(null); // next event is only executed after popup response
			}
			case EventType.Reward:
			{
				if (!(event instanceof RewardEvent))
					throw new AmbermoonException(ExceptionScope.Data, 'Invalid reward event.');
				const rewardEvent = event;
				let provider = null;
				if (conversationPartner != null)
					provider = eventProvider = new EventProvider();
				const eventStatus = lastEventStatus;
				const Reward = (partyMember, followAction) => game.RewardPlayer(partyMember, rewardEvent, followAction);
				const Done = () => {
					if (rewardEvent.Next != null) {
						if (conversationPartner == null)
							EventExtensions.TriggerEventChain(map, game, EventTrigger.Always, x, y, rewardEvent.Next, eventStatus);
						else
							provider?.Provide(rewardEvent.Next);
					} else if (conversationPartner != null)
						provider?.Provide(null);
				};
				switch (rewardEvent.Target) {
					case RewardEvent.RewardTarget.ActivePlayer:
						Reward(game.CurrentPartyMember, Done);
						break;
					case RewardEvent.RewardTarget.RandomPlayer:
					{
						const partyMembers = [...game.PartyMembers].filter(p => p != null && p.Alive && !hasFlag(p.Conditions, Condition.Petrified));
						const index = game.RandomInt(0, partyMembers.length - 1);
						Reward(partyMembers[index], Done);
						break;
					}
					case RewardEvent.RewardTarget.FirstAnimal:
					{
						const animal = firstOrDefault(game.PartyMembers, p => p.Race === Race.Animal);

						if (animal == null) {
							aborted = true;
							return result(null);
						}

						Reward(animal, Done);
						break;
					}
					case RewardEvent.RewardTarget.All:
						if (rewardEvent.TypeOfReward === RewardEvent.RewardType.HitPoints &&
							(rewardEvent.Operation === RewardEvent.RewardOperation.Decrease ||
							rewardEvent.Operation === RewardEvent.RewardOperation.DecreasePercentage)) {
							const damageProvider = rewardEvent.Operation === RewardEvent.RewardOperation.Decrease
								? (_ => rewardEvent.Value) : p => Math.trunc(rewardEvent.Value * p.HitPoints.TotalMaxValue / 100);

							// Note: Rewards damage silently.
							game.DamageAllPartyMembers(damageProvider, p => p.Alive, null, _ => Done(), Condition.None, false);
						} else {
							// Allow condition removal for dead party members
							const filter = rewardEvent.TypeOfReward === RewardEvent.RewardType.Conditions &&
								rewardEvent.Operation === RewardEvent.RewardOperation.Remove
								? _ => true : p => p.Alive;

							game.ForeachPartyMember(Reward, filter, Done);
						}
						break;
					default:
						if (rewardEvent.Target >= RewardEvent.RewardTarget.AllButFirstPartyMember) {
							const filter = p => p.Alive && p.Index !== 1 + rewardEvent.Target - RewardEvent.RewardTarget.AllButFirstPartyMember;

							if (rewardEvent.TypeOfReward === RewardEvent.RewardType.HitPoints &&
								(rewardEvent.Operation === RewardEvent.RewardOperation.Decrease ||
								rewardEvent.Operation === RewardEvent.RewardOperation.DecreasePercentage)) {
								const damageProvider = rewardEvent.Operation === RewardEvent.RewardOperation.Decrease
									? (_ => rewardEvent.Value) : p => Math.trunc(rewardEvent.Value * p.HitPoints.TotalMaxValue / 100);

								// Note: Rewards damage silently.
								game.DamageAllPartyMembers(damageProvider, filter,
									null, _ => Done(), Condition.None, false);
							} else {
								game.ForeachPartyMember(Reward, filter, Done);
							}
							break;
						} else if (rewardEvent.Target >= RewardEvent.RewardTarget.FirstPartyMember) {
							const partyMember = firstOrDefault(game.PartyMembers, p => p.Index === 1 + rewardEvent.Target - RewardEvent.RewardTarget.FirstPartyMember);

							if (partyMember == null) {
								aborted = true;
								return result(null);
							}

							Reward(partyMember, Done);
							break;
						}

						return result(rewardEvent.Next);
				}
				return result(null);
			}
			case EventType.ChangeTile:
			{
				if (!(event instanceof ChangeTileEvent))
					throw new AmbermoonException(ExceptionScope.Data, 'Invalid change tile event.');
				const changeTileEvent = event;

				// Note: Savegame stores the front tile index for 2D and wall/object index for 3D.
				// Note: If map index is 0 (same map) we have to replace it with the real map index
				// for savegames. Otherwise it will be interpreted as "end of tile changes marker".
				// Clone as we change the event and it might be used several times.
				const changeTileEventClone = new ChangeTileEvent();
				changeTileEventClone.Type = changeTileEvent.Type;
				changeTileEventClone.X = changeTileEvent.X;
				changeTileEventClone.Y = changeTileEvent.Y;
				changeTileEventClone.MapIndex = changeTileEvent.MapIndex;
				changeTileEventClone.FrontTileIndex = changeTileEvent.FrontTileIndex;
				changeTileEventClone.Index = changeTileEvent.Index;
				changeTileEventClone.Next = changeTileEvent.Next;
				changeTileEventClone.Unknown = changeTileEvent.Unknown;
				if (changeTileEventClone.MapIndex === 0)
					changeTileEventClone.MapIndex = map.Index;
				if (changeTileEventClone.X === 0)
					changeTileEventClone.X = x + 1;
				if (changeTileEventClone.Y === 0)
					changeTileEventClone.Y = y + 1;

				game.UpdateMapTile(changeTileEventClone, x, y);
				break;
			}
			case EventType.StartBattle:
			{
				if (trigger !== EventTrigger.Move &&
					trigger !== EventTrigger.Always) {
					aborted = true;
					return result(null);
				}

				if (!(event instanceof StartBattleEvent))
					throw new AmbermoonException(ExceptionScope.Data, 'Invalid battle event.');
				const battleEvent = event;

				game.StartBattle(battleEvent, battleEvent.Next, x, y, game.GetCombatBackgroundIndex(map, x, y));
				return result(null);
			}
			case EventType.EnterPlace:
			{
				if (trigger !== EventTrigger.Move &&
					trigger !== EventTrigger.Always) {
					aborted = true;
					return result(null);
				}

				if (!(event instanceof EnterPlaceEvent))
					throw new AmbermoonException(ExceptionScope.Data, 'Invalid place event.');
				const enterPlaceEvent = event;

				if (!game.EnterPlace(map, enterPlaceEvent))
					aborted = true;
				return result(null);
			}
			case EventType.Condition:
			{
				if (!(event instanceof ConditionEvent))
					throw new AmbermoonException(ExceptionScope.Data, 'Invalid condition event.');
				const conditionEvent = event;

				const mapEventIfFalse = conditionEvent.ContinueIfFalseWithMapEventIndex === 0xffff
					? null : events[conditionEvent.ContinueIfFalseWithMapEventIndex];

				const fail = () => {
					aborted = mapEventIfFalse == null;
					lastEventStatus = false;
					return result(mapEventIfFalse);
				};

				switch (conditionEvent.TypeOfCondition) {
					case ConditionEvent.ConditionType.GlobalVariable:
						if (game.CurrentSavegame.GetGlobalVariable(conditionEvent.ObjectIndex) !== (conditionEvent.Value !== 0))
							return fail();
						break;
					case ConditionEvent.ConditionType.EventBit:
						if (game.CurrentSavegame.GetEventBit(1 + (conditionEvent.ObjectIndex >>> 6), conditionEvent.ObjectIndex & 0x3f) !== (conditionEvent.Value !== 0))
							return fail();
						break;
					case ConditionEvent.ConditionType.DoorOpen:
						if (game.CurrentSavegame.IsDoorLocked(conditionEvent.ObjectIndex) !== (conditionEvent.Value === 0))
							return fail();
						break;
					case ConditionEvent.ConditionType.ChestOpen:
						if (game.CurrentSavegame.IsChestLocked(conditionEvent.ObjectIndex) !== (conditionEvent.Value === 0))
							return fail();
						break;
					case ConditionEvent.ConditionType.CharacterBit:
						if (game.CurrentSavegame.GetCharacterBit(1 + (conditionEvent.ObjectIndex >>> 5), conditionEvent.ObjectIndex & 0x1f)
							!== (conditionEvent.Value !== 0))
							return fail();
						break;
					case ConditionEvent.ConditionType.PartyMember:
					{
						if ([...game.PartyMembers].some(m => (m.Index === conditionEvent.ObjectIndex &&
							(toUInt(m.Conditions) & toUInt(conditionEvent.DisallowedAilments)) === 0)) !== (conditionEvent.Value !== 0))
							return fail();
						break;
					}
					case ConditionEvent.ConditionType.ItemOwned:
					{
						let totalCount = 0;

						for (const partyMember of game.PartyMembers) {
							for (const slot of partyMember.Inventory.Slots) {
								if (slot.ItemIndex === conditionEvent.ObjectIndex)
									totalCount += slot.Amount;
							}
							for (const [, slotValue] of partyMember.Equipment.Slots) {
								if (slotValue.ItemIndex === conditionEvent.ObjectIndex)
									totalCount += slotValue.Amount;
							}
						}

						if (conditionEvent.Value === 0 && totalCount !== 0)
							return fail();
						else if (conditionEvent.Value === 1 && (totalCount === 0 || totalCount < conditionEvent.Count))
							return fail();

						break;
					}
					case ConditionEvent.ConditionType.UseItem:
					{
						if (trigger < EventTrigger.Item0) {
							// no item used
							return fail();
						}

						const itemIndex = trigger - EventTrigger.Item0;

						if (itemIndex !== conditionEvent.ObjectIndex) {
							// wrong item used
							return fail();
						}
						break;
					}
					case ConditionEvent.ConditionType.KnowsKeyword:
						if (game.CurrentSavegame.IsDictionaryWordKnown(conditionEvent.ObjectIndex) !== (conditionEvent.Value !== 0))
							return fail();
						break;
					case ConditionEvent.ConditionType.LastEventResult:
						if (lastEventStatus !== (conditionEvent.Value !== 0))
							return fail();
						break;
					case ConditionEvent.ConditionType.GameOptionSet:
						if (game.CurrentSavegame.IsGameOptionActive(1 << conditionEvent.ObjectIndex) !== (conditionEvent.Value !== 0))
							return fail();
						break;
					case ConditionEvent.ConditionType.CanSee:
					{
						const canSee = game.CanSee();
						if (canSee !== (conditionEvent.Value !== 0))
							return fail();
						break;
					}
					case ConditionEvent.ConditionType.Direction:
					{
						if ((game.PlayerDirection === conditionEvent.ObjectIndex) !== (conditionEvent.Value !== 0))
							return fail();
						break;
					}
					case ConditionEvent.ConditionType.HasCondition:
						if (hasFlag(game.CurrentPartyMember.Conditions, 1 << conditionEvent.ObjectIndex) !== (conditionEvent.Value !== 0))
							return fail();
						break;
					case ConditionEvent.ConditionType.Hand:
						if ((trigger === EventTrigger.Hand) !== (conditionEvent.Value !== 0))
							return fail();
						break;
					case ConditionEvent.ConditionType.SayWord:
					{
						const isStartEvent = conversationPartner?.EventList?.includes(event) === true ||
							map.EventList.includes(event);

						if (isStartEvent && (trigger === EventTrigger.Mouth) !== (conditionEvent.Value !== 0)) {
							aborted = true;
							return result(null);
						}
						if (!isStartEvent || trigger === EventTrigger.Mouth) {
							game.SayWord(map, x, y, events, conditionEvent);
							return result(null);
						}
						break;
					}
					case ConditionEvent.ConditionType.EnterNumber:
					{
						game.EnterNumber(map, x, y, events, conditionEvent);
						return result(null);
					}
					case ConditionEvent.ConditionType.Levitating:
						if ((trigger === EventTrigger.Levitating) !== (conditionEvent.Value !== 0))
							return fail();
						break;
					case ConditionEvent.ConditionType.HasGold:
						if ((game.CurrentPartyMember.Gold >= conditionEvent.ObjectIndex) !== (conditionEvent.Value !== 0))
							return fail();
						break;
					case ConditionEvent.ConditionType.HasFood:
						if ((game.CurrentPartyMember.Food >= conditionEvent.ObjectIndex) !== (conditionEvent.Value !== 0))
							return fail();
						break;
					case ConditionEvent.ConditionType.Eye:
						if ((trigger === EventTrigger.Eye) !== (conditionEvent.Value !== 0))
							return fail();
						break;
					// New Ambermoon Advanced conditions
					case ConditionEvent.ConditionType.Mouth:
						if ((trigger === EventTrigger.Mouth) !== (conditionEvent.Value !== 0))
							return fail();
						break;
					case ConditionEvent.ConditionType.TransportAtLocation:
					{
						const transport = firstOrDefault(game.CurrentSavegame.TransportLocations, l => l != null && l.MapIndex === map.Index && l.Position.X === x + 1 && l.Position.Y === y + 1);
						let res = true;
						if (transport == null) {
							res = false;
						} else if (conditionEvent.ObjectIndex !== 0 && conditionEvent.ObjectIndex !== transport.TravelType) {
							res = false;
						}
						if (res !== (conditionEvent.Value !== 0))
							return fail();
						break;
					}
					case ConditionEvent.ConditionType.MultiCursor:
					{
						const flags = conditionEvent.ObjectIndex;
						let res = false;

						if (trigger === EventTrigger.Hand && (flags & 0x1) !== 0)
							res = true;
						else if (trigger === EventTrigger.Eye && (flags & 0x2) !== 0)
							res = true;
						else if (trigger === EventTrigger.Mouth && (flags & 0x4) !== 0)
							res = true;
						if (res !== (conditionEvent.Value !== 0))
							return fail();
						break;
					}
					case ConditionEvent.ConditionType.TravelType:
						if ((game.TravelType === conditionEvent.ObjectIndex) !== (conditionEvent.Value !== 0))
							return fail();
						break;
					case ConditionEvent.ConditionType.LeadClass:
						if ((game.CurrentPartyMember.Class === conditionEvent.ObjectIndex) !== (conditionEvent.Value !== 0))
							return fail();
						break;
					case ConditionEvent.ConditionType.SpellEmpowered:
					{
						const elementIndex = conditionEvent.ObjectIndex;

						if (elementIndex > 2)
							return fail();

						const mask = (1 << (4 + elementIndex));

						if (((game.CurrentPartyMember.BattleFlags & mask) !== 0) !== (conditionEvent.Value !== 0))
							return fail();
						break;
					}
					case ConditionEvent.ConditionType.IsNight:
						if (game.IsNight() !== (conditionEvent.Value !== 0))
							return fail();
						break;
					case ConditionEvent.ConditionType.Attribute:
					{
						const attribute = game.CurrentPartyMember.Attributes[conditionEvent.ObjectIndex];
						let totalValue = attribute.CurrentValue + attribute.BonusValue;

						// Anti-magic bonus
						if (conditionEvent.ObjectIndex === Attribute.AntiMagic &&
							game.CurrentSavegame.IsSpellActive(ActiveSpellType.AntiMagic)) {
							totalValue += game.CurrentSavegame.GetActiveSpellLevel(ActiveSpellType.AntiMagic);
						}

						if ((totalValue >= conditionEvent.Count) !== (conditionEvent.Value !== 0))
							return fail();
						break;
					}
					case ConditionEvent.ConditionType.Skill:
					{
						const skill = game.CurrentPartyMember.Skills[conditionEvent.ObjectIndex];
						let totalValue = skill.CurrentValue + skill.BonusValue;

						// Search bonus in AA
						if (conditionEvent.ObjectIndex === Skill.Searching &&
							hasFlag(game.Features, Features.ClairvoyanceGrantsSearchSkill) &&
							game.CurrentSavegame.IsSpellActive(ActiveSpellType.Clairvoyance)) {
							totalValue += game.CurrentSavegame.GetActiveSpellLevel(ActiveSpellType.Clairvoyance);
						}

						if ((totalValue >= conditionEvent.Count) !== (conditionEvent.Value !== 0))
							return fail();
						break;
					}
					case ConditionEvent.ConditionType.HourTime:
					{
						const minute = conditionEvent.ObjectIndex;
						const currentMinute = game.GameTime?.Minute ?? 0;

						if ((minute === currentMinute) !== (conditionEvent.Value !== 0))
							return fail();
						break;
					}
				}

				// For some follow-up events we won't proceed by using Eye, Hand or Mouth.
				if (conversationPartner == null && conditionEvent.Next != null &&
					trigger !== EventTrigger.Move && trigger !== EventTrigger.Always &&
					conditionEvent.TypeOfCondition !== ConditionEvent.ConditionType.Hand &&
					conditionEvent.TypeOfCondition !== ConditionEvent.ConditionType.Eye &&
					conditionEvent.TypeOfCondition !== ConditionEvent.ConditionType.Mouth &&
					conditionEvent.TypeOfCondition !== ConditionEvent.ConditionType.UseItem &&
					conditionEvent.TypeOfCondition !== ConditionEvent.ConditionType.Levitating &&
					conditionEvent.TypeOfCondition !== ConditionEvent.ConditionType.EnterNumber &&
					conditionEvent.TypeOfCondition !== ConditionEvent.ConditionType.SayWord &&
					conditionEvent.TypeOfCondition !== ConditionEvent.ConditionType.LastEventResult) {
					let next = conditionEvent.Next;

					while (next != null && (next.Type === EventType.Condition || next.Type === EventType.PartyMemberCondition ||
						next.Type === EventType.Action || next.Type === EventType.Reward ||
						next.Type === EventType.ChangeMusic || next.Type === EventType.Dice100Roll))
						next = next.Next;

					if (next != null) {
						switch (next.Type) {
							case EventType.Teleport:
							case EventType.StartBattle:
							case EventType.Riddlemouth:
								aborted = true;
								return result(null);
						}
					}
				}

				const followEvent = conditionEvent.Next;
				if (followEvent == null || !(followEvent instanceof ConditionEvent) ||
					(followEvent.TypeOfCondition !== ConditionEvent.ConditionType.Eye &&
					 followEvent.TypeOfCondition !== ConditionEvent.ConditionType.Hand &&
					 followEvent.TypeOfCondition !== ConditionEvent.ConditionType.Mouth))
					trigger = EventTrigger.Always; // following events should not dependent on the trigger anymore in that case

				break;
			}
			case EventType.Action:
			{
				if (!(event instanceof ActionEvent))
					throw new AmbermoonException(ExceptionScope.Data, 'Invalid action event.');
				const actionEvent = event;

				const ClearSetToggle = currentValueRetriever => {
					switch (actionEvent.Value) {
						case 0: // Clear
							return false;
						case 1: // Set
							return true;
						case 2: // Toggle
							return !currentValueRetriever();
						default: // Leave as it is
							return currentValueRetriever();
					}
				};

				switch (actionEvent.TypeOfAction) {
					case ActionEvent.ActionType.SetGlobalVariable:
						game.CurrentSavegame.SetGlobalVariable(actionEvent.ObjectIndex,
							ClearSetToggle(() => game.CurrentSavegame.GetGlobalVariable(actionEvent.ObjectIndex)));
						break;
					case ActionEvent.ActionType.SetEventBit:
					{
						const mapIndex = 1 + (actionEvent.ObjectIndex >>> 6);
						const eventIndex = actionEvent.ObjectIndex & 0x3f;
						game.SetMapEventBit(mapIndex, eventIndex,
							ClearSetToggle(() => game.CurrentSavegame.GetEventBit(mapIndex, eventIndex)));
						break;
					}
					case ActionEvent.ActionType.LockDoor:
						if (ClearSetToggle(() => !game.CurrentSavegame.IsDoorLocked(actionEvent.ObjectIndex)))
							game.CurrentSavegame.UnlockDoor(actionEvent.ObjectIndex);
						else
							game.CurrentSavegame.LockDoor(actionEvent.ObjectIndex);
						break;
					case ActionEvent.ActionType.LockChest:
						if (ClearSetToggle(() => !game.CurrentSavegame.IsChestLocked(actionEvent.ObjectIndex)))
							game.CurrentSavegame.UnlockChest(actionEvent.ObjectIndex);
						else
							game.CurrentSavegame.LockChest(actionEvent.ObjectIndex);
						break;
					case ActionEvent.ActionType.SetCharacterBit:
					{
						const mapIndex = 1 + (actionEvent.ObjectIndex >>> 5);
						const eventIndex = actionEvent.ObjectIndex & 0x1f;
						game.SetMapCharacterBit(mapIndex, eventIndex,
							ClearSetToggle(() => game.CurrentSavegame.GetCharacterBit(mapIndex, eventIndex)));
						break;
					}
					case ActionEvent.ActionType.AddItem:
					{
						// Note: This is never used in Ambermoon with value 1. So it always removes items only.
						// Giving items is either done through a chest event or the conversation create event.
						const itemIndex = actionEvent.ObjectIndex;
						if (itemIndex > 0) {
							if (actionEvent.Value === 1) { // Add
								let numberToAdd = Math.max(1, actionEvent.Count);
								for (const partyMember of game.PartyMembers) {
									numberToAdd = game.DropItem(partyMember, itemIndex, numberToAdd);

									if (numberToAdd === 0)
										break;
								}
								// Ignore the rest as we couldn't do anything about it.
							} else if (actionEvent.Value === 0) { // Remove
								let numberToRemove = Math.max(1, actionEvent.Count);
								// Prefer inventory
								for (const partyMember of game.PartyMembers) {
									for (const slot of partyMember.Inventory.Slots) {
										if (slot?.ItemIndex === itemIndex) {
											const slotCount = slot.Amount;
											slot.Remove(Math.min(numberToRemove, slotCount));
											const numRemoved = slotCount - slot.Amount;
											game.InventoryItemRemoved(itemIndex, numRemoved, partyMember);
											numberToRemove -= numRemoved;

											if (numberToRemove === 0)
												break;
										}
									}

									if (numberToRemove === 0)
										break;
								}
								for (const partyMember of game.PartyMembers) {
									for (const slot of partyMember.Equipment.Slots.values()) {
										if (slot?.ItemIndex === itemIndex) {
											const slotCount = slot.Amount;
											const cursed = hasFlag(slot.Flags, ItemSlotFlags.Cursed);
											slot.Remove(Math.min(numberToRemove, slotCount));
											const numRemoved = slotCount - slot.Amount;
											game.EquipmentRemoved(partyMember, itemIndex, numRemoved, cursed);
											numberToRemove -= numRemoved;

											if (numberToRemove === 0)
												break;
										}
									}

									if (numberToRemove === 0)
										break;
								}
							}
						}
						break;
					}
					case ActionEvent.ActionType.AddKeyword:
						// Note: This may also remove a keyword but this is no real use case.
						// We will only add keywords here and ignore the action value.
						// The original code seems to do the same.
						game.CurrentSavegame.AddDictionaryWord(actionEvent.ObjectIndex);
						break;
					case ActionEvent.ActionType.SetGameOption:
					{
						const option = 1 << actionEvent.ObjectIndex;
						game.CurrentSavegame.SetGameOption(option, ClearSetToggle(() => game.CurrentSavegame.IsGameOptionActive(option)));
						break;
					}
					case ActionEvent.ActionType.SetDirection:
					{
						game.SetPlayerDirection(actionEvent.ObjectIndex % 5);
						break;
					}
					case ActionEvent.ActionType.AddCondition:
					{
						const condition = 1 << actionEvent.ObjectIndex;
						if (ClearSetToggle(() => hasFlag(game.CurrentPartyMember.Conditions, condition)))
							game.AddCondition(condition);
						else
							game.RemoveCondition(condition, game.CurrentPartyMember);
						break;
					}
					case ActionEvent.ActionType.AddGold:
						// Note: The original code always removes the gold. But as this is not used
						// at all I think controlling the behavior with the value bit is better.
						if (actionEvent.Value === 1) // Add
							game.DistributeGold(actionEvent.ObjectIndex, true);
						else if (actionEvent.Value === 0) { // Remove
							const partyMembers = [...game.PartyMembers];
							let totalGoldToRemove = Math.min(actionEvent.ObjectIndex, partyMembers.reduce((s, p) => s + p.Gold, 0));
							const goldToRemovePerPlayer = Math.trunc(totalGoldToRemove / partyMembers.length);
							let singleGoldMemberCount = totalGoldToRemove % partyMembers.length;

							for (const partyMember of partyMembers) {
								let goldToRemove = goldToRemovePerPlayer;

								if (singleGoldMemberCount !== 0)
									++goldToRemove;

								const removeAmount = Math.min(goldToRemove, partyMember.Gold);

								if (removeAmount === goldToRemove)
									--singleGoldMemberCount;

								partyMember.Gold = toUShort(Math.max(0, partyMember.Gold - removeAmount));
								partyMember.TotalWeight = toUInt(partyMember.TotalWeight - removeAmount * Character.GoldWeight);
								totalGoldToRemove -= removeAmount;
							}

							if (totalGoldToRemove !== 0) {
								for (const partyMember of partyMembers) {
									if (partyMember.Gold !== 0) {
										const removeAmount = Math.min(totalGoldToRemove, partyMember.Gold);
										partyMember.Gold = toUShort(Math.max(0, partyMember.Gold - removeAmount));
										partyMember.TotalWeight = toUInt(partyMember.TotalWeight - removeAmount * Character.GoldWeight);
										totalGoldToRemove -= removeAmount;
									}
								}
							}
						}
						break;
					case ActionEvent.ActionType.AddFood:
						// Note: The original code always removes the food. But as this is not used
						// at all I think controlling the behavior with the value bit is better.
						if (actionEvent.Value === 1) // Add
							game.DistributeFood(actionEvent.ObjectIndex, true);
						else if (actionEvent.Value === 0) { // Remove
							const partyMembers = [...game.PartyMembers];
							let totalFoodToRemove = Math.min(actionEvent.ObjectIndex, partyMembers.reduce((s, p) => s + p.Food, 0));
							const foodToRemovePerPlayer = Math.trunc(totalFoodToRemove / partyMembers.length);
							let singleFoodMemberCount = totalFoodToRemove % partyMembers.length;

							for (const partyMember of partyMembers) {
								let foodToRemove = foodToRemovePerPlayer;

								if (singleFoodMemberCount !== 0)
									++foodToRemove;

								const removeAmount = Math.min(foodToRemove, partyMember.Food);

								if (removeAmount === foodToRemove)
									--singleFoodMemberCount;

								partyMember.Food = toUShort(Math.max(0, partyMember.Food - removeAmount));
								partyMember.TotalWeight = toUInt(partyMember.TotalWeight - removeAmount * Character.FoodWeight);
								totalFoodToRemove -= removeAmount;
							}

							if (totalFoodToRemove !== 0) {
								for (const partyMember of partyMembers) {
									if (partyMember.Food !== 0) {
										const removeAmount = Math.min(totalFoodToRemove, partyMember.Food);
										partyMember.Food = toUShort(Math.max(0, partyMember.Food - removeAmount));
										partyMember.TotalWeight = toUInt(partyMember.TotalWeight - removeAmount * Character.FoodWeight);
										totalFoodToRemove -= removeAmount;
									}
								}
							}
						}
						break;
				}

				break;
			}
			case EventType.Dice100Roll:
			{
				if (!(event instanceof Dice100RollEvent))
					throw new AmbermoonException(ExceptionScope.Data, 'Invalid dice 100 event.');
				const diceEvent = event;

				const mapEventIfFalse = diceEvent.ContinueIfFalseWithMapEventIndex === 0xffff
					? null : events[diceEvent.ContinueIfFalseWithMapEventIndex];
				lastEventStatus = game.RollDice100() < diceEvent.Chance;
				return result(lastEventStatus ? diceEvent.Next : mapEventIfFalse);
			}
			case EventType.Conversation:
			{
				if (!(event instanceof ConversationEvent))
					throw new AmbermoonException(ExceptionScope.Data, 'Invalid conversation event.');
				const conversationEvent = event;

				switch (conversationEvent.Interaction) {
					case ConversationEvent.InteractionType.Talk:
						if (trigger !== EventTrigger.Mouth) {
							aborted = true;
							return result(null);
						}
						game.ShowConversation(conversationPartner, characterIndex, conversationEvent, new ConversationItems());
						return result(null);
					default:
						// Note: this is handled by the conversation window.
						// It should never appear inside a running event chain.
						aborted = true;
						return result(null);
				}
			}
			case EventType.PrintText:
			case EventType.Create:
			case EventType.Exit:
			case EventType.Interact:
			{
				// Note: These are only used by conversations and are handled in
				// game.ShowConversation. So we don't need to do anything here.
				throw new AmbermoonException(ExceptionScope.Data, 'Conversation events must not be called outside of conversations.');
			}
			case EventType.Decision:
			{
				if (!(event instanceof DecisionEvent))
					throw new AmbermoonException(ExceptionScope.Data, 'Invalid decision event.');
				const decisionEvent = event;

				game.ShowDecisionPopup(map, decisionEvent, response => {
					if (response === PopupTextEvent.Response.Yes) {
						EventExtensions.TriggerEventChain(map, game, EventTrigger.Always,
							x, y, event.Next, true);
					} else { // Close and No have the same meaning here
						if (decisionEvent.NoEventIndex !== 0xffff) {
							EventExtensions.TriggerEventChain(map, game, EventTrigger.Always,
								x, y, events[decisionEvent.NoEventIndex], false);
						}
					}
				});
				return result(null); // next event is only executed after popup response
			}
			case EventType.ChangeMusic:
			{
				if (!(event instanceof ChangeMusicEvent))
					throw new AmbermoonException(ExceptionScope.Data, 'Invalid change music event.');
				const changeMusicEvent = event;
				game.PlayMusic(changeMusicEvent.MusicIndex);
				break;
			}
			case EventType.Spawn:
			{
				if (!(event instanceof SpawnEvent))
					throw new AmbermoonException(ExceptionScope.Data, 'Invalid spawn event.');
				const spawnEvent = event;
				game.SpawnTransport(spawnEvent.MapIndex === 0 ? map.Index : spawnEvent.MapIndex,
					spawnEvent.X, spawnEvent.Y, spawnEvent.TravelType);
				lastEventStatus = true;
				break;
			}
			case EventType.RemovePartyMember:
				// TODO
				break;
			case EventType.Delay:
			{
				if (!(event instanceof DelayEvent))
					throw new AmbermoonException(ExceptionScope.Data, 'Invalid delay event.');
				const delayEvent = event;
				game.StartSequence();
				game.AddTimedEvent(delayEvent.Milliseconds, () => {
					game.EndSequence(false);

					if (event.Next != null)
						EventExtensions.TriggerEventChain(map, game, EventTrigger.Always, x, y, event.Next, true);
				});
				return result(null);
			}
			case EventType.PartyMemberCondition:
			{
				if (!(event instanceof PartyMemberConditionEvent))
					throw new AmbermoonException(ExceptionScope.Data, 'Invalid party member condition event.');
				const conditionEvent = event;

				const mapEventIfFalse = conditionEvent.ContinueIfFalseWithMapEventIndex === 0xffff
					? null : events[conditionEvent.ContinueIfFalseWithMapEventIndex];
				const comparator = conditionEvent.TypeOfCondition === PartyMemberConditionEvent.PartyMemberConditionType.Language
					? value => ((toUInt(value) >>> conditionEvent.ConditionValueIndex) & 0x1) !== 0
					: value => value >= conditionEvent.Value;

				const GetAttribute = partyMember => {
					if (conditionEvent.ConditionValueIndex >= 8)
						throw new AmbermoonException(ExceptionScope.Data, `Invalid party member condition attribute index: ${conditionEvent.ConditionValueIndex}`);

					return partyMember.Attributes[conditionEvent.ConditionValueIndex].TotalCurrentValue;
				};

				const GetSkill = partyMember => {
					if (conditionEvent.ConditionValueIndex >= 10)
						throw new AmbermoonException(ExceptionScope.Data, `Invalid party member condition skill index: ${conditionEvent.ConditionValueIndex}`);

					return partyMember.Skills[conditionEvent.ConditionValueIndex].TotalCurrentValue;
				};

				let extractor;
				switch (conditionEvent.TypeOfCondition) {
					case PartyMemberConditionEvent.PartyMemberConditionType.Level:
						extractor = partyMember => partyMember.Level;
						break;
					case PartyMemberConditionEvent.PartyMemberConditionType.Attribute:
						extractor = GetAttribute;
						break;
					case PartyMemberConditionEvent.PartyMemberConditionType.Skill:
						extractor = GetSkill;
						break;
					case PartyMemberConditionEvent.PartyMemberConditionType.TrainingPoints:
						extractor = partyMember => partyMember.TrainingPoints;
						break;
					case PartyMemberConditionEvent.PartyMemberConditionType.Language:
						extractor = partyMember => toUInt(partyMember.SpokenLanguages | (partyMember.SpokenExtendedLanguages << 8));
						break;
					default:
						throw new AmbermoonException(ExceptionScope.Data, `Invalid party member condition type: ${enumName(PartyMemberConditionEvent.PartyMemberConditionType, conditionEvent.TypeOfCondition)}`);
				}

				const filter = conditionEvent.DisallowedAilments === Condition.None
					? (_ => true)
					: (partyMember => (toUShort(partyMember.Conditions) & toUShort(conditionEvent.DisallowedAilments)) === 0);

				const partyMembers = [...game.PartyMembers].filter(p => p != null);

				const CheckSingle = partyMember => comparator(extractor(partyMember));

				const CheckAggregation = aggregator => {
					const values = partyMembers.filter(filter).map(p => extractor(p));

					if (values.length === 0)
						return false;

					return comparator(aggregator(values));
				};

				const CheckRandom = () => {
					const possible = partyMembers.filter(filter);

					if (possible.length === 0)
						return false;

					return comparator(extractor(possible[game.RandomInt(0, possible.length - 1)]));
				};

				const CheckPartyMember = index => {
					const partyMember = firstOrDefault(partyMembers, p => p.Index === index && filter(p));

					return partyMember != null && CheckSingle(partyMember);
				};

				let res;
				const Target = PartyMemberConditionEvent.PartyMemberConditionTarget;
				switch (conditionEvent.Target) {
					case Target.ActivePlayer:
						res = filter(game.CurrentPartyMember) && CheckSingle(game.CurrentPartyMember);
						break;
					case Target.All:
						res = partyMembers.length === partyMembers.filter(filter).length && partyMembers.every(CheckSingle);
						break;
					case Target.Any:
						res = partyMembers.filter(filter).some(CheckSingle);
						break;
					case Target.Min:
						res = CheckAggregation(values => min(values));
						break;
					case Target.Max:
						res = CheckAggregation(values => max(values));
						break;
					case Target.Average:
						res = CheckAggregation(values => average(values));
						break;
					case Target.Random:
						res = CheckRandom();
						break;
					case Target.ActiveInventory:
						res = filter(game.CurrentInventory) && CheckSingle(game.CurrentInventory);
						break;
					default:
						if (conditionEvent.Target >= Target.FirstCharacter)
							res = CheckPartyMember(1 + conditionEvent.Target - Target.FirstCharacter);
						else
							throw new Error('SwitchExpressionException: unhandled party member condition target');
						break;
				}

				if (!res) {
					aborted = mapEventIfFalse == null;
					lastEventStatus = false;
					return result(mapEventIfFalse);
				}

				break;
			}
			case EventType.Shake:
			{
				if (!(event instanceof ShakeEvent))
					throw new AmbermoonException(ExceptionScope.Data, 'Invalid shake event.');
				const shakeEvent = event;
				if (shakeEvent.Shakes > 0) {
					game.StartSequence();
					const shakeTime = 6000.0 / GameCore.TicksPerSecond; // TimeSpan in ms
					game.ShakeScreen(shakeTime, shakeEvent.Shakes, 3);
					game.AddTimedEvent(shakeTime * shakeEvent.Shakes, () => {
						game.EndSequence(false);

						if (event.Next != null)
							EventExtensions.TriggerEventChain(map, game, EventTrigger.Always, x, y, event.Next, true);
					});
					return result(null);
				}
				break;
			}
			case EventType.ShowMap:
			{
				if (!(event instanceof ShowMapEvent))
					throw new AmbermoonException(ExceptionScope.Data, 'Invalid show map event.');
				const showMapEvent = event;

				const automapOptions = new AutomapOptions();
				automapOptions.SecretDoorsVisible = hasFlag(showMapEvent.Options, ShowMapEvent.MapOptions.ShowSecretDoors);
				automapOptions.MonstersVisible = hasFlag(showMapEvent.Options, ShowMapEvent.MapOptions.ShowMonsters);
				automapOptions.PersonsVisible = hasFlag(showMapEvent.Options, ShowMapEvent.MapOptions.ShowPersons);
				automapOptions.TrapsVisible = hasFlag(showMapEvent.Options, ShowMapEvent.MapOptions.ShowTraps);
				automapOptions.ShowGotoPoints = false; // Important so the event chain is ensured to continue at the same spot

				game.ShowAutomap(automapOptions, () => {
					if (event.Next != null)
						EventExtensions.TriggerEventChain(map, game, EventTrigger.Always, x, y, event.Next, true);
				});
				return result(null);
			}
			case EventType.ToggleSwitch:
			{
				if (!(event instanceof ToggleSwitchEvent))
					throw new AmbermoonException(ExceptionScope.Data, 'Invalid toggle switch event.');
				const toggleSwitchEvent = event;

				if (map != null) {
					const isOn = game.GetMapFrontTileIndex(map, x, y) === toggleSwitchEvent.FrontTileIndexOn;

					const changeTileEvent = new ChangeTileEvent();
					changeTileEvent.X = x + 1; // The logic expects the coordinates to be
					changeTileEvent.Y = y + 1; // 1-based while here x and y are 0-based.
					changeTileEvent.MapIndex = map.Index;
					changeTileEvent.FrontTileIndex = isOn ? toggleSwitchEvent.FrontTileIndexOff : toggleSwitchEvent.FrontTileIndexOn;
					game.UpdateMapTile(changeTileEvent);

					const globalVariables = [...toggleSwitchEvent.GlobalVariables].filter(gv => gv !== 0);
					const savegame = game.CurrentSavegame;

					for (const globalVariable of globalVariables) {
						savegame.SetGlobalVariable(globalVariable, !savegame.GetGlobalVariable(globalVariable));
					}
				}
				return result(event.Next);
			}
			case EventType.DynamicChangeTile:
			{
				if (!(event instanceof DynamicChangeTileEvent))
					throw new AmbermoonException(ExceptionScope.Data, 'Invalid dynamic change tile event.');
				const dynamicChangeTileEvent = event;

				const globalVarSet = game.CurrentSavegame.GetGlobalVariable(dynamicChangeTileEvent.GlobalVariable);
				const frontTileIndex = globalVarSet ? dynamicChangeTileEvent.FrontTileIndexOn : dynamicChangeTileEvent.FrontTileIndexOff;

				const changeTileEvent = new ChangeTileEvent();
				changeTileEvent.Type = EventType.ChangeTile;
				changeTileEvent.X = dynamicChangeTileEvent.X;
				changeTileEvent.Y = dynamicChangeTileEvent.Y;
				changeTileEvent.MapIndex = dynamicChangeTileEvent.MapIndex;
				changeTileEvent.FrontTileIndex = frontTileIndex;
				changeTileEvent.Next = dynamicChangeTileEvent.Next;

				return EventExtensions.ExecuteEvent(changeTileEvent, map, game, trigger, x, y, lastEventStatus, conversationPartner, characterIndex);
			}
			case EventType.RectangularExploration:
			{
				if (!(event instanceof RectangularExplorationEvent))
					throw new AmbermoonException(ExceptionScope.Data, 'Invalid rectangular exploration event.');
				const rectangularExplorationEvent = event;

				game.ExploreMapArea(rectangularExplorationEvent);
				break;
			}
			case EventType.VerticalLineReveal:
			{
				if (!(event instanceof VerticalLineRevealEvent))
					throw new AmbermoonException(ExceptionScope.Data, 'Invalid vertical line reveal event.');
				const verticalLineRevealEvent = event;

				game.ExploreMapArea(verticalLineRevealEvent);
				break;
			}
			default:
				// web port: game specific events (Amberstar altar, src/amberstar/extensions/altar.js) execute themselves
				if (typeof event.ExecuteCustom === 'function') {
					aborted = !event.ExecuteCustom(game, map, trigger, x, y);
					return result(null);
				}
				console.log(`Unknown event type found: ${enumName(EventType, event.Type)}`);
				return result(event.Next);
		}

		return result(event.Next);
	}

	static TriggerEventChain(map, game, trigger, x, y, firstMapEvent, lastEventStatus = false) {
		let mapEvent = firstMapEvent;

		while (mapEvent != null) {
			let aborted;
			[mapEvent, trigger, lastEventStatus, aborted] = EventExtensions.ExecuteEvent(mapEvent, map, game, trigger, x, y, lastEventStatus);

			if (aborted)
				return false;
		}

		return true;
	}

	static GetSecondaryBranchSuccessor(event, events) {
		let nextEventIndex = 0xffff;

		if (event instanceof ConditionEvent)
			nextEventIndex = event.ContinueIfFalseWithMapEventIndex;
		else if (event instanceof Dice100RollEvent)
			nextEventIndex = event.ContinueIfFalseWithMapEventIndex;
		else if (event instanceof DoorEvent)
			nextEventIndex = event.UnlockFailedEventIndex;
		else if (event instanceof ChestEvent)
			nextEventIndex = event.UnlockFailedEventIndex;
		else if (event instanceof DecisionEvent)
			nextEventIndex = event.NoEventIndex;
		else if (event instanceof PartyMemberConditionEvent)
			nextEventIndex = event.ContinueIfFalseWithMapEventIndex;

		return nextEventIndex === 0xffff ? null : events[nextEventIndex];
	}
}

export { EventProvider as EventExtensions_EventProvider };
