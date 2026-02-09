// Source/Scripts/core/audio.js

export class AudioManager {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.sfxGain = null;
        this.footGain = null;
        this.musicGain = null;
        this.sfxVolume = 0.9;
        this.musicVolume = 0.50;
        this._bufCache = new Map();
        this._loadPromises = new Map();
        this._lastPlay = new Map();
        this._activeVoices = new Map();

        this._music = {
            on: false,
            tracks: [],
            i: 0,
            src: null,
            gen: 0,
            nowPlaying: ""
        };

        this._footDuck = 1.0;
        this.SFX_DIR = "./Source/Assets/Audio/SFX/";
        this.MUSIC_DIR = "./Source/Assets/Audio/Music/";

        // --- raw asset map (internal) ---
        this.sfx = {
            footstep_grass: this.SFX_DIR + "footstep_grass.mp3",
            footstep_path: this.SFX_DIR + "footstep_path.mp3",
            footstep_dirt: this.SFX_DIR + "footstep_dirt.mp3",

            hoe: this.SFX_DIR + "hoe.mp3",
            shovel: this.SFX_DIR + "shovel.mp3",

            mine_hit: this.SFX_DIR + "mine_hit.mp3",
            mine_break: this.SFX_DIR + "mine_break.mp3",

            pickup: this.SFX_DIR + "pickup.mp3",
            harvest: this.SFX_DIR + "harvest.mp3",
            plant: this.SFX_DIR + "plant.mp3",

            place_dirt: this.SFX_DIR + "place_dirt.mp3",
            bucket_fill: this.SFX_DIR + "bucket_fill.mp3",
            bucket_pour: this.SFX_DIR + "bucket_pour.mp3"
        };

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
            footstep_grass: 1,
            footstep_path: 1,
            footstep_dirt: 1
        };
    }

    // -----------------------------
    // Public "game semantic" API
    // -----------------------------

    preloadGameSfx() {
        return this.preloadSfx([
            "footstep_grass", "footstep_path", "footstep_dirt",
            "hoe", "shovel", "mine_hit", "mine_break",
            "pickup", "harvest", "plant", "place_dirt",
            "bucket_fill", "bucket_pour"
        ]);
    }

    footstep(surface) {
        const name =
            (surface === "path") ? "footstep_path" :
                (surface === "dirt") ? "footstep_dirt" :
                    "footstep_grass";

        return this.playSfx(name, {
            bus: "foot",
            volume: 0.16,
            pitchRandom: 0.08,
            cooldown: 0.0,
            maxVoices: 1
        });
    }

    pickup() {
        return this.playSfx("pickup", {
            volume: 0.65,
            pitchRandom: 0.06,
            cooldown: 0.04,
            maxVoices: 2
        });
    }

    harvest() {
        return this.playSfx("harvest", {
            volume: 0.85,
            pitchRandom: 0.06,
            cooldown: 0.03
        });
    }

    plant() {
        return this.playSfx("plant", {
            volume: 0.78,
            pitchRandom: 0.08,
            cooldown: 0.03
        });
    }

    hoe() {
        return this.playSfx("hoe", {
            volume: 0.8,
            pitchRandom: 0.06,
            cooldown: 0.03
        });
    }

    shovel() {
        return this.playSfx("shovel", {
            volume: 0.75,
            pitchRandom: 0.06,
            cooldown: 0.03
        });
    }

    placeDirt() {
        return this.playSfx("place_dirt", {
            volume: 0.72,
            pitchRandom: 0.06,
            cooldown: 0.03
        });
    }

    bucketFill() {
        return this.playSfx("bucket_fill", {
            volume: 0.9,
            pitchRandom: 0.04,
            cooldown: 0.06,
            maxVoices: 1
        });
    }

    bucketPour() {
        return this.playSfx("bucket_pour", {
            volume: 0.9,
            pitchRandom: 0.04,
            cooldown: 0.06,
            maxVoices: 1
        });
    }

    mineHit() {
        return this.playSfx("mine_hit", {
            volume: 0.42,
            pitchRandom: 0.08,
            cooldown: 0,
            maxVoices: 1
        });
    }

    mineBreak() {
        return this.playSfx("mine_break", {
            volume: 0.82,
            pitchRandom: 0.06,
            cooldown: 0.02,
            maxVoices: 2
        });
    }

    setMiningActive(active) {
        if (active) this.setFootDuck(0.55, 0.03, 0.12);
        else this.setFootDuck(1.0, 0.03, 0.12);
    }

    // -----------------------------
    // Core audio engine
    // -----------------------------

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
            this.musicGain.gain.setTargetAtTime(music, t, 0.03);
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

    setFootDuck(factor = 1.0, attack = 0.03, release = 0.12) {
        this._ensureCtx();
        const f = Math.max(0, factor);
        const changed = (Math.abs(f - this._footDuck) > 1e-4);
        this._footDuck = f;
        const tau = (f < 1) ? attack : release;
        if (changed) this._applyFootDuck(false, Math.max(0.001, tau));
    }

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
        const r = (Math.random() * 2 - 1) * pitchRandom;
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

    async playSfx(nameOrUrl, opts = {}) {
        this._ensureCtx();
        const url = this._resolveSfxUrl(nameOrUrl);
        if (!url) return null;
        const key = `sfx:${nameOrUrl}`;
        if (!this._cooldownOk(key, opts.cooldown || 0)) return null;
        const maxVoices = (opts.maxVoices != null) ? opts.maxVoices : (this._defaultMaxVoices[nameOrUrl] ?? 0);
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
    _stopCurrentMusicSource() {
        if (!this._music.src) return;
        const s = this._music.src;
        this._music.src = null;
        try { s.onended = null; } catch { }
        try { s.stop(); } catch { }
        try { s.disconnect(); } catch { }
    }

    _trackDisplayName(url) {
        try {
            const s = String(url || "");
            const base = s.split("/").pop() || s;
            const noQuery = base.split("?")[0];
            const noExt = noQuery.replace(/\.[^/.]+$/, "");
            return noExt || "Unknown";
        } catch {
            return "Unknown";
        }
    }

    getNowPlaying() {
        return this._music.nowPlaying || "";
    }

    startMusicPlaylist(tracks = []) {
        this._ensureCtx();
        this._music.gen++;
        this._stopCurrentMusicSource();
        this._music.tracks = tracks.map(t => this._resolveMusicUrl(t)).filter(Boolean);
        this._music.i = 0;
        this._music.on = true;
        this._music.nowPlaying = this._music.tracks.length ? this._trackDisplayName(this._music.tracks[0]) : "";
        this._startNextTrack(this._music.gen);
    }

    stopMusic() {
        this._ensureCtx();
        this._music.on = false;
        this._music.tracks = [];
        this._music.i = 0;
        this._music.gen++;
        this._stopCurrentMusicSource();
        this._music.nowPlaying = "";
    }

    async _startNextTrack(gen) {
        if (!this._music.on) return;
        if (gen !== this._music.gen) return;
        if (!this._music.tracks.length) return;
        this._stopCurrentMusicSource();
        const url = this._music.tracks[this._music.i % this._music.tracks.length];
        this._music.i++;
        this._music.nowPlaying = this._trackDisplayName(url);
        let buf;

        try {
            buf = await this._loadBuffer(url);
        } catch {
            if (this._music.on && gen === this._music.gen) this._startNextTrack(gen);
            return;
        }
        if (!this._music.on) return;
        if (gen !== this._music.gen) return;
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.connect(this.musicGain);
        src.onended = () => {
            if (!this._music.on) return;
            if (gen !== this._music.gen) return;
            this._startNextTrack(gen);
        };
        this._music.src = src;
        try { src.start(); } catch { /* ignore */ }
    }
}