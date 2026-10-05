// Converter 4 (see ../../../AMBERSTAR.md): characters, items, places, portraits, pictures, names and the
// savegame.
//
// Outputs:
//   ctx.result.itemManager       ItemManager (GetItem(amberstarItemIndex), GetText(list, block), Items)
//   ctx.result.characterManager  party members / NPCs / monsters by CHARDATA index, monster groups by
//                                MON_DATA index (see characters/persons.js)
//   ctx.result.places            Places (Entries[placeIndex - 1], see characters/places.js)
//   ctx.result.dictionary        TextDictionary (index = Amberstar text fragment index, see characters/texts.js)
//   ctx.result.dataNameProvider  name overrides (classes, races, spells, item types, conditions, languages)
//   ctx.result.savegameManager   factory (storage) => ISavegameManager (createSavegameManager)
//   ctx.result.eventPicturePalettes  event picture index -> sprite palette index
//   ctx.graphics                 Portrait, Item, Pics80x80, EventPictures, BattleFieldIcons
//
// Index contracts with the other converters:
//   - party member / NPC / monster index = Amberstar CHARDATA index, monster group = MON_DATA index
//   - item index = Amberstar item index; chest key = Amberstar chest index (ChestEvent.ChestIndex = chest - 1);
//     merchant key = Amberstar wares index (EnterPlaceEvent.MerchantDataIndex = wares - 1);
//     place p = Places.Entries[p - 1]
//   - quest bit q = global variable q; keyword = dictionary index = text fragment index
//   - Picture80x80 1..22 = Ambermoon pictures (closest Amberstar picture), 22 + n = Amberstar picture n;
//     event picture index = Amberstar picture n - 1
//   - portraits: PortraitIndex is 1-based, the character creator slots get Amberstar portraits
//   - monster CombatGraphicIndex = Amberstar battle graphic (MON_GFX.AMB) index, the combat graphics use
//     the Amberstar combat palette indices (the combat background palettes of the labyrinths converter)
import { GraphicType } from '../../ambermoon/Ambermoon.Data.Common/IGraphicProvider.js';
import { Class } from '../../ambermoon/Ambermoon.Data.Common/Enumerations/Class.js';
import { Race } from '../../ambermoon/Ambermoon.Data.Common/Enumerations/Race.js';
import { Condition } from '../../ambermoon/Ambermoon.Data.Common/Enumerations/Condition.js';
import { Language } from '../../ambermoon/Ambermoon.Data.Common/Enumerations/Language.js';
import { convertItems } from './characters/items.js';
import {
	convertPortraits, convertPictures80x80, convertEventPictures, convertBattleFieldIcons, convertMonsterGraphic,
	loadAmberstarPictures, getPicture80x80, getEventPictureIndex, AmberstarPicture80x80Offset,
} from './characters/graphics.js';
import {
	convertPartyMember, convertNPC, convertMonster, convertMonsterGroup, loadAmberstarCharacter, AmberstarCharacterManager,
} from './characters/persons.js';
import { convertPlaces } from './characters/places.js';
import { buildInitialSavegame, createSavegameManager } from './characters/savegame.js';
import { getDictionary, getKeywordIndex, titleCase, messageToString } from './characters/texts.js';
import { ClassMapping, RaceHalfling, RaceHalfOrc, getSpellNameSources, amberstarItemTypeOf } from './characters/mappings.js';

export { createSavegameManager, getKeywordIndex, getPicture80x80, getEventPictureIndex, AmberstarPicture80x80Offset };

/** Fixes the few typos of the English Amberstar name lists. */
function fixName(name) {
	const fixes = { 'B-WIZRAD': 'B-WIZARD', 'PANIK': 'PANIC', 'LAVITATION': 'LEVITATION', 'PALADINE': 'PALADIN' };
	return titleCase(fixes[name] ?? name);
}

