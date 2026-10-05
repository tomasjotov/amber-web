// Port of Ambermoon.Core/UI/ItemGrid.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// Grid of item slots (inventory, equipment, chests, merchants, ...)

import { Event, hasFlag, newArray, toByte } from '../../../runtime.js';
import { Position } from '../../Ambermoon.Common/Position.js';
import { Rect } from '../../Ambermoon.Common/Rect.js';
import { Size } from '../../Ambermoon.Common/Size.js';
import { Util } from '../../Ambermoon.Common/Util.js';
import { CursorType } from '../../Ambermoon.Data.Common/CursorType.js';
import { ItemSlot } from '../../Ambermoon.Data.Common/ItemSlot.js';
import { ItemSlotFlags } from '../../Ambermoon.Data.Common/Enumerations/ItemSlotFlags.js';
import { ItemFlags } from '../../Ambermoon.Data.Common/Enumerations/ItemFlags.js';
import { EquipmentSlot } from '../../Ambermoon.Data.Common/Enumerations/EquipmentSlot.js';
import { UICustomGraphic } from '../../Ambermoon.Data.Common/Enumerations/UICustomGraphic.js';
import { Color as TextColor } from '../../Ambermoon.Data.Common/Enumerations/Color.js';
import { ClassExtensions } from '../../Ambermoon.Data.Common/Enumerations/Class.js';
import { GenderExtensions } from '../../Ambermoon.Data.Common/Enumerations/Gender.js';
import { Layer } from '../Render/Layer.js';
import { Graphics } from '../Render/Graphics.js';
import { TextureAtlasManager } from '../Render/TextureAtlasManager.js';
import { ItemAnimation } from '../Render/ItemAnimation.js';
import { KeyModifiers } from '../KeyModifiers.js';
import { MouseButtons } from '../MouseButtons.js';
import { Global } from './Global.js';
import { Layout } from './Layout.js';
import { Scrollbar } from './Scrollbar.js';
import { ScrollbarType } from './ScrollbarType.js';
import { UIItem } from './UIItem.js';
import { Window } from './Window.js';

const SlotWidth = 16;
const SlotHeight = 24;
let slotSize = null;

const ItemAction = Object.freeze({
	None: 0,
	Drag: 1,
	Drop: 2,
	Exchange: 3
});

/** new ItemSlot { Amount = 1 } */
function createItemSlotWithAmount(amount) {
	const itemSlot = new ItemSlot();
	itemSlot.Amount = amount;
	return itemSlot;
}

// TODO: memorize scrollbar positions for inventories
// Note: The items are automatically updated in inventories,
// chests, etc as the UIItems use the same ItemSlot instances
// and modify them directly.
export class ItemGrid {
	static ItemAction = ItemAction;

	static get SlotSize() {
		return slotSize ??= new Size(SlotWidth, SlotHeight);
	}

	// Note: Private constructor in C#. Use the static Create* methods.
	// pickupAction: (itemGrid, slot, uiItem, dragAction: (draggedItem, amount) => void, takeAll) => void
	constructor(game, layout, renderView, itemManager, slotPositions,
		slots, allowExternalDrop, pickupAction,
		slotsPerPage, slotsPerScroll, numTotalSlots, scrollbarArea = null, scrollbarSize = null,
		scrollbarType = null, showPrice = false, availableGoldProvider = null) {
		this.hoveredItemName = null;
		this.hoveredItemPrice = null;
		this.scrollbar = null;
		this.dragScrollItem = null; // set when scrolling while dragging an item
		this.disabled = false;
		this.dropSlotProvider = null;
		this.dropLimiter = null;
		this.showPrice = false;
		this.availableGoldProvider = null;
		this.itemControlClickHandler = null;
		this.itemShiftClickHandler = null;
		this.ItemDragged = new Event();
		this.ItemDropped = new Event();
		this.ItemExchanged = new Event();
		this.ItemClicked = new Event();
		this.RightClicked = new Event();
		this.ScrollOffset = 0;
		this.DisableDrag = false;

		this.game = game;
		this.layout = layout;
		this.renderView = renderView;
		this.itemManager = itemManager;
		this.slotPositions = slotPositions;
		this.slots = slots;
		this.allowExternalDrop = allowExternalDrop;
		this.pickupAction = pickupAction;
		this.slotsPerPage = slotsPerPage;
		this.slotsPerScroll = slotsPerScroll;
		this.slotBackgrounds = newArray(slotPositions.length);
		this.CreateSlotBackgrounds();
		this.items = newArray(numTotalSlots);
		this.scrollbar = slotsPerScroll === 0 ? null :
			new Scrollbar(game, layout, scrollbarType ?? ScrollbarType.SmallVertical, scrollbarArea ?? new Rect(),
				scrollbarSize?.Width ?? 0, scrollbarSize?.Height ?? 0, Math.trunc((numTotalSlots - slotsPerPage) / slotsPerScroll));
		if (this.scrollbar != null) {
			if (this.items.length <= slotsPerPage)
				this.scrollbar.Disabled = true;
			else
				this.scrollbar.Scrolled.add(newPosition => this.Scrollbar_Scrolled(newPosition));
		}
		this.showPrice = showPrice;
		this.availableGoldProvider = availableGoldProvider;
	}

