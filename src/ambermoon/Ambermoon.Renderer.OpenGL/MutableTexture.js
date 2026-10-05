// Port of Ambermoon.Renderer.OpenGL/MutableTexture.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// MutableTexture.cs - Texture which can be filled before it is uploaded

import { ArgumentOutOfRangeException } from '../../runtime.js';
import { Texture as RenderTexture } from '../Ambermoon.Core/Render/Texture.js';
import { Texture } from './Texture.js';

function blockCopy(src, srcOffset, dst, dstOffset, count) {
	if (typeof src.subarray === 'function')
		dst.set(src.subarray(srcOffset, srcOffset + count), dstOffset);
	else {
		for (let i = 0; i < count; ++i)
			dst[dstOffset + i] = src[srcOffset + i];
	}
}

export class MutableTexture extends Texture {
	/**
	 * new MutableTexture(state, width, height, bytesPerPixel) or new MutableTexture(state, graphic)
	 */
	constructor(state, widthOrGraphic, height, bytesPerPixel) {
		if (arguments.length >= 4) {
			const width = widthOrGraphic;

			super(state, width, height);

			this.bytesPerPixel = bytesPerPixel;
			this.width = width;
			this.height = height;
			this.data = new Uint8Array(width * height * bytesPerPixel); // initialized with zeros so non-occupied areas will be transparent
		} else {
			const graphic = widthOrGraphic;

			super(state, graphic.Width, graphic.Height);

			this.bytesPerPixel = graphic.IndexedGraphic ? 1 : 4;
			this.width = graphic.Width;
			this.height = graphic.Height;
			this.data = graphic.Data;
		}
	}

	get Width() { return this.width; }
	get Height() { return this.height; }

	AddSubTexture(position, data, width, height) {
		const bytesPerPixel = this.bytesPerPixel;

		for (let y = 0; y < height; ++y) {
			blockCopy(data, y * width * bytesPerPixel, this.data, (position.X + (position.Y + y) * this.Width) * bytesPerPixel, width * bytesPerPixel);
		}
	}

	Finish(numMipMapLevels) {
		const PixelFormat = RenderTexture.PixelFormat;
		let pixelFormat;

		switch (this.bytesPerPixel) {
			case 1:
				pixelFormat = PixelFormat.Alpha;
				break;
			case 4:
				pixelFormat = PixelFormat.RGBA8;
				break;
			default:
				throw new ArgumentOutOfRangeException(`Unsupported bytes per pixel value: ${this.bytesPerPixel}`);
		}

		let data = this.data;

		if (data != null && !(data instanceof Uint8Array))
			data = Uint8Array.from(data);

		this.Create(pixelFormat, data, numMipMapLevels);

		this.data = null;
	}

	Resize(width, height) {
		if (this.data != null && this.width === width && this.height === height)
			return;

		this.width = width;
		this.height = height;
		this.data = new Uint8Array(width * height * this.bytesPerPixel); // initialized with zeros so non-occupied areas will be transparent
	}
}
