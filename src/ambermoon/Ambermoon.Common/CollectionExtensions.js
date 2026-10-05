// Port of Ambermoon.Common/CollectionExtensions.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)
// 2D arrays (T[,]) are represented as arrays of arrays: array[i][j] == C# array[i, j],
// GetLength(0) == array.length, GetLength(1) == array[0].length.

function defaultCompare(a, b) {
	if (a != null && typeof a.CompareTo === 'function')
		return a.CompareTo(b);
	if (a == null)
		return b == null ? 0 : -1;
	if (b == null)
		return 1;
	return a < b ? -1 : a > b ? 1 : 0;
}

/** List<T>.BinarySearch: index if found, otherwise bitwise complement of the insertion index */
function binarySearch(list, value, compare) {
	let lo = 0;
	let hi = list.length - 1;

	while (lo <= hi) {
		const i = lo + ((hi - lo) >> 1);
		const order = compare(list[i], value);

		if (order === 0)
			return i;
		if (order < 0)
			lo = i + 1;
		else
			hi = i - 1;
	}

	return ~lo;
}

function getLength(array, dimension) {
	if (dimension === 0)
		return array.length;
	return array.length === 0 ? 0 : array[0].length;
}

export class CollectionExtensions {
	/** dictionary is a Map (or ValueMap) of arrays */
	static SafeAdd(dictionary, key, value) {
		if (!dictionary.has(key))
			dictionary.set(key, [value]);
		else
			dictionary.get(key).push(value);
	}

	static ToList(array) {
		const width = getLength(array, 0);
		const height = getLength(array, 1);

		const list = [];

		for (let y = 0; y < height; ++y) {
			for (let x = 0; x < width; ++x)
				list.push(array[x][y]);
		}

		return list;
	}

	/** AddSorted(list, value) or AddSorted(list, value, comparer) (IComparer with Compare or a compare function) */
	static AddSorted(list, value, comparer = null) {
		const compare = comparer == null
			? defaultCompare
			: typeof comparer === 'function'
				? comparer
				: (a, b) => comparer.Compare(a, b);
		const x = binarySearch(list, value, compare);
		list.splice((x >= 0) ? x : ~x, 0, value);
	}

	/**
	 * ForEach(array, (item, x, y) => ...) or ForEach(array, (item, index) => ...).
	 * The overload is chosen by the arity of the action (3 parameters -> x/y variant).
	 */
	static ForEach(array, action) {
		const height = getLength(array, 0);
		const width = getLength(array, 1);

		if (action.length >= 3) {
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					action(array[y][x], x, y);
				}
			}
		} else {
			let index = 0;

			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					action(array[y][x], index++);
				}
			}
		}
	}
}
