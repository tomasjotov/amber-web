// Port of Ambermoon.Data.Legacy/Serialization/TilesetReader.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { Tileset } from '../../Ambermoon.Data.Common/Tileset.js';

export class TilesetReader {
	ReadTileset(tileset, dataReader) {
		const numTiles = dataReader.ReadWord();
		tileset.Tiles = new Array(numTiles).fill(null);

		for (let i = 0; i < numTiles; ++i) {
			const tileFlags = dataReader.ReadDword();

			const tile = new Tileset.Tile();
			tile.GraphicIndex = dataReader.ReadWord();
			tile.NumAnimationFrames = dataReader.ReadByte();
			tile.ColorIndex = dataReader.ReadByte();
			tile.Flags = tileFlags;
			tileset.Tiles[i] = tile;
		}
	}
}
