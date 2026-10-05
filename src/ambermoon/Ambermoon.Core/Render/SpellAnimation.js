// Port of Ambermoon.Core/Render/SpellAnimation.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { enumName, getValue, range, removeItem, repeat, toByte } from '../../../runtime.js';
import { Position } from '../../Ambermoon.Common/Position.js';
import { Size } from '../../Ambermoon.Common/Size.js';
import { Util } from '../../Ambermoon.Common/Util.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { Monster } from '../../Ambermoon.Data.Common/Monster.js';
import { PartyMember } from '../../Ambermoon.Data.Common/PartyMember.js';
import { SpellTarget } from '../../Ambermoon.Data.Common/SpellInfo.js';
import { MonsterRow } from '../../Ambermoon.Data.Common/IGraphicProvider.js';
import { Spell } from '../../Ambermoon.Data.Common/Enumerations/Spells.js';
import { CombatGraphicIndex } from '../../Ambermoon.Data.Common/Enumerations/CombatGraphicIndex.js';
import { MonsterAnimationType } from '../../Ambermoon.Data.Common/Enumerations/MonsterAnimationType.js';
import { UICustomGraphic } from '../../Ambermoon.Data.Common/Enumerations/UICustomGraphic.js';
import { GameCore } from '../GameCore.js';
import { Global } from '../UI/Global.js';
import { Layout, FilledAreaType } from '../UI/Layout.js';
import { BattleAnimation } from './BattleAnimation.js';
import { BattleEffect, BattleEffects } from './BattleEffects.js';
import { Color } from './Color.js';
import { Graphics } from './Graphics.js';
import { Layer } from './Layer.js';
import { TextureAtlasManager } from './TextureAtlasManager.js';

const materializeColorIndices = range(1, 6);

export class SpellAnimation {
	/**
	 * Overloads:
	 * SpellAnimation(GameCore game, Layout layout, Battle battle, Spell spell, bool fromMonster, int sourcePosition, int targetRow = 0)
	 * SpellAnimation(GameCore game, Layout layout)
	 */
	constructor(game, layout, battle, spell, fromMonster, sourcePosition, targetRow = 0) {
		this.game = null;
		this.layout = null;
		this.battle = null;
		this.renderView = null;
		this.spell = 0;
		this.animations = [];
		this.colorOverlay = null;
		this.textureAtlas = null;
		this.fromMonster = false;
		this.startPosition = 0;
		this.targetRow = 0;
		this.lastPosition = -1;
		this.finishAction = null;

		if (arguments.length > 2) {
			this.game = game;
			this.layout = layout;
			this.battle = battle;
			this.renderView = layout.RenderView;
			this.spell = spell;
			this.fromMonster = fromMonster;
			this.startPosition = sourcePosition;
			this.targetRow = targetRow;
			this.textureAtlas = TextureAtlasManager.Instance.GetOrCreate(Layer.BattleEffects);
		} else {
			this.game = game;
			this.layout = layout;
			this.renderView = layout.RenderView;
			this.fromMonster = false;
			this.textureAtlas = TextureAtlasManager.Instance.GetOrCreate(Layer.BattleEffects);
		}
	}

	ShowOverlay(color) {
		this.colorOverlay?.Delete();
		this.colorOverlay = this.layout.CreateArea(Global.CombatBackgroundArea, color, 100, FilledAreaType.CustomEffect);
	}

	HideOverlay() {
		this.colorOverlay?.Delete();
		this.colorOverlay = null;
	}

	RemoveAnimation(animation, callGlobalFinish = true) {
		animation.Destroy();
		removeItem(this.animations, animation);

		if (this.animations.length === 0 && callGlobalFinish)
			this.finishAction?.();
	}

	/**
	 * Overloads:
	 * A: AddAnimation(graphicIndex, int[] frameIndices, startPosition, endPosition, duration, startScale = 1.0f, endScale = 1.0f,
	 *        displayLayer = 255, finishAction = null, customBaseSize = null, scaleType = Both, anchorX = Center, anchorY = Center,
	 *        mirrorX = false, palette = 17, maskColors = null, removeWhenFinished = true, customStartTicks = null)
	 * B: AddAnimation(graphicIndex, int numFrames, startPosition, endPosition, duration, startScale = 1.0f, endScale = 1.0f,
	 *        displayLayer = 255, finishAction = null, customBaseSize = null, scaleType = Both, anchorX = Center, anchorY = Center,
	 *        mirrorX = false, palette = 17)
	 * C: AddAnimation(graphicIndex, int numFrames, startPosition, endPosition, duration, startScale, endScale, displayLayer,
	 *        finishAction, uint customStartTicks)
	 * D: AddAnimation(graphicIndex, int numFrames, startPosition, endPosition, duration, startScale, endScale, displayLayer,
	 *        finishAction, byte palette)
	 * Note: C and D can not be distinguished at runtime. 10 arguments with a number as the 10th argument
	 * are treated as D (palette). Callers of C must use the full overload A instead (see PlayKnowledge).
	 */
	AddAnimation(graphicIndex, frameIndices, startPosition, endPosition, duration, ...rest) {
		if (typeof frameIndices === 'number') {
			frameIndices = range(0, frameIndices);

			if (arguments.length === 10 && typeof rest[4] === 'number') {
				// D
				const [startScale, endScale, displayLayer, finishAction, palette] = rest;
				return this.AddAnimation(graphicIndex, frameIndices, startPosition, endPosition, duration, startScale, endScale,
					displayLayer, finishAction, null, BattleAnimation.AnimationScaleType.Both, BattleAnimation.HorizontalAnchor.Center,
					BattleAnimation.VerticalAnchor.Center, false, palette);
			}

			// B (parameters are a prefix of A)
			rest = rest.slice(0, 10);
		}

		let [startScale = 1.0, endScale = 1.0, displayLayer = 255, finishAction = null,
			customBaseSize = null, scaleType = BattleAnimation.AnimationScaleType.Both,
			anchorX = BattleAnimation.HorizontalAnchor.Center,
			anchorY = BattleAnimation.VerticalAnchor.Center,
			mirrorX = false, palette = 17, maskColors = null, removeWhenFinished = true,
			customStartTicks = null] = rest;

		const renderView = this.renderView;
		const game = this.game;
		const info = renderView.GraphicInfoProvider.GetCombatGraphicInfo(graphicIndex);
		const textureSize = new Size(info.GraphicInfo.Width, info.GraphicInfo.Height);
		const size = customBaseSize ?? textureSize;
		const sprite = renderView.SpriteFactory.Create(size.Width, size.Height, true, displayLayer);
		sprite.ClipArea = Global.CombatBackgroundArea;
		sprite.Layer = renderView.GetLayer(Layer.BattleEffects);
		sprite.PaletteIndex = palette;
		sprite.MaskColor = maskColors == null ? null : maskColors[0];
		sprite.TextureSize = textureSize;
		const animation = new BattleAnimation(sprite);
		animation.Visible = true;
		const AnimationEnded = () => {
			animation.AnimationFinished.remove(AnimationEnded);

			if (removeWhenFinished)
				this.RemoveAnimation(animation, finishAction == null);

			if (finishAction != null)
				finishAction?.();
		};
		animation.AnimationFinished.add(AnimationEnded);
		animation.ScaleType = scaleType;
		animation.SetStartFrame(this.textureAtlas.GetOffset(Graphics.CombatGraphicOffset + graphicIndex),
			size, startPosition, startScale, mirrorX, textureSize, anchorX, anchorY);
		animation.Play(frameIndices, Math.max(1, Math.trunc(duration / frameIndices.length)), customStartTicks ?? game.CurrentBattleTicks, endPosition, endScale);
		this.animations.push(animation);

		if (maskColors != null) {
			const UpdateMask = progress => {
				sprite.MaskColor = maskColors[Math.min(maskColors.length - 1, Util.Round(progress * maskColors.length))];
			};

			const FinishMasking = () => {
				animation.AnimationUpdated.remove(UpdateMask);
				animation.AnimationFinished.remove(FinishMasking);
			};

			animation.AnimationUpdated.add(UpdateMask);
			animation.AnimationFinished.add(FinishMasking);
		}

		return animation;
	}

	/**
	 * Overloads:
	 * AddAnimationThatRemains(graphicIndex, int numFrames, startPosition, endPosition, duration, startScale = 1.0f, endScale = 1.0f, displayLayer = 255, finishAction = null)
	 * AddAnimationThatRemains(graphicIndex, int[] frameIndices, startPosition, endPosition, duration, startScale = 1.0f, endScale = 1.0f, displayLayer = 255, finishAction = null)
	 */
	AddAnimationThatRemains(graphicIndex, frameIndices, startPosition, endPosition, duration, startScale = 1.0, endScale = 1.0,
		displayLayer = 255, finishAction = null) {
		if (typeof frameIndices === 'number')
			frameIndices = range(0, frameIndices);

		return this.AddAnimation(graphicIndex, frameIndices, startPosition, endPosition, duration, startScale,
			endScale, displayLayer, finishAction, null, BattleAnimation.AnimationScaleType.Both, BattleAnimation.HorizontalAnchor.Center,
			BattleAnimation.VerticalAnchor.Center, false, 17, null, false);
	}

	AddMaskedAnimation(graphicIndex, startPosition, endPosition, duration, startScale, endScale, displayLayer, finishAction, maskColors, palette) {
		return this.AddAnimation(graphicIndex, repeat(0, maskColors.length), startPosition, endPosition,
			duration, startScale, endScale, displayLayer, finishAction, null, BattleAnimation.AnimationScaleType.Both,
			BattleAnimation.HorizontalAnchor.Center, BattleAnimation.VerticalAnchor.Center, false, palette, maskColors);
	}

	AddPortraitAnimation(slot, graphicIndex, frameSize, frameCount, startOffset, endOffset, duration, finishAction = null) {
		const renderView = this.renderView;
		const game = this.game;
		const area = Global.PartyMemberPortraitAreas[slot];
		const sprite = renderView.SpriteFactory.Create(frameSize.Width, frameSize.Height, true, 200);
		sprite.ClipArea = area;
		sprite.Layer = renderView.GetLayer(Layer.UI);
		sprite.PaletteIndex = game.PrimaryUIPaletteIndex;
		sprite.TextureSize = frameSize;
		const animation = new BattleAnimation(sprite);
		animation.Visible = true;
		const AnimationEnded = () => {
			animation.AnimationFinished.remove(AnimationEnded);
			this.RemoveAnimation(animation, finishAction == null);

			if (finishAction != null)
				finishAction?.();
		};
		animation.AnimationFinished.add(AnimationEnded);
		animation.ScaleType = BattleAnimation.AnimationScaleType.None;
		const textureAtlas = TextureAtlasManager.Instance.GetOrCreate(Layer.UI);
		animation.SetStartFrame(textureAtlas.GetOffset(Graphics.GetCustomUIGraphicIndex(graphicIndex)), frameSize,
			Position.op_Addition(area.Position, startOffset), 1.0, false, frameSize, BattleAnimation.HorizontalAnchor.Left, BattleAnimation.VerticalAnchor.Top);
		const ticks = this.battle != null ? game.CurrentBattleTicks : game.CurrentAnimationTicks;
		animation.Play(range(0, frameCount), Math.trunc(duration / frameCount), ticks, Position.op_Addition(area.Position, endOffset));
		this.animations.push(animation);
		return animation;
	}

