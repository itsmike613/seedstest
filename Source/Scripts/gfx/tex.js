// Source/Scripts/gfx/tex.js

import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

export class Tex {
    constructor() {
        this.l = new THREE.TextureLoader();
        this.m = new Map();
    }

    async get(url) {
        if (this.m.has(url)) return this.m.get(url);

        const t = await new Promise((res) => {
            this.l.load(url, (tx) => res(tx), undefined, () => res(null));
        });

        if (!t) {
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
            this.m.set(url, tx);
            return tx;
        }

        t.colorSpace = THREE.SRGBColorSpace;
        t.magFilter = THREE.NearestFilter;
        t.minFilter = THREE.NearestFilter;
        t.generateMipmaps = false;

        this.m.set(url, t);
        return t;
    }
}