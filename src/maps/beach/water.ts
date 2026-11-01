import * as THREE from 'three';
import type { VoxelWorld } from '../../voxel';
import { SEA, SX, SZ } from './world';

/**
 * The sea: one big animated plane. A depth texture baked from the voxels gives
 * shallow water its turquoise color and a foam line where waves meet the sand.
 */
export class Sea {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private depthTex: THREE.DataTexture;

  constructor(world: VoxelWorld) {
    const data = new Uint8Array(SX * SZ * 4);
    for (let z = 0; z < SZ; z++)
      for (let x = 0; x < SX; x++) {
        const top = world.topY(x, z);
        // 0 = dry land well above the sea, 255 = 8+ blocks deep.
        const d = THREE.MathUtils.clamp((SEA + 1.5 - top) / 9.5, 0, 1);
        const i = (z * SX + x) * 4;
        data[i] = Math.round(d * 255);
        data[i + 1] = data[i + 2] = 0;
        data[i + 3] = 255;
      }
    this.depthTex = new THREE.DataTexture(data, SX, SZ, THREE.RGBAFormat);
    this.depthTex.magFilter = THREE.LinearFilter;
    this.depthTex.minFilter = THREE.LinearFilter;
    this.depthTex.needsUpdate = true;

    // A dense patch over the playable area for wave motion, plus the far plane.
    const near = new THREE.PlaneGeometry(SX + 200, SZ + 400, 220, 220);
    near.rotateX(-Math.PI / 2);
    near.translate(SX / 2, 0, SZ / 2 + 100);

    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uTime: { value: 0 },
          uDepth: { value: this.depthTex },
          uSize: { value: new THREE.Vector2(SX, SZ) },
          uStorm: { value: 0 },
          uDark: { value: 0 },
        },
      ]),
      vertexShader: /* glsl */ `
        uniform float uTime; uniform float uStorm; uniform sampler2D uDepth; uniform vec2 uSize;
        varying vec3 vW; varying float vDepth; varying float vWave;
        #include <fog_pars_vertex>
        void main(){
          vec4 w = modelMatrix * vec4(position, 1.0);
          vec2 uv = w.xz / uSize;
          float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
          float d = mix(1.0, texture2D(uDepth, clamp(uv, 0.0, 1.0)).r, inside);
          float amp = (0.08 + 0.18 * d) * (1.0 + uStorm * 4.0);
          float wv = sin(w.x * 0.21 + uTime * 1.3) * 0.6 + sin(w.z * 0.17 - uTime * 1.7) * 0.4 + sin((w.x + w.z) * 0.05 + uTime * 0.6);
          w.y += wv * amp;
          vW = w.xyz; vDepth = d; vWave = wv;
          vec4 mvPosition = viewMatrix * w;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uStorm; uniform float uDark;
        varying vec3 vW; varying float vDepth; varying float vWave;
        #include <fog_pars_fragment>
        void main(){
          vec3 shallow = vec3(0.30, 0.86, 0.82);
          vec3 mid = vec3(0.10, 0.55, 0.75);
          vec3 deep = vec3(0.04, 0.24, 0.48);
          float d = vDepth;
          vec3 c = mix(shallow, mid, smoothstep(0.12, 0.45, d));
          c = mix(c, deep, smoothstep(0.45, 0.95, d));
          // Sparkle and wave crests.
          float crest = smoothstep(1.2, 1.9, vWave + sin(vW.x * 1.7 + uTime * 3.0) * 0.25);
          c += crest * 0.18;
          // Foam where waves lap the sand.
          float foamBand = smoothstep(0.20, 0.13, d) * (0.6 + 0.4 * sin(uTime * 2.0 + vW.x * 0.3 + vW.z * 0.5));
          c = mix(c, vec3(1.0), clamp(foamBand, 0.0, 1.0) * 0.85);
          c = mix(c, vec3(0.25, 0.3, 0.35), uStorm * 0.6);
          c *= 1.0 - uDark;
          float a = mix(0.55, 0.92, smoothstep(0.1, 0.5, d));
          gl_FragColor = vec4(c, a);
          #include <fog_fragment>
        }`,
    });
    const group = new THREE.Group();
    const nearMesh = new THREE.Mesh(near, this.mat);
    // Four flat panels around the patch carry the sea to the horizon.
    const nx0 = -100, nx1 = SX + 100, nz0 = -100, nz1 = SZ + 300, F = 4000;
    const panel = (x0: number, z0: number, x1: number, z1: number) => {
      const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, 4, 4);
      g.rotateX(-Math.PI / 2);
      g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
      group.add(new THREE.Mesh(g, this.mat));
    };
    panel(-F, nz1, SX + F, nz1 + F);
    panel(-F, nz0, nx0, nz1);
    panel(nx1, nz0, SX + F, nz1);
    panel(-F, nz0 - F, SX + F, nz0);
    group.add(nearMesh);
    this.mesh = nearMesh;
    this.group = group;
    this.group.position.y = SEA;
  }

  readonly group: THREE.Group;

  update(time: number, level: number, storm = 0, dark = 0) {
    this.mat.uniforms.uTime.value = time;
    this.mat.uniforms.uStorm.value = storm;
    this.mat.uniforms.uDark.value = dark;
    this.group.position.y = level;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.mat.dispose();
    this.depthTex.dispose();
  }
}
