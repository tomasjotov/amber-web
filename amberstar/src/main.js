// Entry point: loads the original data files, sets up the engine and runs the game inside Phaser.
import { AssetProvider, DATA_FILES } from './data/assets.js';
import { setupLayers } from './engine/layerSetup.js';
import { Game } from './game/game.js';
import { EventHandler } from './game/events.js';
import { ScreenType } from './game/screens/screen.js';
import { Map2DScreen } from './game/screens/map2DScreen.js';
import { Map3DScreen } from './game/screens/map3DScreen.js';
import { TextBoxScreen, PictureTextScreen, ConfirmationScreen } from './game/screens/textScreens.js';
import { convertKey, getModifiers, MouseButtons, Key } from './game/keys.js';
import { loadStoredFiles, storeFiles, clearStoredFiles } from './storage.js';
import { registerExtraScreens } from './game/screens/registry.js';
import { getSlots, writeSlot, createSaveDataFromOriginal } from './game/saveSystem.js';
import { Music } from './audio/music.js';

const NEW_GAME_FILES = ['PARTYDAT.SAV', 'CHARDATA.AMB', 'AUTOMAP.AMB'];
const statusEl = document.getElementById('status');
const startEl = document.getElementById('start');
const dirInput = document.getElementById('dir-input');

function setStatus(text) {
	statusEl.textContent = text;
}

async function tryFetchFiles(base) {
	const files = new Map();
	for (const name of DATA_FILES) {
		try {
			const res = await fetch(`${base}/${name}`);
			if (res.ok)
				files.set(name, new Uint8Array(await res.arrayBuffer()));
		} catch {
			// ignore
		}
	}
	if (!files.has('AMBERDEV.UDO'))
		return null;
	for (const name of NEW_GAME_FILES) {
		try {
			const res = await fetch(`${base}/_new/${name}`);
			if (res.ok)
				files.set('_NEW/' + name, new Uint8Array(await res.arrayBuffer()));
		} catch {
			// ignore
		}
	}
	return files;
}

async function filesFromInput(fileList) {
	const files = new Map();
	for (const file of fileList) {
		// Use only files directly in the selected folder (ignore _old/_new etc.)
		const parts = (file.webkitRelativePath || file.name).split('/');
		const name = file.name.toUpperCase();
		if (parts.length === 3 && parts[1].toLowerCase() === '_new' && NEW_GAME_FILES.includes(name)) {
			// fresh files for a new game
			files.set('_NEW/' + name, new Uint8Array(await file.arrayBuffer()));
			continue;
		}
		if (parts.length > 2)
			continue;
		if (DATA_FILES.includes(name))
			files.set(name, new Uint8Array(await file.arrayBuffer()));
	}
	return files;
}

async function boot() {
	setStatus('Looking for the game data…');
	let files = await tryFetchFiles('../data/Amberstar') ?? await tryFetchFiles('data/Amberfiles');
	if (!files)
		files = await loadStoredFiles();
	if (!files || !files.has('AMBERDEV.UDO')) {
		setStatus('Choose the Amberfiles folder of the original Amiga version of Amberstar (contains AMBERDEV.UDO, MAP_DATA.AMB, …).');
		startEl.hidden = false;
		dirInput.onchange = async () => {
			const selected = await filesFromInput(dirInput.files);
			if (!selected.has('AMBERDEV.UDO')) {
				setStatus('AMBERDEV.UDO is missing in the selected folder. Please choose the Amberfiles folder.');
				return;
			}
			await storeFiles(selected);
			startEl.hidden = true;
			start(selected);
		};
		return;
	}
	start(files);
}

function start(files) {
	setStatus('Loading data…');
	let assets;
	try {
		assets = new AssetProvider(files);
	} catch (e) {
		console.error(e);
		setStatus('The data could not be loaded: ' + e.message);
		return;
	}
	const setup = setupLayers(assets);
	// The game of the original data files becomes the first save slot ("TOM")
	try {
		if (!getSlots().some(Boolean))
			writeSlot(1, createSaveDataFromOriginal(assets, 'TOM', assets.loadInitialSavegame(), assets.getPartyMemberCopies()));
	} catch (e) {
		console.warn('Could not create the initial save slot', e);
	}
	setStatus('');
	document.getElementById('loader').hidden = true;
	runPhaser(assets, setup);
}

