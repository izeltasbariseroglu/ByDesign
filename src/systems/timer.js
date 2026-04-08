export class Timer {
    constructor() {
        this.elapsedTime = 0;
        this.totalDuration = 150; // 150 seconds total (Faz 3: 2:30)
        this.isGlitched = false;
        
        console.log("Timer system initialized (150s timeline)");
    }

    update(delta) {
        if (this.elapsedTime < this.totalDuration) {
            this.elapsedTime += delta;
        }

        if (this.elapsedTime >= 120) {
            this.isGlitched = true;
        }

        return this.elapsedTime;
    }

    getFormattedTime() {
        // 0-10:   PROVOKE phase
        // 10-120: PLAY phase   → countdown shows 2:00 → 0:00 (120 real secs mapped to fake 120s)
        // 120+:   BREAK phase  → glitched clock
        
        if (this.elapsedTime < 10) return "PROVOKING...";

        if (this.elapsedTime < 120) {
            // Map 10-120 seconds (110s range) to countdown 2:00 → 0:00
            const progress = (this.elapsedTime - 10) / 110;
            const fakeTotalSeconds = Math.max(0, Math.floor(120 - progress * 120));
            
            const mins = Math.floor(fakeTotalSeconds / 60);
            const secs = fakeTotalSeconds % 60;
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        }

        // BREAK phase: Aggressive glitched timestamp
        const ms = (Date.now() % 10000).toString().padStart(4, '0');
        return `ERR::${ms}`;
    }

    isPhase(phase) {
        if (phase === 'PROVOKE') return this.elapsedTime < 10;
        if (phase === 'PLAY')    return this.elapsedTime >= 10 && this.elapsedTime < 120;
        if (phase === 'BREAK')   return this.elapsedTime >= 120 && this.elapsedTime < 150;
        if (phase === 'END')     return this.elapsedTime >= 150;
        return false;
    }
}
