'use strict';
/* Saltline: Vice Heat — static world building + environment (sky, sun, PLN
   night lighting, rain, water). Built once from the generated city data. */
const SLW = (() => {
  const { Batch, MAT_FLAT, MAT_GLASS, MAT_BASIC, canvasTex, paint } = SLG;

  function makeSign(text, accent, w = 6, h = 1.6) {
    const grp = new THREE.Group();
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x40536b });
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.4, 0.18), poleMat);
    pole.position.y = 1.7; grp.add(pole);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), new THREE.MeshLambertMaterial({ color: 0x263f54 }));
    panel.position.y = 3.4 + h / 2; grp.add(panel);
    const tex = canvasTex(512, Math.round(512 * h / w), (ctx, cw, ch) => {
      ctx.fillStyle = '#263f54'; ctx.fillRect(0, 0, cw, ch);
      ctx.fillStyle = '#' + new THREE.Color(accent).getHexString(); ctx.fillRect(0, 0, cw, 10);
      ctx.fillStyle = '#f4dcb9'; ctx.font = `bold ${Math.round(ch * 0.52)}px Arial`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, cw / 2, ch / 2 + 4);
    });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.96, h * 0.9), new THREE.MeshBasicMaterial({ map: tex }));
    face.position.set(0, 3.4 + h / 2, 0.07); grp.add(face);
    const back = face.clone(); back.rotation.y = Math.PI; back.position.z = -0.07; grp.add(back);
    return grp;
  }

  function boardTexture(board) {
    return canvasTex(512, 128, (ctx, w, h) => {
      ctx.fillStyle = '#1d364b'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = board.main ? '#e37c70' : '#4aa99e'; ctx.fillRect(0, 0, 14, h);
      ctx.fillStyle = '#f4dcb9'; ctx.font = 'bold 37px Georgia'; ctx.textAlign = 'center';
      ctx.fillText('SALTLINE', w / 2, 52);
      ctx.fillStyle = '#96e2d3'; ctx.font = 'bold 24px Arial';
      ctx.fillText(board.name, w / 2, 95);
    });
  }

  function buildWorld(D, city) {
    const g = new THREE.Group();
    const flat = new Batch(), glass = new Batch(), basic = new Batch();
    const R = D.ROADS;

    // ---- ground stack: base, block floors, sidewalks, asphalt, markings ----
    flat.box(452, 1, 452, 0xb89b93, 0, -0.5, 0);
    for (const bl of city.blocks) {
      const c = bl.kind === 'park' ? 0x7fae62 : bl.kind === 'market' ? 0xc9a06b : 0xcbb39f;
      flat.box(46, 0.06, 46, c, bl.x0 + 32, 0.03, bl.z0 + 32);
    }
    for (const r of R) {
      flat.box(24, 0.1, 436, 0xcdad9f, r, 0.05, 0);
      flat.box(436, 0.1, 24, 0xcdad9f, 0, 0.05, r);
      flat.box(18, 0.14, 436, 0x3b485e, r, 0.07, 0);
      flat.box(436, 0.14, 18, 0x3b485e, 0, 0.07, r);
    }
    const mark = new Batch();
    for (const r of R) {
      for (let a = -210; a < 214; a += 8) {
        mark.box(0.28, 0.02, 3, 0xffeaca, r, 0.15, a);
        mark.box(3, 0.02, 0.28, 0xffeaca, a, 0.15, r);
      }
      mark.box(0.14, 0.02, 436, 0x899aaa, r - 8.6, 0.15, 0);
      mark.box(0.14, 0.02, 436, 0x899aaa, r + 8.6, 0.15, 0);
      mark.box(436, 0.02, 0.14, 0x899aaa, 0, 0.15, r - 8.6);
      mark.box(436, 0.02, 0.14, 0x899aaa, 0, 0.15, r + 8.6);
    }
    mark.box(0.3, 0.02, 436, 0xffba62, 0, 0.16, 0);
    for (const rx of R) for (const rz of R) {
      for (let s = -3; s <= 3; s++) {
        mark.box(1.1, 0.02, 3.4, 0xffeaca, rx + s * 2.4, 0.15, rz - 11);
        mark.box(1.1, 0.02, 3.4, 0xffeaca, rx + s * 2.4, 0.15, rz + 11);
      }
    }
    g.add(mark.build(MAT_BASIC(), false));

    // ---- buildings ----
    const litWin = new Batch();
    const glassPal = [0x385974, 0x467990, 0x668b9e, 0x506581, 0x397081];
    const towerPal = [0x3e708a, 0x527794, 0x426286, 0x468b98];
    const twinkle = [0xffc786, 0x81dfed, 0xff9d94, 0xffe9bb];
    const facePoolGeos = [];
    for (const b of city.buildings) {
      const rng = D.stream(b.seed);
      const tower = b.h > 33;
      const body = tower ? towerPal[Math.floor(rng() * 4)] : b.color;
      flat.box(b.w, b.h, b.d, body, b.x, b.h / 2, b.z);
      const district = D.districtAt(b.x, b.z);
      const accent = D.DISTRICT_ACCENT[district];
      const colsX = Math.max(2, Math.floor(b.w / 2.3)), colsZ = Math.max(2, Math.floor(b.d / 2.3));
      const rows = Math.max(2, Math.min(16, Math.floor(b.h / 3.1)));
      for (let f = 0; f < 4; f++) {
        const along = f < 2 ? colsX : colsZ;
        for (let cx = 0; cx < along; cx++) for (let ry = 0; ry < rows; ry++) {
          const u = (cx + 0.5) / along - 0.5, v = (ry + 0.5) / rows;
          const wy = 1.6 + v * (b.h - 2.4);
          let wx, wz, ryaw = 0;
          if (f === 0) { wx = b.x + u * b.w; wz = b.z + b.d / 2 + 0.04; }
          else if (f === 1) { wx = b.x - u * b.w; wz = b.z - b.d / 2 - 0.04; ryaw = Math.PI; }
          else if (f === 2) { wx = b.x + b.w / 2 + 0.04; wz = b.z + u * b.d; ryaw = Math.PI / 2; }
          else { wx = b.x - b.w / 2 - 0.04; wz = b.z - u * b.d; ryaw = -Math.PI / 2; }
          const lit = rng() < b.winFrac;
          if (lit) litWin.box(1.15, 1.5, 0.06, twinkle[Math.floor(rng() * 4)], wx, wy, wz, ryaw);
          else glass.box(1.15, 1.5, 0.06, tower ? body : glassPal[Math.floor(rng() * 5)], wx, wy, wz, ryaw);
        }
        if (f < 2) facePoolGeos.push({ x: b.x, z: b.z + (f === 0 ? 1 : -1) * (b.d / 2 + 1.6), w: b.w * 0.92 });
      }
      // ground floor: door, district band, light strip, awning
      flat.box(1.6, 2.6, 0.15, 0x385565, b.x, 1.3, b.z + b.d / 2 + 0.05);
      flat.box(b.w * 0.92, 0.5, 0.1, accent, b.x, 3.1, b.z + b.d / 2 + 0.06);
      basic.box(b.w * 0.92, 0.12, 0.05, 0xffe6b7, b.x, 2.82, b.z + b.d / 2 + 0.1);
      if (rng() < 0.45) {
        flat.box(b.w * 0.7, 0.12, 1.6, accent, b.x, 2.9, b.z + b.d / 2 + 0.9, 0, 0.32);
        basic.box(b.w * 0.7, 0.06, 0.2, rng() < 0.5 ? 0xff9b91 : 0x88eded, b.x, 2.72, b.z + b.d / 2 + 1.55);
      }
      // roof dressing
      if (tower) {
        flat.box(b.w * 0.6, 1.2, b.d * 0.6, 0xb7d5db, b.x, b.h + 0.6, b.z);
        flat.box(b.w * 0.42, 1.1, b.d * 0.42, 0xb7d5db, b.x, b.h + 1.7, b.z);
        flat.box(b.w * 0.3, 1.4, b.d * 0.3, 0x355673, b.x, b.h + 2.9, b.z);
        if (rng() < 0.5) {
          flat.cyl(0.06, 0.06, 6, 5, 0x355673, b.x + 2, b.h + 6, b.z + 2);
          basic.sph(0.32, 0xf78495, b.x + 2, b.h + 9.1, b.z + 2);
        }
      } else {
        for (let k = 0; k < 2; k++) {
          const ax = b.x + (k ? 1 : -1) * b.w * 0.22, az = b.z + (k ? -1 : 1) * b.d * 0.2;
          const dark = new THREE.Color(body).multiplyScalar(0.72).getHex();
          flat.box(2.2, 0.8, 1.8, dark, ax, b.h + 0.4, az);
          flat.box(2.4, 0.18, 2.0, 0x63818a, ax, b.h + 0.9, az);
        }
        if (b.kind === 'warehouse') flat.box(b.w * 0.7, 0.7, 1.6, 0x62727d, b.x, b.h + 0.35, b.z);
      }
      if (rng() < 0.4) { // water tank
        const tx = b.x - b.w * 0.25, tz = b.z - b.d * 0.25;
        flat.cyl(0.09, 0.09, 1.6, 5, 0x6b8a91, tx - 0.8, b.h + 0.8, tz);
        flat.cyl(0.09, 0.09, 1.6, 5, 0x6b8a91, tx + 0.8, b.h + 0.8, tz);
        flat.cyl(1.3, 1.3, 1.5, 10, 0xb9a8a0, tx, b.h + 2.3, tz);
      }
    }
    g.add(flat.build(MAT_FLAT()));
    g.add(glass.build(MAT_GLASS()));
    const litWinMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    g.add(litWin.build(litWinMat, false));
    g.add(basic.build(MAT_BASIC(), false));

    // ---- street lamps + PLN decals ----
    const lampFlat = new Batch(), bulbBatch = new Batch(), haloBatch = new Batch(), poolBatch = new Batch();
    for (const l of city.lamps) {
      const dx = Math.sin(l.rot), dz = Math.cos(l.rot);
      lampFlat.cyl(0.07, 0.09, 5, 6, 0x42586a, l.x, 2.5, l.z);
      lampFlat.box(0.12, 0.12, 1.5, 0x42586a, l.x + dx * 0.66, 4.95, l.z + dz * 0.66, l.rot);
      lampFlat.box(0.45, 0.15, 0.66, 0x53687a, l.x + dx * 1.32, 4.92, l.z + dz * 1.32, l.rot);
      bulbBatch.box(0.3, 0.08, 0.4, 0xffffff, l.x + dx * 1.32, 4.82, l.z + dz * 1.32, l.rot);
      haloBatch.add(paint(new THREE.PlaneGeometry(2.6, 2.6), 0xffffff), l.x + dx * 1.32, 4.85, l.z + dz * 1.32);
      haloBatch.add(paint(new THREE.PlaneGeometry(2.6, 2.6), 0xffffff), l.x + dx * 1.32, 4.85, l.z + dz * 1.32, Math.PI / 2);
      poolBatch.add(paint(new THREE.CircleGeometry(6.5, 18), 0xffffff), l.x + dx * 1.4, 0.19, l.z + dz * 1.4, 0, -Math.PI / 2);
    }
    g.add(lampFlat.build(MAT_FLAT()));
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0x49525c });
    g.add(bulbBatch.build(bulbMat, false));
    const haloMat = new THREE.MeshBasicMaterial({ color: 0xffd694, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    g.add(haloBatch.build(haloMat, false));
    const poolMat = new THREE.MeshBasicMaterial({ color: 0xffc98a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    g.add(poolBatch.build(poolMat, false));
    const facePoolBatch = new Batch();
    for (const fp of facePoolGeos) {
      facePoolBatch.add(paint(new THREE.PlaneGeometry(fp.w, 3.2), 0xffffff), fp.x, 0.19, fp.z, 0, -Math.PI / 2);
    }
    const facePoolMat = new THREE.MeshBasicMaterial({ color: 0xffbe78, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    g.add(facePoolBatch.build(facePoolMat, false));
    const fixBatch = new Batch();
    for (const b of city.buildings) {
      fixBatch.box(0.3, 0.18, 0.1, 0xffd9a0, b.x - b.w * 0.3, 3.4, b.z + b.d / 2 + 0.08);
      fixBatch.box(0.3, 0.18, 0.1, 0xffd9a0, b.x + b.w * 0.3, 3.4, b.z + b.d / 2 + 0.08);
    }
    const fixMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x222222 });
    g.add(fixBatch.build(fixMat, false));

    // ---- traffic lights (decorative, both lamps lit) ----
    const tlFlat = new Batch(), tlBasic = new Batch();
    for (const rx of R) for (const rz of R) {
      const x = rx + 9.5, z = rz + 9.5;
      tlFlat.cyl(0.07, 0.07, 4.6, 6, 0x485a72, x, 2.3, z);
      tlFlat.box(0.57, 1.27, 0.45, 0x344355, x, 4.6, z);
      tlBasic.box(0.29, 0.29, 0.06, 0xf3717b, x, 4.95, z + 0.24);
      tlBasic.box(0.29, 0.29, 0.06, 0x8ef0ad, x, 4.25, z + 0.24);
    }
    g.add(tlFlat.build(MAT_FLAT()));
    g.add(tlBasic.build(MAT_BASIC(), false));

    // ---- palms ----
    const palmFlat = new Batch();
    const leafPal = [0x196856, 0x2e8768, 0x53a66c, 0x3c925b];
    function leafGeo(len) {
      const geo = new THREE.PlaneGeometry(0.55, len, 1, 4);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i), v = (y + len / 2) / len;
        pos.setZ(i, -Math.sin(v * 1.15) * len * 0.34);
        pos.setX(i, pos.getX(i) * (1 - Math.abs(v - 0.45) * 0.9));
      }
      geo.computeVertexNormals();
      return geo;
    }
    for (const p of city.palms) {
      const rng = D.stream(p.seed);
      if (rng() < 0.72) {
        palmFlat.box(1.7, 0.5, 1.7, 0xedc4a5, p.x, 0.25, p.z);
        palmFlat.box(1.45, 0.12, 1.45, 0x695a61, p.x, 0.53, p.z);
      }
      const dx = Math.cos(p.dir), dz = Math.sin(p.dir);
      const segs = 6;
      for (let s = 0; s < segs; s++) {
        const t0 = s / segs, t1 = (s + 1) / segs;
        palmFlat.cyl(0.13 - 0.04 * t0, 0.15 - 0.04 * t0, p.h / segs + 0.06, 6,
          s % 2 ? 0xba9875 : 0xa47e65,
          p.x + dx * p.lean * (t0 + t1) / 2, p.h * (t0 + t1) / 2, p.z + dz * p.lean * (t0 + t1) / 2,
          0, dz * p.lean / p.h, -dx * p.lean / p.h);
      }
      const topX = p.x + dx * p.lean, topZ = p.z + dz * p.lean;
      palmFlat.sph(0.3, 0x536843, topX, p.h + 0.05, topZ);
      for (let lf = 0; lf < 9; lf++) {
        const len = 2.12 + rng() * 1.26;
        const yaw = (lf / 9) * Math.PI * 2 + rng() * 0.5;
        palmFlat.add(paint(leafGeo(len), leafPal[Math.floor(rng() * 4)]), topX, p.h + 0.1, topZ, yaw, -0.85 - rng() * 0.4, 0);
      }
    }
    const palmMesh = palmFlat.build(MAT_FLAT());
    palmMesh.material.side = THREE.DoubleSide;
    g.add(palmMesh);

    // ---- district boards ----
    const boardFlat = new Batch();
    for (const b of D.DISTRICT_BOARDS) {
      const w = b.main ? 14 : 10.8, h = b.main ? 2.7 : 2.14;
      const spread = b.main ? 6.1 : 4.7;
      boardFlat.box(0.18, 8.5, 0.18, 0x40536b, b.x - Math.cos(b.yaw) * spread, 4.25, b.z + Math.sin(b.yaw) * spread);
      boardFlat.box(0.18, 8.5, 0.18, 0x40536b, b.x + Math.cos(b.yaw) * spread, 4.25, b.z - Math.sin(b.yaw) * spread);
      boardFlat.box(w + 1.4, 0.3, 0.3, 0x304c5e, b.x, 7.47, b.z, b.yaw);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.14), new THREE.MeshLambertMaterial({ color: 0x263f54 }));
      panel.position.set(b.x, 8.9 - h / 2 + 1.35, b.z); panel.rotation.y = b.yaw;
      g.add(panel);
      const tex = boardTexture(b);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(w * (496 / 512), h * (112 / 128)), new THREE.MeshBasicMaterial({ map: tex }));
      face.position.set(b.x, panel.position.y, b.z);
      face.rotation.y = b.yaw;
      face.translateZ(0.08);
      g.add(face);
      const back = face.clone();
      back.rotation.set(0, b.yaw + Math.PI, 0);
      back.position.set(b.x, panel.position.y, b.z);
      back.translateZ(0.08);
      g.add(back);
    }
    g.add(boardFlat.build(MAT_FLAT()));

    // ---- beach, piers, parking, stations, storefronts ----
    const beach = new Batch();
    beach.box(30, 0.1, 228, 0xefe0cd, 212, 0.05, 43);
    beach.box(6, 0.14, 228, 0xcdad9f, 200, 0.07, 43);
    for (const pz of D.PIERS) {
      beach.box(26, 0.35, 3.2, 0x8a6b4f, 239, 0.85, pz);
      for (let px = 228; px <= 250; px += 7) {
        beach.cyl(0.14, 0.14, 1.6, 6, 0x6e563e, px, 0.1, pz - 1.3);
        beach.cyl(0.14, 0.14, 1.6, 6, 0x6e563e, px, 0.1, pz + 1.3);
      }
    }
    const umbCols = [0xe47271, 0x3eaaa5, 0xdab55b, 0x42a9a2, 0xf17d6f];
    const umbSpots = [[207.5, -38], [209, 8], [206.5, 58], [209.5, 96], [207, 128]];
    umbSpots.forEach(([ux, uz], i) => {
      beach.cyl(0.05, 0.05, 2.4, 5, 0xd8d2c4, ux, 1.2, uz);
      beach.cyl(0.05, 1.7, 0.55, 8, umbCols[i], ux, 2.5, uz);
    });
    const towelCols = [0xf17d6f, 0x42a9a2, 0xeac45f, 0x7197bc];
    [[206, -30], [210, 14], [205.5, 66], [210.5, 104]].forEach(([tx, tz], i) => {
      beach.box(1.1, 0.06, 2.2, towelCols[i], tx, 0.14, tz, i * 0.4);
    });
    beach.box(0.18, 3, 0.18, 0xd8d2c4, 210, 1.5, 21); beach.box(0.18, 3, 0.18, 0xd8d2c4, 212, 1.5, 21);
    beach.box(0.18, 3, 0.18, 0xd8d2c4, 210, 1.5, 23); beach.box(0.18, 3, 0.18, 0xd8d2c4, 212, 1.5, 23);
    beach.box(2.6, 1.6, 2.6, 0xf2efe8, 211, 3.8, 22);
    beach.box(3, 0.2, 3, 0xe47271, 211, 4.75, 22);
    g.add(beach.build(MAT_FLAT()));

    // parking pad + bays + label
    const pad = new Batch();
    pad.box(23, 0.16, 18, 0x333f52, 171.5, 0.08, 42);
    for (const bay of D.PARKING.carBays) pad.box(3.0, 0.02, 0.18, 0xd8dee2, bay.x, 0.18, bay.z + (bay.ang === 0 ? -3.3 : 3.3));
    for (const bay of D.PARKING.bikeBays) pad.box(2.0, 0.02, 0.18, 0xd8dee2, bay.x, 0.18, bay.z - 1.7);
    g.add(pad.build(MAT_FLAT(), false));
    const padTex = canvasTex(256, 128, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(240,240,230,0.85)'; ctx.font = 'bold 44px Arial';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('PARKING', w / 2, h / 2);
    });
    const padLabel = new THREE.Mesh(new THREE.PlaneGeometry(11, 5.5),
      new THREE.MeshBasicMaterial({ map: padTex, transparent: true, depthWrite: false }));
    padLabel.rotation.x = -Math.PI / 2; padLabel.rotation.z = Math.PI / 2;
    padLabel.position.set(171.5, 0.19, 42);
    g.add(padLabel);
    const parkSign = makeSign('PARKING', 0xf4bb45, 4.4, 1.2);
    parkSign.position.set(D.PARKING.sign.x, 0, D.PARKING.sign.z); parkSign.rotation.y = -0.5;
    g.add(parkSign);

    // fuel stations + site signs
    for (const f of D.FUEL_STATIONS) {
      const st = new Batch();
      st.box(7, 0.3, 5, 0xe8e2d2, f.x, 3.4, f.z);
      st.box(0.25, 3.4, 0.25, 0x8d9fad, f.x - 3, 1.7, f.z - 2); st.box(0.25, 3.4, 0.25, 0x8d9fad, f.x + 3, 1.7, f.z - 2);
      st.box(0.25, 3.4, 0.25, 0x8d9fad, f.x - 3, 1.7, f.z + 2); st.box(0.25, 3.4, 0.25, 0x8d9fad, f.x + 3, 1.7, f.z + 2);
      st.box(0.7, 1.3, 0.5, 0x353b46, f.x - 1.2, 0.65, f.z); st.box(0.7, 1.3, 0.5, 0x353b46, f.x + 1.2, 0.65, f.z);
      st.box(0.72, 0.3, 0.52, 0xe46c70, f.x - 1.2, 1.1, f.z); st.box(0.72, 0.3, 0.52, 0xe46c70, f.x + 1.2, 1.1, f.z);
      g.add(st.build(MAT_FLAT()));
      const s = makeSign('FUEL', 0xe46c70, 3.6, 1.1); s.position.set(f.x + 4.5, 0, f.z + 3); g.add(s);
    }
    const siteSigns = [
      ['DISPATCH', D.SITES.mara, 0xf77f80], ['GARAGE', D.SITES.nico, 0xf1ad5e],
      ['CLINIC', D.SITES.clinic, 0x72e5bb], ['HOME', D.SITES.home, 0x8bbcff],
      ['CHOP SHOP', D.SITES.chop, 0xf8cf69],
    ];
    for (const [txt, site, acc] of siteSigns) {
      const s = makeSign(txt, acc, 4.6, 1.2);
      s.position.set(site.x + 2.5, 0, site.z + 2.5); s.rotation.y = 0.6;
      g.add(s);
    }
    const store = new Batch();
    for (const sh of D.ROBBERY_SHOPS) {
      store.box(7, 3.4, 0.5, 0x395368, sh.x, 1.7, sh.z);
      store.box(7.4, 0.5, 0.7, D.DISTRICT_ACCENT[D.districtAt(sh.x, sh.z)], sh.x, 3.6, sh.z);
    }
    g.add(store.build(MAT_GLASS()));

    // ---- wet sheen + puddles ----
    const sheenGeos = new Batch();
    for (const r of R) {
      sheenGeos.box(18, 0.01, 436, 0xffffff, r, 0.145, 0);
      sheenGeos.box(436, 0.01, 18, 0xffffff, 0, 0.145, r);
    }
    const sheenMat = new THREE.MeshLambertMaterial({ color: 0x131a25, transparent: true, opacity: 0 });
    g.add(sheenGeos.build(sheenMat, false));
    const pudBatch = new Batch();
    const pudCols = [0x27384a, 0x2e4256, 0x22303f];
    let pudI = 0;
    for (const rx of R) for (const rz of R) {
      for (const [ox, oz] of [[13.5, 13.5], [-13.5, -13.5]]) {
        pudBatch.add(paint(new THREE.CircleGeometry(2.6 + (pudI % 3), 14), pudCols[pudI % 3]), rx + ox, 0.17, rz + oz, 0, -Math.PI / 2);
        pudI++;
      }
    }
    const pudMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0 });
    g.add(pudBatch.build(pudMat, false));

    // ---- sky dome + water ----
    const skyUni = {
      topColor: { value: new THREE.Color(0x4ba6d6) },
      horizonColor: { value: new THREE.Color(0xbfe3da) },
      sunDir: { value: new THREE.Vector3(-0.6, 0.55, -0.3) },
      sunColor: { value: new THREE.Color(0xffe9c9) },
    };
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 24, 12), new THREE.ShaderMaterial({
      uniforms: skyUni, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vDir; uniform vec3 topColor; uniform vec3 horizonColor; uniform vec3 sunDir; uniform vec3 sunColor;
        void main(){
          float h = clamp(vDir.y, 0.0, 1.0);
          vec3 col = mix(horizonColor, topColor, pow(h, 0.55));
          float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
          col += sunColor * (pow(s, 220.0) * 1.2 + pow(s, 10.0) * 0.22);
          gl_FragColor = vec4(col, 1.0);
        }`,
    }));
    g.add(sky);
    const waterUni = { time: { value: 0 }, storm: { value: 0 } };
    const water = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.ShaderMaterial({
      uniforms: waterUni, fog: false,
      vertexShader: 'varying vec3 vW; uniform float time; uniform float storm; void main(){ vec4 w = modelMatrix * vec4(position,1.0); w.y += sin(w.x*0.08 + time*1.3) * cos(w.z*0.07 + time) * (0.05 + storm*0.12); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `varying vec3 vW; uniform float time;
        void main(){
          float d = length(vec2(max(abs(vW.x) - 222.0, 0.0), max(abs(vW.z) - 222.0, 0.0)));
          float shore = smoothstep(60.0, 4.0, d);
          vec3 col = mix(vec3(0.022,0.24,0.32), vec3(0.055,0.53,0.55), shore);
          float foamBand = smoothstep(16.0, 2.0, d) * smoothstep(0.5, 3.0, d);
          float foam = foamBand * (0.5 + 0.5 * sin(vW.x * 0.8 + vW.z * 0.6 + time * 1.7));
          col = mix(col, vec3(0.9, 0.95, 0.95), clamp(foam, 0.0, 1.0) * 0.5);
          float glit = pow(max(0.0, sin(vW.x * 1.7 + time * 2.0) * sin(vW.z * 1.9 - time * 1.6)), 18.0);
          col += vec3(1.0, 0.9, 0.7) * glit * 0.35;
          gl_FragColor = vec4(col, 1.0);
        }`,
    }));
    water.rotation.x = -Math.PI / 2; water.position.y = -0.49;
    g.add(water);

    // ---- rain (700 line segments around the camera) ----
    const rainPos = new Float32Array(700 * 2 * 3);
    const rainSeed = D.stream(4242);
    const rainBase = [];
    for (let i = 0; i < 700; i++) rainBase.push([(rainSeed() - 0.5) * 92, rainSeed() * 30, (rainSeed() - 0.5) * 92]);
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    const rainMat = new THREE.LineBasicMaterial({ color: 0xcfe4ee, transparent: true, opacity: 0 });
    const rain = new THREE.LineSegments(rainGeo, rainMat);
    rain.frustumCulled = false;
    g.add(rain);

    // ---- lights ----
    const hemi = new THREE.HemisphereLight(0xfff2db, 0x8a8db1, 1.52);
    g.add(hemi);
    const sun = new THREE.DirectionalLight(0xffd4aa, 2.04);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -48; sun.shadow.camera.right = 48;
    sun.shadow.camera.top = 48; sun.shadow.camera.bottom = -48;
    sun.shadow.camera.far = 320;
    g.add(sun); g.add(sun.target);

    const _c2 = new THREE.Color();
    function lerpHex(a, b, t) { return new THREE.Color(a).lerp(_c2.setHex(b), t); }
    let lightning = 0;
    function update(dt, env) {
      const hrs = env.hours;
      const sunAng = ((hrs - 6) / 12.5) * Math.PI;
      const elev = Math.sin(sunAng);
      const dayF = THREE.MathUtils.clamp(elev * 2.6 + 0.25, 0, 1);
      const duskF = THREE.MathUtils.clamp(1 - Math.abs(elev) * 3.2, 0, 1) * (hrs > 12 ? 1 : 0.7);
      const storm = env.stormI;
      let nightF;
      if (hrs >= 18.5 || hrs < 5) nightF = 1;
      else if (hrs >= 17.9167) nightF = (hrs - 17.9167) / (18.5 - 17.9167);
      else if (hrs < 6) nightF = 1 - (hrs - 5);
      else nightF = 0;
      let horizon = lerpHex(0x333f6b, 0xbfe3da, dayF);
      let top = lerpHex(0x101736, 0x4ba6d6, dayF);
      if (duskF > 0.03 && dayF > 0.02) horizon.lerp(_c2.setHex(0xf8bd8d), duskF * 0.55);
      if (storm > 0.02) { horizon.lerp(_c2.setHex(0x67707c), storm * 0.8); top.lerp(_c2.setHex(0x39424e), storm * 0.8); }
      skyUni.horizonColor.value.copy(horizon);
      skyUni.topColor.value.copy(top);
      sky.position.copy(env.camPos);
      if (env.scene.fog) {
        env.scene.fog.color.copy(horizon);
        env.scene.fog.density = 0.0011 + 0.005 * storm;
      }
      const sunDir = new THREE.Vector3(Math.cos(sunAng) * -0.62, Math.max(elev, -0.12), -0.3).normalize();
      skyUni.sunDir.value.copy(sunDir);
      skyUni.sunColor.value.copy(lerpHex(0xff9a52, 0xffe9c9, dayF));
      const focus = env.focus;
      sun.position.set(focus.x + sunDir.x * 130, Math.max(sunDir.y, 0.06) * 130, focus.z + sunDir.z * 130);
      sun.target.position.copy(focus);
      if (env.lightning) lightning = 1;
      lightning = Math.max(0, lightning - dt * 6);
      sun.intensity = 2.04 * (0.18 + 0.82 * dayF) * (1 - 0.5 * storm) + lightning * 1.5;
      sun.color.copy(lerpHex(0xff9a52, 0xffd4aa, dayF));
      hemi.intensity = 1.52 * (0.5 + 0.5 * dayF) + lightning * 0.7;
      hemi.color.copy(lerpHex(0x8b9aca, 0xfff2db, dayF));
      haloMat.opacity = 0.85 * nightF;
      poolMat.opacity = 0.5 * nightF;
      facePoolMat.opacity = 0.5 * nightF;
      fixMat.color.setScalar(0.12 + 0.88 * nightF);
      bulbMat.color.copy(lerpHex(0x49525c, 0xffdda7, nightF));
      litWinMat.color.copy(lerpHex(0x51606a, 0xffffff, Math.max(nightF, 0.25)));
      sheenMat.opacity = 0.38 * storm;
      pudMat.opacity = storm > 0.02 ? 0.8 * Math.min(1, storm + 0.25) : 0;
      waterUni.time.value = env.t; waterUni.storm.value = storm;
      water.position.x = env.camPos.x; water.position.z = env.camPos.z;
      rainMat.opacity = 0.5 * storm;
      rain.visible = storm > 0.02;
      if (rain.visible) {
        rain.position.set(env.camPos.x, 0, env.camPos.z);
        const arr = rainGeo.attributes.position.array;
        for (let i = 0; i < 700; i++) {
          const b = rainBase[i];
          const y = 30 - ((env.t * 23 + b[1]) % 30);
          arr[i * 6] = b[0]; arr[i * 6 + 1] = y; arr[i * 6 + 2] = b[2];
          arr[i * 6 + 3] = b[0] + 0.35; arr[i * 6 + 4] = y - 0.85; arr[i * 6 + 5] = b[2];
        }
        rainGeo.attributes.position.needsUpdate = true;
      }
      return { dayF, nightF };
    }
    return { group: g, update };
  }

  function createMarker(colorHex, big = true) {
    const grp = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.75, 40),
      new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.3;
    grp.add(ring);
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(big ? 0.62 : 0.4),
      new THREE.MeshBasicMaterial({ color: colorHex }));
    crystal.position.y = 3.1;
    grp.add(crystal);
    if (big) {
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 9.3, 12, 1, true),
        new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
      beam.position.y = 4.65;
      grp.add(beam);
    }
    grp.userData.pulse = (t) => {
      const s = 1 + Math.sin(t * 3.4) * 0.105;
      ring.scale.set(s, s, 1);
      crystal.rotation.y = t * 1.6;
      crystal.position.y = 3.1 + Math.sin(t * 2) * 0.3;
    };
    return grp;
  }

  return { buildWorld, createMarker, makeSign };
})();