	get SlotCount() {
		return this.items.length;
	}

	get Disabled() {
		return this.disabled;
	}

	set Disabled(value) {
		if (this.disabled === value)
			return;

		this.disabled = value;

		if (this.scrollbar != null)
			this.scrollbar.Disabled = this.disabled || this.items.length <= this.slotsPerPage;

		if (this.disabled) {
			for (const item of this.items)
				item?.Destroy();
		}

		const slotTexCoords = TextureAtlasManager.Instance.GetOrCreate(Layer.UI).GetOffset(
			Graphics.GetCustomUIGraphicIndex(this.disabled ? UICustomGraphic.ItemSlotDisabled : UICustomGraphic.ItemSlotBackground));
		for (const background of this.slotBackgrounds)
			background.TextureAtlasOffset = slotTexCoords;
	}

	get ShowPrice() {
		return this.showPrice;
	}

	set ShowPrice(value) {
		if (this.showPrice === value)
			return;

		this.showPrice = value;

		if (!this.showPrice && this.hoveredItemPrice != null) {
			this.hoveredItemPrice?.Delete();
			this.hoveredItemPrice = null;
		}
	}

	CreateSlotBackgrounds() {
		const renderView = this.renderView;
		const layer = renderView.GetLayer(Layer.UI);
		const texCoords = TextureAtlasManager.Instance.GetOrCreate(Layer.UI).GetOffset(Graphics.GetCustomUIGraphicIndex(UICustomGraphic.ItemSlotBackground));
		const paletteIndex = this.game.UIPaletteIndex;

		for (let i = 0; i < this.slotBackgrounds.length; ++i) {
			const background = this.slotBackgrounds[i] = renderView.SpriteFactory.Create(16, 24, true);
			background.Layer = layer;
			background.PaletteIndex = paletteIndex;
			background.TextureAtlasOffset = texCoords;
			background.X = this.slotPositions[i].X;
			background.Y = this.slotPositions[i].Y;
			background.Visible = true;
		}
	}

	ClearItemClickEventHandlers() {
		this.ItemClicked.clear();
	}

	static CreateInventory(game, layout, partyMemberIndex, renderView,
		itemManager, slotPositions, slots,
		equipHandler, useHandler) {
		const grid = new ItemGrid(game, layout, renderView, itemManager, slotPositions, slots, true,
			(itemGrid, slot, item, dragAction, takeAll) =>
				layout.DragItems(item, takeAll, dragAction,
					() => Layout.DraggedItem.FromInventory(itemGrid, partyMemberIndex, slot, item, false)),
			12, 3, 24, new Rect(109 + 3 * 22, 76, 6, 112), new Size(6, 56), ScrollbarType.LargeVertical);
		grid.dropSlotProvider = (position, broken, _) => {
			let slot = grid.SlotFromPosition(position);

			if (slot != null) {
				const itemSlot = grid.GetItemSlot(slot);

				if ((itemSlot != null ? hasFlag(itemSlot.Flags, ItemSlotFlags.Locked) : null) ?? false) {
					layout.SetInventoryMessage(game.DataNameProvider.ThisCantBeMoved, true);
					slot = null;
				}
			}

			return slot;
		};
		grid.itemControlClickHandler = useHandler;
		grid.itemShiftClickHandler = equipHandler;
		return grid;
	}

