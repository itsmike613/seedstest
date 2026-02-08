// Source/Scripts/world/renderer.js

import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { blocks } from "../data/blocks.js";
import { crops } from "../data/crops.js";
import { W, H, Y0, Y1 } from "../config/constants.js";
import { clamp, now } from "../util/math.js";
import { key } from "../util/gridKey.js";

const CS = 16; // chunk size (x,z)
function ck(cx, cz) { return `${cx},${cz}`; }

export class VoxRenderer {
    constructor(scene, tex) {
        this.s = scene;
        this.t = tex;

        this._chunks = new Map(); // key -> { cx,cz, meshes:Map(matKey->Mesh), dirty }
        this._mats = new Map();   // matKey -> Material
        this._waterMats = new Set();

        this._waterFlowU = 0;
        this._waterFlowV = 0;
    }

    // -----------------------------
    // Materials (sync; textures must be preloaded)
    // -----------------------------
    _matFor(id) {
        const b = blocks[id];
        const url = b ? b.img : "";
        const mk = `${id}|${url}`;

        if (this._mats.has(mk)) return this._mats.get(mk);

        const tx = this.t.getSync(url);

        let m;
        if (id === "water") {
            tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
            tx.repeat.set(1, 1);
            m = new THREE.MeshStandardMaterial({
                map: tx,
                transparent: true,
                opacity: 0.85,
                roughness: 0.18,
                metalness: 0.0,
                emissive: new THREE.Color(0x112244),
                emissiveIntensity: 0.15
            });
            this._waterMats.add(m);
        } else {
            m = new THREE.MeshStandardMaterial({
                map: tx,
                transparent: true,
                roughness: 0.9,
                metalness: 0.0
            });
        }

        this._mats.set(mk, m);
        return m;
    }

    // -----------------------------
    // Chunk bookkeeping
    // -----------------------------
    _chunkCoords(x, z) {
        return { cx: Math.floor(x / CS), cz: Math.floor(z / CS) };
    }

    _getChunk(cx, cz) {
        const k = ck(cx, cz);
        if (this._chunks.has(k)) return this._chunks.get(k);

        const d = { cx, cz, meshes: new Map(), dirty: true };
        this._chunks.set(k, d);
        return d;
    }

    _markDirtyByChunk(cx, cz) {
        this._getChunk(cx, cz).dirty = true;
    }

    markDirtyAt(x, z) {
        const { cx, cz } = this._chunkCoords(x, z);
        this._markDirtyByChunk(cx, cz);

        // edge neighbor chunks (faces cross chunk boundary)
        const lx = x % CS;
        const lz = z % CS;

        if (lx === 0) this._markDirtyByChunk(cx - 1, cz);
        if (lx === CS - 1) this._markDirtyByChunk(cx + 1, cz);
        if (lz === 0) this._markDirtyByChunk(cx, cz - 1);
        if (lz === CS - 1) this._markDirtyByChunk(cx, cz + 1);
    }

    // -----------------------------
    // Meshing helpers
    // -----------------------------
    _shapeFor(id) {
        if (id === "water") return { y0: 0.0, y1: 0.85, yOff: -0.075 };
        if (id === "path") return { y0: 0.0, y1: 0.90, yOff: -0.05 };
        return { y0: 0.0, y1: 1.0, yOff: 0.0 };
    }

    _pushFace(out, x0, y0, z0, x1, y1, z1, face) {
        const p = out.pos, n = out.nrm, uv = out.uv, idx = out.idx;
        const base = p.length / 3;
        let v0, v1, v2, v3, nx = 0, ny = 0, nz = 0;

        switch (face) {
            case 0: // +X
                nx = 1;
                v0 = [x1, y0, z0]; v1 = [x1, y0, z1]; v2 = [x1, y1, z1]; v3 = [x1, y1, z0];
                break;
            case 1: // -X
                nx = -1;
                v0 = [x0, y0, z1]; v1 = [x0, y0, z0]; v2 = [x0, y1, z0]; v3 = [x0, y1, z1];
                break;
            case 2: // +Y
                ny = 1;
                v0 = [x0, y1, z0]; v1 = [x1, y1, z0]; v2 = [x1, y1, z1]; v3 = [x0, y1, z1];
                break;
            case 3: // -Y
                ny = -1;
                v0 = [x0, y0, z1]; v1 = [x1, y0, z1]; v2 = [x1, y0, z0]; v3 = [x0, y0, z0];
                break;
            case 4: // +Z
                nz = 1;
                v0 = [x1, y0, z1]; v1 = [x0, y0, z1]; v2 = [x0, y1, z1]; v3 = [x1, y1, z1];
                break;
            case 5: // -Z
                nz = -1;
                v0 = [x0, y0, z0]; v1 = [x1, y0, z0]; v2 = [x1, y1, z0]; v3 = [x0, y1, z0];
                break;
        }
        p.push(...v0, ...v1, ...v2, ...v3);
        for (let i = 0; i < 4; i++) n.push(nx, ny, nz);
        uv.push(0, 0, 1, 0, 1, 1, 0, 1);
        idx.push(
            base + 0, base + 1, base + 2,
            base + 0, base + 2, base + 3
        );
    }

