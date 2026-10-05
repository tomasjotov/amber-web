// Port of Ambermoon.Core/Render/BattleEffects.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { Position } from '../../Ambermoon.Common/Position.js';
import { Size } from '../../Ambermoon.Common/Size.js';
import { Util } from '../../Ambermoon.Common/Util.js';
import { Monster } from '../../Ambermoon.Data.Common/Monster.js';
import { CharacterType } from '../../Ambermoon.Data.Common/Enumerations/CharacterType.js';
import { CombatGraphicIndex } from '../../Ambermoon.Data.Common/Enumerations/CombatGraphicIndex.js';
import { GameCore } from '../GameCore.js';
import { Global } from '../UI/Global.js';
import { Layout } from '../UI/Layout.js';
import { Graphics } from './Graphics.js';

export const BattleEffect = Object.freeze({
	HurtMonster: 0, // blood
	HurtPlayer: 1, // claw
	MonsterArrowAttack: 2, // green arrow
	MonsterBoltAttack: 3, // red arrow
	PlayerArrowAttack: 4, // green arrow
	PlayerBoltAttack: 5, // red arrow
	SlingstoneAttack: 6,
	SlingdaggerAttack: 7,
	SickleAttack: 8,
	Death: 9, // looks like a fire pillar to be honest
	BlockSpell: 10, // blueish ring
	PlayerAttack: 11 // sword swing
});

// struct
export class BattleEffectInfo {
	constructor() {
		this.StartPosition = null;
		this.EndPosition = null;
		this.StartScale = 0.0;
		this.EndScale = 0.0;
		this.StartTextureIndex = 0;
		this.FrameSize = null;
		this.FrameCount = 0;
		this.Duration = 0;
		this.InitialDisplayLayer = 0;
		this.EndDisplayLayer = 0;
		this.MirrorX = false;
	}

	clone() {
		return Object.assign(new BattleEffectInfo(), this);
	}
}

function createInfo(values) {
	return Object.assign(new BattleEffectInfo(), values);
}

export class BattleEffects {
	static Effects(...battleEffects) {
		return [...battleEffects];
	}

	static RowYOffsets = [81, 88, 98, 111, 124];

	static GetProjectileTargetPosition(renderView, tile, battleField) {
		const monster = battleField[tile];
		if (monster instanceof Monster) {
			return Layout.GetMonsterCombatCenterPosition(renderView, tile, monster);
		} else {
			return Position.op_Subtraction(Layout.GetPlayerSlotTargetPosition(tile % 6), new Position(0, 6));
		}
	}

	static GetCenterPosition(renderView, tile, battleField, yOffset = 0) {
		const offset = new Position(0, yOffset);
		const monster = battleField[tile];

		if (monster instanceof Monster) {
			return Position.op_Addition(Layout.GetMonsterCombatCenterPosition(renderView, tile, monster), offset);
		} else {
			return Position.op_Addition(Layout.GetPlayerSlotTargetPosition(tile % 6), offset);
		}
	}

