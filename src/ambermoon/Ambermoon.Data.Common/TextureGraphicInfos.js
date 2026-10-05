// Port of Ambermoon.Data.Common/TextureGraphicInfos.cs from Ambermoon.net (GPL-3.0, Copyright (C) Robert Schneckenhaus)

import { Size } from '../Ambermoon.Common/Size.js';
import { GraphicInfo, GraphicFormat } from './Graphic.js';

const OverlayGraphicSizes = [
	new Size(16, 80), // 1
	new Size(16, 80),
	new Size(16, 80),
	new Size(16, 80),
	new Size(16, 80),
	new Size(16, 80),
	new Size(16, 80),
	new Size(16, 80),
	new Size(16, 80),
	new Size(16, 80), // 10
	new Size(48, 80),
	new Size(48, 80),
	new Size(16, 80),
	new Size(16, 80),
	new Size(32, 80),
	new Size(32, 80),
	new Size(32, 80),
	new Size(32, 80),
	new Size(16, 80),
	new Size(16, 80), // 20
	new Size(16, 80),
	new Size(16, 80),
	new Size(16, 16),
	new Size(32, 80),
	new Size(32, 80),
	new Size(32, 80),
	new Size(32, 80),
	new Size(32, 80),
	new Size(32, 80),
	new Size(32, 80), // 30
	new Size(32, 80),
	new Size(64, 61),
	new Size(16, 32),
	new Size(16, 26),
	new Size(16, 16),
	new Size(16, 16),
	new Size(32, 32),
	new Size(32, 32),
	new Size(64, 45),
	new Size(32, 19), // 40
	new Size(16, 27),
	new Size(16, 80),
	new Size(16, 80),
	new Size(96, 69),
	new Size(64, 50),
	new Size(64, 46),
	new Size(32, 80),
	new Size(32, 80),
	new Size(48, 80),
	new Size(32, 80), // 50
	new Size(48, 80),
	new Size(64, 80),
	new Size(16, 23),
	new Size(16, 23),
	new Size(32, 15),
	new Size(16, 13),
	new Size(16, 13),
	new Size(64, 60),
	new Size(64, 60),
	new Size(64, 60), // 60
	new Size(64, 60),
	new Size(64, 60),
	new Size(64, 60),
	new Size(64, 60),
	new Size(64, 25),
	new Size(64, 25),
	new Size(32, 48),
	new Size(32, 32),
	new Size(32, 32),
	new Size(48, 48), // 70
	new Size(64, 64),
	new Size(32, 58),
	new Size(32, 32),
	new Size(64, 52),
	new Size(64, 80),
	new Size(64, 64),
	new Size(64, 64),
	new Size(64, 64),
	new Size(64, 64),
	new Size(64, 25), // 80
	new Size(64, 25),
	new Size(64, 25),
	new Size(64, 25),
	new Size(32, 30),
	new Size(32, 30),
	new Size(64, 80),
	new Size(64, 36),
	new Size(64, 36),
	new Size(64, 41),
	new Size(64, 41), // 90
	new Size(64, 41),
	// Advanced graphics
	new Size(16, 80),
	new Size(16, 80),
	new Size(64, 41),
	new Size(72, 80),
	new Size(32, 80),
	new Size(32, 80),
	new Size(64, 45),
	new Size(96, 72),
	new Size(16, 8), // 100
	new Size(16, 8),
	new Size(128, 13),
	new Size(64, 60),
	new Size(32, 16),
	new Size(64, 41),
	new Size(64, 41),
	new Size(64, 41),
	new Size(64, 25),
	new Size(16, 41),
	new Size(16, 41), // 110
	new Size(64, 51),
	new Size(64, 50),
	new Size(32, 11),
	new Size(48, 13),
	new Size(32, 20),
	new Size(128, 15),
	new Size(48, 12),
	new Size(48, 27),
	new Size(48, 27),
	new Size(32, 25), // 120
	new Size(32, 25),
	new Size(32, 24),
	new Size(32, 24),
	new Size(32, 24),
	new Size(32, 25),
	new Size(32, 25),
	new Size(32, 25),
	new Size(32, 24),
	new Size(32, 24), // 129
];
/* NOTE: You can find these values programmatically like this:
    using Ambermoon.Data.Legacy;
    var gameData = new GameData();
    gameData.Load(@"path/to/advanced/Amberfiles/folder");
    var allInfos = new Dictionary<uint, List<Size>>();
    gameData.MapManager.Labdata.ToList().ForEach(labData =>
    {
        labData.Walls.SelectMany(wall => wall.Overlays ?? []).ToList().ForEach((overlay) =>
        {
            if (!allInfos.ContainsKey(overlay.TextureIndex))
                allInfos[overlay.TextureIndex] = [new((int)overlay.TextureWidth, (int)overlay.TextureHeight)];
            else
                allInfos[overlay.TextureIndex].Add(new((int)overlay.TextureWidth, (int)overlay.TextureHeight));
        });
    });
    var sortedInfos = allInfos.OrderBy(z => z.Key).ToList();
    foreach (var item in sortedInfos)
    {
        Console.WriteLine(item.Key);
        foreach (var info in item.Value.Distinct())
            Console.WriteLine($"\t{info.Width}, {info.Height}");
    }
 */

