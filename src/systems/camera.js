import * as THREE from 'three';

export class CameraSystem {
    constructor(camera) {
        this.camera = camera;
        this.isTransitioning = false;
        this.isAngledTopDown = false;
        this.transitionProgress = 0;
        this.transitionDuration = 4000; // 4 second cinematic slide

        this.startPos = new THREE.Vector3();
        this.startRot = new THREE.Quaternion();

        this.targetPos = new THREE.Vector3();
        this.targetRot = new THREE.Quaternion();

        console.log("Camera transition system initialized (Phase 3: Angled Top-Down)");
    }

    startTopDownTransition(playerPosition) {
        if (this.isTransitioning) return;

        this.isTransitioning = true;
        this.transitionProgress = 0;
        
        this.startPos.copy(this.camera.position);
        this.startRot.copy(this.camera.quaternion);

        // Angled view: raised and pulled back diagonally — NOT directly overhead.
        // Player visible from front-top (~45° angle) giving "expelled from body" feeling.
        this.targetPos.set(
            playerPosition.x - 3,  // slightly in front
            playerPosition.y + 9,  // elevated
            playerPosition.z + 9   // pulled back
        );

        // Build quaternion: look at the player's feet from the angled position
        const dummy = new THREE.Object3D();
        dummy.position.copy(this.targetPos);
        dummy.lookAt(playerPosition.x, playerPosition.y - 0.5, playerPosition.z);
        this.targetRot.copy(dummy.quaternion);

        console.log("Starting Camera Transition: POV → Angled Top-Down (Phase 3)");
    }

    update(delta, playerPosition) {
        if (this.isTransitioning) {
            this.transitionProgress += (delta * 1000) / this.transitionDuration;
            
            if (this.transitionProgress >= 1) {
                this.transitionProgress = 1;
                this.isTransitioning = false;
                this.isAngledTopDown = true;
                console.log("Camera Transition Complete: Angled Top-Down active");
            }

            const t = this.easeInOutCubic(this.transitionProgress);
            
            this.camera.position.lerpVectors(this.startPos, this.targetPos, t);
            this.camera.quaternion.slerpQuaternions(this.startRot, this.targetRot, t);

        } else if (this.isAngledTopDown) {
            // Softly track the player's position offset once transition is complete
            this.camera.position.lerp(
                new THREE.Vector3(
                    playerPosition.x - 3,
                    playerPosition.y + 9,
                    playerPosition.z + 9
                ),
                0.05  // Very soft tracking, doesn't snap
            );
        }
    }

    easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }
}
