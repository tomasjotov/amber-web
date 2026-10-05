// Port of Ambermoon.Data.Legacy/ExecutableData/Buttons.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { ArgumentException } from '../../../runtime.js';
import { ButtonType } from '../../Ambermoon.Data.Common/Enumerations/ButtonType.js';
import { Graphic, GraphicInfo, GraphicFormat } from '../../Ambermoon.Data.Common/Graphic.js';
import { GraphicReader } from '../Serialization/GraphicReader.js';

// Enum.GetValues: all values ordered by their unsigned value
const getValues = enumObject => Object.values(enumObject).sort((a, b) => (a >>> 0) - (b >>> 0));
// Dictionary.Add (throws on duplicate keys)
function add(map, key, value) {
	if (map.has(key))
		throw new ArgumentException('An item with the same key has already been added.');
	map.set(key, value);
}

// Note: The cursors (like eye, hand, etc) don't use the same images
// as the buttons! This is also true for arrows etc.
// There are 78 buttons, 32x13 pixels each. They have transparent areas
// left and right and they only contain the inner
// graphic. The button frame is drawn separately.
export class Buttons {
	// Second data hunk, right behind UITexts.
	constructor(dataReader) {
		this.entries = new Map();

		const graphicInfo = new GraphicInfo();
		graphicInfo.Width = 32;
		graphicInfo.Height = 13;
		graphicInfo.Alpha = true;
		graphicInfo.GraphicFormat = GraphicFormat.Palette3Bit;
		graphicInfo.PaletteOffset = 24;
		const graphicReader = new GraphicReader();

		function ReadGraphic(dataReader) {
			const graphic = new Graphic();

			graphicReader.ReadGraphic(graphic, dataReader, graphicInfo);

			return graphic;
		}

		for (const buttonType of getValues(ButtonType))
			add(this.entries, buttonType, ReadGraphic(dataReader));

		dataReader.AlignToWord();
	}

	get Entries() { return this.entries; }
}
