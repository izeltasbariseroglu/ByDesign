import * as THREE from 'three';
import { Game } from './src/core/game.js';

// Entry point for ByDesign
document.addEventListener('DOMContentLoaded', () => {
    const game = new Game();
    game.init();
    
    function animate() {
        requestAnimationFrame(animate);
        game.update();
        game.render();
    }
    
    animate();
    
    window.addEventListener('resize', () => {
        game.onWindowResize();
    });
});
