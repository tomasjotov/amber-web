# Brief for porting workers

You translate part of Ambermoon.net (C#) into JavaScript ES modules for the browser project `C:\data\tj\amber\amber-web`.
C# sources: `C:\data\tj\amber\Ambermoon.net-master`. Other workers translate the other files in parallel right now.

1. Read `C:\data\tj\amber\amber-web\PORTING.md` completely and `C:\data\tj\amber\amber-web\src\runtime.js`. Follow the rules exactly;
   cross-file references only work if everybody follows them (same member names, out-params as arrays, overload dispatch, partial classes, operators as op_* static methods, enums as frozen objects).
2. Translate **only your assigned files**, completely (no stubs, no "simplified" logic), into `C:\data\tj\amber\amber-web\src\ambermoon\<same relative path>.js`.
   Do not write any other files except what your assignment says. Do not edit runtime.js or PORTING.md; if you need a helper,
   put it as a non-exported function in your own file.
3. For every type you use from other files, find the declaring C# file with grep and import from the mirrored JS path (relative import, `.js` extension),
   even though that JS file may not exist yet. Before importing, check whether the type is a pure interface (then do not import).
   Check whether called methods are extension methods (`static ... Name(this ...`) and translate the calls accordingly.
4. After each file: `node --check <file>` must pass. At the end, list in your final answer: the files written, any deviations from PORTING.md,
   every `TODO(port)` left, and anything other workers must know (e.g. a helper class you exported, an API shape you chose).
5. Work autonomously; do not ask questions. Do not use any `mcp__hearthbot__` tools. Do not install packages. Do not touch files outside `amber-web/src/ambermoon/` except your assigned outputs.
6. Use the Bash tool for listing/grepping; write files with the Write tool. Large files: write them in several Edit/append steps if needed, but keep the whole file content faithful.
