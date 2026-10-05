// Port of Ambermoon.Renderer.OpenGL/FloatPositionBuffer.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// FloatPositionBuffer.cs - Buffer for shader floating-point position data

import { Util } from '../Ambermoon.Common/Util.js';
import { BufferObject, GLType } from './BufferObject.js';

export class FloatPositionBuffer extends BufferObject {
	static ArrayType = Float32Array;
	static Type = GLType.Float;

	constructor(state, staticData) {
		super(state, staticData);
	}

	get Dimension() { return 2; }

	/** position is a tuple [x, y] */
	UpdatePositionData(buffer, index, position) {
		let changed = false;
		const x = position[0];
		const y = position[1];

		if (!Util.FloatEqual(buffer[index + 0], x) ||
			!Util.FloatEqual(buffer[index + 1], y)) {
			buffer[index + 0] = x;
			buffer[index + 1] = y;
			changed = true;
		}

		return changed || index === this.Size;
	}

	Add(x, y, index = -1) {
		return super.Add((b, i, p) => this.UpdatePositionData(b, i, p), [x, y], index);
	}

	Update(index, x, y) {
		super.Update((b, i, p) => this.UpdatePositionData(b, i, p), index, [x, y]);
	}

	/** updater: (index, [x, y]) => [x, y] */
	TransformAll(updater) {
		const TransformPositionData = (buffer, index, _) => {
			let changed = false;
			const position = [buffer[index + 0], buffer[index + 1]];
			const newPosition = updater(index, position);
			const x = newPosition[0];
			const y = newPosition[1];

			if (!Util.FloatEqual(buffer[index + 0], x) ||
				!Util.FloatEqual(buffer[index + 1], y)) {
				buffer[index + 0] = x;
				buffer[index + 1] = y;
				changed = true;
			}

			return changed || index === this.Size;
		};

		for (let i = 0; i < this.Size; ++i) {
			super.Update(TransformPositionData, i, null);
		}
	}
}
