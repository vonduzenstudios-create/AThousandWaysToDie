import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

export type Quality = 'low' | 'medium' | 'high';

/**
 * Quality from ?quality=low|medium|high, then a saved choice, then a guess from the device.
 * Low renders straight to the screen; medium adds bloom and color grading; high adds GTAO.
 */
export function pickQuality(): Quality {
  try {
    const q = new URLSearchParams(location.search).get('quality');
    if (q === 'low' || q === 'medium' || q === 'high') return q;
    const saved = localStorage.getItem('cestlavie.quality');
    if (saved === 'low' || saved === 'medium' || saved === 'high') return saved;
  } catch {
    /* storage blocked */
  }
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  return mobile ? 'low' : 'medium';
}

export function saveQuality(q: Quality) {
  try {
    localStorage.setItem('cestlavie.quality', q);
  } catch {
    /* storage blocked */
  }
}

/** Warm grade in display space: lift, contrast, saturation, warmth and a soft vignette. */
const GradeShader = {
  name: 'KitGrade',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    saturation: { value: 1.1 },
    contrast: { value: 1.06 },
    warmth: { value: 0.05 },
    vignette: { value: 0.32 },
    lift: { value: 0.015 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float saturation, contrast, warmth, vignette, lift;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, saturation);
      col = (col - 0.5) * contrast + 0.5;
      col += vec3(warmth, warmth * 0.35, -warmth * 0.6) * (1.0 - l);
      col = col * (1.0 - lift) + lift;
      vec2 d = vUv - 0.5;
      col *= 1.0 - vignette * dot(d, d) * 1.6;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }`,
};

/**
 * The game's render pipeline. Replace `renderer.render(scene, camera)` with `post.render()` and
 * call `post.setSize(w, h)` on resize.
 */
export class PostFX {
  private composer: EffectComposer | null = null;
  private gtao: GTAOPass | null = null;
  private bloom: UnrealBloomPass | null = null;
  readonly grade = new ShaderPass(GradeShader);
  quality: Quality;

  constructor(
    readonly renderer: THREE.WebGLRenderer,
    readonly scene: THREE.Scene,
    public camera: THREE.Camera,
    quality: Quality = pickQuality(),
  ) {
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.quality = quality;
    this.setQuality(quality);
  }

  /** False on low quality, where there is no grade pass (use a CSS filter instead). */
  get graded() {
    return this.composer !== null;
  }

  setQuality(q: Quality) {
    this.quality = q;
    this.composer?.dispose();
    this.composer = null;
    this.gtao = null;
    this.bloom = null;
    if (q === 'low') return;
    const size = this.renderer.getSize(new THREE.Vector2());
    const pr = this.renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(this.renderer, rt);
    composer.addPass(new RenderPass(this.scene, this.camera));
    if (q === 'high') {
      const gtao = new GTAOPass(this.scene, this.camera, size.x, size.y);
      gtao.blendIntensity = 0.75;
      gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.2, scale: 1.0, samples: 12 });
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      composer.addPass(gtao);
      this.gtao = gtao;
    }
    const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.32, 0.45, 0.92);
    composer.addPass(bloom);
    this.bloom = bloom;
    composer.addPass(new OutputPass());
    composer.addPass(this.grade);
    this.composer = composer;
  }

  setCamera(camera: THREE.Camera) {
    this.camera = camera;
    this.setQuality(this.quality);
  }

  setSize(w: number, h: number) {
    this.composer?.setSize(w, h);
    this.gtao?.setSize(w, h);
  }

  /** Bloom strength, e.g. raise it at night for glowing lamps. */
  setBloom(strength: number) {
    if (this.bloom) this.bloom.strength = strength;
  }

  render(dt?: number) {
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
}

/**
 * Image-based light from a code-drawn sky (gradient plus a warm sun glow), so glossy cells like
 * window glass reflect the sky and shaded walls pick up a cool fill. Only affects
 * MeshStandardMaterial / MeshPhysicalMaterial (the kit's material).
 */
export function skyEnvironment(renderer: THREE.WebGLRenderer, opts: { top?: number; horizon?: number; ground?: number; sunDir?: THREE.Vector3; sunColor?: number } = {}) {
  const scene = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      top: { value: new THREE.Color(opts.top ?? 0x4a86d8) },
      horizon: { value: new THREE.Color(opts.horizon ?? 0xf3dcc0) },
      ground: { value: new THREE.Color(opts.ground ?? 0x6b5a48) },
      sunDir: { value: (opts.sunDir ?? new THREE.Vector3(0.5, 0.6, 0.35)).clone().normalize() },
      sunColor: { value: new THREE.Color(opts.sunColor ?? 0xffd7a0) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top, horizon, ground, sunDir, sunColor; varying vec3 vP;
      void main(){
        float h = vP.y;
        vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.6)) : mix(horizon, ground, pow(-h, 0.4));
        float s = max(dot(normalize(vP), sunDir), 0.0);
        c += sunColor * (pow(s, 64.0) * 6.0 + pow(s, 6.0) * 0.5);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), mat));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.02);
  pmrem.dispose();
  mat.dispose();
  return rt.texture;
}

/**
 * Warm afternoon lighting tuned for the kit: golden sun, cool sky fill, soft shadow settings
 * that avoid acne on voxel faces. Pass the game's existing lights to retune them in place.
 */
export function warmLighting(scene: THREE.Scene, renderer: THREE.WebGLRenderer, lights: { sun: THREE.DirectionalLight; hemi?: THREE.HemisphereLight }) {
  const { sun, hemi } = lights;
  sun.color.setHex(0xffe0b0);
  sun.intensity = 2.6;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  if (hemi) {
    hemi.color.setHex(0xbcd6ff);
    hemi.groundColor.setHex(0x8a6c4c);
    hemi.intensity = 1.0;
  }
  scene.environment = skyEnvironment(renderer);
  scene.environmentIntensity = 0.55;
}
