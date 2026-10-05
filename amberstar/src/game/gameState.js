// Port of Amberstar.Game.GameState and Time.
import { EventEmitter } from './util.js';
import { MovesPerTimeProgress } from '../data/enums.js';
import { SpecialItems } from '../data/characters.js';
import { MaxPartyMembers, MaxTransportCount } from '../data/savegame.js';

export const WorldMapWidth = 50;
export const WorldMapHeight = 50;
const WorldMapWidthInMaps = 8;
const WorldMapHeightInMaps = 8;

/** World maps are the maps 1..64 (8x8). Returns the 1-based index of the neighbor map. */
export function getWorldMapIndex(index, offsetX, offsetY) {
	index--;
	let currentX = index % WorldMapWidthInMaps;
	let currentY = Math.floor(index / WorldMapWidthInMaps);
	currentX = (currentX + offsetX + WorldMapWidthInMaps) % WorldMapWidthInMaps;
	currentY = (currentY + offsetY + WorldMapHeightInMaps) % WorldMapHeightInMaps;
	return 1 + currentX + currentY * WorldMapWidthInMaps;
}

function copyArray(src, dst) {
	for (let i = 0; i < Math.min(src.length, dst.length); i++)
		dst[i] = src[i];
}

export class GameState {
	constructor(savegame, assets) {
		this.assets = assets;
		this.partyMembers = assets.getPartyMemberCopies();
		for (const pm of this.partyMembers.values())
			GameState.recalculateWeight(pm);
		this.activePartyMemberChanged = new EventEmitter();
		this.currentInventoryChanged = new EventEmitter();
		this.currentInventoryIndex = null;
		this.currentConversationCharacter = null;
		this.lastPosition = { x: 7, y: 10 };
		this.worldMap = false;
		this.#load(savegame);
	}