    // -----------------------------
    // Build a single chunk mesh set
    // -----------------------------
    rebuildChunk(cx, cz, getFn) {
        const ch = this._getChunk(cx, cz);
        if (!ch.dirty) return;
        for (const [, m] of ch.meshes) this.s.remove(m);
        ch.meshes.clear();
        const x0 = cx * CS;
        const z0 = cz * CS;
        const x1 = clamp(x0 + CS, 0, W);
        const z1 = clamp(z0 + CS, 0, H);
        const buckets = new Map();
        const neighbor = (x, y, z) => {
            if (x < 0 || z < 0 || x >= W || z >= H) return null;
            return getFn(x, y, z);
        };
        const shouldCull = (a, b) => {
            return !!b;
        };

        for (let x = x0; x < x1; x++) {
            for (let z = z0; z < z1; z++) {
                for (let y = Y0; y <= (Y1 + 1); y++) {
                    const id = getFn(x, y, z);
                    if (!id) continue;
                    const b = blocks[id];
                    if (!b) continue;
                    const mat = this._matFor(id);
                    const matKey = [...this._mats.entries()].find(([, v]) => v === mat)?.[0] || (id + "|" + b.img);
                    if (!buckets.has(matKey)) {
                        buckets.set(matKey, { pos: [], nrm: [], uv: [], idx: [], mat });
                    }
                    const out = buckets.get(matKey);
                    const sh = this._shapeFor(id);
                    const wx0 = x;
                    const wz0 = z;
                    const wy0 = y + sh.y0 + sh.yOff;
                    const wx1 = x + 1;
                    const wz1 = z + 1;
                    const wy1 = y + sh.y1 + sh.yOff;
                    if (!shouldCull(id, neighbor(x + 1, y, z))) this._pushFace(out, wx0, wy0, wz0, wx1, wy1, wz1, 0);
                    if (!shouldCull(id, neighbor(x - 1, y, z))) this._pushFace(out, wx0, wy0, wz0, wx1, wy1, wz1, 1);
                    if (!shouldCull(id, neighbor(x, y + 1, z))) this._pushFace(out, wx0, wy0, wz0, wx1, wy1, wz1, 2);
                    if (!shouldCull(id, neighbor(x, y - 1, z))) this._pushFace(out, wx0, wy0, wz0, wx1, wy1, wz1, 3);
                    if (!shouldCull(id, neighbor(x, y, z + 1))) this._pushFace(out, wx0, wy0, wz0, wx1, wy1, wz1, 4);
                    if (!shouldCull(id, neighbor(x, y, z - 1))) this._pushFace(out, wx0, wy0, wz0, wx1, wy1, wz1, 5);
                }
            }
        }

        for (const [, b] of buckets) {
            if (b.idx.length === 0) continue;

            const g = new THREE.BufferGeometry();
            g.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
            g.setAttribute("normal", new THREE.Float32BufferAttribute(b.nrm, 3));
            g.setAttribute("uv", new THREE.Float32BufferAttribute(b.uv, 2));
            g.setIndex(b.idx);
            g.computeBoundingSphere();

            const mesh = new THREE.Mesh(g, b.mat);
            mesh.castShadow = false; // chunk meshes are large; keep same feel (world still receives shadows)
            mesh.receiveShadow = true;

            this.s.add(mesh);
            ch.meshes.set(b.mat, mesh);
        }

        ch.dirty = false;
    }

    rebuildDirty(getFn) {
        for (const [, ch] of this._chunks) {
            if (!ch.dirty) continue;
            this.rebuildChunk(ch.cx, ch.cz, getFn);
        }
    }

    // -----------------------------
    // Visual updates (water flow only)
    // -----------------------------
    visualTick() {
        const t = now();
        this._waterFlowU = (t * 0.015) % 1;
        this._waterFlowV = (t * 0.010) % 1;

        for (const m of this._waterMats) {
            if (m && m.map) m.map.offset.set(this._waterFlowU, this._waterFlowV);
        }
    }
}