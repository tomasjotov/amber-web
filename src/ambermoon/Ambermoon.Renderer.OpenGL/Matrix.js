// Port of Ambermoon.Renderer.OpenGL/Matrix.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// Matrix.cs - 4x4 matrix

import { ArgumentException, Exception } from '../../runtime.js';
import { Misc } from '../Ambermoon.Core/Misc.js';

const FloatEpsilon = 1.401298E-45; // float.Epsilon

function floats(values) {
	return new Float32Array(values);
}

export class Matrix4 {
	/**
	 * new Matrix4(float[16]) (the array is used directly) or new Matrix4(Matrix4) (copy)
	 */
	constructor(matrix) {
		this.matrix = new Float32Array(16);
		this.inverse = null;

		if (matrix instanceof Matrix4) {
			for (let i = 0; i < 16; ++i)
				this.matrix[i] = matrix.matrix[i];
		} else {
			if (matrix.length !== 16)
				throw new Exception('Invalid matrix size.');

			this.matrix = matrix;
		}
	}

	static Identity = new Matrix4(floats([
		1.0, 0.0, 0.0, 0.0,
		0.0, 1.0, 0.0, 0.0,
		0.0, 0.0, 1.0, 0.0,
		0.0, 0.0, 0.0, 1.0
	]));

	static CreateOrtho2D(left, right, top, bottom, near = -1.0, far = 1.0) {
		// width
		const w = right - left;
		// height
		const h = top - bottom; // swap y so 0,0 for drawing is in the upper-left corner
		// depth
		const d = far - near;

		return new Matrix4(floats([
			2.0 / w, 0.0, 0.0, -(right + left) / w,
			0.0, 2.0 / h, 0.0, -(bottom + top) / h,
			0.0, 0.0, 2.0 / d, -(far + near) / d,
			0.0, 0.0, 0.0, 1.0
		]));
	}

	static CreatePerspective(fovY, aspect, near, far) {
		if (fovY <= 0.0 || fovY >= 180.0)
			throw new ArgumentException('The field of view y-angle was outside the valid range of 0 < fovAngle < 180.');

		if (Math.abs(aspect) <= FloatEpsilon)
			throw new ArgumentException('Aspect is 0 which is not allowed.');

		if (near <= FloatEpsilon)
			throw new ArgumentException('Near z value is 0 or smaller which is not allowed.');

		if (far < near)
			throw new ArgumentException('Far z value is smaller than near z value which is not allowed.');

		if (far - near <= FloatEpsilon)
			throw new ArgumentException('Near z value equals far z value or far is smaller than near which is not allowed.');

		const scale = Math.fround(near * Math.tan(0.5 * fovY));

		const t = scale; // top
		const b = -t; // bottom
		const r = aspect * t; // right
		const l = -r; // left
		const w = r - l; // width
		const h = t - b; // height

		// Ambermoon uses a scaling factor of 256/(256+distance).
		// This can be expressed as 1/(1+distance/256).
		// We scale the 256 down to the near value so that
		// we end up with near/(near+distance*near/256).
		// We do so to avoid clipping through walls.
		// As x, y and z all use the same scaled units which is
		// Global.DistancePerBlock we don't need to care about
		// the scaling of the distance. So we can just use
		// near/(near+distance) in the projection matrix.
		// This projection matrix exactly scales x and y by
		// 256/(256+distance) with the given FOV applied.
		return new Matrix4(floats([
			2.0 * near / w, 0.0, (r + l) / w, 0.0,
			0.0, 2.0 * near / h, (t + b) / h, 0.0,
			0.0, 0.0, -(2.0 * near + far) / (far - near), -(2.0 * near * (far + near)) / (far - near) - near,
			0.0, 0.0, -1.0, near
		]));
	}

	static CreateTranslationMatrix(x, y, z = 0.0) {
		return new Matrix4(floats([
			1.0, 0.0, 0.0, x,
			0.0, 1.0, 0.0, y,
			0.0, 0.0, 1.0, z,
			0.0, 0.0, 0.0, 1.0
		]));
	}

