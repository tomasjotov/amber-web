// Port of Ambermoon.Core/Game/Places.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// Part of partial class GameCore (applied by GameCore.js).

import { range, repeat, count, first, firstOrDefault, hasFlag, enumName, format, isNullOrWhiteSpace } from '../../../runtime.js';
import { Rect } from '../../Ambermoon.Common/Rect.js';
import { Position } from '../../Ambermoon.Common/Position.js';
import { Size } from '../../Ambermoon.Common/Size.js';
import { Util } from '../../Ambermoon.Common/Util.js';
import { CollectionExtensions } from '../../Ambermoon.Common/CollectionExtensions.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { Places } from '../../Ambermoon.Data.Common/Places.js';
import { Merchant } from '../../Ambermoon.Data.Common/Merchant.js';
import { ItemSlot } from '../../Ambermoon.Data.Common/ItemSlot.js';
import { TransportLocation } from '../../Ambermoon.Data.Common/Savegame.js';
import { SpellInfos } from '../../Ambermoon.Data.Common/SpellInfo.js';
import { ItemStorageExtensions } from '../../Ambermoon.Data.Common/IItemStorage.js';
import { CursorType } from '../../Ambermoon.Data.Common/CursorType.js';
import { PlaceType } from '../../Ambermoon.Data.Common/Enumerations/PlaceType.js';
import { Picture80x80 } from '../../Ambermoon.Data.Common/Enumerations/Picture80x80.js';
import { Color as TextColor } from '../../Ambermoon.Data.Common/Enumerations/Color.js';
import { Spell } from '../../Ambermoon.Data.Common/Enumerations/Spells.js';
import { ItemSlotFlags } from '../../Ambermoon.Data.Common/Enumerations/ItemSlotFlags.js';
import { ItemType } from '../../Ambermoon.Data.Common/Enumerations/ItemType.js';
import { Features } from '../../Ambermoon.Data.Common/Enumerations/Features.js';
import { Condition } from '../../Ambermoon.Data.Common/Enumerations/Condition.js';
import { World } from '../../Ambermoon.Data.Common/Enumerations/World.js';
import { TravelType } from '../../Ambermoon.Data.Common/Enumerations/TravelType.js';
import { MapType } from '../../Ambermoon.Data.Common/Enumerations/MapType.js';
import { Race } from '../../Ambermoon.Data.Common/Enumerations/Race.js';
import { Skill } from '../../Ambermoon.Data.Common/Enumerations/Skill.js';
import { Attribute } from '../../Ambermoon.Data.Common/Enumerations/Attribute.js';
import { ItemFlags } from '../../Ambermoon.Data.Common/Enumerations/ItemFlags.js';
import { MouseButtons } from '../MouseButtons.js';
import { Global } from '../UI/Global.js';
import { LayoutType } from '../UI/Layout.js';
import { Window } from '../UI/Window.js';
import { ItemGrid } from '../UI/ItemGrid.js';
import { ScrollbarType } from '../UI/ScrollbarType.js';
import { TextAlign } from '../Render/TextAlign.js';
import { ItemAnimation } from '../Render/ItemAnimation.js';
import { CharacterInfo } from './Rendering.js';

/** Emulates `handler += other` on a plain delegate field (multicast). */
function combineDelegates(a, b) {
	if (!a)
		return b;
	if (!b)
		return a;
	return (...args) => {
		a(...args);
		return b(...args);
	};
}

export class GameCore_Places {
	EnterPlace(map, enterPlaceEvent) {
		if (this.WindowActive)
			return false;

		this.ResetMoveKeys();

		const openingHour = enterPlaceEvent.OpeningHour;
		const closingHour = enterPlaceEvent.ClosingHour === 0 ? 24 : enterPlaceEvent.ClosingHour;

		if (this.GameTime.Hour >= openingHour && this.GameTime.Hour < closingHour) {
			switch (enterPlaceEvent.PlaceType) {
				case PlaceType.Trainer: {
					const trainerData = new Places.Trainer(this.places.Entries[enterPlaceEvent.PlaceIndex - 1]);
					this.OpenTrainer(trainerData);
					return true;
				}
				case PlaceType.Healer: {
					const healerData = new Places.Healer(this.places.Entries[enterPlaceEvent.PlaceIndex - 1]);
					this.OpenHealer(healerData);
					return true;
				}
				case PlaceType.Sage: {
					const sageData = new Places.Sage(this.places.Entries[enterPlaceEvent.PlaceIndex - 1]);
					this.OpenSage(sageData);
					return true;
				}
				case PlaceType.Enchanter: {
					const enchanterData = new Places.Enchanter(this.places.Entries[enterPlaceEvent.PlaceIndex - 1]);
					this.OpenEnchanter(enchanterData);
					return true;
				}
				case PlaceType.Inn: {
					const innData = new Places.Inn(this.places.Entries[enterPlaceEvent.PlaceIndex - 1]);
					this.OpenInn(innData, enterPlaceEvent.UsePlaceTextIndex === 0xff ? this.DataNameProvider.InnkeeperGoodSleepWish :
						map.GetText(enterPlaceEvent.UsePlaceTextIndex, this.DataNameProvider.InnkeeperGoodSleepWish));
					return true;
				}
				case PlaceType.Merchant:
				case PlaceType.Library:
					this.OpenMerchant(enterPlaceEvent.MerchantDataIndex, this.places.Entries[enterPlaceEvent.PlaceIndex - 1].Name,
						enterPlaceEvent.UsePlaceTextIndex === 0xff ? null :
							map.GetText(enterPlaceEvent.UsePlaceTextIndex, this.DataNameProvider.TextBlockMissing),
						enterPlaceEvent.PlaceType === PlaceType.Library, true, null);
					return true;
				case PlaceType.FoodDealer: {
					const foodDealerData = new Places.FoodDealer(this.places.Entries[enterPlaceEvent.PlaceIndex - 1]);
					this.OpenFoodDealer(foodDealerData);
					return true;
				}
				case PlaceType.HorseDealer: {
					const horseDealerData = new Places.HorseSalesman(this.places.Entries[enterPlaceEvent.PlaceIndex - 1]);
					this.OpenHorseSalesman(horseDealerData, enterPlaceEvent.UsePlaceTextIndex === 0xff ? null :
						map.GetText(enterPlaceEvent.UsePlaceTextIndex, this.DataNameProvider.TextBlockMissing));
					return true;
				}
				case PlaceType.RaftDealer: {
					const raftDealerData = new Places.RaftSalesman(this.places.Entries[enterPlaceEvent.PlaceIndex - 1]);
					this.OpenRaftSalesman(raftDealerData, enterPlaceEvent.UsePlaceTextIndex === 0xff ? null :
						map.GetText(enterPlaceEvent.UsePlaceTextIndex, this.DataNameProvider.TextBlockMissing));
					return true;
				}
				case PlaceType.ShipDealer: {
					const shipDealerData = new Places.ShipSalesman(this.places.Entries[enterPlaceEvent.PlaceIndex - 1]);
					this.OpenShipSalesman(shipDealerData, enterPlaceEvent.UsePlaceTextIndex === 0xff ? null :
						map.GetText(enterPlaceEvent.UsePlaceTextIndex, this.DataNameProvider.TextBlockMissing));
					return true;
				}
				case PlaceType.Blacksmith: {
					const blacksmithData = new Places.Blacksmith(this.places.Entries[enterPlaceEvent.PlaceIndex - 1]);
					this.OpenBlacksmith(blacksmithData);
					return true;
				}
				default:
					throw new AmbermoonException(ExceptionScope.Data, 'Unknown place type.');
			}
		} else if (enterPlaceEvent.ClosedTextIndex !== 255) {
			const closedText = map.GetText(enterPlaceEvent.ClosedTextIndex, this.DataNameProvider.TextBlockMissing);
			this.ShowTextPopup(this.ProcessText(closedText), null);
			return true;
		} else {
			return true;
		}
	}

