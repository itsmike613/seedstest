// Source/Scripts/core/raycast.js

import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

export function raycastBlock({ cam, dir, raycaster, meshes, far }) {
    raycaster.far = far;
    raycaster.set(cam.position, dir);

    const hits = raycaster.intersectObjects([...meshes.values()], false);
    const h = hits.find(q => q.object.geometry && q.object.geometry.type === "BoxGeometry");
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