	#load(s) {
		this.year = s.year;
		this.month = s.month;
		this.day = s.day;
		this.hour = s.hour;
		this.minute = s.minute;
		this.travelledDays = s.travelledDays;
		this.relativeYear = s.relativeYear;
		this.mapIndex = s.mapIndex;
		this.partyX = s.partyX;
		this.partyY = s.partyY;
		this.partyDirection = s.partyDirection;
		this.specialItems = s.specialItems;
		this.travelType = s.travelType;
		this.musicBlock = s.musicBlock;
		this.partySize = s.partySize;
		this.activePartyMemberIndex = s.activePartyMember;
		this.activeSpells = s.activeSpells.map(a => ({ ...a }));
		this.transports = s.transports.map(t => ({ ...t }));
		this.partyCharacterIndices = [...s.partyCharacterIndices];
		this.combatPositions = [...s.combatPositions];
		this.questBits = Uint8Array.from(s.questBits);
		this.eventBits = Uint8Array.from(s.eventBits);
		this.characterBits = Uint8Array.from(s.characterBits);
		this.knownWordsBits = Uint8Array.from(s.knownWordsBits);
		this.chestSlotBits = Uint8Array.from(s.chestSlotBits);
		this.chestGold = [...s.chestGold];
		this.wareCounts = [...s.wareCounts];
		this.tileChanges = new Map();
		for (const t of s.tileChanges)
			this.tileChanges.set(`${t.mapIndex}:${t.x}:${t.y}`, { ...t });
	}

	/** Total weight of all items and gold (the original stores it in the character data) */
	static recalculateWeight(pm) {
		let weight = pm.gold * 10;
		for (const slot of [...pm.equipment, ...pm.inventory])
			if (slot.item && slot.count > 0)
				weight += slot.item.weight * slot.count;
		pm.totalWeight = weight;
		return weight;
	}

	loadFrom(savegame) {
		this.#load(savegame);
	}

	toSavegame() {
		let mapIndex = this.mapIndex, partyX = this.partyX, partyY = this.partyY;
		if (this.worldMap && partyX > WorldMapWidth) {
			mapIndex = getWorldMapIndex(mapIndex, 1, 0);
			partyX -= WorldMapWidth;
		}
		if (this.worldMap && partyY > WorldMapHeight) {
			mapIndex = getWorldMapIndex(mapIndex, 0, 1);
			partyY -= WorldMapHeight;
		}
		return {
			year: this.year, month: this.month, day: this.day, hour: this.hour, minute: this.minute,
			travelledDays: this.travelledDays, relativeYear: this.relativeYear,
			mapIndex, partyX, partyY, partyDirection: this.partyDirection,
			specialItems: this.specialItems, travelType: this.travelType, musicBlock: this.musicBlock,
			partySize: this.partySize, activePartyMember: this.activePartyMemberIndex,
			activeSpells: this.activeSpells.map(a => ({ ...a })),
			transports: this.transports.map(t => ({ ...t })),
			partyCharacterIndices: [...this.partyCharacterIndices],
			combatPositions: [...this.combatPositions],
			questBits: this.questBits.slice(), eventBits: this.eventBits.slice(), characterBits: this.characterBits.slice(),
			knownWordsBits: this.knownWordsBits.slice(), chestSlotBits: this.chestSlotBits.slice(),
			chestGold: [...this.chestGold], wareCounts: [...this.wareCounts],
			tileChanges: [...this.tileChanges.values()].map(t => ({ ...t })),
		};
	}

	get hasWindChain() { return (this.specialItems & SpecialItems.WindChain) !== 0; }

	// ---- party ----

	tryAddPartyMember(characterIndex) {
		if (this.partySize === MaxPartyMembers)
			return -1;
		for (let i = 1; i < MaxPartyMembers; i++) {
			if (this.partyCharacterIndices[i] === 0) {
				this.partyCharacterIndices[i] = characterIndex;
				this.partySize++;
				return i;
			}
		}
		return -1;
	}

	get currentInventory() {
		const i = this.currentInventoryIndex;
		if (i == null || i < 1 || i > this.partySize)
			return null;
		const ci = this.partyCharacterIndices[i - 1];
		return ci === 0 ? null : this.partyMembers.get(ci);
	}

	get activePartyMember() {
		const i = this.activePartyMemberIndex;
		if (i < 1 || i > this.partySize)
			return null;
		const ci = this.partyCharacterIndices[i - 1];
		return ci === 0 ? null : this.partyMembers.get(ci);
	}

	hasPartyMemberInSlot(slot) {
		if (slot < 1 || slot > MaxPartyMembers)
			return false;
		return this.partyCharacterIndices[slot - 1] !== 0;
	}

	getPartyMember(slot) {
		if (slot < 1 || slot > MaxPartyMembers)
			return null;
		const ci = this.partyCharacterIndices[slot - 1];
		return ci === 0 ? null : this.partyMembers.get(ci);
	}

	setActivePartyMember(slot) {
		if (slot < 1 || slot > this.partySize || this.partyCharacterIndices[slot - 1] === 0)
			return this.activePartyMember;
		this.activePartyMemberIndex = slot;
		this.activePartyMemberChanged.invoke();
		return this.activePartyMember;
	}

	setCurrentInventory(slot) {
		if (slot != null && (slot < 1 || slot > this.partySize))
			return;
		this.currentInventoryIndex = slot;
		this.currentInventoryChanged.invoke();
	}

	*members() {
		for (let i = 0; i < MaxPartyMembers; i++) {
			const ci = this.partyCharacterIndices[i];
			if (ci !== 0)
				yield this.partyMembers.get(ci);
		}
	}

	*membersWithSlot() {
		for (let i = 0; i < MaxPartyMembers; i++) {
			const ci = this.partyCharacterIndices[i];
			yield { slotIndex: i, partyMember: ci !== 0 ? this.partyMembers.get(ci) : null };
		}
	}

	// ---- map ----

	get partyPosition() { return { x: this.partyX - 1, y: this.partyY - 1 }; }

	getIndexOfMapWithPlayer() {
		let mapIndex = this.mapIndex;
		if (!this.worldMap)
			return mapIndex;
		if (this.partyX > WorldMapWidth)
			mapIndex = getWorldMapIndex(mapIndex, 1, 0);
		if (this.partyY > WorldMapHeight)
			mapIndex = getWorldMapIndex(mapIndex, 0, 1);
		return mapIndex;
	}

	setPartyPosition(x, y) {
		this.lastPosition = { x: this.partyX - 1, y: this.partyY - 1 };
		this.partyX = x + 1;
		this.partyY = y + 1;
	}

	resetPartyPosition() {
		const oldX = this.partyX, oldY = this.partyY;
		this.partyX = this.lastPosition.x + 1;
		this.partyY = this.lastPosition.y + 1;
		return oldX !== this.partyX || oldY !== this.partyY;
	}

	setIsWorldMap(worldMap) { this.worldMap = worldMap; }

	getTransportAtLocation(x, y, mapIndex) {
		mapIndex ??= this.getIndexOfMapWithPlayer();
		for (let i = 0; i < MaxTransportCount; i++) {
			const t = this.transports[i];
			if (t.mapIndex === mapIndex && t.x === x && t.y === y)
				return t;
		}
		return null;
	}

	getTransportsOnMap(mapIndex) {
		mapIndex ??= this.getIndexOfMapWithPlayer();
		return this.transports.filter(t => t.mapIndex === mapIndex && t.type !== 0);
	}

	saveTileChange(mapIndex, x, y, tileIndex) {
		this.tileChanges.set(`${mapIndex}:${x}:${y}`, { mapIndex, x, y, tileIndex });
	}

	getTileChanges(mapIndex) {
		return [...this.tileChanges.values()].filter(t => t.mapIndex === mapIndex);
	}

	// ---- bits ----

	static setBit(bits, bit, set) {
		const mask = 1 << (bit & 7);
		if (set)
			bits[bit >> 3] |= mask;
		else
			bits[bit >> 3] &= ~mask & 0xff;
	}

	static isBitSet(bits, bit) {
		return (bits[bit >> 3] & (1 << (bit & 7))) !== 0;
	}

	isQuestBitSet(bit) { return GameState.isBitSet(this.questBits, bit); }
	setQuestBit(bit, set = true) { GameState.setBit(this.questBits, bit, set); }

	// eventIndex is 1-based
	isEventActive(mapIndex, eventIndex) { return !GameState.isBitSet(this.eventBits, (mapIndex - 1) * 65 + eventIndex); }
	saveEvent(mapIndex, eventIndex) { GameState.setBit(this.eventBits, (mapIndex - 1) * 65 + eventIndex, true); }

	// mapCharIndex is 1-based
	isMapCharacterActive(mapIndex, mapCharIndex) { return !GameState.isBitSet(this.characterBits, (mapIndex - 1) * 24 + mapCharIndex); }
	setMapCharacterActive(mapIndex, mapCharIndex, active) { GameState.setBit(this.characterBits, (mapIndex - 1) * 24 + mapCharIndex, !active); }

	learnWord(index) { GameState.setBit(this.knownWordsBits, index, true); }
	isWordKnown(index) { return GameState.isBitSet(this.knownWordsBits, index); }

	getWareCounts(merchantIndex) {
		const offset = (merchantIndex - 1) * 12;
		return this.wareCounts.slice(offset, offset + 12);
	}

	setWareCounts(merchantIndex, counts) {
		const offset = (merchantIndex - 1) * 12;
		for (let i = 0; i < 12; i++)
			this.wareCounts[offset + i] = counts[i];
	}

	getChestGold(chestIndex) { return this.chestGold[chestIndex]; }
	setChestGold(chestIndex, amount) { this.chestGold[chestIndex] = amount; }

	putGoldToChest(chestIndex, amount) {
		this.chestGold[chestIndex] += amount;
		if (this.chestGold[chestIndex] > 32767) {
			const remaining = this.chestGold[chestIndex] - 32767;
			this.chestGold[chestIndex] = 32767;
			return remaining;
		}
		return 0;
	}

	chestHasItems(chestIndex) { return this.getChestSlotBits(chestIndex) !== 0; }

	getChestSlotBits(chestIndex) {
		const index = chestIndex - 1;
		const offset = 3 * Math.floor(index / 2);
		const b = this.chestSlotBits;
		let bits;
		if ((index & 1) === 0) {
			bits = ((b[offset + 1] << 8) | b[offset]) >> 1;
		} else {
			bits = ((b[offset + 2] << 8) | b[offset + 1]) >> 5;
			if ((b[offset + 3] & 1) === 1)
				bits |= 0x800;
		}
		return bits & 0xfff;
	}

	setChestSlotBit(chestIndex, bit, set) {
		const index = chestIndex - 1;
		const offset = 3 * Math.floor(index / 2);
		const change = (byteIndex, bitIndex) => {
			if (set)
				this.chestSlotBits[byteIndex] |= 1 << bitIndex;
			else
				this.chestSlotBits[byteIndex] &= ~(1 << bitIndex) & 0xff;
		};
		if ((index & 1) === 0) {
			if (bit < 7)
				change(offset, bit + 1);
			else
				change(offset + 1, bit - 7);
		} else {
			if (bit < 3)
				change(offset + 1, bit + 5);
			else if (bit === 11)
				change(offset + 3, 0);
			else
				change(offset + 2, bit - 3);
		}
	}
}

