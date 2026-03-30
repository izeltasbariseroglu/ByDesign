import * as THREE from 'three';

export class CameraSystem {
    constructor(camera) {
        this.camera = camera;
        this.isTransitioning = false;
        this.isTopDown = false; // FIX: explicit flag replaces fragile `=== 1` float check
        this.transitionProgress = 0;
        this.transitionDuration = 3000; // 3 seconds transition

        // Storage for start/end params
        this.startPos = new THREE.Vector3();
        this.startRot = new THREE.Quaternion();

        this.targetPos = new THREE.Vector3();
        this.targetRot = new THREE.Quaternion(0, 0, 0, 1); // Looking down

        console.log("Camera transition system initialized");
    }

    startTopDownTransition(playerPosition) {
        if (this.isTransitioning) return;

        this.isTransitioning = true;
        this.transitionProgress = 0;
        
        this.startPos.copy(this.camera.position);
        this.startRot.copy(this.camera.quaternion);

        // Target: Directly above the player, looking down
        this.targetPos.copy(playerPosition).add(new THREE.Vector3(0, 15, 0));
        
        // Use a dummy camera or LookAt proxy to get the quaternion for top-down
        const dummy = new THREE.Object3D();
        dummy.position.copy(this.targetPos);
        dummy.lookAt(playerPosition.x, 0, playerPosition.z);
        this.targetRot.copy(dummy.quaternion);

        console.log("Starting Camera Transition: POV -> TOP-DOWN");
    }

    update(delta, playerPosition) {
        if (this.isTransitioning) {
            this.transitionProgress += (delta * 1000) / this.transitionDuration;
            
            if (this.transitionProgress >= 1) {
                this.transitionProgress = 1;
                this.isTransitioning = false;
                this.isTopDown = true; // FIX: set flag instead of relying on float === 1
                console.log("Camera Transition Complete: TOP-DOWN mode");
            }

            // EaseInOut for smoother "feel of being pushed out"
            const t = this.easeInOutQuad(this.transitionProgress);
            
            this.camera.position.lerpVectors(this.startPos, this.targetPos, t);
            this.camera.quaternion.slerpQuaternions(this.startRot, this.targetRot, t);
        } else if (this.isTopDown) { // FIX: was === 1 (fragile float equality), now uses isTopDown flag
            // Keep tracking the player from top down once transition is done
            this.camera.position.set(playerPosition.x, 15, playerPosition.z);
        }
    }

    easeInOutQuad(t) {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }
}
