// Source/Scripts/gfx/crackOverlay.js

import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { clamp } from "../util/math.js";

export class CrackOverlay {
    constructor(scene, tex) {
        this.scene = scene;
        this.tex = tex;
        this.m = [];
        this.tx = [];
        this.sharedMat = null;
    }

    async init() {
        const urls = [
            "./Source/Assets/UI/Breaking/crack1.png",
            "./Source/Assets/UI/Breaking/crack2.png",
            "./Source/Assets/UI/Breaking/crack3.png",
            "./Source/Assets/UI/Breaking/crack4.png",
            "./Source/Assets/UI/Breaking/crack5.png",
            "./Source/Assets/UI/Breaking/crack6.png",
        ];
        for (const u of urls) this.tx.push(await this.tex.get(u));

        this.sharedMat = new THREE.MeshBasicMaterial({
            map: this.tx[0],
            transparent: true,
            depthWrite: false,
            opacity: 0.95,
            polygonOffset: true,
            polygonOffsetFactor: -4,
            polygonOffsetUnits: -4
        });

        const g = new THREE.PlaneGeometry(1.01, 1.01); 

        const faces = [
            { pos: [0.5, 0.5, 1], rot: [0, 0, 0] },
            { pos: [0.5, 0.5, 0], rot: [0, Math.PI, 0] },
            { pos: [1, 0.5, 0.5], rot: [0, -Math.PI * 0.5, 0] },
            { pos: [0, 0.5, 0.5], rot: [0, Math.PI * 0.5, 0] },
            { pos: [0.5, 1, 0.5], rot: [-Math.PI * 0.5, 0, 0] },
            { pos: [0.5, 0, 0.5], rot: [Math.PI * 0.5, 0, 0] }
        ];

        for (const f of faces) {
            const mesh = new THREE.Mesh(g, this.sharedMat);
            mesh.visible = false;
            this.scene.add(mesh);
            this.m.push({ 
                mesh, 
                offset: new THREE.Vector3(...f.pos), 
                rot: new THREE.Euler(...f.rot) 
            });
        }
    }

    show(x, y, z, stage) {
        if (!this.sharedMat) return;
        const newTex = this.tx[clamp(stage, 0, 5)];
        if (this.sharedMat.map !== newTex) {
            this.sharedMat.map = newTex;
        }
        for (const f of this.m) {
            f.mesh.visible = true;
            f.mesh.position.set(x + f.offset.x, y + f.offset.y, z + f.offset.z);
            f.mesh.rotation.copy(f.rot);
        }
    }

    hide() {
        if (!this.m || this.m.length === 0) return;
        for (const f of this.m) f.mesh.visible = false;
    }
}