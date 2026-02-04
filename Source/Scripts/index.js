import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

/**
 * Visual upgrade pass (shader-pack-ish vibe) WITHOUT changing gameplay rules:
 * - Better lighting + shadows + tone mapping
 * - Simple gradient sky
 * - Slight atmospheric fog tuning
 * - Subtle crop “wind sway”
 * - Water looks nicer (standard material + gentle texture flow)
 *
 * No gameplay constants/logic changed.
 */

// -----------------------------
// Config / Constants
// -----------------------------
const W = 32, H = 32;
const Y0 = 0, Y1 = 1;
const INF = { x: 0, y: 1, z: 0 };

const conf = {
    reach: 6,
    grav: 24,
    jump: 8.5,
    walk: 5.2,
    sprint: 8.4,
    fr: 14,
    air: 2.0,
    sens: 0.0024,
    pick: 1.6,
    hyd: 5,
    hydelay: 1.2,
    unhydelay: 2.5,
    regrow: 4.5,
    grow: 2.2
};

// -----------------------------
// DOM Root
// -----------------------------
const root = {
    el: {
        c: document.getElementById("c"),
        bar: document.getElementById("bar"),
        sel: document.getElementById("sel"),
        inv: document.getElementById("inv"),
        grid: document.getElementById("grid"),
        carry: document.getElementById("carry"),
        tab: document.getElementById("tab"),
        fps: document.getElementById("fps"),
        pos: document.getElementById("pos"),
        msg: document.getElementById("msg"),
    }
};

// -----------------------------
// Helpers (pure)
// -----------------------------
const K = Object.create(null);

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function now() { return performance.now() * 0.001; }
function d2(a, b) { const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z; return dx * dx + dy * dy + dz * dz; }
function key(x, y, z) { return `${x}|${y}|${z}`; }
function parse(k) { const [x, y, z] = k.split("|").map(Number); return { x, y, z }; }
function rnd(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }

// -----------------------------
// Data Tables (items / blocks / crops)
// -----------------------------
const items = {
    hoe_wood: { k: "hoe_wood", n: "Wooden Hoe", t: "tool", stack: 1, img: "./Source/Assets/Tools/Hoes/wood.png" },
    shovel_wood: { k: "shovel_wood", n: "Wooden Shovel", t: "tool", stack: 1, img: "./Source/Assets/Tools/Shovels/wood.png" },

    bucket_empty: { k: "bucket_empty", n: "Empty Bucket", t: "tool", stack: 1, img: "./Source/Assets/Tools/Buckets/empty.png" },
    bucket_full: { k: "bucket_full", n: "Water Bucket", t: "tool", stack: 1, img: "./Source/Assets/Tools/Buckets/full.png" },

    seed_wheat: { k: "seed_wheat", n: "Wheat Seeds", t: "seed", stack: 256, img: "./Source/Assets/Crops/Wheat/seed.png" },
    seed_carrot: { k: "seed_carrot", n: "Carrot Seeds", t: "seed", stack: 256, img: "./Source/Assets/Crops/Carrot/seed.png" },

    wheat: { k: "wheat", n: "Wheat", t: "food", stack: 256, img: "./Source/Assets/Crops/Wheat/item.png" },
    carrot: { k: "carrot", n: "Carrot", t: "food", stack: 256, img: "./Source/Assets/Crops/Carrot/item.png" },

    dirt: { k: "dirt", n: "Dirt", t: "block", stack: 256, img: "./Source/Assets/Blocks/dirt.png" },
    water: { k: "water", n: "Water", t: "block", stack: 256, img: "./Source/Assets/Blocks/water.png" }
};

const blocks = {
    grass: { k: "grass", img: "./Source/Assets/Blocks/grass.png", breakable: true },
    dirt: { k: "dirt", img: "./Source/Assets/Blocks/dirt.png", breakable: true },
    unbreak: { k: "unbreak", img: "./Source/Assets/Blocks/unbreakable.png", breakable: false },
    tilled_dry: { k: "tilled_dry", img: "./Source/Assets/Blocks/unhydrated.png", breakable: true },
    tilled_wet: { k: "tilled_wet", img: "./Source/Assets/Blocks/hydrated.png", breakable: true },
    water: { k: "water", img: "./Source/Assets/Blocks/water.png", breakable: true },
    path: { k: "path", img: "./Source/Assets/Blocks/path.png", breakable: true }
};

const crops = {
    wheat: {
        seed: "seed_wheat",
        drop: { item: "wheat", min: 1, max: 1 },
        bonus: { item: "seed_wheat", min: 1, max: 2 },
        stages: [
            "./Source/Assets/Crops/Wheat/stage1.png",
            "./Source/Assets/Crops/Wheat/stage2.png",
            "./Source/Assets/Crops/Wheat/stage3.png",
            "./Source/Assets/Crops/Wheat/stage4.png",
            "./Source/Assets/Crops/Wheat/stage5.png",
            "./Source/Assets/Crops/Wheat/stage6.png",
        ]
    },
    carrot: {
        seed: "seed_carrot",
        drop: { item: "carrot", min: 1, max: 2 },
        bonus: { item: "seed_carrot", min: 1, max: 2 },
        stages: [
            "./Source/Assets/Crops/Carrot/stage1.png",
            "./Source/Assets/Crops/Carrot/stage2.png",
            "./Source/Assets/Crops/Carrot/stage3.png",
            "./Source/Assets/Crops/Carrot/stage4.png",
        ]
    }
};

// -----------------------------
// Inventory
// -----------------------------
class Bag {
    constructor() {
        this.hot = Array.from({ length: 9 }, () => null);
        this.inv = Array.from({ length: 36 }, () => null);
        this.sel = 0;
        this.carry = null;
    }

    add(k, c = 1) {
        const it = items[k];
        if (!it) return c;

        const fill = (arr) => {
            if (it.stack > 1) {
                for (let i = 0; i < arr.length; i++) {
                    const s = arr[i];
                    if (s && s.k === k && s.c < it.stack) {
                        const can = Math.min(it.stack - s.c, c);
                        s.c += can; c -= can;
                        if (c <= 0) return 0;
                    }
                }
            }
            for (let i = 0; i < arr.length; i++) {
                if (!arr[i]) {
                    const put = Math.min(it.stack, c);
                    arr[i] = { k, c: put };
                    c -= put;
                    if (c <= 0) return 0;
                }
            }
            return c;
        };

        c = fill(this.hot);
        if (c > 0) c = fill(this.inv);
        return c;
    }