	ShowPlaceWindow(placeName, welcomeText, picture, place, placeSetup,
		activePlayerSwitchedHandler, exitChecker = null, closeAction = null, numItemSlots = 12) {
		this.OpenStorage = place;
		this.layout.SetLayout(LayoutType.Items);
		this.layout.AddText(new Rect(120, 37, 29 * Global.GlyphWidth, Global.GlyphLineHeight),
			this.renderView.TextProcessor.CreateText(placeName), TextColor.White);
		this.layout.FillArea(new Rect(110, 43, 194, 80), this.GetUIColor(28), false);
		const itemSlotPositions = range(1, 6).map(index => new Position(index * 22, 139));
		itemSlotPositions.push(...range(1, 6).map(index => new Position(index * 22, 168)));
		const itemGrid = ItemGrid.Create(this, this.layout, this.renderView, this.ItemManager, itemSlotPositions, repeat(null, numItemSlots),
			false, 12, 6, numItemSlots, new Rect(7 * 22, 139, 6, 53), new Size(6, 27), ScrollbarType.SmallVertical);
		itemGrid.Disabled = true;
		this.layout.AddItemGrid(itemGrid);
		this.layout.Set80x80Picture(picture);

		// Put all gold on the table!
		for (const partyMember of this.PartyMembers) {
			place.AvailableGold += partyMember.Gold;
			partyMember.RemoveGold(partyMember.Gold);
		}

		this.ShowTextPanel(CharacterInfo.ChestGold, true,
			`${this.DataNameProvider.GoldName}^${place.AvailableGold}`, new Rect(111, 104, 43, 15));

		if (welcomeText != null) {
			this.layout.ShowClickChestMessage(welcomeText);
		}

		const UpdateGoldDisplay = () =>
			this.characterInfoTexts.get(CharacterInfo.ChestGold).SetText(this.renderView.TextProcessor.CreateText(`${this.DataNameProvider.GoldName}^${place.AvailableGold}`));

		placeSetup?.(UpdateGoldDisplay, itemGrid);
		this.ActivePlayerChanged.add(activePlayerSwitchedHandler);
		this.closeWindowHandler = _ => this.ActivePlayerChanged.remove(activePlayerSwitchedHandler);

		// exit button
		this.layout.AttachEventToButton(2, () => {
			const Exit = () => {
				this.CloseWindow();

				// Distribute the gold
				const partyMembers = [...this.PartyMembers];
				let availableGold = place.AvailableGold;
				availableGold = this.DistributeGold(availableGold, false);
				const goldPerPartyMember = Math.trunc(availableGold / partyMembers.length);
				const restGold = availableGold % partyMembers.length;

				if (availableGold !== 0) {
					for (let i = 0; i < partyMembers.length; ++i) {
						const gold = goldPerPartyMember + (i < restGold ? 1 : 0);
						partyMembers[i].AddGold(gold);
					}
				}

				closeAction?.();
			};

			const exitQuestion = exitChecker?.() ?? null;

			if (exitQuestion != null) {
				this.layout.OpenYesNoPopup(this.ProcessText(exitQuestion), Exit, () => this.ClosePopup(), () => this.ClosePopup(), 2);
			} else {
				Exit();
			}
		});
	}

	OpenEnchanter(enchanter, showWelcome = true) {
		this.currentPlace = enchanter;

		if (showWelcome)
			enchanter.AvailableGold = 0;

		let updatePartyGold = null;
		let itemsGrid = null;

		const SetupEnchanter = (updateGold, itemGrid) => {
			updatePartyGold = updateGold;
			itemsGrid = itemGrid;
		};

		this.Fade(() => {
			this.layout.Reset();
			this.ShowMap(false);
			this.SetWindow(Window.Enchanter, enchanter);
			this.ShowPlaceWindow(enchanter.Name, showWelcome ? this.DataNameProvider.WelcomeEnchanter : null,
				Picture80x80.Enchantress, enchanter, SetupEnchanter, null, null, null, 24);
			const ShowDefaultMessage = () => this.layout.ShowChestMessage(this.DataNameProvider.WhichItemToEnchant, TextAlign.Left);
			const itemArea = new Rect(16, 139, 151, 53);
			const SetupRightClickAbort = () => {
				this.nextClickHandler = buttons => {
					if (buttons === MouseButtons.Right) {
						DisableItemGrid();
						this.layout.ShowChestMessage(null);
						this.UntrapMouse();
						this.layout.ButtonsDisabled = false;
						this.CursorType = CursorType.Sword;
						this.inputEnable = true;
						return true;
					}

					return false;
				};
			};
			const DisableItemGrid = () => {
				itemsGrid.HideTooltip();
				itemsGrid.ItemClicked.remove(ItemClicked);
				itemsGrid.Disabled = true;
				this.layout.ButtonsDisabled = false;
			};
			const ItemClicked = (_, slotIndex, itemSlot) => {
				itemsGrid.HideTooltip();

				const Error = (message, abort) => {
					this.layout.ShowClickChestMessage(message, () => {
						if (!abort) {
							this.TrapMouse(itemArea);
							SetupRightClickAbort();
							ShowDefaultMessage();
						} else {
							DisableItemGrid();
						}
					});
				};

				const item = this.ItemManager.GetItem(itemSlot.ItemIndex);

				let costPerCharge = item.RechargePrice;

				if (costPerCharge === 0)
					costPerCharge = enchanter.Cost;

				if (enchanter.AvailableGold < costPerCharge) {
					Error(this.DataNameProvider.NotEnoughMoney, true);
					return;
				}

				if (item.Spell === Spell.None || (item.InitialCharges === 0 && item.MaxCharges === 0)) {
					Error(this.DataNameProvider.CannotEnchantOrdinaryItem, false);
					return;
				}

				if (item.MaxCharges === 0) {
					Error(this.DataNameProvider.CannotRechargeAnymore, false);
					return;
				}

				const numMissingCharges = itemSlot.NumRemainingCharges >= item.MaxCharges ? 0 : item.MaxCharges - itemSlot.NumRemainingCharges;

				if (numMissingCharges === 0) {
					Error(this.DataNameProvider.AlreadyFullyCharged, false);
					return;
				}

				if (item.MaxRecharges !== 0 && item.MaxRecharges !== 255 && itemSlot.RechargeTimes >= item.MaxRecharges) {
					Error(this.DataNameProvider.CannotRechargeAnymore, false);
					return;
				}

				const Enchant = charges => {
					this.ClosePopup();
					const totalCost = charges * costPerCharge;

					this.nextClickHandler = null;
					this.layout.ShowPlaceQuestion(`${this.DataNameProvider.PriceForEnchanting}${totalCost}${this.DataNameProvider.AgreeOnPrice}`, answer => {
						this.nextClickHandler = null;
						this.EndSequence();
						this.UntrapMouse();

						if (answer) { // yes
							const Enchant = () => {
								this.layout.ShowChestMessage(null);
								enchanter.AvailableGold -= totalCost;
								updatePartyGold?.();
								itemSlot.NumRemainingCharges += charges;
								itemSlot.RechargeTimes = Math.min(255, itemSlot.RechargeTimes + 1) & 0xff;
								DisableItemGrid();
							};

							if (item.MaxRecharges !== 0 && item.MaxRecharges !== 255 && itemSlot.RechargeTimes === item.MaxRecharges - 1)
								this.layout.ShowClickChestMessage(this.DataNameProvider.LastTimeEnchanting, Enchant);
							else
								Enchant();
						} else {
							this.layout.ShowChestMessage(null);
							DisableItemGrid();
						}
					}, TextAlign.Left);
				};

				this.nextClickHandler = null;
				this.UntrapMouse();

				this.layout.OpenAmountInputBox(this.DataNameProvider.HowManyCharges,
					item.GraphicIndex, item.Name, Math.trunc(Util.Min(Math.trunc(enchanter.AvailableGold / costPerCharge), numMissingCharges)), Enchant,
					() => {
						this.TrapMouse(itemArea);
						SetupRightClickAbort();
					}
				);
			};
			// Enchant item button
			this.layout.AttachEventToButton(3, () => {
				itemsGrid.Disabled = false;
				itemsGrid.DisableDrag = true;
				ShowDefaultMessage();
				this.CursorType = CursorType.Sword;
				this.TrapMouse(itemArea);
				this.layout.ButtonsDisabled = true;
				itemsGrid.Initialize(this.CurrentPartyMember.Inventory.Slots.slice(), false);
				itemsGrid.ItemClicked.add(ItemClicked);
				SetupRightClickAbort();
			});
		});
	}

