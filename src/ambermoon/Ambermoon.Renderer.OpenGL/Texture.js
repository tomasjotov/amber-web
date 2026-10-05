// Port of Ambermoon.Renderer.OpenGL/Texture.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// Texture.cs - Texture (WebGL2)

import { Exception } from '../../runtime.js';
import { Texture as RenderTexture } from '../Ambermoon.Core/Render/Texture.js';

export class Texture extends RenderTexture {
	static ActiveTexture = null;

	/**
	 * (protected) new Texture(state, width, height)
	 * new Texture(state, width, height, format, pixelData: Uint8Array, numMipMapLevels = 0)
	 * new Texture(state, width, height, format, pixelDataStream, numMipMapLevels = 0)
	 *   (stream: object with Length, Position, CanRead and Read(buffer, offset, count) like a .NET Stream)
	 */
	constructor(state, width, height, format, pixelData, numMipMapLevels = 0) {
		super();

		this.Index = null;
		this.Width_ = 0;
		this.Height_ = 0;
		this.state = null;
		this.disposed = false;

		const BytesPerPixel = RenderTexture.BytesPerPixel;

		if (arguments.length <= 3) {
			this.state = state;
			this.Index = state.Gl.createTexture();
			this.Width_ = width;
			this.Height_ = height;
			return;
		}

		if (!(pixelData instanceof Uint8Array) && pixelData != null && !Array.isArray(pixelData) && typeof pixelData.Read === 'function') {
			// Stream overload
			const pixelDataStream = pixelData;
			const size = width * height * BytesPerPixel[format];

			if ((pixelDataStream.Length - pixelDataStream.Position) < size)
				throw new Exception('Pixel data stream does not contain enough data.');

			if (pixelDataStream.CanRead === false)
				throw new Exception('Pixel data stream does not support reading.');

			pixelData = new Uint8Array(size);

			pixelDataStream.Read(pixelData, 0, size);
		} else {
			if (Array.isArray(pixelData))
				pixelData = Uint8Array.from(pixelData);

			if (width * height * BytesPerPixel[format] !== pixelData.length)
				throw new Exception('Invalid texture data size.');
		}

		this.state = state;
		this.Index = state.Gl.createTexture();
		this.Width_ = width;
		this.Height_ = height;

		this.Create(format, pixelData, numMipMapLevels);
	}

	get Width() { return this.Width_; }
	get Height() { return this.Height_; }

	/** InternalFormat: R8 for Alpha, otherwise RGBA8 (RGB8 for RGB data as WebGL2 requires matching formats) */
	static ToOpenGLInternalFormat(gl, format) {
		const PixelFormat = RenderTexture.PixelFormat;

		if (format === PixelFormat.Alpha)
			return gl.R8;

		// Note: OpenGL accepts RGB data for an RGBA8 texture, WebGL2 doesn't.
		if (format === PixelFormat.RGB8)
			return gl.RGB8;

		return gl.RGBA8;
	}

	static ToOpenGLPixelFormat(gl, format) {
		const PixelFormat = RenderTexture.PixelFormat;

		switch (format) {
			case PixelFormat.RGBA8:
				return gl.RGBA;
			case PixelFormat.RGB8:
				return gl.RGB;
			case PixelFormat.Alpha:
				// Note: for the supported image format GL_RED means one channel data, GL_ALPHA is only used for texture storage on the gpu, so we don't use it
				// We always use RGBA8 as texture storage on the gpu
				return gl.RED;
			default:
				throw new Exception('Invalid pixel format.');
		}
	}

	Create(format, pixelData, numMipMapLevels) {
		const PixelFormat = RenderTexture.PixelFormat;
		const gl = this.state.Gl;

		if (format >= PixelFormat.RGB5A1 && pixelData.length !== 0) {
			[pixelData, format] = RenderTexture.ConvertPixelData(pixelData, format);
		}

		this.Bind();

		const minMode = (numMipMapLevels > 0) ? gl.NEAREST_MIPMAP_NEAREST : gl.NEAREST;

		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minMode);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

		if (pixelData.length !== 0) {
			gl.texImage2D(gl.TEXTURE_2D, 0, Texture.ToOpenGLInternalFormat(gl, format), this.Width, this.Height, 0,
				Texture.ToOpenGLPixelFormat(gl, format), gl.UNSIGNED_BYTE, pixelData);
		}

		if (numMipMapLevels > 0)
			gl.generateMipmap(gl.TEXTURE_2D);
	}

	Bind() {
		if (this.disposed)
			throw new Exception('Tried to bind a disposed texture.');

		if (Texture.ActiveTexture === this)
			return;

		this.state.Gl.bindTexture(this.state.Gl.TEXTURE_2D, this.Index);
		Texture.ActiveTexture = this;
	}

	Unbind() {
		if (Texture.ActiveTexture === this) {
			this.state.Gl.bindTexture(this.state.Gl.TEXTURE_2D, null);
			Texture.ActiveTexture = null;
		}
	}

	Dispose() {
		if (!this.disposed) {
			if (Texture.ActiveTexture === this)
				this.Unbind();

			if (this.Index != null) {
				this.state.Gl.deleteTexture(this.Index);
				this.Index = null;
			}

			this.disposed = true;
		}
	}
}
