// Port of Ambermoon.Data.Legacy/Serialization/FileWriter.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { DataWriter } from './DataWriter.js';
import { FileType, FileTypeExtensions } from './FileType.js';
import { FileDictionaryCompression } from './FileDictionaryCompression.js';
import { LobCompression } from '../Compression/LobCompression.js';
import { JH } from '../Compression/JH.js';
import { AmbermoonException, ExceptionScope } from '../../Ambermoon.Common/Exception.js';
import { enumName } from '../../../runtime.js';

const LobType = LobCompression.LobType;

function AlignData(data) {
	if (data.length % 2 === 0)
		return data;

	const buffer = new Uint8Array(data.length + 1);
	buffer.set(data, 0);
	return buffer;
}

function filesToByteMap(files) {
	const map = new Map();
	for (const [key, value] of files)
		map.set(key >>> 0, value.ToArray());
	return map;
}

export class FileWriter {
	static Write(writer, fileContainer, lobType = LobType.Ambermoon,
		fileDictionaryCompression = FileDictionaryCompression.None,
		compressionPrinter = null) {
		const fileType = FileTypeExtensions.AsFileType(fileContainer.Header);

		switch (fileType) {
			case FileType.JH:
				FileWriter.WriteJH(writer, AlignData(fileContainer.Files.get(1).ToArray()), fileContainer.Header & 0xffff, false);
				break;
			case FileType.LOB:
				FileWriter.WriteLob(writer, fileContainer.Files.get(1).ToArray(), lobType);
				break;
			case FileType.VOL1:
				FileWriter.WriteVol1(writer, fileContainer.Files.get(1).ToArray(), lobType);
				break;
			case FileType.AMBR:
			case FileType.AMNC:
			case FileType.AMNP:
			case FileType.AMPC:
				FileWriter.WriteContainer(writer, filesToByteMap(fileContainer.Files), fileType, null,
					lobType, fileDictionaryCompression, compressionPrinter);
				break;
			case FileType.JHPlusAMBR: {
				const ambrWriter = new DataWriter();
				FileWriter.WriteContainer(ambrWriter, filesToByteMap(fileContainer.Files), FileType.AMBR);
				FileWriter.WriteJH(writer, AlignData(ambrWriter.ToArray()), fileContainer.Header & 0xffff, false);
				break;
			}
			case FileType.JHPlusLOB:
				FileWriter.WriteJH(writer, fileContainer.Files.get(1).ToArray(), fileContainer.Header & 0xffff, true, false, lobType);
				break;
			default: // raw
				writer.Write(fileContainer.Files.get(1).ToArray());
				break;
		}
	}

	static WriteJH(writer, fileData, encryptKey, additionalLobCompression,
		noHeader = false, lobType = LobType.Ambermoon) {
		if (additionalLobCompression) {
			const lobWriter = new DataWriter();
			FileWriter.WriteLob(lobWriter, fileData, FileType.LOB, lobType);
			fileData = AlignData(lobWriter.ToArray());
		}

		const encryptedData = JH.Crypt(fileData, encryptKey);

		if (!noHeader) {
			const header = (FileType.JH | ((((FileType.JH >>> 16) & 0xffff) ^ encryptKey) & 0xffff)) >>> 0;
			writer.WriteDword(header);
		}

		writer.Write(encryptedData);
	}

	/**
	 * Overloads:
	 * - WriteLob(writer, fileData, lobType, compressionPrinter = null) (public)
	 * - WriteLob(writer, fileData, header: uint, lobType, compressionPrinter = null) (private in C#)
	 */
	static WriteLob(writer, fileData, headerOrLobType, lobTypeOrPrinter, compressionPrinter = null) {
		if (typeof lobTypeOrPrinter !== 'number') {
			// public overload
			FileWriter.WriteLobInternal(writer, AlignData(fileData), FileType.LOB, headerOrLobType, lobTypeOrPrinter ?? null);
			return;
		}

		FileWriter.WriteLobInternal(writer, fileData, headerOrLobType, lobTypeOrPrinter, compressionPrinter);
	}

