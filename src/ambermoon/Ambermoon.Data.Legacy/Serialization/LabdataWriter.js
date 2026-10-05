// Port of Ambermoon.Data.Legacy/Serialization/LabdataWriter.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

export class LabdataWriter {
	static WriteLabdata(labdata, dataWriter) {
		dataWriter.WriteWord(labdata.WallHeight);
		dataWriter.WriteWord(labdata.Flags);
		dataWriter.WriteByte(labdata.CeilingColorIndex);
		dataWriter.WriteByte(labdata.FloorColorIndex);
		dataWriter.WriteByte(labdata.CeilingTextureIndex);
		dataWriter.WriteByte(labdata.FloorTextureIndex);

		// Objects
		dataWriter.WriteWord(labdata.Objects.length);

		for (const obj of labdata.Objects) {
			dataWriter.WriteWord(obj.AutomapType);

			for (let i = 0; i < 8; ++i) {
				if (obj.SubObjects == null || i >= obj.SubObjects.length) {
					dataWriter.WriteDword(0);
					dataWriter.WriteDword(0);
				} else {
					const subObject = obj.SubObjects[i];
					dataWriter.WriteWord(subObject.X & 0xffff);
					dataWriter.WriteWord(subObject.Y & 0xffff);
					dataWriter.WriteWord(subObject.Z & 0xffff);
					dataWriter.WriteWord((1 + labdata.ObjectInfos.indexOf(subObject.Object)) & 0xffff);
				}
			}
		}

		// Object infos
		dataWriter.WriteWord(labdata.ObjectInfos.length);

		for (const objectInfo of labdata.ObjectInfos) {
			dataWriter.WriteDword(objectInfo.Flags);
			dataWriter.WriteWord(objectInfo.TextureIndex);
			dataWriter.WriteByte(objectInfo.NumAnimationFrames);
			dataWriter.WriteByte(objectInfo.ColorIndex);
			dataWriter.WriteByte(objectInfo.TextureWidth);
			dataWriter.WriteByte(objectInfo.TextureHeight);
			dataWriter.WriteWord(objectInfo.MappedTextureWidth);
			dataWriter.WriteWord(objectInfo.MappedTextureHeight);
		}

		// Walls
		dataWriter.WriteWord(labdata.Walls.length);

		for (const wall of labdata.Walls) {
			dataWriter.WriteDword(wall.Flags);
			dataWriter.WriteByte(wall.TextureIndex);
			dataWriter.WriteByte(wall.AutomapType);
			dataWriter.WriteByte(wall.ColorIndex);

			const overlays = wall.Overlays ?? [];
			dataWriter.WriteByte(overlays.length);

			for (const overlay of overlays) {
				dataWriter.WriteByte(overlay.Blend ? 1 : 0);
				dataWriter.WriteByte(overlay.TextureIndex);
				dataWriter.WriteByte(overlay.PositionX);
				dataWriter.WriteByte(overlay.PositionY);
				dataWriter.WriteByte(overlay.TextureWidth);
				dataWriter.WriteByte(overlay.TextureHeight);
			}
		}
	}
}