	static CreateEquipment(game, layout, partyMemberIndex, renderView,
		itemManager, slotPositions, slots, equipChecker,
		unequipHandler, useHandler) {
		const grid = new ItemGrid(game, layout, renderView, itemManager, slotPositions, slots, true,
			(itemGrid, slot, item, dragAction, takeAll) => {
				if (equipChecker(item.Item)) {
					layout.DragItems(item, takeAll, dragAction,
						() => Layout.DraggedItem.FromInventory(itemGrid, partyMemberIndex, slot, item, true));
				}
			}, 9, 0, 9);
		grid.dropLimiter = (slot, amount) => 1;
		grid.dropSlotProvider = (position, broken, item) => {
			if (!new Rect(19, 71, 82, 122).Contains(position))
				return null;

			if (broken) {
				layout.SetInventoryMessage(game.DataNameProvider.ItemIsBroken, true);
				return null;
			}
			if (!ClassExtensions.Contains(item.Classes, game.CurrentInventory.Class)) {
				layout.SetInventoryMessage(game.DataNameProvider.WrongClassToEquipItem, true);
				return null;
			}
			if (!GenderExtensions.Contains(item.Genders, game.CurrentInventory.Gender)) {
				layout.SetInventoryMessage(game.DataNameProvider.WrongSexToEquipItem, true);
				return null;
			}
			if (game.BattleActive && !hasFlag(item.Flags, ItemFlags.RemovableDuringFight)) {
				layout.SetInventoryMessage(game.DataNameProvider.CannotEquipInFight, true);
				return null;
			}

			const equipmentSlot = item.EquipmentSlot;

			if (equipmentSlot === EquipmentSlot.None) {
				layout.SetInventoryMessage(game.DataNameProvider.CannotEquip, true);
				return null;
			}

			if (equipmentSlot === EquipmentSlot.RightFinger ||
				equipmentSlot === EquipmentSlot.LeftFinger) {
				const rightFingerSlot = EquipmentSlot.RightFinger - 1;

				if (item.NumberOfFingers === 2) {
					if (grid.GetItemSlot(rightFingerSlot)?.Empty === false &&
						grid.GetItemSlot(rightFingerSlot + 2)?.Empty === false) {
						layout.SetInventoryMessage(game.DataNameProvider.NotEnoughFreeFingers, true);
						return null;
					}
				}

				const clickedSlot = grid.SlotFromPosition(position);

				// If explicitly clicked on a slot, drop the item there!
				if (clickedSlot === rightFingerSlot || clickedSlot === rightFingerSlot + 2) {
					const dropSlot = grid.GetItemSlot(clickedSlot);

					if (dropSlot != null && hasFlag(dropSlot.Flags, ItemSlotFlags.Cursed)) {
						layout.SetInventoryMessage(game.DataNameProvider.ItemIsCursed, true);
						return null;
					}

					return clickedSlot;
				}

				const rightFingerItemSlot = grid.GetItemSlot(rightFingerSlot);
				const leftFingerItemSlot = grid.GetItemSlot(rightFingerSlot + 2);

				// place on first free finger starting at right one
				// Note: C# precedence: a?.Empty ?? (true && (a?.Flags.HasFlag(Cursed) != true))
				if (rightFingerItemSlot?.Empty ?? (true && (rightFingerItemSlot != null ? hasFlag(rightFingerItemSlot.Flags, ItemSlotFlags.Cursed) : null) !== true))
					return rightFingerSlot;
				else if ((leftFingerItemSlot != null ? hasFlag(leftFingerItemSlot.Flags, ItemSlotFlags.Cursed) : null) !== true)
					return rightFingerSlot + 2; // left finger
				else {
					layout.SetInventoryMessage(game.DataNameProvider.ItemIsCursed, true);
					return null;
				}
			}

			if (equipmentSlot === EquipmentSlot.RightHand ||
				equipmentSlot === EquipmentSlot.LeftHand) {
				if (item.NumberOfHands === 2) {
					const leftHandSlot = grid.GetItemSlot(EquipmentSlot.LeftHand - 1);

					if (grid.GetItemSlot(EquipmentSlot.RightHand - 1)?.Empty === false &&
						leftHandSlot?.Empty === false && (leftHandSlot?.ItemIndex ?? 0) !== 0) {
						layout.SetInventoryMessage(game.DataNameProvider.NotEnoughFreeHands, true);
						return null;
					}

					const rightHandItemSlot = grid.GetItemSlot(EquipmentSlot.RightHand - 1);
					const leftHandItemSlot = grid.GetItemSlot(EquipmentSlot.LeftHand - 1);

					if ((rightHandItemSlot != null && hasFlag(rightHandItemSlot.Flags, ItemSlotFlags.Cursed)) ||
						(leftHandItemSlot != null && hasFlag(leftHandItemSlot.Flags, ItemSlotFlags.Cursed))) {
						layout.SetInventoryMessage(game.DataNameProvider.ItemIsCursed, true);
						return null;
					}
				}
			}

			const targetSlot = grid.GetItemSlot(item.EquipmentSlot - 1);

			if (targetSlot != null && hasFlag(targetSlot.Flags, ItemSlotFlags.Cursed)) {
				layout.SetInventoryMessage(game.DataNameProvider.ItemIsCursed, true);
				return null;
			}

			if (game.BattleActive) {
				const itemIndexAtDestinationSlot = grid.GetItemSlot(equipmentSlot - 1)?.ItemIndex ?? null;
				const itemAtDestinationSlot = (itemIndexAtDestinationSlot ?? 0) === 0 ? null : itemManager.GetItem(itemIndexAtDestinationSlot);

				if (itemAtDestinationSlot != null && !hasFlag(itemAtDestinationSlot.Flags, ItemFlags.RemovableDuringFight)) {
					layout.SetInventoryMessage(game.DataNameProvider.CannotUnequipInFight, true);
					return null;
				}
			}

			return equipmentSlot - 1;
		};
		grid.itemControlClickHandler = useHandler;
		grid.itemShiftClickHandler = unequipHandler;
		return grid;
	}

