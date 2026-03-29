import * as THREE from 'three';

export class MazeGenerator {
    constructor(scene) {
        this.scene = scene;
        this.walls = [];
        this.wallBoundingBoxes = []; 
        this.cellSize = 2.5; // Final narrow scale
        this.gridSize = 12;
        this.mazeData = [];
        this.torches = []; // For flickering effect
        
        this.initTextures();
        this.generate();
    }

    initTextures() {
        const loader = new THREE.TextureLoader();
        // Use a more stone-like texture. Brick bump is greyscale and stony.
        this.wallTexture = loader.load('https://threejs.org/examples/textures/brick_bump.jpg');
        this.wallTexture.wrapS = THREE.RepeatWrapping;
        this.wallTexture.wrapT = THREE.RepeatWrapping;
        this.wallTexture.repeat.set(2, 2);
    }

    generate() {
        console.log("Generating Medieval Dungeon...");

        this.mazeData = [
            [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
            [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1],
            [1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 0, 1],
            [1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1],
            [1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 0, 1],
            [1, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1],
            [1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1],
            [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
            [1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1],
            [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
            [1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1],
            [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
        ];

        const wallMat = new THREE.MeshPhongMaterial({ 
            map: this.wallTexture, 
            bumpMap: this.wallTexture,
            color: 0x888888, // Grey stone blocks
            shininess: 5,
            bumpScale: 0.1
        });
        const floorMat = new THREE.MeshPhongMaterial({ color: 0x111111 }); // Plain dark grey
        const wallGeo = new THREE.BoxGeometry(this.cellSize, 4, this.cellSize);

        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const x = (col - this.gridSize / 2) * this.cellSize;
                const z = (row - this.gridSize / 2) * this.cellSize;

                // Floor
                const floorGeo = new THREE.PlaneGeometry(this.cellSize, this.cellSize);
                const floor = new THREE.Mesh(floorGeo, floorMat);
                floor.position.set(x, 0, z);
                floor.rotation.x = -Math.PI / 2;
                this.scene.add(floor);

                // Ceiling
                const ceiling = new THREE.Mesh(floorGeo, new THREE.MeshPhongMaterial({ color: 0x050505 }));
                ceiling.position.set(x, 3.8, z);
                ceiling.rotation.x = Math.PI / 2;
                this.scene.add(ceiling);

                if (this.mazeData[row][col] === 1) {
                    const wall = new THREE.Mesh(wallGeo, wallMat);
                    wall.position.set(x, 2, z);
                    this.scene.add(wall);
                    this.walls.push(wall);
                    
                    const box = new THREE.Box3().setFromObject(wall);
                    this.wallBoundingBoxes.push(box);
                } else {
                    this.tryAddTorch(row, col, x, z);
                }
            }
        }

        this.scene.add(new THREE.AmbientLight(0xffffff, 0.05)); 
    }

    tryAddTorch(row, col, x, z) {
        const neighbors = [
            { r: -1, c: 0, offset: [0, 2.2, -this.cellSize/2 + 0.1], rot: [0, 0, 0] }, 
            { r: 1, c: 0, offset: [0, 2.2, this.cellSize/2 - 0.1], rot: [0, Math.PI, 0] },
            { r: 0, c: -1, offset: [-this.cellSize/2 + 0.1, 2.2, 0], rot: [0, Math.PI/2, 0] },
            { r: 0, c: 1, offset: [this.cellSize/2 - 0.1, 2.2, 0], rot: [0, -Math.PI/2, 0] }
        ];

        for (const n of neighbors) {
            const nr = row + n.r;
            const nc = col + n.c;
            if (this.mazeData[nr] && this.mazeData[nr][nc] === 1) {
                const torchGeo = new THREE.CylinderGeometry(0.05, 0.02, 0.6);
                const torchMat = new THREE.MeshBasicMaterial({ color: 0x442200 });
                const torch = new THREE.Mesh(torchGeo, torchMat);
                torch.position.set(x + n.offset[0], n.offset[1], z + n.offset[2]);
                torch.rotation.set(0.4, n.rot[1], 0);
                this.scene.add(torch);

                const light = new THREE.PointLight(0xff7700, 5, 12); // Reduced intensity
                light.position.set(x + n.offset[0] * 0.95, n.offset[1] + 0.3, z + n.offset[2] * 0.95);
                this.scene.add(light);
                
                this.torches.push({ light, life: Math.random() * 10 });
                return; 
            }
        }
    }

    updateTorches(time) {
        for (const t of this.torches) {
            t.light.intensity = 4 + Math.sin(time * 10 + t.life) * 1.5 + Math.random() * 1.0;
        }
    }

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

    getMazeInfo() {
        return { data: this.mazeData, gridSize: this.gridSize, cellSize: this.cellSize };
    }
}