    moveQuick(i, hot) {
        const a = hot ? this.hot : this.inv;
        const b = hot ? this.inv : this.hot;
        const s = a[i];
        if (!s) return;

        const it = items[s.k];
        if (it.stack > 1) {
            for (let j = 0; j < b.length; j++) {
                const d = b[j];
                if (d && d.k === s.k && d.c < it.stack) {
                    const can = Math.min(it.stack - d.c, s.c);
                    d.c += can; s.c -= can;
                    if (s.c <= 0) { a[i] = null; return; }
                }
            }
        }
        for (let j = 0; j < b.length; j++) {
            if (!b[j]) { b[j] = s; a[i] = null; return; }
        }
    }

    put(i, hot, st) {
        const arr = hot ? this.hot : this.inv;
        const dst = arr[i];
        if (!dst) { arr[i] = st; return null; }

        const it = items[st.k];
        if (dst.k === st.k && it.stack > 1) {
            const can = Math.min(it.stack - dst.c, st.c);
            dst.c += can; st.c -= can;
            if (st.c <= 0) return null;
            return st;
        }
        arr[i] = st;
        return dst;
    }
}

// -----------------------------
// Texture Cache
// -----------------------------
class Tex {
    constructor() {
        this.l = new THREE.TextureLoader();
        this.m = new Map();
    }

    async get(url) {
        if (this.m.has(url)) return this.m.get(url);
        const t = await new Promise((res) => {
            this.l.load(url, (tx) => res(tx), undefined, () => res(null));
        });

        if (!t) {
            const c = document.createElement("canvas");
            c.width = c.height = 32;
            const g = c.getContext("2d");
            g.fillStyle = "#ff00ff"; g.fillRect(0, 0, 32, 32);
            g.fillStyle = "#000"; g.fillRect(0, 0, 16, 16);
            g.fillRect(16, 16, 16, 16);
            const tx = new THREE.CanvasTexture(c);
            tx.colorSpace = THREE.SRGBColorSpace;
            tx.magFilter = THREE.NearestFilter;
            tx.minFilter = THREE.NearestFilter;
            tx.generateMipmaps = false;
            this.m.set(url, tx);
            return tx;
        }

        // Visual: correct color space + crisp pixel look
        t.colorSpace = THREE.SRGBColorSpace;
        t.magFilter = THREE.NearestFilter;
        t.minFilter = THREE.NearestFilter;
        t.generateMipmaps = false;

        this.m.set(url, t);
        return t;
    }
}

// -----------------------------
// Simple Gradient Sky (visual only)
// -----------------------------
class Sky {
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
                    // soft banding like “shader pack” sky
                    float t1 = smoothstep(0.0, 0.55, h);
                    float t2 = smoothstep(0.45, 1.0, h);

                    vec3 col = mix(bot, mid, t1);
                    col = mix(col, top, t2);

                    // faint moving haze
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

// -----------------------------
// Voxel World (blocks/crops/items/particles)
// -----------------------------
class Vox {
    constructor(scene, tex) {
        this.s = scene;
        this.t = tex;

        this.g = new THREE.BoxGeometry(1, 1, 1);
        this.mats = new Map();
        this.mesh = new Map();
        this.map = new Map();

        this.water = new Set();
        this.tilled = new Map();
        this.crop = new Map();

        // Visual: crop planes tracked for wind sway
        this.cropPlanes = new Map(); // baseKey => array of meshes

        this.items = [];
        this.parts = [];
    }

    inPad(x, z) { return x >= 0 && z >= 0 && x < W && z < H; }

    // Top surface height for the column at (x,z).
    // If there is NO block at Y1 => you stand on Y0 block top (1.0).
    // If there IS a block at Y1 => top is 2.0 (or lower for water/path).
    topAt(x, z) {
        const t = this.get(x, Y1, z);
        if (!t) return Y0 + 1;
        if (t === "water") return Y1 + 0.85;
        if (t === "path") return Y1 + 0.90;
        return Y1 + 1;
    }

    async mat(url, idHint = "") {
        const mk = url + "|std|" + idHint;
        if (this.mats.has(mk)) return this.mats.get(mk);

        const tx = await this.t.get(url);

        // Visual: nicer response to lighting while keeping pixel textures
        // Water gets a bit more “shiny/transparent”.
        let m;
        if (idHint === "water") {
            tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
            tx.repeat.set(1, 1);
            m = new THREE.MeshStandardMaterial({
                map: tx,
                transparent: true,
                opacity: 0.85,
                roughness: 0.18,
                metalness: 0.0,
                emissive: new THREE.Color(0x112244),
                emissiveIntensity: 0.15
            });
        } else {
            m = new THREE.MeshStandardMaterial({
                map: tx,
                transparent: true,
                roughness: 0.9,
                metalness: 0.0
            });
        }

        this.mats.set(mk, m);
        return m;
    }

    get(x, y, z) { return this.map.get(key(x, y, z)); }

    async set(x, y, z, id) {
        const k = key(x, y, z);
        const prev = this.map.get(k);
        if (prev === id) return;

        if (this.mesh.has(k)) {
            this.s.remove(this.mesh.get(k));
            this.mesh.delete(k);
        }

        if (prev === "water") this.water.delete(k);
        if (id === "water") this.water.add(k);

        if (!id) {
            this.map.delete(k);
            return;
        }

        this.map.set(k, id);

        const b = blocks[id];
        const m = await this.mat(b.img, id);
        const mesh = new THREE.Mesh(this.g, m);
        mesh.position.set(x + 0.5, y + 0.5, z + 0.5);

        // Visual: shadows
        mesh.castShadow = (id !== "water");
        mesh.receiveShadow = true;

        if (id === "water") {
            mesh.scale.y = 0.85;
            mesh.position.y -= 0.075;
        }

        if (id === "path") {
            mesh.scale.y = 0.90;
            mesh.position.y -= 0.05;
        }

        this.s.add(mesh);
        this.mesh.set(k, mesh);
    }

