/**
 * AudioSystem
 *
 * Web Audio API tabanlı ses sistemi. Tüm sesler procedural olarak
 * AudioContext içinde sentezleniyor — harici dosya bağımlılığı yok.
 *
 * Tracks:
 *   - Garden ambient pad : PLAY fazında huzurlu majör synth pad + hafif rüzgar
 *   - Footstep           : Oyuncu hareket ettiğinde adım sesi
 *   - Candy pickup       : Retro "ding/coin" — şeker toplanması
 *   - Break sting        : BREAK fazı geçişinde ani alarm tonu
 *   - Heartbeat          : BREAK fazında artan nabız (72→140 BPM)
 *   - Collapse burst     : 150s'de dijital cızırtı / white-noise patlaması
 */
export class AudioSystem {
    constructor() {
        this.ctx     = null;
        this.phase   = 'LOCKED';

        // Node referansları
        this._droneGain          = null;
        this._heartbeatGain      = null;
        this._heartbeatInterval  = null;
        this._droneOscillators   = [];

        // NOTE: AudioContext is NOT created here.
        // Browser policy: AudioContext must be created after a user gesture.
        // _init() is called lazily from resume() on the first click.
        console.log('AudioSystem: Registered (lazy init — waiting for user gesture).');
    }

    // ─── Init ────────────────────────────────────────────────────────────────
    _init() {
        try {
            this.ctx          = new (window.AudioContext || window.webkitAudioContext)();
            this._masterGain  = this.ctx.createGain();
            this._masterGain.gain.value = 1.0;
            this._masterGain.connect(this.ctx.destination);

            // NOTE: Garden ambient pad (_buildGardenAmbient) and wind layer are
            // intentionally disabled — they produced a 'computer fan' sound.
            // Only heartbeat, footstep, candy pickup and collapse remain active.
            this._buildHeartbeat();
        } catch (e) {
            console.warn('AudioSystem: Web Audio API not supported —', e);
        }
    }

