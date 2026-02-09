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
        this.map = new Map();
        this.tilled = new Map();
        this.crop = new Map();
        this.bush = new Map();
        this.renderer = new VoxRenderer(scene, tex);
        this._onPickup = null;
        this.items = new ItemSystem(scene, tex, (x, z) => this.topAt(x, z), () => {
            if (this._onPickup) this._onPickup();
        });
        this.parts = new ParticleSystem(scene);
    }

    setOnPickup(fn) {
        this._onPickup = fn;
    }

    get mesh() { return this.renderer.mesh; }
    inPad(x, z) { return x >= 0 && z >= 0 && x < W && z < H; }
    get(x, y, z) { return this.map.get(key(x, y, z)); }

    topAt(x, z) {
        const t = this.get(x, Y1, z);
        if (!t) return Y0 + 1;
        if (t === "water") return Y1 + 0.85;
        if (t === "path") return Y1 + 0.90;
        return Y1 + 1;
    }

    async set(x, y, z, id) {
        const k = key(x, y, z);
        const prev = this.map.get(k);
        if (prev === id) return;
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
    }

    nearWater(x, z) {
        for (let dx = -conf.hyd; dx <= conf.hyd; dx++) {
            for (let dz = -conf.hyd; dz <= conf.hyd; dz++) {
                const nx = x + dx, nz = z + dz;
                if (!this.inPad(nx, nz)) continue;
                if (this.get(nx, Y1, nz) === "water") {
                    if (Math.sqrt(dx * dx + dz * dz) <= conf.hyd) return true;
                }
            }
        }
        return false;
    }

    async till(x, z) {
        const id = this.get(x, Y1, z);
        if (id !== "grass" && id !== "dirt") return false;
        if (!this.nearWater(x, z)) return false;
        if (this.bush.has(key(x, YB, z))) return false;
        await this.set(x, Y1, z, "tilled_dry");
        this.tilled.set(key(x, Y1, z), { wet: false, ts: now() });
        return true;
    }

    async plant(x, z, type) {
        const id = this.get(x, Y1, z);
        if (id !== "tilled_dry" && id !== "tilled_wet") return false;
        const k = key(x, Y1, z);
        if (this.crop.has(k)) return false;
        if (this.bush.has(key(x, YB, z))) return false;
        this.crop.set(k, { type, st: 0, ts: now() });
        await this.renderer.setCropPlanes(x, Y1, z, type, 0);
        return true;
    }

    killCrop(x, z) {
        const k = key(x, Y1, z);
        this.crop.delete(k);
        this.renderer.removeCropPlanes(x, Y1, z);
    }

    // -----------------------------
    // Bush helpers
    // -----------------------------
    isBushId(id) {
        return id === "blueberry_bush_empty" || id === "blueberry_bush_full" ||
            id === "raspberry_bush_empty" || id === "raspberry_bush_full";
    }

    bushAt(x, y, z) {
        return this.bush.get(key(x, YB, z)) || null;
    }

    async setBushVisual(x, z, full) {
        const k = key(x, YB, z);
        const b = this.bush.get(k);
        if (!b) return;
        const def = crops[b.type];
        const id = full ? def.bush.full : def.bush.empty;
        b.full = full;
        b.ts = now();
        await this.set(x, YB, z, id);
    }

    async convertCropToBush(x, z, type) {
        const def = crops[type];
        if (!def || !def.bush) return;
        this.crop.delete(key(x, Y1, z));
        this.renderer.removeCropPlanes(x, Y1, z);
        await this.set(x, YB, z, def.bush.empty);
        this.bush.set(key(x, YB, z), { type, full: false, ts: now() });
    }

    async useBush(x, z) {
        const b = this.bush.get(key(x, YB, z));
        if (!b) return { ok: false, why: "not_bush" };
        if (!b.full) return { ok: false, why: "not_ready" };
        const def = crops[b.type];
        const drop = def.bush.berry;
        this.items.spawn(drop.item, new THREE.Vector3(x + 0.5, YB + 0.25, z + 0.5), rnd(drop.min, drop.max));
        this.parts.burst(x, YB, z);
        await this.setBushVisual(x, z, false);
        return { ok: true, why: "harvested" };
    }

    async breakBush(x, z) {
        const k = key(x, YB, z);
        const b = this.bush.get(k);
        if (!b) return false;
        const def = crops[b.type];
        this.items.spawn(def.seed, new THREE.Vector3(x + 0.5, YB + 0.25, z + 0.5), 1);

        if (b.full) {
            const drop = def.bush.berry;
            this.items.spawn(drop.item, new THREE.Vector3(x + 0.5, YB + 0.25, z + 0.5), rnd(drop.min, drop.max));
        }

        this.bush.delete(k);
        await this.set(x, YB, z, null);
        this.parts.burst(x, YB, z);
        return true;
    }

    async dropCrop(x, y, z, type, popped) {
        const c = crops[type];
        const k = key(x, Y1, z);
        const cur = this.crop.get(k);
        const st = cur ? cur.st : (c.stages.length - 1);
        const max = c.stages.length - 1;

        if (popped) {
            this.items.spawn(c.seed, new THREE.Vector3(x + 0.5, y + 1.35, z + 0.5), 1);
            return;
        }

        if (st >= max) {
            this.items.spawn(c.drop.item, new THREE.Vector3(x + 0.5, y + 1.35, z + 0.5), rnd(c.drop.min, c.drop.max));
            const b = rnd(c.bonus.min, c.bonus.max);
            if (b > 0) this.items.spawn(c.bonus.item, new THREE.Vector3(x + 0.5, y + 1.35, z + 0.5), b);
        } else {
            this.items.spawn(c.seed, new THREE.Vector3(x + 0.5, y + 1.35, z + 0.5), 1);
        }
        this.parts.burst(x, y, z);
    }

    async breakCrop(x, z) {
        const k = key(x, Y1, z);
        if (!this.crop.has(k)) return false;
        const c = this.crop.get(k);
        await this.dropCrop(x, Y1, z, c.type, false);
        this.killCrop(x, z);
        return true;
    }

    async hydrateTick() {
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