    async init() {
        for (let x = 0; x < W; x++) {
            for (let z = 0; z < H; z++) {
                await this.set(x, Y0, z, "unbreak");
                await this.set(x, Y1, z, "grass");
            }
        }
        await this.set(INF.x, INF.y, INF.z, "water");
    }

    nearWater(x, z) {
        for (let dx = -conf.hyd; dx <= conf.hyd; dx++) {
            for (let dz = -conf.hyd; dz <= conf.hyd; dz++) {
                const nx = x + dx, nz = z + dz;
                if (!this.inPad(nx, nz)) continue;
                if (this.get(nx, Y1, nz) === "water") {
                    if (Math.sqrt(dx * dx + dz * dz) <= conf.hyd) return true;
                }
            }
        }
        return false;
    }

    async till(x, z) {
        const id = this.get(x, Y1, z);
        if (id !== "grass" && id !== "dirt") return false;
        if (!this.nearWater(x, z)) return false;
        await this.set(x, Y1, z, "tilled_dry");
        this.tilled.set(key(x, Y1, z), { wet: false, ts: now() });
        return true;
    }

    async plant(x, z, type) {
        const id = this.get(x, Y1, z);
        if (id !== "tilled_dry" && id !== "tilled_wet") return false;
        const k = key(x, Y1, z);
        if (this.crop.has(k)) return false;
        this.crop.set(k, { type, st: 0, ts: now() });
        await this.cropMesh(x, Y1, z, type, 0);
        return true;
    }

    async cropMesh(x, y, z, type, st) {
        const base = key(x, y, z) + "|crop";

        // clear old planes
        for (let i = 0; i < 4; i++) {
            const kk = base + i;
            if (this.mesh.has(kk)) { this.s.remove(this.mesh.get(kk)); this.mesh.delete(kk); }
        }
        this.cropPlanes.delete(base);

        const list = crops[type].stages;
        const url = list[clamp(st, 0, list.length - 1)];
        const tx = await this.t.get(url);

        const m = new THREE.MeshLambertMaterial({
            map: tx,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        const g = new THREE.PlaneGeometry(1, 1);
        const p = new THREE.Vector3(x + 0.5, y + 1.5, z + 0.5);

        const rots = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];

        const planes = [];
        for (let i = 0; i < 4; i++) {
            const mesh = new THREE.Mesh(g, m);
            mesh.position.copy(p);
            mesh.rotation.y = rots[i];
            mesh.scale.set(0.95, 0.95, 0.95);

            // Visual: crops receive/cast subtle shadows
            mesh.castShadow = true;
            mesh.receiveShadow = false;

            this.s.add(mesh);
            this.mesh.set(base + i, mesh);
            planes.push(mesh);
        }

        // Visual: track for wind sway
        this.cropPlanes.set(base, {
            planes,
            center: p.clone(),
            seed: (x * 37.1 + z * 91.7 + (type === "wheat" ? 11.3 : 23.7)) * 0.1
        });
    }

    killCrop(x, z) {
        const k = key(x, Y1, z);
        this.crop.delete(k);
        const base = k + "|crop";
        for (let i = 0; i < 4; i++) {
            const kk = base + i;
            if (this.mesh.has(kk)) { this.s.remove(this.mesh.get(kk)); this.mesh.delete(kk); }
        }
        this.cropPlanes.delete(base);
    }

    async breakCrop(x, z) {
        const k = key(x, Y1, z);
        if (!this.crop.has(k)) return false;
        const c = this.crop.get(k);
        await this.dropCrop(x, Y1, z, c.type, false);
        this.killCrop(x, z);
        return true;
    }

    async dropCrop(x, y, z, type, popped) {
        const c = crops[type];
        const k = key(x, Y1, z);
        const cur = this.crop.get(k);
        const st = cur ? cur.st : (c.stages.length - 1);
        const max = c.stages.length - 1;

        if (popped) {
            this.spawnItem(c.seed, new THREE.Vector3(x + 0.5, y + 1.35, z + 0.5), 1);
            return;
        }

        if (st >= max) {
            for (let i = 0; i < 3; i++) {
                this.spawnOrb(
                    new THREE.Vector3(x + 0.5, y + 1.6, z + 0.5),
                    0x33ff33
                );
            }
            for (let i = 0; i < 2; i++) {
                this.spawnOrb(
                    new THREE.Vector3(x + 0.6, y + 1.6, z + 0.5),
                    0xffd800
                );
            }
        }
        else {
            this.spawnItem(c.seed, new THREE.Vector3(x + 0.5, y + 1.35, z + 0.5), 1);
        }
        this.partsBurst(x, y, z);
    }

    async hydrateTick() {
        const t = now();
        for (const [k, v] of this.tilled) {
            const p = parse(k);
            const has = this.nearWater(p.x, p.z);

            if (has) {
                if (!v.wet && (t - v.ts) > conf.hydelay) {
                    v.wet = true; v.ts = t;
                    await this.set(p.x, p.y, p.z, "tilled_wet");
                }
            } else {
                if (v.wet && (t - v.ts) > conf.unhydelay) {
                    v.wet = false; v.ts = t;
                    await this.set(p.x, p.y, p.z, "tilled_dry");

                    const ck = key(p.x, p.y, p.z);
                    if (this.crop.has(ck)) {
                        const c = this.crop.get(ck);
                        await this.dropCrop(p.x, p.y, p.z, c.type, true);
                        this.killCrop(p.x, p.z);

                        await this.set(p.x, p.y, p.z, "dirt");
                        this.tilled.delete(ck);
                        this.regrowLater(p.x, p.y, p.z);
                    }
                }
            }
        }
    }

    async growTick() {
        const t = now();
        for (const [k, c] of this.crop) {
            if ((t - c.ts) < conf.grow) continue;
            c.ts = t;

            const p = parse(k);
            const soil = this.get(p.x, p.y, p.z);
            const wet = (soil === "tilled_wet");
            if (!wet && Math.random() < 0.6) continue;

            const max = crops[c.type].stages.length - 1;
            if (c.st < max) {
                c.st++;
                await this.cropMesh(p.x, p.y, p.z, c.type, c.st);
            }
        }
    }

    regrowLater(x, y, z) {
        setTimeout(async () => {
            if (this.get(x, y, z) === "dirt") await this.set(x, y, z, "grass");
        }, conf.regrow * 1000);
    }

    async breakBlock(x, y, z) {
        if (x === INF.x && y === INF.y && z === INF.z) return null;

        const id = this.get(x, y, z);
        if (!id) return null;
        if (!blocks[id].breakable) return null;

        if (y === Y1) {
            await this.breakCrop(x, z);
            const ck = key(x, y, z);
            if (id === "tilled_dry" || id === "tilled_wet") this.tilled.delete(ck);
        }

        if (id === "water") {
            await this.set(x, y, z, null);
            this.partsBurst(x, y, z);
            return "water";
        }

        await this.set(x, y, z, null);
        this.spawnItem("dirt", new THREE.Vector3(x + 0.5, y + 1.05, z + 0.5), 1);
        this.partsBurst(x, y, z);
        return "dirt";
    }

    async place(x, y, z, id) {
        if (!this.inPad(x, z)) return false;
        if (y !== Y1) return false;
        if (x === INF.x && y === INF.y && z === INF.z) return false;
        await this.set(x, y, z, id);

        if (id === "dirt") this.regrowLater(x, y, z);
        return true;
    }

    spawnItem(k, p, c) {
        const it = items[k];
        if (!it) return;

        for (const d of this.items) {
            if (d.k === k && it.stack > 1 && d2(d.p, p) < 0.5 * 0.5) {
                d.c = Math.min(it.stack, d.c + c);
                return;
            }
        }
        this.items.push({
            k, c,
            p: p.clone(),
            v: new THREE.Vector3((Math.random() - 0.5) * 1.2, 2.0, (Math.random() - 0.5) * 1.2),
            m: null
        });
    }

    async itemMesh(d) {
        if (d.m) return;

        const tx = await this.t.get(items[d.k].img);

        const g = new THREE.BoxGeometry(0.25, 0.25, 0.25);
        const m = new THREE.MeshStandardMaterial({ map: tx });

        const cube = new THREE.Mesh(g, m);
        cube.position.copy(d.p);
        cube.castShadow = true;
        cube.receiveShadow = false;

        this.s.add(cube);
        d.m = cube;
    }


    // Items rest on correct surface height (no dropping to y-1).
    async itemTick(dt, plPos, bag) {
        for (let i = this.items.length - 1; i >= 0; i--) {
            const d = this.items[i];
            await this.itemMesh(d);

            d.v.y -= 18 * dt;
            d.p.addScaledVector(d.v, dt);

            // clamp to the top of the column under the item
            const bx = clamp(Math.floor(d.p.x), 0, W - 1);
            const bz = clamp(Math.floor(d.p.z), 0, H - 1);
            const top = this.topAt(bx, bz);
            const fy = top + 0.05;

            if (d.p.y < fy) {
                d.p.y = fy;
                d.v.y *= -0.18;
                d.v.x *= 0.78;
                d.v.z *= 0.78;
            }

            const bob = Math.sin(now() * 4 + i) * 0.03;
            d.m.position.set(d.p.x, d.p.y + bob, d.p.z);

            const pp = new THREE.Vector3(plPos.x, plPos.y - 1.2, plPos.z);

            const dir = pp.clone().sub(d.p).normalize();
            d.v.addScaledVector(dir, dt * 14);

            if (d2(pp, d.p) < conf.pick * conf.pick) {
                const left = bag.add(d.k, d.c);
                if (left <= 0) {
                    this.s.remove(d.m);
                    this.items.splice(i, 1);
                } else {
                    d.c = left;
                }
            }
        }
    }

    partsBurst(x, y, z) {
        const n = 14;
        for (let i = 0; i < n; i++) {
            this.parts.push({
                p: new THREE.Vector3(x + 0.5, y + 0.6, z + 0.5),
                v: new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 4.2, (Math.random() - 0.5) * 4),
                t: 0,
                life: 0.35 + Math.random() * 0.35,
                m: null
            });
        }
    }

