// Port of Ambermoon.Core/Game/Windowing.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import {
	hasFlag, format, formatNumber, getValue, tryGetValue, idiv, isNullOrEmpty, isNullOrWhiteSpace, ArgumentException
} from '../../../runtime.js';
import { Window, WindowInfo } from '../UI/Window.js';
import { LayoutType } from '../UI/Layout.js';
import { ItemGrid } from '../UI/ItemGrid.js';
import { Button } from '../UI/Button.js';
import { Global } from '../UI/Global.js';
import { BuiltinTooltips } from '../UI/BuiltinTooltips.js';
import { TextAlign } from '../Render/TextAlign.js';
import { Color } from '../Render/Color.js';
import { Graphics } from '../Render/Graphics.js';
import { MouseButtons } from '../MouseButtons.js';
import { Tutorial } from '../Tutorial.js';
import { CharacterInfo } from './Rendering.js';
import { MobileAction } from './Input.js';
import { ConversationItems } from './Conversations.js';
import { CustomTexts } from './CustomTexts.js';
import { Rect } from '../../Ambermoon.Common/Rect.js';
import { Position } from '../../Ambermoon.Common/Position.js';
import { EnumHelper } from '../../Ambermoon.Common/EnumHelper.js';
import { Inventory } from '../../Ambermoon.Data.Common/Inventory.js';
import { ItemSlot } from '../../Ambermoon.Data.Common/ItemSlot.js';
import { PartyMember } from '../../Ambermoon.Data.Common/PartyMember.js';
import { Merchant } from '../../Ambermoon.Data.Common/Merchant.js';
import { NonItemPlace } from '../../Ambermoon.Data.Common/Places.js';
import { PopupTextEvent } from '../../Ambermoon.Data.Common/Event.js';
import { CursorType } from '../../Ambermoon.Data.Common/CursorType.js';
import { SpellInfos } from '../../Ambermoon.Data.Common/SpellInfo.js';
import { Color as TextColor } from '../../Ambermoon.Data.Common/Enumerations/Color.js';
import { EquipmentSlot } from '../../Ambermoon.Data.Common/Enumerations/EquipmentSlot.js';
import { ItemSlotFlags } from '../../Ambermoon.Data.Common/Enumerations/ItemSlotFlags.js';
import { ItemFlags } from '../../Ambermoon.Data.Common/Enumerations/ItemFlags.js';
import { Class, ClassFlag, ClassExtensions } from '../../Ambermoon.Data.Common/Enumerations/Class.js';
import { Race } from '../../Ambermoon.Data.Common/Enumerations/Race.js';
import { Attribute } from '../../Ambermoon.Data.Common/Enumerations/Attribute.js';
import { Skill } from '../../Ambermoon.Data.Common/Enumerations/Skill.js';
import { Language, ExtendedLanguage } from '../../Ambermoon.Data.Common/Enumerations/Language.js';
import { Condition, ConditionExtensions } from '../../Ambermoon.Data.Common/Enumerations/Condition.js';
import { Features } from '../../Ambermoon.Data.Common/Enumerations/Features.js';
import { ActiveSpellType } from '../../Ambermoon.Data.Common/Enumerations/ActiveSpellType.js';
import { UICustomGraphic } from '../../Ambermoon.Data.Common/Enumerations/UICustomGraphic.js';
import { UIGraphic } from '../../Ambermoon.Data.Common/Enumerations/UIGraphic.js';
import { ButtonType } from '../../Ambermoon.Data.Common/Enumerations/ButtonType.js';
import { TravelTypeExtensions } from '../../Ambermoon.Data.Common/Enumerations/TravelType.js';

/** Dictionary.Add (throws on duplicate keys like .NET) */
function dictAdd(map, key, value) {
	if (map.has(key))
		throw new ArgumentException('An item with the same key has already been added.');
	map.set(key, value);
}

/** string.Compare(a, b, true) == 0 */
function equalsIgnoreCase(a, b) {
	return a.toUpperCase() === b.toUpperCase();
}

/** `x is IPlace` (implemented by Merchant and NonItemPlace) */
function isPlace(x) {
	return x instanceof Merchant || x instanceof NonItemPlace;
}

function createDefaultWindow() {
	const window = new WindowInfo();
	window.Window = Window.MapView;
	return window;
}

const DefaultWindow = createDefaultWindow();

export class GameCore_Windowing {
	/** Note: WindowInfo is a struct in C#. Clone it when assigning it to a field. */
	static DefaultWindow = DefaultWindow;

	static initFields(self) {
		// private protected readonly Layout layout; (assigned in GameCore constructor)
		self.closeWindowHandler = null;
		self.currentWindow = DefaultWindow.clone();
		self.windowTitle = null; // assigned in GameCore constructor
		self.LastWindow = DefaultWindow.clone();
		self.GameOverButtonsVisible = false;
	}

	get CurrentWindow() { return this.currentWindow; }
	get WindowActive() { return this.currentWindow.Window !== Window.MapView; }
	get PopupActive() { return this.layout?.PopupActive ?? false; }
	get WindowOrPopupActive() { return this.WindowActive || this.PopupActive; }
	get Layout() { return this.layout; }
	get TransportEnabled() { return this.layout.TransportEnabled; }
	get CampEnabled() { return this.Map?.CanCamp === true && TravelTypeExtensions.CanCampOn(this.TravelType) === true; }
	get SpellBookEnabled() { return this.CanUseSpells(); }
	get CampActive() { return this.WindowActive && this.CurrentWindow.Window === Window.Camp; }

	UpdateMapName(map = null) {
		map ??= this.Map;
		const mapName = map.IsWorldMap
			? this.DataNameProvider.GetWorldName(map.World)
			: map.Name;
		this.windowTitle.Text = this.ProcessText(mapName);
		this.windowTitle.PaletteIndex = this.UIPaletteIndex;
		this.windowTitle.TextColor = TextColor.BrightGray;
	}

	UpdateInventory() {
		if (this.CurrentWindow.Window === Window.Inventory) {
			this.layout.UpdateItemGrids();
			this.UpdateCharacterInfo();
		}
	}

	SetInventoryWeightDisplay(partyMember) {
		const weightArea = new Rect(27, 152, 68, 15);
		const weightText = format(this.DataNameProvider.CharacterInfoWeightString,
			Math.trunc(partyMember.TotalWeight / 1000), Math.trunc(partyMember.MaxWeight / 1000));
		if (partyMember.Overweight) {
			this.weightDisplayBlinking = true;
			if (this.characterInfoTexts.has(CharacterInfo.Weight))
				this.characterInfoTexts.get(CharacterInfo.Weight)?.Destroy();
			this.characterInfoTexts.set(CharacterInfo.Weight, this.AddAnimatedText((area, text, color, align) => this.layout.AddText(area, text, color, align, 5),
				weightArea.CreateModified(0, 8, 0, 0), weightText, TextAlign.Center, () => this.weightDisplayBlinking &&
					this.CurrentWindow.Window === Window.Inventory, 50, false));
		} else {
			this.weightDisplayBlinking = false;
			this.ExecuteNextUpdateCycle(() => {
				const [found, value] = tryGetValue(this.characterInfoTexts, CharacterInfo.Weight);
				if (found)
					value?.Destroy();
				this.characterInfoTexts.set(CharacterInfo.Weight, this.layout.AddText(weightArea.CreateModified(0, 8, 0, 0),
					weightText, TextColor.White, TextAlign.Center, 5));
			});
		}
	}

