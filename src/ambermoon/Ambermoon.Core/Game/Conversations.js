// Port of Ambermoon.Core/Game/Conversations.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { Position } from '../../Ambermoon.Common/Position.js';
import { Rect } from '../../Ambermoon.Common/Rect.js';
import { Size } from '../../Ambermoon.Common/Size.js';
import { CollectionExtensions } from '../../Ambermoon.Common/CollectionExtensions.js';
import { Character } from '../../Ambermoon.Data.Common/Character.js';
import { PartyMember } from '../../Ambermoon.Data.Common/PartyMember.js';
import { ItemSlot } from '../../Ambermoon.Data.Common/ItemSlot.js';
import { ItemStorageExtensions } from '../../Ambermoon.Data.Common/IItemStorage.js';
import { CursorType } from '../../Ambermoon.Data.Common/CursorType.js';
import {
	ConversationEvent, EventType, PopupTextEvent, PrintTextEvent, ExitEvent,
	CreateEvent, InteractEvent, ActionEvent
} from '../../Ambermoon.Data.Common/Event.js';
import { Condition } from '../../Ambermoon.Data.Common/Enumerations/Condition.js';
import { World } from '../../Ambermoon.Data.Common/Enumerations/World.js';
import { CharacterType } from '../../Ambermoon.Data.Common/Enumerations/CharacterType.js';
import { Color as TextColor } from '../../Ambermoon.Data.Common/Enumerations/Color.js';
import { EventTrigger } from '../MapExtensions.js';
import { EventExtensions } from '../EventExtensions.js';
import { TextAlign } from '../Render/TextAlign.js';
import { Window } from '../UI/Window.js';
import { ItemGrid } from '../UI/ItemGrid.js';
import { LayoutType } from '../UI/Layout.js';
import { ScrollbarType } from '../UI/ScrollbarType.js';
import { MouseButtons } from '../MouseButtons.js';
import { count, firstOrDefault, getValue, hasFlag, newArray, range, removeItem, toUShort } from '../../../runtime.js';

// GameCore.MaxPartyMembers (declared in Party.cs)
const MaxPartyMembers = 6;

export class GameCore_Conversations {
	static initFields(self) {
		self.ConversationTextActive = false;
	}

