// Source/Scripts/gfx/hologram.js

import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { clamp } from "../util/math.js";
import { INF, Y1 } from "../config/constants.js";

export class Hologram {
    constructor(scene) {
        this.scene = scene;
        this.m = null;
    }

    round(g, x, y, w, h, r) {
        g.beginPath();
        g.moveTo(x + r, y);
        g.arcTo(x + w, y, x + w, y + h, r);
        g.arcTo(x + w, y + h, x, y + h, r);
        g.arcTo(x, y + h, x, y, r);
        g.arcTo(x, y, x + w, y, r);
        g.closePath();
    }

    async init() {
        const c = document.createElement("canvas");
        c.width = 256; c.height = 64;
        const g = c.getContext("2d");
        g.clearRect(0, 0, c.width, c.height);
        g.fillStyle = "rgba(0,0,0,0.55)";
        this.round(g, 8, 8, 240, 48, 10); g.fill();
        g.strokeStyle = "rgba(255,255,255,0.18)";
        g.lineWidth = 2; this.round(g, 8, 8, 240, 48, 10); g.stroke();
        g.fillStyle = "rgba(255,255,255,0.95)";
        g.font = "32px 'Jersey 10'";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("Infinite Water", 128, 32);
        const tx = new THREE.CanvasTexture(c);
        tx.colorSpace = THREE.SRGBColorSpace;
        tx.magFilter = THREE.NearestFilter;
        tx.minFilter = THREE.NearestFilter;
        tx.generateMipmaps = false;
        const mat = new THREE.SpriteMaterial({ map: tx, transparent: true, depthWrite: false });
        const spr = new THREE.Sprite(mat);
        spr.position.set(INF.x + 0.5, Y1 + 2.2, INF.z + 0.5);
        spr.scale.set(3.2, 0.8, 1);
        this.scene.add(spr);
        this.m = spr;
    }

    tick(cam) {
        if (!this.m) return;
        const d = cam.position.distanceTo(this.m.position);
        const s = clamp(d * 0.18, 1.7, 4.2);
        this.m.scale.set(3.2 * s * 0.35, 0.8 * s * 0.35, 1);
    }
}