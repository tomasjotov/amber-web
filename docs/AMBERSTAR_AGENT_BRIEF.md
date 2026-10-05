# Brief for Amberstar conversion workers

You write one converter of the project "Amberstar on the Ambermoon engine" in `C:\data\tj\amber\amber-web`.
Other workers write the other converters in parallel right now.

1. Read `C:\data\tj\amber\amber-web\AMBERSTAR.md` completely, then `src/amberstar/AmberstarGameData.js`,
   `src/amberstar/common.js` and `PORTING.md` (naming conventions of the Ambermoon JS port).
2. Learn the Ambermoon side from the JS port in `src/ambermoon/` (same names as the C# in `../Ambermoon.net-master`);
   learn the Amberstar side from `amberstar/src/data/*.js` (working loaders of the Amberstar web port, which also has a
   complete game in `amberstar/src/game` you can read to see how Amberstar data is meant to be used), the file format docs
   in `../Amberstar-main/FileSpecs/` and the C# reference `../Amber-main/`.
3. Write only your assigned files under `src/amberstar/convert/` (you may add helper modules under `src/amberstar/convert/<yourname>/`).
   Do not edit files of the Ambermoon port, of the Amberstar web port, `AmberstarGameData.js` or `common.js`. If the engine
   needs a change to support Amberstar, describe it precisely in your final answer (file, line, change) instead of doing it.
4. Test in Node: `node tools/test-amberstar.mjs` (builds the whole game data; other converters may still be stubs).
   You may write extra test scripts under `tools/` named `test-amberstar-<yourpart>.mjs`. Check that the produced
   Ambermoon objects have the shapes the engine expects (read how the engine uses them: grep the Core for the members).
   Graphics: you can write PNG previews to `tools/out/` (`node` has no canvas; write a tiny PNG encoder with zlib from `node:zlib`).
5. Quality bar: complete conversion of the real data, not a sketch. Where Amberstar and Ambermoon differ, choose the closest
   Ambermoon behavior and document the decision in a comment. The result should look and play well.
6. Final answer: files written, the contract you implemented, decisions, what is missing, engine changes needed.
   Do not use any `mcp__hearthbot__` tools. Do not install packages.
