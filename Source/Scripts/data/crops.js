// Source/Scripts/data/crops.js

export const crops = {
    wheat: {
        seed: "seed_wheat",
        drop: { item: "wheat", min: 1, max: 1 },
        bonus: { item: "seed_wheat", min: 1, max: 2 },
        stages: [
            "./Source/Assets/Crops/Wheat/stage1.png",
            "./Source/Assets/Crops/Wheat/stage2.png",
            "./Source/Assets/Crops/Wheat/stage3.png",
            "./Source/Assets/Crops/Wheat/stage4.png",
            "./Source/Assets/Crops/Wheat/stage5.png",
            "./Source/Assets/Crops/Wheat/stage6.png",
        ]
    },
    carrot: {
        seed: "seed_carrot",
        drop: { item: "carrot", min: 1, max: 2 },
        bonus: { item: "seed_carrot", min: 1, max: 2 },
        stages: [
            "./Source/Assets/Crops/Carrot/stage1.png",
            "./Source/Assets/Crops/Carrot/stage2.png",
            "./Source/Assets/Crops/Carrot/stage3.png",
            "./Source/Assets/Crops/Carrot/stage4.png",
        ]
    }
};
