// Port of Ambermoon.Data.Common/Monster.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { newArray } from '../../runtime.js';
import { Character } from './Character.js';
import { CharacterType } from './Enumerations/CharacterType.js';

class Animation {
	/** Overloads: new Animation(), new Animation(other) */
	constructor(other = null) {
		this.UsedAmount = 0; // 0-32
		this.FrameIndices = null; // 32 bytes

		if (other) {
			this.UsedAmount = other.UsedAmount;
			this.FrameIndices = other.FrameIndices;
		}
	}
}

export class Monster extends Character {
	static Animation = Animation;

	constructor() {
		super(CharacterType.Monster);

		this.CombatGraphicIndex = 0;
		this.Morale = 0;
		this.DefeatExperience = 0;
		this.Animations = newArray(8);
		this.AtariPalette = null; // not used
		this.MonsterPalette = null;
		this.AlternateAnimationBits = 0; // 1 bit per animation (if set, play animation backwards after finish)
		this.PaddingByte = 0; // always 0
		this.FrameWidth = 0;
		this.FrameHeight = 0;
		this.MappedFrameWidth = 0;
		this.MappedFrameHeight = 0;
		this.CombatGraphic = null;
		this.AdvancedMonsterFlags = 0;
	}

	static Load(index, monsterReader, dataReader) {
		const monster = new Monster();
		monster.Index = index;

		monsterReader.ReadMonster(monster, dataReader);

		return monster;
	}

	/// <summary>
	/// Gets the animation frame index for a given animation type and the
	/// total animation ticks of the animation.
	///
	/// If the animation is over or there are no frames at all this
	/// method will return null to state that there is no frame.
	/// </summary>
	GetAnimationFrameIndex(animationType, animationTicks, ticksPerFrame) {
		const animation = this.Animations[animationType];

		if (animation.UsedAmount === 0)
			return null;

		const frameIndex = Math.trunc(animationTicks / ticksPerFrame);

		if (frameIndex >= animation.UsedAmount)
			return null;

		return animation.FrameIndices[frameIndex];
	}

	GetAnimationFrameCount(animationType) {
		return this.Animations[animationType].UsedAmount;
	}

	GetAnimationFrameIndices(animationType) {
		const animation = this.Animations[animationType];
		const waveAnimation = (this.AlternateAnimationBits & (1 << animationType)) !== 0;
		let frameIndices = Array.from(animation.FrameIndices).slice(0, Math.max(0, animation.UsedAmount));

		if (waveAnimation)
			frameIndices = frameIndices.concat(frameIndices.slice().reverse().slice(1));

		return frameIndices;
	}
}

export { Animation as Monster_Animation };