	OpenPartyMember(slot, inventory, openedAction = null,
		changeInputEnableStateWhileFading = true) {
		this.currentBattle?.HideAllBattleFieldDamage();

		if (this.CurrentSavegame.CurrentPartyMemberIndices[slot] === 0)
			return false;

		const partyMember = this.GetPartyMember(slot);

		if (partyMember.InventoryInaccessible) {
			// Note: In original you can't access the player stats as well so
			// we do it the same way here even though the message is misleading.
			// This feature is now used in AA for mystic imitation spell.
			const oldActivePartyMember = this.CurrentPartyMember;
			this.CurrentPartyMember = partyMember; // Needed to display the right name here
			this.ShowMessagePopup(this.DataNameProvider.NotAllowingToLookIntoBackpack);
			this.CurrentPartyMember = oldActivePartyMember;
			return false;
		}

		const switchedFromOtherPartyMember = this.CurrentInventory != null;
		let canAccessInventory = !this.HasPartyMemberFled(partyMember) && ConditionExtensions.CanOpenInventory(partyMember.Conditions);

		if (canAccessInventory && partyMember.Race === Race.Animal && this.layout.IsDragging) {
			const draggedItem = this.layout.GetDraggedItem();

			if (draggedItem == null) // gold or food
				canAccessInventory = false;
			else { // for animals only allow if the item is usable by animals (fallback item index 1 is never usable as it is a condition item)
				const classes = this.ItemManager?.GetItem(draggedItem?.Item?.Item?.ItemIndex ?? 1)?.Classes;
				canAccessInventory = classes != null ? hasFlag(classes, ClassFlag.Animal) : false;
			}
		}

		if (inventory && !canAccessInventory) {
			// When fled you can only access the stats.
			// When coming from inventory of another party member
			// you won't be able to open the inventory but if
			// you open the character with F1-F6 or right click
			// you will enter the stats window instead.
			if (switchedFromOtherPartyMember)
				return false;
			else
				inventory = false;
		}

		const OpenInventory = () => {
			if (this.currentWindow.Window === Window.Automap) {
				this.currentWindow.Window = Window.Inventory;
				this.nextClickHandler?.(MouseButtons.Right);
				this.nextClickHandler = null;
				this.currentWindow.Window = Window.Automap;
			}

			this.CurrentInventoryIndex = slot;
			const partyMember = this.GetPartyMember(slot);

			this.layout.Reset(switchedFromOtherPartyMember);
			this.ShowMap(false);
			this.SetWindow(Window.Inventory, slot);
			this.layout.SetLayout(LayoutType.Inventory);

			// As the inventory can be opened from the healer (which displays the healing symbol)
			// we will update the portraits here to hide it.
			this.SetActivePartyMember(this.SlotFromPartyMember(this.CurrentPartyMember), false);

			this.windowTitle.Text = this.renderView.TextProcessor.CreateText(this.DataNameProvider.InventoryTitleString);
			this.windowTitle.PaletteIndex = this.UIPaletteIndex;
			this.windowTitle.TextColor = TextColor.White;
			this.windowTitle.Visible = true;

			//#region Equipment and Inventory
			const equipmentSlotPositions = [
				new Position(20, 72), new Position(52, 72), new Position(84, 72),
				new Position(20, 124), new Position(84, 97), new Position(84, 124),
				new Position(20, 176), new Position(52, 176), new Position(84, 176),
			];
			const inventorySlotPositions = [];
			for (let slot = 0; slot < Inventory.VisibleWidth * Inventory.VisibleHeight; ++slot) {
				inventorySlotPositions.push(new Position(Global.InventoryX + (slot % Inventory.Width) * Global.InventorySlotWidth,
					Global.InventoryY + Math.trunc(slot / Inventory.Width) * Global.InventorySlotHeight));
			}
			let equipmentGrid = null;
			// Note: The local functions are declared before their first use (C# local functions are hoisted).
			const UpdateOccupiedHandsAndFingers = () => {
				this.CurrentInventory.NumberOfOccupiedHands = 0;
				this.CurrentInventory.NumberOfOccupiedFingers = 0;

				if (!this.CurrentInventory.Equipment.Slots.get(EquipmentSlot.RightHand).Empty)
					this.CurrentInventory.NumberOfOccupiedHands++;
				if (!this.CurrentInventory.Equipment.Slots.get(EquipmentSlot.LeftHand).Empty)
					this.CurrentInventory.NumberOfOccupiedHands++;
				if (!this.CurrentInventory.Equipment.Slots.get(EquipmentSlot.RightFinger).Empty)
					this.CurrentInventory.NumberOfOccupiedFingers++;
				if (!this.CurrentInventory.Equipment.Slots.get(EquipmentSlot.LeftFinger).Empty)
					this.CurrentInventory.NumberOfOccupiedFingers++;
			};
			const RemoveEquipment = (slotIndex, itemSlot, amount, updateSlot = true) => {
				this.RecheckUsedBattleItem(this.CurrentInventoryIndex, slotIndex, true);
				const item = this.ItemManager.GetItem(itemSlot.ItemIndex);
				this.EquipmentRemoved(item, amount, hasFlag(itemSlot.Flags, ItemSlotFlags.Cursed));

				if (updateSlot) {
					if (item.NumberOfHands === 2 && slotIndex === EquipmentSlot.RightHand - 1) {
						equipmentGrid.SetItem(slotIndex + 2, null);
						partyMember.Equipment.Slots.get(EquipmentSlot.LeftHand).Clear();
					}
				}

				this.UpdateCharacterInfo();
				this.layout.FillCharacterBars(partyMember);
			};
			const AddEquipment = (slotIndex, itemSlot, amount) => {
				const item = this.ItemManager.GetItem(itemSlot.ItemIndex);

				if (hasFlag(item.Flags, ItemFlags.Accursed))
					itemSlot.Flags |= ItemSlotFlags.Cursed;

				this.EquipmentAdded(item, amount);

				if (item.NumberOfHands === 2 && slotIndex === EquipmentSlot.RightHand - 1) {
					const secondHandItemSlot = new ItemSlot();
					secondHandItemSlot.ItemIndex = 0;
					secondHandItemSlot.Amount = 1;
					equipmentGrid.SetItem(EquipmentSlot.LeftHand - 1, secondHandItemSlot);
					partyMember.Equipment.Slots.get(EquipmentSlot.LeftHand).Replace(secondHandItemSlot);
				}

				this.UpdateCharacterInfo();
				this.layout.FillCharacterBars(partyMember);
			};
			const RemoveInventoryItem = (slotIndex, itemSlot, amount) => {
				this.RecheckUsedBattleItem(this.CurrentInventoryIndex, slotIndex, false);
				this.InventoryItemRemoved(this.ItemManager.GetItem(itemSlot.ItemIndex), amount);
				this.UpdateCharacterInfo();
			};
			const AddInventoryItem = (slotIndex, itemSlot, amount) => {
				this.InventoryItemAdded(this.ItemManager.GetItem(itemSlot.ItemIndex), amount);
				this.UpdateCharacterInfo();
			};
			const EquipItem = (itemGrid, slot, itemSlot) => {
				if (itemSlot.Empty)
					return;

				if (itemSlot.ItemIndex === 0) {
					if (slot !== EquipmentSlot.LeftHand - 1 || itemGrid.GetItemSlot(3).Empty)
						return;

					slot -= 2; // used on two-handed secondary hand slot -> switch to primary hand slot
				}

				const targetSlot = this.layout.TryEquipmentDrop(itemSlot);

				if (targetSlot != null) {
					const equipGrid = this.layout.GetEquipmentGrid();
					const targetItemSlot = equipGrid.GetItemSlot(targetSlot);

					if (itemSlot.Amount > 1) {
						// Allow equipping arrows (but only if the slot is free)
						if (targetSlot !== EquipmentSlot.LeftHand - 1 || !this.CurrentInventory.Equipment.Slots.get(EquipmentSlot.LeftHand).Empty)
							return;

						itemSlot.Remove(1);
						targetItemSlot.ItemIndex = itemSlot.ItemIndex;
						targetItemSlot.Amount = 1;
						this.CurrentInventory.NumberOfOccupiedHands++;
					} else {
						targetItemSlot.Exchange(itemSlot);
					}
					RemoveInventoryItem(slot, targetItemSlot, targetItemSlot.Amount);
					equipGrid.SetItem(targetSlot, targetItemSlot);
					itemGrid.SetItem(slot, itemSlot);
					AddEquipment(targetSlot, targetItemSlot, targetItemSlot.Amount);

					if (itemSlot.Amount !== 0 && itemSlot.ItemIndex !== 0) {
						RemoveEquipment(targetSlot, itemSlot, 1);
						AddInventoryItem(slot, itemSlot, 1);
						this.RecheckBattleEquipment(this.CurrentInventoryIndex, targetSlot + 1, this.ItemManager.GetItem(itemSlot.ItemIndex));
					}

					UpdateOccupiedHandsAndFingers();
				}
			};
			const UnequipItem = (itemGrid, slot, itemSlot) => {
				const inventoryGrid = this.layout.GetInventoryGrid();
				let targetSlot = -1;

				if (hasFlag(this.ItemManager.GetItem(itemSlot.ItemIndex).Flags, ItemFlags.Stackable)) {
					for (let i = 0; i < inventoryGrid.SlotCount; ++i) {
						const inventorySlot = inventoryGrid.GetItemSlot(i);

						if (inventorySlot.ItemIndex === itemSlot.ItemIndex && inventorySlot.Amount + itemSlot.Amount <= 99) {
							targetSlot = i;
							break;
						}
					}
				}

				if (targetSlot === -1) {
					for (let i = 0; i < inventoryGrid.SlotCount; ++i) {
						const inventorySlot = inventoryGrid.GetItemSlot(i);

						if (inventorySlot.Empty) {
							targetSlot = i;
							break;
						}
					}
				}

				if (targetSlot === -1)
					return;

				RemoveEquipment(slot, itemSlot, itemSlot.Amount, true);
				AddInventoryItem(targetSlot, itemSlot, itemSlot.Amount);

				const targetItemSlot = inventoryGrid.GetItemSlot(targetSlot);
				targetItemSlot.Add(itemSlot);
				itemSlot.Clear();

				inventoryGrid.SetItem(targetSlot, targetItemSlot);
				itemGrid.SetItem(slot, itemSlot);

				this.RecheckBattleEquipment(this.CurrentInventoryIndex, slot + 1, this.ItemManager.GetItem(targetItemSlot.ItemIndex));
				UpdateOccupiedHandsAndFingers();
			};
			const layout = this.layout;
			equipmentGrid = ItemGrid.CreateEquipment(this, this.layout, slot, this.renderView, this.ItemManager,
				equipmentSlotPositions, [...partyMember.Equipment.Slots.values()], itemSlot => {
					if (hasFlag(itemSlot.Flags, ItemSlotFlags.Cursed)) {
						this.layout.SetInventoryMessage(this.DataNameProvider.ItemIsCursed, true);
						return false;
					}

					if (this.currentBattle != null) {
						const item = this.ItemManager.GetItem(itemSlot.ItemIndex);

						if (!hasFlag(item.Flags, ItemFlags.RemovableDuringFight)) {
							this.layout.SetInventoryMessage(this.DataNameProvider.CannotUnequipInFight, true);
							return false;
						}
					}
					return true;
				}, UnequipItem, (...args) => layout.UseItem(...args));
			const inventoryGrid = ItemGrid.CreateInventory(this, this.layout, slot, this.renderView, this.ItemManager,
				inventorySlotPositions, partyMember.Inventory.Slots.slice(), EquipItem, (...args) => layout.UseItem(...args));
			this.layout.AddItemGrid(inventoryGrid);
			for (let i = 0; i < partyMember.Inventory.Slots.length; ++i) {
				if (!partyMember.Inventory.Slots[i].Empty) {
					if (partyMember.Inventory.Slots[i].ItemIndex === 0) // Item index 0 but amount is not 0 -> not allowed for inventory
						partyMember.Inventory.Slots[i].Amount = 0;

					inventoryGrid.SetItem(i, partyMember.Inventory.Slots[i]);
				}
			}
			const rightHandSlot = getValue(partyMember.Equipment.Slots, EquipmentSlot.RightHand);
			if (rightHandSlot != null && rightHandSlot.ItemIndex !== 0) {
				const rightHandItem = this.ItemManager.GetItem(rightHandSlot.ItemIndex);

				if (rightHandItem.NumberOfHands === 2) {
					let leftHandSlot = getValue(partyMember.Equipment.Slots, EquipmentSlot.LeftHand);

					if (leftHandSlot == null) {
						leftHandSlot = new ItemSlot();
						leftHandSlot.Amount = 1;
						leftHandSlot.ItemIndex = 0;
					} else if (leftHandSlot.Empty)
						leftHandSlot.Amount = 1;
				}
			}
			this.layout.AddItemGrid(equipmentGrid);
			for (const equipmentSlot of EnumHelper.GetValues(EquipmentSlot).slice(1)) {
				if (!partyMember.Equipment.Slots.get(equipmentSlot).Empty) {
					if (equipmentSlot !== EquipmentSlot.LeftHand &&
						partyMember.Equipment.Slots.get(equipmentSlot).ItemIndex === 0) // Item index 0 but amount is not 0 -> only allowed for left hand
						partyMember.Equipment.Slots.get(equipmentSlot).Amount = 0;

					equipmentGrid.SetItem(equipmentSlot - 1, partyMember.Equipment.Slots.get(equipmentSlot));
				}
			}
			equipmentGrid.ItemExchanged.add((slotIndex, draggedItem, draggedAmount, droppedItem) => {
				RemoveEquipment(slotIndex, draggedItem, draggedAmount);
				AddEquipment(slotIndex, droppedItem, droppedItem.Amount);
				this.RecheckBattleEquipment(this.CurrentInventoryIndex, slotIndex + 1, this.ItemManager.GetItem(draggedItem.ItemIndex));
			});
			equipmentGrid.ItemDragged.add((slotIndex, itemSlot, amount, updateSlot) => {
				RemoveEquipment(slotIndex, itemSlot, amount, updateSlot);
				if (updateSlot) {
					partyMember.Equipment.Slots.get(slotIndex + 1).Remove(amount);
					if (this.CurrentWindow.Window === Window.Inventory) {
						this.layout.UpdateLayoutButtons();
						this.UpdateCharacterInfo();
					}
				}
				// TODO: When resetting the item back to the slot (even just dropping it there) the previous battle action should be restored.
				this.RecheckBattleEquipment(this.CurrentInventoryIndex, slotIndex + 1, this.ItemManager.GetItem(itemSlot.ItemIndex));
			});
			equipmentGrid.ItemDropped.add((slotIndex, itemSlot, amount) => {
				AddEquipment(slotIndex, itemSlot, amount);
				this.RecheckBattleEquipment(this.CurrentInventoryIndex, slotIndex + 1, null);
			});
			inventoryGrid.ItemExchanged.add((slotIndex, draggedItem, draggedAmount, droppedItem) => {
				RemoveInventoryItem(slotIndex, draggedItem, draggedAmount);
				AddInventoryItem(slotIndex, droppedItem, droppedItem.Amount);
			});
			inventoryGrid.ItemDragged.add((slotIndex, itemSlot, amount, updateSlot) => {
				RemoveInventoryItem(slotIndex, itemSlot, amount);
				if (updateSlot) {
					partyMember.Inventory.Slots[slotIndex].Remove(amount);
					if (this.CurrentWindow.Window === Window.Inventory)
						this.layout.UpdateLayoutButtons();
				}
			});
			inventoryGrid.ItemDropped.add((slotIndex, itemSlot, amount) => {
				AddInventoryItem(slotIndex, itemSlot, amount);
			});
			//#endregion
			//#region Character info
			this.DisplayCharacterInfo(partyMember, false);
			// Weight display
			const weightArea = new Rect(27, 152, 68, 15);
			this.layout.AddPanel(weightArea, 2);
			this.layout.AddText(weightArea.CreateModified(0, 1, 0, 0), this.DataNameProvider.CharacterInfoWeightHeaderString,
				TextColor.White, TextAlign.Center, 5);
			this.SetInventoryWeightDisplay(partyMember);
			//#endregion
		};

		const OpenCharacterStats = () => {
			this.layout.Reset();
			this.ShowMap(false);
			this.SetWindow(Window.Stats, slot);
			this.layout.SetLayout(LayoutType.Stats);
			this.layout.EnableButton(0, canAccessInventory);
			this.layout.FillArea(new Rect(16, 49, 176, 145), this.GetUIColor(28), false);

			// As the stats can be opened from the healer (which displays the healing symbol)
			// we will update the portraits here to hide it.
			this.SetActivePartyMember(this.SlotFromPartyMember(this.CurrentPartyMember), false);

			this.HideWindowTitle();

			this.CurrentInventoryIndex = slot;
			const partyMember = this.GetPartyMember(slot);
			let index;

			const AddTooltip = (area, tooltip) => {
				this.layout.AddTooltip(area, tooltip, TextColor.White, TextAlign.Left, new Color(this.GetPrimaryUIColor(15), 0xb0));
			};

			const extendedLanguages = hasFlag(this.Features, Features.ExtendedLanguages);

			//#region Character info
			this.DisplayCharacterInfo(partyMember, false);
			//#endregion
			//#region Attributes
			this.layout.AddText(new Rect(22, 50, 72, Global.GlyphLineHeight), this.DataNameProvider.AttributesHeaderString, TextColor.LightGreen, TextAlign.Center);
			index = 0;
			for (const attribute of EnumHelper.GetValues(Attribute)) {
				if (attribute === Attribute.Age)
					break;

				const y = 57 + index++ * Global.GlyphLineHeight;
				const attributeValues = partyMember.Attributes[attribute];
				if (attribute === Attribute.AntiMagic && this.CurrentSavegame.IsSpellActive(ActiveSpellType.AntiMagic)) {
					const bonus = this.CurrentSavegame.GetActiveSpellLevel(ActiveSpellType.AntiMagic);
					const AddAnimatedText = (area, text) => {
						this.AddAnimatedText((area, text, color, align) => this.layout.AddText(area, text, color, align), area, text, TextAlign.Left,
							() => this.CurrentWindow.Window === Window.Stats, 100, true);
					};
					AddAnimatedText(new Rect(22, y, 30, Global.GlyphLineHeight), this.DataNameProvider.GetAttributeShortName(attribute));
					AddAnimatedText(new Rect(52, y, 42, Global.GlyphLineHeight),
						(attributeValues.TotalCurrentValue + bonus > 999 ? '***' : `${formatNumber(attributeValues.TotalCurrentValue + bonus, '000')}`) + `/${formatNumber(attributeValues.MaxValue, '000')}`);
				} else {
					this.layout.AddText(new Rect(22, y, 30, Global.GlyphLineHeight), this.DataNameProvider.GetAttributeShortName(attribute));
					this.layout.AddText(new Rect(52, y, 42, Global.GlyphLineHeight),
						(attributeValues.TotalCurrentValue > 999 ? '***' : `${formatNumber(attributeValues.TotalCurrentValue, '000')}`) + `/${formatNumber(attributeValues.MaxValue, '000')}`);
				}
				if (this.CoreConfiguration.ShowPlayerStatsTooltips)
					AddTooltip(new Rect(22, y, 72, Global.GlyphLineHeight), BuiltinTooltips.GetAttributeTooltip(this.Features, this.GameLanguage, attribute, partyMember));
			}
			//#endregion
			//#region Skills
			this.layout.AddText(new Rect(22, 115, 72, Global.GlyphLineHeight), this.DataNameProvider.SkillsHeaderString, TextColor.LightGreen, TextAlign.Center);
			index = 0;
			for (const skill of EnumHelper.GetValues(Skill)) {
				const y = 122 + index++ * Global.GlyphLineHeight;
				const skillValues = partyMember.Skills[skill];
				const current = skillValues.TotalCurrentValue; // eslint-disable-line no-unused-vars

				if (skill === Skill.Searching && hasFlag(this.Features, Features.ClairvoyanceGrantsSearchSkill) &&
					this.CurrentSavegame.IsSpellActive(ActiveSpellType.Clairvoyance)) {
					const bonus = this.CurrentSavegame.GetActiveSpellLevel(ActiveSpellType.Clairvoyance);
					const AddAnimatedText = (area, text) => {
						this.AddAnimatedText((area, text, color, align) => this.layout.AddText(area, text, color, align), area, text, TextAlign.Left,
							() => this.CurrentWindow.Window === Window.Stats, 100, true);
					};
					AddAnimatedText(new Rect(22, y, 30, Global.GlyphLineHeight), this.DataNameProvider.GetSkillShortName(skill));
					AddAnimatedText(new Rect(52, y, 42, Global.GlyphLineHeight),
						(skillValues.TotalCurrentValue + bonus > 99 ? '**' : `${formatNumber(skillValues.TotalCurrentValue + bonus, '00')}`) + `%/${formatNumber(skillValues.MaxValue, '00')}%`);
				} else {
					this.layout.AddText(new Rect(22, y, 30, Global.GlyphLineHeight), this.DataNameProvider.GetSkillShortName(skill));
					this.layout.AddText(new Rect(52, y, 42, Global.GlyphLineHeight),
						(skillValues.TotalCurrentValue > 99 ? '**' : `${formatNumber(skillValues.TotalCurrentValue, '00')}`) + `%/${formatNumber(skillValues.MaxValue, '00')}%`);
				}

				if (this.CoreConfiguration.ShowPlayerStatsTooltips)
					AddTooltip(new Rect(22, y, 72, Global.GlyphLineHeight), BuiltinTooltips.GetSkillTooltip(this.GameLanguage, skill, partyMember));
			}
			//#endregion
			//#region Languages
			const languageY = extendedLanguages ? 115 : 50;
			this.layout.AddText(new Rect(106, languageY, 72, Global.GlyphLineHeight), this.DataNameProvider.LanguagesHeaderString, TextColor.LightGreen, TextAlign.Center);
			index = 0;
			for (const language of EnumHelper.GetValues(Language).slice(1)) { // skip Language.None
				const y = languageY + 7 + index++ * Global.GlyphLineHeight;
				const learned = hasFlag(partyMember.SpokenLanguages, language);
				if (learned)
					this.layout.AddText(new Rect(106, y, 72, Global.GlyphLineHeight), this.DataNameProvider.GetLanguageName(language));
			}
			if (extendedLanguages) {
				for (const extendedLanguage of EnumHelper.GetValues(ExtendedLanguage).slice(1)) { // skip ExtendedLanguage.None
					const y = languageY + 7 + index++ * Global.GlyphLineHeight;
					const learned = hasFlag(partyMember.SpokenExtendedLanguages, extendedLanguage);
					if (learned) {
						const name = this.DataNameProvider.GetExtendedLanguageName(extendedLanguage);

						if (isNullOrWhiteSpace(name))
							index--;
						else
							this.layout.AddText(new Rect(106, y, 72, Global.GlyphLineHeight), name);
					}
				}
			}
			//#endregion
			//#region Conditions
			const conditionY = extendedLanguages ? 50 : 115;
			this.layout.AddText(new Rect(106, conditionY, 72, Global.GlyphLineHeight), this.DataNameProvider.ConditionsHeaderString, TextColor.LightGreen, TextAlign.Center);
			index = 0;
			// Total space is 80 pixels wide. Each condition icon is 16 pixels wide. So there is space for 5 condition icons per line.
			const conditionsPerRow = 5;
			for (const condition of partyMember.VisibleConditions) {
				if (condition === Condition.DeadAshes || condition === Condition.DeadDust)
					continue;

				if (condition !== Condition.DeadCorpse && !hasFlag(partyMember.Conditions, condition))
					continue;

				const column = index % conditionsPerRow;
				const row = Math.trunc(index / conditionsPerRow);
				++index;

				const x = 96 + column * 16;
				const y = conditionY + 9 + row * 17;
				const area = new Rect(x, y, 16, 16); // eslint-disable-line no-unused-vars
				const conditionName = this.DataNameProvider.GetConditionName(condition);
				const tooltip = this.CoreConfiguration.ShowPlayerStatsTooltips ? null : conditionName;
				this.layout.AddSprite(new Rect(x, y, 16, 16), Graphics.GetConditionGraphicIndex(condition), this.UIPaletteIndex,
					2, tooltip, condition === Condition.DeadCorpse ? TextColor.DeadPartyMember : TextColor.ActivePartyMember);
				if (this.CoreConfiguration.ShowPlayerStatsTooltips) {
					let tooltipCondition = condition;
					if (tooltipCondition === Condition.DeadCorpse) {
						if (hasFlag(partyMember.Conditions, Condition.DeadDust))
							tooltipCondition = Condition.DeadDust;
						else if (hasFlag(partyMember.Conditions, Condition.DeadAshes))
							tooltipCondition = Condition.DeadAshes;
					}
					AddTooltip(new Rect(x, y, 16, 16), conditionName + '^^' + BuiltinTooltips.GetConditionTooltip(this.GameLanguage, tooltipCondition, partyMember));
				}
			}
			//#endregion
		};

		const openAction = inventory ? OpenInventory : OpenCharacterStats;

		if ((this.currentWindow.Window === Window.Inventory && inventory) ||
			(this.currentWindow.Window === Window.Stats && !inventory)) {
			openAction();
			openedAction?.();
		} else {
			this.closeWindowHandler?.(false);
			this.closeWindowHandler = null;

			this.Fade(() => {
				openAction();
				openedAction?.();
			}, changeInputEnableStateWhileFading);
		}

		return true;
	}

