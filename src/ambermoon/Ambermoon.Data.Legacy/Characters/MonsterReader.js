// Port of Ambermoon.Data.Legacy/Characters/MonsterReader.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { getValue } from '../../../runtime.js';
import { Monster } from '../../Ambermoon.Data.Common/Monster.js';
import { Graphic, GraphicInfo, GraphicFormat } from '../../Ambermoon.Data.Common/Graphic.js';
import { GraphicReader } from '../Serialization/GraphicReader.js';
import { CharacterReader } from './CharacterReader.js';

export class MonsterReader extends CharacterReader {
	/**
	 * MonsterReader(gameData) or MonsterReader()
	 */
	constructor(gameData = null) {
		super();
		this.gameData = gameData;
	}

	ReadMonster(monster, dataReader) {
		this.ReadCharacter(monster, dataReader);

		for (let i = 0; i < 8; ++i) {
			const animation = new Monster.Animation();
			animation.FrameIndices = dataReader.ReadBytes(32);
			monster.Animations[i] = animation;
		}

		for (const animation of monster.Animations)
			animation.UsedAmount = dataReader.ReadByte();

		monster.AtariPalette = dataReader.ReadBytes(16); // TODO
		monster.MonsterPalette = dataReader.ReadBytes(32);
		monster.AlternateAnimationBits = dataReader.ReadByte();
		monster.PaddingByte = dataReader.ReadByte();
		monster.FrameWidth = dataReader.ReadWord();
		monster.FrameHeight = dataReader.ReadWord();
		monster.MappedFrameWidth = dataReader.ReadWord();
		monster.MappedFrameHeight = dataReader.ReadWord();

		if (this.gameData != null)
			monster.CombatGraphic = this.LoadGraphic(monster);
	}

	LoadGraphic(monster) {
		const file = getValue(getValue(this.gameData.Files, 'Monster_gfx.amb').Files, monster.CombatGraphicIndex);
		file.Position = 0;
		const graphic = new Graphic();
		const graphicReader = new GraphicReader();
		const graphicInfo = new GraphicInfo();
		graphicInfo.Width = monster.FrameWidth;
		graphicInfo.Height = monster.FrameHeight;
		graphicInfo.GraphicFormat = GraphicFormat.Palette5Bit;
		graphicInfo.Alpha = true;
		graphicInfo.PaletteOffset = 0;
		const numFrames = Math.trunc(file.Size / Math.trunc((graphicInfo.Width * graphicInfo.Height * 5 + 7) / 8));
		const compoundGraphic = new Graphic(numFrames * monster.FrameWidth, monster.FrameHeight, 0);
		for (let i = 0; i < numFrames; ++i) {
			graphicReader.ReadGraphic(graphic, file, graphicInfo);
			compoundGraphic.AddOverlay(i * monster.FrameWidth, 0, graphic.CreateScaled(monster.FrameWidth, monster.FrameHeight), false);
		}
		for (let i = 0; i < compoundGraphic.Data.length; ++i)
			compoundGraphic.Data[i] = monster.MonsterPalette[compoundGraphic.Data[i] & 0x1f];
		return compoundGraphic;
	}
}
