'use strict';
/* Small geometry helpers: batch many painted boxes/cylinders into one mesh
   with vertex colours, so the whole static city costs a handful of draws. */
const SLG = (() => {
  function paint(geo, hex) {
    const c = new THREE.Color(hex);
    const n = geo.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return geo;
  }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
  class Batch {
    constructor() { this.geos = []; }
    add(geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) {
      _e.set(rx, ry, rz); _q.setFromEuler(_e);
      _m.compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(1, 1, 1));
      const g = geo.index ? geo.toNonIndexed() : geo;
      g.applyMatrix4(_m);
      this.geos.push(g);
      return this;
    }
    box(w, h, d, hex, x, y, z, ry = 0, rx = 0, rz = 0) {
      return this.add(paint(new THREE.BoxGeometry(w, h, d), hex), x, y, z, ry, rx, rz);
    }
    cyl(rt, rb, h, seg, hex, x, y, z, ry = 0, rx = 0, rz = 0) {
      return this.add(paint(new THREE.CylinderGeometry(rt, rb, h, seg), hex), x, y, z, ry, rx, rz);
    }
    sph(r, hex, x, y, z, w = 10, h = 8) {
      return this.add(paint(new THREE.SphereGeometry(r, w, h), hex), x, y, z);
    }
    build(mat, shadows = true) {
      let total = 0;
      for (const g of this.geos) total += g.attributes.position.count;
      const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
      let o = 0;
      for (const g of this.geos) {
        pos.set(g.attributes.position.array, o * 3);
        nor.set(g.attributes.normal.array, o * 3);
        col.set(g.attributes.color.array, o * 3);
        o += g.attributes.position.count;
        g.dispose();
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = shadows; mesh.receiveShadow = shadows;
      return mesh;
    }
  }
  const MAT_FLAT = () => new THREE.MeshLambertMaterial({ vertexColors: true });
  const MAT_GLASS = () => new THREE.MeshPhongMaterial({ vertexColors: true, specular: 0x3d5a66, shininess: 28 });
  const MAT_BASIC = () => new THREE.MeshBasicMaterial({ vertexColors: true });
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
  }
  return { paint, Batch, MAT_FLAT, MAT_GLASS, MAT_BASIC, canvasTex };
})();