    partsTick(dt, cam) {
        for (let i = this.parts.length - 1; i >= 0; i--) {
            const d = this.parts[i];
            if (!d.m) {
                const g = new THREE.PlaneGeometry(0.12, 0.12);
                const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false });
                const a = new THREE.Mesh(g, m);
                this.s.add(a);
                d.m = a;
            }
            d.t += dt;
            d.v.y -= 18 * dt;
            d.p.addScaledVector(d.v, dt);
            d.m.position.copy(d.p);
            d.m.lookAt(cam.position);
            d.m.material.opacity = clamp(1 - d.t / d.life, 0, 1);
            if (d.t > d.life) {
                this.s.remove(d.m);
                this.parts.splice(i, 1);
            }
            if (d.orb) {
                d.orb.userData.t += dt;
                const s = 1 + Math.sin(now() * 6) * 0.15;
                d.orb.scale.setScalar(s);

                const dir = cam.position.clone().sub(d.orb.position).normalize();
                d.orb.position.addScaledVector(dir, dt * 4);

                if (d.orb.position.distanceTo(cam.position) < 1) {
                    if (d.orb.material.color.getHex() === 0x33ff33) {
                        game.addXP(3);
                    } else {
                        game.coins++;
                        coins.textContent = game.coins;
                    }
                    this.scene.remove(d.orb);
                    this.parts.splice(i, 1);
                }
            }
        }
    }

    // -----------------------------
    // Visual-only tick: crop wind + water flow
    // -----------------------------
    visualTick() {
        const t = now();

        // Crop “wind sway”
        for (const [, d] of this.cropPlanes) {
            const w = 0.06 + 0.015 * Math.sin(t * 0.7 + d.seed);
            const sway = Math.sin(t * (1.4 + 0.25 * Math.sin(d.seed)) + d.seed) * w;
            const sway2 = Math.cos(t * 1.15 + d.seed * 1.7) * (w * 0.65);

            for (let i = 0; i < d.planes.length; i++) {
                const m = d.planes[i];
                // keep anchored at base, lean a bit
                m.position.copy(d.center);
                m.rotation.z = 0;
                m.rotation.x = 0;

                // tiny “stem” lean
                m.rotation.x = (i % 2 === 0 ? sway : -sway) * 0.35;
                m.rotation.z = (i % 2 === 0 ? sway2 : -sway2) * 0.35;

                // slight vertical flutter
                m.position.y = d.center.y + 0.02 * Math.sin(t * 2.2 + d.seed + i);
            }
        }

        // Water texture flow (gentle)
        // (only affects materials created with water hint)
        const flowU = (t * 0.015) % 1;
        const flowV = (t * 0.010) % 1;
        for (const k of this.water) {
            const m = this.mesh.get(k);
            if (!m) continue;
            const mat = m.material;
            if (mat && mat.map) {
                mat.map.offset.set(flowU, flowV);
            }
        }
    }

    spawnOrb(pos, color) {
        const g = new THREE.BoxGeometry(0.18, 0.18, 0.18);
        const m = new THREE.MeshBasicMaterial({ color });
        const o = new THREE.Mesh(g, m);
        o.position.copy(pos);
        o.userData = { t: 0 };
        this.s.add(o);
        this.parts.push({ orb: o });
    }

}

