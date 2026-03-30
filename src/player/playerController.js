import * as THREE from 'three';

export class PlayerController {
    constructor(camera, input, maze) {
        this.camera = camera;
        this.input = input;
        this.maze = maze;
        
        this.position = new THREE.Vector3(-22.5, 1.7, -22.5); // Grid [1,1] in 20x20 dungeon
        this.moveSpeed = 3.0; // %25 yavaşlatıldı (4.0 -> 3.0)
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();

        this.lookSpeed = 0.002;
        this.pitch = 0;
        this.yaw = 0;
        
        this.isPointerLocked = false;
        this.setupPointerLock();
        // Flashlight REMOVED - only wall torches illuminate
    }

    addToScene(scene) {
        // No personal flashlight
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
        document.addEventListener('click', () => {
            if (!this.isPointerLocked) {
                document.body.requestPointerLock();
            }
        });
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
        
        if (this.direction.x !== 0) {
            const nextX = potentialNextPos.x + this.direction.x * moveStep;
            if (!this.maze.checkCollisions(new THREE.Vector3(nextX, potentialNextPos.y, potentialNextPos.z))) {
                this.position.x = nextX;
            }
        }
        if (this.direction.z !== 0) {
            const nextZ = potentialNextPos.z + this.direction.z * moveStep;
            if (!this.maze.checkCollisions(new THREE.Vector3(this.position.x, potentialNextPos.y, nextZ))) {
                this.position.z = nextZ;
            }
        }

        if (isPOV) {
            this.camera.position.copy(this.position);
            this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
        }
    }
}
