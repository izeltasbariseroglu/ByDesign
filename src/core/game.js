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

// ═══════════════════════════════════════════════════════════════════════════
//  QA / DEBUG MODE
//  Set to FALSE and remove this block before freezing for exhibition.
//
//  Hotkeys (only active when game has started):
//    1  → Jump to t = 115 s  (5 s before BREAK — tests camera, character, input manipulation)
//    2  → Jump to t = 145 s  (5 s before END   — tests kneel, glitch, dual-photo end screen)
//    3  → Force 9 candies collected + clear scene  (tests Provoke Engine messages)
//    ~  → Toggle debug overlay panel
// ═══════════════════════════════════════════════════════════════════════════
export const QA_MODE_ENABLED = true;

// Viewmodel arms render on this dedicated layer so they are drawn AFTER
// clearDepth() — they will never clip into walls regardless of geometry.
export const VIEWMODEL_LAYER = 2;

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
        
        // 360 Seamless Sky Dome — built inside onLoad so texture.image is never null
        const textureLoader = new THREE.TextureLoader();
        textureLoader.load('/assets/sky_texture.jpg', (skyTexture) => {
            skyTexture.wrapS = THREE.MirroredRepeatWrapping;
            skyTexture.wrapT = THREE.MirroredRepeatWrapping;
            skyTexture.repeat.set(4, 2);
            skyTexture.colorSpace = THREE.SRGBColorSpace;

            const skyGeo = new THREE.SphereGeometry(400, 64, 32);
            const skyMat = new THREE.MeshBasicMaterial({
                map: skyTexture,
                side: THREE.BackSide,
                fog: false,
            });
            const sky = new THREE.Mesh(skyGeo, skyMat);
            this.scene.add(sky);
        }, undefined, () => {
            console.warn('game.js: sky texture not found — falling back to scene.background colour.');
        });
        const sun = new THREE.DirectionalLight(0xffffff, 1.2);
        sun.position.set(50, 100, 50);
        sun.castShadow = true;
        sun.shadow.mapSize.width  = 1024; // Reduced from 2048 — safe for exhibit hardware
        sun.shadow.mapSize.height = 1024;
        sun.shadow.camera.left = -50;
        sun.shadow.camera.right = 50;
        sun.shadow.camera.top = 50;
        sun.shadow.camera.bottom = -50;
        this.scene.add(sun);

        const hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x3d5c1f, 0.6); // Sky to Grass bounce
        this.scene.add(hemiLight);
        
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(-22.5, 1.7, -22.5); // Grid [1,1] in 20x20 dungeon
        // CRITICAL: camera must be in the scene graph for camera.add() children
        // (the POV arms) to be rendered. Without this line, arm meshes are
        // silently ignored by Three.js's render traversal every single frame.
        this.scene.add(this.camera);

        this.renderer = new THREE.WebGLRenderer({
            canvas: document.getElementById('game-canvas'),
            antialias: true
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFShadowMap;

        // 2. Systems Setup
        this.input = new InputManipulator();
        
        // ── Phase 2: Centralized Loading ────────────────────────────────────────
        this.loadingManager = new THREE.LoadingManager();
        this.loadingManager.onLoad = () => {
            console.log('ByDesign: All assets loaded via LoadingManager.');
            this._hideLoadingOverlay();
        };
        this.loadingManager.onError = (url) => {
            console.error('ByDesign: Loading error on —', url);
        };

        this.maze = new MazeGenerator(this.scene, this.loadingManager, this.audio);
        this.cameraSystem = new CameraSystem(this.camera);
        this.glitchSystem = new GlitchSystem(this.renderer, this.scene, this.camera);
        this.glitchSystem.setPhase('LOCKED');
        this.audio = new AudioSystem();

        this.player = new PlayerController(this.camera, this.input, this.maze, this.audio, this.loadingManager);
        this.player.addToScene(this.scene);

        // ── Loading Sequence ──────────────────────────────────────────────────
        this._assetsReady = false;
        this._showLoadingOverlay();
        
        this.maze.initCandies().then(() => {
            console.log('ByDesign: Candy system initialized.');
        });

        // 3. Wait for camera permission (click to start)
        this.hud.update("LOCKED", "", this.player.position, this.maze.getMazeInfo());
        
        this._cameraRequestPending = false; // Guard against double-click race condition

        const setupStart = async () => {
            // Block start until both GLBs are fully loaded
            if (!this._assetsReady) {
                console.log('ByDesign: Click received but assets not ready yet — ignoring.');
                return;
            }
            // Prevent concurrent camera requests from double-clicks
            if (this._cameraRequestPending) {
                console.log('ByDesign: Camera request already in flight — ignoring duplicate click.');
                return;
            }
            this._cameraRequestPending = true;

            try {
                console.log('ByDesign: Requesting camera...');
                const hasCamera = await this.capture.requestCameraPermission();
                document.removeEventListener('click', setupStart);
                if (hasCamera) {
                    this.startGameTimeline();
                } else {
                    this._showCameraDeniedOverlay();
                }
            } catch (err) {
                console.error('ByDesign: Unexpected error during camera setup —', err);
                document.removeEventListener('click', setupStart);
                this._showCameraDeniedOverlay();
            } finally {
                this._cameraRequestPending = false;
            }
        };

        document.addEventListener('click', setupStart);

        // QA hotkeys registered once at init time
        this._setupQAHotkeys();

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

        // Phase 2: Spatial Audio Listener Update
        if (this.audio) {
            try {
                this.audio.updateListener(this.camera);
            } catch (e) {
                console.warn("Audio listener update failed:", e);
            }
        }

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

            // --- UI/UX Auditor Requirement: Shatter the garden facade ---
            this.scene.background = new THREE.Color(0x000000); // True black
            this.scene.fog.color.setHex(0x550000);             // Deep red fog
            // ------------------------------------------------------------

            // Reveal the character model and center the timer
            this.player.revealCharacter();
            this.hud.activateBreakTimer();

        } else if (this.stateMachine.is("BREAK") && currentTotalTime >= 150 && !this.endTriggered) {
            console.log("ByDesign: 150s — Triggering COLLAPSE + KNEEL + END.");
            this.endTriggered = true;

            // 1. 3D reality tears — Chromatic Aberration burst + GlitchPass explosion
            this.glitchSystem.triggerCollapse();

            // 2. Audio collapse burst — digital screech / white-noise explosion
            this.audio.triggerCollapse();

            // 3. Character kneels
            this.player.triggerKneel();

            // 4. Final photo + END state + locked screen (after 1.5s so kneel plays first)
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
            
            if (dist < 1.5 && !candy.isBeingCollected) {
                candy.isBeingCollected = true; // Prevent multiple triggers while grabbing
                
                // 1. Immediately trigger the visual POV arm reach animation
                // Key Fix: We pass the exact Target Vector in 3D world space!
                this.player.triggerCollectionEffect(candyWorldPos);

                // 2. Delay the actual "collection" (mesh removal, sound, logic) by 250ms 
                //    so it synchronizes perfectly with the hand reaching its target!
                setTimeout(() => {
                    // Stop spatial audio panner
                    this.audio.stopCandyPanner(candy.id);

                    this.disposeHierarchy(mesh);
                    this.scene.remove(mesh);
                    
                    // Safely remove from array
                    const cIdx = candies.indexOf(candy);
                    if (cIdx > -1) candies.splice(cIdx, 1);

                    this.collectedCandies++;
                    this.audio.triggerCandyPickup(); // "ding" sound on grab point
                    console.log(`ByDesign: Candy collected! ${this.collectedCandies}/10`);

                    if (this.collectedCandies === 9) {
                        this.startProvokeEngine();
                    }
                }, 250);
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
            this.hud.showProvokeMessage(msg, this.audio);
        }
    }


    render() {
        if (!this.renderer || !this.scene || !this.camera) return;

        if (this.glitchSystem) {
            try {
                this.glitchSystem.render();
            } catch (e) {
                if (!this._glitchFallbackLogged) {
                    console.warn('GlitchSystem render failed — falling back:', e);
                    this._glitchFallbackLogged = true;
                }
                this.renderer.render(this.scene, this.camera);
            }
        } else {
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

    // ── LoadingManager helpers ────────────────────────────────────────────────

    /** Shows the "Yükleniyor..." overlay while GLBs are being fetched */
    _showLoadingOverlay() {
        if (document.getElementById('loading-overlay')) return;
        const el = document.createElement('div');
        el.id = 'loading-overlay';
        el.style.cssText = `
            position: fixed; inset: 0;
            background: #000;
            z-index: 8000;
            display: flex; flex-direction: column;
            justify-content: center; align-items: center;
            gap: 20px;
            font-family: 'VT323', 'Share Tech Mono', 'Courier New', monospace;
            color: #ccc; text-transform: uppercase; letter-spacing: 4px;
        `;
        el.innerHTML = `
            <div id="loading-label" style="font-size:2.2rem; color:#ff69b4; text-shadow: 0 0 10px #ff69b4;">
                YÜKLENIYOR...</div>
            <div id="loading-sub" style="font-size:0.9rem; color:#444; letter-spacing:3px;">
                Varlıklar hazırlanıyor, lütfen bekleyin.</div>
        `;
        document.body.appendChild(el);
        console.log('ByDesign: Loading overlay shown.');
    }

    /** Hides the loading overlay and marks assets as ready */
    _hideLoadingOverlay() {
        const el = document.getElementById('loading-overlay');
        if (el) {
            el.style.transition = 'opacity 0.6s ease';
            el.style.opacity = '0';
            setTimeout(() => el.remove(), 700);
        }
        this._assetsReady = true;
        console.log('ByDesign: All GLBs loaded — experience unlocked for click-to-start.');
    }

    /** Helper: Recursively disposes geometries and materials to prevent memory leaks */
    disposeHierarchy(node) {
        node.traverse((child) => {
            if (child.isMesh) {
                if (child.geometry) {
                    child.geometry.dispose();
                }
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => mat.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            }
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  QA / DEBUG HOTKEYS
    // ═══════════════════════════════════════════════════════════════════════

    _setupQAHotkeys() {
        if (!QA_MODE_ENABLED) return; // One-line disable for release

        // ── Build the debug overlay panel (hidden by default) ──────────────
        const panel = document.createElement('div');
        panel.id    = 'qa-debug-panel';
        panel.style.cssText = `
            position: fixed;
            top: 50%;
            left: 20px;
            transform: translateY(-50%);
            background: rgba(0,0,0,0.82);
            border: 1px solid #ff69b4;
            border-radius: 4px;
            padding: 14px 20px;
            z-index: 99999;
            display: none;
            flex-direction: column;
            gap: 8px;
            font-family: 'VT323', 'Share Tech Mono', monospace;
            font-size: 1rem;
            color: #ff69b4;
            text-transform: uppercase;
            letter-spacing: 2px;
            min-width: 280px;
            pointer-events: none;
        `;
        panel.innerHTML = `
            <div style="color:#fff; font-size:1.15rem; border-bottom:1px solid #333; padding-bottom:6px; margin-bottom:4px;">
                [ QA DEBUG MODE ]
            </div>
            <div style="color:#888; font-size:0.78rem;">~ = toggle panel</div>
            <div><span style="color:#ffff66;">1</span> → Jump to <span style="color:#fff;">t = 115s</span> <span style="color:#555;">(BREAK -5s)</span></div>
            <div><span style="color:#ffff66;">2</span> → Jump to <span style="color:#fff;">t = 145s</span> <span style="color:#555;">(END -5s)</span></div>
            <div><span style="color:#ffff66;">3</span> → Set candies = 9, trigger Provoke Engine</div>
            <div id="qa-status" style="margin-top:8px; color:#44ff88; font-size:0.85rem;">&nbsp;</div>
        `;
        document.body.appendChild(panel);

        // ── Helper: flash a status message in the panel ────────────────────
        const showStatus = (msg, color = '#44ff88') => {
            const el = document.getElementById('qa-status');
            if (!el) return;
            el.style.color = color;
            el.textContent = msg;
            clearTimeout(this._qaStatusTimer);
            this._qaStatusTimer = setTimeout(() => { el.textContent = '\u00a0'; }, 2500);
        };

        // ── Helper: force a state+audio+glitch phase, idempotently ─────────
        const forcePhase = (stateName) => {
            if (!this.stateMachine.is(stateName)) {
                this.stateMachine.changeState(stateName);
            }
            this.glitchSystem?.setPhase(stateName);
            // Reset internal phase guard so setPhase() is not skipped
            if (this.audio) this.audio.phase = '';
            this.audio?.setPhase(stateName);
        };

        // ── Keydown handler ───────────────────────────────────────────────
        document.addEventListener('keydown', (e) => {

            // Toggle panel with Tilde (`~`)
            if (e.key === '`' || e.key === '~') {
                panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
                return;
            }

            // All other hotkeys require the game to have actually started
            if (!this.hasStarted) {
                console.log('[QA] Hotkey ignored — game not started yet.');
                return;
            }

            // ── [ 1 ] Jump to t = 115s — 5 seconds before BREAK ──────────
            if (e.key === '1') {
                console.warn('[QA] Time jump → 115 s (BREAK in 5 s)');

                this.timer.elapsedTime = 115;

                // Ensure we are in PLAY state with correct subsystem phases
                if (!this.stateMachine.is('PLAY')) {
                    forcePhase('PLAY');
                }

                // Reset guard flags so the normal BREAK transition fires naturally
                this.exitTriggered = false;
                this.endTriggered  = false;

                // Release pointer lock in case it was blocking
                if (document.pointerLockElement) document.exitPointerLock();

                showStatus('⏩ JUMPED → t=115s  |  BREAK in 5s', '#ffff66');
                return;
            }

            // ── [ 2 ] Jump to t = 145s — 5 seconds before END ────────────
            if (e.key === '2') {
                console.warn('[QA] Time jump → 145 s (END / COLLAPSE in 5 s)');

                // Apply all BREAK-phase side effects if not already in BREAK
                if (!this.stateMachine.is('BREAK') && !this.stateMachine.is('END')) {
                    forcePhase('BREAK');
                    this.input.setMode('BREAK');
                    this.cameraSystem.startTopDownTransition(this.player.position);
                    this.player.revealCharacter();
                    this.hud.activateBreakTimer();
                }

                this.timer.elapsedTime = 145;

                // BREAK was already "triggered"; END has not fired yet
                this.exitTriggered = true;
                this.endTriggered  = false;

                if (document.pointerLockElement) document.exitPointerLock();

                showStatus('⏩ JUMPED → t=145s  |  COLLAPSE in 5s', '#ff6644');
                return;
            }

            // ── [ 3 ] Instant: 9 candies + activate Provoke Engine ────────
            if (e.key === '3') {
                console.warn('[QA] Forcing 9 candies — Provoke Engine activating.');

                // Remove all candy meshes from scene and clear the array
                const candies = this.maze.candies;
                for (let i = candies.length - 1; i >= 0; i--) {
                    const mesh = candies[i].getMesh();
                    if (mesh.parent) {
                        this.disposeHierarchy(mesh);
                        this.scene.remove(mesh);
                    }
                }
                this.maze.candies.length = 0; // Empty array in-place

                this.collectedCandies = 9;

                if (!this.isProvoking) {
                    this.startProvokeEngine();
                }

                showStatus('🍭 CANDIES = 9/10  |  PROVOKE ENGINE ON', '#ff69b4');
                return;
            }
        });

        console.log(`[QA] Debug hotkeys registered. Panel: ~ key | 1=115s | 2=145s | 3=9candies`);
    }
}


