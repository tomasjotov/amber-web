// Tests the Amberstar characters converter (items, characters, places, savegame) in Node.
// Usage: node tools/test-amberstar-characters.mjs [--png]   (PNG previews go to tools/out/)
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath, pathToFileURL } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const imp = p => import(pathToFileURL(path.join(root, p)).href);

function collect(dir, prefix, files, upper = false) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		const name = prefix ? `${prefix}/${entry.name}` : entry.name;
		if (entry.isDirectory())
			collect(full, name, files, upper);
		else
			files.set(upper ? name.toUpperCase() : name, new Uint8Array(fs.readFileSync(full)));
	}
	return files;
}

let failures = 0;
const check = (condition, message) => {
	if (!condition) {
		failures++;
		console.error('FAIL:', message);
	}
};

await imp('src/ambermoon/Ambermoon.Core/GameCore.js');
const { GameData } = await imp('src/ambermoon/Ambermoon.Data.Legacy/GameData.js');
const { createAmberstarGameData } = await imp('src/amberstar/AmberstarGameData.js');
const { SavegameSerializer } = await imp('src/ambermoon/Ambermoon.Data.Legacy/Serialization/SavegameSerializer.js');
const { Places } = await imp('src/ambermoon/Ambermoon.Data.Common/Places.js');
const { PlaceType } = await imp('src/ambermoon/Ambermoon.Data.Common/Enumerations/PlaceType.js');
const { GraphicType } = await imp('src/ambermoon/Ambermoon.Data.Common/IGraphicProvider.js');
const { EquipmentSlot } = await imp('src/ambermoon/Ambermoon.Data.Common/Enumerations/EquipmentSlot.js');
const { Character } = await imp('src/ambermoon/Ambermoon.Data.Common/Character.js');

const ambermoon = new GameData(GameData.LoadPreference.PreferExtracted, null, false);
ambermoon.LoadFromFiles(collect(path.join(root, 'data/Ambermoon'), '', new Map()));
const amberstarFiles = collect(path.join(root, 'data/Amberstar'), '', new Map(), true);
const { gameData, savegameManager, context: ctx } = createAmberstarGameData(ambermoon, amberstarFiles, null);

// ---- items ----
const items = gameData.ItemManager;
console.log('Items:', items.Items.length, 'e.g.', items.GetItem(127)?.Name, items.GetItem(56)?.Name, gameData.DataNameProvider.GetSpellName(items.GetItem(56)?.Spell));
check(items.Items.every(i => i.GraphicIndex < 128), 'item graphic indices');
console.log('Text scroll text:', items.GetText(1, 0)?.slice(0, 80));

// ---- characters ----
const cm = gameData.CharacterManager;
console.log('Party members:', cm.InitialPartyMembers.map(p => `${p.Index}:${p.Name}(${gameData.DataNameProvider.GetClassName(p.Class)}/${gameData.DataNameProvider.GetRaceName(p.Race)} L${p.Level} P${p.PortraitIndex})`).join(' '));
const silk = cm.GetInitialPartyMember(12);
console.log('Silk texts:', silk.Texts.length, 'events:', silk.Events.length, 'list:', silk.EventList.length);
for (const e of silk.EventList) {
	const chain = [];
	for (let ev = e; ev; ev = ev.Next)
		chain.push(ev.toString());
	console.log('  ', chain.join(' -> '));
}
const sheba = cm.GetInitialPartyMember(40);
console.log('Sheba spells:', sheba.LearnedSpells.map(s => gameData.DataNameProvider.GetSpellName(s)).join(', '), 'mastery', sheba.SpellMastery);
console.log('NPC 2:', cm.GetNPC(2)?.Name, cm.GetNPC(2)?.EventList.length, 'events');
const monster = cm.GetMonster(64);
console.log('Monster 64:', monster.Name, 'HP', monster.HitPoints.CurrentValue, 'frames', monster.FrameWidth, monster.FrameHeight, '->', monster.MappedFrameWidth, monster.MappedFrameHeight,
	'graphic', monster.CombatGraphic?.Width, 'spells', monster.LearnedSpells.join(','), 'gfx', monster.CombatGraphicIndex);
const clone = cm.CloneMonster(monster);
check(clone.Name === monster.Name && clone.CombatGraphic === monster.CombatGraphic && clone.HitPoints.CurrentValue === monster.HitPoints.CurrentValue, 'CloneMonster');
for (const m of cm.Monsters)
	check(m.CombatGraphic && m.CombatGraphic.Width === m.FrameWidth * Math.max(...m.Animations.flatMap(a => Array.from(a.FrameIndices.slice(0, a.UsedAmount)))) + m.FrameWidth || m.CombatGraphic.Width >= m.FrameWidth, `monster ${m.Index} graphic`);
