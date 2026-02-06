// Source/Scripts/core/game.js

import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

import { conf } from "../config/conf.js";
import { W, H, Y1, INF, YB } from "../config/constants.js";
import { clamp } from "../util/math.js";
import { key } from "../util/gridKey.js";

import { items } from "../data/items.js";
import { blocks } from "../data/blocks.js";

import { Bag } from "../inventory/bag.js";
import { UI } from "../ui/ui.js";

import { Tex } from "../gfx/tex.js";
import { Sky } from "../gfx/sky.js";
import { CrackOverlay } from "../gfx/crackOverlay.js";
import { Hologram } from "../gfx/hologram.js";

import { Vox } from "../world/world.js";
import { raycastBlock } from "./raycast.js";
import { K, installInput } from "./input.js";

import { AudioManager } from "./audio.js";

export class Game {
    constructor(root) {
        this.root = root;
        this.conf = conf;

        // --- three ---
        this.ren = new THREE.WebGLRenderer({ canvas: this.root.el.c, antialias: true });
        this.ren.setPixelRatio(Math.min(devicePixelRatio, 2));
        this.ren.setSize(innerWidth, innerHeight, false);

        this.ren.outputColorSpace = THREE.SRGBColorSpace;
        this.ren.toneMapping = THREE.ACESFilmicToneMapping;
        this.ren.toneMappingExposure = 1.08;

        this.ren.shadowMap.enabled = true;
        this.ren.shadowMap.type = THREE.PCFSoftShadowMap;

        this.ren.setClearColor(0x69b7ff, 1);

        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog(0x69b7ff, 22, 62);

        this.cam = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.01, 200);

        // --- lighting ---
        this.sun = new THREE.DirectionalLight(0xffffff, 1.05);
        this.sun.position.set(10, 18, 8);
        this.sun.castShadow = true;
        this.sun.shadow.mapSize.set(1024, 1024);
        this.sun.shadow.camera.near = 1;
        this.sun.shadow.camera.far = 60;
        this.sun.shadow.camera.left = -18;
        this.sun.shadow.camera.right = 18;
        this.sun.shadow.camera.top = 18;
        this.sun.shadow.camera.bottom = -18;
        this.sun.shadow.bias = -0.00035;
        this.scene.add(this.sun);

