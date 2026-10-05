// Port of Ambermoon.Core/Game/Util.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { Random } from '../../Ambermoon.Common/Random.js';
import { CharacterType } from '../../Ambermoon.Data.Common/Enumerations/CharacterType.js';
import { MonsterGroup } from '../../Ambermoon.Data.Common/MonsterGroup.js';
import { MobileAction } from './Input.js';
import { toUInt } from '../../../runtime.js';

export class GameCore_Util {
	static initFields(self) {
		self.random = new Random();
	}

	RollDice100() {
		return this.RandomInt(0, 99);
	}

	RandomInt(min, max) {
		const range = toUInt(max + 1 - min);
		if (range === 0) // this avoid a possible division by zero crash
			return min;
		return min + ((this.random.Next() >>> 0) % range);
	}

	StartSequence() {
		this.allInputWasDisabled = this.allInputDisabled;
		this.layout.ReleaseButtons();
		this.allInputDisabled = true;
		this.clickMoveActive = false;
		this.CurrentMobileAction = MobileAction.None;
		this.trappedAfterClickMoveActivation = false;
	}

	EndSequence(force = true) {
		if (force || !this.allInputWasDisabled)
			this.allInputDisabled = false;
		this.allInputWasDisabled = false;
	}

	static FadeAlphaToLight(alpha) {
		// 3D shaders use: outColor = vec4(pixelColor.rgb + vec3(light) - vec3(1), pixelColor.a);
		// Or in short: result = color + light - 1.0f
		// This means that darker colors are faster darkened and lighter colors are almost linear.
		// A linear light factor change will darken too quickly and lighten too slowly.
		// We want fade alpha which is: result = color * alpha

		// But light must increase faster than alpha. As both values are smaller than 1, we can
		// just use the square root here.
		return Math.sqrt(alpha);
	}

	KillAllMapMonsters() {
		if (this.Map == null || this.Map.CharacterReferences == null)
			return;

		for (let characterIndex = 0; characterIndex < this.Map.CharacterReferences.length; ++characterIndex) {
			const characterReference = this.Map.CharacterReferences[characterIndex];

			if (characterReference == null)
				break;

			if (characterReference.Type === CharacterType.Monster)
				this.SetMapCharacterBit(this.Map.Index, characterIndex, true);
		}
	}

	CloneMonsterGroup(monsterGroup) {
		const CloneMonster = monster => {
			if (monster == null)
				return null;

			return this.CharacterManager.CloneMonster(monster);
		};

		const clone = new MonsterGroup();

		for (let y = 0; y < 3; y++) {
			for (let x = 0; x < 6; x++) {
				// Monster[6, 3] is ported as jagged array Monsters[x][y]
				clone.Monsters[x][y] = CloneMonster(monsterGroup.Monsters[x][y]);
			}
		}

		return clone;
	}

	PlayTimedSequence(steps, stepAction, stepTimeInMs, followUpAction = null) {
		if (steps === 0)
			return;

		this.StartSequence();
		for (let i = 0; i < steps - 1; ++i)
			this.AddTimedEvent(i * stepTimeInMs, stepAction);
		this.AddTimedEvent((steps - 1) * stepTimeInMs, () => {
			stepAction?.();
			this.EndSequence();
			this.ResetMoveKeys();
			followUpAction?.();
		});
	}
}

export class GameSequence {
	constructor(game) {
		this.game = game;
		game.StartSequence();
	}

	Dispose() {
		this.game.EndSequence();
	}
}
