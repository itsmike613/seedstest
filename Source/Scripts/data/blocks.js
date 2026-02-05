// Source/Scripts/data/blocks.js

export const blocks = {
    grass: { k: "grass", img: "./Source/Assets/Blocks/grass.png", breakable: true },
    dirt: { k: "dirt", img: "./Source/Assets/Blocks/dirt.png", breakable: true },
    unbreak: { k: "unbreak", img: "./Source/Assets/Blocks/unbreakable.png", breakable: false },
    tilled_dry: { k: "tilled_dry", img: "./Source/Assets/Blocks/unhydrated.png", breakable: true },
    tilled_wet: { k: "tilled_wet", img: "./Source/Assets/Blocks/hydrated.png", breakable: true },
    water: { k: "water", img: "./Source/Assets/Blocks/water.png", breakable: true },
    path: { k: "path", img: "./Source/Assets/Blocks/path.png", breakable: true }
};