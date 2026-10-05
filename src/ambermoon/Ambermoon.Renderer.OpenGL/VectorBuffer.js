// Port of Ambermoon.Renderer.OpenGL/VectorBuffer.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// VectorBuffer.cs - Buffer for shader 3D position data

import { BufferObject, GLType } from './BufferObject.js';

export class VectorBuffer extends BufferObject {
	static ArrayType = Float32Array;
	static Type = GLType.Float;

	constructor(state, staticData) {
		super(state, staticData);
	}

	get Dimension() { return 3; }

	UpdateVectorData(buffer, index, vector) {
		let changed = false;
		const x = Math.fround(vector[0]);
		const y = Math.fround(vector[1]);
		const z = Math.fround(vector[2]);

		if (buffer[index + 0] !== x ||
			buffer[index + 1] !== y ||
			buffer[index + 2] !== z) {
			buffer[index + 0] = x;
			buffer[index + 1] = y;
			buffer[index + 2] = z;
			changed = true;
		}

		return index === this.Size || changed;
	}

	Add(x, y, z, index = -1) {
		return super.Add((b, i, v) => this.UpdateVectorData(b, i, v), [x, y, z], index);
	}

	Update(index, x, y, z) {
		super.Update((b, i, v) => this.UpdateVectorData(b, i, v), index, [x, y, z]);
	}
}
