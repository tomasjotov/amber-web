// Port of Ambermoon.Data.Common/Labdata.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { enumName, formatNumber } from '../../runtime.js';
import { AutomapType } from './Enumerations/AutomapType.js';
import { Tileset } from './Tileset.js';

class ObjectInfo {
	constructor() {
		this.Flags = 0;
		this.TextureIndex = 0;
		this.NumAnimationFrames = 0;
		this.ColorIndex = 0; // not 100% sure
		this.TextureWidth = 0;
		this.TextureHeight = 0;
		this.MappedTextureWidth = 0;
		this.MappedTextureHeight = 0;
	}

	clone() {
		return Object.assign(new ObjectInfo(), this);
	}
}

class ObjectPosition {
	constructor() {
		this.X = 0;
		this.Y = 0;
		this.Z = 0;
		this.Object = new ObjectInfo();
	}

	clone() {
		const copy = Object.assign(new ObjectPosition(), this);
		copy.Object = this.Object?.clone() ?? null;
		return copy;
	}
}

// C# name: Labdata.Object (named LabdataObject here to not shadow the global Object)
class LabdataObject {
	constructor() {
		this.AutomapType = 0;
		/** List<ObjectPosition> */
		this.SubObjects = null;
	}

	clone() {
		return Object.assign(new LabdataObject(), this);
	}
}

class OverlayData {
	constructor() {
		this.Blend = false;
		this.TextureIndex = 0;
		this.PositionX = 0;
		this.PositionY = 0;
		this.TextureWidth = 0;
		this.TextureHeight = 0;
	}

	clone() {
		return Object.assign(new OverlayData(), this);
	}
}

class WallData {
	constructor() {
		this.Flags = 0;
		this.TextureIndex = 0;
		this.AutomapType = 0;
		this.ColorIndex = 0;
		/** OverlayData[] */
		this.Overlays = null;
	}

	clone() {
		return Object.assign(new WallData(), this);
	}

	toString() {
		let content = `Flags: ${enumName(Tileset.TileFlags, this.Flags).replaceAll(', ', '|')}(0x${formatNumber(this.Flags >>> 0, 'x8')}), Texture: ${this.TextureIndex}, AutomapType: ${enumName(AutomapType, this.AutomapType)}, Overlays: ${(this.Overlays == null ? 0 : this.Overlays.length)}, ColorIndex ${this.ColorIndex}`;

		if (this.Overlays != null && this.Overlays.length !== 0) {
			for (let o = 0; o < this.Overlays.length; ++o) {
				const overlay = this.Overlays[o];
				content += `\n\t\tOverlay${o + 1} -> Texture: ${overlay.TextureIndex} (${overlay.TextureWidth}x${overlay.TextureHeight}), Position: ${overlay.PositionX}:${overlay.PositionY}, Blend ${overlay.Blend ? 'True' : 'False'}`;
			}
		}

		return content;
	}

	ToString() {
		return this.toString();
	}
}

export class Labdata {
	static ObjectPosition = ObjectPosition;
	static ObjectInfo = ObjectInfo;
	static Object = LabdataObject;
	static OverlayData = OverlayData;
	static WallData = WallData;

	constructor() {
		/// <summary>
		/// The floor dimension (tile width/height) is 512.
		/// So if this value is 512 as well, the wall's height is exactly a tile
		/// width and therefore each map block is a cube. If the value would be
		/// 256, a wall would be twice as width as its height, etc.
		/// The reference wall height is 341 (which is 2/3 of 512).
		/// </summary>
		this.WallHeight = 0;
		/// <summary>
		/// There are 16 combat background sets.
		/// See <see cref="CombatBackgrounds"/>.
		/// </summary>
		this.CombatBackground = 0;
		this.Flags = 0;
		this.CeilingColorIndex = 0;
		this.FloorColorIndex = 0;
		this.CeilingTextureIndex = 0;
		this.FloorTextureIndex = 0;
		this.Objects = [];
		this.ObjectInfos = [];
		this.Walls = [];

		this.ObjectGraphics = [];
		/// <summary>
		/// They include optional overlays.
		/// </summary>
		this.WallGraphics = [];
		this.FloorGraphic = null;
		this.CeilingGraphic = null;
	}

	static Load(labdataReader, dataReader, gameData) {
		const labdata = new Labdata();

		labdataReader.ReadLabdata(labdata, dataReader, gameData);

		return labdata;
	}
}

export {
	ObjectPosition as Labdata_ObjectPosition,
	ObjectInfo as Labdata_ObjectInfo,
	LabdataObject as Labdata_Object,
	OverlayData as Labdata_OverlayData,
	WallData as Labdata_WallData
};
