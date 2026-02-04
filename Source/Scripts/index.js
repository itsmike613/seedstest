import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

/* =============================================================================
   CONFIG + HELPERS
============================================================================= */
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
    grow: 2.2,
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

const K = Object.create(null);

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function now() { return performance.now() * 0.001; }
function d2(a, b) { const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z; return dx * dx + dy * dy + dz * dz; }
function key(x, y, z) { return `${x}|${y}|${z}`; }
function parse(k) { const [x, y, z] = k.split("|").map(Number); return { x, y, z }; }
function rnd(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }

/* =============================================================================
   CONTENT DATA
============================================================================= */
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
    water: { k: "water", n: "Water", t: "block", stack: 256, img: "./Source/Assets/Blocks/water.png" },
};

const blocks = {
    grass: { k: "grass", img: "./Source/Assets/Blocks/grass.png", breakable: true },
    dirt: { k: "dirt", img: "./Source/Assets/Blocks/dirt.png", breakable: true },
    unbreak: { k: "unbreak", img: "./Source/Assets/Blocks/unbreakable.png", breakable: false },
    tilled_dry: { k: "tilled_dry", img: "./Source/Assets/Blocks/unhydrated.png", breakable: true },
    tilled_wet: { k: "tilled_wet", img: "./Source/Assets/Blocks/hydrated.png", breakable: true },
    water: { k: "water", img: "./Source/Assets/Blocks/water.png", breakable: true },
    path: { k: "path", img: "./Source/Assets/Blocks/path.png", breakable: true },
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
        ],
    },
    carrot: {
        seed: "seed_carrot",
        drop: { item: "carrot", min: 1, max: 2 },
        bonus: { item: "seed_carrot", min: 1, max: 1 },
        stages: [
            "./Source/Assets/Crops/Carrot/stage1.png",
            "./Source/Assets/Crops/Carrot/stage2.png",
            "./Source/Assets/Crops/Carrot/stage3.png",
            "./Source/Assets/Crops/Carrot/stage4.png",
        ],
    },
};

/* =============================================================================
   INVENTORY
============================================================================= */
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

/* =============================================================================
   TEXTURE CACHE
============================================================================= */
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
            tx.magFilter = THREE.NearestFilter;
            tx.minFilter = THREE.NearestFilter;
            tx.generateMipmaps = false;
            this.m.set(url, tx);
            return tx;
        }

        t.magFilter = THREE.NearestFilter;
        t.minFilter = THREE.NearestFilter;
        t.generateMipmaps = false;
        this.m.set(url, t);
        return t;
    }
}

