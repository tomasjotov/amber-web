// Port of Ambermoon.Data.Legacy/Serialization/FileReader.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { DataReader } from './DataReader.js';
import { FileType } from './FileType.js';
import { JH } from '../Compression/JH.js';
import { LobCompression } from '../Compression/LobCompression.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { ArgumentException } from '../../../runtime.js';

class FileContainer {
	constructor() {
		this.Name = null;
		this.FileType = FileType.None;
		/** Map<int, IDataReader> */
		this.Files = new Map();
	}

	get Header() {
		return this.FileType >>> 0;
	}
}

function addFile(files, key, value) {
	if (files.has(key))
		throw new ArgumentException('An item with the same key has already been added.');
	files.set(key, value);
}

export class FileReader {
	/** @param files Map<int, IDataReader> */
	static Create(name, fileType, files) {
		const container = new FileContainer();
		container.Name = name;
		container.FileType = fileType;
		container.Files = files;
		return container;
	}

	static CreateRawFile(name, fileData) {
		const container = new FileContainer();
		container.Name = name;
		container.FileType = FileType.None;
		container.Files = new Map([[1, DataReader.FromData(fileData)]]);
		return container;
	}

	/** @param fileData Map<int, Uint8Array> */
	static CreateRawContainer(name, fileData) {
		const container = new FileContainer();
		container.Name = name;
		container.FileType = FileType.AMBR;
		container.Files = new Map();
		for (const [key, value] of fileData)
			container.Files.set(key, DataReader.FromData(value));
		return container;
	}

	/**
	 * Overloads: (name, stream) / (name, rawData: Uint8Array).
	 * A "stream" is any reader object with ReadToEnd() (reads from its current position).
	 */
	ReadRawFile(name, rawData) {
		if (!(rawData instanceof Uint8Array) && !Array.isArray(rawData))
			rawData = rawData.ReadToEnd();

		return this.ReadFile(name, DataReader.FromData(rawData));
	}

	ReadFile(name, reader) {
		if (reader.Size === 0) {
			const container = new FileContainer();
			container.Name = name;
			container.Files = new Map();
			container.FileType = FileType.None;
			return container;
		}

		const header = reader.ReadDword();
		const fileType = (((header & 0xffff0000) >>> 0) === FileType.JH) ? FileType.JH : header;
		const fileInfo = { FileType: fileType, NumFiles: 0, SingleFile: false };

		switch (fileType) {
			case FileType.JH:
			case FileType.LOB:
			case FileType.VOL1:
				fileInfo.SingleFile = true;
				fileInfo.NumFiles = 1;
				break;
			case FileType.AMNC:
			case FileType.AMNP:
			case FileType.AMBR:
			case FileType.AMPC:
			case FileType.AMTX:
				fileInfo.SingleFile = false;
				fileInfo.NumFiles = reader.ReadWord() & 0x3ff;
				break;
			default: { // raw format
				const fileContainer = new FileContainer();
				fileContainer.Name = name;
				addFile(fileContainer.Files, 1, DataReader.FromData(reader.ToArray()));
				return fileContainer;
			}
		}

		reader.Position = 0;

		return this.ProcessFileInfo(name, fileInfo, reader);
	}

