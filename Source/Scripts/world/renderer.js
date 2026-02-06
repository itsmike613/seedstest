// Source/Scripts/world/renderer.js

import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { blocks } from "../data/blocks.js";
import { crops } from "../data/crops.js";
import { W, H, Y0, Y1 } from "../config/constants.js";
import { clamp, now } from "../util/math.js";
import { key } from "../util/gridKey.js";

export class VoxRenderer {
    constructor(scene, tex) {
        this.s = scene;
        this.t = tex;

        this.g = new THREE.BoxGeometry(1, 1, 1);
        this.mats = new Map();
        this.mesh = new Map();      // block meshes only
        this.water = new Set();     // keys for water blocks (for UV flow)

        // crop visuals
        this.cropPlanes = new Map(); // baseKey => {planes, center, seed}
    }

    async mat(url, idHint = "") {
        const mk = url + "|pbr|" + idHint;
        if (this.mats.has(mk)) return this.mats.get(mk);

        const tx = await this.t.get(url);

        const baseEnv = {
            envMapIntensity: 0.65
        };

        let m;

        if (idHint === "water") {
            tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
            tx.repeat.set(1, 1);

            m = new THREE.MeshPhysicalMaterial({
                map: tx,
                transparent: true,
                opacity: 0.86,

                roughness: 0.10,
                metalness: 0.0,

                clearcoat: 0.85,
                clearcoatRoughness: 0.12,

                transmission: 0.25,
                ior: 1.33,
                thickness: 0.2,

                emissive: new THREE.Color(0x0b1c2a),
                emissiveIntensity: 0.22,

                ...baseEnv,
                envMapIntensity: 1.15
            });
        } else {
            let rough = 0.92;
            let envI = 0.65;

            if (idHint === "path") { rough = 0.78; envI = 0.85; }
            if (idHint === "dirt") { rough = 0.95; envI = 0.55; }
            if (idHint === "tilled_wet") { rough = 0.68; envI = 1.05; }
            if (idHint === "tilled_dry") { rough = 0.88; envI = 0.70; }
            if (idHint === "grass") { rough = 0.90; envI = 0.65; }

            m = new THREE.MeshStandardMaterial({
                map: tx,
                transparent: true,
                roughness: rough,
                metalness: 0.0,
                envMapIntensity: envI
            });
        }

        this.mats.set(mk, m);
        return m;
    }

    removeBlockMesh(k) {
        if (!this.mesh.has(k)) return;
        this.s.remove(this.mesh.get(k));
        this.mesh.delete(k);
    }

    async setBlockMesh(x, y, z, id, prevId) {
        const k = key(x, y, z);
        this.removeBlockMesh(k);

        if (prevId === "water") this.water.delete(k);
        if (id === "water") this.water.add(k);

        if (!id) return;

        const b = blocks[id];
        const m = await this.mat(b.img, id);
        const mesh = new THREE.Mesh(this.g, m);
        mesh.position.set(x + 0.5, y + 0.5, z + 0.5);

        mesh.castShadow = (id !== "water");
        mesh.receiveShadow = true;

        if (id === "water") {
            mesh.scale.y = 0.85;
            mesh.position.y -= 0.075;
        }
        if (id === "path") {
            mesh.scale.y = 0.90;
            mesh.position.y -= 0.05;
        }

        this.s.add(mesh);
        this.mesh.set(k, mesh);
    }

    async setCropPlanes(x, y, z, type, st) {
        const base = key(x, y, z) + "|crop";
        // clear old
        for (let i = 0; i < 4; i++) {
            const kk = base + i;
            if (this.mesh.has(kk)) { this.s.remove(this.mesh.get(kk)); this.mesh.delete(kk); }
        }
        this.cropPlanes.delete(base);

        const list = crops[type].stages;
        const url = list[clamp(st, 0, list.length - 1)];
        const tx = await this.t.get(url);

        const m = new THREE.MeshLambertMaterial({
            map: tx,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            emissive: new THREE.Color(0x1a2a12),
            emissiveIntensity: 0.12
        });

        const g = new THREE.PlaneGeometry(1, 1);
        const p = new THREE.Vector3(x + 0.5, y + 1.5, z + 0.5);
        const rots = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];

        const planes = [];
        for (let i = 0; i < 4; i++) {
            const mesh = new THREE.Mesh(g, m);
            mesh.position.copy(p);
            mesh.rotation.y = rots[i];
            mesh.scale.set(0.95, 0.95, 0.95);
            mesh.castShadow = true;
            mesh.receiveShadow = false;

            this.s.add(mesh);
            this.mesh.set(base + i, mesh);
            planes.push(mesh);
        }

        this.cropPlanes.set(base, {
            planes,
            center: p.clone(),
            seed: (x * 37.1 + z * 91.7 + (type === "wheat" ? 11.3 : 23.7)) * 0.1
        });
    }

    removeCropPlanes(x, y, z) {
        const base = key(x, y, z) + "|crop";
        for (let i = 0; i < 4; i++) {
            const kk = base + i;
            if (this.mesh.has(kk)) { this.s.remove(this.mesh.get(kk)); this.mesh.delete(kk); }
        }
        this.cropPlanes.delete(base);
    }

    visualTick() {
        const t = now();

        // crop sway
        for (const [, d] of this.cropPlanes) {
            const w = 0.06 + 0.015 * Math.sin(t * 0.7 + d.seed);
            const sway = Math.sin(t * (1.4 + 0.25 * Math.sin(d.seed)) + d.seed) * w;
            const sway2 = Math.cos(t * 1.15 + d.seed * 1.7) * (w * 0.65);

            for (let i = 0; i < d.planes.length; i++) {
                const m = d.planes[i];
                m.position.copy(d.center);
                m.rotation.z = 0;
                m.rotation.x = 0;

                m.rotation.x = (i % 2 === 0 ? sway : -sway) * 0.35;
                m.rotation.z = (i % 2 === 0 ? sway2 : -sway2) * 0.35;
                m.position.y = d.center.y + 0.02 * Math.sin(t * 2.2 + d.seed + i);
            }
        }

        // water UV flow
        const flowU = (t * 0.015) % 1;
        const flowV = (t * 0.010) % 1;
        for (const k of this.water) {
            const m = this.mesh.get(k);
            if (!m) continue;
            const mat = m.material;
            if (mat && mat.map) mat.map.offset.set(flowU, flowV);
        }
    }
}