// Labyrinth data and blocks (port of LabData, LabBlock).
import { loadGraphicWithHeader } from './graphic.js';
import { LabBlockType, BlockFacing } from './enums.js';

function locationByIndex(index, type) {
	let facing = BlockFacing.FacingPlayer;

	if (type === LabBlockType.Wall)
		return { location: index % 11, facing };
	if (type === LabBlockType.Object)
		return { location: 2 + index * 3, facing };

	// Overlay
	if (index >= 9)
		facing = index % 2 === 0 ? BlockFacing.RightOfPlayer : BlockFacing.LeftOfPlayer;
	if (index < 11)
		return { location: index, facing };
	index %= 11;
	return { location: index % 2 + Math.floor(index / 2) * 3, facing };
}

export function loadLabBlock(index, reader) {
	if (reader.readByte() !== 0)
		throw new Error('Invalid lab block data.');

	const type = reader.readByte();
	const numPerspectives = reader.readByte();
	const numFrames = reader.readByte();
	const xOffsets = reader.readWords(17).map(signed16);
	const yOffsets = reader.readWords(17).map(signed16);
	const specialX = type === LabBlockType.Object ? signed16(reader.readWord()) : 0;
	const specialY = type === LabBlockType.Object ? signed16(reader.readWord()) : 0;

	const images = [];
	while (reader.size - reader.position >= 4) {
		const size = reader.readDword();
		if (size === 0)
			break;
		const end = reader.position + size;
		images.push(loadGraphicWithHeader(reader));
		if (reader.position !== end)
			throw new Error('Invalid lab block data.');
	}

	if (images.length !== numPerspectives * numFrames)
		throw new Error(`Invalid lab block data (${images.length} images, expected ${numPerspectives * numFrames}).`);

	const perspectives = [];
	for (let i = 0; i < numPerspectives; i++) {
		const { location, facing } = locationByIndex(i, type);
		const frames = [];
		for (let n = 0, fi = i; n < numFrames; n++, fi += numPerspectives)
			frames.push(images[fi]);
		perspectives.push({
			location,
			facing,
			renderX: xOffsets[i],
			renderY: yOffsets[i],
			special: type === LabBlockType.Object && i === 3 && numFrames > 1 ? { x: specialX, y: specialY } : null,
			frames,
		});
	}

	return { index, type, perspectives };
}

function signed16(v) {
	return v >= 0x8000 ? v - 0x10000 : v;
}

export function loadLabData(reader, labBlocks) {
	if (reader.readByte() !== 0)
		throw new Error('Invalid lab data.');
	reader.readByte(); // number of images
	const numBlocks = reader.readByte();
	const blocks = [];
	for (let i = 0; i < numBlocks; i++)
		blocks.push(labBlocks.get(reader.readByte()));
	if (reader.readByte() !== 0)
		throw new Error('Invalid lab data.');
	const outdoors = reader.readByte();
	if (reader.readByte() !== 2)
		throw new Error('Invalid lab data.');
	const ceilingIndex = reader.readByte();
	const floorIndex = reader.readByte();
	if (reader.readByte() !== 1)
		throw new Error('Invalid lab data.');
	const paletteIndex = reader.readByte();
	return { ceilingIndex, floorIndex, paletteIndex, outdoors: outdoors === 3, labBlocks: blocks };
}
