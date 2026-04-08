import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * CandySystem — GLB-based candy with single-load + clone architecture.
 * 
 * Usage:
 *   const system = new CandySystem(scene);
 *   await system.preload();              // Load GLB once
 *   const inst = system.spawnAt(x,y,z); // Returns a live CandyInstance
 *   inst.update(time);                  // Animate
 *   inst.mesh.parent → still in scene? → can be collected
 */

// ── Individual candy instance wrapper ──────────────────────────────────────
export class CandyInstance {
    constructor(mesh) {
        this.mesh  = mesh;
        this.baseY = mesh.position.y;
        this.rotationOffset = Math.random() * Math.PI * 2; // stagger rotation phase
    }

    update(time) {
        if (!this.mesh.parent) return; // already removed from scene
        // Floating sine wave
        this.mesh.position.y = this.baseY + Math.sin(time * 2 + this.rotationOffset) * 0.12;
        // Slow spin
        this.mesh.rotation.y += 0.018;
    }

    /** Returns the centre world-position of this candy (for distance checks) */
    getWorldPosition() {
        const pos = new THREE.Vector3();
        this.mesh.getWorldPosition(pos);
        return pos;
    }

    /** Alias kept for backward-compat with game.js collection check */
    getMesh() {
        return this.mesh;
    }
}

// ── GLB loader + clone factory ─────────────────────────────────────────────
export class CandySystem {
    constructor(scene) {
        this.scene       = scene;
        this._template   = null;   // the raw loaded GLTF scene object
        this._loaded     = false;
        this._loader     = new GLTFLoader();
    }

    /**
     * Load the GLB once. Returns a Promise that resolves when ready.
     * Call this before calling spawnAt().
     */
    preload() {
        return new Promise((resolve, reject) => {
            this._loader.load(
                '/assets/pastel striped candy 3d model.glb',
                (gltf) => {
                    this._template = gltf.scene;

                    // ── Normalise scale so candy fits in ~0.7 units ────────
                    const box    = new THREE.Box3().setFromObject(this._template);
                    const size   = new THREE.Vector3();
                    box.getSize(size);
                    const maxDim = Math.max(size.x, size.y, size.z);
                    const target = 0.7;                          // desired max dimension
                    const scale  = maxDim > 0 ? target / maxDim : 1;
                    this._template.scale.setScalar(scale);

                    // Ensure each mesh casts / receives shadows
                    this._template.traverse((node) => {
                        if (node.isMesh) {
                            node.castShadow    = true;
                            node.receiveShadow = true;
                        }
                    });

                    this._loaded = true;
                    console.log(`CandySystem: GLB loaded — scale normalised to ${scale.toFixed(3)}`);
                    resolve();
                },
                undefined,
                (err) => {
                    console.error('CandySystem: GLB load failed —', err);
                    console.warn('CandySystem: Using procedural fallback geometry.');
                    this._buildFallback();
                    resolve(); // still resolve so the game continues
                }
            );
        });
    }

    /** Procedural fallback (sphere + purple cones) if GLB is missing */
    _buildFallback() {
        this._template = new THREE.Group();

        const bodyGeo = new THREE.SphereGeometry(0.3, 20, 20);
        const bodyMat = new THREE.MeshStandardMaterial({
            color: 0xff69b4,
            roughness: 0.25,
            metalness: 0.1
        });
        this._template.add(new THREE.Mesh(bodyGeo, bodyMat));

        const cGeo = new THREE.ConeGeometry(0.18, 0.38, 10);
        const cMat = new THREE.MeshStandardMaterial({ color: 0x800080, roughness: 0.5 });

        const lCone = new THREE.Mesh(cGeo, cMat);
        lCone.position.x = -0.34;
        lCone.rotation.z  =  Math.PI / 2;
        this._template.add(lCone);

        const rCone = new THREE.Mesh(cGeo, cMat);
        rCone.position.x =  0.34;
        rCone.rotation.z = -Math.PI / 2;
        this._template.add(rCone);

        this._loaded = true;
    }

    /**
     * Clone the template and place it at (x, y, z).
     * Returns a CandyInstance.
     */
    spawnAt(x, y, z) {
        if (!this._loaded) {
            console.warn('CandySystem.spawnAt() called before preload() resolved — skipping.');
            return null;
        }

        // SkeletonUtils.clone handles skinned meshes safely;
        // falls back gracefully to plain .clone() for static meshes.
        let clone;
        try {
            clone = SkeletonUtils.clone(this._template);
        } catch (_) {
            clone = this._template.clone(true);
        }

        clone.position.set(x, y, z);
        this.scene.add(clone);

        return new CandyInstance(clone);
    }
}
