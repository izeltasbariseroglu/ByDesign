import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CandySystem } from './candy.js';

export class MazeGenerator {
    constructor(scene) {
        this.scene = scene;
        this.walls = [];
        this.wallBoundingBoxes = [];
        this.wallCenters = [];    // Parallel array: {x,z} centre of each wall (for distance culling)
        this.cellSize = 2.5;
        this.gridSize = 20;
        this.mazeData = [];
        this.candies  = [];       // Array of CandyInstance

        // CandySystem is async — spawning happens after preload()
        this.candySystem = new CandySystem(scene);

        this.generate();
    }

    /**
     * Async initialisation — called from game.js after new MazeGenerator().
     * Preloads the candy GLB and spawns the 9 instances.
     */
    async initCandies() {
        await this.candySystem.preload();
        this._spawnCandies();
    }

    generate() {
        console.log("Generating Hedge Maze (20x20 — Garden Update)...");

        this.mazeData = [
            [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
            [1,0,0,0,1,0,0,0,1,0,0,0,0,0,1,0,0,0,0,1],
            [1,0,1,0,1,0,1,0,1,0,1,1,1,0,1,0,1,1,0,1],
            [1,0,1,0,0,0,1,0,0,0,0,0,1,0,0,0,1,0,0,1],
            [1,0,1,1,1,1,1,1,1,1,1,0,1,1,1,1,1,0,1,1],
            [1,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1],
            [1,1,1,0,1,1,1,0,1,0,1,1,1,1,1,0,1,1,0,1],
            [1,0,0,0,1,0,0,0,1,0,0,0,0,0,1,0,0,1,0,1],
            [1,0,1,1,1,0,1,1,1,1,1,0,1,0,1,1,0,1,0,1],
            [1,0,1,0,0,0,1,0,0,0,1,0,1,0,0,0,0,1,0,1],
            [1,0,1,0,1,1,1,0,1,0,1,0,1,1,1,1,1,1,0,1],
            [1,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,0,0,0,1],
            [1,1,1,0,1,0,1,1,1,1,1,1,1,0,1,1,1,0,1,1],
            [1,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,1],
            [1,0,1,1,1,1,1,1,1,0,1,0,1,1,1,0,1,1,0,1],
            [1,0,1,0,0,0,0,0,1,0,1,0,0,0,0,0,0,0,0,1],
            [1,0,1,0,1,1,1,0,1,0,1,1,1,1,1,1,1,1,0,1],
            [1,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
            [1,1,1,1,1,0,1,1,1,1,1,1,1,1,1,1,1,0,0,1],
            [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
        ];

        // ── Step 1: Per-cell bounding boxes (synchronous, collision-ready from frame 0) ──
        //
        // WHY NOT GREEDY SEGMENTS HERE:
        // Greedy meshing merges cells into large rectangles. A 10-cell-wide wall
        // segment has its centre 12.5 units from its edge — far beyond the 3-unit
        // culling radius we used before. Players could walk through the boundary
        // walls because those long segments were being culled out.
        //
        // Per-cell boxes are all 2.5×2×2.5. The maximum centre-to-player distance
        // for an immediately adjacent wall cell is ~3.5 units (diagonal). With
        // CULL_DIST_SQ=25 (5 units) every relevant wall is always tested.
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                if (this.mazeData[row][col] !== 1) continue;
                const x = (col - this.gridSize / 2) * this.cellSize;
                const z = (row - this.gridSize / 2) * this.cellSize;
                this.wallBoundingBoxes.push(
                    new THREE.Box3().setFromCenterAndSize(
                        new THREE.Vector3(x, 1, z),
                        new THREE.Vector3(this.cellSize, 2, this.cellSize)
                    )
                );
                this.wallCenters.push({ x, z });
            }
        }

        // Greedy segments are still used for VISUAL walls (fewer draw calls ← correct)
        const greedySegments = this._runGreedyMesh();

        // ── Step 2: Load floor texture → create floor mesh in onLoad ─────────
        // By creating the floor mesh inside the callback, the texture is FULLY
        // LOADED before it's assigned to any material. No needsUpdate issues.
        const textureLoader = new THREE.TextureLoader();

        textureLoader.load('/assets/grass_texture.avif', (floorTexture) => {
            floorTexture.wrapS = THREE.MirroredRepeatWrapping;
            floorTexture.wrapT = THREE.MirroredRepeatWrapping;
            floorTexture.repeat.set(3, 3);

            const floorMat = new THREE.MeshStandardMaterial({
                map: floorTexture,
                color: 0xffffff,
                roughness: 1.0,
                metalness: 0.0,
            });

            const totalSize = this.gridSize * this.cellSize;
            const floorGeo  = new THREE.PlaneGeometry(totalSize, totalSize);
            const floor      = new THREE.Mesh(floorGeo, floorMat);
            floor.position.set(-this.cellSize / 2, 0, -this.cellSize / 2);
            floor.rotation.x = -Math.PI / 2;
            floor.receiveShadow = true;
            this.scene.add(floor);
            console.log('MazeGenerator: floor texture loaded and mesh created.');
        }, undefined, (err) => {
            console.warn('MazeGenerator: floor texture failed, using solid color fallback.', err);
            const floorMat = new THREE.MeshStandardMaterial({ color: 0x4a7c3f, roughness: 1.0 });
            const floor = new THREE.Mesh(
                new THREE.PlaneGeometry(this.gridSize * this.cellSize, this.gridSize * this.cellSize),
                floorMat
            );
            floor.position.set(-this.cellSize / 2, 0, -this.cellSize / 2);
            floor.rotation.x = -Math.PI / 2;
            floor.receiveShadow = true;
            this.scene.add(floor);
        });

        // ── Step 3: Load wall texture → create wall meshes in onLoad ─────────
        // CRITICAL: All Texture.clone() calls happen here, AFTER the image has
        // loaded. The clones inherit a fully-loaded image reference — so Three.js
        // can upload them to the GPU immediately without warnings or black walls.
        textureLoader.load('/assets/bush_texture.jpg', (wallTexture) => {
            wallTexture.wrapS = THREE.MirroredRepeatWrapping;
            wallTexture.wrapT = THREE.MirroredRepeatWrapping;

            const baseWallMat = new THREE.MeshStandardMaterial({
                map: wallTexture,
                color: 0xffffff,
                roughness: 0.9,
                metalness: 0.1,
            });

            greedySegments.forEach(({ x, z, w, d, width, depth }) => {
                const geo = new RoundedBoxGeometry(w + 0.4, 2, d + 0.4, 6, 0.6);

                // Safe to clone here — wallTexture.image is fully loaded
                const mat = baseWallMat.clone();
                mat.map = wallTexture.clone();
                mat.map.repeat.set(Math.max(width, depth) * 1.5, 1);

                const wall = new THREE.Mesh(geo, mat);
                wall.position.set(x, 1, z);
                wall.castShadow    = true;
                wall.receiveShadow = true;
                this.scene.add(wall);
                this.walls.push(wall);
            });

            console.log(`MazeGenerator: wall texture loaded — ${this.walls.length} wall segments built.`);
        }, undefined, (err) => {
            console.warn('MazeGenerator: wall texture failed, using solid color fallback.', err);

            const fallbackMat = new THREE.MeshStandardMaterial({ color: 0x2d6b2d, roughness: 0.9 });
            greedySegments.forEach(({ x, z, w, d }) => {
                const geo  = new RoundedBoxGeometry(w + 0.4, 2, d + 0.4, 6, 0.6);
                const wall = new THREE.Mesh(geo, fallbackMat);
                wall.position.set(x, 1, z);
                wall.castShadow    = true;
                wall.receiveShadow = true;
                this.scene.add(wall);
                this.walls.push(wall);
            });
        });
    }

    // ── Private: greedy meshing algorithm ────────────────────────────────────
    // Returns an array of segments: { x, z, w, d, width, depth }
    // x,z = world-space centre; w,d = world-space dimensions;
    // width,depth = cell counts (for texture repeat scaling)
    _runGreedyMesh() {
        const segments = [];
        const visited  = Array(this.gridSize).fill(null).map(() => Array(this.gridSize).fill(false));

        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                if (this.mazeData[row][col] !== 1 || visited[row][col]) continue;

                let width = 1;
                while (col + width < this.gridSize && this.mazeData[row][col + width] === 1 && !visited[row][col + width]) {
                    width++;
                }

                let depth = 1;
                if (width === 1) {
                    while (row + depth < this.gridSize && this.mazeData[row + depth][col] === 1 && !visited[row + depth][col]) {
                        depth++;
                    }
                }

                for (let r = 0; r < depth; r++) {
                    for (let c = 0; c < width; c++) {
                        visited[row + r][col + c] = true;
                    }
                }

                const w = width * this.cellSize;
                const d = depth * this.cellSize;
                const x = (col + width / 2 - 0.5 - this.gridSize / 2) * this.cellSize;
                const z = (row + depth / 2 - 0.5 - this.gridSize / 2) * this.cellSize;

                segments.push({ x, z, w, d, width, depth });
            }
        }