	static CreateScalingMatrix(x, y, z = 1.0) {
		return new Matrix4(floats([
			x, 0.0, 0.0, 0.0,
			0.0, y, 0.0, 0.0,
			0.0, 0.0, z, 0.0,
			0.0, 0.0, 0.0, 1.0
		]));
	}

	static CreateYRotationMatrix(angle) {
		const deg2rad = Math.PI / 180.0;

		const sin = Math.sin(angle * deg2rad);
		const cos = Math.cos(angle * deg2rad);

		return new Matrix4(floats([
			cos, -sin, 0.0, 0.0,
			sin, cos, 0.0, 0.0,
			0.0, 0.0, 1.0, 0.0,
			0.0, 0.0, 0.0, 1.0
		]));
	}

	static CreateZRotationMatrix(angle) {
		const deg2rad = Math.PI / 180.0;

		const sin = Math.sin(angle * deg2rad);
		const cos = Math.cos(angle * deg2rad);

		return new Matrix4(floats([
			cos, 0.0, sin, 0.0,
			0.0, 1.0, 0.0, 0.0,
			-sin, 0.0, cos, 0.0,
			0.0, 0.0, 0.0, 1.0
		]));
	}

	CreateInverseMatrix() {
		const matrix = this.matrix;

		if (this.inverse != null) {
			const inverseMatrix = new Matrix4(Float32Array.from(this.inverse));

			inverseMatrix.inverse = new Float32Array(16);
			inverseMatrix.inverse.set(matrix);

			return inverseMatrix;
		}

		const inv = new Float32Array(16);
		let det;
		let i;

		inv[0] = matrix[5] * matrix[10] * matrix[15] -
			matrix[5] * matrix[11] * matrix[14] -
			matrix[9] * matrix[6] * matrix[15] +
			matrix[9] * matrix[7] * matrix[14] +
			matrix[13] * matrix[6] * matrix[11] -
			matrix[13] * matrix[7] * matrix[10];

		inv[4] = -matrix[4] * matrix[10] * matrix[15] +
			matrix[4] * matrix[11] * matrix[14] +
			matrix[8] * matrix[6] * matrix[15] -
			matrix[8] * matrix[7] * matrix[14] -
			matrix[12] * matrix[6] * matrix[11] +
			matrix[12] * matrix[7] * matrix[10];

		inv[8] = matrix[4] * matrix[9] * matrix[15] -
			matrix[4] * matrix[11] * matrix[13] -
			matrix[8] * matrix[5] * matrix[15] +
			matrix[8] * matrix[7] * matrix[13] +
			matrix[12] * matrix[5] * matrix[11] -
			matrix[12] * matrix[7] * matrix[9];

		inv[12] = -matrix[4] * matrix[9] * matrix[14] +
			matrix[4] * matrix[10] * matrix[13] +
			matrix[8] * matrix[5] * matrix[14] -
			matrix[8] * matrix[6] * matrix[13] -
			matrix[12] * matrix[5] * matrix[10] +
			matrix[12] * matrix[6] * matrix[9];

		inv[1] = -matrix[1] * matrix[10] * matrix[15] +
			matrix[1] * matrix[11] * matrix[14] +
			matrix[9] * matrix[2] * matrix[15] -
			matrix[9] * matrix[3] * matrix[14] -
			matrix[13] * matrix[2] * matrix[11] +
			matrix[13] * matrix[3] * matrix[10];

		inv[5] = matrix[0] * matrix[10] * matrix[15] -
			matrix[0] * matrix[11] * matrix[14] -
			matrix[8] * matrix[2] * matrix[15] +
			matrix[8] * matrix[3] * matrix[14] +
			matrix[12] * matrix[2] * matrix[11] -
			matrix[12] * matrix[3] * matrix[10];

		inv[9] = -matrix[0] * matrix[9] * matrix[15] +
			matrix[0] * matrix[11] * matrix[13] +
			matrix[8] * matrix[1] * matrix[15] -
			matrix[8] * matrix[3] * matrix[13] -
			matrix[12] * matrix[1] * matrix[11] +
			matrix[12] * matrix[3] * matrix[9];

		inv[13] = matrix[0] * matrix[9] * matrix[14] -
			matrix[0] * matrix[10] * matrix[13] -
			matrix[8] * matrix[1] * matrix[14] +
			matrix[8] * matrix[2] * matrix[13] +
			matrix[12] * matrix[1] * matrix[10] -
			matrix[12] * matrix[2] * matrix[9];

		inv[2] = matrix[1] * matrix[6] * matrix[15] -
			matrix[1] * matrix[7] * matrix[14] -
			matrix[5] * matrix[2] * matrix[15] +
			matrix[5] * matrix[3] * matrix[14] +
			matrix[13] * matrix[2] * matrix[7] -
			matrix[13] * matrix[3] * matrix[6];

		inv[6] = -matrix[0] * matrix[6] * matrix[15] +
			matrix[0] * matrix[7] * matrix[14] +
			matrix[4] * matrix[2] * matrix[15] -
			matrix[4] * matrix[3] * matrix[14] -
			matrix[12] * matrix[2] * matrix[7] +
			matrix[12] * matrix[3] * matrix[6];

		inv[10] = matrix[0] * matrix[5] * matrix[15] -
			matrix[0] * matrix[7] * matrix[13] -
			matrix[4] * matrix[1] * matrix[15] +
			matrix[4] * matrix[3] * matrix[13] +
			matrix[12] * matrix[1] * matrix[7] -
			matrix[12] * matrix[3] * matrix[5];

		inv[14] = -matrix[0] * matrix[5] * matrix[14] +
			matrix[0] * matrix[6] * matrix[13] +
			matrix[4] * matrix[1] * matrix[14] -
			matrix[4] * matrix[2] * matrix[13] -
			matrix[12] * matrix[1] * matrix[6] +
			matrix[12] * matrix[2] * matrix[5];

		inv[3] = -matrix[1] * matrix[6] * matrix[11] +
			matrix[1] * matrix[7] * matrix[10] +
			matrix[5] * matrix[2] * matrix[11] -
			matrix[5] * matrix[3] * matrix[10] -
			matrix[9] * matrix[2] * matrix[7] +
			matrix[9] * matrix[3] * matrix[6];

		inv[7] = matrix[0] * matrix[6] * matrix[11] -
			matrix[0] * matrix[7] * matrix[10] -
			matrix[4] * matrix[2] * matrix[11] +
			matrix[4] * matrix[3] * matrix[10] +
			matrix[8] * matrix[2] * matrix[7] -
			matrix[8] * matrix[3] * matrix[6];

		inv[11] = -matrix[0] * matrix[5] * matrix[11] +
			matrix[0] * matrix[7] * matrix[9] +
			matrix[4] * matrix[1] * matrix[11] -
			matrix[4] * matrix[3] * matrix[9] -
			matrix[8] * matrix[1] * matrix[7] +
			matrix[8] * matrix[3] * matrix[5];

		inv[15] = matrix[0] * matrix[5] * matrix[10] -
			matrix[0] * matrix[6] * matrix[9] -
			matrix[4] * matrix[1] * matrix[10] +
			matrix[4] * matrix[2] * matrix[9] +
			matrix[8] * matrix[1] * matrix[6] -
			matrix[8] * matrix[2] * matrix[5];

		det = matrix[0] * inv[0] + matrix[1] * inv[4] + matrix[2] * inv[8] + matrix[3] * inv[12];

		if (det === 0.0)
			return null;

		det = 1.0 / det;

		for (i = 0; i < 16; i++)
			inv[i] = inv[i] * det;

		this.inverse = inv;

		{
			const inverseMatrix = new Matrix4(this.inverse);

			inverseMatrix.inverse = new Float32Array(16);
			inverseMatrix.inverse.set(matrix);

			return inverseMatrix;
		}
	}

