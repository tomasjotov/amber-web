// Port of Ambermoon.Data.Legacy/Files.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

// Adds the 5 savegame files for the savegame folders Save.00 to Save.10 (disk J).
function addSaveFolders(entries) {
	for (let i = 0; i <= 10; ++i) {
		const folder = `Save.${String(i).padStart(2, '0')}`;
		entries.push([`${folder}/Automap.amb`, 'J']);
		entries.push([`${folder}/Chest_data.amb`, 'J']);
		entries.push([`${folder}/Merchant_data.amb`, 'J']);
		entries.push([`${folder}/Party_char.amb`, 'J']);
		entries.push([`${folder}/Party_data.sav`, 'J']);
	}
	return entries;
}

export class Files {
	static RawFiles = [
		'AM2_BLIT',
		'AM2_CPU',
		'Ambermoon_extro',
		'Ambermoon_intro',
		'Extro_music',
		'Intro_music',
		'Saves',
		'Party_data.sav',
		'Fantasy_intro',
		'Keymap'
	];

	// Key: Filename, Value: Disk letter
	static AmigaSaveFiles = new Map(addSaveFolders([
		// Disk A
		['Initial/Automap.amb', 'A'],
		['Initial/Chest_data.amb', 'A'],
		['Initial/Merchant_data.amb', 'A'],
		['Initial/Party_char.amb', 'A'],
		['Initial/Party_data.sav', 'A'],
		// Disk J
		['Automap.amb', 'J'],
		['Chest_data.amb', 'J'],
		['Merchant_data.amb', 'J'],
		['Party_char.amb', 'J'],
		['Party_data.sav', 'J'],
		['Saves', 'J'],
		// Save.00/... to Save.10/... are added by addSaveFolders
	]));

	static New114Files = new Map([
		['Button_graphics', 'A'],
		['Objects.amb', 'A'],
		['Text.amb', 'A'],
		['Dict.amb', 'G'],
		['Monster_char.amb', 'H']
	]);

	static Renamed114Files = new Map([
		['Monster_char_data.amb', 'Monster_char.amb']
	]);

	static Removed114Files = [
		'Dictionary.english',
		'Dictionary.german',
		'Monster_char_data.amb',
		'AM2_BLIT'
	];

	// Key: Filename, Value: Disk letter
	static AmigaFiles = new Map(addSaveFolders([
		// Disk A
		['AM2_BLIT', 'A'],
		['AM2_CPU', 'A'],
		['Keymap', 'A'],
		['Initial/Automap.amb', 'A'],
		['Initial/Chest_data.amb', 'A'],
		['Initial/Merchant_data.amb', 'A'],
		['Initial/Party_char.amb', 'A'],
		['Initial/Party_data.sav', 'A'],
		// Disk B
		['Ambermoon_intro', 'B'],
		['Fantasy_intro', 'B'],
		['Intro_music', 'B'],
		// Disk C
		['1Icon_gfx.amb', 'C'],
		['1Map_data.amb', 'C'],
		['1Map_texts.amb', 'C'],
		// Disk D
		['2Icon_gfx.amb', 'D'],
		['2Lab_data.amb', 'D'],
		['2Map_data.amb', 'D'],
		['2Map_texts.amb', 'D'],
		['2Object3D.amb', 'D'],
		// Disk E
		['2Overlay3D.amb', 'E'],
		['2Wall3D.amb', 'E'],
		// Disk F
		['3Icon_gfx.amb', 'F'],
		['3Lab_data.amb', 'F'],
		['3Map_data.amb', 'F'],
		['3Map_texts.amb', 'F'],
		['3Object3D.amb', 'F'],
		['3Overlay3D.amb', 'F'],
		['3Wall3D.amb', 'F'],
		// Disk G
		['Automap_graphics', 'G'],
		['Combat_graphics', 'G'],
		['Dictionary.english', 'G'],
		['Dictionary.german', 'G'],
		['Event_pix.amb', 'G'],
		['Floors.amb', 'G'],
		['Icon_data.amb', 'G'],
		['Lab_background.amb', 'G'],
		['Layouts.amb', 'G'],
		['NPC_char.amb', 'G'],
		['NPC_gfx.amb', 'G'],
		['NPC_texts.amb', 'G'],
		['Object_icons', 'G'],
		['Object_texts.amb', 'G'],
		['Palettes.amb', 'G'],
		['Party_gfx.amb', 'G'],
		['Party_texts.amb', 'G'],
		['Pics_80x80.amb', 'G'],
		['Place_data', 'G'],
		['Portraits.amb', 'G'],
		['Riddlemouth_graphics', 'G'],
		['Stationary', 'G'],
		['Travel_gfx.amb', 'G'],
		// Disk H
		['Combat_background.amb', 'H'],
		['Monster_char_data.amb', 'H'],
		['Monster_gfx.amb', 'H'],
		['Monster_groups.amb', 'H'],
		// Disk I
		['Ambermoon_extro', 'I'],
		['Extro_music', 'I'],
		['Music.amb', 'I'],
		// Disk J
		['Automap.amb', 'J'],
		['Chest_data.amb', 'J'],
		['Merchant_data.amb', 'J'],
		['Party_char.amb', 'J'],
		['Party_data.sav', 'J'],
		['Saves', 'J'],
		// Save.00/... to Save.10/... are added by addSaveFolders
	]));
}
