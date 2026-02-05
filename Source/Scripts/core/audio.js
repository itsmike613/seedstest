// Source/Scripts/core/audio.js

export class AudioManager {
    constructor() {
        this.ctx = null;

        this.masterGain = null;
        this.sfxGain = null;
        this.musicGain = null;

        this.sfxVolume = 0.9;
        this.musicVolume = 0.65;

        this._bufCache = new Map();     // url -> AudioBuffer
        this._loadPromises = new Map(); // url -> Promise<AudioBuffer>
        this._lastPlay = new Map();     // key(name) -> time (seconds)

        this._loops = new Map();        // name -> { src, gain }

        this._music = {
            on: false,
            tracks: [],
            i: 0,
            src: null
        };

        // --- default asset mapping ---
        this.SFX_DIR = "./Source/Assets/Audio/SFX/";
        this.MUSIC_DIR = "./Source/Assets/Audio/Music/";

        this.sfx = {
            footstep_grass: this.SFX_DIR + "footstep_grass.ogg",
            footstep_path: this.SFX_DIR + "footstep_path.ogg",
            footstep_dirt: this.SFX_DIR + "footstep_dirt.ogg",

            hoe: this.SFX_DIR + "hoe.ogg",
            shovel: this.SFX_DIR + "shovel.ogg",

            mine_hit: this.SFX_DIR + "mine_hit.ogg",
            mine_break: this.SFX_DIR + "mine_break.ogg",

            pickup: this.SFX_DIR + "pickup.ogg",
            harvest: this.SFX_DIR + "harvest.ogg",
            plant: this.SFX_DIR + "plant.ogg",

            place_dirt: this.SFX_DIR + "place_dirt.ogg",
            bucket_fill: this.SFX_DIR + "bucket_fill.ogg",
            bucket_pour: this.SFX_DIR + "bucket_pour.ogg"
        };
    }

    // Call this from a user gesture (mousedown/keydown) to satisfy autoplay rules.
    async unlock() {
        this._ensureCtx();
        try { await this.ctx.resume(); } catch { /* ignore */ }
    }

    _ensureCtx() {
        if (this.ctx) return;

        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();

        this.masterGain = this.ctx.createGain();
        this.sfxGain = this.ctx.createGain();
        this.musicGain = this.ctx.createGain();

        this.masterGain.connect(this.ctx.destination);
        this.sfxGain.connect(this.masterGain);
        this.musicGain.connect(this.masterGain);

        this._applyVolumes();
    }

    _applyVolumes() {
        if (!this.masterGain) return;
        this.sfxGain.gain.value = Math.max(0, this.sfxVolume);
        this.musicGain.gain.value = Math.max(0, this.musicVolume);
    }

    setSfxVolume(v) {
        this.sfxVolume = v;
        this._applyVolumes();
    }

    setMusicVolume(v) {
        this.musicVolume = v;
        this._applyVolumes();
    }

    // Preload optional (safe to call; failures won't crash)
    async preloadSfx(names = []) {
        this._ensureCtx();
        const urls = names
            .map(n => this._resolveSfxUrl(n))
            .filter(Boolean);
        await Promise.allSettled(urls.map(u => this._loadBuffer(u)));
    }

    _resolveSfxUrl(nameOrUrl) {
        if (!nameOrUrl) return null;
        if (this.sfx[nameOrUrl]) return this.sfx[nameOrUrl];
        // if user passes a url/path directly
        return nameOrUrl;
    }

    _resolveMusicUrl(nameOrUrl) {
        if (!nameOrUrl) return null;
        if (nameOrUrl.includes("/") || nameOrUrl.includes(".")) return nameOrUrl;
        return this.MUSIC_DIR + nameOrUrl;
    }