	EqualTo(matrix) {
		for (let i = 0; i < 16; ++i) {
			if (!Misc.FloatEqual(this.matrix[i], matrix.matrix[i]))
				return false;
		}

		return true;
	}

	ToArray() {
		return this.matrix;
	}

	Reset() {
		for (let i = 0; i < 16; ++i)
			this.matrix[i] = Matrix4.Identity.matrix[i];
	}

	/**
	 * Instance overload: matrix.Multiply(other) multiplies in place.
	 * The static overload is Matrix4.Multiply(matrix1, matrix2) (see below).
	 */
	Multiply(matrix) {
		const multipliedMatrix = Matrix4.op_Multiply(this, matrix);

		for (let i = 0; i < 16; ++i)
			this.matrix[i] = multipliedMatrix.matrix[i];
	}

	static Multiply(matrix1, matrix2) {
		const a = matrix1.matrix;
		const b = matrix2.matrix;

		const ax1 = a[0], ax2 = a[1], ax3 = a[2], ax4 = a[3];
		const ay1 = a[4], ay2 = a[5], ay3 = a[6], ay4 = a[7];
		const az1 = a[8], az2 = a[9], az3 = a[10], az4 = a[11];
		const aw1 = a[12], aw2 = a[13], aw3 = a[14], aw4 = a[15];

		const bx1 = b[0], bx2 = b[1], bx3 = b[2], bx4 = b[3];
		const by1 = b[4], by2 = b[5], by3 = b[6], by4 = b[7];
		const bz1 = b[8], bz2 = b[9], bz3 = b[10], bz4 = b[11];
		const bw1 = b[12], bw2 = b[13], bw3 = b[14], bw4 = b[15];

		return new Matrix4(floats([
			ax1 * bx1 + ax2 * by1 + ax3 * bz1 + ax4 * bw1,
			ax1 * bx2 + ax2 * by2 + ax3 * bz2 + ax4 * bw2,
			ax1 * bx3 + ax2 * by3 + ax3 * bz3 + ax4 * bw3,
			ax1 * bx4 + ax2 * by4 + ax3 * bz4 + ax4 * bw4,

			ay1 * bx1 + ay2 * by1 + ay3 * bz1 + ay4 * bw1,
			ay1 * bx2 + ay2 * by2 + ay3 * bz2 + ay4 * bw2,
			ay1 * bx3 + ay2 * by3 + ay3 * bz3 + ay4 * bw3,
			ay1 * bx4 + ay2 * by4 + ay3 * bz4 + ay4 * bw4,

			az1 * bx1 + az2 * by1 + az3 * bz1 + az4 * bw1,
			az1 * bx2 + az2 * by2 + az3 * bz2 + az4 * bw2,
			az1 * bx3 + az2 * by3 + az3 * bz3 + az4 * bw3,
			az1 * bx4 + az2 * by4 + az3 * bz4 + az4 * bw4,

			aw1 * bx1 + aw2 * by1 + aw3 * bz1 + aw4 * bw1,
			aw1 * bx2 + aw2 * by2 + aw3 * bz2 + aw4 * bw2,
			aw1 * bx3 + aw2 * by3 + aw3 * bz3 + aw4 * bw3,
			aw1 * bx4 + aw2 * by4 + aw3 * bz4 + aw4 * bw4
		]));
	}

	/** operator * */
	static op_Multiply(matrix1, matrix2) {
		return Matrix4.Multiply(matrix1, matrix2);
	}

	/** MultiplyVector(ref x, ref y, ref z) -> returns [x, y, z] */
	MultiplyVector(x, y, z) {
		const matrix = this.matrix;
		const newX = matrix[0] * x + matrix[1] * y + matrix[2] * z + matrix[3];
		const newY = matrix[4] * x + matrix[5] * y + matrix[6] * z + matrix[7];
		const newZ = matrix[8] * x + matrix[9] * y + matrix[10] * z + matrix[11];

		return [Math.fround(newX), Math.fround(newY), Math.fround(newZ)];
	}
}
