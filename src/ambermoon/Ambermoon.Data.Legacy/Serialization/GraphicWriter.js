// Port of Ambermoon.Data.Legacy/Serialization/GraphicWriter.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { GraphicFormat } from '../../Ambermoon.Data.Common/Graphic.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { NotImplementedException, NotSupportedException } from '../../../runtime.js';

function WritePixelGraphic(dataWriter, width, height, data, bytesPerPixel) {
	if (data.length !== width * height * bytesPerPixel)
		throw new AmbermoonException(ExceptionScope.Data, 'Image data sizes does not match the given dimensions and color format.');

	dataWriter.Write(data);
}

function ToPixelData16(graphic, palette, alpha) {
	const data = new Uint8Array(graphic.Width * graphic.Height * 2);
	const alphaIndex = alpha ? 0 : 0xff;

	for (let y = 0; y < graphic.Height; ++y) {
		for (let x = 0; x < graphic.Width; ++x) {
			const i = x + y * graphic.Width;
			const index = graphic.Data[i];

			if (index !== alphaIndex) {
				const r = palette.Data[i * 4 + 0];
				const g = palette.Data[i * 4 + 1];
				const b = palette.Data[i * 4 + 2];
				const a = palette.Data[i * 4 + 3];
				const ar = ((a & 0xf0) | (r >> 4)) & 0xff;
				const gb = ((g & 0xf0) | (b >> 4)) & 0xff;
				data[i * 2 + 0] = ar;
				data[i * 2 + 1] = gb;
			}
		}
	}

	return data;
}

function ToPixelData32(graphic, palette, alpha) {
	return graphic.ToPixelData(palette, alpha ? 0 : 0xff);
}

function ToNextBoundary(size) {
	return size % 8 === 0 ? size : size + (8 - size % 8);
}

function WritePaletteGraphic(graphic, dataWriter, planes, graphicInfo, pixelsPerPlane = null) {
	if (pixelsPerPlane === 0)
		throw new AmbermoonException(ExceptionScope.Data, 'A value of 0 for pixelsPerPlane is not allowed.');

	const numChunks = pixelsPerPlane == null ? 1 : Math.trunc((graphic.Width + 7) / pixelsPerPlane);
	const calcWidth = ToNextBoundary(pixelsPerPlane ?? graphicInfo.Width);

	for (let y = 0; y < graphic.Height; ++y) {
		for (let n = 0; n < numChunks; ++n) {
			const xOffset = pixelsPerPlane == null ? 0 : n * pixelsPerPlane;

			for (let p = 0; p < planes; ++p) {
				const pmask = 1 << p;
				let b = 0;

				for (let x = 0; x < calcWidth; ++x) {
					const realX = xOffset + x;

					if (realX >= graphic.Width) {
						dataWriter.WriteByte(b);
						break;
					}

					const index = graphic.Data[realX + y * graphic.Width];
					const bit = 7 - x % 8;

					if ((index & pmask) !== 0)
						b = (b | (1 << bit)) & 0xff;

					if (bit === 0) {
						dataWriter.WriteByte(b);
						b = 0;
					}
				}
			}
		}
	}
}

export class GraphicWriter {
	static WriteGraphic(graphic, dataWriter, graphicInfo, maskColor = 0, palette = null) {
		if (graphicInfo.Width !== graphic.Width || graphicInfo.Height !== graphic.Height)
			throw new AmbermoonException(ExceptionScope.Data, 'Graphic dimensions do not match the given graphic info dimensions.');

		if (graphic.Width === 0 && graphic.Height === 0)
			return; // Nothing to write

		// Copy the graphic as we might change the data
		graphic = graphic.Clone();

		if (maskColor !== 0) {
			if (!graphic.IndexedGraphic)
				throw new AmbermoonException(ExceptionScope.Data, 'Non-indexed graphic can not use a mask color index.');

			graphic.ReplaceColor(0, maskColor);
			graphic.ReplaceColor(32, 0);
		}

		switch (graphicInfo.GraphicFormat) {
			case GraphicFormat.Palette3Bit:
			case GraphicFormat.Palette4Bit:
			case GraphicFormat.Palette5Bit:
			case GraphicFormat.Texture4Bit:
				if (!graphic.IndexedGraphic)
					throw new AmbermoonException(ExceptionScope.Data, 'Non-indexed graphic can not be written as bit-planar images.');
				WritePaletteGraphic(graphic, dataWriter, graphicInfo.BitsPerPixel, graphicInfo, graphicInfo.GraphicFormat === GraphicFormat.Texture4Bit ? 8 : null);
				break;
			case GraphicFormat.XRGB16:
				if (graphic.IndexedGraphic && palette == null)
					throw new AmbermoonException(ExceptionScope.Data, 'To store an indexed graphic as XRGB16 a palette is needed.');
				WritePixelGraphic(dataWriter, graphic.Width, graphic.Height, graphic.IndexedGraphic ? ToPixelData16(graphic, palette, graphicInfo.Alpha) : graphic.Data, 2);
				break;
			case GraphicFormat.RGBA32:
				if (graphic.IndexedGraphic && palette == null)
					throw new AmbermoonException(ExceptionScope.Data, 'To store an indexed graphic as RGBA32 a palette is needed.');
				WritePixelGraphic(dataWriter, graphic.Width, graphic.Height, graphic.IndexedGraphic ? ToPixelData32(graphic, palette, graphicInfo.Alpha) : graphic.Data, 4);
				break;
			case GraphicFormat.AttachedSprite:
				throw new NotImplementedException('Attached sprite saving is not implemented yet.');
			default:
				throw new NotSupportedException('Invalid legacy graphic format.');
		}
	}
}