	static Create(game, layout, renderView, itemManager,
		slotPositions, slots, allowExternalDrop, slotsPerPage,
		slotsPerScroll, numTotalSlots, scrollbarArea, scrollbarSize, scrollbarType,
		showPrice = false, availableGoldProvider = null) {
		const grid = new ItemGrid(game, layout, renderView, itemManager, slotPositions, slots, allowExternalDrop,
			(itemGrid, slot, item, dragAction, takeAll) =>
				layout.DragItems(item, takeAll, dragAction, () => Layout.DraggedItem.FromExternal(itemGrid, slot, item)),
			slotsPerPage, slotsPerScroll, numTotalSlots, scrollbarArea, scrollbarSize, scrollbarType, showPrice, availableGoldProvider);
		grid.dropSlotProvider = (position, broken, _) => grid.SlotFromPosition(position);
		return grid;
	}

	Destroy() {
		for (let i = 0; i < this.items.length; ++i)
			this.SetItem(i, null);

		for (const background of this.slotBackgrounds)
			background?.Delete();

		this.hoveredItemName?.Delete();
		this.hoveredItemName = null;
		this.hoveredItemPrice?.Delete();
		this.hoveredItemPrice = null;

		this.scrollbar?.Destroy();
		this.scrollbar = null;

		this.dragScrollItem = null;
	}

	Initialize(newSlots, merchantItems) {
		this.ScrollToBegin();

		for (let i = 0; i < this.slots.length; ++i) {
			this.slots[i] = i < newSlots.length ? newSlots[i] : null;
			this.items[i]?.Destroy();
			this.items[i] = null;
			if (this.slots[i] != null && !this.slots[i].Empty)
				this.SetItem(i, this.slots[i], merchantItems);
		}
	}

	UpdateItem(slot) {
		this.items[slot]?.Update(false);
	}

	Refresh(merchantItem = false) {
		for (let i = 0; i < this.items.length; ++i) {
			if (this.items[i] == null) {
				if (this.slots[i]?.Empty === false)
					this.SetItem(i, this.slots[i], merchantItem);
			} else if (this.SlotVisible(i)) {
				this.items[i].Update(true);
			}
		}
	}

	SetItem(slot, item, merchantItem = false) {
		this.items[slot]?.Destroy();

		if (item == null || item.Empty) {
			this.items[slot] = null;
		} else {
			this.slots[slot].Replace(item);
			const newItem = this.items[slot] = new UIItem(this.renderView, this.itemManager, this.slots[slot], merchantItem);
			const visible = this.SlotVisible(slot);
			newItem.Visible = visible;
			if (visible)
				newItem.Position = this.slotPositions[slot - this.ScrollOffset];
		}
	}

	SlotVisible(slot) {
		return slot >= this.ScrollOffset && slot < this.ScrollOffset + this.slotsPerPage;
	}

	GetItem(slot) {
		return this.items[slot];
	}

	GetItemSlot(slot) {
		return this.slots[slot];
	}

	GetSlotPosition(slot) {
		return this.slotPositions[slot - this.ScrollOffset];
	}

	SlotFromPosition(position) {
		let slot = 0;

		for (const slotPosition of this.slotPositions) {
			if (new Rect(slotPosition, ItemGrid.SlotSize).Contains(position))
				return this.ScrollOffset + slot;

			++slot;
		}

		return null;
	}

