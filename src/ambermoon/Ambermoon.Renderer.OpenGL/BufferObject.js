// Port of Ambermoon.Renderer.OpenGL/BufferObject.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// BufferObject.cs - Base class for integer based data buffers
//
// The generic type parameter T of the C# class is represented by two static members of each subclass:
// - static ArrayType: the typed array constructor (Uint8Array, Int16Array, Uint16Array, Uint32Array, Float32Array)
// - static Type: the WebGL vertex attribute type (gl.UNSIGNED_BYTE, gl.SHORT, ...)

import { Exception } from '../../runtime.js';
import { IndexPool } from './IndexPool.js';

/** WebGL constants (identical to the OpenGL values) */
export const GLType = Object.freeze({
	UnsignedByte: 0x1401,
	Short: 0x1402,
	UnsignedShort: 0x1403,
	UnsignedInt: 0x1405,
	Float: 0x1406
});

const ArrayBufferTarget = 0x8892; // GL_ARRAY_BUFFER
const StaticDraw = 0x88E4; // GL_STATIC_DRAW
const DynamicDraw = 0x88E8; // GL_DYNAMIC_DRAW

export class BufferObject {
	/** The typed array type of the buffer data (C# T). Must be overridden. */
	static ArrayType = null;

	/** Vertex attribute pointer type (C# BufferObject<T>.Type). Must be overridden. */
	static get Type() {
		throw new Exception('Invalid buffer data type');
	}

	constructor(state, staticData) {
		this.Normalized = false;
		this.Size = 0;
		this.BufferTarget = ArrayBufferTarget;
		this.index = null;
		this.disposed = false;
		this.buffer = null;
		this.indices = new IndexPool();
		this.changedSinceLastCreation = true;
		this.usageHint = DynamicDraw;
		this.state = state;

		this.index = state.Gl.createBuffer();

		if (staticData)
			this.usageHint = StaticDraw;
	}

	get Dimension() {
		throw new Error('abstract');
	}

	get Buffer() {
		return this.buffer;
	}

	newBuffer(length) {
		return new this.constructor.ArrayType(length);
	}

	DefaultUpdater(buffer, index, value) {
		const oldValue = buffer[index];
		buffer[index] = value;

		// Compare the stored (converted) value like T.Equals does
		if (buffer[index] !== oldValue)
			return true;

		return index === this.Size;
	}

	/**
	 * Add(value, index = -1) or the protected overload Add(inserter, value, index = -1)
	 * where inserter is (buffer, bufferIndex, value) => bool.
	 */
	Add(inserter, value, index = -1) {
		if (typeof inserter !== 'function') {
			// public int Add(T value, int index = -1)
			return this.Add((b, i, v) => this.DefaultUpdater(b, i, v), inserter, value === undefined ? -1 : value);
		}

		let reused;

		if (index === -1)
			[index, reused] = this.indices.AssignNextFreeIndex();
		else
			reused = this.indices.AssignIndex(index);

		if (this.buffer == null) {
			this.buffer = this.newBuffer(128);
			inserter(this.buffer, 0, value);
			this.Size += this.Dimension;
			this.changedSinceLastCreation = true;
		} else {
			let changed;
			[this.buffer, changed] = this.EnsureBufferSize(this.buffer, (index + 1) * this.Dimension);

			if (!reused) {
				this.Size += this.Dimension;
				changed = true;
			}

			const bufferIndex = index * this.Dimension;

			if (inserter(this.buffer, bufferIndex, value) || changed) {
				this.changedSinceLastCreation = true;
			}
		}

		return index;
	}

	/**
	 * Update(index, value) or the protected overload Update(updater, index, value)
	 * where updater is (buffer, bufferIndex, value) => bool.
	 */
	Update(updater, index, value) {
		if (typeof updater !== 'function') {
			// public void Update(int index, T value)
			this.Update((b, i, v) => this.DefaultUpdater(b, i, v), updater, index);
			return;
		}

		if (this.buffer == null)
			return; // already disposed

		if (updater(this.buffer, index * this.Dimension, value))
			this.changedSinceLastCreation = true;
	}

	Remove(index) {
		this.indices.UnassignIndex(index);
	}

	Dispose() {
		if (!this.disposed) {
			const gl = this.state.Gl;

			gl.bindBuffer(this.BufferTarget, null);

			if (this.index != null) {
				gl.deleteBuffer(this.index);

				if (this.buffer != null) {
					this.buffer = null;
				}

				this.Size = 0;
				this.index = null;
			}

			this.disposed = true;
		}
	}

	Bind() {
		if (this.disposed)
			throw new Exception('Tried to bind a disposed buffer.');

		this.state.Gl.bindBuffer(this.BufferTarget, this.index);

		this.Recreate(); // ensure that the data is up to date
	}

	Unbind() {
		if (this.disposed)
			return;

		this.state.Gl.bindBuffer(this.BufferTarget, null);
	}

	/** Uploads the first Size elements of the buffer (C#: BufferData with Size * sizeof(T) bytes). */
	upload() {
		const length = Math.min(this.Size, this.buffer.length);
		this.state.Gl.bufferData(this.BufferTarget, this.buffer.subarray(0, length), this.usageHint);
	}

	Recreate() { // is only called when the buffer is bound (see Bind())
		if (!this.changedSinceLastCreation || this.buffer == null)
			return;

		this.upload();

		this.changedSinceLastCreation = false;
	}

	RecreateUnbound() {
		if (!this.changedSinceLastCreation || this.buffer == null)
			return false;

		if (this.disposed)
			throw new Exception('Tried to recreate a disposed buffer.');

		this.state.Gl.bindBuffer(this.BufferTarget, this.index);

		this.upload();

		this.changedSinceLastCreation = false;

		return true;
	}

	/** EnsureBufferSize(buffer, size, out bool changed) -> returns [buffer, changed] */
	EnsureBufferSize(buffer, size) {
		let changed = false;

		if (buffer == null) {
			changed = true;

			// first we just use a 256B buffer
			return [this.newBuffer(256), changed];
		} else if (buffer.length <= size) { // we need to recreate the buffer
			changed = true;

			let newBuffer;

			if (buffer.length < 0xffff) // double size up to 64K
				newBuffer = this.newBuffer(buffer.length << 1);
			else // increase by 1K after 64K reached
				newBuffer = this.newBuffer(buffer.length + 1024);

			newBuffer.set(buffer);
			buffer = newBuffer;
		}

		return [buffer, changed];
	}
}
