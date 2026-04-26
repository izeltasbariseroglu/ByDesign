import * as THREE from 'three';
import { AnimationManager } from '../systems/animationManager.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class PlayerController {
    constructor(camera, viewmodelCamera, input, maze, audio = null, loadingManager = null) {
        this.camera = camera;
        this.viewmodelCamera = viewmodelCamera;
        this.input = input;
        this.maze = maze;
        this.audio = audio;
        this.loadingManager = loadingManager;
        
        this.position = new THREE.Vector3(-18.75, 1.7, -18.75); // Grid [1,1] in 17x17 dungeon
        this.moveSpeed = 3.0; // %25 yavaşlatıldı (4.0 -> 3.0)
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();

        this.distanceMoved = 1.3; // Pre-prime: first footstep triggers after ~0.1 units of movement

        this.lookSpeed = 0.002;
        this.pitch = 0;
        this.yaw = 0;
        
        this.isPointerLocked = false;
        this.setupPointerLock();

        // Phase 2+3: Animation & Rigging — scene passed via setScene()
        this.scene = null;
        this.animationManager = null;
        this.loader = new GLTFLoader();
    }

    addToScene(scene) {
        this.scene = scene;
        this.animationManager = new AnimationManager(this.camera, this.viewmodelCamera, scene, this.loadingManager);
    }

    setupPointerLock() {
        // Pointer lock is requested on click ONLY when game has started
        // Use a flag so we don't interfere with the camera permission click
        document.addEventListener('pointerlockchange', () => {
            this.isPointerLocked = document.pointerLockElement === document.body;
        });

        document.addEventListener('mousemove', (e) => {
            if (this.isPointerLocked) {
                this.yaw -= e.movementX * this.lookSpeed;
                this.pitch -= e.movementY * this.lookSpeed;
                this.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitch));
            }
        });
    }

    // Called externally (from game.js) after game starts so it doesn't
    // compete with camera permission click listener
    enablePointerLock() {
        this.pointerLockAllowed = true;
        document.addEventListener('click', () => {
            if (!this.isPointerLocked && this.pointerLockAllowed) {
                document.body.requestPointerLock();
            }
        });
    }

    disablePointerLock() {
        this.pointerLockAllowed = false;
        if (this.isPointerLocked) {
            document.exitPointerLock();
        }
    }

    update(delta, isPOV = true) {
        if (!delta) return;

        const inputs = this.input.getInputs();
        
        this.direction.set(0, 0, 0);
        
        const forward = new THREE.Vector3(
            -Math.sin(this.yaw),
            0,
            -Math.cos(this.yaw)
        ).normalize();
        
        const right = new THREE.Vector3(
            Math.cos(this.yaw),
            0,
            -Math.sin(this.yaw)
        ).normalize();

        if (inputs.forward) this.direction.add(forward);
        if (inputs.backward) this.direction.sub(forward);
        if (inputs.left) this.direction.sub(right);
        if (inputs.right) this.direction.add(right);

        if (this.direction.length() > 0) {
            this.direction.normalize();
        }

        const moveStep = this.moveSpeed * delta;
        const potentialNextPos = this.position.clone();
        
        let movedThisFrame = false;
        
        if (this.direction.x !== 0) {
            const nextX = potentialNextPos.x + this.direction.x * moveStep;
            if (!this.maze.checkCollisions(new THREE.Vector3(nextX, potentialNextPos.y, potentialNextPos.z))) {
                this.position.x = nextX;
                movedThisFrame = true;
            }
        }
        if (this.direction.z !== 0) {
            const nextZ = potentialNextPos.z + this.direction.z * moveStep;
            if (!this.maze.checkCollisions(new THREE.Vector3(this.position.x, potentialNextPos.y, nextZ))) {
                this.position.z = nextZ;
                movedThisFrame = true;
            }
        }

        // --- Adım sesi tetikleme (sadece yürürken) ---
        if (movedThisFrame && this.audio && isPOV) {
            this.distanceMoved += moveStep;
            if (this.distanceMoved > 1.5) { // Her 1.5 birimde bir adım (oyuncu hızına göre ayarlı)
                this.audio.triggerFootstep();
                this.distanceMoved = 0;
            }
        } else if (!movedThisFrame) {
            // Durduğumuzda bir sonraki adımın hemem gelmesi için mesafeyi azalt (fakat hemen sıfırlama)
            this.distanceMoved = Math.max(0, this.distanceMoved - delta * 2);
        }

        if (isPOV) {
            this.camera.position.copy(this.position);
            this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
            if (this.animationManager) {
                this.animationManager.update(performance.now() / 1000, delta);
            }
        }
    }

    triggerCollectionEffect(targetWorldPos) {
        if (this.animationManager) this.animationManager.reachOut(targetWorldPos);
    }

    revealCharacter() {
        if (this.animationManager) this.animationManager.showCharacter(this.position);
    }

    triggerKneel() {
        if (this.animationManager) this.animationManager.triggerKneel();
    }

    updateCharacterPosition() {
        // Keep the 3D model tracking the player position in top-down phase
        if (this.animationManager.characterModel) {
            this.animationManager.characterModel.position.x = this.position.x;
            this.animationManager.characterModel.position.z = this.position.z;
        }
    }
}