	static GetScaleXRelativeToCombatArea(baseWidth, factor) {
		return (Global.CombatBackgroundArea.Width * factor) / baseWidth;
	}

	static GetScaleYRelativeToCombatArea(baseHeight, factor) {
		return (Global.CombatBackgroundArea.Height * factor) / baseHeight;
	}

	GetSourcePosition() {
		const spell = this.spell;

		switch (spell) {
			case Spell.HealingHand:
			case Spell.RemoveFear:
			case Spell.RemovePanic:
			case Spell.RemoveShadows:
			case Spell.RemoveBlindness:
			case Spell.RemovePain:
			case Spell.RemoveDisease:
			case Spell.SmallHealing:
			case Spell.RemovePoison:
			case Spell.NeutralizePoison:
			case Spell.MediumHealing:
			case Spell.DispellUndead:
			case Spell.DestroyUndead:
			case Spell.HolyWord:
			case Spell.GreatHealing:
			case Spell.MassHealing:
			case Spell.RemoveRigidness:
			case Spell.RemoveLamedness:
			case Spell.HealAging:
			case Spell.StopAging:
			case Spell.StoneToFlesh:
			case Spell.WakeUp:
			case Spell.RemoveIrritation:
			case Spell.RestoreStamina:
			case Spell.Blink:
			case Spell.Escape:
			case Spell.MagicalShield:
			case Spell.MagicalWall:
			case Spell.MagicalBarrier:
			case Spell.MagicalWeapon:
			case Spell.MagicalAssault:
			case Spell.MagicalAttack:
			case Spell.AntiMagicWall:
			case Spell.AntiMagicSphere:
			case Spell.Hurry:
			case Spell.MassHurry:
			case Spell.MonsterKnowledge:
			case Spell.ShowMonsterLP:
			case Spell.ShowElements:
			case Spell.ForeseeMagic:
			case Spell.ForeseeAttack:
			case Spell.MysticImitation:
			case Spell.RecognizeWeakPoint:
			case Spell.SeeWeaknesses:
			case Spell.KnowledgeOfTheWeakness:
			case Spell.ProtectionSphere:
			case Spell.ElementToEarth:
			case Spell.ElementToWind:
			case Spell.ElementToFire:
			case Spell.ElementToWater:
			case Spell.Lame:
			case Spell.Poison:
			case Spell.Petrify:
			case Spell.CauseDisease:
			case Spell.CauseAging:
			case Spell.Irritate:
			case Spell.CauseMadness:
			case Spell.Sleep:
			case Spell.Fear:
			case Spell.Blind:
			case Spell.Drug:
			case Spell.DissolveVictim:
			case Spell.Mudsling:
			case Spell.Rockfall:
			case Spell.Earthslide:
			case Spell.Earthquake:
			case Spell.Winddevil:
			case Spell.Windhowler:
			case Spell.Thunderbolt:
			case Spell.Whirlwind:
			case Spell.Firestorm:
			case Spell.Firepillar:
			case Spell.Waterfall:
			case Spell.Icestorm:
			case Spell.Iceshower:
			case Spell.SpellPointsI:
			case Spell.SpellPointsII:
			case Spell.SpellPointsIII:
			case Spell.SpellPointsIV:
			case Spell.SpellPointsV:
			case Spell.AllHealing:
			case Spell.AddStrength:
			case Spell.AddIntelligence:
			case Spell.AddDexterity:
			case Spell.AddSpeed:
			case Spell.AddStamina:
			case Spell.AddCharisma:
			case Spell.AddLuck:
			case Spell.AddAntiMagic:
			case Spell.Drugs:
			case Spell.SelfHealing:
			case Spell.SelfReviving:
			case Spell.ExpExchange:
				// Those spells have no source position. They just appear somewhere.
				// Or they only work with the target position. GetSourcePosition should
				// never be called for those spells so we throw here.
				throw new AmbermoonException(ExceptionScope.Application, `The spell ${enumName(Spell, spell)} should not use a source position.`);
			case Spell.GhostWeapon:
			case Spell.GhostInferno:
			case Spell.LPStealer:
			case Spell.SPStealer:
			case Spell.MysticDecay:
			case Spell.Firebeam:
			case Spell.Fireball:
			case Spell.Iceball:
			case Spell.MagicalProjectile:
			case Spell.MagicalArrows:
			case Spell.MagicSwordAttack: {
				let position;
				if (this.fromMonster) {
					const monster = this.battle.GetCharacterAt(this.startPosition);
					position = this.layout.GetMonsterCombatCenterPosition(this.startPosition, monster instanceof Monster ? monster : null);
				} else {
					position = new Position(this.startPosition % 6 < 3 ? Global.CombatBackgroundArea.Left + 32 : Global.CombatBackgroundArea.Right - 32,
						Global.CombatBackgroundArea.Top + 64);
				}
				return position;
			}
			default:
				throw new AmbermoonException(ExceptionScope.Application, `The spell ${enumName(Spell, spell)} can not be rendered during a fight.`);
		}
	}

	GetTargetPosition(position) {
		const spell = this.spell;
		const renderView = this.renderView;

		switch (spell) {
			case Spell.DispellUndead:
			case Spell.DestroyUndead:
			case Spell.HolyWord:
				return Layout.GetMonsterCombatGroundPosition(renderView, position);
			case Spell.HealingHand:
			case Spell.RemoveFear:
			case Spell.RemovePanic:
			case Spell.RemoveShadows:
			case Spell.RemoveBlindness:
			case Spell.RemovePain:
			case Spell.RemoveDisease:
			case Spell.SmallHealing:
			case Spell.RemovePoison:
			case Spell.NeutralizePoison:
			case Spell.MediumHealing:
			case Spell.GreatHealing:
			case Spell.MassHealing:
			case Spell.RemoveRigidness:
			case Spell.RemoveLamedness:
			case Spell.HealAging:
			case Spell.StopAging:
			case Spell.StoneToFlesh:
			case Spell.WakeUp:
			case Spell.RemoveIrritation:
			case Spell.RestoreStamina:
			case Spell.MagicalShield:
			case Spell.MagicalWall:
			case Spell.MagicalBarrier:
			case Spell.MagicalWeapon:
			case Spell.MagicalAssault:
			case Spell.MagicalAttack:
			case Spell.AntiMagicWall:
			case Spell.AntiMagicSphere:
			case Spell.Hurry:
			case Spell.MassHurry:
			case Spell.ShowMonsterLP:
			case Spell.ShowElements:
			case Spell.ForeseeMagic:
			case Spell.ForeseeAttack:
			case Spell.Earthquake:
			case Spell.Blink:
			case Spell.Escape:
			case Spell.SpellPointsI:
			case Spell.SpellPointsII:
			case Spell.SpellPointsIII:
			case Spell.SpellPointsIV:
			case Spell.SpellPointsV:
			case Spell.AllHealing:
			case Spell.AddStrength:
			case Spell.AddIntelligence:
			case Spell.AddDexterity:
			case Spell.AddSpeed:
			case Spell.AddStamina:
			case Spell.AddCharisma:
			case Spell.AddLuck:
			case Spell.AddAntiMagic:
			case Spell.Drugs:
			case Spell.SelfHealing:
			case Spell.SelfReviving:
			case Spell.ExpExchange:
			case Spell.ProtectionSphere:
				// Those spells have no target position. They are just visible on portraits or not at all.
				// GetTargetPosition should never be called for those spells so we throw here.
				throw new AmbermoonException(ExceptionScope.Application, `The spell ${enumName(Spell, spell)} should not use a target position.`);
			case Spell.GhostWeapon:
			case Spell.GhostInferno:
			case Spell.LPStealer:
			case Spell.SPStealer:
			case Spell.MonsterKnowledge:
			case Spell.MysticImitation:
			case Spell.MysticDecay:
			case Spell.RecognizeWeakPoint:
			case Spell.SeeWeaknesses:
			case Spell.KnowledgeOfTheWeakness:
			case Spell.ElementToEarth:
			case Spell.ElementToWind:
			case Spell.ElementToFire:
			case Spell.ElementToWater:
			case Spell.MagicalProjectile:
			case Spell.MagicalArrows:
			case Spell.Lame:
			case Spell.Poison:
			case Spell.Petrify:
			case Spell.CauseDisease:
			case Spell.CauseAging:
			case Spell.Irritate:
			case Spell.CauseMadness:
			case Spell.Sleep:
			case Spell.Fear:
			case Spell.Blind:
			case Spell.Drug:
			case Spell.Firebeam:
			case Spell.Fireball:
			case Spell.Firestorm:
			case Spell.Firepillar:
			case Spell.Iceball:
			case Spell.Icestorm:
			case Spell.Iceshower:
			case Spell.MagicSwordAttack: {
				let targetPosition;
				if (this.fromMonster) { // target is party member
					targetPosition = Layout.GetPlayerSlotCenterPosition(position % 6);
				} else { // target is monster
					const monster = this.battle.GetCharacterAt(position);
					targetPosition = this.layout.GetMonsterCombatCenterPosition(position, monster instanceof Monster ? monster : null);
				}
				if (targetPosition.Y > Global.CombatBackgroundArea.Bottom - 20)
					targetPosition.Y = Global.CombatBackgroundArea.Bottom - 20;
				return targetPosition;
			}
			case Spell.Winddevil:
			case Spell.Windhowler:
			case Spell.Whirlwind: {
				const row = Math.trunc(position / 6);
				if (this.fromMonster && (spell !== Spell.Whirlwind || row !== 0)) { // target is party member
					return Position.op_Addition(Layout.GetPlayerSlotCenterPosition(position % 6), new Position(0, 10 + row * 2));
				} else { // target is monster
					let yOffset = Util.Round(32 * renderView.GraphicInfoProvider.GetMonsterRowImageScaleFactor(row)) + 8;
					if (spell !== Spell.Winddevil)
						yOffset += 6;
					return Position.op_Subtraction(Layout.GetMonsterCombatGroundPosition(renderView, position), new Position(0, yOffset));
				}
			}
			case Spell.Thunderbolt: {
				if (this.fromMonster) { // target is party member
					const targetPosition = Layout.GetPlayerSlotCenterPosition(position % 6);
					targetPosition.Y = Global.CombatBackgroundArea.Center.Y;
					return targetPosition;
				} else { // target is monster
					const row = Math.trunc(position / 6);
					const yOffset = Util.Round(32 * renderView.GraphicInfoProvider.GetMonsterRowImageScaleFactor(row)) + 16;
					return Position.op_Subtraction(Layout.GetMonsterCombatGroundPosition(renderView, position), new Position(0, yOffset));
				}
			}
			case Spell.Mudsling:
			case Spell.Rockfall: {
				if (this.fromMonster) { // target is party member
					return Layout.GetPlayerSlotCenterPosition(position % 6);
				} else { // target is monster
					const monster = this.battle.GetCharacterAt(position);
					return Position.op_Subtraction(this.layout.GetMonsterCombatTopPosition(position, monster instanceof Monster ? monster : null), new Position(0, 6));
				}
			}
			case Spell.Earthslide: {
				if (this.fromMonster) { // target is party member
					return new Position(0, Global.CombatBackgroundArea.Bottom + 10);
				} else { // target is monster
					return Layout.GetMonsterCombatGroundPosition(renderView, position);
				}
			}
			case Spell.Waterfall: {
				if (this.fromMonster) { // target is party member
					return Position.op_Addition(Layout.GetPlayerSlotTargetPosition(position % 6), new Position(0, 10));
				} else { // target is monster
					return Position.op_Subtraction(Layout.GetMonsterCombatGroundPosition(renderView, position), new Position(0, 4));
				}
			}
			case Spell.DissolveVictim: {
				let targetPosition;
				if (this.fromMonster) { // target is party member
					targetPosition = Layout.GetPlayerSlotCenterPosition(position % 6); // TODO: is this right? Is this spell working on players in general?
				} else { // target is monster
					targetPosition = Layout.GetMonsterCombatGroundPosition(renderView, position);
				}
				return targetPosition;
			}
			default:
				throw new AmbermoonException(ExceptionScope.Application, `The spell ${enumName(Spell, spell)} can not be rendered during a fight.`);
		}
	}