export class Time {
	static TicksPerTimeChange = 500;

	constructor(game) {
		this.game = game;
		this.lastTimeChangeTicks = 0;
		this.totalTicks = 0;
		this.moveTicks = 0;
		this.minuteChanged = new EventEmitter();
		this.hourChanged = new EventEmitter();
		this.dayChanged = new EventEmitter();
		this.monthChanged = new EventEmitter();
		this.yearChanged = new EventEmitter();
	}

	update(elapsed) {
		this.totalTicks += elapsed;
		let elapsedTimeTicks = this.totalTicks - this.lastTimeChangeTicks;
		while (elapsedTimeTicks >= Time.TicksPerTimeChange) {
			elapsedTimeTicks -= Time.TicksPerTimeChange;
			this.tick();
		}
	}

	moved2D() {
		if (++this.moveTicks >= MovesPerTimeProgress[this.game.state.travelType])
			this.tick();
	}

	moved3D() {
		// TODO (also not implemented in the original port)
	}

	tick() {
		const s = this.game.state;
		let hourChanged = false, dayChanged = false, monthChanged = false, yearChanged = false;
		this.moveTicks = 0;
		s.minute += 5;
		if (s.minute === 60) {
			s.minute = 0;
			s.hour++;
			hourChanged = true;
			if (s.hour === 24) {
				s.hour = 0;
				s.day++;
				s.travelledDays++;
				dayChanged = true;
				if (s.day === 31) {
					s.day = 1;
					s.month++;
					monthChanged = true;
					if (s.month === 13) {
						s.month = 1;
						s.year++;
						s.relativeYear++;
						yearChanged = true;
					}
				}
			}
		}
		this.lastTimeChangeTicks = this.totalTicks;
		this.#invoke(this.minuteChanged);
		if (hourChanged) this.#invoke(this.hourChanged);
		if (dayChanged) this.#invoke(this.dayChanged);
		if (monthChanged) this.#invoke(this.monthChanged);
		if (yearChanged) this.#invoke(this.yearChanged);
	}

	#invoke(emitter) {
		if (emitter.count !== 0)
			this.game.addDelayedAction(0, () => emitter.invoke());
	}
}