/* =============================================================================
   WORLD (VOXELS + FARMING + DROPS + PARTICLES)
============================================================================= */
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

        this.items = [];
        this.parts = [];
    }

    inPad(x, z) { return x >= 0 && z >= 0 && x < W && z < H; }

    topAt(x, z) {
        const t = this.get(x, Y1, z);
        if (!t) return Y0 + 1;
        if (t === "water") return Y1 + 0.85;
        if (t === "path") return Y1 + 0.90;
        return Y1 + 1;
    }

    async mat(url) {
        if (this.mats.has(url)) return this.mats.get(url);
        const tx = await this.t.get(url);
        const m = new THREE.MeshLambertMaterial({ map: tx, transparent: true });
        this.mats.set(url, m);
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
        const m = await this.mat(b.img);
        const mesh = new THREE.Mesh(this.g, m);
        mesh.position.set(x + 0.5, y + 0.5, z + 0.5);

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
        for (let i = 0; i < 4; i++) {
            const kk = base + i;
            if (this.mesh.has(kk)) { this.s.remove(this.mesh.get(kk)); this.mesh.delete(kk); }
        }

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

        for (let i = 0; i < 4; i++) {
            const mesh = new THREE.Mesh(g, m);
            mesh.position.copy(p);
            mesh.rotation.y = rots[i];
            mesh.scale.set(0.95, 0.95, 0.95);
            this.s.add(mesh);
            this.mesh.set(base + i, mesh);
        }
    }

    killCrop(x, z) {
        const k = key(x, Y1, z);
        this.crop.delete(k);
        const base = k + "|crop";
        for (let i = 0; i < 4; i++) {
            const kk = base + i;
            if (this.mesh.has(kk)) { this.s.remove(this.mesh.get(kk)); this.mesh.delete(kk); }
        }
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
            this.spawnItem(c.drop.item, new THREE.Vector3(x + 0.5, y + 1.35, z + 0.5), rnd(c.drop.min, c.drop.max));
            const b = rnd(c.bonus.min, c.bonus.max);
            if (b > 0) this.spawnItem(c.bonus.item, new THREE.Vector3(x + 0.5, y + 1.35, z + 0.5), b);
        } else {
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
        const mat = new THREE.SpriteMaterial({ map: tx, transparent: true, depthWrite: false });
        const s = new THREE.Sprite(mat);
        s.scale.set(0.6, 0.6, 0.6);
        s.position.copy(d.p);
        this.s.add(s);
        d.m = s;
    }

    async itemTick(dt, plPos, bag) {
        // small perf/cleanliness: avoid new Vector3 each item each frame
        const pp = Vox._tmpPP || (Vox._tmpPP = new THREE.Vector3());

        for (let i = this.items.length - 1; i >= 0; i--) {
            const d = this.items[i];
            await this.itemMesh(d);

            d.v.y -= 18 * dt;
            d.p.addScaledVector(d.v, dt);

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

            pp.set(plPos.x, plPos.y - 1.2, plPos.z);
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
        }
    }
}

/* =============================================================================
   GAME STATE (SINGLE OBJECT)
============================================================================= */
const G = {
    lock: false,
    open: false,
    tab: false,

    // three
    ren: null,
    scene: null,
    cam: null,

    // world
    tex: null,
    vox: null,

    // player
    pl: {
        p: new THREE.Vector3(1.35, 2.65, 1.35),
        v: new THREE.Vector3(),
        yaw: 0,
        pit: 0,
        on: false
    },

    bag: new Bag(),

    // mining/crack
    mine: { on: false, k: "", p: { x: 0, y: 0, z: 0 }, t: 0, need: 0.8 },
    crack: { m: [], tx: [] },

    // raycast
    ray: new THREE.Raycaster(),

    // holo
    holo: { m: null },

    // fps
    fpa: 0, fpf: 0, fps: 0,
};

// initial hotbar
G.bag.hot[0] = { k: "hoe_wood", c: 1 };
G.bag.hot[1] = { k: "shovel_wood", c: 1 };
G.bag.hot[2] = { k: "bucket_empty", c: 1 };
G.bag.hot[3] = { k: "seed_wheat", c: 3 };
G.bag.hot[4] = { k: "seed_carrot", c: 3 };

/* =============================================================================
   UI HELPERS
============================================================================= */
function msg(t) {
    root.el.msg.textContent = t;
    root.el.msg.classList.remove("hide");
    clearTimeout(msg._t);
    msg._t = setTimeout(() => root.el.msg.classList.add("hide"), 1100);
}

function prevent(e) {
    if (G.lock || G.open) {
        if (e.code === "Space" || e.code === "Tab" || e.ctrlKey || e.metaKey || e.altKey) e.preventDefault();
    }
}

