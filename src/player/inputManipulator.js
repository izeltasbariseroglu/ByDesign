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
                // In BREAK mode, we manipulate the input before it reaches this.keys
                this.applyManipulation(action, isDown);
            }
        }
    }

    applyManipulation(action, isDown) {
        const rand = Math.random();

        // 1. Ignore / Drop (30%)
        if (rand < 0.3) {
            console.log(`Manipulation: DROP ${action}`);
            return;
        }

        // Use a local variable — never mutate the function parameter (strict-mode safe)
        let mappedAction = action;

        // 2. Invert (10%)
        if (rand < 0.4) {
            const invertedMap = {
                'forward':  'backward',
                'backward': 'forward',
                'left':     'right',
                'right':    'left'
            };
            mappedAction = invertedMap[action];
            console.log(`Manipulation: INVERT -> ${mappedAction}`);
            this.keys[mappedAction] = isDown;
            return; // Invert is its own branch — don't fall through
        }

        // 3. Delay (10%)
        if (rand < 0.5) {
            console.log(`Manipulation: DELAY ${mappedAction}`);
            setTimeout(() => {
                this.keys[mappedAction] = isDown;
            }, this.delayAmount);
            return;
        }

        // Default: apply directly
        this.keys[mappedAction] = isDown;
    }

    getInputs() {
        let finalInputs = { ...this.keys };

        // 4. Jitter (Dynamic during update)
        if (this.mode === 'BREAK' && Math.random() < 0.1) {
            const jitterDir = Math.random() < 0.5 ? 'left' : 'right';
            finalInputs[jitterDir] = true;
            // No console log here to not spam, it's a 'glitchy' feel
        }

        return finalInputs;
    }

    setMode(mode) {
        this.mode = mode;
        console.log(`Input Mode Switched to: ${this.mode}`);
    }

    toggleMode() {
        this.setMode(this.mode === 'PLAY' ? 'BREAK' : 'PLAY');
    }
}