	OpenDictionary(choiceHandler, colorProvider = null, abortAction = null) {
		const WordEntered = word => {
			// Add to known words if the entered word is a valid dictionary word.
			const index = this.textDictionary.Entries.findIndex(entry => equalsIgnoreCase(entry, word));

			if (index !== -1)
				this.CurrentSavegame.AddDictionaryWord(index);

			choiceHandler?.(word);
		};

		const columns = 11;
		const rows = 10;
		const popupArea = new Rect(32, 34, columns * 16, rows * 16);
		this.TrapMouse(new Rect(popupArea.Left + 16, popupArea.Top + 16, popupArea.Width - 32, popupArea.Height - 32));
		const popup = this.layout.OpenPopup(popupArea.Position, columns, rows, true, false);
		const mouthButton = popup.AddButton(new Position(popupArea.Left + 16, popupArea.Bottom - 30));
		const exitButton = popup.AddButton(new Position(popupArea.Right - 32 - Button.Width, popupArea.Bottom - 30));
		mouthButton.ButtonType = ButtonType.Mouth;
		exitButton.ButtonType = ButtonType.Exit;
		mouthButton.DisplayLayer = 200;
		exitButton.DisplayLayer = 200;
		mouthButton.LeftClickAction = () =>
			this.layout.OpenInputPopup(new Position(51, 87), 20, WordEntered);
		exitButton.LeftClickAction = () => {
			this.layout.ClosePopup();
			abortAction?.();
		};
		// Note: C# OrderBy on strings uses the culture-aware default comparer -> localeCompare.
		const dictionaryList = popup.AddDictionaryListBox(this.Dictionary.slice().sort((a, b) => a.localeCompare(b)).map(entry => ({
			Key: entry,
			Value: (_, text) => {
				this.layout.ClosePopup(false);
				choiceHandler?.(text);
			}
		})), colorProvider);
		const scrollRange = Math.max(0, this.Dictionary.length - 16);
		const scrollbar = popup.AddScrollbar(this.layout, scrollRange, 2);
		scrollbar.Scrolled.add(offset => {
			dictionaryList.ScrollTo(offset);
		});
		popup.Closed.add(() => this.UntrapMouse());
	}

