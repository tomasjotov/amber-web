// Renders an Ambermoon song (Music.amb) with the SonicArranger JS port to a WAV file
// and prints the RMS level per second.
//
// Usage: node tools/render-ambermoon-song.mjs [songNumber=1] [seconds=20] [musicFile] [--own-decoder]
//
// The song is rendered exactly like Ambermoon.Data.Legacy/Audio/Song.cs does it:
// SonicArranger Stream with ChannelMode.Mono, hardware LPF on, PAL, read via ReadUnsigned
// in chunks (like IAudioStream.Stream). The WAV is 8-bit unsigned mono PCM.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(toolsDir, '..', 'src', 'ambermoon');
const importSrc = rel => import(pathToFileURL(path.join(srcDir, rel)).href);

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const flags = new Set(process.argv.slice(2).filter(a => a.startsWith('--')));
const songNumber = parseInt(args[0] ?? '1', 10);
const seconds = parseFloat(args[1] ?? '20');
const musicFile = args[2] ?? 'C:\\Work\\Apps\\Amiga\\Disk\\HDD\\Games\\Ambermoon\\Amberfiles\\Music.amb';
const sampleRate = 44100;

// ---------------- own container decoder (fallback) ----------------
// Mirrors Ambermoon.Data.Legacy/Serialization/FileReader.cs, Compression/JH.cs and Compression/Lob.cs
// (only what is needed for Music.amb: AMBR/AMNP/AMNC containers, JH and LOB/VOL1 with the Ambermoon LOB type).

const readDword = (d, o) => ((d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3]) >>> 0;
const readWord = (d, o) => ((d[o] << 8) | d[o + 1]) & 0xffff;

const FileType = { JH: 0x4a480000, LOB: 0x014c4f42, VOL1: 0x564f4c31, AMNC: 0x414d4e43, AMNP: 0x414d4e50, AMBR: 0x414d4252, AMPC: 0x414d5043 };

function jhCrypt(data, key) {
	const out = new Uint8Array(data.length);
	const numWords = (data.length + 1) >> 1;
	let d0 = key & 0xffff;
	for (let i = 0; i < numWords; ++i) {
		const index = i * 2;
		let value = index === data.length - 1 ? (data[index] << 8) : readWord(data, index);
		value = (value ^ d0) & 0xffff;
		out[index] = value >> 8;
		if (index < data.length - 1)
			out[index + 1] = value & 0xff;
		const d1 = d0;
		d0 = (d0 << 4) & 0xffff;
		d0 = (d0 + d1 + 87) & 0xffff;
	}
	return out;
}

function lobDecompress(data, offset, decodedSize) {
	const decoded = new Uint8Array(decodedSize);
	let decodeIndex = 0;
	let pos = offset;
	while (decodeIndex < decodedSize) {
		let header = data[pos++];
		for (let i = 0; i < 8; ++i) {
			if ((header & 0x80) === 0) { // match
				let matchOffset = data[pos++];
				let matchLength = (matchOffset & 0x000f) + 3;
				matchOffset <<= 4;
				matchOffset &= 0xff00;
				matchOffset |= data[pos++];
				let matchIndex = decodeIndex - matchOffset;
				while (matchLength-- !== 0)
					decoded[decodeIndex++] = decoded[matchIndex++];
			} else {
				decoded[decodeIndex++] = data[pos++];
			}
			if (decodeIndex === decodedSize)
				break;
			header = (header << 1) & 0xff;
		}
	}
	return decoded;
}

function decodeFile(data, containerType, fileNumber) {
	let header = data.length < 4 ? 0 : readDword(data, 0);
	if (((header & 0xffff0000) >>> 0) === FileType.JH) {
		data = jhCrypt(data.subarray(4), ((header >>> 16) ^ (header & 0xffff)) & 0xffff);
	} else if (containerType === FileType.AMNC) {
		data = jhCrypt(data, fileNumber);
	}
	header = data.length < 4 ? 0 : readDword(data, 0);
	if (header === FileType.LOB || header === FileType.VOL1) {
		let pos = 4;
		const lobHeader = readDword(data, pos);
		const decodedSize = lobHeader & 0x00ffffff;
		const lobType = lobHeader >>> 24;
		if (lobType !== 0x00 && lobType !== 0x06 && lobType !== 0x01)
			throw new Error(`Unsupported LOB type ${lobType} in own decoder`);
		if (containerType === FileType.AMNP) {
			pos += 4;
			data = jhCrypt(data.subarray(pos), fileNumber);
			pos = 4;
		} else {
			pos += 8;
		}
		return lobDecompress(data, pos, decodedSize);
	} else {
		if (containerType === FileType.AMNP) {
			if (readDword(data, 0) !== 0)
				throw new Error('Invalid AMNP file data.');
			data = jhCrypt(data.subarray(4), fileNumber);
		}
		return data;
	}
}

function readContainerOwn(raw) {
	const files = new Map();
	const header = readDword(raw, 0);
	if (![FileType.AMNC, FileType.AMNP, FileType.AMBR, FileType.AMPC].includes(header))
		throw new Error(`Unsupported container header 0x${header.toString(16)}`);
	let fileCount = readWord(raw, 4);
	const type = fileCount >> 14;
	fileCount &= 0x3ff;
	if (type !== 0 && type !== 2)
		throw new Error('Section containers are not supported by the own decoder');
	const entrySize = type === 2 ? 2 : 4;
	let offset = 6 + fileCount * entrySize;
	for (let i = 1; i <= fileCount; ++i) {
		const fileSize = type === 2 ? readWord(raw, 6 + (i - 1) * 2) : readDword(raw, 6 + (i - 1) * 4);
		files.set(i, fileSize === 0 ? new Uint8Array(0) : decodeFile(raw.slice(offset, offset + fileSize), header, i));
		offset += fileSize;
	}
	return files;
}

