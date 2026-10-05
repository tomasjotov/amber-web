// Port of Ambermoon.Data.Common/Enumerations/Condition.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { Features } from './Features.js';

export const Condition = Object.freeze({
	None: 0,
	Irritated: 1,
	Crazy: 2,
	Sleep: 4,
	Panic: 8,
	Blind: 0x10,
	Drugged: 0x20,
	Exhausted: 0x40,
	Fleeing: 0x80,
	Lamed: 0x100,
	Poisoned: 0x200,
	Petrified: 0x400,
	Diseased: 0x800,
	Aging: 0x1000,
	DeadCorpse: 0x2000,
	DeadAshes: 0x4000,
	DeadDust: 0x8000
});

const hasFlag = (value, flag) => (value & flag) === flag;

export class ConditionExtensions {
	static WithoutBattleOnlyConditions(conditions) {
		return conditions & 0xff72;
	}

	static IsBattleOnly(condition) {
		return condition === Condition.Fleeing ||
			condition === Condition.Irritated ||
			condition === Condition.Sleep ||
			condition === Condition.Panic;
	}

	static CanBeAppliedManually(condition) {
		return condition !== Condition.None &&
			condition !== Condition.Exhausted &&
			condition !== Condition.Fleeing;
	}

	static CanBeCleansed(condition) {
		return condition !== Condition.None &&
			condition !== Condition.Fleeing;
	}

	static CanFight(conditions) {
		return !hasFlag(conditions, Condition.Petrified) &&
			!hasFlag(conditions, Condition.DeadCorpse) &&
			!hasFlag(conditions, Condition.DeadAshes) &&
			!hasFlag(conditions, Condition.DeadDust);
	}

	static CanSelect(conditions) {
		return !hasFlag(conditions, Condition.Sleep) &&
			!hasFlag(conditions, Condition.Panic) &&
			!hasFlag(conditions, Condition.Crazy) &&
			!hasFlag(conditions, Condition.Petrified) &&
			!hasFlag(conditions, Condition.DeadCorpse) &&
			!hasFlag(conditions, Condition.DeadAshes) &&
			!hasFlag(conditions, Condition.DeadDust);
	}

	static CanTalk(conditions) {
		return !hasFlag(conditions, Condition.Crazy) && // TODO: correct?
			!hasFlag(conditions, Condition.Petrified) &&
			!hasFlag(conditions, Condition.DeadCorpse) &&
			!hasFlag(conditions, Condition.DeadAshes) &&
			!hasFlag(conditions, Condition.DeadDust);
	}

	static CanOpenInventory(conditions) {
		return !hasFlag(conditions, Condition.Crazy) &&
			!hasFlag(conditions, Condition.Panic) &&
			!hasFlag(conditions, Condition.Petrified);
	}

	static CanUseItem(conditions, isAnimal = false) {
		return !hasFlag(conditions, Condition.Crazy) &&
			!hasFlag(conditions, Condition.Sleep) &&
			!hasFlag(conditions, Condition.Panic) &&
			!hasFlag(conditions, Condition.Drugged) &&
			!hasFlag(conditions, Condition.Lamed) &&
			!hasFlag(conditions, Condition.Petrified) &&
			((!hasFlag(conditions, Condition.DeadCorpse) &&
			!hasFlag(conditions, Condition.DeadAshes) &&
			!hasFlag(conditions, Condition.DeadDust)) || isAnimal);
	}

	static CanMove(conditions) {
		return !hasFlag(conditions, Condition.Sleep) &&
			!hasFlag(conditions, Condition.Lamed) &&
			!hasFlag(conditions, Condition.Petrified) &&
			!hasFlag(conditions, Condition.DeadCorpse) &&
			!hasFlag(conditions, Condition.DeadAshes) &&
			!hasFlag(conditions, Condition.DeadDust);
	}

	static CanBlink(conditions) {
		return !hasFlag(conditions, Condition.Petrified) &&
			!hasFlag(conditions, Condition.DeadCorpse) &&
			!hasFlag(conditions, Condition.DeadAshes) &&
			!hasFlag(conditions, Condition.DeadDust);
	}

	static CanFlee(conditions) {
		return !hasFlag(conditions, Condition.Sleep) &&
			!hasFlag(conditions, Condition.Lamed) &&
			!hasFlag(conditions, Condition.Petrified) &&
			!hasFlag(conditions, Condition.DeadCorpse) &&
			!hasFlag(conditions, Condition.DeadAshes) &&
			!hasFlag(conditions, Condition.DeadDust);
	}

	static CanAttack(conditions) {
		return !hasFlag(conditions, Condition.Sleep) &&
			!hasFlag(conditions, Condition.Panic) &&
			!hasFlag(conditions, Condition.Lamed) &&
			!hasFlag(conditions, Condition.Petrified) &&
			!hasFlag(conditions, Condition.DeadCorpse) &&
			!hasFlag(conditions, Condition.DeadAshes) &&
			!hasFlag(conditions, Condition.DeadDust);
	}

	static CanParry(conditions) {
		return !hasFlag(conditions, Condition.Sleep) &&
			!hasFlag(conditions, Condition.Panic) &&
			!hasFlag(conditions, Condition.Exhausted) &&
			!hasFlag(conditions, Condition.Lamed) &&
			!hasFlag(conditions, Condition.Petrified) &&
			!hasFlag(conditions, Condition.DeadCorpse) &&
			!hasFlag(conditions, Condition.DeadAshes) &&
			!hasFlag(conditions, Condition.DeadDust);
	}

	static CanCastSpell(conditions, features) {
		return !hasFlag(conditions, Condition.Irritated) &&
			!hasFlag(conditions, Condition.Sleep) &&
			!hasFlag(conditions, Condition.Panic) &&
			(!hasFlag(conditions, Condition.Drugged) || hasFlag(features, Features.ExtendedCurseEffects)) &&
			!hasFlag(conditions, Condition.Petrified) &&
			!hasFlag(conditions, Condition.Fleeing) &&
			!hasFlag(conditions, Condition.DeadCorpse) &&
			!hasFlag(conditions, Condition.DeadAshes) &&
			!hasFlag(conditions, Condition.DeadDust);
	}
}
