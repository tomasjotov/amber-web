// Port of Ambermoon.Data.Legacy/Serialization/FantasyIntroData.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { AmigaExecutable } from './AmigaExecutable.js';
import { DataReader } from './DataReader.js';
import { GraphicReader } from './GraphicReader.js';
import { FantasyIntroAction, FantasyIntroCommand, FantasyIntroGraphic } from '../../Ambermoon.Data.Common/IFantasyIntroData.js';
import { Graphic, GraphicInfo, GraphicFormat } from '../../Ambermoon.Data.Common/Graphic.js';
import { Position } from '../../Ambermoon.Common/Position.js';
import { ArgumentException, Queue, getValue, toShort } from '../../../runtime.js';

let WandSparkPositions = null;

function getWandSparkPositions() {
	if (WandSparkPositions === null) {
		WandSparkPositions = [
			new Position(38, 13), new Position(40, 14), new Position(41, 13),
			new Position(43, 14), new Position(45, 16), new Position(41, 13),
			new Position(39, 14), new Position(37, 14), new Position(38, 17),
			new Position(44, 16), new Position(53, 22), new Position(56, 28),
			new Position(58, 33), new Position(58, 36), new Position(58, 37),
			new Position(55, 30), new Position(54, 29), new Position(50, 23),
			new Position(45, 18)
		];
	}
	return WandSparkPositions;
}

const WritingSparkImageIndex = [
	6, 3, 0, 3, 6, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	4, 1, 4, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	8, 5, 2, 5, 8, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	6, 6, 3, 3, 0, 0, 3, 3, 3, 6, 6, 6, -1, 0, 0, 0,
	7, 7, 4, 4, 0, 0, 0, 4, 4, 7, 7, -1, 0, 0, 0, 0,
	8, 8, 8, 5, 5, 5, 0, 0, 0, 5, 5, 5, 8, 8, 8, -1,
	3, 0, 3, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	5, 0, 5, -1, 0, 64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
];

const Spark0ColorIndices = [
	9, 11, 13, 14, 13, 12, 12, 11, 10, 10, 9, 9, 10, 14, 12, 10,
	26, 28, 24, 26, 28, 14, 27, 26, 25, 14, 20, 9, -1
];

const Spark1ColorIndices = [
	9, 10, 11, 12, 11, 10, 9, 9, 9, 11, 14, 13, 12, 11, 10, 0,
	9, 10, 11, 12, 11, 10, 9, 9, 9, 11, 14, -1, -2, -3, 0
];

class WritingSparkDummy {
	constructor() {
		this.Index = 0;
		this.X = 0;
		this.Y = 0;
		this.FrameArrayIndex = 0; // into WritingSparkImageIndex
	}
}

class SparkSpriteDummy {
	constructor() {
		this.UpdateCommand = 0;
		this.X = 0;
		this.Y = 0;
		this.YStep = 0; // 1/16th of a line
		this.ColorIndex = 0;
		this.CurrentStep = 0;
	}

	NextStep(frames, actions, index) {
		this.CurrentStep += this.YStep;

		while (this.CurrentStep >= 16) {
			this.CurrentStep -= 16;

			if (++this.Y >= 256) {
				this.X = -1;
				break;
			}
		}

		this.Update(frames, actions, index);

		return this.X >= 0;
	}

	Update(frames, actions, index) {
		actions.Enqueue(new FantasyIntroAction(frames, this.UpdateCommand, index, this.X, this.Y));
	}
}

let graphicPalettes = null;
let paletteGraphicInfo = null;

function getPaletteGraphicInfo() {
	if (paletteGraphicInfo === null) {
		paletteGraphicInfo = new GraphicInfo();
		paletteGraphicInfo.Width = 32;
		paletteGraphicInfo.Height = 1;
		paletteGraphicInfo.GraphicFormat = GraphicFormat.XRGB16;
	}
	return paletteGraphicInfo;
}

function addUnique(map, key, value) {
	if (map.has(key))
		throw new ArgumentException('An item with the same key has already been added.');
	map.set(key, value);
}

