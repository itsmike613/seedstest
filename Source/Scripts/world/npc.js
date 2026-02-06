// Source/Scripts/world/npc.js

import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { clamp } from "../util/math.js";

export class Npc {
    constructor({ scene, tex, skinUrl, blockPos }) {
        this.scene = scene;
        this.tex = tex;

        this.block = { x: blockPos.x, y: blockPos.y, z: blockPos.z };

        this.grp = new THREE.Group();
        this.grp.position.set(this.block.x + 0.5, this.block.y + 1.0, this.block.z + 0.5);
        this.scene.add(this.grp);

        this._t = 0;

        this._root = new THREE.Group();
        this.grp.add(this._root);

        this._headPivot = new THREE.Group();
        this._bodyPivot = new THREE.Group();

        this._root.add(this._bodyPivot);
        this._root.add(this._headPivot);

        this._mat = null;

        const hbGeo = new THREE.BoxGeometry(0.95, 2.02, 0.95);
        const hbMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0, depthWrite: false });
        this.hitbox = new THREE.Mesh(hbGeo, hbMat);
        this.hitbox.position.set(0, 1.01, 0);
        this.hitbox.userData.isNpc = true;
        this.grp.add(this.hitbox);
    }

    async init() {
        const tx = await this.tex.get(this._skinUrlSafe());
        if (tx) tx.flipY = false;

        this._mat = new THREE.MeshLambertMaterial({
            map: tx,
            transparent: true,
            alphaTest: 0.1
        });

        this._build();
    }

    _skinUrlSafe() {
        return this.skinUrl || "./Source/Assets/NPC/farmer.png";
    }

    setSkin(url) {
        this.skinUrl = url;
    }

    _uv(px0, py0, px1, py1) {
        const W = 64, H = 64;
        const u0 = px0 / W, u1 = px1 / W;
        const v0 = 1 - (py1 / H), v1 = 1 - (py0 / H);
        return [u0, v0, u1, v1];
    }

    _setBoxUV(geo, faces) {
        const uvAttr = geo.attributes.uv;
        const setFace = (faceIndex, u0, v0, u1, v1) => {
            const i = faceIndex * 4;
            uvAttr.setXY(i + 0, u1, v1);
            uvAttr.setXY(i + 1, u0, v1);
            uvAttr.setXY(i + 2, u1, v0);
            uvAttr.setXY(i + 3, u0, v0);
        };

        for (let f = 0; f < 6; f++) {
            const [u0, v0, u1, v1] = faces[f];
            setFace(f, u0, v0, u1, v1);
        }

        uvAttr.needsUpdate = true;
    }

    _box(w, h, d, uvFaces) {
        const geo = new THREE.BoxGeometry(w, h, d);
        this._setBoxUV(geo, uvFaces);
        return new THREE.Mesh(geo, this._mat);
    }

    _build() {
        const HEAD = { w: 0.5, h: 0.5, d: 0.5 };
        const BODY = { w: 0.5, h: 0.75, d: 0.25 };
        const LIMB = { w: 0.25, h: 0.75, d: 0.25 };

        const head = {
            right: this._uv(0, 8, 8, 16),
            front: this._uv(8, 8, 16, 16),
            left: this._uv(16, 8, 24, 16),
            back: this._uv(24, 8, 32, 16),
            top: this._uv(8, 0, 16, 8),
            bottom: this._uv(16, 0, 24, 8)
        };

        const body = {
            right: this._uv(16, 20, 20, 32),
            front: this._uv(20, 20, 28, 32),
            left: this._uv(28, 20, 32, 32),
            back: this._uv(32, 20, 40, 32),
            top: this._uv(20, 16, 28, 20),
            bottom: this._uv(28, 16, 36, 20)
        };

        const rArm = {
            right: this._uv(40, 20, 44, 32),
            front: this._uv(44, 20, 48, 32),
            left: this._uv(48, 20, 52, 32),
            back: this._uv(52, 20, 56, 32),
            top: this._uv(44, 16, 48, 20),
            bottom: this._uv(48, 16, 52, 20)
        };

        const lArm = {
            right: this._uv(32, 52, 36, 64),
            front: this._uv(36, 52, 40, 64),
            left: this._uv(40, 52, 44, 64),
            back: this._uv(44, 52, 48, 64),
            top: this._uv(36, 48, 40, 52),
            bottom: this._uv(40, 48, 44, 52)
        };

        const rLeg = {
            right: this._uv(0, 20, 4, 32),
            front: this._uv(4, 20, 8, 32),
            left: this._uv(8, 20, 12, 32),
            back: this._uv(12, 20, 16, 32),
            top: this._uv(4, 16, 8, 20),
            bottom: this._uv(8, 16, 12, 20)
        };

        const lLeg = {
            right: this._uv(16, 52, 20, 64),
            front: this._uv(20, 52, 24, 64),
            left: this._uv(24, 52, 28, 64),
            back: this._uv(28, 52, 32, 64),
            top: this._uv(20, 48, 24, 52),
            bottom: this._uv(24, 48, 28, 52)
        };

        const facePack = (m) => ([
            m.right, m.left, m.top, m.bottom, m.front, m.back
        ]);

        this._headPivot.clear();
        this._bodyPivot.clear();
        const bodyMesh = this._box(BODY.w, BODY.h, BODY.d, facePack(body));
        bodyMesh.position.set(0, 0.75 + 0.375, 0); // above legs
        this._bodyPivot.add(bodyMesh);
        const rLegMesh = this._box(LIMB.w, LIMB.h, LIMB.d, facePack(rLeg));
        rLegMesh.position.set(-0.125, 0.375, 0);
        this._bodyPivot.add(rLegMesh);
        const lLegMesh = this._box(LIMB.w, LIMB.h, LIMB.d, facePack(lLeg));
        lLegMesh.position.set(0.125, 0.375, 0);
        this._bodyPivot.add(lLegMesh);
        const rArmMesh = this._box(LIMB.w, LIMB.h, LIMB.d, facePack(rArm));
        rArmMesh.position.set(-(BODY.w * 0.5 + LIMB.w * 0.5), 0.75 + 0.375, 0);
        this._bodyPivot.add(rArmMesh);
        const lArmMesh = this._box(LIMB.w, LIMB.h, LIMB.d, facePack(lArm));
        lArmMesh.position.set((BODY.w * 0.5 + LIMB.w * 0.5), 0.75 + 0.375, 0);
        this._bodyPivot.add(lArmMesh);
        this._headPivot.position.set(0, 0.75 + 0.75 + 0.25, 0);
        const headMesh = this._box(HEAD.w, HEAD.h, HEAD.d, facePack(head));
        headMesh.position.set(0, 0.25, 0);
        this._headPivot.add(headMesh);
    }

    /**
     * Tick facing and head tracking.
     * @param {THREE.PerspectiveCamera} cam
     * @param {THREE.Vector3} playerPos (camera position is fine)
     * @param {number} dt
     */
    tick(cam, playerPos, dt) {
        this._t += dt;
        const bob = Math.sin(this._t * 2.0) * 0.03;
        this._root.position.y = bob;
        const dx = playerPos.x - this.grp.position.x;
        const dz = playerPos.z - this.grp.position.z;
        const yaw = Math.atan2(dx, dz);
        this.grp.rotation.y = yaw;
        const distXZ = Math.max(0.001, Math.hypot(dx, dz));
        const headWorldY = this.grp.position.y + this._headPivot.position.y + this._root.position.y + 0.25;
        const dy = (playerPos.y - headWorldY);
        const target = clamp(Math.atan2(dy, distXZ), -0.28, 0.28);
        const cur = this._headPivot.rotation.x;
        const a = 1 - Math.exp(-10 * dt);
        this._headPivot.rotation.x = cur + (target - cur) * a;
    }

    get object3d() { return this.grp; }
}
