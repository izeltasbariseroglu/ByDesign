import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
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

        const textureLoader = new THREE.TextureLoader();
        
        // Wall texture
        const wallTexture = textureLoader.load('/assets/bush_texture.jpg');
        wallTexture.wrapS = THREE.MirroredRepeatWrapping;
        wallTexture.wrapT = THREE.MirroredRepeatWrapping;
        
        const baseWallMat = new THREE.MeshStandardMaterial({ 
            map: wallTexture,
            color: 0xffffff,
            roughness: 0.9,
            metalness: 0.1
        });

        // Floor texture
        const floorTexture = textureLoader.load('/assets/grass_texture.avif');
        floorTexture.wrapS = THREE.MirroredRepeatWrapping;
        floorTexture.wrapT = THREE.MirroredRepeatWrapping;
        // Tile smoothly across the whole map rather than tiny patches
        floorTexture.repeat.set(3, 3); 

        const floorMat = new THREE.MeshStandardMaterial({ 
            map: floorTexture,
            color: 0xffffff,
            roughness: 1.0, 
            metalness: 0.0 
        });
        
        // Single unified massive floor plane (seamless)
        const totalSize = this.gridSize * this.cellSize;
        const floorGeo = new THREE.PlaneGeometry(totalSize, totalSize);
        const floor = new THREE.Mesh(floorGeo, floorMat);
        
        // Center the 50x50 map over the maze layout
        floor.position.set(-this.cellSize / 2, 0, -this.cellSize / 2);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        this.scene.add(floor);
        
        // Greedy meshing for continuous walls
        const visited = Array(this.gridSize).fill(null).map(() => Array(this.gridSize).fill(false));

        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                if (this.mazeData[row][col] === 1 && !visited[row][col]) {
                    
                    let width = 1;
                    // Check horizontal span
                    while (col + width < this.gridSize && this.mazeData[row][col + width] === 1 && !visited[row][col + width]) {
                        width++;
                    }
                    
                    let depth = 1;
                    // If no horizontal span, check vertical span
                    if (width === 1) {
                        while (row + depth < this.gridSize && this.mazeData[row + depth][col] === 1 && !visited[row + depth][col]) {
                            depth++;
                        }
                    }

                    // Mark as visited
                    for (let r = 0; r < depth; r++) {
                        for (let c = 0; c < width; c++) {
                            visited[row + r][col + c] = true;
                        }
                    }

                    // Dimensions
                    const w = width * this.cellSize;
                    const d = depth * this.cellSize;
                    
                    // Create continuous rounded geometry spanning entire block
                    const geo = new RoundedBoxGeometry(w + 0.4, 2, d + 0.4, 6, 0.6);
                    
                    // Clone material to scale texture nicely along the block
                    const mat = baseWallMat.clone();
                    mat.map = baseWallMat.map.clone();
                    mat.map.repeat.set(Math.max(width, depth) * 1.5, 1);

                    const x = (col + width / 2 - 0.5 - this.gridSize / 2) * this.cellSize;
                    const z = (row + depth / 2 - 0.5 - this.gridSize / 2) * this.cellSize;

                    const wall = new THREE.Mesh(geo, mat);
                    wall.position.set(x, 1, z);
                    wall.castShadow    = true;
                    wall.receiveShadow = true;
                    this.scene.add(wall);
                    this.walls.push(wall);

                    const box = new THREE.Box3().setFromCenterAndSize(
                        new THREE.Vector3(x, 1, z),
                        new THREE.Vector3(w, 2, d)
                    );
                    this.wallBoundingBoxes.push(box);
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