function createNameOverrides(ctx) {
	const program = ctx.source.program;
	const fragment = i => typeof i === 'number' ? ctx.source.fragment(i) : (i ?? '');
	const base = ctx.base.DataNameProvider;

	const classNames = new Map();
	ClassMapping.forEach((ambermoonClass, amberstarClass) => {
		if (ambermoonClass !== Class.Adventurer && ambermoonClass !== Class.Animal && ambermoonClass !== Class.Monster)
			classNames.set(ambermoonClass, fixName(fragment(program.classNames[amberstarClass])));
	});
	const raceNames = new Map([
		[Race.Human, 0], [Race.Elf, 1], [Race.Dwarf, 2], [Race.Gnome, 3], [RaceHalfling, 4], [Race.HalfElf, 5], [RaceHalfOrc, 6],
	].map(([race, i]) => [race, fixName(fragment(program.raceNames[i]))]));
	const spellNames = new Map();
	for (const [spell, [school, index]] of getSpellNameSources()) {
		const name = fragment(program.spellNames[(school - 1) * 30 + index]);
		if (name && name !== 'POTIONS?')
			spellNames.set(spell, fixName(name));
	}
	const conditionNames = new Map([
		[Condition.Lamed, 1], [Condition.Poisoned, 2], [Condition.Petrified, 3], [Condition.Diseased, 4], [Condition.Aging, 5],
		[Condition.DeadCorpse, 6], [Condition.DeadAshes, 7], [Condition.DeadDust, 8], [Condition.Irritated, 9],
		[Condition.Crazy, 10], [Condition.Sleep, 11], [Condition.Panic, 12], [Condition.Blind, 13],
	].map(([condition, i]) => [condition, fixName(fragment(program.conditionNames[i]))]));
	const languageNames = new Map([
		[Language.Human, 0], [Language.Elfish, 1], [Language.Dwarfish, 2], [Language.Gnomish, 3], [Language.Sylphic, 4],
		[Language.Felinic, 5], [Language.Animal, 6],
	].map(([language, i]) => [language, fixName(fragment(program.languageNames[i]))]));

	const valid = name => name != null && name.length !== 0;
	// Amberstar message 131: "APPARENTLY THEY DO NOT UNDERSTAND YOU!" (talking without a common language)
	const noCommonLanguage = messageToString(ctx.source, 131);
	// Amberstar message 140: "INSTEAD OF A REPLY YOU HEAR ONLY LOUD SNORING. ..." (talking to someone in bed)
	const asleep = messageToString(ctx.source, 140);
	// Title of the world maps: the Amberstar world map name ("LYRAMION") instead of "Lyramionic Isles"
	const worldName = ctx.result.maps.get(1)?.NameOverride;
	return {
		GetWorldName(world) { return valid(worldName) ? worldName : base.GetWorldName(world); },
		get PersonAsleepMessage() { return valid(asleep) ? asleep : base.PersonAsleepMessage; },
		get YouDontSpeakSameLanguage() { return valid(noCommonLanguage) ? noCommonLanguage : base.YouDontSpeakSameLanguage; },
		GetClassName(class_) {
			const n = classNames.get(class_) ?? base.GetClassName(class_);
			return valid(n) ? n : class_ === Class.Animal ? 'Animal' : 'Monster';
		},
		GetRaceName(race) {
			const n = raceNames.get(race) ?? base.GetRaceName(race);
			return valid(n) ? n : race === Race.Animal ? 'Animal' : 'Monster';
		},
		GetSpellName(spell) { const n = spellNames.get(spell); return valid(n) ? n : base.GetSpellName(spell); },
		GetConditionName(condition) { const n = conditionNames.get(condition); return valid(n) ? n : base.GetConditionName(condition); },
		GetLanguageName(language) { const n = languageNames.get(language); return valid(n) ? n : base.GetLanguageName(language); },
		GetItemTypeName(itemType) {
			const index = amberstarItemTypeOf(itemType);
			const n = index < 0 ? null : fixName(fragment(program.itemTypeNames[index]));
			return valid(n) ? n : base.GetItemTypeName(itemType);
		},
	};
}

export function convert(ctx) {
	const source = ctx.source;
	getDictionary(ctx);

	// Items
	const { itemManager, itemGraphics } = convertItems(ctx);
	ctx.result.itemManager = itemManager;
	ctx.graphics.set(GraphicType.Item, itemGraphics);

	// Characters (CHARDATA.AMB)
	const characters = new Map();
	for (const key of source.personKeys) {
		const data = source.reader('CHARDATA.AMB', key)?.data;
		if (!data || data.length < 0x47a)
			continue;
		try {
			characters.set(key, loadAmberstarCharacter(ctx, key, data));
		} catch (e) {
			console.warn(`Amberstar character ${key} could not be loaded`, e);
		}
	}
	const persons = new Map([...characters].filter(([, c]) => !c.isMonster).map(([key, c]) => [key, {
		portrait: c.conversationData?.portrait ?? null, gender: c.gender, race: c.race, isPartyMember: !!c.isPartyMember,
	}]));

	// Portraits
	const { graphics: portraits, portraitIndices } = convertPortraits(ctx, persons);
	ctx.graphics.set(GraphicType.Portrait, portraits);

	const partyMembers = new Map(), npcs = new Map(), monsters = new Map(), monsterGroups = new Map();
	ctx.amberstarPartyMemberTexts = new Map();
	const monsterGraphics = new Map();
	for (const [key, c] of characters) {
		if (c.isMonster) {
			if (!monsterGraphics.has(c.battleGraphicIndex))
				monsterGraphics.set(c.battleGraphicIndex, convertMonsterGraphic(ctx, c.battleGraphicIndex));
			monsters.set(key, convertMonster(ctx, key, c, itemManager, monsterGraphics.get(c.battleGraphicIndex)));
		} else if (c.isPartyMember) {
			const pm = convertPartyMember(ctx, key, c, itemManager, portraitIndices.get(key));
			partyMembers.set(key, pm);
			ctx.amberstarPartyMemberTexts.set(key, pm.Texts);
		} else {
			npcs.set(key, convertNPC(ctx, key, c, portraitIndices.get(key)));
		}
	}
	for (const key of source.keys('MON_DATA.AMB')) {
		const rows = source.loadMonsterGroup(key);
		if (rows)
			monsterGroups.set(key, convertMonsterGroup(rows, index => monsters.get(index) ?? null));
	}
	ctx.result.characterManager = new AmberstarCharacterManager(partyMembers, npcs, monsters, monsterGroups);

	// Pictures and icons
	const pictures = loadAmberstarPictures(ctx);
	ctx.graphics.set(GraphicType.Pics80x80, convertPictures80x80(ctx, pictures));
	const eventPictures = convertEventPictures(ctx, pictures);
	ctx.graphics.set(GraphicType.EventPictures, eventPictures.graphics);
	ctx.result.eventPicturePalettes = eventPictures.palettes;
	ctx.graphics.set(GraphicType.BattleFieldIcons, convertBattleFieldIcons(ctx));

	// Places, names, savegame
	ctx.result.places = convertPlaces(ctx);
	ctx.result.dataNameProvider = createNameOverrides(ctx);
	ctx.amberstarInitialSavegame = buildInitialSavegame(ctx, itemManager, portraitIndices);
	ctx.result.savegameManager = storage => createSavegameManager(ctx, storage);
}
