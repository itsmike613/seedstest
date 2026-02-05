// Source/Scripts/core/audio.js

export class AudioManager {
    constructor() {
        this.ctx = null;

        this.masterGain = null;
        this.sfxGain = null;
        this.footGain = null;
        this.musicGain = null;

        this.sfxVolume = 0.9;
        this.musicVolume = 0.65;

        this._bufCache = new Map();     // url -> AudioBuffer
        this._loadPromises = new Map(); // url -> Promise<AudioBuffer>
        this._lastPlay = new Map();     // key(name) -> time (seconds)

        this._activeVoices = new Map(); // key(name) -> count

        this._music = {
            on: false,
            tracks: [],
            i: 0,
            src: null
        };

        // ducking for footsteps (mining etc.)
        this._footDuck = 1.0;

        // --- default asset mapping (edit as you like) ---
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

        // sane defaults to prevent spammy stacking
        this._defaultMaxVoices = {
            mine_hit: 1,
            mine_break: 2,
            pickup: 2,
            harvest: 2,
            plant: 2,
            hoe: 2,
            shovel: 2,
            place_dirt: 2,
            bucket_fill: 1,
            bucket_pour: 1,

            // footsteps should never stack
            footstep_grass: 1,
            footstep_path: 1,
            footstep_dirt: 1
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
        this.footGain = this.ctx.createGain();
        this.musicGain = this.ctx.createGain();

        this.masterGain.connect(this.ctx.destination);
        this.sfxGain.connect(this.masterGain);
        this.footGain.connect(this.masterGain);
        this.musicGain.connect(this.masterGain);

        this._applyVolumes(true);
        this._applyFootDuck(true);
    }

    _applyVolumes(immediate = false) {
        if (!this.masterGain) return;

        const sfx = Math.max(0, this.sfxVolume);
        const music = Math.max(0, this.musicVolume);

        if (immediate) {
            this.sfxGain.gain.value = sfx;
            this.musicGain.gain.value = music;
        } else {
            const t = this.ctx.currentTime;
            this.sfxGain.gain.setTargetAtTime(sfx, t, 0.02);
            this.musicGain.gain.setTargetAtTime(music, t, 0.02);
        }
    }

    _applyFootDuck(immediate = false, tau = 0.03) {
        if (!this.footGain) return;
        const base = Math.max(0, this.sfxVolume);
        const v = base * Math.max(0, this._footDuck);

        if (immediate) {
            this.footGain.gain.value = v;
        } else {
            const t = this.ctx.currentTime;
            this.footGain.gain.setTargetAtTime(v, t, tau);
        }
    }

    setSfxVolume(v) {
        this.sfxVolume = v;
        this._applyVolumes(false);
        this._applyFootDuck(false, 0.02);
    }

    setMusicVolume(v) {
        this.musicVolume = v;
        this._applyVolumes(false);
    }

    // Duck ONLY footsteps (good for mining).
    // factor < 1 lowers footsteps. attack/release are in seconds-ish (smoothed via setTargetAtTime).
    setFootDuck(factor = 1.0, attack = 0.03, release = 0.12) {
        this._ensureCtx();
        const f = Math.max(0, factor);
        const changed = (Math.abs(f - this._footDuck) > 1e-4);
        this._footDuck = f;

        // choose tau based on direction
        const tau = (f < 1) ? attack : release;
        if (changed) this._applyFootDuck(false, Math.max(0.001, tau));
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
        return Math.max(0.25, 1 + r);
    }

    _voiceKey(nameOrUrl) {
        return `voice:${nameOrUrl}`;
    }

    _canPlayVoice(nameOrUrl, maxVoices) {
        if (!maxVoices || maxVoices <= 0) return true;
        const k = this._voiceKey(nameOrUrl);
        const c = this._activeVoices.get(k) || 0;
        if (c >= maxVoices) return false;
        this._activeVoices.set(k, c + 1);
        return true;
    }

    _releaseVoice(nameOrUrl) {
        const k = this._voiceKey(nameOrUrl);
        const c = this._activeVoices.get(k) || 0;
        const n = Math.max(0, c - 1);
        if (n <= 0) this._activeVoices.delete(k);
        else this._activeVoices.set(k, n);
    }

    // opts:
    // volume, pitchRandom, cooldown, maxVoices, bus: "sfx" | "foot"
    async playSfx(nameOrUrl, opts = {}) {
        this._ensureCtx();

        const url = this._resolveSfxUrl(nameOrUrl);
        if (!url) return null;

        const key = `sfx:${nameOrUrl}`;
        if (!this._cooldownOk(key, opts.cooldown || 0)) return null;

        const maxVoices =
            (opts.maxVoices != null) ? opts.maxVoices :
                (this._defaultMaxVoices[nameOrUrl] ?? 0);

        if (!this._canPlayVoice(nameOrUrl, maxVoices)) return null;

        let buf;
        try {
            buf = await this._loadBuffer(url);
        } catch {
            this._releaseVoice(nameOrUrl);
            return null;
        }

        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = this._pickPlaybackRate(opts.pitchRandom || 0);

        const g = this.ctx.createGain();
        g.gain.value = (opts.volume ?? 1);

        const bus = (opts.bus === "foot") ? this.footGain : this.sfxGain;

        src.connect(g);
        g.connect(bus);

        const done = () => {
            this._releaseVoice(nameOrUrl);
            try { src.disconnect(); } catch { }
            try { g.disconnect(); } catch { }
        };

        src.onended = done;

        try { src.start(); } catch { done(); }

        return src;
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