	OpenSage(sage, showWelcome = true) {
		this.currentPlace = sage;

		if (showWelcome)
			sage.AvailableGold = 0;

		let updatePartyGold = null;
		let itemsGrid = null;

		const SetupSage = (updateGold, itemGrid) => {
			updatePartyGold = updateGold;
			itemsGrid = itemGrid;
		};

		this.Fade(() => {
			this.layout.Reset();
			this.ShowMap(false);
			this.SetWindow(Window.Sage, sage);
			this.ShowPlaceWindow(sage.Name, showWelcome ? this.DataNameProvider.WelcomeSage : null,
				Picture80x80.Sage, sage, SetupSage, null, null, null, 24);
			const ShowDefaultMessage = () => this.layout.ShowChestMessage(this.DataNameProvider.ExamineWhichItemSage, TextAlign.Left);
			const ShowItems = (equipment, scrollIdentification = false) => {
				itemsGrid.Disabled = false;
				itemsGrid.DisableDrag = true;
				ShowDefaultMessage();
				this.CursorType = CursorType.Sword;
				const itemArea = new Rect(16, 139, 151, 53);
				this.TrapMouse(itemArea);
				this.layout.ButtonsDisabled = true;
				itemsGrid.Initialize(equipment ? [...this.CurrentPartyMember.Equipment.Slots.values()].filter(s => s.ItemIndex !== 0)
					: this.CurrentPartyMember.Inventory.Slots.slice(), false);

				const SetupRightClickAbort = () => {
					this.nextClickHandler = buttons => {
						if (buttons === MouseButtons.Right) {
							DisableItemGrid();
							this.layout.ShowChestMessage(null);
							this.UntrapMouse();
							this.layout.ButtonsDisabled = false;
							this.CursorType = CursorType.Sword;
							this.inputEnable = true;
							return true;
						}

						return false;
					};
				};
				const DisableItemGrid = () => {
					itemsGrid.HideTooltip();
					itemsGrid.ItemClicked.remove(ItemClicked);
					itemsGrid.Disabled = true;
					this.layout.ButtonsDisabled = false;
				};
				const ItemClicked = (_, slotIndex, itemSlot) => {
					itemsGrid.HideTooltip();

					const Message = (message, abort) => {
						this.layout.ShowClickChestMessage(message, () => {
							if (!abort) {
								this.TrapMouse(itemArea);
								SetupRightClickAbort();
								ShowDefaultMessage();
							} else {
								DisableItemGrid();
							}
						});
					};

					if (scrollIdentification) {
						if (this.ItemManager.GetItem(itemSlot.ItemIndex).Type !== ItemType.SpellScroll) {
							Message(this.DataNameProvider.ThatsNotASpellScroll, false);
							return;
						}
					} else if (hasFlag(itemSlot.Flags, ItemSlotFlags.Identified)) {
						Message(this.DataNameProvider.ItemAlreadyIdentified, false);
						return;
					}

					const cost = scrollIdentification ? sage.TellingSLPCost : sage.IdentificationCost;

					if (sage.AvailableGold < cost) {
						Message(this.DataNameProvider.NotEnoughMoney, true);
						return;
					}

					this.nextClickHandler = null;
					this.layout.ShowPlaceQuestion(`${this.DataNameProvider.PriceForExamining}${cost}${this.DataNameProvider.AgreeOnPrice}`, answer => {
						this.nextClickHandler = null;

						const Finish = () => {
							this.EndSequence();
							this.UntrapMouse();
							DisableItemGrid();
							this.layout.ShowChestMessage(null);

							if (answer) { // yes
								sage.AvailableGold -= cost;
								updatePartyGold?.();

								if (scrollIdentification) {
									const item = this.ItemManager.GetItem(itemSlot.ItemIndex);
									const slp = SpellInfos.GetSLPCost(this.SpellInfos, this.Features, item.Spell);
									Message(this.DataNameProvider.SageIdentifyScroll + String(slp) + this.DataNameProvider.SageSLP, true);
								} else {
									itemSlot.Flags |= ItemSlotFlags.Identified;
									this.ShowItemPopup(itemSlot, null);
								}
							}
						};

						if (answer) {
							ItemAnimation.Play(this, this.renderView, ItemAnimation.Type.Enchant, this.layout.GetItemSlotPosition(itemSlot, true),
								Finish, 50);
						} else {
							Finish();
						}

					}, TextAlign.Left);
				};
				SetupRightClickAbort();
				itemsGrid.ItemClicked.add(ItemClicked);
			};
			// Examine equipment button
			this.layout.AttachEventToButton(0, () => ShowItems(true));
			// Examine inventory item button
			this.layout.AttachEventToButton(3, () => ShowItems(false));
			if (hasFlag(this.Features, Features.SageScrollIdentification))
				this.layout.AttachEventToButton(6, () => ShowItems(false, true));
		});
	}

