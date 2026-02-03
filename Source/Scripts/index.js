import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const W = 32;
const H = 32;
const Y0 = 0;
const Y1 = 1;

const conf = {
    reach: 6,
    grav: 24,
    jump: 8.5,
    walk: 5.2,
    sprint: 8.4,
    friction: 14,
    air: 2.0,
    sens: 0.0024,
    pick: 1.5,
    hydrad: 5,
    hydelay: 1.2,
    unhydelay: 2.5,
    regrow: 4.5,
    growTick: 2.2
};

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

const K = {};
addEventListener("keydown", (e) => { K[e.code] = true; hookKey(e, true); });
addEventListener("keyup", (e) => { K[e.code] = false; hookKey(e, false); });

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function now() { return performance.now() * 0.001; }
function dist2(a, b) { const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z; return dx * dx + dy * dy + dz * dz; }

const items = {
    hoe_wood: { k: "hoe_wood", n: "Wooden Hoe", t: "tool", stack: 1, img: "./Source/Assets/Tools/Hoes/wood.png" },
    shovel_wood: { k: "shovel_wood", n: "Wooden Shovel", t: "tool", stack: 1, img: "./Source/Assets/Tools/Shovels/wooden.png" },
    bucket_empty: { k: "bucket_empty", n: "Empty Bucket", t: "tool", stack: 1, img: "./Source/Assets/Blocks/water.png" }, // placeholder icon if you want
    seed_wheat: { k: "seed_wheat", n: "Wheat Seeds", t: "seed", stack: 256, img: "./Source/Assets/Crops/Wheat/seed.png" },
    seed_carrot: { k: "seed_carrot", n: "Carrot Seeds", t: "seed", stack: 256, img: "./Source/Assets/Crops/Carrot/seed.png" },
    wheat: { k: "wheat", n: "Wheat", t: "food", stack: 256, img: "./Source/Assets/Crops/Wheat/wheat.png" },
    carrot: { k: "carrot", n: "Carrot", t: "food", stack: 256, img: "./Source/Assets/Crops/Carrot/carrot.png" },
    dirt: { k: "dirt", n: "Dirt", t: "block", stack: 256, img: "./Source/Assets/Blocks/dirt.png" },
    water: { k: "water", n: "Water", t: "block", stack: 256, img: "./Source/Assets/Blocks/water.png" }
};

const blocks = {
    grass: { k: "grass", img: "./Source/Assets/Blocks/grass.png", breakable: true },
    dirt: { k: "dirt", img: "./Source/Assets/Blocks/dirt.png", breakable: true },
    unbreak: { k: "unbreak", img: "./Source/Assets/Blocks/unbreakable.png", breakable: false },
    tilled_dry: { k: "tilled_dry", img: "./Source/Assets/Blocks/unhydrated.png", breakable: true },
    tilled_wet: { k: "tilled_wet", img: "./Source/Assets/Blocks/hydrated.png", breakable: true },
    water: { k: "water", img: "./Source/Assets/Blocks/water.png", breakable: true }
};

