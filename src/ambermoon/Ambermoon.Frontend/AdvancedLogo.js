// Port of Ambermoon.Frontend/AdvancedLogo.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
import { toByte, Queue } from '../../runtime.js';
import { Graphic } from '../Ambermoon.Data.Common/Graphic.js';
import { DataReader } from '../Ambermoon.Data.Legacy/Serialization/DataReader.js';
import { Rect } from '../Ambermoon.Common/Rect.js';
import { Size } from '../Ambermoon.Common/Size.js';
import { Util } from '../Ambermoon.Common/Util.js';
import { Layer } from '../Ambermoon.Core/Render/Layer.js';

// ---- Raw DEFLATE (RFC 1951) decompression, replaces System.IO.Compression.DeflateStream ----

const LengthBase = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LengthExtra = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DistBase = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073,
	4097, 6145, 8193, 12289, 16385, 24577];
const DistExtra = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CodeLengthOrder = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

function buildHuffman(lengths, offset, n) {
	const count = new Uint16Array(16);
	for (let i = 0; i < n; i++)
		count[lengths[offset + i]]++;
	count[0] = 0;
	const offs = new Uint16Array(16);
	for (let i = 1; i < 16; i++)
		offs[i] = offs[i - 1] + count[i - 1];
	const symbol = new Uint16Array(n);
	for (let i = 0; i < n; i++) {
		if (lengths[offset + i] !== 0)
			symbol[offs[lengths[offset + i]]++] = i;
	}
	return { count, symbol };
}

function inflateRaw(data) {
	let pos = 0;
	let bitBuf = 0;
	let bitCnt = 0;
	let output = new Uint8Array(Math.max(1024, data.length * 4));
	let outLen = 0;

	const ensure = n => {
		if (outLen + n > output.length) {
			const buffer = new Uint8Array(Math.max(output.length * 2, outLen + n));
			buffer.set(output.subarray(0, outLen));
			output = buffer;
		}
	};

	const bits = n => {
		while (bitCnt < n) {
			if (pos >= data.length)
				throw new Error('Unexpected end of deflate data');
			bitBuf |= data[pos++] << bitCnt;
			bitCnt += 8;
		}
		const value = bitBuf & ((1 << n) - 1);
		bitBuf >>>= n;
		bitCnt -= n;
		return value;
	};

	const decode = huffman => {
		let code = 0;
		let firstCode = 0;
		let index = 0;
		for (let len = 1; len < 16; len++) {
			code |= bits(1);
			const count = huffman.count[len];
			if (code - count < firstCode)
				return huffman.symbol[index + (code - firstCode)];
			index += count;
			firstCode += count;
			firstCode <<= 1;
			code <<= 1;
		}
		throw new Error('Invalid deflate data');
	};

	const inflateCodes = (lengthCodes, distCodes) => {
		while (true) {
			let symbol = decode(lengthCodes);
			if (symbol < 256) {
				ensure(1);
				output[outLen++] = symbol;
			} else if (symbol === 256) {
				return;
			} else {
				symbol -= 257;
				if (symbol >= 29)
					throw new Error('Invalid deflate data');
				const length = LengthBase[symbol] + bits(LengthExtra[symbol]);
				const distSymbol = decode(distCodes);
				if (distSymbol >= 30)
					throw new Error('Invalid deflate data');
				const distance = DistBase[distSymbol] + bits(DistExtra[distSymbol]);
				if (distance > outLen)
					throw new Error('Invalid deflate data');
				ensure(length);
				for (let i = 0; i < length; i++, outLen++)
					output[outLen] = output[outLen - distance];
			}
		}
	};

	let fixedLengthCodes = null;
	let fixedDistCodes = null;
	let last;

	do {
		last = bits(1);
		const type = bits(2);

		if (type === 0) {
			// stored block
			bitBuf = 0;
			bitCnt = 0;
			if (pos + 4 > data.length)
				throw new Error('Unexpected end of deflate data');
			const len = data[pos] | (data[pos + 1] << 8);
			pos += 4; // len and nlen
			if (pos + len > data.length)
				throw new Error('Unexpected end of deflate data');
			ensure(len);
			output.set(data.subarray(pos, pos + len), outLen);
			outLen += len;
			pos += len;
		} else if (type === 1) {
			if (fixedLengthCodes == null) {
				const lengths = new Uint8Array(288 + 30);
				let i = 0;
				for (; i < 144; i++) lengths[i] = 8;
				for (; i < 256; i++) lengths[i] = 9;
				for (; i < 280; i++) lengths[i] = 7;
				for (; i < 288; i++) lengths[i] = 8;
				for (; i < 288 + 30; i++) lengths[i] = 5;
				fixedLengthCodes = buildHuffman(lengths, 0, 288);
				fixedDistCodes = buildHuffman(lengths, 288, 30);
			}
			inflateCodes(fixedLengthCodes, fixedDistCodes);
		} else if (type === 2) {
			const nlen = bits(5) + 257;
			const ndist = bits(5) + 1;
			const ncode = bits(4) + 4;
			const lengths = new Uint8Array(320);
			for (let i = 0; i < ncode; i++)
				lengths[CodeLengthOrder[i]] = bits(3);
			const codeLengthCodes = buildHuffman(lengths, 0, 19);
			lengths.fill(0);
			let index = 0;
			while (index < nlen + ndist) {
				const symbol = decode(codeLengthCodes);
				if (symbol < 16) {
					lengths[index++] = symbol;
				} else {
					let len = 0;
					let repeat;
					if (symbol === 16) {
						if (index === 0)
							throw new Error('Invalid deflate data');
						len = lengths[index - 1];
						repeat = 3 + bits(2);
					} else if (symbol === 17) {
						repeat = 3 + bits(3);
					} else {
						repeat = 11 + bits(7);
					}
					if (index + repeat > nlen + ndist)
						throw new Error('Invalid deflate data');
					while (repeat--)
						lengths[index++] = len;
				}
			}
			const lengthCodes = buildHuffman(lengths, 0, nlen);
			const distCodes = buildHuffman(lengths, nlen, ndist);
			inflateCodes(lengthCodes, distCodes);
		} else {
			throw new Error('Invalid deflate block type');
		}
	} while (!last);

	return output.slice(0, outLen);
}