	PlayHealingAnimation(partyMember, finishAction) {
		const game = this.game;
		const slot = game.SlotFromPartyMember(partyMember);
		const starCount = 25;
		let remainingStars = starCount;

		const FallingStarFinished = () => {
			if (--remainingStars === 0)
				finishAction?.();
		};

		// x and y are relative to the portrait area
		const PlayFallingStar = (x, y) => {
			this.AddPortraitAnimation(slot, UICustomGraphic.HealingStarAnimation, new Size(7, 7), 3, new Position(x, y),
				new Position(x, y + 16), Math.trunc(GameCore.TicksPerSecond / 3), FallingStarFinished);
		};

		for (let i = 0; i < starCount; ++i) {
			game.AddTimedEvent(game.RandomInt(0, 300), () => {
				PlayFallingStar(game.RandomInt(0, 46) - 6, game.RandomInt(0, 18) - 6);
			});
		}
	}

	/**
	 * This is used only outside of battles.
	 * For mass spells use Play instead.
	 * @param spell The spell.
	 * @param partyMember The target party member.
	 * @param finishAction Action which is performed after the animation has finished.
	 */
	CastOn(spell, partyMember, finishAction) {
		switch (spell) {
			case Spell.HealingHand:
			case Spell.RemoveFear:
			case Spell.RemoveShadows:
			case Spell.RemovePain:
			case Spell.SmallHealing:
			case Spell.RemovePoison:
			case Spell.MediumHealing:
			case Spell.GreatHealing:
			case Spell.RemoveRigidness:
			case Spell.HealAging:
			case Spell.StoneToFlesh:
			case Spell.WakeUp:
			case Spell.RemoveIrritation:
			case Spell.Hurry:
			case Spell.SpellPointsI:
			case Spell.SpellPointsII:
			case Spell.SpellPointsIII:
			case Spell.SpellPointsIV:
			case Spell.SpellPointsV:
			case Spell.AddStrength:
			case Spell.AddIntelligence:
			case Spell.AddDexterity:
			case Spell.AddSpeed:
			case Spell.AddStamina:
			case Spell.AddCharisma:
			case Spell.AddLuck:
			case Spell.AddAntiMagic:
			case Spell.DecreaseAge:
			case Spell.SelfHealing:
				this.PlayHealingAnimation(partyMember, finishAction);
				break;
			default:
				finishAction?.();
				break;
		}
	}

	CastHealingOnPartyMembers(finishAction, partyMembers = null) {
		partyMembers ??= [...this.game.PartyMembers].filter(p => p.Alive);

		for (let i = 0; i < partyMembers.length; ++i)
			this.PlayHealingAnimation(partyMembers[i], i === partyMembers.length - 1 ? finishAction : null);
	}

