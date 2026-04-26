export class Timer {
    constructor() {
        this.elapsedTime = 0;
        this.totalDuration = 150; // 150 seconds total (Faz 3: 2:30)
        this.isGlitched = false;
        
        console.log("Timer system initialized (150s timeline)");
    }

    update(delta) {
        if (this.elapsedTime >= 120) {
            this.isGlitched = true;
            delta *= 3; // 3x speedup for the last 30 seconds
        }

        if (this.elapsedTime < this.totalDuration) {
            this.elapsedTime += delta;
        }

        return this.elapsedTime;
    }

    getFormattedTime() {
        // 0-10:   PROVOKE phase
        // 10-120: PLAY phase   → countdown 2:20 → 0:30
        // 120+:   BREAK phase  → countdown 0:30 → 0:00 (sped up 3x internally)
        
        if (this.elapsedTime < 10) return "PROVOKING...";

        if (this.elapsedTime < 150) {
            const remaining = Math.max(0, Math.floor(150 - this.elapsedTime));
            const mins = Math.floor(remaining / 60);
            const secs = remaining % 60;
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        }

        return "0:00";
    }

    isPhase(phase) {
        if (phase === 'PROVOKE') return this.elapsedTime < 10;
        if (phase === 'PLAY')    return this.elapsedTime >= 10 && this.elapsedTime < 120;
        if (phase === 'BREAK')   return this.elapsedTime >= 120 && this.elapsedTime < 150;
        if (phase === 'END')     return this.elapsedTime >= 150;
        return false;
    }
}
