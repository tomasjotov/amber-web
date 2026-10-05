// Port of Ambermoon.Common/Random.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

export class Random {
	constructor() {
		this.state = [0x1234, 0x5678];
	}

	Next() {
		const state = this.state;
		const result = state[1];

		// rotate state[0] bits 1 right and add 7
		state[1] = (state[1] ^ (((((state[0] >> 1) | ((state[0] << 15) & 0xFFFF)) & 0xFFFF) + 7) & 0xFFFF)) & 0xFFFF;
		state[0] = result;

		return result;
	}
}
