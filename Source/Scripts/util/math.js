// Source/Scripts/util/math.js

export function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
export function now() { return performance.now() * 0.001; }
export function d2(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
    return dx * dx + dy * dy + dz * dz;
}
export function rnd(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }