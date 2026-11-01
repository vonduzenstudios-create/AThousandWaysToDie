import * as THREE from 'three';

/**
 * A crisp white outline around a character (Death's target). Each body part gets an
 * inverted-hull twin (same geometry, scaled out from its own center, back faces only,
 * flat white). The body writes 1 into the stencil buffer and the hulls draw only where
 * it isn't 1, so the line shows around the silhouette and never across the body.
 * Hulls are children of the parts, so they follow every animation. Call every frame
 * with a thickness to keep the line a steady width on screen.
 */
const HULL = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  side: THREE.BackSide,
  fog: false,
  toneMapped: false,
  stencilWrite: true,
  stencilRef: 1,
  stencilFunc: THREE.NotEqualStencilFunc,
  stencilFail: THREE.KeepStencilOp,
  stencilZFail: THREE.KeepStencilOp,
  stencilZPass: THREE.KeepStencilOp,
});
const KEY = 'outlineHull';

export function setOutline(root: THREE.Object3D, on: boolean, thickness = 0.045) {
  const parts: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && !o.userData[KEY + 'Of']) parts.push(o as THREE.Mesh);
  });
  for (const m of parts) {
    let hull = m.userData[KEY] as THREE.Mesh | undefined;
    if (!hull) {
      if (!on) continue;
      hull = new THREE.Mesh(m.geometry, HULL);
      hull.castShadow = hull.receiveShadow = false;
      hull.renderOrder = 10; // after the body has marked the stencil
      hull.userData[KEY + 'Of'] = m;
      hull.raycast = () => {};
      m.add(hull);
      m.userData[KEY] = hull;
    }
    const mat = m.material as THREE.Material;
    if (!Array.isArray(m.material) && mat.stencilWrite !== on) {
      mat.stencilWrite = on;
      mat.stencilRef = 1;
      mat.stencilFunc = THREE.AlwaysStencilFunc;
      mat.stencilZPass = THREE.ReplaceStencilOp;
    }
    hull.visible = on;
    if (!on) continue;
    const g = m.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    const box = g.boundingBox!;
    const size = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    // Thickness is in world units, so undo the part's own world scale.
    const ws = m.getWorldScale(new THREE.Vector3());
    const axis = (sz: number, w: number) => (sz + (2 * thickness) / Math.max(Math.abs(w), 1e-3)) / Math.max(sz, 1e-3);
    hull.scale.set(axis(size.x, ws.x), axis(size.y, ws.y), axis(size.z, ws.z));
    hull.position.set(c.x * (1 - hull.scale.x), c.y * (1 - hull.scale.y), c.z * (1 - hull.scale.z));
  }
}
