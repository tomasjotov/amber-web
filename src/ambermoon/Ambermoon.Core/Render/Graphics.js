// Port of Ambermoon.Core/Render/Graphics.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { tryGetValue } from '../../../runtime.js';
import { EnumHelper } from '../../Ambermoon.Common/EnumHelper.js';
import { UICustomGraphic } from '../../Ambermoon.Data.Common/Enumerations/UICustomGraphic.js';
import { UIGraphic } from '../../Ambermoon.Data.Common/Enumerations/UIGraphic.js';
import { Condition } from '../../Ambermoon.Data.Common/Enumerations/Condition.js';

// Characters
const TravelGraphicOffset = 3 * 17;
const TransportGraphicOffset = TravelGraphicOffset + 12 * 4;
const NPCGraphicOffset = TransportGraphicOffset + 5;
// UI layer
const UICustomGraphicOffset = 250;
const RiddlemouthOffset = 3300;

let uiGraphicOffset = null;
let buttonOffset = null;

export class Graphics {
	// Characters
	static TravelGraphicOffset = TravelGraphicOffset;
	static TransportGraphicOffset = TransportGraphicOffset;
	static NPCGraphicOffset = NPCGraphicOffset;

	// UI layer
	static LayoutOffset = 0;
	static PortraitOffset = 20;
	static Pics80x80Offset = 150;
	static EventPictureOffset = 200;
	static UICustomGraphicOffset = UICustomGraphicOffset;
	static CombatGraphicOffset = 2500;
	static BattleFieldIconOffset = 3000;
	static AutomapOffset = 3200;
	static RiddlemouthOffset = RiddlemouthOffset;
	static RiddlemouthEyeIndex = RiddlemouthOffset;
	static RiddlemouthMouthIndex = RiddlemouthOffset + 1;
	// web port: additional UI graphics of other games (gameData.ExtraUIGraphics, e.g. the Amberstar altar)
	static ExtraUIGraphicOffset = 3500;

	// We load 3 things into the same layer -> GraphicType.UIElements
	// 1. Our own UI elements like scrollbars, etc (see UICustomGraphic)
	// 2. Game UI elements from the executable (see UIGraphic)
	// 3. Game button graphics from the executable (see ButtonType)
	// Note: Computed lazily to avoid using imported modules at module evaluation time.
	static get UIGraphicOffset() {
		return uiGraphicOffset ??= UICustomGraphicOffset + EnumHelper.NameCount(UICustomGraphic);
	}
	static get ButtonOffset() {
		return buttonOffset ??= Graphics.UIGraphicOffset + EnumHelper.NameCount(UIGraphic);
	}
	static get PopupFrameOffset() {
		return Graphics.UIGraphicOffset;
	}

	static GetScrollbarGraphicIndex(scrollbarType) { return UICustomGraphicOffset + scrollbarType; }
	static GetCustomUIGraphicIndex(customGraphic) { return UICustomGraphicOffset + customGraphic; }
	static GetUIGraphicIndex(graphic) { return Graphics.UIGraphicOffset + graphic; }
	static GetButtonGraphicIndex(buttonType) { return Graphics.ButtonOffset + buttonType; }
	static GetPopupFrameGraphicIndex(frame) { return Graphics.PopupFrameOffset + frame; }
	static GetConditionGraphic(condition) {
		switch (condition) {
			case Condition.Irritated: return UIGraphic.StatusIrritated;
			case Condition.Crazy: return UIGraphic.StatusCrazy;
			case Condition.Sleep: return UIGraphic.StatusSleep;
			case Condition.Panic: return UIGraphic.StatusPanic;
			case Condition.Blind: return UIGraphic.StatusBlind;
			case Condition.Drugged: return UIGraphic.StatusDrugs;
			case Condition.Exhausted: return UIGraphic.StatusExhausted;
			case Condition.Lamed: return UIGraphic.StatusLamed;
			case Condition.Poisoned: return UIGraphic.StatusPoisoned;
			case Condition.Petrified: return UIGraphic.StatusPetrified;
			case Condition.Diseased: return UIGraphic.StatusDiseased;
			case Condition.Aging: return UIGraphic.StatusAging;
			case Condition.DeadCorpse: return UIGraphic.StatusDead;
			case Condition.DeadAshes: return UIGraphic.StatusDead;
			case Condition.DeadDust: return UIGraphic.StatusDead;
			default: return null;
		}
	}
	static GetConditionGraphicIndex(condition) { return Graphics.GetUIGraphicIndex(Graphics.GetConditionGraphic(condition)); }
	static GetAutomapGraphicIndex(automapGraphic) { return Graphics.AutomapOffset + automapGraphic; }
	static GetNPCGraphicIndex(npcFileIndex, npcIndex, graphicInfoProvider) {
		const [found, offset] = tryGetValue(graphicInfoProvider.NPCGraphicOffsets, npcFileIndex);
		return NPCGraphicOffset + (found ? offset : 0) + npcIndex;
	}
}
