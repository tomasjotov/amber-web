// Port of Ambermoon.Renderer.OpenGL/ColorBuffer.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// ColorBuffer.cs - Buffer for shader color data

import { BufferObject, GLType } from './BufferObject.js';

export class ColorBuffer extends BufferObject {
	static ArrayType = Uint8Array;
	static Type = GLType.UnsignedByte;

	constructor(state, staticData) {
		super(state, staticData);
	}

	get Dimension() { return 4; }

	UpdateColorData(buffer, index, color) {
		let changed = false;

		if (buffer[index + 0] !== color.R ||
			buffer[index + 1] !== color.G ||
			buffer[index + 2] !== color.B ||
			buffer[index + 3] !== color.A) {
			buffer[index + 0] = color.R;
			buffer[index + 1] = color.G;
			buffer[index + 2] = color.B;
			buffer[index + 3] = color.A;
			changed = true;
		}

		return index === this.Size || changed;
	}

	Add(color, index = -1) {
		return super.Add((b, i, c) => this.UpdateColorData(b, i, c), color, index);
	}

	Update(index, color) {
		super.Update((b, i, c) => this.UpdateColorData(b, i, c), index, color);
	}
}