        this.hemi = new THREE.HemisphereLight(0xcfefff, 0x3b3f4a, 0.55);
        this.scene.add(this.hemi);
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.20));

        // --- sky ---
        this.sky = new Sky(this.scene);

        // --- world ---
        this.tex = new Tex();
        this.vox = new Vox(this.scene, this.tex);

        // --- audio ---
        this.audio = new AudioManager();

        // pickup sound only when pickup succeeds and item is removed
        this.vox.setOnPickup(() => {
            this.audio.playSfx("pickup", {
                volume: 0.65,
                pitchRandom: 0.06,
                cooldown: 0.04,
                maxVoices: 2
            });
        });

        // --- player ---
        this.pl = {
            p: new THREE.Vector3(1.35, 2.65, 1.35),
            v: new THREE.Vector3(),
            yaw: 0,
            pit: 0,
            on: false
        };

        // --- inventory ---
        this.bag = new Bag();
        this.seedInitialHotbar();

        // --- state ---
        this.lock = false;
        this.open = false;
        this.tab = false;

        // mining state
        this.mine = {
            on: false,
            k: "",
            p: { x: 0, y: 0, z: 0 },
            t: 0,
            need: 0.8,
            hitT: 0
        };

        // footsteps state (timed steps)
        this._foot = { t: 0 };

        // --- raycast ---
        this.ray = new THREE.Raycaster();
        this.ray.far = conf.reach;

        // --- visuals ---
        this.crack = new CrackOverlay(this.scene, this.tex);
        this.holo = new Hologram(this.scene);

        // --- UI ---
        this.ui = new UI(this.root.el, this.bag, (e) => this.slotDown(e));

        // --- fps ---
        this.fpa = 0; this.fpf = 0; this.fps = 0;

        // --- loop timing ---
        this.last = performance.now();
        this._hydAcc = 0;
        this.loop = this.loop.bind(this);
    }

    seedInitialHotbar() {
        this.bag.hot[0] = { k: "hoe_wood", c: 1 };
        this.bag.hot[1] = { k: "shovel_wood", c: 1 };
        this.bag.hot[2] = { k: "bucket_empty", c: 1 };
        this.bag.hot[3] = { k: "seed_wheat", c: 3 };
        this.bag.hot[4] = { k: "seed_carrot", c: 3 };

        this.bag.hot[5] = { k: "seed_blueberry", c: 3 };
        this.bag.hot[6] = { k: "seed_raspberry", c: 3 };
    }

    msg(t) {
        this.root.el.msg.textContent = t;
        this.root.el.msg.classList.remove("hide");
        clearTimeout(this.msg._t);
        this.msg._t = setTimeout(() => this.root.el.msg.classList.add("hide"), 1100);
    }

    facing() {
        const cx = -Math.sin(this.pl.yaw) * Math.cos(this.pl.pit);
        const cy = Math.sin(this.pl.pit);
        const cz = -Math.cos(this.pl.yaw) * Math.cos(this.pl.pit);
        return new THREE.Vector3(cx, cy, cz).normalize();
    }

    clampPitch() {
        this.pl.pit = clamp(this.pl.pit, -1.45, 1.45);
    }

    camSync() {
        this.cam.position.copy(this.pl.p);
        this.cam.rotation.order = "YXZ";
        this.cam.rotation.y = this.pl.yaw;
        this.cam.rotation.x = this.pl.pit;
    }

    prevent(e) {
        if (this.lock || this.open) {
            if (e.code === "Space" || e.code === "Tab" || e.ctrlKey || e.metaKey || e.altKey) e.preventDefault();
        }
    }

    setOpen(v) {
        this.open = v;
        this.ui.setOpen(v);
        if (this.open) {
            if (document.pointerLockElement) document.exitPointerLock();
        } else {
            this.root.el.c.requestPointerLock();
        }
    }

    onResize() {
        this.cam.aspect = innerWidth / innerHeight;
        this.cam.updateProjectionMatrix();
        this.ren.setSize(innerWidth, innerHeight, false);
    }

    // -----------------------------
    // UI inventory interactions
    // -----------------------------
    slotDown(e) {
        e.preventDefault();
        const el = e.currentTarget;
        const i = Number(el.dataset.i);
        const hot = el.dataset.h === "1";
        const shift = e.shiftKey;

        if (shift) { this.bag.moveQuick(i, hot); return; }

        const arr = hot ? this.bag.hot : this.bag.inv;
        const cur = arr[i];

        if (e.button === 2) {
            if (!this.bag.carry && cur && items[cur.k].stack > 1 && cur.c > 1) {
                const half = Math.ceil(cur.c / 2);
                this.bag.carry = { k: cur.k, c: half };
                cur.c -= half;
                if (cur.c <= 0) arr[i] = null;
                return;
            }
            if (this.bag.carry) {
                const it = items[this.bag.carry.k];
                if (!cur) {
                    arr[i] = { k: this.bag.carry.k, c: 1 };
                    this.bag.carry.c -= 1;
                    if (this.bag.carry.c <= 0) this.bag.carry = null;
                    return;
                }
                if (cur.k === this.bag.carry.k && it.stack > 1 && cur.c < it.stack) {
                    cur.c += 1;
                    this.bag.carry.c -= 1;
                    if (this.bag.carry.c <= 0) this.bag.carry = null;
                    return;
                }
            }
            return;
        }

        if (!this.bag.carry) {
            if (cur) { arr[i] = null; this.bag.carry = cur; }
            return;
        }

        const left = this.bag.put(i, hot, this.bag.carry);
        this.bag.carry = left;
    }

    // -----------------------------
    // Movement / Collision
    // -----------------------------
    damp(v, t, k, dt) {
        const a = 1 - Math.exp(-k * dt);
        return v + (t - v) * a;
    }

    ctrl(dt) {
        const f = this.facing();
        const up = new THREE.Vector3(0, 1, 0);
        const r = new THREE.Vector3().crossVectors(f, up).normalize();

        let ax = 0, az = 0;
        if (K["KeyW"]) { ax += f.x; az += f.z; }
        if (K["KeyS"]) { ax -= f.x; az -= f.z; }
        if (K["KeyA"]) { ax -= r.x; az -= r.z; }
        if (K["KeyD"]) { ax += r.x; az += r.z; }

        const len = Math.hypot(ax, az);
        if (len > 0) { ax /= len; az /= len; }

        const sp = (K["ControlLeft"] || K["ControlRight"]) ? conf.sprint : conf.walk;
        const fr = this.pl.on ? conf.fr : conf.air;

        this.pl.v.x = this.damp(this.pl.v.x, ax * sp, fr, dt);
        this.pl.v.z = this.damp(this.pl.v.z, az * sp, fr, dt);

        if (this.pl.on && K["Space"]) {
            this.pl.v.y = conf.jump;
            this.pl.on = false;
        }

        this.pl.v.y -= conf.grav * dt;
    }

    collide(dt) {
        const R = 0.25;
        const HEIGHT = 1.62;
        const EPS = 0.001;

        const solidTop = (bx, bz) => {
            if (bx < 0 || bz < 0 || bx >= W || bz >= H) return -Infinity;
            return this.vox.topAt(bx, bz);
        };

        // --- vertical ---
        this.pl.p.y += this.pl.v.y * dt;

        const cx = clamp(Math.floor(this.pl.p.x), 0, W - 1);
        const cz = clamp(Math.floor(this.pl.p.z), 0, H - 1);
        const floorTop = solidTop(cx, cz);

        const feet = this.pl.p.y - HEIGHT;
        if (feet < floorTop) {
            this.pl.p.y += (floorTop - feet);
            this.pl.v.y = 0;
            this.pl.on = true;
        } else {
            this.pl.on = false;
        }

        const feetY = this.pl.p.y - HEIGHT;

        const resolveX = (x, z) => {
            const minX = clamp(Math.floor(x - R), 0, W - 1);
            const maxX = clamp(Math.floor(x + R), 0, W - 1);
            const minZ = clamp(Math.floor(z - R), 0, H - 1);
            const maxZ = clamp(Math.floor(z + R), 0, H - 1);

            let nx = x;

            for (let bz = minZ; bz <= maxZ; bz++) {
                for (let bx = minX; bx <= maxX; bx++) {
                    const top = solidTop(bx, bz);
                    if (top <= feetY + EPS) continue;

                    const closestX = clamp(nx, bx, bx + 1);
                    const closestZ = clamp(z, bz, bz + 1);

                    const dx = nx - closestX;
                    const dz = z - closestZ;
                    const dd = dx * dx + dz * dz;

                    if (dd < R * R - 1e-9) {
                        if (dx >= 0) nx = (closestX + Math.sqrt(Math.max(0, R * R - dz * dz))) + EPS;
                        else nx = (closestX - Math.sqrt(Math.max(0, R * R - dz * dz))) - EPS;
                    }
                }
            }
            return nx;
        };

        const resolveZ = (x, z) => {
            const minX = clamp(Math.floor(x - R), 0, W - 1);
            const maxX = clamp(Math.floor(x + R), 0, W - 1);
            const minZ = clamp(Math.floor(z - R), 0, H - 1);
            const maxZ = clamp(Math.floor(z + R), 0, H - 1);

            let nz = z;

            for (let bz = minZ; bz <= maxZ; bz++) {
                for (let bx = minX; bx <= maxX; bx++) {
                    const top = solidTop(bx, bz);
                    if (top <= feetY + EPS) continue;

                    const closestX = clamp(x, bx, bx + 1);
                    const closestZ = clamp(nz, bz, bz + 1);

                    const dx = x - closestX;
                    const dz = nz - closestZ;
                    const dd = dx * dx + dz * dz;

                    if (dd < R * R - 1e-9) {
                        if (dz >= 0) nz = (closestZ + Math.sqrt(Math.max(0, R * R - dx * dx))) + EPS;
                        else nz = (closestZ - Math.sqrt(Math.max(0, R * R - dx * dx))) - EPS;
                    }
                }
            }
            return nz;
        };

        let nx = this.pl.p.x + this.pl.v.x * dt;
        nx = clamp(nx, R, W - R);
        nx = resolveX(nx, this.pl.p.z);

        let nz = this.pl.p.z + this.pl.v.z * dt;
        nz = clamp(nz, R, H - R);
        nz = resolveZ(nx, nz);

        this.pl.p.x = nx;
        this.pl.p.z = nz;
    }

    async hit() {
        this.camSync();
        return raycastBlock({
            cam: this.cam,
            dir: this.facing(),
            raycaster: this.ray,
            meshes: this.vox.mesh,
            far: conf.reach
        });
    }

    _footNameUnderPlayer() {
        const bx = clamp(Math.floor(this.pl.p.x), 0, W - 1);
        const bz = clamp(Math.floor(this.pl.p.z), 0, H - 1);
        const id = this.vox.get(bx, Y1, bz);

        if (id === "path") return "footstep_path";
        if (id === "dirt" || id === "tilled_dry" || id === "tilled_wet") return "footstep_dirt";
        return "footstep_grass";
    }

    _footInterval() {
        // sprint key drives cadence; also feel free to tune these numbers
        const sprint = (K["ControlLeft"] || K["ControlRight"]);
        return sprint ? 0.28 : 0.38;
    }

    async _footTick(dt, suppressThisFrame) {
        this._foot.t = Math.max(0, this._foot.t - dt);
        if (suppressThisFrame) return;

        const sp = Math.hypot(this.pl.v.x, this.pl.v.z);
        const moving = this.lock && !this.open && this.pl.on && sp > 0.35;

        if (!moving) {
            this._foot.t = 0;
            return;
        }

        if (this._foot.t > 0) return;

        const name = this._footNameUnderPlayer();

        // footsteps are routed to the "foot" bus, so ducking is clean
        this.audio.playSfx(name, {
            bus: "foot",
            volume: 0.16,
            pitchRandom: 0.08,
            cooldown: 0.0,
            maxVoices: 1
        });

        this._foot.t = this._footInterval();
    }

    async use() {
        const h = await this.hit();
        if (!h) return;

        if (h.y === YB) {
            const b = this.vox.bushAt(h.x, h.y, h.z);
            if (b) {
                const r = await this.vox.useBush(h.x, h.z);
                if (r.ok) this.audio.playSfx("harvest", { volume: 0.85, pitchRandom: 0.06, cooldown: 0.03 });
                if (!r.ok && r.why === "not_ready") this.msg("Not ready");
                return;
            }
        }

        const s = this.bag.hot[this.bag.sel];
        if (!s) return;

        const held = items[s.k];

        if (s.k === "hoe_wood") {
            if (h.y === Y1) {
                const ok = await this.vox.till(h.x, h.z);
                if (ok) {
                    this.audio.playSfx("hoe", { volume: 0.8, pitchRandom: 0.06, cooldown: 0.03 });
                } else {
                    this.msg("Needs water within 5");
                }
            }
            return;
        }

        if (s.k === "shovel_wood") {
            if (h.y === Y1) {
                const id = this.vox.get(h.x, h.y, h.z);
                if (id === "grass") {
                    await this.vox.set(h.x, h.y, h.z, "path");
                    this.audio.playSfx("shovel", { volume: 0.75, pitchRandom: 0.06, cooldown: 0.03 });
                }
            }
            return;
        }

        if (held.t === "seed") {
            if (h.y === Y1) {
                const type =
                    (s.k === "seed_wheat") ? "wheat" :
                        (s.k === "seed_carrot") ? "carrot" :
                            (s.k === "seed_blueberry") ? "blueberry" :
                                (s.k === "seed_raspberry") ? "raspberry" :
                                    null;

                if (!type) return;
                const ok = await this.vox.plant(h.x, h.z, type);
                if (ok) {
                    this.audio.playSfx("plant", { volume: 0.78, pitchRandom: 0.08, cooldown: 0.03 });
                    s.c -= 1;
                    if (s.c <= 0) this.bag.hot[this.bag.sel] = null;
                }
            }
            return;
        }

        if (s.k === "bucket_empty") {
            if (h.x === INF.x && h.y === INF.y && h.z === INF.z) {
                this.bag.hot[this.bag.sel] = { k: "bucket_full", c: 1 };
                this.audio.playSfx("bucket_fill", { volume: 0.9, pitchRandom: 0.04, cooldown: 0.06, maxVoices: 1 });
                this.msg("Filled");
                return;
            }
            if (this.vox.get(h.x, h.y, h.z) === "water" && h.y === Y1) {
                await this.vox.set(h.x, h.y, h.z, null);
                this.bag.hot[this.bag.sel] = { k: "bucket_full", c: 1 };
                this.audio.playSfx("bucket_fill", { volume: 0.9, pitchRandom: 0.04, cooldown: 0.06, maxVoices: 1 });
                this.msg("Filled");
                return;
            }
            return;
        }

        if (s.k === "bucket_full") {
            if (h.py !== Y1) return;
            if (h.px === INF.x && h.py === INF.y && h.pz === INF.z) return;

            const dx = h.px + 0.5 - this.pl.p.x;
            const dz = h.pz + 0.5 - this.pl.p.z;
            if (Math.hypot(dx, dz) < 0.6) return;

            await this.vox.place(h.px, h.py, h.pz, "water");
            this.bag.hot[this.bag.sel] = { k: "bucket_empty", c: 1 };
            this.audio.playSfx("bucket_pour", { volume: 0.9, pitchRandom: 0.04, cooldown: 0.06, maxVoices: 1 });
            this.msg("Poured");
            return;
        }

        if (s.k === "dirt") {
            if (h.py !== Y1) return;
            if (h.px === INF.x && h.py === INF.y && h.pz === INF.z) return;

            const dx = h.px + 0.5 - this.pl.p.x;
            const dz = h.pz + 0.5 - this.pl.p.z;
            if (Math.hypot(dx, dz) < 0.6) return;

            const ok = await this.vox.place(h.px, h.py, h.pz, "dirt");
            if (ok) {
                this.audio.playSfx("place_dirt", { volume: 0.72, pitchRandom: 0.06, cooldown: 0.03 });
                s.c -= 1;
                if (s.c <= 0) this.bag.hot[this.bag.sel] = null;
            }
            return;
        }
    }

    hardness(id) {
        if (id === "grass" || id === "dirt" || id === "tilled_dry" || id === "tilled_wet") return 0.85;
        if (id === "water") return 0.25;
        return 0.9;
    }

    speedFor(id) {
        const s = this.bag.hot[this.bag.sel];
        const held = s ? s.k : "";
        if (held === "shovel_wood") {
            if (id === "grass" || id === "dirt" || id === "tilled_dry" || id === "tilled_wet") return 0.35;
        }
        return this.hardness(id);
    }

    // Returns true if a break sound played this frame (so we can suppress footsteps once).
    async mineTick(dt) {
        // if not actively mining, release duck quickly and reset the hit timer
        if (!this.mine.on || this.open || !this.lock) {
            this.audio.setFootDuck(1.0, 0.03, 0.12);
            this.mine.hitT = 0;
            return false;
        }

        const h = await this.hit();
        if (!h) {
            this.audio.setFootDuck(1.0, 0.03, 0.12);
            this.mine.t = 0;
            this.mine.hitT = 0;
            this.crack.hide();
            return false;
        }

        // crop harvesting via mining
        if (h.y === Y1) {
            const ck = key(h.x, Y1, h.z);
            if (this.vox.crop.has(ck)) {
                const ok = await this.vox.breakCrop(h.x, h.z);
                if (ok) this.audio.playSfx("harvest", { volume: 0.85, pitchRandom: 0.06, cooldown: 0.03 });
                this.audio.setFootDuck(1.0, 0.03, 0.12);
                this.mine.t = 0;
                this.mine.hitT = 0;
                this.crack.hide();
                return ok; // treat as "important sound happened"
            }
        }

        const id = this.vox.get(h.x, h.y, h.z);
        if (!id) { this.audio.setFootDuck(1.0, 0.03, 0.12); this.mine.t = 0; this.mine.hitT = 0; this.crack.hide(); return false; }
        if (!blocks[id].breakable) { this.audio.setFootDuck(1.0, 0.03, 0.12); this.mine.t = 0; this.mine.hitT = 0; this.crack.hide(); return false; }
        if (h.x === INF.x && h.y === INF.y && h.z === INF.z) { this.audio.setFootDuck(1.0, 0.03, 0.12); this.mine.t = 0; this.mine.hitT = 0; this.crack.hide(); return false; }

        // valid mining target -> duck footsteps smoothly
        this.audio.setFootDuck(0.55, 0.03, 0.12);

        const same = (this.mine.k === id && this.mine.p.x === h.x && this.mine.p.y === h.y && this.mine.p.z === h.z);
        if (!same) {
            this.mine.k = id;
            this.mine.p = { x: h.x, y: h.y, z: h.z };
            this.mine.t = 0;
            this.mine.need = this.speedFor(id);
            this.mine.hitT = 0; // reset cadence when target changes
        }

        this.mine.need = this.speedFor(id);
        this.mine.t += dt;

        // controlled mining hit cadence (not every frame)
        this.mine.hitT = Math.max(0, this.mine.hitT - dt);
        if (this.mine.hitT <= 0) {
            this.audio.playSfx("mine_hit", {
                volume: 0.42,
                pitchRandom: 0.08,
                cooldown: 0,
                maxVoices: 1
            });
            this.mine.hitT = 0.13; // ~7.7 hits/sec
        }

        const prog = clamp(this.mine.t / this.mine.need, 0, 1);
        const stage = Math.min(5, Math.floor(prog * 6));
        this.crack.show(h.x, h.y, h.z, stage);

        if (this.mine.t >= this.mine.need) {
            const res = await this.vox.breakBlock(h.x, h.y, h.z);
            if (res) {
                // payoff sound louder than hit
                this.audio.playSfx("mine_break", { volume: 0.82, pitchRandom: 0.06, cooldown: 0.02, maxVoices: 2 });
            }

            this.mine.t = 0;
            this.mine.hitT = 0;
            this.crack.hide();

            // suppress footstep this frame if an important sound happened
            return !!res;
        }

        return false;
    }

    tabTick(dt) {
        this.fpa += dt; this.fpf++;
        if (this.fpa >= 0.25) { this.fps = Math.round(this.fpf / this.fpa); this.fpa = 0; this.fpf = 0; }
        if (this.tab) {
            this.root.el.fps.textContent = `FPS: ${this.fps}`;
            this.root.el.pos.textContent = `XYZ: ${this.pl.p.x.toFixed(2)} ${this.pl.p.y.toFixed(2)} ${this.pl.p.z.toFixed(2)}`;
        }
    }

    async loop() {
        const t = performance.now();
        const dt = Math.min(0.033, (t - this.last) / 1000);
        this.last = t;

        if (this.lock && !this.open) {
            this.ctrl(dt);
            this.collide(dt);
        } else {
            this.pl.v.y = Math.max(this.pl.v.y - conf.grav * dt, -20);
            this.collide(dt);
        }

        this.camSync();

        const suppressStep = await this.mineTick(dt);

        this._hydAcc += dt;
        if (this._hydAcc >= 0.25) {
            this._hydAcc = 0;
            await this.vox.hydrateTick();
        }

        await this.vox.growTick();
        await this.vox.itemTick(dt, this.pl.p, this.bag);

        this.vox.visualTick();
        this.sky.tick();

        this.vox.partsTick(dt, this.cam);

        this.holo.tick(this.cam);
        this.tabTick(dt);

        await this._footTick(dt, suppressStep);

        this.ui.draw();
        this.ren.render(this.scene, this.cam);

        requestAnimationFrame(this.loop);
    }

    async start() {
        this.ui.build();
        installInput(this);

        this.sky.init();

        await this.crack.init();
        await this.vox.init();
        await this.holo.init();

        this.pl.p.set(1.35, 2.65, 1.35);

        this.audio.preloadSfx([
            "footstep_grass", "footstep_path", "footstep_dirt",
            "hoe", "shovel", "mine_hit", "mine_break",
            "pickup", "harvest", "plant", "place_dirt",
            "bucket_fill", "bucket_pour"
        ]);

        this.msg("Click to play");
        requestAnimationFrame(this.loop);
    }
}
