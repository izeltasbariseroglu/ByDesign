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
        
        // Phase 2: Candy Loop State
        this.collectedCandies = 0;
        this.totalCandies = 10;
        this.isProvoking = false;
        this.lastProvokeTime = 0;
    }

    async init() {
        console.log("ByDesign: Game Initializing...");
        
        // 1. Scene Setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB);
        this.scene.fog = new THREE.Fog(0xf0f8ff, 1, 50);   // Alice Blue Light Fog
        
        // 360 Seamless Sky Dome
        const textureLoader = new THREE.TextureLoader();
        const skyTexture = textureLoader.load('/assets/sky_texture.jpg');
        skyTexture.wrapS = THREE.MirroredRepeatWrapping;
        skyTexture.wrapT = THREE.MirroredRepeatWrapping;
        skyTexture.repeat.set(4, 2); // Repeat and mirror to hide all edge seams
        skyTexture.colorSpace = THREE.SRGBColorSpace;

        const skyGeo = new THREE.SphereGeometry(400, 64, 32);
        const skyMat = new THREE.MeshBasicMaterial({
            map: skyTexture,
            side: THREE.BackSide,
            fog: false // Sky is behind fog
        });
        const sky = new THREE.Mesh(skyGeo, skyMat);
        this.scene.add(sky);
        const sun = new THREE.DirectionalLight(0xffffff, 1.2);
        sun.position.set(50, 100, 50);
        sun.castShadow = true;
        sun.shadow.mapSize.width = 2048;
        sun.shadow.mapSize.height = 2048;
        sun.shadow.camera.left = -50;
        sun.shadow.camera.right = 50;
        sun.shadow.camera.top = 50;
        sun.shadow.camera.bottom = -50;
        this.scene.add(sun);

        const hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x3d5c1f, 0.6); // Sky to Grass bounce
        this.scene.add(hemiLight);
        
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(-22.5, 1.7, -22.5); // Grid [1,1] in 20x20 dungeon 

        this.renderer = new THREE.WebGLRenderer({
            canvas: document.getElementById('game-canvas'),
            antialias: true
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // 2. Systems Setup
        this.input = new InputManipulator();
        this.maze = new MazeGenerator(this.scene);
        this.cameraSystem = new CameraSystem(this.camera);
        this.glitchSystem = new GlitchSystem(this.renderer, this.scene, this.camera);
        this.glitchSystem.setPhase('LOCKED');
        this.audio = new AudioSystem();

        this.player = new PlayerController(this.camera, this.input, this.maze, this.audio);
        this.player.addToScene(this.scene);

        // Kick off async candy GLB preload — game remains playable while this loads
        this.maze.initCandies().then(() => {
            console.log('ByDesign: Candy GLB ready — all 9 instances spawned.');
        });

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

    // Clouds removed

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

        // 1. State Transitions — Phase 3 timeline: PROVOKE 0-10, PLAY 10-120, BREAK 120-150, END 150
        if (this.stateMachine.is("PROVOKE") && currentTotalTime >= 10) {
            console.log("ByDesign: Entering PLAY phase.");
            this.stateMachine.changeState("PLAY");
            this.glitchSystem.setPhase('PLAY');
            this.audio.setPhase('PLAY');

        } else if (this.stateMachine.is("PLAY") && currentTotalTime >= 120 && !this.exitTriggered) {
            console.log("ByDesign: 120s — Entering BREAK phase.");
            this.exitTriggered = true;
            this.stateMachine.changeState("BREAK");
            this.input.setMode("BREAK");
            this.cameraSystem.startTopDownTransition(this.player.position);
            this.glitchSystem.setPhase('BREAK');
            this.audio.setPhase('BREAK');

            // Reveal the character model and center the timer
            this.player.revealCharacter();
            this.hud.activateBreakTimer();

        } else if (this.stateMachine.is("BREAK") && currentTotalTime >= 150 && !this.endTriggered) {
            console.log("ByDesign: 150s — Triggering COLLAPSE + KNEEL + END.");
            this.endTriggered = true;

            // 1. 3D reality tears — Chromatic Aberration burst + GlitchPass explosion
            this.glitchSystem.triggerCollapse();

            // 2. Character kneels
            this.player.triggerKneel();

            // 3. Final photo + END state + locked screen (after 1.5s so kneel plays first)
            setTimeout(() => {
                this.capture.takeFinalPhoto();
                this.stateMachine.changeState("END");
                this.glitchSystem.setPhase('END');
                this.audio.setPhase('END');
                this.endScreen.show(this.capture.initialPhoto, this.capture.finalPhoto);
            }, 1500);
        }

        // 2. Subsystem Updates
        const isPOV = this.stateMachine.is("PLAY") || this.stateMachine.is("PROVOKE");
        this.player.update(delta, isPOV);
        // this.maze.updateTorches removed as per Phase 1 cleanup
        
        if (this.stateMachine.is("BREAK") || this.stateMachine.is("END")) {
            this.cameraSystem.update(delta, this.player.position);
            this.player.updateCharacterPosition();
        }

        // Phase 2: Candy Collection Logic
        this.checkCandyCollection();
        this.maze.update(currentTotalTime);

        // Exit Trigger Check removed as per Phase 1 cleanup
        // (Logic will be replaced by Candy Loop in Phase 2)

        this.hud.update(this.stateMachine.currentState, timeString, this.player.position, this.maze.getMazeInfo(), this.collectedCandies);
        
        if (this.isProvoking) {
            this.updateProvokeEngine(currentTotalTime);
        }
    }

    checkCandyCollection() {
        const candies = this.maze.candies;
        const playerPos = this.player.position;

        for (let i = candies.length - 1; i >= 0; i--) {
            const candy = candies[i];
            const mesh = candy.getMesh();
            
            // If candy is already collected (removed from scene), skip
            if (!mesh.parent) continue;

            // Use world-space position for GLB clones (Group origin may differ)
            const candyWorldPos = candy.getWorldPosition
                ? candy.getWorldPosition()
                : mesh.getWorldPosition(new THREE.Vector3());

            const dist = playerPos.distanceTo(candyWorldPos);
            
            if (dist < 1.5) {
                // Collect Candy
                this.scene.remove(mesh);
                this.collectedCandies++;
                this.player.triggerCollectionEffect();
                this.audio.triggerFootstep(); // Reusing footstep sound as collection feedback for now
                console.log(`ByDesign: Candy collected! ${this.collectedCandies}/10`);

                if (this.collectedCandies === 9) {
                    this.startProvokeEngine();
                }
            }
        }
    }

    startProvokeEngine() {
        this.isProvoking = true;
        console.warn("ByDesign: Provoke Engine Initiated. The hunt for the 10th candy begins...");
    }

    updateProvokeEngine(time) {
        // Change provoke message every 5 seconds
        if (time - this.lastProvokeTime > 5) {
            this.lastProvokeTime = time;
            const messages = [
                "SO CLOSE! JUST ONE MORE...",
                "IT'S RIGHT AROUND THE CORNER!",
                "YOU'RE DOING GREAT! DON'T STOP NOW.",
                "WHERE COULD THE LAST ONE BE?",
                "I CAN ALMOST SENSE IT...",
                "LOOK BEHIND YOU.",
                "IS THAT IT OVER THERE?"
            ];
            const msg = messages[Math.floor(Math.random() * messages.length)];
            this.hud.showProvokeMessage(msg);
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

