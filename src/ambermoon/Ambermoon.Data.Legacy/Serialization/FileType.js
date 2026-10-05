// Port of Ambermoon.Data.Legacy/Serialization/FileType.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

// Note: All values are unsigned 32 bit values (compare with `header >>> 0`).
export const FileType = Object.freeze({
	None: 0,
	/** JH-encoded files (Jurie Horneman's encoder). */
	JH: 0x4a480000,
	/** LOB-encoded files (Lothar Becks' encoder). */
	LOB: 0x014c4f42,
	/** Another LOB-encoded files. */
	VOL1: 0x564f4c31,
	/** Crypted AMN file (multiple file container, data uses JH encryption). */
	AMNC: 0x414d4e43,
	/** Packed AMN file (multiple file container, files are often LOB-encoded). */
	AMNP: 0x414d4e50,
	/** Raw AMN file (no encryption). */
	AMBR: 0x414d4252,
	/** Another multiple file container. */
	AMPC: 0x414d5043,
	/** Special format. JH combined with LOB. Key in lower word. */
	JHPlusLOB: 0xaaaa0000,
	/** Special format. JH combined with AMBR. Key in lower word. */
	JHPlusAMBR: 0xbbbb0000,
	/** Special text container. */
	AMTX: 0x414d5458
});

export class FileTypeExtensions {
	static AsFileType(header) {
		header = header >>> 0;
		const upperHalf = (header & 0xffff0000) >>> 0;

		if (upperHalf === FileType.JH)
			return FileType.JH;
		if (upperHalf === FileType.JHPlusLOB)
			return FileType.JHPlusLOB;
		if (upperHalf === FileType.JHPlusAMBR)
			return FileType.JHPlusAMBR;

		return header;
	}

	static IsJH(header) {
		const fileType = FileTypeExtensions.AsFileType(header);

		return fileType === FileType.JH ||
			fileType === FileType.JHPlusLOB ||
			fileType === FileType.JHPlusAMBR;
	}
}