	static WriteVol1(writer, fileData, lobType, compressionPrinter = null) {
		FileWriter.WriteLobInternal(writer, AlignData(fileData), FileType.VOL1, lobType, compressionPrinter);
	}

	/** C# private static void WriteLob(DataWriter writer, byte[] fileData, uint header, LobType lobType, Action<int, int, int?> compressionPrinter = null) */
	static WriteLobInternal(writer, fileData, header, lobType, compressionPrinter = null) {
		if (lobType === LobType.TakeBest) {
			const extendedLobWriter = new DataWriter();
			FileWriter.WriteLobInternal(extendedLobWriter, fileData, header, LobType.LZRS, compressionPrinter);
			const advancedLobWriter = new DataWriter();
			FileWriter.WriteLobInternal(advancedLobWriter, fileData, header, LobType.Extended, compressionPrinter);
			const originalLobWriter = new DataWriter();
			FileWriter.WriteLobInternal(originalLobWriter, fileData, header, LobType.Ambermoon, compressionPrinter);

			if (advancedLobWriter.Size < originalLobWriter.Size) {
				if (extendedLobWriter.Size <= advancedLobWriter.Size)
					writer.Write(extendedLobWriter.ToArray());
				else
					writer.Write(advancedLobWriter.ToArray());
			} else {
				if (extendedLobWriter.Size < originalLobWriter.Size)
					writer.Write(extendedLobWriter.ToArray());
				else
					writer.Write(originalLobWriter.ToArray());
			}

			return;
		} else if (lobType === LobType.TakeBestForText) {
			const textLobWriter = new DataWriter();
			FileWriter.WriteLobInternal(textLobWriter, fileData, header, LobType.Text, compressionPrinter);
			const originalLobWriter = new DataWriter();
			FileWriter.WriteLobInternal(originalLobWriter, fileData, header, LobType.Ambermoon, compressionPrinter);

			if (textLobWriter.Size < originalLobWriter.Size)
				writer.Write(textLobWriter.ToArray());
			else
				writer.Write(originalLobWriter.ToArray());

			return;
		}

		const compressedData = LobCompression.Compress(fileData, lobType);
		compressionPrinter?.(compressedData.length, fileData.length, null);

		if (fileData.length % 2 === 1 || compressedData.length % 2 === 1)
			throw new AmbermoonException(ExceptionScope.Application, 'Lob source or compressed data is not word-aligned.');

		writer.WriteDword(header);
		const lobTypeCode = (lobType << 24) >>> 0;
		writer.WriteDword((fileData.length | lobTypeCode) >>> 0);
		writer.WriteDword(compressedData.length);
		writer.Write(compressedData);
	}

	/**
	 * Overloads:
	 * - WriteContainer(writer, fileType, ...filesData: byte[][])
	 * - WriteContainer(writer, fileType, lobType, fileDictionaryCompression, compressionPrinter, ...filesData: byte[][])
	 * - WriteContainer(writer, filesData: Map<uint, byte[]>, fileType, minimumFileCount = null, lobType = Ambermoon,
	 *     fileDictionaryCompression = None, compressionPrinter = null)
	 */
	static WriteContainer(writer, filesDataOrFileType, ...args) {
		if (filesDataOrFileType instanceof Map) {
			FileWriter.WriteContainerFromMap(writer, filesDataOrFileType, ...args);
			return;
		}

		const fileType = filesDataOrFileType;

		if (args.length !== 0 && typeof args[0] === 'number') {
			const [lobType, fileDictionaryCompression, compressionPrinter, ...rest] = args;
			const filesData = (rest.length === 1 && rest[0] == null) ? null : rest;

			if (filesData == null)
				FileWriter.WriteContainerFromMap(writer, new Map(), fileType, null, lobType, fileDictionaryCompression, compressionPrinter);
			else
				FileWriter.WriteContainerFromMap(writer, new Map(filesData.map((f, i) => [1 + i, f])), fileType, null,
					lobType, fileDictionaryCompression, compressionPrinter);
		} else {
			const filesData = (args.length === 1 && args[0] == null) ? null : args;

			if (filesData == null)
				FileWriter.WriteContainerFromMap(writer, new Map(), fileType);
			else
				FileWriter.WriteContainerFromMap(writer, new Map(filesData.map((f, i) => [1 + i, f])), fileType);
		}
	}

