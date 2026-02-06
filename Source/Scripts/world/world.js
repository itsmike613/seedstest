// Source/Scripts/world/world.js

import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

import { conf } from "../config/conf.js";
import { W, H, Y0, Y1, INF, YB } from "../config/constants.js";
import { blocks } from "../data/blocks.js";
import { crops } from "../data/crops.js";
import { items } from "../data/items.js";
import { now, rnd } from "../util/math.js";
import { key, parse } from "../util/gridKey.js";

import { VoxRenderer } from "./renderer.js";
import { ItemSystem } from "./items.js";
import { ParticleSystem } from "./particles.js";

export class Vox {
    constructor(scene, tex) {
        this.scene = scene;
        this.tex = tex;

        this.map = new Map();    // key(x,y,z) => id
        this.tilled = new Map(); // key(x,Y1,z) => {wet, ts}
        this.crop = new Map();   // key(x,Y1,z) => {type, st, ts}

        this.bush = new Map();

        this._hydration = new Uint8Array(W * H);
        this._hydrationDirty = true;

        this.renderer = new VoxRenderer(scene, tex);

        // pickup callback is set later by Game via setOnPickup()
        this._onPickup = null;

        this.items = new ItemSystem(scene, tex, (x, z) => this.topAt(x, z), () => {
            if (this._onPickup) this._onPickup();
        });

        this.parts = new ParticleSystem(scene, tex);
    }

    setOnPickup(fn) { this._onPickup = fn; }

    inPad(x, z) {
        return x >= 0 && x < W && z >= 0 && z < H;
    }

    get(x, y, z) {
        if (!this.inPad(x, z)) return null;
        return this.map.get(key(x, y, z));
    }

    async set(x, y, z, id) {
        const k = key(x, y, z);
        const prev = this.map.get(k);
        if (prev === id) return;

        if (y === Y1 && (prev === "water" || id === "water")) {
            this._hydrationDirty = true;
        }

        if (!id) this.map.delete(k);
        else this.map.set(k, id);

        await this.renderer.setBlockMesh(x, y, z, id, prev);
    }

    async init() {
        for (let x = 0; x < W; x++) {
            for (let z = 0; z < H; z++) {
                await this.set(x, Y0, z, "unbreak");
                await this.set(x, Y1, z, "grass");
            }
        }
        await this.set(INF.x, INF.y, INF.z, "water");
        this._recomputeHydration();
    }

    _hidx(x, z) { return x * H + z; }

    _recomputeHydration() {
        this._hydration.fill(0);

        const water = [];
        for (const [k, id] of this.map) {
            if (id !== "water") continue;
            const p = parse(k);
            if (p.y !== Y1) continue;
            water.push({ x: p.x, z: p.z });
        }
        if (!water.length) { this._hydrationDirty = false; return; }

        const r = conf.hyd;
        const r2 = r * r;

        for (let x = 0; x < W; x++) {
            for (let z = 0; z < H; z++) {
                if (!this.inPad(x, z)) continue;

                let wet = false;
                for (let i = 0; i < water.length && !wet; i++) {
                    const dx0 = water[i].x - x;
                    const dz0 = water[i].z - z;
                    if (dx0 > r || dx0 < -r || dz0 > r || dz0 < -r) continue;
                    if ((dx0 * dx0 + dz0 * dz0) <= r2) wet = true;
                }
                if (wet) this._hydration[this._hidx(x, z)] = 1;
            }
        }

        this._hydrationDirty = false;
    }

    nearWater(x, z) {
        if (!this.inPad(x, z)) return false;
        if (this._hydrationDirty) this._recomputeHydration();
        return this._hydration[this._hidx(x, z)] === 1;
    }

    async till(x, z) {
        const id = this.get(x, Y1, z);
        if (id !== "grass" && id !== "dirt") return false;
        if (!this.nearWater(x, z)) return false;

        if (this.bush.has(key(x, YB, z))) return false;

        const k = key(x, Y1, z);
        this.tilled.set(k, { wet: true, ts: now() });

        await this.set(x, Y1, z, "tilled_wet");
        return true;
    }

    async unTill(x, z) {
        const k = key(x, Y1, z);
        if (!this.tilled.has(k)) return false;
        if (this.crop.has(k)) return false;

        this.tilled.delete(k);
        await this.set(x, Y1, z, "dirt");
        this.regrowLater(x, Y1, z);
        return true;
    }

    async water(x, z) {
        const id = this.get(x, Y1, z);
        if (id !== "tilled_dry") return false;

        const k = key(x, Y1, z);
        const t = this.tilled.get(k);
        t.wet = true;
        t.ts = now();

        await this.set(x, Y1, z, "tilled_wet");
        return true;
    }