const crops = {
    wheat: {
        seed: "seed_wheat",
        drop: { item: "wheat", min: 1, max: 1 },
        bonus: { item: "seed_wheat", min: 0, max: 2 },
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
        bonus: { item: "seed_carrot", min: 0, max: 1 },
        stages: [
            "./Source/Assets/Crops/Carrot/stage1.png",
            "./Source/Assets/Crops/Carrot/stage2.png",
            "./Source/Assets/Crops/Carrot/stage3.png",
            "./Source/Assets/Crops/Carrot/stage4.png",
        ]
    }
};

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
    take(slot, fromHot) {
        const arr = fromHot ? this.hot : this.inv;
        const i = slot;
        const s = arr[i];
        if (!s) return null;
        arr[i] = null;
        return s;
    }
    put(slot, fromHot, stack) {
        const arr = fromHot ? this.hot : this.inv;
        const it = items[stack.k];
        const dst = arr[slot];
        if (!dst) {
            arr[slot] = stack;
            return null;
        }
        if (dst.k === stack.k && it.stack > 1) {
            const can = Math.min(it.stack - dst.c, stack.c);
            dst.c += can; stack.c -= can;
            if (stack.c <= 0) return null;
            return stack;
        }
        arr[slot] = stack;
        return dst;
    }
    moveQuick(slot, fromHot) {
        const a = fromHot ? this.hot : this.inv;
        const b = fromHot ? this.inv : this.hot;
        const s = a[slot];
        if (!s) return;

        const it = items[s.k];

        // try stack first
        if (it.stack > 1) {
            for (let i = 0; i < b.length; i++) {
                const d = b[i];
                if (d && d.k === s.k && d.c < it.stack) {
                    const can = Math.min(it.stack - d.c, s.c);
                    d.c += can; s.c -= can;
                    if (s.c <= 0) { a[slot] = null; return; }
                }
            }
        }
        // then empty slot
        for (let i = 0; i < b.length; i++) {
            if (!b[i]) {
                b[i] = s;
                a[slot] = null;
                return;
            }
        }
    }
}

class Tex {
    constructor() {
        this.l = new THREE.TextureLoader();
        this.m = new Map();
    }
    async get(url) {
        if (this.m.has(url)) return this.m.get(url);
        const t = await new Promise((res, rej) => {
            this.l.load(url, res, undefined, rej);
        });
        t.magFilter = THREE.NearestFilter;
        t.minFilter = THREE.NearestFilter;
        t.generateMipmaps = false;
        this.m.set(url, t);
        return t;
    }
}

class Vox {
    constructor(scene, tex) {
        this.s = scene;
        this.t = tex;

        this.g = new THREE.BoxGeometry(1, 1, 1);
        this.mats = new Map();
        this.mesh = new Map(); // key -> mesh
        this.map = new Map();  // key -> block id

        this.water = new Set(); // keys of water sources
        this.tilled = new Map(); // key -> {wet:boolean, ts:number}
        this.crop = new Map(); // key -> {type, st, ts}

        this.items = []; // drops
        this.parts = []; // particles
    }
    key(x, y, z) { return `${x}|${y}|${z}`; }
    parse(k) { const [x, y, z] = k.split("|").map(Number); return { x, y, z }; }

    async mat(url) {
        if (this.mats.has(url)) return this.mats.get(url);
        const tx = await this.t.get(url);
        const m = new THREE.MeshLambertMaterial({ map: tx, transparent: true });
        this.mats.set(url, m);
        return m;
    }

    async set(x, y, z, id) {
        const k = this.key(x, y, z);
        const prev = this.map.get(k);
        if (prev === id) return;

        // remove mesh
        if (this.mesh.has(k)) {
            this.s.remove(this.mesh.get(k));
            this.mesh.delete(k);
        }
        this.map.set(k, id);

        // bookkeeping
        if (prev === "water") this.water.delete(k);
        if (id === "water") this.water.add(k);

        if (!id) return;

        let b = blocks[id];
        let m = await this.mat(b.img);
        const mesh = new THREE.Mesh(this.g, m);
        mesh.position.set(x + 0.5, y + 0.5, z + 0.5);

        // make water a bit shorter
        if (id === "water") {
            mesh.scale.y = 0.85;
            mesh.position.y -= 0.075;
        }

        this.s.add(mesh);
        this.mesh.set(k, mesh);
    }

    get(x, y, z) {
        return this.map.get(this.key(x, y, z));
    }

    inPad(x, z) {
        return x >= 0 && z >= 0 && x < W && z < H;
    }

    async init() {
        // y=0 unbreakable dirt
        for (let x = 0; x < W; x++) {
            for (let z = 0; z < H; z++) {
                await this.set(x, Y0, z, "unbreak");
                await this.set(x, Y1, z, "grass");
            }
        }
        // corner infinite water at (0,1,0)
        await this.set(0, Y1, 0, "water");
    }

