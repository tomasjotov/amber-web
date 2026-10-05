// Enumerations ported from Amberstar.GameData.

function makeEnum(names) {
	const e = {};
	names.forEach((n, i) => { e[n] = i; });
	return e;
}

export const UIGraphic = makeEnum([
	'Skull', 'FeedbackIcon', 'ChequeredIcon', 'Night', 'Dawn', 'Day', 'Dusk',
	'CompassNorth', 'CompassEast', 'CompassSouth', 'CompassWest', 'Amberstar', 'Windchain',
	'Light', 'ArmorProtection', 'WeaponPower', 'AntiMagic', 'Clairvoyance', 'Invisibility',
	'EmptyItemSlot', 'DamageSplash', 'HealingCross', 'Ouch', 'MagicAnimation', 'EmptyCharSlot',
	'HPBar', 'SPBar', 'Sword', 'Shield', 'RiddlemouthEyes', 'RiddlemouthMouth', 'CurseAnimation',
	'AutomapIcons', 'SmallOuch',
]);
UIGraphic.LastUIGraphic = UIGraphic.SmallOuch;

// [width, height, frameCount]
export const UIGraphicInfo = {
	[UIGraphic.Skull]: [32, 34, 1],
	[UIGraphic.FeedbackIcon]: [32, 16, 1],
	[UIGraphic.ChequeredIcon]: [32, 16, 1],
	[UIGraphic.Night]: [32, 32, 1],
	[UIGraphic.Dawn]: [32, 32, 1],
	[UIGraphic.Day]: [32, 32, 1],
	[UIGraphic.Dusk]: [32, 32, 1],
	[UIGraphic.CompassNorth]: [32, 32, 1],
	[UIGraphic.CompassEast]: [32, 32, 1],
	[UIGraphic.CompassSouth]: [32, 32, 1],
	[UIGraphic.CompassWest]: [32, 32, 1],
	[UIGraphic.Amberstar]: [32, 32, 1],
	[UIGraphic.Windchain]: [32, 16, 1],
	[UIGraphic.Light]: [16, 16, 1],
	[UIGraphic.ArmorProtection]: [16, 16, 1],
	[UIGraphic.WeaponPower]: [16, 16, 1],
	[UIGraphic.AntiMagic]: [16, 16, 1],
	[UIGraphic.Clairvoyance]: [16, 16, 1],
	[UIGraphic.Invisibility]: [16, 16, 1],
	[UIGraphic.EmptyItemSlot]: [16, 16, 1],
	[UIGraphic.DamageSplash]: [32, 32, 1],
	[UIGraphic.HealingCross]: [32, 32, 1],
	[UIGraphic.Ouch]: [32, 32, 1],
	[UIGraphic.MagicAnimation]: [32, 32, 3],
	[UIGraphic.EmptyCharSlot]: [32, 34, 1],
	[UIGraphic.HPBar]: [16, 17, 1],
	[UIGraphic.SPBar]: [16, 17, 1],
	[UIGraphic.Sword]: [16, 10, 1],
	[UIGraphic.Shield]: [16, 10, 1],
	[UIGraphic.RiddlemouthEyes]: [80, 29, 4],
	[UIGraphic.RiddlemouthMouth]: [80, 15, 8],
	[UIGraphic.CurseAnimation]: [16, 16, 16],
	[UIGraphic.AutomapIcons]: [16, 8, 14],
	[UIGraphic.SmallOuch]: [16, 16, 1],
};

export const ButtonType = makeEnum([
	'EmptyArea', 'ArrowUp', 'ArrowDown', 'ArrowRight', 'ArrowLeft', 'BuyHorse', 'BuyRaft', 'Sleep',
	'Stats', 'Equipment', 'Ear', 'Eye', 'UseMagic', 'FindTrap', 'DisarmTrap', 'PickLock', 'RotateLeft',
	'Mouth', 'GiveGold', 'Camp', 'GiveFood', 'UseTransport', 'BuyShip', 'Save', 'Load', 'Music',
	'NoMusic', 'ThumbsUp', 'ThumbsDown', 'Inventory', 'Exit', 'GatherGold', 'UseItem', 'GiveItem',
	'DropItem', 'ExamineItem', 'Sword', 'Shield', 'PartyPositions', 'MoveForward', 'MoveBackward',
	'StrafeRight', 'StrafeLeft', 'TurnRight', 'TurnLeft', 'ArrowUpRight', 'ArrowUpLeft',
	'ArrowDownRight', 'ArrowDownLeft', 'RotateRight', 'DistributeGold', 'DistributeFood', 'EnterDoor',
	'Advance', 'BuyItem', 'SellItem', 'Empty', 'Map', 'ReadScroll', 'Ok', 'Disk', 'GiveItemToPerson',
	'GiveFoodToPerson', 'GiveGoldToPerson', 'BuyFood', 'Quit', 'Flee', 'AskToJoin', 'Play', 'Forward',
	'DistributeItems',
]);
ButtonType.LastOriginalButton = ButtonType.Forward;