	SlotFromItemSlot(itemSlot) {
		return this.slots.indexOf(itemSlot);
	}

	DropItem(slot, item) {
		const items = this.items;
		const slots = this.slots;
		const itemManager = this.itemManager;

		if (this.DisableDrag)
			return item.Item.Item.Amount;

		if (slot === -1)
			return item.Item.Item.Amount;

		let itemSlot = items[slot];
		let shieldEquippedToTwoHanded = false;

		if (itemSlot != null && itemSlot.Item.ItemIndex === 0 && this.SlotCount === 9 && slot === 5 && // Left hand equipment slot
			(items[3]?.Item?.ItemIndex ?? 0) !== 0) {
			itemSlot.Item.Clear();
			itemSlot = items[3];
			shieldEquippedToTwoHanded = true;
		}

		let itemInfo = itemSlot == null ? null : itemManager.GetItem(itemSlot.Item.ItemIndex);
		let secondHandSlot = false;

		if (!shieldEquippedToTwoHanded && itemSlot == null && this.SlotCount === 9 && slot === 3) { // Right hand equipment slot -> weapon
			const droppedItemInfo = itemManager.GetItem(item.Item.Item.ItemIndex);

			if (droppedItemInfo.NumberOfHands === 2) {
				itemSlot = items[5];
				itemInfo = itemSlot == null ? null : itemManager.GetItem(itemSlot.Item.ItemIndex);
				secondHandSlot = true;
			}
		}

		if (itemSlot == null) {
			const dropAmount = this.dropLimiter?.(slot, item.Item.Item.Amount) ?? item.Item.Item.Amount;
			const remainingAmount = item.Item.Item.Amount - dropAmount;
			if (remainingAmount === 0) {
				item.Item.Dragged = false;
				slots[slot].Replace(item.Item.Item);
				item.Item.SetItem(slots[slot]);
				if (this.SlotVisible(slot))
					item.Item.Position = this.slotPositions[slot - this.ScrollOffset];
				items[slot] = item.Item;
				this.ItemDropped.invoke(slot, item.Item.Item, item.Item.Item.Amount);
			} else {
				slots[slot] ??= new ItemSlot();
				slots[slot].Add(item.Item.Item, 1);
				this.SetItem(slot, slots[slot]);
				item.Item.Update(false);
				this.ItemDropped.invoke(slot, slots[slot], dropAmount);
			}
			return remainingAmount;
		} else if (itemSlot.Item.Empty || (itemSlot.Item.ItemIndex === item.Item.Item.ItemIndex &&
			hasFlag(itemInfo.Flags, ItemFlags.Stackable))) {
			const amountToDrop = item.Item.Item.Amount;
			let newAmount = itemSlot.Item.Amount + amountToDrop;

			if (this.dropLimiter != null)
				newAmount = this.dropLimiter(slot, newAmount);

			const remaining = itemSlot.Item.Add(item.Item.Item, newAmount - itemSlot.Item.Amount);

			if (remaining < amountToDrop) {
				itemSlot.Update(false);
				itemSlot.Visible = this.SlotVisible(slot);

				if (remaining === 0)
					item.Item.Destroy();
				else
					item.Item.Update(false);

				this.ItemDropped.invoke(slot, itemSlot.Item, amountToDrop - remaining);
			}

			return remaining;
		} else {
			if (!itemSlot.Item.Draggable)
				return item.Item.Item.Amount;

			if (item.Item.Item.Amount > 1 && this.dropLimiter != null && this.dropLimiter(slot, 2) === 1)
				return item.Item.Item.Amount; // Try to exchange an item stack on an equip slot

			itemSlot.Item.Exchange(item.Item.Item);

			if (shieldEquippedToTwoHanded) {
				items[3].Item.Exchange(items[5].Item);
				items[3].Destroy();
				items[3] = null;
				itemSlot = items[5];
				itemSlot.Position = itemSlot.Position; // Important to re-position amount display if added
				itemSlot.Update(true);
				item.Item.Update(true);
				if (items[3] != null) {
					slots[3].Replace(items[3].Item);
					items[3].SetItem(slots[3]);
				}
				if (items[5] != null) {
					slots[5].Replace(items[5].Item);
					items[5].SetItem(slots[5]);
				}
				this.ItemDragged.invoke(3, item.Item.Item, item.Item.Item.Amount, false);
				this.ItemDropped.invoke(5, itemSlot.Item, itemSlot.Item.Amount);
			} else if (secondHandSlot) {
				if (items[3] == null)
					items[3] = new UIItem(this.renderView, itemManager, createItemSlotWithAmount(1), false);
				else
					items[3].SetItem(createItemSlotWithAmount(1));
				items[3].Item.Exchange(itemSlot.Item);
				itemSlot.Update(true);
				itemSlot = items[3];
				itemSlot.Position = this.slotPositions[slot];
				itemSlot.Visible = true;
				itemSlot.Update(true);
				item.Item.Update(true);
				if (items[3] != null) {
					slots[3].Replace(items[3].Item);
					items[3].SetItem(slots[3]);
				}
				if (items[5] != null) {
					slots[5].Replace(items[5].Item);
					items[5].SetItem(slots[5]);
				}
				this.ItemDragged.invoke(5, item.Item.Item, item.Item.Item.Amount, false);
				this.ItemDropped.invoke(3, itemSlot.Item, itemSlot.Item.Amount);
			} else {
				itemSlot.Update(true);
				itemSlot.Position = itemSlot.Position; // Important to re-position amount display if added
				item.Item.Update(true);
				this.ItemExchanged.invoke(slot, item.Item.Item, item.Item.Item.Amount, itemSlot.Item);
			}
			if (this.game.CurrentWindow.Window === Window.Inventory)
				item.SourcePlayer = this.game.CurrentInventoryIndex;
			item.SourceGrid = this;
			item.SourceSlot = slot;
			item.Equipped = this.game.CurrentWindow.Window === Window.Inventory && this.SlotCount === 9;
			return itemSlot.Item.Amount;
		}
	}

