import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * AnimationManager v3 — Professional POV Viewmodel System
 *
 * Architecture:
 *   Camera
 *     └─ shoulderPivot (camera-space, sits 15cm below & 10cm behind camera centre)
 *          ├─ rightShoulderGroup  (Layer 2 — world shoulder position)
 *          │    └─ upperArm  ──► elbow ──► forearm ──► wrist ──► hand ──► fingers[]
 *          └─ leftShoulderGroup   (mirror)
 *
 * Procedural IK (2-bone FABRIK):
 *   On candy collection, the wrist (end-effector) is driven toward the candy's
 *   world position. The elbow angle is solved mathematically using the law of cosines.
 *   No external IK library required.
 */
export class AnimationManager {
    constructor(camera, scene, loadingManager = null) {
        this.camera        = camera;
        this.scene         = scene;
        this.loadingManager = loadingManager;

        // Arm roots
        this.rightArm = null;   // { shoulder, elbow, wrist, hand, fingers }
        this.leftArm  = null;

        // State
        this.isReaching      = false;
        this.bobTime         = 0;
        this.smoothedSpeed   = 0;
        this.lastCamPos      = null;

        // Character model
        this.characterModel  = null;
        this.characterMixer  = null;
        this.kneelAction     = null;
        this.isKneeling      = false;

        // Shoulder pivot: camera-space. Three.js'de -Z = ileri (ekrana doğru).
        // Pivot, göz seviyesinin 15cm altında ve 10cm önünde (ekrana doğru) durur.
        this.shoulderPivot = new THREE.Group();
        this.shoulderPivot.position.set(0, -0.15, -0.10);
        this.camera.add(this.shoulderPivot);


        // Rest-pose constants (camera-local)
        this.REST = {
            shoulderX  : 0.32,   // omuz genişliği — ekranın köşelerine doğru
            shoulderY  : 0,
            // pitchRest: omuz grubunun x rotasyonu.
            // 1.15 rad (~66°) → el ekranın alt köşesinde görünür.
            pitchRest  : 1.10,
            rollRight  : -0.14,
            rollLeft   :  0.14,
            upperLen   : 0.28,
            forearmLen : 0.26,
        };


        this._buildArms();
        this._loadCharacterModel();
    }

    // ── Compatibility shims ──────────────────────────────────────────────────
    get leftArmRoot()  { return this.leftArm?.shoulder  ?? null; }
    get rightArmRoot() { return this.rightArm?.shoulder ?? null; }

    // ─────────────────────────────────────────────────────────────────────────
    //  ARM BUILDER
    // ─────────────────────────────────────────────────────────────────────────

    _buildArms() {
        this.porcelainMat = new THREE.MeshPhysicalMaterial({
            color             : 0xdfa98e,
            roughness         : 0.60,
            metalness         : 0.00,
            clearcoat         : 0.10,
            clearcoatRoughness: 0.60,
            emissive          : new THREE.Color(0x3a1510),
            emissiveIntensity : 0.20,
        });
        this.jointMat = new THREE.MeshStandardMaterial({ color: 0xcf9070, roughness: 0.8 });

        this.rightArm = this._buildOneArm( this.REST.shoulderX, this.REST.rollRight, false);
        this.leftArm  = this._buildOneArm(-this.REST.shoulderX, this.REST.rollLeft,  true );
    }