	/**
	 * Opens the list of spells.
	 * @param partyMember Party member who want to use a spell.
	 * @param spellAvailableChecker Returns null if the spell can be used, otherwise the error message.
	 * @param choiceHandler Handler which receives the selected spell.
	 */
	OpenSpellList(partyMember, spellAvailableChecker, choiceHandler) {
		this.Pause();
		const columns = 13;
		const rows = 10;
		const popupArea = new Rect(32, 40, columns * 16, rows * 16);
		this.TrapMouse(new Rect(popupArea.Left + 16, popupArea.Top + 16, popupArea.Width - 32, popupArea.Height - 32));
		const popup = this.layout.OpenPopup(popupArea.Position, columns, rows, true, false);
		const spells = [...partyMember.LearnedSpells].map(spell => ({ Key: spell, Value: spellAvailableChecker(spell) }));
		const GetSpellEntry = (spell, available) => {
			const spellInfo = getValue(this.SpellInfos, spell); // eslint-disable-line no-unused-vars
			let entry = this.DataNameProvider.GetSpellName(spell);

			if (available) {
				// append usage amount
				entry = entry.padEnd(21) + `(${Math.min(99, idiv(partyMember.SpellPoints.CurrentValue, SpellInfos.GetSPCost(this.SpellInfos, this.Features, spell, partyMember)))})`;
			}

			return entry;
		};
		const spellList = popup.AddSpellListBox(spells.map(spell => ({
			Key: GetSpellEntry(spell.Key, spell.Value == null),
			Value: spell.Value != null ? null : ((index, _) => {
				this.UntrapMouse();
				this.layout.ClosePopup(false);
				this.Resume();
				choiceHandler?.(spells[index].Key);
			})
		})));
		popup.AddSunkenBox(new Rect(48, 173, 174, 10));
		const spellMessage = popup.AddText(new Rect(49, 175, 172, 6), '', TextColor.Bright, TextAlign.Center, true, 2);
		popup.Closed.add(() => {
			this.UntrapMouse();
			this.Resume();
		});
		spellList.HoverItem.add(index => {
			const message = index === -1 ? null : spells[index].Value;

			if (message == null)
				spellMessage.SetText(this.renderView.TextProcessor.CreateText(''));
			else
				spellMessage.SetText(this.ProcessText(message));
		});
		const scrollRange = Math.max(0, spells.length - 16);
		const scrollbar = popup.AddScrollbar(this.layout, scrollRange, 2);
		const slot = this.SlotFromPartyMember(partyMember);
		scrollbar.Scrolled.add(offset => {
			this.spellListScrollOffsets[slot] = offset;
			spellList.ScrollTo(offset);
		});
		// Initial scroll
		if (this.spellListScrollOffsets[slot] > scrollRange)
			this.spellListScrollOffsets[slot] = scrollRange;
		scrollbar.SetScrollPosition(this.spellListScrollOffsets[slot], true);
	}

