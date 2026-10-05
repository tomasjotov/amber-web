// Port of Ambermoon.Data.Common/Graphic.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { ArgumentNullException, ArgumentOutOfRangeException, IndexOutOfRangeException, sum, max } from '../../runtime.js';
import { Util } from '../Ambermoon.Common/Util.js';
import { AmbermoonException, ExceptionScope } from '../Ambermoon.Common/Exception.js';

export const GraphicFormat = Object.freeze({
	Palette5Bit: 0,
	Palette4Bit: 1,
	Palette3Bit: 2,
	Texture4Bit: 3,
	XRGB16: 4,
	RGBA32: 5,
	AttachedSprite: 6
});

export class GraphicInfo {
	constructor() {
		this.GraphicFormat = GraphicFormat.Palette5Bit;
		this.Width = 0;
		this.Height = 0;
		this.Alpha = false;
		this.PaletteOffset = 0;
		this.ColorKey = 0;
	}

	clone() {
		return Object.assign(new GraphicInfo(), this);
	}

	get BitsPerPixel() {
		switch (this.GraphicFormat) {
			case GraphicFormat.Palette5Bit: return 5;
			case GraphicFormat.Palette4Bit: return 4;
			case GraphicFormat.Palette3Bit: return 3;
			case GraphicFormat.Texture4Bit: return 4;
			case GraphicFormat.XRGB16: return 16;
			case GraphicFormat.RGBA32: return 32;
			case GraphicFormat.AttachedSprite: return 4;
			default: throw new ArgumentOutOfRangeException('Invalid graphic format');
		}
	}

	get DataSize() { return Math.trunc((this.Width * this.Height * this.BitsPerPixel + 7) / 8); }
}

export class Graphic {
	/**
	 * new Graphic(), new Graphic(other), new Graphic(width, height, colorIndex)
	 */
	constructor(a, b, c) {
		this.Width = 0;
		this.Height = 0;
		this.Data = null;
		this.IndexedGraphic = false;

		if (arguments.length === 1) {
			const other = a;
			this.Width = other.Width;
			this.Height = other.Height;
			this.Data = new Uint8Array(other.Data.length);
			this.Data.set(other.Data);
			this.IndexedGraphic = other.IndexedGraphic;
		} else if (arguments.length >= 3) {
			const width = a;
			const height = b;
			const colorIndex = c;
			this.Width = width;
			this.Height = height;
			this.Data = new Uint8Array(this.Width * this.Height);
			this.IndexedGraphic = true;

			this.Data.fill(colorIndex);
		}
	}

	Clone() {
		const dataCopy = new Uint8Array(this.Data.length);
		dataCopy.set(this.Data);
		const graphic = new Graphic();
		graphic.Width = this.Width;
		graphic.Height = this.Height;
		graphic.Data = dataCopy;
		graphic.IndexedGraphic = this.IndexedGraphic;
		return graphic;
	}

	/** CreateScaled(factor) or CreateScaled(width, height) */
	CreateScaled(a, b) {
		if (arguments.length >= 2)
			return this.CreateScaledToSize(a, b);

		const factor = Math.fround(a);

		if (Util.FloatEqual(factor, 1.0))
			return this;

		if (Util.FloatEqual(factor, 0.0) || this.Width === 0 || this.Height === 0)
			return new Graphic(0, 0, 0);

		const newWidth = Util.Floor(Math.fround(factor * this.Width));
		const newHeight = Util.Floor(Math.fround(factor * this.Height));

		const graphic = new Graphic(newWidth, newHeight, 0);
		graphic.IndexedGraphic = this.IndexedGraphic;

		for (let y = 0; y < newHeight; ++y) {
			for (let x = 0; x < newWidth; ++x) {
				const sourceX = Math.min(Util.Round(Math.fround(x / factor)), this.Width - 1);
				const sourceY = Math.min(Util.Round(Math.fround(y / factor)), this.Height - 1);
				graphic.Data[x + y * newWidth] = this.Data[sourceX + sourceY * this.Width];
			}
		}

		return graphic;
	}

	/** Helper for the CreateScaled(width, height) overload. */
	CreateScaledToSize(width, height) {
		if (width === this.Width && height === this.Height)
			return this;

		if (this.Width === 0 || this.Height === 0 || width === 0 || height === 0)
			return new Graphic(0, 0, 0);

		const graphic = new Graphic(width, height, 0);
		graphic.IndexedGraphic = this.IndexedGraphic;

		const xFactor = Math.fround(width / this.Width);
		const yFactor = Math.fround(height / this.Height);

		for (let y = 0; y < height; ++y) {
			for (let x = 0; x < width; ++x) {
				const sourceX = Math.min(Util.Round(Math.fround(x / xFactor)), this.Width - 1);
				const sourceY = Math.min(Util.Round(Math.fround(y / yFactor)), this.Height - 1);
				graphic.Data[x + y * width] = this.Data[sourceX + sourceY * this.Width];
			}
		}

		return graphic;
	}

