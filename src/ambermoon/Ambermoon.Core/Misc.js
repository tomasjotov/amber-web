// Port of Ambermoon.Core/Misc.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// Misc.cs - Helper functions

import { round } from '../../runtime.js';

export class Misc {
	static FloatEqual(f1, f2) {
		return Math.abs(f1 - f2) < 0.00001;
	}

	static Floor(f) {
		return Math.trunc(Math.floor(f));
	}

	static Ceiling(f) {
		return Math.trunc(Math.ceil(f));
	}

	/** (int)Math.Round(f) -> banker's rounding like .NET */
	static Round(f) {
		return Math.trunc(round(f));
	}

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
}
