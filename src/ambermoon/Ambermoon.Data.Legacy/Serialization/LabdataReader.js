// Port of Ambermoon.Data.Legacy/Serialization/LabdataReader.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { Labdata } from '../../Ambermoon.Data.Common/Labdata.js';
import { Tileset } from '../../Ambermoon.Data.Common/Tileset.js';
import { Graphic, GraphicInfo, GraphicFormat } from '../../Ambermoon.Data.Common/Graphic.js';
import { GraphicReader } from './GraphicReader.js';
import { getValue, toShort } from '../../../runtime.js';

/** Object initializer: construct, then assign the properties in order. */
function init(obj, props) {
	for (const key of Object.keys(props))
		obj[key] = props[key];
	return obj;
}

export class LabdataReader {
	ReadLabdataWithoutGraphics(labdata, dataReader) {
		labdata.WallHeight = dataReader.ReadWord();
		labdata.Flags = dataReader.ReadWord();
		labdata.CombatBackground = labdata.Flags & 0x0f;
		labdata.CeilingColorIndex = dataReader.ReadByte();
		labdata.FloorColorIndex = dataReader.ReadByte();
		// Note: The ceiling texture index can be 0 in which case a sky is used.
		//       The sky is composed of a color gradient and a lab background
		//       which is given inside the map data.
		// To be more precisely if the texture index (ceiling and also floor) is
		// 0, the color index is used to draw instead. For example the town of
		// S'Angrila doesn't use a floor texture but only a color.
		labdata.CeilingTextureIndex = dataReader.ReadByte();
		labdata.FloorTextureIndex = dataReader.ReadByte();

		labdata.Objects.length = 0;
		const numObjects = dataReader.ReadWord();
		const objects = [];

		for (let i = 0; i < numObjects; ++i) {
			const obj = { Item1: dataReader.ReadWord(), Item2: [] };

			for (let n = 0; n < 8; ++n) { // 8 sub entries (a map object can consist of up to 8 sub objects)
				const item1 = toShort(dataReader.ReadWord());
				const item2 = toShort(dataReader.ReadWord());
				const item3 = toShort(dataReader.ReadWord());
				const item4 = dataReader.ReadWord();
				obj.Item2.push({ Item1: item1, Item2: item2, Item3: item3, Item4: item4 });
			}

			objects.push(obj);
		}

		labdata.ObjectInfos.length = 0;
		const numObjectInfos = dataReader.ReadWord();

		for (let i = 0; i < numObjectInfos; ++i) {
			const objectInfo = new Labdata.ObjectInfo();
			objectInfo.Flags = dataReader.ReadDword();
			objectInfo.TextureIndex = dataReader.ReadWord();
			objectInfo.NumAnimationFrames = dataReader.ReadByte();
			objectInfo.ColorIndex = dataReader.ReadByte();
			objectInfo.TextureWidth = dataReader.ReadByte();
			objectInfo.TextureHeight = dataReader.ReadByte();
			objectInfo.MappedTextureWidth = dataReader.ReadWord();
			objectInfo.MappedTextureHeight = dataReader.ReadWord();

			labdata.ObjectInfos.push(objectInfo);
		}

		for (const obj of objects) {
			const subObjects = [];

			for (const pos of obj.Item2) {
				if (pos.Item4 !== 0) {
					subObjects.push(init(new Labdata.ObjectPosition(), {
						X: pos.Item1,
						Y: pos.Item2,
						Z: pos.Item3,
						Object: labdata.ObjectInfos[pos.Item4 - 1]
					}));
				}
			}

			labdata.Objects.push(init(new Labdata.Object(), {
				AutomapType: obj.Item1,
				SubObjects: subObjects
			}));
		}

		labdata.Walls.length = 0;
		const numWalls = dataReader.ReadWord();

		for (let i = 0; i < numWalls; ++i) {
			const wallData = new Labdata.WallData();
			wallData.Flags = dataReader.ReadDword();
			wallData.TextureIndex = dataReader.ReadByte();
			wallData.AutomapType = dataReader.ReadByte();
			wallData.ColorIndex = dataReader.ReadByte();
			const numOverlays = dataReader.ReadByte();
			if (numOverlays !== 0) {
				wallData.Overlays = new Array(numOverlays).fill(null);

				for (let o = 0; o < numOverlays; ++o) {
					const overlay = new Labdata.OverlayData();
					overlay.Blend = dataReader.ReadByte() !== 0;
					overlay.TextureIndex = dataReader.ReadByte();
					overlay.PositionX = dataReader.ReadByte();
					overlay.PositionY = dataReader.ReadByte();
					overlay.TextureWidth = dataReader.ReadByte();
					overlay.TextureHeight = dataReader.ReadByte();
					wallData.Overlays[o] = overlay;
				}
			}
			labdata.Walls.push(wallData);
		}
	}