// -----------------------------
// UI: Hotbar + Inventory Grid
// -----------------------------
class UI {
    constructor(rootEl, bag, onSlotDown) {
        this.el = rootEl;
        this.bag = bag;
        this.onSlotDown = onSlotDown;

        this.open = false;
    }

    build() {
        this.el.bar.innerHTML = "";
        for (let i = 0; i < 9; i++) {
            const s = document.createElement("div");
            s.className = "slot";
            this.el.bar.appendChild(s);
        }

        this.el.grid.innerHTML = "";
        const make = (i, hot) => {
            const s = document.createElement("div");
            s.className = "slot";
            s.dataset.i = String(i);
            s.dataset.h = hot ? "1" : "0";
            s.addEventListener("mousedown", (e) => this.onSlotDown(e));
            s.addEventListener("contextmenu", (e) => e.preventDefault());
            return s;
        };

        for (let i = 0; i < 36; i++) this.el.grid.appendChild(make(i, false));
        for (let i = 0; i < 9; i++) {
            const a = make(i, true);
            a.style.marginTop = "10px";
            this.el.grid.appendChild(a);
        }
    }

    setOpen(v) {
        this.open = v;
        this.el.inv.classList.toggle("hide", !this.open);
    }

    paintSlot(el, st) {
        el.innerHTML = "";
        if (!st) return;

        const a = document.createElement("div");
        a.className = "icon";
        a.style.backgroundImage = `url("${items[st.k].img}")`;
        el.appendChild(a);

        const it = items[st.k];
        if (it.stack > 1 && st.c > 1) {
            const n = document.createElement("div");
            n.className = "num";
            n.textContent = String(st.c);
            el.appendChild(n);
        }
    }

    draw() {
        const hs = [...this.el.bar.children];
        for (let i = 0; i < 9; i++) this.paintSlot(hs[i], this.bag.hot[i]);
        this.el.sel.style.transform = `translateX(${(44 + 6) * this.bag.sel}px)`;

        if (this.open) {
            const gs = [...this.el.grid.children];
            for (let i = 0; i < 36; i++) this.paintSlot(gs[i], this.bag.inv[i]);
            for (let i = 0; i < 9; i++) this.paintSlot(gs[36 + i], this.bag.hot[i]);

            if (this.bag.carry) {
                this.el.carry.classList.remove("hide");
                this.el.carry.innerHTML = "";
                const a = document.createElement("div");
                a.className = "slot";
                const b = document.createElement("div");
                b.className = "icon";
                b.style.backgroundImage = `url("${items[this.bag.carry.k].img}")`;
                a.appendChild(b);
                if (items[this.bag.carry.k].stack > 1 && this.bag.carry.c > 1) {
                    const n = document.createElement("div");
                    n.className = "num";
                    n.textContent = String(this.bag.carry.c);
                    a.appendChild(n);
                }
                this.el.carry.appendChild(a);
            } else {
                this.el.carry.classList.add("hide");
            }
        }
    }
}

// -----------------------------
// Crack Overlay (mining visualization)
// -----------------------------
class CrackOverlay {
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

// -----------------------------
// Hologram
// -----------------------------
class Hologram {
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

// -----------------------------
// Game (ties everything together, keeps behavior)
// -----------------------------
class Game {
    constructor(root) {
        this.root = root;

        // --- exp lvls coins ---
        this.xp = 0;
        this.level = 1;
        this.coins = 0;

        // --- three ---
        this.ren = new THREE.WebGLRenderer({ canvas: this.root.el.c, antialias: true });
        this.ren.setPixelRatio(Math.min(devicePixelRatio, 2));
        this.ren.setSize(innerWidth, innerHeight, false);

        // Visual: nicer output
        this.ren.outputColorSpace = THREE.SRGBColorSpace;
        this.ren.toneMapping = THREE.ACESFilmicToneMapping;
        this.ren.toneMappingExposure = 1.08;

        // Visual: shadows
        this.ren.shadowMap.enabled = true;
        this.ren.shadowMap.type = THREE.PCFSoftShadowMap;

        this.ren.setClearColor(0x69b7ff, 1);

        this.scene = new THREE.Scene();

        // Visual: atmospheric fog a bit smoother
        this.scene.fog = new THREE.Fog(0x69b7ff, 22, 62);

        this.cam = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.01, 200);

        // --- lighting (visual only) ---
        this.sun = new THREE.DirectionalLight(0xffffff, 1.05);
        this.sun.position.set(10, 18, 8);
        this.sun.castShadow = true;
        this.sun.shadow.mapSize.set(1024, 1024);
        this.sun.shadow.camera.near = 1;
        this.sun.shadow.camera.far = 60;
        this.sun.shadow.camera.left = -18;
        this.sun.shadow.camera.right = 18;
        this.sun.shadow.camera.top = 18;
        this.sun.shadow.camera.bottom = -18;
        this.sun.shadow.bias = -0.00035;
        this.scene.add(this.sun);

        this.hemi = new THREE.HemisphereLight(0xcfefff, 0x3b3f4a, 0.55);
        this.scene.add(this.hemi);

        this.scene.add(new THREE.AmbientLight(0xffffff, 0.20));

        // --- sky (visual only) ---
        this.sky = new Sky(this.scene);

        // --- world ---
        this.tex = new Tex();
        this.vox = new Vox(this.scene, this.tex);

        // --- player ---
        this.pl = {
            p: new THREE.Vector3(1.35, 2.65, 1.35),
            v: new THREE.Vector3(),
            yaw: 0,
            pit: 0,
            on: false
        };