// ---------------- main ----------------

const raw = new Uint8Array(fs.readFileSync(musicFile));
console.log(`Loaded ${musicFile} (${raw.length} bytes)`);

let songReader = null;
let decoderUsed = 'own decoder';

if (!flags.has('--own-decoder')) {
	try {
		const { FileReader } = await importSrc('Ambermoon.Data.Legacy/Serialization/FileReader.js');
		const container = new FileReader().ReadRawFile('Music.amb', raw);
		songReader = container.Files.get(songNumber);
		decoderUsed = 'Ambermoon.Data.Legacy FileReader port';
	} catch (e) {
		console.log(`FileReader port not usable (${e.message}); using own container decoder.`);
	}
}

if (songReader == null) {
	const files = readContainerOwn(raw);
	const data = files.get(songNumber);
	if (!data)
		throw new Error(`Song file ${songNumber} not found (container has ${files.size} files)`);
	songReader = data; // SonicArrangerFile accepts raw data (wrapped in a BuiltinReader)
}

console.log(`Container decoded with: ${decoderUsed}`);

const { SonicArrangerFile } = await importSrc('SonicArranger/SonicArrangerFile.js');
const { Stream } = await importSrc('SonicArranger/Stream.js');

if (songReader.Position !== undefined)
	songReader.Position = 0;
const saFile = new SonicArrangerFile(songReader);
const saSong = saFile.Songs[0];
console.log(`SonicArranger file: version=${saFile.Version} songs=${saFile.Songs.length} voices=${saFile.Voices.length} ` +
	`notes=${saFile.Notes.length} instruments=${saFile.Instruments.length} waves=${saFile.Waves.length} ` +
	`samples=${saFile.Samples.length} owner="${saFile.Owner ?? ''}"`);
console.log(`Song 0: speed=${saSong.SongSpeed} patternLength=${saSong.PatternLength} start=${saSong.StartPos} ` +
	`stop=${saSong.StopPos} repeat=${saSong.RepeatPos} irqs/s=${saSong.NBIrqps} bpm=${saSong.InitialBPM}`);

// Like Ambermoon.Data.Legacy/Audio/Song.cs: Mono, hardware LPF, PAL. Song index 0 (only the menu song uses 1).
const t0 = performance.now();
const stream = new Stream(saFile, 0, sampleRate, Stream.ChannelMode.Mono, true, true);
const chunks = [];
let total = 0;
const loop = false; // Song.cs only loops the intro song
let remaining = seconds * 1000;
// Song.Stream(TimeSpan) reads in pieces of at most 1000 ms; the OpenAL output requests 250 ms buffers.
while (remaining > 0 && !stream.EndOfStream) {
	const ms = Math.min(250, remaining);
	const chunk = stream.ReadUnsigned(Math.round(ms), loop);
	chunks.push(chunk);
	total += chunk.length;
	remaining -= ms;
}
const t1 = performance.now();
const pcm = new Uint8Array(total);
{
	let p = 0;
	for (const c of chunks) {
		pcm.set(c, p);
		p += c.length;
	}
}
console.log(`Rendered ${(total / sampleRate).toFixed(2)} s in ${((t1 - t0) / 1000).toFixed(2)} s (${(total / sampleRate / ((t1 - t0) / 1000)).toFixed(1)}x realtime)`);

// RMS per second (normalized to -1..1)
console.log('RMS per second:');
for (let s = 0; s * sampleRate < total; ++s) {
	const start = s * sampleRate;
	const end = Math.min(total, start + sampleRate);
	let sumSq = 0;
	let peak = 0;
	for (let i = start; i < end; ++i) {
		const v = (pcm[i] - 128) / 128;
		sumSq += v * v;
		peak = Math.max(peak, Math.abs(v));
	}
	const rms = Math.sqrt(sumSq / (end - start));
	const bar = '#'.repeat(Math.round(rms * 200));
	console.log(`  ${String(s).padStart(2)}s  rms=${rms.toFixed(4)}  peak=${peak.toFixed(3)}  ${bar}`);
}

// WAV (8-bit unsigned PCM, mono)
const outDir = path.join(toolsDir, 'out');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `am-song${songNumber}.wav`);
const wav = Buffer.alloc(44 + total);
wav.write('RIFF', 0, 'ascii');
wav.writeUInt32LE(36 + total, 4);
wav.write('WAVE', 8, 'ascii');
wav.write('fmt ', 12, 'ascii');
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20); // PCM
wav.writeUInt16LE(1, 22); // mono
wav.writeUInt32LE(sampleRate, 24);
wav.writeUInt32LE(sampleRate, 28); // byte rate
wav.writeUInt16LE(1, 32); // block align
wav.writeUInt16LE(8, 34); // bits per sample
wav.write('data', 36, 'ascii');
wav.writeUInt32LE(total, 40);
Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength).copy(wav, 44);
fs.writeFileSync(outFile, wav);
console.log(`Wrote ${outFile}`);