const group = cm.GetMonsterGroup(4);
console.log('Monster group 4:', group.Monsters.map(c => c.map(m => m?.Index ?? 0).join('/')).join(' '));
console.log('Monster groups:', cm.MonsterGroups.size);

// ---- places ----
const places = gameData.Places;
console.log('Places:', places.Entries.length, new Places.Inn(places.Entries[7]).toString(), '|', new Places.Healer(places.Entries[0]).toString().slice(0, 80),
	'|', new Places.HorseSalesman(places.Entries[1]).toString(), '|', new Places.Trainer(places.Entries[5]).toString());

// ---- graphics ----
const gp = gameData.GraphicInfoProvider;
for (const type of [GraphicType.Portrait, GraphicType.Item, GraphicType.Pics80x80, GraphicType.EventPictures, GraphicType.BattleFieldIcons])
	console.log('Graphics', type, gp.GetGraphics(type).length, gp.GetGraphics(type)[0]?.Width + 'x' + gp.GetGraphics(type)[0]?.Height);
console.log('Event picture palettes:', ctx.result.eventPicturePalettes.slice(0, 5));
console.log('Dictionary:', gameData.Dictionary.Entries.length, gameData.Dictionary.Entries[5]);

// ---- savegame ----
const storage = new Map();
const store = { get: n => storage.get(n) ?? null, set: (n, d) => d == null ? storage.delete(n) : storage.set(n, d), remove: n => storage.delete(n) };
const manager = savegameManager(store);
const serializer = new SavegameSerializer();
const initial = manager.LoadInitial(gameData, serializer);
console.log('Initial savegame: map', initial.CurrentMapIndex, initial.CurrentMapX, initial.CurrentMapY, 'dir', initial.CharacterDirection,
	`date ${initial.Year}-${initial.Month}-${initial.DayOfMonth} ${initial.Hour}:${initial.Minute}`,
	'party', initial.CurrentPartyMemberIndices.join(','), 'members', initial.PartyMembers.size, 'chests', initial.Chests.size,
	'merchants', initial.Merchants.size, 'known words', gameData.Dictionary.Entries.filter((w, i) => initial.IsDictionaryWordKnown(i)).join(','));
check(initial.CurrentMapIndex === 65, 'start map 65');
check(gameData.MapManager.GetMap(initial.CurrentMapIndex) != null, 'start map exists');
const hero = initial.GetPartyMember(0);
console.log('Hero:', hero.Name, 'HP', hero.HitPoints.CurrentValue + '/' + hero.HitPoints.TotalMaxValue, 'gold', hero.Gold, 'food', hero.Food,
	'equip', [...hero.Equipment.Slots.values()].filter(s => !s.Empty).map(s => items.GetItem(s.ItemIndex)?.Name).join(', '),
	'inventory', hero.Inventory.Slots.filter(s => !s.Empty).map(s => `${s.Amount}x${items.GetItem(s.ItemIndex)?.Name}`).join(', '),
	'weight', hero.TotalWeight, 'texts', hero.Texts.length);
for (const pm of initial.PartyMembers.values()) {
	for (const slot of [...pm.Equipment.Slots.values(), ...pm.Inventory.Slots])
		check(slot.Empty || items.GetItem(slot.ItemIndex), `party member ${pm.Index} item ${slot.ItemIndex}`);
	check(pm.Texts.length > 0 && pm.EventList.length > 0 || pm.Index === 1, `party member ${pm.Index} conversation`);
}
for (const chest of initial.Chests.values())
	for (const slot of chest.Slots.flat())
		check(slot.Empty || items.GetItem(slot.ItemIndex), `chest item ${slot.ItemIndex}`);
const merchant = initial.Merchants.get(1);
console.log('Merchant 1:', merchant.Slots.flat().filter(s => !s.Empty).map(s => `${s.Amount === 255 ? '∞' : s.Amount}x${items.GetItem(s.ItemIndex)?.Name}`).join(', '));
const chestWithGold = [...initial.Chests].find(([, c]) => c.Gold);
console.log('Chest', chestWithGold[0], 'gold', chestWithGold[1].Gold, 'items', chestWithGold[1].Slots.flat().filter(s => !s.Empty).map(s => items.GetItem(s.ItemIndex)?.Name).join(', '));