	Scroll(down) {
		if (this.scrollbar != null && !this.scrollbar.Disabled) {
			if (down) {
				this.ScrollDown();
			} else { // up
				this.ScrollUp();
			}

			return true;
		}

		return false;
	}

	ScrollUp() {
		if (this.ScrollOffset > 0)
			this.ScrollTo(this.ScrollOffset - this.slotsPerScroll);
	}

	ScrollDown() {
		if (this.ScrollOffset < this.items.length - this.slotsPerPage)
			this.ScrollTo(this.ScrollOffset + this.slotsPerScroll);
	}

	ScrollPageUp() {
		if (this.ScrollOffset > 0)
			this.ScrollTo(this.ScrollOffset - this.slotsPerPage);
	}

	ScrollPageDown() {
		if (this.ScrollOffset < this.items.length - this.slotsPerPage)
			this.ScrollTo(this.ScrollOffset + this.slotsPerPage);
	}

	ScrollToBegin() {
		this.ScrollTo(0);
	}

	ScrollToEnd() {
		this.ScrollTo(this.items.length - this.slotsPerPage);
	}

	ScrollTo(offset) {
		if (this.slotsPerScroll === 0) // not scrollable
			return;

		offset = Math.max(0, Math.min(offset, this.SlotCount - this.slotsPerPage));

		if (this.ScrollOffset === offset) // already there
			return;

		while (offset % this.slotsPerScroll !== 0)
			--offset;

		this.ScrollOffset = offset;
		this.PostScrollUpdate();

		this.scrollbar?.SetScrollPosition(Math.trunc(this.ScrollOffset / this.slotsPerScroll));
	}

	PostScrollUpdate() {
		for (let i = 0; i < this.items.length; ++i) {
			if (this.items[i] == null)
				continue;

			if (this.SlotVisible(i)) {
				this.items[i].Position = this.slotPositions[i - this.ScrollOffset];
				this.items[i].Visible = true;
			} else {
				this.items[i].Visible = false;
			}
		}
	}

	Scrollbar_Scrolled(newPosition) {
		if (this.disabled)
			return;

		this.ScrollOffset = newPosition * this.slotsPerScroll;
		this.PostScrollUpdate();
	}

	Drag(position) {
		if (this.disabled)
			return false;

		if (this.scrollbar?.Drag(position) === true)
			return true;

		return false;
	}

	LeftMouseUp(position) {
		if (this.disabled)
			return;

		if (this.dragScrollItem?.Item != null) {
			this.dragScrollItem.Item.Position = position;
			this.dragScrollItem.Item.Visible = true;
			this.dragScrollItem = null;
		}

		this.scrollbar?.LeftMouseUp();
	}

