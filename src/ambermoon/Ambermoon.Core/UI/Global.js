// Port of Ambermoon.Core/UI/Global.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { applyPartials, range } from '../../../runtime.js';
import { Rect } from '../../Ambermoon.Common/Rect.js';
import { RenderMap2D } from '../Render/RenderMap2D.js';
import { Inventory } from '../../Ambermoon.Data.Common/Inventory.js';
import { Button } from './Button.js';
import { Global_Render } from '../Render/Global.js';
import { Global_Layer } from '../Render/Layer.js';

// Values that depend on other modules of Ambermoon.Core are lazily computed (getters) to avoid
// circular import problems at module evaluation time. They are cached so they behave like static readonly fields.
const lazyCache = new Map();
function lazy(name, factory) {
	if (!lazyCache.has(name))
		lazyCache.set(name, factory());
	return lazyCache.get(name);
}

export class Global {
	static LayoutX = 0;
	static LayoutY = 37;
	static Map2DViewX = 16;
	static Map2DViewY = 49;
	static get Map2DViewWidth() { return RenderMap2D.NUM_VISIBLE_TILES_X * RenderMap2D.TILE_WIDTH; }
	static get Map2DViewHeight() { return RenderMap2D.NUM_VISIBLE_TILES_Y * RenderMap2D.TILE_HEIGHT; }
	static Map3DViewX = 32;
	static Map3DViewY = 49;
	static Map3DViewWidth = 144;
	static Map3DViewHeight = 144;
	static ButtonGridX = 208;
	static ButtonGridY = 143;
	static InventoryX = 109;
	static InventoryY = 76;
	static InventorySlotWidth = 22;
	static InventorySlotHeight = 29;
	static get InventoryWidth() { return Inventory.VisibleWidth * Global.InventorySlotWidth; }
	static get InventoryHeight() { return Inventory.VisibleHeight * Global.InventorySlotHeight; }
	static get InventoryTrapArea() { return lazy('InventoryTrapArea', () => Rect.CreateFromBoundaries(108, 75, 179, 185)); }
	static get InventoryAndEquipTrapArea() { return lazy('InventoryAndEquipTrapArea', () => Rect.CreateFromBoundaries(19, 71, 179, 185)); }
	/**
	 * This includes a 1-pixel border around the portrait.
	 */
	static get PartyMemberPortraitAreas() {
		return lazy('PartyMemberPortraitAreas', () => range(0, 6).map(index =>
			new Rect(15 + index * 48, 0, 34, 36)));
	}
	/**
	 * This includes a 1-pixel border around the portrait.
	 * This also includes the condition icon and the bars for HP and SP.
	 */
	static get ExtendedPartyMemberPortraitAreas() {
		return lazy('ExtendedPartyMemberPortraitAreas', () => range(0, 6).map(index =>
			new Rect(15 + index * 48, 0, 48, 36)));
	}
	static get PartyMemberPortraitArea() { return lazy('PartyMemberPortraitArea', () => new Rect(0, 0, 320, 36)); }
	static GlyphWidth = 6;
	static GlyphLineHeight = 7;
	static get CombatBackgroundArea() { return lazy('CombatBackgroundArea', () => new Rect(0, 38, 320, 95)); }
	static BattleFieldX = 96;
	static BattleFieldY = 134;
	static BattleFieldSlotWidth = 16;
	static BattleFieldSlotHeight = 13;
	static get BattleFieldArea() { return lazy('BattleFieldArea', () => new Rect(Global.BattleFieldX, Global.BattleFieldY, 6 * Global.BattleFieldSlotWidth, 5 * Global.BattleFieldSlotHeight)); }
	/** BattleFieldSlotArea(column, row) or BattleFieldSlotArea(index) */
	static BattleFieldSlotArea(column, row) {
		if (arguments.length === 1)
			return Global.BattleFieldSlotArea(column % 6, Math.trunc(column / 6));
		return new Rect
		(
			Global.BattleFieldX + column * Global.BattleFieldSlotWidth,
			Global.BattleFieldY + row * Global.BattleFieldSlotHeight,
			Global.BattleFieldSlotWidth, Global.BattleFieldSlotHeight
		);
	}
	static get AutomapArea() { return lazy('AutomapArea', () => new Rect(0, 37, 208, 163)); }
	static get UpperRightArea() { return lazy('UpperRightArea', () => new Rect(208, 49, 96, 80)); }
	static get ButtonGridArea() { return lazy('ButtonGridArea', () => new Rect(Global.ButtonGridX, Global.ButtonGridY, 3 * Button.Width, 3 * Button.Height)); }
	static get MobileMovementIndicator() { return lazy('MobileMovementIndicator', () => new Rect(208 + 16, 49 + 8, 64, 64)); }

	/**
	 * GetTextRect(int glyphHeight, Rect rect) or GetTextRect(IGameRenderView renderView, Rect rect)
	 */
	static GetTextRect(glyphHeightOrRenderView, rect) {
		if (typeof glyphHeightOrRenderView !== 'number')
			return Global.GetTextRect(glyphHeightOrRenderView.FontProvider.GetFont().GlyphHeight, rect);

		const glyphHeight = glyphHeightOrRenderView;

		if (glyphHeight === Global.GlyphLineHeight)
			return rect;

		return rect.CreateModified(0, Global.GlyphLineHeight - glyphHeight, 0, glyphHeight - Global.GlyphLineHeight);
	}
}

applyPartials(Global, [Global_Render, Global_Layer]);