/* =============================================================================
   UI INVENTORY (UNCHANGED BEHAVIOR)
============================================================================= */
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
        s.addEventListener("mousedown", (e) => slotDown(e));
        s.addEventListener("contextmenu", (e) => e.preventDefault());
        return s;
    };

    for (let i = 0; i < 36; i++) root.el.grid.appendChild(make(i, false));
    for (let i = 0; i < 9; i++) {
        const a = make(i, true);
        a.style.marginTop = "10px";
        root.el.grid.appendChild(a);
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

function uiDraw() {
    const bag = G.bag;

    const hs = [...root.el.bar.children];
    for (let i = 0; i < 9; i++) paint(hs[i], bag.hot[i]);
    root.el.sel.style.transform = `translateX(${(44 + 6) * bag.sel}px)`;

    if (G.open) {
        const gs = [...root.el.grid.children];
        for (let i = 0; i < 36; i++) paint(gs[i], bag.inv[i]);
        for (let i = 0; i < 9; i++) paint(gs[36 + i], bag.hot[i]);

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

function slotDown(e) {
    e.preventDefault();
    const bag = G.bag;

    const el = e.currentTarget;
    const i = Number(el.dataset.i);
    const hot = el.dataset.h === "1";
    const shift = e.shiftKey;

    if (shift) { bag.moveQuick(i, hot); return; }

    const arr = hot ? bag.hot : bag.inv;
    const cur = arr[i];

    if (e.button === 2) {
        if (!bag.carry && cur && items[cur.k].stack > 1 && cur.c > 1) {
            const half = Math.ceil(cur.c / 2);
            bag.carry = { k: cur.k, c: half };
            cur.c -= half;
            if (cur.c <= 0) arr[i] = null;
            return;
        }
        if (bag.carry) {
            const it = items[bag.carry.k];
            if (!cur) {
                arr[i] = { k: bag.carry.k, c: 1 };
                bag.carry.c -= 1;
                if (bag.carry.c <= 0) bag.carry = null;
                return;
            }
            if (cur.k === bag.carry.k && it.stack > 1 && cur.c < it.stack) {
                cur.c += 1;
                bag.carry.c -= 1;
                if (bag.carry.c <= 0) bag.carry = null;
                return;
            }
        }
        return;
    }

    if (!bag.carry) {
        if (cur) { arr[i] = null; bag.carry = cur; }
        return;
    }

    const left = bag.put(i, hot, bag.carry);
    bag.carry = left;
}

function setOpen(v) {
    G.open = v;
    root.el.inv.classList.toggle("hide", !G.open);
    if (G.open) {
        if (document.pointerLockElement) document.exitPointerLock();
    } else {
        root.el.c.requestPointerLock();
    }
}

/* =============================================================================
   CAMERA + MOVEMENT (SAME BEHAVIOR)
============================================================================= */
function facing() {
    const pl = G.pl;
    const cx = -Math.sin(pl.yaw) * Math.cos(pl.pit);
    const cy = Math.sin(pl.pit);
    const cz = -Math.cos(pl.yaw) * Math.cos(pl.pit);
    return G._tmpFacing || (G._tmpFacing = new THREE.Vector3()).set(cx, cy, cz).normalize();
}

function camSync() {
    const pl = G.pl;
    G.cam.position.copy(pl.p);
    G.cam.rotation.order = "YXZ";
    G.cam.rotation.y = pl.yaw;
    G.cam.rotation.x = pl.pit;
}

function damp(v, t, k, dt) {
    const a = 1 - Math.exp(-k * dt);
    return v + (t - v) * a;
}

function ctrl(dt) {
    const pl = G.pl;
    const f = facing();

    // reuse temp vectors (no behavior change)
    const up = G._tmpUp || (G._tmpUp = new THREE.Vector3(0, 1, 0));
    const r = G._tmpRight || (G._tmpRight = new THREE.Vector3()).crossVectors(f, up).normalize();

    let ax = 0, az = 0;
    if (K["KeyW"]) { ax += f.x; az += f.z; }
    if (K["KeyS"]) { ax -= f.x; az -= f.z; }
    if (K["KeyA"]) { ax -= r.x; az -= r.z; }
    if (K["KeyD"]) { ax += r.x; az += r.z; }

    const len = Math.hypot(ax, az);
    if (len > 0) { ax /= len; az /= len; }

    const sp = (K["ControlLeft"] || K["ControlRight"]) ? conf.sprint : conf.walk;
    const fr = pl.on ? conf.fr : conf.air;

    pl.v.x = damp(pl.v.x, ax * sp, fr, dt);
    pl.v.z = damp(pl.v.z, az * sp, fr, dt);

    if (pl.on && K["Space"]) {
        pl.v.y = conf.jump;
        pl.on = false;
    }

    pl.v.y -= conf.grav * dt;
}

function collide(dt) {
    const pl = G.pl;
    const vox = G.vox;

    const R = 0.25;
    const HEIGHT = 1.62;
    const EPS = 0.001;

    const solidTop = (bx, bz) => {
        if (bx < 0 || bz < 0 || bx >= W || bz >= H) return -Infinity;
        return vox.topAt(bx, bz);
    };

    // --- vertical
    pl.p.y += pl.v.y * dt;

    const cx = clamp(Math.floor(pl.p.x), 0, W - 1);
    const cz = clamp(Math.floor(pl.p.z), 0, H - 1);
    const floorTop = solidTop(cx, cz);

    const feet = pl.p.y - HEIGHT;
    if (feet < floorTop) {
        pl.p.y += (floorTop - feet);
        pl.v.y = 0;
        pl.on = true;
    } else {
        pl.on = false;
    }

    const feetY = pl.p.y - HEIGHT;

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

    let nx = pl.p.x + pl.v.x * dt;
    nx = clamp(nx, R, W - R);
    nx = resolveX(nx, pl.p.z);

    let nz = pl.p.z + pl.v.z * dt;
    nz = clamp(nz, R, H - R);
    nz = resolveZ(nx, nz);

    pl.p.x = nx;
    pl.p.z = nz;
}

/* =============================================================================
   RAYCAST
============================================================================= */
async function hit() {
    camSync();
    G.ray.far = conf.reach;
    G.ray.set(G.cam.position, facing());

    const hits = G.ray.intersectObjects([...G.vox.mesh.values()], false);
    const h = hits.find(q => q.object.geometry && q.object.geometry.type === "BoxGeometry");
    if (!h) return null;

    const p = h.point.clone().addScaledVector(h.face.normal, -0.01);
    const x = Math.floor(p.x);
    const y = Math.floor(p.y);
    const z = Math.floor(p.z);

    const n = h.face.normal;
    const place = new THREE.Vector3(x, y, z).add(n);

    return { x, y, z, px: Math.floor(place.x), py: Math.floor(place.y), pz: Math.floor(place.z) };
}

/* =============================================================================
   USE HANDLERS (REPLACES GIANT if/else, SAME BEHAVIOR)
============================================================================= */
const Use = {
    byItem: Object.create(null),
    byType: Object.create(null),
    onItem(k, fn) { this.byItem[k] = fn; },
    onType(t, fn) { this.byType[t] = fn; }
};

async function use() {
    const s = G.bag.hot[G.bag.sel];
    if (!s) return;

    const h = await hit();
    if (!h) return;

    const it = items[s.k];
    const fn = Use.byItem[s.k] || Use.byType[it.t];
    if (fn) await fn({ s, it, h });
}

// --- tool: hoe
Use.onItem("hoe_wood", async ({ h }) => {
    if (h.y === Y1) {
        const ok = await G.vox.till(h.x, h.z);
        if (!ok) msg("Needs water within 5");
    }
});

// --- tool: shovel (path)
Use.onItem("shovel_wood", async ({ h }) => {
    if (h.y === Y1) {
        const id = G.vox.get(h.x, h.y, h.z);
        if (id === "grass") await G.vox.set(h.x, h.y, h.z, "path");
    }
});

// --- seeds
Use.onType("seed", async ({ s, h }) => {
    if (h.y !== Y1) return;
    const type = (s.k === "seed_wheat") ? "wheat" : (s.k === "seed_carrot" ? "carrot" : null);
    if (!type) return;
    const ok = await G.vox.plant(h.x, h.z, type);
    if (ok) {
        s.c -= 1;
        if (s.c <= 0) G.bag.hot[G.bag.sel] = null;
    }
});

// --- bucket empty
Use.onItem("bucket_empty", async ({ h }) => {
    if (h.x === INF.x && h.y === INF.y && h.z === INF.z) {
        G.bag.hot[G.bag.sel] = { k: "bucket_full", c: 1 };
        msg("Filled");
        return;
    }
    if (G.vox.get(h.x, h.y, h.z) === "water" && h.y === Y1) {
        await G.vox.set(h.x, h.y, h.z, null);
        G.bag.hot[G.bag.sel] = { k: "bucket_full", c: 1 };
        msg("Filled");
    }
});

// --- bucket full
Use.onItem("bucket_full", async ({ h }) => {
    if (h.py !== Y1) return;
    if (h.px === INF.x && h.py === INF.y && h.pz === INF.z) return;

    const dx = h.px + 0.5 - G.pl.p.x;
    const dz = h.pz + 0.5 - G.pl.p.z;
    if (Math.hypot(dx, dz) < 0.6) return;

    await G.vox.place(h.px, h.py, h.pz, "water");
    G.bag.hot[G.bag.sel] = { k: "bucket_empty", c: 1 };
    msg("Poured");
});

// --- place dirt
Use.onItem("dirt", async ({ s, h }) => {
    if (h.py !== Y1) return;
    if (h.px === INF.x && h.py === INF.y && h.pz === INF.z) return;

    const dx = h.px + 0.5 - G.pl.p.x;
    const dz = h.pz + 0.5 - G.pl.p.z;
    if (Math.hypot(dx, dz) < 0.6) return;

    await G.vox.place(h.px, h.py, h.pz, "dirt");
    s.c -= 1;
    if (s.c <= 0) G.bag.hot[G.bag.sel] = null;
});

/* =============================================================================
   CRACK OVERLAY
============================================================================= */
async function crackInit() {
    const urls = [
        "./Source/Assets/UI/Breaking/crack1.png",
        "./Source/Assets/UI/Breaking/crack2.png",
        "./Source/Assets/UI/Breaking/crack3.png",
        "./Source/Assets/UI/Breaking/crack4.png",
        "./Source/Assets/UI/Breaking/crack5.png",
        "./Source/Assets/UI/Breaking/crack6.png",
    ];
    for (const u of urls) G.crack.tx.push(await G.tex.get(u));

    const mat = new THREE.MeshBasicMaterial({
        map: G.crack.tx[0],
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

    G.crack.m = [];
    for (let i = 0; i < faces.length; i++) {
        const m = new THREE.Mesh(g, mat.clone());
        m.visible = false;
        m.renderOrder = 999;
        G.scene.add(m);
        G.crack.m.push({ mesh: m, localPos: faces[i].pos, localRot: faces[i].rot });
    }
}

function crackShow(x, y, z, stage) {
    if (!G.crack.m || G.crack.m.length === 0) return;

    const tx = G.crack.tx[clamp(stage, 0, 5)];
    for (const f of G.crack.m) {
        f.mesh.visible = true;
        f.mesh.position.set(x, y, z).add(f.localPos);
        f.mesh.rotation.copy(f.localRot);
        f.mesh.material.map = tx;
        f.mesh.material.needsUpdate = true;
    }
}

function crackHide() {
    if (!G.crack.m || G.crack.m.length === 0) return;
    for (const f of G.crack.m) f.mesh.visible = false;
}

/* =============================================================================
   MINING
============================================================================= */
function hardness(id) {
    if (id === "grass" || id === "dirt" || id === "tilled_dry" || id === "tilled_wet") return 0.85;
    if (id === "water") return 0.25;
    return 0.9;
}

function speedFor(id) {
    const s = G.bag.hot[G.bag.sel];
    const held = s ? s.k : "";
    if (held === "shovel_wood") {
        if (id === "grass" || id === "dirt" || id === "tilled_dry" || id === "tilled_wet") return 0.35;
    }
    return hardness(id);
}

async function mineTick(dt) {
    if (!G.mine.on || G.open || !G.lock) return;

    const h = await hit();
    if (!h) { G.mine.t = 0; crackHide(); return; }

    if (h.y === Y1) {
        const ck = key(h.x, Y1, h.z);
        if (G.vox.crop.has(ck)) {
            await G.vox.breakCrop(h.x, h.z);
            G.mine.t = 0;
            crackHide();
            return;
        }
    }

    const id = G.vox.get(h.x, h.y, h.z);
    if (!id) { G.mine.t = 0; crackHide(); return; }
    if (!blocks[id].breakable) { G.mine.t = 0; crackHide(); return; }
    if (h.x === INF.x && h.y === INF.y && h.z === INF.z) { G.mine.t = 0; crackHide(); return; }

    const same = (G.mine.k === id && G.mine.p.x === h.x && G.mine.p.y === h.y && G.mine.p.z === h.z);
    if (!same) {
        G.mine.k = id;
        G.mine.p = { x: h.x, y: h.y, z: h.z };
        G.mine.t = 0;
        G.mine.need = speedFor(id);
    }

    G.mine.need = speedFor(id);
    G.mine.t += dt;

    const prog = clamp(G.mine.t / G.mine.need, 0, 1);
    const stage = Math.min(5, Math.floor(prog * 6));
    crackShow(h.x, h.y, h.z, stage);

    if (G.mine.t >= G.mine.need) {
        await G.vox.breakBlock(h.x, h.y, h.z);
        G.mine.t = 0;
        crackHide();
    }
}

/* =============================================================================
   HOLOGRAM
============================================================================= */
function round(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
}

async function holoInit() {
    const c = document.createElement("canvas");
    c.width = 256; c.height = 64;
    const g = c.getContext("2d");

    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = "rgba(0,0,0,0.55)";
    round(g, 8, 8, 240, 48, 10); g.fill();
    g.strokeStyle = "rgba(255,255,255,0.18)";
    g.lineWidth = 2; round(g, 8, 8, 240, 48, 10); g.stroke();

    g.fillStyle = "rgba(255,255,255,0.95)";
    g.font = "32px 'Jersey 10'";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("Infinite Water", 128, 32);

    const tx = new THREE.CanvasTexture(c);
    tx.magFilter = THREE.NearestFilter;
    tx.minFilter = THREE.NearestFilter;
    tx.generateMipmaps = false;

    const mat = new THREE.SpriteMaterial({ map: tx, transparent: true, depthWrite: false });
    const spr = new THREE.Sprite(mat);
    spr.position.set(INF.x + 0.5, Y1 + 2.2, INF.z + 0.5);
    spr.scale.set(3.2, 0.8, 1);
    G.scene.add(spr);
    G.holo.m = spr;
}

function holoTick() {
    if (!G.holo.m) return;
    const d = G.cam.position.distanceTo(G.holo.m.position);
    const s = clamp(d * 0.18, 1.7, 4.2);
    G.holo.m.scale.set(3.2 * s * 0.35, 0.8 * s * 0.35, 1);
}

/* =============================================================================
   TAB (FPS + POSITION)
============================================================================= */
function tabTick(dt) {
    G.fpa += dt; G.fpf++;
    if (G.fpa >= 0.25) { G.fps = Math.round(G.fpf / G.fpa); G.fpa = 0; G.fpf = 0; }
    if (G.tab) {
        root.el.fps.textContent = `FPS: ${G.fps}`;
        root.el.pos.textContent = `XYZ: ${G.pl.p.x.toFixed(2)} ${G.pl.p.y.toFixed(2)} ${G.pl.p.z.toFixed(2)}`;
    }
}

/* =============================================================================
   SYSTEMS (THIS IS THE “BEST LONG-TERM” PART)
============================================================================= */
const Systems = [];
function addSystem(name, sys) { Systems.push({ name, ...sys }); }

addSystem("movement", {
    tick(dt) {
        if (G.lock && !G.open) {
            ctrl(dt);
            collide(dt);
        } else {
            // same fallback behavior as your code
            G.pl.v.y = Math.max(G.pl.v.y - conf.grav * dt, -20);
            collide(dt);
        }
        camSync();
    }
});

addSystem("mining", { async tick(dt) { await mineTick(dt); } });

addSystem("farming", {
    async tick() {
        await G.vox.hydrateTick();
        await G.vox.growTick();
    }
});

addSystem("items_particles", {
    async tick(dt) {
        await G.vox.itemTick(dt, G.pl.p, G.bag);
        G.vox.partsTick(dt, G.cam);
    }
});

addSystem("holo_tab_ui", {
    tick(dt) {
        holoTick();
        tabTick(dt);
        uiDraw();
    }
});

addSystem("render", {
    tick() {
        G.ren.render(G.scene, G.cam);
    }
});

/* =============================================================================
   INPUT (EVENTS)
============================================================================= */
document.addEventListener("pointerlockchange", () => {
    G.lock = (document.pointerLockElement === root.el.c);
});

addEventListener("mousemove", (e) => {
    if (G.open) {
        root.el.carry.style.left = e.clientX + "px";
        root.el.carry.style.top = e.clientY + "px";
    }
    if (!G.lock || G.open) return;

    G.pl.yaw -= e.movementX * conf.sens;
    G.pl.pit -= e.movementY * conf.sens;
    G.pl.pit = clamp(G.pl.pit, -1.45, 1.45);
});

addEventListener("mousedown", async (e) => {
    if (G.open) return;
    if (!G.lock) { root.el.c.requestPointerLock(); return; }
    if (e.button === 0) G.mine.on = true;
    if (e.button === 2) await use();
});

addEventListener("mouseup", (e) => {
    if (e.button === 0) {
        G.mine.on = false;
        G.mine.t = 0;
        crackHide();
    }
});

addEventListener("contextmenu", (e) => e.preventDefault());

addEventListener("keydown", (e) => {
    prevent(e);
    K[e.code] = true;

    if (e.code === "KeyE" && !e.repeat) {
        setOpen(!G.open);
        G.mine.on = false;
        G.mine.t = 0;
        crackHide();
    }

    if (e.code === "Tab") {
        e.preventDefault();
        G.tab = true;
        root.el.tab.classList.remove("hide");
    }

    if (e.code.startsWith("Digit")) {
        const n = Number(e.code.slice(5)) - 1;
        if (n >= 0 && n < 9) G.bag.sel = n;
    }
});

addEventListener("keyup", (e) => {
    prevent(e);
    K[e.code] = false;

    if (e.code === "Tab") {
        e.preventDefault();
        G.tab = false;
        root.el.tab.classList.add("hide");
    }
});

/* =============================================================================
   THREE INIT
============================================================================= */
function initThree() {
    const ren = new THREE.WebGLRenderer({ canvas: root.el.c, antialias: false });
    ren.setPixelRatio(Math.min(devicePixelRatio, 2));
    ren.setSize(innerWidth, innerHeight, false);
    ren.setClearColor(0x69b7ff, 1);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x69b7ff, 18, 55);

    const cam = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.01, 200);

    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(2, 8, 3);
    scene.add(sun);
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));

    addEventListener("resize", () => {
        cam.aspect = innerWidth / innerHeight;
        cam.updateProjectionMatrix();
        ren.setSize(innerWidth, innerHeight, false);
    });

    G.ren = ren;
    G.scene = scene;
    G.cam = cam;
}

/* =============================================================================
   LOOP
============================================================================= */
let last = performance.now();

async function loop() {
    const t = performance.now();
    const dt = Math.min(0.033, (t - last) / 1000);
    last = t;

    for (const s of Systems) {
        if (s.tick) await s.tick(dt);
    }

    requestAnimationFrame(loop);
}

/* =============================================================================
   START (SAME BEHAVIOR)
============================================================================= */
async function start() {
    initThree();

    uiBuild();

    G.tex = new Tex();
    G.vox = new Vox(G.scene, G.tex);

    await crackInit();
    await G.vox.init();
    await holoInit();

    G.pl.p.set(1.35, 2.65, 1.35);

    msg("Click to play");
    requestAnimationFrame(loop);
}

start();
