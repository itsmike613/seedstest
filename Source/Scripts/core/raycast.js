// Source/Scripts/core/raycast.js

import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

export function raycastBlock({ cam, dir, raycaster, meshes, far }) {
    raycaster.far = far;
    raycaster.set(cam.position, dir);
    const list = [];

    if (meshes && meshes.values) {
        for (const v of meshes.values()) {
            if (v && v.isMesh) list.push(v);
            else if (v && v.meshes && v.meshes.values) {
                for (const m of v.meshes.values()) list.push(m);
            }
        }
    }

    const hits = raycaster.intersectObjects(list, false);
    const h = hits.find(q => q.object && q.object.geometry);
    if (!h) return null;

    const p = h.point.clone().addScaledVector(h.face.normal, -0.01);
    const x = Math.floor(p.x);
    const y = Math.floor(p.y);
    const z = Math.floor(p.z);

    const n = h.face.normal;
    const place = new THREE.Vector3(x, y, z).add(n);

    return {
        x, y, z,
        px: Math.floor(place.x),
        py: Math.floor(place.y),
        pz: Math.floor(place.z),
    };
}