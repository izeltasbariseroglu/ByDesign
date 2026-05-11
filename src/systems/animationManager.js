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
    constructor(camera, viewmodelCamera, scene, loadingManager = null) {
        this.camera        = camera;
        this.viewmodelCamera = viewmodelCamera || camera;
        this.scene         = scene;
        this.loadingManager = loadingManager;

        // Character model
        this.characterModel  = null;
        this.characterMixer  = null;
        this.kneelAction     = null;
        this.isKneeling      = false;

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


        this._loadCharacterModel();
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

    reachOut(targetWorldPos) {
        // REACH OUT ANIMATION REMOVED
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  PER-FRAME UPDATE
    // ─────────────────────────────────────────────────────────────────────────

    update(time, delta) {
        if (!delta) return;

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
