// Port of Ambermoon.Common/FileNameComparer.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

function getFileName(path) {
	const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
	return index < 0 ? path : path.substring(index + 1);
}

/** Path.GetExtension (including the dot, empty if none) */
function getExtension(path) {
	const name = getFileName(path);
	const index = name.lastIndexOf('.');
	return index < 0 || index === name.length - 1 ? '' : name.substring(index);
}

/** Path.GetFileNameWithoutExtension */
function getFileNameWithoutExtension(path) {
	const name = getFileName(path);
	const index = name.lastIndexOf('.');
	return index < 0 ? name : name.substring(0, index);
}

/** string.Compare (culture-sensitive) */
function compareStrings(a, b) {
	return Math.sign(a.localeCompare(b, 'en-US'));
}

/** IComparer<string>; use `list.sort((a, b) => comparer.Compare(a, b))` */
export class FileNameComparer {
	Compare(x, y) {
		const xExt = getExtension(x).toLowerCase();
		const yExt = getExtension(y).toLowerCase();
		x = getFileNameWithoutExtension(x).toLowerCase();
		y = getFileNameWithoutExtension(y).toLowerCase();

		if (x.startsWith(y))
			return 1;
		if (y.startsWith(x))
			return -1;
		if (x === y)
			return compareStrings(xExt, yExt);

		return compareStrings(x, y);
	}
}