	/**
	 * C#: Click(position, draggedItem, out itemAction, mouseButtons, ref cursorType, dragHandler, keyModifiers = None)
	 * JS: Click(position, draggedItem, mouseButtons, cursorType, dragHandler, keyModifiers = None)
	 *     -> returns [bool, itemAction, cursorType]
	 */
	Click(position, draggedItem, mouseButtons, cursorType,
		dragHandler, keyModifiers = KeyModifiers.None) {
		let itemAction = ItemAction.None;

		if (this.disabled)
			return [false, itemAction, cursorType];

		if (mouseButtons === MouseButtons.Left && this.scrollbar != null &&
			!this.scrollbar.Disabled && this.scrollbar.LeftClick(position)) {
			if (draggedItem != null) {
				this.dragScrollItem = draggedItem;
				draggedItem.Item.Visible = false;
			}

			cursorType = CursorType.None;

			return [true, itemAction, cursorType];
		}

		if (mouseButtons === MouseButtons.Right) {
			if (this.RightClicked.invoke() === true)
				return [true, itemAction, cursorType];
		}

		if (draggedItem != null) {
			if (!this.allowExternalDrop && draggedItem.SourceGrid !== this)
				return [false, itemAction, cursorType];

			const slot = this.dropSlotProvider?.(position, hasFlag(draggedItem.Item.Item.Flags, ItemSlotFlags.Broken),
				this.itemManager.GetItem(draggedItem.Item.Item.ItemIndex)) ?? null;

			if (slot == null)
				return [false, itemAction, cursorType];

			if (this.DropItem(slot, draggedItem) === 0) {
				// fully dropped
				itemAction = ItemAction.Drop;
			} else {
				itemAction = ItemAction.Exchange;
				dragHandler?.(draggedItem);
			}

			this.Hover(position); // This updates the tooltip
		} else {
			const slot = this.SlotFromPosition(position);

			if (slot == null)
				return [false, itemAction, cursorType];

			const itemSlot = this.items[slot];

			if (itemSlot != null) {
				if (hasFlag(keyModifiers, KeyModifiers.Control) && this.itemControlClickHandler != null && !this.layout.ButtonsDisabled)
					this.itemControlClickHandler(this, slot, itemSlot.Item);
				else if (hasFlag(keyModifiers, KeyModifiers.Shift) && this.itemShiftClickHandler != null && !this.layout.ButtonsDisabled)
					this.itemShiftClickHandler(this, slot, itemSlot.Item);
				else {
					// Note: ItemClicked handler may re-enable dragging
					//       but we don't want to drag immediately here
					//       so remember drag disable state for this
					//       click execution.
					const dragDisabled = this.DisableDrag;

					if (mouseButtons === MouseButtons.Left)
						this.ItemClicked.invoke(this, slot, itemSlot.Item);

					if (!dragDisabled && itemSlot.Item.Draggable) {
						itemAction = ItemAction.Drag;
						this.Pickup(slot, itemSlot, mouseButtons === MouseButtons.Right, item => {
							this.Hover(position); // This updates the tooltip
							dragHandler?.(item);
						});
					} else if (!dragDisabled && itemSlot.Item != null && hasFlag(itemSlot.Item.Flags, ItemSlotFlags.Locked)) {
						cursorType = CursorType.Click;
						this.layout.SetInventoryMessage(this.game.DataNameProvider.ThisCantBeMoved, true);
						return [true, itemAction, cursorType];
					}
				}
			}
		}

		return [true, itemAction, cursorType];
	}

	TryEquipmentDrop(itemSlot) {
		return this.dropSlotProvider?.(new Position(20, 72), hasFlag(itemSlot.Flags, ItemSlotFlags.Broken),
			this.itemManager.GetItem(itemSlot.ItemIndex)) ?? null;
	}

	/**
	 * Overloads:
	 * - Pickup(itemSlot: ItemSlot, takeAll)
	 * - Pickup(slot: int, itemSlot: UIItem, takeAll, additionalAction)
	 */
	Pickup(...args) {
		if (args[0] instanceof ItemSlot) {
			const [itemSlot, takeAll] = args;
			const slot = this.SlotFromItemSlot(itemSlot);
			this.Pickup(slot, this.items[slot], takeAll, null);
			return;
		}

		const [slot, itemSlot, takeAll, additionalAction] = args;

		this.pickupAction(this, slot, itemSlot, (item, amount) => {
			item.Item.Item.Amount = amount;
			item.Item.Update(false);
			this.ItemDragged.invoke(slot, item.Item.Item, amount, true);
			if (this.items[slot].Item.Empty) {
				this.items[slot].Destroy();
				this.items[slot] = null;
			} else
				this.items[slot].Update(false);
			additionalAction?.(item);
		}, takeAll);
	}