// Save / load round trip
initial.PartyMembers.get(1).Name = 'TESTER';
initial.AddDictionaryWord(3000);
initial.CurrentMapX = 10;
manager.Save(gameData, serializer, 3, 'Test save', initial);
const [names, current] = manager.GetSavegameNames(gameData, 10);
check(names[2] === 'Test save' && current === 3, 'savegame names');
const loaded = manager.Load(gameData, serializer, 3, 10);
check(loaded && loaded.PartyMembers.get(1).Name === 'TESTER', 'load party member');
check(loaded.IsDictionaryWordKnown(3000) && loaded.IsDictionaryWordKnown(42), 'load dictionary words ' + loaded.DictionaryWords.length + ' ' + loaded.IsDictionaryWordKnown(3000) + ' ' + loaded.IsDictionaryWordKnown(42) + ' ' + initial.IsDictionaryWordKnown(3000));
check(loaded.CurrentMapX === 10, 'load position');
check(loaded.PartyMembers.get(12).Texts.length === silk.Texts.length, 'party member texts after load');
check(loaded.PartyMembers.get(12).EventList.length === silk.EventList.length, 'party member events after load');
check(manager.Load(gameData, serializer, 4, 10) == null, 'missing savegame');
manager.SaveCrashedGame(serializer, loaded);
check(manager.HasCrashSavegame(), 'crash save');
check(manager.RemoveCrashedSavegame() && !manager.HasCrashSavegame(), 'remove crash save');
// fresh initial savegame each time
check(manager.LoadInitial(gameData, serializer).PartyMembers.get(1).Name !== 'TESTER', 'initial savegame is fresh');

// Weight like GameCore.FixSavegameValues
for (const member of loaded.PartyMembers.values()) {
	let weight = member.Gold * Character.GoldWeight + member.Food * Character.FoodWeight;
	for (const slot of [...member.Inventory.Slots, ...member.Equipment.Slots.values()])
		if (slot.ItemIndex)
			weight += slot.Amount * items.GetItem(slot.ItemIndex).Weight;
	check(weight === member.TotalWeight, `weight of ${member.Name}`);
}

// ---- PNG previews ----
if (process.argv.includes('--png')) {
	const crcTable = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
	const crc = buf => { let c = -1; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
	const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
	const writePng = (file, w, h, rgba) => {
		const raw = Buffer.alloc((w * 4 + 1) * h);
		for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
		const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
		fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
	};
	const sheet = (name, graphics, paletteOf, cols) => {
		const w = Math.max(...graphics.map(g => g.Width)), h = Math.max(...graphics.map(g => g.Height));
		const rows = Math.ceil(graphics.length / cols), W = cols * (w + 1), H = rows * (h + 1);
		const out = new Uint8Array(W * H * 4).fill(60);
		graphics.forEach((g, i) => {
			const p = paletteOf(i).Data, ox = (i % cols) * (w + 1), oy = Math.floor(i / cols) * (h + 1);
			for (let y = 0; y < g.Height; y++) for (let x = 0; x < g.Width; x++) {
				let c = g.Data[x + y * g.Width];
				const o = (ox + x + (oy + y) * W) * 4;
				if (c === 0) { out.set([255, 0, 255, 255], o); continue; }
				if (c >= 32) c = 0;
				out.set([p[c * 4], p[c * 4 + 1], p[c * 4 + 2], 255], o);
			}
		});
		fs.mkdirSync(path.join(here, 'out'), { recursive: true });
		writePng(path.join(here, 'out', name), W, H, out);
	};
	const ui = gp.Palettes.get(gp.PrimaryUIPaletteIndex);
	sheet('characters-portraits.png', gp.GetGraphics(GraphicType.Portrait), () => ui, 13);
	sheet('characters-items.png', gp.GetGraphics(GraphicType.Item), () => ui, 16);
	sheet('characters-pics80x80.png', gp.GetGraphics(GraphicType.Pics80x80), () => ui, 8);
	sheet('characters-eventpictures.png', gp.GetGraphics(GraphicType.EventPictures), i => gp.Palettes.get(ctx.result.eventPicturePalettes[i] + 1), 3);
	sheet('characters-battlefieldicons.png', gp.GetGraphics(GraphicType.BattleFieldIcons), () => ui, 16);
	const combat = gameData.GraphicInfoProvider.Get2DCombatBackground?.(0)?.Palettes?.[0];
	if (combat != null)
		sheet('characters-monsters.png', cm.Monsters.map(m => m.CombatGraphic), () => gp.Palettes.get(combat + 0) ?? ui, 2);
	console.log('PNG previews written to tools/out/characters-*.png');
}

console.log(failures === 0 ? 'All checks passed.' : `${failures} checks failed.`);
process.exitCode = failures === 0 ? 0 : 1;
