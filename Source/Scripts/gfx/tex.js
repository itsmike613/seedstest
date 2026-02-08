// Source/Scripts/gfx/tex.js

import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

export class Tex {
    constructor() {
        this.l = new THREE.TextureLoader();
        this.m = new Map();
        this._fallback = null;
    }

    _makeFallback() {
        if (this._fallback) return this._fallback;
        const c = document.createElement("canvas");
        c.width = c.height = 32;
        const g = c.getContext("2d");
        g.fillStyle = "#ff00ff"; g.fillRect(0, 0, 32, 32);
        g.fillStyle = "#000"; g.fillRect(0, 0, 16, 16);
        g.fillRect(16, 16, 16, 16);
        const tx = new THREE.CanvasTexture(c);
        tx.colorSpace = THREE.SRGBColorSpace;
        tx.magFilter = THREE.NearestFilter;
        tx.minFilter = THREE.NearestFilter;
        tx.generateMipmaps = false;
        this._fallback = tx;
        return tx;
    }

    async get(url) {
        if (this.m.has(url)) return this.m.get(url);

        const t = await new Promise((res) => {
            this.l.load(url, (tx) => res(tx), undefined, () => res(null));
        });

        if (!t) {
            const fb = this._makeFallback();
            this.m.set(url, fb);
            return fb;
        }

        t.colorSpace = THREE.SRGBColorSpace;
        t.magFilter = THREE.NearestFilter;
        t.minFilter = THREE.NearestFilter;
        t.generateMipmaps = false;
        this.m.set(url, t);
        return t;
    }

    getSync(url) {
        return this.m.get(url) || this._makeFallback();
    }

    async preload(urls = []) {
        const uniq = [];
        const seen = new Set();
        for (const u of urls) {
            if (!u) continue;
            if (seen.has(u)) continue;
            seen.add(u);
            uniq.push(u);
        }
        await Promise.allSettled(uniq.map(u => this.get(u)));
    }
}