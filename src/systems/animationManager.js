import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VIEWMODEL_LAYER } from '../core/game.js';

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
    constructor(camera, viewmodelCamera, scene, loadingManager = null) {
        this.camera        = camera;
        this.viewmodelCamera = viewmodelCamera || camera;
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

        // AAA Standard Root Offset
        // T-Rex duruşunu engellemek için omuz geriye (-0.05) çekildi.
        // Omuzlar ekranın altında kalmasın diye Y ekseninde yukarı kaldırıldı (-0.08)
        this.shoulderPivot = new THREE.Group();
        this.shoulderPivot.position.set(0, -0.08, -0.05);
        this.viewmodelCamera.add(this.shoulderPivot);


        // Rest-pose constants (camera-local)
        this.REST = {
            shoulderX  : 0.40,   // omuz genişliği — kenarlara açıldı (T-Rex fix)
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
        // 1. SİYAH KOL HATASI DÜZELTMESİ: MeshLambertMaterial kullanıldı.
        this.skinMat = new THREE.MeshLambertMaterial({ 
            map: new THREE.TextureLoader().load('/assets/skin_texture.png'), 
            color: 0xffffff 
        });

        this.rightArm = this._buildOneArm( this.REST.shoulderX, this.REST.rollRight, false);
        this.leftArm  = this._buildOneArm(-this.REST.shoulderX, this.REST.rollLeft,  true );

        // KRİTİK: Işıklandırma ve Layer sorunu için son dokunuş
        this.rightArm.shoulder.traverse((child) => { child.layers.set(2); });
        this.leftArm.shoulder.traverse((child) => { child.layers.set(2); });
    }

    _buildOneArm(offsetX, rollZ, isLeft) {
        const R = this.REST;

        // ShoulderGroup
        const shoulder = new THREE.Group();
        shoulder.position.set(offsetX, R.shoulderY, 0);
        shoulder.rotation.x = R.pitchRest;
        shoulder.rotation.z = rollZ;
        this._assignLayer(shoulder);

        // UpperArmMesh
        const upperArmMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.05, 0.4, 16),
            this.skinMat
        );
        upperArmMesh.position.y = -0.2; // Merkeze değil, üstüne pivot
        this._assignLayer(upperArmMesh);
        shoulder.add(upperArmMesh);

        // ElbowGroup
        const elbow = new THREE.Group();
        elbow.position.y = -0.4;
        shoulder.add(elbow);

        // ForearmMesh
        const forearmMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.04, 0.35, 16),
            this.skinMat
        );
        forearmMesh.position.y = -0.175;
        this._assignLayer(forearmMesh);
        elbow.add(forearmMesh);

        // WristGroup
        const wrist = new THREE.Group();
        wrist.position.y = -0.35;
        elbow.add(wrist);

        // HandMesh (2. GÖRÜNMEYEN EL HATASI DÜZELTMESİ)
        const HandMesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, 0.12, 0.04),
            this.skinMat
        );
        HandMesh.position.y = -0.06; // Bileğin ucunda
        this._assignLayer(HandMesh);
        wrist.add(HandMesh); // KESİNLİKLE EKLENDİ

        const armData = { shoulder, elbow, wrist, hand: HandMesh };
        shoulder.userData = armData;

        this.shoulderPivot.add(shoulder);
        return armData;
    }

    /** Ensure an object is never frustum-culled and is assigned to VIEWMODEL_LAYER */
    _assignLayer(obj) {
        obj.frustumCulled = false;
        obj.layers.set(VIEWMODEL_LAYER);
        obj.traverse(child => { 
            child.frustumCulled = false; 
            child.layers.set(VIEWMODEL_LAYER);
        });
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

                    // Eski porcelainMat kopyalama mantığı iptal edildi (Kullanıcı yeni skinMat istemişti).

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

        const { shoulder, elbow, wrist } = arm;

        // ── Snapshot rest rotations ──────────────────────────────────────────
        const restShoulderRX = shoulder.rotation.x;
        const restElbowRX    = elbow.rotation.x;
        const restWristRX    = wrist.rotation.x;

        // ── Phase 1: Reach out (FK Tween) ────────────────────────────────────
        this._tween(260, p => {
            const e = 1 - Math.pow(1-p, 3); // Ease-out cubic
            shoulder.rotation.x = restShoulderRX - 0.8 * e;
            elbow.rotation.x    = restElbowRX - 0.5 * e; // Dirsek bükülüyor
            wrist.rotation.x    = restWristRX - 0.3 * e; // El şekere açılıyor
        }, () => {
            // ── Phase 2: Retract (500ms yumuşak dönüş) ──────────────────
            setTimeout(() => {
                this._tween(500, p => {
                    const e = Math.pow(p, 3); // Ease-in cubic
                    shoulder.rotation.x = (restShoulderRX - 0.8) + 0.8 * e;
                    elbow.rotation.x    = (restElbowRX - 0.5) + 0.5 * e;
                    wrist.rotation.x    = (restWristRX - 0.3) + 0.3 * e;
                }, () => { this.isReaching = false; });
            }, 80);
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
        // Hız 11.5'ten 5.0'a düşürüldü (Pervane gibi sallanma düzeltildi)
        if (this.smoothedSpeed > 0.1) this.bobTime += delta * 5.0;

        // ── Camera Rotation Lag (Weapon Sway / Damped Harmonic Oscillator) ───
        const currentRot = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.camera.rotation.x, this.camera.rotation.y, 0, 'YXZ'));
        if (!this.smoothedCamRot) this.smoothedCamRot = currentRot.clone();
        
        // Slerp towards current rotation (Damping effect - 8.0'den 18.0'e çıkarılarak sıkı tutunma sağlandı)
        this.smoothedCamRot.slerp(currentRot, 18.0 * delta);
        
        // Calculate the difference (Lag)
        const currentInv = currentRot.clone().invert();
        const lagQuat = currentInv.multiply(this.smoothedCamRot);
        
        // Clamp (Kopmayı engelle) - Maksimum sapma açısını kısıtla
        const lagAngle = lagQuat.angleTo(new THREE.Quaternion());
        if (lagAngle > 0.06) {
            lagQuat.slerp(new THREE.Quaternion(), 1 - (0.06 / lagAngle));
        }
        
        // Apply lagQuat to shoulder pivot to create realistic inertia
        this.shoulderPivot.quaternion.slerp(lagQuat, 1.0);

        // ── Procedural motions ───────────────────────────────────────────────
        const R = this.REST;

        // Slow breathing (Sine wave)
        const breathY  =  Math.sin(time * 1.5)  * 0.006;
        const breathX  =  Math.cos(time * 0.8)  * 0.003;

        // Walk Bob (Lissajous Curve - Base values for phase shifting)
        const bobAmt = Math.min(this.smoothedSpeed / 6, 1.0); 
        const a = this.bobTime; 
        
        // Ready Stance Offset (Yürürken kolları hafifçe yukarı kaldır)
        const readyStanceY = 0.04 * bobAmt; 

        // Apply global offsets to pivot (nefes alma ve ready stance)
        // Yürüme salınımını (bobY) Pivot'tan çıkardık, kollara özel uygulanacak (Phase shift için)
        this.shoulderPivot.position.set(0 + breathX, -0.08 + breathY + readyStanceY, -0.05);

        const applyIdle = (arm, side) => {
            if (!arm || arm.shoulder.visible === false) return;
            const isLeft = side === 'left';
            const xMult = isLeft ? -1 : 1;
            
            // Phase Shift: Sağ ve Sol kol asenkron çalışsın (Tam Ters Simetri)
            const phaseOffset = isLeft ? 0 : Math.PI; 
            
            // Yürüme Formülü Kilitlendi: Math.sin(time * walkSpeed + phase)
            // Böylece biri çıkarken diğeri tam olarak iniyor
            const armBobY = Math.sin(this.bobTime + phaseOffset) * 0.140 * bobAmt; 
            const armBobX = Math.sin(this.bobTime * 0.5 + phaseOffset) * 0.075 * bobAmt; // X ekseninde yarım hız
            
            // Kolların bireysel Y salınımı
            arm.shoulder.position.y = R.shoulderY - armBobY;
            // Kolların X salınımı (yanlara)
            arm.shoulder.position.x = (isLeft ? -R.shoulderX : R.shoulderX) + armBobX;
            
            // Sadece lokal rotasyonlar uygulanır
            arm.shoulder.rotation.x = R.pitchRest + breathY * 0.35;
            arm.shoulder.rotation.z = (side === 'right' ? R.rollRight : R.rollLeft) + armBobX * 0.4 * xMult;
        };

        if (!this.isReaching) {
            applyIdle(this.rightArm, 'right');
            applyIdle(this.leftArm, 'left');
        } else {
            applyIdle(this.rightArm, 'right');
            // Left arm is handled by reaching tween, but we still want its bobY/X positions!
            // Tween overrides rotation, so we can still apply bob to position safely.
            const armBobY = Math.sin(this.bobTime) * 0.140 * bobAmt; // phase 0 for left arm
            const armBobX = Math.sin(this.bobTime * 0.5) * 0.075 * bobAmt;
            this.leftArm.shoulder.position.y = R.shoulderY - armBobY;
            this.leftArm.shoulder.position.x = -R.shoulderX + armBobX;
        }

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
