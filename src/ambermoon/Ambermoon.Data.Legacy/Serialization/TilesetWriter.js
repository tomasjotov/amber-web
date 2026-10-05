// Port of Ambermoon.Data.Legacy/Serialization/TilesetWriter.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

export class TilesetWriter {
	static WriteTileset(tileset, dataWriter) {
		dataWriter.WriteWord(tileset.Tiles.length);

		for (const tile of tileset.Tiles) {
			let flags = tile.Flags >>> 0;
			flags = (flags & 0x0c7100ff) >>> 0;
			flags = (flags | ((tile.CombatBackgroundIndex & 0xf) << 28)) >>> 0;
			if (tile.Sleep)
				flags = (flags | (5 << 23)) >>> 0;
			else if (tile.SitDirection != null)
				flags = (flags | ((1 + tile.SitDirection) << 23)) >>> 0;
			flags = (flags | ((tile.AllowedTravelTypes & 0xfff) << 8)) >>> 0;

			dataWriter.WriteDword(flags);
			dataWriter.WriteWord(tile.GraphicIndex);
			dataWriter.WriteByte(tile.NumAnimationFrames);
			dataWriter.WriteByte(tile.ColorIndex);
		}
	}
}
