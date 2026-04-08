import * as THREE from 'three';
import { CandySystem } from './candy.js';

export class MazeGenerator {
    constructor(scene) {
        this.scene = scene;
        this.walls = [];
        this.wallBoundingBoxes = []; 
        this.cellSize = 2.5;
        this.gridSize = 20;
        this.mazeData = [];
        this.candies  = [];   // Array of CandyInstance

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

        const wallMat = new THREE.MeshStandardMaterial({ 
            color: 0x1a4d1a,
            roughness: 0.9,
            metalness: 0.1
        });
        const floorMat = new THREE.MeshStandardMaterial({ 
            color: 0x3d5c1f,
            roughness: 1.0, 
            metalness: 0.0 
        });
        const wallGeo  = new THREE.BoxGeometry(this.cellSize, 4, this.cellSize);
        const floorGeo = new THREE.PlaneGeometry(this.cellSize, this.cellSize);

        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const x = (col - this.gridSize / 2) * this.cellSize;
                const z = (row - this.gridSize / 2) * this.cellSize;

                const floor = new THREE.Mesh(floorGeo, floorMat);
                floor.position.set(x, 0, z);
                floor.rotation.x = -Math.PI / 2;
                floor.receiveShadow = true;
                this.scene.add(floor);

                if (this.mazeData[row][col] === 1) {
                    const wall = new THREE.Mesh(wallGeo, wallMat);
                    wall.position.set(x, 2, z);
                    wall.castShadow    = true;
                    wall.receiveShadow = true;
                    this.scene.add(wall);
                    this.walls.push(wall);

                    const box = new THREE.Box3().setFromObject(wall);
                    this.wallBoundingBoxes.push(box);

                    if (Math.random() > 0.6) {
                        this.addFlowers(wall, x, z);
                    }
                }
            }
        }
    }

    // ── Private: place 9 candy instances ────────────────────────────────────
    _spawnCandies() {
        // 9 hardcoded grid positions [row, col]
        // Spread across all 4 quadrants — forces full maze exploration.
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

    // ── Pink flowers ─────────────────────────────────────────────────────────
    addFlowers(wall, x, z) {
        const count = 1 + Math.floor(Math.random() * 2);
        for (let i = 0; i < count; i++) {
            const geo = new THREE.PlaneGeometry(0.15, 0.15);
            const mat = new THREE.MeshStandardMaterial({
                color: 0xff69b4,
                emissive: 0xff1493,
                emissiveIntensity: 0.5,
                side: THREE.DoubleSide,
                transparent: true,
                alphaTest: 0.5
            });
            const flower = new THREE.Mesh(geo, mat);

            const face   = Math.floor(Math.random() * 4);
            const h      = 0.5 + Math.random() * 2.5;
            const offset = this.cellSize / 2 + 0.01;

            if      (face === 0) flower.position.set(x,          h, z + offset);
            else if (face === 1) flower.position.set(x,          h, z - offset);
            else if (face === 2) { flower.position.set(x + offset, h, z); flower.rotation.y = Math.PI / 2; }
            else                 { flower.position.set(x - offset, h, z); flower.rotation.y = Math.PI / 2; }

            this.scene.add(flower);
        }
    }

    // ── Collision ─────────────────────────────────────────────────────────────
    checkCollisions(position, radius = 0.5) {
        const playerBox = new THREE.Box3().setFromCenterAndSize(
            position,
            new THREE.Vector3(radius * 2, 2, radius * 2)
        );
        for (const wallBox of this.wallBoundingBoxes) {
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