    async _loadBuffer(url) {
        this._ensureCtx();
        if (this._bufCache.has(url)) return this._bufCache.get(url);
        if (this._loadPromises.has(url)) return this._loadPromises.get(url);

        const p = (async () => {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Audio fetch failed (${res.status}): ${url}`);
            const arr = await res.arrayBuffer();
            const buf = await this.ctx.decodeAudioData(arr);
            this._bufCache.set(url, buf);
            return buf;
        })();

        this._loadPromises.set(url, p);

        try {
            const buf = await p;
            return buf;
        } finally {
            this._loadPromises.delete(url);
        }
    }

    _now() {
        return this.ctx ? this.ctx.currentTime : 0;
    }

    _cooldownOk(key, cooldown) {
        if (!cooldown || cooldown <= 0) return true;
        const t = this._now();
        const last = this._lastPlay.get(key) || -Infinity;
        if ((t - last) < cooldown) return false;
        this._lastPlay.set(key, t);
        return true;
    }

    _pickPlaybackRate(pitchRandom) {
        if (!pitchRandom || pitchRandom <= 0) return 1;
        const r = (Math.random() * 2 - 1) * pitchRandom; // [-pitchRandom, +pitchRandom]
        // interpret as a multiplier delta; keep it simple + stable across browsers
        return Math.max(0.25, 1 + r);
    }

    async playSfx(nameOrUrl, opts = {}) {
        this._ensureCtx();

        const url = this._resolveSfxUrl(nameOrUrl);
        if (!url) return null;

        const key = `sfx:${nameOrUrl}`;
        if (!this._cooldownOk(key, opts.cooldown || 0)) return null;

        let buf;
        try {
            buf = await this._loadBuffer(url);
        } catch (e) {
            // fail quietly (missing file shouldn't kill the game)
            // console.warn(e);
            return null;
        }

        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = this._pickPlaybackRate(opts.pitchRandom || 0);

        const g = this.ctx.createGain();
        g.gain.value = (opts.volume ?? 1);

        src.connect(g);
        g.connect(this.sfxGain);

        try { src.start(); } catch { /* ignore */ }
        src.onended = () => {
            try { src.disconnect(); } catch { }
            try { g.disconnect(); } catch { }
        };

        return src;
    }

    async playLoopSfx(nameOrUrl, opts = {}) {
        this._ensureCtx();

        const name = nameOrUrl;
        const existing = this._loops.get(name);
        if (existing) return existing;

        const url = this._resolveSfxUrl(nameOrUrl);
        if (!url) return null;

        let buf;
        try {
            buf = await this._loadBuffer(url);
        } catch {
            return null;
        }

        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.playbackRate.value = opts.playbackRate ?? 1;

        const g = this.ctx.createGain();
        g.gain.value = (opts.volume ?? 1);

        src.connect(g);
        g.connect(this.sfxGain);

        try { src.start(); } catch { /* ignore */ }

        const handle = { src, gain: g };
        this._loops.set(name, handle);
        return handle;
    }

    stopLoopSfx(nameOrUrl) {
        const name = nameOrUrl;
        const h = this._loops.get(name);
        if (!h) return;

        this._loops.delete(name);

        try { h.src.stop(); } catch { }
        try { h.src.disconnect(); } catch { }
        try { h.gain.disconnect(); } catch { }
    }

    stopAllLoops() {
        for (const k of Array.from(this._loops.keys())) this.stopLoopSfx(k);
    }

    // -----------------------------
    // Music playlist
    // -----------------------------
    startMusicPlaylist(tracks = []) {
        this._ensureCtx();
        this._music.tracks = tracks.map(t => this._resolveMusicUrl(t)).filter(Boolean);
        this._music.i = 0;
        this._music.on = true;

        this._startNextTrack();
    }

    stopMusic() {
        this._music.on = false;
        this._music.tracks = [];
        this._music.i = 0;

        if (this._music.src) {
            try { this._music.src.onended = null; } catch { }
            try { this._music.src.stop(); } catch { }
            try { this._music.src.disconnect(); } catch { }
            this._music.src = null;
        }
    }

    async _startNextTrack() {
        if (!this._music.on) return;
        if (!this._music.tracks.length) return;

        const url = this._music.tracks[this._music.i % this._music.tracks.length];
        this._music.i++;

        let buf;
        try {
            buf = await this._loadBuffer(url);
        } catch {
            // skip missing/bad track
            if (this._music.on) this._startNextTrack();
            return;
        }

        if (!this._music.on) return;

        const src = this.ctx.createBufferSource();
        src.buffer = buf;

        src.connect(this.musicGain);

        src.onended = () => {
            if (!this._music.on) return;
            this._startNextTrack();
        };

        this._music.src = src;
        try { src.start(); } catch { /* ignore */ }
    }
}