	/** displayTime is a TimeSpan -> milliseconds */
	ShowBriefMessagePopup(text, displayTime,
		textAlign = TextAlign.Center, displayLayerOffset = 0) {
		if (this.layout.PopupActive)
			return;

		const paused = this.paused;
		const inputEnabled = this.InputEnable;
		this.Pause();
		this.InputEnable = false;
		// Simple text popup
		let popup;
		popup = this.layout.OpenTextPopup(this.ProcessText(text), () => {
			popup = null;
			if (inputEnabled)
				this.InputEnable = true;
			if (!paused)
				this.Resume();
			this.ResetCursor();
		}, true, true, false, textAlign, displayLayerOffset, this.PrimaryUIPaletteIndex);
		this.CursorType = CursorType.Wait;
		this.TrapMouse(popup.ContentArea);
		this.AddTimedEvent(displayTime, () => {
			if (popup != null)
				this.ClosePopup();
		});
	}

	ShowMessagePopup(text, closeAction = null,
		textAlign = TextAlign.Center, displayLayerOffset = 0,
		offset = null) {
		if (this.layout.PopupActive) {
			closeAction?.();
			return;
		}

		this.Pause();
		this.InputEnable = false;
		// Simple text popup
		const popup = this.layout.OpenTextPopup(this.ProcessText(text), () => {
			this.InputEnable = true;
			this.Resume();
			this.ResetCursor();
			closeAction?.();
		}, true, true, false, textAlign, displayLayerOffset, null, offset);
		this.CursorType = CursorType.Click;
		this.TrapMouse(popup.ContentArea);
	}

	/**
	 * Overloads:
	 * ShowTextPopup(IText text, Action<PopupTextEvent.Response> responseHandler)
	 * ShowTextPopup(Map map, PopupTextEvent popupTextEvent, Action<PopupTextEvent.Response> responseHandler)
	 */
	ShowTextPopup(...args) {
		if (args.length === 3) {
			const [map, popupTextEvent, responseHandler] = args;
			const text = this.ProcessText(map.GetText(popupTextEvent.TextIndex, this.DataNameProvider.TextBlockMissing));

			if (popupTextEvent.HasImage) {
				// Those always use a custom layout
				this.ShowEvent(text, popupTextEvent.EventImageIndex,
					() => responseHandler?.(PopupTextEvent.Response.Close));
			} else {
				this.ShowTextPopup(text, responseHandler);
			}
			return;
		}

		const [text, responseHandler] = args;
		this.Pause();
		this.InputEnable = false;
		// Simple text popup
		this.layout.OpenTextPopup(text, () => {
			this.InputEnable = true;
			this.Resume();
			this.ResetCursor();
			responseHandler?.(PopupTextEvent.Response.Close);
		}, true, true);
		this.CursorType = CursorType.Click;
	}

	ShowEvent(text, imageIndex, closeAction,
		gameOver = false) {
		this.GameOverButtonsVisible = false;

		this.Fade(() => {
			this.SetWindow(Window.Event, gameOver);
			this.layout.SetLayout(LayoutType.Event);
			this.ShowMap(false);
			this.layout.Reset();
			[this.currentUIPaletteIndex] = this.layout.AddEventPicture(imageIndex);
			this.layout.UpdateUIPalette(this.currentUIPaletteIndex);
			this.cursor.UpdatePalette(this);
			this.layout.FillArea(new Rect(16, 138, 288, 55), this.GetUIColor(28), false);

			// Position = 18,139, max 40 chars per line and 7 lines.
			const textArea = new Rect(18, 139, 285, 49);
			let scrollableText = this.layout.AddScrollableText(textArea, text, TextColor.BrightGray);

			const AddLoadQuitOptions = () => {
				this.GameOverButtonsVisible = true;
				this.InputEnable = true;
				const hasSavegames = this.Provider_HasSavegames();

				this.layout.AddText(textArea, this.ProcessText(hasSavegames
					? this.DataNameProvider.GameOverLoadOrQuit
					: this.GetCustomText(CustomTexts.Index.StartNewGameOrQuit)),
				TextColor.BrightGray);
				const ShowButtons = () => {
					this.ExecuteNextUpdateCycle(() => this.CursorType = CursorType.Sword);
					this.layout.ShowGameOverButtons(load => {
						if (load) {
							if (hasSavegames)
								this.layout.OpenLoadMenu(finishAction => this.CloseWindow(finishAction), ShowButtons, true);
							else
								this.NewGame();
						} else {
							this.Quit(ShowButtons);
						}
					}, hasSavegames);
				};
				ShowButtons();
			};

			this.ShowMobileClickIndicator(Math.trunc(Global.VirtualScreenWidth / 2) - 8, Global.VirtualScreenHeight - 16 + (gameOver ? -8 : 3));

			scrollableText.Clicked.add(scrolledToEnd => {
				if (scrolledToEnd) {
					this.HideMobileClickIndicator();

					if (gameOver) {
						scrollableText?.Destroy();
						scrollableText = null;
						AddLoadQuitOptions();
					} else {
						// Special case, we show a small game introduction
						// when playing for the first time and closing the
						// initial event with grandfather.
						if (this.CoreConfiguration.FirstStart && imageIndex === 1 && !this.renderView.GameData?.IsAmberstar) {
							// This avoids asking for introduction twice in the same sessions.
							this.CoreConfiguration.FirstStart = false;
							this.CloseWindow(() => {
								closeAction?.();
								this.ShowTutorial();
							});
						} else {
							this.CloseWindow(closeAction);
						}
					}
				}
			});
			this.CursorType = CursorType.Click;
			this.InputEnable = false;
		});
	}

	/**
	 * Overloads:
	 * ShowDecisionPopup(string text, Action<PopupTextEvent.Response> responseHandler, int minLines = 3,
	 *     byte displayLayerOffset = 0, TextAlign textAlign = TextAlign.Left, bool canAbort = true)
	 * ShowDecisionPopup(Map map, DecisionEvent decisionEvent, Action<PopupTextEvent.Response> responseHandler)
	 */
	ShowDecisionPopup(...args) {
		if (typeof args[0] !== 'string') {
			const [map, decisionEvent, responseHandler] = args;
			this.ShowDecisionPopup(map.GetText(decisionEvent.TextIndex, this.DataNameProvider.TextBlockMissing), responseHandler, 0);
			return;
		}

		const [text, responseHandler, minLines = 3, displayLayerOffset = 0, textAlign = TextAlign.Left, canAbort = true] = args;
		const popup = this.layout.OpenYesNoPopup(
			this.ProcessText(text),
			() => {
				this.layout.ClosePopup(false, true);
				this.InputEnable = true;
				this.Resume();
				responseHandler?.(PopupTextEvent.Response.Yes);
			},
			() => {
				this.layout.ClosePopup(false, true);
				this.InputEnable = true;
				this.Resume();
				responseHandler?.(PopupTextEvent.Response.No);
			},
			() => {
				this.InputEnable = true;
				this.Resume();
				responseHandler?.(PopupTextEvent.Response.Close);
			}, minLines, displayLayerOffset, textAlign
		);
		popup.CanAbort = canAbort;
		this.Pause();
		this.InputEnable = false;
		this.CursorType = CursorType.Sword;
	}

