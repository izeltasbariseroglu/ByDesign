import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * AnimationManager
 *
 * Manages two subsystems:
 *   1. POV Arms   — two forearm/hand meshes parented to the camera,
 *                   always visible in the lower corners of the viewport.
 *   2. Character  — the external GLB doll model, shown from BREAK phase.
 *
 * ── POV Arm Coordinate System ───────────────────────────────────────────────
 *
 *   Camera space:  +X = right,  +Y = up,  -Z = into scene (forward)
 *
 *   Each arm ROOT group is positioned in camera-space at the lower corners:
 *     Right arm root: (+0.38, -0.30, -0.60)
 *     Left  arm root: (-0.38, -0.30, -0.60)
 *
 *   The forearm geometry extends DOWNWARD from the root (local -Y direction).
 *   The hand box sits at the bottom of the forearm, just visible on screen.
 *
 *   Root rotation:
 *     rotation.x = +0.22  →  arm leans slightly forward (natural rest pose)
 *     rotation.z = ∓0.30  →  arm angles inward from the corner (realistic)
 *
 *   Why positive rotation.x = forward lean:
 *     The hand is at local (0, -h, 0). With Rx matrix, a point at (0,-h,0)
 *     maps to (0, -h·cos θ, -h·sin θ).  Increasing θ increases -Z component
 *     → hand moves INTO the scene (forward = toward candy). ✓
 *
 *   Reach animation: rotation.x goes from REST_X (0.22) → REACH_X (1.05)
 *   This swings the hand from hanging-down to pointing-forward. ✓
 */
export class AnimationManager {
    constructor(camera, scene) {
        this.camera = camera;
        this.scene  = scene;

        // POV arm groups (camera children)
        this.leftArmRoot  = null;
        this.rightArmRoot = null;

        // Character Model (GLTF)
        this.characterModel = null;
        this.characterMixer = null;
        this.kneelAction    = null;
        this.isKneeling     = false;
        this.isReaching     = false;

        // ── Rest-pose constants ──────────────────────────────────────────────
        // These define where the arms sit when idle.
        // At FOV 75°, aspect ~1.94, z=-0.60 → frustum half-width ≈ 0.92 units.
        // x=±0.38 puts each arm in the lower corner, well inside the frustum.
        this.R = {
            x:   0.44,    // push arms into the lower corners
            y:  -0.36,    // lower — shows forearm, hides upper arm off-screen
            z:  -0.55,    // slightly closer so arms appear larger
            rx:  0.20,    // pitch: forward lean at rest
            rzR: -0.35,   // right arm rolls inward
            rzL:  0.35,   // left arm mirror
        };

        this._createArms();
        this._loadCharacterModel();
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  POV ARM BUILDER (Ball-Jointed Porcelain Doll)
    // ─────────────────────────────────────────────────────────────────────────

    _createArms() {
        // High-quality organic skin material matching the character image
        this.porcelainMat = new THREE.MeshPhysicalMaterial({
            color: 0xdfa98e,      // Warm peach/tan skin tone 
            roughness: 0.6,       // Skin is matte/rough, not glassy
            metalness: 0.0,
            clearcoat: 0.1,       // Very subtle specular sweat/oil
            clearcoatRoughness: 0.6,
            emissive: new THREE.Color(0x3a1510), // Fake subsurface scattering warmth
            emissiveIntensity: 0.2
        });

        // ── Camera-Space Positioning (Forearm-only FPS view) ──
        this.R = {
            x:   0.42,    // Pulled much wider apart so they aren't stuck in front 
            y:  -0.55,    // Pulled significantly downwards and back
            z:  -0.05,    // Maintained proximity
            rx:  1.00,    // Relaxed angle, laying flatter
            rzR: -0.15,   // Point slightly inward naturally
            rzL:  0.15,   
        };

        this.rightArmRoot = this._buildArm( this.R.x, this.R.rzR, false);
        this.leftArmRoot  = this._buildArm(-this.R.x, this.R.rzL, true);
        this.camera.add(this.rightArmRoot);
        this.camera.add(this.leftArmRoot);
    }

    _buildArm(offsetX, rollZ, isLeft) {
        const jointMat = new THREE.MeshStandardMaterial({
            color: 0xdfa98e, // Make joints match skin color so they blend in
            roughness: 0.8,
        });

        // SCALE FACTOR: Increased by another 25% per user request (2.42 -> 3.02)
        const S = 3.02;

        // ── ELBOW (ROOT) ──
        const elbow = new THREE.Group();
        elbow.position.set(offsetX, this.R.y, this.R.z);
        elbow.rotation.x = this.R.rx;
        elbow.rotation.z = rollZ;
        elbow.frustumCulled = false;

        const elbowJoint = new THREE.Mesh(new THREE.SphereGeometry(0.04 * S, 16, 16), jointMat);
        elbow.add(elbowJoint);

        // ── FOREARM ──
        const forearmLen = 0.28 * S;
        // radius: 0.035 -> 0.035 * S
        const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.04 * S, forearmLen, 4, 16), this.porcelainMat);
        forearm.position.y = -(forearmLen/2 + 0.04 * S); 
        forearm.frustumCulled = false;
        elbow.add(forearm);

