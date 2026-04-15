import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class AnimationManager {
    constructor(camera, scene) {
        this.camera = camera;
        this.scene = scene;

        // === POV Arms (SkinnedMesh — always visible POV) ===
        this.leftArm = null;
        this.rightArm = null;

        // === Character Model (GLTF) ===
        this.characterModel = null;
        this.characterMixer = null;
        this.kneelAction = null;
        this.isKneeling = false;

        this._createArms();
        this._loadCharacterModel();
    }

    // ─────────────────────────────────────────────────────
    //  POV ARMS  (SkinnedMesh, always camera-attached)
    // ─────────────────────────────────────────────────────

    _createArms() {
        this.leftArm  = this._buildArm(-0.38);
        this.rightArm = this._buildArm( 0.38);
        this.camera.add(this.leftArm);
        this.camera.add(this.rightArm);
    }

    _buildArm(offsetX) {
        const segmentH = 0.4;
        const segCount = 2;
        const totalH   = segmentH * segCount;
        const halfH    = totalH / 2;

        // Geometry with skinning attributes
        const geo = new THREE.CylinderGeometry(0.055, 0.075, totalH, 8, segCount * 4, true);
        const positions = geo.attributes.position;
        const skinIndices = [];
        const skinWeights = [];

        for (let i = 0; i < positions.count; i++) {
            const y      = positions.getY(i) + halfH;
            const boneId = Math.min(Math.floor(y / segmentH), segCount - 1);
            const t      = (y % segmentH) / segmentH;
            skinIndices.push(boneId, boneId + 1, 0, 0);
            skinWeights.push(1 - t, t, 0, 0);
        }

        geo.setAttribute('skinIndex',  new THREE.Uint16BufferAttribute(skinIndices, 4));
        geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

        const mat = new THREE.MeshStandardMaterial({
            color: 0xe8c99a, // warm skin
            roughness: 0.75,
        });

        // Bones
        const root   = new THREE.Bone(); root.position.y   = -halfH;
        const middle = new THREE.Bone(); middle.position.y = segmentH;
        const tip    = new THREE.Bone(); tip.position.y    = segmentH;
        root.add(middle);
        middle.add(tip);
        const bones    = [root, middle, tip];
        const skeleton = new THREE.Skeleton(bones);

        const mesh = new THREE.SkinnedMesh(geo, mat);
        mesh.add(root);
        mesh.bind(skeleton);

        // Position in camera-space: lower-forward, angled slightly down
        mesh.position.set(offsetX, -0.28, -0.15);
        mesh.rotation.x = -0.4;

        return mesh;
    }

    // ─────────────────────────────────────────────────────
    //  GLB CHARACTER MODEL
    // ─────────────────────────────────────────────────────

    _loadCharacterModel() {
        const loader = new GLTFLoader();
        loader.load(
            '/assets/pastel dress doll 3d model.glb',
            (gltf) => {
                this.characterModel = gltf.scene;

                // Start invisible — only shown from BREAK onwards
                this.characterModel.visible = false;

                // Scale and position at player start
                this.characterModel.scale.set(1, 1, 1);
                this.characterModel.position.set(-22.5, 0, -22.5);

                this.scene.add(this.characterModel);

                // Post-load texture sanitization:
                // GLTFLoader marks all embedded textures with needsUpdate=true upon
                // parse completion. If the model is rendered (even via shadow map)
                // before the GPU has processed the images, Three.js logs:
                // "Texture marked for update but no image data found."
                // Reset here — Three.js will re-set needsUpdate when actually needed.
                const TEX_SLOTS = ['map','normalMap','roughnessMap','metalnessMap','emissiveMap','aoMap'];
                this.characterModel.traverse((node) => {
                    if (!node.isMesh) return;
                    // Keep shadow disabled while invisible; revealCharacter() can re-enable
                    node.castShadow    = false;
                    node.receiveShadow = false;
                    const mats = Array.isArray(node.material) ? node.material : [node.material];
                    mats.forEach(mat => {
                        if (!mat) return;
                        TEX_SLOTS.forEach(slot => {
                            if (mat[slot]) mat[slot].needsUpdate = false;
                        });
                    });
                });

                // AnimationMixer
                if (gltf.animations && gltf.animations.length > 0) {
                    this.characterMixer = new THREE.AnimationMixer(this.characterModel);

                    // Look for a 'kneel' clip
                    const kneelClip = THREE.AnimationClip.findByName(gltf.animations, 'kneel')
                        || THREE.AnimationClip.findByName(gltf.animations, 'Kneel')
                        || gltf.animations[0]; // fallback to first clip

                    if (kneelClip) {
                        this.kneelAction = this.characterMixer.clipAction(kneelClip);
                        this.kneelAction.loop  = THREE.LoopOnce;
                        this.kneelAction.clampWhenFinished = true;
                    }
                }

                console.log('AnimationManager: GLB model loaded —', gltf.animations.length, 'animations');
            },
            (progress) => {
                const pct = Math.round((progress.loaded / progress.total) * 100);
                console.log(`AnimationManager: loading GLB ${pct}%`);
            },
            (error) => {
                console.error('AnimationManager: GLB load failed —', error);
                console.warn('AnimationManager: Proceeding without external character model.');
            }
        );
    }

    // ─────────────────────────────────────────────────────
    //  STATE TRANSITIONS
    // ─────────────────────────────────────────────────────

    /** Call when BREAK state starts (120s) — reveal the model */
    showCharacter(playerPosition) {
        if (this.characterModel) {
            this.characterModel.position.copy(playerPosition);
            this.characterModel.position.y = 0;
            this.characterModel.visible = true;

            // Hide POV arms since we're no longer first-person
            this.leftArm.visible  = false;
            this.rightArm.visible = false;
        }
    }

    /** Call at 150s — play kneel or procedural fallback */
    triggerKneel() {
        if (this.isKneeling) return;
        this.isKneeling = true;

        if (this.characterMixer && this.kneelAction) {
            // Use GLB animation
            this.kneelAction.reset().play();
            console.log('AnimationManager: Playing GLB kneel animation');
        } else {
            // Procedural fallback: rotate leg bones
            this._proceduralKneel();
        }
    }

    _proceduralKneel() {
        if (!this.characterModel) return;

        // Walk bone hierarchy to find UpperLeg / LowerLeg equivalents
        const targets = [];
        this.characterModel.traverse((node) => {
            if (node.isBone) {
                const n = node.name.toLowerCase();
                if (n.includes('upleg') || n.includes('thigh') || n.includes('upperleg') ||
                    n.includes('lowleg') || n.includes('calf') || n.includes('lowerleg') ||
                    n.includes('shin'))
                {
                    targets.push(node);
                }
            }
        });

        if (targets.length === 0) {
            console.warn('AnimationManager: No leg bones found for procedural kneel. Trying all bones.');
            // hard fallback — just lower the model
            const start = { y: this.characterModel.position.y };
            const end   = start.y - 0.8;
            this._tweenY(this.characterModel, start.y, end, 1500);
            return;
        }

        // Apply rotation to each relevant bone
        targets.forEach(bone => {
            const isUpper = bone.name.toLowerCase().includes('up') || bone.name.toLowerCase().includes('thigh');
            const targetRotX = isUpper ? Math.PI / 3 : -Math.PI / 2.5;
            this._tweenBoneRotX(bone, 0, targetRotX, 1500);
        });

        console.log('AnimationManager: Procedural kneel applied to', targets.length, 'bones');
    }

    _tweenBoneRotX(bone, from, to, duration) {
        const start = performance.now();
        const animate = () => {
            const p    = Math.min((performance.now() - start) / duration, 1);
            const ease = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;
            bone.rotation.x = from + (to - from) * ease;
            if (p < 1) requestAnimationFrame(animate);
        };
        animate();
    }

    _tweenY(obj, from, to, duration) {
        const start = performance.now();
        const animate = () => {
            const p    = Math.min((performance.now() - start) / duration, 1);
            const ease = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;
            obj.position.y = from + (to - from) * ease;
            if (p < 1) requestAnimationFrame(animate);
        };
        animate();
    }

    // ─────────────────────────────────────────────────────
    //  REACH ANIMATION  (candy collection — POV only)
    // ─────────────────────────────────────────────────────

    reachOut() {
        const duration = 450;
        const start    = performance.now();
        const arm      = this.rightArm;
        if (!arm || !arm.skeleton) return;

        const animate = () => {
            const p    = Math.min((performance.now() - start) / duration, 1);
            const ease = p * (2 - p);
            arm.skeleton.bones[0].rotation.x = -Math.PI / 3 * ease;
            arm.skeleton.bones[1].rotation.x = -Math.PI / 4 * ease;
            if (p < 1) {
                requestAnimationFrame(animate);
            } else {
                setTimeout(() => this._resetArm(arm), 250);
            }
        };
        animate();
    }

    _resetArm(arm) {
        const duration = 450;
        const start    = performance.now();
        const startR0  = arm.skeleton.bones[0].rotation.x;
        const startR1  = arm.skeleton.bones[1].rotation.x;

        const animate = () => {
            const p = Math.min((performance.now() - start) / duration, 1);
            arm.skeleton.bones[0].rotation.x = startR0 * (1 - p);
            arm.skeleton.bones[1].rotation.x = startR1 * (1 - p);
            if (p < 1) requestAnimationFrame(animate);
        };
        animate();
    }

    // ─────────────────────────────────────────────────────
    //  PER-FRAME UPDATE
    // ─────────────────────────────────────────────────────

    update(time, delta) {
        // Idle sway for POV arms
        if (this.leftArm.visible) {
            const sway = Math.sin(time * 1.8) * 0.04;
            this.leftArm.position.y  = -0.28 + sway;
            this.rightArm.position.y = -0.28 + sway;
            this.leftArm.position.x  = -0.38 + Math.cos(time * 0.9) * 0.015;
            this.rightArm.position.x =  0.38 - Math.cos(time * 0.9) * 0.015;
        }

        // Tick character AnimationMixer
        if (this.characterMixer) {
            this.characterMixer.update(delta);
        }
    }
}