	DisplayCharacterInfo(character, conversation) {
		const SetupSecondaryStatTooltip = (area, secondaryStat) => {
			this.characterInfoStatTooltips.set(secondaryStat, this.ShowSecondaryStatTooltip(area, secondaryStat, character));
		};
		const SecondaryStat = BuiltinTooltips.SecondaryStat;

		const offsetY = conversation ? -6 : 0;

		this.characterInfoTexts.clear();
		this.characterInfoPanels.clear();
		this.characterInfoStatTooltips.clear();
		this.layout.FillArea(new Rect(208, offsetY + 49, 96, 80), this.GetUIColor(28), false);
		this.layout.AddSprite(new Rect(208, offsetY + 49, 32, 34), Graphics.UICustomGraphicOffset + UICustomGraphic.PortraitBackground, this.CustomGraphicPaletteIndex, 1);
		this.layout.AddSprite(new Rect(208, offsetY + 49, 32, 34), Graphics.PortraitOffset + character.PortraitIndex - 1, this.PrimaryUIPaletteIndex, 2);
		if (!isNullOrEmpty(this.DataNameProvider.GetRaceName(character.Race)))
			this.layout.AddText(new Rect(242, offsetY + 49, 62, 7), this.DataNameProvider.GetRaceName(character.Race));
		this.layout.AddText(new Rect(242, offsetY + 56, 62, 7), this.DataNameProvider.GetGenderName(character.Gender));
		let area = new Rect(242, offsetY + 63, 62, 7);
		dictAdd(this.characterInfoTexts, CharacterInfo.Age, this.layout.AddText(area,
			format(this.DataNameProvider.CharacterInfoAgeString.replaceAll('000', '0'),
				character.Attributes[Attribute.Age].CurrentValue)));
		SetupSecondaryStatTooltip(area, SecondaryStat.Age);
		if (character.Class < Class.Monster && !isNullOrEmpty(this.DataNameProvider.GetClassName(character.Class))) {
			if (!conversation || character.Class < Class.Animal) {
				dictAdd(this.characterInfoTexts, CharacterInfo.Level, this.layout.AddText(new Rect(242, offsetY + 70, 62, 7),
					`${this.DataNameProvider.GetClassName(character.Class)} ${character.Level}`));
				this.characterInfoStatTooltips.set(SecondaryStat.LevelWithAPRIncrease, this.ShowSecondaryStatTooltip(new Rect(242, offsetY + 70, 62, 7),
					character.AttacksPerRoundIncreaseLevels === 0 ? SecondaryStat.LevelWithoutAPRIncrease : SecondaryStat.LevelWithAPRIncrease, character));
			}
		}
		this.layout.AddText(new Rect(208, offsetY + 84, 96, 7), character.Name, conversation ? TextColor.PartyMember : TextColor.ActivePartyMember, TextAlign.Center);
		if (!conversation) {
			const magicClass = ClassExtensions.IsMagic(character.Class);

			if (character.Class !== Class.Animal) {
				area = new Rect(242, 77, 62, 7);
				dictAdd(this.characterInfoTexts, CharacterInfo.EP, this.layout.AddText(area,
					format(this.DataNameProvider.CharacterInfoExperiencePointsString.replaceAll('0000000000', '0'),
						character.ExperiencePoints)));
				this.characterInfoStatTooltips.set(SecondaryStat.EP50, this.ShowSecondaryStatTooltip(area, character.Level < 50 ?
					SecondaryStat.EPPre50 : SecondaryStat.EP50, character));
			}
			area = new Rect(208, 92, 96, 7);
			dictAdd(this.characterInfoTexts, CharacterInfo.LP, this.layout.AddText(area,
				format(this.DataNameProvider.CharacterInfoHitPointsString,
					Math.min(character.HitPoints.CurrentValue, character.HitPoints.TotalMaxValue), character.HitPoints.TotalMaxValue),
				TextColor.White, TextAlign.Center));
			SetupSecondaryStatTooltip(area, SecondaryStat.LP);
			if (magicClass) {
				area = new Rect(208, 99, 96, 7);
				dictAdd(this.characterInfoTexts, CharacterInfo.SP, this.layout.AddText(area,
					format(this.DataNameProvider.CharacterInfoSpellPointsString,
						Math.min(character.SpellPoints.CurrentValue, character.SpellPoints.TotalMaxValue), character.SpellPoints.TotalMaxValue),
					TextColor.White, TextAlign.Center));
				SetupSecondaryStatTooltip(area, SecondaryStat.SP);
			}
			dictAdd(this.characterInfoTexts, CharacterInfo.SLPAndTP, this.layout.AddText(new Rect(208, 106, 96, 7),
				(magicClass ? format(this.DataNameProvider.CharacterInfoSpellLearningPointsString, character.SpellLearningPoints) : ' '.repeat(7)) + ' ' +
				format(this.DataNameProvider.CharacterInfoTrainingPointsString, character.TrainingPoints), TextColor.White, TextAlign.Center));
			if (magicClass)
				SetupSecondaryStatTooltip(new Rect(214, 106, 42, 7), SecondaryStat.SLP);
			SetupSecondaryStatTooltip(new Rect(262, 106, 36, 7), SecondaryStat.TP);
			const displayGold = isPlace(this.OpenStorage) ? 0 : character.Gold;
			dictAdd(this.characterInfoTexts, CharacterInfo.GoldAndFood, this.layout.AddText(new Rect(208, 113, 96, 7),
				format(this.DataNameProvider.CharacterInfoGoldAndFoodString, displayGold, character.Food),
				TextColor.White, TextAlign.Center));
			SetupSecondaryStatTooltip(new Rect(214, 113, 42, 7), SecondaryStat.Gold);
			SetupSecondaryStatTooltip(new Rect(262, 113, 36, 7), SecondaryStat.Food);
			this.layout.AddSprite(new Rect(214, 120, 16, 9), Graphics.GetUIGraphicIndex(UIGraphic.Attack), this.UIPaletteIndex);
			let attack = character.BaseAttackDamage + this.AddAttributeDamageBonus(character, this.AdjustAttackDamageForNotUsedAmmunition(character, character.BonusAttackDamage));
			if (this.CurrentSavegame.IsSpellActive(ActiveSpellType.Attack)) {
				if (attack > 0)
					attack = Math.trunc((attack * (100 + this.CurrentSavegame.GetActiveSpellLevel(ActiveSpellType.Attack))) / 100);
				const attackString = format(this.DataNameProvider.CharacterInfoDamageString.replaceAll(' ', attack < 0 ? '-' : '+'), Math.abs(attack));
				dictAdd(this.characterInfoTexts, CharacterInfo.Attack, this.AddAnimatedText((area, text, color, align) => this.layout.AddText(area, text, color, align),
					new Rect(220, 122, 30, 7), attackString, TextAlign.Left, () => this.CurrentWindow.Window === Window.Inventory, 100, true));
			} else {
				const attackString = format(this.DataNameProvider.CharacterInfoDamageString.replaceAll(' ', attack < 0 ? '-' : '+'), Math.abs(attack));
				dictAdd(this.characterInfoTexts, CharacterInfo.Attack, this.layout.AddText(new Rect(220, 122, 30, 7), attackString, TextColor.White, TextAlign.Left));
			}
			SetupSecondaryStatTooltip(new Rect(214, 120, 36, 9), SecondaryStat.Damage);
			this.layout.AddSprite(new Rect(261, 120, 16, 9), Graphics.GetUIGraphicIndex(UIGraphic.Defense), this.UIPaletteIndex);
			let defense = character.BaseDefense + character.BonusDefense + Math.trunc(character.Attributes[Attribute.Stamina].TotalCurrentValue / 25);
			if (this.CurrentSavegame.IsSpellActive(ActiveSpellType.Protection)) {
				if (defense > 0)
					defense = Math.trunc((defense * (100 + this.CurrentSavegame.GetActiveSpellLevel(ActiveSpellType.Protection))) / 100);
				const defenseString = format(this.DataNameProvider.CharacterInfoDamageString.replaceAll(' ', defense < 0 ? '-' : '+'), Math.abs(defense));
				dictAdd(this.characterInfoTexts, CharacterInfo.Defense, this.AddAnimatedText((area, text, color, align) => this.layout.AddText(area, text, color, align),
					new Rect(268, 122, 30, 7), defenseString, TextAlign.Left, () => this.CurrentWindow.Window === Window.Inventory, 100, true));
			} else {
				const defenseString = format(this.DataNameProvider.CharacterInfoDefenseString.replaceAll(' ', defense < 0 ? '-' : '+'), Math.abs(defense));
				dictAdd(this.characterInfoTexts, CharacterInfo.Defense, this.layout.AddText(new Rect(268, 122, 30, 7), defenseString, TextColor.White, TextAlign.Left));
			}
			SetupSecondaryStatTooltip(new Rect(261, 120, 37, 9), SecondaryStat.Defense);
		} else {
			dictAdd(this.characterInfoTexts, CharacterInfo.ConversationPartyMember,
				this.layout.AddText(new Rect(208, 99, 96, 7), this.CurrentPartyMember.Name, TextColor.ActivePartyMember, TextAlign.Center));
			if (this.CurrentPartyMember.Gold > 0) {
				this.ShowTextPanel(CharacterInfo.ConversationGold, this.CurrentPartyMember.Gold > 0,
					`${this.DataNameProvider.GoldName}^${this.CurrentPartyMember.Gold}`, new Rect(209, 107, 43, 15));
			}
			if (this.CurrentPartyMember.Food > 0) {
				this.ShowTextPanel(CharacterInfo.ConversationFood, this.CurrentPartyMember.Food > 0,
					`${this.DataNameProvider.FoodName}^${this.CurrentPartyMember.Food}`, new Rect(257, 107, 43, 15));
			}
		}
	}