	/**
	 * A conversation is started with a Conversation event but the
	 * displayed text depends on the following events. Mostly
	 * Condition and PrintText events. The argument conversationEvent
	 * is the initial conversation event of interaction type 'Talk'
	 * and should be used to determine the text to print etc.
	 *
	 * The event chain may also contain rewards, new keywords, etc.
	 */
	ShowConversation(conversationPartner, characterIndex, conversationEvent, createdItems, showInitialText = true) {
		if (!(conversationPartner instanceof Character))
			throw new AmbermoonException(ExceptionScope.Application, 'Conversation partner is no character.');
		const character = conversationPartner;

		if ((character.SpokenLanguages & this.CurrentPartyMember.SpokenLanguages) === 0 &&
			(character.SpokenExtendedLanguages & this.CurrentPartyMember.SpokenExtendedLanguages) === 0) {
			this.ShowMessagePopup(this.DataNameProvider.YouDontSpeakSameLanguage);
			return;
		}

		const GetMatchingEvents = filter =>
			conversationPartner.EventList.filter(e => e instanceof ConversationEvent).filter(filter);

		const GetFirstMatchingEvent = filter =>
			firstOrDefault(conversationPartner.EventList.filter(e => e instanceof ConversationEvent), filter);

		const SwitchPlayer = () => {
			if (this.CurrentWindow.Window === Window.Conversation) {
				this.UpdateCharacterInfo(character);
				UpdateButtons();
			}
		};

		this.OpenStorage = createdItems;
		this.ActivePlayerChanged.add(SwitchPlayer);

		conversationEvent ??= GetFirstMatchingEvent(e => e.Interaction === ConversationEvent.InteractionType.Talk);

		let creatingItems = false;
		const createdItemSlots = CollectionExtensions.ToList(createdItems.Slots);
		let currentInteractionType = ConversationEvent.InteractionType.Talk;
		let lastEventStatus = true;
		let aborted = false;
		const textArea = new Rect(17, 44, 174, 79);
		let conversationText = null;
		let itemGrid = null;
		const oldKeywords = [...this.Dictionary];
		const newKeywords = [];
		let amount = 0; // gold, food, etc
		let moveItemMessage = null;

		const ItemDragged = (slotIndex, itemSlot, amount, updateSlot) => {
			this.ExecuteNextUpdateCycle(() => {
				moveItemMessage = this.layout.AddText(textArea, this.DataNameProvider.WhereToMoveIt,
					TextColor.BrightGray, TextAlign.Center);
				const draggedSourceSlot = itemGrid.GetItemSlot(slotIndex);
				if (updateSlot)
					draggedSourceSlot.Remove(amount);
				createdItemSlots[slotIndex].Replace(draggedSourceSlot);
				itemGrid.SetItem(slotIndex, draggedSourceSlot);
			});
		};

		const DraggedItemDropped = () => {
			itemGrid.Disabled = !createdItemSlots.some(slot => !slot.Empty);
			moveItemMessage?.Destroy();
			moveItemMessage = null;

			if (creatingItems && itemGrid.Disabled) {
				creatingItems = false;
				UpdateButtons();
				HandleEvent();
			}
		};

		const UpdateButtons = () => {
			const enableItemButtons = this.CurrentPartyMember.Inventory.Slots.some(s => s?.Empty === false);
			this.layout.EnableButton(3, enableItemButtons);
			this.layout.EnableButton(6, enableItemButtons);
			this.layout.EnableButton(7, this.CurrentPartyMember.Gold !== 0);
			this.layout.EnableButton(8, this.CurrentPartyMember.Food !== 0);
		};

		const CleanUp = () => {
			this.layout.DraggedItemDropped.remove(DraggedItemDropped);
			this.ActivePlayerChanged.remove(SwitchPlayer);
			this.ConversationTextActive = false;
			this.layout.ButtonsDisabled = false;
		};

		this.layout.DraggedItemDropped.add(DraggedItemDropped);
		this.closeWindowHandler = _ => CleanUp();

		const SetText = (text, followAction = null) => {
			conversationText.Visible = true;
			conversationText.SetText(this.ProcessText(text));
			const TextClicked = toEnd => {
				if (toEnd) {
					conversationText.Clicked.remove(TextClicked);
					conversationText.Visible = false;
					this.InputEnable = true;
					this.ConversationTextActive = false;
					this.ExecuteNextUpdateCycle(() => {
						this.CursorType = CursorType.Sword;
						followAction?.();
					});
				}
			};
			conversationText.Clicked.add(TextClicked);
			this.CursorType = CursorType.Click;
			this.InputEnable = false;
			this.ConversationTextActive = true;
		};

		const SayWord = keyword => {
			this.ClosePopup();
			this.UntrapMouse();

			for (const e of GetMatchingEvents(e => e.Interaction === ConversationEvent.InteractionType.Keyword)) {
				const expectedKeyword = this.textDictionary.Entries[e.KeywordIndex];

				if (compareIgnoreCase(keyword, expectedKeyword) === 0) {
					currentInteractionType = ConversationEvent.InteractionType.Keyword;
					conversationEvent = e;
					this.layout.ButtonsDisabled = true;
					aborted = false;
					lastEventStatus = true;
					HandleNextEvent();
					return;
				}
			}

			// There is no event for it so just display a message.
			SetText(this.DataNameProvider.DontKnowAnythingSpecialAboutIt);
		};

		const ShowDictionary = () => {
			aborted = false;
			this.OpenDictionary(SayWord, word => !oldKeywords.includes(word) || newKeywords.includes(word)
				? TextColor.LightYellow : TextColor.BrightGray);
		};

		const ShowItems = (text, interactionType) => {
			currentInteractionType = interactionType;

			let message = this.layout.AddText(textArea, this.ProcessText(text, textArea), TextColor.BrightGray);

			const Abort = () => {
				itemGrid.HideTooltip();
				itemGrid.ItemClicked.remove(ItemClicked);
				message?.Destroy();
				this.UntrapMouse();
				this.layout.ButtonsDisabled = false;
				this.nextClickHandler = null;
				ShowCreatedItems();
			};

			itemGrid.Disabled = false;
			itemGrid.DisableDrag = true;
			this.CursorType = CursorType.Sword;
			const itemArea = new Rect(16, 139, 151, 53);
			this.TrapMouse(itemArea);
			this.layout.ButtonsDisabled = true;
			itemGrid.Initialize(this.CurrentPartyMember.Inventory.Slots.slice(), false);
			const SetupRightClickAbort = () => {
				this.nextClickHandler = buttons => {
					if (buttons === MouseButtons.Right) {
						Abort();
						return true;
					}

					return false;
				};
			};
			SetupRightClickAbort();
			const CheckItem = itemSlot => {
				const MoveBack = followAction => {
					this.StartSequence();
					itemGrid.HideTooltip();
					itemGrid.PlayMoveAnimation(itemSlot, itemGrid.GetSlotPosition(itemGrid.SlotFromItemSlot(itemSlot)), () => {
						itemGrid.ResetAnimation(itemSlot);
						this.EndSequence();
						Abort();
						followAction?.();
					}, 650);
				};
				this.EndSequence();
				message?.Destroy();
				message = null;
				this.layout.GetItem(itemSlot).Dragged = true; // Keep it above UI
				this.UntrapMouse();
				this.layout.ButtonsDisabled = false;
				conversationEvent = GetFirstMatchingEvent(e => e.Interaction === interactionType && e.ItemIndex === itemSlot.ItemIndex);

				if (conversationEvent == null) {
					SetText(this.DataNameProvider.NotInterestedInItem, () => MoveBack(null));
				} else {
					const HandleInteraction = () => {
						HandleNextEvent(eventType => {
							// Note: A create event must also trigger the item consumption.
							// Otherwise we might have two item grids interfering.
							if (eventType === EventType.Interact || eventType === EventType.Create) {
								// If we are here the user clicked the associated text etc.
								if (interactionType === ConversationEvent.InteractionType.GiveItem) {
									let consume = eventType === EventType.Interact;

									if (!consume) {
										let _event = conversationEvent;

										while (_event != null) {
											if (_event.Type === EventType.Interact) {
												consume = true;
												break;
											}

											_event = _event.Next;
										}
									}

									if (consume) {
										// Consume
										this.StartSequence();
										itemGrid.HideTooltip();
										this.layout.DestroyItem(itemSlot, 50, true, () => {
											const itemIndex = itemSlot.ItemIndex;
											itemSlot.Remove(1);
											this.InventoryItemRemoved(itemIndex, 1, this.CurrentPartyMember);
											//ShowCreatedItems();
											this.EndSequence();
											Abort();
											if (eventType === EventType.Interact)
												HandleNextEvent(null);
											else
												HandleEvent(null);
										}, new Position(215, 75), false);
									} else
										this.ExecuteNextUpdateCycle(() => HandleNextEvent(null));
								} else { // Show item
									if (eventType === EventType.Interact)
										MoveBack(() => HandleNextEvent(null));
									else
										this.ExecuteNextUpdateCycle(() => HandleNextEvent(null));
								}
							} else if (eventType === EventType.Invalid) { // End of event chain
								MoveBack(null);
							} else {
								HandleInteraction();
							}
						});
					};

					this.layout.ButtonsDisabled = true;
					HandleInteraction();
				}
			};
			const ItemClicked = (_, slotIndex, itemSlot) => {
				itemGrid.ItemClicked.remove(ItemClicked);
				this.nextClickHandler = null;
				this.UntrapMouse();
				this.layout.ButtonsDisabled = false;
				this.StartSequence();
				itemGrid.HideTooltip();
				itemGrid.PlayMoveAnimation(itemSlot, new Position(215, 75), () => CheckItem(itemSlot), 650);
			};
			itemGrid.ItemClicked.add(ItemClicked);
		};

		const ShowItem = () => {
			aborted = false;
			ShowItems(this.DataNameProvider.WhichItemToShow, ConversationEvent.InteractionType.ShowItem);
		};

		const GiveItem = () => {
			aborted = false;
			ShowItems(this.DataNameProvider.WhichItemToGive, ConversationEvent.InteractionType.GiveItem);
		};

		const GiveGold = () => {
			aborted = false;
			this.layout.OpenAmountInputBox(this.DataNameProvider.GiveHowMuchGoldToNPC, 96, this.DataNameProvider.GoldName,
				this.CurrentPartyMember.Gold, gold => {
					this.ClosePopup();
					const _event = GetFirstMatchingEvent(e => e.Interaction === ConversationEvent.InteractionType.GiveGold);
					if (_event != null) {
						if (gold < _event.Value) {
							SetText(this.DataNameProvider.MoreGoldNeeded);
						} else {
							conversationEvent = _event;
							this.layout.ButtonsDisabled = true;
							currentInteractionType = ConversationEvent.InteractionType.GiveGold;
							amount = _event.Value;
							aborted = false;
							lastEventStatus = true;
							HandleNextEvent();
						}
					} else {
						SetText(this.DataNameProvider.NotInterestedInGold);
					}
				});
		};

		const GiveFood = () => {
			aborted = false;
			this.layout.OpenAmountInputBox(this.DataNameProvider.GiveHowMuchFoodToNPC, 109, this.DataNameProvider.FoodName,
				this.CurrentPartyMember.Food, food => {
					this.ClosePopup();
					const _event = GetFirstMatchingEvent(e => e.Interaction === ConversationEvent.InteractionType.GiveFood);
					if (_event != null) {
						if (food < _event.Value) {
							SetText(this.DataNameProvider.MoreFoodNeeded);
						} else {
							conversationEvent = _event;
							this.layout.ButtonsDisabled = true;
							currentInteractionType = ConversationEvent.InteractionType.GiveFood;
							amount = _event.Value;
							aborted = false;
							lastEventStatus = true;
							HandleNextEvent();
						}
					} else {
						SetText(this.DataNameProvider.NotInterestedInFood);
					}
				});
		};

		const AskToJoin = () => {
			aborted = false;
			if (count(this.PartyMembers) === MaxPartyMembers) {
				conversationEvent = null;
				SetText(this.DataNameProvider.PartyFull);
				this.layout.ButtonsDisabled = false;
				return;
			}

			if (character instanceof PartyMember &&
				(conversationEvent = GetFirstMatchingEvent(e => e.Interaction === ConversationEvent.InteractionType.JoinParty)) != null) {
				this.layout.ButtonsDisabled = true;
				currentInteractionType = ConversationEvent.InteractionType.JoinParty;
				aborted = false;
				lastEventStatus = true;
				HandleNextEvent();
			} else {
				SetText(this.DataNameProvider.DenyJoiningParty);
			}
		};

		const AskToLeave = () => {
			aborted = false;
			if (character instanceof PartyMember && [...this.PartyMembers].includes(character)) {
				const partyMember = character;

				if (!partyMember.Alive) {
					SetText(this.DataNameProvider.CannotSendDeadPeopleAway);
					return;
				}

				if (hasFlag(partyMember.Conditions, Condition.Crazy)) {
					SetText(this.DataNameProvider.CrazyPeopleDontFollowCommands);
					return;
				}

				if (hasFlag(partyMember.Conditions, Condition.Petrified)) {
					SetText(this.DataNameProvider.PetrifiedPeopleCantGoHome);
					return;
				}

				if (!partyMember.Alive) {
					SetText(this.DataNameProvider.CannotSendDeadPeopleAway);
					return;
				}

				if (this.Map.World !== World.Lyramion) { // TODO: You can still leave in Morag hangar and prison like in the original
					SetText(this.DataNameProvider.DenyLeavingPartyOnMoon);
					return;
				}

				if ((conversationEvent = GetFirstMatchingEvent(e => e.Interaction === ConversationEvent.InteractionType.LeaveParty)) != null) {
					currentInteractionType = ConversationEvent.InteractionType.LeaveParty;
					this.layout.ButtonsDisabled = true;
					aborted = false;
					lastEventStatus = true;
					HandleNextEvent();
				} else {
					SetText(this.DataNameProvider.WellIShouldLeave);
					RemovePartyMember(() => Exit()); // Just remove from party and close
				}
			}
		};

		const AddPartyMember = followAction => {
			for (let i = 0; i < MaxPartyMembers; ++i) {
				if (this.GetPartyMember(i) == null) {
					const partyMember = character instanceof PartyMember ? character : null;
					let partyMemberKey = 0; // default(KeyValuePair).Key
					for (const [Key, Value] of this.CurrentSavegame.PartyMembers) {
						if (Value === partyMember) {
							partyMemberKey = Key;
							break;
						}
					}
					this.CurrentSavegame.CurrentPartyMemberIndices[i] = partyMemberKey;
					this.AddPartyMember(i, partyMember, followAction, true);
					// Set battle position
					this.CurrentSavegame.BattlePositions[i] = 0xff;
					const usePositions = Array.from(this.CurrentSavegame.BattlePositions);
					for (let p = 11; p >= 0; --p) {
						if (!usePositions.includes(p)) {
							this.CurrentSavegame.BattlePositions[i] = p;
							break;
						}
					}
					this.layout.EnableButton(4, true); // Enable "Ask to leave"
					this.layout.EnableButton(5, false); // Disable "Ask to join"
					this.SetMapCharacterBit(this.Map.Index, characterIndex, true);
					if (partyMember.CharacterBitIndex === 0xffff || partyMember.CharacterBitIndex === 0x0000)
						partyMember.CharacterBitIndex = toUShort(((this.Map.Index - 1) << 5) | characterIndex);
					break;
				}
			}
		};

		const RemovePartyMember = followAction => {
			const partyMember = character instanceof PartyMember ? character : null;
			let index = partyMember.CharacterBitIndex;
			if (index === 0xffff)
				index = getValue(this.constructor.PartyMemberCharacterBits, partyMember.Index);
			const mapIndex = 1 + (index >>> 5);
			const characterIndex = index & 0x1f;
			this.RemovePartyMember(this.SlotFromPartyMember(partyMember), false, followAction);
			this.CurrentSavegame.CurrentPartyMemberIndices[this.SlotFromPartyMember(partyMember)] = 0;
			this.SetMapCharacterBit(mapIndex, characterIndex, false);
		};

		const ShowCreatedItems = () => {
			if (createdItemSlots.some(item => !item.Empty)) {
				itemGrid.Disabled = false;
				itemGrid.DisableDrag = false;
				itemGrid.Initialize(createdItemSlots, false);
			} else {
				itemGrid.Disabled = true;
			}
		};

		const CreateItem = (itemIndex, amount) => {
			// Note: Multiple items can be created. While at least one
			// item was created and is not picked up, the item grid is
			// enabled.
			let remainingCount = amount;

			for (let i = 0; i < 24; ++i) {
				if (createdItemSlots[i].Empty) {
					[remainingCount] = createdItemSlots[i].FillWithNewItem(this.ItemManager, itemIndex, remainingCount);

					if (remainingCount === 0)
						break;
				}
			}
			ShowCreatedItems();
		};

		const Exit = (showLeaveMessage = false) => {
			aborted = false;
			if (showLeaveMessage) {
				const ExitConversation = () => {
					conversationEvent = GetFirstMatchingEvent(e => e.Interaction === ConversationEvent.InteractionType.Leave);

					if (conversationEvent != null) {
						currentInteractionType = ConversationEvent.InteractionType.Leave;
						this.layout.ButtonsDisabled = true;
						aborted = false;
						lastEventStatus = true;
						HandleNextEvent();
						return;
					} else {
						SetText(this.DataNameProvider.GoodBye, () => this.CloseWindow());
						return;
					}
				};

				if (ItemStorageExtensions.HasAnyImportantItem(createdItems, this.ItemManager)) {
					aborted = true;
					SetText(this.DataNameProvider.DontForgetItems +
						[...ItemStorageExtensions.GetImportantItemNames(createdItems, this.ItemManager)].join(', ') + '.');
					return;
				}

				if (CollectionExtensions.ToList(createdItems.Slots).some(s => !s.Empty)) {
					this.ShowDecisionPopup(this.DataNameProvider.LeaveConversationWithoutItems, response => {
						if (response === PopupTextEvent.Response.Yes) {
							ExitConversation();
							return;
						}

						aborted = true;
					}, 1);
					return;
				}

				ExitConversation();
				return;
			}

			this.CloseWindow();
		};

		const HandleNextEvent = (followAction = null) => {
			conversationEvent = conversationEvent?.Next ?? null;
			this.layout.ButtonsDisabled = conversationEvent != null;
			HandleEvent(followAction);
		};

		const HandleEvent = (followAction = null) => {
			if (conversationEvent == null || aborted) {
				if (currentInteractionType === ConversationEvent.InteractionType.LeaveParty ||
					currentInteractionType === ConversationEvent.InteractionType.Leave) {
					Exit(); // After leaving the party or just leaving the conversation, close the window.
				}

				followAction?.(EventType.Invalid);

				return;
			}

			const nextAction = followAction ?? (_ => HandleNextEvent());

			if (conversationEvent instanceof PrintTextEvent) {
				const printTextEvent = conversationEvent;
				SetText(conversationPartner.Texts[printTextEvent.NPCTextIndex], () => nextAction?.(EventType.PrintText));
			} else if (conversationEvent instanceof ExitEvent) {
				// Exit event triggered after create event -> abort.
				if (creatingItems)
					return;

				Exit();
				nextAction?.(EventType.Exit);
			} else if (conversationEvent instanceof CreateEvent) {
				const createEvent = conversationEvent;
				creatingItems = true;

				// Note: It is important to trigger the next action first
				// as it might trigger a consumption of a previously given item.
				// The create item only updates the grid of created items.
				nextAction?.(EventType.Create);

				switch (createEvent.TypeOfCreation) {
					case CreateEvent.CreateType.Item:
						CreateItem(createEvent.ItemIndex, createEvent.Amount);
						break;
					case CreateEvent.CreateType.Gold:
						this.CurrentPartyMember.AddGold(createEvent.Amount);
						this.UpdateCharacterInfo(character);
						break;
					default: // food
						this.CurrentPartyMember.AddFood(createEvent.Amount);
						this.UpdateCharacterInfo(character);
						break;
				}

				if (conversationEvent === createEvent) {
					conversationEvent = conversationEvent.Next;
					this.layout.ButtonsDisabled = conversationEvent != null;

					// Sometimes multiple items are created, so do them all at once.
					if (conversationEvent instanceof CreateEvent) {
						HandleEvent();
					}
				}
				this.layout.ButtonsDisabled = conversationEvent != null;
			} else if (conversationEvent instanceof InteractEvent) {
				switch (currentInteractionType) {
					case ConversationEvent.InteractionType.GiveItem: {
						// Note: The ShowItems method will take care of it.
						nextAction?.(EventType.Interact);
						break;
					}
					case ConversationEvent.InteractionType.GiveGold:
						this.CurrentPartyMember.RemoveGold(amount);
						this.UpdateCharacterInfo(character);
						if (this.CurrentPartyMember.Gold === 0)
							this.layout.EnableButton(7, false);
						nextAction?.(EventType.Interact);
						break;
					case ConversationEvent.InteractionType.GiveFood:
						this.CurrentPartyMember.RemoveFood(amount);
						this.UpdateCharacterInfo(character);
						if (this.CurrentPartyMember.Food === 0)
							this.layout.EnableButton(8, false);
						nextAction?.(EventType.Interact);
						break;
					case ConversationEvent.InteractionType.JoinParty:
						AddPartyMember(() => nextAction?.(EventType.Interact));
						break;
					case ConversationEvent.InteractionType.LeaveParty:
						RemovePartyMember(() => nextAction?.(EventType.Interact));
						break;
					case ConversationEvent.InteractionType.Leave:
						Exit();
						nextAction?.(EventType.Interact);
						break;
					default:
						nextAction?.(EventType.Interact);
						break;
				}
			} else {
				if (conversationEvent instanceof ActionEvent &&
					conversationEvent.TypeOfAction === ActionEvent.ActionType.AddKeyword) {
					const actionEvent = conversationEvent;
					const keyword = this.textDictionary.Entries[actionEvent.ObjectIndex];

					if (!newKeywords.includes(keyword))
						newKeywords.push(keyword);
				}

				if (conversationEvent.Type === EventType.Teleport ||
					conversationEvent.Type === EventType.Chest ||
					conversationEvent.Type === EventType.Door ||
					conversationEvent.Type === EventType.EnterPlace ||
					conversationEvent.Type === EventType.Riddlemouth ||
					conversationEvent.Type === EventType.StartBattle) {
					const chainStart = conversationEvent;
					this.CloseWindow(() => EventExtensions.TriggerEventChain(this.Map, this, EventTrigger.Always,
						this.player.Position.X, this.player.Position.Y, chainStart, true));
				} else {
					let trigger = EventTrigger.Always;
					let eventProvider;
					[conversationEvent, trigger, lastEventStatus, aborted, eventProvider] = EventExtensions.ExecuteEvent(conversationEvent, this.Map, this, trigger,
						this.player.Position.X, this.player.Position.Y, lastEventStatus, conversationPartner);
					this.layout.ButtonsDisabled = conversationEvent != null;

					// Might be reduced or added by action events
					this.layout.EnableButton(7, this.CurrentPartyMember.Gold !== 0);
					this.layout.EnableButton(8, this.CurrentPartyMember.Food !== 0);

					if (conversationEvent == null && eventProvider != null) {
						if (eventProvider.Event != null) {
							conversationEvent = eventProvider.Event;
							this.layout.ButtonsDisabled = conversationEvent != null;
							HandleEvent(followAction);
						} else {
							eventProvider.Provided.add(_event => {
								conversationEvent = _event;
								this.layout.ButtonsDisabled = conversationEvent != null;

								if (_event == null)
									followAction?.(EventType.Invalid);
								else
									HandleEvent(followAction);
							});
						}
					} else {
						HandleEvent(followAction);
					}
				}
			}
		};

		this.Fade(() => {
			this.SetWindow(Window.Conversation, conversationPartner, characterIndex, conversationEvent, createdItems);
			this.layout.SetLayout(LayoutType.Conversation);
			this.ShowMap(false);
			this.layout.Reset();

			this.layout.FillArea(new Rect(15, 43, 177, 80), this.GetUIColor(28), false);
			this.layout.FillArea(new Rect(15, 136, 152, 57), this.GetUIColor(28), false);

			this.DisplayCharacterInfo(character, true);

			if (character.Type !== CharacterType.PartyMember ||
				this.SlotFromPartyMember(character instanceof PartyMember ? character : null) == null)
				this.layout.EnableButton(4, false); // Disable "Ask to leave" if not in party
			if (character instanceof PartyMember && [...this.PartyMembers].includes(character))
				this.layout.EnableButton(5, false); // Disable "Ask to join" if already in party

			UpdateButtons();

			this.layout.AttachEventToButton(0, ShowDictionary);
			this.layout.AttachEventToButton(2, () => Exit(true));
			this.layout.AttachEventToButton(3, ShowItem);
			this.layout.AttachEventToButton(4, AskToLeave);
			this.layout.AttachEventToButton(5, AskToJoin);
			this.layout.AttachEventToButton(6, GiveItem);
			this.layout.AttachEventToButton(7, GiveGold);
			this.layout.AttachEventToButton(8, GiveFood);

			// Add item grid
			const itemSlotPositions = range(1, 6).map(index => new Position(index * 22, 139));
			itemSlotPositions.push(...range(1, 6).map(index => new Position(index * 22, 168)));
			itemGrid = ItemGrid.Create(this, this.layout, this.renderView, this.ItemManager, itemSlotPositions, newArray(24, null),
				false, 12, 6, 24, new Rect(7 * 22, 139, 6, 53), new Size(6, 27), ScrollbarType.SmallVertical);
			itemGrid.ItemDragged.add(ItemDragged);
			this.layout.AddItemGrid(itemGrid);
			ShowCreatedItems();

			// Note: Mouse handling in Layout assumes this is the last text (text[^1]) so ensure that.
			conversationText = this.layout.AddScrollableText(textArea, this.ProcessText(''), TextColor.BrightGray);
			conversationText.Visible = false;

			if (showInitialText) {
				if (conversationEvent != null) {
					this.layout.ButtonsDisabled = true;
					HandleNextEvent();
				} else {
					SetText(this.DataNameProvider.Hello);
				}
			}
		});
	}
}

/** string.Compare(a, b, true) (ignore case) */
function compareIgnoreCase(a, b) {
	const x = a.toUpperCase();
	const y = b.toUpperCase();
	return x < y ? -1 : x > y ? 1 : 0;
}

// Nested class GameCore.ConversationItems (implements IItemStorage)
export class ConversationItems {
	static SlotsPerRow = 6;
	static SlotRows = 4;

	constructor() {
		// ItemSlot[6, 4] -> Slots[x][y]
		this.Slots = Array.from({ length: 6 }, () => newArray(4, null));
		this.AllowsItemDrop = false;

		for (let y = 0; y < 4; ++y) {
			for (let x = 0; x < 6; ++x)
				this.Slots[x][y] = new ItemSlot();
		}
	}

	ResetItem(slot, item) {
		const column = slot % ConversationItems.SlotsPerRow;
		const row = Math.trunc(slot / ConversationItems.SlotsPerRow);

		if (this.Slots[column][row].Add(item) !== 0)
			throw new AmbermoonException(ExceptionScope.Application, 'Unable to reset conversation item.');
	}

	GetSlot(slot) { return this.Slots[slot % ConversationItems.SlotsPerRow][Math.trunc(slot / ConversationItems.SlotsPerRow)]; }
}
