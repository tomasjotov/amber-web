// Port of Ambermoon.Data.Common/Automap.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { AmbermoonException, ExceptionScope } from '../Ambermoon.Common/Exception.js';

export class Automap {
	constructor() {
		/** Uint8Array */
		this.ExplorationBits = null;
	}

	static Load(automapReader, dataReader) {
		const automap = new Automap();

		automapReader.ReadAutomap(automap, dataReader);

		return automap;
	}

	/** IsBlockExplored(map, x, y) or IsBlockExplored(blockIndex) */
	IsBlockExplored(a, x, y) {
		if (arguments.length >= 3) {
			const map = a;
			return this.IsBlockExplored((x + y * map.Width) >>> 0);
		}

		const blockIndex = a;
		const byteIndex = Math.trunc(blockIndex / 8);

		if (byteIndex >= this.ExplorationBits.length)
			throw new AmbermoonException(ExceptionScope.Data, 'Block index exceeds automap size.');

		const bitIndex = blockIndex % 8;

		return (this.ExplorationBits[byteIndex] & (1 << bitIndex)) !== 0;
	}

	/** ExploreBlock(map, x, y) or ExploreBlock(blockIndex) */
	ExploreBlock(a, x, y) {
		if (arguments.length >= 3) {
			const map = a;

			if (this.ExplorationBits.length !== Math.trunc((map.Width * map.Height + 7) / 8)) {
				const newExplorationBits = new Uint8Array(Math.trunc((map.Width * map.Height + 7) / 8));

				newExplorationBits.set(this.ExplorationBits.subarray(0, Math.min(this.ExplorationBits.length, newExplorationBits.length)));
				this.ExplorationBits = newExplorationBits;
			}

			this.ExploreBlock((x + y * map.Width) >>> 0);
			return;
		}

		const blockIndex = a;
		const byteIndex = Math.trunc(blockIndex / 8);

		if (byteIndex >= this.ExplorationBits.length)
			throw new AmbermoonException(ExceptionScope.Data, 'Block index exceeds automap size.');

		const bitIndex = blockIndex % 8;

		this.ExplorationBits[byteIndex] |= (1 << bitIndex);
	}

	ResetExploration() {
		this.ExplorationBits.fill(0);
	}
}
