// Port of Ambermoon.Data.Legacy/ExecutableData/Cursors.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { toShort } from '../../../runtime.js';
import { Graphic, GraphicInfo, GraphicFormat } from '../../Ambermoon.Data.Common/Graphic.js';
import { GraphicReader } from '../Serialization/GraphicReader.js';

export class Cursor {
	constructor() {
		this.HotspotX = 0;
		this.HotspotY = 0;
		this.Graphic = null;
	}
}

// German 1.05: 0x53be
export class Cursors {
	static Count = 28;

	constructor(dataReader) {
		this.entries = [];

		const graphicReader = new GraphicReader();
		const graphicInfo = new GraphicInfo();
		graphicInfo.Width = 16;
		graphicInfo.Height = 16;
		graphicInfo.Alpha = true;
		graphicInfo.GraphicFormat = GraphicFormat.Palette3Bit;
		graphicInfo.PaletteOffset = 24;

		function ReadGraphic() {
			const graphic = new Graphic();

			graphicReader.ReadGraphic(graphic, dataReader, graphicInfo);

			return graphic;
		}

		for (let i = 0; i < Cursors.Count; ++i) {
			const cursor = new Cursor();
			cursor.HotspotX = toShort(dataReader.ReadWord());
			cursor.HotspotY = toShort(dataReader.ReadWord());
			cursor.Graphic = ReadGraphic();
			this.entries.push(cursor);
		}
	}

	get Entries() { return this.entries; }
}
