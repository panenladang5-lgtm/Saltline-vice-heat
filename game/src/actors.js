'use strict';
/* Saltline: Vice Heat — entity meshes: instanced pedestrians, articulated
   figures, cars and variants, bikes, tow truck, ambulance, helicopter, boats. */
const SLA = (() => {
  const { Batch, MAT_FLAT, MAT_BASIC, paint } = SLG;
  const lam = (hex) => new THREE.MeshLambertMaterial({ color: hex });
  const bas = (hex) => new THREE.MeshBasicMaterial({ color: hex });
  function box(w, h, d, hex, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(hex));
    m.position.set(x, y, z); m.castShadow = true;
    return m;
  }
  function blob(r) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 14),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.16, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.21;
    return m;
  }

  // ---------- instanced pedestrian field ----------
  class PedField {
    constructor(peds) {
      const n = peds.length;
      const mk = (geo, colors) => {
        const im = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), n);
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        const c = new THREE.Color();
        colors.forEach((hex, i) => im.setColorAt(i, c.setHex(hex)));
        im.castShadow = true; im.frustumCulled = false;
        return im;
      };
      const legGeo = new THREE.CylinderGeometry(0.05, 0.045, 0.52, 5); legGeo.translate(0, -0.26, 0);
      const armGeo = new THREE.CylinderGeometry(0.042, 0.04, 0.5, 5); armGeo.translate(0, -0.25, 0);
      this.parts = {
        torso: mk(new THREE.CylinderGeometry(0.155, 0.17, 0.56, 5), peds.map(p => p.shirt)),
        pelvis: mk(new THREE.BoxGeometry(0.3, 0.15, 0.19), peds.map(p => p.pants)),
        head: mk(new THREE.IcosahedronGeometry(0.115, 0), peds.map(p => p.skin)),
        hair: mk(new THREE.BoxGeometry(0.2, 0.07, 0.21), peds.map(p => p.hair)),
        legL: mk(legGeo.clone(), peds.map(p => p.pants)),
        legR: mk(legGeo, peds.map(p => p.pants)),
        armL: mk(armGeo.clone(), peds.map(p => p.shirt)),
        armR: mk(armGeo, peds.map(p => p.shirt)),
      };
      this.blobs = new THREE.InstancedMesh(new THREE.CircleGeometry(0.42, 10),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.16, depthWrite: false }), n);
      this.blobs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.blobs.frustumCulled = false;
      this.group = new THREE.Group();
      for (const k in this.parts) this.group.add(this.parts[k]);
      this.group.add(this.blobs);
      this._d = new THREE.Object3D();
    }
    // st: {x,z,ang,swing,mode,scale} mode: walk|idle|down|hide
    set(i, st) {
      const d = this._d;
      const s = st.scale || 1;
      const down = st.mode === 'down', hide = st.mode === 'hide';
      const sw = st.mode === 'walk' ? Math.sin(st.swing) * 0.55 : st.mode === 'run' ? Math.sin(st.swing) * 0.8 : 0;
      const baseY = down ? 0.18 : 0;
      const tiltX = down ? -Math.PI / 2 : 0;
      const put = (part, ox, oy, oz, rx = 0) => {
        d.position.set(st.x, baseY, st.z);
        d.rotation.set(0, st.ang, 0);
        d.updateMatrix();
        const local = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(tiltX + rx, 0, 0));
        local.setPosition(ox, oy, oz);
        const m = new THREE.Matrix4().multiplyMatrices(d.matrix, local);
        if (hide) m.scale(new THREE.Vector3(0, 0, 0)); else m.scale(new THREE.Vector3(s, s, s));
        part.setMatrixAt(i, m);
      };
      put(this.parts.torso, 0, 0.95, 0);
      put(this.parts.pelvis, 0, 0.62, 0);
      put(this.parts.head, 0, 1.38, 0);
      put(this.parts.hair, 0, 1.47, 0);
      put(this.parts.legL, -0.09, 0.55, 0, sw);
      put(this.parts.legR, 0.09, 0.55, 0, -sw);
      put(this.parts.armL, -0.24, 1.18, 0, -sw * 0.7);
      put(this.parts.armR, 0.24, 1.18, 0, sw * 0.7);
      d.position.set(st.x, 0.21, st.z);
      d.rotation.set(-Math.PI / 2, 0, 0);
      d.scale.setScalar(hide ? 0 : s);
      d.updateMatrix();
      this.blobs.setMatrixAt(i, d.matrix);
    }
    flush() {
      for (const k in this.parts) this.parts[k].instanceMatrix.needsUpdate = true;
      this.blobs.instanceMatrix.needsUpdate = true;
    }
  }

  // ---------- articulated figure (hero, police, guards, contacts, crew) ----------
  function makeFigure(o = {}) {
    const g = new THREE.Group();
    const skin = o.skin ?? 0xc68c66, shirt = o.shirt ?? 0x3cc8cf, pants = o.pants ?? 0x314157;
    const legGeo = new THREE.CylinderGeometry(0.055, 0.05, 0.55, 5); legGeo.translate(0, -0.27, 0);
    const armGeo = new THREE.CylinderGeometry(0.047, 0.043, 0.52, 5); armGeo.translate(0, -0.26, 0);
    const mkLimb = (geo, hex, x, y) => {
      const m = new THREE.Mesh(geo, lam(hex)); m.position.set(x, y, 0); m.castShadow = true; g.add(m); return m;
    };
    const legL = mkLimb(legGeo.clone(), pants, -0.09, 0.58);
    const legR = mkLimb(legGeo, pants, 0.09, 0.58);
    const pelvis = box(0.32, 0.16, 0.2, pants, 0, 0.65, 0); g.add(pelvis);
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.185, 0.6, 5), lam(shirt));
    torso.position.y = 1.0; torso.castShadow = true; g.add(torso);
    const armL = mkLimb(armGeo.clone(), o.armColor ?? shirt, -0.26, 1.24);
    const armR = mkLimb(armGeo, o.armColor ?? shirt, 0.26, 1.24);
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), lam(skin));
    head.position.y = 1.45; head.castShadow = true; g.add(head);
    if (o.hair !== null) g.add(box(0.21, 0.07, 0.22, o.hair ?? 0x34313d, 0, 1.55, 0));
    if (o.cap) {
      g.add(box(0.24, 0.07, 0.24, o.cap, 0, 1.56, 0));
      g.add(box(0.2, 0.03, 0.14, o.capVisor ?? 0x111f32, 0, 1.52, 0.16));
    }
    if (o.badge) g.add(box(0.07, 0.09, 0.02, o.badge, 0.08, 1.12, 0.17));
    if (o.vest) g.add(box(0.36, 0.4, 0.24, o.vest, 0, 1.02, 0));
    if (o.belt) {
      g.add(box(0.34, 0.07, 0.22, o.belt, 0, 0.76, 0));
      g.add(box(0.08, 0.05, 0.02, 0x8d9fad, 0, 0.76, 0.12));
    }
    if (o.backpack) {
      g.add(box(0.3, 0.42, 0.16, o.backpack, 0, 1.05, -0.2));
      g.add(box(0.3, 0.08, 0.02, 0xffcf75, 0, 1.18, -0.29));
    }
    if (o.marker) g.add(box(0.1, 0.1, 0.02, o.marker, 0, 1.08, 0.18));
    if (o.band) g.add(box(0.34, 0.07, 0.21, o.band, 0, 0.95, 0));
    let weapon = null;
    if (o.weapon) {
      weapon = box(0.07, 0.16, 0.3, o.weapon, 0.3, 0.85, 0.1);
      g.add(weapon);
    }
    g.add(blob(0.45));
    const fig = {
      group: g, legL, legR, armL, armR, torso, head, weapon,
      pose(swing = 0, mode = 'idle') {
        if (mode === 'walk' || mode === 'run') {
          const a = mode === 'run' ? 0.8 : 0.55;
          legL.rotation.x = Math.sin(swing) * a; legR.rotation.x = -Math.sin(swing) * a;
          armL.rotation.x = -Math.sin(swing) * a * 0.7; armR.rotation.x = Math.sin(swing) * a * 0.7;
          g.rotation.x = 0; g.position.y = 0;
        } else if (mode === 'sit') {
          legL.rotation.x = legR.rotation.x = -1.45;
          armL.rotation.x = armR.rotation.x = -0.7;
          g.rotation.x = 0;
        } else if (mode === 'down') {
          g.rotation.x = -Math.PI / 2; g.position.y = 0.18;
          legL.rotation.x = legR.rotation.x = armL.rotation.x = armR.rotation.x = 0;
        } else if (mode === 'kneel') {
          legL.rotation.x = -1.9; legR.rotation.x = -0.4;
          armL.rotation.x = armR.rotation.x = -0.9;
          g.position.y = -0.3;
        } else if (mode === 'lie') { // beach lounger
          g.rotation.x = -Math.PI / 2; g.position.y = 0.22;
        } else {
          legL.rotation.x = legR.rotation.x = armL.rotation.x = armR.rotation.x = 0;
          g.rotation.x = 0; g.position.y = 0;
        }
      },
    };
    return fig;
  }
  function makeSittingFigure(o = {}) {
    const fig = makeFigure(o);
    fig.pose(0, 'sit');
    fig.group.children.forEach(c => { if (c.material && c.material.opacity === 0.16) c.visible = false; });
    return fig;
  }

  // ---------- cars ----------
  function wheelMesh(r = 0.34, w = 0.24) {
    const b = new Batch();
    b.cyl(r, r, w, 10, 0x292b37, 0, 0, 0, 0, 0, Math.PI / 2);
    b.cyl(r * 0.55, r * 0.55, w + 0.02, 8, 0xa6b3b8, 0, 0, 0, 0, 0, Math.PI / 2);
    const m = b.build(MAT_FLAT());
    return m;
  }
  function headlightRig(coneLen = 7.5, poolR = 1.9, spread = 0.75, frontZ = 2.2) {
    const grp = new THREE.Group();
    const coneMat = new THREE.MeshBasicMaterial({ color: 0xffe9bb, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const poolMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const sx of [-spread, spread]) {
      if (spread === 0 && sx !== 0) continue;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.55, coneLen, 10, 1, true), coneMat);
      cone.rotation.x = Math.PI / 2 + 0.045;
      cone.position.set(sx, 0.62, frontZ + coneLen / 2);
      grp.add(cone);
      const pool = new THREE.Mesh(new THREE.CircleGeometry(poolR, 12), poolMat);
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(sx, 0.22, frontZ + coneLen * 0.82);
      grp.add(pool);
      if (spread === 0) break;
    }
    grp.userData.setLevel = (f) => { coneMat.opacity = 0.34 * f; poolMat.opacity = 0.4 * f; grp.visible = f > 0.02; };
    grp.userData.setLevel(0);
    return grp;
  }
  function makeCarMesh(type, colorHex, opts = {}) {
    const g = new THREE.Group();
    const b = new Batch(), glow = new Batch();
    const isSport = type === 'sport', isVan = type === 'van';
    const isPickup = type === 'pickup', isCompact = type === 'compact';
    const L = isVan ? 4.9 : isSport ? 4.3 : isCompact ? 3.6 : 4.4, W = isVan ? 2.0 : isSport ? 1.9 : isCompact ? 1.8 : 2.0;
    const bodyH = isVan ? 1.15 : isPickup ? 0.6 : 0.55, baseY = isVan ? 0.95 : 0.62;
    const paintHex = opts.police ? 0xeff0eb : type === 'taxi' ? 0xfebd46 : colorHex;
    const dark = new THREE.Color(paintHex).multiplyScalar(0.58).getHex();
    b.box(W, bodyH, L, paintHex, 0, baseY, 0); // main shell
    b.box(W * 0.94, bodyH * 0.5, L * 0.2, paintHex, 0, baseY - 0.08, L * 0.46); // nose
    b.box(W * 0.96, bodyH * 0.45, L * 0.16, paintHex, 0, baseY - 0.05, -L * 0.47); // tail
    if (isPickup) {
      // cab sits over the front third; behind it an open cargo bed
      b.box(W * 0.84, 0.52, L * 0.3, 0x395368, 0, baseY + bodyH / 2 + 0.26, L * 0.22); // cab glass
      b.box(W * 0.8, 0.07, L * 0.27, paintHex, 0, baseY + bodyH / 2 + 0.55, L * 0.22); // cab roof
      b.box(W * 0.92, 0.1, L * 0.46, dark, 0, baseY + 0.16, -L * 0.25); // bed floor
      b.box(W * 0.06, 0.44, L * 0.46, paintHex, -W * 0.44, baseY + 0.33, -L * 0.25); // bed walls
      b.box(W * 0.06, 0.44, L * 0.46, paintHex, W * 0.44, baseY + 0.33, -L * 0.25);
      b.box(W * 0.92, 0.44, 0.07, paintHex, 0, baseY + 0.33, -L * 0.47); // tailgate
      b.box(W * 0.66, 0.3, L * 0.28, 0x6b5136, 0, baseY + 0.36, -L * 0.26); // crates riding in the bed
    } else if (!isVan) {
      // hatchbacks carry their glasshouse further back than sedans
      const cabLen = isCompact ? L * 0.58 : L * 0.46, cabZ = isCompact ? -L * 0.08 : -L * 0.04;
      b.box(W * 0.84, 0.48, cabLen, 0x395368, 0, baseY + bodyH / 2 + 0.24, cabZ); // glass cabin
      b.box(W * 0.8, 0.07, cabLen * 0.87, paintHex, 0, baseY + bodyH / 2 + 0.51, cabZ); // roof
    } else {
      b.box(W * 0.92, 0.5, L * 0.2, 0x395368, 0, baseY + bodyH / 2 + 0.22, L * 0.36); // van windshield band
      b.box(W + 0.02, 0.06, L * 0.7, dark, 0, baseY + 0.1, 0); // seam
    }
    b.box(W + 0.04, 0.16, L * 0.9, dark, 0, 0.38, 0); // rocker band
    b.box(W + 0.03, 0.05, L * 0.92, 0xd9dee2, 0, baseY + bodyH / 2 - 0.04, 0); // beltline
    b.box(W * 0.7, 0.18, 0.06, 0x22282f, 0, 0.52, L / 2 + 0.02); // grille
    b.box(0.1, 0.08, 0.3, 0x2c3138, -W / 2 - 0.06, baseY + 0.28, L * 0.18); // mirrors
    b.box(0.1, 0.08, 0.3, 0x2c3138, W / 2 + 0.06, baseY + 0.28, L * 0.18);
    glow.box(0.34, 0.11, 0.05, 0xffefd4, -W * 0.32, 0.6, L / 2 + 0.03);
    glow.box(0.34, 0.11, 0.05, 0xffefd4, W * 0.32, 0.6, L / 2 + 0.03);
    glow.box(W * 0.8, 0.09, 0.05, 0xff555e, 0, 0.68, -L / 2 - 0.03); // tail light bar
    glow.box(0.12, 0.07, 0.05, 0xffb85a, -W * 0.46, 0.6, L / 2 + 0.03);
    glow.box(0.12, 0.07, 0.05, 0xffb85a, W * 0.46, 0.6, L / 2 + 0.03);
    if (isSport) {
      b.box(W * 0.9, 0.09, 0.4, 0x22252e, 0, 0.3, L / 2 + 0.05); // splitter
      b.box(0.08, 0.22, 0.08, 0x22252e, -W * 0.32, 1.05, -L / 2 + 0.15);
      b.box(0.08, 0.22, 0.08, 0x22252e, W * 0.32, 1.05, -L / 2 + 0.15);
      b.box(W * 0.78, 0.06, 0.34, paintHex, 0, 1.2, -L / 2 + 0.15); // wing blade
    }
    if (type === 'taxi') {
      b.box(0.7, 0.16, 0.3, 0x353b46, 0, baseY + bodyH / 2 + 0.62, -L * 0.04);
      glow.box(0.6, 0.1, 0.26, 0xffe497, 0, baseY + bodyH / 2 + 0.62, -L * 0.04);
    }
    let lightbar = null;
    if (opts.police) {
      b.box(W + 0.03, 0.3, L * 0.9, 0x24456a, 0, 0.78, 0); // side livery band (through shell)
      b.box(W * 0.9, 0.06, L * 0.22, 0x24456a, 0, baseY + bodyH / 2 + 0.02, L * 0.3); // hood band
      b.box(W * 0.9, 0.3, 0.06, 0x24456a, 0, 0.72, -L / 2 - 0.01); // trunk band
      b.box(W * 0.7, 0.07, 0.5, 0x1c314c, 0, baseY + bodyH / 2 + 0.58, -L * 0.04); // lightbar base
      const lbL = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.13, 0.44), bas(0x79314d));
      lbL.position.set(-0.36, baseY + bodyH / 2 + 0.68, -L * 0.04); g.add(lbL);
      const lbR = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.13, 0.44), bas(0x2b508a));
      lbR.position.set(0.36, baseY + bodyH / 2 + 0.68, -L * 0.04); g.add(lbR);
      lightbar = { l: lbL, r: lbR };
    }
    const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const bodyMesh = b.build(bodyMat);
    g.add(bodyMesh);
    g.add(glow.build(MAT_BASIC(), false));
    const wheels = [];
    const wr = isVan ? 0.38 : isCompact ? 0.3 : 0.34;
    for (const [wx, wz] of [[-W / 2 + 0.08, L * 0.31], [W / 2 - 0.08, L * 0.31], [-W / 2 + 0.08, -L * 0.31], [W / 2 - 0.08, -L * 0.31]]) {
      const wm = wheelMesh(wr);
      wm.position.set(wx, wr, wz);
      g.add(wm); wheels.push(wm);
    }
    const lights = headlightRig(7.5, 1.9, W * 0.32, L / 2);
    g.add(lights);
    g.add(blob(2.6));
    return { group: g, wheels, bodyMat, lightbar, lights, L, W };
  }

  // ---------- bike ----------
  function makeBikeMesh(colorHex, withRider = true) {
    const g = new THREE.Group();
    const b = new Batch();
    b.box(0.32, 0.4, 0.9, 0x2b2f38, 0, 0.48, 0.1); // engine
    b.box(0.36, 0.3, 0.85, colorHex, 0, 0.78, 0.32); // tank
    b.box(0.34, 0.05, 0.5, 0xd9dee2, 0, 0.95, 0.32); // tank stripe
    b.box(0.3, 0.12, 0.7, 0x22252e, 0, 0.82, -0.45); // seat
    b.cyl(0.035, 0.035, 0.85, 6, 0x59666b, 0, 0.72, 0.78, 0, 0.5, 0); // fork
    b.box(0.5, 0.06, 0.08, 0x22252e, 0, 1.06, 0.62); // handlebar
    b.cyl(0.05, 0.05, 0.7, 6, 0x8d9fad, 0.16, 0.4, -0.5, 0, Math.PI / 2 - 0.15, 0); // exhaust
    b.box(0.4, 0.1, 0.5, colorHex, 0, 0.62, 0.95); // front fender
    const body = b.build(MAT_FLAT()); g.add(body);
    const glowB = new Batch();
    glowB.box(0.2, 0.12, 0.05, 0xffefd4, 0, 0.78, 1.02);
    glowB.box(0.16, 0.08, 0.05, 0xff555e, 0, 0.72, -0.85);
    g.add(glowB.build(MAT_BASIC(), false));
    const wheels = [];
    for (const wz of [0.95, -0.85]) {
      const wm = wheelMesh(0.31, 0.09);
      wm.position.set(0, 0.31, wz);
      g.add(wm); wheels.push(wm);
    }
    const lights = headlightRig(5, 1.2, 0, 1.0);
    g.add(lights);
    let rider = null;
    if (withRider) {
      rider = makeSittingFigure({ shirt: [0x314157, 0xe46c70, 0x4d6967][colorHex % 3], pants: 0x272b3e, skin: 0xc68c66, hair: null });
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), lam([0xe46c70, 0xf4bb45, 0x3cc8cf, 0xede4cf][colorHex % 4]));
      helmet.position.y = 1.5; helmet.scale.y = 0.85;
      rider.group.add(helmet);
      rider.group.position.y = 0.55;
      g.add(rider.group);
    }
    g.add(blob(1.5));
    return { group: g, wheels, lights, rider };
  }

  // ---------- tow truck ----------
  function makeTowMesh() {
    const g = new THREE.Group();
    const b = new Batch();
    b.box(2.1, 1.5, 1.9, 0xeeb54e, 0, 1.25, 2.2); // cab
    b.box(1.9, 0.6, 0.08, 0x365e70, 0, 1.62, 3.16); // windshield
    b.box(2.2, 0.5, 6.4, 0x344958, 0, 0.55, -0.6); // frame
    b.box(2.15, 0.22, 5.6, 0x263744, 0, 1.05, -1.1); // deck
    b.box(2.16, 0.12, 5.6, 0xffdf83, 0, 0.86, -1.1); // reflective strip
    b.box(0.18, 1.7, 0.18, 0xeeb54e, -0.8, 2.2, 1.1); // A-frame
    b.box(0.18, 1.7, 0.18, 0xeeb54e, 0.8, 2.2, 1.1);
    b.box(1.8, 0.16, 0.16, 0xeeb54e, 0, 3.0, 1.1);
    const body = b.build(MAT_FLAT()); g.add(body);
    const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.3), bas(0xffc24d));
    beacon.position.set(0, 2.1, 2.2); g.add(beacon);
    const wheels = [];
    for (const [wx, wz] of [[-1, 2.2], [1, 2.2], [-1, -1.6], [1, -1.6], [-1, -2.6], [1, -2.6]]) {
      const wm = wheelMesh(0.4, 0.26); wm.position.set(wx, 0.4, wz); g.add(wm); wheels.push(wm);
    }
    const cableGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]);
    const cable = new THREE.Line(cableGeo, new THREE.LineBasicMaterial({ color: 0xa7b8bd }));
    cable.frustumCulled = false; g.add(cable);
    const hook = new THREE.Group();
    const hb = new Batch();
    hb.box(0.1, 0.3, 0.1, 0xf4c15e, 0, 0, 0); hb.box(0.1, 0.1, 0.34, 0xf4c15e, 0, -0.16, 0.1); hb.box(0.1, 0.26, 0.1, 0xf4c15e, 0, -0.05, 0.24);
    hook.add(hb.build(MAT_FLAT()));
    hook.visible = false; g.add(hook);
    g.add(blob(3.4));
    return { group: g, wheels, beacon, cable, hook };
  }

  // ---------- ambulance ----------
  function makeAmbulanceMesh() {
    const g = new THREE.Group();
    const b = new Batch();
    b.box(2.1, 1.9, 3.4, 0xf2f3e9, 0, 1.45, -0.7); // patient box
    b.box(2.0, 1.0, 1.5, 0xf2f3e9, 0, 0.95, 2.0); // cab
    b.box(1.9, 0.55, 0.08, 0x365e70, 0, 1.25, 2.76); // cab glass
    b.box(2.12, 0.3, 3.4, 0x178d88, 0, 1.1, -0.7); // teal stripe
    b.box(2.12, 0.12, 3.4, 0xd9ef80, 0, 1.42, -0.7); // lime stripe
    b.box(0.5, 0.14, 0.05, 0x178d88, 0, 1.5, -2.42); // rear teal bar
    b.box(0.14, 0.5, 0.05, 0x178d88, 0, 1.5, -2.42);
    b.box(2.14, 0.3, 0.2, 0x344958, 0, 0.35, 2.7); // bumper
    const body = b.build(MAT_FLAT()); g.add(body);
    const glowB = new Batch();
    glowB.box(0.3, 0.1, 0.05, 0xffb85a, -0.7, 0.6, -2.42);
    glowB.box(0.3, 0.1, 0.05, 0xffb85a, 0.7, 0.6, -2.42);
    g.add(glowB.build(MAT_BASIC(), false));
    const strobeA = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.28), bas(0x61d7ff));
    strobeA.position.set(-0.6, 2.48, -0.7); g.add(strobeA);
    const strobeB = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.28), bas(0xffc24d));
    strobeB.position.set(0.6, 2.48, -0.7); g.add(strobeB);
    const wheels = [];
    for (const [wx, wz] of [[-0.95, 1.9], [0.95, 1.9], [-0.95, -1.7], [0.95, -1.7]]) {
      const wm = wheelMesh(0.37); wm.position.set(wx, 0.37, wz); g.add(wm); wheels.push(wm);
    }
    const lights = headlightRig(7.5, 1.9, 0.65, 2.75);
    g.add(lights);
    g.add(blob(2.8));
    return { group: g, wheels, strobeA, strobeB, lights };
  }

  // ---------- helicopter ----------
  function makeHeliMesh() {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshPhongMaterial({ color: 0xe9ece8, shininess: 30 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), bodyMat);
    body.scale.set(1.35, 0.85, 2.15); body.castShadow = true; g.add(body);
    const belly = box(1.7, 0.5, 2.6, 0x244b6b, 0, -0.55, 0.2); g.add(belly);
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.72, 12, 8),
      new THREE.MeshPhongMaterial({ color: 0x67b8cb, specular: 0xd8ffff, transparent: true, opacity: 0.82 }));
    canopy.position.set(0, 0.18, 1.35); canopy.scale.set(1.1, 0.8, 1); g.add(canopy);
    const stripe = box(2.2, 0.18, 2.4, 0x244b6b, 0, 0.05, 0); g.add(stripe);
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, 3.6, 7), lam(0xe9ece8));
    boom.rotation.x = Math.PI / 2 - 0.06; boom.position.set(0, 0.25, -3.4); g.add(boom);
    g.add(box(0.08, 0.9, 0.7, 0x244b6b, 0, 0.6, -5.1)); // fin
    g.add(box(1.3, 0.07, 0.4, 0x244b6b, 0, 0.3, -5.0)); // stabilizer
    for (const sx of [-0.85, 0.85]) {
      const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), lam(0x414b55));
      skid.rotation.x = Math.PI / 2; skid.position.set(sx, -1.15, 0.2); g.add(skid);
      g.add(box(0.06, 0.6, 0.06, 0x414b55, sx, -0.85, 0.8));
      g.add(box(0.06, 0.6, 0.06, 0x414b55, sx, -0.85, -0.5));
    }
    const rotor = new THREE.Group(); rotor.position.y = 1.05;
    const rb = new Batch();
    rb.box(13, 0.05, 0.42, 0x252d38, 0, 0, 0);
    rb.box(0.5, 0.06, 0.6, 0xe9ece8, 6.3, 0, 0); rb.box(0.5, 0.06, 0.6, 0xe9ece8, -6.3, 0, 0);
    rotor.add(rb.build(MAT_FLAT(), false));
    g.add(rotor);
    const tailRotor = new THREE.Group(); tailRotor.position.set(0.12, 0.6, -5.1);
    const tb = new Batch(); tb.box(0.05, 1.55, 0.16, 0x252d38, 0, 0, 0);
    tailRotor.add(tb.build(MAT_FLAT(), false));
    g.add(tailRotor);
    const navL = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), bas(0xff4455));
    navL.position.set(-1.35, 0, 0.4); g.add(navL);
    const navR = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), bas(0x55ffc2));
    navR.position.set(1.35, 0, 0.4); g.add(navR);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), bas(0xff404a));
    beacon.position.set(0, 0.95, -0.6); g.add(beacon);
    const spot = new THREE.SpotLight(0xffe9ad, 0, 620, 0.12, 0.24);
    g.add(spot); g.add(spot.target);
    const coneMat = new THREE.MeshBasicMaterial({ color: 0xffedb7, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 14, 1, true), coneMat);
    g.add(cone);
    const discMat = new THREE.MeshBasicMaterial({ color: 0xffe6a2, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 22), discMat);
    disc.rotation.x = -Math.PI / 2;
    g.add(disc);
    const groundBlob = blob(3);
    return { group: g, rotor, tailRotor, spot, cone, disc, beacon, groundBlob };
  }

  // ---------- boat ----------
  function makeBoatMesh(colorHex) {
    const g = new THREE.Group();
    const b = new Batch();
    b.box(2.3, 0.55, 5.4, colorHex, 0, 0.45, 0); // hull
    b.box(2.0, 0.3, 4.6, 0x2e4a56, 0, 0.8, -0.1); // deck
    b.box(2.34, 0.18, 5.44, 0x22252e, 0, 0.78, 0); // rubber rail
    b.box(0.9, 0.6, 0.5, 0xe46b4e, 0, 1.15, 0.7); // console
    b.box(0.8, 0.5, 0.7, 0xf0ead8, 0, 1.0, -0.6); // seat
    b.box(0.8, 0.5, 0.7, 0xf0ead8, 0, 1.0, -1.5);
    const hull = b.build(MAT_FLAT()); g.add(hull);
    const shield = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.55),
      new THREE.MeshPhongMaterial({ color: 0x395368, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
    shield.position.set(0, 1.6, 0.95); shield.rotation.x = -0.25; g.add(shield);
    const bow = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), bas(0xfff2cf));
    bow.position.set(0, 0.85, 2.75); g.add(bow);
    const wakeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
    const wake = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 6), wakeMat);
    wake.rotation.x = -Math.PI / 2; wake.position.set(0, 0.06, -5.6);
    g.add(wake);
    return { group: g, wake, wakeMat };
  }

  // ---------- swimmer: head, cap and back at the surface, arms paddling ----------
  function makeSwimmer(colorHex) {
    const g = new THREE.Group();
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), lam(0xc68c66));
    head.position.y = 0.12; head.castShadow = true; g.add(head);
    g.add(box(0.21, 0.08, 0.22, colorHex, 0, 0.21, 0));
    g.add(box(0.34, 0.1, 0.52, colorHex, 0, 0.03, -0.12));
    const armGeo = new THREE.CylinderGeometry(0.045, 0.04, 0.52, 5); armGeo.translate(0, -0.26, 0);
    const armL = new THREE.Mesh(armGeo.clone(), lam(0xc68c66));
    armL.position.set(-0.23, 0.09, 0.06); armL.castShadow = true; g.add(armL);
    const armR = new THREE.Mesh(armGeo, lam(0xc68c66));
    armR.position.set(0.23, 0.09, 0.06); armR.castShadow = true; g.add(armR);
    return { group: g, armL, armR };
  }

  // ---------- dusk shell ----------
  function makeShellMesh() {
    const g = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), bas(0xf8cf69));
    shell.scale.set(1, 0.55, 1); shell.position.y = 0.5; g.add(shell);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 7), bas(0xf1ad5e));
    tip.position.y = 0.85; g.add(tip);
    return g;
  }

  return { PedField, makeFigure, makeSittingFigure, makeCarMesh, makeBikeMesh, makeTowMesh, makeAmbulanceMesh, makeHeliMesh, makeBoatMesh, makeShellMesh, makeSwimmer, blob };
})();
