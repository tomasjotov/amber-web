// Port of Ambermoon.Core/Game/CustomTexts.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { GameLanguage } from '../../Ambermoon.Data.Common/IGameData.js';
import { getValue } from '../../../runtime.js';

const Index = Object.freeze({
	ReallyStartNewGame: 0,
	FailedToLoadSavegame: 1,
	FailedToLoadInitialSavegame: 2,
	FailedToLoadSavegameUseInitial: 3,
	StartNewGameOrQuit: 4,
	RuneTableUsage: 5,
	LoadCrashedGame: 6,
	FailedToRemoveCrashSavegame: 7,
	GameSaved: 8,
	GameLoaded: 9,
	InitialGameLoaded: 10,
	MobileTargetOutOfReach: 11,
});

// Additional texts only used in the remake
export class CustomTexts {
	static Index = Index;

	// Created lazily (no imported values are used at module evaluation time)
	static entries_ = null;
	static get entries() {
		return CustomTexts.entries_ ??= new Map([
		[GameLanguage.German, new Map([
			[Index.ReallyStartNewGame, 'Wollen Sie wirklich ein neues Spiel starten?'],
			[Index.FailedToLoadSavegame, 'Fehler beim Laden des Spielstands.'],
			[Index.FailedToLoadInitialSavegame, 'Fehler beim Laden des Start-Spielstands.'],
			[Index.FailedToLoadSavegameUseInitial, 'Fehler beim Laden des Spielstands. Ein neues Spiel wurde stattdessen gestartet.'],
			[Index.StartNewGameOrQuit, 'Möchten Sie ein neues Spiel starten oder das Spiel verlassen?'],
			[Index.RuneTableUsage, 'Solange Sie das Runenalphabet bei sich tragen, werden Runen nun automatisch als Text angezeigt.'],
			[Index.LoadCrashedGame, 'Ein Backup-Spielstand eines kürzlichen Absturzes wurde gefunden. Wollen Sie diesen laden?'],
			[Index.FailedToRemoveCrashSavegame, 'Der Backup-Spielstand konnte nicht automatisch gelöscht werden. Bitte löschen Sie ihn manuell. Er wird im Unterordner \'Save.99\' abgelegt.'],
			[Index.GameSaved, 'Gespeichert als ~INK 22~\'{0}\'~INK 31~.'],
			[Index.GameLoaded, '~INK 22~Spielstand {0}~INK 31~ wurde geladen.'],
			[Index.InitialGameLoaded, '~INK 22~Initialer Spielstand~INK 31~ wurde geladen.'],
			[Index.MobileTargetOutOfReach, 'Außer Reichweite'],
		])],
		[GameLanguage.English, new Map([
			[Index.ReallyStartNewGame, 'Do you really want to start a new game?'],
			[Index.FailedToLoadSavegame, 'Failed to load savegame.'],
			[Index.FailedToLoadInitialSavegame, 'Failed to load initial savegame.'],
			[Index.FailedToLoadSavegameUseInitial, 'Failed to load savegame. Loaded initial savegame instead.'],
			[Index.StartNewGameOrQuit, 'Do you want to start a new game or quit the game?'],
			[Index.RuneTableUsage, 'As long as you have the rune table in your inventory, all runes will automatically be displayed as text now.'],
			[Index.LoadCrashedGame, 'A crash backup savegame was detected. Do you want to load it?'],
			[Index.FailedToRemoveCrashSavegame, 'The crash backup savegame could not be deleted automatically. Please do so yourself. It is stored in sub-folder \'Save.99\'.'],
			[Index.GameSaved, 'Saved as ~INK 22~\'{0}\'~INK 31~.'],
			[Index.GameLoaded, '~INK 22~Savegame {0}~INK 31~ was loaded.'],
			[Index.InitialGameLoaded, '~INK 22~Initial savegame~INK 31~ was loaded.'],
			[Index.MobileTargetOutOfReach, 'Out of reach'],
		])],
		[GameLanguage.French, new Map([
			[Index.ReallyStartNewGame, 'Voulez-vous vraiment commencer un nouveau jeu ?'],
			[Index.FailedToLoadSavegame, 'Échec du chargement de la sauvegarde.'],
			[Index.FailedToLoadInitialSavegame, 'Échec du chargement de la sauvegarde initiale.'],
			[Index.FailedToLoadSavegameUseInitial, 'Échec du chargement de la sauvegarde. Chargement de la sauvegarde initiale à la place.'],
			[Index.StartNewGameOrQuit, 'Voulez-vous commencer une nouvelle partie ou quitter le jeu ?'],
			[Index.RuneTableUsage, 'Tant que vous avez la table des runes dans votre inventaire, toutes les runes s\'affichent automatiquement sous forme de texte.'],
			[Index.LoadCrashedGame, 'Une sauvegarde avant le crash a été détectée. Voulez-vous la charger ?'],
			[Index.FailedToRemoveCrashSavegame, 'La sauvegarde du crash n\'a pas pu être supprimée automatiquement. Veuillez le faire vous-même. Elle est stockée dans le sous-dossier \'Save.99\'.'],
			[Index.GameSaved, 'Sauvegardé en tant que ~INK 22~\'{0}\'~INK 31~.'],
			[Index.GameLoaded, 'La ~INK 22~sauvegarde {0}~INK 31~ a été chargée.'],
			[Index.InitialGameLoaded, 'La ~INK 22~sauvegarde initiale~INK 31~ a été chargée.'],
			[Index.MobileTargetOutOfReach, 'Hors de portée'],
		])],
		[GameLanguage.Polish, new Map([
			[Index.ReallyStartNewGame, 'Czy naprawdę chcesz rozpocząć nową grę?'],
			[Index.FailedToLoadSavegame, 'Nie udało się wczytać gry.'],
			[Index.FailedToLoadInitialSavegame, 'Nie udało się wczytać startowego stanu gry.'],
			[Index.FailedToLoadSavegameUseInitial, 'Nie udało się wczytać gry. Zamiast tego załadowano startowy zapis gry.'],
			[Index.StartNewGameOrQuit, 'Chcesz rozpocząć nową grę czy wyjść z gry?'],
			[Index.RuneTableUsage, 'Tak długo, jak masz tabelę run w ekwipunku, wszystkie runy będą automatycznie wyświetlane jako tekst.'],
			[Index.LoadCrashedGame, 'Wykryto kopię awaryjną zapisu gry. Czy chcesz ją załadować?'],
			[Index.FailedToRemoveCrashSavegame, 'Awaryjna kopia zapisu gry nie może zostać usunięta automatycznie. Należy to zrobić samodzielnie. Jest ona przechowywana w podkatalogu \'Save.99\'.'],
			[Index.GameSaved, 'Zapisano jako ~INK 22~\'{0}\'~INK 31~.'],
			[Index.GameLoaded, '~INK 22~Zapis {0}~INK 31~ został wczytany.'],
			[Index.InitialGameLoaded, '~INK 22~Zapis startowy~INK 31~ został wczytany.'],
			[Index.MobileTargetOutOfReach, 'Poza zasięgiem'],
		])],
		[GameLanguage.Czech, new Map([
			[Index.ReallyStartNewGame, 'Opravdu chcete začít novou hru?'],
			[Index.FailedToLoadSavegame, 'Nepodařilo se načíst uloženou hru.'],
			[Index.FailedToLoadInitialSavegame, 'Nepodařilo se načíst úvodní uloženou hru.'],
			[Index.FailedToLoadSavegameUseInitial, 'Nepodařilo se načíst uloženou hru. Místo toho se načetla úvodní uložená hra.'],
			[Index.StartNewGameOrQuit, 'Chcete začít novou hru nebo hru ukončit?'],
			[Index.RuneTableUsage, 'Pokud máte v inventáři tabulku run, všechny runy se nyní automaticky zobrazují jako text.'],
			[Index.LoadCrashedGame, 'Byla nalezena záloha před pádem hry. Chcete ji načíst?'],
			[Index.FailedToRemoveCrashSavegame, 'Zálohu před pádem hry nebylo možné automaticky odstranit. Udělejte to prosím sami. Je uložena v podsložce \'Save.99\'.'],
			[Index.GameSaved, 'Uloženo jako ~INK 22~\'{0}\'~INK 31~.'],
			[Index.GameLoaded, '~INK 22~Savegame {0}~INK 31~ načteno.'],
			[Index.InitialGameLoaded, '~INK 22~Počáteční uložení~INK 31~ načteno.'],
			[Index.MobileTargetOutOfReach, 'Mimo dosah'],
		])],
		]);
	}

	static GetText(language, index) { return getValue(getValue(CustomTexts.entries, language), index); }
}

export { Index as CustomTexts_Index };