    nearWater(x, z) {
        for (let dx = -conf.hydrad; dx <= conf.hydrad; dx++) {
            for (let dz = -conf.hydrad; dz <= conf.hydrad; dz++) {
                const nx = x + dx, nz = z + dz;
                if (!this.inPad(nx, nz)) continue;
                const id = this.get(nx, Y1, nz);
                if (id === "water") {
                    const d = Math.sqrt(dx * dx + dz * dz);
                    if (d <= conf.hydrad) return true;
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
        this.tilled.set(this.key(x, Y1, z), { wet: false, ts: now() });
        return true;
    }

    async hydrateTick() {
        const t = now();
        for (const [k, v] of this.tilled) {
            const p = this.parse(k);
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
                    // pop crop if any
                    const ck = this.key(p.x, p.y, p.z);
                    if (this.crop.has(ck)) {
                        const c = this.crop.get(ck);
                        await this.dropCrop(p.x, p.y + 1, p.z, c.type, true);
                        this.crop.delete(ck);
                        // land to dirt then regrow grass
                        await this.set(p.x, p.y, p.z, "dirt");
                        this.tilled.delete(ck);
                        this.regrowLater(p.x, p.y, p.z);
                    }
                }
            }
        }
    }

    async plant(x, z, type) {
        const id = this.get(x, Y1, z);
        if (id !== "tilled_dry" && id !== "tilled_wet") return false;
        const k = this.key(x, Y1, z);
        if (this.crop.has(k)) return false;
        this.crop.set(k, { type, st: 0, ts: now() });
        await this.cropMesh(x, Y1, z, type, 0);
        return true;
    }

    async cropMesh(x, y, z, type, st) {
        const k = this.key(x, y, z) + "|crop";
        if (this.mesh.has(k)) {
            this.s.remove(this.mesh.get(k));
            this.mesh.delete(k);
        }
        const list = crops[type].stages;
        const url = list[clamp(st, 0, list.length - 1)];
        const tx = await this.t.get(url);
        const m = new THREE.MeshLambertMaterial({ map: tx, transparent: true });
        const g = new THREE.PlaneGeometry(1, 1);
        const a = new THREE.Mesh(g, m);
        a.position.set(x + 0.5, y + 1.0, z + 0.5);
        a.rotation.y = Math.PI * 0.25;
        a.scale.set(0.95, 0.95, 0.95);
        this.s.add(a);
        this.mesh.set(k, a);

        const b = new THREE.Mesh(g, m);
        b.position.copy(a.position);
        b.rotation.y = -Math.PI * 0.25;
        b.scale.copy(a.scale);
        this.s.add(b);
        this.mesh.set(k + "b", b);
    }

    async growTick() {
        const t = now();
        for (const [k, c] of this.crop) {
            if ((t - c.ts) < conf.growTick) continue;
            const p = this.parse(k);
            const soil = this.get(p.x, p.y, p.z);
            const wet = (soil === "tilled_wet");
            // simple: if dry, slower
            c.ts = t;
            if (!wet && Math.random() < 0.6) continue;

            const max = crops[c.type].stages.length - 1;
            if (c.st < max) {
                c.st++;
                await this.cropMesh(p.x, p.y, p.z, c.type, c.st);
            }
        }
    }

    async breakBlock(x, y, z) {
        const id = this.get(x, y, z);
        if (!id) return null;
        const b = blocks[id];
        if (!b.breakable) return null;

        // if crop on soil, breaking soil pops crop too
        if (y === Y1) {
            const ck = this.key(x, y, z);
            if (this.crop.has(ck)) {
                const c = this.crop.get(ck);
                await this.dropCrop(x, y + 1, z, c.type, false);
                this.crop.delete(ck);
                this.killCropMesh(ck);
            }
            // breaking tilled -> dirt item
            if (id === "tilled_dry" || id === "tilled_wet") {
                this.tilled.delete(ck);
                await this.set(x, y, z, "dirt");
                this.spawnItem("dirt", new THREE.Vector3(x + 0.5, y + 1.05, z + 0.5), 1);
                this.partsBurst(x, y, z, id);
                this.regrowLater(x, y, z);
                return "dirt";
            }
        }

        // water -> bucket not implemented; allow replacing by dirt via place
        if (id === "water") {
            await this.set(x, y, z, "grass");
            this.partsBurst(x, y, z, id);
            return "water";
        }

        // grass/dirt normal
        await this.set(x, y, z, "dirt");
        this.spawnItem("dirt", new THREE.Vector3(x + 0.5, y + 1.05, z + 0.5), 1);
        this.partsBurst(x, y, z, id);
        this.regrowLater(x, y, z);
        return "dirt";
    }

    killCropMesh(ck) {
        const a = ck + "|crop";
        if (this.mesh.has(a)) { this.s.remove(this.mesh.get(a)); this.mesh.delete(a); }
        if (this.mesh.has(a + "b")) { this.s.remove(this.mesh.get(a + "b")); this.mesh.delete(a + "b"); }
    }

    async dropCrop(x, y, z, type, popped) {
        const c = crops[type];
        const max = c.stages.length - 1;

        // if popped early: just seed back
        if (popped) {
            this.spawnItem(c.seed, new THREE.Vector3(x + 0.5, y + 0.2, z + 0.5), 1);
            return;
        }

        // matured check by mesh stage stored in map key
        const ck = this.key(x, Y1, z);
        const cur = this.crop.get(ck);
        const st = cur ? cur.st : max;

        if (st >= max) {
            const d = rnd(c.drop.min, c.drop.max);
            const b = rnd(c.bonus.min, c.bonus.max);
            this.spawnItem(c.drop.item, new THREE.Vector3(x + 0.5, y + 0.2, z + 0.5), d);
            if (b > 0) this.spawnItem(c.bonus.item, new THREE.Vector3(x + 0.5, y + 0.2, z + 0.5), b);
        } else {
            // not mature: drop seed only
            this.spawnItem(c.seed, new THREE.Vector3(x + 0.5, y + 0.2, z + 0.5), 1);
        }
        this.partsBurst(x, Y1, z, type);
    }

    regrowLater(x, y, z) {
        const k = this.key(x, y, z);
        setTimeout(async () => {
            // only regrow if still dirt
            if (this.get(x, y, z) === "dirt") {
                await this.set(x, y, z, "grass");
            }
        }, conf.regrow * 1000);
    }

    async place(x, y, z, id) {
        if (!this.inPad(x, z)) return false;
        if (y !== Y1) return false;

        // can't place into unbreakable layer
        if (this.get(x, Y0, z) === "unbreak" && y === Y0) return false;

        // allow replacing grass/dirt/tilled/water
        await this.set(x, y, z, id);

        // if water removed by placing dirt/grass, hydration will decay and pop crops
        return true;
    }

    spawnItem(k, p, c) {
        // merge nearby same items if possible
        for (const d of this.items) {
            if (d.k === k && dist2(d.p, p) < 0.6 * 0.6 && items[k].stack > 1) {
                d.c = Math.min(items[k].stack, d.c + c);
                return;
            }
        }
        this.items.push({ k, c, p: p.clone(), v: new THREE.Vector3((Math.random() - 0.5) * 1.2, 2.2, (Math.random() - 0.5) * 1.2), m: null });
    }

    async itemMesh(d) {
        if (d.m) return;
        const tx = await this.t.get(items[d.k].img);
        const m = new THREE.SpriteMaterial({ map: tx, transparent: true });
        const s = new THREE.Sprite(m);
        s.scale.set(0.6, 0.6, 0.6);
        s.position.copy(d.p);
        this.s.add(s);
        d.m = s;
    }

    async itemTick(dt, pl, bag) {
        for (let i = this.items.length - 1; i >= 0; i--) {
            const d = this.items[i];
            await this.itemMesh(d);

            d.v.y -= 18 * dt;
            d.p.addScaledVector(d.v, dt);

            // floor (y=1 top)
            const fy = Y1 + 1.02;
            if (d.p.y < fy) {
                d.p.y = fy;
                d.v.y *= -0.18;
                d.v.x *= 0.78;
                d.v.z *= 0.78;
            }

            // bob
            const bob = Math.sin(now() * 4 + i) * 0.03;
            d.m.position.set(d.p.x, d.p.y + bob, d.p.z);

            // pick
            if (dist2(pl, d.p) < conf.pick * conf.pick) {
                let left = bag.add(d.k, d.c);
                if (left <= 0) {
                    this.s.remove(d.m);
                    this.items.splice(i, 1);
                } else {
                    d.c = left;
                }
            }
        }
    }

    partsBurst(x, y, z, id) {
        const n = 14;
        for (let i = 0; i < n; i++) {
            const p = new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5);
            const v = new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 4.2, (Math.random() - 0.5) * 4);
            const life = 0.45 + Math.random() * 0.35;
            this.parts.push({ p, v, life, t: 0, m: null });
        }
    }

    partsTick(dt) {
        for (let i = this.parts.length - 1; i >= 0; i--) {
            const d = this.parts[i];
            if (!d.m) {
                const g = new THREE.PlaneGeometry(0.12, 0.12);
                const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
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
        }
    }
}

