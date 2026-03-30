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

        // Timer Top-Left
        this.timerLabel = document.createElement('div');
        this.timerLabel.style.position = 'fixed';
        this.timerLabel.style.top = '20px';
        this.timerLabel.style.left = '20px';
        this.timerLabel.style.fontSize = '28px';
        this.timerLabel.style.fontFamily = 'monospace';
        this.timerLabel.style.color = '#ffffff';
        this.timerLabel.style.textShadow = '0 0 10px rgba(255,255,255,0.5)';
        this.timerLabel.style.opacity = '1';
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

        // Minimap container
        this.minimapContainer = document.createElement('div');
        this.minimapContainer.id = 'minimap-container';
        this.minimapContainer.style.cssText = 'position: absolute; bottom: 40px; right: 40px; width: 200px; height: 200px; border: 2px solid #fff; background: rgba(0,0,0,0.7); box-shadow: 0 0 20px rgba(0,0,255,0.2);';
        
        this.minimapCanvas = document.createElement('canvas');
        this.minimapCanvas.width = 200;
        this.minimapCanvas.height = 200;
        this.minimapContainer.appendChild(this.minimapCanvas);
        this.container.appendChild(this.minimapContainer);

        this.ctx = this.minimapCanvas.getContext('2d');
        
        this.provokeTexts = [
            "DO YOU REALLY THINK YOU CAN WIN?",
            "YOUR CONTROL IS AN ILLUSION.",
            "JUST ANOTHER PLAYER IN A RIGGED GAME.",
            "PROCEED. IT WON'T MATTER."
        ];
        this.currentProvokeText = this.provokeTexts[0];
    }

    update(state, timeString, playerPosition, mazeInfo) {
        if (this.lastState !== state) {
            console.log(`HUD: State changed to [${state}]`);
            this.lastState = state;
        }
        this.timerLabel.innerHTML = timeString || '';
        
        if (state === 'LOCKED') {
            this.messageCenter.innerHTML = "<span class='glitch'>CAMERA PERMISSION REQUIRED</span>";
            this.modeLabel.innerHTML = "STATUS: UNAUTHORIZED";
            this.instructions.innerHTML = "CLICK ANYWHERE TO REQUEST ACCESS";
        } else if (state === 'PROVOKE') {
            this.messageCenter.innerHTML = this.currentProvokeText;
            this.modeLabel.innerHTML = "STATUS: INITIALIZING";
            this.instructions.innerHTML = "WASD TO MOVE";
            this.timerLabel.style.opacity = '1'; // timer always visible
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

        // Draw Minimap
        if (mazeInfo && playerPosition) {
            this.drawMinimap(playerPosition, mazeInfo);
        }
    }

    drawMinimap(playerPos, mazeInfo) {
        const { data, gridSize, cellSize } = mazeInfo;
        const canvasSize = 200;
        const squareSize = canvasSize / gridSize;

        this.ctx.clearRect(0, 0, canvasSize, canvasSize);

        // Draw Walls
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        for (let r = 0; r < gridSize; r++) {
            for (let c = 0; c < gridSize; c++) {
                if (data[r] && data[r][c] === 1) {
                    this.ctx.fillRect(c * squareSize, r * squareSize, squareSize, squareSize);
                }
            }
        }

        // Draw Exit marker at grid [17, 17] - bottom-right open cell in 20x20 dungeon
        const exitCol = 17;
        const exitRow = 17;
        this.ctx.save();
        this.ctx.fillStyle = '#00ff88';
        this.ctx.shadowBlur = 12;
        this.ctx.shadowColor = '#00ff88';
        this.ctx.font = `bold ${Math.floor(squareSize * 0.9)}px monospace`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('X', (exitCol + 0.5) * squareSize, (exitRow + 0.5) * squareSize);
        this.ctx.restore();

        // Draw Player (Logical conversion from 3D coords to Minimap grid)
        // Note: x = (col - gridSize/2) * cellSize => col = x / cellSize + gridSize/2
        const playerCol = playerPos.x / cellSize + gridSize / 2;
        const playerRow = playerPos.z / cellSize + gridSize / 2;

        this.ctx.save();
        this.ctx.fillStyle = '#ff3333';
        this.ctx.shadowBlur = 14;
        this.ctx.shadowColor = 'red';
        this.ctx.beginPath();
        this.ctx.arc(playerCol * squareSize, playerRow * squareSize, 5, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.restore();
    }

    setProvokeText(index) {
        this.currentProvokeText = this.provokeTexts[index % this.provokeTexts.length];
    }
}