function runPhaser(assets, setup) {
	const pressedKeys = new Set();
	let game = null;

	const screenFactories = {
		[ScreenType.Map2D]: () => new Map2DScreen(),
		[ScreenType.Map3D]: () => new Map3DScreen(),
		[ScreenType.TextBox]: () => new TextBoxScreen(),
		[ScreenType.PictureText]: () => new PictureTextScreen(),
		[ScreenType.Confirmation]: () => new ConfirmationScreen(),
	};
	const uiClasses = {};
	const sampleData = assets.files?.get?.('SAMPLEDA.IMG');
	const music = sampleData ? new Music(assets.program.songs, sampleData) : null;
	// Browsers only allow audio after a user gesture
	const unlockAudio = () => music?.unlock();
	window.addEventListener('pointerdown', unlockAudio, { capture: true });
	window.addEventListener('keydown', unlockAudio, { capture: true });
	registerExtraScreens(screenFactories, uiClasses);

	class MainScene extends Phaser.Scene {
		constructor() {
			super('main');
		}

		create() {
			this.screenTexture = this.textures.createCanvas('screen', 320, 200);
			this.add.image(0, 0, 'screen').setOrigin(0, 0);
			this.imageData = this.screenTexture.context.createImageData(320, 200);

			game = new Game(setup, assets, {
				screenFactories,
				uiClasses,
				eventHandlerFactory: g => new EventHandler(g),
				startInMenu: true,
				music,
				pressedKeyProvider: () => pressedKeys,
				onQuit: () => { },
			});
			window.amberstar = game; // for debugging in the browser console
			// Debug helper: sends the current frame (2x) to the dev server (tools/serve.mjs)
			window.shot = async (name = 'shot') => {
				const c = document.createElement('canvas');
				c.width = 640;
				c.height = 400;
				const ctx = c.getContext('2d');
				ctx.imageSmoothingEnabled = false;
				setup.renderer.render();
				const src = document.createElement('canvas');
				src.width = 320;
				src.height = 200;
				src.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(setup.renderer.frame), 320, 200), 0, 0);
				ctx.drawImage(src, 0, 0, 640, 400);
				await fetch(`/__shot?name=${name}`, { method: 'POST', body: c.toDataURL('image/png') });
				return name;
			};

			this.input.mouse?.disableContextMenu();
			const buttonsOf = pointer => (pointer.leftButtonDown() ? MouseButtons.Left : 0) | (pointer.rightButtonDown() ? MouseButtons.Right : 0);
			const pos = pointer => ({ x: Math.floor(pointer.x), y: Math.floor(pointer.y) });
			this.input.on('pointerdown', pointer => {
				const button = pointer.button === 2 ? MouseButtons.Right : pointer.button === 1 ? MouseButtons.Middle : MouseButtons.Left;
				game.mouseMove(pos(pointer), buttonsOf(pointer));
				game.mouseDown(pos(pointer), button, 0);
			});
			this.input.on('pointerup', pointer => {
				const button = pointer.button === 2 ? MouseButtons.Right : pointer.button === 1 ? MouseButtons.Middle : MouseButtons.Left;
				game.mouseUp(pos(pointer), button, 0);
			});
			this.input.on('pointermove', pointer => game.mouseMove(pos(pointer), buttonsOf(pointer)));
			this.input.on('wheel', (pointer, objs, dx, dy) => game.mouseWheel(pos(pointer), dx, -dy / 100, buttonsOf(pointer)));
			this.input.on('gameout', () => { game.cursor.visible = false; });
			this.input.on('gameover', () => { game.cursor.visible = true; });

			window.addEventListener('keydown', e => {
				const key = convertKey(e);
				if (key !== Key.Invalid || e.key.length === 1)
					e.preventDefault();
				const wasDown = pressedKeys.has(key);
				if (key !== Key.Invalid)
					pressedKeys.add(key);
				game.pressedKeys = null;
				if (!wasDown || key === Key.Backspace || key === Key.Delete)
					game.keyDown(key, getModifiers(e));
				if (e.key.length === 1 && !e.ctrlKey && !e.altKey)
					game.keyChar(e.key, getModifiers(e) & ~1);
			});
			window.addEventListener('keyup', e => {
				const key = convertKey(e);
				pressedKeys.delete(key);
				game.pressedKeys = null;
				game.keyUp(key, getModifiers(e));
			});
			window.addEventListener('blur', () => pressedKeys.clear());

			// Keep the game logic running if animation frames are throttled (e.g. embedded or hidden views).
			setInterval(() => {
				if (performance.now() - (this.lastTime ?? 0) > 200)
					this.update();
			}, 100);
		}

		update() {
			if (!game)
				return;
			// Use real time instead of Phaser's smoothed delta
			const now = performance.now();
			const elapsed = this.lastTime ? Math.min(now - this.lastTime, 500) : 16;
			this.lastTime = now;
			game.update(elapsed / 1000);
			setup.renderer.render();
			this.imageData.data.set(setup.renderer.frame);
			this.screenTexture.context.putImageData(this.imageData, 0, 0);
			this.screenTexture.refresh();
		}
	}

	new Phaser.Game({
		type: Phaser.AUTO,
		parent: 'game',
		width: 320,
		height: 200,
		pixelArt: true,
		backgroundColor: '#000000',
		scale: {
			mode: Phaser.Scale.FIT,
			autoCenter: Phaser.Scale.CENTER_BOTH,
		},
		scene: MainScene,
		banner: false,
	});
}

document.getElementById('reset-data').onclick = async () => {
	await clearStoredFiles();
	location.reload();
};

boot();
