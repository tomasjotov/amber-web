// Port of Ambermoon.Data.Legacy/ExecutableData/DigitGlyphs.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { Graphic } from '../../Ambermoon.Data.Common/Graphic.js';

// German 1.05: 0x4315 to 0x4346 has the small digits (4 msb in each byte are the 4 pixels of each of the 5 lines of a digit)
export class DigitGlyphs {
	static Count = 10;

	constructor(dataReader) {
		this.entries = [];

		for (let i = 0; i < DigitGlyphs.Count; ++i) {
			// Each glyph is stored as 5 bytes.
			// Each byte provides pixel data in
			// their 4 most-significant bits.
			// But we read 5 to add some space.
			// So a digit glyph is 5x5 pixels in size.

			const graphic = new Graphic();
			graphic.Width = 5;
			graphic.Height = 5;
			graphic.Data = new Uint8Array(5 * 5);
			graphic.IndexedGraphic = true;

			// We will use 2 color indices (index 0 -> transparent, index 1 -> text color).
			// When rendering the text index 1 should be replaced by the text color.
			for (let y = 0; y < 5; ++y) {
				let line = dataReader.ReadByte();

				for (let x = 0; x < 5; ++x) {
					graphic.Data[x + y * 5] = (line & 0x80) >> 7;
					line = (line << 1) & 0xff;
				}
			}

			this.entries.push(graphic);
		}
	}

	get Entries() { return this.entries; }
}
