// Port of Ambermoon.Core/UI/UIItem.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// Item icon used in UI

import { hasFlag, toByte } from '../../../runtime.js';
import { Position } from '../../Ambermoon.Common/Position.js';
import { ItemSlotFlags } from '../../Ambermoon.Data.Common/Enumerations/ItemSlotFlags.js';
import { UICustomGraphic } from '../../Ambermoon.Data.Common/Enumerations/UICustomGraphic.js';
import { Color as TextColor } from '../../Ambermoon.Data.Common/Enumerations/Color.js';
import { Layer } from '../Render/Layer.js';
import { Graphics } from '../Render/Graphics.js';
import { TextureAtlasManager } from '../Render/TextureAtlasManager.js';

export class UIItem {
	constructor(renderView, itemManager, item, merchantItem) {
		this.sprite = null;
		this.brokenOverlay = null;
		this.amountDisplay = null;
		this.showItemAmount = true;

		this.renderView = renderView;
		this.itemManager = itemManager;
		this.Item = item;
		this.merchantItem = merchantItem;
		this.sprite = renderView.SpriteFactory.Create(16, 16, true);
		this.sprite.Layer = renderView.GetLayer(Layer.Items);
		this.sprite.PaletteIndex = toByte(renderView.GraphicInfoProvider.PrimaryUIPaletteIndex - 1);

		this.Update(true);
	}

	get Dragged() {
		return this.sprite?.DisplayLayer === 100;
	}

	set Dragged(value) {
		this.sprite.DisplayLayer = toByte(value ? 100 : 0);

		if (this.brokenOverlay != null)
			this.brokenOverlay.DisplayLayer = toByte(this.sprite.DisplayLayer + 1);

		if (this.amountDisplay != null)
			this.amountDisplay.DisplayLayer = toByte(this.sprite.DisplayLayer + 2);
	}

	get ShowItemAmount() {
		return this.showItemAmount;
	}

	set ShowItemAmount(value) {
		if (this.showItemAmount === value)
			return;

		this.showItemAmount = value;
		this.Update(false);
	}

	Clone() {
		if (this.brokenOverlay != null) {
			this.brokenOverlay?.Delete();
			this.brokenOverlay = null;
		}

		return new UIItem(this.renderView, this.itemManager, this.Item.Copy(), this.merchantItem);
	}

	SetItem(item) {
		const itemTypeChanged = this.Item.ItemIndex !== item.ItemIndex;
		this.Item = item;
		this.Update(itemTypeChanged);
	}

