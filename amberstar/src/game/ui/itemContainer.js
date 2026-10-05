// Port of Amberstar.Game.UI.ItemContainer.
import { Layer, BuiltinPalette } from '../../engine/layerSetup.js';
import { Label, TransparentPaper } from './text.js';
import { UIGraphic } from '../../data/enums.js';
import { EventEmitter } from '../util.js';
import { ItemFlags } from '../../data/characters.js';
import { TicksPerSecond } from '../game.js';

export const ItemContainerClickMode = { Event: 0, DragAndDrop: 1 };

export class ItemContainer {
	static Width = 16;
	static Height = 16;
	static TwoHandedSecondSlotMarker = -1;
	static clickMode = ItemContainerClickMode.Event;
	static draggedItem = null;
	static draggedSourceSlot = null;
	static draggingStarted = new EventEmitter();
	static draggingEnded = new EventEmitter();

	static get isDragging() { return ItemContainer.draggedItem != null; }

	constructor(game, position, itemCount, item, displayLayer) {
		this.game = game;
		this._position = { ...position };
		this._paletteIndex = BuiltinPalette.Item;
		this._displayLayer = Math.min(displayLayer, 255 - 5);
		this.sprite = null;
		this.destroyAnimation = null;
		this.itemCountLabel = null;
		this.itemCount = 0;
		this.item = null;
		this.draggable = false;
		this.clicked = new EventEmitter();
		this.dragged = new EventEmitter();
		this.dropped = new EventEmitter();
		this.slotChanged = new EventEmitter();
		if (item)
			this.setItem(itemCount, item);
	}

	get displayLayer() { return this._displayLayer; }
	set displayLayer(v) {
		if (this._displayLayer === v)
			return;
		this._displayLayer = v;
		if (this.sprite) this.sprite.displayLayer = v;
		if (this.itemCountLabel) this.itemCountLabel.displayLayer = v + 4;
	}

	get paletteIndex() { return this._paletteIndex; }
	set paletteIndex(v) {
		this._paletteIndex = v;
		if (this.sprite) this.sprite.paletteIndex = v;
		if (this.destroyAnimation) this.destroyAnimation.paletteIndex = v;
	}

	get empty() { return this.itemCount === 0 || this.item == null; }

	get position() { return this._position; }

	get visible() { return this.sprite?.visible ?? false; }
	set visible(v) {
		if (this.sprite) this.sprite.visible = v;
		if (this.itemCountLabel) this.itemCountLabel.visible = v;
		if (this.destroyAnimation) this.destroyAnimation.visible = v;
	}

