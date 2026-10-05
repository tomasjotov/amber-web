// Port of Ambermoon.Renderer.OpenGL/VertexArrayObject.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// VertexArrayObject.cs - OpenGL VAO

import { ArgumentException } from '../../runtime.js';
import { PositionBuffer } from './PositionBuffer.js';
import { FloatPositionBuffer } from './FloatPositionBuffer.js';
import { WordBuffer } from './WordBuffer.js';
import { ColorBuffer } from './ColorBuffer.js';
import { ByteBuffer } from './ByteBuffer.js';
import { IndexBuffer } from './IndexBuffer.js';
import { VectorBuffer } from './VectorBuffer.js';
import { FloatBuffer } from './FloatBuffer.js';

function addToDictionary(map, name, buffer) {
	if (map.has(name))
		throw new ArgumentException('An item with the same key has already been added.');

	map.set(name, buffer);
}

// VAO
export class VertexArrayObject {
	static ActiveVAO = null;

	constructor(state, program) {
		this.index = null;
		this.positionBuffers = new Map();
		this.floatPositionBuffers = new Map();
		this.wordBuffers = new Map();
		this.colorBuffers = new Map();
		this.byteBuffers = new Map();
		this.indexBuffers = new Map();
		this.vectorBuffers = new Map();
		this.floatBuffers = new Map();
		this.bufferLocations = new Map();
		this.disposed = false;
		this.buffersAreBound = false;
		this.program = program;
		this.state = state;

		this.Create();
	}

	Create() {
		this.index = this.state.Gl.createVertexArray();
	}

	Lock() {
		// Single threaded in the browser
	}

	Unlock() {
		// Single threaded in the browser
	}

	/** AddBuffer(name, buffer) for all buffer types */
	AddBuffer(name, buffer) {
		// Note: check subclasses before their base classes (all derive from BufferObject)
		if (buffer instanceof PositionBuffer)
			addToDictionary(this.positionBuffers, name, buffer);
		else if (buffer instanceof FloatPositionBuffer)
			addToDictionary(this.floatPositionBuffers, name, buffer);
		else if (buffer instanceof VectorBuffer)
			addToDictionary(this.vectorBuffers, name, buffer);
		else if (buffer instanceof WordBuffer)
			addToDictionary(this.wordBuffers, name, buffer);
		else if (buffer instanceof ColorBuffer)
			addToDictionary(this.colorBuffers, name, buffer);
		else if (buffer instanceof ByteBuffer)
			addToDictionary(this.byteBuffers, name, buffer);
		else if (buffer instanceof IndexBuffer)
			addToDictionary(this.indexBuffers, name, buffer);
		else if (buffer instanceof FloatBuffer)
			addToDictionary(this.floatBuffers, name, buffer);
		else
			throw new ArgumentException('Unsupported buffer type.');
	}

	* attributeBufferMaps() {
		yield this.positionBuffers;
		yield this.floatPositionBuffers;
		yield this.vectorBuffers;
		yield this.wordBuffers;
		yield this.colorBuffers;
		yield this.byteBuffers;
		yield this.floatBuffers;
	}

	BindBuffers() {
		if (this.buffersAreBound)
			return;

		this.program.Use();
		this.InternalBind(true);

		for (const buffers of this.attributeBufferMaps()) {
			for (const [key, buffer] of buffers) {
				this.bufferLocations.set(key, this.program.BindInputBuffer(key, buffer));
			}
		}

		for (const [, buffer] of this.indexBuffers) {
			buffer.Bind();
		}

		this.buffersAreBound = true;
	}

	UnbindBuffers() {
		if (!this.buffersAreBound)
			return;

		this.program.Use();
		this.InternalBind(true);

		for (const buffers of this.attributeBufferMaps()) {
			for (const [key] of buffers) {
				this.program.UnbindInputBuffer(this.bufferLocations.get(key));
				this.bufferLocations.set(key, -1);
			}
		}

		for (const [, buffer] of this.indexBuffers) {
			buffer.Unbind();
		}

		this.buffersAreBound = false;
	}

	Bind() {
		this.InternalBind(false);
	}

	InternalBind(bindOnly) {
		if (VertexArrayObject.ActiveVAO !== this) {
			this.state.Gl.bindVertexArray(this.index);
			this.program.Use();
			VertexArrayObject.ActiveVAO = this;
		}

		if (!bindOnly) {
			let buffersChanged = false;

			// ensure that all buffers are up to date
			for (const buffers of this.attributeBufferMaps()) {
				for (const [, buffer] of buffers) {
					if (buffer.RecreateUnbound())
						buffersChanged = true;
				}
			}

			for (const [, buffer] of this.indexBuffers) {
				if (buffer.RecreateUnbound())
					buffersChanged = true;
			}

			if (buffersChanged) {
				this.UnbindBuffers();
				this.BindBuffers();
			}
		}
	}

	/**
	 * Instance: vao.Bind(). Static: VertexArrayObject.Bind(vao) (see below).
	 */
	static Bind(vao) {
		if (vao != null)
			vao.Bind();
		else if (VertexArrayObject.ActiveVAO != null)
			VertexArrayObject.ActiveVAO.Unbind();
	}

	Unbind() {
		if (VertexArrayObject.ActiveVAO === this) {
			this.state.Gl.bindVertexArray(null);
			VertexArrayObject.ActiveVAO = null;
		}
	}

	Dispose() {
		if (!this.disposed) {
			if (this.index != null) {
				if (VertexArrayObject.ActiveVAO === this)
					this.Unbind();

				this.state.Gl.deleteVertexArray(this.index);
				this.index = null;
			}

			this.disposed = true;
		}
	}
}