const CommandType = Object.freeze({
	Wait: 0,
	FadeInAdvancedImage: 1,
	FadeOutAdvancedImage: 2
});

/** struct Command */
class Command {
	constructor() {
		this.Type = CommandType.Wait;
		this.Time = 0;
	}
}

const DateTimeMaxValue = Number.MAX_SAFE_INTEGER;

export class AdvancedLogo {
	static CommandType = CommandType;
	static Command = Command;
	static logoWidth = 0;
	static logoHeight = 0;
	static textureAtlasManager = null;

	constructor() {
		this.currentCommand = null;
		this.currentCommandStartTime = DateTimeMaxValue;
		this.sprite = null;

		this.commands = new Queue();

		const addCommand = (type, time) => {
			const command = new Command();
			command.Type = type;
			command.Time = time;
			this.commands.Enqueue(command);
		};

		addCommand(CommandType.FadeInAdvancedImage, 2000);
		addCommand(CommandType.Wait, 3000);
		addCommand(CommandType.FadeOutAdvancedImage, 2000);
	}

	static LoadImage(dataReader) {
		const width = dataReader.ReadWord();
		const height = dataReader.ReadWord();
		const chunkSize = width * height;
		const data = new Uint8Array(chunkSize * 4);

		for (let i = 0; i < chunkSize; ++i) {
			data[i * 4] = dataReader.ReadByte(); // R
			data[i * 4 + 3] = 0xff; // A, full opaque
		}

		for (let i = 0; i < chunkSize; ++i) {
			data[i * 4 + 1] = dataReader.ReadByte(); // G
		}

		for (let i = 0; i < chunkSize; ++i) {
			data[i * 4 + 2] = dataReader.ReadByte(); // B
		}

		const graphic = new Graphic();
		graphic.Width = width;
		graphic.Height = height;
		graphic.Data = data;
		graphic.IndexedGraphic = false;
		return graphic;
	}

