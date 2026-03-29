export class StateMachine {
    constructor() {
        this.states = {
            LOCKED: "LOCKED",
            PROVOKE: "PROVOKE",
            PLAY: "PLAY",
            BREAK: "BREAK",
            END: "END"
        };
        this.currentState = this.states.LOCKED;
    }
    
    changeState(newState) {
        if (this.states[newState]) {
            console.log(`StateMachine: [${this.currentState}] -> [${newState}]`);
            this.currentState = this.states[newState];
        } else {
            console.error(`Invalid State: ${newState}`);
        }
    }

    is(state) {
        return this.currentState === state;
    }
}
