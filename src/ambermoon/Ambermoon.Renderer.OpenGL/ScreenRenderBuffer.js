// Port of Ambermoon.Renderer.OpenGL/ScreenRenderBuffer.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// ScreenRenderBuffer.cs - Full screen quad used to render frame buffer textures

import { toShort } from '../../runtime.js';
import { Size } from '../Ambermoon.Common/Size.js';
import { Global } from '../Ambermoon.Core/UI/Global.js';
import { VertexArrayObject } from './VertexArrayObject.js';
import { FloatPositionBuffer } from './FloatPositionBuffer.js';
import { IndexBuffer } from './IndexBuffer.js';
import { ScreenShader } from './ScreenShader.js';
import { Matrix4 } from './Matrix.js';

export class ScreenRenderBuffer {
	constructor(state, screenShader) {
		this.disposed = false;
		this.size = null;
		this.ProjectionMatrix = Matrix4.Identity;

		this.state = state;
		this.vertexArrayObject = new VertexArrayObject(state, screenShader.ShaderProgram);
		this.positionBuffer = new FloatPositionBuffer(state, true);
		this.positionBuffer.Add(0, 0, 0);
		this.positionBuffer.Add(Global.VirtualScreenWidth, 0, 1);
		this.positionBuffer.Add(Global.VirtualScreenWidth, Global.VirtualScreenHeight, 2);
		this.positionBuffer.Add(0, Global.VirtualScreenHeight, 3);
		this.vertexArrayObject.AddBuffer(ScreenShader.DefaultPositionName, this.positionBuffer);
		this.indexBuffer = new IndexBuffer(state);
		this.indexBuffer.InsertQuad(0);
		this.vertexArrayObject.AddBuffer('index', this.indexBuffer);
	}

	SetSize(size) {
		if (!Size.op_Equality(this.size, size)) {
			this.size = new Size(size);
			this.positionBuffer.Update(1, toShort(size.Width), 0);
			this.positionBuffer.Update(2, toShort(size.Width), toShort(size.Height));
			this.positionBuffer.Update(3, 0, toShort(size.Height));
			this.ProjectionMatrix = Matrix4.CreateOrtho2D(0, size.Width, 0, size.Height, 0, 1);
		}
	}

	Render() {
		if (this.disposed)
			return;

		const gl = this.state.Gl;

		this.vertexArrayObject.Bind();

		this.vertexArrayObject.Lock();

		try {
			gl.drawElements(gl.TRIANGLES, Math.trunc(this.positionBuffer.Size / 4) * 3, gl.UNSIGNED_INT, 0);
			this.vertexArrayObject.Unbind();
		} catch {
			// ignore for now
		} finally {
			this.vertexArrayObject.Unlock();
		}
	}

	Dispose() {
		if (!this.disposed) {
			this.vertexArrayObject?.Dispose();
			this.positionBuffer?.Dispose();

			this.disposed = true;
		}
	}
}