	/**
	 * This starts the spell animation (e.g. color overlays, starting animation).
	 * If a spell has only a per-target effects, this function does nothing.
	 */
	Play(finishAction) {
		this.finishAction = finishAction;
		const game = this.game;
		const renderView = this.renderView;
		const layout = this.layout;
		const fromMonster = this.fromMonster;
		const targetRow = this.targetRow;

		switch (this.spell) {
			case Spell.HealingHand:
			case Spell.RemoveFear:
			case Spell.RemovePanic:
			case Spell.RemoveShadows:
			case Spell.RemoveBlindness:
			case Spell.RemovePain:
			case Spell.RemoveDisease:
			case Spell.SmallHealing:
			case Spell.RemovePoison:
			case Spell.NeutralizePoison:
			case Spell.MediumHealing:
			case Spell.GreatHealing:
			case Spell.MassHealing:
			case Spell.RemoveRigidness:
			case Spell.RemoveLamedness:
			case Spell.HealAging:
			case Spell.StopAging:
			case Spell.StoneToFlesh:
			case Spell.WakeUp:
			case Spell.RemoveIrritation:
			case Spell.Hurry:
			case Spell.MassHurry:
			case Spell.CreateFood: {
				if (fromMonster) {
					// No effect if monster casts those.
					this.finishAction?.();
				} else {
					// These spells only show some redish falling stars above the portraits.
					const massSpell = getValue(game.SpellInfos, this.spell).Target !== SpellTarget.SingleFriend;

					if (massSpell) {
						const partyMembers = [...(this.battle != null ? this.battle.PartyMembers : game.PartyMembers)].filter(p => p.Alive);

						for (let i = 0; i < partyMembers.length; ++i)
							this.PlayHealingAnimation(partyMembers[i], i === partyMembers.length - 1 ? this.finishAction : null);
					} else {
						// For single target spells this is handled in MoveTo.
						this.finishAction?.();
					}
				}
				break;
			}
			case Spell.SelfHealing:
			case Spell.SelfReviving:
				// Handled in MoveTo
				this.finishAction?.();
				break;
			case Spell.ElementToEarth:
				this.ShowOverlay(Color.EarthOverlay);
				game.AddTimedEvent(250, this.finishAction);
				break;
			case Spell.ElementToWind:
				this.ShowOverlay(Color.WindOverlay);
				game.AddTimedEvent(250, this.finishAction);
				break;
			case Spell.ElementToFire:
				this.ShowOverlay(Color.FireOverlay);
				game.AddTimedEvent(250, this.finishAction);
				break;
			case Spell.ElementToWater:
				this.ShowOverlay(Color.IceOverlay);
				game.AddTimedEvent(250, this.finishAction);
				break;
			case Spell.RestoreStamina:
				// This doesn't seem to have any visual effect.
				this.finishAction?.();
				break;
			case Spell.MagicalShield:
			case Spell.MagicalWall:
			case Spell.MagicalBarrier:
			case Spell.MagicalWeapon:
			case Spell.MagicalAssault:
			case Spell.MagicalAttack:
			case Spell.AntiMagicWall:
			case Spell.AntiMagicSphere:
				// Buffs have no animation at all.
				this.finishAction?.();
				break;
			case Spell.DispellUndead:
			case Spell.DestroyUndead:
			case Spell.HolyWord:
			case Spell.DissolveVictim:
			case Spell.Mudsling:
			case Spell.Rockfall:
			case Spell.Winddevil:
			case Spell.Windhowler:
			case Spell.MagicalProjectile:
			case Spell.MagicalArrows:
			case Spell.LPStealer:
			case Spell.SPStealer:
			case Spell.GhostWeapon:
			case Spell.GhostInferno:
			case Spell.MonsterKnowledge:
			case Spell.RecognizeWeakPoint:
			case Spell.SeeWeaknesses:
			case Spell.KnowledgeOfTheWeakness:
			case Spell.MysticDecay:
				// Those spells use only the MoveTo method.
				this.finishAction?.();
				break;
			case Spell.MagicSwordAttack:
				if (fromMonster) {
					this.finishAction?.();
				} else {
					this.battle.PlayBattleEffectAnimation(BattleEffect.PlayerAttack, this.startPosition, game.CurrentAnimationTicks, this.finishAction);
				}
				break;
			case Spell.ShowMonsterLP:
			case Spell.ShowElements:
			case Spell.ForeseeMagic:
			case Spell.ForeseeAttack:
			case Spell.MysticImitation: {
				if (fromMonster) {
					this.finishAction?.();
				} else {
					const lowerWidth = Global.CombatBackgroundArea.Width;
					const upperWidth = 140;
					const upperXOffset = 92;
					const sourceYOffset = Global.CombatBackgroundArea.Center.Y;
					const targetYOffset = 92;
					const frames = [4, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1, 0];
					const RandomPosition = () => {
						const minX = 32;
						const maxX = Global.CombatBackgroundArea.Right - minX;
						const diffY = 32;
						const minY = sourceYOffset - diffY;
						const maxY = sourceYOffset + diffY;
						return new Position(game.RandomInt(minX, maxX), game.RandomInt(minY, maxY));
					};
					const ShootGreenStar = last => {
						const startPosition = RandomPosition();
						const targetX = upperXOffset + Math.trunc(startPosition.X * upperWidth / lowerWidth);
						const dyFactor = upperWidth / lowerWidth;
						const yDiff = startPosition.Y - sourceYOffset;
						const startScale = game.RandomInt(50, 150) / 100.0;
						const timeAdd = last ? 2 : 0; // last animation should end a bit later as it triggers the finish handler
						const animation = this.AddAnimation(CombatGraphicIndex.GreenStar, frames, startPosition, new Position(targetX, targetYOffset + Util.Round(dyFactor * yDiff) - 8),
							Math.trunc(GameCore.TicksPerSecond * 5 / 2) + timeAdd, startScale, 0.0, 255, last ? null : () => { });
						const Updated = progress => {
							animation.SetDisplayLayer(toByte(Math.min(255, 251 - Util.Round(progress * 250))));
						};
						const Finished = () => {
							animation.AnimationUpdated.remove(Updated);
							animation.AnimationFinished.remove(Finished);
						};
						animation.AnimationUpdated.add(Updated);
						animation.AnimationFinished.add(Finished);
					};
					for (let i = 0; i < 20; ++i)
						ShootGreenStar(i === 19);
				}
				break;
			}
			case Spell.Blink:
			case Spell.Escape:
				// Blink and Flight have no spell animations at all.
				this.finishAction?.();
				break;
			case Spell.Lame:
			case Spell.Poison:
			case Spell.Petrify:
			case Spell.CauseDisease:
			case Spell.CauseAging:
			case Spell.Irritate:
			case Spell.CauseMadness:
			case Spell.Sleep:
			case Spell.Fear:
			case Spell.Blind:
			case Spell.Drug:
				// Curses will only use the MoveTo method.
				this.finishAction?.();
				break;
			case Spell.SpellPointsI:
			case Spell.SpellPointsII:
			case Spell.SpellPointsIII:
			case Spell.SpellPointsIV:
			case Spell.SpellPointsV:
			case Spell.AllHealing:
			case Spell.AddStrength:
			case Spell.AddIntelligence:
			case Spell.AddDexterity:
			case Spell.AddSpeed:
			case Spell.AddStamina:
			case Spell.AddCharisma:
			case Spell.AddLuck:
			case Spell.AddAntiMagic:
			case Spell.Drugs:
			case Spell.ExpExchange:
			case Spell.ProtectionSphere:
				// Those spells will only use the MoveTo method.
				this.finishAction?.();
				break;
			case Spell.Earthslide: {
				const info = renderView.GraphicInfoProvider.GetCombatGraphicInfo(CombatGraphicIndex.Landslide);
				let scale = fromMonster ? 1.333 : renderView.GraphicInfoProvider.GetMonsterRowImageScaleFactor(targetRow);
				const endScale = SpellAnimation.GetScaleXRelativeToCombatArea(info.GraphicInfo.Width, scale * 0.875);
				scale = endScale * 0.4;
				const halfSpriteHeight = Util.Round(0.5 * scale * info.GraphicInfo.Height);
				const targetPosition = Position.op_Subtraction(this.GetTargetPosition(targetRow * 6), new Position(0, halfSpriteHeight));
				targetPosition.X = Global.CombatBackgroundArea.Center.X;
				const startPosition = new Position(targetPosition.X, Math.min(targetPosition.Y - 10, Global.CombatBackgroundArea.Y + halfSpriteHeight));
				const displayLayer = toByte(Math.min(255, targetRow * 60 + 60));
				this.PlayMaterialization(startPosition, CombatGraphicIndex.Landslide, scale, displayLayer, () => {
					const animation = this.AddAnimationThatRemains(CombatGraphicIndex.Landslide, 1, startPosition, targetPosition,
						Math.trunc(GameCore.TicksPerSecond * 3 / 5), scale, endScale, displayLayer);
					animation.ScaleType = BattleAnimation.AnimationScaleType.XOnly;
					animation.ReferenceScale = endScale;
					animation.SetStartFrame(startPosition, endScale);
					const FallingFinished = () => {
						animation.AnimationFinished.remove(FallingFinished);
						game.AddTimedEvent(250, this.finishAction);
					};
					animation.AnimationFinished.add(FallingFinished);
				}, null, endScale, animation => {
					animation.ScaleType = BattleAnimation.AnimationScaleType.XOnly;
					animation.ReferenceScale = scale;
				}, GameCore.TicksPerSecond);
				break;
			}
			case Spell.Earthquake: {
				const position = Position.op_Addition(Global.CombatBackgroundArea.Center, new Position(0, 5));
				const initialScale = 1.85;
				const materializeScale = 3.0;
				const endScale = 4.75;
				this.PlayMaterialization(position, CombatGraphicIndex.Landslide, initialScale, 0, () => {
					game.ShakeScreen(20, 9, 0.035);
					const animation = this.AddAnimationThatRemains(CombatGraphicIndex.Landslide, 1,
						position, Position.op_Addition(position, new Position(0, 14)), Math.trunc(GameCore.TicksPerSecond * 8 / 5),
						materializeScale, endScale, 0);
					animation.ScaleType = BattleAnimation.AnimationScaleType.YOnly;
					animation.SetStartFrame(null, initialScale);
					animation.ScaleType = BattleAnimation.AnimationScaleType.XOnly;
					animation.ReferenceScale = materializeScale;
					animation.SetStartFrame(null, materializeScale);
					const AnimationFinished = () => {
						animation.AnimationUpdated.remove(AnimationUpdated);
						animation.AnimationFinished.remove(AnimationFinished);

						animation.ScaleType = BattleAnimation.AnimationScaleType.None;
						animation.PlayWithoutAnimating(Math.trunc(GameCore.TicksPerSecond / 2), game.CurrentBattleTicks,
							new Position(position.X, Global.CombatBackgroundArea.Bottom), null);
						animation.AnimationFinished.add(() => this.RemoveAnimation(animation));
					};
					const AnimationUpdated = progress => {
						const row = Util.Round(progress * 5.0);
						animation.SetDisplayLayer(toByte(Math.min(255, row * 60)));
					};
					animation.AnimationFinished.add(AnimationFinished);
					animation.AnimationUpdated.add(AnimationUpdated);
				}, null, materializeScale, animation => {
					animation.ScaleType = BattleAnimation.AnimationScaleType.YOnly;
					animation.SetStartFrame(null, initialScale);
					animation.ScaleType = BattleAnimation.AnimationScaleType.XOnly;
					animation.ReferenceScale = initialScale;
				}, GameCore.TicksPerSecond);
				break;
			}
			case Spell.Thunderbolt: {
				const rowPosition = this.GetTargetPosition(targetRow * 6);
				const rowEndPosition = this.GetTargetPosition(targetRow * 6 + 5);
				let numLightnings = 10;
				const PlayLightning = () => {
					const whiteDuration = game.RandomInt(50, 150);
					layout.AddColorFader(Global.CombatBackgroundArea, Color.White, Color.White, whiteDuration, true);
					game.AddTimedEvent(whiteDuration, () => {
						const position = Position.op_Addition(rowPosition, new Position(game.RandomInt(0, rowEndPosition.X - rowPosition.X), 0));
						const endPosition = new Position(Util.Limit(rowPosition.X, position.X + game.RandomInt(-20, 20), rowEndPosition.X), position.Y);
						const scale = 1.5 * (fromMonster ? 2.0 : renderView.GraphicInfoProvider.GetMonsterRowImageScaleFactor(targetRow));
						const displayLayer = fromMonster ? 255 : toByte(targetRow * 60 + 60);
						let duration = Util.Round((250.0 - whiteDuration) * 0.001 * GameCore.TicksPerSecond) >>> 0;
						if (game.CoreConfiguration.BattleSpeed !== 0)
							duration = Util.Round(duration * (2.0 + game.CoreConfiguration.BattleSpeed / 100.0)) >>> 0; // This avoids epileptic shock :D
						this.AddAnimation(CombatGraphicIndex.Lightning, 1, position, endPosition, duration,
							scale, scale, displayLayer, (--numLightnings === 0) ? null : PlayLightning, null,
							BattleAnimation.AnimationScaleType.Both, BattleAnimation.HorizontalAnchor.Center,
							BattleAnimation.VerticalAnchor.Center, game.RandomInt(0, 1) === 0);
					}, true);
				};
				PlayLightning();
				break;
			}
			case Spell.Whirlwind: {
				// If cast by player, whirlwind starts at the bottom right monster position.
				// Then starts at the bottom monster row on the right and proceed upwards starting each row on the right.
				// If cast by monster, whirlwind starts at the upper left battle field position.
				// Then starts with bottom row on the right and proceed on the above row on the right.
				this.lastPosition = fromMonster ? 0 : 4 * 6 - 1;
				const monsterRow = fromMonster ? MonsterRow.Farthest : MonsterRow.Near;
				const displayLayer = fromMonster ? 0 : 180; // Behind row 0 or 3
				this.PlayMaterialization(this.GetTargetPosition(this.lastPosition), CombatGraphicIndex.Whirlwind,
					renderView.GraphicInfoProvider.GetMonsterRowImageScaleFactor(monsterRow) * 1.75, displayLayer, this.finishAction);
				break;
			}
			case Spell.Firebeam:
			case Spell.Fireball: {
				// This only makes the screen red for a brief duration.
				this.ShowOverlay(Color.FireOverlay);
				game.AddTimedEvent(250, this.finishAction);
				break;
			}
			case Spell.Firestorm: {
				this.ShowOverlay(Color.FireOverlay);
				const info = renderView.GraphicInfoProvider.GetCombatGraphicInfo(CombatGraphicIndex.BigFlame);
				const scaleReducePerFlame = 0.225;
				const scale = SpellAnimation.GetScaleYRelativeToCombatArea(info.GraphicInfo.Height, 1.15) *
					(fromMonster ? 1.2 : renderView.GraphicInfoProvider.GetMonsterRowImageScaleFactor(targetRow));
				const AddFlameAnimation = (width, startScale, endScale, startGroundPosition, endGroundPosition, startFrame, duration, finishAction) => {
					// Note: The start frame is also used for the x-offset
					const frames = startFrame === 0 ? range(0, 8) :
						range(startFrame, 8 - startFrame).concat(range(0, startFrame));
					const startXOffset = Math.trunc(startFrame * width * 7 / 12);
					const endXOffset = Math.trunc(startFrame * width * 7 / 12);
					const startHeight = Util.Round(startScale * info.GraphicInfo.Height);
					const halfEndHeight = Util.Round(0.5 * endScale * info.GraphicInfo.Height);
					const startPosition = new Position(startGroundPosition.X + startXOffset, startGroundPosition.Y - Math.trunc(startHeight / 2));
					const endPosition = new Position(endGroundPosition.X + endXOffset, endGroundPosition.Y - halfEndHeight);
					this.AddAnimation(CombatGraphicIndex.BigFlame, frames,
						startPosition, endPosition, duration,
						1.0, endScale / startScale, toByte(Math.min(255, targetRow * 60 + 60)), finishAction,
						new Size(width, startHeight), BattleAnimation.AnimationScaleType.YOnly);
				};
				const combatArea = Global.CombatBackgroundArea;
				const leftPosition = fromMonster ? Layout.GetPlayerSlotTargetPosition(2) : Layout.GetMonsterCombatGroundPosition(renderView, targetRow * 6 + 2);
				const width = Util.Round(scale * info.GraphicInfo.Width * 0.5);
				const primaryDuration = GameCore.TicksPerSecond;
				const secondaryDuration = Math.trunc(GameCore.TicksPerSecond * 5 / 8);
				const endX = leftPosition.X - Math.trunc((combatArea.Right - leftPosition.X) * secondaryDuration / primaryDuration);
				for (let i = 0; i < 4; ++i) {
					const baseScale = scale * (1.0 - i * scaleReducePerFlame);
					const frame = i;

					AddFlameAnimation(width, baseScale, baseScale, new Position(combatArea.Right, leftPosition.Y),
						leftPosition, frame, primaryDuration, () => {
							AddFlameAnimation(width, baseScale, 0.5 * baseScale, leftPosition,
								new Position(endX, leftPosition.Y), frame, secondaryDuration, frame === 3 ? (() => {
									this.HideOverlay();
									this.finishAction?.();
								}) : null);
						});
				}
				break;
			}
			case Spell.Firepillar: {
				this.ShowOverlay(Color.FireOverlay);
				const position = Position.op_Addition(new Position(Global.CombatBackgroundArea.Center), new Position(0, 30));
				const info = renderView.GraphicInfoProvider.GetCombatGraphicInfo(CombatGraphicIndex.BigFlame);
				this.AddAnimation(CombatGraphicIndex.BigFlame, range(0, 16).map(i => i % 8),
					position, position, GameCore.TicksPerSecond * 3, 0.5, 3.5, fromMonster ? 255 : 120,
					() => {
						this.HideOverlay();
						this.finishAction?.();
					}, new Size(Math.trunc(info.GraphicInfo.Width * 3 / 2), info.GraphicInfo.Height), BattleAnimation.AnimationScaleType.Both,
					BattleAnimation.HorizontalAnchor.Center, BattleAnimation.VerticalAnchor.Bottom);
				// TODO: The flame turns black afterwards in original (but it looks ok this way)
				break;
			}
			case Spell.Waterfall:
				// Only uses the MoveTo method.
				this.finishAction?.();
				break;
			case Spell.Iceball: {
				// This only makes the screen blue for a brief duration.
				this.ShowOverlay(Color.IceOverlay);
				game.AddTimedEvent(250, this.finishAction);
				break;
			}
			case Spell.Icestorm: {
				this.ShowOverlay(Color.IceOverlay);
				const info = renderView.GraphicInfoProvider.GetCombatGraphicInfo(CombatGraphicIndex.IceBlock);
				const scaleReducePerIceBlock = 0.225;
				const scale = SpellAnimation.GetScaleYRelativeToCombatArea(info.GraphicInfo.Height, 0.9) *
					(fromMonster ? 1.5 : renderView.GraphicInfoProvider.GetMonsterRowImageScaleFactor(targetRow));
				const AddIceAnimation = (width, startScale, endScale, startGroundPosition, endGroundPosition, index, duration, finishAction) => {
					const frames = [0, 0, 1, 1, 0, 0, 1, 1];
					const startXOffset = Math.trunc(index * width * 7 / 8);
					const endXOffset = Math.trunc(index * width * 7 / 8);
					const startHeight = Util.Round(startScale * info.GraphicInfo.Height);
					const halfEndHeight = Util.Round(0.5 * endScale * info.GraphicInfo.Height);
					const startPosition = new Position(startGroundPosition.X + startXOffset, startGroundPosition.Y - Math.trunc(startHeight / 2));
					const endPosition = new Position(endGroundPosition.X + endXOffset, endGroundPosition.Y - halfEndHeight);
					this.AddAnimation(CombatGraphicIndex.IceBlock, frames,
						startPosition, endPosition, duration,
						1.0, endScale / startScale, toByte(Math.min(255, targetRow * 60 + 60)), finishAction,
						new Size(width, startHeight), BattleAnimation.AnimationScaleType.YOnly);
				};
				const combatArea = Global.CombatBackgroundArea;
				const leftPosition = fromMonster ? Layout.GetPlayerSlotCenterPosition(2) : Layout.GetMonsterCombatGroundPosition(renderView, targetRow * 6 + 2);
				const width = Util.Round(scale * info.GraphicInfo.Width * 0.5);
				const primaryDuration = GameCore.TicksPerSecond;
				const secondaryDuration = Math.trunc(GameCore.TicksPerSecond * 5 / 8);
				const endX = leftPosition.X - Math.trunc((combatArea.Right - leftPosition.X) * secondaryDuration / primaryDuration);
				for (let i = 0; i < 4; ++i) {
					const baseScale = scale * (1.0 - i * scaleReducePerIceBlock);
					const frame = i;
					AddIceAnimation(width, baseScale, baseScale, new Position(combatArea.Right, leftPosition.Y),
						leftPosition, frame, primaryDuration, () => {
							AddIceAnimation(width, baseScale, 0.5 * baseScale, leftPosition,
								new Position(endX, leftPosition.Y), frame, secondaryDuration, frame === 3 ? (() => {
									this.HideOverlay();
									this.finishAction?.();
								}) : null);
						});
				}
				break;
			}
			case Spell.Iceshower: {
				this.ShowOverlay(Color.IceOverlay);
				const lowerWidth = Global.CombatBackgroundArea.Width;
				const upperWidth = 140;
				const upperXOffset = 92;
				const sourceYOffset = fromMonster ? 92 : Global.CombatBackgroundArea.Center.Y;
				const targetYOffset = fromMonster ? Global.CombatBackgroundArea.Center.Y : 92;
				const RandomPosition = () => {
					const minX = fromMonster ? upperXOffset + 16 : 32;
					const maxX = Global.CombatBackgroundArea.Right - minX;
					const diffY = fromMonster ? Math.trunc(upperWidth * 32 / lowerWidth) : 32;
					const minY = sourceYOffset - diffY;
					const maxY = sourceYOffset + diffY;
					return new Position(game.RandomInt(minX, maxX), game.RandomInt(minY, maxY));
				};
				const ShootIceBall = last => {
					const startPosition = RandomPosition();
					const targetX = fromMonster ? Math.trunc((startPosition.X - upperXOffset) * lowerWidth / upperWidth)
						: upperXOffset + Math.trunc(startPosition.X * upperWidth / lowerWidth);
					const dyFactor = fromMonster ? lowerWidth / upperWidth : upperWidth / lowerWidth;
					const yDiff = startPosition.Y - sourceYOffset;
					const startScale = fromMonster ? 0.0 : 1.5;
					const endScale = fromMonster ? 1.5 : 0.0;
					const timeAdd = last ? 2 : 0; // last animation should end a bit later as it triggers the finish handler
					const animation = this.AddAnimation(CombatGraphicIndex.IceBall, 1, startPosition, new Position(targetX, targetYOffset + Util.Round(dyFactor * yDiff)),
						GameCore.TicksPerSecond * 2 + timeAdd, startScale, endScale, 255, () => { if (last) { this.HideOverlay(); this.finishAction?.(); } });
					const Updated = progress => {
						const displayLayerBase = Util.Round(progress * 250);
						animation.SetDisplayLayer(toByte(Math.min(255, fromMonster ? displayLayerBase : 251 - displayLayerBase)));
					};
					const Finished = () => {
						animation.AnimationUpdated.remove(Updated);
						animation.AnimationFinished.remove(Finished);
					};
					animation.AnimationUpdated.add(Updated);
					animation.AnimationFinished.add(Finished);
				};
				for (let i = 0; i < 8; ++i)
					ShootIceBall(i === 7);
				break;
			}
			default:
				throw new AmbermoonException(ExceptionScope.Application, `The spell ${enumName(Spell, this.spell)} can not be rendered during a fight.`);
		}
	}