	/** C# WriteContainer(DataWriter writer, Dictionary<uint, byte[]> filesData, FileType fileType, ...) */
	static WriteContainerFromMap(writer, filesData, fileType,
		minimumFileCount = null, lobType = LobType.Ambermoon,
		fileDictionaryCompression = FileDictionaryCompression.None,
		compressionPrinter = null) {
		switch (fileType) {
			case FileType.JHPlusAMBR:
				throw new AmbermoonException(ExceptionScope.Data, `File type '${enumName(FileType, fileType)}' is no valid container format. Use the Write method instead for this file type.`);
			case FileType.AMNC:
			case FileType.AMNP:
			case FileType.AMBR:
			case FileType.AMPC: {
				if (filesData.size >= 0xffff) // -1 cause JH uses the 1-based index as a word
					throw new AmbermoonException(ExceptionScope.Data, `In a container file there can only be ${0xffff - 1} files at max.`);

				if (filesData.has(0))
					throw new AmbermoonException(ExceptionScope.Data, 'The first file must have index 1 and not 0.');

				const writerWithoutHeader = new DataWriter();
				let totalFileNumber = Math.max(...filesData.keys());
				if (filesData.size === 0)
					throw new AmbermoonException(ExceptionScope.Data, 'Sequence contains no elements');
				if (minimumFileCount != null && minimumFileCount > totalFileNumber)
					totalFileNumber = minimumFileCount;
				const fileSizes = new Array(totalFileNumber).fill(0);
				const sortedFileEntries = [...filesData];
				sortedFileEntries.sort((a, b) => a[0] - b[0]);

				for (const [fileKey, fileValue] of sortedFileEntries) {
					if (fileValue.length === 0) {
						fileSizes[fileKey - 1] = 0;
						continue;
					}

					const fileData = fileValue;
					const prevOffset = writerWithoutHeader.Position;

					/*
					 * AMNC | Multiple file container (data uses [JH](JH.md) encoding). The C stands for "crypted". | 0x414d4e43 ('AMNC')
					   AMNP | Multiple file container (data uses [JH](JH.md) encoding and the files are often [LOB](LOB.md) encoded in addition). The P stands for "packed". | 0x414d4e50 ('AMNP')
					   AMBR | Multiple file container (no encryption). The R stands for "raw". | 0x414d4252 ('AMNR')
					   AMPC | Another multiple file container (only compressed, not JH encrypted) | 0x414d5043 ('AMPC')
					 */
					if (fileType === FileType.AMNC) {
						FileWriter.WriteJH(writerWithoutHeader, fileData, fileKey & 0xffff, false);
					} else if (fileType === FileType.AMBR) {
						writerWithoutHeader.Write(fileData);
					} else if (fileType === FileType.AMPC) {
						const position = writerWithoutHeader.Position;
						FileWriter.WriteLob(writerWithoutHeader, fileData, lobType);
						compressionPrinter?.(fileData.length, writerWithoutHeader.Position - position, fileKey);
					} else { // AMNP
						// this may be lob compressed if size is better
						const lobWriter = new DataWriter();
						FileWriter.WriteLob(lobWriter, fileData, lobType);
						const data = lobWriter.Size - 4 < fileData.length ? lobWriter.ToArray() : fileData;
						const lob = data !== fileData;
						compressionPrinter?.(fileData.length, data.length, fileKey);
						// this is always JH encoded
						const jhWriter = new DataWriter();
						const header = lob ? data.slice(0, 8) : new Uint8Array(4);
						const encodedData = lob ? data.slice(8) : data;
						FileWriter.WriteJH(jhWriter, encodedData, fileKey & 0xffff, false, true);
						writerWithoutHeader.Write(header);
						writerWithoutHeader.Write(encodedData);
					}

					fileSizes[fileKey - 1] = writerWithoutHeader.Position - prevOffset;
				}

				writer.WriteDword(fileType);

				if (fileDictionaryCompression !== FileDictionaryCompression.None) {
					let largestGapSize = 0;
					let sectionStart = 1;
					let isGap = false;
					const sections = [];
					const indices = sortedFileEntries.map(e => e[0]);
					const maxIndex = Math.max(...indices);

					if (maxIndex > 530) // this is the limit in original code
						throw new AmbermoonException(ExceptionScope.Application, 'More than 530 files are not allowed.');

					let useSections = false;

					if (fileDictionaryCompression !== FileDictionaryCompression.HalfEntrySize &&
						(minimumFileCount == null || minimumFileCount <= maxIndex)) {
						// Sections are not allowed if the minimum file count
						// exceeds the highest file index. In that case there
						// would be empty entries at the end which can't be
						// expressed by the section encoding.

						for (let i = 1; i <= maxIndex; ++i) {
							const fileData = filesData.get(i);

							if (fileData === undefined || fileData.length === 0) {
								if (i === 1) {
									isGap = true;
								} else if (!isGap) {
									sections.push({ Key: sectionStart, Value: i - sectionStart });
									isGap = true;
									sectionStart = i;
								}
							} else if (isGap) {
								const gapSize = i - sectionStart;

								if (gapSize > largestGapSize)
									largestGapSize = gapSize;

								isGap = false;
								sectionStart = i;
							}
						}

						if (maxIndex >= sectionStart) {
							// isGap can't be true here, last section is always valid
							sections.push({ Key: sectionStart, Value: maxIndex + 1 - sectionStart });
						}

						// use sections?
						useSections = sections.length !== 0 && largestGapSize > 2; // don't bother to use sections for tiny gaps

						if (useSections && fileDictionaryCompression === FileDictionaryCompression.UseBest &&
							(largestGapSize < 10 || (sections.length > 4 && largestGapSize < 20)))
							useSections = false; // many small sections are not worth to encode if "UseBest" is specified
					}

					const anyFileExceedsSize = fileSizes.some(size => size > 0xffff);
					const useHalfEntrySize = !anyFileExceedsSize && fileDictionaryCompression !== FileDictionaryCompression.UseSections;
					const mask = !useHalfEntrySize
						? (useSections ? 0x4000 : 0x0000)
						: (useSections ? 0xc000 : 0x8000);
					writer.WriteWord((mask | totalFileNumber) & 0xffff);

					if (useSections) {
						writer.WriteWord(sections.length);

						for (const section of sections) {
							writer.WriteWord(section.Key);
							writer.WriteWord(section.Value);
							let index = section.Key - 1;

							for (let i = 0; i < section.Value; ++i) {
								if (!useHalfEntrySize)
									writer.WriteDword(fileSizes[index++]);
								else
									writer.WriteWord(fileSizes[index++]);
							}
						}
					} else if (!useHalfEntrySize) {
						fileSizes.forEach(fileSize => writer.WriteDword(fileSize));
					} else {
						fileSizes.forEach(fileSize => writer.WriteWord(fileSize));
					}
				} else {
					writer.WriteWord(totalFileNumber);
					fileSizes.forEach(fileSize => writer.WriteDword(fileSize));
				}

				writer.Write(writerWithoutHeader.ToArray());
				break;
			}
			default:
				throw new AmbermoonException(ExceptionScope.Data, `File type '${enumName(FileType, fileType)}' is no container format.`);
		}
	}
}
