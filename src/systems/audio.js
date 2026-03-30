/**
 * AudioSystem
 * 
 * Web Audio API tabanlı ses sistemi. Harici ses dosyasına bağımlılık yok —
 * tüm sesler procedural olarak AudioContext içinde oluşturuluyor.
 * 
 * Tracks:
 *   - Ambient drone   : Sürekli çalan derin, karanlık atmosfer uğultusu
 *   - Footstep        : Oyuncu hareket ettiğinde adım sesi (PLAY fazı)
 *   - Break sting     : BREAK fazına geçişte çalan ani rahatsız edici ses
 *   - Heartbeat       : BREAK fazında artan nabız efekti
 * 
 * Kullanım:
 *   const audio = new AudioSystem();
 *   audio.setPhase('PLAY');
 *   audio.triggerFootstep();   // Her adımda çağır
 */
export class AudioSystem {
    constructor() {
        this.ctx = null;
        this.phase = 'LOCKED';

        // Node referansları
        this._droneNode = null;
        this._droneGain = null;
        this._heartbeat = null;
        this._footstepScheduled = false;

        this._init();
        console.log("AudioSystem: Web Audio API initialized.");
    }

    _init() {
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this._masterGain = this.ctx.createGain();
            this._masterGain.gain.value = 1.0;
            this._masterGain.connect(this.ctx.destination);

            this._buildAmbientDrone();
            this._buildHeartbeat();
        } catch (e) {
            console.warn("AudioSystem: Web Audio API not supported —", e);
        }
    }

    // ─── Ambient Drone ────────────────────────────────────────────────────────
    // Sinematik dark ambient pad (Koyu, boğuk ve nabız atan koro/akor sesleri)
    _buildAmbientDrone() {
        if (!this.ctx) return;

        this._droneGain = this.ctx.createGain();
        this._droneGain.gain.value = 0.0; // Başlangıçta sessiz
        this._droneGain.connect(this._masterGain);

        // Minör/Dissonant Akor Frekansları (D2, F2, Ab2, C#3) - Çok yoğun bir gerilim akoru
        const frequencies = [73.42, 87.31, 103.83, 138.59];
        this._droneOscillators = [];

        for (let i = 0; i < frequencies.length; i++) {
            const freq = frequencies[i];
            
            // Dalga şeklini sinüs ve üçgen ağırlıklı yapalım (yumuşak ama derinden rahatsız edici)
            const osc = this.ctx.createOscillator();
            osc.type = i % 2 === 0 ? 'sine' : 'triangle'; 
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

            // Çok yavaş LFO ile frekans modülasyonu (detune dalgalanması)
            const lfo = this.ctx.createOscillator();
            lfo.frequency.value = 0.1 + Math.random() * 0.15; // Çok yavaş nabız
            const lfoGain = this.ctx.createGain();
            lfoGain.gain.value = 1.5; // Detune miktarı (pitch bükülmesi)
            lfo.connect(lfoGain);
            lfoGain.connect(osc.frequency);

            // Sesin boğuklaşması ve karanlık gelmesi için LowPass Filtre
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            // LFO ile filtrenin de açılıp kapanması (Nefes alma hissi)
            filter.frequency.value = 300 + Math.random() * 100;
            const filterLfo = this.ctx.createOscillator();
            filterLfo.frequency.value = 0.05 + Math.random() * 0.05;
            const filterLfoGain = this.ctx.createGain();
            filterLfoGain.gain.value = 150;
            filterLfo.connect(filterLfoGain);
            filterLfoGain.connect(filter.frequency);
            filterLfo.start();

            const oscGain = this.ctx.createGain();
            oscGain.gain.value = 0.15; // Genliği düşürüp pad hissini yumuşatır

            osc.connect(filter);
            filter.connect(oscGain);
            oscGain.connect(this._droneGain);

            osc.start();
            lfo.start();

            this._droneOscillators.push({ osc, lfo, filterLfo });
        }
    }

    // ─── Heartbeat ───────────────────────────────────────────────────────────
    _buildHeartbeat() {
        if (!this.ctx) return;
        this._heartbeatGain = this.ctx.createGain();
        this._heartbeatGain.gain.value = 0.0;
        this._heartbeatGain.connect(this._masterGain);
        this._heartbeatInterval = null;
    }

    _startHeartbeat() {
        if (this._heartbeatInterval) return;
        let bpm = 72;
        const beat = () => {
            this._playHeartbeatPulse();
            // Giderek hızlanan nabız
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

        // Düşük frekans darbe (bas davul karakteri)
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
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
    // Tok ve gerçekçi bir taş yüzey yürüme sesi: Düşük frekanslı vuruş (Thump) + Sürtünme Sesi (Noise)
    _playFootstep() {
        if (!this.ctx || this.phase !== 'PLAY') return;
        const now = this.ctx.currentTime;

        // 1. Darbe / Thump (Ayakkabı topuğunun taşa vurması)
        const thump = this.ctx.createOscillator();
        const thumpGain = this.ctx.createGain();
        thump.type = 'sine';
        // Frekansı süpürerek (pitch sweep) tok bir "güm" sesi yaratıyoruz
        thump.frequency.setValueAtTime(100, now);
        thump.frequency.exponentialRampToValueAtTime(40, now + 0.05);
        thumpGain.gain.setValueAtTime(0.5, now);
        thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        thump.connect(thumpGain);
        thumpGain.connect(this._masterGain);
        thump.start(now);
        thump.stop(now + 0.1);

        // 2. Sürtünme / Scuff (Ayakkabı tabanı)
        const bufferSize = this.ctx.sampleRate * 0.1;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let lastOut = 0;
        for (let i = 0; i < bufferSize; i++) {
            // Basit brown noise (daha tok ve boğuk bir hışırtı)
            const white = Math.random() * 2 - 1;
            data[i] = (lastOut + (0.02 * white)) / 1.02;
            lastOut = data[i];
            data[i] *= 3.5; // Gain telafisi
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        // Koyu bir taş yankısı elde etmek için fitre
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1000 + Math.random() * 200; // Her adım biraz farklı

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.4, now);
        // Hızlı azalan doğal bir envelope
        noiseGain.gain.setTargetAtTime(0.0, now + 0.02, 0.02);

        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this._masterGain);
        noise.start(now);
    }

    // ─── Break Sting ─────────────────────────────────────────────────────────
    // BREAK fazına geçişte çalan tek seferlik rahatsız edici ses stingi
    _playBreakSting() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        // Yüksek frekanslı, hızlı azalan tiz bir alarm tonu
        const freqs = [880, 1320, 660, 1760];
        freqs.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            osc.type = 'square';
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

    // ─── Public API ──────────────────────────────────────────────────────────

    /**
     * Resume AudioContext (browser needs user gesture first).
     * Çağrı: oyun başladığında (ilk click sonrası)
     */
    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().then(() => console.log("AudioSystem: Context resumed."));
        }
    }

    /**
     * Phase geçişlerinde çağrılır. Ses kanallarını ayarlar.
     * @param {'LOCKED'|'PROVOKE'|'PLAY'|'BREAK'|'END'} phase
     */
    setPhase(phase) {
        if (!this.ctx || this.phase === phase) return;
        this.phase = phase;

        switch (phase) {
            case 'LOCKED':
                this._droneGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 1.0);
                this._stopHeartbeat();
                break;

            case 'PROVOKE':
                // Çok hafif drone — sezilir sezilmez bir rahatsızlık
                this._droneGain.gain.setTargetAtTime(0.15, this.ctx.currentTime, 2.0);
                this._stopHeartbeat();
                break;

            case 'PLAY':
                // Drone biraz daha belirgin — gerilim hissettiriyor
                this._droneGain.gain.setTargetAtTime(0.3, this.ctx.currentTime, 1.5);
                this._stopHeartbeat();
                break;

            case 'BREAK':
                // Sting çal, drone maksimuma çık, nabız başlasın
                this._playBreakSting();
                this._droneGain.gain.setTargetAtTime(0.6, this.ctx.currentTime, 0.5);
                this._startHeartbeat();
                break;

            case 'END':
                // Her şey yavaşça sessizleşiyor
                this._droneGain.gain.setTargetAtTime(0.1, this.ctx.currentTime, 2.0);
                this._stopHeartbeat();
                break;

            default:
                break;
        }

        console.log(`AudioSystem: phase → [${phase}]`);
    }

    /**
     * Oyuncu hareket ettiğinde (her ~0.5 birim mesafede bir) çağırılabilir.
     * game.js veya playerController.js'den tetiklenir.
     */
    triggerFootstep() {
        this._playFootstep();
    }
}
