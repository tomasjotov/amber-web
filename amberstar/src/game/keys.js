// Key and mouse definitions (port of Key.cs / MouseButtons.cs) plus browser mapping.

export const Key = {
	Invalid: 0, Up: 1, Right: 2, Down: 3, Left: 4, Enter: 5, Backspace: 6, Delete: 7, Escape: 8, Space: 9,
	Home: 10, End: 11, Keypad1: 12, Keypad2: 13, Keypad3: 14, Keypad4: 15, Keypad5: 16, Keypad6: 17,
	Keypad7: 18, Keypad8: 19, Keypad9: 20, F1: 21, F2: 22, F3: 23, F4: 24, F5: 25, F6: 26, F7: 27, F8: 28,
	F9: 29, F10: 30, F11: 31, F12: 32, PageUp: 33, PageDown: 34, Number0: 100, LetterA: 110,
};

export const KeyModifiers = { None: 0, Shift: 1, Control: 2, Alt: 4 };
export const MouseButtons = { None: 0, Left: 1, Right: 2, Middle: 4 };

/** Converts a browser KeyboardEvent to a Key value */
export function convertKey(e) {
	switch (e.code) {
		case 'ArrowUp': return Key.Up;
		case 'ArrowRight': return Key.Right;
		case 'ArrowDown': return Key.Down;
		case 'ArrowLeft': return Key.Left;
		case 'Enter': case 'NumpadEnter': return Key.Enter;
		case 'Backspace': return Key.Backspace;
		case 'Delete': return Key.Delete;
		case 'Escape': return Key.Escape;
		case 'Space': return Key.Space;
		case 'Home': return Key.Home;
		case 'End': return Key.End;
		case 'PageUp': return Key.PageUp;
		case 'PageDown': return Key.PageDown;
	}
	let m = /^Numpad([1-9])$/.exec(e.code);
	if (m)
		return Key.Keypad1 + Number(m[1]) - 1;
	m = /^F([0-9]{1,2})$/.exec(e.code);
	if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12)
		return Key.F1 + Number(m[1]) - 1;
	m = /^Digit([0-9])$/.exec(e.code);
	if (m)
		return Key.Number0 + Number(m[1]);
	m = /^Key([A-Z])$/.exec(e.code);
	if (m)
		return Key.LetterA + m[1].charCodeAt(0) - 65;
	return Key.Invalid;
}

export function getModifiers(e) {
	return (e.shiftKey ? KeyModifiers.Shift : 0) | (e.ctrlKey ? KeyModifiers.Control : 0) | (e.altKey ? KeyModifiers.Alt : 0);
}

export function keyByChar(ch) {
	if (ch >= '0' && ch <= '9') return Key.Number0 + ch.charCodeAt(0) - 48;
	if (ch >= 'A' && ch <= 'Z') return Key.LetterA + ch.charCodeAt(0) - 65;
	if (ch >= 'a' && ch <= 'z') return Key.LetterA + ch.charCodeAt(0) - 97;
	if (ch === '\n') return Key.Enter;
	if (ch === ' ') return Key.Space;
	return Key.Invalid;
}