	/** @param {() => Uint8Array} logoDataProvider */
	static Initialize(textureAtlasManager, logoDataProvider) {
		if (AdvancedLogo.textureAtlasManager !== textureAtlasManager) {
			AdvancedLogo.textureAtlasManager = textureAtlasManager;

			const decompressed = inflateRaw(logoDataProvider());
			const logoData = DataReader.FromData(decompressed);
			const logoAdvancedGraphic = AdvancedLogo.LoadImage(logoData);

			if (!textureAtlasManager.HasLayer(Layer.Images)) {
				textureAtlasManager.AddFromGraphics(Layer.Images, new Map([
					[0, logoAdvancedGraphic]
				]));
			}

			AdvancedLogo.logoWidth = logoAdvancedGraphic.Width;
			AdvancedLogo.logoHeight = logoAdvancedGraphic.Height;
		}
	}

	Cleanup() {
		this.sprite?.Delete();
	}

	Update(renderView, finished) {
		if (renderView == null)
			return;

		let commandActivated = false;

		if (this.currentCommand == null) {
			if (this.commands.Count === 0) {
				this.Cleanup();
				finished?.();
				return;
			}

			this.currentCommand = this.commands.Dequeue();
			this.currentCommandStartTime = Date.now();
			commandActivated = true;
		}

		this.ProcessCurrentCommand(renderView, commandActivated);
	}

	ProcessCurrentCommand(renderView, commandActivated) {
		const command = this.currentCommand;

		switch (command?.Type) {
			case CommandType.Wait:
				if ((Date.now() - this.currentCommandStartTime) >= command.Time)
					this.currentCommand = null;
				break;
			case CommandType.FadeInAdvancedImage:
				if (commandActivated) {
					const area = renderView.RenderScreenArea;
					const textureAtlas = AdvancedLogo.textureAtlasManager.GetOrCreate(Layer.Images);
					const ratio = AdvancedLogo.logoWidth / AdvancedLogo.logoHeight;
					const height = area.Height;
					const width = Util.Round(ratio * height);
					this.sprite = renderView.SpriteFactory.CreateWithAlpha(width, height);
					this.sprite.Layer = renderView.GetLayer(Layer.Images);
					// Important for visibility check, otherwise the virtual screen is used!
					this.sprite.ClipArea = new Rect(area);
					this.sprite.X = Math.trunc((area.Width - width) / 2);
					this.sprite.Y = Math.trunc((area.Height - height) / 2);
					this.sprite.TextureAtlasOffset = textureAtlas.GetOffset(0);
					this.sprite.TextureSize = new Size(AdvancedLogo.logoWidth, AdvancedLogo.logoHeight);
					this.sprite.Alpha = 0;
					this.sprite.Visible = true;
				} else {
					const elapsed = command.Time === 0 ? 1.0 : Math.min(1.0, (Date.now() - this.currentCommandStartTime) / command.Time);
					this.sprite.Alpha = toByte(Util.Round(elapsed * 0xff));

					if (elapsed >= 1)
						this.currentCommand = null;
				}
				break;
			case CommandType.FadeOutAdvancedImage:
				if (commandActivated) {
					this.sprite.Visible = true;
				} else {
					const elapsed = command.Time === 0 ? 1.0 : Math.min(1.0, (Date.now() - this.currentCommandStartTime) / command.Time);
					this.sprite.Alpha = toByte(Util.Round(0xff - elapsed * 0xff));

					if (elapsed >= 1)
						this.currentCommand = null;
				}
				break;
		}
	}
}

