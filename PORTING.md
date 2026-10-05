# Porting Ambermoon.net (C#) to JavaScript

The game logic of `../Ambermoon.net-master` (GPL-3.0, Robert Schneckenhaus "Pyrdacor") is translated
**file by file** into ES modules. Several people work in parallel, each on different files, and nobody
sees the other translations while working. Therefore the rules below must be followed exactly, so that
cross-file references fit together without coordination.

## Files and imports

- C# file `Ambermoon.net-master/<Project>/<path>/<Name>.cs` becomes `amber-web/src/ambermoon/<Project>/<path>/<Name>.js`.
  Example: `Ambermoon.Core/Game/Battle.cs` -> `src/ambermoon/Ambermoon.Core/Game/Battle.js`.
- Every type (class, enum, struct, interface with static members, delegate is skipped) declared in a C# file
  is **exported with its C# name** from the corresponding JS file. Nested types are attached as static
  properties of the outer class (`Map.Tile`, `Battle.Action`) AND exported as `Outer_Inner` (`export { Tile as Map_Tile }`)
  only if needed for import; references use `Map.Tile`.
- To find where a type lives, grep the C# sources (`grep -rn "class Foo\b\|enum Foo\b\|struct Foo\b" ../Ambermoon.net-master --include=*.cs`)
  and import from the mirrored JS path with a relative import: `import { Foo } from '../Data/Foo.js';`
- Pure interfaces (`IFoo` without code) are not ported; do not import them. If an interface contains
  nested types, enums or static/default members, port those (file `IFoo.js` exporting them).
- Runtime helpers: `import { ... } from '<relative>/runtime.js'` (file `amber-web/src/runtime.js`). Read it first.
- Only the C# projects `Ambermoon.Common`, `Ambermoon.Data.Common`, `Ambermoon.Data.Legacy`, `Ambermoon.Core`,
  `Ambermoon.Game` (and selected files of `Ambermoon.net`/`Ambermoon.Frontend`) are ported. `Amber.Common` is not used.
- Circular imports are fine as long as nothing is used at module evaluation time; avoid top-level code that
  calls into other modules except for `extends` (a base class must not import its subclasses at top level use).

## Names

- **Keep every C# member name exactly** (PascalCase public members, camelCase private fields, same casing).
  `game.CurrentPartyMember`, `map.Tiles`, `this.layout`, `Util.Limit(...)`. Never rename.
- Auto properties (`public int X { get; set; }`, also with `private set`/`init`) become plain fields
  initialized in the constructor (or class field syntax). Properties with logic become `get X()` / `set X(v)`.
- Expression-bodied properties `public int X => ...;` become getters.
- Private methods stay normal methods (no `#private` - partial classes need access).
- If a property and a method/field collide in JS (same name), keep the property and append `_` to the field.

## Overloads

- Methods/constructors overloaded in C# become **one** JS function that dispatches on
  `arguments.length` and runtime types (`typeof x === 'number'`, `x instanceof Position`, `Array.isArray`, ...).
  Never invent different names for overloads. Callers just call the method with the C# arguments.
- Generic methods: drop the type parameters. If a generic type argument is needed at runtime
  (e.g. `EnumHelper.GetValues<Class>()`), pass the type as first argument (`EnumHelper.GetValues(Class)`).

## out / ref parameters

- A method with `out`/`ref` parameters returns an **array**: `[returnValue, out1, out2, ...]` in parameter order
  (ref parameters return their new value in the same way). For `void` methods the array has only the outs:
  `[out1, ...]`. Callers destructure: `const [found, value] = dict.TryGetValue(key)`.
  `out var _` discards are simply ignored.

## Types

- `int/uint/short/ushort/byte/sbyte/long/float/double/decimal` -> `number`. `long` beyond 2^53 does not occur.
- **Integer division**: `a / b` where both are integral in C# -> `Math.trunc(a / b)` (or `idiv(a, b)` when b may be 0
  and should throw). Integer casts: `(byte)x` -> `toByte(x)` (`x & 0xff`), `(sbyte)` -> `toSByte`, `(ushort)` -> `toUShort`,
  `(short)` -> `toShort`, `(uint)` -> `toUInt` (only if wrap-around matters), `(int)floatValue` -> `Math.trunc(v)`.
  Keep wrap-around semantics wherever the C# code relies on them (subtracting from uint, byte counters...).
  `uint` subtraction that could go below 0 must be handled exactly as C# would (wrap) only when the code relies on it;
  usually the code guards it.
- `char` -> one-character string. `(char)n` -> `String.fromCharCode(n)`, `(int)ch` -> `ch.charCodeAt(0)`.
  char arithmetic must go through char codes.
