import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GlitchPass } from 'three/examples/jsm/postprocessing/GlitchPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/**
 * GlitchSystem
 *
 * EffectComposer post-processing pipeline.
 * FilmPass removed — replaced with a custom inline noise shader that is
 * immune to Three.js version changes and FilmPass uniform API shifts.
 *
 * Pipeline:
 *   RenderPass → NoisePass (custom) → ChromaticAberrationPass → GlitchPass → OutputPass
 *
 * Usage:
 *   const glitch = new GlitchSystem(renderer, scene, camera);
 *   glitch.setPhase('PLAY');   // 'LOCKED' | 'PROVOKE' | 'PLAY' | 'BREAK' | 'END'
 *   glitch.render(delta);      // replaces renderer.render(scene, camera)
 */
export class GlitchSystem {
    constructor(renderer, scene, camera) {
        this.renderer = renderer;
        this.scene    = scene;
        this.camera   = camera;
        this.phase    = 'LOCKED';
        this._time    = 0;

        this._buildComposer();
        console.log('GlitchSystem: EffectComposer pipeline initialized (custom noise shader).');
    }

    _buildComposer() {
        this.composer = new EffectComposer(this.renderer);

        // ── Pass 1: Base scene render ─────────────────────────────────────────
        this.renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(this.renderPass);

        // ── Pass 2: Custom film grain / noise ─────────────────────────────────
        // Hand-rolled shader — no dependency on FilmPass uniform API.
        this.noisePass = new ShaderPass({
            uniforms: {
                tDiffuse:  { value: null },
                intensity: { value: 0.0  },   // grain strength (0 = off, 1 = full)
                time:      { value: 0.0  },   // updated each frame for animation
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
                uniform float intensity;
                uniform float time;
                varying vec2 vUv;

                // Hash-based pseudo-random — faster than sin/cos on GPU
                float rand(vec2 co) {
                    return fract(sin(dot(co, vec2(12.9898, 78.233) + time)) * 43758.5453);
                }

                void main() {
                    vec4 color = texture2D(tDiffuse, vUv);
                    if (intensity > 0.0) {
                        float noise = (rand(vUv) - 0.5) * intensity;
                        color.rgb += vec3(noise);
                    }
                    gl_FragColor = color;
                }
            `,
        });
        this.noisePass.uniforms['intensity'].value = 0.0;
        this.composer.addPass(this.noisePass);

        // ── Pass 3: Chromatic aberration (RGB channel split) ─────────────────
        this.chromaticPass = new ShaderPass({
            uniforms: {
                tDiffuse: { value: null },
                amount:   { value: 0.0  },
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

        // ── Pass 4: Three.js GlitchPass (digital block artifacts) ─────────────
        this.glitchPass          = new GlitchPass();
        this.glitchPass.enabled  = false;
        this.composer.addPass(this.glitchPass);

        // ── Pass 5: Output (gamma + tonemapping) ──────────────────────────────
        this.outputPass = new OutputPass();
        this.composer.addPass(this.outputPass);
    }

    /**
     * Set the active game phase.
     * @param {'LOCKED'|'PROVOKE'|'PLAY'|'BREAK'|'END'} phase
     */
    setPhase(phase) {
        if (this.phase === phase) return;
        this.phase = phase;

        switch (phase) {
            case 'LOCKED':
            case 'PROVOKE':
                this.noisePass.uniforms['intensity'].value      = 0.06;
                this.chromaticPass.uniforms['amount'].value     = 0.0;
                this.glitchPass.enabled  = false;
                this.glitchPass.goWild   = false;
                break;

            case 'PLAY':
                this.noisePass.uniforms['intensity'].value      = 0.08;
                this.chromaticPass.uniforms['amount'].value     = 0.0015;
                this.glitchPass.enabled  = false;
                this.glitchPass.goWild   = false;
                break;

            case 'BREAK':
                this.noisePass.uniforms['intensity'].value      = 0.22;
                this.chromaticPass.uniforms['amount'].value     = 0.008;
                this.glitchPass.enabled  = true;
                this.glitchPass.goWild   = true;
                break;

            case 'END':
                this.noisePass.uniforms['intensity'].value      = 0.16;
                this.chromaticPass.uniforms['amount'].value     = 0.012;
                this.glitchPass.enabled  = false;
                this.glitchPass.goWild   = false;
                break;

            default:
                break;
        }

        console.log(`GlitchSystem: phase set to [${phase}]`);
    }

    /**
     * One-shot COLLAPSE burst at t=150s.
     * Ramps CA and noise to maximum over 1.5 s, then freezes.
     */
    triggerCollapse() {
        console.warn('GlitchSystem: COLLAPSE triggered — 3D reality tearing.');

        // Phase 1: violent burst
        this.glitchPass.enabled                             = true;
        this.glitchPass.goWild                              = true;
        this.noisePass.uniforms['intensity'].value          = 0.55;
        this.chromaticPass.uniforms['amount'].value         = 0.025;

        // Phase 2: freeze at elevated level after burst (500ms)
        setTimeout(() => {
            this.glitchPass.enabled                         = false;
            this.glitchPass.goWild                          = false;
            this.noisePass.uniforms['intensity'].value      = 0.18;
            this.chromaticPass.uniforms['amount'].value     = 0.015;
        }, 500);
    }

    /**
     * Call every frame instead of renderer.render().
     * @param {number} [delta] - Frame delta in seconds (defaults to 16ms if omitted)
     */
    render(delta) {
        // Guard: delta can be undefined (game.js calls render() without arg) or NaN.
        // Passing NaN into the noise shader's time uniform causes black output on most GPUs.
        const dt = (typeof delta === 'number' && isFinite(delta)) ? delta : 0.016;
        this._time += dt;
        this.noisePass.uniforms['time'].value = this._time;
        this.composer.render(dt);
    }

    /**
     * Call on window resize.
     */
    onResize(width, height) {
        this.composer.setSize(width, height);
    }
}