function rnd(a, b) {
    return Math.floor(a + Math.random() * (b - a + 1));
}

const ren = new THREE.WebGLRenderer({ canvas: root.el.c, antialias: false });
ren.setPixelRatio(Math.min(devicePixelRatio, 2));
ren.setSize(innerWidth, innerHeight, false);
ren.setClearColor(0x69b7ff, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x69b7ff, 18, 55);

const cam = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.01, 200);
cam.position.set(1.2, 2.7, 1.2);

const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(2, 8, 3);
scene.add(sun);
scene.add(new THREE.AmbientLight(0xffffff, 0.55));

addEventListener("resize", () => {
    cam.aspect = innerWidth / innerHeight;
    cam.updateProjectionMatrix();
    ren.setSize(innerWidth, innerHeight, false);
});

const tex = new Tex();
const vox = new Vox(scene, tex);

const ray = new THREE.Raycaster();
ray.far = conf.reach;

const pl = {
    p: new THREE.Vector3(1.35, 2.65, 1.35),
    v: new THREE.Vector3(),
    yaw: 0,
    pit: 0,
    on: false
};

const bag = new Bag();

// starter loadout (spawn with items)
bag.hot[0] = { k: "hoe_wood", c: 1 };
bag.hot[1] = { k: "shovel_wood", c: 1 };
bag.hot[2] = { k: "bucket_empty", c: 1 };
bag.hot[3] = { k: "seed_wheat", c: 3 };
bag.hot[4] = { k: "seed_carrot", c: 3 };

