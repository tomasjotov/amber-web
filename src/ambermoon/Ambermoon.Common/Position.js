// Port of Ambermoon.Common/Position.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { Util } from './Util.js';

function combineHash(a, b) {
	let hash = 17;
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

export class Position {
	static get Zero() { return new Position(0, 0); }

	/**
	 * new Position(), new Position(x, y), new Position(position)
	 */
	constructor(x, y) {
		this.X = 0;
		this.Y = 0;

		if (arguments.length === 1) {
			const position = x;
			this.X = position.X;
			this.Y = position.Y;
		} else if (arguments.length >= 2) {
			this.X = x;
			this.Y = y;
		}
	}

	clone() {
		return new Position(this.X, this.Y);
	}

	/** Value key for ValueMap/ValueSet. */
	toString() {
		return `${this.X},${this.Y}`;
	}

	ToString() {
		return this.toString();
	}

	Normalize() {
		const xAbs = Math.abs(this.X);
		const yAbs = Math.abs(this.Y);

		if (this.X < 0)
			this.X = -1;
		else if (this.X > 0)
			this.X = 1;

		if (this.Y < 0)
			this.Y = -1;
		else if (this.Y > 0)
			this.Y = 1;

		if (xAbs > 0 && yAbs > 0) {
			this.X *= xAbs < Math.trunc(yAbs / 2) ? 0 : 1;
			this.Y *= yAbs < Math.trunc(xAbs / 2) ? 0 : 1;
		}
	}

	/** Offset(x, y) or Offset(position) */
	Offset(x, y) {
		if (arguments.length === 1) {
			const position = x;
			this.Offset(position.X, position.Y);
			return;
		}

		this.X += x;
		this.Y += y;
	}

	Distance(other) {
		const dx = other.X - this.X;
		const dy = other.Y - this.Y;
		return Math.fround(Math.sqrt(dx * dx + dy * dy));
	}

	/** returns [x, y] */
	Deconstruct() {
		return [this.X, this.Y];
	}

	static op_Addition(position1, position2) {
		return new Position(position1.X + position2.X, position1.Y + position2.Y);
	}

	static op_Subtraction(position1, position2) {
		return new Position(position1.X - position2.X, position1.Y - position2.Y);
	}

	/**
	 * position * factor or factor * position.
	 * An integral factor yields a Position, a non-integral factor yields a FloatPosition.
	 */
	static op_Multiply(a, b) {
		let position = a;
		let factor = b;

		if (typeof a === 'number') {
			position = b;
			factor = a;
		}

		if (Number.isInteger(factor))
			return new Position(position.X * factor, position.Y * factor);

		return new FloatPosition(position.X * factor, position.Y * factor);
	}

	static op_Equality(position1, position2) {
		if (position1 === position2)
			return true;

		if (position1 == null || position2 == null)
			return false;

		return position1.X === position2.X && position1.Y === position2.Y;
	}

	static op_Inequality(position1, position2) {
		return !Position.op_Equality(position1, position2);
	}

	/** Equals(other) or Equals(x, y) (IEqualityComparer) */
	Equals(x, y) {
		if (arguments.length >= 2) {
			if (x == null)
				return y == null;

			return Position.op_Equality(x, y);
		}

		const obj = x;

		if (obj == null)
			return false;

		if (obj instanceof Position)
			return Position.op_Equality(this, obj);

		return false;
	}

	/** GetHashCode() or GetHashCode(obj) (IEqualityComparer) */
	GetHashCode(obj) {
		if (arguments.length >= 1)
			return (obj == null) ? 0 : obj.GetHashCode();

		return combineHash(this.X, this.Y);
	}
}

export class FloatPosition {
	/**
	 * new FloatPosition(), new FloatPosition(x, y), new FloatPosition(position) (FloatPosition or Position)
	 */
	constructor(x, y) {
		this.X = 0.0;
		this.Y = 0.0;

		if (arguments.length === 1) {
			const position = x;
			this.X = position.X;
			this.Y = position.Y;
		} else if (arguments.length >= 2) {
			this.X = x;
			this.Y = y;
		}
	}

	static Zero = new FloatPosition(0.0, 0.0);

	clone() {
		return new FloatPosition(this.X, this.Y);
	}

	/** Value key for ValueMap/ValueSet. */
	toString() {
		return `${this.X},${this.Y}`;
	}

	ToString() {
		return this.toString();
	}

	Normalize() {
		const xAbs = Math.abs(this.X);
		const yAbs = Math.abs(this.Y);

		if (this.X < -0.0001)
			this.X = -1.0;
		else if (this.X > 0.0001)
			this.X = 1.0;

		if (this.Y < -0.0001)
			this.Y = -1.0;
		else if (this.Y > 0.0001)
			this.Y = 1.0;

		if (xAbs >= 0.00001 && yAbs >= 0.00001) {
			this.X *= xAbs < yAbs ? xAbs / yAbs : 1.0;
			this.Y *= yAbs < xAbs ? yAbs / xAbs : 1.0;
		}
	}

	/** Offset(x, y) or Offset(position) (FloatPosition or Position) */
	Offset(x, y) {
		if (arguments.length === 1) {
			const position = x;
			this.Offset(position.X, position.Y);
			return;
		}

		this.X += x;
		this.Y += y;
	}

	Distance(other) {
		const dx = other.X - this.X;
		const dy = other.Y - this.Y;
		return Math.fround(Math.sqrt(dx * dx + dy * dy));
	}

	/** Round() or Round(factor) */
	Round(factor) {
		if (arguments.length >= 1)
			return new Position(Util.Round(factor * this.X), Util.Round(factor * this.Y));

		return new Position(Util.Round(this.X), Util.Round(this.Y));
	}

	Floor() {
		return new Position(Util.Floor(this.X), Util.Floor(this.Y));
	}

	Ceiling() {
		return new Position(Util.Ceiling(this.X), Util.Ceiling(this.Y));
	}

	static op_Addition(position1, position2) {
		return new FloatPosition(position1.X + position2.X, position1.Y + position2.Y);
	}

	static op_Subtraction(position1, position2) {
		return new FloatPosition(position1.X - position2.X, position1.Y - position2.Y);
	}

	/** position * factor or factor * position */
	static op_Multiply(a, b) {
		let position = a;
		let factor = b;

		if (typeof a === 'number') {
			position = b;
			factor = a;
		}

		return new FloatPosition(position.X * factor, position.Y * factor);
	}

	static op_Equality(position1, position2) {
		if (position1 === position2)
			return true;

		if (position1 == null || position2 == null)
			return false;

		return Util.FloatEqual(position1.X, position2.X) && Util.FloatEqual(position1.Y, position2.Y);
	}

	static op_Inequality(position1, position2) {
		return !FloatPosition.op_Equality(position1, position2);
	}

	/** Implicit conversion Position -> FloatPosition */
	static op_Implicit(position) {
		return new FloatPosition(position);
	}

	/** Equals(other) or Equals(x, y) (IEqualityComparer) */
	Equals(x, y) {
		if (arguments.length >= 2) {
			if (x == null)
				return y == null;

			return FloatPosition.op_Equality(x, y);
		}

		const obj = x;

		if (obj == null)
			return false;

		if (obj instanceof FloatPosition)
			return FloatPosition.op_Equality(this, obj);

		return false;
	}

	/** GetHashCode() or GetHashCode(obj) (IEqualityComparer) */
	GetHashCode(obj) {
		if (arguments.length >= 1)
			return (obj == null) ? 0 : obj.GetHashCode();

		let hash = 17;

		hash = (Math.imul(hash, 23) + floatHash(this.X)) | 0;
		hash = (Math.imul(hash, 23) + floatHash(this.Y)) | 0;

		return hash;
	}
}
