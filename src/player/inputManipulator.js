export class InputManipulator {
    constructor() {
        this.mode = 'PLAY'; // 'PLAY' or 'BREAK'
        this.keys = {
            forward: false,
            backward: false,
            left: false,
            right: false
        };

        this.inputQueue = [];
        this.delayAmount = 500; // ms for BREAK mode delay

        this.setupListeners();
    }

    setupListeners() {
        window.addEventListener('keydown', (e) => this.handleKey(e, true));
        window.addEventListener('keyup', (e) => this.handleKey(e, false));
    }

    handleKey(event, isDown) {
        const keyMap = {
            'KeyW': 'forward',
            'ArrowUp': 'forward',
            'KeyS': 'backward',
            'ArrowDown': 'backward',
            'KeyA': 'left',
            'ArrowLeft': 'left',
            'KeyD': 'right',
            'ArrowRight': 'right'
        };

        const action = keyMap[event.code];
        if (action) {
            if (this.mode === 'PLAY') {
                this.keys[action] = isDown;
            } else {
                // In BREAK mode, control is taken from the player
                // Do not update this.keys, just ignore
            }
        }
    }

    // Removed applyManipulation since we completely disable input in BREAK mode

    getInputs() {
        if (this.mode === 'BREAK') {
            return { forward: false, backward: false, left: false, right: false };
        }
        return { ...this.keys };
    }

    setMode(mode) {
        this.mode = mode;
        console.log(`Input Mode Switched to: ${this.mode}`);
    }

    toggleMode() {
        this.setMode(this.mode === 'PLAY' ? 'BREAK' : 'PLAY');
    }
}
