// Port of Ambermoon.Renderer.OpenGL/WordBuffer.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// WordBuffer.cs - Buffer for shader word data

import { BufferObject, GLType } from './BufferObject.js';

export class WordBuffer extends BufferObject {
	static ArrayType = Uint16Array;
	static Type = GLType.UnsignedShort;

	constructor(state, staticData) {
		super(state, staticData);
	}

	get Dimension() { return 1; }
}