        // ── WRIST ──
        const wrist = new THREE.Group();
        wrist.position.y = -(forearmLen + 0.08 * S); 

        const wristJoint = new THREE.Mesh(new THREE.SphereGeometry(0.035 * S, 16, 16), jointMat);
        wrist.add(wristJoint);

        // ── HAND ──
        const hand = new THREE.Group();
        
        // Palm - Widened slightly to cover the base of all fingers
        const palm = new THREE.Mesh(new THREE.CapsuleGeometry(0.04 * S, 0.05 * S, 4, 16), this.porcelainMat);
        palm.position.y = -0.055 * S;
        palm.scale.set(1.1, 1, 0.5); 
        hand.add(palm);

        // Fingers
        const createFinger = (radius, length, xOff, yOff, rotZ, rotX) => {
            const fGrp = new THREE.Group();
            fGrp.position.set(xOff, yOff, 0.005 * S);
            fGrp.rotation.set(rotX, 0, rotZ);
            
            // KNUCKLE JOINT: A sphere perfectly bridging the gap between palm and finger capsule
            const knuckle = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.2, 16, 16), this.porcelainMat);
            fGrp.add(knuckle);

            const fMesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, 8), this.porcelainMat);
            fMesh.position.y = -(length / 2 + radius * 0.8); // Embedded deeply into the knuckle
            fGrp.add(fMesh);
            return fGrp;
        };

        const fingers = new THREE.Group();
        // Shift base UP into the palm geometry to completely seal any visual gaps
        const fBase = -0.088 * S; 

        // Index, Middle, Ring
        const idx = createFinger(0.009 * S, 0.06 * S, (isLeft ?  0.022 : -0.022) * S,  fBase, isLeft ? -0.08 :  0.08, 0.05);
        const mid = createFinger(0.010 * S, 0.07 * S, 0,                               fBase - 0.005 * S, 0, 0.02);
        const rng = createFinger(0.008 * S, 0.05 * S, (isLeft ? -0.020 :  0.020) * S,  fBase, isLeft ?  0.10 : -0.10, 0.08);
        
        // Thumb (moved slightly to the side & up to embed naturally)
        const thm = createFinger(0.012 * S, 0.045 * S, (isLeft ?  0.038 : -0.038) * S, -0.045 * S, isLeft ?  0.60 : -0.60, -0.30);
        
        fingers.add(idx, mid, rng, thm);
        fingers.rotation.x = -0.15; // Natural curl
        hand.add(fingers);
        
        hand.rotation.x = -0.1; // Rest angle
        
        wrist.add(hand);
        elbow.add(wrist);

        elbow.userData.elbow   = elbow;
        elbow.userData.wrist   = wrist;
        elbow.userData.hand    = hand;
        elbow.userData.fingers = fingers;
        elbow.userData.isLeft  = isLeft;

        return elbow;
    }

    // Compatibility getters for external callers (showCharacter, etc.)
    get leftArm()  { return this.leftArmRoot; }
    get rightArm() { return this.rightArmRoot; }

    // ─────────────────────────────────────────────────────────────────────────
    //  GLB CHARACTER MODEL
    // ─────────────────────────────────────────────────────────────────────────

    _loadCharacterModel() {
        const loader = new GLTFLoader();
        loader.load(
            '/assets/pastel dress doll 3d model.glb',
            (gltf) => {
                this.characterModel = gltf.scene;
                this.characterModel.visible = false;
                this.characterModel.scale.set(1, 1, 1);
                this.characterModel.position.set(-22.5, 0, -22.5);
                this.scene.add(this.characterModel);

                const TEX_SLOTS = ['map','normalMap','roughnessMap','metalnessMap','emissiveMap','aoMap'];
                this.characterModel.traverse((node) => {
                    if (!node.isMesh) return;
                    node.castShadow    = false;
                    node.receiveShadow = false;
                    const mats = Array.isArray(node.material) ? node.material : [node.material];
                    mats.forEach(mat => {
                        if (!mat) return;
                        TEX_SLOTS.forEach(slot => {
                            if (mat[slot]) mat[slot].needsUpdate = false;
                        });
                        // Removed dynamic map application, retaining the hand-crafted skin texture.
                    });
                });

                if (gltf.animations?.length) {
                    this.characterMixer = new THREE.AnimationMixer(this.characterModel);
                    const clip = THREE.AnimationClip.findByName(gltf.animations, 'kneel')
                              || THREE.AnimationClip.findByName(gltf.animations, 'Kneel')
                              || gltf.animations[0];
                    if (clip) {
                        this.kneelAction = this.characterMixer.clipAction(clip);
                        this.kneelAction.loop             = THREE.LoopOnce;
                        this.kneelAction.clampWhenFinished = true;
                    }
                }
                console.log('AnimationManager: GLB loaded —', gltf.animations.length, 'clips');
            },
            undefined,
            (err) => console.error('AnimationManager: GLB load failed —', err)
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  STATE TRANSITIONS
    // ─────────────────────────────────────────────────────────────────────────

    showCharacter(playerPosition) {
        if (this.characterModel) {
            this.characterModel.position.copy(playerPosition);
            this.characterModel.position.y = 0;
            this.characterModel.visible    = true;
            // Hide POV arms; camera transitions to top-down
            if (this.leftArmRoot)  this.leftArmRoot.visible  = false;
            if (this.rightArmRoot) this.rightArmRoot.visible  = false;
        }
    }

    triggerKneel() {
        if (this.isKneeling) return;
        this.isKneeling = true;
        if (this.characterMixer && this.kneelAction) {
            this.kneelAction.reset().play();
        } else {
            this._proceduralKneel();
        }
    }

    _proceduralKneel() {
        if (!this.characterModel) return;
        const targets = [];
        this.characterModel.traverse((node) => {
            if (!node.isBone) return;
            const n = node.name.toLowerCase();
            if (n.includes('upleg') || n.includes('thigh') || n.includes('upperleg') ||
                n.includes('lowleg') || n.includes('calf')  || n.includes('lowerleg') || n.includes('shin')) {
                targets.push(node);
            }
        });
        if (!targets.length) {
            this._tweenY(this.characterModel, this.characterModel.position.y, this.characterModel.position.y - 0.8, 1500);
            return;
        }
        targets.forEach(bone => {
            const isUpper = bone.name.toLowerCase().includes('up') || bone.name.toLowerCase().includes('thigh');
            this._tweenBoneRotX(bone, 0, isUpper ? Math.PI / 3 : -Math.PI / 2.5, 1500);
        });
    }

    _tweenBoneRotX(bone, from, to, duration) {
        const start = performance.now();
        const go = () => {
            const p    = Math.min((performance.now() - start) / duration, 1);
            const ease = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;
            bone.rotation.x = from + (to - from) * ease;
            if (p < 1) requestAnimationFrame(go);
        };
        go();
    }

    _tweenY(obj, from, to, duration) {
        const start = performance.now();
        const go = () => {
            const p    = Math.min((performance.now() - start) / duration, 1);
            const ease = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;
            obj.position.y = from + (to - from) * ease;
            if (p < 1) requestAnimationFrame(go);
        };
        go();
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  REACH ANIMATION  (candy collection — right arm only, POV)
    // ─────────────────────────────────────────────────────────────────────────

    reachOut(targetWorldPos) {
        if (this.isReaching) return;
        this.isReaching = true;

        const arm = this.rightArmRoot; 
        if (!arm) { this.isReaching = false; return; }

        const wrist    = arm.userData.wrist;
        const fingers  = arm.userData.fingers;

        // Dynamic 3D Tracking: Calculate rotation to aim the forearm exactly at the candy!
        let targetQuaternion;
        if (targetWorldPos && this.camera) {
            // Convert candy world coordinate into the camera's local coordinate space
            const localTarget = this.camera.worldToLocal(targetWorldPos.clone());
            // Direction from the elbow joint to the candy
            const dir = localTarget.sub(arm.position).normalize();
            // In our rig, the default "forward" for the forearm block is exactly straight down (-Y)
            targetQuaternion = new THREE.Quaternion().setFromUnitVectors(
                new THREE.Vector3(0, -1, 0), 
                dir
            );
        } else {
            // Fallback to static point-forward math if position is missing
            const tgEuler = new THREE.Euler(1.95, 0, 0.05);
            targetQuaternion = new THREE.Quaternion().setFromEuler(tgEuler);
        }

        const startQuaternion = arm.quaternion.clone();

        // Phase 1: Reach out and open hand
        // Syncs directly with the 250ms candy disappearance delay in game.js !
        this._tween(250, (p) => {
            const ease = p * (2 - p);
            
            // SLERP (Spherical Linear Interpolation) flawlessly targets the 3D space
            arm.quaternion.slerpQuaternions(startQuaternion, targetQuaternion, ease);

            // Wrist stays mostly steady, lifting slightly
            wrist.rotation.x = -(0.5 * ease); 

            // Fingers OPEN wide preparing to grab the candy
            fingers.rotation.x = -0.15 + (0.65 * ease); 

        }, () => {
            // Phase 2: Instantly clench into a fist (GRAB!)
            fingers.rotation.x = -1.2; // Full fist
            wrist.rotation.x   = 0.2;  // Curl wrist inwards with the weight
            
            const holdQuaternion = arm.quaternion.clone();

            setTimeout(() => {
                // Phase 3 & 4: Retracting and Relaxing
                this._retractArm(arm, holdQuaternion);
            }, 60);
        });
    }

    _retractArm(arm, fromQuat) {
        // Compute the natural resting quaternion dynamically in case 'R' values were adjusted
        const restEuler = new THREE.Euler(this.R.rx, 0, this.R.rzR);
        const restQuat = new THREE.Quaternion().setFromEuler(restEuler);
        
        const wrist    = arm.userData.wrist;
        const fingers  = arm.userData.fingers;

        this._tween(450, (p) => {
            // S-Curve ease for realistic pulling effort
            const ease = p * p * (3 - 2 * p);
            
            arm.quaternion.slerpQuaternions(fromQuat, restQuat, ease);
            
            // Wrist drops naturally back to rest
            wrist.rotation.x = 0.2 - (0.2 * ease);
            
            // Fingers hold the fist shape for the first half of retraction
            if (p < 0.5) {
                fingers.rotation.x = -1.2; 
            } else {
                const releaseP = (p - 0.5) * 2; 
                fingers.rotation.x = -1.2 + (-0.15 - -1.2) * releaseP;
            }

        }, () => {
            this.isReaching = false;
        });
    }

    /** Utility: run an eased animation. cb(ease) called each frame, done() on finish. */
    _tween(duration, cb, done) {
        const start = performance.now();
        const step  = () => {
            const p    = Math.min((performance.now() - start) / duration, 1);
            const ease = p * (2 - p);   // ease-out
            cb(ease);
            if (p < 1) requestAnimationFrame(step);
            else done?.();
        };
        step();
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  PER-FRAME UPDATE
    // ─────────────────────────────────────────────────────────────────────────

    update(time, delta) {
        const R = this.R;

        // Dynamic Walking Bob logic based on actual camera movement
        if (!this.lastCamPos) this.lastCamPos = new THREE.Vector3().copy(this.camera.position);
        
        const dist = Math.sqrt(
            Math.pow(this.camera.position.x - this.lastCamPos.x, 2) + 
            Math.pow(this.camera.position.z - this.lastCamPos.z, 2)
        );
        const speed = dist / delta;
        this.lastCamPos.copy(this.camera.position);

        if (!this.smoothedSpeed) this.smoothedSpeed = 0;
        this.smoothedSpeed = THREE.MathUtils.lerp(this.smoothedSpeed, Math.min(speed, 5.0), 10 * delta);

        if (!this.bobTime) this.bobTime = 0;
        if (this.smoothedSpeed > 0.1) {
            this.bobTime += delta * 12; // Human walking frequency (approx 1.9 Hz)
        }

        const breatheX = Math.sin(time * 1.4) * 0.018;   // slow vertical breathing
        const breatheY = Math.cos(time * 0.8) * 0.010;   // gentle side sway

        // Figure-8 walking motion
        const walkBobY = Math.sin(this.bobTime) * 0.05 * (this.smoothedSpeed / 5.0);
        const walkBobX = Math.cos(this.bobTime / 2) * 0.05 * (this.smoothedSpeed / 5.0);

        // Idle sway — only when not animating a reach
        if (!this.isReaching) {

            // Right arm
            if (this.rightArmRoot?.visible !== false) {
                this.rightArmRoot.position.y   = R.y + breatheX + walkBobY;
                this.rightArmRoot.position.x   = R.x - breatheY + walkBobX;
                this.rightArmRoot.position.z   = R.z;
                this.rightArmRoot.rotation.x   = R.rx + breatheX * 0.4;
                this.rightArmRoot.rotation.z   = R.rzR + walkBobX * 0.5;
            }

            // Left arm
            if (this.leftArmRoot?.visible !== false) {
                this.leftArmRoot.position.y    = R.y + breatheX + walkBobY;
                this.leftArmRoot.position.x    = -R.x + breatheY + walkBobX;
                this.leftArmRoot.position.z    = R.z;
                this.leftArmRoot.rotation.x    = R.rx + breatheX * 0.4;
                this.leftArmRoot.rotation.z    = R.rzL + walkBobX * 0.5;
            }
        } else {
            // Apply breathing/bob to left arm even while right arm reaches
            if (this.leftArmRoot?.visible !== false) {
                this.leftArmRoot.position.y    = R.y + breatheX + walkBobY;
                this.leftArmRoot.position.x    = -R.x + breatheY + walkBobX;
                this.leftArmRoot.position.z    = R.z;
            }
        }

        // Tick character AnimationMixer
        if (this.characterMixer) {
            this.characterMixer.update(delta);
        }
    }
}
