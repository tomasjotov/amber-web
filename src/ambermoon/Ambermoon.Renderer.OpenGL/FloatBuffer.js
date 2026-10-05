// Port of Ambermoon.Renderer.OpenGL/FloatBuffer.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// FloatBuffer.cs - Buffer for shader float data

import { BufferObject, GLType } from './BufferObject.js';

export class FloatBuffer extends BufferObject {
	static ArrayType = Float32Array;
	static Type = GLType.Float;

	constructor(state, staticData) {
		super(state, staticData);
	}

	get Dimension() { return 1; }
}
