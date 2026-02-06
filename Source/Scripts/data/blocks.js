// Source/Scripts/data/blocks.js

export const blocks = {
    grass: { k: "grass", img: "./Source/Assets/Blocks/grass.png", breakable: true },
    dirt: { k: "dirt", img: "./Source/Assets/Blocks/dirt.png", breakable: true },
    unbreak: { k: "unbreak", img: "./Source/Assets/Blocks/unbreakable.png", breakable: false },
    tilled_dry: { k: "tilled_dry", img: "./Source/Assets/Blocks/unhydrated.png", breakable: true },
    tilled_wet: { k: "tilled_wet", img: "./Source/Assets/Blocks/hydrated.png", breakable: true },
    water: { k: "water", img: "./Source/Assets/Blocks/water.png", breakable: false },
    path: { k: "path", img: "./Source/Assets/Blocks/path.png", breakable: true },
    blueberry_bush_empty: { k: "blueberry_bush_empty", img: "./Source/Assets/Crops/Blueberry/empty_bush.png", breakable: true },
    blueberry_bush_full: { k: "blueberry_bush_full", img: "./Source/Assets/Crops/Blueberry/full_bush.png", breakable: true },
    raspberry_bush_empty: { k: "raspberry_bush_empty", img: "./Source/Assets/Crops/Raspberry/empty_bush.png", breakable: true },
    raspberry_bush_full: { k: "raspberry_bush_full", img: "./Source/Assets/Crops/Raspberry/full_bush.png", breakable: true },
};