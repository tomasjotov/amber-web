// Port of Ambermoon.Common/Util.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { round, toShort, formatNumber } from '../../runtime.js';

export class Util {
	static SafeCall(action) {
		try {
			action?.();
		} catch {
			// ignore
		}
	}

	static FloatEqual(f1, f2) {
		return Math.abs(f1 - f2) < 0.00001;
	}

	static Floor(f) {
		return Math.trunc(Math.floor(f));
	}

	static Ceiling(f) {
		return Math.trunc(Math.ceil(f));
	}

	static Round(f) {
		// Math.Round uses banker's rounding in .NET
		return Math.trunc(round(f));
	}

	// float / long / uint / int overloads are identical in JS
	static Limit(minValue, value, maxValue) {
		return Math.max(minValue, Math.min(value, maxValue));
	}

	static LimitToShort(value) {
		return toShort(Util.Limit(-32768, value, 32767));
	}

	// float / int / uint overloads are identical in JS
	static Min(firstValue, secondValue, ...values) {
		let min = Math.min(firstValue, secondValue);

		for (const value of values) {
			if (value < min)
				min = value;
		}

		return min;
	}

	static Max(firstValue, secondValue, ...values) {
		let max = Math.max(firstValue, secondValue);

		for (const value of values) {
			if (value > max)
				max = value;
		}

		return max;
	}

	static Square(value) {
		return value * value;
	}

	/**
	 * BytesToHexString(separator, ...bytes) or BytesToHexString(...bytes).
	 * A single array/Uint8Array argument (after the optional separator) is accepted as well.
	 */
	static BytesToHexString(...args) {
		let separator = ' ';
		if (args.length !== 0 && typeof args[0] === 'string')
			separator = args.shift();
		let bytes = args;
		if (args.length === 1 && args[0] != null && typeof args[0] !== 'number')
			bytes = args[0];
		return Array.from(bytes, b => formatNumber(b & 0xff, 'x2')).join(separator);
	}
}