	PlayMaterialization(position, combatGraphicIndex, scale, displayLayer, finishAction, endPosition = null, endScale = null,
		setupAnimation = null, duration = Math.trunc(GameCore.TicksPerSecond * 3 / 4)) {
		// Materialize some sprite
		// It used the following color sequence which is encoded in palette 52 at index 1-6:
		// Black -> dark red -> light purple -> dark purple -> dark beige -> light beige.
		// See materializeColorIndices above.
		const paletteIndex = toByte(this.renderView.GraphicInfoProvider.PrimaryUIPaletteIndex + 1);
		const animation = this.AddMaskedAnimation(combatGraphicIndex, position, endPosition ?? position, duration,
			scale, endScale ?? scale, displayLayer, finishAction, materializeColorIndices, paletteIndex);
		setupAnimation?.(animation);
	}

	/**
	 * Called after the whole spell cast is over.
	 * Some spells like Earthslide needs after-spell animations.
	 */
	PostCast(finishedAction) {
		const animations = this.animations;
		const renderView = this.renderView;

		if (this.spell === Spell.Earthslide) {
			if (animations.length !== 1)
				throw new AmbermoonException(ExceptionScope.Application, 'Earthslide spell has wrong animation count.');

			animations[0].AnimationFinished.add(() => {
				this.RemoveAnimation(animations[0], false); // Remove when finished
				finishedAction?.();
			});
			const info = renderView.GraphicInfoProvider.GetCombatGraphicInfo(CombatGraphicIndex.Landslide);
			let scale = this.fromMonster ? 2.0 : renderView.GraphicInfoProvider.GetMonsterRowImageScaleFactor(this.targetRow);
			scale = SpellAnimation.GetScaleXRelativeToCombatArea(info.GraphicInfo.Width, scale * 0.85);
			scale *= 0.4;
			animations[0].AnchorY = BattleAnimation.VerticalAnchor.Bottom;
			animations[0].ScaleType = BattleAnimation.AnimationScaleType.YOnly;
			animations[0].ReferenceScale = scale;
			animations[0].SetStartFrame(null, scale);
			animations[0].PlayWithoutAnimating(Math.trunc(GameCore.TicksPerSecond / 2), this.game.CurrentBattleTicks, null, 0.0);
		} else if (this.spell === Spell.Whirlwind) {
			if (animations.length !== 1)
				throw new AmbermoonException(ExceptionScope.Application, 'Whirlwind spell has wrong animation count.');

			animations[0].AnimationFinished.add(() => {
				this.RemoveAnimation(animations[0], false); // Remove when finished
				finishedAction?.();
			});
			const info = renderView.GraphicInfoProvider.GetCombatGraphicInfo(CombatGraphicIndex.Whirlwind);
			const scale = animations[0].Scale;
			animations[0].AnchorY = BattleAnimation.VerticalAnchor.Bottom;
			animations[0].ScaleType = BattleAnimation.AnimationScaleType.Both;
			animations[0].ReferenceScale = scale;
			animations[0].SetStartFrame(null, scale);
			animations[0].PlayWithoutAnimating(Math.trunc(GameCore.TicksPerSecond / 3), this.game.CurrentBattleTicks, null, 0.0);
		} else {
			// Ensure all remaining animations are cleaned up.
			for (let i = animations.length - 1; i >= 0; --i)
				this.RemoveAnimation(animations[i], false);
			finishedAction?.();
		}
	}

