// Source/Scripts/gfx/crackOverlay.js

import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { clamp } from "../util/math.js";

export class CrackOverlay {
    constructor(scene, tex) {
        this.scene = scene;
        this.tex = tex;
        this.m = [];
        this.tx = [];
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

        const mat = new THREE.MeshBasicMaterial({
            map: this.tx[0],
            transparent: true,
            depthWrite: false,
            opacity: 0.95,
            side: THREE.DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2
        });

        const g = new THREE.PlaneGeometry(1.02, 1.02);

        const faces = [
            { pos: new THREE.Vector3(0.5, 0.5, 1.001), rot: new THREE.Euler(0, 0, 0) },                 // +Z
            { pos: new THREE.Vector3(0.5, 0.5, -0.001), rot: new THREE.Euler(0, Math.PI, 0) },            // -Z
            { pos: new THREE.Vector3(1.001, 0.5, 0.5), rot: new THREE.Euler(0, -Math.PI * 0.5, 0) },     // +X
            { pos: new THREE.Vector3(-0.001, 0.5, 0.5), rot: new THREE.Euler(0, Math.PI * 0.5, 0) },      // -X
            { pos: new THREE.Vector3(0.5, 1.001, 0.5), rot: new THREE.Euler(-Math.PI * 0.5, 0, 0) },      // +Y
            { pos: new THREE.Vector3(0.5, -0.001, 0.5), rot: new THREE.Euler(Math.PI * 0.5, 0, 0) }       // -Y
        ];

        this.m = [];
        for (let i = 0; i < faces.length; i++) {
            const mesh = new THREE.Mesh(g, mat.clone());
            mesh.visible = false;
            mesh.renderOrder = 999;
            this.scene.add(mesh);
            this.m.push({ mesh, localPos: faces[i].pos, localRot: faces[i].rot });
        }
    }

    show(x, y, z, stage) {
        if (!this.m || this.m.length === 0) return;
        const tx = this.tx[clamp(stage, 0, 5)];
        for (const f of this.m) {
            f.mesh.visible = true;
            f.mesh.position.set(x, y, z).add(f.localPos);
            f.mesh.rotation.copy(f.localRot);
            f.mesh.material.map = tx;
            f.mesh.material.needsUpdate = true;
        }
    }

    hide() {
        if (!this.m || this.m.length === 0) return;
        for (const f of this.m) f.mesh.visible = false;
    }
}