// Source/Scripts/world/world.js

import { conf } from "../config/conf.js";
import { W, H, Y0, Y1, INF, YB } from "../config/constants.js";
import { blocks } from "../data/blocks.js";
import { crops } from "../data/crops.js";
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

        this._onPickup = null;

        this.items = new ItemSystem(
            scene,
            tex,
            (x, z) => this.topAt(x, z),
            () => {
                if (this._onPickup) this._onPickup();
            }
        );

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
                let wet = false;

                for (let i = 0; i < water.length && !wet; i++) {
                    const dx = water[i].x - x;
                    const dz = water[i].z - z;

                    if (dx > r || dx < -r || dz > r || dz < -r) continue;
                    if (dx * dx + dz * dz <= r2) wet = true;
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

    topAt(x, z) {
        return this.get(x, Y1, z);
    }

    async breakTop(x, z) {
        const id = this.get(x, Y1, z);
        if (!id) return null;
        if (id === "unbreak") return null;

        const k = key(x, Y1, z);
        if (this.crop.has(k)) return null;
        if (this.bush.has(key(x, YB, z))) return null;

        const d = blocks[id];
        if (!d || !d.drop) return null;

        await this.set(x, Y1, z, "dirt");
        this.regrowLater(x, Y1, z);
        return d.drop;
    }

    regrowLater(x, y, z) {
        const k = key(x, y, z);
        if (!this.map.has(k)) return;

        const t = now();
        const wait = rnd(conf.regrowMin, conf.regrowMax);
        this.map.set(k, this.map.get(k));
    }

    async plant(x, z, type) {
        const k = key(x, Y1, z);
        if (!this.tilled.has(k)) return false;
        if (this.crop.has(k)) return false;

        const tile = this.get(x, Y1, z);
        if (tile !== "tilled_wet") return false;

        this.crop.set(k, { type, st: 0, ts: now() });
        await this.renderer.setCropMesh(x, z, type, 0);
        return true;
    }

    killCrop(x, z) {
        const k = key(x, Y1, z);
        if (!this.crop.has(k)) return;
        this.crop.delete(k);
        this.renderer.clearCropMesh(x, z);
    }

    async harvest(x, z) {
        const k = key(x, Y1, z);
        if (!this.crop.has(k)) return null;

        const c = this.crop.get(k);
        const d = crops[c.type];
        if (!d) return null;

        if (c.st < d.stages - 1) return null;

        await this.dropCrop(x, Y1, z, c.type, false);
        this.killCrop(x, z);

        return d.yield;
    }

    async dropCrop(x, y, z, type, dead) {
        const d = crops[type];
        if (!d) return;

        const drop = dead ? d.deadDrop : d.drop;
        if (!drop) return;

        this.items.drop(drop, x + 0.5, z + 0.5);
    }

    async growTick() {
        const t = now();

        for (const [k, c] of this.crop) {
            const d = crops[c.type];
            if (!d) continue;

            const p = parse(k);
            const tile = this.get(p.x, p.y, p.z);
            if (tile !== "tilled_wet") continue;

            if ((t - c.ts) > d.grow) {
                c.ts = t;
                c.st = Math.min(d.stages - 1, c.st + 1);
                await this.renderer.setCropMesh(p.x, p.z, c.type, c.st);
            }
        }
    }

    itemTick(dt, p, bag) {
        this.items.tick(dt, p, bag);
    }

    partsTick(dt, cam) {
        this.parts.tick(dt, cam);
    }

    visualTick() {
        this.renderer.visualTick();
    }
}