let lock = false;
let open = false;
let tab = false;
let brk = false;
let last = performance.now();
let acc = 0, frames = 0, fps = 0;

const holo = { m: null };

function msg(t) {
    root.el.msg.textContent = t;
    root.el.msg.classList.remove("hide");
    clearTimeout(msg._t);
    msg._t = setTimeout(() => root.el.msg.classList.add("hide"), 1200);
}

function uiBuild() {
    root.el.bar.innerHTML = "";
    for (let i = 0; i < 9; i++) {
        const s = document.createElement("div");
        s.className = "slot";
        root.el.bar.appendChild(s);
    }
    root.el.grid.innerHTML = "";
    const make = (i, hot) => {
        const s = document.createElement("div");
        s.className = "slot";
        s.dataset.i = String(i);
        s.dataset.h = hot ? "1" : "0";
        s.addEventListener("click", (e) => slotClick(e));
        return s;
    };
    for (let i = 0; i < 36; i++) root.el.grid.appendChild(make(i, false));
    // hotbar row at bottom of inventory
    for (let i = 0; i < 9; i++) {
        const a = make(i, true);
        a.style.marginTop = "10px";
        root.el.grid.appendChild(a);
    }
}

function uiDraw() {
    // hotbar
    const slots = [...root.el.bar.children];
    for (let i = 0; i < 9; i++) {
        paint(slots[i], bag.hot[i]);
    }
    root.el.sel.style.transform = `translateX(${(44 + 6) * bag.sel}px)`;

    if (open) {
        const slots2 = [...root.el.grid.children];
        for (let i = 0; i < 36; i++) paint(slots2[i], bag.inv[i]);
        for (let i = 0; i < 9; i++) paint(slots2[36 + i], bag.hot[i]);

        if (bag.carry) {
            root.el.carry.classList.remove("hide");
            root.el.carry.innerHTML = "";
            const a = document.createElement("div");
            a.className = "slot";
            const b = document.createElement("div");
            b.className = "icon";
            b.style.backgroundImage = `url("${items[bag.carry.k].img}")`;
            a.appendChild(b);
            if (items[bag.carry.k].stack > 1 && bag.carry.c > 1) {
                const n = document.createElement("div");
                n.className = "num";
                n.textContent = String(bag.carry.c);
                a.appendChild(n);
            }
            root.el.carry.appendChild(a);
        } else {
            root.el.carry.classList.add("hide");
        }
    }
}

