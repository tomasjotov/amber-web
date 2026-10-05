// Port of Ambermoon.Renderer.OpenGL/FrameBuffer.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// FrameBuffer.cs - Off-screen render target (color texture + depth/stencil render buffer)

import { Size } from '../Ambermoon.Common/Size.js';
import { AmbermoonException, ExceptionScope } from '../Ambermoon.Common/Exception.js';

export class FrameBuffer {
	constructor(state) {
		this.index = state.Gl.createFramebuffer();
		this.depthBuffer = state.Gl.createRenderbuffer();
		this.renderTexture = state.Gl.createTexture();
		this.disposed = false;
		this.state = state;
		this.size = new Size(0, 0);
	}

	EnsureSize(width, height) {
		if (this.size.Width !== width || this.size.Height !== height) {
			this.size.Width = width;
			this.size.Height = height;
			const gl = this.state.Gl;

			gl.bindFramebuffer(gl.FRAMEBUFFER, this.index);

			gl.bindTexture(gl.TEXTURE_2D, this.renderTexture);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
			// WebGL: non-power-of-two textures need clamping (OpenGL ES 3.0 / WebGL2 don't strictly, but it is the safe default)
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.bindTexture(gl.TEXTURE_2D, null);

			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.renderTexture, 0);

			gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthBuffer);
			gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, width, height);
			gl.bindRenderbuffer(gl.RENDERBUFFER, null);

			gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, this.depthBuffer);

			if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
				gl.bindFramebuffer(gl.FRAMEBUFFER, null);
				throw new AmbermoonException(ExceptionScope.Render, 'Unable to setup framebuffer');
			}

			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		}
	}

	Bind(width, height) {
		if (this.disposed)
			return;

		this.EnsureSize(width, height);

		this.state.Gl.bindFramebuffer(this.state.Gl.FRAMEBUFFER, this.index);
	}

	BindAsTexture() {
		if (!this.disposed) {
			const gl = this.state.Gl;
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, this.renderTexture);
		}
	}

	Dispose() {
		if (!this.disposed) {
			const gl = this.state.Gl;
			gl.deleteTexture(this.renderTexture);
			gl.deleteRenderbuffer(this.depthBuffer);
			gl.deleteFramebuffer(this.index);

			this.renderTexture = null;
			this.depthBuffer = null;
			this.index = null;

			this.disposed = true;
		}
	}
}