/** array of { Key: frameCount, Value: Size } (KeyValuePair<int, Size>) */
const ObjectGraphicFrameCountsAndSizes = [
	{ Key: 1, Value: new Size(80, 80) }, // 1
	{ Key: 1, Value: new Size(80, 76) },
	{ Key: 1, Value: new Size(48, 69) },
	{ Key: 1, Value: new Size(32, 36) },
	{ Key: 1, Value: new Size(48, 36) },
	{ Key: 1, Value: new Size(32, 26) },
	{ Key: 1, Value: new Size(32, 30) },
	{ Key: 1, Value: new Size(16, 12) },
	{ Key: 1, Value: new Size(16, 11) },
	{ Key: 1, Value: new Size(16, 42) }, // 10
	{ Key: 1, Value: new Size(32, 32) },
	{ Key: 1, Value: new Size(16, 8) },
	{ Key: 1, Value: new Size(32, 65) },
	{ Key: 1, Value: new Size(32, 68) },
	{ Key: 1, Value: new Size(64, 83) },
	{ Key: 8, Value: new Size(16, 36) },
	{ Key: 1, Value: new Size(16, 32) },
	{ Key: 1, Value: new Size(16, 41) },
	{ Key: 1, Value: new Size(64, 80) },
	{ Key: 1, Value: new Size(64, 80) }, // 20
	{ Key: 1, Value: new Size(32, 46) },
	{ Key: 1, Value: new Size(48, 50) },
	{ Key: 1, Value: new Size(16, 30) },
	{ Key: 1, Value: new Size(16, 28) },
	{ Key: 1, Value: new Size(16, 34) },
	{ Key: 1, Value: new Size(16, 25) },
	{ Key: 1, Value: new Size(64, 80) },
	{ Key: 1, Value: new Size(96, 80) },
	{ Key: 1, Value: new Size(96, 80) },
	{ Key: 1, Value: new Size(48, 80) }, // 30
	{ Key: 3, Value: new Size(96, 80) },
	{ Key: 1, Value: new Size(80, 21) },
	{ Key: 1, Value: new Size(48, 39) },
	{ Key: 1, Value: new Size(80, 16) },
	{ Key: 1, Value: new Size(32, 77) },
	{ Key: 1, Value: new Size(48, 23) },
	{ Key: 3, Value: new Size(64, 83) },
	{ Key: 7, Value: new Size(96, 67) },
	{ Key: 3, Value: new Size(80, 84) },
	{ Key: 3, Value: new Size(64, 71) }, // 40
	{ Key: 3, Value: new Size(64, 68) },
	{ Key: 3, Value: new Size(96, 80) },
	{ Key: 3, Value: new Size(64, 86) },
	{ Key: 3, Value: new Size(64, 83) },
	{ Key: 3, Value: new Size(48, 78) },
	{ Key: 3, Value: new Size(64, 67) },
	{ Key: 3, Value: new Size(64, 73) },
	{ Key: 3, Value: new Size(80, 54) },
	{ Key: 3, Value: new Size(64, 67) },
	{ Key: 3, Value: new Size(64, 69) }, // 50
	{ Key: 3, Value: new Size(64, 86) },
	{ Key: 3, Value: new Size(80, 54) },
	{ Key: 3, Value: new Size(48, 69) },
	{ Key: 3, Value: new Size(80, 77) },
	{ Key: 3, Value: new Size(48, 72) },
	{ Key: 3, Value: new Size(32, 70) },
	{ Key: 3, Value: new Size(64, 67) },
	{ Key: 1, Value: new Size(16, 51) },
	{ Key: 1, Value: new Size(32, 21) },
	{ Key: 1, Value: new Size(32, 26) }, // 60
	{ Key: 4, Value: new Size(32, 20) },
	{ Key: 1, Value: new Size(16, 19) },
	{ Key: 1, Value: new Size(16, 22) },
	{ Key: 1, Value: new Size(16, 18) },
	{ Key: 1, Value: new Size(16, 16) },
	{ Key: 1, Value: new Size(16, 16) },
	{ Key: 1, Value: new Size(16, 16) },
	{ Key: 1, Value: new Size(16, 16) },
	{ Key: 1, Value: new Size(16, 16) },
	{ Key: 1, Value: new Size(16, 16) }, // 70
	{ Key: 1, Value: new Size(16, 16) },
	{ Key: 1, Value: new Size(16, 16) },
	{ Key: 1, Value: new Size(16, 16) },
	{ Key: 1, Value: new Size(16, 16) },
	{ Key: 1, Value: new Size(16, 16) },
	{ Key: 1, Value: new Size(16, 16) },
	{ Key: 1, Value: new Size(16, 16) },
	{ Key: 1, Value: new Size(16, 16) },
	{ Key: 1, Value: new Size(16, 16) },
	{ Key: 1, Value: new Size(16, 16) }, // 80
	{ Key: 1, Value: new Size(16, 16) },
	{ Key: 1, Value: new Size(32, 21) },
	{ Key: 1, Value: new Size(48, 31) },
	{ Key: 1, Value: new Size(16, 16) },
	{ Key: 1, Value: new Size(16, 16) },
	{ Key: 1, Value: new Size(64, 60) },
	{ Key: 1, Value: new Size(32, 30) },
	{ Key: 1, Value: new Size(32, 31) },
	{ Key: 1, Value: new Size(64, 60) },
	{ Key: 1, Value: new Size(47, 43) }, // 90
	{ Key: 1, Value: new Size(32, 29) },
	{ Key: 1, Value: new Size(16, 11) },
	{ Key: 1, Value: new Size(16, 19) },
	{ Key: 1, Value: new Size(16, 18) },
	{ Key: 1, Value: new Size(16, 18) },
	{ Key: 1, Value: new Size(80, 78) },
	{ Key: 1, Value: new Size(80, 78) },
	{ Key: 1, Value: new Size(64, 64) },
	{ Key: 1, Value: new Size(64, 63) },
	{ Key: 1, Value: new Size(16, 80) }, // 100
	{ Key: 1, Value: new Size(16, 80) },
	{ Key: 1, Value: new Size(16, 80) },
	{ Key: 1, Value: new Size(16, 80) },
	{ Key: 1, Value: new Size(16, 19) },
	{ Key: 1, Value: new Size(16, 34) },
	{ Key: 1, Value: new Size(16, 21) },
	{ Key: 1, Value: new Size(16, 25) },
	{ Key: 1, Value: new Size(64, 64) },
	{ Key: 1, Value: new Size(32, 51) },
	{ Key: 1, Value: new Size(32, 51) }, // 110
	{ Key: 1, Value: new Size(16, 17) },
	{ Key: 1, Value: new Size(16, 18) },
	{ Key: 1, Value: new Size(16, 23) },
	{ Key: 1, Value: new Size(16, 22) },
	{ Key: 1, Value: new Size(32, 48) },
	{ Key: 1, Value: new Size(32, 66) },
	{ Key: 1, Value: new Size(32, 80) },
	{ Key: 1, Value: new Size(32, 81) },
	{ Key: 1, Value: new Size(96, 39) },
	{ Key: 1, Value: new Size(32, 35) }, // 120
	{ Key: 1, Value: new Size(48, 25) },
	{ Key: 8, Value: new Size(128, 80) },
	{ Key: 6, Value: new Size(128, 29) },
	{ Key: 3, Value: new Size(48, 47) },
	{ Key: 1, Value: new Size(48, 24) },
	{ Key: 1, Value: new Size(64, 34) },
	{ Key: 1, Value: new Size(32, 45) },
	{ Key: 1, Value: new Size(32, 45) },
	{ Key: 1, Value: new Size(32, 45) },
	{ Key: 1, Value: new Size(32, 45) }, // 130
	{ Key: 1, Value: new Size(32, 49) },
	{ Key: 1, Value: new Size(32, 45) },
	{ Key: 1, Value: new Size(32, 67) },
	{ Key: 1, Value: new Size(32, 49) },
	{ Key: 1, Value: new Size(32, 32) },
	{ Key: 1, Value: new Size(32, 88) },
	{ Key: 1, Value: new Size(32, 32) },
	{ Key: 6, Value: new Size(48, 48) },
	{ Key: 1, Value: new Size(48, 32) },
	{ Key: 1, Value: new Size(48, 32) }, // 140
	{ Key: 4, Value: new Size(48, 29) },
	{ Key: 4, Value: new Size(16, 86) },
	{ Key: 1, Value: new Size(32, 74) },
	{ Key: 8, Value: new Size(16, 36) },
	{ Key: 1, Value: new Size(48, 50) },
	{ Key: 1, Value: new Size(48, 50) },
	{ Key: 1, Value: new Size(16, 26) },
	{ Key: 1, Value: new Size(16, 46) },
	{ Key: 4, Value: new Size(16, 25) },
	{ Key: 1, Value: new Size(32, 41) }, // 150
	{ Key: 4, Value: new Size(16, 18) },
	{ Key: 1, Value: new Size(16, 69) },
	{ Key: 1, Value: new Size(32, 23) },
	{ Key: 1, Value: new Size(48, 26) },
	{ Key: 1, Value: new Size(32, 35) },
	{ Key: 1, Value: new Size(48, 35) },
	{ Key: 1, Value: new Size(48, 35) },
	{ Key: 1, Value: new Size(48, 35) },
	{ Key: 1, Value: new Size(32, 26) },
	{ Key: 1, Value: new Size(16, 22) }, // 160
	{ Key: 1, Value: new Size(16, 17) },
	{ Key: 1, Value: new Size(32, 36) },
	{ Key: 1, Value: new Size(32, 22) },
	{ Key: 1, Value: new Size(32, 28) },
	{ Key: 1, Value: new Size(32, 28) },
	{ Key: 1, Value: new Size(48, 25) },
	{ Key: 1, Value: new Size(16, 28) },
	{ Key: 1, Value: new Size(16, 28) },
	{ Key: 1, Value: new Size(16, 28) },
	{ Key: 1, Value: new Size(16, 28) }, // 170
	{ Key: 1, Value: new Size(16, 28) },
	{ Key: 1, Value: new Size(48, 41) },
	{ Key: 1, Value: new Size(48, 39) },
	{ Key: 1, Value: new Size(16, 19) },
	{ Key: 1, Value: new Size(16, 28) },
	{ Key: 1, Value: new Size(32, 32) },
	{ Key: 1, Value: new Size(48, 45) },
	{ Key: 1, Value: new Size(32, 22) },
	{ Key: 1, Value: new Size(32, 18) },
	{ Key: 1, Value: new Size(32, 80) }, // 180
	{ Key: 7, Value: new Size(64, 63) },
	{ Key: 1, Value: new Size(32, 61) },
	{ Key: 1, Value: new Size(32, 38) },
	{ Key: 1, Value: new Size(16, 31) },
	{ Key: 1, Value: new Size(16, 17) },
	{ Key: 1, Value: new Size(16, 48) },
	{ Key: 1, Value: new Size(16, 48) },
	{ Key: 1, Value: new Size(16, 20) },
	{ Key: 1, Value: new Size(16, 33) },
	{ Key: 1, Value: new Size(16, 31) }, // 190
	{ Key: 1, Value: new Size(16, 22) },
	{ Key: 1, Value: new Size(32, 20) },
	{ Key: 1, Value: new Size(32, 15) },
	{ Key: 1, Value: new Size(16, 13) },
	{ Key: 1, Value: new Size(16, 11) },
	{ Key: 1, Value: new Size(16, 11) },
	{ Key: 1, Value: new Size(16, 11) },
	{ Key: 1, Value: new Size(16, 14) },
	{ Key: 1, Value: new Size(16, 7) },
	{ Key: 1, Value: new Size(16, 7) }, // 200
	{ Key: 1, Value: new Size(80, 80) },
	{ Key: 5, Value: new Size(32, 37) },
	{ Key: 3, Value: new Size(16, 72) },
	{ Key: 3, Value: new Size(16, 51) },
	{ Key: 3, Value: new Size(16, 51) },
	{ Key: 1, Value: new Size(32, 42) },
	{ Key: 1, Value: new Size(16, 7) },
	{ Key: 1, Value: new Size(48, 50) },
	{ Key: 1, Value: new Size(48, 48) },
	{ Key: 1, Value: new Size(16, 31) }, // 210
	{ Key: 1, Value: new Size(16, 33) },
	{ Key: 1, Value: new Size(48, 48) },
	{ Key: 1, Value: new Size(48, 48) },
	{ Key: 1, Value: new Size(32, 30) },
	{ Key: 1, Value: new Size(32, 27) },
	{ Key: 1, Value: new Size(32, 80) },
	{ Key: 1, Value: new Size(32, 80) },
	{ Key: 1, Value: new Size(32, 32) },
	{ Key: 1, Value: new Size(32, 80) },
	{ Key: 1, Value: new Size(32, 32) }, // 220
	{ Key: 1, Value: new Size(32, 66) },
	{ Key: 1, Value: new Size(64, 64) },
	{ Key: 1, Value: new Size(64, 64) },
	{ Key: 1, Value: new Size(32, 50) },
	{ Key: 1, Value: new Size(16, 56) },
	{ Key: 1, Value: new Size(32, 84) },
	{ Key: 1, Value: new Size(32, 84) },
	{ Key: 1, Value: new Size(32, 45) },
	{ Key: 1, Value: new Size(48, 80) },
	{ Key: 1, Value: new Size(32, 79) }, // 230
	{ Key: 1, Value: new Size(16, 47) },
	{ Key: 1, Value: new Size(32, 60) },
	{ Key: 1, Value: new Size(32, 32) },
	{ Key: 1, Value: new Size(32, 55) },
	{ Key: 1, Value: new Size(32, 44) },
	{ Key: 1, Value: new Size(32, 36) },
	{ Key: 1, Value: new Size(32, 36) },
	{ Key: 1, Value: new Size(16, 22) },
	{ Key: 1, Value: new Size(16, 23) },
	{ Key: 1, Value: new Size(16, 24) }, // 240
	{ Key: 1, Value: new Size(16, 16) },
	{ Key: 1, Value: new Size(16, 26) },
	{ Key: 1, Value: new Size(32, 22) },
	{ Key: 1, Value: new Size(16, 17) },
	{ Key: 1, Value: new Size(32, 28) },
	{ Key: 1, Value: new Size(16, 21) },
	{ Key: 1, Value: new Size(16, 22) },
	{ Key: 1, Value: new Size(16, 29) },
	{ Key: 1, Value: new Size(48, 50) },
	{ Key: 1, Value: new Size(48, 48) }, // 250
	{ Key: 1, Value: new Size(48, 48) },
	{ Key: 1, Value: new Size(48, 48) },
	{ Key: 1, Value: new Size(16, 41) },
	{ Key: 1, Value: new Size(16, 41) },
	{ Key: 1, Value: new Size(32, 30) },
	{ Key: 1, Value: new Size(32, 27) },
	{ Key: 4, Value: new Size(64, 64) },
	{ Key: 5, Value: new Size(32, 48) },
	{ Key: 1, Value: new Size(64, 64) },
	{ Key: 1, Value: new Size(32, 32) }, // 260
	{ Key: 1, Value: new Size(32, 32) },
	{ Key: 1, Value: new Size(32, 32) },
	{ Key: 1, Value: new Size(32, 32) },
	{ Key: 1, Value: new Size(32, 32) },
	{ Key: 1, Value: new Size(48, 57) },
	{ Key: 3, Value: new Size(48, 59) },
	{ Key: 1, Value: new Size(32, 24) },
	{ Key: 1, Value: new Size(32, 19) },
	{ Key: 1, Value: new Size(32, 21) },
	{ Key: 1, Value: new Size(16, 15) }, // 270
	{ Key: 1, Value: new Size(16, 12) },
	{ Key: 1, Value: new Size(16, 9) },
	{ Key: 1, Value: new Size(16, 7) },
	{ Key: 1, Value: new Size(16, 6) },
	{ Key: 5, Value: new Size(48, 82) },
	{ Key: 3, Value: new Size(48, 48) },
	{ Key: 3, Value: new Size(48, 48) },
	{ Key: 1, Value: new Size(32, 27) },
	{ Key: 1, Value: new Size(32, 19) },
	{ Key: 1, Value: new Size(32, 29) }, // 280
	{ Key: 1, Value: new Size(16, 16) },
	{ Key: 1, Value: new Size(16, 13) },
	{ Key: 1, Value: new Size(16, 10) },
	{ Key: 1, Value: new Size(48, 48) },
	{ Key: 1, Value: new Size(32, 32) },
	{ Key: 1, Value: new Size(32, 32) },
	{ Key: 1, Value: new Size(16, 12) },
	{ Key: 1, Value: new Size(16, 11) },
	{ Key: 1, Value: new Size(16, 11) },
	{ Key: 1, Value: new Size(16, 17) }, // 290
	{ Key: 1, Value: new Size(16, 21) },
	{ Key: 1, Value: new Size(16, 11) },
	{ Key: 1, Value: new Size(16, 12) },
	{ Key: 1, Value: new Size(16, 11) },
	{ Key: 1, Value: new Size(16, 17) },
	{ Key: 1, Value: new Size(16, 21) },
	{ Key: 1, Value: new Size(16, 11) },
	{ Key: 1, Value: new Size(16, 11) },
	{ Key: 1, Value: new Size(32, 28) },
	{ Key: 1, Value: new Size(32, 23) }, // 300
	{ Key: 1, Value: new Size(32, 25) },
	{ Key: 1, Value: new Size(16, 19) },
	{ Key: 1, Value: new Size(16, 16) },
	{ Key: 1, Value: new Size(16, 12) },
	{ Key: 1, Value: new Size(16, 10) },
	{ Key: 1, Value: new Size(16, 8) },
	{ Key: 1, Value: new Size(48, 48) },
	{ Key: 1, Value: new Size(48, 48) },
	{ Key: 1, Value: new Size(48, 48) },
	{ Key: 1, Value: new Size(48, 48) }, // 310
	{ Key: 1, Value: new Size(48, 48) },
	{ Key: 1, Value: new Size(32, 32) },
	{ Key: 1, Value: new Size(16, 80) },
	{ Key: 1, Value: new Size(16, 80) },
	{ Key: 1, Value: new Size(80, 55) },
	{ Key: 3, Value: new Size(48, 69) },
	{ Key: 3, Value: new Size(48, 74) },
	{ Key: 3, Value: new Size(64, 72) },
	{ Key: 3, Value: new Size(48, 73) },
	{ Key: 3, Value: new Size(64, 69) }, // 320
	{ Key: 3, Value: new Size(48, 68) },
	{ Key: 3, Value: new Size(48, 69) },
	{ Key: 1, Value: new Size(48, 48) },
	{ Key: 1, Value: new Size(48, 48) },
	{ Key: 1, Value: new Size(48, 48) },
	{ Key: 1, Value: new Size(48, 43) },
	{ Key: 1, Value: new Size(64, 63) },
	{ Key: 1, Value: new Size(32, 35) },
	{ Key: 1, Value: new Size(32, 35) },
	{ Key: 1, Value: new Size(16, 16) }, // 330
	{ Key: 1, Value: new Size(32, 34) },
	{ Key: 3, Value: new Size(48, 70) },
	{ Key: 1, Value: new Size(48, 68) },
	{ Key: 3, Value: new Size(64, 70) },
	{ Key: 3, Value: new Size(48, 70) },
	{ Key: 3, Value: new Size(48, 66) },
	{ Key: 3, Value: new Size(48, 70) },
	{ Key: 3, Value: new Size(48, 69) },
	{ Key: 3, Value: new Size(48, 68) },
	{ Key: 3, Value: new Size(48, 68) }, // 340
	{ Key: 3, Value: new Size(48, 68) },
	{ Key: 3, Value: new Size(48, 78) },
	{ Key: 3, Value: new Size(48, 78) },
	{ Key: 3, Value: new Size(48, 78) },
	{ Key: 3, Value: new Size(48, 78) },
	{ Key: 3, Value: new Size(32, 52) },
	{ Key: 1, Value: new Size(48, 29) },
	{ Key: 1, Value: new Size(32, 25) },
	{ Key: 1, Value: new Size(32, 21) },
	{ Key: 1, Value: new Size(32, 16) }, // 350
	{ Key: 1, Value: new Size(48, 23) },
	{ Key: 1, Value: new Size(16, 17) },
	{ Key: 1, Value: new Size(16, 18) },
	{ Key: 1, Value: new Size(48, 48) },
	{ Key: 3, Value: new Size(64, 73) },
	{ Key: 4, Value: new Size(16, 61) },
	{ Key: 1, Value: new Size(64, 26) },
	{ Key: 1, Value: new Size(32, 58) },
	{ Key: 1, Value: new Size(32, 58) },
	{ Key: 1, Value: new Size(32, 33) }, // 360
	{ Key: 1, Value: new Size(32, 32) },
	{ Key: 1, Value: new Size(32, 32) },
	{ Key: 8, Value: new Size(16, 11) },
	{ Key: 8, Value: new Size(16, 11) },
	{ Key: 8, Value: new Size(16, 11) },
	{ Key: 1, Value: new Size(48, 57) },
	{ Key: 1, Value: new Size(48, 59) },
	{ Key: 3, Value: new Size(32, 50) },
	{ Key: 3, Value: new Size(32, 50) },
	{ Key: 1, Value: new Size(48, 69) }, // 370
	{ Key: 3, Value: new Size(96, 88) },
	{ Key: 3, Value: new Size(96, 75) },
	{ Key: 1, Value: new Size(80, 66) },
	// Advanced graphics
	{ Key: 3, Value: new Size(48, 78) },
	{ Key: 3, Value: new Size(40, 42) },
	{ Key: 1, Value: new Size(32, 29) },
	{ Key: 8, Value: new Size(16, 36) },
	{ Key: 1, Value: new Size(48, 28) },
	{ Key: 1, Value: new Size(32, 77) },
	{ Key: 2, Value: new Size(64, 48) }, // 380
	{ Key: 1, Value: new Size(32, 38) },
	{ Key: 1, Value: new Size(32, 38) },
	{ Key: 1, Value: new Size(64, 60) },
	{ Key: 4, Value: new Size(16, 80) },
	{ Key: 8, Value: new Size(128, 80) },
	{ Key: 1, Value: new Size(48, 70) },
	{ Key: 4, Value: new Size(64, 80) },
	{ Key: 1, Value: new Size(32, 32) },
	{ Key: 4, Value: new Size(32, 32) },
	{ Key: 1, Value: new Size(32, 32) }, // 390
	{ Key: 1, Value: new Size(32, 79) },
	{ Key: 1, Value: new Size(128, 117) },
	{ Key: 1, Value: new Size(48, 78) },
	{ Key: 1, Value: new Size(32, 61) },
	{ Key: 1, Value: new Size(80, 80) },
	{ Key: 1, Value: new Size(80, 78) },
	{ Key: 1, Value: new Size(32, 55) },
	{ Key: 1, Value: new Size(64, 60) },
	{ Key: 1, Value: new Size(80, 78) },
	{ Key: 1, Value: new Size(48, 78) }, // 400
	{ Key: 4, Value: new Size(64, 64) },
	{ Key: 3, Value: new Size(48, 72) },
	{ Key: 1, Value: new Size(48, 74) },
	{ Key: 1, Value: new Size(64, 88) },
	{ Key: 1, Value: new Size(128, 120) },
	{ Key: 1, Value: new Size(128, 69) }, // 406
];
/* NOTE: You can find these values programmatically like this:
    using Ambermoon.Data.Legacy;
    var gameData = new GameData();
    gameData.Load(@"path/to/advanced/Amberfiles/folder");
    var allInfos = new Dictionary<uint, List<GraphicInfo>>();
    gameData.MapManager.Labdata.ToList().ForEach(labData =>
    {
        labData.ObjectInfos.ToList().ForEach((info) =>
        {
            if (!allInfos.ContainsKey(info.TextureIndex))
                allInfos[info.TextureIndex] = [new(info.TextureWidth, info.TextureHeight, info.NumAnimationFrames)];
            else
                allInfos[info.TextureIndex].Add(new(info.TextureWidth, info.TextureHeight, info.NumAnimationFrames));
        });
    });
    var sortedInfos = allInfos.OrderBy(z => z.Key).ToList();
    foreach (var item in sortedInfos)
    {
        Console.WriteLine(item.Key);
        foreach (var info in item.Value.Distinct())
            Console.WriteLine($"\t{info.Width}, {info.Height} (Frames: {info.Frames})");
    }
    record GraphicInfo(uint Width, uint Height, uint Frames);
*/

const WallGraphicInfo = new GraphicInfo();
WallGraphicInfo.Alpha = false;
WallGraphicInfo.GraphicFormat = GraphicFormat.Texture4Bit;
WallGraphicInfo.Width = 128;
WallGraphicInfo.Height = 80;

export class TextureGraphicInfos {
	static WallGraphicInfo = WallGraphicInfo;

	/** array of [GraphicInfo, Frames] tuples */
	static get ObjectGraphicInfos() {
		return ObjectGraphicFrameCountsAndSizes.map(size => {
			const info = new GraphicInfo();
			info.Alpha = true;
			info.GraphicFormat = GraphicFormat.Texture4Bit;
			info.Width = size.Value.Width;
			info.Height = size.Value.Height;
			return [info, size.Key];
		});
	}

	static get OverlayGraphicInfos() {
		return OverlayGraphicSizes.map(size => {
			const info = new GraphicInfo();
			info.Alpha = true;
			info.GraphicFormat = GraphicFormat.Texture4Bit;
			info.Width = size.Width;
			info.Height = size.Height;
			return info;
		});
	}

	static OverlayGraphicSizes = OverlayGraphicSizes;

	static ObjectGraphicFrameCountsAndSizes = ObjectGraphicFrameCountsAndSizes;
}
