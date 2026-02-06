// Source/Scripts/core/input.js

export const K = Object.create(null);

export function installInput(game) {
    game._musicStarted = false;

    addEventListener("resize", () => game.onResize());

    document.addEventListener("pointerlockchange", () => {
        game.lock = (document.pointerLockElement === game.root.el.c);
    });

    addEventListener("mousemove", (e) => {
        if (game.open) {
            game.root.el.carry.style.left = e.clientX + "px";
            game.root.el.carry.style.top = e.clientY + "px";
        }
        if (!game.lock || game.open) return;

        game.pl.yaw -= e.movementX * game.conf.sens;
        game.pl.pit -= e.movementY * game.conf.sens;
        game.clampPitch();
    });

    addEventListener("mousedown", (e) => {
        if (game.audio) game.audio.unlock();

        if (game.open) return;
        if (!game.lock) {
            game.root.el.c.requestPointerLock();

            if (game.audio && !game._musicStarted) {
                game._musicStarted = true;

                game.audio.startMusicPlaylist([
                    "./Source/Assets/Audio/Music/track1.m4a",
                    "./Source/Assets/Audio/Music/track2.m4a"
                ]);
            }
            return;
        }

        if (e.button === 0) game.mine.on = true;
        if (e.button === 2) game.use();
    });

    addEventListener("mouseup", (e) => {
        if (e.button === 0) {
            game.mine.on = false;
            game.mine.t = 0;
            game.crack.hide();
        }
    });

    addEventListener("contextmenu", (e) => e.preventDefault());

    addEventListener("keydown", (e) => {
        if (game.audio) game.audio.unlock();

        game.prevent(e);
        K[e.code] = true;

        if (e.code === "KeyE" && !e.repeat) {
            game.setOpen(!game.open);
            game.mine.on = false;
            game.mine.t = 0;
            game.crack.hide();
        }

        if (e.code === "Tab") {
            e.preventDefault();
            game.tab = true;
            game.root.el.tab.classList.remove("hide");
        }

        if (e.code.startsWith("Digit")) {
            const n = Number(e.code.slice(5)) - 1;
            if (n >= 0 && n < 9) game.bag.sel = n;
        }
    });

    addEventListener("keyup", (e) => {
        game.prevent(e);
        K[e.code] = false;

        if (e.code === "Tab") {
            e.preventDefault();
            game.tab = false;
            game.root.el.tab.classList.add("hide");
        }
    });
}