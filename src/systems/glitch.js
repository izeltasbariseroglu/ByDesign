import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GlitchPass } from 'three/examples/jsm/postprocessing/GlitchPass.js';
import { FilmPass } from 'three/examples/jsm/postprocessing/FilmPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/**
 * GlitchSystem
 * 
 * Wraps Three.js EffectComposer with a layered post-processing pipeline:
 *   PLAY   : Subtle film grain + very mild chromatic aberration
 *   BREAK  : Heavy glitch (GlitchPass wildMode) + intense grain + chromatic split
 *   Other  : Pipeline active but passes disabled (zero overhead)
 * 
 * Usage:
 *   const glitch = new GlitchSystem(renderer, scene, camera);
 *   glitch.setPhase('PLAY');   // or 'BREAK' / 'LOCKED' / 'END'
 *   glitch.render(delta);      // replaces renderer.render(scene, camera)
 */
export class GlitchSystem {
    constructor(renderer, scene, camera) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;
        this.phase = 'LOCKED';

        this._buildComposer();
        console.log("GlitchSystem: EffectComposer pipeline initialized.");
    }

    _buildComposer() {
        this.composer = new EffectComposer(this.renderer);

        // ── Pass 1: Base scene render ──────────────────────────────────────────
        this.renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(this.renderPass);

        // ── Pass 2: Film grain + scanlines ────────────────────────────────────
        // FilmPass(noiseIntensity, scanlinesIntensity, scanlinesCount, grayscale)
        this.filmPass = new FilmPass(0.25);
        this.filmPass.enabled = true;
        this.composer.addPass(this.filmPass);

        // ── Pass 3: Chromatic aberration (custom inline shader) ───────────────
        this.chromaticPass = new ShaderPass({
            uniforms: {
                tDiffuse: { value: null },
                amount:   { value: 0.0 },
            },
            vertexShader: /* glsl */`
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: /* glsl */`
                uniform sampler2D tDiffuse;
                uniform float amount;
                varying vec2 vUv;
                void main() {
                    vec2 offset = amount * vec2(1.0, 0.0);
                    vec4 cr = texture2D(tDiffuse, vUv + offset);
                    vec4 cg = texture2D(tDiffuse, vUv);
                    vec4 cb = texture2D(tDiffuse, vUv - offset);
                    gl_FragColor = vec4(cr.r, cg.g, cb.b, cg.a);
                }
            `,
        });
        this.chromaticPass.uniforms['amount'].value = 0.0;
        this.composer.addPass(this.chromaticPass);

        // ── Pass 4: Three.js GlitchPass (digital block artifact glitch) ───────
        this.glitchPass = new GlitchPass();
        this.glitchPass.enabled = false; // Only active in BREAK phase
        this.composer.addPass(this.glitchPass);

        // ── Pass 5: Output (gamma correct + tonemapping) ──────────────────────
        this.outputPass = new OutputPass();
        this.composer.addPass(this.outputPass);
    }

    /**
     * Set the active game phase. Adjusts post-processing intensity accordingly.
     * @param {'LOCKED'|'PROVOKE'|'PLAY'|'BREAK'|'END'} phase
     */
    setPhase(phase) {
        if (this.phase === phase) return;
        this.phase = phase;

        switch (phase) {
            case 'LOCKED':
            case 'PROVOKE':
                // Very subtle: just a touch of grain, no glitch
                this.filmPass.enabled = true;
                this.filmPass.uniforms['nIntensity'].value = 0.15;
                this.chromaticPass.uniforms['amount'].value = 0.0;
                this.glitchPass.enabled = false;
                this.glitchPass.goWild = false;
                break;

            case 'PLAY':
                // Mild tension: slight grain + barely perceptible chromatic fringe
                this.filmPass.enabled = true;
                this.filmPass.uniforms['nIntensity'].value = 0.2;
                this.chromaticPass.uniforms['amount'].value = 0.0015;
                this.glitchPass.enabled = false;
                this.glitchPass.goWild = false;
                break;

            case 'BREAK':
                // Full surveillance breakdown: heavy grain + hard chromatic split + wild glitch
                this.filmPass.enabled = true;
                this.filmPass.uniforms['nIntensity'].value = 0.5;
                this.chromaticPass.uniforms['amount'].value = 0.008;
                this.glitchPass.enabled = true;
                this.glitchPass.goWild = true;
                break;

            case 'END':
                // Freeze: grain stays, intense CA, glitch OFF (frozen reality)
                this.filmPass.enabled = true;
                this.filmPass.uniforms['nIntensity'].value = 0.4;
                this.chromaticPass.uniforms['amount'].value = 0.012;
                this.glitchPass.enabled = false;
                this.glitchPass.goWild = false;
                break;

            default:
                break;
        }

        console.log(`GlitchSystem: phase set to [${phase}]`);
    }

    /**
     * One-shot COLLAPSE burst — called exactly at 150s before END screen.
     * Ramps CA and glitch to maximum over 1.5s, then freezes.
     */
    triggerCollapse() {
        console.warn('GlitchSystem: COLLAPSE triggered — 3D reality tearing.');

        // Phase 1: violent burst (0 → 500ms)
        this.glitchPass.enabled = true;
        this.glitchPass.goWild  = true;
        this.filmPass.uniforms['nIntensity'].value = 0.9;
        this.chromaticPass.uniforms['amount'].value = 0.025; // Max CA split

        // Phase 2: freeze CA at elevated level after burst (500ms)
        setTimeout(() => {
            this.glitchPass.enabled = false;
            this.glitchPass.goWild  = false;
            this.filmPass.uniforms['nIntensity'].value = 0.45;
            this.chromaticPass.uniforms['amount'].value = 0.015;
        }, 500);
    }

    /**
     * Must be called instead of renderer.render() in the game loop.
     * @param {number} delta - Frame delta in seconds
     */
    render(delta) {
        this.composer.render(delta);
    }

    /**
     * Call when the renderer is resized.
     * @param {number} width
     * @param {number} height
     */
    onResize(width, height) {
        this.composer.setSize(width, height);
    }
}
