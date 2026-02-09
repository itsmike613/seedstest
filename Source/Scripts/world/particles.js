// Source/Scripts/world/particles.js

import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { clamp } from "../util/math.js";

export class ParticleSystem {
    constructor(scene) {
        this.s = scene;
        this.parts = [];
        this.baseMaterial = new THREE.SpriteMaterial({ 
            color: 0xffffff, 
            transparent: true, 
            opacity: 0.9,
            depthWrite: false 
        });
    }

    burst(x, y, z) {
        const n = 14;
        for (let i = 0; i < n; i++) {
            const sprite = new THREE.Sprite(this.baseMaterial.clone());
            sprite.scale.set(0.12, 0.12, 1);
            this.s.add(sprite);
            this.parts.push({
                p: new THREE.Vector3(x + 0.5, y + 0.6, z + 0.5),
                v: new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 4.2, (Math.random() - 0.5) * 4),
                t: 0,
                life: 0.35 + Math.random() * 0.35,
                m: sprite
            });
        }
    }

    tick(dt) {
        for (let i = this.parts.length - 1; i >= 0; i--) {
            const d = this.parts[i];
            d.t += dt;
            d.v.y -= 18 * dt;
            d.p.addScaledVector(d.v, dt);
            d.m.position.copy(d.p);
            d.m.material.opacity = clamp(1 - d.t / d.life, 0, 1);
            if (d.t > d.life) {
                this.s.remove(d.m);
                d.m.material.dispose();
                this.parts.splice(i, 1);
            }
        }
    }
}