// Port of Ambermoon.Common/Size.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { Util } from './Util.js';
import { Position, FloatPosition } from './Position.js';

function combineHash(a, b) {
	let hash = 19;
	hash = (Math.imul(hash, 31) + (a | 0)) | 0;
	hash = (Math.imul(hash, 31) + (b | 0)) | 0;
	return hash;
}

const floatBuffer = new Float32Array(1);
const floatBufferInt = new Int32Array(floatBuffer.buffer);

function floatHash(f) {
	floatBuffer[0] = f;
	return floatBufferInt[0];
}

export class Size {
	/**
	 * new Size(), new Size(width, height), new Size(size)
	 */
	constructor(width, height) {
		this.Width = 0;
		this.Height = 0;

		if (arguments.length === 1) {
			const size = width;
			this.Width = size.Width;
			this.Height = size.Height;
		} else if (arguments.length >= 2) {
			this.Width = width;
			this.Height = height;
		}
	}

	get Empty() { return this.Width <= 0 || this.Height <= 0; }

	clone() {
		return new Size(this.Width, this.Height);
	}

	/** Value key for ValueMap/ValueSet. */
	toString() {
		return `${this.Width},${this.Height}`;
	}

	ToString() {
		return this.toString();
	}

	/**
	 * size * factor or factor * size.
	 * An integral factor yields a Size, a non-integral factor yields a FloatSize.
	 */
	static op_Multiply(a, b) {
		let size = a;
		let factor = b;

		if (typeof a === 'number') {
			size = b;
			factor = a;
		}

		if (Number.isInteger(factor))
			return new Size(size.Width * factor, size.Height * factor);

		return new FloatSize(size.Width * factor, size.Height * factor);
	}

	static op_Equality(size1, size2) {
		if (size1 === size2)
			return true;

		if (size1 == null || size2 == null)
			return false;

		return size1.Width === size2.Width && size1.Height === size2.Height;
	}

	static op_Inequality(size1, size2) {
		return !Size.op_Equality(size1, size2);
	}

	/** Equals(other) or Equals(x, y) (IEqualityComparer) */
	Equals(x, y) {
		if (arguments.length >= 2) {
			if (x == null)
				return y == null;

			return Size.op_Equality(x, y);
		}

		const obj = x;

		if (obj == null)
			return false;

		if (obj instanceof Size)
			return Size.op_Equality(this, obj);

		return false;
	}

	/** GetHashCode() or GetHashCode(obj) (IEqualityComparer) */
	GetHashCode(obj) {
		if (arguments.length >= 1)
			return (obj == null) ? 0 : obj.GetHashCode();

		return combineHash(this.Width, this.Height);
	}

	AsPosition() {
		return new Position(this.Width, this.Height);
	}
}

export class FloatSize {
	/**
	 * new FloatSize(), new FloatSize(width, height), new FloatSize(size) (FloatSize or Size)
	 */
	constructor(width, height) {
		this.Width = 0.0;
		this.Height = 0.0;

		if (arguments.length === 1) {
			const size = width;
			this.Width = size.Width;
			this.Height = size.Height;
		} else if (arguments.length >= 2) {
			this.Width = width;
			this.Height = height;
		}
	}

	get Empty() { return this.Width <= 0.0 || this.Height <= 0.0; }

	clone() {
		return new FloatSize(this.Width, this.Height);
	}

	/** Value key for ValueMap/ValueSet. */
	toString() {
		return `${this.Width},${this.Height}`;
	}

	ToString() {
		return this.toString();
	}

	static op_Equality(size1, size2) {
		if (size1 === size2)
			return true;

		if (size1 == null || size2 == null)
			return false;

		return Util.FloatEqual(size1.Width, size2.Width) && Util.FloatEqual(size1.Height, size2.Height);
	}

	static op_Inequality(size1, size2) {
		return !FloatSize.op_Equality(size1, size2);
	}

	/** Implicit conversion Size -> FloatSize */
	static op_Implicit(size) {
		return new FloatSize(size);
	}

	/** size * factor, factor * size or size1 * size2 (component-wise) */
	static op_Multiply(a, b) {
		if (typeof a === 'number')
			return new FloatSize(b.Width * a, b.Height * a);

		if (typeof b === 'number')
			return new FloatSize(a.Width * b, a.Height * b);

		return new FloatSize(a.Width * b.Width, a.Height * b.Height);
	}

	static op_Division(size1, size2) {
		return new FloatSize(size1.Width / size2.Width, size1.Height / size2.Height);
	}

	ToSize(truncate = false) {
		return new Size(truncate ? Util.Floor(this.Width) : Util.Round(this.Width), truncate ? Util.Floor(this.Height) : Util.Round(this.Height));
	}

	AsPosition() {
		return new FloatPosition(this.Width, this.Height);
	}

	/** Equals(other) or Equals(x, y) (IEqualityComparer) */
	Equals(x, y) {
		if (arguments.length >= 2) {
			if (x == null)
				return y == null;

			return FloatSize.op_Equality(x, y);
		}

		const obj = x;

		if (obj == null)
			return false;

		if (obj instanceof FloatSize)
			return FloatSize.op_Equality(this, obj);

		return false;
	}

	/** GetHashCode() or GetHashCode(obj) (IEqualityComparer) */
	GetHashCode(obj) {
		if (arguments.length >= 1)
			return (obj == null) ? 0 : obj.GetHashCode();

		let hash = 23;

		hash = (Math.imul(hash, 17) + floatHash(this.Width)) | 0;
		hash = (Math.imul(hash, 17) + floatHash(this.Height)) | 0;

		return hash;
	}
}
