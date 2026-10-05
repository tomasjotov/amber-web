// Port of Ambermoon.Core/Render/Color.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { toByte } from '../../../runtime.js';
import { Util } from '../../Ambermoon.Common/Util.js';

export class Color {
	/**
	 * Overloads:
	 * - Color()                              -> black, opaque
	 * - Color(r, g, b, a = 255)              -> byte/int components (numbers are always treated as integers!)
	 * - Color(Color other, a)                -> copy with alpha
	 * - Color(Color other)                   -> copy
	 * - Color(uint xrgb, a = 255)            -> from packed xrgb (1 or 2 numeric arguments)
	 * The C# float overload Color(float r, float g, float b, float a = 1.0f) cannot be distinguished
	 * at runtime from the int overload. Use Color.FromFloat(r, g, b, a) for it.
	 */
	constructor(...args) {
		if (args.length === 0) {
			this.R = 0;
			this.G = 0;
			this.B = 0;
			this.A = 255;
		} else if (args[0] instanceof Color) {
			const other = args[0];
			this.R = other.R;
			this.G = other.G;
			this.B = other.B;
			this.A = args.length >= 2 ? toByte(args[1]) : other.A;
		} else if (args.length <= 2) {
			const xrgb = args[0] >>> 0;
			const a = args.length >= 2 ? args[1] : 255;
			this.R = toByte((xrgb >>> 16) & 0xff);
			this.G = toByte((xrgb >>> 8) & 0xff);
			this.B = toByte(xrgb & 0xff);
			this.A = toByte(a);
		} else {
			const [r, g, b, a = 255] = args;
			this.R = toByte(r);
			this.G = toByte(g);
			this.B = toByte(b);
			this.A = toByte(a);
		}
	}

	/** C# overload Color(float r, float g, float b, float a = 1.0f) */
	static FromFloat(r, g, b, a = 1.0) {
		const color = new Color();
		color.R = toByte(Util.Round(r * 255.0));
		color.G = toByte(Util.Round(g * 255.0));
		color.B = toByte(Util.Round(b * 255.0));
		color.A = toByte(Util.Round(a * 255.0));
		return color;
	}

	static op_Equality(color1, color2) {
		if (color1 === color2)
			return true;

		if (color1 == null || color2 == null)
			return false;

		return color1.R === color2.R && color1.G === color2.G &&
			color1.B === color2.B && color1.A === color2.A;
	}

	static op_Inequality(color1, color2) {
		if (color1 === color2)
			return false;

		if (color1 == null || color2 == null)
			return true;

		return color1.R !== color2.R || color1.G !== color2.G ||
			color1.B !== color2.B || color1.A !== color2.A;
	}

	/**
	 * Equals(Color other) / Equals(object obj) / Equals(Color x, Color y) (IEqualityComparer)
	 */
	Equals(...args) {
		if (args.length >= 2) {
			const [x, y] = args;
			if (x == null)
				return y == null;

			return y != null && Color.op_Equality(x, y);
		}

		const other = args[0];

		if (other == null)
			return false;

		if (other instanceof Color)
			return Color.op_Equality(this, other);

		return false;
	}

	/** GetHashCode() / GetHashCode(Color obj) */
	GetHashCode(...args) {
		if (args.length !== 0) {
			const obj = args[0];
			return obj == null ? 0 : obj.GetHashCode();
		}

		// HashCode.Combine is randomized in .NET, any stable combination is fine.
		return ((((this.R * 31 + this.G) | 0) * 31 + this.B) | 0) * 31 + this.A | 0;
	}

	toString() {
		return `${this.R},${this.G},${this.B},${this.A}`;
	}

	ToString() {
		return this.toString();
	}

	WithFactor(factor) {
		const zero = 0;

		if (factor <= 0.0)
			return new Color(zero, zero, zero, this.A);

		if (factor > 1.0)
			factor = 1.0;

		return Color.FromFloat(factor * this.R / 255.0, factor * this.G / 255.0, factor * this.B / 255.0, this.A / 255.0);
	}

	WithLight(light) {
		if (light < 0.0)
			light = 0.0;

		if (light > 1.0)
			light = 1.0;

		const add = light - 1.0;

		return Color.FromFloat(Util.Limit(0.0, add + this.R / 255.0, 1.0), Util.Limit(0.0, add + this.G / 255.0, 1.0), Util.Limit(0.0, add + this.B / 255.0, 1.0), this.A / 255.0);
	}

	static op_Addition(a, b) {
		// int constructor: (byte) casts wrap
		return new Color(a.R + b.R, a.G + b.G, a.B + b.B, Math.trunc((a.A + b.A) / 2));
	}

	/** Color * float and float * Color */
	static op_Multiply(a, b) {
		if (a instanceof Color)
			return a.WithFactor(b);
		return b.WithFactor(a);
	}

	static {
		Color.Transparent = new Color(0x00, 0x00, 0x00, 0x00);
		Color.Black = new Color(0x00, 0x00, 0x00);
		Color.Green = new Color(0x73, 0xb3, 0x43);
		Color.White = new Color(0xff, 0xff, 0xff);
		Color.DarkShadow = new Color(0x22, 0x22, 0x11);
		Color.DarkGray = new Color(0x44, 0x44, 0x33);
		Color.LightGray = new Color(0x66, 0x66, 0x55);
		Color.BrightGray = new Color(0x77, 0x77, 0x66);
		Color.BrightAccent = new Color(0x88, 0x88, 0x77);
		Color.DarkAccent = new Color(0x55, 0x55, 0x44);
		Color.EarthOverlay = new Color(0x88, 0x66, 0x11, 0x68);
		Color.WindOverlay = new Color(0xbb, 0xbb, 0xcc, 0x68);
		Color.FireOverlay = new Color(0xbb, 0x22, 0x00, 0x68);
		Color.IceOverlay = new Color(0x00, 0x11, 0x99, 0x68);
	}
}