	/**
	 * Overloads:
	 * CreateSimpleEffect(renderView, sourceTile, targetTile, graphicIndex, battleField, duration, startScale = 1.0f, scaleChangePerY = 0.0f)
	 *   // TODO: Not used. Why?
	 * CreateSimpleEffect(renderView, tile, graphicIndex, battleField, duration, yOffsetProvider = null, scale = 1.0f, ground = false)
	 */
	static CreateSimpleEffect(renderView, ...args) {
		if (!Array.isArray(args[2])) {
			const [sourceTile, targetTile, graphicIndex, battleField, duration, startScale = 1.0, scaleChangePerY = 0.0] = args;
			const info = renderView.GraphicInfoProvider.GetCombatGraphicInfo(graphicIndex);
			const startPosition = BattleEffects.GetCenterPosition(renderView, sourceTile, battleField);
			const endPosition = BattleEffects.GetCenterPosition(renderView, targetTile, battleField);
			const endScale = startScale + (endPosition.Y - startPosition.Y) * scaleChangePerY;

			return createInfo({
				StartPosition: startPosition,
				EndPosition: endPosition,
				StartScale: startScale,
				EndScale: endScale,
				StartTextureIndex: Graphics.CombatGraphicOffset + graphicIndex,
				FrameSize: new Size(info.GraphicInfo.Width, info.GraphicInfo.Height),
				FrameCount: info.FrameCount,
				Duration: duration,
				InitialDisplayLayer: Math.min(255, Math.trunc(sourceTile / 6) * 60 + 60), // display over the given row
				EndDisplayLayer: Math.min(255, Math.trunc(sourceTile / 6) * 60 + 60), // display over the given row
				MirrorX: false
			});
		}

		let [tile, graphicIndex, battleField, duration, yOffsetProvider = null, scale = 1.0, ground = false] = args;
		const info = renderView.GraphicInfoProvider.GetCombatGraphicInfo(graphicIndex);
		const position = BattleEffects.GetCenterPosition(renderView, tile, battleField, yOffsetProvider?.(battleField[tile] instanceof Monster) ?? 0);
		scale *= BattleEffects.GetScaleFromRow(renderView, tile, battleField);

		if (ground && battleField[tile] instanceof Monster) {
			const offsetY = yOffsetProvider?.(true) ?? 0;
			const groundPositionY = Layout.GetMonsterCombatGroundPosition(renderView, tile).Y + offsetY;
			const effectHeight = Util.Round(scale * info.GraphicInfo.Height);
			position.Y = groundPositionY - Math.trunc(effectHeight / 2);
		}

		return createInfo({
			StartPosition: position,
			EndPosition: position,
			StartScale: scale,
			EndScale: scale,
			StartTextureIndex: Graphics.CombatGraphicOffset + graphicIndex,
			FrameSize: new Size(info.GraphicInfo.Width, info.GraphicInfo.Height),
			FrameCount: info.FrameCount,
			Duration: duration,
			InitialDisplayLayer: Math.min(255, Math.trunc(tile / 6) * 60 + 60), // display over the given row
			EndDisplayLayer: Math.min(255, Math.trunc(tile / 6) * 60 + 60), // display over the given row
			MirrorX: false
		});
	}

	static GetScaleFromRow(renderView, tile, battleField) {
		if (battleField[tile]?.Type === CharacterType.PartyMember)
			return 2.0;

		return renderView.GraphicInfoProvider.GetMonsterRowImageScaleFactor(Math.trunc(tile / 6));
	}

	static CreateFlyingEffect(renderView, sourceTile, targetTile, graphicIndex, battleField, baseScale = 1.0) {
		const info = renderView.GraphicInfoProvider.GetCombatGraphicInfo(graphicIndex);
		const startPosition = BattleEffects.GetProjectileTargetPosition(renderView, sourceTile, battleField);
		const endPosition = BattleEffects.GetProjectileTargetPosition(renderView, targetTile, battleField);
		const sourceScale = BattleEffects.GetScaleFromRow(renderView, sourceTile, battleField);
		const targetScale = BattleEffects.GetScaleFromRow(renderView, targetTile, battleField);
		const maxY = Global.CombatBackgroundArea.Bottom;

		if (startPosition.Y > maxY)
			startPosition.Y = maxY;
		if (endPosition.Y > maxY)
			endPosition.Y = maxY;

		return createInfo({
			StartPosition: startPosition,
			EndPosition: endPosition,
			StartScale: sourceScale * baseScale,
			EndScale: targetScale * baseScale,
			StartTextureIndex: Graphics.CombatGraphicOffset + graphicIndex,
			FrameSize: new Size(info.GraphicInfo.Width, info.GraphicInfo.Height),
			FrameCount: info.FrameCount,
			Duration: BattleEffects.GetFlyDuration(sourceTile, targetTile),
			InitialDisplayLayer: Math.min(255, Math.trunc(sourceTile / 6) * 60 + 60), // display over the given row
			EndDisplayLayer: Math.min(255, Math.trunc(targetTile / 6) * 60 + 60), // display over the given row
			MirrorX: battleField[sourceTile] instanceof Monster ? startPosition.X < endPosition.X : startPosition.X > endPosition.X
		});
	}

