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
        this._cubeGeo = new THREE.BoxGeometry(1, 1, 1);
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
            m: null,
            attract: false,
            ph: Math.random() * 10
        });
    }

    async ensureMesh(d) {
        if (d.m) return;
        const it = items[d.k];
        const tx = await this.t.get(it.img);

        if (it.t === "block") {
            const mat = new THREE.MeshStandardMaterial({
                map: tx,
                transparent: true,
                roughness: 0.9,
                metalness: 0.0
            });

            const mesh = new THREE.Mesh(this._cubeGeo, mat);
            const s = 0.33;
            mesh.scale.set(s, s, s);
            mesh.castShadow = true;
            mesh.receiveShadow = false;
            mesh.position.copy(d.p);
            this.s.add(mesh);
            d.m = mesh;
            d._isCube = true;
            return;
        }

        const mat = new THREE.SpriteMaterial({ map: tx, transparent: true, depthWrite: false });
        const spr = new THREE.Sprite(mat);
        spr.scale.set(0.6, 0.6, 0.6);
        spr.position.copy(d.p);
        this.s.add(spr);
        d.m = spr;
        d._isCube = false;
    }

    async tick(dt, plPos, bag) {
        const attractR = conf.pick * 2.0;
        const collectR = 0.28;

        for (let i = this.items.length - 1; i >= 0; i--) {
            const d = this.items[i];
            await this.ensureMesh(d);
            const target = new THREE.Vector3(plPos.x, plPos.y - 1.15, plPos.z);
            const dx = target.x - d.p.x;
            const dy = target.y - d.p.y;
            const dz = target.z - d.p.z;
            const dist = Math.hypot(dx, dy, dz);
            if (dist < attractR) d.attract = true;
            if (d.attract) {
                const inv = dist > 1e-6 ? 1 / dist : 0;
                const ux = dx * inv, uy = dy * inv, uz = dz * inv;
                const t = clamp(1 - dist / attractR, 0, 1);
                const speed = 6 + 18 * t;
                d.p.x += ux * speed * dt;
                d.p.y += uy * speed * dt;
                d.p.z += uz * speed * dt;
                d.v.multiplyScalar(0.20);

                if (dist < collectR) {
                    const left = bag.add(d.k, d.c);
                    if (left <= 0) {
                        if (this.onPickup) this.onPickup(d.k, d.c);
                        this.s.remove(d.m);
                        this.items.splice(i, 1);
                        continue;
                    } else {
                        d.c = left;
                        d.attract = false;
                    }
                }
            } else {
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
            }

            const bob = Math.sin(now() * 4 + d.ph) * 0.03;

            if (d._isCube) {
                d.m.position.set(d.p.x, d.p.y + bob, d.p.z);
                d.m.rotation.y = (now() * 1.6 + d.ph) % (Math.PI * 2);
                d.m.rotation.x = 0.15 * Math.sin(now() * 1.2 + d.ph);
            } else {
                d.m.position.set(d.p.x, d.p.y + bob, d.p.z);
            }
        }
    }
}