        // --- inventory ---
        this.bag = new Bag();
        this.seedInitialHotbar();

        // --- state ---
        this.lock = false;
        this.open = false;
        this.tab = false;

        // mining state
        this.mine = { on: false, k: "", p: { x: 0, y: 0, z: 0 }, t: 0, need: 0.8 };

        // --- raycast ---
        this.ray = new THREE.Raycaster();
        this.ray.far = conf.reach;

        // --- visuals ---
        this.crack = new CrackOverlay(this.scene, this.tex);
        this.holo = new Hologram(this.scene);

        // --- UI ---
        this.ui = new UI(this.root.el, this.bag, (e) => this.slotDown(e));

        // --- fps ---
        this.fpa = 0; this.fpf = 0; this.fps = 0;

        // --- loop timing ---
        this.last = performance.now();

        // bind
        this.loop = this.loop.bind(this);
    }

    addXP(v) {
        this.xp += v;
        const need = this.level * 10;

        if (this.xp >= need) {
            this.xp -= need;
            this.level++;
        }

        document.getElementById("xpfill").style.width =
            `${(this.xp / need) * 100}%`;

        document.getElementById("lvl").textContent = this.level;
    }

    seedInitialHotbar() {
        this.bag.hot[0] = { k: "hoe_wood", c: 1 };
        this.bag.hot[1] = { k: "shovel_wood", c: 1 };
        this.bag.hot[2] = { k: "bucket_empty", c: 1 };
        this.bag.hot[3] = { k: "seed_wheat", c: 3 };
        this.bag.hot[4] = { k: "seed_carrot", c: 3 };
    }

    // -----------------------------
    // Messaging
    // -----------------------------
    msg(t) {
        this.root.el.msg.textContent = t;
        this.root.el.msg.classList.remove("hide");
        clearTimeout(this.msg._t);
        this.msg._t = setTimeout(() => this.root.el.msg.classList.add("hide"), 1100);
    }

    // -----------------------------
    // Camera / Facing
    // -----------------------------
    facing() {
        const cx = -Math.sin(this.pl.yaw) * Math.cos(this.pl.pit);
        const cy = Math.sin(this.pl.pit);
        const cz = -Math.cos(this.pl.yaw) * Math.cos(this.pl.pit);
        return new THREE.Vector3(cx, cy, cz).normalize();
    }

    camSync() {
        this.cam.position.copy(this.pl.p);
        this.cam.rotation.order = "YXZ";
        this.cam.rotation.y = this.pl.yaw;
        this.cam.rotation.x = this.pl.pit;
    }

    // -----------------------------
    // Input / Pointer lock
    // -----------------------------
    prevent(e) {
        if (this.lock || this.open) {
            if (e.code === "Space" || e.code === "Tab" || e.ctrlKey || e.metaKey || e.altKey) e.preventDefault();
        }
    }

    setOpen(v) {
        this.open = v;
        this.ui.setOpen(v);
        if (this.open) {
            if (document.pointerLockElement) document.exitPointerLock();
        } else {
            this.root.el.c.requestPointerLock();
        }
    }

    installEvents() {
        addEventListener("resize", () => {
            this.cam.aspect = innerWidth / innerHeight;
            this.cam.updateProjectionMatrix();
            this.ren.setSize(innerWidth, innerHeight, false);
        });

        document.addEventListener("pointerlockchange", () => {
            this.lock = (document.pointerLockElement === this.root.el.c);
        });

        addEventListener("mousemove", (e) => {
            if (this.open) {
                this.root.el.carry.style.left = e.clientX + "px";
                this.root.el.carry.style.top = e.clientY + "px";
            }
            if (!this.lock || this.open) return;
            this.pl.yaw -= e.movementX * conf.sens;
            this.pl.pit -= e.movementY * conf.sens;
            this.pl.pit = clamp(this.pl.pit, -1.45, 1.45);
        });

        addEventListener("mousedown", async (e) => {
            if (this.open) return;
            if (!this.lock) { this.root.el.c.requestPointerLock(); return; }
            if (e.button === 0) this.mine.on = true;
            if (e.button === 2) await this.use();
        });

        addEventListener("mouseup", (e) => {
            if (e.button === 0) {
                this.mine.on = false;
                this.mine.t = 0;
                this.crack.hide();
            }
        });

        addEventListener("contextmenu", (e) => e.preventDefault());

        addEventListener("keydown", (e) => {
            this.prevent(e);
            K[e.code] = true;

            if (e.code === "KeyE" && !e.repeat) {
                this.setOpen(!this.open);
                this.mine.on = false;
                this.mine.t = 0;
                this.crack.hide();
            }

            if (e.code === "Tab") {
                e.preventDefault();
                this.tab = true;
                this.root.el.tab.classList.remove("hide");
            }

            if (e.code.startsWith("Digit")) {
                const n = Number(e.code.slice(5)) - 1;
                if (n >= 0 && n < 9) this.bag.sel = n;
            }
        });

        addEventListener("keyup", (e) => {
            this.prevent(e);
            K[e.code] = false;

            if (e.code === "Tab") {
                e.preventDefault();
                this.tab = false;
                this.root.el.tab.classList.add("hide");
            }
        });
    }

    // -----------------------------
    // UI inventory interactions
    // -----------------------------
    slotDown(e) {
        e.preventDefault();
        const el = e.currentTarget;
        const i = Number(el.dataset.i);
        const hot = el.dataset.h === "1";
        const shift = e.shiftKey;

        if (shift) { this.bag.moveQuick(i, hot); return; }

        const arr = hot ? this.bag.hot : this.bag.inv;
        const cur = arr[i];

        if (e.button === 2) {
            if (!this.bag.carry && cur && items[cur.k].stack > 1 && cur.c > 1) {
                const half = Math.ceil(cur.c / 2);
                this.bag.carry = { k: cur.k, c: half };
                cur.c -= half;
                if (cur.c <= 0) arr[i] = null;
                return;
            }
            if (this.bag.carry) {
                const it = items[this.bag.carry.k];
                if (!cur) {
                    arr[i] = { k: this.bag.carry.k, c: 1 };
                    this.bag.carry.c -= 1;
                    if (this.bag.carry.c <= 0) this.bag.carry = null;
                    return;
                }
                if (cur.k === this.bag.carry.k && it.stack > 1 && cur.c < it.stack) {
                    cur.c += 1;
                    this.bag.carry.c -= 1;
                    if (this.bag.carry.c <= 0) this.bag.carry = null;
                    return;
                }
            }
            return;
        }

        if (!this.bag.carry) {
            if (cur) { arr[i] = null; this.bag.carry = cur; }
            return;
        }

        const left = this.bag.put(i, hot, this.bag.carry);
        this.bag.carry = left;
    }

