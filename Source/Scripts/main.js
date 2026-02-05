// Source/Scripts/main.js

import { root } from "./ui/dom.js";
import { Game } from "./core/game.js";

const game = new Game(root);
game.start();