export const StatusIcon = makeEnum([
	'Dead', 'Attack', 'Parry', 'UseMagic', 'Flee', 'Move', 'UseItem', 'HandStop', 'HandOpen',
	'Stunned', 'Poisoned', 'Petrified', 'Diseased', 'Aging', 'Irritated', 'Mad', 'Sleeping',
	'Panicked', 'Blind', 'Overloaded',
]);
StatusIcon.LastStatusIcon = StatusIcon.Overloaded;

export const ItemGraphic = makeEnum(["RedCross","Chain","PearlChain","Brooch","Gem","LeatherArmor","Robe","Shoes","Boots","Belt","HornHelm","SunHelm","IronHelm","Rope","Unknown","RatHead","CrystalOrb","Arrow","Bolt","ShortBow","LongBow","CrossBow","Axe","BattleAxe","Knife","Flail","Mace","Hammer","Stick","Sabre","Sling","Trident","Dagger","ShortSword","LongSword","BroadSword","ChainMail","PlateMail","BandedArmor","KnightArmor","Buckler","RoundShield","SmallShield","LargeShield","Key","Lockpick","Cat","MorningStar","ThrowingAxe","Whip","ThrowingSickle","Unknown2","Wand","Club","Unknown3","Bone","Broom","PieceOfAmberstar","Unknown4","Harp","HolyHorn","Clover","YellowGem","Cloth","BlueMushroom","Egg","Amberstar","MagicWand","MagicDisc","Crowbar","EmptyPotion","UnknownPotion1","UnknownPotion2","UnknownPotion3","UnknownPotion4","UnknownPotion5","UnknownPotion6","UnknownPotion7","UnknownPotion8","UnknownPotion9","UnknownPotion10","UnknownPotion11","IronRing1","GoldenRing","Unknown5","SaphireRing","Collar","Flower","SmallRing","IronRing2","Trophy","Unknown6","UnknownGem1","RainbowGem","UnknownGem2","UnknownGem3","WishingCoins","Unknown7","Flute","NoteWithPen","Hat","Crystal","Unknown8","Unknown9","Book","Unknown10","Letter","SilverCutlery","RuneAlphabet","Ration","TextScroll","Map","Unknown11","Unknown12","Clock","MapLocator","Mushroom2","GoldenLetter","Letter2","Letter3","Bottle","MagicPicture","WoodenStaff","AnotherPotion","Pickaxe","Shovel","Unknown13","Unknown14"]);
export const ItemGraphicCount = 128;

export const UIText = makeEnum([
	'Skills', 'Attributes', 'Age', 'Languages', 'Body', 'Mind', 'Weight', 'Gold', 'Food', 'GoldFood',
	'Male', 'Female', 'MaleShort', 'FemaleShort', 'Both', 'Gender', 'Hands', 'Fingers', 'Classes',
	'Damage', 'Protection', 'WeightWithColon', 'Attribute', 'Skill', 'Magic', 'Cursed', 'Dialog',
	'EP', 'LP', 'SP', 'SLP', 'Colon', 'PercentTwoValues', 'NormalTwoValues', 'WeightTwoValues',
	'Grams', 'LPMax', 'SPMax', 'MBW', 'MBA', 'ColonCentered', 'OpenBracket', 'ThreeStars',
	'CloseBracket', 'EnterWord',
]);
export const UITextCount = 45;

export const CursorType = makeEnum([
	'Sword', 'ArrowUp2D', 'ArrowDown2D', 'ArrowRight2D', 'ArrowLeft2D', 'ArrowUpLeft2D',
	'ArrowUpRight2D', 'ArrowDownRight2D', 'ArrowDownLeft2D', 'ArrowForward3D', 'ArrowBackward3D',
	'ArrowRight3D', 'ArrowLeft3D', 'ArrowTurnRight3D', 'ArrowTurnLeft3D', 'Disk', 'Zzz', 'Eye',
	'Mouth', 'Ear', 'FullTurnRight', 'LittleArrowUp', 'LittleArrowDown', 'FullTurnLeft',
	'UserDefined', 'Gold', 'Food',
]);
export const CursorTypeCount = 27;

