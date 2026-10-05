// Port of Ambermoon.Data.Legacy/MapManager.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { ArgumentException, KeyNotFoundException, getValue } from '../../runtime.js';
import { Map as AmbermoonMap } from '../Ambermoon.Data.Common/Map.js';
import { Tileset } from '../Ambermoon.Data.Common/Tileset.js';
import { Labdata } from '../Ambermoon.Data.Common/Labdata.js';

export class MapManager {
	constructor(gameData, mapReader, tilesetReader, labdataReader, stopAtFirstError) {
		this.maps = new Map();
		this.tilesets = new Map();
		this.labdata = new Map();

		for (const [key, value] of getValue(gameData.Files, 'Icon_data.amb').Files) {
			const tileset = Tileset.Load(tilesetReader, value);
			this.tilesets.set(key, tileset);
			tileset.Index = key;
		}

		// Map 1-256 -> File 1
		// Map 300-369 -> File 2
		// Map 257-299, 400-455, 513-528 -> File 3
		for (let i = 1; i <= 3; ++i) {
			const containerName = `${i}Map_data.amb`;
			const textContainerName = `${i}Map_texts.amb`;

			const mapContainer = gameData.Files.get(containerName) ?? null;

			if (mapContainer == null) {
				if (stopAtFirstError)
					throw new KeyNotFoundException(`Map container ${containerName} is missing.`);
				else
					continue;
			}

			const textContainer = gameData.Files.get(textContainerName) ?? null;

			if (textContainer == null && stopAtFirstError)
				throw new KeyNotFoundException(`Map text container ${textContainerName} is missing.`);

			for (const [key, value] of mapContainer.Files) {
				if (value.Size !== 0) {
					value.Position = 0;
					const index = key;
					const textFile = textContainer == null ? null : textContainer.Files.has(key) ? textContainer.Files.get(key) : null;
					if (this.maps.has(index))
						throw new ArgumentException('An item with the same key has already been added.');
					this.maps.set(index, AmbermoonMap.Load(index, mapReader, value, textFile, this.tilesets));
				}
			}
		}

		for (const [key, value] of getValue(gameData.Files, '2Lab_data.amb').Files) { // Note: 2Lab_data.amb and 3Lab_data.amb both contain all lab data files
			if (value.Size !== 0) {
				value.Position = 0;
				const labdata = Labdata.Load(labdataReader, value, gameData);
				this.labdata.set(key, labdata);
			}
		}
	}

	get Maps() { return [...this.maps.values()]; }
	get Labdata() { return [...this.labdata.values()]; }
	get Tilesets() { return [...this.tilesets.values()]; }

	GetMap(index) { return this.maps.get(index) ?? null; }
	GetTilesetForMap(map) { return getValue(this.tilesets, map.TilesetOrLabdataIndex); }
	GetLabdataForMap(map) { return getValue(this.labdata, map.TilesetOrLabdataIndex); }
}
