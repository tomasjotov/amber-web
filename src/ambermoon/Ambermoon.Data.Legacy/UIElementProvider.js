// Port of Ambermoon.Data.Legacy/UIElementProvider.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { range } from '../../runtime.js';
import { Position } from '../Ambermoon.Common/Position.js';
import { Rect } from '../Ambermoon.Common/Rect.js';
import { Random } from '../Ambermoon.Common/Random.js';
import { Graphic, GraphicBuilder } from '../Ambermoon.Data.Common/Graphic.js';
import { Color } from '../Ambermoon.Data.Common/Enumerations/Color.js';

class Star {
	constructor() {
		this.Position = null;
		this.Frame = 0;
	}
}

export class UIElementProvider {
	static Create() {
		// This is used by the healing animation (falling stars)
		// and the magic item animation (blinking stars).
		// There are 3 frames.
		const redStarFrameData = new Uint8Array([
			// Transparency: 0
			// Red: 20 (CC4433)
			// Orange: 21 (EE6633)
			// Yellow: 16 (FFCC00)
			// White: 1 (EEDDCC)
			// -----------------------
			// 1st frame: Big star
			 0,  0,  0, 20,  0,  0,  0,
			 0,  0,  0, 21,  0,  0,  0,
			 0,  0, 20, 16, 20,  0,  0,
			20, 21, 16,  1, 16, 21, 20,
			 0,  0, 20, 16, 20,  0,  0,
			 0,  0,  0, 21,  0,  0,  0,
			 0,  0,  0, 20,  0,  0,  0,
			// 2nd frame: Small star
			 0,  0,  0,  0,  0,  0,  0,
			 0,  0,  0, 20,  0,  0,  0,
			 0,  0,  0, 21,  0,  0,  0,
			 0, 20, 21, 16, 21, 20,  0,
			 0,  0,  0, 21,  0,  0,  0,
			 0,  0,  0, 20,  0,  0,  0,
			 0,  0,  0,  0,  0,  0,  0,
			// 3rd frame: Single orange pixel
			 0,  0,  0,  0,  0,  0,  0,
			 0,  0,  0,  0,  0,  0,  0,
			 0,  0,  0,  0,  0,  0,  0,
			 0,  0,  0, 21,  0,  0,  0,
			 0,  0,  0,  0,  0,  0,  0,
			 0,  0,  0,  0,  0,  0,  0,
			 0,  0,  0,  0,  0,  0,  0
		]);

		function GetRedStarFrame(frame) {
			const graphic = new Graphic();
			graphic.Width = 7;
			graphic.Height = 7;
			graphic.Data = redStarFrameData.slice(frame * 49, frame * 49 + 49);
			graphic.IndexedGraphic = true;
			return graphic;
		}

		function CreateBlinkingStars() {
			const stars = [];
			const addAmountsPerFrame = [1, 1, 0, 1, 0, 0, 0, 0];
			const random = new Random(); // always use a new random to produce the same effect
			const animation = new Graphic(8 * 16, 16, 0); // 11 frames with 16x16

			for (let i = 0; i < 8; ++i) // 8 frames in total
			{
				// in each frame we have several stars in specific states (star frame)
				const frame = new Graphic(16, 16, 0);

				// first update existing stars
				for (let s = stars.length - 1; s >= 0; --s) {
					const star = stars[s];

					if (++star.Frame === 5)
						stars.splice(s, 1);
					else
						frame.AddOverlay(star.Position.X, star.Position.Y, GetRedStarFrame(star.Frame > 1 ? star.Frame - 2 : 2 - star.Frame));
				}
				// then add new stars
				for (let a = 0; a < addAmountsPerFrame[i]; ++a) {
					const star = new Star();
					star.Position = new Position((random.Next() | 0) % 10, (random.Next() | 0) % 10);
					star.Frame = 0;
					stars.push(star);
					frame.AddOverlay(star.Position.X, star.Position.Y, GetRedStarFrame(0));
				}

				animation.AddOverlay(i * 16, 0, frame);
			}

			return animation;
		}

		// See UIElementGraphic
		return [
			// Small vertical scrollbar
			GraphicBuilder.Create(6, 28)
			.AddColoredArea(new Rect(0, 0, 1, 1), 31)
			.AddColoredArea(new Rect(1, 0, 4, 1), 30)
			.AddColoredArea(new Rect(5, 0, 1, 1), 28)
			.AddColoredArea(new Rect(0, 1, 1, 25), 30)
			.AddColoredArea(new Rect(1, 1, 4, 25), 29)
			.AddColoredArea(new Rect(5, 1, 1, 25), 27)
			.AddColoredArea(new Rect(0, 26, 1, 1), 28)
			.AddColoredArea(new Rect(1, 26, 5, 1), 27)
			.AddColoredArea(new Rect(0, 27, 6, 1), 26)
			.Build(),

			// Small vertical scrollbar highlighted
			GraphicBuilder.Create(6, 28)
			.AddColoredArea(new Rect(0, 0, 5, 1), 31)
			.AddColoredArea(new Rect(5, 0, 1, 1), 29)
			.AddColoredArea(new Rect(0, 1, 1, 25), 31)
			.AddColoredArea(new Rect(1, 1, 4, 25), 30)
			.AddColoredArea(new Rect(5, 1, 1, 25), 28)
			.AddColoredArea(new Rect(0, 26, 1, 1), 29)
			.AddColoredArea(new Rect(1, 26, 5, 1), 28)
			.AddColoredArea(new Rect(0, 27, 6, 1), 26)
			.Build(),

			// Large vertical scrollbar
			GraphicBuilder.Create(6, 57)
			.AddColoredArea(new Rect(0, 0, 1, 1), 31)
			.AddColoredArea(new Rect(1, 0, 4, 1), 30)
			.AddColoredArea(new Rect(5, 0, 1, 1), 28)
			.AddColoredArea(new Rect(0, 1, 1, 54), 30)
			.AddColoredArea(new Rect(1, 1, 4, 54), 29)
			.AddColoredArea(new Rect(5, 1, 1, 54), 27)
			.AddColoredArea(new Rect(0, 55, 1, 1), 28)
			.AddColoredArea(new Rect(1, 55, 5, 1), 27)
			.AddColoredArea(new Rect(0, 56, 6, 1), 26)
			.Build(),

			// Large vertical scrollbar highlighted
			GraphicBuilder.Create(6, 57)
			.AddColoredArea(new Rect(0, 0, 5, 1), 31)
			.AddColoredArea(new Rect(5, 0, 1, 1), 29)
			.AddColoredArea(new Rect(0, 1, 1, 54), 31)
			.AddColoredArea(new Rect(1, 1, 4, 54), 30)
			.AddColoredArea(new Rect(5, 1, 1, 54), 28)
			.AddColoredArea(new Rect(0, 55, 1, 1), 29)
			.AddColoredArea(new Rect(1, 55, 5, 1), 28)
			.AddColoredArea(new Rect(0, 56, 6, 1), 26)
			.Build(),

			// Small vertical scrollbar background
			GraphicBuilder.Create(6, 53)
			.AddColoredArea(new Rect(1, 1, 5, 52), 27)
			.AddColoredArea(new Rect(0, 1, 1, 52), 26)
			.AddColoredArea(new Rect(0, 0, 6, 1), 26)
			.Build(),

			// Small vertical scrollbar disabled
			GraphicBuilder.Create(6, 53)
			.AddColoredArea(new Rect(0, 0, 1, 1), 31)
			.AddColoredArea(new Rect(1, 0, 4, 1), 30)
			.AddColoredArea(new Rect(5, 0, 1, 1), 32)
			.AddColoredArea(new Rect(0, 1, 1, 51), 30)
			.AddColoredArea(new Rect(1, 1, 4, 51), 28)
			.AddColoredArea(new Rect(5, 1, 1, 51), 26)
			.AddColoredArea(new Rect(0, 52, 1, 1), 32)
			.AddColoredArea(new Rect(1, 52, 5, 1), 26)
			.Build(),

			// Large vertical scrollbar background
			GraphicBuilder.Create(6, 112)
			.AddColoredArea(new Rect(1, 1, 5, 111), 27)
			.AddColoredArea(new Rect(0, 1, 1, 111), 26)
			.AddColoredArea(new Rect(0, 0, 6, 1), 26)
			.Build(),

			// Large vertical scrollbar disabled
			GraphicBuilder.Create(6, 112)
			.AddColoredArea(new Rect(0, 0, 1, 1), 31)
			.AddColoredArea(new Rect(1, 0, 4, 1), 30)
			.AddColoredArea(new Rect(5, 0, 1, 1), 32)
			.AddColoredArea(new Rect(0, 1, 1, 110), 30)
			.AddColoredArea(new Rect(1, 1, 4, 110), 28)
			.AddColoredArea(new Rect(5, 1, 1, 110), 26)
			.AddColoredArea(new Rect(0, 111, 1, 1), 32)
			.AddColoredArea(new Rect(1, 111, 5, 1), 26)
			.Build(),

			// Item slot background
			new Graphic(16, 24, 27),

			// Item slot disabled
			GraphicBuilder.Create(16, 24)
			.AddColoredArea(new Rect(0, 0, 1, 1), 31)
			.AddColoredArea(new Rect(1, 0, 14, 1), 30)
			.AddColoredArea(new Rect(15, 0, 1, 1), 32)
			.AddColoredArea(new Rect(0, 1, 1, 22), 30)
			.AddColoredArea(new Rect(1, 1, 14, 22), 28)
			.AddColoredArea(new Rect(15, 1, 1, 22), 26)
			.AddColoredArea(new Rect(0, 23, 1, 1), 32)
			.AddColoredArea(new Rect(1, 23, 15, 1), 26)
			.Build(),

			// Portrait background
			Graphic.CreateGradient(32, 34, 4, 2, 8, 23),

			// Thin portrait border
			Graphic.FromIndexedData(32, 1, new Uint8Array([
				28, 28, 28, 28, 27, 28, 27, 28, 27, 28, 27, 28, 27, 28, 27, 28,
				28, 27, 28, 27, 28, 27, 28, 27, 28, 27, 28, 27, 28, 28, 28, 28
			])),

			// Map disable overlay (UI palette-> 32 = black, 0 = transparent)
			Graphic.FromIndexedData(320, 144, Uint8Array.from(range(0, 320 * 144), i => ((i + Math.trunc(i / 320)) % 2 === 0 ? 0 : 32))),

			// Ambermoon info box (shown over the map when opening option menu)
			GraphicBuilder.Create(128, 19)
			.AddColoredArea(new Rect(0, 0, 1, 1), 31)
			.AddColoredArea(new Rect(1, 0, 126, 1), 30)
			.AddColoredArea(new Rect(127, 0, 1, 1), 27)
			.AddColoredArea(new Rect(0, 1, 1, 17), 30)
			.AddColoredArea(new Rect(1, 1, 126, 17), 28)
			.AddColoredArea(new Rect(127, 1, 1, 17), 26)
			.AddColoredArea(new Rect(0, 18, 1, 1), 27)
			.AddColoredArea(new Rect(1, 18, 127, 1), 26)
			.Build(),

			// Bigger info box
			GraphicBuilder.Create(144, 40)
			.AddColoredArea(new Rect(0, 0, 1, 1), 31)
			.AddColoredArea(new Rect(1, 0, 142, 1), 30)
			.AddColoredArea(new Rect(143, 0, 1, 1), 27)
			.AddColoredArea(new Rect(0, 1, 1, 38), 30)
			.AddColoredArea(new Rect(1, 1, 142, 38), 28)
			.AddColoredArea(new Rect(143, 1, 1, 38), 26)
			.AddColoredArea(new Rect(0, 39, 1, 1), 27)
			.AddColoredArea(new Rect(1, 39, 143, 1), 26)
			.Build(),

			// BattleFieldYellowBorder
			GraphicBuilder.Create(16, 13)
			.AddColoredArea(new Rect(0, 0, 16, 1), Color.ActivePartyMember)
			.AddColoredArea(new Rect(0, 1, 1, 11), Color.ActivePartyMember)
			.AddColoredArea(new Rect(15, 1, 1, 11), Color.ActivePartyMember)
			.AddColoredArea(new Rect(0, 12, 16, 1), Color.ActivePartyMember)
			.Build(),

			// BattleFieldOrangeBorder
			GraphicBuilder.Create(16, 13)
			.AddColoredArea(new Rect(0, 0, 16, 1), Color.LightRed)
			.AddColoredArea(new Rect(0, 1, 1, 11), Color.LightRed)
			.AddColoredArea(new Rect(15, 1, 1, 11), Color.LightRed)
			.AddColoredArea(new Rect(0, 12, 16, 1), Color.LightRed)
			.Build(),

			// BattleFieldGreenHighlight
			GraphicBuilder.Create(16, 13)
			.AddColoredArea(new Rect(1, 1, 14, 11), Color.LightGreen)
			.Build(),

			// HealingStarAnimation (3 frames of a redish star)
			Graphic.FromIndexedData(7 * 3, 7, redStarFrameData),

			// BattleFieldBlockedMovementCursor
			Graphic.FromIndexedData(16, 13, new Uint8Array([
				// Transparency: 0
				// Red: 19 (881122)
				// -----------------------
				 0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
				 0,  0, 19, 19,  0,  0,  0,  0,  0,  0,  0, 19, 19, 19,  0,  0,
				 0, 19, 19, 19, 19, 19,  0,  0,  0, 19, 19, 19, 19, 19, 19,  0,
				 0, 19, 19, 19, 19, 19, 19, 19, 19, 19, 19, 19, 19, 19,  0,  0,
				 0,  0,  0, 19, 19, 19, 19, 19, 19, 19, 19, 19,  0,  0,  0,  0,
				 0,  0,  0,  0,  0, 19, 19, 19, 19, 19, 19,  0,  0,  0,  0,  0,
				 0,  0,  0,  0, 19, 19, 19, 19, 19, 19, 19, 19,  0,  0,  0,  0,
				 0,  0,  0, 19, 19, 19, 19, 19, 19, 19, 19, 19, 19, 19,  0,  0,
				 0,  0, 19, 19, 19, 19,  0,  0,  0, 19, 19, 19, 19, 19, 19,  0,
				 0, 19, 19, 19, 19,  0,  0,  0,  0,  0,  0, 19, 19, 19, 19,  0,
				 0, 19, 19, 19, 19,  0,  0,  0,  0,  0,  0,  0, 19, 19,  0,  0,
				 0,  0, 19, 19,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
				 0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0
			])),

			// ItemMagicAnimation
			CreateBlinkingStars(),

			// BrokenItemOverlay
			Graphic.FromIndexedData(16, 16, new Uint8Array([
				// Transparency: 0
				// Dark gray: 26 (222222)
				// -----------------------
				 0,  0,  0,  0,  0,  0,  0,  0,  0, 26, 26, 26, 26,  0,  0,  0,
				 0,  0,  0,  0,  0,  0,  0,  0,  0, 26, 26, 26,  0,  0,  0,  0,
				 0,  0, 26,  0,  0, 26,  0,  0, 26, 26, 26,  0,  0,  0,  0,  0,
				 0,  0,  0,  0,  0,  0, 26, 26, 26,  0,  0,  0,  0,  0,  0,  0,
				26, 26,  0,  0,  0,  0,  0, 26, 26,  0,  0,  0,  0,  0,  0,  0,
				26, 26, 26, 26,  0,  0,  0, 26, 26,  0,  0,  0,  0, 26,  0,  0,
				26, 26, 26, 26, 26, 26,  0, 26, 26,  0,  0,  0,  0,  0,  0,  0,
				 0,  0, 26, 26, 26, 26, 26, 26, 26, 26,  0,  0,  0,  0,  0,  0,
				 0,  0,  0, 26,  0, 26, 26, 26, 26, 26,  0,  0,  0, 26,  0,  0,
				 0,  0, 26,  0,  0,  0,  0,  0,  0, 26, 26, 26, 26, 26, 26, 26,
				 0,  0,  0,  0,  0,  0,  0,  0,  0, 26, 26, 26, 26, 26, 26,  0,
				 0,  0,  0, 26,  0,  0,  0,  0,  0, 26,  0,  0,  0,  0,  0,  0,
				 0,  0,  0,  0,  0,  0,  0,  0, 26,  0,  0,  0,  0,  0,  0,  0,
				 0,  0,  0,  0,  0,  0,  0, 26,  0,  0,  0,  0, 26,  0,  0,  0,
				 0,  0,  0,  0,  0, 26, 26, 26,  0,  0,  0, 26,  0,  0,  0,  0,
				 0,  0,  0, 26, 26, 26, 26,  0, 26,  0,  0, 26,  0,  0,  0,  0,
			])),

			// AutomapWallFrames
			Graphic.Concat
			(
				// Map background: 6
				// Wall color: 7
				// -----------------------
				// End pieces
				Graphic.FromIndexedData(32, 8, new Uint8Array([
					//  top open         right open       bottom open        left open    
					6,7,7,6,6,7,7,6,  6,6,6,6,6,6,6,6,  6,6,6,6,6,6,6,6,  6,6,6,6,6,6,6,6,
					6,7,7,6,6,7,7,6,  6,7,7,7,7,7,7,7,  6,7,7,7,7,7,7,6,  7,7,7,7,7,7,7,6,
					6,7,7,6,6,7,7,6,  6,7,7,7,7,7,7,7,  6,7,7,7,7,7,7,6,  7,7,7,7,7,7,7,6,
					6,7,7,6,6,7,7,6,  6,7,7,6,6,6,6,6,  6,7,7,6,6,7,7,6,  6,6,6,6,6,7,7,6,
					6,7,7,6,6,7,7,6,  6,7,7,6,6,6,6,6,  6,7,7,6,6,7,7,6,  6,6,6,6,6,7,7,6,
					6,7,7,7,7,7,7,6,  6,7,7,7,7,7,7,7,  6,7,7,6,6,7,7,6,  7,7,7,7,7,7,7,6,
					6,7,7,7,7,7,7,6,  6,7,7,7,7,7,7,7,  6,7,7,6,6,7,7,6,  7,7,7,7,7,7,7,6,
					6,6,6,6,6,6,6,6,  6,6,6,6,6,6,6,6,  6,7,7,6,6,7,7,6,  6,6,6,6,6,6,6,6,
				])),
				// Corners
				Graphic.FromIndexedData(32, 8, new Uint8Array([
					//  b+r open          b+l open      //  t+r open          t+l open    
					6,6,6,6,6,6,6,6,  6,6,6,6,6,6,6,6,  6,7,7,6,6,7,7,6,  6,7,7,6,6,7,7,6,
					6,7,7,7,7,7,7,7,  7,7,7,7,7,7,7,6,  6,7,7,6,6,7,7,7,  7,7,7,6,6,7,7,6,
					6,7,7,7,7,7,7,7,  7,7,7,7,7,7,7,6,  6,7,7,6,6,7,7,7,  7,7,7,6,6,7,7,6,
					6,7,7,6,6,6,6,6,  6,6,6,6,6,7,7,6,  6,7,7,6,6,6,6,6,  6,6,6,6,6,7,7,6,
					6,7,7,6,6,6,6,6,  6,6,6,6,6,7,7,6,  6,7,7,6,6,6,6,6,  6,6,6,6,6,7,7,6,
					6,7,7,6,6,7,7,7,  7,7,7,6,6,7,7,6,  6,7,7,7,7,7,7,7,  7,7,7,7,7,7,7,6,
					6,7,7,6,6,7,7,7,  7,7,7,6,6,7,7,6,  6,7,7,7,7,7,7,7,  7,7,7,7,7,7,7,6,
					6,7,7,6,6,7,7,6,  6,7,7,6,6,7,7,6,  6,6,6,6,6,6,6,6,  6,6,6,6,6,6,6,6,
				])),
				// T-crossings
				Graphic.FromIndexedData(32, 8, new Uint8Array([
					// t+l+r open        t+b+r open        b+l+r open        t+b+l open 
					6,7,7,6,6,7,7,6,  6,7,7,6,6,7,7,6,  6,6,6,6,6,6,6,6,  6,7,7,6,6,7,7,6,
					7,7,7,6,6,7,7,7,  6,7,7,6,6,7,7,7,  7,7,7,7,7,7,7,7,  7,7,7,6,6,7,7,6,
					7,7,7,6,6,7,7,7,  6,7,7,6,6,7,7,7,  7,7,7,7,7,7,7,7,  7,7,7,6,6,7,7,6,
					6,6,6,6,6,6,6,6,  6,7,7,6,6,6,6,6,  6,6,6,6,6,6,6,6,  6,6,6,6,6,7,7,6,
					6,6,6,6,6,6,6,6,  6,7,7,6,6,6,6,6,  6,6,6,6,6,6,6,6,  6,6,6,6,6,7,7,6,
					7,7,7,7,7,7,7,7,  6,7,7,6,6,7,7,7,  7,7,7,6,6,7,7,7,  7,7,7,6,6,7,7,6,
					7,7,7,7,7,7,7,7,  6,7,7,6,6,7,7,7,  7,7,7,6,6,7,7,7,  7,7,7,6,6,7,7,6,
					6,6,6,6,6,6,6,6,  6,7,7,6,6,7,7,6,  6,7,7,6,6,7,7,6,  6,7,7,6,6,7,7,6,
				])),
				// crossing, vertical and horizontal piece and single closed tile
				Graphic.FromIndexedData(32, 8, new Uint8Array([
					//  all open          t+b open          l+r open           Closed
					6,7,7,6,6,7,7,6,  6,7,7,6,6,7,7,6,  6,6,6,6,6,6,6,6,  7,7,7,7,7,7,7,7,
					7,7,7,6,6,7,7,7,  6,7,7,6,6,7,7,6,  7,7,7,7,7,7,7,7,  7,7,7,7,7,7,7,7,
					7,7,7,6,6,7,7,7,  6,7,7,6,6,7,7,6,  7,7,7,7,7,7,7,7,  7,7,6,6,6,6,7,7,
					6,6,6,6,6,6,6,6,  6,7,7,6,6,7,7,6,  6,6,6,6,6,6,6,6,  7,7,6,6,6,6,7,7,
					6,6,6,6,6,6,6,6,  6,7,7,6,6,7,7,6,  6,6,6,6,6,6,6,6,  7,7,6,6,6,6,7,7,
					7,7,7,6,6,7,7,7,  6,7,7,6,6,7,7,6,  7,7,7,7,7,7,7,7,  7,7,6,6,6,6,7,7,
					7,7,7,6,6,7,7,7,  6,7,7,6,6,7,7,6,  7,7,7,7,7,7,7,7,  7,7,7,7,7,7,7,7,
					6,7,7,6,6,7,7,6,  6,7,7,6,6,7,7,6,  6,6,6,6,6,6,6,6,  7,7,7,7,7,7,7,7,
				]))
			),

			// FakeWallOverlay
			Graphic.FromIndexedData(8, 8, new Uint8Array([
				6,0,6,0,6,0,6,0,
				0,6,0,6,0,6,0,6,
				6,0,6,0,6,0,6,0,
				0,6,0,6,0,6,0,6,
				6,0,6,0,6,0,6,0,
				0,6,0,6,0,6,0,6,
				6,0,6,0,6,0,6,0,
				0,6,0,6,0,6,0,6,
			]))
		];
	}
}