- `bool` -> boolean. `string` -> string (immutable as in C#). `StringBuilder` -> array of parts or string concatenation.
- `float` vs `double`: just numbers. `Math.Round` -> `round()` from runtime (banker's rounding!) unless a
  `MidpointRounding.AwayFromZero` is given (then `Math.sign(x) * Math.round(Math.abs(x))`).
  `Math.Floor/Ceiling/Abs/Min/Max/Sqrt/Pow/Sin/Cos/Atan2/PI` -> `Math.*`.
- `byte[]` stays `Uint8Array` when it is binary data (file data, graphics); `new byte[n]` -> `new Uint8Array(n)`.
  Other arrays -> JS arrays (`newArray(n, fill)` from runtime gives `null`/0 filled arrays like C#).
- Nullable value types (`int?`) -> `number | null`. `x.HasValue` -> `x != null`, `x.Value` -> `x`, `x ?? y` stays.
- `object`/`dynamic` -> any.
- **Enums** -> frozen objects with the explicit numeric values of the C# enum (compute implicit ones!):
  `export const Class = Object.freeze({ Warrior: 0, Paladin: 1, ... });`. `[Flags]` enums the same.
  `value.ToString()`/`Enum.GetName` -> `enumName(Class, value)`, `Enum.GetValues` -> `enumValues(Class)`,
  `HasFlag` -> `hasFlag(v, f)` or `(v & f) === f`. Casting between enums and ints is a no-op.
  Enum extension methods (static classes with `this Enum e`) become exported functions taking the value
  as the first parameter, keeping the method name: `export function ToSpellSchool(spell) {...}` in the same
  static class object (see "Extension methods").
- **Structs** -> classes. Value semantics: when C# copies a struct (assignment, passing, returning) and the copy
  or the original is mutated later, clone explicitly (`cloneStruct(x)` or a `clone()` method). Read-only structs need nothing.
  A default struct value (`default(Foo)`, uninitialized struct field) -> `new Foo()` with default fields.
- `Position`, `Size`, `Rect`, `FloatPosition`, `FloatSize`, `FloatRect`, `Color` (Ambermoon.Core/Render/Color.cs) and
  `CharacterValue` are **classes with overloaded operators**. Translate operators to static methods named like the
  .NET metadata names:
  - `a == b` -> `Position.op_Equality(a, b)` (handles null), `a != b` -> `!Position.op_Equality(a, b)`
    (only when the static types are these classes; `x == null` stays `x == null`).
  - `a + b` -> `Position.op_Addition(a, b)`, `a - b` -> `Position.op_Subtraction(a, b)`, `a * f` -> `Position.op_Multiply(a, f)`,
    `a / f` -> `op_Division`. Same for Size/Rect/Float*/Color.
  - Implicit conversions (`Position` -> `FloatPosition`, `Size` -> `FloatSize`, `Rect` -> `FloatRect`) are not translated:
    the Float* classes accept the integer classes wherever they are used (they have the same members). If the float
    object is mutated afterwards, construct one: `new FloatPosition(pos)`.
  - `CharacterValueCollection` is a subclass of `Array`: keep indexing with `[]` (`character.Attributes[Attribute.Strength]`).
- **Indexers** (`this[...]`) of other classes become methods `get(...)` and `set(..., value)`;
  e.g. `RenderMap2D[x, y]` -> `renderMap.get(x, y)`, `dataReader[i]` -> `reader.get(i)`.
- `List<T>` -> Array: `Add` -> `push`, `AddRange` -> `push(...items)`, `Count` -> `length`, `Remove` -> `removeItem(arr, x)`,
  `RemoveAt` -> `splice(i, 1)`, `Insert` -> `splice(i, 0, x)`, `Clear()` -> `arr.length = 0` (keeps identity!),
  `Contains` -> `includes`, `IndexOf` -> `indexOf`, `Find` -> `find` (returns undefined: use `?? null` if compared to null),
  `FindIndex` -> `findIndex`, `Exists` -> `some`, `ForEach` -> `forEach`, `Sort` -> sort with comparator (stable, careful
  with `Comparer`), `ToArray()/ToList()` -> `slice()` (only when a copy is needed; keep it when the original is mutated later).
- `Dictionary<K,V>` -> `Map` (`dict[key]` read -> `getValue(map, key)` when it may throw / `map.get(key)`, write -> `map.set`,
  `ContainsKey` -> `has`, `TryGetValue` -> `tryGetValue(map, key)` returns `[found, value]`, `Keys/Values` -> `[...map.keys()]`,
  `Count` -> `size`, iteration `foreach (var kv in dict)` -> `for (const [Key, Value] of map)`).
  If the key type has value equality (Position, Size, Rect, tuples) use `ValueMap` / `ValueSet` from runtime.
  Enum and number keys are fine with `Map`. `HashSet<T>` -> `Set` (or `ValueSet`).
- Tuples `(a, b)` -> arrays `[a, b]` (named tuple elements -> objects with those names if accessed by name: `{ Item1, Item2 }`
  for unnamed `.Item1` access, or the C# names).
- `Queue<T>`/`Stack<T>` -> `Queue`/`Stack` from runtime (same method names as C#).
- LINQ: use array methods or runtime helpers: `Where`->`filter`, `Select`->`map`, `Any`->`some` (`Any()` -> `length !== 0`),
  `All`->`every`, `First/FirstOrDefault/Last/LastOrDefault/Single/Count/Sum/Max/Min/MaxBy/MinBy/Average/OrderBy/ThenBy/Distinct/GroupBy/ToDictionary`
  -> runtime helpers, `Skip/Take` -> `slice`, `Concat` -> `concat`/spread, `SelectMany` -> `flatMap`, `Reverse` -> `slice().reverse()`,
  `Enumerable.Range/Repeat` -> `range/repeat`, `Cast<T>`/`OfType<T>` -> `filter(x => x instanceof T)` or nothing.
  Laziness does not matter except when the source is mutated during iteration - then copy first.
- `IEnumerable<T>` methods with `yield return` -> generator functions (`*Foo()`); callers that need arrays wrap with `[...x]`.
- `string` methods: `Length`->`length`, `Substring(a, n)`->`substring(a, a + n)`, `IndexOf`, `Contains`->`includes`,
  `StartsWith`, `EndsWith`, `ToUpper()`->`toUpperCase()`, `Trim/TrimEnd/TrimStart` (with chars -> regex), `Split(c)`->`split(c)`
  (`StringSplitOptions.RemoveEmptyEntries` -> `.filter(s => s.length)`), `string.Join`->`join`, `Replace`->`replaceAll`,
  `PadLeft`->`padStart`, `PadRight`->`padEnd`, `string.IsNullOrEmpty`->`isNullOrEmpty`, `string.Format`/`$"{x:00}"` ->
  template literals + `formatNumber(x, '00')`, `string.Empty` -> `''`, `str[i]` -> `str[i]`, `char.IsDigit` -> `isDigit`.
- `DateTime.Now` -> `Date.now()` (ms number); `TimeSpan` -> milliseconds number (`.TotalMilliseconds` -> the number,
  `.TotalSeconds` -> `/ 1000`). `Stopwatch` -> `performance.now()`.
- `Random` -> the game's own `Ambermoon.Common/Random.cs` port; `new System.Random()` -> a small class with `Next(min, max)`
  using `Math.random()` (put it into runtime if needed - ask the owner of runtime.js... just inline it in your file).
- `lock (x) { ... }` -> just the block. `Thread`/`Task` do not occur in the game logic.
- Exceptions: `throw new AmbermoonException(...)` -> port of that class; .NET exceptions -> classes from runtime.
  `try/catch/finally` stays. `catch (SomeException)` filters -> `if (!(e instanceof X)) throw e;`.
- `using (var x = ...) { }` -> just the code (call `Dispose()` if the object has one and it matters).
- `is` / `as`: `x is Foo f` -> `x instanceof Foo` (import Foo). For interfaces use duck typing (`typeof x.Method === 'function'`)
  or check the concrete classes. `as` -> `(x instanceof Foo ? x : null)`.
- `switch` with patterns / switch expressions -> `switch`/if chains/ternaries. `goto case` -> restructure.
- `nameof(x)` -> `'x'`. `default` -> appropriate default (0, null, false, new Struct()).
- `params T[] args` -> rest parameter `...args` (callers that pass an array: spread it).
- Optional/named parameters: JS default parameters; calls with named arguments -> positional with `undefined` for skipped ones.
- `checked`/`unchecked` -> ignore.
- Static constructors / static readonly fields -> static fields/initializer blocks (`static { ... }`).
- `const` members -> `static` fields (or module constants if private).
- `readonly` -> nothing.
- `ref` locals / `Span<T>` -> plain arrays/subarrays (`Uint8Array.subarray` shares memory like Span).

## Classes

- `abstract` classes -> normal classes (abstract methods throw `new Error('abstract')` if not overridden).
- Primary constructors `class Foo(int a, Bar b)` -> constructor storing the parameters as fields with the same names
  (`this.a = a; this.b = b;`) - the class body refers to them as `this.a`.
- `base.Foo()` -> `super.Foo()`. `override`/`virtual`/`new` -> normal methods.
- Field initializers run before the constructor body: put them first in the constructor (after `super()`).
- **Partial classes** (e.g. `GameCore` in `Ambermoon.Core/GameCore.cs` + `Ambermoon.Core/Game/*.cs`):
  - The file containing the class declaration with the base class / main constructor (`GameCore.cs`) defines `export class GameCore`.
  - Every other partial file `X.cs` exports `export class GameCore_X { ... }` containing that file's methods, properties and
    static members, plus `static initFields(self) { self.foo = ...; }` with that file's instance field initializers.
    It must **not** import `GameCore` (avoid cycles). Other types declared in the same file are exported normally.
  - `GameCore.js` imports all parts and at the end calls `applyPartials(GameCore, [GameCore_Battle, ...])`; its constructor
    calls `initPartFields(this, GameCorePartials)` first. The list of parts is fixed: one per `partial class GameCore` file,
    named `GameCore_<FileName>` (file name without extension, e.g. `GameCore_MapHandling`).
  - Nested classes declared inside a partial (e.g. `class BattleInfo` in BattleHandling.cs) are exported from that file
    and attached in GameCore.js as static properties if C# code refers to them as `GameCore.BattleInfo`.
  - Same scheme for any other partial class (check with grep).
- **Extension methods** (static classes with `this` parameters): export the static class as a JS class with static
  methods, keep names, first parameter is the extended object: `x.GetTile(a)` (extension on Map) -> `MapExtensions.GetTile(x, a)`.
  To know whether a call is an extension method, grep the C# sources for `static .* MethodName(this`.
- **Events**: `public event Action<int> Foo;` -> field `this.Foo = new Event();`. `Foo += h` -> `this.Foo.add(h)`,
  `-=` -> `remove`, `Foo?.Invoke(a)` -> `this.Foo.invoke(a)`. Delegate-typed fields/properties (not `event`) stay
  plain functions or null: `x?.Invoke(a)` -> `x?.(a)`; `+=` on them (multicast) is rare - use an `Event` then.
  Lambdas keep `this` when written as arrow functions.
- Interfaces implemented explicitly (`void IFoo.Bar()`) -> normal method `Bar`.
- Object/collection initializers -> construct then assign.
- `ToString()` overrides -> `toString()` plus keep `ToString()` calling it if C# code calls `.ToString()` on it.
- `Equals/GetHashCode` overrides -> keep as methods; also used by `ValueMap` via `toString()`.
- `IDisposable.Dispose()` -> keep method.

## Rendering / platform

- The renderer interfaces (`IRenderView`, `ISprite`, `ITextureAtlas`, ...) are implemented by the WebGL2 renderer
  in `src/ambermoon/Ambermoon.Renderer.OpenGL/` (port of `Ambermoon.Renderer.OpenGL`, WebGL2 instead of OpenGL).
  Core code uses them with the C# member names.
- File access: there is no file system. `GameData` gets a `Map<string, Uint8Array>` of all files of the
  `Amberfiles` folder (keys = file names as on disk, case-insensitive lookup) and works from memory.
- Saving uses `localStorage`/IndexedDB via the savegame manager - see the owner of `Ambermoon.net` port.

## Style

- Tabs for indentation, single quotes, semicolons. Keep the C# comments. Keep the GPL header comment of each file
  (shortened to two lines: `// Port of <C# path> from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)`).
- Do not "improve" logic while porting. Mark anything you could not port with `// TODO(port): ...` and keep going.
- Every file must parse: check with `node --check file.js` after writing (ES module syntax; the folder has
  `package.json` with `"type": "module"`).

## Fixed list of partial classes

| Class | Main file (defines the class, applies the parts) | Part files -> exported part class |
|---|---|---|
| `GameCore` | `Ambermoon.Core/GameCore.cs` | each `Ambermoon.Core/Game/<X>.cs` with `partial class GameCore` -> `GameCore_<X>` (Audio, AutoBattle, BattleHandling, Conversations, CustomTexts, DataProviders, EventHandling, GameTime, Input, Items, Lifecycle, MapHandling, Movement, Party, Places, Rendering, Savegame, Settings, Spells, Teleport, Util, Windowing - check each file) |
| `Battle` | `Ambermoon.Core/Battle.cs` | `Ambermoon.Core/Game/AutoBattle.cs` -> `Battle_AutoBattle` |
| `Global` (static) | `Ambermoon.Core/UI/Global.cs` | `Ambermoon.Core/Render/Global.cs` -> `Global_Render`, `Ambermoon.Core/Render/Layer.cs` -> `Global_Layer` (static members only) |
| `Monster` | `Ambermoon.Data.Common/Monster.cs` (only one file) | - |

Static-only partials: copy static members with `applyPartials` as well (it copies statics). Callers always use the main class
(`Global.VirtualScreenWidth`, `GameCore`), never the part class names.