	UpdateCharacterInfo(conversationPartner = null) {
		if (this.currentWindow.Window !== Window.Inventory &&
			this.currentWindow.Window !== Window.Stats &&
			this.currentWindow.Window !== Window.Conversation)
			return;

		if (this.currentWindow.Window === Window.Conversation) {
			if (conversationPartner == null || this.CurrentPartyMember == null)
				return;
		} else if (this.CurrentInventory == null) {
			return;
		}

		const SecondaryStat = BuiltinTooltips.SecondaryStat;

		const UpdateText = (characterInfo, text, checkNextCycle = false) => {
			if (this.characterInfoTexts.has(characterInfo))
				this.characterInfoTexts.get(characterInfo).SetText(this.renderView.TextProcessor.CreateText(text()));
			else if (checkNextCycle) {
				// The weight display and maybe others might only be added in next cycle so
				// re-check in two cycles.
				this.ExecuteNextUpdateCycle(() => this.ExecuteNextUpdateCycle(() => UpdateText(characterInfo, text, false)));
			}
		};

		const character = conversationPartner ?? this.CurrentInventory;
		const magicClass = ClassExtensions.IsMagic(character.Class);

		const UpdateSecondaryStatTooltip = secondaryStat => {
			if (this.CoreConfiguration.ShowPlayerStatsTooltips) {
				const [found, toolip] = tryGetValue(this.characterInfoStatTooltips, secondaryStat);
				if (found && toolip != null)
					this.UpdateSecondaryStatTooltip(toolip, secondaryStat, character);
			}
		};

		UpdateText(CharacterInfo.Age, () => format(this.DataNameProvider.CharacterInfoAgeString.replaceAll('000', '0'),
			character.Attributes[Attribute.Age].CurrentValue));
		UpdateSecondaryStatTooltip(SecondaryStat.Age);
		UpdateText(CharacterInfo.Level, () => `${this.DataNameProvider.GetClassName(character.Class)} ${character.Level}`);
		UpdateSecondaryStatTooltip(SecondaryStat.LevelWithAPRIncrease);
		UpdateText(CharacterInfo.EP, () => format(this.DataNameProvider.CharacterInfoExperiencePointsString.replaceAll('0000000000', '0'),
			character.ExperiencePoints));
		UpdateSecondaryStatTooltip(SecondaryStat.EP50);
		UpdateText(CharacterInfo.LP, () => format(this.DataNameProvider.CharacterInfoHitPointsString,
			character.HitPoints.CurrentValue, character.HitPoints.TotalMaxValue));
		UpdateSecondaryStatTooltip(SecondaryStat.LP);
		if (magicClass) {
			UpdateText(CharacterInfo.SP, () => format(this.DataNameProvider.CharacterInfoSpellPointsString,
				character.SpellPoints.CurrentValue, character.SpellPoints.TotalMaxValue));
			UpdateSecondaryStatTooltip(SecondaryStat.SP);
			UpdateSecondaryStatTooltip(SecondaryStat.SLP);
		}
		UpdateText(CharacterInfo.SLPAndTP, () =>
			(magicClass ? format(this.DataNameProvider.CharacterInfoSpellLearningPointsString, character.SpellLearningPoints) : ' '.repeat(7)) + ' ' +
			format(this.DataNameProvider.CharacterInfoTrainingPointsString, character.TrainingPoints));
		UpdateSecondaryStatTooltip(SecondaryStat.TP);
		UpdateText(CharacterInfo.GoldAndFood, () =>
			format(this.DataNameProvider.CharacterInfoGoldAndFoodString, character.Gold, character.Food));
		UpdateSecondaryStatTooltip(SecondaryStat.Gold);
		UpdateSecondaryStatTooltip(SecondaryStat.Food);
		let attackDamage = character.BaseAttackDamage + this.AddAttributeDamageBonus(character, this.AdjustAttackDamageForNotUsedAmmunition(character, character.BonusAttackDamage));
		if (this.CurrentSavegame.IsSpellActive(ActiveSpellType.Attack)) {
			if (attackDamage > 0)
				attackDamage = Math.trunc((attackDamage * (100 + this.CurrentSavegame.GetActiveSpellLevel(ActiveSpellType.Attack))) / 100);
			UpdateText(CharacterInfo.Attack, () =>
				format(this.DataNameProvider.CharacterInfoDamageString.replaceAll(' ', attackDamage < 0 ? '-' : '+'), Math.abs(attackDamage)));
		} else {
			UpdateText(CharacterInfo.Attack, () =>
				format(this.DataNameProvider.CharacterInfoDamageString.replaceAll(' ', attackDamage < 0 ? '-' : '+'), Math.abs(attackDamage)));
		}
		UpdateSecondaryStatTooltip(SecondaryStat.Damage);
		let defense = character.BaseDefense + character.BonusDefense + Math.trunc(character.Attributes[Attribute.Stamina].TotalCurrentValue / 25);
		if (this.CurrentSavegame.IsSpellActive(ActiveSpellType.Protection)) {
			if (defense > 0)
				defense = Math.trunc((defense * (100 + this.CurrentSavegame.GetActiveSpellLevel(ActiveSpellType.Protection))) / 100);
			UpdateText(CharacterInfo.Defense, () =>
				format(this.DataNameProvider.CharacterInfoDamageString.replaceAll(' ', defense < 0 ? '-' : '+'), Math.abs(defense)));
		} else {
			UpdateText(CharacterInfo.Defense, () =>
				format(this.DataNameProvider.CharacterInfoDefenseString.replaceAll(' ', defense < 0 ? '-' : '+'), Math.abs(defense)));
		}
		UpdateSecondaryStatTooltip(SecondaryStat.Defense);
		UpdateText(CharacterInfo.Weight, () => format(this.DataNameProvider.CharacterInfoWeightString,
			Math.trunc(character.TotalWeight / 1000), Math.trunc((character instanceof PartyMember ? character : null).MaxWeight / 1000)), true);
		if (conversationPartner != null) {
			UpdateText(CharacterInfo.ConversationPartyMember, () => this.CurrentPartyMember.Name);
			this.ShowTextPanel(CharacterInfo.ConversationGold, this.CurrentPartyMember.Gold > 0,
				`${this.DataNameProvider.GoldName}^${this.CurrentPartyMember.Gold}`, new Rect(209, 107, 43, 15));
			this.ShowTextPanel(CharacterInfo.ConversationFood, this.CurrentPartyMember.Food > 0,
				`${this.DataNameProvider.FoodName}^${this.CurrentPartyMember.Food}`, new Rect(257, 107, 43, 15));
		}
	}

	HideTextPanel(characterInfo) {
		this.ShowTextPanel(characterInfo, false, null, null);
	}

	ShowTextPanel(characterInfo, show, text, area) {
		if (show) {
			if (area == null)
				return;

			if (!this.characterInfoPanels.has(characterInfo))
				this.characterInfoPanels.set(characterInfo, this.layout.AddPanel(area, 2));
			const [found, value] = tryGetValue(this.characterInfoTexts, characterInfo);
			if (!found) {
				this.characterInfoTexts.set(characterInfo, this.layout.AddText(area.CreateOffset(0, 1),
					text ?? '', TextColor.White, TextAlign.Center, 4));
			} else
				value.SetText(this.renderView.TextProcessor.CreateText(text));
		} else {
			const [foundPanel, value] = tryGetValue(this.characterInfoPanels, characterInfo);
			if (foundPanel) {
				value.Destroy();
				this.characterInfoPanels.delete(characterInfo);
			}
			const [foundText, value1] = tryGetValue(this.characterInfoTexts, characterInfo);
			if (foundText) {
				value1.Destroy();
				this.characterInfoTexts.delete(characterInfo);
			}
		}
	}

	SetWindow(window, ...parameters) {
		this.showMobileTouchPadHandler?.(window === Window.MapView);

		this.CurrentMobileAction = MobileAction.None;

		if ((window !== Window.Inventory && window !== Window.Stats) ||
			(this.currentWindow.Window !== Window.Inventory && this.currentWindow.Window !== Window.Stats))
			this.LastWindow = this.currentWindow.clone();
		if (this.currentWindow.Window === window)
			this.currentWindow.WindowParameters = parameters;
		else {
			this.currentWindow = new WindowInfo();
			this.currentWindow.Window = window;
			this.currentWindow.WindowParameters = parameters;
		}
	}

	ClosePopup(raiseEvent = true, force = false) { return this.layout?.ClosePopup(raiseEvent, force); }