	OpenHealer(healer, showWelcome = true) {
		this.currentPlace = healer;

		if (showWelcome)
			healer.AvailableGold = 0;

		let updatePartyGold = null;
		let conditionGrid = null;

		const SetupHealer = (updateGold, itemGrid) => {
			updatePartyGold = updateGold;
			conditionGrid = itemGrid;
		};

		const Heal = lp => {
			this.nextClickHandler = null;

			this.layout.ShowPlaceQuestion(`${this.DataNameProvider.PriceForHealing}${lp * healer.HealLPCost}${this.DataNameProvider.AgreeOnPrice}`, answer => {
				if (answer) { // yes
					healer.AvailableGold -= lp * healer.HealLPCost;
					updatePartyGold?.();
					this.currentlyHealedMember.HitPoints.CurrentValue += lp;

					PlayerSwitched();
					this.PlayHealAnimation(this.currentlyHealedMember, () => this.layout.FillCharacterBars(this.currentlyHealedMember));
				}
			}, TextAlign.Left);
		};

		const HealCondition = (condition, healedHandler) => {
			// TODO: At the moment DeadAshes and DeadDust will be healed fully so that the
			// character is alive afterwards. As this is bugged in original I don't know how
			// it was supposed to be. Either reviving completely or transform to next stage
			// like dust to ashes and ashes to body first.

			const cost = healer.GetCostForHealingCondition(condition);
			this.nextClickHandler = null;
			this.layout.ShowPlaceQuestion(`${this.DataNameProvider.PriceForHealingCondition}${cost}${this.DataNameProvider.AgreeOnPrice}`, answer => {
				if (answer) { // yes
					healer.AvailableGold -= cost;
					updatePartyGold?.();
					this.RemoveCondition(condition, this.currentlyHealedMember);
					PlayerSwitched();
					this.PlayHealAnimation(this.currentlyHealedMember);
					this.layout.UpdateCharacterStatus(this.currentlyHealedMember);
					healedHandler?.(true);
					if (condition >= Condition.DeadCorpse) { // dead
						this.currentlyHealedMember.HitPoints.CurrentValue = Math.max(1, this.currentlyHealedMember.HitPoints.CurrentValue);
						this.PartyMemberRevived(this.currentlyHealedMember);
					}
				} else {
					healedHandler?.(false);
				}
			}, TextAlign.Left);
		};

		const healableConditions = Condition.Lamed | Condition.Poisoned | Condition.Petrified | Condition.Diseased |
			Condition.Aging | Condition.DeadCorpse | Condition.DeadAshes | Condition.DeadDust | Condition.Crazy |
			Condition.Blind | Condition.Drugged;

		const PlayerSwitched = () => {
			this.layout.EnableButton(0, this.currentlyHealedMember.HitPoints.CurrentValue < this.currentlyHealedMember.HitPoints.TotalMaxValue);
			this.layout.EnableButton(3, [...this.currentlyHealedMember.Equipment.Slots.values()].some(slot => hasFlag(slot.Flags, ItemSlotFlags.Cursed)));
			this.layout.EnableButton(6, (this.currentlyHealedMember.Conditions & healableConditions) !== 0);
		};

		const GetMaxLPHealing = () => Math.max(0, Util.Min(Math.trunc(healer.AvailableGold / healer.HealLPCost),
			this.currentlyHealedMember.HitPoints.TotalMaxValue - this.currentlyHealedMember.HitPoints.CurrentValue));

		this.Fade(() => {
			if (showWelcome)
				this.currentlyHealedMember = this.CurrentPartyMember;

			this.layout.Reset();
			this.ShowMap(false);
			this.SetWindow(Window.Healer, healer);
			this.ShowPlaceWindow(healer.Name, showWelcome ? this.DataNameProvider.WelcomeHealer : null,
				Picture80x80.Healer, healer, SetupHealer, PlayerSwitched);
			// This will show the healing symbol on top of the portrait.
			this.SetActivePartyMember(this.SlotFromPartyMember(this.currentlyHealedMember));
			// Heal LP button
			this.layout.AttachEventToButton(0, () => {
				conditionGrid.Disabled = true;

				if (healer.AvailableGold < healer.HealLPCost) {
					this.layout.ShowClickChestMessage(this.DataNameProvider.NotEnoughMoney);
					return;
				}

				this.layout.OpenAmountInputBox(this.DataNameProvider.HowManyLP, null, null, GetMaxLPHealing(), lp => {
					this.ClosePopup();
					Heal(lp);
				}, () => this.ClosePopup());
			});
			// Remove curse button
			this.layout.AttachEventToButton(3, () => {
				conditionGrid.Disabled = true;

				if (healer.AvailableGold < healer.RemoveCurseCost) {
					this.layout.ShowClickChestMessage(this.DataNameProvider.NotEnoughMoney);
					return;
				}

				const maxCursesToRemove = Math.min(Math.trunc(healer.AvailableGold / healer.RemoveCurseCost),
					count(this.currentlyHealedMember.Equipment.Slots.values(), slot => hasFlag(slot.Flags, ItemSlotFlags.Cursed)));
				this.nextClickHandler = null;

				this.layout.ShowPlaceQuestion(`${this.DataNameProvider.PriceForRemovingCurses}${maxCursesToRemove * healer.RemoveCurseCost}${this.DataNameProvider.AgreeOnPrice}`, answer => {
					if (answer) { // yes
						healer.AvailableGold -= maxCursesToRemove * healer.RemoveCurseCost;
						updatePartyGold?.();
						PlayerSwitched();
						this.allInputDisabled = true;
						this.OpenPartyMember(this.SlotFromPartyMember(this.currentlyHealedMember), true, () => {
							// Note: list of the equipment slot values (C#: list of KeyValuePairs, .Value used below)
							const equipSlots = [...this.currentlyHealedMember.Equipment.Slots.values()];

							for (let i = 0; i < maxCursesToRemove; ++i) {
								const cursedItemSlot = first(equipSlots, s => hasFlag(s.Flags, ItemSlotFlags.Cursed));
								this.layout.DestroyItem(cursedItemSlot, 800);
							}

							this.AddTimedEvent(2000, () => {
								this.CloseWindow();
								this.allInputDisabled = false;
							});
						}, false);
					}
				}, TextAlign.Left);
			});
			this.layout.AttachEventToButton(6, () => {
				conditionGrid.Disabled = false;
				conditionGrid.DisableDrag = true;
				this.layout.ShowChestMessage(this.DataNameProvider.WhichConditionToHeal, TextAlign.Left);
				this.CursorType = CursorType.Sword;
				const itemArea = new Rect(16, 139, 151, 53);
				this.TrapMouse(itemArea);
				const slots = [];
				const slotConditions = [];
				// Ensure that only one dead state is present
				if (hasFlag(this.currentlyHealedMember.Conditions, Condition.DeadDust))
					this.currentlyHealedMember.Conditions = Condition.DeadDust;
				else if (hasFlag(this.currentlyHealedMember.Conditions, Condition.DeadAshes))
					this.currentlyHealedMember.Conditions = Condition.DeadAshes;
				else if (hasFlag(this.currentlyHealedMember.Conditions, Condition.DeadCorpse))
					this.currentlyHealedMember.Conditions = Condition.DeadCorpse;
				for (let i = 0; i < 16; ++i) {
					if ((healableConditions & (1 << i)) !== 0) {
						const condition = 1 << i;

						if (hasFlag(this.currentlyHealedMember.Conditions, condition)) {
							const slot = new ItemSlot();
							slot.ItemIndex = (() => {
								switch (condition) {
									case Condition.Lamed: return 1;
									case Condition.Poisoned: return 2;
									case Condition.Petrified: return 3;
									case Condition.Diseased: return 4;
									case Condition.Aging: return 5;
									case Condition.Crazy: return 7;
									case Condition.Blind: return 8;
									case Condition.Drugged: return 9;
									default: return 6; // dead states
								}
							})();
							slot.Amount = 1;
							slots.push(slot);
							slotConditions.push(condition);
						}
					}
				}
				while (slots.length < 12)
					slots.push(new ItemSlot());
				conditionGrid.Initialize(slots, false);
				const SetupRightClickAbort = () => {
					this.nextClickHandler = buttons => {
						if (buttons === MouseButtons.Right) {
							DisableConditionGrid();
							this.layout.ShowChestMessage(null);
							this.UntrapMouse();
							this.CursorType = CursorType.Sword;
							this.inputEnable = true;
							return true;
						}

						return false;
					};
				};
				const DisableConditionGrid = () => {
					conditionGrid.HideTooltip();
					conditionGrid.ItemClicked.remove(ConditionClicked);
					conditionGrid.Disabled = true;
				};
				const ConditionClicked = (_, slotIndex, itemSlot) => {
					if (slotIndex < slotConditions.length) {
						conditionGrid.HideTooltip();

						if (healer.AvailableGold < healer.GetCostForHealingCondition(slotConditions[slotIndex])) {
							this.layout.ShowClickChestMessage(this.DataNameProvider.NotEnoughMoney, () => {
								this.TrapMouse(itemArea);
								SetupRightClickAbort();
							});
							return;
						}

						this.nextClickHandler = null;
						this.UntrapMouse();

						HealCondition(slotConditions[slotIndex], healed => {
							if (healed) {
								if (this.currentlyHealedMember.Conditions !== Condition.None) {
									conditionGrid.SetItem(slotIndex, null);
									this.TrapMouse(itemArea);
									SetupRightClickAbort();
									this.layout.ShowChestMessage(this.DataNameProvider.WhichConditionToHeal, TextAlign.Left);
								} else {
									DisableConditionGrid();
								}
							} else {
								this.TrapMouse(itemArea);
								SetupRightClickAbort();
								this.layout.ShowChestMessage(this.DataNameProvider.WhichConditionToHeal, TextAlign.Left);
							}
						});
					}
				};
				SetupRightClickAbort();
				conditionGrid.ItemClicked.add(ConditionClicked);
			});
			PlayerSwitched();
		});
	}

	OpenBlacksmith(blacksmith, showWelcome = true) {
		this.currentPlace = blacksmith;

		if (showWelcome)
			blacksmith.AvailableGold = 0;

		// Note: The blacksmith uses the same 80x80 image as the sage.
		let updatePartyGold = null;
		let itemsGrid = null;

		const SetupBlacksmith = (updateGold, itemGrid) => {
			updatePartyGold = updateGold;
			itemsGrid = itemGrid;
		};

		this.Fade(() => {
			this.layout.Reset();
			this.ShowMap(false);
			this.SetWindow(Window.Blacksmith, blacksmith);
			this.ShowPlaceWindow(blacksmith.Name, showWelcome ? this.DataNameProvider.WelcomeBlacksmith : null,
				pictureForWorld(this.Map.World, Picture80x80.Sage), blacksmith, SetupBlacksmith, null, null, null, 24);
			const ShowDefaultMessage = () => this.layout.ShowChestMessage(this.DataNameProvider.WhichItemToRepair, TextAlign.Left);
			// Repair item button
			this.layout.AttachEventToButton(3, () => {
				itemsGrid.Disabled = false;
				itemsGrid.DisableDrag = true;
				ShowDefaultMessage();
				this.CursorType = CursorType.Sword;
				const itemArea = new Rect(16, 139, 151, 53);
				this.TrapMouse(itemArea);
				this.layout.ButtonsDisabled = true;
				itemsGrid.Initialize(this.CurrentPartyMember.Inventory.Slots.slice(), false);
				const SetupRightClickAbort = () => {
					this.nextClickHandler = buttons => {
						if (buttons === MouseButtons.Right) {
							DisableItemGrid();
							this.layout.ShowChestMessage(null);
							this.UntrapMouse();
							this.layout.ButtonsDisabled = false;
							this.CursorType = CursorType.Sword;
							this.inputEnable = true;
							return true;
						}

						return false;
					};
				};

				const DisableItemGrid = () => {
					itemsGrid.HideTooltip();
					itemsGrid.ItemClicked.remove(ItemClicked);
					itemsGrid.Disabled = true;
					this.layout.ButtonsDisabled = false;
				};

				const ItemClicked = (_, slotIndex, itemSlot) => {
					itemsGrid.HideTooltip();

					const Error = (message, abort) => {
						this.layout.ShowClickChestMessage(message, () => {
							if (!abort) {
								this.TrapMouse(itemArea);
								SetupRightClickAbort();
								ShowDefaultMessage();
							} else {
								DisableItemGrid();
							}
						});
					};

					if (!hasFlag(itemSlot.Flags, ItemSlotFlags.Broken)) {
						Error(this.DataNameProvider.CannotRepairUnbreakableItem, false);
						return;
					}

					const item = this.ItemManager.GetItem(itemSlot.ItemIndex);
					const cost = Math.trunc(blacksmith.Cost * item.Price / 100);

					if (blacksmith.AvailableGold < cost) {
						Error(this.DataNameProvider.NotEnoughMoney, true);
						return;
					}

					this.nextClickHandler = null;
					this.layout.ShowPlaceQuestion(`${this.DataNameProvider.PriceForRepair}${cost}${this.DataNameProvider.AgreeOnPrice}`, answer => {
						this.nextClickHandler = null;
						this.EndSequence();
						this.UntrapMouse();
						this.layout.ShowChestMessage(null);

						if (answer) { // yes
							blacksmith.AvailableGold -= cost;
							updatePartyGold?.();
							itemSlot.Flags &= ~ItemSlotFlags.Broken;
						}

						DisableItemGrid();
					}, TextAlign.Left);
				};

				SetupRightClickAbort();

				itemsGrid.ItemClicked.add(ItemClicked);
			});
		});
	}