function paint(el, st) {
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

function slotClick(e) {
    const el = e.currentTarget;
    const i = Number(el.dataset.i);
    const hot = el.dataset.h === "1";
    const shift = e.shiftKey;

    if (shift) {
        bag.moveQuick(i, hot);
        return;
    }

    const src = hot ? bag.hot : bag.inv;
    const cur = src[i];

    if (!bag.carry) {
        if (cur) {
            src[i] = null;
            bag.carry = cur;
        }
        return;
    }

    // place carry
    const left = bag.put(i, hot, bag.carry);
    bag.carry = left;
}

addEventListener("mousemove", (e) => {
    if (!lock || open) return;
    pl.yaw -= e.movementX * conf.sens;
    pl.pit -= e.movementY * conf.sens;
    pl.pit = clamp(pl.pit, -1.45, 1.45);
});

addEventListener("mousedown", async (e) => {
    if (open) return;
    if (!lock) {
        root.el.c.requestPointerLock();
        return;
    }
    if (e.button === 0) brk = true;
    if (e.button === 2) await use();
});

addEventListener("mouseup", (e) => {
    if (e.button === 0) brk = false;
});

addEventListener("contextmenu", (e) => e.preventDefault());

document.addEventListener("pointerlockchange", () => {
    lock = (document.pointerLockElement === root.el.c);
});

addEventListener("mousemove", (e) => {
    if (!open) return;
    root.el.carry.style.left = e.clientX + "px";
    root.el.carry.style.top = e.clientY + "px";
});

function hookKey(e, down) {
    if (e.code === "KeyE" && down) {
        open = !open;
        root.el.inv.classList.toggle("hide", !open);
        if (open) brk = false;
    }
    if (e.code === "Tab") {
        e.preventDefault();
        tab = down;
        root.el.tab.classList.toggle("hide", !tab);
    }
    // hotbar 1-9
    if (down) {
        const n = "Digit123456789".indexOf(e.code.replace("Digit", "Digit"));
        if (e.code.startsWith("Digit")) {
            const k = Number(e.code.slice(5)) - 1;
            if (k >= 0 && k < 9) bag.sel = k;
        }
    }
}

function facing() {
    const f = new THREE.Vector3(
        Math.sin(pl.yaw) * Math.cos(pl.pit),
        Math.sin(pl.pit),
        Math.cos(pl.yaw) * Math.cos(pl.pit)
    );
    return f.normalize();
}

function camSync() {
    cam.position.copy(pl.p);
    cam.rotation.order = "YXZ";
    cam.rotation.y = pl.yaw;
    cam.rotation.x = pl.pit;
}

function ctrl(dt) {
    const f = facing();
    const r = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize();

    let ax = 0, az = 0;
    if (K["KeyW"]) { ax += f.x; az += f.z; }
    if (K["KeyS"]) { ax -= f.x; az -= f.z; }
    if (K["KeyA"]) { ax -= r.x; az -= r.z; }
    if (K["KeyD"]) { ax += r.x; az += r.z; }

    const len = Math.hypot(ax, az);
    if (len > 0) { ax /= len; az /= len; }

    const sp = (K["ControlLeft"] || K["ControlRight"]) ? conf.sprint : conf.walk;

    const on = pl.on;
    const fr = on ? conf.friction : conf.air;

    pl.v.x = damp(pl.v.x, ax * sp, fr, dt);
    pl.v.z = damp(pl.v.z, az * sp, fr, dt);

    if (on && (K["Space"])) {
        pl.v.y = conf.jump;
        pl.on = false;
    }

    pl.v.y -= conf.grav * dt;
}

function damp(v, t, k, dt) {
    const a = 1 - Math.exp(-k * dt);
    return v + (t - v) * a;
}

function collide(dt) {
    // integrate
    pl.p.x += pl.v.x * dt;
    pl.p.y += pl.v.y * dt;
    pl.p.z += pl.v.z * dt;

    // platform boundary barrier (player radius-ish)
    const padMin = 0.2;
    const padMaxX = W - 0.2;
    const padMaxZ = H - 0.2;
    pl.p.x = clamp(pl.p.x, padMin, padMaxX);
    pl.p.z = clamp(pl.p.z, padMin, padMaxZ);

    // floor collision with y=1 blocks (top at y=2)
    const bx = Math.floor(pl.p.x);
    const bz = Math.floor(pl.p.z);
    const under = vox.get(bx, Y1, bz);

    let top = Y1 + 1; // block top surface is y=2
    // water is shorter
    if (under === "water") top = (Y1 + 1) - 0.15;

    const feet = pl.p.y - 1.62; // approximate eye height 1.62
    if (feet < top) {
        pl.p.y += (top - feet);
        if (pl.v.y < 0) pl.v.y = 0;
        pl.on = true;
    } else {
        pl.on = false;
    }

    // keep head out of blocks (simple)
    const head = pl.p.y + 0.2;
    const above = vox.get(bx, Y1 + 1, bz);
    if (above && head > Y1 + 2) {
        pl.p.y = Y1 + 1.8;
        pl.v.y = Math.min(pl.v.y, 0);
    }

    // don't sink below world
    pl.p.y = Math.max(pl.p.y, 1.4);
}

async function lookHit() {
    camSync();
    ray.set(cam.position, facing());
    const hits = ray.intersectObjects([...vox.mesh.values()], false);

    // ignore crop planes and crop "b"
    const usable = hits.find(h => {
        const m = h.object;
        // we only want block cubes (BoxGeometry)
        return m.geometry && m.geometry.type === "BoxGeometry";
    });
    if (!usable) return null;

    const p = usable.point.clone().addScaledVector(usable.face.normal, -0.01);
    const x = Math.floor(p.x);
    const y = Math.floor(p.y);
    const z = Math.floor(p.z);

    const n = usable.face.normal;
    const place = new THREE.Vector3(x, y, z).add(n);
    return { x, y, z, nx: n.x, ny: n.y, nz: n.z, px: Math.floor(place.x), py: Math.floor(place.y), pz: Math.floor(place.z) };
}

async function use() {
    const s = bag.hot[bag.sel];
    if (!s) return;

    const hit = await lookHit();
    if (!hit) return;

    const { x, y, z, px, py, pz } = hit;
    const held = items[s.k];

    // hoe till
    if (s.k === "hoe_wood") {
        if (y === Y1) {
            const ok = await vox.till(x, z);
            if (!ok) msg("Needs water within 5");
        }
        return;
    }

    // seeds plant
    if (held.t === "seed") {
        if (y === Y1) {
            const type = (s.k === "seed_wheat") ? "wheat" : (s.k === "seed_carrot" ? "carrot" : null);
            if (!type) return;
            const ok = await vox.plant(x, z, type);
            if (ok) {
                s.c -= 1;
                if (s.c <= 0) bag.hot[bag.sel] = null;
            }
        }
        return;
    }

    // place dirt / water blocks (water only at y=1)
    if (s.k === "dirt" || s.k === "water") {
        // placing uses the adjacent cell (like Minecraft)
        if (py !== Y1) return;
        if (!vox.inPad(px, pz)) return;

        // don't place inside player (simple check)
        const dx = px + 0.5 - pl.p.x;
        const dz = pz + 0.5 - pl.p.z;
        if (Math.hypot(dx, dz) < 0.6) return;

        await vox.place(px, py, pz, s.k === "water" ? "water" : "dirt");
        s.c -= 1;
        if (s.c <= 0) bag.hot[bag.sel] = null;
        return;
    }
}

async function breakTick() {
    if (!brk) return;
    const hit = await lookHit();
    if (!hit) return;

    // break block at hit x,y,z
    await vox.breakBlock(hit.x, hit.y, hit.z);
    brk = false; // single-tap feel (you can change to hold-to-mine)
}

async function holoInit() {
    // simple sprite hologram with canvas (transparent rounded pixel-ish box)
    const cvs = document.createElement("canvas");
    cvs.width = 256; cvs.height = 64;
    const g = cvs.getContext("2d");

    function draw() {
        g.clearRect(0, 0, cvs.width, cvs.height);
        // box
        g.fillStyle = "rgba(0,0,0,0.55)";
        round(g, 8, 8, 240, 48, 10);
        g.fill();
        g.strokeStyle = "rgba(255,255,255,0.18)";
        g.lineWidth = 2;
        round(g, 8, 8, 240, 48, 10);
        g.stroke();

        g.fillStyle = "rgba(255,255,255,0.95)";
        g.font = "32px 'Jersey 10'";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("Infinite Water", 128, 32);
    }
    draw();

    const tx = new THREE.CanvasTexture(cvs);
    tx.magFilter = THREE.NearestFilter;
    tx.minFilter = THREE.NearestFilter;

    const mat = new THREE.SpriteMaterial({ map: tx, transparent: true });
    const spr = new THREE.Sprite(mat);
    spr.position.set(0.5, Y1 + 2.2, 0.5);
    spr.scale.set(3.2, 0.8, 1);
    scene.add(spr);
    holo.m = spr;
}

function round(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
}

function holoTick() {
    if (!holo.m) return;
    // keep readable size regardless of distance
    const d = cam.position.distanceTo(holo.m.position);
    const s = clamp(d * 0.18, 1.7, 4.2);
    holo.m.scale.set(3.2 * s * 0.35, 0.8 * s * 0.35, 1);
}

function tabTick() {
    if (!tab) return;
    root.el.fps.textContent = `FPS: ${fps}`;
    root.el.pos.textContent = `XYZ: ${pl.p.x.toFixed(2)} ${pl.p.y.toFixed(2)} ${pl.p.z.toFixed(2)}`;
}

async function loop() {
    const t = performance.now();
    const dt = Math.min(0.033, (t - last) / 1000);
    last = t;

    // fps
    acc += dt; frames++;
    if (acc >= 0.25) {
        fps = Math.round(frames / acc);
        acc = 0; frames = 0;
    }

    if (lock && !open) {
        ctrl(dt);
        collide(dt);
    } else {
        // mild gravity settle
        pl.v.y = Math.max(pl.v.y - conf.grav * dt, -20);
        collide(dt);
    }

    camSync();

    await breakTick();

    // world ticks
    await vox.hydrateTick();
    await vox.growTick();
    await vox.itemTick(dt, pl.p, bag);
    vox.partsTick(dt);

    holoTick();
    tabTick();

    uiDraw();

    ren.render(scene, cam);
    requestAnimationFrame(loop);
}

async function start() {
    uiBuild();

    await vox.init();
    await holoInit();

    // spawn next to infinite water (corner)
    pl.p.set(1.35, 2.65, 1.35);

    // prevent right-click menu focusing issues
    msg("Click to play");
    requestAnimationFrame(loop);
}

start();