	static GetFlyDuration(sourceTile, targetTile) {
		const sourceColumn = sourceTile % 6;
		const sourceRow = Math.trunc(sourceTile / 6);
		const targetColumn = targetTile % 6;
		const targetRow = Math.trunc(targetTile / 6);

		return Util.Limit(Math.trunc(GameCore.TicksPerSecond / 5),
			Math.trunc((Math.abs(targetColumn - sourceColumn) + Math.abs(targetRow - sourceRow) * 2) * GameCore.TicksPerSecond / 12),
			Math.trunc(15 * GameCore.TicksPerSecond / 12));
	}

	static GetEffectInfo(renderView, battleEffect, sourceTile, targetTile, battleField, scale = 1.0) {
		const Effects = BattleEffects.Effects;
		const TicksPerSecond = GameCore.TicksPerSecond;

		switch (battleEffect) {
			case BattleEffect.HurtMonster: return Effects(BattleEffects.CreateSimpleEffect(renderView, targetTile, CombatGraphicIndex.Blood, battleField, Math.trunc(TicksPerSecond / 3)));
			case BattleEffect.HurtPlayer: return Effects(BattleEffects.CreateSimpleEffect(renderView, targetTile, CombatGraphicIndex.AttackClaw, battleField, Math.trunc(TicksPerSecond / 2), _ => -28));
			case BattleEffect.MonsterArrowAttack: return Effects(BattleEffects.CreateFlyingEffect(renderView, sourceTile, targetTile, CombatGraphicIndex.ArrowGreenMonster, battleField));
			case BattleEffect.MonsterBoltAttack: return Effects(BattleEffects.CreateFlyingEffect(renderView, sourceTile, targetTile, CombatGraphicIndex.ArrowRedMonster, battleField));
			case BattleEffect.PlayerArrowAttack: return Effects(BattleEffects.CreateFlyingEffect(renderView, sourceTile, targetTile, CombatGraphicIndex.ArrowGreenHuman, battleField));
			case BattleEffect.PlayerBoltAttack: return Effects(BattleEffects.CreateFlyingEffect(renderView, sourceTile, targetTile, CombatGraphicIndex.ArrowRedHuman, battleField));
			case BattleEffect.SlingstoneAttack: return Effects(BattleEffects.CreateFlyingEffect(renderView, sourceTile, targetTile, CombatGraphicIndex.Slingstone, battleField));
			case BattleEffect.SlingdaggerAttack: return Effects(BattleEffects.CreateFlyingEffect(renderView, sourceTile, targetTile, CombatGraphicIndex.Slingdagger, battleField));
			case BattleEffect.SickleAttack: return Effects(BattleEffects.CreateFlyingEffect(renderView, sourceTile, targetTile, CombatGraphicIndex.FlyingSickle, battleField, 1.5));
			case BattleEffect.Death: return Effects(BattleEffects.CreateSimpleEffect(renderView, targetTile, CombatGraphicIndex.DeathAnimation, battleField, Math.trunc(TicksPerSecond * 5 / 4), null, scale, true));
			case BattleEffect.BlockSpell: return Effects(BattleEffects.CreateSimpleEffect(renderView, targetTile, CombatGraphicIndex.SpellBlock, battleField, Math.trunc(TicksPerSecond / 2), monster => (monster ? -32 : -46)));
			case BattleEffect.PlayerAttack: return Effects(BattleEffects.CreateSimpleEffect(renderView, targetTile, CombatGraphicIndex.AttackSword, battleField, Math.trunc(TicksPerSecond / 4), _ => -10));
			default: return null;
		}
	}
}