	OpenInn(inn, useText, showWelcome = true) {
		this.currentPlace = inn;

		if (showWelcome)
			inn.AvailableGold = 0;

		let updatePartyGold = null;

		const SetupInn = (updateGold, _) => {
			updatePartyGold = updateGold;
		};

		this.Fade(() => {
			this.layout.Reset();
			this.ShowMap(false);
			this.SetWindow(Window.Inn, inn, useText);
			this.ShowPlaceWindow(inn.Name, showWelcome ? this.DataNameProvider.WelcomeInnkeeper : null,
				pictureForWorld(this.Map.World, Picture80x80.Innkeeper),
				inn, SetupInn, null, null, () => this.InputEnable = true);
			// Rest button
			this.layout.AttachEventToButton(3, () => {
				// Animals etc don't need to pay
				const totalCost = Math.max(1, count(this.PartyMembers, p => p.Alive && p.Race < Race.Animal)) * inn.Cost;
				if (inn.AvailableGold < totalCost) {
					this.layout.ShowClickChestMessage(this.DataNameProvider.NotEnoughMoney);
					return;
				}
				this.nextClickHandler = null;
				this.layout.ShowPlaceQuestion(`${this.DataNameProvider.StayWillCost}${totalCost}${this.DataNameProvider.AgreeOnPrice}`, answer => {
					if (answer) { // yes
						inn.AvailableGold -= totalCost;
						updatePartyGold?.();
						this.layout.ShowClickChestMessage(useText, () => {
							this.currentWindow.Window = Window.MapView; // This way closing the camp will return to map and not the Inn
							this.layout.GetButtonAction(2)?.(); // Call close handler
							this.OpenStorage = null;
							this.Teleport(inn.BedroomMapIndex, inn.BedroomX,
								inn.BedroomY, this.player.Direction, true);
							this.OpenCamp(true, inn.Healing);
						});
					}
				}, TextAlign.Left);
			});
		});
	}

	OpenHorseSalesman(horseSalesman, buyText, showWelcome = true) {
		if (showWelcome)
			horseSalesman.AvailableGold = 0;

		this.OpenTransportSalesman(horseSalesman, buyText, TravelType.Horse, Window.HorseSalesman,
			Picture80x80.Horse, showWelcome ? this.DataNameProvider.WelcomeHorseSeller : null);
	}

	OpenRaftSalesman(raftSalesman, buyText, showWelcome = true) {
		if (showWelcome)
			raftSalesman.AvailableGold = 0;

		this.OpenTransportSalesman(raftSalesman, buyText, TravelType.Raft, Window.RaftSalesman,
			Picture80x80.Captain, showWelcome ? this.DataNameProvider.WelcomeRaftSeller : null);
	}

	OpenShipSalesman(shipSalesman, buyText, showWelcome = true) {
		if (showWelcome)
			shipSalesman.AvailableGold = 0;

		this.OpenTransportSalesman(shipSalesman, buyText, TravelType.Ship, Window.ShipSalesman,
			Picture80x80.Captain, showWelcome ? this.DataNameProvider.WelcomeShipSeller : null);
	}

	OpenTransportSalesman(salesman, buyText, travelType, window, picture80X80, welcomeMessage) {
		this.currentPlace = salesman;
		let updatePartyGold = null;

		const SetupSalesman = (updateGold, _) => {
			updatePartyGold = updateGold;
		};

		const EnableBuying = () => {
			// Buying is enabled if on the target location isn't already
			// the given transport. Invalid data always disallows buying.

			if (salesman.SpawnMapIndex <= 0 || salesman.SpawnX <= 0 || salesman.SpawnY <= 0)
				return false;

			const map = this.MapManager.GetMap(salesman.SpawnMapIndex);

			if (map == null || map.Type === MapType.Map3D || !map.UseTravelTypes || // Should not happen but never allow buying in these cases
				salesman.SpawnX > map.Width || salesman.SpawnY > map.Height)
				return false;

			const tile = map.Tiles[salesman.SpawnX - 1][salesman.SpawnY - 1];
			const tileset = this.MapManager.GetTilesetForMap(map);

			if (!tile.AllowMovement(tileset, travelType)) // Can't be placed there
				return false;

			if (this.CurrentSavegame.TransportLocations.some(t => t != null && t.MapIndex === map.Index &&
				t.Position.X === salesman.SpawnX && t.Position.Y === salesman.SpawnY))
				return false;

			// TODO: Maybe change later
			// Allow 12 ships, 10 rafts and 10 horses
			const allowedCount = travelType === TravelType.Ship ? 12 : 10;
			return count(this.CurrentSavegame.TransportLocations, t => t?.TravelType === travelType) < allowedCount;
		};

		this.Fade(() => {
			this.layout.Reset();
			this.ShowMap(false);
			this.SetWindow(window, salesman, buyText);
			this.ShowPlaceWindow(salesman.Name, welcomeMessage, picture80X80,
				salesman, SetupSalesman, null, null, () => this.InputEnable = true);
			if (!EnableBuying()) {
				this.layout.EnableButton(3, false);
			} else {
				// Buy transport button
				this.layout.AttachEventToButton(3, () => {
					// Animals don't have to pay for a transport
					const totalCost = (salesman.PlaceType === PlaceType.HorseDealer ? Math.max(1, count(this.PartyMembers, p => p.Alive && p.Race < Race.Animal)) : 1) * salesman.Cost;
					if (salesman.AvailableGold < totalCost) {
						this.layout.ShowClickChestMessage(this.DataNameProvider.NotEnoughMoney);
						return;
					}
					let costText;
					switch (salesman.PlaceType) {
						case PlaceType.HorseDealer:
							costText = this.DataNameProvider.PriceForHorse;
							break;
						case PlaceType.RaftDealer:
							costText = this.DataNameProvider.PriceForRaft;
							break;
						case PlaceType.ShipDealer:
							costText = this.DataNameProvider.PriceForShip;
							break;
						default:
							throw new AmbermoonException(ExceptionScope.Application, `Invalid salesman place type: ${enumName(PlaceType, salesman.PlaceType)}`);
					}
					this.nextClickHandler = null;
					this.layout.ShowPlaceQuestion(`${costText}${totalCost}${this.DataNameProvider.AgreeOnPrice}`, answer => {
						if (answer) { // yes
							salesman.AvailableGold -= totalCost;
							updatePartyGold?.();
							const Buy = () => {
								this.SpawnTransport(salesman.SpawnMapIndex, salesman.SpawnX, salesman.SpawnY, travelType);
								this.layout.EnableButton(3, false);
							};
							if (isNullOrWhiteSpace(buyText)) {
								Buy();
							} else {
								this.layout.ShowClickChestMessage(buyText, Buy);
							}
						}
					}, TextAlign.Left);
				});
			}
		});
	}

	SpawnTransport(mapIndex, x, y, travelType) {
		if (x === 0)
			x = 1 + this.player.Position.X;
		if (y === 0)
			y = 1 + this.player.Position.Y;

		let spawnIndex = -1;

		for (let i = 0; i < this.CurrentSavegame.TransportLocations.length; ++i) {
			if (this.CurrentSavegame.TransportLocations[i] == null) {
				const transportLocation = new TransportLocation();
				transportLocation.TravelType = travelType;
				transportLocation.MapIndex = mapIndex;
				transportLocation.Position = new Position(x, y);
				this.CurrentSavegame.TransportLocations[i] = transportLocation;
				spawnIndex = i;
				break;
			} else if (this.CurrentSavegame.TransportLocations[i].TravelType === TravelType.Walk) {
				this.CurrentSavegame.TransportLocations[i].TravelType = travelType;
				this.CurrentSavegame.TransportLocations[i].MapIndex = mapIndex;
				this.CurrentSavegame.TransportLocations[i].Position = new Position(x, y);
				spawnIndex = i;
				break;
			}
		}

		if (mapIndex === 0)
			mapIndex = this.Map.Index;

		if (mapIndex === this.Map.Index && spawnIndex !== -1) {
			// TODO: In theory the transport could be visible even if the map index
			// does not match as there might be adjacent maps visible. But for now
			// there is no use case in Ambermoon nor Ambermoon Advanced as transports
			// are usually spawned on different maps.
			this.renderMap2D.PlaceTransport(mapIndex, x - 1, y - 1, travelType, spawnIndex);
		}
	}

