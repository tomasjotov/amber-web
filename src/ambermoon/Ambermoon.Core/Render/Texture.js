// Port of Ambermoon.Core/Render/Texture.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// Note: IMinimapTextureFactory is a pure interface and therefore not ported.

const PixelFormat = Object.freeze({
	RGBA8: 0,
	BGRA8: 1,
	RGB8: 2,
	BGR8: 3,
	Alpha: 4,
	RGB5A1: 5,
	R5G6B5: 6,
	BGR5A1: 7,
	B5G6R5: 8
});

export class Texture {
	static PixelFormat = PixelFormat;

	static BytesPerPixel = [
		4,
		4,
		3,
		3,
		1,
		2,
		2,
		2,
		2
	];

	get Width() { throw new Error('abstract'); }
	get Height() { throw new Error('abstract'); }

	static Convert16BitColorWithAlpha(pixelData) {
		const numPixels = Math.trunc(pixelData.length / 2); // 16 bits (2 bytes) per pixel
		const buffer = new Uint8Array(numPixels * 4); // new format has 4 components (RGBA) one byte each

		// Note: RGBA can also be BGRA. The comments below are for RGBA.
		// The order is the same in source and destination so the same
		// code can be used. Only the meaning of the bytes is different.

		for (let i = 0; i < numPixels; ++i) {
			const b1 = pixelData[i * 2 + 0];
			const b2 = pixelData[i * 2 + 1];

			// Byte1     Byte2
			// RRRRRGGG  GGBBBBBA
			buffer[i * 4 + 0] = ((b1 >> 3) * 8 + 4) & 0xff; // R
			buffer[i * 4 + 1] = ((((b1 & 0x07) << 2) | (b2 >> 6)) * 8 + 4) & 0xff; // G
			buffer[i * 4 + 2] = (((b2 >> 1) & 0x1f) * 8 + 4) & 0xff; // B
			buffer[i * 4 + 3] = ((b2 & 0x1) * 255) & 0xff; // A
		}

		return buffer;
	}

	static Convert16BitColorWithoutAlpha(pixelData) {
		const numPixels = Math.trunc(pixelData.length / 2); // 16 bits (2 bytes) per pixel
		const buffer = new Uint8Array(numPixels * 3); // new format has 3 components (RGB) one byte each

		// Note: RGB can also be BGR. The comments below are for RGB.
		// The order is the same in source and destination so the same
		// code can be used. Only the meaning of the bytes is different.

		for (let i = 0; i < numPixels; ++i) {
			const b1 = pixelData[i * 2 + 0];
			const b2 = pixelData[i * 2 + 1];

			// Byte1     Byte2
			// RRRRRGGG  GGGBBBBB
			// Note: The original C# code uses i * 4 here (which would throw at the end of the buffer in C#).
			// Kept as is; writes beyond the Uint8Array are ignored in JS.
			buffer[i * 4 + 0] = ((b1 >> 3) * 8 + 4) & 0xff; // R
			buffer[i * 4 + 1] = ((((b1 & 0x07) << 3) | (b2 >> 5)) * 4 + 2) & 0xff; // G
			buffer[i * 4 + 2] = ((b2 & 0x1f) * 8 + 4) & 0xff; // B
		}

		return buffer;
	}

	/** ref PixelFormat format -> returns [pixelData, format] */
	static ConvertPixelData(pixelData, format) {
		switch (format) {
			case PixelFormat.RGB5A1:
				format = PixelFormat.RGBA8;
				return [Texture.Convert16BitColorWithAlpha(pixelData), format];
			case PixelFormat.R5G6B5:
				format = PixelFormat.RGB8;
				return [Texture.Convert16BitColorWithoutAlpha(pixelData), format];
			case PixelFormat.BGR5A1:
				format = PixelFormat.BGRA8;
				return [Texture.Convert16BitColorWithAlpha(pixelData), format];
			case PixelFormat.B5G6R5:
				format = PixelFormat.BGR8;
				return [Texture.Convert16BitColorWithoutAlpha(pixelData), format];
			default:
				return [pixelData, format];
		}
	}
}

export { PixelFormat as Texture_PixelFormat };
