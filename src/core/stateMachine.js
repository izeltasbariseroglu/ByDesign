export class StateMachine {
    constructor() {
        this.states = {
            LOCKED: "LOCKED",
            PROVOKE: "PROVOKE",
            PLAY: "PLAY",
            BREAK: "BREAK",
            END: "END"
        };
        
        // Define strict valid transitions (QA Sentinel requirement)
        this.validTransitions = {
            "LOCKED": ["PROVOKE"],
            "PROVOKE": ["PLAY"],
            "PLAY": ["BREAK"],
            "BREAK": ["END"],
            "END": [] // Terminal state
        };

        this.currentState = this.states.LOCKED;
    }
    
    changeState(newState) {
        if (!this.states[newState]) {
            console.error(`StateMachine: Invalid State requested: ${newState}`);
            return;
        }

        const allowed = this.validTransitions[this.currentState];
        if (allowed && allowed.includes(newState)) {
            console.log(`StateMachine: [${this.currentState}] -> [${newState}]`);
            this.currentState = this.states[newState];
        } else if (this.currentState === newState) {
            console.warn(`StateMachine: Ignored redundant transition to [${newState}]`);
        } else {
            console.error(`StateMachine: BLOCKED invalid transition from [${this.currentState}] to [${newState}]`);
        }
    }

    is(state) {
        return this.currentState === state;
    }
}
