// Source/Scripts/world/items.js

import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { items } from "../data/items.js";
import { conf } from "../config/conf.js";
import { W, H } from "../config/constants.js";
import { clamp, d2, now } from "../util/math.js";

export class ItemSystem {
    constructor(scene, tex, topAtFn, onPickupFn = null) {
        this.s = scene;
        this.t = tex;
        this.topAt = topAtFn;
        this.items = [];
        this.onPickup = onPickupFn;
    }

    spawn(k, p, c) {
        const it = items[k];
        if (!it) return;

        for (const d of this.items) {
            if (d.k === k && it.stack > 1 && d2(d.p, p) < 0.5 * 0.5) {
                d.c = Math.min(it.stack, d.c + c);
                return;
            }
        }
        this.items.push({
            k, c,
            p: p.clone(),
            v: new THREE.Vector3((Math.random() - 0.5) * 1.2, 2.0, (Math.random() - 0.5) * 1.2),
            m: null
        });
    }

    async ensureMesh(d) {
        if (d.m) return;
        const tx = await this.t.get(items[d.k].img);
        const mat = new THREE.SpriteMaterial({ map: tx, transparent: true, depthWrite: false });
        const s = new THREE.Sprite(mat);
        s.scale.set(0.6, 0.6, 0.6);
        s.position.copy(d.p);
        this.s.add(s);
        d.m = s;
    }

    async tick(dt, plPos, bag) {
        for (let i = this.items.length - 1; i >= 0; i--) {
            const d = this.items[i];
            await this.ensureMesh(d);

            d.v.y -= 18 * dt;
            d.p.addScaledVector(d.v, dt);

            const bx = clamp(Math.floor(d.p.x), 0, W - 1);
            const bz = clamp(Math.floor(d.p.z), 0, H - 1);
            const top = this.topAt(bx, bz);
            const fy = top + 0.05;

            if (d.p.y < fy) {
                d.p.y = fy;
                d.v.y *= -0.18;
                d.v.x *= 0.78;
                d.v.z *= 0.78;
            }

            const bob = Math.sin(now() * 4 + i) * 0.03;
            d.m.position.set(d.p.x, d.p.y + bob, d.p.z);

            const pp = new THREE.Vector3(plPos.x, plPos.y - 1.2, plPos.z);
            if (d2(pp, d.p) < conf.pick * conf.pick) {
                const left = bag.add(d.k, d.c);
                if (left <= 0) {
                    if (this.onPickup) this.onPickup(d.k, d.c);
                    this.s.remove(d.m);
                    this.items.splice(i, 1);
                } else {
                    d.c = left;
                }
            }
        }
    }
}