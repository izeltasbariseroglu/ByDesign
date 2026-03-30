import * as THREE from 'three';
import { StateMachine } from './stateMachine.js';
import { PlayerController } from '../player/playerController.js';
import { InputManipulator } from '../player/inputManipulator.js';
import { Timer } from '../systems/timer.js';
import { CameraSystem } from '../systems/camera.js';
import { CaptureSystem } from '../systems/capture.js';
import { MazeGenerator } from '../maze/mazeGenerator.js';
import { HUD } from '../ui/hud.js';

export class Game {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        
        // Use a dedicated clock that we control — NOT Three.Clock
        // to avoid the delta-jump bug during permission wait
        this.lastFrameTime = null;

        // Subsystems (initialized in init)
        this.stateMachine = new StateMachine();
        this.player = null;
        this.input = null;
        this.maze = null;
        this.timer = new Timer();
        this.cameraSystem = null;
        this.capture = new CaptureSystem();
        this.hud = new HUD();
        
        this.isInitialized = false;
        this.hasStarted = false;
    }

    async init() {
        console.log("ByDesign: Game Initializing...");
        
        // 1. Scene Setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);
        this.scene.fog = new THREE.Fog(0x000000, 3, 30); // Tighter fog for bigger, darker dungeon
        
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(-22.5, 1.7, -22.5); // Grid [1,1] in 20x20 dungeon 

        this.renderer = new THREE.WebGLRenderer({
            canvas: document.getElementById('game-canvas'),
            antialias: true
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);

        // 2. Systems Setup
        this.input = new InputManipulator();
        this.maze = new MazeGenerator(this.scene);
        this.player = new PlayerController(this.camera, this.input, this.maze);
        this.player.addToScene(this.scene);
        this.cameraSystem = new CameraSystem(this.camera);

        // 3. Wait for camera permission (click to start)
        this.hud.update("LOCKED", "", this.player.position, this.maze.getMazeInfo());
        
        const setupStart = async () => {
            console.log("ByDesign: Requesting camera...");
            const hasCamera = await this.capture.requestCameraPermission();
            if (hasCamera) {
                this.startGameTimeline();
                document.removeEventListener('click', setupStart);
            } else {
                alert("CAMERA ACCESS IS MANDATORY FOR THIS EXPERIENCE.");
            }
        };

        document.addEventListener('click', setupStart);
        this.isInitialized = true;
    }

    startGameTimeline() {
        this.hasStarted = true;
        // KEY FIX: Record the exact timestamp when the game starts.
        // getDelta() will compute clean deltas from THIS point forward.
        this.lastFrameTime = performance.now();
        this.stateMachine.changeState("PROVOKE");
        this.capture.takeInitialPhoto();
        this.player.enablePointerLock(); // Enable AFTER camera permission - no click conflict
        console.log("ByDesign: Timeline started cleanly at t=0.");
    }

    update() {
        if (!this.isInitialized || !this.hasStarted) return;

        // KEY FIX: Compute delta manually using performance.now().
        // This guarantees the first frame after start has a normal ~16ms delta,
        // not the accumulated waiting time.
        const now = performance.now();
        const delta = Math.min((now - this.lastFrameTime) / 1000, 0.1); // cap at 100ms
        this.lastFrameTime = now;

        const currentTotalTime = this.timer.update(delta);
        const timeString = this.timer.getFormattedTime();

        // 1. State Transitions 
        if (this.stateMachine.is("PROVOKE") && currentTotalTime >= 10) {
            console.log("ByDesign: Entering PLAY phase.");
            this.stateMachine.changeState("PLAY");
        } else if (this.stateMachine.is("PLAY") && currentTotalTime >= 70) {
            console.log("ByDesign: Entering BREAK phase.");
            this.stateMachine.changeState("BREAK");
            this.input.setMode("BREAK");
            this.cameraSystem.startTopDownTransition(this.player.position);
        } else if (this.stateMachine.is("BREAK") && currentTotalTime >= 90) {
            this.stateMachine.changeState("END");
        }

        // 2. Subsystem Updates
        const isPOV = this.stateMachine.is("PLAY") || this.stateMachine.is("PROVOKE");
        this.player.update(delta, isPOV);
        this.maze.updateTorches(currentTotalTime);
        
        if (this.stateMachine.is("BREAK")) {
            this.cameraSystem.update(delta, this.player.position); 
        }

        // 3. UI Sync
        if (this.stateMachine.is("PLAY") || this.stateMachine.is("BREAK")) {
            this.maze.checkTriggers && this.maze.checkTriggers(this.player); 
        }

        this.hud.update(this.stateMachine.currentState, timeString, this.player.position, this.maze.getMazeInfo());
        
        if (this.stateMachine.is("PROVOKE")) {
            const idx = Math.floor(currentTotalTime / 2.5);
            this.hud.setProvokeText(idx);
        }
    }

    render() {
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    onWindowResize() {
        if (!this.camera) return;
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}