	OpenFoodDealer(foodDealer, showWelcome = true) {
		this.currentPlace = foodDealer;

		if (showWelcome)
			foodDealer.AvailableGold = 0;

		let updatePartyGold = null;

		const SetupFoodDealer = (updateGold, _) => {
			updatePartyGold = updateGold;
		};

		const UpdateButtons = () => {
			this.layout.EnableButton(3, foodDealer.AvailableGold >= foodDealer.Cost);
			this.layout.EnableButton(4, foodDealer.AvailableFood > 0);
			this.layout.EnableButton(5, foodDealer.AvailableFood > 0);
		};

		const ShowDefaultMessage = () => {
			this.layout.ShowChestMessage(format(this.DataNameProvider.OneFoodCosts, foodDealer.Cost), TextAlign.Center);
		};

		this.Fade(() => {
			this.layout.Reset();
			this.ShowMap(false);
			this.SetWindow(Window.FoodDealer, foodDealer);
			this.ShowPlaceWindow(foodDealer.Name, showWelcome ? this.DataNameProvider.WelcomeFoodDealer : null,
				pictureForWorld(this.Map.World, Picture80x80.Merchant), foodDealer, SetupFoodDealer, null,
				() => foodDealer.AvailableFood === 0 ? null : this.DataNameProvider.WantToLeaveRestOfFood,
				() => this.InputEnable = true);
			const UpdateFoodDisplay = () => {
				if (foodDealer.AvailableFood > 0) {
					this.ShowTextPanel(CharacterInfo.ChestFood, true,
						`${this.DataNameProvider.FoodName}^${foodDealer.AvailableFood}`, new Rect(260, 104, 43, 15));
				} else {
					this.HideTextPanel(CharacterInfo.ChestFood);
				}
			};
			// Buy food button
			this.layout.AttachEventToButton(3, () => {
				this.layout.OpenAmountInputBox(this.DataNameProvider.BuyHowMuchFood, 109, this.DataNameProvider.FoodName,
					Math.min(99, Math.trunc(foodDealer.AvailableGold / foodDealer.Cost)), amount => {
						this.ClosePopup();
						this.nextClickHandler = null;
						this.layout.ShowPlaceQuestion(`${this.DataNameProvider.PriceOfFood}${amount * foodDealer.Cost}${this.DataNameProvider.AgreeOnPrice}`, answer => {
							if (answer) { // yes
								foodDealer.AvailableGold -= amount * foodDealer.Cost;
								foodDealer.AvailableFood += amount;
								updatePartyGold?.();
								UpdateFoodDisplay();
								UpdateButtons();
							}
							ShowDefaultMessage();
						}, TextAlign.Left);
					}, () => { this.ClosePopup(); ShowDefaultMessage(); });
			});
			// Distribute food button
			this.layout.AttachEventToButton(4, () => {
				foodDealer.AvailableFood = this.DistributeFood(foodDealer.AvailableFood, false);
				UpdateFoodDisplay();
				UpdateButtons();

				this.layout.ShowClickChestMessage(foodDealer.AvailableFood === 0
					? this.DataNameProvider.FoodDividedEqually : this.DataNameProvider.FoodLeftAfterDividing,
					ShowDefaultMessage);
			});
			// Give food button
			this.layout.AttachEventToButton(5, () => {
				this.layout.GiveFood(foodDealer.AvailableFood, food => {
					foodDealer.AvailableFood -= food;
					UpdateFoodDisplay();
					UpdateButtons();
					this.UntrapMouse();
					this.ExecuteNextUpdateCycle(ShowDefaultMessage);
				}, () => this.layout.ShowChestMessage(this.DataNameProvider.GiveToWhom), ShowDefaultMessage,
				() => this.layout.ShowClickChestMessage(this.DataNameProvider.NoOneCanCarryThatMuch));
			});
			UpdateButtons();
			if (!showWelcome)
				ShowDefaultMessage();
			else {
				const ClickedWelcomeMessage = _ => {
					if (this.layout.ChestText != null)
						this.layout.ChestText.Clicked.remove(ClickedWelcomeMessage);
					this.ExecuteNextUpdateCycle(ShowDefaultMessage);
				};
				this.layout.ChestText.Clicked.add(ClickedWelcomeMessage);
			}
		});
	}

	OpenTrainer(trainer, showWelcome = true) {
		this.currentPlace = trainer;

		if (showWelcome)
			trainer.AvailableGold = 0;

		let updatePartyGold = null;

		const SetupTrainer = (updateGold, _) => {
			updatePartyGold = updateGold;
		};

		const Train = times => {
			this.nextClickHandler = null;
			this.layout.ShowPlaceQuestion(`${this.DataNameProvider.PriceForTraining}${times * trainer.Cost}${this.DataNameProvider.AgreeOnPrice}`, answer => {
				if (answer) { // yes
					trainer.AvailableGold -= times * trainer.Cost;
					updatePartyGold?.();
					this.CurrentPartyMember.Skills[trainer.Skill].CurrentValue += times;
					this.CurrentPartyMember.TrainingPoints -= times & 0xffff;
					PlayerSwitched();
					this.layout.ShowClickChestMessage(this.DataNameProvider.IncreasedAfterTraining);
				}
			}, TextAlign.Left);
		};

		const PlayerSwitched = () => {
			this.layout.EnableButton(3, this.CurrentPartyMember.Skills[trainer.Skill].CurrentValue < this.CurrentPartyMember.Skills[trainer.Skill].MaxValue);
		};

		const GetMaxTrains = () => Math.max(0, Util.Min(Math.trunc(trainer.AvailableGold / trainer.Cost), this.CurrentPartyMember.TrainingPoints,
			this.CurrentPartyMember.Skills[trainer.Skill].MaxValue - this.CurrentPartyMember.Skills[trainer.Skill].CurrentValue));

		this.Fade(() => {
			this.layout.Reset();
			this.ShowMap(false);
			this.SetWindow(Window.Trainer, trainer);
			let welcomeText = null;
			if (showWelcome) {
				switch (trainer.Skill) {
					case Skill.Attack: welcomeText = this.DataNameProvider.WelcomeAttackTrainer; break;
					case Skill.Parry: welcomeText = this.DataNameProvider.WelcomeParryTrainer; break;
					case Skill.Swim: welcomeText = this.DataNameProvider.WelcomeSwimTrainer; break;
					case Skill.CriticalHit: welcomeText = this.DataNameProvider.WelcomeCriticalHitTrainer; break;
					case Skill.FindTraps: welcomeText = this.DataNameProvider.WelcomeFindTrapTrainer; break;
					case Skill.DisarmTraps: welcomeText = this.DataNameProvider.WelcomeDisarmTrapTrainer; break;
					case Skill.LockPicking: welcomeText = this.DataNameProvider.WelcomeLockPickingTrainer; break;
					case Skill.Searching: welcomeText = this.DataNameProvider.WelcomeSearchTrainer; break;
					case Skill.ReadMagic: welcomeText = this.DataNameProvider.WelcomeReadMagicTrainer; break;
					case Skill.UseMagic: welcomeText = this.DataNameProvider.WelcomeUseMagicTrainer; break;
					default: throw new AmbermoonException(ExceptionScope.Data, 'Invalid skill for trainer');
				}
				// web port: Amberstar guilds (src/amberstar/extensions/guild.js)
				welcomeText = this.renderView.GameData?.AmberstarExtensions?.guild?.GetWelcomeText(trainer) ?? welcomeText;
			}
			let picture;
			switch (trainer.Skill) {
				case Skill.Attack:
				case Skill.Parry:
				case Skill.Swim:
				case Skill.CriticalHit:
					picture = Picture80x80.Knight;
					break;
				case Skill.FindTraps:
				case Skill.DisarmTraps:
				case Skill.LockPicking:
				case Skill.Searching:
					picture = Picture80x80.Thief;
					break;
				case Skill.ReadMagic:
				case Skill.UseMagic:
					picture = Picture80x80.Magician;
					break;
				default:
					picture = Picture80x80.Knight;
					break;
			}
			this.ShowPlaceWindow(trainer.Name, welcomeText, picture, trainer, SetupTrainer, PlayerSwitched);
			// web port: Amberstar guilds sell the membership (class change), see src/amberstar/extensions/guild.js
			this.renderView.GameData?.AmberstarExtensions?.guild?.SetupTrainer(this, trainer, () => updatePartyGold?.(), () => PlayerSwitched());
			// train button
			this.layout.AttachEventToButton(3, () => {
				if (trainer.AvailableGold < trainer.Cost) {
					this.layout.ShowClickChestMessage(this.DataNameProvider.NotEnoughMoney);
					return;
				}

				if (this.CurrentPartyMember.TrainingPoints === 0) {
					this.layout.ShowClickChestMessage(this.DataNameProvider.NotEnoughTrainingPoints);
					return;
				}

				this.layout.OpenAmountInputBox(this.DataNameProvider.TrainHowOften, null, null, GetMaxTrains(), times => {
					this.ClosePopup();
					Train(times);
				}, () => this.ClosePopup());
			});
			PlayerSwitched();
		});
	}

