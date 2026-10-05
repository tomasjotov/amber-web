// Port of Ambermoon.Renderer.OpenGL/ByteBuffer.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// ByteBuffer.cs - Buffer for shader byte data

import { BufferObject, GLType } from './BufferObject.js';

export class ByteBuffer extends BufferObject {
	static ArrayType = Uint8Array;
	static Type = GLType.UnsignedByte;

	constructor(state, staticData) {
		super(state, staticData);
	}

	get Dimension() { return 1; }
}
