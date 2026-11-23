'use strict';
/* Saltline: Vice Heat — the simulation. Fixed 60 Hz steps; owns all dynamic
   entity state and drives the actor meshes. Pure rules live in data.js. */
const SLS = (() => {
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
  const dist = (a, b) => Math.sqrt(dist2(a, b));
  const angLerp = (a, b, t) => {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  };
  const CONTACT_COLORS = [0xf77f80, 0xf1ad5e, 0x72e5bb, 0x8bbcff, 0xf8cf69];

  function createSim(D, A, W) {
    const city = D.genCity(D.SEED);
    const story = D.createStory();
    const weatherRng = D.stream(D.SEED + 3);
    const S = {
      t: 0, hours: 16 + 40 / 60, day: 1, phase: 'day',
      weather: D.genWeather(D.SEED + 3), stormI: 0,
      player: {
        x: 5, z: 15, y: 0, vy: 0, ang: Math.PI, hp: 100, armour: 40, ammo: 72, clip: 12,
        money: 300, weapon: 'sidearm', stamina: 100, mode: 'foot', carId: -1, boatId: -1,
        swing: 0, fireCd: 0, reloadT: 0, dead: false, deadT: 0, speedNow: 0,
      },
      wanted: { ledger: 0, episode: false, search: 1, seen: false, crimeT: -99, heatFloor: 0 },
      standing: {}, story, shellsGot: new Set(),
      cars: [], peds: [], guards: [], beachFolk: [],
      policeCars: [], policeFoot: [], helis: [],
      taxi: { phase: 'wait', spot: 0, seq: 0, dest: -1, fare: 0, timeLeft: 0, routeLen: 0, nextIn: 0, carId: -1 },
      blockCars: [], blockCd: 0, blocksSet: 0, lightPhase: 0,
      race: null, raceResult: null, coast: null,
      robbery: D.ROBBERY_SHOPS.map(() => ({ count: 0, cd: 0 })),
      robHold: null, channel: null,
      cooldowns: { quickFix: 0, cleanPlate: 0, lookout: 0 },
      services: { tows: [], ambulances: [], jobs: [] },
      stats: { distance: 0, contracts: 0, earned: 0, crashes: 0, shots: 0, races: 0, kills: 0 },
      settings: { volume: 0.55, music: true },
      coastBest: 0, raceRecords: {},
      storageOk: true, storyComplete: false,
      events: [], // transient events for UI/audio: {k:'toast'|'dialogue'|'sfx'|...}
      camYaw: 0, lightningT: -99,
    };
    for (const d of D.DISTRICTS) S.standing[d] = 10;
    const emit = (e) => S.events.push(e);
    const toast = (txt) => emit({ k: 'toast', txt });
    S.drainEvents = () => { const e = S.events; S.events = []; return e; };
    const stars = () => Math.max(D.starsFromCasualties(S.wanted.ledger), S.wanted.episode ? S.wanted.heatFloor : 0);
    S.stars = stars;

    // ---------- world collision helpers ----------
    function collideBuildings(x, z, r) {
      for (const b of city.buildings) {
        const hx = b.w / 2 + r, hz = b.d / 2 + r;
        const dx = x - b.x, dz = z - b.z;
        if (Math.abs(dx) < hx && Math.abs(dz) < hz) {
          if (hx - Math.abs(dx) < hz - Math.abs(dz)) x = b.x + Math.sign(dx || 1) * hx;
          else z = b.z + Math.sign(dz || 1) * hz;
        }
      }
      return { x, z };
    }
    function losBlocked(x1, z1, x2, z2) {
      for (const b of city.buildings) {
        if (b.h < 4) continue;
        // segment vs AABB (slab test)
        const dx = x2 - x1, dz = z2 - z1;
        let t0 = 0, t1 = 1;
        const minx = b.x - b.w / 2, maxx = b.x + b.w / 2, minz = b.z - b.d / 2, maxz = b.z + b.d / 2;
        if (Math.abs(dx) < 1e-9) { if (x1 < minx || x1 > maxx) continue; }
        else {
          let ta = (minx - x1) / dx, tb = (maxx - x1) / dx;
          if (ta > tb) [ta, tb] = [tb, ta];
          t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
          if (t0 > t1) continue;
        }
        if (Math.abs(dz) < 1e-9) { if (z1 < minz || z1 > maxz) continue; }
        else {
          let ta = (minz - z1) / dz, tb = (maxz - z1) / dz;
          if (ta > tb) [ta, tb] = [tb, ta];
          t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
          if (t0 > t1) continue;
        }
        return true;
      }
      return false;
    }
    function groundY(x, z) {
      // pier decks are walkable at y=1.0
      if (x >= 226 && x <= 252) for (const pz of D.PIERS) if (Math.abs(z - pz) < 1.6) return 1.0;
      return 0;
    }

    // ---------- entity construction (meshes bound later by main) ----------
    function buildEntities(bind) {
      const veh = D.genVehicles(D.SEED + 2);
      S.cars = veh.cars.map(c => ({ ...c, speed: 0, steer: 0, fuel: 100, fuelKnown: false, gone: false, towed: false, laneTimer: Math.random() * 20, blockedT: 0, incidentT: -99, laneParked: false }));
      for (const bk of veh.bikes) S.cars.push({ ...bk, speed: 0, steer: 0, fuel: 100, fuelKnown: false, gone: false, towed: false, laneTimer: 0, blockedT: 0, incidentT: -99, laneParked: false });
      S.peds = D.genPeds(D.SEED + 1).map(p => ({ ...p, x: 0, z: 0, ang: 0, state: 'walk', hp: 30, swing: Math.random() * 6, fleeT: 0, fx: 0, fz: 0, counted: false, pauseOff: 0 }));
      for (const p of S.peds) { const pp = D.pedPos(p); p.x = pp.x; p.z = pp.z; }
      // helicopters (3)
      for (let i = 0; i < 3; i++) {
        S.helis.push({ i, x: -164, z: -164, y: 31, ang: 0, routeIdx: 1, mode: 'patrol', speed: 0, roll: 0 });
      }
      // police pools
      for (let i = 0; i < 6; i++) S.policeCars.push({ active: false, x: 0, z: 0, ang: 0, speed: 0, hp: 140, hasDriver: true, mesh: null, driverFig: null, retireT: 0 });
      // roadblock pool: parked units that seal a road ahead of the player
      for (let i = 0; i < 2; i++) S.blockCars.push({ active: false, x: 0, z: 0, ang: 0, hp: 200, setT: -99 });
      for (let i = 0; i < 6; i++) S.policeFoot.push({ active: false, x: 0, z: 0, ang: 0, hp: 100, fireCd: 0, fig: null, fromCar: -1 });
      // tow trucks + ambulances
      for (let i = 0; i < 3; i++) S.services.tows.push({ state: 'idle', x: D.SITES.depot.x, z: D.SITES.depot.z, ang: 0, speed: 0, job: null, phaseT: 0, mesh: null });
      for (let i = 0; i < 2; i++) S.services.ambulances.push({ state: 'idle', x: D.SITES.ambulanceBase.x, z: D.SITES.ambulanceBase.z + i * 6, ang: 0, speed: 0, patient: null, phaseT: 0, mesh: null, medics: [] });
      bind(S);
    }

    // ---------- crime / casualty ----------
    function crime(kind) {
      const w = S.wanted;
      w.crimeT = S.t;
      if (!w.episode) { w.episode = true; w.search = 1; w.heatFloor = Math.max(w.heatFloor, 1); }
      if (kind === 'robbery') { w.ledger = Math.max(w.ledger, 3); }
      w.search = Math.min(1, w.search + 0.35);
    }
    function addCasualty(byPlayer, x, z) {
      if (byPlayer) {
        S.wanted.ledger++;
        S.wanted.episode = true; S.wanted.search = 1;
        const d = D.districtAt(S.player.x, S.player.z);
        S.standing[d] = Math.max(0, S.standing[d] - 4);
        S.stats.kills++;
      }
      callAmbulance(x, z);
    }
    function callAmbulance(x, z) {
      const amb = S.services.ambulances.find(a => a.state === 'idle');
      if (amb) { amb.state = 'go'; amb.tx = x; amb.tz = z; }
      else S.services.jobs.push({ kind: 'amb', x, z, t: S.t });
    }

    // ---------- damage ----------
    function hurtPlayer(dmg) {
      const p = S.player;
      if (p.dead) return;
      const absorbed = Math.min(p.armour, dmg * 0.7);
      p.armour -= absorbed / 0.7 * 0.7; // armour depletes by the absorbed share
      p.armour = Math.max(0, p.armour - 0); // (kept simple below)
      const through = dmg - absorbed;
      p.hp -= through + absorbed * 0; // armour fully absorbs its share
      p.hp -= 0;
      if (p.hp <= 0) { p.hp = 0; p.dead = true; p.deadT = S.t; emit({ k: 'death' }); if (story.active !== null) { story.fail(); toast('Contract failed — it restarts at Mara.'); } }
    }
    function healFull() { S.player.hp = 100; }

    // ---------- main step ----------
    function step(dt, input) {
      S.t += dt;
      const p = S.player;
      // ----- clock & weather -----
      const prevHours = S.hours;
      S.hours += dt * (24 / 1680);
      if (S.hours >= 24) S.hours -= 24;
      const phaseNow = (S.hours >= 6 && S.hours < 18.5) ? 'day' : 'night';
      if (phaseNow !== S.phase) {
        S.phase = phaseNow;
        if (phaseNow === 'day') S.day++;
        const r = D.weatherPhaseBoundary(S.weather, weatherRng);
        if (r === 'start') toast('A storm rolls in over the bay.');
        if (r === 'end') toast('The storm clears.');
      }
      const wTarget = S.weather.storm ? 1 : 0;
      S.weather.intensity += clamp(wTarget - S.weather.intensity, -dt / 3, dt / 3);
      S.stormI = S.weather.intensity;
      if (S.stormI > 0.35 && Math.random() < dt * 0.05) { S.lightningT = S.t; emit({ k: 'lightning' }); }
      // ----- story timer -----
      if (story.active !== null) {
        const tr = story.tick(dt);
        if (tr === 'timeout') toast('Time ran out — the contract restarts at Mara.');
      }
      // ----- cooldowns -----
      for (const k of ['quickFix', 'cleanPlate', 'lookout']) S.cooldowns[k] = Math.max(0, S.cooldowns[k] - dt);
      for (const r of S.robbery) r.cd = Math.max(0, r.cd - dt);
      // ----- player -----
      if (!p.dead) {
        if (p.mode === 'foot') stepFoot(dt, input);
        else if (p.mode === 'boat') stepBoat(dt, input);
        else stepDrive(dt, input);
        p.fireCd -= dt;
        if (p.reloadT > 0) { p.reloadT -= dt; if (p.reloadT <= 0) { const take = Math.min(12 - p.clip, p.ammo); p.clip += take; p.ammo -= take; } }
        if (input.reloadPressed && p.weapon === 'sidearm' && p.clip < 12 && p.ammo > 0 && p.reloadT <= 0) p.reloadT = 1.35;
        if (input.weaponPressed) p.weapon = p.weapon === 'sidearm' ? 'baton' : 'sidearm';
        if (input.fire && p.mode === 'foot') tryFire(input);
        if (input.enterPressed) tryEnterExit();
        if (input.interactPressed) tryInteract();
        S.stats.distance += p.speedNow * dt;
      }
      // ----- world actors -----
      stepTraffic(dt);
      stepPeds(dt);
      stepPolice(dt);
      stepHelis(dt);
      stepGuards(dt);
      stepMissions(dt);
      stepActivities(dt, input);
      stepServices(dt);
      stepBeach(dt);
      // ----- wanted decay -----
      const w = S.wanted;
      if (w.episode) {
        if (!w.seen) {
          w.search -= D.searchDecayRate(stars(), S.standing[D.districtAt(p.x, p.z)]) * dt;
          if (w.search <= 0) {
            w.episode = false; w.ledger = 0; w.heatFloor = 0; w.search = 1;
            toast('The city forgets. Wanted cleared.');
            onWantedCleared();
          }
        }
      }
      w.seen = false;
      // ----- autosave -----
      if (S.t - (S._lastSave || 0) > 20) { S._lastSave = S.t; saveGame(); }
    }

    function onWantedCleared() {
      const st = story.currentStep();
      if (st && st.kind === 'escape') advanceStory();
      const st2 = story.currentStep();
      if (st2 && st2.kind === 'rendezvous') checkRendezvous();
    }

    // ---------- player: on foot ----------
    function stepFoot(dt, input) {
      const p = S.player;
      const sprint = input.sprint && p.stamina > 1;
      const sp = sprint ? 7.5 : 4.1;
      if (sprint && (input.moveX || input.moveZ)) p.stamina = Math.max(0, p.stamina - 20 * dt);
      else p.stamina = Math.min(100, p.stamina + 16 * dt);
      let mx = input.moveX, mz = input.moveZ;
      const ml = Math.hypot(mx, mz);
      if (ml > 0.01) {
        mx /= Math.max(1, ml); mz /= Math.max(1, ml);
        const vx = mx * sp, vz = mz * sp;
        let nx = p.x + vx * dt, nz = p.z + vz * dt;
        // water: on foot may wade east to x=222; elsewhere island bounds
        nx = clamp(nx, D.BOUNDS.x0, 222); nz = clamp(nz, D.BOUNDS.z0, D.BOUNDS.z1);
        const c = collideBuildings(nx, nz, 0.45);
        p.x = c.x; p.z = c.z;
        p.ang = angLerp(p.ang, Math.atan2(vx, vz), 0.35);
        p.speedNow = sp;
        p.swing += dt * sp * 1.9;
      } else p.speedNow = 0;
      if (input.jumpPressed && p.y <= 0.001) p.vy = 6.3;
      const gy = groundY(p.x, p.z);
      if (p.y > gy || p.vy > 0) {
        p.vy -= 18 * dt; p.y += p.vy * dt;
        if (p.y < gy) { p.y = gy; p.vy = 0; }
      } else p.y = gy;
    }

    // ---------- player: driving ----------
    function currentCar() { return S.cars.find(c => c.id === S.player.carId) || null; }
    function stepDrive(dt, input) {
      const p = S.player;
      const car = currentCar();
      if (!car) { p.mode = 'foot'; return; }
      const st = D.VEHICLE_STATS[car.type];
      const sand = p.x > 198 && p.x < 222 ? 0.55 : 1;
      const grip = 1 - 0.32 * S.stormI;
      let thr = 0;
      if (input.moveZ > 0) thr = 1; else if (input.moveZ < 0) thr = -1;
      if (!car.fuelKnown) { car.fuelKnown = true; }
      if (car.fuel <= 0) thr = Math.min(thr, 0);
      if (thr > 0) car.speed += st.accel * sand * dt * (1 - Math.max(0, car.speed) / (st.top * sand));
      else if (thr < 0) car.speed -= (car.speed > 0.5 ? 26 : st.accel * 0.7) * dt;
      else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 6 * dt);
      car.speed = clamp(car.speed, -10, st.top);
      if (input.handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 30 * dt);
      const steerRate = car.type === 'bike' ? 2.4 : 1.9;
      if (Math.abs(car.speed) > 0.2) {
        car.steer = clamp(input.moveX, -1, 1);
        car.ang += -car.steer * steerRate * dt * clamp(car.speed / 9, -1, 1) * grip;
      }
      car.fuel = Math.max(0, D.fuelBurn(car, thr, car.speed, dt));
      if (car.fuel <= 0 && !car._fuelWarned) { car._fuelWarned = true; toast('Out of fuel — the engine cuts.'); }
      if (car.fuel > 5) car._fuelWarned = false;
      let nx = car.x + Math.sin(car.ang) * car.speed * dt;
      let nz = car.z + Math.cos(car.ang) * car.speed * dt;
      // waterline: cars never pass east x=219 (except they cannot float)
      nx = clamp(nx, D.BOUNDS.x0, 219); nz = clamp(nz, D.BOUNDS.z0, D.BOUNDS.z1);
      const before = { x: car.x, z: car.z };
      const c = collideBuildings(nx, nz, 1.5);
      if ((c.x !== nx || c.z !== nz) && Math.abs(car.speed) > 6) {
        const dmg = Math.min(20, (Math.abs(car.speed) - 5) * 1.1);
        damageCar(car, dmg, true);
        car.speed = -car.speed * 0.35;
        S.stats.crashes++;
        emit({ k: 'sfx', name: 'crash' });
      } else { car.x = c.x; car.z = c.z; }
      // car vs car bumps
      for (const o of S.cars) {
        if (o === car || o.gone) continue;
        const d2 = (o.x - car.x) ** 2 + (o.z - car.z) ** 2;
        if (d2 < 9.5 && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const push = (3.1 - d) / 2;
          const ux = (o.x - car.x) / d, uz = (o.z - car.z) / d;
          if (!o.parked || o.driver) { o.x += ux * push; o.z += uz * push; }
          car.x -= ux * push * 0.5; car.z -= uz * push * 0.5;
          if (Math.abs(car.speed) > 5) {
            damageCar(car, 3, true); damageCar(o, 3, false);
            o.incidentT = S.t; car.incidentT = S.t;
            if (S.wanted.episode || Math.abs(car.speed) > 12) crime('collision');
            emit({ k: 'sfx', name: 'bump' });
          }
        }
      }
      // the race rival is solid too: trade paint and you both shed speed
      if (S.race && S.race.rival && !S.race.rival.done) {
        const rv = S.race.rival;
        const d2 = (rv.x - car.x) ** 2 + (rv.z - car.z) ** 2;
        if (d2 < 9.5 && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const push = (3.1 - d) / 2;
          const ux = (rv.x - car.x) / d, uz = (rv.z - car.z) / d;
          if (rv.axis === 'NS') rv.along += uz * push; else rv.along += ux * push;
          placeRival(rv);
          car.x -= ux * push * 0.5; car.z -= uz * push * 0.5;
          if (Math.abs(car.speed) > 5) { car.speed *= 0.82; rv.speed = Math.min(rv.speed, Math.abs(car.speed)); emit({ k: 'sfx', name: 'bump' }); }
        }
      }
      // roadblock units are solid: ramming one costs speed and hull, and a
      // fast enough hit shoves the unit aside and breaks the block
      for (const u of S.blockCars) {
        if (!u.active) continue;
        const d2 = (u.x - car.x) ** 2 + (u.z - car.z) ** 2;
        if (d2 < 10.2 && Math.abs(car.speed) > 3) {
          const d = Math.sqrt(d2) || 0.1;
          const push = (3.2 - d);
          car.x -= (u.x - car.x) / d * push * 0.6;
          car.z -= (u.z - car.z) / d * push * 0.6;
          u.hp -= Math.abs(car.speed) * 2.2;
          damageCar(car, 5, true);
          car.speed = -car.speed * 0.3;
          S.stats.crashes++;
          emit({ k: 'sfx', name: 'crash' });
          if (u.hp <= 0) { u.active = false; S.blockCd = Math.max(S.blockCd, 8); toast('You smashed through the roadblock!'); }
        }
      }
      // ped casualties by car
      if (Math.abs(car.speed) > 3) {
        for (const pd of S.peds) {
          if (pd.state === 'down') continue;
          if ((pd.x - car.x) ** 2 + (pd.z - car.z) ** 2 < 3.4) downPed(pd, true);
        }
        for (const gf of S.guards) {
          if (gf.down) continue;
          if ((gf.x - car.x) ** 2 + (gf.z - car.z) ** 2 < 3.4) downGuard(gf, true);
        }
      }
      p.x = car.x; p.z = car.z; p.ang = car.ang;
      p.speedNow = Math.abs(car.speed);
      p.swing += dt * Math.abs(car.speed) * 0.9;
    }

    // ---------- player: boating ----------
    function currentBoat() { return S.boats ? S.boats[S.player.boatId] : null; }
    function stepBoat(dt, input) {
      const p = S.player;
      const boat = currentBoat();
      if (!boat) { p.mode = 'foot'; return; }
      let thr = 0;
      if (input.moveZ > 0) thr = 1; else if (input.moveZ < 0) thr = -1;
      if (thr > 0) boat.speed += 7 * dt * (1 - boat.speed / 16);
      else if (thr < 0) boat.speed -= 7 * dt * (1 - boat.speed / 5);
      else boat.speed -= Math.sign(boat.speed) * Math.min(Math.abs(boat.speed), 2.5 * dt);
      boat.speed = clamp(boat.speed, -5, 16);
      boat.ang += -input.moveX * 1.5 * dt * clamp(boat.speed / 6, -1, 1);
      let nx = boat.x + Math.sin(boat.ang) * boat.speed * dt;
      let nz = boat.z + Math.cos(boat.ang) * boat.speed * dt;
      // shoreline hard stop at x=225.5 unless aligned with a pier gap he can beach at slowly
      if (nx < 225.5 && boat.speed > 0) { nx = Math.max(nx, 225.5); if (Math.abs(boat.speed) > 4) emit({ k: 'sfx', name: 'bump' }); boat.speed *= 0.4; }
      for (const pz of D.PIERS) {
        if (nx > 226 && nx < 252 && Math.abs(nz - pz) < 2.2) { nz = pz + Math.sign(nz - pz || 1) * 2.2; boat.speed *= 0.5; }
      }
      nx = Math.min(nx, 305);
      boat.x = nx; boat.z = clamp(nz, -260, 260);
      p.x = boat.x; p.z = boat.z; p.ang = boat.ang;
      p.speedNow = Math.abs(boat.speed);
    }

    // ---------- enter / exit ----------
    function tryEnterExit() {
      const p = S.player;
      if (p.mode === 'car' || p.mode === 'bike') {
        const car = currentCar();
        if (car && Math.abs(car.speed) < 1) {
          p.mode = 'foot'; p.carId = -1;
          p.x = car.x + Math.cos(car.ang) * 1.8; p.z = car.z - Math.sin(car.ang) * 1.8;
          const c = collideBuildings(p.x, p.z, 0.45); p.x = c.x; p.z = c.z;
        }
        return;
      }
      if (p.mode === 'boat') {
        const boat = currentBoat();
        if (boat && Math.abs(boat.speed) < 2) {
          // step out near a pier or the shallows
          const nearPier = D.PIERS.some(pz => Math.abs(boat.z - pz) < 4) || boat.x < 232;
          if (nearPier) {
            p.mode = 'foot'; p.boatId = -1;
            p.x = Math.min(boat.x, 230); p.z = boat.z;
            if (D.PIERS.some(pz => Math.abs(p.z - pz) < 4)) { const pz = D.PIERS.find(pz => Math.abs(p.z - pz) < 4); p.z = pz; p.x = 240; }
          }
        }
        return;
      }
      // enter nearest vehicle within reach
      let best = null, bd = 16;
      for (const c of S.cars) {
        if (c.gone || c.towed) continue;
        const d2 = dist2(p, c);
        if (d2 < bd) { bd = d2; best = c; }
      }
      if (best && bd < 12.25) { // 3.5 m
        enterCar(best);
        return;
      }
      // boats within 7.5 m
      if (S.boats) S.boats.forEach((bt, i) => {
        if (dist2(p, bt) < 56) { p.mode = 'boat'; p.boatId = i; p.x = bt.x; p.z = bt.z; }
      });
    }
    function enterCar(car) {
      const p = S.player;
      const wasDriver = car.driver;
      if (!car.owned && !car.stolen) {
        car.stolen = true;
        crime('theft');
        if (car.mission) { S.wanted.search = 1; S.wanted.heatFloor = Math.max(S.wanted.heatFloor, 1); }
        toast(car.mission ? 'Coupe taken — heat rises.' : 'Car stolen — heat rises.');
        emit({ k: 'sfx', name: 'alarm' });
      }
      if (wasDriver) { car.driver = false; /* driver flees: handled by ped spawn flag */ car._driverFled = true; }
      car.parked = false;
      p.mode = car.type === 'bike' ? 'bike' : 'car';
      p.carId = car.id;
      p.x = car.x; p.z = car.z;
      const st = story.currentStep();
      if (st && st.kind === 'stealcar' && st.carId === car.id) advanceStory();
    }

    // ---------- combat ----------
    function tryFire(input) {
      const p = S.player;
      if (p.fireCd > 0 || p.reloadT > 0) return;
      const wpn = p.weapon;
      if (wpn === 'sidearm') {
        if (p.clip <= 0) { emit({ k: 'sfx', name: 'click' }); p.fireCd = 0.3; return; }
        p.clip--; p.fireCd = 0.27;
      } else p.fireCd = 0.5;
      S.stats.shots++;
      emit({ k: 'sfx', name: wpn === 'sidearm' ? 'shot' : 'swing' });
      const range = wpn === 'sidearm' ? 58 : 3.1;
      const dmg = wpn === 'sidearm' ? 38 : 40;
      const aim = S.camYaw;
      let best = null, bd = range * range;
      const consider = (e, x, z, r) => {
        const dx = x - p.x, dz = z - p.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > bd || d2 < 0.5) return;
        let da = Math.atan2(dx, dz) - aim;
        while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
        if (Math.abs(da) < 0.16 && !losBlocked(p.x, p.z, x, z)) { bd = d2; best = e; }
      };
      for (const gf of S.guards) if (!gf.down) consider({ kind: 'guard', e: gf }, gf.x, gf.z);
      for (const pf of S.policeFoot) if (pf.active) consider({ kind: 'cop', e: pf }, pf.x, pf.z);
      for (const pd of S.peds) if (pd.state !== 'down') consider({ kind: 'ped', e: pd }, pd.x, pd.z);
      emit({ k: 'tracer', x1: p.x, z1: p.z, x2: p.x + Math.sin(aim) * (best ? Math.sqrt(bd) : range), z2: p.z + Math.cos(aim) * (best ? Math.sqrt(bd) : range), foe: false });
      if (!best) return;
      if (best.kind === 'guard') hurtGuard(best.e, dmg);
      else if (best.kind === 'cop') { best.e.hp -= dmg; if (best.e.hp <= 0) { best.e.active = false; addCasualty(true, best.e.x, best.e.z); emit({ k: 'copdown', e: best.e }); } }
      else if (best.kind === 'ped') downPed(best.e, true);
      crime('gunfire');
    }
    function downPed(pd, byPlayer) {
      if (pd.state === 'down') return;
      pd.state = 'down';
      if (!pd.counted) { pd.counted = true; addCasualty(byPlayer, pd.x, pd.z); }
    }
    function hurtGuard(gf, dmg) {
      gf.hp -= dmg;
      gf.aggro = true;
      if (gf.hp <= 0 && !gf.down) downGuard(gf, true);
    }
    function downGuard(gf, byPlayer) {
      if (gf.down) return;
      gf.down = true; gf.hp = 0;
      if (!gf.counted) { gf.counted = true; addCasualty(byPlayer, gf.x, gf.z); }
      emit({ k: 'guarddown', e: gf });
    }
    function damageCar(car, dmg, byPlayer) {
      if (car.gone) return;
      car.hp -= dmg;
      if (car.hp <= 0 && !car.disabled) {
        car.disabled = true; car.hp = 0; car.speed = 0;
        emit({ k: 'sfx', name: 'smoke' });
        if (S.player.carId === car.id) {
          hurtPlayer(18);
          S.player.mode = 'foot'; S.player.carId = -1;
          toast('The car is wrecked — you bail out.');
          if (S.taxi.phase === 'fare') cancelTaxi('The cab is wrecked — fare cancelled.');
        }
        const st = story.currentStep();
        if (st && (st.kind === 'stealcar' || st.kind === 'delivercar') && st.carId === car.id) {
          story.fail(); toast('The mission car is destroyed — the contract restarts at Mara.');
          const coupe = S.cars.find(c => c.id === 1);
          if (coupe) { coupe.hp = 100; coupe.disabled = false; coupe.x = 5; coupe.z = -84; coupe.parked = true; coupe.stolen = false; }
        }
      }
    }

    return { S, buildEntities, step, stars, currentCar, hurtPlayer, healFull, emit, toast, saveGame, loadGame, applySave, rescue, respawn, buyClinic, interactInfo, tryInteract, setBoats };
    // hoisted function declarations below are part of the closure

    // ---------- traffic ----------
    function stepTraffic(dt) {
      const p = S.player;
      const lightPhase = Math.floor(S.t / 9) % 2; // 0: NS green, 1: EW green
      S.lightPhase = lightPhase;
      const night = S.phase === 'night';
      for (const car of S.cars) {
        if (car.gone || car.towed || car.parked || !car.driver) continue;
        if (S.player.carId === car.id) continue;
        const isBike = car.type === 'bike';
        // night parking slice: fixed ids park up
        const nightPark = night && (car.id % 10) < 3;
        const cruise = D.VEHICLE_STATS[car.type].top * 0.55 * (night ? 0.9 : 1);
        let target = nightPark ? 0 : Math.min(car.speed + 8 * dt, cruise * (0.5 + (car.id % 5) * 0.1));
        // grid following
        const axis = car.axis, roadCoord = D.ROADS[car.road];
        let px, pz, heading;
        if (axis === 'NS') { px = roadCoord + (car.dir > 0 ? 3.4 : -3.4); pz = car.along; heading = car.dir > 0 ? 0 : Math.PI; }
        else { pz = roadCoord + (car.dir > 0 ? -3.4 : 3.4); px = car.along; heading = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
        // stop line at intersections on red
        const alongMod = ((car.along % 64) + 64) % 64;
        const distToCross = (car.dir > 0 ? (64 - alongMod) : alongMod) - 10;
        const myGreen = (axis === 'NS') === (lightPhase === 0);
        if (!myGreen && distToCross > 0 && distToCross < 7 && !nightPark) target = 0;
        // spacing: car ahead in same lane (traffic gives the player's car
        // a wider berth — it brakes earlier and keeps a bigger gap)
        for (const o of S.cars) {
          if (o === car || o.gone) continue;
          const od = (o.x - px) ** 2 + (o.z - pz) ** 2;
          if (od < 170) {
            const ahead = axis === 'NS' ? (o.z - pz) * car.dir : (o.x - px) * car.dir;
            const lateral = axis === 'NS' ? Math.abs(o.x - px) : Math.abs(o.z - pz);
            const isPlayerCar = S.player.carId >= 0 && o.id === S.player.carId;
            const reach = isPlayerCar ? 13 : 10, gap = isPlayerCar ? 8 : 6;
            if (ahead > 0 && ahead < reach && lateral < 2.4) { target = Math.min(target, Math.max(0, (ahead - gap)) * 1.5); car.blockedT += dt; }
          }
        }
        // head-on yield: oncoming in adjacent lane close -> slow
        car.speed += clamp(target - car.speed, -22 * dt, 9 * dt);
        if (car.speed < 0.05 && target === 0) car.speed = 0;
        car.along += car.dir * car.speed * dt;
        // turn or wrap at city edge / intersections
        if (Math.abs(car.along) > 205) { car.along = -car.along * 0.98; }
        const crossIdx = Math.round((car.along + 192) / 64);
        if (crossIdx >= 0 && crossIdx <= 6 && Math.abs(car.along - D.ROADS[crossIdx]) < 1.2 && car.speed > 2) {
          if (Math.random() < dt * 0.14) {
            // turn onto the crossing road
            const newAxis = axis === 'NS' ? 'EW' : 'NS';
            const crossCoord = D.ROADS[crossIdx];
            car.axis = newAxis;
            car.road = crossIdx;
            car.along = axis === 'NS' ? pz : px;
            car.dir = Math.random() < 0.5 ? 1 : -1;
            if (newAxis === 'NS') { car.x = crossCoord + (car.dir > 0 ? 3.4 : -3.4); car.z = car.along; }
            else { car.z = crossCoord + (car.dir > 0 ? -3.4 : 3.4); car.x = car.along; }
            car.ang = newAxis === 'NS' ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
            continue;
          }
        }
        if (axis === 'NS') { car.x = px; car.z = car.along; } else { car.x = car.along; car.z = pz; }
        car.ang = angLerp(car.ang, heading, 0.2);
        if (nightPark && car.speed === 0) { /* parked for the night at lane edge */ }
      }
    }

    // ---------- pedestrians ----------
    function stepPeds(dt) {
      const p = S.player;
      for (const pd of S.peds) {
        if (pd.state === 'down') continue;
        const threat = (Math.abs(p.speedNow) > 9 && dist2(p, pd) < 60) || (S.t - S.wanted.crimeT < 2 && dist2(p, pd) < 200) || (stars() >= 3 && dist2(p, pd) < 120);
        if (pd.state === 'walk' && threat) { pd.state = 'flee'; pd.fleeT = 2 + Math.random() * 2; const a = Math.atan2(pd.x - p.x, pd.z - p.z); pd.fx = Math.sin(a); pd.fz = Math.cos(a); }
        if (pd.state === 'flee') {
          pd.fleeT -= dt;
          pd.x += pd.fx * 4.6 * dt; pd.z += pd.fz * 4.6 * dt;
          pd.ang = Math.atan2(pd.fx, pd.fz);
          pd.swing += dt * 11;
          if (pd.fleeT <= 0) { pd.state = 'walk'; /* rejoin block walk at nearest perimeter point */ let bd = 1e9; for (let d = 0; d < 160; d += 4) { const q = D.pedPos({ ...pd, dist: d }); const dd = (q.x - pd.x) ** 2 + (q.z - pd.z) ** 2; if (dd < bd) { bd = dd; pd.dist = d; } } }
          continue;
        }
        // pause pattern: walk cycle seconds, then pause
        const cyc = pd.cycle + pd.pauseLen;
        const tt = (S.t + pd.phase) % cyc;
        if (tt < pd.cycle) {
          pd.dist += pd.speed * dt;
          pd.swing += dt * pd.speed * 2.2;
        }
        const pp = D.pedPos(pd);
        pd.x = pp.x; pd.z = pp.z;
        pd.ang = [Math.PI / 2, 0, -Math.PI / 2, Math.PI][pp.dir];
      }
    }

    // ---------- police ----------
    function spawnPoliceCar() {
      const u = S.policeCars.find(u => !u.active);
      if (!u) return;
      const p = S.player;
      const a = Math.random() * Math.PI * 2;
      const r = 95 + Math.random() * 25;
      let x = clamp(p.x + Math.sin(a) * r, -205, 205), z = clamp(p.z + Math.cos(a) * r, -205, 205);
      // snap to nearest road
      const snap = (v) => D.ROADS.reduce((q, c) => Math.abs(c - v) < Math.abs(q - v) ? c : q, D.ROADS[0]);
      if (Math.random() < 0.5) x = snap(x); else z = snap(z);
      u.active = true; u.x = x; u.z = z; u.ang = Math.atan2(p.x - x, p.z - z);
      u.speed = 0; u.hp = 140; u.hasDriver = true; u.retireT = 0;
      emit({ k: 'policespawn', e: u });
    }
    function spawnPoliceFoot(fromCar) {
      const u = S.policeFoot.find(u => !u.active);
      if (!u) return null;
      const p = S.player;
      const a = Math.random() * Math.PI * 2;
      u.active = true;
      u.x = fromCar ? fromCar.x + 2 : clamp(p.x + Math.sin(a) * 70, -210, 210);
      u.z = fromCar ? fromCar.z + 2 : clamp(p.z + Math.cos(a) * 70, -210, 210);
      u.hp = 100; u.fireCd = 1 + Math.random();
      u.fromCar = fromCar ? S.policeCars.indexOf(fromCar) : -1;
      emit({ k: 'policespawn', e: u });
      return u;
    }
    function stepPolice(dt) {
      const p = S.player;
      const st = stars();
      const w = S.wanted;
      if (w.episode && st > 0) {
        const wantCars = D.DISPATCH_CAR[st], wantFoot = D.DISPATCH_FOOT[st];
        const haveCars = S.policeCars.filter(u => u.active).length;
        const haveFoot = S.policeFoot.filter(u => u.active).length;
        if (haveCars < wantCars && Math.random() < dt * 0.7) spawnPoliceCar();
        if (haveFoot < Math.max(0, wantFoot - haveCars) && Math.random() < dt * 0.4) spawnPoliceFoot(null);
      }
      // sight + lookout
      const sightOf = (ux, uz, range) => {
        const d2 = (p.x - ux) ** 2 + (p.z - uz) ** 2;
        if (d2 > range * range) return false;
        return !losBlocked(ux, uz, p.x, p.z);
      };
      for (const u of S.policeCars) {
        if (!u.active) continue;
        const d = dist(u, p);
        if (sightOf(u.x, u.z, 55)) { w.seen = true; w.search = 1; lookoutCheck(u); }
        if (!w.episode || st === 0) { // retire
          u.retireT += dt;
          if (u.retireT > 3 || d > 170) { u.active = false; emit({ k: 'policedespawn', e: u }); }
          continue;
        }
        if (d > 105 && !w.seen) { u.active = false; emit({ k: 'policedespawn', e: u }); continue; }
        // pursuit: target lead ahead of player motion
        const lead = 26;
        const tx = p.x + Math.sin(p.ang) * p.speedNow * (d / lead) * 0.6;
        const tz = p.z + Math.cos(p.ang) * p.speedNow * (d / lead) * 0.6;
        const want = Math.atan2(tx - u.x, tz - u.z);
        u.ang = angLerp(u.ang, want, clamp(dt * (d < 20 ? 2.4 : 1.4), 0, 1));
        const top = 27;
        u.speed = clamp(u.speed + (d > 14 ? 16 : 6) * dt, 0, top);
        if (d < 9) u.speed = Math.min(u.speed, Math.max(4, p.speedNow + 2));
        let nx = u.x + Math.sin(u.ang) * u.speed * dt;
        let nz = u.z + Math.cos(u.ang) * u.speed * dt;
        const c = collideBuildings(nx, nz, 1.5);
        u.x = c.x; u.z = c.z;
        // contact damage to player's car
        if (p.carId >= 0 && d < 3.4 && u.speed > 6 && S.t - (u._ramT || 0) > 1.2) {
          u._ramT = S.t;
          const pc = currentCar();
          if (pc) { damageCar(pc, 6, false); emit({ k: 'sfx', name: 'bump' }); }
        }
        // bail out near a slow / on-foot player
        if (u.hasDriver && d < 24 && p.mode === 'foot' && Math.random() < dt * 0.8) {
          const f = spawnPoliceFoot(u);
          if (f) { u.hasDriver = false; u.speed = 0; }
        }
        if (u.hp <= 0) { u.active = false; emit({ k: 'policedespawn', e: u }); }
      }
      for (const u of S.policeFoot) {
        if (!u.active) continue;
        const d = dist(u, p);
        if (sightOf(u.x, u.z, 40)) { w.seen = true; w.search = 1; lookoutCheck(u); }
        if (!w.episode || st === 0 || d > 120) { u.active = false; emit({ k: 'policedespawn', e: u }); continue; }
        if (d > 85 && !w.seen) { u.active = false; emit({ k: 'policedespawn', e: u }); continue; }
        if (d > 13) {
          const want = Math.atan2(p.x - u.x, p.z - u.z);
          u.ang = angLerp(u.ang, want, 0.3);
          u.x += Math.sin(u.ang) * 5.4 * dt;
          u.z += Math.cos(u.ang) * 5.4 * dt;
          const c = collideBuildings(u.x, u.z, 0.45); u.x = c.x; u.z = c.z;
          u.swing = (u.swing || 0) + dt * 10;
        } else if (sightOf(u.x, u.z, 40)) {
          u.ang = Math.atan2(p.x - u.x, p.z - u.z);
          u.fireCd -= dt;
          if (u.fireCd <= 0) {
            u.fireCd = 1.6;
            emit({ k: 'tracer', x1: u.x, z1: u.z, x2: p.x, z2: p.z, foe: true });
            emit({ k: 'sfx', name: 'shot' });
            if (Math.random() < 0.45) {
              if (p.carId >= 0) { const pc = currentCar(); if (pc) damageCar(pc, 4, false); }
              else hurtPlayer(9);
            }
          }
        }
      }
      S._anyPoliceSeen = S.policeCars.some(u => u.active) || S.policeFoot.some(u => u.active);
      stepRoadblocks(dt);
    }
    // ---------- roadblocks (4-5 stars, player driving) ----------
    function stepRoadblocks(dt) {
      const p = S.player;
      const st = stars();
      S.blockCd = Math.max(0, S.blockCd - dt);
      const want = (st >= 4 && p.carId >= 0 && !p.dead) ? Math.min(2, st - 3) : 0;
      for (const u of S.blockCars) {
        if (!u.active) continue;
        const d = dist(u, p);
        const passed = ((u.x - p.x) * Math.sin(p.ang) + (u.z - p.z) * Math.cos(p.ang)) < -20;
        if (want === 0 || d > 130 || passed || S.t - u.setT > 40) {
          u.active = false;
          S.blockCd = Math.max(S.blockCd, passed ? 3 : 6);
          continue;
        }
        // a set block watches the road: being seen by it holds the search open
        if (d < 45 && !losBlocked(u.x, u.z, p.x, p.z)) { S.wanted.seen = true; S.wanted.search = 1; }
      }
      const activeN = S.blockCars.filter(u => u.active).length;
      if (activeN < want && S.blockCd <= 0) {
        const u = S.blockCars.find(u => !u.active);
        if (u) {
          const ahead = 52;
          let tx = p.x + Math.sin(p.ang) * ahead;
          let tz = p.z + Math.cos(p.ang) * ahead;
          const snap = (v) => D.ROADS.reduce((q, c) => Math.abs(c - v) < Math.abs(q - v) ? c : q, D.ROADS[0]);
          const second = activeN > 0;
          if (Math.abs(Math.cos(p.ang)) >= Math.abs(Math.sin(p.ang))) {
            // travelling north/south: seal the NS road, car parked across it
            tx = snap(p.x) + (second ? 3.4 : -1.6);
            u.ang = Math.PI / 2 + (second ? -0.16 : 0.1);
          } else {
            tz = snap(p.z) + (second ? 3.4 : -1.6);
            u.ang = 0 + (second ? 0.16 : -0.1);
          }
          u.x = clamp(tx, -208, 214); u.z = clamp(tz, -208, 208);
          u.active = true; u.setT = S.t; u.hp = 200;
          S.blocksSet++;
          emit({ k: 'policespawn', e: u });
        }
      }
    }
    function lookoutCheck(u) {
      if (S.cooldowns.lookout <= 0 && dist(u, S.player) < 55) {
        S.cooldowns.lookout = 20;
        toast('Mara (lookout): a unit just rolled in near you.');
      }
    }

    // ---------- helicopters ----------
    function stepHelis(dt) {
      const p = S.player;
      const st = stars();
      const followN = st >= 3 ? st - 2 : 0;
      S.helis.forEach((h, i) => {
        const follow = i < followN;
        h.mode = follow ? 'follow' : 'patrol';
        let tx, tz, top = 22;
        if (follow) {
          top = 46;
          const slots = [[-56, 0], [56, 0], [0, -65]];
          const s = slots[i];
          const sin = Math.sin(p.ang), cos = Math.cos(p.ang);
          tx = p.x + sin * s[1] + cos * s[0];
          tz = p.z + cos * s[1] - sin * s[0];
        } else {
          const wp = D.HELI_ROUTE[h.routeIdx];
          tx = wp.x; tz = wp.z;
          if ((h.x - tx) ** 2 + (h.z - tz) ** 2 < 30 * 30) h.routeIdx = (h.routeIdx + 1) % D.HELI_ROUTE.length;
        }
        const dx = tx - h.x, dz = tz - h.z;
        const d = Math.hypot(dx, dz);
        const want = Math.atan2(dx, dz);
        const prevAng = h.ang;
        h.ang = angLerp(h.ang, want, clamp(dt * 1.2, 0, 1));
        let turn = h.ang - prevAng;
        h.roll = clamp(h.roll + (clamp(turn * 3, -0.5, 0.5) - h.roll) * dt * 3, -0.55, 0.55);
        h.speed = clamp(h.speed + (Math.min(top, d * 0.8) - h.speed) * dt * 0.8, 0, top);
        h.x += Math.sin(h.ang) * h.speed * dt;
        h.z += Math.cos(h.ang) * h.speed * dt;
        // altitude: base 31 (28-34), always 12 above rooftops below
        let roof = 0;
        for (const b of city.buildings) {
          if (Math.abs(b.x - h.x) < 24 && Math.abs(b.z - h.z) < 24) roof = Math.max(roof, b.h);
        }
        const targetY = Math.max(31 + Math.sin(S.t * 0.5 + i * 2) * 2.5, roof + 12);
        h.y += clamp(targetY - h.y, -8 * dt, 8 * dt);
        h.spotOn = follow && (S.hours >= 18.5 || S.hours < 6);
        if (h.spotOn) { S.wanted.seen = true; }
      });
    }

    // ---------- guards (mission combat) ----------
    function spawnGuards(x, z, count) {
      S.guards = [];
      for (let i = 0; i < count; i++) {
        S.guards.push({
          x: x + (i - 1) * 4.5, z: z + (i % 2) * 4 - 2, ang: Math.PI, hp: 70,
          fireCd: 1.2 + i * 0.5, down: false, aggro: false, counted: false, neutral: false, fig: null, swing: 0,
        });
      }
      emit({ k: 'guardspawn' });
    }
    function stepGuards(dt) {
      const p = S.player;
      for (const gf of S.guards) {
        if (gf.down || gf.neutral) continue;
        const d = dist(gf, p);
        if (d < 42) gf.aggro = true;
        if (!gf.aggro) continue;
        gf.ang = Math.atan2(p.x - gf.x, p.z - gf.z);
        if (d > 20) { gf.x += Math.sin(gf.ang) * 2.6 * dt; gf.z += Math.cos(gf.ang) * 2.6 * dt; gf.swing += dt * 6; }
        if (d < 38 && !losBlocked(gf.x, gf.z, p.x, p.z)) {
          gf.fireCd -= dt;
          if (gf.fireCd <= 0) {
            gf.fireCd = 1.9;
            emit({ k: 'tracer', x1: gf.x, z1: gf.z, x2: p.x, z2: p.z, foe: true });
            emit({ k: 'sfx', name: 'shot' });
            const hitChance = p.speedNow > 5 ? 0.35 : 0.7;
            if (Math.random() < hitChance) hurtPlayer(9);
          }
        }
      }
    }

    // ---------- missions ----------
    function advanceStory() {
      const c = story.contract();
      const r = story.advance();
      emit({ k: 'sfx', name: 'pickup' });
      if (typeof r === 'string' && r.startsWith('complete:')) {
        const reward = Number(r.split(':')[1]);
        const p = S.player;
        p.money += reward; S.stats.contracts++; S.stats.earned += reward;
        const dName = D.districtAt(p.x, p.z);
        const before = D.tierOf(S.standing[dName]).name;
        S.standing[dName] = Math.min(100, S.standing[dName] + 15);
        if (D.tierOf(S.standing[dName]).name !== before) toast(`${dName} standing rises to ${D.tierOf(S.standing[dName]).name}.`);
        emit({ k: 'dialogue', lines: c.done, title: `Contract ${c.id} complete — +$${reward}` });
        const ch = D.chapterOf(story.done - 1);
        if (c.id === 6) { S.storyComplete = true; emit({ k: 'storycomplete' }); }
        if (ch >= 0) emit({ k: 'chapter', idx: ch });
        saveGame();
      } else {
        toast('Objective updated.');
      }
      setupStep();
    }
    function setupStep() {
      const st = story.currentStep();
      S.guards = S.guards.filter(g => g.down || g.neutral);
      if (st && st.kind === 'combat') spawnGuards(st.x, st.z, st.count);
    }
    function failContractIfCarDead() { /* handled in damageCar */ }
    function stepMissions(dt) {
      const st = story.currentStep();
      if (!st) return;
      const p = S.player;
      if (st.kind === 'collect' || st.kind === 'deliver') {
        if (dist(p, st) < 7 && p.speedNow < 1) advanceStory();
      } else if (st.kind === 'delivercar') {
        const car = S.cars.find(c => c.id === st.carId);
        if (car && dist(car, D.SITES.chop) < 9 && Math.abs(car.speed) < 1) {
          car.owned = true; car.mission = false; car.stolen = false;
          if (p.carId === car.id) { p.mode = 'foot'; p.carId = -1; p.x = car.x + 2; p.z = car.z; }
          advanceStory();
        }
      } else if (st.kind === 'combat') {
        if (S.guards.length && S.guards.every(g => g.down || g.neutral)) advanceStory();
      } else if (st.kind === 'rendezvous') {
        checkRendezvous();
      }
    }
    function checkRendezvous() {
      const st = story.currentStep();
      if (!st || st.kind !== 'rendezvous') return;
      const p = S.player;
      if (dist(p, st) < 7 && p.speedNow < 1 && stars() === 0 && !S.wanted.episode) advanceStory();
    }

    // ---------- activities ----------
    function cancelTaxi(msg) {
      S.taxi.phase = 'wait'; S.taxi.nextIn = 20 + Math.random() * 25; S.taxi.carId = -1;
      if (msg) toast(msg);
    }
    function stepActivities(dt, input) {
      const p = S.player;
      const tx = S.taxi;
      if (tx.phase === 'wait') {
        tx.nextIn -= dt;
        if (tx.nextIn <= 0 && !tx.passengerOut) { tx.passengerOut = true; }
        if (tx.passengerOut && p.carId >= 0 && p.speedNow < 1) {
          const spot = D.TAXI_SPOTS[tx.spot];
          if (dist(p, spot) < 6.5) {
            tx.dest = D.taxiDestination(tx.spot, tx.seq);
            const dest = D.TAXI_SPOTS[tx.dest];
            tx.routeLen = D.roadRouteLength(spot, dest);
            tx.fare = D.taxiFare(tx.routeLen);
            tx.timeTotal = D.taxiTimeLimit(tx.routeLen);
            tx.timeLeft = tx.timeTotal;
            tx.phase = 'fare';
            tx.carId = p.carId;
            tx.passengerOut = false;
            toast(`Fare aboard — bound for ${D.districtAt(dest.x, dest.z)}, $${Math.round(tx.fare)} on the meter.`);
            emit({ k: 'sfx', name: 'pickup' });
          }
        }
      } else if (tx.phase === 'fare') {
        tx.timeLeft -= dt;
        const destSpot = D.TAXI_SPOTS[tx.dest];
        if (p.carId >= 0 && p.speedNow < 1 && dist(p, destSpot) < 7) {
          const bonus = Math.round(30 * clamp(tx.timeLeft / tx.timeTotal, 0, 1));
          const pay = Math.round(tx.fare) + bonus;
          p.money += pay; S.stats.earned += pay;
          const dn = D.districtAt(destSpot.x, destSpot.z);
          S.standing[dn] = Math.min(100, S.standing[dn] + 2);
          toast(`Fare paid $${Math.round(tx.fare)} + $${bonus} time bonus.`);
          emit({ k: 'sfx', name: 'cash' });
          tx.phase = 'wait'; tx.carId = -1; tx.seq++; tx.spot = (tx.spot + 1) % D.TAXI_SPOTS.length;
          tx.passengerOut = false; tx.nextIn = 20 + Math.random() * 25;
        } else if (tx.timeLeft <= 0) cancelTaxi('Fare timed out — no payment.');
      }
      // shells
      if (p.mode === 'foot') {
        D.SHELLS.forEach((sh, i) => {
          if (S.shellsGot.has(i)) return;
          if ((sh.x - p.x) ** 2 + (sh.z - p.z) ** 2 < 2.2 * 2.2) {
            S.shellsGot.add(i);
            emit({ k: 'sfx', name: 'pickup' });
            const n = S.shellsGot.size;
            if (n === 20) { p.money += 500; S.stats.earned += 500; toast('All 20 Dusk Shells — +$500 completion bonus!'); }
            else if (n % 5 === 0) { p.money += 150; S.stats.earned += 150; toast(`${n}/20 shells — +$150 milestone.`); }
            else toast(`Dusk Shell ${n}/20.`);
            emit({ k: 'shellhide', i });
            saveGame();
          }
        });
      }
      // robbery: a true hold-E channel — releasing the key breaks it
      if (S.robHold) {
        const sh = D.ROBBERY_SHOPS[S.robHold.shop];
        if (p.mode !== 'foot' || dist(p, sh) > 5 || p.dead) { S.robHold = null; toast('Robbery interrupted.'); }
        else if (!input || !input.interactHeld) { S.robHold = null; toast('Robbery interrupted — keep E held to the end.'); }
        else {
          S.robHold.t += dt;
          if (S.robHold.t >= 4) {
            const idx = S.robHold.shop;
            const pay = D.robberyPay(idx, S.robbery[idx].count);
            S.robbery[idx].count++; S.robbery[idx].cd = 240;
            p.money += pay; S.stats.earned += pay;
            const dn = D.districtAt(sh.x, sh.z);
            S.standing[dn] = Math.max(0, S.standing[dn] - 8);
            crime('robbery');
            toast(`Register emptied: +$${pay}. Heat jumps to two stars.`);
            emit({ k: 'sfx', name: 'cash' });
            S.robHold = null;
          }
        }
      }
      // crew channel (quick fix / clean plate)
      if (S.channel) {
        const ch = S.channel;
        let broken = p.dead;
        if (ch.kind === 'quickfix') {
          const car = currentCar();
          if (!car || Math.abs(car.speed) > 0.5 || p.mode === 'foot') broken = true;
        } else if (ch.kind === 'cleanplate') {
          const car = S.cars.find(c => c.id === ch.carId);
          if (!car || p.mode !== 'foot' || dist(p, car) > 4 || S.wanted.seen) broken = true;
        }
        if (broken) { S.channel = null; toast('Channel interrupted.'); }
        else {
          ch.t += dt;
          if (ch.t >= ch.need) {
            if (ch.kind === 'quickfix') {
              const car = currentCar();
              if (p.money >= D.PRICES.quickFix) { p.money -= D.PRICES.quickFix; car.hp = Math.min(100, car.hp + 40); S.cooldowns.quickFix = 90; toast('Quick fix done: +40 hp, −$35.'); emit({ k: 'sfx', name: 'repair' }); }
            } else if (ch.kind === 'cleanplate') {
              const st = stars();
              if (st <= 1) { S.wanted.episode = false; S.wanted.ledger = 0; S.wanted.heatFloor = 0; }
              else S.wanted.ledger = D.ledgerBelowBand(st);
              S.cooldowns.cleanPlate = 180;
              toast('Clean plate fitted — one star gone.');
            }
            S.channel = null;
            saveGame();
          }
        }
      }
      // races: you against the crimson rival, same gates, same streets —
      // whoever crosses the last gate first takes the prize
      if (S.race) {
        const r = S.race;
        r.time += dt;
        const gate = r.gates[r.next];
        if (gate && p.carId >= 0 && dist(p, gate) < 12) {
          emit({ k: 'sfx', name: 'gate' });
          r.next++;
          if (r.next >= r.gates.length) {
            const rec = S.raceRecords[r.name] || { best: 0, wins: 0 };
            const first = rec.wins === 0;
            const pay = first ? 150 : 60;
            p.money += pay; S.stats.earned += pay; S.stats.races++;
            rec.wins++;
            if (first) { const dn = D.districtAt(p.x, p.z); S.standing[dn] = Math.min(100, S.standing[dn] + 4); }
            toast(`${r.name} won in ${r.time.toFixed(1)}s — you beat the rival home (par ${r.par.toFixed(1)}s). +$${pay}.`);
            if (!rec.best || r.time < rec.best) rec.best = r.time;
            S.raceRecords[r.name] = rec;
            S.raceResult = { name: r.name, win: true };
            S.race = null;
            saveGame();
          }
        }
        if (S.race) stepRival(dt);
      }
      if (S.coast) {
        const r = S.coast;
        r.time += dt;
        const gate = D.COAST_RUN.gates[r.next];
        if (gate && p.carId >= 0 && dist(p, gate) < 12) {
          emit({ k: 'sfx', name: 'gate' });
          r.next++;
          if (r.next >= D.COAST_RUN.gates.length) {
            p.money += D.COAST_RUN.prize; S.stats.earned += D.COAST_RUN.prize;
            if (!S.coastBest || r.time < S.coastBest) { S.coastBest = r.time; toast(`Coast Run ${r.time.toFixed(1)}s — new best! +$350.`); }
            else toast(`Coast Run ${r.time.toFixed(1)}s — +$350.`);
            S.coast = null;
            saveGame();
          }
        }
      }
    }

    // ---------- race rival ----------
    // The rival runs the same gates on the traffic lane model (axis / road /
    // along / dir). At each crossing it probes 30 units past every exit and
    // takes the one that leaves it closest to its gate; straight wins ties.
    // No randomness anywhere: same start, same race, every time.
    function placeRival(r) {
      if (r.axis === 'NS') { r.x = D.ROADS[r.road] + (r.dir > 0 ? 3.4 : -3.4); r.z = r.along; r.ang = r.dir > 0 ? 0 : Math.PI; }
      else { r.z = D.ROADS[r.road] + (r.dir > 0 ? -3.4 : 3.4); r.x = r.along; r.ang = r.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
    }
    function spawnRival(race) {
      const start = race.start, gate = race.gates[0];
      const snapIdx = (v) => D.ROADS.reduce((bi, c, i) => Math.abs(c - v) < Math.abs(D.ROADS[bi] - v) ? i : bi, 0);
      let axis, road;
      if (Math.abs(start.x - D.ROADS[snapIdx(start.x)]) <= Math.abs(start.z - D.ROADS[snapIdx(start.z)])) { axis = 'NS'; road = snapIdx(start.x); }
      else { axis = 'EW'; road = snapIdx(start.z); }
      const along = axis === 'NS' ? start.z : start.x;
      const gateAlong = axis === 'NS' ? gate.z : gate.x;
      const r = { axis, road, dir: gateAlong >= along ? 1 : -1, along, speed: 0, next: 0, done: false, x: start.x, z: start.z, ang: 0, lastCross: '' };
      placeRival(r);
      return r;
    }
    function stepRival(dt) {
      const race = S.race;
      const r = race && race.rival;
      if (!r || r.done) return;
      const gate = race.gates[r.next];
      if (!gate) { r.done = true; return; }
      let turning = false;
      const crossIdx = Math.round((r.along + 192) / 64);
      if (crossIdx >= 0 && crossIdx <= 6 && Math.abs(r.along - D.ROADS[crossIdx]) < 1.4 && r.speed > 2) {
        const key = r.axis + ':' + r.road + ':' + crossIdx;
        if (r.lastCross !== key) {
          r.lastCross = key;
          const crossCoord = D.ROADS[crossIdx];
          const cxp = r.axis === 'NS' ? D.ROADS[r.road] : crossCoord;
          const czp = r.axis === 'NS' ? crossCoord : D.ROADS[r.road];
          const probe = (axis, dir) => axis === 'NS' ? { x: cxp, z: czp + dir * 30 } : { x: cxp + dir * 30, z: czp };
          const dOf = (pt) => (pt.x - gate.x) ** 2 + (pt.z - gate.z) ** 2;
          let bestOpt = null, bestD = dOf(probe(r.axis, r.dir));
          for (const nd of [1, -1]) {
            const na = r.axis === 'NS' ? 'EW' : 'NS';
            const dd = dOf(probe(na, nd));
            if (dd < bestD - 1) { bestD = dd; bestOpt = { axis: na, dir: nd }; }
          }
          if (bestOpt) {
            turning = true;
            r.axis = bestOpt.axis; r.dir = bestOpt.dir;
            r.road = crossIdx;
            r.along = bestOpt.axis === 'NS' ? czp : cxp;
          }
        }
      }
      let target = 16.5; // cruise: under a clean sport run, over a sloppy one
      if (turning) target = 8;
      const p = S.player;
      if (p.carId >= 0) { // the rival queues behind your car like any driver
        const ahead = r.axis === 'NS' ? (p.z - r.z) * r.dir : (p.x - r.x) * r.dir;
        const lateral = r.axis === 'NS' ? Math.abs(p.x - r.x) : Math.abs(p.z - r.z);
        if (ahead > 0 && ahead < 9 && lateral < 2.4) target = Math.min(target, Math.max(0, (ahead - 5)) * 1.5);
      }
      r.speed += clamp(target - r.speed, -22 * dt, 9 * dt);
      if (r.speed < 0.05 && target === 0) r.speed = 0;
      r.along += r.dir * r.speed * dt;
      if (Math.abs(r.along) > 205) r.along = -r.along * 0.98;
      placeRival(r);
      if ((gate.x - r.x) ** 2 + (gate.z - r.z) ** 2 < 144) {
        r.next++;
        if (r.next >= race.gates.length) { r.done = true; rivalWins(); }
      }
    }
    function rivalWins() {
      const r = S.race;
      if (!r) return;
      S.raceResult = { name: r.name, win: false };
      toast(`Outrun — the crimson rival took the ${r.name}. No prize.`);
      S.race = null;
    }

    // ---------- emergency services ----------
    function driveToward(u, tx, tz, top, dt) {
      const want = Math.atan2(tx - u.x, tz - u.z);
      u.ang = angLerp(u.ang, want, clamp(dt * 2, 0, 1));
      const d = Math.hypot(tx - u.x, tz - u.z);
      u.speed = clamp(u.speed + 14 * dt, 0, d < 6 ? Math.max(2, d) : top);
      u.x += Math.sin(u.ang) * u.speed * dt;
      u.z += Math.cos(u.ang) * u.speed * dt;
      const c = collideBuildings(u.x, u.z, 1.5);
      u.x = c.x; u.z = c.z;
      return d;
    }
    function stepServices(dt) {
      // register tow jobs
      for (const car of S.cars) {
        if (car.gone || car.towed || car._jobbed) continue;
        let job = false;
        if (car.disabled) job = true;
        else if (!car.driver && !car.parked && S.t - car.incidentT > 14 && car.incidentT > 0) job = true;
        else if (!car.driver && car._laneSince && S.t - car._laneSince > (car.owned ? 45 : 22)) job = true;
        else if (car.driver && car.blockedT > 42) job = true;
        if (!car.driver && !car.parked && car.speed === 0 && S.player.carId !== car.id) car._laneSince = car._laneSince || S.t; else if (car.driver || car.parked) car._laneSince = 0;
        if (job) { car._jobbed = true; S.services.jobs.push({ kind: 'tow', carId: car.id, t: S.t }); }
      }
      for (const tw of S.services.tows) {
        if (tw.state === 'idle') {
          const ji = S.services.jobs.findIndex(j => j.kind === 'tow');
          if (ji >= 0) { tw.job = S.services.jobs.splice(ji, 1)[0]; tw.state = 'go'; }
        } else if (tw.state === 'go') {
          const car = S.cars.find(c => c.id === tw.job.carId);
          if (!car || car.gone) { tw.state = 'idle'; tw.job = null; continue; }
          if (driveToward(tw, car.x - Math.sin(car.ang) * 4, car.z - Math.cos(car.ang) * 4, 13, dt) < 2.5) { tw.state = 'hook'; tw.phaseT = 0; tw.speed = 0; }
        } else if (tw.state === 'hook') {
          tw.phaseT += dt;
          if (tw.phaseT >= 3.5) { tw.state = 'haul'; const car = S.cars.find(c => c.id === tw.job.carId); if (car) car.towed = true; }
        } else if (tw.state === 'haul') {
          const car = S.cars.find(c => c.id === tw.job.carId);
          if (driveToward(tw, D.SITES.depot.x, D.SITES.depot.z, 11, dt) < 4) {
            if (car) {
              car.towed = false; car._jobbed = false; car.disabled = false;
              if (car.police) { car.gone = true; }
              else if (car.owned || car.mission) { car.x = -170; car.z = -45; car.hp = Math.max(car.hp, 65); car.parked = true; if (car._fuelOut) { car.fuel = 50; car._fuelOut = false; } }
              else { car.hp = Math.max(car.hp, 65); car.x = tw.x; car.z = tw.z; car.driver = true; car.parked = false; car.axis = 'EW'; car.road = 3; car.along = car.x; }
            }
            tw.state = 'idle'; tw.job = null;
          } else if (car) {
            car.x = tw.x - Math.sin(tw.ang) * 5.2; car.z = tw.z - Math.cos(tw.ang) * 5.2;
            car.ang = tw.ang;
          }
        }
      }
      for (const amb of S.services.ambulances) {
        if (amb.state === 'idle') {
          const ji = S.services.jobs.findIndex(j => j.kind === 'amb');
          if (ji >= 0) { const j = S.services.jobs.splice(ji, 1)[0]; amb.state = 'go'; amb.tx = j.x; amb.tz = j.z; }
          continue;
        }
        if (amb.state === 'go') {
          if (driveToward(amb, amb.tx, amb.tz, 14, dt) < 4) { amb.state = 'treat'; amb.phaseT = 0; amb.speed = 0; emit({ k: 'medicsout', e: amb }); }
        } else if (amb.state === 'treat') {
          amb.phaseT += dt;
          if (amb.phaseT >= 5) {
            // revive the patient near the stop point
            for (const pd of S.peds) if (pd.state === 'down' && dist(pd, amb) < 9) { pd.state = 'walk'; pd.hp = 30; }
            for (const gf of S.guards) if (gf.down && dist(gf, amb) < 9) { gf.down = false; gf.hp = 65; gf.neutral = true; gf.aggro = false; }
            if (S.player.dead && S._rescueAmb === amb) { /* rescue handled via rescue() */ }
            amb.state = 'back'; emit({ k: 'medicsin', e: amb });
          }
        } else if (amb.state === 'back') {
          if (driveToward(amb, D.SITES.ambulanceBase.x, D.SITES.ambulanceBase.z, 14, dt) < 3) { amb.state = 'idle'; amb.speed = 0; }
        }
      }
    }

    // ---------- beach folk ----------
    function stepBeach(dt) {
      const storm = S.stormI > 0.3;
      for (const bf of S.beachFolk) {
        bf.hidden = storm;
        if (bf.stroll && !storm) {
          bf.z += bf.dir * 0.9 * dt;
          if (bf.z > 140 || bf.z < -50) bf.dir *= -1;
          bf.swing += dt * 4;
        }
      }
    }

    // ---------- interact ----------
    function interactInfo() {
      const p = S.player;
      if (p.dead) return null;
      const st = story.currentStep();
      // contract interact step
      if (st && st.kind === 'interact' && dist(p, st) < 9 && p.mode === 'foot') return { label: st.label, act: 'step' };
      if (st && st.kind === 'combat') return null;
      // Mara: accept or search cut
      if (dist(p, D.SITES.mara) < 5) {
        if (S.wanted.episode) return { label: `Search cut at Mara — $${D.PRICES.searchCut} (halves the search)`, act: 'searchcut' };
        if (story.active === null && story.done < 6) return { label: `Accept contract ${story.done + 1}: ${D.CONTRACTS[story.done].title}`, act: 'accept' };
        return { label: 'Mara has nothing new right now', act: null };
      }
      // robbery
      for (let i = 0; i < D.ROBBERY_SHOPS.length; i++) {
        if (dist(p, D.ROBBERY_SHOPS[i]) < 5 && p.mode === 'foot') {
          if (S.robbery[i].cd > 0) return { label: `This shop is lying low (${Math.ceil(S.robbery[i].cd)}s)`, act: null };
          return { label: 'Hold E to rob the register (4s)', act: 'rob:' + i };
        }
      }
      // chop shop
      if (dist(p, D.SITES.chop) < 11 && p.carId >= 0) {
        const car = currentCar();
        if (D.chopEligible(car)) return { label: `Chop the ${car.type} — $${D.CHOP_PAY[car.type]}`, act: 'chop' };
        return { label: 'Chop shop takes stolen civilian cars only', act: null };
      }
      // fuel
      for (const f of D.FUEL_STATIONS) {
        if (dist(p, f) < 9 && p.carId >= 0) {
          const car = currentCar();
          if (car && car.fuel < 99) return { label: `Refuel (${car.fuel.toFixed(0)}%) — $1/unit, district discount applies`, act: 'fuel' };
        }
      }
      // races / coast
      if (p.carId >= 0 && !S.race && !S.coast && story.active === null && S.taxi.phase !== 'fare') {
        for (const r of D.RACES) if (dist(p, r.start) < 10) return { label: `Start race: ${r.name} — beat the crimson rival (par ${D.racePar([r.start, ...r.gates]).toFixed(0)}s)`, act: 'race:' + r.name };
        if (dist(p, D.SITES.trial) < 10) return { label: 'Start the Coast Run time trial (+$350)', act: 'coast' };
      }
      // garage repair
      if (dist(p, D.SITES.nico) < 9) {
        const car = currentCar() || nearestOwnCar(16);
        if (car && car.hp < 100) return { label: `Full repair at Nico's — $${priceHere(D.PRICES.repair, D.SITES.nico)}`, act: 'repair' };
        return { label: 'Nico\'s garage — cars are healthy', act: null };
      }
      // clinic
      if (dist(p, D.SITES.clinic) < 6 && p.mode === 'foot') return { label: 'Clinic + Supplies (E opens the counter)', act: 'clinic' };
      // home rest
      if (dist(p, D.SITES.home) < 6 && p.mode === 'foot') {
        if (S.wanted.episode) return { label: 'Too hot to rest while wanted', act: null };
        return { label: 'Rest at home (heal + save)', act: 'rest' };
      }
      // crew abilities
      if (p.carId >= 0 && p.mode !== 'foot') {
        const car = currentCar();
        if (car && car.hp > 0 && car.hp < 100 && Math.abs(car.speed) < 0.5 && S.cooldowns.quickFix <= 0)
          return { label: `Nico quick fix — $${D.PRICES.quickFix} for +40 hp (hold still 2s)`, act: 'quickfix' };
      }
      if (p.mode === 'foot' && S.wanted.episode && S.cooldowns.cleanPlate <= 0) {
        const own = nearestOwnCar(3.5);
        if (own && !S.wanted.seen) return { label: 'Fit a clean plate (3s, unseen) — drops one star', act: 'cleanplate' };
      }
      return null;
    }
    function priceHere(base, site) {
      return D.priceWithDiscount(base, D.districtAt(site.x, site.z), S.standing);
    }
    function nearestOwnCar(range) {
      const p = S.player;
      let best = null, bd = range * range;
      for (const c of S.cars) {
        if (c.gone || !(c.owned || c.id === p.carId)) continue;
        const d2 = dist2(p, c);
        if (d2 < bd) { bd = d2; best = c; }
      }
      return best;
    }
    function tryInteract() {
      const info = interactInfo();
      if (!info || !info.act) return;
      const p = S.player;
      const act = info.act;
      if (act === 'accept') {
        if (story.accept()) {
          const c = story.contract();
          emit({ k: 'dialogue', lines: c.start, title: `${c.id < 10 ? '0' + c.id : c.id} / ${c.title} — $${c.reward}` });
          emit({ k: 'brief', txt: c.brief });
          setupStep();
          saveGame();
        }
      } else if (act === 'step') {
        const st = story.currentStep();
        if (st && st.heat) { // transmitter: raise heat ~2 stars
          const cur = stars();
          const target = Math.min(5, cur + 2);
          if (target > 0) S.wanted.ledger = Math.max(S.wanted.ledger, [0, 1, 3, 6, 9, 12][target]);
          S.wanted.episode = true; S.wanted.search = 1;
          toast('Transmitter dead — and every cop in the district heard it.');
        }
        advanceStory();
      } else if (act === 'searchcut') {
        if (p.money >= D.PRICES.searchCut) { p.money -= D.PRICES.searchCut; S.wanted.search *= 0.5; toast('Search cut in half.'); emit({ k: 'sfx', name: 'cash' }); }
        else toast('Not enough cash.');
      } else if (act.startsWith('rob:')) {
        S.robHold = { shop: Number(act.split(':')[1]), t: 0 };
      } else if (act === 'chop') {
        const car = currentCar();
        const pay = D.CHOP_PAY[car.type];
        p.money += pay; S.stats.earned += pay;
        S.standing['PORT SOL'] = Math.min(100, S.standing['PORT SOL'] + 3);
        car.gone = true; p.mode = 'foot'; p.carId = -1;
        p.x = D.SITES.chop.x + 3; p.z = D.SITES.chop.z;
        toast(`Chopped for $${pay}. Port Sol standing +3.`);
        emit({ k: 'sfx', name: 'cash' });
      } else if (act === 'fuel') {
        const car = currentCar();
        const station = D.FUEL_STATIONS.find(f => dist(p, f) < 9);
        // $1 per unit before the district discount; the discounted unit price
        // may be fractional, so the charge is rounded up to whole dollars.
        const unit = D.priceWithDiscount(100, D.districtAt(station.x, station.z), S.standing) / 100;
        const space = 100 - car.fuel;
        const afford = unit > 0 ? Math.floor(p.money / unit) : 0;
        const units = Math.min(space, afford);
        const charge = Math.ceil(units * unit);
        car.fuel += units;
        p.money -= charge;
        toast(units > 0 ? `Fuel +${units.toFixed(0)} units — $${charge}.` : 'No cash for fuel.');
        emit({ k: 'sfx', name: 'cash' });
      } else if (act === 'repair') {
        const car = currentCar() || nearestOwnCar(16);
        const cost = priceHere(D.PRICES.repair, D.SITES.nico);
        if (car && p.money >= cost) { p.money -= cost; car.hp = 100; car.disabled = false; toast(`Repaired to full — $${cost}.`); emit({ k: 'sfx', name: 'repair' }); saveGame(); }
        else toast('Not enough cash for the repair.');
      } else if (act === 'clinic') {
        emit({ k: 'clinic' });
      } else if (act === 'rest') {
        p.hp = 100; p.armour = Math.max(p.armour, 40);
        toast('Rested. Progress saved.');
        saveGame();
      } else if (act === 'quickfix') {
        S.channel = { kind: 'quickfix', t: 0, need: 2 };
      } else if (act === 'cleanplate') {
        const own = nearestOwnCar(3.5);
        if (own) S.channel = { kind: 'cleanplate', t: 0, need: 3, carId: own.id };
      } else if (act.startsWith('race:')) {
        const name = act.slice(5);
        const r = D.RACES.find(q => q.name === name);
        S.race = { name, gates: r.gates, start: r.start, next: 0, time: 0, par: D.racePar([r.start, ...r.gates]) };
        S.race.rival = spawnRival(S.race);
        S.raceResult = null;
        toast(`${name} — beat the crimson rival to every gate. Par ${S.race.par.toFixed(0)}s.`);
      } else if (act === 'coast') {
        S.coast = { next: 0, time: 0 };
        toast('Coast Run — nine gates around the island. +$350 at the finish.');
      }
    }
    function buyClinic(kind) {
      const p = S.player;
      const cost = priceHere(D.PRICES[kind], D.SITES.clinic);
      if (p.money < cost) { toast('Not enough cash.'); return false; }
      if (kind === 'heal') { if (p.hp >= 100) return false; p.hp = 100; }
      else if (kind === 'armour') { if (p.armour >= 100) return false; p.armour = 100; }
      else if (kind === 'ammo') { p.ammo += 48; }
      p.money -= cost;
      emit({ k: 'sfx', name: 'cash' });
      saveGame();
      return true;
    }

    // ---------- death outcomes ----------
    function rescue() {
      const p = S.player;
      if (!p.dead || p.money < D.PRICES.rescue) return false;
      p.money -= D.PRICES.rescue;
      p.hp = 65; p.dead = false;
      S.wanted.episode = false; S.wanted.ledger = 0; S.wanted.heatFloor = 0;
      toast('The medics patch you up on the spot. −$100, wanted cleared.');
      return true;
    }
    function respawn() {
      const p = S.player;
      p.money -= D.PRICES.respawn;
      p.hp = 100; p.armour = 20; p.dead = false;
      p.mode = 'foot'; p.carId = -1; p.boatId = -1;
      p.x = D.SITES.clinic.x; p.z = D.SITES.clinic.z;
      S.wanted.episode = false; S.wanted.ledger = 0; S.wanted.heatFloor = 0;
      toast('You wake at the clinic. −$100, wanted cleared.');
      return true;
    }

    // ---------- save / load ----------
    function playerCarForSave() {
      const p = S.player;
      let car = currentCar();
      if (!car) car = S.cars.find(c => c.owned && !c.gone) || null;
      if (!car) return null;
      return { id: car.id, type: car.type, x: car.x, z: car.z, ang: car.ang, hp: car.hp, color: car.color, mission: car.mission, owned: car.owned, stolen: car.stolen, driving: p.carId === car.id, fuel: car.fuel };
    }
    function saveGame() {
      const p = S.player;
      const snap = D.defaultSave();
      snap.player = { x: p.x, z: p.z, hp: p.hp, armour: p.armour, ammo: p.ammo, clip: p.clip, money: p.money, weapon: p.weapon };
      snap.car = playerCarForSave();
      snap.contractsDone = story.done;
      snap.clock = S.hours; snap.day = S.day;
      snap.weather = { storm: S.weather.storm, intensity: S.weather.intensity, phasesLeft: S.weather.phasesLeft };
      snap.standing = { ...S.standing };
      snap.shells = [...S.shellsGot];
      snap.races = S.raceRecords;
      snap.coastBest = S.coastBest;
      snap.cooldowns = { quickFix: S.cooldowns.quickFix, cleanPlate: S.cooldowns.cleanPlate };
      snap.stats = { ...S.stats };
      snap.settings = { ...S.settings };
      try {
        localStorage.setItem(D.SAVE_KEY, D.saveSnapshot(snap));
        S.storageOk = true;
      } catch { S.storageOk = false; }
      return S.storageOk;
    }
    function applySave(snap) {
      if (!snap) return false;
      const p = S.player;
      Object.assign(p, { x: snap.player.x, z: snap.player.z, hp: snap.player.hp, armour: snap.player.armour, ammo: snap.player.ammo, clip: snap.player.clip, money: snap.player.money, weapon: snap.player.weapon });
      story.done = snap.contractsDone;
      story.active = null; story.step = 0;
      S.hours = snap.clock; S.day = snap.day;
      S.phase = (S.hours >= 6 && S.hours < 18.5) ? 'day' : 'night';
      S.weather.storm = snap.weather.storm; S.weather.intensity = snap.weather.intensity; S.weather.phasesLeft = snap.weather.phasesLeft;
      S.stormI = snap.weather.intensity;
      S.standing = { ...snap.standing };
      S.shellsGot = new Set(snap.shells);
      S.raceRecords = snap.races || {};
      S.coastBest = snap.coastBest || 0;
      S.cooldowns.quickFix = snap.cooldowns.quickFix || 0;
      S.cooldowns.cleanPlate = snap.cooldowns.cleanPlate || 0;
      S.stats = { ...snap.stats };
      S.settings = { ...snap.settings };
      if (snap.car) {
        const car = S.cars.find(c => c.id === snap.car.id);
        if (car) {
          Object.assign(car, { x: snap.car.x, z: snap.car.z, ang: snap.car.ang, hp: snap.car.hp, mission: snap.car.mission, owned: snap.car.owned, stolen: snap.car.stolen, fuel: snap.car.fuel, parked: !snap.car.driving, driver: false });
          if (snap.car.driving) { p.mode = car.type === 'bike' ? 'bike' : 'car'; p.carId = car.id; p.x = car.x; p.z = car.z; }
        }
      }
      for (const i of S.shellsGot) emit({ k: 'shellhide', i });
      return true;
    }
    function loadGame() {
      try {
        const raw = localStorage.getItem(D.SAVE_KEY);
        if (!raw) return false;
        return applySave(D.loadSnapshot(raw));
      } catch { S.storageOk = false; return false; }
    }
    function setBoats(boats) { S.boats = boats; }
  }

  return { createSim };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = SLS;
