// Port of Ambermoon.Core/UI/Panel.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { toByte, newArray } from '../../../runtime.js';
import { FilledArea } from './Layout.js';

/**
 * A panel is just a small gray area with a 3D border.
 *
 * Basically a panel consists of 3 filled areas.
 * A fill area and two border areas.
 */
export class Panel {
	constructor(game, fillArea, layoutFilledAreas, layout, displayLayer) {
		this.filledAreas = newArray(3, null);
		// right and bottom border
		this.filledAreas[0] = new FilledArea(layoutFilledAreas, layout.CreateArea(fillArea.CreateModified(0, 0, 1, 1), game.GetUIColor(26), displayLayer));
		// left and top border
		this.filledAreas[1] = new FilledArea(layoutFilledAreas, layout.CreateArea(fillArea.CreateModified(-1, -1, 1, 1), game.GetUIColor(31), toByte(displayLayer + 1)));
		// fill area
		this.filledAreas[2] = new FilledArea(layoutFilledAreas, layout.CreateArea(fillArea, game.GetUIColor(28), toByte(displayLayer + 2)));
	}

	Destroy() {
		for (let i = 0; i < 3; ++i) {
			this.filledAreas[i]?.Destroy();
			this.filledAreas[i] = null;
		}
	}
}
