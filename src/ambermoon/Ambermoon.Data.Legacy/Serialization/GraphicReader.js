// Port of Ambermoon.Data.Legacy/Serialization/GraphicReader.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { GraphicFormat } from '../../Ambermoon.Data.Common/Graphic.js';
import { ArgumentNullException, Exception } from '../../../runtime.js';

function ToNextBoundary(size) {
	return size % 8 === 0 ? size : size + (8 - size % 8);
}

function ReadPaletteGraphic(graphic, dataReader, planes, graphicInfo, pixelsPerPlane = null) {
	graphic.Width = graphicInfo.Width;
	graphic.Height = graphicInfo.Height;

	const ppp = pixelsPerPlane ?? graphicInfo.Width;
	const calcWidth = ToNextBoundary(ppp);
	const planeSize = Math.trunc((calcWidth + 7) / 8);
	const scanLine = ToNextBoundary(graphic.Width);
	const sizeToRead = Math.trunc((scanLine * planes * graphic.Height + 7) / 8);
	const data = dataReader.ReadBytes(sizeToRead);
	let bitIndex = 0;
	let byteIndex = 0;
	let offset = 0;
	const planeCycles = ppp === graphicInfo.Width ? 1 : Math.trunc((graphic.Width + ppp - 1) / ppp);

	for (let y = 0; y < graphic.Height; ++y) {
		for (let n = 0; n < planeCycles; ++n) {
			for (let x = 0; x < ppp; ++x) {
				const mx = n * ppp + x;

				if (mx >= graphic.Width)
					break;

				let paletteIndex = 0;

				for (let p = 0; p < planes; ++p) {
					if ((data[offset + p * planeSize + byteIndex] & (1 << (7 - bitIndex))) !== 0)
						paletteIndex |= (1 << p);
				}

				paletteIndex = (paletteIndex + graphicInfo.PaletteOffset) & 0xff;

				if (graphicInfo.Alpha && paletteIndex === graphicInfo.PaletteOffset)
					graphic.Data[mx + y * graphic.Width] = graphicInfo.ColorKey;
				else
					graphic.Data[mx + y * graphic.Width] = paletteIndex;

				if (++bitIndex === 8) {
					bitIndex = 0;
					++byteIndex;
				}
			}

			offset += planes * planeSize;
			byteIndex = 0;
			bitIndex = 0;
		}
	}
}

export class GraphicReader {
	ReadGraphic(graphic, dataReader, graphicInfo, maskColor = 0) {
		// Legacy graphics need the graphicInfo.
		if (graphicInfo == null)
			throw new ArgumentNullException('Legacy graphics need information about the graphic to load.');

		graphic.Width = graphicInfo.Width;
		graphic.Height = graphicInfo.Height;

		switch (graphicInfo.GraphicFormat) {
			case GraphicFormat.Palette5Bit:
				graphic.IndexedGraphic = true;
				graphic.Data = new Uint8Array(graphic.Width * graphic.Height);
				ReadPaletteGraphic(graphic, dataReader, 5, graphicInfo);
				break;
			case GraphicFormat.Palette4Bit:
				graphic.IndexedGraphic = true;
				graphic.Data = new Uint8Array(graphic.Width * graphic.Height);
				ReadPaletteGraphic(graphic, dataReader, 4, graphicInfo);
				break;
			case GraphicFormat.Palette3Bit:
				graphic.IndexedGraphic = true;
				graphic.Data = new Uint8Array(graphic.Width * graphic.Height);
				ReadPaletteGraphic(graphic, dataReader, 3, graphicInfo);
				break;
			case GraphicFormat.Texture4Bit:
				graphic.IndexedGraphic = true;
				graphic.Data = new Uint8Array(graphic.Width * graphic.Height);
				ReadPaletteGraphic(graphic, dataReader, 4, graphicInfo, 8);
				break;
			case GraphicFormat.XRGB16:
				graphic.IndexedGraphic = false;
				graphic.Data = new Uint8Array(graphic.Width * graphic.Height * 4);
				for (let i = 0; i < graphic.Width * graphic.Height; ++i) {
					const color = dataReader.ReadWord();
					graphic.Data[i * 4 + 0] = (color >> 8) & 0x0f;
					graphic.Data[i * 4 + 1] = (color >> 4) & 0x0f;
					graphic.Data[i * 4 + 2] = color & 0x0f;
					graphic.Data[i * 4 + 3] = 255;

					graphic.Data[i * 4 + 0] |= (graphic.Data[i * 4 + 0] << 4) & 0xff;
					graphic.Data[i * 4 + 1] |= (graphic.Data[i * 4 + 1] << 4) & 0xff;
					graphic.Data[i * 4 + 2] |= (graphic.Data[i * 4 + 2] << 4) & 0xff;
				}
				break;
			case GraphicFormat.RGBA32:
				graphic.IndexedGraphic = false;
				graphic.Data = dataReader.ReadBytes(graphic.Width * graphic.Height * 4);
				break;
			case GraphicFormat.AttachedSprite: {
				// Attached sprites are two Amiga hardware sprites (2bpp each).
				//
				// word[2]           ControlWords
				// word[2 * Height]  Data (2 words for each pixel row)
				// long              Next pointer
				//
				// Each sprite has a width of 16 pixel. The first sprite gives the lower
				// 2 bits and the second sprite the higher 2 bits of a 4 bit color index.
				// The color index starts at 16 (transparent) and can otherwise have the
				// values 17 to 31.
				if (graphic.Width % 16 !== 0)
					throw new Exception('Attached sprites must have a width which is a multiple of 16.');
				if (graphic.Width > 64)
					throw new Exception('Attached sprites has a max width of 64 pixels.');
				graphic.IndexedGraphic = true;
				graphic.Data = new Uint8Array(graphic.Width * graphic.Height);
				const numSprites = Math.trunc(2 * graphic.Width / 16);
				for (let s = 0; s < numSprites; ++s) {
					// Skip the 2 control words
					dataReader.Position += 4;

					const line0Add = s % 2 === 0 ? 1 : 4;
					const line1Add = s % 2 === 0 ? 2 : 8;

					for (let y = 0; y < graphic.Height; ++y) {
						const line0 = dataReader.ReadWord();
						const line1 = dataReader.ReadWord();
						let mask = 0x8000;

						for (let x = 0; x < 16; ++x) {
							const index = Math.trunc(s / 2) * 16 + x + y * graphic.Width;
							let colorIndex = graphic.Data[index];

							if ((line0 & mask) !== 0)
								colorIndex |= line0Add;
							if ((line1 & mask) !== 0)
								colorIndex |= line1Add;

							graphic.Data[index] = colorIndex & 0xff;

							mask >>= 1;
						}
					}

					// Skip the next pointer
					dataReader.Position += 4;
				}

				// Adjust indices
				for (let i = 0; i < graphic.Data.length; ++i) {
					if (graphic.Data[i] !== 0)
						graphic.Data[i] = (graphic.Data[i] + 16) & 0xff;
				}
				break;
			}
			default:
				throw new Exception('Invalid legacy graphic format.');
		}

		if (maskColor !== 0) {
			graphic.ReplaceColor(0, 32);
			graphic.ReplaceColor(maskColor, 0);
		}
	}
}