export class FantasyIntroData {
	/** @param gameData Legacy GameData (uses gameData.Files: Map<string, IFileContainer>) */
	constructor(gameData) {
		this.actions = new Queue();
		this.fantasyIntroPalettes = [];
		this.graphics = new Map();

		const actions = this.actions;
		const fantasyIntroPalettes = this.fantasyIntroPalettes;
		const graphics = this.graphics;

		const fantasyIntroHunks = AmigaExecutable.Read(getValue(getValue(gameData.Files, 'Fantasy_intro').Files, 1))
			.filter(h => h.Type === AmigaExecutable.HunkType.Data).map(h => DataReader.FromData(h.Data));
		const graphicReader = new GraphicReader();
		let i;

		// #region Hunk 0 - Palettes and graphics

		const hunk0 = fantasyIntroHunks[0];

		function LoadPalette() {
			const paletteGraphic = new Graphic();
			graphicReader.ReadGraphic(paletteGraphic, hunk0, getPaletteGraphicInfo());
			return paletteGraphic;
		}

		function LoadGraphic(width, height, alpha, graphicFormat = GraphicFormat.Palette5Bit) {
			const graphicInfo = new GraphicInfo();
			graphicInfo.Width = width;
			graphicInfo.Height = height;
			graphicInfo.GraphicFormat = graphicFormat;
			graphicInfo.PaletteOffset = 0;
			graphicInfo.Alpha = alpha;
			const graphic = new Graphic();
			graphicReader.ReadGraphic(graphic, hunk0, graphicInfo);
			return graphic;
		}

		function AddGraphic(fantasyIntroGraphic, width, height, alpha) {
			const graphic = LoadGraphic(width, height, alpha);
			addUnique(graphics, fantasyIntroGraphic, graphic);
		}

		for (i = 0; i < 2; ++i)
			fantasyIntroPalettes.push(LoadPalette());

		AddGraphic(FantasyIntroGraphic.FairySparks, 32, 15, true);

		const fairyGraphic = new Graphic(384, 284, 0);

		for (let g = 0; g < 23; ++g) { // 23 frames
			const graphic = LoadGraphic(64, 71, true, GraphicFormat.AttachedSprite);
			fairyGraphic.AddOverlay((g % 6) * 64, Math.trunc(g / 6) * 71, graphic, false);
		}

		addUnique(graphics, FantasyIntroGraphic.Fairy, fairyGraphic);

		// unknown bytes (maybe copper instructions?)

		hunk0.Position = 0xD38C;
		AddGraphic(FantasyIntroGraphic.Background, 320, 256, false);
		AddGraphic(FantasyIntroGraphic.WritingSparks, 32, 108, true);
		AddGraphic(FantasyIntroGraphic.Writing, 208, 83, true);

		// unknown data

		hunk0.Position = 0x1CE22;
		const positionData = DataReader.FromData(hunk0.ReadBytes(761 * 4)); // 761 entries, each entry has x and y as word each

		// #endregion

		// #region Progress

		actions.Enqueue(new FantasyIntroAction(0, FantasyIntroCommand.FadeIn));

		let frames = 0;
		let fairyMode = 0; // 0: Move, 1: Special animation, 2: Wait in place (idle animation)
		let endTimer = 0;
		let spriteDelay = 0;
		let spriteIndex = 0;
		let writingPosition = -1;
		let spark0Delay = 0;
		let spriteSparkPosIndex = 0; // -1?
		let currentFairyX = -1;
		let currentFairyY = -1;
		let sparkPosX = 0;
		let sparkPosY = 0;
		let randomState = 17;
		const spark0Sprites = new Array(96).fill(null);
		const spark1Sprites = new Array(512).fill(null);
		const writingSparks = new Array(400).fill(null);

		function createSpark(updateCommand) {
			const spark = new SparkSpriteDummy();
			spark.X = -1;
			spark.UpdateCommand = updateCommand;
			return spark;
		}

		function createWritingSpark() {
			const spark = new WritingSparkDummy();
			spark.X = -1;
			return spark;
		}

		for (i = 0; i < 96; ++i) {
			spark0Sprites[i] = createSpark(FantasyIntroCommand.UpdateSparkLine);
			spark1Sprites[i] = createSpark(FantasyIntroCommand.UpdateSparkStar);
			writingSparks[i] = createWritingSpark();
		}

		for (; i < 400; ++i) {
			spark1Sprites[i] = createSpark(FantasyIntroCommand.UpdateSparkStar);
			writingSparks[i] = createWritingSpark();
		}

		for (; i < 512; ++i) {
			spark1Sprites[i] = createSpark(FantasyIntroCommand.UpdateSparkStar);
		}

		function Random() {
			const next = (randomState * 53527) >>> 0;
			randomState = next & 0xFFFF;
			return (next >>> 8) & 0x7FFF;
		}

		function AddSpark0(x, y) {
			if (x >= 0 && x < 312 && y >= 134 && y < 256) {
				const index = spark0Sprites.findIndex(s => s.X < 0);

				if (index !== -1) {
					const sparkSprite = spark0Sprites[index];
					sparkSprite.X = x;
					sparkSprite.Y = y;
					sparkSprite.CurrentStep = 0;

					let r = Random();
					sparkSprite.YStep = (2 * 16) + (r & 0x7);
					r = Random();
					sparkSprite.ColorIndex = (r % 11) << 1;

					sparkSprite.Update(frames, actions, index);

					let color = Spark0ColorIndices[sparkSprite.ColorIndex];
					if (color < 0)
						color = Spark0ColorIndices[0];
					actions.Enqueue(new FantasyIntroAction(frames, FantasyIntroCommand.SetSparkLineColor, index, color));
				}
			}
		}

		function AddSpark1(x, y) {
			const index = spark1Sprites.findIndex(s => s.X < 0);

			if (index !== -1) {
				const sparkSprite = spark1Sprites[index];
				const r = Random();
				sparkSprite.X = x + ((r & 0x60) >> 5);
				sparkSprite.Y = y;
				sparkSprite.YStep = 8 + (r & 0xf);
				sparkSprite.ColorIndex = (r & 0xe00) !== 0 ? 0 : 16;
				sparkSprite.CurrentStep = 0;

				sparkSprite.Update(frames, actions, index);
			}
		}

		function DrawFairySparks0() {
			const r = Random();
			let spawnDelay = r & 0x3;
			let index = 0;

			for (const spark of spark0Sprites) {
				if (spark.NextStep(frames, actions, index)) {
					let color = Spark0ColorIndices[spark.ColorIndex];
					if (color < 0) {
						color = Spark0ColorIndices[0];
						spark.ColorIndex = 1;
					} else {
						++spark.ColorIndex;
					}
					spark.Update(frames, actions, index);
					actions.Enqueue(new FantasyIntroAction(frames, FantasyIntroCommand.SetSparkLineColor, index, color));
					actions.Enqueue(new FantasyIntroAction(frames, FantasyIntroCommand.DrawSparkLine, index));
					if (--spawnDelay < 0) {
						spawnDelay += 3;
						AddSpark1(spark.X, spark.Y);
					}
				}

				++index;
			}
		}

		function DrawFairySparks1() {
			let index = 0;

			for (const spark of spark1Sprites) {
				if (spark.NextStep(frames, actions, index)) {
					const color = Spark1ColorIndices[spark.ColorIndex];
					if (color === 0) {
						spark.X = -1;
						spark.Update(frames, actions, index);
						// Note: C# 'continue' skips the ++index below as well.
						continue;
					}
					++spark.ColorIndex;
					if (color < 0) {
						if (spark.Y <= 250) {
							actions.Enqueue(new FantasyIntroAction(frames, FantasyIntroCommand.SetSparkStarFrame, index, -1 - color));
							actions.Enqueue(new FantasyIntroAction(frames, FantasyIntroCommand.DrawSparkStar, index));
						}
					} else {
						actions.Enqueue(new FantasyIntroAction(frames, FantasyIntroCommand.SetSparkDotColor, index, color));
						actions.Enqueue(new FantasyIntroAction(frames, FantasyIntroCommand.DrawSparkDot, index));
					}
				}

				++index;
			}
		}

		function AddWritingSpark(x, y, frameArrayIndex) {
			const index = writingSparks.findIndex(s => s.X < 0);

			if (index !== -1) {
				const sparkSprite = writingSparks[index];
				sparkSprite.Index = index;
				sparkSprite.X = x;
				sparkSprite.Y = y;
				sparkSprite.FrameArrayIndex = frameArrayIndex;
			}
		}

		function DrawWriting() {
			if (writingPosition >= 0) {
				if (writingPosition >= 64 && writingPosition < 272) {
					actions.Enqueue(new FantasyIntroAction(frames, FantasyIntroCommand.AddWritingPart));
				}

				for (let i = 0; i < 24; ++i) {
					let r = Random();
					const y = 140 + (r % 88);
					r = Random();
					const x = writingPosition + (r & 0x7) - 4;
					const frameArrayIndex = (r & 0xe0) >> 1;
					AddWritingSpark(x, y, frameArrayIndex);
				}

				writingPosition += 4;

				if (writingPosition >= 276) {
					writingPosition = -1;
					fairyMode = 0;
				}
			}

			for (const writingSpark of writingSparks.filter(s => s.X >= 0)) {
				const i = WritingSparkImageIndex[writingSpark.FrameArrayIndex];
				if (i < 0)
					writingSpark.X = -1;
				else
					++writingSpark.FrameArrayIndex;

				actions.Enqueue(new FantasyIntroAction(frames, FantasyIntroCommand.UpdateWritingSpark, writingSpark.Index, writingSpark.X, writingSpark.Y, i));
			}
		}

		let cycleCounter = 0;

		function Cycle() {
			++cycleCounter;

			if (fairyMode === 0 && endTimer <= 0) {
				const x = toShort(positionData.ReadWord());
				const y = toShort(positionData.ReadWord());

				if (x === 12345) {
					if (y >= 0) {
						fairyMode = 1;
						spriteSparkPosIndex = -1;
						actions.Enqueue(new FantasyIntroAction(frames, FantasyIntroCommand.PlayFairyAnimation));
					} else {
						endTimer = 133; // 133 frames till end
					}
				} else {
					currentFairyX = x;
					currentFairyY = y;
					actions.Enqueue(new FantasyIntroAction(frames, FantasyIntroCommand.MoveFairy, x, y));
				}
			}

			if (--spriteDelay < 0) {
				spriteDelay += 3;
				if (++spriteIndex === 4) {
					spriteIndex = 0;
				} else if (spriteIndex === 23) {
					spriteIndex = 0;
					fairyMode = 2;
					writingPosition = -110;
				}
				if (fairyMode === 1) {
					if (spriteSparkPosIndex >= 0)
						++spriteSparkPosIndex;
					if (spriteIndex === 3) {
						spriteIndex = 4;
						spriteSparkPosIndex = 0;
					}
				}
			}

			if (--spark0Delay < 0) {
				if (fairyMode === 0)
					spark0Delay += 2;
				else
					spark0Delay += 32;
				AddSpark0(currentFairyX + 19, currentFairyY + 17);
			}

			if (fairyMode === 1 && spriteSparkPosIndex >= 0 && spriteDelay === 0) {
				const sparkPosition = getWandSparkPositions()[spriteSparkPosIndex];
				const sparkX = currentFairyX + sparkPosition.X;
				const sparkY = currentFairyY + sparkPosition.Y;
				if (spriteIndex === 16) {
					sparkPosX = sparkX;
					sparkPosY = sparkY;
				}
				AddSpark0(sparkX, sparkY);
			}

			if (sparkPosX >= 0) {
				for (let i = 0; i < 6; ++i) {
					const r = Random();
					const x = sparkPosX + (r & 0xf);
					const y = sparkPosY + ((r & 0xf0) >> 4);
					AddSpark0(x, y);
				}
				sparkPosX += 6;
				sparkPosY += 1;
				if (sparkPosX >= 160)
					sparkPosX = -1;
			}

			if (writingPosition < -1) {
				if (++writingPosition === -1)
					writingPosition = 60;
			}
		}

		for (i = 0; i < 32; ++i) {
			Cycle();
			++frames;
		}

		while (true) {
			Cycle();
			cycleCounter = 0;
			DrawFairySparks0();
			DrawFairySparks1();
			DrawWriting();
			while (cycleCounter < 2) {
				++frames;
				Cycle();
			}

			++frames;

			// TODO: Remove later
			if (frames === 2 * 761)
				break;

			if (endTimer > 0) {
				// TODO: Maybe decrease by 2 here? Won't reach exactly 0 then as it starts at 133 at the end.
				endTimer -= 2;
				if (endTimer >= 16 && endTimer < 8)
					actions.Enqueue(new FantasyIntroAction(frames, FantasyIntroCommand.FadeOut));
				else if (endTimer <= 0)
					break; // Finished
			}
		}

		// #endregion
	}

	get Actions() {
		return new Queue(this.actions);
	}

	get FantasyIntroPalettes() {
		return this.fantasyIntroPalettes.slice();
	}

	static get GraphicPalettes() {
		if (graphicPalettes === null) {
			graphicPalettes = new Map([
				[FantasyIntroGraphic.FairySparks, 0],
				[FantasyIntroGraphic.Fairy, 0],
				[FantasyIntroGraphic.Background, 1],
				[FantasyIntroGraphic.WritingSparks, 0],
				[FantasyIntroGraphic.Writing, 0],
			]);
		}
		return graphicPalettes;
	}

	/** IReadOnlyDictionary<FantasyIntroGraphic, Graphic> (Map) */
	get Graphics() {
		return this.graphics;
	}
}
