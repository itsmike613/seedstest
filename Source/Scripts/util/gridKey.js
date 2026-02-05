// Source/Scripts/util/gridKey.js

export function key(x, y, z) { return `${x}|${y}|${z}`; }
export function parse(k) {
    const [x, y, z] = k.split("|").map(Number);
    return { x, y, z };
}