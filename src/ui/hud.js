export class HUD {
    constructor() {
        this.container = document.getElementById('hud-container');
        
        // Status Top-Right
        this.modeLabel = document.createElement('div');
        this.modeLabel.setAttribute('id', 'mode-label');
        this.modeLabel.style.position = 'fixed';
        this.modeLabel.style.top = '20px';
        this.modeLabel.style.right = '20px';
        this.modeLabel.style.padding = '10px 20px';
        this.modeLabel.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        this.modeLabel.style.border = '1px solid #fff';
        this.modeLabel.style.zIndex = '100';
        this.container.appendChild(this.modeLabel);
        
        // Candy Counter (Top-Right, below Mode)
        this.candyLabel = document.createElement('div');
        this.candyLabel.id = 'candy-label';
        this.candyLabel.style.position = 'fixed';
        this.candyLabel.style.top = '70px';
        this.candyLabel.style.right = '20px';
        this.candyLabel.style.fontSize = '24px';
        this.candyLabel.style.fontFamily = 'monospace';
        this.candyLabel.style.color = '#ff69b4'; // Pink
        this.candyLabel.style.textShadow = '0 0 10px rgba(255,105,180,0.5)';
        this.candyLabel.innerHTML = 'CANDIES: 0/10';
        this.container.appendChild(this.candyLabel);

        // Timer Top-Left
        this.timerLabel = document.createElement('div');
        this.timerLabel.id = 'hud-timer';
        this.timerLabel.style.position = 'fixed';
        this.timerLabel.style.top = '20px';
        this.timerLabel.style.left = '20px';
        this.timerLabel.style.fontSize = '28px';
        this.timerLabel.style.fontFamily = 'monospace';
        this.timerLabel.style.color = '#ffffff';
        this.timerLabel.style.textShadow = '0 0 10px rgba(255,255,255,0.5)';
        this.timerLabel.style.opacity = '1';
        this.timerLabel.style.transition = 'all 1s cubic-bezier(0.16,1,0.3,1)';
        this.container.appendChild(this.timerLabel);

        // Provoke / Main Message Center
        this.messageCenter = document.createElement('div');
        this.messageCenter.style.position = 'fixed';
        this.messageCenter.style.top = '50%';
        this.messageCenter.style.left = '50%';
        this.messageCenter.style.transform = 'translate(-50%, -50%)';
        this.messageCenter.style.fontSize = '2rem';
        this.messageCenter.style.textAlign = 'center';
        this.messageCenter.style.width = '80%';
        this.container.appendChild(this.messageCenter);

        // Instructions
        this.instructions = document.createElement('div');
        this.instructions.style.position = 'fixed';
        this.instructions.style.bottom = '20px';
        this.instructions.style.left = '50%';
        this.instructions.style.transform = 'translateX(-50%)';
        this.instructions.style.opacity = '0.4';
        this.container.appendChild(this.instructions);

        this.ctx = null;
    }

    update(state, timeString, playerPosition, mazeInfo, candyCount = 0) {
        if (this.lastState !== state) {
            console.log(`HUD: State changed to [${state}]`);
            this.lastState = state;
        }
        this.timerLabel.innerHTML = timeString || '';
        this.candyLabel.innerHTML = `CANDIES: ${candyCount}/10`;
        
        if (state === 'LOCKED') {
            this.messageCenter.innerHTML = "<span class='glitch'>CAMERA PERMISSION REQUIRED</span>";
            this.modeLabel.innerHTML = "STATUS: UNAUTHORIZED";
            this.instructions.innerHTML = "CLICK ANYWHERE TO REQUEST ACCESS";
        } else if (state === 'PROVOKE') {
            this.messageCenter.innerHTML = "WELCOME TO THE GARDEN";
            this.modeLabel.innerHTML = "STATUS: INITIALIZING";
            this.instructions.innerHTML = "CLICK TO LOCK CAMERA | WASD TO MOVE";
            this.timerLabel.style.opacity = '1';
        } else if (state === 'PLAY') {
            this.messageCenter.innerHTML = "";
            this.modeLabel.innerHTML = "STATUS: STABLE";
            this.modeLabel.style.color = "#fff";
            this.modeLabel.style.borderColor = "#fff";
            this.timerLabel.style.opacity = '1';
            this.instructions.innerHTML = "WASD TO MOVE | CLICK TO LOCK";
        } else if (state === 'BREAK') {
            this.messageCenter.innerHTML = "";
            this.modeLabel.innerHTML = "STATUS: FRAGMENTED";
            this.modeLabel.style.color = "#ff4444";
            this.modeLabel.style.borderColor = "#ff4444";
            this.modeLabel.classList.add('glitch');
            this.timerLabel.classList.add('glitch');
            this.instructions.innerHTML = "SYSTEM OVERRIDE DETECTED";
        } else if (state === 'END') {
            this.messageCenter.innerHTML = "<span class='glitch'>YOUR ESCAPE WAS AN ILLUSION.</span><br><br><span style='font-size: 1rem;'>SESSION TERMINATED</span>";
            this.modeLabel.innerHTML = "STATUS: TERMINATED";
            this.modeLabel.style.borderColor = "red";
            this.modeLabel.style.color = "red";
            this.timerLabel.style.opacity = '0';
            this.instructions.innerHTML = "CLICK TO DISCONNECT";
        }

        // Minimap draw logic removed as per Phase 1 cleanup
    }

    /** Called at BREAK start (120s): slams the timer to center, makes it red + aggressive */
    activateBreakTimer() {
        const t = this.timerLabel;
        t.style.top = '50%';
        t.style.left = '50%';
        t.style.transform = 'translate(-50%, -50%)';
        t.style.fontSize = '6rem';
        t.style.fontWeight = 'bold';
        t.style.color = '#ff0000';
        t.style.textShadow = '0 0 30px #ff0000, 0 0 60px #880000';
        t.style.animation = 'break-pulse 0.4s infinite alternate';
        t.style.letterSpacing = '8px';
        t.style.zIndex = '500';
        console.log('HUD: Break timer activated — centered and red');
    }

    showProvokeMessage(text, audio = null) {
        this.messageCenter.innerHTML = `<span class='glitch' style='color: #ff69b4; text-shadow: 0 0 15px pink;'>${text}</span>`;
        
        // Narrative Pacing: Trigger a subtle glitch sound to alert the player
        if (audio) {
            audio.triggerProvokeSound();
        }
        
        // Remove message after 3 seconds
        setTimeout(() => {
            if (this.messageCenter.innerHTML.includes(text)) {
                this.messageCenter.innerHTML = "";
            }
        }, 3000);
    }
}