    // -----------------------------
    // Movement / Collision (unchanged math)
    // -----------------------------
    damp(v, t, k, dt) {
        const a = 1 - Math.exp(-k * dt);
        return v + (t - v) * a;
    }

    ctrl(dt) {
        const f = this.facing();
        const up = new THREE.Vector3(0, 1, 0);
        const r = new THREE.Vector3().crossVectors(f, up).normalize();

        let ax = 0, az = 0;
        if (K["KeyW"]) { ax += f.x; az += f.z; }
        if (K["KeyS"]) { ax -= f.x; az -= f.z; }
        if (K["KeyA"]) { ax -= r.x; az -= r.z; }
        if (K["KeyD"]) { ax += r.x; az += r.z; }

        const len = Math.hypot(ax, az);
        if (len > 0) { ax /= len; az /= len; }

        const sp = (K["ControlLeft"] || K["ControlRight"]) ? conf.sprint : conf.walk;
        const fr = this.pl.on ? conf.fr : conf.air;

        this.pl.v.x = this.damp(this.pl.v.x, ax * sp, fr, dt);
        this.pl.v.z = this.damp(this.pl.v.z, az * sp, fr, dt);

        if (this.pl.on && K["Space"]) {
            this.pl.v.y = conf.jump;
            this.pl.on = false;
        }

        this.pl.v.y -= conf.grav * dt;
    }

    // Solid collision (unchanged)
    collide(dt) {
        const R = 0.25;
        const HEIGHT = 1.62;
        const EPS = 0.001;

        const solidTop = (bx, bz) => {
            if (bx < 0 || bz < 0 || bx >= W || bz >= H) return -Infinity;
            return this.vox.topAt(bx, bz);
        };

        // --- vertical ---
        this.pl.p.y += this.pl.v.y * dt;

        const cx = clamp(Math.floor(this.pl.p.x), 0, W - 1);
        const cz = clamp(Math.floor(this.pl.p.z), 0, H - 1);
        const floorTop = solidTop(cx, cz);

        const feet = this.pl.p.y - HEIGHT;
        if (feet < floorTop) {
            this.pl.p.y += (floorTop - feet);
            this.pl.v.y = 0;
            this.pl.on = true;
        } else {
            this.pl.on = false;
        }

        const feetY = this.pl.p.y - HEIGHT;

        const resolveX = (x, z) => {
            const minX = clamp(Math.floor(x - R), 0, W - 1);
            const maxX = clamp(Math.floor(x + R), 0, W - 1);
            const minZ = clamp(Math.floor(z - R), 0, H - 1);
            const maxZ = clamp(Math.floor(z + R), 0, H - 1);

            let nx = x;

            for (let bz = minZ; bz <= maxZ; bz++) {
                for (let bx = minX; bx <= maxX; bx++) {
                    const top = solidTop(bx, bz);
                    if (top <= feetY + EPS) continue;

                    const closestX = clamp(nx, bx, bx + 1);
                    const closestZ = clamp(z, bz, bz + 1);

                    const dx = nx - closestX;
                    const dz = z - closestZ;
                    const dd = dx * dx + dz * dz;

                    if (dd < R * R - 1e-9) {
                        if (dx >= 0) nx = (closestX + Math.sqrt(Math.max(0, R * R - dz * dz))) + EPS;
                        else nx = (closestX - Math.sqrt(Math.max(0, R * R - dz * dz))) - EPS;
                    }
                }
            }
            return nx;
        };

        const resolveZ = (x, z) => {
            const minX = clamp(Math.floor(x - R), 0, W - 1);
            const maxX = clamp(Math.floor(x + R), 0, W - 1);
            const minZ = clamp(Math.floor(z - R), 0, H - 1);
            const maxZ = clamp(Math.floor(z + R), 0, H - 1);

            let nz = z;

            for (let bz = minZ; bz <= maxZ; bz++) {
                for (let bx = minX; bx <= maxX; bx++) {
                    const top = solidTop(bx, bz);
                    if (top <= feetY + EPS) continue;

                    const closestX = clamp(x, bx, bx + 1);
                    const closestZ = clamp(nz, bz, bz + 1);

                    const dx = x - closestX;
                    const dz = nz - closestZ;
                    const dd = dx * dx + dz * dz;

                    if (dd < R * R - 1e-9) {
                        if (dz >= 0) nz = (closestZ + Math.sqrt(Math.max(0, R * R - dx * dx))) + EPS;
                        else nz = (closestZ - Math.sqrt(Math.max(0, R * R - dx * dx))) - EPS;
                    }
                }
            }
            return nz;
        };

        // --- horizontal X then Z ---
        let nx = this.pl.p.x + this.pl.v.x * dt;
        nx = clamp(nx, R, W - R);
        nx = resolveX(nx, this.pl.p.z);

        let nz = this.pl.p.z + this.pl.v.z * dt;
        nz = clamp(nz, R, H - R);
        nz = resolveZ(nx, nz);

        this.pl.p.x = nx;
        this.pl.p.z = nz;
    }