    // ─── Garden Ambient Pad ───────────────────────────────────────────────────
    //
    // Majör akor (C Maj 7: C3-E3-G3-B3) üzerine inşa edilmiş huzurlu synth pad.
    // Her osillatör çok yavaş LFO ile hafifçe nefes alıyor.
    // Üstüne ince bir "rüzgar" noise katmanı eklenmiş.
    _buildGardenAmbient() {
        if (!this.ctx) return;

        this._droneGain = this.ctx.createGain();
        this._droneGain.gain.value = 0.0; // Başlangıçta sessiz
        this._droneGain.connect(this._masterGain);

        // C Major 7 harmonics — C3, E3, G3, B3
        const frequencies = [130.81, 164.81, 196.00, 246.94];
        this._droneOscillators = [];

        frequencies.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            osc.type = i % 2 === 0 ? 'sine' : 'triangle';
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

            // Yavaş nefes LFO — her ses biraz farklı hızda titreşsin
            const lfo     = this.ctx.createOscillator();
            lfo.frequency.value = 0.08 + i * 0.03;
            const lfoGain = this.ctx.createGain();
            lfoGain.gain.value = 0.8;
            lfo.connect(lfoGain);
            lfoGain.connect(osc.frequency);

            // Sadece alçak frekansları geçiren yumuşak filtre
            const filter = this.ctx.createBiquadFilter();
            filter.type           = 'lowpass';
            filter.frequency.value = 800;
            filter.Q.value        = 0.5;

            const oscGain = this.ctx.createGain();
            oscGain.gain.value = 0.12; // Her harmonik yumuşak

            osc.connect(filter);
            filter.connect(oscGain);
            oscGain.connect(this._droneGain);

            osc.start();
            lfo.start();
            this._droneOscillators.push({ osc, lfo });
        });

        // Rüzgar Noise katmanı (çok alçak seviyede)
        this._buildWindLayer();
    }

    _buildWindLayer() {
        if (!this.ctx) return;

        // Pembe noise benzeri rüzgar: filtered white noise looping
        const bufferSize = this.ctx.sampleRate * 4; // 4 saniyelik buffer
        const buffer     = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data       = buffer.getChannelData(0);

        let lastOut = 0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            lastOut     = (lastOut + 0.02 * white) / 1.02;
            data[i]     = lastOut * 3.5;
        }

        this._windSource       = this.ctx.createBufferSource();
        this._windSource.buffer = buffer;
        this._windSource.loop  = true;

        const windFilter        = this.ctx.createBiquadFilter();
        windFilter.type         = 'bandpass';
        windFilter.frequency.value = 600;
        windFilter.Q.value      = 0.4;

        this._windGain          = this.ctx.createGain();
        this._windGain.gain.value = 0.0; // başlangıçta sessiz

        this._windSource.connect(windFilter);
        windFilter.connect(this._windGain);
        this._windGain.connect(this._masterGain);
        this._windSource.start();
    }

    // ─── Heartbeat ────────────────────────────────────────────────────────────
    _buildHeartbeat() {
        if (!this.ctx) return;
        this._heartbeatGain             = this.ctx.createGain();
        this._heartbeatGain.gain.value  = 0.0;
        this._heartbeatGain.connect(this._masterGain);
        this._heartbeatInterval         = null;
    }

    _startHeartbeat() {
        if (this._heartbeatInterval) return;
        let bpm = 72;
        const beat = () => {
            this._playHeartbeatPulse();
            bpm = Math.min(bpm + 1.5, 140);
            const delay = (60 / bpm) * 1000;
            this._heartbeatInterval = setTimeout(beat, delay);
        };
        this._heartbeatGain.gain.setTargetAtTime(0.4, this.ctx.currentTime, 0.5);
        beat();
    }

    _stopHeartbeat() {
        if (this._heartbeatInterval) {
            clearTimeout(this._heartbeatInterval);
            this._heartbeatInterval = null;
        }
        if (this._heartbeatGain) {
            this._heartbeatGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.3);
        }
    }

    _playHeartbeatPulse() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        osc.type  = 'sine';
        osc.frequency.setValueAtTime(80, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.15);
        const env = this.ctx.createGain();
        env.gain.setValueAtTime(0.6, now);
        env.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.connect(env);
        env.connect(this._heartbeatGain);
        osc.start(now);
        osc.stop(now + 0.2);
    }

    // ─── Footstep ─────────────────────────────────────────────────────────────
    _playFootstep() {
        if (!this.ctx || this.phase !== 'PLAY') return;
        const now = this.ctx.currentTime;

        const thump     = this.ctx.createOscillator();
        const thumpGain = this.ctx.createGain();
        thump.type = 'sine';
        thump.frequency.setValueAtTime(100, now);
        thump.frequency.exponentialRampToValueAtTime(40, now + 0.05);
        thumpGain.gain.setValueAtTime(0.4, now);
        thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        thump.connect(thumpGain);
        thumpGain.connect(this._masterGain);
        thump.start(now);
        thump.stop(now + 0.1);

        const bufferSize = this.ctx.sampleRate * 0.1;
        const buffer     = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data       = buffer.getChannelData(0);
        let lastOut      = 0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            data[i]     = lastOut = (lastOut + 0.02 * white) / 1.02;
            data[i]    *= 3.5;
        }
        const noise     = this.ctx.createBufferSource();
        noise.buffer    = buffer;
        const filter    = this.ctx.createBiquadFilter();
        filter.type     = 'lowpass';
        filter.frequency.value = 1000 + Math.random() * 200;
        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.3, now);
        noiseGain.gain.setTargetAtTime(0.0, now + 0.02, 0.02);
        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this._masterGain);
        noise.start(now);
    }

    // ─── Candy Pickup — Retro "ding/coin" ────────────────────────────────────
    _playCandyPickup() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        // İki kısa yükselen nota: küçük bir "ding-ding" müzik efekti
        const notes = [
            { freq: 880, startOffset: 0,    duration: 0.18 },
            { freq: 1320, startOffset: 0.1, duration: 0.22 },
        ];

        notes.forEach(({ freq, startOffset, duration }) => {
            const osc  = this.ctx.createOscillator();
            osc.type   = 'sine';
            osc.frequency.setValueAtTime(freq, now + startOffset);
            // Hafif pitch drop — gerçek bir zil sesi hissi
            osc.frequency.exponentialRampToValueAtTime(freq * 0.92, now + startOffset + duration);

            const env = this.ctx.createGain();
            env.gain.setValueAtTime(0.0, now + startOffset);
            env.gain.linearRampToValueAtTime(0.45, now + startOffset + 0.01); // hızlı attack
            env.gain.exponentialRampToValueAtTime(0.001, now + startOffset + duration);

            osc.connect(env);
            env.connect(this._masterGain);
            osc.start(now + startOffset);
            osc.stop(now + startOffset + duration + 0.05);
        });
    }

    // ─── Break Sting ─────────────────────────────────────────────────────────
    _playBreakSting() {
        if (!this.ctx) return;
        const now  = this.ctx.currentTime;
        const freqs = [880, 1320, 660, 1760];
        freqs.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            osc.type  = 'square';
            osc.frequency.setValueAtTime(freq, now + i * 0.05);
            const env = this.ctx.createGain();
            env.gain.setValueAtTime(0.3, now + i * 0.05);
            env.gain.exponentialRampToValueAtTime(0.001, now + i * 0.05 + 0.4);
            osc.connect(env);
            env.connect(this._masterGain);
            osc.start(now + i * 0.05);
            osc.stop(now + i * 0.05 + 0.5);
        });
    }

    // ─── Collapse Burst — Dijital cızırtı / white-noise patlaması ───────────
    _playCollapseBurst() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        // 1. Geniş bant white-noise patlaması (0 → 0.8s)
        const bufSize  = Math.floor(this.ctx.sampleRate * 0.8);
        const buf      = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
        const data     = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

        const noise    = this.ctx.createBufferSource();
        noise.buffer   = buf;

        const noiseEnv = this.ctx.createGain();
        noiseEnv.gain.setValueAtTime(0.9, now);
        noiseEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

        noise.connect(noiseEnv);
        noiseEnv.connect(this._masterGain);
        noise.start(now);

        // 2. Yüksek frekanslı bozuk bip (kırık sistem sinyali)
        const buzzFreqs = [3520, 2640, 4400, 1760];
        buzzFreqs.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            osc.type  = 'sawtooth';
            osc.frequency.setValueAtTime(freq, now + i * 0.07);
            osc.frequency.exponentialRampToValueAtTime(freq * 0.3, now + i * 0.07 + 0.3);

            const env = this.ctx.createGain();
            env.gain.setValueAtTime(0.25, now + i * 0.07);
            env.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.35);

            osc.connect(env);
            env.connect(this._masterGain);
            osc.start(now + i * 0.07);
            osc.stop(now + i * 0.07 + 0.4);
        });

        console.warn('AudioSystem: COLLAPSE burst fired.');
    }

    // ─── Public API ──────────────────────────────────────────────────────────

    /** Resume AudioContext — also performs lazy init on first call after user gesture */
    resume() {
        // First call: spin up the audio graph now that we have a user gesture
        if (!this.ctx) {
            this._init();
            console.log('AudioSystem: Lazy init complete — Web Audio API ready.');
            return; // ctx is now RUNNING straight away (created inside user-gesture stack)
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume().then(() => console.log('AudioSystem: Context resumed.'));
        }
    }

    /**
     * Faz geçişlerinde çağrılır.
     * @param {'LOCKED'|'PROVOKE'|'PLAY'|'BREAK'|'END'} phase
     */
    setPhase(phase) {
        if (!this.ctx || this.phase === phase) return;
        this.phase = phase;

        switch (phase) {
            case 'LOCKED':
                if (this._droneGain) this._droneGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 1.0);
                if (this._windGain)  this._windGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 1.0);
                this._stopHeartbeat();
                break;

            case 'PROVOKE':
                // Ambient kapalı — sadece heartbeat dışında sessiz
                if (this._droneGain) this._droneGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 1.0);
                if (this._windGain)  this._windGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 1.0);
                this._stopHeartbeat();
                break;

            case 'PLAY':
                // Ambient kapalı — sessiz yürüyüş ortamı, adım sesleri aktif
                if (this._droneGain) this._droneGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 1.0);
                if (this._windGain)  this._windGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 1.0);
                this._stopHeartbeat();
                break;

            case 'BREAK':
                // Break sting + kalp atışı başlar
                this._playBreakSting();
                if (this._droneGain) this._droneGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.5);
                if (this._windGain)  this._windGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 1.0);
                this._startHeartbeat();
                break;

            case 'END':
                // Heartbeat durur, tam sessizlik
                if (this._droneGain) this._droneGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 3.0);
                if (this._windGain)  this._windGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 2.0);
                this._stopHeartbeat();
                break;

            default:
                break;
        }

        console.log(`AudioSystem: phase → [${phase}]`);
    }

    /** Her ~1.5 birimde bir oyuncu adım sesi */
    triggerFootstep() {
        this._playFootstep();
    }

    /** Şeker toplandığında çağrılan tatmin edici "ding" sesi */
    triggerCandyPickup() {
        this._playCandyPickup();
    }

    /** 150s'de GlitchSystem.triggerCollapse() ile eş zamanlı çağrılır */
    triggerCollapse() {
        this._playCollapseBurst();
    }
}
