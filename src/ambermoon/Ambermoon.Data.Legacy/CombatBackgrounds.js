// Port of Ambermoon.Data.Legacy/CombatBackgrounds.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { CombatBackgroundInfo } from '../Ambermoon.Data.Common/CombatBackgroundInfo.js';

function info(graphicIndex, palettes) {
	const backgroundInfo = new CombatBackgroundInfo();
	backgroundInfo.GraphicIndex = graphicIndex;
	backgroundInfo.Palettes = palettes;
	return backgroundInfo;
}

let info2D = null;
let info3D = null;
let advancedReplacements2D = null;
let advancedReplacements3D = null;

// Note: The static fields are created lazily (on first access) to avoid using other modules at module evaluation time.
export class CombatBackgrounds {
	static get Info2D() {
		return info2D ??= [
			info(15, [39, 48, 49]),
			info(1, [37, 37, 37]),
			info(15, [39, 48, 49]),
			info(15, [39, 48, 49]),
			info(13, [35, 46, 47]),
			info(1, [37, 37, 37]),
			info(16, [41, 44, 45]),
			info(8, [23, 30, 31]),
			info(10, [25, 25, 25]),
			info(7, [22, 22, 22]),
			info(11, [26, 26, 26]),
			info(1, [37, 37, 37]),
			info(10, [25, 25, 25]),
			info(8, [23, 30, 31]),
			info(16, [41, 44, 45]),
			info(14, [36, 42, 43])
		];
	}

	static get Info3D() {
		return info3D ??= [
			info(10, [25, 25, 25]),
			info(6, [21, 21, 21]),
			info(7, [22, 22, 22]),
			info(9, [24, 24, 24]),
			info(11, [26, 26, 26]),
			info(11, [26, 26, 26]),
			info(4, [19, 19, 19]),
			info(5, [20, 20, 20]),
			info(1, [37, 37, 37]),
			info(8, [23, 30, 31]),
			info(8, [23, 30, 31]),
			info(2, [17, 28, 29]),
			info(12, [34, 34, 34]),
			info(1, [37, 37, 37]),
			info(5, [40, 40, 40]),
			info(3, [18, 18, 18])
		];
	}

	static get AdvancedReplacements2D() {
		return advancedReplacements2D ??= new Map([
			// TODO
		]);
	}

	static get AdvancedReplacements3D() {
		return advancedReplacements3D ??= new Map([
			[5, info(17, [39, 48, 49])],
			[10, info(18, [41, 44, 45])]
		]);
	}
}
