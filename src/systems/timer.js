export class Timer {
    constructor() {
        this.elapsedTime = 0;
        this.totalDuration = 90; // 90 seconds total
        this.isGlitched = false;
        
        console.log("Timer system initialized");
    }

    update(delta) {
        if (this.elapsedTime < this.totalDuration) {
            this.elapsedTime += delta;
        }

        if (this.elapsedTime >= 70) {
            this.isGlitched = true;
        }

        return this.elapsedTime;
    }

    getFormattedTime() {
        // 0-10: PROVOKE (Maybe no timer shown)
        // 10-70: PLAY (60s actual, say 2:00 -> 0:00)
        // 70-90: BREAK (Glitched)
        
        if (this.elapsedTime < 10) return "PROVOKING...";

        if (this.elapsedTime < 70) {
            // Map 10-70 seconds (range of 60) to 120s down to 0s
            const progress = (this.elapsedTime - 10) / 60;
            const fakeTotalSeconds = Math.max(0, 120 - progress * 120);
            
            const mins = Math.floor(fakeTotalSeconds / 60);
            const secs = Math.floor(fakeTotalSeconds % 60);
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        }

        // BREAK phase: Glitched speed (flickering or very fast)
        const glitchTime = (Date.now() % 1000).toString().padStart(3, '0');
        return `ERR:00:${glitchTime}`;
    }

    isPhase(phase) {
        if (phase === 'PROVOKE') return this.elapsedTime < 10;
        if (phase === 'PLAY') return this.elapsedTime >= 10 && this.elapsedTime < 70;
        if (phase === 'BREAK') return this.elapsedTime >= 70;
        return false;
    }
}