	#clone(draggable = null) {
		const c = new ItemContainer(this.game, this._position, this.itemCount, this.item, this._displayLayer);
		c.draggable = draggable ?? this.draggable;
		return c;
	}

	dropItem(count, item) {
		if (this.itemCount === 0) {
			this.setItem(count, item);
			return 0;
		} else if (this.itemCount === ItemContainer.TwoHandedSecondSlotMarker) {
			return count;
		} else if (this.item.index === item.index) {
			if (!(this.item.flags & ItemFlags.Stackable))
				return count;
			const dropCount = Math.min(count, 99 - this.itemCount);
			this.setItem(this.itemCount + dropCount, this.item);
			return count - dropCount;
		}
		return count;
	}

	setItem(count, item) {
		this.itemCount = count;
		this.item = item;
		if (count === 0 || !item) {
			this.clearItem();
			return;
		}
		const layer = this.game.getRenderLayer(Layer.UI);
		const atlas = layer.config.texture;
		if (!this.sprite) {
			this.sprite = layer.createSprite();
			this.sprite.width = ItemContainer.Width;
			this.sprite.height = ItemContainer.Height;
			this.sprite.displayLayer = this._displayLayer;
			this.sprite.paletteIndex = this._paletteIndex;
			this.#updateRenderPosition(this._position, false);
		}
		this.sprite.textureOffset = atlas.getOffset(this.game.graphicIndexProvider.getItemGraphicIndex(item.graphicIndex));
		this.sprite.visible = true;
		this.itemCountLabel?.destroy();
		this.itemCountLabel = null;
		if (count > 1) {
			this.itemCountLabel = new Label(this.game);
			this.itemCountLabel.setText(String(count).padStart(2, ' '), 15, TransparentPaper, BuiltinPalette.UI);
			this.itemCountLabel.area = { x: this.sprite.x + 2, y: this.sprite.y + 10, w: 12, h: 7 };
			this.itemCountLabel.displayLayer = this._displayLayer + 4;
			this.itemCountLabel.visible = true;
		}
		this.slotChanged.invoke();
	}

	reduceItemCount(amount, playAnimation = false, finishedHandler = null) {
		const slotCleared = amount >= this.itemCount;
		const reduce = () => {
			if (slotCleared) {
				this.clearItem();
				return;
			}
			this.setItem(this.itemCount - amount, this.item);
		};
		if (!playAnimation) {
			reduce();
			finishedHandler?.();
			return;
		}
		const game = this.game;
		const inputWasEnabled = game.inputEnabled;
		const wasPaused = game.paused;
		game.enableInput(false);
		game.pause();
		const layer = game.getRenderLayer(Layer.UI);
		this.destroyAnimation ??= layer.createAnimatedSprite();
		const a = this.destroyAnimation;
		a.x = this.sprite.x;
		a.y = this.sprite.y;
		a.width = 16;
		a.height = 16;
		a.textureOffset = layer.config.texture.getOffset(game.graphicIndexProvider.getUIGraphicIndex(UIGraphic.CurseAnimation));
		a.displayLayer = this.sprite.displayLayer + 5;
		a.paletteIndex = BuiltinPalette.UI;
		a.frameCount = 16;
		a.currentFrameIndex = 0;
		a.visible = true;
		let frame = 0;
		const next = () => {
			frame++;
			if (frame === 16) {
				a.visible = false;
				reduce();
				if (!wasPaused)
					game.resume();
				if (inputWasEnabled)
					game.enableInput(true);
				finishedHandler?.();
				return;
			}
			a.currentFrameIndex = frame;
			if (slotCleared && frame === 8 && this.sprite)
				this.sprite.visible = false;
			game.addDelayedAction(Math.floor(TicksPerSecond / 20), next);
		};
		game.addDelayedAction(Math.floor(TicksPerSecond / 20), next);
	}

	clearItem() {
		this.item = null;
		this.itemCount = 0;
		if (this.sprite) {
			this.sprite.visible = false;
			this.sprite = null;
		}
		if (this.itemCountLabel) {
			this.itemCountLabel.destroy();
			this.itemCountLabel = null;
		}
		if (this.destroyAnimation) {
			this.destroyAnimation.visible = false;
			this.destroyAnimation = null;
		}
		this.slotChanged.invoke();
	}

	#updateRenderPosition(position, center = true) {
		const p = center ? { x: position.x - 8, y: position.y - 8 } : position;
		if (this.sprite) {
			this.sprite.x = p.x;
			this.sprite.y = p.y;
		}
		if (this.itemCountLabel)
			this.itemCountLabel.area = { x: p.x + 2, y: p.y + 10, w: 12, h: 7 };
		if (this.destroyAnimation) {
			this.destroyAnimation.x = p.x;
			this.destroyAnimation.y = p.y;
		}
	}

	static updateDragPosition(game, position) {
		ItemContainer.draggedItem?.#updateRenderPosition(position);
	}

	static abortDrag(game) {
		const dragged = ItemContainer.draggedItem;
		if (!dragged)
			return;
		const item = dragged.item, count = dragged.itemCount;
		dragged.clearItem();
		ItemContainer.draggedItem = null;
		ItemContainer.draggingEnded.invoke();
		ItemContainer.draggedSourceSlot?.dropItem(count, item);
		ItemContainer.draggedSourceSlot = null;
		game.cursor.visible = true;
	}

	static consumeDragged(game) {
		const dragged = ItemContainer.draggedItem;
		if (!dragged)
			return;
		dragged.clearItem();
		ItemContainer.draggedItem = null;
		ItemContainer.draggedSourceSlot = null;
		game.cursor.visible = true;
		ItemContainer.draggingEnded.invoke();
	}

	startDragging(all = false) {
		const dragged = this.#clone(false);
		ItemContainer.draggedItem = dragged;
		dragged.displayLayer = 240;
		ItemContainer.draggedSourceSlot = this;
		this.dragged.invoke(this.item, all ? this.itemCount : 1);
		this.clearItem();
		ItemContainer.updateDragPosition(this.game, this.game.lastMousePosition);
		this.game.cursor.visible = false;
		ItemContainer.draggingStarted.invoke();
	}

	mouseClick(position, mouseButtons, modifiers) {
		if (!this.contains(position))
			return false;
		if (ItemContainer.clickMode === ItemContainerClickMode.Event) {
			this.clicked.invoke(mouseButtons, modifiers);
			return true;
		}
		const dragged = ItemContainer.draggedItem;
		if (!dragged && this.itemCount <= 0)
			return false;
		if (!dragged) {
			if (!this.draggable)
				return false;
			this.startDragging(mouseButtons === 2);
			return true;
		}
		const previousCount = dragged.itemCount;
		dragged.itemCount = this.dropItem(dragged.itemCount, dragged.item);
		if (dragged.itemCount === 0) {
			ItemContainer.consumeDragged(this.game);
			return true;
		}
		return previousCount !== dragged.itemCount;
	}

	destroy() {
		this.clearItem();
	}

	contains(position) {
		const p = this._position;
		return position.x >= p.x && position.y >= p.y && position.x < p.x + 16 && position.y < p.y + 16;
	}

	update() {
		if (this.itemCountLabel)
			this.itemCountLabel.alpha = Label.blinkAnimationAlpha;
	}
}