    async unWater(x, z) {
        const id = this.get(x, Y1, z);
        if (id !== "water") return false;

        await this.set(x, Y1, z, "grass");
        this.regrowLater(x, Y1, z);
        return true;
    }

    async placeWater(x, z) {
        const id = this.get(x, Y1, z);
        if (id !== "grass" && id !== "dirt") return false;
        if (this.bush.has(key(x, YB, z))) return false;

        await this.set(x, Y1, z, "water");
        return true;
    }

    async hydrateTick() {
        if (this._hydrationDirty) this._recomputeHydration();
        const t = now();
        for (const [k, v] of this.tilled) {
            const p = parse(k);
            const has = this.nearWater(p.x, p.z);

            if (has) {
                if (!v.wet && (t - v.ts) > conf.hydelay) {
                    v.wet = true; v.ts = t;
                    await this.set(p.x, p.y, p.z, "tilled_wet");
                }
            } else {
                if (v.wet && (t - v.ts) > conf.unhydelay) {
                    v.wet = false; v.ts = t;
                    await this.set(p.x, p.y, p.z, "tilled_dry");

                    const ck = key(p.x, p.y, p.z);
                    if (this.crop.has(ck)) {
                        const c = this.crop.get(ck);
                        await this.dropCrop(p.x, p.y, p.z, c.type, true);
                        this.killCrop(p.x, p.z);

                        await this.set(p.x, p.y, p.z, "dirt");
                        this.tilled.delete(ck);
                        this.regrowLater(p.x, p.y, p.z);
                    }
                }
            }
        }
    }

    async growTick() {
        const t = now();

        for (const [k, b] of this.bush) {
            if (b.full) continue;
            if ((t - b.ts) < conf.berry) continue;

            const p = parse(k);
            const cur = this.get(p.x, p.y, p.z);
            if (!cur || !this.isBushId(cur)) {
                this.bush.delete(k);
                continue;
            }

            await this.setBushVisual(p.x, p.z, true);
        }

        for (const [k, c] of this.crop) {
            if ((t - c.ts) < conf.grow) continue;
            c.ts = t;

            const p = parse(k);
            const soil = this.get(p.x, p.y, p.z);
            const wet = (soil === "tilled_wet");
            if (!wet && Math.random() < 0.6) continue;

            const max = crops[c.type].stages.length - 1;
            if (c.st < max) {
                c.st++;
                await this.renderer.setCropPlanes(p.x, p.y, p.z, c.type, c.st);

                if (c.st >= max && crops[c.type].bush) {
                    await this.convertCropToBush(p.x, p.z, c.type);
                }
            }
        }
    }

    regrowLater(x, y, z) {
        setTimeout(async () => {
            if (this.get(x, y, z) === "dirt") await this.set(x, y, z, "grass");
        }, conf.regrow * 1000);
    }

    async breakBlock(x, y, z) {
        if (x === INF.x && y === INF.y && z === INF.z) return null;

        const id = this.get(x, y, z);
        if (!id) return null;
        if (!blocks[id].breakable) return null;

        if (y === YB) {
            const ok = await this.breakBush(x, z);
            return ok ? "bush" : null;
        }

        if (y === Y1) {
            if (this.bush.has(key(x, YB, z))) await this.breakBush(x, z);

            await this.breakCrop(x, z);
            const ck = key(x, y, z);
            if (id === "tilled_dry" || id === "tilled_wet") this.tilled.delete(ck);
        }

        if (id === "water") {
            await this.set(x, y, z, null);
            this.parts.burst(x, y, z);
            return "water";
        }

        await this.set(x, y, z, null);
        this.items.spawn("dirt", new THREE.Vector3(x + 0.5, y + 1.05, z + 0.5), 1);
        this.parts.burst(x, y, z);
        return "dirt";
    }

    async place(x, y, z, id) {
        if (!this.inPad(x, z)) return false;
        if (y !== Y1) return false;
        if (x === INF.x && y === INF.y && z === INF.z) return false;

        const k = key(x, y, z);
        if (this.crop.has(k)) return false;
        if (this.bush.has(key(x, YB, z))) return false;

        await this.set(x, y, z, id);
        if (id === "dirt") this.regrowLater(x, y, z);
        return true;
    }

    async itemTick(dt, plPos, bag) {
        await this.items.tick(dt, plPos, bag);
    }

    partsTick(dt, cam) {
        this.parts.tick(dt, cam);
    }

    visualTick() {
        this.renderer.visualTick();
    }
}