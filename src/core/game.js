import * as THREE from 'three';
import { StateMachine } from './stateMachine.js';
import { PlayerController } from '../player/playerController.js';
import { InputManipulator } from '../player/inputManipulator.js';
import { Timer } from '../systems/timer.js';
import { CameraSystem } from '../systems/camera.js';
import { CaptureSystem } from '../systems/capture.js';
import { GlitchSystem } from '../systems/glitch.js';
import { AudioSystem } from '../systems/audio.js';
import { MazeGenerator } from '../maze/mazeGenerator.js';
import { HUD } from '../ui/hud.js';
import { EndScreen } from '../ui/endScreen.js';

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
        this.glitchSystem = null; // Initialized after renderer is ready
        this.audio = null;        // Initialized after renderer is ready
        this.hud = new HUD();
        this.endScreen = new EndScreen();
        
        this.isInitialized = false;
        this.hasStarted = false;

        // FIX: Guard flags to prevent double-trigger of state transitions
        this.exitTriggered = false; // EXIT_REACHED can only fire once
        this.endTriggered = false;  // END state / endScreen.show() can only fire once
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
        this.cameraSystem = new CameraSystem(this.camera);
        this.glitchSystem = new GlitchSystem(this.renderer, this.scene, this.camera);
        this.glitchSystem.setPhase('LOCKED');
        this.audio = new AudioSystem();

        this.player = new PlayerController(this.camera, this.input, this.maze, this.audio);
        this.player.addToScene(this.scene);

        // 3. Wait for camera permission (click to start)
        this.hud.update("LOCKED", "", this.player.position, this.maze.getMazeInfo());
        
        const setupStart = async () => {
            console.log("ByDesign: Requesting camera...");
            const hasCamera = await this.capture.requestCameraPermission();
            if (hasCamera) {
                this.startGameTimeline();
                document.removeEventListener('click', setupStart);
            } else {
                // FIX: Replace blocking alert() with themed DOM overlay
                document.removeEventListener('click', setupStart);
                this._showCameradeniedOverlay();
            }
        };

        document.addEventListener('click', setupStart);
        this.isInitialized = true;
    }

    startGameTimeline() {
        this.hasStarted = true;
        this.lastFrameTime = performance.now();
        this.stateMachine.changeState("PROVOKE");
        this.glitchSystem.setPhase('PROVOKE');
        this.audio.resume();
        this.audio.setPhase('PROVOKE');
        this.capture.takeInitialPhoto();
        this.player.enablePointerLock();
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
            this.glitchSystem.setPhase('PLAY');
            this.audio.setPhase('PLAY');
        } else if (this.stateMachine.is("PLAY") && currentTotalTime >= 70 && !this.exitTriggered) {
            console.log("ByDesign: Entering BREAK phase (timer).");
            this.stateMachine.changeState("BREAK");
            this.input.setMode("BREAK");
            this.cameraSystem.startTopDownTransition(this.player.position);
            this.glitchSystem.setPhase('BREAK');
            this.audio.setPhase('BREAK');
        } else if (this.stateMachine.is("BREAK") && currentTotalTime >= 90 && !this.endTriggered) {
            this.endTriggered = true;
            this.capture.takeFinalPhoto();
            this.stateMachine.changeState("END");
            this.glitchSystem.setPhase('END');
            this.audio.setPhase('END');
            this.endScreen.show(this.capture.initialPhoto, this.capture.finalPhoto);
        }

        // 2. Subsystem Updates
        const isPOV = this.stateMachine.is("PLAY") || this.stateMachine.is("PROVOKE");
        this.player.update(delta, isPOV);
        this.maze.updateTorches(currentTotalTime, this.player.position);
        
        if (this.stateMachine.is("BREAK")) {
            this.cameraSystem.update(delta, this.player.position); 
        }

        // 3. Exit Trigger Check
        // FIX: exitTriggered guard ensures EXIT_REACHED fires at most once
        if (!this.exitTriggered && (this.stateMachine.is("PLAY") || this.stateMachine.is("BREAK"))) {
            if (this.maze.checkTriggers(this.player) === "EXIT_REACHED") {
                if (this.stateMachine.is("PLAY")) {
                    this.exitTriggered = true;
                    console.log("ByDesign: EXIT reached during PLAY — entering BREAK.");
                    this.stateMachine.changeState("BREAK");
                    this.input.setMode("BREAK");
                    this.cameraSystem.startTopDownTransition(this.player.position);
                    this.glitchSystem.setPhase('BREAK');
                } else if (this.stateMachine.is("BREAK") && !this.endTriggered) {
                    this.exitTriggered = true;
                    this.endTriggered = true;
                    console.log("ByDesign: EXIT reached during BREAK — triggering END.");
                    this.capture.takeFinalPhoto();
                    this.stateMachine.changeState("END");
                    this.glitchSystem.setPhase('END');
                    this.endScreen.show(this.capture.initialPhoto, this.capture.finalPhoto);
                }
            }
        }

        this.hud.update(this.stateMachine.currentState, timeString, this.player.position, this.maze.getMazeInfo());
        
        if (this.stateMachine.is("PROVOKE")) {
            const idx = Math.floor(currentTotalTime / 2.5);
            this.hud.setProvokeText(idx);
        }
    }

    render() {
        if (this.glitchSystem) {
            // Route all rendering through the EffectComposer pipeline
            this.glitchSystem.render();
        } else if (this.renderer && this.scene && this.camera) {
            // Fallback: direct render if GlitchSystem isn't ready yet
            this.renderer.render(this.scene, this.camera);
        }
    }

    onWindowResize() {
        if (!this.camera) return;
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        if (this.glitchSystem) {
            this.glitchSystem.onResize(window.innerWidth, window.innerHeight);
        }
    }

    // FIX: Replaces alert() — shows a themed, non-blocking camera denied screen
    _showCameraDeniedOverlay() {
        const overlay = document.createElement('div');
        overlay.id = 'camera-denied-overlay';
        overlay.innerHTML = `
            <div class="denied-icon">[ ACCESS DENIED ]</div>
            <div class="denied-title">Surveillance Refused</div>
            <div class="denied-body">
                This experience requires access to your camera.<br><br>
                <span>You cannot participate without being seen.</span><br><br>
                Enable camera permissions in your browser and reload.
            </div>
            <div class="denied-hint">RELOAD PAGE TO TRY AGAIN &nbsp;|&nbsp; ESC → SETTINGS → SITE PERMISSIONS → CAMERA</div>
        `;
        document.body.appendChild(overlay);
        console.warn("ByDesign: Camera denied — overlay shown, experience halted.");
    }
}