    _buildOneArm(offsetX, rollZ, isLeft) {
        const R = this.REST;
        const S = 3.0; // geometry scale factor

        // ── Shoulder group (pivot point) ─────────────────────────────────────
        const shoulder = new THREE.Group();
        shoulder.position.set(offsetX, R.shoulderY, 0);
        shoulder.rotation.x = R.pitchRest;
        shoulder.rotation.z = rollZ;
        shoulder.frustumCulled = false;
        this._assignLayer(shoulder);

        // Shoulder ball joint
        const sJoint = new THREE.Mesh(
            new THREE.SphereGeometry(0.05 * S, 12, 12),
            this.jointMat
        );
        this._assignLayer(sJoint);
        shoulder.add(sJoint);

        // ── Upper arm ────────────────────────────────────────────────────────
        const upperArm = new THREE.Group();
        upperArm.position.y = 0; // starts at shoulder origin
        shoulder.add(upperArm);

        const upperLen = R.upperLen;
        const upperMesh = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.038 * S, upperLen, 4, 12),
            this.porcelainMat
        );
        upperMesh.position.y = -(upperLen / 2);
        upperMesh.frustumCulled = false;
        this._assignLayer(upperMesh);
        upperArm.add(upperMesh);

        // ── Elbow ────────────────────────────────────────────────────────────
        const elbow = new THREE.Group();
        elbow.position.y = -upperLen; // bottom of upper arm
        upperArm.add(elbow);

        const eJoint = new THREE.Mesh(
            new THREE.SphereGeometry(0.042 * S, 12, 12),
            this.jointMat
        );
        this._assignLayer(eJoint);
        elbow.add(eJoint);

        // ── Forearm ──────────────────────────────────────────────────────────
        const forearm = new THREE.Group();
        forearm.position.y = 0; // starts at elbow origin
        elbow.add(forearm);

        const foreLen = R.forearmLen;
        const foreMesh = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.034 * S, foreLen, 4, 12),
            this.porcelainMat
        );
        foreMesh.position.y = -(foreLen / 2);
        foreMesh.frustumCulled = false;
        this._assignLayer(foreMesh);
        forearm.add(foreMesh);

        // ── Wrist ────────────────────────────────────────────────────────────
        const wrist = new THREE.Group();
        wrist.position.y = -foreLen;
        forearm.add(wrist);

        const wJoint = new THREE.Mesh(
            new THREE.SphereGeometry(0.032 * S, 12, 12),
            this.jointMat
        );
        this._assignLayer(wJoint);
        wrist.add(wJoint);

        // ── Hand + Fingers ───────────────────────────────────────────────────
        const hand = new THREE.Group();
        hand.rotation.x = -0.08;
        wrist.add(hand);

        const palm = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.038 * S, 0.048 * S, 4, 12),
            this.porcelainMat
        );
        palm.position.y = -0.048 * S;
        palm.scale.set(1.1, 1, 0.55);
        palm.frustumCulled = false;
        this._assignLayer(palm);
        hand.add(palm);

        const fingers = this._buildFingers(S, isLeft);
        hand.add(fingers);

        // Store hierarchy references
        const armData = { shoulder, upperArm, elbow, forearm, wrist, hand, fingers };

        // userData for backward-compat with reachOut
        shoulder.userData = armData;

        this.shoulderPivot.add(shoulder);
        return armData;
    }

    _buildFingers(S, isLeft) {
        const group = new THREE.Group();
        const fBase = -0.088 * S;

        const mk = (radius, length, xOff, yOff, rz, rx) => {
            const g = new THREE.Group();
            g.position.set(xOff, yOff, 0.005 * S);
            g.rotation.set(rx, 0, rz);
            const k = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.2, 10, 10), this.porcelainMat);
            this._assignLayer(k);
            g.add(k);
            const m = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, 8), this.porcelainMat);
            m.position.y = -(length / 2 + radius * 0.8);
            this._assignLayer(m);
            g.add(m);
            return g;
        };

        const idx = mk(0.009*S, 0.058*S, (isLeft?  0.022:-0.022)*S, fBase,          isLeft?-0.08: 0.08,  0.05);
        const mid = mk(0.010*S, 0.068*S,  0,                          fBase-0.005*S,  0,                   0.02);
        const rng = mk(0.008*S, 0.050*S, (isLeft? -0.020: 0.020)*S,  fBase,          isLeft? 0.10:-0.10,  0.08);
        const thm = mk(0.012*S, 0.045*S, (isLeft?  0.038:-0.038)*S, -0.045*S,        isLeft? 0.60:-0.60, -0.30);

        group.add(idx, mid, rng, thm);
        group.rotation.x = -0.15;
        return group;
    }

    /** Ensure an object is never frustum-culled (arms may partially extend behind camera) */
    _assignLayer(obj) {
        obj.frustumCulled = false;
        obj.traverse(child => { child.frustumCulled = false; });
    }


    // ─────────────────────────────────────────────────────────────────────────
    //  CHARACTER MODEL
    // ─────────────────────────────────────────────────────────────────────────

    _loadCharacterModel() {
        const loader = new GLTFLoader(this.loadingManager);
        loader.load(
            '/assets/pastel dress doll 3d model.glb',
            (gltf) => {
                this.characterModel = gltf.scene;
                this.characterModel.visible = false;
                this.characterModel.scale.set(1, 1, 1);
                this.characterModel.position.set(-22.5, 0, -22.5);
                this.scene.add(this.characterModel);

                const TEX = ['map','normalMap','roughnessMap','metalnessMap','emissiveMap','aoMap'];
                this.characterModel.traverse(node => {
                    if (!node.isMesh) return;
                    node.castShadow    = false;
                    node.receiveShadow = false;
                    const mats = Array.isArray(node.material) ? node.material : [node.material];
                    mats.forEach(mat => {
                        if (!mat) return;
                        TEX.forEach(slot => { if (mat[slot]) mat[slot].needsUpdate = false; });
                    });
                });

                if (gltf.animations?.length) {
                    this.characterMixer = new THREE.AnimationMixer(this.characterModel);
                    const clip = THREE.AnimationClip.findByName(gltf.animations, 'kneel')
                              || THREE.AnimationClip.findByName(gltf.animations, 'Kneel')
                              || gltf.animations[0];
                    if (clip) {
                        this.kneelAction = this.characterMixer.clipAction(clip);
                        this.kneelAction.loop              = THREE.LoopOnce;
                        this.kneelAction.clampWhenFinished = true;
                    }
                }
                console.log('AnimationManager: GLB loaded —', gltf.animations.length, 'clips');
            },
            undefined,
            err => console.error('AnimationManager: GLB load failed —', err)
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
        }
        if (this.rightArm) this.rightArm.shoulder.visible = false;
        if (this.leftArm)  this.leftArm.shoulder.visible  = false;
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
        this.characterModel.traverse(node => {
            if (!node.isBone) return;
            const n = node.name.toLowerCase();
            if (n.includes('upleg')||n.includes('thigh')||n.includes('upperleg')||
                n.includes('lowleg')||n.includes('calf') ||n.includes('lowerleg')||n.includes('shin'))
                targets.push(node);
        });
        if (!targets.length) {
            this._tweenY(this.characterModel, this.characterModel.position.y,
                         this.characterModel.position.y - 0.8, 1500);
            return;
        }
        targets.forEach(bone => {
            const isUpper = bone.name.toLowerCase().includes('up') ||
                            bone.name.toLowerCase().includes('thigh');
            this._tweenBoneRotX(bone, 0, isUpper ? Math.PI/3 : -Math.PI/2.5, 1500);
        });
    }

    _tweenBoneRotX(bone, from, to, duration) {
        const start = performance.now();
        const go = () => {
            const p    = Math.min((performance.now()-start)/duration, 1);
            const ease = p < 0.5 ? 2*p*p : -1+(4-2*p)*p;
            bone.rotation.x = from + (to-from)*ease;
            if (p < 1) requestAnimationFrame(go);
        };
        go();
    }

    _tweenY(obj, from, to, duration) {
        const start = performance.now();
        const go = () => {
            const p    = Math.min((performance.now()-start)/duration, 1);
            const ease = p < 0.5 ? 2*p*p : -1+(4-2*p)*p;
            obj.position.y = from + (to-from)*ease;
            if (p < 1) requestAnimationFrame(go);
        };
        go();
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  REACH / IK ANIMATION
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Procedural 2-bone IK reach.
     * @param {THREE.Vector3} targetWorldPos  World-space position of the candy.
     */
    reachOut(targetWorldPos) {
        if (this.isReaching) return;
        this.isReaching = true;

        const arm = this.rightArm;
        if (!arm) { this.isReaching = false; return; }

        const { shoulder, elbow, wrist, hand, fingers } = arm;
        const R  = this.REST;

        // ── Snapshot rest rotations ──────────────────────────────────────────
        const restShoulderRX = shoulder.rotation.x;
        const restShoulderRZ = shoulder.rotation.z;
        const restElbowRX    = elbow.rotation.x;

        // ── Compute IK target in shoulder-local space ─────────────────────────
        // We convert the candy world position into the shoulder group's local frame
        // so our 2-bone IK math stays simple.
        const shoulderWorld = new THREE.Vector3();
        shoulder.getWorldPosition(shoulderWorld);

        // Direction from shoulder to candy
        const toTarget = new THREE.Vector3().subVectors(targetWorldPos, shoulderWorld);
        const dist     = Math.min(toTarget.length(), R.upperLen + R.forearmLen - 0.01);

        // 2-bone IK via law of cosines ─────────────────────────────────────────
        // cos(elbowAngle) = (a²+b²-c²) / (2ab)
        const a = R.upperLen;
        const b = R.forearmLen;
        const c = dist;
        const cosElbow = THREE.MathUtils.clamp(
            (a*a + b*b - c*c) / (2*a*b), -1, 1
        );
        const targetElbowRX = Math.PI - Math.acos(cosElbow); // 0 = fully extended

        // Shoulder pitch needed: angle to lift arm toward the candy
        // toTarget in camera-local XZ plane
        const camInv = new THREE.Matrix4().copy(this.camera.matrixWorld).invert();
        const localTarget = toTarget.clone().applyMatrix4(camInv);
        const targetPitch = Math.atan2(-localTarget.y, -localTarget.z);
        const targetPitchClamped = THREE.MathUtils.clamp(targetPitch, R.pitchRest - 0.1, R.pitchRest + 0.80);
        const targetYaw   = Math.atan2(localTarget.x, -localTarget.z) * 0.3; // subtle yaw

        // ── Phase 1: Reach out (Ease-out cubic, 260ms) ───────────────────────
        this._tween(260, p => {
            const e = 1 - Math.pow(1-p, 3);
            shoulder.rotation.x = restShoulderRX + (targetPitchClamped - restShoulderRX) * e;
            shoulder.rotation.y = targetYaw * e;
            shoulder.rotation.z = restShoulderRZ;
            elbow.rotation.x    = restElbowRX    + (targetElbowRX - restElbowRX) * e;
            wrist.rotation.x    = -0.4 * e;
            fingers.rotation.x  = -0.15 + 0.6 * e; // open slightly
        }, () => {
            // ── Snap: grasp ─────────────────────────────────────────────────
            this._graspFingers(fingers, wrist, () => {
                // ── Phase 2: Retract (ease-in cubic, 350ms) ─────────────────
                setTimeout(() => {
                    this._tween(350, p => {
                        const e = Math.pow(p, 3);
                        shoulder.rotation.x = targetPitchClamped + (restShoulderRX - targetPitchClamped) * e;
                        shoulder.rotation.y = targetYaw * (1-e);
                        elbow.rotation.x    = targetElbowRX    + (restElbowRX - targetElbowRX) * e;
                        wrist.rotation.x    = -0.4 * (1-e);
                        if (p > 0.6) {
                            const rp = (p-0.6)/0.4;
                            fingers.rotation.x = -1.5 + (-0.15 - -1.5) * rp;
                        }
                    }, () => { this.isReaching = false; });
                }, 80);
            });
        });

        // Camera micro-shake on snap
        this._cameraSnap();
    }

    /** Animate finger closure then call done() */
    _graspFingers(fingers, wrist, done) {
        this._tween(80, p => {
            fingers.rotation.x = -0.15 + 0.6*p + (-1.5 - 0.45)*p; // open→close
            wrist.rotation.x   = -0.4 + 0.5*p;
            wrist.rotation.z   = 0.25*p;
        }, () => {
            fingers.rotation.x = -1.5;
            wrist.rotation.x   =  0.1;
            wrist.rotation.z   =  0.25;
            done?.();
        });
    }

    _cameraSnap() {
        if (!this.camera) return;
        const origFOV   = this.camera.fov;
        const origPitch = this.camera.rotation.x;
        this.camera.fov = origFOV - 6;
        this.camera.rotation.x = origPitch + 0.04;
        this.camera.updateProjectionMatrix();
        this._tween(220, sp => {
            const damp = 1 - sp;
            this.camera.fov        = (origFOV-6) + 6*sp;
            this.camera.rotation.x = (origPitch+0.04) - 0.04*sp;
            this.camera.rotation.z = (Math.sin(sp*90)*0.025 + (Math.random()-0.5)*0.008) * damp;
            this.camera.updateProjectionMatrix();
        }, () => {
            this.camera.fov        = origFOV;
            this.camera.rotation.x = origPitch;
            this.camera.rotation.z = 0;
            this.camera.updateProjectionMatrix();
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  PER-FRAME UPDATE
    // ─────────────────────────────────────────────────────────────────────────

    update(time, delta) {
        if (!delta) return;

        // ── Speed estimation for walking bob ─────────────────────────────────
        if (!this.lastCamPos) this.lastCamPos = this.camera.position.clone();
        const moved = this.camera.position.distanceTo(this.lastCamPos);
        this.lastCamPos.copy(this.camera.position);
        const rawSpeed = moved / delta;
        this.smoothedSpeed = THREE.MathUtils.lerp(this.smoothedSpeed, Math.min(rawSpeed, 5), 10*delta);
        if (this.smoothedSpeed > 0.1) this.bobTime += delta * 11.5;

        // ── Procedural motions ───────────────────────────────────────────────
        const R = this.REST;

        // Slow breathing
        const breathY  =  Math.sin(time * 1.3)  * 0.016;
        const breathX  =  Math.cos(time * 0.75) * 0.009;

        // Walking figure-8 bob
        const bobY     = Math.sin(this.bobTime)      * 0.042 * (this.smoothedSpeed / 5);
        const bobX     = Math.cos(this.bobTime / 2)  * 0.038 * (this.smoothedSpeed / 5);

        const applyIdle = (arm, side) => {
            if (!arm || arm.shoulder.visible === false) return;
            const xMult = side === 'left' ? -1 : 1;
            arm.shoulder.position.x = xMult * R.shoulderX + breathX * xMult + bobX * xMult;
            arm.shoulder.position.y = R.shoulderY + breathY + bobY;
            arm.shoulder.rotation.x = R.pitchRest  + breathY * 0.35;
            arm.shoulder.rotation.z = (side === 'right' ? R.rollRight : R.rollLeft)
                                      + bobX * 0.4 * xMult;
        };

        if (!this.isReaching) {
            applyIdle(this.rightArm, 'right');
        } else {
            // While reaching: still apply bob to left arm only
        }
        applyIdle(this.leftArm, 'left');

        // ── Character mixer ──────────────────────────────────────────────────
        if (this.characterMixer) this.characterMixer.update(delta);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  UTILITY
    // ─────────────────────────────────────────────────────────────────────────

    _tween(duration, cb, done) {
        const start = performance.now();
        const step  = () => {
            const p = Math.min((performance.now()-start)/duration, 1);
            cb(p);
            if (p < 1) requestAnimationFrame(step);
            else done?.();
        };
        step();
    }
}