    // -----------------------------
    // Raycast + Use (unchanged decisions)
    // -----------------------------
    async hit() {
        this.camSync();
        this.ray.set(this.cam.position, this.facing());
        const hits = this.ray.intersectObjects([...this.vox.mesh.values()], false);
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

    async use() {
        const s = this.bag.hot[this.bag.sel];
        if (!s) return;

        const h = await this.hit();
        if (!h) return;

        const held = items[s.k];

        if (s.k === "hoe_wood") {
            if (h.y === Y1) {
                const ok = await this.vox.till(h.x, h.z);
                if (!ok) this.msg("Needs water within 5");
            }
            return;
        }

        if (s.k === "shovel_wood") {
            if (h.y === Y1) {
                const id = this.vox.get(h.x, h.y, h.z);
                if (id === "grass") {
                    await this.vox.set(h.x, h.y, h.z, "path");
                }
            }
            return;
        }

        if (held.t === "seed") {
            if (h.y === Y1) {
                const type = (s.k === "seed_wheat") ? "wheat" : (s.k === "seed_carrot" ? "carrot" : null);
                if (!type) return;
                const ok = await this.vox.plant(h.x, h.z, type);
                if (ok) {
                    s.c -= 1;
                    if (s.c <= 0) this.bag.hot[this.bag.sel] = null;
                }
            }
            return;
        }

        if (s.k === "bucket_empty") {
            if (h.x === INF.x && h.y === INF.y && h.z === INF.z) {
                this.bag.hot[this.bag.sel] = { k: "bucket_full", c: 1 };
                this.msg("Filled");
                return;
            }
            if (this.vox.get(h.x, h.y, h.z) === "water" && h.y === Y1) {
                await this.vox.set(h.x, h.y, h.z, null);
                this.bag.hot[this.bag.sel] = { k: "bucket_full", c: 1 };
                this.msg("Filled");
                return;
            }
            return;
        }

        if (s.k === "bucket_full") {
            if (h.py !== Y1) return;
            if (h.px === INF.x && h.py === INF.y && h.pz === INF.z) return;

            const dx = h.px + 0.5 - this.pl.p.x;
            const dz = h.pz + 0.5 - this.pl.p.z;
            if (Math.hypot(dx, dz) < 0.6) return;

            await this.vox.place(h.px, h.py, h.pz, "water");
            this.bag.hot[this.bag.sel] = { k: "bucket_empty", c: 1 };
            this.msg("Poured");
            return;
        }

        if (s.k === "dirt") {
            if (h.py !== Y1) return;
            if (h.px === INF.x && h.py === INF.y && h.pz === INF.z) return;

            const dx = h.px + 0.5 - this.pl.p.x;
            const dz = h.pz + 0.5 - this.pl.p.z;
            if (Math.hypot(dx, dz) < 0.6) return;

            await this.vox.place(h.px, h.py, h.pz, "dirt");
            s.c -= 1;
            if (s.c <= 0) this.bag.hot[this.bag.sel] = null;
            return;
        }
    }

    // -----------------------------
    // Mining (unchanged)
    // -----------------------------
    hardness(id) {
        if (id === "grass" || id === "dirt" || id === "tilled_dry" || id === "tilled_wet") return 0.85;
        if (id === "water") return 0.25;
        return 0.9;
    }

    speedFor(id) {
        const s = this.bag.hot[this.bag.sel];
        const held = s ? s.k : "";
        if (held === "shovel_wood") {
            if (id === "grass" || id === "dirt" || id === "tilled_dry" || id === "tilled_wet") return 0.35;
        }
        return this.hardness(id);
    }

    async mineTick(dt) {
        if (!this.mine.on || this.open || !this.lock) return;

        const h = await this.hit();
        if (!h) { this.mine.t = 0; this.crack.hide(); return; }

        if (h.y === Y1) {
            const ck = key(h.x, Y1, h.z);
            if (this.vox.crop.has(ck)) {
                await this.vox.breakCrop(h.x, h.z);
                this.mine.t = 0;
                this.crack.hide();
                return;
            }
        }

        const id = this.vox.get(h.x, h.y, h.z);
        if (!id) { this.mine.t = 0; this.crack.hide(); return; }
        if (!blocks[id].breakable) { this.mine.t = 0; this.crack.hide(); return; }
        if (h.x === INF.x && h.y === INF.y && h.z === INF.z) { this.mine.t = 0; this.crack.hide(); return; }

        const same = (this.mine.k === id && this.mine.p.x === h.x && this.mine.p.y === h.y && this.mine.p.z === h.z);
        if (!same) {
            this.mine.k = id;
            this.mine.p = { x: h.x, y: h.y, z: h.z };
            this.mine.t = 0;
            this.mine.need = this.speedFor(id);
        }

        this.mine.need = this.speedFor(id);
        this.mine.t += dt;

        const prog = clamp(this.mine.t / this.mine.need, 0, 1);
        const stage = Math.min(5, Math.floor(prog * 6));
        this.crack.show(h.x, h.y, h.z, stage);

        if (this.mine.t >= this.mine.need) {
            await this.vox.breakBlock(h.x, h.y, h.z);
            this.mine.t = 0;
            this.crack.hide();
        }
    }

    // -----------------------------
    // TAB overlay (unchanged)
    // -----------------------------
    tabTick(dt) {
        this.fpa += dt; this.fpf++;
        if (this.fpa >= 0.25) { this.fps = Math.round(this.fpf / this.fpa); this.fpa = 0; this.fpf = 0; }
        if (this.tab) {
            this.root.el.fps.textContent = `FPS: ${this.fps}`;
            this.root.el.pos.textContent = `XYZ: ${this.pl.p.x.toFixed(2)} ${this.pl.p.y.toFixed(2)} ${this.pl.p.z.toFixed(2)}`;
        }
    }

    // -----------------------------
    // Loop
    // -----------------------------
    async loop() {
        const t = performance.now();
        const dt = Math.min(0.033, (t - this.last) / 1000);
        this.last = t;

        if (this.lock && !this.open) {
            this.ctrl(dt);
            this.collide(dt);
        } else {
            this.pl.v.y = Math.max(this.pl.v.y - conf.grav * dt, -20);
            this.collide(dt);
        }

        this.camSync();

        await this.mineTick(dt);

        await this.vox.hydrateTick();
        await this.vox.growTick();
        await this.vox.itemTick(dt, this.pl.p, this.bag);

        // Visual-only updates
        this.vox.visualTick();
        this.sky.tick();

        this.vox.partsTick(dt, this.cam);

        this.holo.tick(this.cam);
        this.tabTick(dt);

        this.ui.draw();
        this.ren.render(this.scene, this.cam);

        requestAnimationFrame(this.loop);
    }

    // -----------------------------
    // Start
    // -----------------------------
    async start() {
        this.ui.build();
        this.installEvents();

        this.sky.init();

        await this.crack.init();
        await this.vox.init();
        await this.holo.init();

        this.pl.p.set(1.35, 2.65, 1.35);

        this.msg("Click to play");
        requestAnimationFrame(this.loop);
    }
}

// -----------------------------
// Boot
// -----------------------------
const game = new Game(root);
game.start();
