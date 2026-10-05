// Port of Ambermoon.Common/Rect.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { Util } from './Util.js';
import { Position, FloatPosition } from './Position.js';
import { Size, FloatSize } from './Size.js';

export class Rect {
	/**
	 * new Rect(), new Rect(x, y, width, height), new Rect(position, size), new Rect(rect)
	 */
	constructor(a, b, c, d) {
		this.position = new Position();
		this.size = new Size();

		if (arguments.length === 1) {
			const rect = a;
			this.position.X = rect.X;
			this.position.Y = rect.Y;
			this.size.Width = rect.Width;
			this.size.Height = rect.Height;
		} else if (arguments.length === 2) {
			const position = a;
			const size = b;
			this.position.X = position.X;
			this.position.Y = position.Y;
			this.size.Width = size.Width;
			this.size.Height = size.Height;
		} else if (arguments.length >= 4) {
			this.position.X = a;
			this.position.Y = b;
			this.size.Width = c;
			this.size.Height = d;
		}
	}

	get Position() { return this.position; }
	set Position(value) { this.position = new Position(value); }

	get Size() { return this.size; }
	set Size(value) { this.size = new Size(value); }

	get X() { return this.Position.X; }
	get Y() { return this.Position.Y; }
	get Width() { return this.Size.Width; }
	get Height() { return this.Size.Height; }

	get Left() { return this.Position.X; }
	get Right() { return this.Position.X + this.Size.Width; }
	get Top() { return this.Position.Y; }
	get Bottom() { return this.Position.Y + this.Size.Height; }
	get Empty() { return this.Size.Empty; }
	get Center() { return new Position(this.Position.X + Math.trunc(this.Size.Width / 2), this.Position.Y + Math.trunc(this.Size.Height / 2)); }

	clone() {
		return new Rect(this);
	}

	/** Value key for ValueMap/ValueSet. */
	toString() {
		return `${this.X},${this.Y},${this.Width},${this.Height}`;
	}

	ToString() {
		return this.toString();
	}

	static CreateFromBoundaries(left, top, right, bottom) {
		return new Rect(left, top, right - left, bottom - top);
	}

	static Create(center, size) {
		return new Rect(center.X - Math.trunc(size.Width / 2), center.Y - Math.trunc(size.Height / 2), size.Width, size.Height);
	}

	static GetCentered(rect, outerRect) {
		return Rect.Create(outerRect.Center, rect.Size);
	}

	/** Clip(left, top, right, bottom) or Clip(rect) */
	Clip(left, top, right, bottom) {
		if (arguments.length === 1) {
			const rect = left;
			this.Clip(rect.Left, rect.Top, rect.Right, rect.Bottom);
			return;
		}

		if (this.Left < left)
			this.position.X = left;

		if (this.Top < top)
			this.position.Y = top;

		if (right <= left)
			this.size.Width = 0;
		else if (this.Right > right)
			this.size.Width = right - this.Position.X;

		if (bottom <= top)
			this.size.Height = 0;
		else if (this.Bottom > bottom)
			this.size.Height = bottom - this.Position.Y;
	}

	/**
	 * Clips the given position and size (which are modified) to this rect.
	 * Overloads: (Position, Size), (FloatPosition, FloatSize), (FloatPosition, Size), (Position, FloatSize).
	 */
	ClipRect(position, size) {
		const floatPosition = position instanceof FloatPosition;
		const floatSize = size instanceof FloatSize;

		if (floatPosition && floatSize) {
			const right = Math.min(position.X + size.Width, this.Right);
			const bottom = Math.min(position.Y + size.Height, this.Bottom);
			position.X = Math.max(position.X, this.X);
			position.Y = Math.max(position.Y, this.Y);
			size.Width = right - position.X;
			size.Height = bottom - position.Y;
		} else if (floatPosition) {
			const right = Math.min(position.X + size.Width, this.Right);
			const bottom = Math.min(position.Y + size.Height, this.Bottom);
			position.X = Math.max(position.X, this.X);
			position.Y = Math.max(position.Y, this.Y);
			size.Width = Util.Round(right - position.X);
			size.Height = Util.Round(bottom - position.Y);
		} else if (floatSize) {
			const right = Math.min(Util.Round(position.X + size.Width), this.Right);
			const bottom = Math.min(Util.Round(position.Y + size.Height), this.Bottom);
			position.X = Math.max(position.X, this.X);
			position.Y = Math.max(position.Y, this.Y);
			size.Width = right - position.X;
			size.Height = bottom - position.Y;
		} else {
			const right = Math.min(position.X + size.Width, this.Right);
			const bottom = Math.min(position.Y + size.Height, this.Bottom);
			position.X = Math.max(position.X, this.X);
			position.Y = Math.max(position.Y, this.Y);
			size.Width = right - position.X;
			size.Height = bottom - position.Y;
		}
	}