	ProcessFileInfo(name, fileInfo, reader) {
		const fileContainer = new FileContainer();
		fileContainer.Name = name;
		fileContainer.FileType = fileInfo.FileType;

		if (fileInfo.SingleFile) {
			addFile(fileContainer.Files, 1, this.DecodeFile(reader, fileInfo.FileType, 1));

			const file1 = fileContainer.Files.get(1);

			// There is a special case where AMBR can be inside JH.
			if (fileInfo.FileType === FileType.JH && file1.PeekDword() === FileType.AMBR) {
				file1.Position += 4;
				return this.ProcessFileInfo(name, {
					FileType: FileType.JHPlusAMBR,
					NumFiles: file1.ReadWord() & 0x3ff,
					SingleFile: false
				}, file1 instanceof DataReader ? file1 : null);
			}

			// There is a special case where LOB can be inside JH.
			if (fileInfo.FileType === FileType.JH && file1.PeekDword() === FileType.LOB) {
				fileContainer.FileType = FileType.JHPlusLOB;
			}
		} else {
			reader.Position = 4; // skip header
			let fileCount = reader.ReadWord();
			const type = fileCount >> 14;
			fileCount &= 0x3ff;

			if (type === 0 || type === 2) {
				const entrySize = type === 2 ? 2 : 4;
				let offset = 6 + fileCount * entrySize;
				const fileSizeProvider = type === 2 ? () => reader.ReadWord() : () => reader.ReadDword() | 0;

				for (let i = 1; i <= fileCount; ++i) {
					const fileSize = fileSizeProvider();
					addFile(fileContainer.Files, i, fileSize === 0 ? DataReader.FromData(new Uint8Array(0)) : this.DecodeFile(new DataReader(reader, offset, fileSize), fileInfo.FileType, i));
					offset += fileSize;
				}

				reader.Position = offset;
			} else { // sections
				const fileEntries = new Map();
				const fileSizeProvider = type === 3 ? () => reader.ReadWord() : () => reader.ReadDword() | 0;
				const sectionCount = reader.ReadWord();

				if (sectionCount === 0)
					throw new AmbermoonException(ExceptionScope.Data, 'Invalid container section count.');

				let offset = 0; // relative offset for now

				for (let i = 0; i < sectionCount; ++i) {
					let index = reader.ReadWord();
					const sectionSize = reader.ReadWord();

					for (let j = 0; j < sectionSize; ++j) {
						const fileSize = fileSizeProvider();
						addFile(fileEntries, index++, { Key: offset, Value: fileSize });
						offset += fileSize;
					}
				}

				offset = reader.Position;

				for (let i = 1; i <= fileCount; ++i) {
					const entry = fileEntries.get(i);

					if (entry !== undefined && entry.Value > 0)
						addFile(fileContainer.Files, i, this.DecodeFile(new DataReader(reader, offset + entry.Key, entry.Value), fileInfo.FileType, i));
					else
						addFile(fileContainer.Files, i, DataReader.FromData(new Uint8Array(0)));
				}
			}
		}

		return fileContainer;
	}

	DecodeFile(reader, containerType, fileNumber) {
		let header = reader.Size < 4 ? 0 : reader.PeekDword();
		let fileType = (((header & 0xffff0000) >>> 0) === FileType.JH) ? FileType.JH : header;

		if (fileType === FileType.JH) {
			reader.Position += 4; // skip header
			reader = DataReader.FromData(JH.Crypt(reader, ((header >>> 16) ^ (header & 0x0000ffff)) & 0xffff));
		} else if (containerType === FileType.AMNC) { // AMNC archives are always encoded
			reader = DataReader.FromData(JH.Crypt(reader, fileNumber & 0xffff));
		}

		header = reader.Size < 4 ? 0 : reader.PeekDword(); // Note: The header might have changed above.
		fileType = header; // Note: No need to check for JH here as this can not happen.

		// See if it is a LOB file
		if (fileType === FileType.LOB || fileType === FileType.VOL1) {
			reader.Position += 4; // skip header
			const lobHeader = reader.PeekDword();
			const decodedSize = lobHeader & 0x00ffffff;
			const lobType = lobHeader >>> 24;

			// AMNP archives are always encoded
			if (containerType === FileType.AMNP) {
				reader.Position += 4; // skip decoded size
				reader = DataReader.FromData(JH.Crypt(reader, fileNumber & 0xffff));
				reader.Position += 4; // skip encoded size
			} else {
				reader.Position += 8; // skip decoded and encoded size
			}

			return LobCompression.Decompress(reader, decodedSize, lobType);
		} else {
			// AMNP archives are always encoded
			if (containerType === FileType.AMNP) {
				// ensure and skip the header (should be FileType.None here)
				if (reader.ReadDword() !== FileType.None)
					throw new AmbermoonException(ExceptionScope.Data, 'Invalid AMNP file data.');

				reader = DataReader.FromData(JH.Crypt(reader, fileNumber & 0xffff));
			}

			return reader;
		}
	}
}