	HideTooltip() {
		this.hoveredItemName?.Delete();
		this.hoveredItemName = null;
		this.hoveredItemPrice?.Delete();
		this.hoveredItemPrice = null;
	}

	Hover(position) {
		const renderView = this.renderView;
		const slot = this.SlotFromPosition(position);

		if (this.disabled || slot == null || this.items[slot]?.Visible !== true ||
			this.items[slot]?.Item?.Empty === true || this.items[slot]?.Item.ItemIndex === 0) {
			this.HideTooltip();
			return slot != null;
		} else {
			const item = this.itemManager.GetItem(this.items[slot].Item.ItemIndex);
			const itemNameText = renderView.TextProcessor.CreateText(item.Name);
			let textWidth = itemNameText.MaxLineSize * Global.GlyphWidth;
			const textYOffset = Global.GlyphLineHeight - renderView.FontProvider.GetFont().GlyphHeight;

			if (this.hoveredItemName == null) {
				this.hoveredItemName = renderView.RenderTextFactory.Create
				(
					toByte(renderView.GraphicInfoProvider.DefaultTextPaletteIndex - 1),
					renderView.GetLayer(Layer.Text),
					itemNameText,
					TextColor.White, true
				);
			} else
				this.hoveredItemName.Text = itemNameText;
			this.hoveredItemName.DisplayLayer = 10;
			this.hoveredItemName.PaletteIndex = this.game.UIPaletteIndex;
			this.hoveredItemName.X = Util.Limit(0, position.X - Math.trunc(textWidth / 2), Global.VirtualScreenWidth - textWidth);
			this.hoveredItemName.Y = position.Y - Global.GlyphLineHeight - 1 + textYOffset;
			this.hoveredItemName.Visible = true;

			if (this.showPrice) {
				const itemPriceText = renderView.TextProcessor.CreateText(String(item.Price));
				textWidth = itemPriceText.MaxLineSize * Global.GlyphWidth;
				const color = this.availableGoldProvider != null && this.availableGoldProvider() < item.Price ? TextColor.Red : TextColor.White;

				if (this.hoveredItemPrice == null) {
					this.hoveredItemPrice = renderView.RenderTextFactory.Create
					(
						toByte(renderView.GraphicInfoProvider.DefaultTextPaletteIndex - 1),
						renderView.GetLayer(Layer.Text),
						itemPriceText,
						color, true
					);
				} else {
					this.hoveredItemPrice.TextColor = color;
					this.hoveredItemPrice.Text = itemPriceText;
				}

				this.hoveredItemPrice.DisplayLayer = 2;
				this.hoveredItemPrice.PaletteIndex = this.hoveredItemName.PaletteIndex;
				this.hoveredItemPrice.X = Util.Limit(0, position.X - Math.trunc(textWidth / 2), Global.VirtualScreenWidth - textWidth);
				this.hoveredItemPrice.Y = position.Y - 2 * Global.GlyphLineHeight - 1 + textYOffset;
				this.hoveredItemPrice.Visible = true;
			}

			return true;
		}
	}

	ResetAnimation(itemSlot) {
		const slotIndex = this.SlotFromItemSlot(itemSlot);
		const item = this.items[slotIndex];

		if (item != null) {
			item.Position = this.GetSlotPosition(slotIndex);
			item.Dragged = false;
			item.ShowItemAmount = true;
		}
	}

	PlayMoveAnimation(itemSlot, targetPosition, finishAction,
		pixelsPerSecond = 300) {
		const slotPosition = this.GetSlotPosition(this.SlotFromItemSlot(itemSlot));
		const slotIndex = this.SlotFromItemSlot(itemSlot);
		const item = this.items[slotIndex];
		targetPosition ??= slotPosition;
		const startPosition = item.Position;

		const MoveFinished = () => {
			item.Dragged = false;
			item.ShowItemAmount = true;
			finishAction?.();
		};

		item.Dragged = true;
		item.ShowItemAmount = false;

		ItemAnimation.Play(this.game, this.renderView, ItemAnimation.Type.Move, startPosition, MoveFinished,
			50, targetPosition, item, pixelsPerSecond);
	}

	PlayShakeAnimation(itemSlot, finishAction) {
		ItemAnimation.Play(this.game, this.renderView, ItemAnimation.Type.Shake, Position.Zero, finishAction, 50,
			Position.Zero, this.items[this.SlotFromItemSlot(itemSlot)]);
	}
}

export { ItemAction as ItemGrid_ItemAction };
