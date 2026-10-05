// Port of Ambermoon.Data.Legacy/ExecutableData/Glyphs.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { Graphic } from '../../Ambermoon.Data.Common/Graphic.js';

// German 1.05: 0x51e8
export class Glyphs {
	static Count = 94;

	constructor(dataReader) {
		this.entries = [];

		for (let i = 0; i < Glyphs.Count; ++i) {
			// Each glyph is stored as 5 bytes.
			// Each byte provides pixel data in
			// their 5 most-significant bits.
			// But we read 6 to add some space.
			// So a glyph is 6x5 pixels in size.
			// We add an empty bottom line too.

			const graphic = new Graphic();
			graphic.Width = 6;
			graphic.Height = 6;
			graphic.Data = new Uint8Array(6 * 6);
			graphic.IndexedGraphic = true;

			// We will use 2 color indices (index 0 -> transparent, index 1 -> text color).
			// When rendering the text index 1 should be replaced by the text color.
			// The text shadow should be rendered as black text with offset 1,1.
			for (let y = 0; y < 5; ++y) {
				let line = dataReader.ReadByte();

				for (let x = 0; x < 6; ++x) {
					graphic.Data[x + y * 6] = (line & 0x80) >> 7;
					line = (line << 1) & 0xff;
				}
			}

			this.entries.push(graphic);
		}
	}

	get Entries() { return this.entries; }
}
