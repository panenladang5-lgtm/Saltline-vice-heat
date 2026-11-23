'use strict';
/* Saltline: Vice Heat — boot, actor binding, camera, the 30 fps render loop
   over the fixed-step simulation, event routing and screenshot staging. */
(() => {
  const D = SLD;
  const params = new URLSearchParams(location.search);
  const SHOT = params.get('shot');

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.domElement.className = 'game3d';

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xa8c4cf, 0.0011);
  const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 4000);

  const city = D.genCity(D.SEED);
  const world = SLW.buildWorld(D, city);
  scene.add(world.group);

  const sim = SLS.createSim(D);
  const S = sim.S;
  const audio = SLAU.createAudio();

  // ---------------- actor binding ----------------
  const carRefs = new Map();
  let rivalRefs = null;
  const smokeMeshes = new Map();
  let pedField = null, playerFig = null;
  const policeCarRefs = [], policeFootFigs = [], blockRefs = [];
  const heliRefs = [];
  const towRefs = [], ambRefs = [];
  const boatStates = [], boatRefs = [];
  const shellRefs = [];
  let guardFigs = [];
  const fledPool = [];
  const medicFigs = [];
  let marker = null, passengerFig = null, fareFig = null;
  const gateRings = [];
  const tracers = [];
  const smokeGeo = new THREE.IcosahedronGeometry(0.55, 0);
  const smokeMat = new THREE.MeshBasicMaterial({ color: 0x555c60, transparent: true, opacity: 0.4, depthWrite: false });

  function seatFigure(colorOpts) {
    const fig = SLA.makeFigure(colorOpts);
    fig.pose(0, 'sit');
    return fig;
  }
  sim.buildEntities((st) => {
    pedField = new SLA.PedField(st.peds);
    scene.add(pedField.group);
    playerFig = SLA.makeFigure({ cap: 0x24425f, capVisor: 0x101c2c, shirt: 0x2e6f8e, pants: 0x27324a, backpack: 0x37455c });
    scene.add(playerFig.group);
    for (const car of st.cars) {
      let refs;
      if (car.type === 'bike') refs = SLA.makeBikeMesh(car.color);
      else refs = SLA.makeCarMesh(car.type, car.color, {});
      refs.group.position.set(car.x, 0, car.z);
      refs.group.rotation.y = car.ang;
      scene.add(refs.group);
      carRefs.set(car.id, refs);
      const smoke = new THREE.Mesh(smokeGeo, smokeMat);
      smoke.visible = false; smoke.position.set(car.x, 1.4, car.z);
      scene.add(smoke); smokeMeshes.set(car.id, smoke);
      if (car.driver && car.type !== 'bike') {
        const fig = seatFigure({ shirt: 0x777d84, pants: 0x3a4149 });
        fig.group.position.set(-0.38, 0.52, 0.05);
        refs.group.add(fig.group);
        refs.driverFig = fig;
      }
    }
    for (let i = 0; i < st.policeCars.length; i++) {
      const refs = SLA.makeCarMesh('sedan', 0xf2f4f6, { police: true });
      refs.group.visible = false;
      const fig = seatFigure({ shirt: 0x2b4d8f, pants: 0x22345c, cap: 0x1d3468 });
      fig.group.position.set(-0.38, 0.52, 0.05);
      refs.group.add(fig.group);
      scene.add(refs.group);
      policeCarRefs.push(refs);
    }
    for (let i = 0; i < st.policeFoot.length; i++) {
      const fig = SLA.makeFigure({ shirt: 0x2b4d8f, pants: 0x22345c, cap: 0x1d3468, badge: 0xd9b23c, weapon: 0x14181d });
      fig.group.visible = false;
      scene.add(fig.group);
      policeFootFigs.push(fig);
    }
    for (let i = 0; i < 3; i++) {
      const refs = SLA.makeHeliMesh();
      scene.add(refs.group);
      // the beam rig lives in world space, not in the heli's local frame
      scene.add(refs.spot); scene.add(refs.spot.target);
      scene.add(refs.cone); scene.add(refs.disc);
      refs.cone.visible = false; refs.disc.visible = false;
      heliRefs.push(refs);
    }
    for (let i = 0; i < st.services.tows.length; i++) {
      const refs = SLA.makeTowMesh();
      refs.group.position.set(D.SITES.depot.x, 0, D.SITES.depot.z);
      scene.add(refs.group);
      towRefs.push(refs);
    }
    for (let i = 0; i < st.services.ambulances.length; i++) {
      const refs = SLA.makeAmbulanceMesh();
      refs.group.position.set(D.SITES.ambulanceBase.x, 0, D.SITES.ambulanceBase.z + i * 6);
      scene.add(refs.group);
      ambRefs.push(refs);
      const medics = [];
      for (let m = 0; m < 2; m++) {
        const fig = SLA.makeFigure({ shirt: 0xe8ecec, pants: 0x9fb3ad, marker: 0x178d88 });
        fig.group.visible = false;
        scene.add(fig.group);
        medics.push(fig);
      }
      medicFigs.push(medics);
    }
    for (const b of D.BOATS) {
      const stt = { x: b.x, z: b.z, ang: b.ang, speed: 0 };
      boatStates.push(stt);
      const refs = SLA.makeBoatMesh(b.color);
      refs.group.position.set(b.x, 0, b.z);
      refs.group.rotation.y = b.ang;
      scene.add(refs.group);
      boatRefs.push(refs);
    }
    sim.setBoats(boatStates);
    for (const sh of D.SHELLS) {
      const grp = SLA.makeShellMesh();
      grp.position.set(sh.x, 0, sh.z);
      scene.add(grp);
      shellRefs.push({ group: grp });
    }
    // contacts
    const mara = SLA.makeFigure({ shirt: 0xd94f6a, pants: 0x2c3140, hair: 0x241d20 });
    mara.group.position.set(D.SITES.mara.x, 0, D.SITES.mara.z);
    mara.group.rotation.y = -Math.PI / 2;
    scene.add(mara.group);
    const nico = SLA.makeFigure({ shirt: 0xe07b2a, pants: 0x333a44, vest: 0xc96a1e });
    nico.group.position.set(D.SITES.nico.x, 0, D.SITES.nico.z);
    nico.group.rotation.y = Math.PI / 2;
    scene.add(nico.group);
    passengerFig = SLA.makeFigure({ shirt: 0xead94f, pants: 0x404a5a });
    passengerFig.group.visible = false;
    scene.add(passengerFig.group);
    // the same passenger, seated in the cab for the length of the fare
    fareFig = seatFigure({ shirt: 0xead94f, pants: 0x404a5a });
    fareFig.group.visible = false;
    scene.add(fareFig.group);
    // the race rival: a crimson sport coupe with its own driver, on stage
    // only while a street race is running
    rivalRefs = SLA.makeCarMesh('sport', 0xd92b3a, {});
    rivalRefs.group.visible = false;
    const rfig = seatFigure({ shirt: 0x8e1f2f, pants: 0x2a2e38 });
    rfig.group.position.set(-0.38, 0.52, 0.05);
    rivalRefs.group.add(rfig.group);
    scene.add(rivalRefs.group);
    // roadblock units (parked police cars, bound to the sim's block pool)
    for (let i = 0; i < st.blockCars.length; i++) {
      const refs = SLA.makeCarMesh('sedan', 0xf2f4f6, { police: true });
      refs.group.visible = false;
      scene.add(refs.group);
      blockRefs.push(refs);
    }
    // beach folk
    const folkDefs = [];
    for (let i = 0; i < 24; i++) {
      const stroll = i % 5 === 0;
      folkDefs.push({
        x: 205 + (i % 4) * 4.2, z: -44 + i * 7.6, dir: i % 2 ? 1 : -1,
        stroll, swing: Math.random() * 6, hidden: false,
        mode: stroll ? 'walk' : (i % 3 === 0 ? 'lie' : 'sit'),
      });
    }
    st.beachFolk = folkDefs;
    st._folkFigs = folkDefs.map((f) => {
      const fig = SLA.makeFigure({ shirt: [0xe8e3d5, 0x7fd4e8, 0xf2a65a, 0xd96a7f][Math.floor(Math.random() * 4)], pants: 0x51606e, hair: null });
      fig.group.position.set(f.x, f.mode === 'sit' ? 0.06 : 0, f.z);
      fig.pose(0, f.mode === 'walk' ? 'idle' : f.mode);
      scene.add(fig.group);
      return fig;
    });
    // swimmers in the shallows off the piers
    const swimCols = [0xe47271, 0x3eaaa5, 0xf4bb45, 0x42a9a2, 0xf17d6f];
    st.swimmers = [
      { x: 230, z: 30, phase: 0.4 }, { x: 233, z: 56, phase: 1.7 }, { x: 229, z: 88, phase: 2.9 },
      { x: 234, z: 120, phase: 4.1 }, { x: 231, z: -12, phase: 5.3 },
    ];
    st._swimFigs = st.swimmers.map((s, i) => {
      const f = SLA.makeSwimmer(swimCols[i % swimCols.length]);
      scene.add(f.group);
      return f;
    });
    // objective marker + race gates + fled-driver pool
    marker = SLW.createMarker(0xffd94d);
    scene.add(marker);
    const ringGeo = new THREE.RingGeometry(8.6, 10.2, 40);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x53e08a, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.y = 0.18; m.visible = false;
      scene.add(m);
      gateRings.push(m);
    }
    for (let i = 0; i < 4; i++) {
      const fig = SLA.makeFigure({ shirt: 0x8a9099, pants: 0x3a4149 });
      fig.group.visible = false;
      scene.add(fig.group);
      fledPool.push({ fig, active: false, x: 0, z: 0, ang: 0, t: 0 });
    }
    // tracer pool
    const tGeo = new THREE.BufferGeometry();
    tGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    for (let i = 0; i < 10; i++) {
      const line = new THREE.Line(tGeo.clone(), new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0 }));
      line.frustumCulled = false;
      scene.add(line);
      tracers.push({ line, t: 0 });
    }
  });

  // ---------------- exhaust / dust / spray particles ----------------
  const PMAX = 260;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(PMAX * 3), pCol = new Float32Array(PMAX * 3), pLifeA = new Float32Array(PMAX);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('aCol', new THREE.BufferAttribute(pCol, 3));
  pGeo.setAttribute('aLife', new THREE.BufferAttribute(pLifeA, 1));
  const pMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader: 'attribute vec3 aCol; attribute float aLife; varying vec3 vC; varying float vL; void main(){ vC = aCol; vL = aLife; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = (3.0 + (1.0 - aLife) * 30.0) * (46.0 / max(1.0, -mv.z)); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying vec3 vC; varying float vL; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.06, d) * vL * 0.30; if (a < 0.004) discard; gl_FragColor = vec4(vC, a); }',
  });
  const pPoints = new THREE.Points(pGeo, pMat);
  pPoints.frustumCulled = false;
  scene.add(pPoints);
  const pPool = [];
  for (let i = 0; i < PMAX; i++) pPool.push({ on: false, x: 0, y: -60, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, r: 1, g: 1, b: 1 });
  let pCursor = 0;
  function spawnPuff(x, y, z, vx, vy, vz, max, r, g, b) {
    const q = pPool[pCursor]; pCursor = (pCursor + 1) % PMAX;
    q.on = true; q.x = x; q.y = y; q.z = z; q.vx = vx; q.vy = vy; q.vz = vz; q.life = max; q.max = max; q.r = r; q.g = g; q.b = b;
  }
  function stepParticles(dt) {
    for (let i = 0; i < PMAX; i++) {
      const q = pPool[i];
      if (q.on) {
        q.life -= dt;
        if (q.life <= 0) { q.on = false; q.y = -60; }
        else {
          q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
          q.vy += 0.55 * dt; q.vx *= (1 - 0.7 * dt); q.vz *= (1 - 0.7 * dt);
        }
      }
      pPos[i * 3] = q.x; pPos[i * 3 + 1] = q.y; pPos[i * 3 + 2] = q.z;
      pCol[i * 3] = q.r; pCol[i * 3 + 1] = q.g; pCol[i * 3 + 2] = q.b;
      pLifeA[i] = q.on ? Math.max(0, q.life / q.max) : 0;
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.aCol.needsUpdate = true;
    pGeo.attributes.aLife.needsUpdate = true;
  }
  function emitParticles(dt) {
    const p = S.player;
    const car = sim.currentCar();
    if (car && (p.mode === 'car' || p.mode === 'bike') && Math.abs(car.speed) > 3) {
      const back = car.type === 'bike' ? 1.0 : 2.3;
      const ex = car.x - Math.sin(car.ang) * back, ez = car.z - Math.cos(car.ang) * back;
      if (Math.random() < dt * 20) spawnPuff(ex, 0.35, ez, -Math.sin(car.ang) * 1.2, 0.8, -Math.cos(car.ang) * 1.2, 0.9, 0.42, 0.44, 0.47);
      if (p.x > 198 && Math.random() < dt * 26) {
        spawnPuff(car.x + (Math.random() - 0.5) * 1.6, 0.25, car.z + (Math.random() - 0.5) * 1.6,
          (Math.random() - 0.5) * 1.4, 1.1, (Math.random() - 0.5) * 1.4, 1.1, 0.76, 0.67, 0.5);
      }
    }
    for (const c of S.cars) {
      if (!c.driver || c.gone || Math.abs(c.speed) < 6) continue;
      if ((c.x - p.x) ** 2 + (c.z - p.z) ** 2 > 55 * 55) continue;
      if (Math.random() < dt * 1.6) spawnPuff(c.x - Math.sin(c.ang) * 2.3, 0.35, c.z - Math.cos(c.ang) * 2.3, 0, 0.8, 0, 0.9, 0.42, 0.44, 0.47);
    }
    if (p.mode === 'boat') {
      const boat = boatStates[p.boatId];
      if (boat && Math.abs(boat.speed) > 5 && Math.random() < dt * 24) {
        const rx = Math.cos(boat.ang), rz = -Math.sin(boat.ang);
        const side = Math.random() < 0.5 ? 1 : -1;
        spawnPuff(boat.x + rx * side * 1.1 + Math.sin(boat.ang) * 1.8, 0.15, boat.z + rz * side * 1.1 + Math.cos(boat.ang) * 1.8,
          rx * side * 1.6, 1.3, rz * side * 1.6, 0.7, 0.85, 0.93, 0.97);
      }
    }
  }

  // ---------------- UI + hooks ----------------
  let objPos = null, pendingChapter = -1, hasSaveAtBoot = false;
  try { hasSaveAtBoot = !!localStorage.getItem(D.SAVE_KEY); } catch { hasSaveAtBoot = false; }
  const ui = SLU.createUI({
    audioKick: () => { audio.ensure(); if (S.settings.music) audio.radio(true); },
    sfx: (n) => audio.play(n),
    onNewGame: () => {
      if (hasSaveAtBoot) { try { localStorage.removeItem(D.SAVE_KEY); } catch { /* ignore */ } location.reload(); }
    },
    onContinue: () => { if (!sim.loadGame()) ui.toast('Save could not be read — starting fresh.'); },
    onSave: () => sim.saveGame(),
    onBuy: (kind) => sim.buyClinic(kind),
    onRescue: () => sim.rescue(),
    onRespawn: () => sim.respawn(),
    onMusic: (on) => audio.radio(on),
    onVolume: (v) => audio.setVolume(v),
    onQuitToTitle: () => ui.showTitle(true),
    objectivePos: () => objPos,
  });
  ui.root.insertBefore(renderer.domElement, ui.root.firstChild);
  ui.bindMouse(renderer.domElement);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  window.addEventListener('beforeunload', () => { if (!SHOT) sim.saveGame(); });

  // ---------------- objective ----------------
  function computeObjective() {
    const st = S.story.currentStep();
    if (st) {
      if (st.kind === 'collect' || st.kind === 'deliver' || st.kind === 'interact' || st.kind === 'combat') objPos = { x: st.x, z: st.z };
      else if (st.kind === 'stealcar') { const c = S.cars.find(c => c.id === st.carId); objPos = c ? { x: c.x, z: c.z } : null; }
      else if (st.kind === 'delivercar') objPos = D.SITES.chop;
      else if (st.kind === 'rendezvous') objPos = D.SITES.mara;
      else objPos = null;
    } else if (S.taxi.phase === 'fare') objPos = D.TAXI_SPOTS[S.taxi.dest];
    else if (S.taxi.passengerOut && S.taxi.phase === 'wait') objPos = D.TAXI_SPOTS[S.taxi.spot];
    else if (S.race) objPos = S.race.gates[S.race.next] || null;
    else if (S.coast) objPos = D.COAST_RUN.gates[S.coast.next] || null;
    else if (S.story.done < 6 && S.story.active === null) objPos = D.SITES.mara;
    else objPos = null;

    const fmtT = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    let html = '';
    if (st) {
      const c = S.story.contract();
      const down = S.guards.filter(g => g.down || g.neutral).length;
      const stepText = {
        collect: `Pick up: <b>${st.what}</b>`,
        deliver: `Deliver: <b>${st.what}</b>`,
        stealcar: 'Steal the <b>marked coupe</b>',
        delivercar: 'Deliver the coupe to the <b>chop shop</b>',
        combat: `Clear the guards — <b>${down}/${st.count}</b> down`,
        interact: `<b>${st.label}</b>`,
        escape: '<b>Lose the heat</b> — break line of sight',
        rendezvous: 'Meet <b>Mara</b> — arrive clean, no wanted level',
      }[st.kind] || '';
      html = `<b>${c.id}. ${c.title}</b> — $${c.reward}<br>${stepText}`;
      if (S.story.timerStarted && S.story.timer > 0) html += `<br>Lockout in <b>${fmtT(S.story.timer)}</b>`;
      if (st.kind === 'escape') html += `<br>Search: ${Math.round(S.wanted.search * 100)}%`;
    } else if (S.story.active === null && S.story.done < 6) {
      html = `See <b>Mara</b> at the dispatch office (pink M) — contract ${S.story.done + 1} of 6.`;
    } else if (S.story.done >= 6) {
      html = 'Story complete. The city is yours — fares, shells, races, robberies.';
    }
    if (S.taxi.phase === 'fare') {
      const dest = D.TAXI_SPOTS[S.taxi.dest];
      html += `<br>Fare → <b>${D.districtAt(dest.x, dest.z)}</b> · ${fmtT(Math.max(0, S.taxi.timeLeft))} left`;
    } else if (S.taxi.passengerOut) html += '<br>A passenger is waiting at a taxi spot.';
    if (S.race) html += `<br>${S.race.name}: gate ${S.race.next + 1}/${S.race.gates.length} · rival gate ${S.race.rival ? S.race.rival.next : 0}/${S.race.gates.length} · ${S.race.time.toFixed(1)}s / par ${S.race.par.toFixed(0)}s`;
    if (S.coast) html += `<br>Coast Run: gate ${S.coast.next + 1}/${D.COAST_RUN.gates.length} · ${S.coast.time.toFixed(1)}s`;
    if (S.robHold) html += `<br>Emptying the register… ${Math.round(S.robHold.t / 4 * 100)}%`;
    return html;
  }

  // ---------------- events ----------------
  function processEvents() {
    for (const e of sim.S.drainEvents()) {
      if (e.k === 'toast') ui.toast(e.txt);
      else if (e.k === 'sfx') audio.play(e.name);
      else if (e.k === 'lightning') audio.play('thunder');
      else if (e.k === 'brief') ui.showBrief(e.txt);
      else if (e.k === 'chapter') pendingChapter = e.idx;
      else if (e.k === 'storycomplete') { ui.showComplete(); ui.toast('All six contracts closed. Free roam is yours.'); }
      else if (e.k === 'dialogue') {
        ui.showDialogue(e.lines, e.title, () => {
          if (pendingChapter >= 0) { ui.showChapter(D, pendingChapter); pendingChapter = -1; }
        });
      }
      else if (e.k === 'clinic') ui.openShop(S, D);
      else if (e.k === 'death') { ui.flash(); ui.openDeath(S, D); }
      else if (e.k === 'shellhide') { if (shellRefs[e.i]) shellRefs[e.i].group.visible = false; }
      else if (e.k === 'tracer') {
        const tr = tracers.find(t => t.t <= 0) || tracers[0];
        const pos = tr.line.geometry.getAttribute('position');
        pos.setXYZ(0, e.x1, 1.35, e.z1); pos.setXYZ(1, e.x2, 1.2, e.z2);
        pos.needsUpdate = true;
        tr.line.material.color.set(e.foe ? 0xff7a5e : 0xffe2ae);
        tr.line.material.opacity = 0.9; tr.t = 0.07;
      }
      else if (e.k === 'guardspawn') rebuildGuardFigs();
    }
  }
  function rebuildGuardFigs() {
    for (const f of guardFigs) scene.remove(f.group);
    guardFigs = S.guards.map(() => {
      const fig = SLA.makeFigure({ shirt: 0x59343a, pants: 0x2a2e38, band: 0x222831, weapon: 0x14181d });
      scene.add(fig.group);
      return fig;
    });
  }

  // ---------------- per-frame actor sync ----------------
  let lightLevel = -1;
  function syncActors(dt) {
    const p = S.player;
    S.peds.forEach((pd, i) => pedField.set(i, {
      x: pd.x, z: pd.z, ang: pd.ang, swing: pd.swing,
      mode: pd.state === 'down' ? 'down' : pd.state === 'flee' ? 'run' : 'walk',
    }));
    pedField.flush();
    // player figure
    if (p.mode === 'car' || p.mode === 'bike') {
      const car = sim.currentCar();
      if (car) {
        if (car.type === 'bike') {
          playerFig.group.visible = false; // the bike mesh carries its rider
        } else {
          playerFig.group.visible = true;
          const s = Math.sin(car.ang), c = Math.cos(car.ang);
          playerFig.group.position.set(car.x + (-0.38 * c + 0.05 * s), 0.52, car.z + (0.38 * s + 0.05 * c));
          playerFig.group.rotation.set(0, car.ang, 0);
          playerFig.pose(0, 'sit');
        }
      }
    } else if (p.mode === 'boat') {
      const boat = boatStates[p.boatId];
      playerFig.group.visible = true;
      playerFig.group.position.set(boat.x, 0.72, boat.z);
      playerFig.group.rotation.set(0, boat.ang, 0);
      playerFig.pose(0, 'sit');
    } else {
      playerFig.group.visible = true;
      playerFig.group.position.set(p.x, p.y, p.z);
      playerFig.group.rotation.set(0, p.ang, 0);
      if (p.dead) playerFig.pose(0, 'down');
      else if (p.speedNow > 6) playerFig.pose(p.swing, 'run');
      else if (p.speedNow > 0.3) playerFig.pose(p.swing, 'walk');
      else playerFig.pose(0, 'idle');
    }
    // cars
    for (const car of S.cars) {
      const refs = carRefs.get(car.id);
      if (!refs) continue;
      refs.group.visible = !car.gone;
      if (car.gone) { smokeMeshes.get(car.id).visible = false; continue; }
      refs.group.position.set(car.x, 0, car.z);
      refs.group.rotation.y = car.ang;
      if (refs.wheels) for (const w of refs.wheels) w.rotation.x += car.speed * dt * 1.9;
      if (refs.driverFig) refs.driverFig.group.visible = !!car.driver;
      if (refs.lights && refs.lights.userData.setLevel) refs.lights.userData.setLevel(lightLevel / 2);
      const smoke = smokeMeshes.get(car.id);
      if (car.hp < 35) {
        smoke.visible = true;
        const s = 0.8 + Math.sin(S.t * 7 + car.id) * 0.25 + (35 - car.hp) / 40;
        smoke.scale.setScalar(s);
        smoke.position.set(car.x + Math.sin(car.ang) * 1.6, 1.3 + Math.sin(S.t * 3 + car.id) * 0.2, car.z + Math.cos(car.ang) * 1.6);
      } else smoke.visible = false;
      if (car._driverFled && !car._fledSpawned) {
        car._fledSpawned = true;
        const slot = fledPool.find(f => !f.active);
        if (slot) { slot.active = true; slot.x = car.x + 2; slot.z = car.z; slot.ang = Math.random() * 6.28; slot.t = 0; slot.fig.group.visible = true; }
      }
    }
    for (const f of fledPool) {
      if (!f.active) continue;
      f.t += dt;
      f.x += Math.sin(f.ang) * 4.4 * dt; f.z += Math.cos(f.ang) * 4.4 * dt;
      f.fig.group.position.set(f.x, 0, f.z);
      f.fig.group.rotation.y = f.ang;
      f.fig.pose(S.t * 11, 'run');
      if (f.t > 6) { f.active = false; f.fig.group.visible = false; }
    }
    // race rival coupe
    if (rivalRefs) {
      const rv = S.race && S.race.rival;
      rivalRefs.group.visible = !!rv;
      if (rv) {
        rivalRefs.group.position.set(rv.x, 0, rv.z);
        rivalRefs.group.rotation.y = rv.ang;
        if (rivalRefs.wheels) for (const w of rivalRefs.wheels) w.rotation.x += rv.speed * dt * 1.9;
        if (rivalRefs.lights && rivalRefs.lights.userData.setLevel) rivalRefs.lights.userData.setLevel(lightLevel / 2);
      }
    }
    // police
    S.policeCars.forEach((u, i) => {
      const refs = policeCarRefs[i];
      refs.group.visible = u.active;
      if (!u.active) return;
      refs.group.position.set(u.x, 0, u.z);
      refs.group.rotation.y = u.ang;
      if (refs.wheels) for (const w of refs.wheels) w.rotation.x += u.speed * dt * 1.9;
      if (refs.lightbar) {
        const phase = Math.floor(S.t * 2.4) % 2 === 0;
        refs.lightbar.l.visible = phase; refs.lightbar.r.visible = !phase;
      }
      if (refs.lights && refs.lights.userData.setLevel) refs.lights.userData.setLevel(lightLevel / 2);
    });
    // roadblock units: parked police cars with flashing lightbars
    S.blockCars.forEach((u, i) => {
      const refs = blockRefs[i];
      if (!refs) return;
      refs.group.visible = u.active;
      if (!u.active) return;
      refs.group.position.set(u.x, 0, u.z);
      refs.group.rotation.y = u.ang;
      const ph = Math.floor(performance.now() / 240) % 2;
      refs.lightR.visible = ph === 0; refs.lightB.visible = ph !== 0;
    });
    S.policeFoot.forEach((u, i) => {
      const fig = policeFootFigs[i];
      fig.group.visible = u.active;
      if (!u.active) return;
      fig.group.position.set(u.x, 0, u.z);
      fig.group.rotation.y = u.ang;
      fig.pose(u.swing || 0, u.swing ? 'run' : 'idle');
    });
    // guards
    S.guards.forEach((g, i) => {
      const fig = guardFigs[i];
      if (!fig) return;
      fig.group.position.set(g.x, 0, g.z);
      fig.group.rotation.y = g.ang;
      if (g.down) fig.pose(0, 'down');
      else if (g.swing) fig.pose(g.swing, 'walk');
      else fig.pose(0, 'idle');
    });
    // helis
    S.helis.forEach((h, i) => {
      const refs = heliRefs[i];
      refs.group.position.set(h.x, h.y, h.z);
      refs.group.rotation.set(0, h.ang, h.roll || 0);
      refs.rotor.rotation.y += dt * 26;
      refs.tailRotor.rotation.x += dt * 30;
      const on = !!h.spotOn;
      refs.cone.visible = on; refs.disc.visible = on;
      refs.spot.intensity = on ? 5000 : 0;
      if (on) {
        refs.spot.position.set(h.x, h.y, h.z);
        refs.spot.target.position.set(p.x, 0, p.z);
        refs.spot.target.updateMatrixWorld();
        const dx = p.x - h.x, dz = p.z - h.z;
        const dist = Math.hypot(dx, dz, h.y);
        const r = Math.max(1.2, dist * 0.13);
        refs.cone.position.set((h.x + p.x) / 2, h.y / 2, (h.z + p.z) / 2);
        refs.cone.lookAt(p.x, 0, p.z);
        refs.cone.rotateX(-Math.PI / 2);
        refs.cone.scale.set(r, dist, r);
        refs.cone.material.opacity = 0.15;
        refs.disc.position.set(p.x, 0.14, p.z);
        refs.disc.scale.setScalar(r + 0.6);
        refs.disc.material.opacity = 0.32;
      }
      refs.beacon.visible = Math.floor(S.t * 1.6 + i) % 2 === 0;
    });
    // services
    S.services.tows.forEach((tw, i) => {
      const refs = towRefs[i];
      refs.group.position.set(tw.x, 0, tw.z);
      refs.group.rotation.y = tw.ang;
      if (refs.wheels) for (const w of refs.wheels) w.rotation.x += tw.speed * dt * 1.9;
      const rig = tw.state === 'hook' || tw.state === 'haul';
      refs.cable.visible = rig; refs.hook.visible = rig;
      refs.beacon.visible = tw.state !== 'idle' && Math.floor(S.t * 2 + i) % 2 === 0;
    });
    S.services.ambulances.forEach((amb, i) => {
      const refs = ambRefs[i];
      refs.group.position.set(amb.x, 0, amb.z);
      refs.group.rotation.y = amb.ang;
      if (refs.wheels) for (const w of refs.wheels) w.rotation.x += amb.speed * dt * 1.9;
      if (refs.lights && refs.lights.userData.setLevel) refs.lights.userData.setLevel(lightLevel / 2);
      const ph = Math.floor(S.t * 3 + i) % 2 === 0;
      refs.strobeA.visible = amb.state !== 'idle' && ph;
      refs.strobeB.visible = amb.state !== 'idle' && !ph;
      const treating = amb.state === 'treat';
      medicFigs[i].forEach((fig, m) => {
        fig.group.visible = treating;
        if (treating) {
          fig.group.position.set(amb.x + (m ? 1.6 : -1.4), 0, amb.z + 1.8);
          fig.group.rotation.y = amb.ang + Math.PI;
          fig.pose(0, m ? 'kneel' : 'idle');
        }
      });
    });
    // boats
    boatStates.forEach((b, i) => {
      const refs = boatRefs[i];
      refs.group.position.set(b.x, Math.sin(S.t * 1.3 + i * 2) * 0.08, b.z);
      refs.group.rotation.set(Math.sin(S.t * 1.1 + i) * 0.02, b.ang, Math.sin(S.t * 0.9 + i * 3) * 0.03);
      refs.wake.visible = Math.abs(b.speed) > 1;
      refs.wakeMat.opacity = Math.min(0.5, Math.abs(b.speed) / 16 * 0.55);
    });
    // shells spin
    shellRefs.forEach((refs) => { if (refs.group.visible) refs.group.rotation.y += dt * 1.4; });
    for (const i of S.shellsGot) if (shellRefs[i]) shellRefs[i].group.visible = false;
    // beach folk
    if (S._folkFigs) S.beachFolk.forEach((f, i) => {
      const fig = S._folkFigs[i];
      fig.group.visible = !f.hidden;
      if (f.stroll) {
        fig.group.position.set(f.x, 0, f.z);
        fig.group.rotation.y = f.dir > 0 ? 0 : Math.PI;
        fig.pose(f.swing, 'walk');
      }
    });
    // swimmers bob and paddle in the shallows; they clear out in a storm
    if (S._swimFigs) {
      const stormy = S.stormI > 0.4;
      S._swimFigs.forEach((f, i) => {
        const s = S.swimmers[i];
        f.group.visible = !stormy;
        if (stormy) return;
        const bob = Math.sin(S.t * 1.6 + s.phase) * 0.07;
        f.group.position.set(s.x + Math.sin(S.t * 0.22 + s.phase) * 0.8, 0.02 + bob, s.z + Math.cos(S.t * 0.19 + s.phase) * 0.8);
        f.group.rotation.y = s.phase;
        f.armL.rotation.x = Math.sin(S.t * 2.6 + s.phase) * 0.9;
        f.armR.rotation.x = Math.sin(S.t * 2.6 + s.phase + Math.PI) * 0.9;
      });
    }
    // taxi passenger: standing at the spot while waiting; once the fare is
    // aboard, seated in the back of the tracked cab for the whole ride
    if (S.taxi.passengerOut && S.taxi.phase === 'wait') {
      const spot = D.TAXI_SPOTS[S.taxi.spot];
      passengerFig.group.visible = true;
      passengerFig.group.position.set(spot.x, 0, spot.z);
      passengerFig.pose(0, 'idle');
    } else passengerFig.group.visible = false;
    const fareCar = S.taxi.phase === 'fare' && S.taxi.carId >= 0 ? S.cars[S.taxi.carId] : null;
    if (fareCar && !fareCar.gone) {
      fareFig.group.visible = true;
      const ca = Math.cos(fareCar.ang), sa = Math.sin(fareCar.ang);
      fareFig.group.position.set(fareCar.x + 0.38 * ca + 0.05 * sa, 0.52, fareCar.z - 0.38 * sa + 0.05 * ca);
      fareFig.group.rotation.y = fareCar.ang;
    } else fareFig.group.visible = false;
    // objective marker + gates
    if (objPos) {
      marker.visible = true;
      marker.position.set(objPos.x, 0, objPos.z);
      marker.rotation.y += dt * 1.8;
    } else marker.visible = false;
    const gates = S.race ? S.race.gates : (S.coast ? D.COAST_RUN.gates : null);
    const nextIdx = S.race ? S.race.next : (S.coast ? S.coast.next : -1);
    gateRings.forEach((ring, i) => {
      if (gates && i < gates.length) {
        ring.visible = true;
        ring.position.x = gates[i].x; ring.position.z = gates[i].z;
        const isNext = i === nextIdx;
        ring.material.color.set(isNext ? 0xffd94d : 0x53e08a);
        ring.material.opacity = isNext ? 0.95 : 0.5;
        const s = isNext ? 1 + Math.sin(S.t * 5) * 0.05 : 1;
        ring.scale.setScalar(s);
      } else ring.visible = false;
    });
    // tracers fade
    for (const tr of tracers) {
      if (tr.t > 0) { tr.t -= dt; if (tr.t <= 0) tr.line.material.opacity = 0; }
    }
    emitParticles(dt);
    stepParticles(dt);
  }

  // ---------------- camera + loop ----------------
  const clockState = { last: performance.now(), acc: 0, lastRender: 0, fpsCount: 0, fpsT: 0 };
  // smoothed camera anchor + speed-sensitive field of view
  const camAnchor = new THREE.Vector3(S.player.x, 1.55, S.player.z);
  let camFov = 58;
  function frame(nowMs) {
    requestAnimationFrame(frame);
    let dt = (nowMs - clockState.last) / 1000;
    clockState.last = nowMs;
    if (!(dt >= 0) || dt > 0.25) dt = Math.min(0.25, Math.max(0, dt || 0));
    const e = ui.pollEdges();
    const blocked = ui.modalOpen;
    if (e.pause) {
      if (ui.pauseOpen()) ui.closePause();
      else if (ui.mapIsOpen()) ui.toggleMap(S, D);
      else if (!ui.titleOpen && !ui.shopOpen() && !ui.deathOpen()) ui.openPause(S, D);
    }
    if (e.map && !ui.titleOpen && !ui.pauseOpen() && !ui.shopOpen() && !ui.deathOpen()) ui.toggleMap(S, D);

    if (!blocked) {
      const inp = ui.input;
      const driving = S.player.mode === 'car' || S.player.mode === 'bike';
      let mx = inp.moveX, mz = inp.moveZ;
      if (!driving && S.player.mode === 'foot') {
        const fx = Math.sin(ui.camYaw), fz = Math.cos(ui.camYaw);
        const rx = -Math.cos(ui.camYaw), rz = Math.sin(ui.camYaw);
        const wx = fx * mz + rx * mx, wz = fz * mz + rz * mx;
        mx = wx; mz = wz;
      }
      const stepInput = {
        moveX: mx, moveZ: mz, sprint: inp.sprint, fire: inp.fire && !blocked,
        handbrake: inp.handbrake,
        enterPressed: e.enter, interactPressed: e.interact, reloadPressed: e.reload,
        weaponPressed: e.weapon, jumpPressed: e.jump,
        interactHeld: inp.interactHeld,
      };
      clockState.acc += dt;
      let n = 0;
      while (clockState.acc >= 1 / 60 && n < 5) {
        sim.step(1 / 60, stepInput);
        stepInput.enterPressed = stepInput.interactPressed = stepInput.reloadPressed = stepInput.weaponPressed = stepInput.jumpPressed = false;
        clockState.acc -= 1 / 60;
        n++;
      }
      if (n === 5) clockState.acc = 0;
      processEvents();
      S.starsCache = sim.stars();
      const car = sim.currentCar();
      audio.engine(driving && !S.player.dead, car ? Math.abs(car.speed) / 30 : 0, Math.abs(inp.moveZ));
      audio.siren(S.wanted.episode && S.starsCache > 0 && (S.policeCars.some(u => u.active) || S.policeFoot.some(u => u.active)));
    }
    // camera follow: ease behind the car while driving
    if (S.player.mode === 'car' || S.player.mode === 'bike') {
      const target = S.player.ang;
      let d = (target - ui.camYaw) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(S.player.speedNow) > 2) ui.camYaw += d * Math.min(1, dt * 1.6);
    }
    S.camYaw = ui.camYaw;

    // render at most 30 fps
    if (nowMs - clockState.lastRender >= 1000 / 30) {
      clockState.lastRender = nowMs;
      syncActors(Math.min(0.05, dt));
      const env = world.update(Math.min(0.05, dt), {
        hours: S.hours, stormI: S.stormI, camPos: camera.position,
        focus: { x: S.player.x, z: S.player.z }, scene, t: S.t,
        lightning: S.t - S.lightningT < 0.15,
        lightPhase: S.lightPhase || 0,
      });
      if (env) {
        lightLevel = env.nightF > 0.6 ? 2 : (S.stormI > 0.4 ? 1 : 0);
        scene.fog.color.setHex(0x0d1a26).lerp(new THREE.Color(0xa8c4cf), env.dayF);
      }
      const p = S.player;
      if (ui.titleOpen) {
        const a = nowMs / 1000 * 0.05;
        camera.position.set(Math.sin(a) * 120, 46, Math.cos(a) * 120);
        camera.lookAt(0, 6, 0);
      } else {
        const dist = (S.player.mode === 'foot' ? ui.camDist : ui.camDist + 4);
        const fx = Math.sin(ui.camYaw), fz = Math.cos(ui.camYaw);
        const ty = (p.mode === 'foot' ? p.y + 1.55 : 1.4);
        // the anchor trails the player a touch, so turns and bumps glide
        // instead of snapping the frame with every physics tick
        const k = 1 - Math.exp(-(p.mode === 'foot' ? 16 : 9) * Math.min(0.05, dt));
        camAnchor.x += (p.x - camAnchor.x) * k;
        camAnchor.z += (p.z - camAnchor.z) * k;
        camAnchor.y += (ty - camAnchor.y) * k;
        camera.position.set(camAnchor.x - fx * dist, camAnchor.y + dist * 0.42, camAnchor.z - fz * dist);
        camera.lookAt(camAnchor.x + fx * 7, camAnchor.y + 0.4, camAnchor.z + fz * 7);
        // the field of view opens up with speed
        const targetFov = (p.mode === 'car' || p.mode === 'bike') ? 58 + Math.min(1, Math.abs(p.speedNow) / 38) * 9 : 58;
        camFov += (targetFov - camFov) * Math.min(1, dt * 5);
        if (Math.abs(camFov - camera.fov) > 0.02) { camera.fov = camFov; camera.updateProjectionMatrix(); }
      }
      renderer.render(scene, camera);
      const objective = computeObjective();
      const info = blocked ? null : sim.interactInfo();
      const car = sim.currentCar();
      const boat = S.player.mode === 'boat' ? boatStates[S.player.boatId] : null;
      ui.updateHUD(S, D, {
        vehicle: car ? { name: car.type.toUpperCase(), speed: car.speed, hp: car.hp, fuel: car.fuel, fuelKnown: car.fuelKnown } : (boat ? { name: 'BOAT', speed: boat.speed, hp: 100, fuel: 100, fuelKnown: false } : null),
        objective,
        context: info ? info.label : null,
        channel: S.channel ? S.channel.t / S.channel.need : (S.robHold ? S.robHold.t / 4 : -1),
      });
      ui.drawMinimap(S, D);
      clockState.fpsCount++;
      const nowS = nowMs / 1000;
      if (nowS - clockState.fpsT >= 1) { ui.fps = clockState.fpsCount * 2; clockState.fpsCount = 0; clockState.fpsT = nowS; }
    }
  }

  // ---------------- shot staging ----------------
  // Every shot is a real frame of the live game: the sim settles, then the
  // scene is composed by placing real entities, and the HUD + minimap are
  // painted exactly as they are in play.
  function stageStreetLife() {
    // a busy block around the cover scene: queued traffic both ways
    const spots = [[3.4, 58, 0], [-3.4, 24, Math.PI], [3.4, 74, 0], [-3.4, 84, Math.PI], [3.4, 92, 0]];
    let n = 0;
    for (const c of S.cars) {
      if (!c.driver || c.type === 'bike') continue;
      const s = spots[n++]; if (!s) break;
      c.x = s[0]; c.z = s[1]; c.ang = s[2]; c.speed = 0;
      c.axis = 'NS'; c.road = 3; c.dir = s[2] === 0 ? 1 : -1; c.along = s[1];
    }
    // pedestrians on both sidewalks of the same block
    let m = 0;
    for (const pd of S.peds) {
      if (m >= 14 || pd.state === 'down') continue;
      pd.x = (m % 2 ? -1 : 1) * (6.4 + (m % 5) * 0.85);
      pd.z = 24 + Math.floor(m / 2) * 7.5 + (m % 3);
      pd.ang = m % 2 ? 0.4 : Math.PI - 0.4;
      m++;
    }
  }
  function stageCoastalDrive() {
    const p = S.player;
    const car = S.cars[0];
    car.x = 188.6; car.z = 96; car.ang = Math.PI; car.driver = false; car.parked = false; car.speed = 23;
    p.mode = 'car'; p.carId = 0; p.x = car.x; p.z = car.z; p.ang = Math.PI; p.speedNow = 23;
    const spots = [[188.6, 74, Math.PI], [188.6, 40, Math.PI], [188.6, 12, Math.PI], [195.4, 62, 0], [195.4, 128, 0]];
    let n = 0;
    for (const c of S.cars) {
      if (!c.driver || c.type === 'bike' || c.id === 0) continue;
      const s = spots[n++]; if (!s) break;
      c.x = s[0]; c.z = s[1]; c.ang = s[2]; c.speed = 11;
      c.axis = 'NS'; c.road = 6; c.dir = s[2] === 0 ? 1 : -1; c.along = s[1];
    }
    ui.camYaw = Math.PI;
  }
  function stageChase() {
    const p = S.player;
    for (const u of S.policeCars) u.active = false;
    for (const u of S.policeFoot) u.active = false;
    const spots = [[-4, 28, 0], [12, 22, 0]];
    S.policeCars.forEach((u, i) => {
      const s = spots[i]; if (!s) return;
      u.active = true; u.speed = 0;
      u.x = s[0]; u.z = s[1];
      u.ang = Math.atan2(p.x - u.x, p.z - u.z);
    });
    const f = S.policeFoot[0];
    if (f) { f.active = true; f.x = p.x + 4.5; f.z = p.z - 9; f.ang = Math.atan2(p.x - f.x, p.z - f.z); }
    const h = S.helis[0];
    h.x = p.x + 15; h.z = p.z - 24; h.y = 20; h.spotOn = true; h.mode = 'follow';
    S.helis[1].spotOn = false;
  }
  function applyShot(name) {
    const p = S.player;
    S.weather.storm = false; S.weather.intensity = 0; S.stormI = 0;
    if (name === 'mission-day') {
      S.hours = 17.35; p.x = 5.4; p.z = 46; p.ang = Math.PI + 0.3; ui.camYaw = Math.PI + 0.3; ui.camDist = 11;
    } else if (name === 'driving') {
      S.hours = 16.9; ui.camDist = 10;
    } else if (name === 'night-heli') {
      S.hours = 21.3;
      p.x = 3.4; p.z = 46; p.ang = 2.6;
      S.wanted.episode = true; S.wanted.ledger = 9; S.wanted.search = 1;
      ui.camYaw = 2.6;
    } else if (name === 'beach') {
      S.hours = 17.9; p.x = 213; p.z = 30; p.ang = Math.PI / 2; ui.camYaw = Math.PI / 2 - 0.55; ui.camDist = 11;
    }
    const neutral = { moveX: 0, moveZ: 0, sprint: false, fire: false, handbrake: false, enterPressed: false, interactPressed: false, reloadPressed: false, weaponPressed: false, jumpPressed: false, interactHeld: false };
    for (let i = 0; i < 170; i++) sim.step(1 / 60, neutral);
    if (name === 'mission-day') stageStreetLife();
    if (name === 'driving') stageCoastalDrive();
    if (name === 'night-heli') stageChase();
    if (name === 'beach') { p.x = 213; p.z = 30; p.y = 0; }
    S.starsCache = sim.stars();
    const objective = computeObjective();
    processEvents();
    syncActors(0.016);
    const env = world.update(0.016, { hours: S.hours, stormI: S.stormI, camPos: camera.position, focus: { x: p.x, z: p.z }, scene, t: S.t, lightning: false, lightPhase: S.lightPhase || 0 });
    if (env) lightLevel = env.nightF > 0.6 ? 2 : 0;
    syncActors(0.016);
    const dist = (p.mode === 'foot' ? ui.camDist : ui.camDist + 4);
    const fx = Math.sin(ui.camYaw), fz = Math.cos(ui.camYaw);
    const ty = (p.mode === 'foot' ? p.y + 1.55 : 1.4);
    camera.position.set(p.x - fx * dist, ty + dist * 0.42, p.z - fz * dist);
    camera.lookAt(p.x + fx * 7, ty + 0.4, p.z + fz * 7);
    if (name === 'driving') { camera.fov = 67; camera.updateProjectionMatrix(); }
    ui.updateHUD(S, D, { vehicle: null, objective, context: null, channel: -1 });
    ui.drawMinimap(S, D);
    renderer.render(scene, camera);
    document.title = 'SHOT-READY';
  }

  if (SHOT) {
    applyShot(SHOT);
    // repaint a few frames so the headless capturer settles on the staged scene
    let paints = 0;
    const paint = () => {
      syncActors(0.016);
      renderer.render(scene, camera);
      if (++paints < 4) requestAnimationFrame(paint);
    };
    requestAnimationFrame(paint);
  } else {
    ui.showTitle(hasSaveAtBoot);
    requestAnimationFrame(frame);
  }
})();
