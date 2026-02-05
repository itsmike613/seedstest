// Source/Scripts/gfx/sky.js

import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { now } from "../util/math.js";

export class Sky {
    constructor(scene) {
        this.scene = scene;
        this.m = null;
    }

    init() {
        const g = new THREE.SphereGeometry(120, 24, 16);
        const mat = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            uniforms: {
                top: { value: new THREE.Color(0x84c7ff) },
                mid: { value: new THREE.Color(0x69b7ff) },
                bot: { value: new THREE.Color(0xcfefff) },
                time: { value: 0 }
            },
            vertexShader: `
        varying vec3 vPos;
        void main(){
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
            fragmentShader: `
        varying vec3 vPos;
        uniform vec3 top;
        uniform vec3 mid;
        uniform vec3 bot;
        uniform float time;

        void main(){
          float h = normalize(vPos).y * 0.5 + 0.5;
          float t1 = smoothstep(0.0, 0.55, h);
          float t2 = smoothstep(0.45, 1.0, h);

          vec3 col = mix(bot, mid, t1);
          col = mix(col, top, t2);

          float haze = 0.015 * sin(time * 0.25 + h * 9.0);
          col += haze;

          gl_FragColor = vec4(col, 1.0);
        }
      `
        });

        const mesh = new THREE.Mesh(g, mat);
        mesh.frustumCulled = false;
        this.scene.add(mesh);
        this.m = mesh;
    }

    tick() {
        if (!this.m) return;
        this.m.material.uniforms.time.value = now();
    }
}