	/** gameData must be an ILegacyGameData (has Files: Map<string, IFileContainer>) */
	ReadLabdata(labdata, dataReader, gameData) {
		this.ReadLabdataWithoutGraphics(labdata, dataReader);

		// Load labyrinth graphics
		const legacyGameData = gameData;
		const graphicReader = new GraphicReader();
		if (labdata.FloorTextureIndex !== 0)
			labdata.FloorGraphic = LabdataReader.ReadGraphic(graphicReader, getValue(getValue(legacyGameData.Files, 'Floors.amb').Files, labdata.FloorTextureIndex), 64, 64, false, false, true);
		if (labdata.CeilingTextureIndex !== 0)
			labdata.CeilingGraphic = LabdataReader.ReadGraphic(graphicReader, getValue(getValue(legacyGameData.Files, 'Floors.amb').Files, labdata.CeilingTextureIndex), 64, 64, false, false, true);
		const objectTextureFiles = getValue(legacyGameData.Files, '2Object3D.amb').Files;
		[...getValue(legacyGameData.Files, '3Object3D.amb').Files].forEach(([key, value]) => {
			if (!objectTextureFiles.has(key) || objectTextureFiles.get(key).Size === 0)
				objectTextureFiles.set(key, value);
		});
		labdata.ObjectGraphics.length = 0;
		for (const objectInfo of labdata.ObjectInfos) {
			if (objectInfo.NumAnimationFrames === 1) {
				labdata.ObjectGraphics.push(LabdataReader.ReadGraphic(graphicReader, getValue(objectTextureFiles, objectInfo.TextureIndex),
					objectInfo.TextureWidth, objectInfo.TextureHeight, true, true, true));
			} else {
				const compoundGraphic = new Graphic(objectInfo.NumAnimationFrames * objectInfo.TextureWidth,
					objectInfo.TextureHeight, 0);

				for (let i = 0; i < objectInfo.NumAnimationFrames; ++i) {
					const partialGraphic = LabdataReader.ReadGraphic(graphicReader, getValue(objectTextureFiles, objectInfo.TextureIndex),
						objectInfo.TextureWidth, objectInfo.TextureHeight, true, true, i === 0);

					compoundGraphic.AddOverlay(i * objectInfo.TextureWidth, 0, partialGraphic, false);
				}

				labdata.ObjectGraphics.push(compoundGraphic);
			}
		}
		const wallTextureFiles = getValue(legacyGameData.Files, '2Wall3D.amb').Files;
		const overlayTextureFiles = getValue(legacyGameData.Files, '2Overlay3D.amb').Files;
		[...getValue(legacyGameData.Files, '3Wall3D.amb').Files].forEach(([key, value]) => {
			if (!wallTextureFiles.has(key) || wallTextureFiles.get(key).Size === 0)
				wallTextureFiles.set(key, value);
		});
		[...getValue(legacyGameData.Files, '3Overlay3D.amb').Files].forEach(([key, value]) => {
			if (!overlayTextureFiles.has(key) || overlayTextureFiles.get(key).Size === 0)
				overlayTextureFiles.set(key, value);
		});
		labdata.WallGraphics.length = 0;
		let wallIndex = 0;
		for (const wall of labdata.Walls) {
			const transparency = Tileset.TileFlags.Transparency;
			const wallGraphic = LabdataReader.ReadGraphic(graphicReader, getValue(wallTextureFiles, wall.TextureIndex),
				128, 80, (wall.Flags & transparency) === transparency, true, true);

			labdata.WallGraphics.push(wallGraphic);

			if (wall.Overlays != null && wall.Overlays.length !== 0) {
				for (const overlay of wall.Overlays) {
					wallGraphic.AddOverlay(overlay.PositionX, overlay.PositionY, LabdataReader.ReadGraphic(graphicReader,
						getValue(overlayTextureFiles, overlay.TextureIndex), overlay.TextureWidth, overlay.TextureHeight, true, true, true),
						overlay.Blend);
				}
			}

			++wallIndex;
		}
	}

	static ReadGraphic(graphicReader, file, width, height,
		alpha, texture, reset) {
		const graphic = new Graphic();
		graphic.Width = width;
		graphic.Height = height;
		graphic.IndexedGraphic = true;

		if (reset)
			file.Position = 0;

		const graphicInfo = new GraphicInfo();
		graphicInfo.Width = width;
		graphicInfo.Height = height;
		graphicInfo.GraphicFormat = texture ? GraphicFormat.Texture4Bit : GraphicFormat.Palette4Bit;
		graphicInfo.PaletteOffset = 0;
		graphicInfo.Alpha = alpha;

		graphicReader.ReadGraphic(graphic, file, graphicInfo);

		return graphic;
	}
}
