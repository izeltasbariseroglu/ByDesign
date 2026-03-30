import * as THREE from 'three';

export class MazeGenerator {
    constructor(scene) {
        this.scene = scene;
        this.walls = [];
        this.wallBoundingBoxes = []; 
        this.cellSize = 2.5;
        this.gridSize = 20; // 12 -> 20: %100'den fazla büyüme (alan: 4x)
        this.mazeData = [];
        this.torches = [];
        
        this.initTextures();
        this.generate();
    }

    initTextures() {
        const loader = new THREE.TextureLoader();
        // FIX: Texture bundled locally — was external CDN (threejs.org), now served from /public/assets/
        this.wallTexture = loader.load('/assets/brick_bump.jpg');
        this.wallTexture.wrapS = THREE.RepeatWrapping;
        this.wallTexture.wrapT = THREE.RepeatWrapping;
        this.wallTexture.repeat.set(2, 2);
    }

    generate() {
        console.log("Generating Complex Medieval Dungeon (20x20)...");

        // 20x20 karmaşık labirent - çok daha fazla yol, çıkmaz sokak ve yanıltıcı kavşak
        // 0 = yol, 1 = duvar
        // Çıkış: [17, 17] (sağ alt köşe)
        // Başlangıç: [1, 1] (sol üst köşe)
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

        const wallMat = new THREE.MeshPhongMaterial({ 
            map: this.wallTexture, 
            bumpMap: this.wallTexture,
            color: 0x888888,
            shininess: 5,
            bumpScale: 0.1
        });
        const floorMat = new THREE.MeshPhongMaterial({ color: 0x111111 });
        const wallGeo = new THREE.BoxGeometry(this.cellSize, 4, this.cellSize);
        const ceilingMat = new THREE.MeshPhongMaterial({ color: 0x050505 });

        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const x = (col - this.gridSize / 2) * this.cellSize;
                const z = (row - this.gridSize / 2) * this.cellSize;

                const floorGeo = new THREE.PlaneGeometry(this.cellSize, this.cellSize);
                const floor = new THREE.Mesh(floorGeo, floorMat);
                floor.position.set(x, 0, z);
                floor.rotation.x = -Math.PI / 2;
                this.scene.add(floor);

                const ceiling = new THREE.Mesh(floorGeo, ceilingMat);
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

        // Ambient son derece düşük - sadece meşaleler aydınlatsın
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.04)); 
    }

    tryAddTorch(row, col, x, z) {
        const neighbors = [
            { r: -1, c: 0, offset: [0, 2.2, -this.cellSize/2 + 0.1], rot: [0, 0, 0] }, 
            { r: 1,  c: 0, offset: [0, 2.2,  this.cellSize/2 - 0.1], rot: [0, Math.PI, 0] },
            { r: 0, c: -1, offset: [-this.cellSize/2 + 0.1, 2.2, 0], rot: [0, Math.PI/2, 0] },
            { r: 0,  c: 1, offset: [ this.cellSize/2 - 0.1, 2.2, 0], rot: [0, -Math.PI/2, 0] }
        ];

        for (const n of neighbors) {
            const nr = row + n.r;
            const nc = col + n.c;
            if (this.mazeData[nr] && this.mazeData[nr][nc] === 1) {
                const torchGeo = new THREE.CylinderGeometry(0.05, 0.02, 0.6);
                const torchMat = new THREE.MeshBasicMaterial({ color: 0x442200 });
                const torch = new THREE.Mesh(torchGeo, torchMat);
                torch.position.set(x + n.offset[0], n.offset[1], z + n.offset[2]);
                torch.rotation.set(0.4, n.rot[1], 0); // Direction-correct lean
                this.scene.add(torch);

                const light = new THREE.PointLight(0xff7700, 5, 12);
                light.position.set(x + n.offset[0] * 0.95, n.offset[1] + 0.3, z + n.offset[2] * 0.95);
                this.scene.add(light);
                
                this.torches.push({ light, life: Math.random() * 10 });
                return; 
            }
        }
    }

    updateTorches(time, playerPos = null) {
        // Light Culling & Batching
        // Performans için sadece oyuncuya < 12 birim mesafedeki meşaleleri aktif et (PointLight maliyeti)
        const CULL_DISTANCE = 12.0;
        
        for (const t of this.torches) {
            // Eğer playerPos gönderildiyse uzaklığa bak
            if (playerPos) {
                const distSq = t.light.position.distanceToSquared(playerPos);
                if (distSq > CULL_DISTANCE * CULL_DISTANCE) {
                    t.light.visible = false;
                    continue; 
                } else {
                    t.light.visible = true;
                }
            }

            // Görünen meşaleler için flicker efektini hesapla
            // Optimizasyon: Her frame çağrılan Math.random() yerine, mevcut life-cycle üzerinden hashlenmiş gürültü kullanılıyor.
            const noise = Math.sin(time * 15 + t.life * 13) * 0.5 + Math.sin(time * 25 + t.life * 7) * 0.25;
            t.light.intensity = 4 + Math.sin(time * 10 + t.life) * 1.5 + noise;
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

    checkTriggers(player) {
        const exitX = (17 - this.gridSize / 2) * this.cellSize;
        const exitZ = (17 - this.gridSize / 2) * this.cellSize;
        
        const dist = Math.hypot(player.position.x - exitX, player.position.z - exitZ);
        if (dist < 1.5) {
            return "EXIT_REACHED";
        }
        return null;
    }

    getMazeInfo() {
        return { data: this.mazeData, gridSize: this.gridSize, cellSize: this.cellSize };
    }
}