	Trap(position) {
		position.X = Util.Limit(this.Left, position.X, this.Right);
		position.Y = Util.Limit(this.Top, position.Y, this.Bottom);
	}

	SetWidth(newWidth) {
		return new Rect(this.Position, new Size(newWidth, this.Size.Height));
	}

	SetHeight(newHeight) {
		return new Rect(this.Position, new Size(this.Size.Width, newHeight));
	}

	CreateModified(offsetX, offsetY, widthChange, heightChange) {
		return new Rect(this.position.X + offsetX, this.position.Y + offsetY, Math.max(0, this.Size.Width + widthChange), Math.max(0, this.Size.Height + heightChange));
	}

	CreateOffset(offsetX, offsetY) {
		return new Rect(this.position.X + offsetX, this.position.Y + offsetY, this.Size.Width, this.Size.Height);
	}

	CreateShrinked(shrinkAmount) {
		if (this.size.Width <= 2 * shrinkAmount ||
			this.size.Height <= 2 * shrinkAmount)
			return new Rect(0, 0, 0, 0);

		return new Rect(this.position.X + shrinkAmount, this.position.Y + shrinkAmount, this.size.Width - 2 * shrinkAmount, this.size.Height - 2 * shrinkAmount);
	}

	/** Contains(x, y) or Contains(point) */
	Contains(x, y) {
		if (arguments.length === 1) {
			const point = x;

			if (point == null)
				return false;

			return this.Contains(point.X, point.Y);
		}

		if (this.Empty)
			return false;

		return x >= this.Left && x < this.Right && y >= this.Top && y < this.Bottom;
	}

	/** IntersectsWith(x, y, width, height) or IntersectsWith(rect) */
	IntersectsWith(x, y, width, height) {
		if (arguments.length === 1) {
			const rect = x;

			if (rect == null)
				return false;

			if (rect.Right <= this.Left || this.Right <= rect.Left ||
				rect.Bottom <= this.Top || this.Bottom <= rect.Top)
				return false;

			return true;
		}

		if (x + width <= this.Left || this.Right <= x ||
			y + height <= this.Top || this.Bottom <= y)
			return false;

		return true;
	}

	static op_Equality(rect1, rect2) {
		if (rect1 === rect2)
			return true;

		if (rect1 == null || rect2 == null)
			return false;

		return Position.op_Equality(rect1.Position, rect2.Position) && Size.op_Equality(rect1.Size, rect2.Size);
	}

	static op_Inequality(rect1, rect2) {
		return !Rect.op_Equality(rect1, rect2);
	}

	/** Equals(other) or Equals(x, y) (IEqualityComparer) */
	Equals(x, y) {
		if (arguments.length >= 2) {
			if (x == null)
				return y == null;

			return Rect.op_Equality(x, y);
		}

		const obj = x;

		if (obj == null)
			return false;

		if (obj instanceof Rect)
			return Rect.op_Equality(this, obj);

		return false;
	}

	/** GetHashCode() or GetHashCode(obj) (IEqualityComparer) */
	GetHashCode(obj) {
		if (arguments.length >= 1)
			return (obj == null) ? 0 : obj.GetHashCode();

		let hash = 13;
		hash = (Math.imul(hash, 31) + (this.position?.GetHashCode() ?? 0)) | 0;
		hash = (Math.imul(hash, 31) + (this.size?.GetHashCode() ?? 0)) | 0;
		return hash;
	}
}

export class FloatRect {
	/**
	 * new FloatRect(), new FloatRect(x, y, width, height), new FloatRect(position, size) (float or int types),
	 * new FloatRect(rect) (FloatRect or Rect)
	 */
	constructor(a, b, c, d) {
		this.position = new FloatPosition();
		this.size = new FloatSize();

		if (arguments.length === 1) {
			const rect = a;
			this.position.X = rect.X;
			this.position.Y = rect.Y;
			this.size.Width = rect.Width;
			this.size.Height = rect.Height;
		} else if (arguments.length === 2) {
			const position = a;
			const size = b;
			this.position.X = position.X;
			this.position.Y = position.Y;
			this.size.Width = size.Width;
			this.size.Height = size.Height;
		} else if (arguments.length >= 4) {
			this.position.X = a;
			this.position.Y = b;
			this.size.Width = c;
			this.size.Height = d;
		}
	}

	get Position() { return this.position; }
	set Position(value) { this.position = new FloatPosition(value); }

