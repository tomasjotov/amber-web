// Tests the Amberstar music converter: renders a few seconds of every song through the ISong stream and prints RMS.
// Usage: node tools/test-amberstar-music.mjs [seconds] [--wav songNumber]
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const imp = p => import(pathToFileURL(path.join(root, p)).href);

function collect(dir, prefix, files) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		const name = prefix ? `${prefix}/${entry.name}` : entry.name;
		if (entry.isDirectory())
			collect(full, name, files);
		else
			files.set(name.toUpperCase(), new Uint8Array(fs.readFileSync(full)));
	}
	return files;
}

await imp('src/ambermoon/Ambermoon.Core/GameCore.js');
const { AssetProvider } = await imp('amberstar/src/data/assets.js');
const { Song } = await imp('src/ambermoon/Ambermoon.Data.Common/Enumerations/Song.js');
const Music = await imp('src/amberstar/convert/music.js');
const { Map: AmbermoonMap } = await imp('src/ambermoon/Ambermoon.Data.Common/Map.js');

const seconds = Number(process.argv[2]) || 3;
const wavIndex = process.argv.indexOf('--wav');
const source = new AssetProvider(collect(path.join(root, 'data/Amberstar'), '', new Map()));
const map = new AmbermoonMap();
map.MusicIndex = 7;
const ctx = { source, result: { maps: new Map([[1, map]]), songManager: null } };
let start = performance.now();
Music.convert(ctx);
console.log(`convert: ${Math.round(performance.now() - start)} ms, map music 7 -> ${map.MusicIndex}`);
const manager = ctx.result.songManager;

// Mock IAudioOutput (records StreamData calls)
const output = {
	SampleRate: 48000, Streaming: false, streamed: null,
	StreamData(stream, channels, rate, bit8) { this.streamed = { stream, channels, rate, bit8 }; },
	Start() { this.Streaming = true; }, Stop() { this.Streaming = false; }, Reset() { },
};

function rms(pcm) {
	const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
	let sum = 0, peak = 0;
	const n = pcm.length / 2;
	for (let i = 0; i < n; i++) {
		const v = view.getInt16(i * 2, true) / 32768;
		sum += v * v;
		peak = Math.max(peak, Math.abs(v));
	}
	return [Math.sqrt(sum / n), peak];
}

for (let number = 1; number <= 19; number++) {
	const song = manager.GetSong(Music.amberstarSongKey(number));
	start = performance.now();
	song.Play(output);
	// like AudioOutput.AudioBuffers: 250 ms chunks
	const chunks = [];
	for (let t = 0; t < seconds * 1000; t += 250)
		chunks.push(song.Stream(250));
	const pcm = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
	let o = 0;
	for (const c of chunks) { pcm.set(c, o); o += c.length; }
	const time = performance.now() - start;
	const [r, peak] = rms(pcm);
	const d = song.SongDuration;
	console.log(`${String(number).padStart(2)} ${song.Name.padEnd(16)} key ${song.Song} rms ${r.toFixed(4)} peak ${peak.toFixed(3)} ` +
		`duration ${d == null ? '?' : (d / 1000).toFixed(1) + ' s'} render ${(time / seconds).toFixed(1)} ms/s ` +
		`fmt ${output.streamed.channels}ch ${output.streamed.bit8 ? 8 : 16}bit ${output.streamed.rate}`);
	if (wavIndex > 0 && Number(process.argv[wavIndex + 1]) === number) {
		const header = Buffer.alloc(44);
		header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8);
		header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
		header.writeUInt32LE(48000, 24); header.writeUInt32LE(48000 * 4, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34);
		header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
		fs.mkdirSync(path.join(here, 'out'), { recursive: true });
		const file = path.join(here, 'out', `amberstar-song${number}.wav`);
		fs.writeFileSync(file, Buffer.concat([header, Buffer.from(pcm)]));
		console.log('  written', file);
	}
}

// Enum requests of the engine
const requests = ['SapphireFireballsOfPureLove', 'BarBrawlin', 'StairwayToLevel50', 'GameOver', 'HisMastersVoice', 'Intro', 'Menu', 'Outro',
	'PloddingAlong', 'HorseIsNoDisgrace', 'RiversideTravellingBlues', 'Ship', 'CompactDisc', 'WholeLottaDove', 'ChickenSoup'];
for (const name of requests) {
	const song = manager.GetSong(Song[name]);
	console.log(`Song.${name} (${Song[name]}) -> ${song ? `${song.number} ${song.Name}` : 'null'}`);
}
console.log('Song.Default ->', manager.GetSong(Song.Default));
console.log('same object for Intro/Menu:', manager.GetSong(Song.Intro) === manager.GetSong(Song.Menu),
	'key round trip:', manager.GetSong(manager.GetSong(Song.SapphireFireballsOfPureLove).Song) === manager.GetSong(Song.SapphireFireballsOfPureLove));