	OpenMerchant(merchantIndex, placeName, buyText, isLibrary, showWelcome, boughtItems) {
		const merchant = this.GetMerchant(1 + merchantIndex);
		this.currentPlace = merchant;
		merchant.Name = placeName;
		if (showWelcome)
			merchant.AvailableGold = 0;

		this.Fade(() => {
			this.layout.Reset();
			this.ShowMap(false);
			this.SetWindow(Window.Merchant, merchantIndex, placeName, buyText, isLibrary, boughtItems);
			this.ShowMerchantWindow(merchant, placeName, showWelcome ? (isLibrary ? this.DataNameProvider.WelcomeMagician :
				this.DataNameProvider.WelcomeMerchant) : null, buyText,
			isLibrary ? Picture80x80.Librarian : pictureForWorld(this.Map.World, Picture80x80.Merchant),
			!isLibrary, boughtItems);
		});
	}

	ShowMerchantWindow(merchant, placeName, initialText, buyText, picture, buysGoods, boughtItems) {
		// TODO: use buyText?

		this.OpenStorage = merchant;

		this.layout.SetLayout(LayoutType.Items);
		this.layout.AddText(new Rect(120, 37, 29 * Global.GlyphWidth, Global.GlyphLineHeight),
			this.renderView.TextProcessor.CreateText(placeName), TextColor.White);
		this.layout.FillArea(new Rect(110, 43, 194, 80), this.GetUIColor(28), false);

		const itemSlotPositions = range(1, 6).map(index => new Position(index * 22, 139));
		itemSlotPositions.push(...range(1, 6).map(index => new Position(index * 22, 168)));
		const itemGrid = ItemGrid.Create(this, this.layout, this.renderView, this.ItemManager, itemSlotPositions, CollectionExtensions.ToList(merchant.Slots),
			false, 12, 6, 24, new Rect(7 * 22, 139, 6, 53), new Size(6, 27), ScrollbarType.SmallVertical, false,
			() => merchant.AvailableGold);

		itemGrid.Disabled = false;

		this.layout.AddItemGrid(itemGrid);
		this.layout.Set80x80Picture(picture);

		const itemArea = new Rect(16, 139, 151, 53);
		let mode = -1; // -1: show bought items, 0: buy, 3: sell, 4: examine (= button index)

		if (boughtItems == null) {
			// Note: Don't use boughtItems ??= Enumerable.Repeat(new ItemSlot(), 24).ToArray();
			// as this would use the exact same ItemSlot instance for all slots!
			boughtItems = new Array(24);
			for (let i = 0; i < boughtItems.length; ++i)
				boughtItems[i] = new ItemSlot();
		}

		boughtItems ??= repeat(new ItemSlot(), 24);
		this.currentWindow.WindowParameters[4] = boughtItems;

		const UpdateGoldDisplay = () =>
			this.characterInfoTexts.get(CharacterInfo.ChestGold).SetText(this.renderView.TextProcessor.CreateText(`${this.DataNameProvider.GoldName}^${merchant.AvailableGold}`));

		const UpdateSellButton = () => {
			this.layout.EnableButton(3, buysGoods && this.CurrentPartyMember.Inventory.Slots.some(s => !s.Empty));
		};

		const FillItems = fromMerchant => {
			itemGrid.Initialize(fromMerchant ? CollectionExtensions.ToList(merchant.Slots) : this.CurrentPartyMember.Inventory.Slots.slice(), fromMerchant);
		};

		const ShowBoughtItems = () => {
			mode = -1;
			itemGrid.DisableDrag = false;
			itemGrid.ShowPrice = false;
			itemGrid.Initialize(boughtItems.slice(), false);
		};

		const SetupRightClickAbort = () => {
			this.nextClickHandler = buttons => {
				if (buttons === MouseButtons.Right) {
					itemGrid.HideTooltip();
					this.layout.ShowChestMessage(null);
					this.UntrapMouse();
					this.CursorType = CursorType.Sword;
					this.inputEnable = true;
					ShowBoughtItems();
					return true;
				}

				return false;
			};
		};

		const AssignButton = (index, merchantItems, messageText, textAlign, checker) => {
			this.layout.AttachEventToButton(index, () => {
				if (checker?.() === false)
					return;

				mode = index;
				itemGrid.DisableDrag = true;

				this.layout.ShowChestMessage(messageText, textAlign);

				this.CursorType = CursorType.Sword;

				this.TrapMouse(itemArea);
				FillItems(merchantItems);

				itemGrid.ShowPrice = mode === 0; // buy

				SetupRightClickAbort();
			});
		};

		const UpdateButtons = () => {
			// Note: Disabling the buy button if no slot is free in bought items grid might be bad in rare
			// cases because you still might buy some stackable items like arrows. But this is very rare cause
			// you would have to buy some of this items before.
			this.layout.EnableButton(0, boughtItems.some(slot => slot == null || slot.Empty) && merchant.AvailableGold > 0);
			const anyItemsToSell = CollectionExtensions.ToList(merchant.Slots).some(s => !s.Empty);
			this.layout.EnableButton(4, anyItemsToSell);
			UpdateSellButton();
		};

		const CalculatePrice = price => {
			const charisma = this.CurrentPartyMember.Attributes[Attribute.Charisma].TotalCurrentValue;
			const basePrice = Math.trunc(price / 3);
			const bonus = Util.Floor(Math.fround(Util.Floor(Math.trunc(charisma / 10)) * Math.fround(price / 100.0)));
			return basePrice + bonus;
		};

		// Buy button
		AssignButton(0, true, this.DataNameProvider.BuyWhichItem, TextAlign.Center, null);
		// Sell button
		if (buysGoods) {
			AssignButton(3, false, this.DataNameProvider.SellWhichItem, TextAlign.Left, () => {
				if (!ItemStorageExtensions.HasEmptySlots(merchant)) {
					this.layout.ShowClickChestMessage(this.DataNameProvider.MerchantFull);
					return false;
				}
				return true;
			});
		} else {
			this.layout.EnableButton(3, false);
		}
		// Examine button
		AssignButton(4, true, this.DataNameProvider.ExamineWhichItemMerchant, TextAlign.Left, null);
		// Exit button
		this.layout.AttachEventToButton(2, () => {
			const Exit = () => {
				this.CloseWindow();

				// Distribute the gold
				const partyMembers = [...this.PartyMembers];
				let availableGold = merchant.AvailableGold;
				availableGold = this.DistributeGold(availableGold, false);
				const goldPerPartyMember = Math.trunc(availableGold / partyMembers.length);
				const restGold = availableGold % partyMembers.length;

				if (availableGold !== 0) {
					for (let i = 0; i < partyMembers.length; ++i) {
						const gold = goldPerPartyMember + (i < restGold ? 1 : 0);
						partyMembers[i].AddGold(gold);
					}
				}
			};

			if (boughtItems.some(item => item != null && !item.Empty)) {
				const ExitAndReturnItems = () => {
					const merchantSlots = CollectionExtensions.ToList(merchant.Slots);

					const ReturnItems = items => {
						const slot = firstOrDefault(merchantSlots, s => s.ItemIndex === items.ItemIndex) ??
							firstOrDefault(merchantSlots, s => s.ItemIndex === 0 || s.Amount === 0);

						if (slot != null) {
							if (slot.ItemIndex === 0)
								slot.Amount = 0;

							slot.ItemIndex = items.ItemIndex;
							slot.Amount += items.Amount;
						}
					};

					for (const items of boughtItems)
						ReturnItems(items);

					Exit();
				};

				this.layout.OpenYesNoPopup(this.ProcessText(this.DataNameProvider.WantToGoWithoutItemsMerchant), ExitAndReturnItems, () => this.ClosePopup(), () => this.ClosePopup(), 2);
			} else {
				Exit();
			}
		});

		this.itemDragCancelledHandler = combineDelegates(this.itemDragCancelledHandler, ShowBoughtItems);
		itemGrid.DisableDrag = false;
		itemGrid.ItemDragged.add((slotIndex, itemSlot, amount, updateSlot) => {
			// This can only happen for bought items but we check for safety here
			if (mode !== -1)
				throw new AmbermoonException(ExceptionScope.Application, 'Non-bought items should not be draggable.');

			if (updateSlot)
				boughtItems[slotIndex].Remove(amount);
			this.layout.EnableButton(0, boughtItems.some(slot => slot == null || slot.Empty) && merchant.AvailableGold > 0);
		});
		itemGrid.ItemDropped.add((slotIndex, itemSlot, amount) => {
			if (mode === -1) {
				for (const partyMember of this.PartyMembers)
					this.layout.UpdateCharacterStatus(this.SlotFromPartyMember(partyMember));
				itemGrid.Refresh();
			}
		});
		itemGrid.ItemClicked.add((_, slotIndex, itemSlot) => {
			const item = this.ItemManager.GetItem(itemSlot.ItemIndex);

			if (mode === -1) { // show bought items
				// No interaction
				return;
			} else if (mode === 0) { // buy
				itemGrid.HideTooltip();

				if (merchant.AvailableGold < item.Price) {
					this.layout.ShowClickChestMessage(this.DataNameProvider.NotEnoughMoneyToBuy, () => {
						this.TrapMouse(itemArea);
						SetupRightClickAbort();
					});
					return;
				}

				this.nextClickHandler = null;
				this.UntrapMouse();

				const GetMaxItemsToBuy = itemIndex => {
					const item = this.ItemManager.GetItem(itemIndex);

					if (hasFlag(item.Flags, ItemFlags.Stackable)) {
						if (boughtItems.some(slot => slot == null || slot.Empty))
							return 99;

						const slotWithItem = firstOrDefault(boughtItems, slot => slot.ItemIndex === itemIndex && slot.Amount < 99);

						return slotWithItem == null ? 0 : 99 - slotWithItem.Amount;
					} else {
						return count(boughtItems, slot => slot == null || slot.Empty);
					}
				};

				const Buy = amount => {
					this.ClosePopup();
					this.nextClickHandler = null;
					this.layout.ShowPlaceQuestion(`${this.DataNameProvider.ThisWillCost}${amount * item.Price}${this.DataNameProvider.AgreeOnPrice}`, answer => {
						if (answer) { // yes
							const column = slotIndex % Merchant.SlotsPerRow;
							const row = Math.trunc(slotIndex / Merchant.SlotsPerRow);
							const numCharges = itemSlot.NumRemainingCharges;
							const rechargeTimes = itemSlot.RechargeTimes;
							const flags = itemSlot.Flags;
							merchant.TakeItems(column, row, amount);
							itemGrid.SetItem(slotIndex, merchant.Slots[column][row], true);
							merchant.AvailableGold -= amount * item.Price;
							UpdateGoldDisplay();
							if (hasFlag(item.Flags, ItemFlags.Stackable)) {
								for (let i = 0; i < boughtItems.length; ++i) {
									if (boughtItems[i] != null && boughtItems[i].ItemIndex === item.Index &&
										boughtItems[i].Amount < 99) {
										const space = 99 - boughtItems[i].Amount;
										const add = Math.min(space, amount);
										boughtItems[i].Amount += add;
										amount -= add;
										if (amount === 0)
											break;
									}
								}
								if (amount !== 0) {
									for (let i = 0; i < boughtItems.length; ++i) {
										if (boughtItems[i] == null || boughtItems[i].Empty) {
											const newSlot = new ItemSlot();
											newSlot.ItemIndex = item.Index;
											newSlot.Amount = amount;
											newSlot.NumRemainingCharges = numCharges;
											newSlot.RechargeTimes = rechargeTimes;
											newSlot.Flags = flags;
											boughtItems[i] = newSlot;
											amount = 0;
											break;
										}
									}
								}
							} else {
								for (let i = 0; i < boughtItems.length; ++i) {
									if (boughtItems[i] == null || boughtItems[i].Empty) {
										const newSlot = new ItemSlot();
										newSlot.ItemIndex = item.Index;
										newSlot.Amount = 1;
										newSlot.NumRemainingCharges = numCharges;
										newSlot.RechargeTimes = rechargeTimes;
										newSlot.Flags = flags;
										boughtItems[i] = newSlot;
										if (--amount === 0)
											break;
									}
								}
							}
							UpdateButtons();
						}

						ShowBoughtItems();
					}, TextAlign.Left);
				};

				if (itemSlot.Amount > 1) {
					this.layout.OpenAmountInputBox(this.DataNameProvider.BuyHowMuchItems,
						item.GraphicIndex, item.Name, Util.Min(itemSlot.Amount, Math.trunc(merchant.AvailableGold / item.Price), GetMaxItemsToBuy(item.Index)), Buy,
						() => {
							this.TrapMouse(itemArea);
							SetupRightClickAbort();
						}
					);
				} else {
					Buy(1);
				}
			} else if (mode === 3) { // sell
				itemGrid.HideTooltip();

				if (!hasFlag(item.Flags, ItemFlags.NotImportant) || item.Price < 9) { // TODO: Don't know if this is right
					this.layout.ShowClickChestMessage(this.DataNameProvider.NotInterestedInItemMerchant, () => {
						this.TrapMouse(itemArea);
						SetupRightClickAbort();
					});
					return;
				}

				if (hasFlag(itemSlot.Flags, ItemSlotFlags.Broken)) {
					this.layout.ShowClickChestMessage(this.DataNameProvider.WontBuyBrokenStuff, () => {
						this.TrapMouse(itemArea);
						SetupRightClickAbort();
					});
					return;
				}

				this.nextClickHandler = null;
				this.UntrapMouse();

				const GetMaxItemsToSell = itemIndex => {
					const item = this.ItemManager.GetItem(itemIndex);

					const slots = CollectionExtensions.ToList(merchant.Slots);

					if (slots.some(slot => slot == null || slot.Empty))
						return 99;

					const slotWithItem = firstOrDefault(slots, slot => slot.ItemIndex === itemIndex && slot.Amount < 99);

					return slotWithItem == null ? 0 : 99 - slotWithItem.Amount;
				};

				const Sell = amount => {
					this.ClosePopup();
					const sellPrice = amount * CalculatePrice(item.Price);
					this.nextClickHandler = null;
					this.layout.ShowPlaceQuestion(`${this.DataNameProvider.ForThisIllGiveYou}${sellPrice}${this.DataNameProvider.AgreeOnPrice}`, answer => {
						if (answer) { // yes
							this.allInputDisabled = true;
							merchant.AddItems(this.ItemManager, item.Index, amount, itemSlot);
							this.CurrentPartyMember.Inventory.Slots[slotIndex].Remove(amount);
							this.InventoryItemRemoved(item.Index, amount, this.CurrentPartyMember);
							itemGrid.SetItem(slotIndex, this.CurrentPartyMember.Inventory.Slots[slotIndex], true);
							merchant.AvailableGold += sellPrice;
							UpdateGoldDisplay();
							UpdateButtons();
							this.allInputDisabled = false;
						}

						if (!CollectionExtensions.ToList(merchant.Slots).some(s => s.Empty))
							ShowBoughtItems();
						else {
							this.TrapMouse(itemArea);
							SetupRightClickAbort();
						}
					}, TextAlign.Left);
				};

				if (itemSlot.Amount > 1) {
					this.layout.OpenAmountInputBox(this.DataNameProvider.SellHowMuchItems,
						item.GraphicIndex, item.Name, Util.Min(itemSlot.Amount, GetMaxItemsToSell(item.Index)), Sell,
						() => {
							this.TrapMouse(itemArea);
							SetupRightClickAbort();
						}
					);
				} else {
					Sell(1);
				}
			} else if (mode === 4) { // examine
				itemGrid.HideTooltip();
				this.nextClickHandler = null;
				this.UntrapMouse();
				this.ShowItemPopup(itemSlot, () => {
					this.TrapMouse(itemArea);
					SetupRightClickAbort();
				});
			} else {
				throw new AmbermoonException(ExceptionScope.Application, 'Invalid merchant mode.');
			}
		});

		// Put all gold on the table!
		for (const partyMember of this.PartyMembers) {
			merchant.AvailableGold += partyMember.Gold;
			partyMember.RemoveGold(partyMember.Gold);
		}

		this.ShowTextPanel(CharacterInfo.ChestGold, true,
			`${this.DataNameProvider.GoldName}^${merchant.AvailableGold}`, new Rect(111, 104, 43, 15));

		UpdateButtons();
		ShowBoughtItems();

		if (initialText != null) {
			this.layout.ShowClickChestMessage(initialText);
		}

		this.ActivePlayerChanged.add(UpdateSellButton);
		this.layout.DraggedItemDropped.add(UpdateSellButton);

		const CleanUp = () => {
			this.itemDragCancelledHandler = null;
			this.ActivePlayerChanged.remove(UpdateSellButton);
			this.layout.DraggedItemDropped.remove(UpdateSellButton);
		};

		this.closeWindowHandler = _ => CleanUp();
	}
}

/** `Map.World switch { Lyramion => default, ForestMoon => DwarfMerchant, Morag => MoragMerchant, _ => default }` */
function pictureForWorld(world, lyramionPicture) {
	switch (world) {
		case World.Lyramion: return lyramionPicture;
		case World.ForestMoon: return Picture80x80.DwarfMerchant;
		case World.Morag: return Picture80x80.MoragMerchant;
		default: return lyramionPicture;
	}
}