	Update(itemTypeChanged) {
		const renderView = this.renderView;
		const sprite = this.sprite;

		if (itemTypeChanged) {
			if (this.Item.ItemIndex === 0 && this.Item.Amount !== 0) { // second hand slot
				sprite.TextureAtlasOffset = TextureAtlasManager.Instance.GetOrCreate(Layer.Items).GetOffset(0);
				this.amountDisplay?.Delete();
				this.amountDisplay = null;
			} else {
				const itemInfo = this.itemManager.GetItem(this.Item.ItemIndex);
				sprite.TextureAtlasOffset = TextureAtlasManager.Instance.GetOrCreate(Layer.Items).GetOffset(itemInfo.GraphicIndex);
				const stackable = this.merchantItem || this.Item.Stacked;

				if (this.amountDisplay == null && stackable) {
					this.amountDisplay = renderView.RenderTextFactory.Create(toByte(renderView.GraphicInfoProvider.DefaultTextPaletteIndex - 1));
					this.amountDisplay.Layer = renderView.GetLayer(Layer.Text);
					this.amountDisplay.TextColor = TextColor.White;
					this.amountDisplay.Shadow = true;
					this.amountDisplay.X = this.Item.Amount < 10 ? sprite.X + 5 : sprite.X + 2;
					this.amountDisplay.Y = sprite.Y + 17;
					this.amountDisplay.Text = renderView.TextProcessor.CreateText(this.Item.Amount > 99 ? '**' : String(this.Item.Amount));
					this.amountDisplay.Visible = this.ShowItemAmount;
				} else if (this.amountDisplay != null) {
					if (!stackable) {
						this.amountDisplay.Delete();
						this.amountDisplay = null;
					} else {
						this.amountDisplay.Text = renderView.TextProcessor.CreateText(this.Item.Amount > 99 ? '**' : String(this.Item.Amount));
						this.amountDisplay.X = this.Item.Amount < 10 ? sprite.X + 5 : sprite.X + 2;
						this.amountDisplay.Visible = this.ShowItemAmount;
					}
				}
			}
		} else if (this.amountDisplay != null) {
			if (this.Item.Stacked) {
				this.amountDisplay.Text = renderView.TextProcessor.CreateText(this.Item.Amount > 99 ? '**' : String(this.Item.Amount));
				this.amountDisplay.X = this.Item.Amount < 10 ? sprite.X + 5 : sprite.X + 2;
			}
			this.amountDisplay.Visible = this.Item.Stacked && this.ShowItemAmount;
		} else if (this.Item.Stacked) {
			this.amountDisplay = renderView.RenderTextFactory.Create(toByte(renderView.GraphicInfoProvider.DefaultTextPaletteIndex - 1));
			this.amountDisplay.Layer = renderView.GetLayer(Layer.Text);
			this.amountDisplay.TextColor = TextColor.White;
			this.amountDisplay.Shadow = true;
			this.amountDisplay.X = this.Item.Amount < 10 ? sprite.X + 5 : sprite.X + 2;
			this.amountDisplay.Y = sprite.Y + 17;
			this.amountDisplay.Text = renderView.TextProcessor.CreateText(this.Item.Amount > 99 ? '**' : String(this.Item.Amount));
			this.amountDisplay.Visible = this.ShowItemAmount;
		}

		if (this.Item.ItemIndex !== 0 && this.Item.Amount !== 0 && hasFlag(this.Item.Flags, ItemSlotFlags.Broken)) {
			if (this.brokenOverlay == null) {
				this.brokenOverlay = renderView.SpriteFactory.Create(16, 16, true, toByte((this.sprite?.DisplayLayer ?? 0) + 1));
				this.brokenOverlay.Layer = renderView.GetLayer(Layer.UI);
				this.brokenOverlay.PaletteIndex = toByte(renderView.GraphicInfoProvider.PrimaryUIPaletteIndex - 1);
				this.brokenOverlay.TextureAtlasOffset = TextureAtlasManager.Instance.GetOrCreate(Layer.UI)
					.GetOffset(Graphics.GetCustomUIGraphicIndex(UICustomGraphic.BrokenItemOverlay));
			}

			this.brokenOverlay.X = this.sprite.X;
			this.brokenOverlay.Y = this.sprite.Y;
			this.brokenOverlay.DisplayLayer = toByte(this.sprite.DisplayLayer + 1);
			this.brokenOverlay.Visible = true;
		} else {
			this.brokenOverlay?.Delete();
			this.brokenOverlay = null;
		}
	}

	Destroy() {
		this.sprite?.Delete();
		this.sprite = null;

		this.brokenOverlay?.Delete();
		this.brokenOverlay = null;

		this.amountDisplay?.Delete();
		this.amountDisplay = null;
	}

	get Visible() {
		return this.sprite?.Visible ?? false;
	}

	set Visible(value) {
		if (this.sprite == null)
			return;

		this.sprite.Visible = value;

		if (this.brokenOverlay != null)
			this.brokenOverlay.Visible = value;

		if (this.amountDisplay != null)
			this.amountDisplay.Visible = value && this.Item.Stacked;
	}

	get Position() {
		return this.sprite == null ? null : new Position(this.sprite.X, this.sprite.Y);
	}

	set Position(value) {
		if (this.sprite == null || value == null)
			return;

		this.sprite.X = value.X;
		this.sprite.Y = value.Y;

		if (this.brokenOverlay != null) {
			this.brokenOverlay.X = this.sprite.X;
			this.brokenOverlay.Y = this.sprite.Y;
		}

		if (this.amountDisplay != null) {
			this.amountDisplay.X = this.Item.Amount < 10 ? this.sprite.X + 5 : this.sprite.X + 2;
			this.amountDisplay.Y = this.sprite.Y + 17;
		}
	}
}
