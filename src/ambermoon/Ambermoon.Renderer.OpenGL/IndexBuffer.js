// Port of Ambermoon.Renderer.OpenGL/IndexBuffer.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// IndexBuffer.cs - Dynamic buffer for vertex indices

import { Exception } from '../../runtime.js';
import { BufferObject, GLType } from './BufferObject.js';

const IntMaxValue = 2147483647;
const ElementArrayBufferTarget = 0x8893; // GL_ELEMENT_ARRAY_BUFFER

export class IndexBuffer extends BufferObject {
	static ArrayType = Uint32Array;
	static Type = GLType.UnsignedInt;

	constructor(state) {
		super(state, true);

		this.BufferTarget = ElementArrayBufferTarget;
	}

	get Dimension() { return 6; }

	InsertIndexData(buffer, index, startIndex) {
		buffer[index++] = startIndex + 0;
		buffer[index++] = startIndex + 1;
		buffer[index++] = startIndex + 2;
		buffer[index++] = startIndex + 3;
		buffer[index++] = startIndex + 0;
		buffer[index++] = startIndex + 2;

		return true;
	}

	InsertQuad(quadIndex) {
		if (quadIndex >= Math.trunc(IntMaxValue / 6))
			throw new Exception('Too many polygons to render.'); // OutOfMemoryException

		const arrayIndex = quadIndex * 6; // 2 triangles with 3 vertices each
		const vertexIndex = (quadIndex * 4) >>> 0; // 4 different vertices form a quad

		while (this.Size <= arrayIndex + 6) {
			super.Add((b, i, v) => this.InsertIndexData(b, i, v), vertexIndex, quadIndex);
		}
	}

	EnsureCorrectRenderOrder(layerBuffer) {
		if (layerBuffer.Size === 0)
			return;

		// We expect always 4 equal values
		const layerValues = layerBuffer.Buffer;
		const quadCount = Math.trunc(layerBuffer.Size / 4);
		const quads = new Array(quadCount);

		for (let i = 0; i < quadCount; i++) {
			const layer = layerValues[i * 4];
			quads[i] = [layer, i];
		}

		// Sort quads by layer (lower values first), then by index
		quads.sort((a, b) => {
			const result = a[0] - b[0];

			if (result === 0)
				return a[1] - b[1];

			return result;
		});

		let bufferIndex = 0;
		const buffer = this.Buffer;

		for (const quad of quads) {
			buffer[bufferIndex++] = quad[1] * 4 + 0;
			buffer[bufferIndex++] = quad[1] * 4 + 1;
			buffer[bufferIndex++] = quad[1] * 4 + 2;
			buffer[bufferIndex++] = quad[1] * 4 + 3;
			buffer[bufferIndex++] = quad[1] * 4 + 0;
			buffer[bufferIndex++] = quad[1] * 4 + 2;
		}
	}
}