	/**
	 * Overloads: CloseWindow() and CloseWindow(Action finishAction)
	 */
	CloseWindow(finishAction = null) {
		this.layout.HideTooltip();

		if (!this.WindowActive) {
			finishAction?.();
			return;
		}

		this.ResetMapCharacterInteraction(this.Map);
		this.layout.SetCharacterHealSymbol(null);

		this.closeWindowHandler?.(true);
		this.closeWindowHandler = null;

		this.characterInfoTexts.clear();
		this.characterInfoPanels.clear();
		this.characterInfoStatTooltips.clear();
		this.CurrentInventoryIndex = null;
		this.HideWindowTitle();
		this.weightDisplayBlinking = false;
		this.layout.ButtonsDisabled = false;

		if (this.currentWindow.Window === Window.Event || this.currentWindow.Window === Window.Riddlemouth) {
			this.InputEnable = true;
			this.ResetCursor();
		}

		const closedWindow = this.currentWindow.clone();

		if (this.currentWindow.Window === this.LastWindow.Window)
			this.currentWindow = DefaultWindow.clone();
		else
			this.currentWindow = this.LastWindow.clone();

		// GameCore.FadeTime (const in Rendering.cs), accessed via the class to avoid importing GameCore
		const fadeTime = this.constructor.FadeTime;

		switch (this.currentWindow.Window) {
			case Window.MapView: {
				this.currentPlace = null;

				this.Fade(() => {
					if (this.CurrentMapCharacter != null &&
						(closedWindow.Window === Window.Battle ||
						closedWindow.Window === Window.BattleLoot ||
						closedWindow.Window === Window.Chest ||
						closedWindow.Window === Window.Event))
						this.CurrentMapCharacter = null;

					const wasGameOver = closedWindow.Window === Window.Event && closedWindow.WindowParameters[0] === true;

					this.ShowMap(true, !wasGameOver); // avoid playing music after gameover as Start() will start the music as well afterwards
					finishAction?.();

					if (closedWindow.Window === Window.BattleLoot) {
						const action = closedWindow.WindowParameters[1];
						if (typeof action === 'function')
							action();
					}
				});
				break;
			}
			case Window.Inventory: {
				const partyMemberIndex = this.currentWindow.WindowParameters[0];
				this.currentWindow = DefaultWindow.clone();
				this.OpenPartyMember(partyMemberIndex, true);
				if (finishAction != null)
					this.AddTimedEvent(fadeTime, finishAction);
				break;
			}
			case Window.Stats: {
				const partyMemberIndex = this.currentWindow.WindowParameters[0];
				this.currentWindow = DefaultWindow.clone();
				this.OpenPartyMember(partyMemberIndex, false);
				if (finishAction != null)
					this.AddTimedEvent(fadeTime, finishAction);
				break;
			}
			case Window.Chest: {
				const chestEvent = this.currentWindow.WindowParameters[0];
				const trapFound = this.currentWindow.WindowParameters[1];
				const trapDisarmed = this.currentWindow.WindowParameters[2];
				const map = this.currentWindow.WindowParameters[3];
				const position = this.currentWindow.WindowParameters[4];
				const triggerFollowEvents = this.currentWindow.WindowParameters[5];
				this.currentWindow = DefaultWindow.clone();
				this.ShowChest(chestEvent, trapFound, trapDisarmed, map, position, false, triggerFollowEvents);
				if (finishAction != null)
					this.AddTimedEvent(fadeTime, finishAction);
				break;
			}
			case Window.Door: {
				const doorEvent = this.currentWindow.WindowParameters[0];
				const trapFound = this.currentWindow.WindowParameters[1];
				const trapDisarmed = this.currentWindow.WindowParameters[2];
				const map = this.currentWindow.WindowParameters[3];
				const x = this.currentWindow.WindowParameters[4];
				const y = this.currentWindow.WindowParameters[5];
				const moved = this.currentWindow.WindowParameters[6];
				this.currentWindow = DefaultWindow.clone();
				this.ShowDoor(doorEvent, trapFound, trapDisarmed, map, x, y, false, moved);
				if (finishAction != null)
					this.AddTimedEvent(fadeTime, finishAction);
				break;
			}
			case Window.Merchant: {
				const merchantIndex = this.currentWindow.WindowParameters[0];
				const placeName = this.currentWindow.WindowParameters[1];
				const buyText = this.currentWindow.WindowParameters[2];
				const isLibrary = this.currentWindow.WindowParameters[3];
				const boughtItems = this.currentWindow.WindowParameters[4];
				this.OpenMerchant(merchantIndex, placeName, buyText, isLibrary, false, boughtItems);
				if (finishAction != null)
					this.AddTimedEvent(fadeTime, finishAction);
				break;
			}
			case Window.Riddlemouth: {
				const riddlemouthEvent = this.currentWindow.WindowParameters[0];
				const solvedEvent = this.currentWindow.WindowParameters[1];
				this.currentWindow = DefaultWindow.clone();
				this.ShowRiddlemouth(this.Map, riddlemouthEvent, solvedEvent, false);
				if (finishAction != null)
					this.AddTimedEvent(fadeTime, finishAction);
				break;
			}
			case Window.Conversation: {
				const conversationPartner = this.currentWindow.WindowParameters[0];
				const characterIndexParameter = this.currentWindow.WindowParameters[1];
				const characterIndex = typeof characterIndexParameter === 'number' ? characterIndexParameter : null;
				const conversationEvent = this.currentWindow.WindowParameters[2] ?? null; // as Event
				const conversationItemsParameter = this.currentWindow.WindowParameters[3];
				const conversationItems = conversationItemsParameter instanceof ConversationItems ? conversationItemsParameter : null;
				this.currentWindow = DefaultWindow.clone();
				this.ShowConversation(conversationPartner, characterIndex, conversationEvent, conversationItems, false);
				if (finishAction != null)
					this.AddTimedEvent(fadeTime, finishAction);
				break;
			}
			case Window.Battle: {
				const nextEvent = this.currentWindow.WindowParameters[0];
				const x = this.currentWindow.WindowParameters[1];
				const y = this.currentWindow.WindowParameters[2];
				const combatBackgroundIndex = this.currentWindow.WindowParameters[3] ?? null;
				this.currentWindow = DefaultWindow.clone();
				// ShowBattleWindow(nextEvent, out _, x, y, combatBackgroundIndex): out param omitted, returns [paletteIndex]
				this.Fade(() => { this.ShowBattleWindow(nextEvent, x, y, combatBackgroundIndex); finishAction?.(); });
				break;
			}
			case Window.BattleLoot: {
				const storage = this.currentWindow.WindowParameters[0];
				this.LastWindow = DefaultWindow.clone();
				this.ShowBattleLoot(storage, null, 0);
				if (finishAction != null)
					this.AddTimedEvent(fadeTime, finishAction);
				break;
			}
			case Window.BattlePositions: {
				this.ShowBattlePositionWindow();
				if (finishAction != null)
					this.AddTimedEvent(fadeTime, finishAction);
				break;
			}
			case Window.Trainer: {
				const trainer = this.currentWindow.WindowParameters[0];
				this.OpenTrainer(trainer, false);
				if (finishAction != null)
					this.AddTimedEvent(fadeTime, finishAction);
				break;
			}
			case Window.FoodDealer: {
				const foodDealer = this.currentWindow.WindowParameters[0];
				this.OpenFoodDealer(foodDealer, false);
				if (finishAction != null)
					this.AddTimedEvent(fadeTime, finishAction);
				break;
			}
			case Window.Healer: {
				const healer = this.currentWindow.WindowParameters[0];
				this.OpenHealer(healer, false);
				if (finishAction != null)
					this.AddTimedEvent(fadeTime, finishAction);
				break;
			}
			case Window.Camp: {
				const inn = this.currentWindow.WindowParameters[0];
				const healing = this.currentWindow.WindowParameters[1];
				this.OpenCamp(inn, healing);
				if (finishAction != null)
					this.AddTimedEvent(fadeTime, finishAction);
				break;
			}
			case Window.Inn: {
				const inn = this.currentWindow.WindowParameters[0];
				const useText = this.currentWindow.WindowParameters[1];
				this.OpenInn(inn, useText, false);
				if (finishAction != null)
					this.AddTimedEvent(fadeTime, finishAction);
				break;
			}
			case Window.HorseSalesman: {
				const salesman = this.currentWindow.WindowParameters[0];
				const buyText = this.currentWindow.WindowParameters[1];
				this.OpenHorseSalesman(salesman, buyText, false);
				if (finishAction != null)
					this.AddTimedEvent(fadeTime, finishAction);
				break;
			}
			case Window.RaftSalesman: {
				const salesman = this.currentWindow.WindowParameters[0];
				const buyText = this.currentWindow.WindowParameters[1];
				this.OpenRaftSalesman(salesman, buyText, false);
				if (finishAction != null)
					this.AddTimedEvent(fadeTime, finishAction);
				break;
			}
			case Window.ShipSalesman: {
				const salesman = this.currentWindow.WindowParameters[0];
				const buyText = this.currentWindow.WindowParameters[1];
				this.OpenShipSalesman(salesman, buyText, false);
				if (finishAction != null)
					this.AddTimedEvent(fadeTime, finishAction);
				break;
			}
			case Window.Sage: {
				const sage = this.currentWindow.WindowParameters[0];
				this.OpenSage(sage, false);
				if (finishAction != null)
					this.AddTimedEvent(fadeTime, finishAction);
				break;
			}
			case Window.Blacksmith: {
				const blacksmith = this.currentWindow.WindowParameters[0];
				this.OpenBlacksmith(blacksmith, false);
				if (finishAction != null)
					this.AddTimedEvent(fadeTime, finishAction);
				break;
			}
			case Window.Enchanter: {
				const enchanter = this.currentWindow.WindowParameters[0];
				this.OpenEnchanter(enchanter, false);
				if (finishAction != null)
					this.AddTimedEvent(fadeTime, finishAction);
				break;
			}
			case Window.Automap: {
				this.ShowAutomap(this.currentWindow.WindowParameters[0]);
				if (finishAction != null)
					this.AddTimedEvent(fadeTime, finishAction);
				break;
			}
			default:
				break;
		}
	}

	ToggleButtonGridPage() { return this.layout.ToggleButtonGridPage(); }

	ShowWindowTitle(show = true) {
		if (this.windowTitle != null)
			this.windowTitle.Visible = show;
	}

	HideWindowTitle() { return this.ShowWindowTitle(false); }

	ShowTutorial() {
		new Tutorial(this, this.drawTouchFingerRequest).Run(this.renderView);
	}
}