export const Image80x80 = makeEnum([
	'None', 'Camp', 'Graveyard', 'Guild', 'Merchant', 'PotionMerchant', 'Monster', 'HorseStable',
	'Healer', 'RatKing', 'Sage', 'HolyPerson', 'LockedChest', 'LockedDoor', 'ShipDealer', 'Inn',
	'Marmion', 'Riddlemouth', 'DeadPeople', 'MagicPrison', 'Dragon', 'OpenChest', 'CrystalOrb',
	'Library', 'MonsterOrb', 'Castle', 'Amberstar',
]);

export const Layout = {
	Map2D: 1, CharacterCreator: 1, Inventory: 2, Door: 3, Chest: 3, Place: 3, Battle: 4,
	Map3D: 5, Stats: 6, Save: 6, PictureText: 7, Conversation: 8, Riddlemouth: 9, Unknown: 10, Automap: 11,
};

export const Direction = { Up: 0, Right: 1, Down: 2, Left: 3, Keep: 4, North: 0, East: 1, South: 2, West: 3, Random: 4 };

export function directionOffset(dir) {
	switch (dir) {
		case 0: return [0, -1];
		case 1: return [1, 0];
		case 2: return [0, 1];
		case 3: return [-1, 0];
		default: return [0, 0];
	}
}

export const TravelType = makeEnum(['Walk', 'Horse', 'Raft', 'Ship', 'MagicDisc', 'Eagle', 'SuperChicken']);

export const MovesPerTimeProgress = [4, 8, 6, 8, 4, 12, 12];

export const TileFlags = {
	WaveAnimation: 0x1,
	BlockSight: 0x2,
	ChairOrBed: 0x8,
	RandomAnimation: 0x10,
	UnderlayHasPriority: 0x20,
	Foreground: 0x40,
	BlockAllMovement: 0x80,
	AllowWalk: 0x100,
	AllowHorse: 0x200,
	AllowRaft: 0x400,
	AllowShip: 0x800,
	AllowDisk: 0x1000,
	AllowEagle: 0x2000,
	AllowSwim: 0x4000,
	PartyInvisible: 0x8000,
	Poison: 0x80000000,
};

export const MapFlags = {
	Light: 0x01, LightChange: 0x02, Darkness: 0x04, CanUseMapViewSpell: 0x08,
	CanCamp: 0x10, Wilderness: 0x20, City: 0x40, Dungeon: 0x80,
};

export const DayTime = { Night: 0, Dawn: 1, Day: 2, Dusk: 3 };

export function hourToDayTime(hour) {
	if (hour >= 20 || hour < 6) return DayTime.Night;
	if (hour < 8) return DayTime.Dawn;
	if (hour >= 18) return DayTime.Dusk;
	return DayTime.Day;
}

export const LabBlockType = { None: 0, Wall: 1, Overlay: 2, Object: 3 };
export const BlockFacing = { FacingPlayer: 0, LeftOfPlayer: 1, RightOfPlayer: 2 };
export const PerspectiveLocation = makeEnum([
	'Forward3Left1', 'Forward3Right1', 'Forward3', 'Forward2Left1', 'Forward2Right1', 'Forward2',
	'Forward1Left1', 'Forward1Right1', 'Forward1', 'Left1', 'Right1', 'PlayerLocation',
	'Forward3Left2', 'Forward3Right2',
]);

export const EventType = makeEnum([
	'None', 'MapExit', 'Door', 'ShowPictureText', 'Chest', 'TrapDoor', 'Teleporter', 'WindGate',
	'Spinner', 'DamageField', 'AntiMagic', 'HPRegeneration', 'SPRegeneration', 'ExecuteTrap',
	'RiddleMouth', 'AttributeChange', 'ChangeTile', 'Encounter', 'Place', 'UseItem', 'DoorExit',
	'TravelExit', 'Altar', 'Outro',
]);

export const MapCharacterType = { Person: 0, Monster: 1, Popup: 2 };
export const MapCharacterWalkType = { Stationary: 0, Random: 1, Path: 2, Chase: 3 };
