// Port of Ambermoon.net/LoadingBarGraphicProvider.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
import { Graphic } from '../Ambermoon.Data.Common/Graphic.js';
import { DataReader } from '../Ambermoon.Data.Legacy/Serialization/DataReader.js';
import { Resources } from './Resources.js';

export class LoadingBarGraphicProvider {
	static LoadImage(imageData) {
		const dataReader = DataReader.FromData(imageData);
		const width = dataReader.ReadWord();
		const height = dataReader.ReadWord();
		const numColors = dataReader.ReadByte();

		const colors = new Uint8Array(numColors * 3);

		for (let i = 0; i < numColors; i++) {
			colors[i * 3 + 0] = dataReader.ReadByte();
			colors[i * 3 + 1] = dataReader.ReadByte();
			colors[i * 3 + 2] = dataReader.ReadByte();
		}

		const chunkSize = width * height;
		const data = new Uint8Array(chunkSize * 4);

		for (let i = 0; i < chunkSize; ++i) {
			const index = dataReader.ReadByte();

			data[i * 4 + 0] = colors[index * 3 + 0];
			data[i * 4 + 1] = colors[index * 3 + 1];
			data[i * 4 + 2] = colors[index * 3 + 2];
			data[i * 4 + 3] = 0xff;
		}

		const graphic = new Graphic();
		graphic.Width = width;
		graphic.Height = height;
		graphic.Data = data;
		graphic.IndexedGraphic = false;
		return graphic;
	}

	static GetGraphic(index) {
		switch (index) {
			case 0: return LoadingBarGraphicProvider.LoadImage(Resources.LoadingBarLeft);
			case 1: return LoadingBarGraphicProvider.LoadImage(Resources.LoadingBarRight);
			case 2: return LoadingBarGraphicProvider.LoadImage(Resources.LoadingBarMid);
			default: return LoadingBarGraphicProvider.LoadImage(Resources.LoadingBarGreen);
		}
	}
}
