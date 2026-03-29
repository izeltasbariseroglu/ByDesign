import * as THREE from 'three';

export class PlayerController {
    constructor(camera, input, maze) {
        this.camera = camera;
        this.input = input;
        this.maze = maze; // Reference for collisions
        
        // Logical position (Not the camera object, as the camera will move away in BREAK mode)
        this.position = new THREE.Vector3(0, 1.7, 0); 
        this.moveSpeed = 4.0;
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();

        this.lookSpeed = 0.002;
        this.pitch = 0;
        this.yaw = 0;
        
        this.setupPointerLock();
        
        // Character "Flashlight" (Personal Light)
        this.flashlight = new THREE.PointLight(0xeef5ff, 4.5, 20);
        this.flashlight.castShadow = true;
    }

    addToScene(scene) {
        scene.add(this.flashlight);
    }

    setupPointerLock() {
        document.addEventListener('click', () => {
             // Request Pointer Lock if not already locked
             if (document.pointerLockElement !== document.body) {
                document.body.requestPointerLock();
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement === document.body) {
                this.yaw -= e.movementX * this.lookSpeed;
                this.pitch -= e.movementY * this.lookSpeed;
                this.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitch));
                // Only rotate camera if in POV (not transitioning or top-down)
                // Actually, let's just let it rotate, but we will overwrite pos/rot in cameraSystem
            }
        });
    }

    update(delta, isPOV = true) {
        if (!delta) return;

        const inputs = this.input.getInputs();
        
        // Always compute movement based on yaw (ignoring pitch/tilt)
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

        // Potential move
        const moveStep = this.moveSpeed * delta;
        const potentialNextPos = this.position.clone();
        
        // Axis-independent collision check (sliding)
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

        // Flashlight always attached to the player center
        this.flashlight.position.copy(this.position);
        this.flashlight.position.y = 1.6; // Eye level-ish

        // If in POV, sync camera to this position and apply yaw/pitch
        if (isPOV) {
            this.camera.position.copy(this.position);
            this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
        }
    }
}