	ReplaceColor(oldColorIndex, newColorIndex) {
		for (let i = 0; i < this.Data.length; ++i) {
			if (this.Data[i] === oldColorIndex)
				this.Data[i] = newColorIndex;
		}
	}

	GetArea(x, y, width, height) {
		if (!this.IndexedGraphic)
			throw new AmbermoonException(ExceptionScope.Application, 'GetArea cannot be used on non-indexed graphics.');

		if (x < 0 || y < 0 || x + width > this.Width || y + height > this.Height)
			throw new AmbermoonException(ExceptionScope.Application, 'Invalid area provided for Graphic.GetArea.');

		const graphic = new Graphic(width, height, 0);

		for (let ty = 0; ty < height; ++ty) {
			let sx = x;

			for (let tx = 0; tx < width; ++tx, ++sx) {
				graphic.Data[tx + ty * width] = this.Data[sx + y * this.Width];
			}

			++y;
		}

		return graphic;
	}

	/** int and uint overloads are identical */
	AddOverlay(x, y, overlay, blend = true) {
		if (!overlay.IndexedGraphic || !this.IndexedGraphic)
			throw new AmbermoonException(ExceptionScope.Application, 'Non-indexed graphics can not be used with overlays.');

		if (x + overlay.Width > this.Width || y + overlay.Height > this.Height)
			throw new IndexOutOfRangeException('Overlay is outside the bounds.');

		for (let r = 0; r < overlay.Height; ++r) {
			for (let c = 0; c < overlay.Width; ++c) {
				const index = overlay.Data[c + r * overlay.Width];

				if (!blend || index !== 0)
					this.Data[x + c + (y + r) * this.Width] = index;

				// In original the blend mode seems to be like this:
				//   mask = ~max(overlayA | overlayR | overlayG | overlayB)
				//   wallColor & colorARGB(mask, mask, mask, mask) | overlayColor
				// If graphics always are fully opaque or fully transparent (r,g,b,a = 0,0,0,0) this means blending
				// algorithm is like we do already with palette index 0.
			}
		}
	}

	static Concat(...graphics) {
		if (graphics.length === 1 && Array.isArray(graphics[0]))
			graphics = graphics[0];

		const concatGraphic = new Graphic(sum(graphics, g => g.Width), max(graphics, g => g.Height), 0);
		let x = 0;

		for (const graphic of graphics) {
			concatGraphic.AddOverlay(x, 0, graphic, false);
			x += graphic.Width;
		}

		return concatGraphic;
	}

	static FromIndexedData(width, height, data) {
		if (data == null)
			throw new ArgumentNullException('data');

		if (data.length !== width * height)
			throw new IndexOutOfRangeException('Invalid graphic data size.');

		const graphic = new Graphic();
		graphic.Width = width;
		graphic.Height = height;
		graphic.Data = data;
		graphic.IndexedGraphic = true;
		return graphic;
	}

	static CreateGradient(width, height, startY, rowsPerIncrease, colorIndex, endColorIndex) {
		const graphic = new Graphic(width, height, colorIndex);
		graphic.IndexedGraphic = true;

		for (let y = startY; y < height; ++y) {
			if (colorIndex < endColorIndex && (y - startY) % rowsPerIncrease === 0)
				colorIndex = (colorIndex + 1) & 0xff;

			graphic.Data.fill(colorIndex, y * width, y * width + width);
		}

		return graphic;
	}

	ToPixelData(palette, alphaIndex = 0) {
		if (this.IndexedGraphic) {
			if (palette == null)
				throw new ArgumentNullException('palette');

			const data = new Uint8Array(this.Width * this.Height * 4);

			for (let i = 0; i < this.Width * this.Height; ++i) {
				let index = this.Data[i];

				if (index !== alphaIndex) {
					index %= 32;

					for (let c = 0; c < 4; ++c)
						data[i * 4 + c] = palette.Data[index * 4 + c];
				}
			}

			return data;
		} else {
			return this.Data;
		}
	}
}

export class GraphicBuilder {
	constructor(width, height) {
		this.width = width;
		this.height = height;
		/** array of [Rect, colorIndex] */
		this.coloredAreas = [];
	}

	static Create(width, height) {
		return new GraphicBuilder(width, height);
	}

	/** AddColoredArea(area, colorIndex) or AddColoredArea(area, Color) (same in JS) */
	AddColoredArea(area, colorIndex) {
		this.coloredAreas.push([area, colorIndex & 0xff]);
		return this;
	}

	Build() {
		const graphic = new Graphic(this.width, this.height, 0);
		graphic.IndexedGraphic = true;

		for (const [Key, Value] of this.coloredAreas) {
			const areaX = Key.Left;
			const areaY = Key.Top;
			const areaWidth = Key.Width;
			const areaHeight = Key.Height;

			for (let y = 0; y < areaHeight; ++y) {
				for (let x = 0; x < areaWidth; ++x) {
					graphic.Data[areaX + x + (areaY + y) * this.width] = Value;
				}
			}
		}

		return graphic;
	}
}