        return segments;
    }

    // ── Private: place 9 candy instances ────────────────────────────────────
    _spawnCandies() {
        const positions = [
            [2, 3],  [5, 1],  [8, 5],   // top-left quadrant
            [12, 1], [15, 3], [18, 5],  // bottom-left quadrant
            [3, 15], [9, 14], [16, 18]  // right side
        ];

        positions.forEach(([row, col]) => {
            const x = (col - this.gridSize / 2) * this.cellSize;
            const z = (row - this.gridSize / 2) * this.cellSize;

            const instance = this.candySystem.spawnAt(x, 0.8, z);
            if (instance) this.candies.push(instance);
        });

        console.log(`MazeGenerator: ${this.candies.length} candy instances spawned.`);
    }

    // ── Collision ─────────────────────────────────────────────────────────────
    // Spatial distance filter: only the ~2-6 nearest walls are Box3-tested
    // per frame, instead of iterating the full list (O(N) → O(k)).
    checkCollisions(position, radius = 0.5) {
        const playerBox = new THREE.Box3().setFromCenterAndSize(
            position,
            new THREE.Vector3(radius * 2, 2, radius * 2)
        );
        const CULL_DIST_SQ = 5 * 5; // Only test walls within 5 units (per-cell boxes: max diagonal ~3.5u)
        for (let i = 0; i < this.wallBoundingBoxes.length; i++) {
            const wallBox    = this.wallBoundingBoxes[i];
            const wallCenter = this.wallCenters[i];
            const dx = position.x - wallCenter.x;
            const dz = position.z - wallCenter.z;
            if (dx * dx + dz * dz > CULL_DIST_SQ) continue;
            if (playerBox.intersectsBox(wallBox)) return true;
        }
        return false;
    }

    // ── Per-frame update (candy animations) ──────────────────────────────────
    update(time) {
        this.candies.forEach(candy => candy.update(time));
    }

    getMazeInfo() {
        return { data: this.mazeData, gridSize: this.gridSize, cellSize: this.cellSize };
    }
}
