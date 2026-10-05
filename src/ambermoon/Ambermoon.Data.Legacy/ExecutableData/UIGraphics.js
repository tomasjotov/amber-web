// Port of Ambermoon.Data.Legacy/ExecutableData/UIGraphics.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { ArgumentException, getValue } from '../../../runtime.js';
import { UIGraphic } from '../../Ambermoon.Data.Common/Enumerations/UIGraphic.js';
import { Graphic, GraphicInfo, GraphicFormat } from '../../Ambermoon.Data.Common/Graphic.js';
import { GraphicReader } from '../Serialization/GraphicReader.js';

// Dictionary.Add (throws on duplicate keys)
function add(map, key, value) {
	if (map.has(key))
		throw new ArgumentException('An item with the same key has already been added.');
	map.set(key, value);
}

export class UIGraphics {
	constructor(dataReader) {
		this.entries = new Map();
		const entries = this.entries;

		const graphicReader = new GraphicReader();
		const graphicInfo = new GraphicInfo();
		graphicInfo.Width = 16;
		graphicInfo.Height = 16;
		graphicInfo.Alpha = true;
		graphicInfo.GraphicFormat = GraphicFormat.Palette3Bit;
		graphicInfo.PaletteOffset = 24;

		function ReadGraphic(dataReader, maskColor = 0) {
			const graphic = new Graphic();

			graphicReader.ReadGraphic(graphic, dataReader, graphicInfo, maskColor);

			return graphic;
		}

		function ReadOpaqueGraphic(dataReader) {
			const graphic = new Graphic();

			graphicReader.ReadGraphic(graphic, dataReader, graphicInfo);
			graphic.ReplaceColor(0, 32);

			return graphic;
		}

		// Now 32 bytes follow where each of the 256 bits indicates (1) black or (0) transparent.
		const graphicData = new Uint8Array(256);
		for (let y = 0; y < 16; ++y) {
			let bits = dataReader.ReadWord();

			for (let x = 0; x < 16; ++x) {
				if ((bits & 0x8000) !== 0)
					graphicData[y * 16 + x] = 28;
				bits = (bits << 1) & 0xffff;
			}
		}
		const disabledOverlay = new Graphic();
		disabledOverlay.Data = graphicData;
		disabledOverlay.Width = 16;
		disabledOverlay.Height = 16;
		disabledOverlay.IndexedGraphic = true;
		add(entries, UIGraphic.DisabledOverlay16x16, disabledOverlay);
		// Then real 3-bit graphics follow.
		// window frames
		add(entries, UIGraphic.FrameUpperLeft, ReadGraphic(dataReader));
		add(entries, UIGraphic.FrameLeft, ReadGraphic(dataReader));
		add(entries, UIGraphic.FrameLowerLeft, ReadGraphic(dataReader));
		add(entries, UIGraphic.FrameTop, ReadGraphic(dataReader));
		add(entries, UIGraphic.FrameBottom, ReadGraphic(dataReader));
		add(entries, UIGraphic.FrameUpperRight, ReadGraphic(dataReader));
		add(entries, UIGraphic.FrameRight, ReadGraphic(dataReader));
		add(entries, UIGraphic.FrameLowerRight, ReadGraphic(dataReader));

		graphicInfo.GraphicFormat = GraphicFormat.Palette5Bit;
		graphicInfo.PaletteOffset = 0;
		for (let i = UIGraphic.StatusDead; i <= UIGraphic.StatusRangeAttack; ++i) {
			add(entries, i, ReadGraphic(dataReader));
		}

		graphicInfo.Width = 32;
		graphicInfo.Height = 29;
		graphicInfo.GraphicFormat = GraphicFormat.Palette5Bit;
		graphicInfo.PaletteOffset = 0;
		add(entries, UIGraphic.Eagle, ReadGraphic(dataReader));
		graphicInfo.Height = 26;
		add(entries, UIGraphic.DamageSplash, ReadGraphic(dataReader));
		graphicInfo.Height = 23;
		graphicInfo.GraphicFormat = GraphicFormat.Palette3Bit;
		graphicInfo.PaletteOffset = 24;
		add(entries, UIGraphic.Ouch, ReadGraphic(dataReader));
		graphicInfo.Width = 16;
		graphicInfo.Height = 9;
		graphicInfo.GraphicFormat = GraphicFormat.Palette5Bit;
		graphicInfo.PaletteOffset = 0;
		const frames = new Graphic(64, 9, 0);
		for (let i = 0; i < 4; ++i)
			frames.AddOverlay(i * 16, 0, ReadGraphic(dataReader), false);
		add(entries, UIGraphic.StarBlinkAnimation, frames);
		graphicInfo.GraphicFormat = GraphicFormat.Palette3Bit;
		graphicInfo.PaletteOffset = 24;
		graphicInfo.Height = 40;
		add(entries, UIGraphic.PlusBlinkAnimation, ReadGraphic(dataReader));
		graphicInfo.Height = 36;
		add(entries, UIGraphic.LeftPortraitBorder, ReadGraphic(dataReader));
		add(entries, UIGraphic.CharacterValueBarFrames, ReadGraphic(dataReader));
		add(entries, UIGraphic.RightPortraitBorder, ReadGraphic(dataReader));
		graphicInfo.Height = 1;
		add(entries, UIGraphic.SmallBorder1, ReadGraphic(dataReader));
		add(entries, UIGraphic.SmallBorder2, ReadGraphic(dataReader));
		graphicInfo.Height = 16;
		for (let i = UIGraphic.Candle; i <= UIGraphic.Map; ++i)
			add(entries, i, ReadOpaqueGraphic(dataReader));

		graphicInfo.Width = 32;
		graphicInfo.Height = 15;
		add(entries, UIGraphic.Windchain, ReadOpaqueGraphic(dataReader));
		graphicInfo.Height = 32;
		add(entries, UIGraphic.MonsterEyeInactive, ReadOpaqueGraphic(dataReader));
		add(entries, UIGraphic.MonsterEyeActive, ReadOpaqueGraphic(dataReader));
		add(entries, UIGraphic.Night, ReadOpaqueGraphic(dataReader));
		add(entries, UIGraphic.Dusk, ReadOpaqueGraphic(dataReader));
		add(entries, UIGraphic.Day, ReadOpaqueGraphic(dataReader));
		add(entries, UIGraphic.Dawn, ReadOpaqueGraphic(dataReader));

		graphicInfo.Height = 17;
		graphicInfo.Alpha = true;
		add(entries, UIGraphic.ButtonFrame, ReadGraphic(dataReader));
		add(entries, UIGraphic.ButtonFramePressed, ReadGraphic(dataReader));
		// Note: There is a 1-bit mask here where a 0 bit means transparent (keep color) and 1 means overlay.
		// As we use this for buttons we will set the color as the button back color (28).
		// The disable overlay is 32x11 in size.
		const disableOverlay = new Graphic(32, 11, 0);
		for (let y = 0; y < 11; ++y) {
			let bits = dataReader.ReadDword();

			for (let x = 0; x < 32; ++x) {
				if ((bits & 0x80000000) !== 0)
					disableOverlay.Data[y * 32 + x] = 28;
				bits = (bits << 1) >>> 0;
			}
		}
		add(entries, UIGraphic.ButtonDisabledOverlay, disableOverlay);
		graphicInfo.Width = 32;
		graphicInfo.Height = 32;
		add(entries, UIGraphic.Compass, ReadOpaqueGraphic(dataReader));
		graphicInfo.Width = 16;
		graphicInfo.Height = 9;
		add(entries, UIGraphic.Attack, ReadGraphic(dataReader));
		add(entries, UIGraphic.Defense, ReadGraphic(dataReader));
		graphicInfo.Width = 32;
		graphicInfo.Height = 34;
		add(entries, UIGraphic.Skull, ReadGraphic(dataReader, 25));
		add(entries, UIGraphic.EmptyCharacterSlot, ReadOpaqueGraphic(dataReader));
		graphicInfo.Width = 16;
		graphicInfo.Height = 16;
		graphicInfo.GraphicFormat = GraphicFormat.Palette3Bit;
		graphicInfo.PaletteOffset = 0;
		const compoundGraphic = new Graphic(176, 16, 0);
		for (let i = 0; i < 11; ++i)
			compoundGraphic.AddOverlay(i * 16, 0, ReadGraphic(dataReader), false);
		add(entries, UIGraphic.ItemConsume, compoundGraphic);
		graphicInfo.Width = 32;
		graphicInfo.Height = 29;
		graphicInfo.GraphicFormat = GraphicFormat.Palette5Bit;
		graphicInfo.PaletteOffset = 0;
		add(entries, UIGraphic.Talisman, ReadGraphic(dataReader));
		const unused = new Graphic(16, 13, 0);
		for (let y = 0; y < 13; ++y) {
			let bits = dataReader.ReadWord();

			for (let x = 0; x < 16; ++x) {
				if ((bits & 0x8000) !== 0)
					unused.Data[y * 16 + x] = 28;
				bits = (bits << 1) & 0xffff;
			}
		}
		add(entries, UIGraphic.Unused, unused);
		const brokenOverlay = new Graphic(16, 16, 0);
		for (let y = 0; y < 16; ++y) {
			let bits = dataReader.ReadWord();

			for (let x = 0; x < 16; ++x) {
				if ((bits & 0x8000) !== 0)
					brokenOverlay.Data[y * 16 + x] = 26;
				bits = (bits << 1) & 0xffff;
			}
		}
		add(entries, UIGraphic.BrokenItemOverlay, brokenOverlay); // TODO: use it

		if (dataReader.PeekWord() === 0xCA75) {
			dataReader.Position += 2;
			graphicInfo.Width = 32;
			graphicInfo.Height = 34;
			graphicInfo.GraphicFormat = GraphicFormat.Palette3Bit;
			graphicInfo.PaletteOffset = 24;
			graphicInfo.Alpha = true;
			add(entries, UIGraphic.CatSkull, ReadGraphic(dataReader, 25));
		}
		else {
			add(entries, UIGraphic.CatSkull, getValue(entries, UIGraphic.Skull));
		}
	}

	get Entries() { return this.entries; }
}