	/**
	 * Moves a spell to a given target represented by a tile.
	 *
	 * The finish actions takes 3 arguments (delegate MoveToFinishAction(uint ticks, bool playHurtAnimation, bool finish)):
	 * - The battle ticks when invoking (used for starting the hurt animation)
	 * - A bool which specifies if the hurt animation should be played
	 * - A bool which specifies if the caller should treat the spell movement as finished
	 */
	MoveTo(tile, finishAction) {
		const game = this.game;
		const renderView = this.renderView;
		const layout = this.layout;
		const battle = this.battle;
		const spell = this.spell;
		const fromMonster = this.fromMonster;
		const targetRow = this.targetRow;

		this.finishAction = () => finishAction?.(game.CurrentBattleTicks, true, true);

		const PlayParticleEffect = (combatGraphicIndex, frameCount, displayLayer = 255) => {
			const position = Position.op_Subtraction(this.GetTargetPosition(tile), new Position(2, 0));
			if (position.Y > Global.CombatBackgroundArea.Bottom - 6)
				position.Y = Global.CombatBackgroundArea.Bottom - 6;
			this.AddAnimation(combatGraphicIndex, frameCount, position, Position.op_Subtraction(position, new Position(0, 6)), Math.trunc(GameCore.TicksPerSecond / 4), 1, 1, displayLayer,
				() => {
					position.X += 6;
					position.Y += 6;
					this.AddAnimation(combatGraphicIndex, frameCount, position, Position.op_Subtraction(position, new Position(0, 6)), Math.trunc(GameCore.TicksPerSecond / 4), 1, 1, displayLayer,
						() => {
							position.X -= 12;
							position.Y -= 4;
							this.AddAnimation(combatGraphicIndex, frameCount, position, Position.op_Subtraction(position, new Position(0, 6)), Math.trunc(GameCore.TicksPerSecond / 4), 1, 1, displayLayer);
						});
				});
		};

		// Used by fire spells
		const PlayBurn = () => {
			PlayParticleEffect(CombatGraphicIndex.SmallFlame, 6, toByte(fromMonster ? 255 : Math.trunc(tile / 6) * 60 + 60));
		};

		// Used for ice spells
		const PlayChill = () => {
			PlayParticleEffect(CombatGraphicIndex.SnowFlake, 5, toByte(fromMonster ? 255 : Math.trunc(tile / 6) * 60 + 60));
		};

		// Used for monster knowledge
		const PlayKnowledge = () => {
			game.StartSequence();
			const count = 8;
			const basePosition = Position.op_Addition(this.GetTargetPosition(tile), new Position(0, 18));
			const displayLayer = toByte(fromMonster ? 255 : Math.trunc(tile / 6) * 60 + 60);

			const Finish = () => {
				game.EndSequence();
				this.finishAction?.();
			};

			const ignore = () => { };
			let ticks = game.CurrentBattleTicks;

			for (let i = 0; i < count; ++i) {
				const index = i;
				const position = Position.op_Addition(basePosition, new Position(game.RandomInt(0, 32) - 16, -2 * index));
				// C# overload AddAnimation(..., Action finishAction, uint customStartTicks) expanded to the full overload
				this.AddAnimation(CombatGraphicIndex.GreenStar, range(0, 5), position, new Position(position.X, position.Y - 38),
					Math.trunc(GameCore.TicksPerSecond * 7 / 10), 1.0, 1.2, displayLayer, index === count - 1 ? Finish : ignore,
					null, BattleAnimation.AnimationScaleType.Both, BattleAnimation.HorizontalAnchor.Center,
					BattleAnimation.VerticalAnchor.Center, false, 17, null, true, ticks);
				ticks += Math.trunc((GameCore.TicksPerSecond * 50) / 1000);
			}
		};

		// Used for all curses
		const PlayCurse = iconGraphicIndex => {
			if (!battle.CheckSpell(battle.GetCharacterAt(this.startPosition), battle.GetCharacterAt(tile), spell, null, false, false, false)) {
				this.finishAction?.();
			} else {
				// Note: The hurt animation comes first so we immediately call the passed finish action
				// which will display the hurt animation.
				finishAction?.(game.CurrentBattleTicks, true, false); // Play hurt animation but do not finish.
				this.finishAction = () => finishAction?.(game.CurrentBattleTicks, false, true); // This is called after the animation to finish.

				const scale = fromMonster ? 2.0 : renderView.GraphicInfoProvider.GetMonsterRowImageScaleFactor(Math.trunc(tile / 6));
				const targetPosition = Position.op_Subtraction(this.GetTargetPosition(tile), new Position(0, Util.Round(6 * scale)));
				game.AddTimedEvent(500, () => {
					const AddCurseAnimation = (graphicIndex, finishAction, reverse, displayLayer) => {
						this.AddAnimation(graphicIndex, 1, targetPosition, targetPosition, reverse ? Math.trunc(GameCore.TicksPerSecond / 4) : Math.trunc(GameCore.TicksPerSecond / 2),
							reverse ? scale : 0.0, reverse ? 0.5 * scale : scale, displayLayer, finishAction);
					};
					const displayLayerRing = toByte(fromMonster ? 254 : (Math.trunc(tile / 6) * 60 + 60));
					const displayLayer = toByte(displayLayerRing + 1);
					AddCurseAnimation(CombatGraphicIndex.RedRing, () => { }, false, displayLayerRing);
					AddCurseAnimation(iconGraphicIndex, () => {
						AddCurseAnimation(CombatGraphicIndex.RedRing, () => { }, true, displayLayerRing);
						AddCurseAnimation(iconGraphicIndex, null, true, displayLayer); // This will trigger the outer finish action
					}, false, displayLayer);
				});
			}
		};

		// Used for Anti-undead spells
		const PlayHolyLight = () => {
			// Should always be a monster but just in case we check here.
			const monster = battle.GetCharacterAt(tile);
			if (monster instanceof Monster &&
				battle.CheckSpell(battle.GetCharacterAt(this.startPosition), monster, spell, null, false, false, false)) {
				const position = Position.op_Addition(this.GetTargetPosition(tile), new Position(0, 4));
				const beamHeight = 8 + position.Y - Global.CombatBackgroundArea.Top;
				// Note: Positions are ground-based (anchor at the bottom).
				let startPosition = new Position(position.X, Global.CombatBackgroundArea.Top - Math.trunc(beamHeight / 2));
				const endPosition = new Position(position.X, position.Y - Math.trunc(beamHeight / 2));
				const displayLayer = toByte(Math.trunc(tile / 6) * 60); // Show behind the monsters
				const rowScale = renderView.GraphicInfoProvider.GetMonsterRowImageScaleFactor(Math.trunc(tile / 6));
				const beamWidth = Util.Round(rowScale * monster.MappedFrameWidth);
				this.AddAnimation(CombatGraphicIndex.HolyBeam, 1, startPosition, endPosition, Math.trunc(GameCore.TicksPerSecond * 3 / 2), 1, 1, displayLayer, () => {
					startPosition = new Position(endPosition);
					const diff = endPosition.Y - Global.CombatBackgroundArea.Top;
					endPosition.Y = Global.CombatBackgroundArea.Top;
					const monsterEndPosition = new Position(endPosition.X, Layout.GetMonsterCombatCenterPosition(renderView, tile, monster).Y - diff);

					// Move monster to heavens
					battle.StartMonsterAnimation(monster, animation => {
						animation.ScaleType = BattleAnimation.AnimationScaleType.XOnly;
						const hurtFrames = monster.GetAnimationFrameIndices(MonsterAnimationType.Hurt);
						animation.Play(hurtFrames, Math.trunc(Math.trunc(GameCore.TicksPerSecond * 3 / 4) / hurtFrames.length), game.CurrentBattleTicks, monsterEndPosition, 0.0);
					}, animation => animation.ScaleType = BattleAnimation.AnimationScaleType.Both);
					// And fade out beam too
					this.AddAnimation(CombatGraphicIndex.HolyBeam, 1, startPosition, endPosition, Math.trunc(GameCore.TicksPerSecond * 3 / 4), 1, 0, displayLayer, null,
						new Size(beamWidth, beamHeight), BattleAnimation.AnimationScaleType.XOnly);
				}, new Size(beamWidth, beamHeight));
			} else {
				this.finishAction?.();
			}
		};

		// Used for Winddevil, Windhowler and Whirlwind
		const PlayWhirlwind = (startTile, materialize, finishAction = null) => {
			const info = renderView.GraphicInfoProvider.GetCombatGraphicInfo(CombatGraphicIndex.Whirlwind);
			const baseScale = spell === Spell.Winddevil ? 1.25 : 1.75;
			const startScale = baseScale * (fromMonster && startTile >= 18 ? 1.75 : renderView.GraphicInfoProvider.GetMonsterRowImageScaleFactor(Math.trunc(startTile / 6)));
			const endScale = baseScale * (fromMonster ? 1.75 : renderView.GraphicInfoProvider.GetMonsterRowImageScaleFactor(Math.trunc(tile / 6)));
			const displayLayer = toByte(Math.min(255, Math.trunc(startTile / 6) * 60));
			const endDisplayLayer = toByte(Math.min(255, Math.trunc(tile / 6) * 60));
			const GetDiffDurationFactor = () => {
				const diffRow = Math.abs(Math.trunc(tile / 6) - Math.trunc(startTile / 6));
				if (diffRow !== 0)
					return 0.5 + diffRow * 0.25;
				else {
					const diffColumn = Math.abs(tile % 6 - startTile % 6);

					if (diffColumn === 0)
						return 1.0;

					return diffColumn * 0.2;
				}
			};
			let durationFactor;
			switch (spell) {
				case Spell.Winddevil: durationFactor = 2.0; break;
				case Spell.Windhowler: durationFactor = 2.5; break;
				default: durationFactor = GetDiffDurationFactor(); break;
			}
			const framesPerDuration = spell === Spell.Whirlwind ? 12 : 8;
			const duration = Util.Round(GameCore.TicksPerSecond * durationFactor);
			const frames = range(0, Util.Round(durationFactor * framesPerDuration)).map(i => i % 4);
			const startPosition = this.GetTargetPosition(startTile);
			const endPosition = this.GetTargetPosition(tile);
			const Finished = () => {
				if (spell === Spell.Whirlwind)
					finishAction?.();
				else {
					this.AddAnimation(CombatGraphicIndex.Whirlwind, 1, endPosition, endPosition, Math.trunc(GameCore.TicksPerSecond / 3), endScale, 0.0, endDisplayLayer,
						finishAction, null, BattleAnimation.AnimationScaleType.Both, BattleAnimation.HorizontalAnchor.Center, BattleAnimation.VerticalAnchor.Bottom);
				}
			};
			const PlayAnimation = () => {
				const animation = spell === Spell.Whirlwind && startTile === tile
					? this.AddAnimationThatRemains(CombatGraphicIndex.Whirlwind, frames,
						startPosition, endPosition, duration >>> 0, startScale, endScale, displayLayer, Finished)
					: this.AddAnimation(CombatGraphicIndex.Whirlwind, frames,
						startPosition, endPosition, duration >>> 0, startScale, endScale, displayLayer, Finished);
				const monster = startTile === tile ? battle.GetCharacterAt(tile) : null;
				if (startTile === tile && monster instanceof Monster) {
					let remainingTicks = duration;
					const TimePerScaling = Math.trunc(GameCore.TicksPerSecond / 2);
					const baseScale = renderView.GraphicInfoProvider.GetMonsterRowImageScaleFactor(Math.trunc(tile / 6));
					const basePosition = Layout.GetMonsterCombatCenterPosition(renderView, tile, monster);
					const hurtFrames = monster.GetAnimationFrameIndices(MonsterAnimationType.Hurt);
					const PlayScale = additionalScale => {
						battle.StartMonsterAnimation(monster, animation => {
							remainingTicks -= TimePerScaling;
							const yOffset = Util.Round((16 * (1.0 + additionalScale) - 16) * baseScale);
							animation.Play(hurtFrames, Math.trunc(TimePerScaling / hurtFrames.length), game.CurrentBattleTicks,
								Position.op_Subtraction(basePosition, new Position(0, yOffset)), baseScale * (1.0 + additionalScale));
						}, _ => {
							if (remainingTicks > 0) {
								PlayScale(0.2 - additionalScale);
							} else {
								const monsterAnimation = layout.GetMonsterBattleAnimation(monster);
								monsterAnimation.SetStartFrame(basePosition, baseScale);
								monsterAnimation.Reset();
							}
						});
					};
					PlayScale(0.2);
				}
				if (endDisplayLayer !== displayLayer) {
					const UpdateDisplayLayer = progress => {
						const newDisplayLayer = toByte(Util.Limit(0, Util.Round(displayLayer + (endDisplayLayer - displayLayer) * progress), 255));
						animation.SetDisplayLayer(newDisplayLayer);
					};
					const AnimationFinished = () => {
						animation.AnimationUpdated.remove(UpdateDisplayLayer);
						animation.AnimationFinished.remove(AnimationFinished);
					};
					animation.AnimationUpdated.add(UpdateDisplayLayer);
					animation.AnimationFinished.add(AnimationFinished);
				}
			};
			if (materialize)
				this.PlayMaterialization(startPosition, CombatGraphicIndex.Whirlwind, startScale, displayLayer, PlayAnimation);
			else
				PlayAnimation();
		};

		switch (spell) {
			case Spell.HealingHand:
			case Spell.RemoveFear:
			case Spell.RemoveShadows:
			case Spell.RemovePain:
			case Spell.SmallHealing:
			case Spell.RemovePoison:
			case Spell.MediumHealing:
			case Spell.GreatHealing:
			case Spell.RemoveRigidness:
			case Spell.HealAging:
			case Spell.StoneToFlesh:
			case Spell.WakeUp:
			case Spell.RemoveIrritation:
			case Spell.Hurry:
			case Spell.SpellPointsI:
			case Spell.SpellPointsII:
			case Spell.SpellPointsIII:
			case Spell.SpellPointsIV:
			case Spell.SpellPointsV:
			case Spell.AllHealing:
			case Spell.AddStrength:
			case Spell.AddIntelligence:
			case Spell.AddDexterity:
			case Spell.AddSpeed:
			case Spell.AddStamina:
			case Spell.AddCharisma:
			case Spell.AddLuck:
			case Spell.AddAntiMagic:
			case Spell.Drugs:
			case Spell.SelfHealing:
			case Spell.SelfReviving:
			case Spell.ExpExchange:
			case Spell.ProtectionSphere:
				if (fromMonster) {
					// No visual effect if monster casts it.
					this.finishAction?.();
				} else {
					const partyMember = battle.GetCharacterAt(tile);
					this.CastOn(spell, partyMember instanceof PartyMember ? partyMember : null, this.finishAction);
				}
				break;
			case Spell.RemovePanic:
			case Spell.RemoveBlindness:
			case Spell.RemoveDisease:
			case Spell.NeutralizePoison:
			case Spell.MassHealing:
			case Spell.RemoveLamedness:
			case Spell.StopAging:
				// Mass healing spells are handled in Play.
				this.finishAction?.();
				break;
			case Spell.DispellUndead:
			case Spell.DestroyUndead:
			case Spell.HolyWord:
				PlayHolyLight();
				break;
			case Spell.RestoreStamina:
				// No visual effect.
				this.finishAction?.();
				break;
			case Spell.GhostWeapon:
			case Spell.GhostInferno: {
				const info = renderView.GraphicInfoProvider.GetCombatGraphicInfo(CombatGraphicIndex.BigFlame);
				const monsterRow = fromMonster ? Math.trunc(this.startPosition / 6) : Math.trunc(tile / 6);
				const startScale = 3.0;
				const endScale = renderView.GraphicInfoProvider.GetMonsterRowImageScaleFactor(monsterRow) * 1.5;
				const startPosition = this.GetSourcePosition();
				const endPosition = this.GetTargetPosition(tile);
				const maxStartOffset = Util.Round(0.75 * startScale * info.GraphicInfo.Width);
				const maxEndOffset = Util.Round(0.75 * endScale * info.GraphicInfo.Width);
				const maxOffset = Math.max(maxStartOffset, maxEndOffset);
				let xOffset = Math.trunc((startPosition.X - endPosition.X) / 8);
				xOffset = xOffset < -maxOffset ? -maxOffset :
					(xOffset > maxOffset ? maxOffset : xOffset);
				const startXOffset = Util.Round(0.5 * xOffset * startScale);
				const endXOffset = Util.Round(0.5 * xOffset * endScale);
				let scaleFactor = 1.0;
				this.AddAnimation(CombatGraphicIndex.BigFlame, 8, startPosition, endPosition,
					BattleEffects.GetFlyDuration(this.startPosition, tile),
					scaleFactor * (fromMonster ? endScale : startScale),
					scaleFactor * (fromMonster ? startScale : endScale), 252, () => { }, 19);
				scaleFactor = 0.975;
				const startOffset = new Position(Util.Round(scaleFactor * startXOffset), 4);
				const endOffset = new Position(Util.Round(scaleFactor * endXOffset), 4);
				this.AddAnimation(CombatGraphicIndex.BigFlame, 8, Position.op_Addition(startPosition, startOffset), Position.op_Addition(endPosition, endOffset),
					BattleEffects.GetFlyDuration(this.startPosition, tile),
					scaleFactor * (fromMonster ? endScale : startScale),
					scaleFactor * (fromMonster ? startScale : endScale), 253, () => { }, 19);
				scaleFactor = 0.95;
				startOffset.X += Util.Round(scaleFactor * startXOffset);
				endOffset.X += Util.Round(scaleFactor * endXOffset);
				startOffset.Y += 3;
				endOffset.Y += 3;
				this.AddAnimation(CombatGraphicIndex.BigFlame, 8, Position.op_Addition(startPosition, startOffset), Position.op_Addition(endPosition, endOffset),
					BattleEffects.GetFlyDuration(this.startPosition, tile),
					scaleFactor * (fromMonster ? endScale : startScale),
					scaleFactor * (fromMonster ? startScale : endScale), 254, () => { }, 19);
				scaleFactor = 0.925;
				startOffset.X += Util.Round(scaleFactor * startXOffset);
				endOffset.X += Util.Round(scaleFactor * endXOffset);
				startOffset.Y += 2;
				endOffset.Y += 2;
				this.AddAnimation(CombatGraphicIndex.BigFlame, 8, Position.op_Addition(startPosition, startOffset), Position.op_Addition(endPosition, endOffset),
					BattleEffects.GetFlyDuration(this.startPosition, tile),
					scaleFactor * (fromMonster ? endScale : startScale),
					scaleFactor * (fromMonster ? startScale : endScale), 255, () => { this.HideOverlay(); PlayBurn(); }, 19);
				break;
			}
			case Spell.Blink:
			case Spell.Escape:
				// Blink and Flight have no spell animations at all.
				this.finishAction?.();
				break;
			case Spell.MagicalShield:
			case Spell.MagicalWall:
			case Spell.MagicalBarrier:
			case Spell.MagicalWeapon:
			case Spell.MagicalAssault:
			case Spell.MagicalAttack:
			case Spell.AntiMagicWall:
			case Spell.AntiMagicSphere:
			case Spell.MassHurry:
			case Spell.ShowMonsterLP:
			case Spell.ShowElements:
			case Spell.ForeseeMagic:
			case Spell.ForeseeAttack:
				// Buffs are handled in Play.
				this.finishAction?.();
				break;
			case Spell.MonsterKnowledge:
			case Spell.MysticImitation:
			case Spell.RecognizeWeakPoint:
			case Spell.SeeWeaknesses:
			case Spell.KnowledgeOfTheWeakness:
			case Spell.ElementToEarth:
			case Spell.ElementToWind:
			case Spell.ElementToFire:
			case Spell.ElementToWater:
				PlayKnowledge();
				break;
			case Spell.LPStealer:
			case Spell.SPStealer:
			case Spell.MysticDecay:
			case Spell.MagicSwordAttack: {
				// Note: The hurt animation comes first so we immediately call the passed finish action
				// which will display the hurt animation.
				finishAction?.(game.CurrentBattleTicks, true, false); // Play hurt animation but do not finish.
				this.finishAction = () => finishAction?.(game.CurrentBattleTicks, false, true); // This is called after the animation to finish.

				const endScale = renderView.GraphicInfoProvider.GetMonsterRowImageScaleFactor(Math.trunc(tile / 6));
				game.AddTimedEvent(500, () => {
					const displayLayer = toByte(fromMonster ? 255 : (Math.trunc(tile / 6) * 60 + 60));
					this.AddAnimation(spell === Spell.LPStealer ? CombatGraphicIndex.BlueBeam : CombatGraphicIndex.GreenBeam, 1,
						this.GetTargetPosition(tile), this.GetSourcePosition(), BattleEffects.GetFlyDuration(tile, this.startPosition),
						fromMonster ? 2.5 : endScale, fromMonster ? endScale : 2.5, displayLayer);
				});
				break;
			}
			case Spell.MagicalProjectile:
			case Spell.MagicalArrows: {
				// Both spells use the same animation. For magical arrows it is just called multiple times.
				const monsterRow = fromMonster ? Math.trunc(this.startPosition / 6) : Math.trunc(tile / 6);
				const endScale = renderView.GraphicInfoProvider.GetMonsterRowImageScaleFactor(monsterRow);
				const graphic = fromMonster ? CombatGraphicIndex.MagicProjectileMonster : CombatGraphicIndex.MagicProjectileHuman;
				const sourcePosition = this.GetSourcePosition();
				const targetPosition = this.GetTargetPosition(tile);
				const mirrorX = targetPosition.X < sourcePosition.X;
				const rowDist = Math.abs(Math.trunc(this.startPosition / 6) - Math.trunc(tile / 6));
				const perspectiveScaleFactor = fromMonster ? 1.0 : Util.Limit(0.5, Math.abs(targetPosition.X - sourcePosition.X) / 48.0 - rowDist * 0.1, 1.0);

				const Shoot = () => {
					const frames = fromMonster ? range(0, 12) : range(16, 8);
					this.AddAnimation(graphic, frames, sourcePosition, targetPosition,
						Math.max(Math.trunc(GameCore.TicksPerSecond / 10), Math.trunc(Math.min(280, Math.abs(targetPosition.X - sourcePosition.X) + rowDist * 50) * GameCore.TicksPerSecond / 560)),
						fromMonster ? endScale : 1.0, fromMonster ? 1.0 : Math.min(endScale, perspectiveScaleFactor), 255, null, null,
						fromMonster || perspectiveScaleFactor >= endScale ? BattleAnimation.AnimationScaleType.Both : BattleAnimation.AnimationScaleType.XOnly,
						BattleAnimation.HorizontalAnchor.Center, BattleAnimation.VerticalAnchor.Center, mirrorX);
				};

				if (!fromMonster) {
					this.AddAnimation(graphic, fromMonster ? 12 : 17, sourcePosition, sourcePosition,
						Math.trunc(GameCore.TicksPerSecond * 5 / 6), 1.0, 1.0, 255, Shoot, null,
						BattleAnimation.AnimationScaleType.None, BattleAnimation.HorizontalAnchor.Center, BattleAnimation.VerticalAnchor.Center,
						mirrorX);
				} else {
					Shoot();
				}
				break;
			}
			case Spell.Lame:
				PlayCurse(CombatGraphicIndex.IconParalyze);
				break;
			case Spell.Poison:
				PlayCurse(CombatGraphicIndex.IconPoison);
				break;
			case Spell.Petrify:
				PlayCurse(CombatGraphicIndex.IconPetrify);
				break;
			case Spell.CauseDisease:
				PlayCurse(CombatGraphicIndex.IconDisease);
				break;
			case Spell.CauseAging:
				PlayCurse(CombatGraphicIndex.IconAging);
				break;
			case Spell.Irritate:
				PlayCurse(CombatGraphicIndex.IconIrritation);
				break;
			case Spell.CauseMadness:
				PlayCurse(CombatGraphicIndex.IconMadness);
				break;
			case Spell.Sleep:
				PlayCurse(CombatGraphicIndex.IconSleep);
				break;
			case Spell.Fear:
				PlayCurse(CombatGraphicIndex.IconPanic);
				break;
			case Spell.Blind:
				PlayCurse(CombatGraphicIndex.IconBlind);
				break;
			case Spell.Drug:
				PlayCurse(CombatGraphicIndex.IconDrugs);
				break;
			case Spell.DissolveVictim: {
				const target = battle.GetCharacterAt(tile);
				if (!battle.CheckSpell(battle.GetCharacterAt(this.startPosition), target, spell, null, false, false, false)) {
					this.finishAction?.();
				} else {
					const row = Math.trunc(tile / 6);
					const position = this.GetTargetPosition(tile);
					const ShowParticle = () => {
						this.AddAnimation(CombatGraphicIndex.GreenStar, 5, position, Position.op_Subtraction(position, new Position(0, 4)), Math.trunc(GameCore.TicksPerSecond / 5), 1, 1, 255,
							() => finishAction?.(game.CurrentBattleTicks, false, true));
					};
					if (target instanceof Monster) {
						const monster = target;
						// Shrink monster to zero
						battle.StartMonsterAnimation(monster, animation =>
							animation.PlayWithoutAnimating(GameCore.TicksPerSecond, game.CurrentBattleTicks, position, 0.0),
						_ => ShowParticle());
					} else {
						ShowParticle();
					}
				}
				break;
			}
			case Spell.Mudsling:
			case Spell.Rockfall: {
				const info = renderView.GraphicInfoProvider.GetCombatGraphicInfo(CombatGraphicIndex.LargeStone);
				const baseScale = spell === Spell.Mudsling ? 1.0 : 1.5;
				const monsterScale = renderView.GraphicInfoProvider.GetMonsterRowImageScaleFactor(Math.trunc(tile / 6));
				const rowScale = fromMonster ? 2.0 : monsterScale;
				const scale = baseScale * rowScale;
				const spellSpriteHeight = Util.Round(info.GraphicInfo.Height * scale);
				const headPosition = this.GetTargetPosition(tile);
				const fallHeight = Util.Round(16.0 * rowScale);
				const startPosition = Position.op_Subtraction(headPosition, new Position(0, fallHeight));
				const displayLayer = toByte(Math.min(255, targetRow * 60 + 60));
				this.PlayMaterialization(startPosition, CombatGraphicIndex.LargeStone, scale, displayLayer, () => {
					// Play fall animation
					this.AddAnimation(CombatGraphicIndex.LargeStone, 1, startPosition, headPosition, Math.trunc(GameCore.TicksPerSecond / 4),
						scale, scale, displayLayer, () => {
							const monster = battle.GetCharacterAt(tile);
							if (monster instanceof Monster) {
								const squashFactor = 0.8;
								const squashAmount = Util.Round(monster.MappedFrameHeight * monsterScale * (1.0 - squashFactor));
								const duration = Math.trunc(GameCore.TicksPerSecond / 5);
								const squashRockPosition = Position.op_Addition(headPosition, new Position(0, squashAmount));
								// Squash monster ...
								battle.StartMonsterAnimation(monster, animation => {
									animation.AnchorY = BattleAnimation.VerticalAnchor.Bottom;
									animation.ScaleType = BattleAnimation.AnimationScaleType.YOnly;
									animation.ReferenceScale = monsterScale;
									animation.PlayWithoutAnimating(duration, game.CurrentBattleTicks, null, squashFactor * monsterScale);
								}, null);
								// ... and let the rock fall a bit more
								this.AddAnimation(CombatGraphicIndex.LargeStone, 1, headPosition, squashRockPosition,
									duration, scale, scale, displayLayer, () => {
										// Un-squash monster ...
										battle.StartMonsterAnimation(monster, animation => {
											animation.PlayWithoutAnimating(duration, game.CurrentBattleTicks, null, monsterScale);
										}, animation => {
											animation.AnchorY = BattleAnimation.VerticalAnchor.Center;
											animation.ScaleType = BattleAnimation.AnimationScaleType.Both;
											animation.ReferenceScale = 1.0;
										});
										// ... and let the rock rebounce up a bit
										this.AddAnimation(CombatGraphicIndex.LargeStone, 1, squashRockPosition, headPosition,
											duration, scale, scale, displayLayer); // This will invoke the finish action automatically.
									}
								);
							} else {
								this.finishAction?.();
							}
						}
					);
				});

				break;
			}
			case Spell.Earthslide:
			case Spell.Earthquake:
				// Just hurt each monster.
				this.finishAction?.();
				break;
			case Spell.Winddevil:
			case Spell.Windhowler: {
				PlayWhirlwind(tile, true);
				break;
			}
			case Spell.Thunderbolt:
				// Just hurt each monster.
				this.finishAction?.();
				break;
			case Spell.Whirlwind: {
				if (this.animations.length !== 0) {
					this.RemoveAnimation(this.animations[0], false);
					this.animations.length = 0;
				}
				const Play = () => {
					PlayWhirlwind(tile, false, () => {
						this.lastPosition = tile;
						this.finishAction?.();
					});
				};
				if (tile === this.lastPosition) // The very first whirlwind could potentially be already on spot.
					Play();
				else { // In all other cases move the whirlwind to the right spot first.
					PlayWhirlwind(this.lastPosition, false, Play);
				}
				break;
			}
			case Spell.Firebeam: {
				const info = renderView.GraphicInfoProvider.GetCombatGraphicInfo(CombatGraphicIndex.FireBall);
				const monsterRow = fromMonster ? Math.trunc(this.startPosition / 6) : Math.trunc(tile / 6);
				const startScale = 2.0;
				const endScale = renderView.GraphicInfoProvider.GetMonsterRowImageScaleFactor(monsterRow);
				const startPosition = this.GetSourcePosition();
				const endPosition = this.GetTargetPosition(tile);
				const maxStartOffset = Util.Round(0.75 * startScale * info.GraphicInfo.Width);
				const maxEndOffset = Util.Round(0.75 * endScale * info.GraphicInfo.Width);
				const maxOffset = Math.max(maxStartOffset, maxEndOffset);
				let xOffset = Math.trunc((startPosition.X - endPosition.X) / 8);
				xOffset = xOffset < -maxOffset ? -maxOffset :
					(xOffset > maxOffset ? maxOffset : xOffset);
				const startXOffset = Util.Round(0.5 * xOffset * startScale);
				const endXOffset = Util.Round(0.5 * xOffset * endScale);
				let scaleFactor = 1.0;
				let displayLayer = fromMonster ? 255 : 252;
				const displayLayerChange = fromMonster ? -1 : 1;
				this.AddAnimation(CombatGraphicIndex.FireBall, 8, startPosition, endPosition,
					BattleEffects.GetFlyDuration(this.startPosition, tile),
					scaleFactor * (fromMonster ? endScale : startScale),
					scaleFactor * (fromMonster ? startScale : endScale), toByte(displayLayer), () => { });
				displayLayer += displayLayerChange;
				scaleFactor = 0.85;
				const startOffset = new Position(Util.Round(scaleFactor * startXOffset), 4);
				const endOffset = new Position(Util.Round(scaleFactor * endXOffset), 4);
				this.AddAnimation(CombatGraphicIndex.FireBall, 8, Position.op_Addition(startPosition, startOffset), Position.op_Addition(endPosition, endOffset),
					BattleEffects.GetFlyDuration(this.startPosition, tile),
					scaleFactor * (fromMonster ? endScale : startScale),
					scaleFactor * (fromMonster ? startScale : endScale), toByte(displayLayer), () => { });
				displayLayer += displayLayerChange;
				scaleFactor = 0.7;
				startOffset.X += Util.Round(scaleFactor * startXOffset);
				endOffset.X += Util.Round(scaleFactor * endXOffset);
				startOffset.Y += 3;
				endOffset.Y += 3;
				this.AddAnimation(CombatGraphicIndex.FireBall, 8, Position.op_Addition(startPosition, startOffset), Position.op_Addition(endPosition, endOffset),
					BattleEffects.GetFlyDuration(this.startPosition, tile),
					scaleFactor * (fromMonster ? endScale : startScale),
					scaleFactor * (fromMonster ? startScale : endScale), toByte(displayLayer), () => { });
				displayLayer += displayLayerChange;
				scaleFactor = 0.55;
				startOffset.X += Util.Round(scaleFactor * startXOffset);
				endOffset.X += Util.Round(scaleFactor * endXOffset);
				startOffset.Y += 2;
				endOffset.Y += 2;
				this.AddAnimation(CombatGraphicIndex.FireBall, 8, Position.op_Addition(startPosition, startOffset), Position.op_Addition(endPosition, endOffset),
					BattleEffects.GetFlyDuration(this.startPosition, tile),
					scaleFactor * (fromMonster ? endScale : startScale),
					scaleFactor * (fromMonster ? startScale : endScale), toByte(displayLayer), () => { this.HideOverlay(); PlayBurn(); });
				break;
			}
			case Spell.Fireball: {
				const monsterRow = fromMonster ? Math.trunc(this.startPosition / 6) : Math.trunc(tile / 6);
				const endScale = renderView.GraphicInfoProvider.GetMonsterRowImageScaleFactor(monsterRow);
				this.AddAnimation(CombatGraphicIndex.FireBall, 8, this.GetSourcePosition(), this.GetTargetPosition(tile),
					BattleEffects.GetFlyDuration(this.startPosition, tile),
					fromMonster ? endScale : 2.0, fromMonster ? 2.0 : endScale, 255, () => { this.HideOverlay(); PlayBurn(); });
				break;
			}
			case Spell.Firestorm:
			case Spell.Firepillar: {
				PlayBurn();
				break;
			}
			case Spell.Waterfall: {
				const targetPosition = this.GetTargetPosition(tile);
				const startPosition = new Position(targetPosition.X, Global.CombatBackgroundArea.Top);
				const displayLayer = toByte(Math.min(255, Math.trunc(tile / 6) * 60 + 60));
				this.PlayMaterialization(startPosition, CombatGraphicIndex.Waterdrop, 1.0, displayLayer, () => {
					const animation = this.AddAnimation(CombatGraphicIndex.Waterdrop, 1, startPosition, targetPosition,
						Math.trunc(GameCore.TicksPerSecond / 2), 1.0, 1.5, displayLayer, () => {
							const animation = this.AddAnimation(CombatGraphicIndex.Waterdrop, 1, targetPosition, targetPosition,
								Math.trunc(GameCore.TicksPerSecond * 3 / 4), 0.25, 2.5, displayLayer);
							animation.SetStartFrame(null, 0.25);
							animation.ScaleType = BattleAnimation.AnimationScaleType.XOnly;
						}, null, BattleAnimation.AnimationScaleType.YOnly);
					animation.ScaleType = BattleAnimation.AnimationScaleType.XOnly;
					animation.SetStartFrame(null, 0.5);
					animation.ScaleType = BattleAnimation.AnimationScaleType.YOnly;
					animation.SetStartFrame(null, 1.0);
				}, startPosition, 1.0, animation => {
					animation.ScaleType = BattleAnimation.AnimationScaleType.XOnly;
					animation.SetStartFrame(null, 0.5);
					animation.ScaleType = BattleAnimation.AnimationScaleType.None;
				});
				break;
			}
			case Spell.Iceball: {
				const monsterRow = fromMonster ? Math.trunc(this.startPosition / 6) : Math.trunc(tile / 6);
				const endScale = renderView.GraphicInfoProvider.GetMonsterRowImageScaleFactor(monsterRow);
				this.AddAnimation(CombatGraphicIndex.IceBall, 1, this.GetSourcePosition(), this.GetTargetPosition(tile),
					BattleEffects.GetFlyDuration(this.startPosition, tile),
					fromMonster ? endScale : 2.0, fromMonster ? 2.0 : endScale, 255, () => { this.HideOverlay(); PlayChill(); });
				break;
			}
			case Spell.Icestorm:
			case Spell.Iceshower: {
				PlayChill();
				break;
			}
			default:
				throw new AmbermoonException(ExceptionScope.Application, `The spell ${enumName(Spell, spell)} can not be rendered during a fight.`);
		}

		this.lastPosition = tile;
	}

	Destroy() {
		this.animations.forEach(a => a?.Destroy());
		this.animations.length = 0;
		this.HideOverlay();
	}

	Update(ticks) {
		// Note: ToList is important as Update might remove the animation from the collection.
		this.animations.slice().forEach(a => a?.Update(ticks));
	}
}