	get Size() { return this.size; }
	set Size(value) { this.size = new FloatSize(value); }

	get X() { return this.Position.X; }
	get Y() { return this.Position.Y; }
	get Width() { return this.Size.Width; }
	get Height() { return this.Size.Height; }
	get Left() { return this.Position.X; }
	get Right() { return this.Position.X + this.Size.Width; }
	get Top() { return this.Position.Y; }
	get Bottom() { return this.Position.Y + this.Size.Height; }
	get Empty() { return this.Size.Empty; }
	get Center() { return new FloatPosition(this.Position.X + 0.5 * this.Size.Width, this.Position.Y + 0.5 * this.Size.Height); }

	clone() {
		return new FloatRect(this);
	}

	/** Value key for ValueMap/ValueSet. */
	toString() {
		return `${this.X},${this.Y},${this.Width},${this.Height}`;
	}

	ToString() {
		return this.toString();
	}

	static CreateFromBoundaries(left, top, right, bottom) {
		return new FloatRect(left, top, right - left, bottom - top);
	}

	/** Create(FloatPosition center, FloatSize size) or Create(Position center, Size size) (integer division) */
	static Create(center, size) {
		if (center instanceof Position && size instanceof Size)
			return new FloatRect(center.X - Math.trunc(size.Width / 2), center.Y - Math.trunc(size.Height / 2), size.Width, size.Height);

		return new FloatRect(center.X - size.Width / 2, center.Y - size.Height / 2, size.Width, size.Height);
	}

	/** Clip(left, top, right, bottom) or Clip(rect) (FloatRect or Rect) */
	Clip(left, top, right, bottom) {
		if (arguments.length === 1) {
			const rect = left;
			this.Clip(rect.Left, rect.Top, rect.Right, rect.Bottom);
			return;
		}

		if (this.Left < left)
			this.position.X = left;

		if (this.Top < top)
			this.position.Y = top;

		if (right <= left)
			this.size.Width = 0;
		else if (this.Right > right)
			this.size.Width = right - this.Position.X;

		if (bottom <= top)
			this.size.Height = 0;
		else if (this.Bottom > bottom)
			this.size.Height = bottom - this.Position.Y;
	}

	/** Contains(x, y) or Contains(point) (FloatPosition or Position) */
	Contains(x, y) {
		if (arguments.length === 1) {
			const point = x;
			return this.Contains(point.X, point.Y);
		}

		if (this.Empty)
			return false;

		return x >= this.Left && x <= this.Right && y >= this.Top && y <= this.Bottom;
	}

	/** IntersectsWith(rect) (FloatRect or Rect) */
	IntersectsWith(rect) {
		if (rect.Right <= this.Left || this.Right <= rect.Left ||
			rect.Bottom <= this.Top || this.Bottom <= rect.Top)
			return false;

		return true;
	}

	static op_Equality(rect1, rect2) {
		if (rect1 === rect2)
			return true;

		if (rect1 == null || rect2 == null)
			return false;

		return FloatPosition.op_Equality(rect1.Position, rect2.Position) && FloatSize.op_Equality(rect1.Size, rect2.Size);
	}

	static op_Inequality(rect1, rect2) {
		return !FloatRect.op_Equality(rect1, rect2);
	}

	/** Implicit conversion Rect -> FloatRect */
	static op_Implicit(rect) {
		return new FloatRect(rect);
	}

	/** Equals(other) or Equals(x, y) (IEqualityComparer) */
	Equals(x, y) {
		if (arguments.length >= 2) {
			if (x == null)
				return y == null;

			return FloatRect.op_Equality(x, y);
		}

		const obj = x;

		if (obj == null)
			return false;

		if (obj instanceof FloatRect)
			return FloatRect.op_Equality(this, obj);

		return false;
	}

	/** GetHashCode() or GetHashCode(obj) (IEqualityComparer) */
	GetHashCode(obj) {
		if (arguments.length >= 1)
			return (obj == null) ? 0 : obj.GetHashCode();

		let hash = 29;

		hash = (this.position == null) ? hash : (Math.imul(hash, 23) + this.position.GetHashCode()) | 0;
		hash = (this.size == null) ? hash : (Math.imul(hash, 23) + this.size.GetHashCode()) | 0;

		return hash;
	}
}

export class RectConversionExtensions {
	static ConvertToRect(rect) {
		return new Rect(Util.Round(rect.X),
			Util.Round(rect.Y),
			Util.Round(rect.Width),
			Util.Round(rect.Height));
	}

	static ConvertToFloatRect(rect) {
		return new FloatRect(rect.X, rect.Y, rect.Width, rect.Height);
	}
}
