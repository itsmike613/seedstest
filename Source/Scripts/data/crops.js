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
    },

    blueberry: {
        seed: "seed_blueberry",
        drop: { item: "blueberry", min: 1, max: 2 },
        bonus: { item: "seed_blueberry", min: 1, max: 2 },
        stages: [
            "./Source/Assets/Crops/Blueberry/stage1.png",
            "./Source/Assets/Crops/Blueberry/stage2.png",
            "./Source/Assets/Crops/Blueberry/stage3.png",
            "./Source/Assets/Crops/Blueberry/stage4.png",
            "./Source/Assets/Crops/Blueberry/stage5.png",
            "./Source/Assets/Crops/Blueberry/stage6.png",
            "./Source/Assets/Crops/Blueberry/stage7.png",
            "./Source/Assets/Crops/Blueberry/stage8.png",
            "./Source/Assets/Crops/Blueberry/stage9.png",
            "./Source/Assets/Crops/Blueberry/stage10.png",
        ],
        bush: {
            empty: "blueberry_bush_empty",
            full: "blueberry_bush_full",
            berry: { item: "blueberry", min: 2, max: 4 },
        }
    },

    raspberry: {
        seed: "seed_raspberry",
        drop: { item: "raspberry", min: 1, max: 2 },
        bonus: { item: "seed_raspberry", min: 1, max: 2 },
        stages: [
            "./Source/Assets/Crops/Raspberry/stage1.png",
            "./Source/Assets/Crops/Raspberry/stage2.png",
            "./Source/Assets/Crops/Raspberry/stage3.png",
            "./Source/Assets/Crops/Raspberry/stage4.png",
            "./Source/Assets/Crops/Raspberry/stage5.png",
            "./Source/Assets/Crops/Raspberry/stage6.png",
            "./Source/Assets/Crops/Raspberry/stage7.png",
            "./Source/Assets/Crops/Raspberry/stage8.png",
        ],
        bush: {
            empty: "raspberry_bush_empty",
            full: "raspberry_bush_full",
            berry: { item: "raspberry", min: 2, max: 4 },
        }
    }
};