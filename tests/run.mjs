// Headless test suite for Saltline: Vice Heat — node, no browser.
// Run: node tests/run.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const D = require('../game/src/data.js');
const SLS = require('../game/src/sim.js');

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } }
function eq(a, b, name) { ok(a === b, `${name} (got ${a}, want ${b})`); }

// ---- city generation & determinism ----
const c1 = D.genCity(D.SEED), c2 = D.genCity(D.SEED);
const h1 = D.cityFingerprint(c1), h2 = D.cityFingerprint(c2);
eq(h1, h2, 'city hash deterministic across two generations');
eq(c1.buildings.length, 131, 'buildings = 131');
eq(c1.lamps.length, 98, 'lamps = 98');
eq(c1.blocks.length, 36, 'blocks = 36');
ok(c1.palms.length >= 108 && c1.palms.length <= 144, `palms in 108..144 (got ${c1.palms.length})`);
ok(c1.demolished && Math.abs(c1.demolished.x - 170) < 34 && Math.abs(c1.demolished.z - 42) < 34, 'demolished building near (170,42)');
ok(c1.buildings.every(b => b.x >= -192 && b.x <= 214 && b.z >= -192 && b.z <= 214), 'buildings inside grid');
ok(c1.buildings.filter(b => b.kind === 'tower').every(b => b.h >= 27 && b.h <= 78), 'tower heights 27..78');
ok(c1.buildings.filter(b => b.kind === 'warehouse').every(b => b.h >= 7 && b.h <= 13), 'warehouse heights 7..13');
ok(c1.buildings.every(b => b.winFrac >= 0.18 && b.winFrac <= 0.40), 'window lit fraction 18..40%');
console.log('city hash:', h1);

// ---- population & vehicles ----
const peds = D.genPeds(D.SEED + 1);
eq(peds.length, 720, 'pedestrians = 720');
const veh = D.genVehicles(D.SEED + 2);
eq(veh.cars.length, 78, 'vehicles = 78');
eq(veh.cars.filter(c => c.driver).length, 62, 'drivers = 62');
eq(veh.cars.filter(c => c.parked).length, 16, 'parked = 16');
eq(veh.bikes.length, 3, 'parked bikes = 3');
eq(veh.cars.filter(c => c.bike).length, 7, 'circulating bikes = 7');
eq(veh.cars[0].owned, true, 'car 0 owned');
eq(veh.cars[1].mission, true, 'car 1 is the mission coupe');
eq(veh.cars.filter(c => c.inLot).length, 5, '5 parked cars relocated to lot bays');
const p0 = D.pedPos(peds[0]);
ok(Number.isFinite(p0.x) && Number.isFinite(p0.z), 'pedPos finite');

// ---- district lookup ----
eq(D.districtAt(200, 0), 'SUNSTRAND BEACH', 'district sunstrand');
eq(D.districtAt(0, 150), 'PORT SOL', 'district port sol');
eq(D.districtAt(-150, 0), 'LITTLE PALM', 'district little palm');
eq(D.districtAt(0, -150), 'GLASS DISTRICT', 'district glass');
eq(D.districtAt(100, 0), 'CORAL HEIGHTS', 'district coral');
eq(D.districtAt(0, 0), 'OLD QUARTER', 'district old quarter');
eq(D.districtAt(176, 200), 'SUNSTRAND BEACH', 'district order: beach beats port');

// ---- wanted / stars math ----
eq(D.starsFromCasualties(0), 0, 'stars 0');
eq(D.starsFromCasualties(1), 1, 'stars 1 @1');
eq(D.starsFromCasualties(2), 1, 'stars 1 @2');
eq(D.starsFromCasualties(3), 2, 'stars 2 @3');
eq(D.starsFromCasualties(6), 3, 'stars 3 @6');
eq(D.starsFromCasualties(9), 4, 'stars 4 @9');
eq(D.starsFromCasualties(12), 5, 'stars 5 @12');
eq(D.starsFromCasualties(30), 5, 'stars cap 5');
eq(D.DISPATCH_FOOT[5], 6, 'foot cap @5 stars');
eq(D.DISPATCH_CAR[3], 4, 'car cap @3 stars');
ok(Math.abs(D.searchDecayRate(0, 10) - 1 / 12) < 1e-9, 'search decay base');
ok(D.searchDecayRate(2, 60) > D.searchDecayRate(2, 10), 'standing >=50 decays 25% faster');
eq(D.ledgerBelowBand(5), 11, 'clean plate 5->11');
eq(D.ledgerBelowBand(2), 2, 'clean plate 2->2');
eq(D.ledgerBelowBand(4), 8, 'clean plate 4->8');

// ---- standing math ----
eq(D.tierOf(10).name, 'Stranger', 'tier stranger');
eq(D.tierOf(25).name, 'Known', 'tier known');
eq(D.tierOf(50).name, 'Respected', 'tier respected');
eq(D.tierOf(75).name, 'Family', 'tier family');
eq(D.tierOf(75).discount, 0.20, 'family discount 20%');
const st = { 'OLD QUARTER': 80 };
eq(D.priceWithDiscount(100, 'OLD QUARTER', st), 80, 'discounted repair $80');
eq(D.priceWithDiscount(100, 'PORT SOL', st), 100, 'no discount at standing 10');

// ---- mission flow: all 6 contracts completable in simulation ----
{
  const s = D.createStory();
  let total = 0;
  for (let i = 0; i < 6; i++) {
    ok(s.accept(), `contract ${i + 1} accepts`);
    const c = s.contract();
    let guard = 0, r = null;
    while (guard++ < 12) {
      r = s.advance();
      if (typeof r === 'string' && r.startsWith('complete:')) break;
    }
    ok(r !== null && String(r).startsWith('complete:'), `contract ${i + 1} completes`);
    total += Number(String(r).split(':')[1]);
    eq(s.done, i + 1, `done count ${i + 1}`);
  }
  eq(total, 6500, 'total contract rewards = $6500');
  eq(s.accept(), false, 'no 7th contract');
  // chapter boundaries
  ok(D.chapterOf(1) === 0 && D.chapterOf(3) === 1 && D.chapterOf(5) === 2, 'chapter completion indices');
  ok(D.chapterOf(0) === -1 && D.chapterOf(2) === -1, 'non-chapter completions');
  // timed contract 5 timeout path
  const s2 = D.createStory();
  s2.done = 4; s2.accept(); s2.advance(); // first pickup starts timer
  ok(s2.timerStarted, 'contract 5 timer starts on first advance');
  let res = null; for (let t = 0; t < 200; t++) res = s2.tick(1) || res;
  eq(res, 'timeout', 'contract 5 times out');
  eq(s2.active, null, 'timeout resets contract');
}

// ---- fuel ----
{
  const car = { fuel: 100 };
  let f = car.fuel;
  for (let t = 0; t < 1200; t++) f = D.fuelBurn({ fuel: f }, 1, 29, 1); // 20 min full throttle
  ok(f > 0, `fuel lasts >20 min full throttle (left ${f.toFixed(1)})`);
  const idle = D.fuelBurn({ fuel: 50 }, 0, 0, 10);
  ok(idle <= 50 && idle > 49.9, 'idling burns ~nothing');
}

// ---- weather state machine ----
{
  const rng = D.stream(1234);
  const w = D.genWeather(99);
  let starts = 0, ends = 0;
  for (let i = 0; i < 400; i++) {
    const r = D.weatherPhaseBoundary(w, rng);
    if (r === 'start') { starts++; ok(w.phasesLeft >= 1 && w.phasesLeft <= 4, 'storm duration 1..4 phases'); }
    if (r === 'end') ends++;
    ok(w.storm || w.target === 0, 'storm flag consistent');
  }
  ok(starts > 20, `storms occur over 400 boundaries (got ${starts})`);
  eq(starts, ends + (w.storm ? 1 : 0), 'every started storm ends');
}

// ---- activities math ----
{
  const len = D.roadRouteLength(D.TAXI_SPOTS[0], D.TAXI_SPOTS[3]);
  ok(len > 0, 'taxi route length positive');
  eq(D.taxiFare(0), 40, 'fare floor $40');
  eq(D.taxiFare(10000), 90, 'fare cap $90');
  ok(Math.abs(D.taxiFare(len) - Math.min(90, Math.max(40, 40 + len * 0.09))) < 1e-9, 'fare formula');
  ok(D.taxiTimeLimit(len) > 25, 'time limit formula');
  const dest = D.taxiDestination(0, 0);
  ok(D.districtAt(D.TAXI_SPOTS[dest].x, D.TAXI_SPOTS[dest].z) !== D.districtAt(D.TAXI_SPOTS[0].x, D.TAXI_SPOTS[0].z), 'taxi destination is another district');
  eq(D.SHELLS.length, 20, 'shells = 20');
  for (let s = 0; s < 4; s++) for (let n = 0; n < 6; n++) {
    const p = D.robberyPay(s, n);
    ok(p >= 120 && p <= 200, `robbery pay in 120..200 (got ${p})`);
  }
  eq(D.robberyPay(2, 3), D.robberyPay(2, 3), 'robbery pay deterministic');
  ok(D.chopEligible({ type: 'sedan', stolen: true, owned: false, mission: false }), 'chop: stolen sedan eligible');
  ok(!D.chopEligible({ type: 'sedan', stolen: false, owned: false, mission: false }), 'chop: unstolen refused');
  ok(!D.chopEligible({ type: 'bike', stolen: true }), 'chop: bike refused');
  ok(!D.chopEligible({ type: 'sport', stolen: true, mission: true }), 'chop: mission car refused');
  ok(!D.chopEligible({ type: 'sedan', stolen: true, police: true }), 'chop: police refused');
  eq(D.CHOP_PAY.sport, 180, 'chop sport $180');
  const par = D.racePar(D.RACES[0].gates);
  ok(par > 20 && par < 120, `race par sane (${par.toFixed(1)}s)`);
  eq(D.COAST_RUN.gates.length, 9, 'coast run 9 gates');
  eq(D.COAST_RUN.prize, 350, 'coast run prize $350');
}

// ---- save / restore round-trip ----
{
  const s = D.defaultSave();
  s.player.money = 1234; s.contractsDone = 3; s.shells = [0, 4, 9];
  s.standing['PORT SOL'] = 55; s.stats.contracts = 3; s.weather.storm = true; s.weather.phasesLeft = 2;
  const back = D.loadSnapshot(D.saveSnapshot(s));
  ok(back !== null, 'save parses back');
  eq(back.player.money, 1234, 'money round-trips');
  eq(back.contractsDone, 3, 'contracts round-trip');
  eq(back.shells.length, 3, 'shells round-trip');
  eq(back.standing['PORT SOL'], 55, 'standing round-trips');
  eq(back.weather.storm, true, 'weather round-trips');
  eq(D.loadSnapshot('not json'), null, 'garbage save refused');
  eq(D.loadSnapshot(null), null, 'missing save refused');
  eq(D.SAVE_KEY, 'saltline-save-v1', 'save key rebranded');
}

// ---- full-sim headless scenarios (sim.js end to end) ----
const IN = (over = {}) => ({
  moveX: 0, moveZ: 0, sprint: false, fire: false, handbrake: false,
  enterPressed: false, interactPressed: false, reloadPressed: false,
  weaponPressed: false, jumpPressed: false, interactHeld: false, ...over,
});
function mkSim() { const s = SLS.createSim(D); s.buildEntities(() => {}); return s; }
function run(sim, seconds, input) { const n = Math.round(seconds * 60); for (let i = 0; i < n; i++) sim.step(1 / 60, input); }

// boot + stability: 20 s of neutral input, nothing may go non-finite
{
  const sim = mkSim(); const S = sim.S;
  run(sim, 20, IN());
  ok(Math.abs(S.t - 20) < 0.01, 'sim clock advances');
  ok(S.cars.every(c => Number.isFinite(c.x) && Number.isFinite(c.z)), 'car positions finite after 20 s');
  ok(S.peds.every(pd => Number.isFinite(pd.x) && Number.isFinite(pd.z)), 'ped positions finite after 20 s');
  ok(S.cars.some(c => c.driver && (c.x !== 0 || c.z !== 0)), 'traffic is moving');
  eq(S.lightPhase, Math.floor(S.t / 9) % 2, 'light phase published');
}

// determinism: two fresh sims stepped identically keep the same city + player
{
  const a = mkSim(), b = mkSim();
  for (let i = 0; i < 300; i++) { a.step(1 / 60, IN()); b.step(1 / 60, IN()); }
  eq(a.S.player.x, b.S.player.x, 'twin sims: player x agrees');
  eq(a.S.player.z, b.S.player.z, 'twin sims: player z agrees');
  eq(D.cityFingerprint(D.genCity(D.SEED)), h1, 'city fingerprint unchanged');
}

// taxi, end to end: pickup at the spot, passenger tracked in the cab, paid at destination
{
  const sim = mkSim(); const S = sim.S; const p = S.player;
  const car = S.cars[0];
  const spot = D.TAXI_SPOTS[S.taxi.spot];
  car.x = spot.x; car.z = spot.z; car.speed = 0; car.parked = false;
  p.mode = 'car'; p.carId = 0; p.x = car.x; p.z = car.z;
  run(sim, 0.25, IN());
  eq(S.taxi.phase, 'fare', 'taxi: fare starts at the spot');
  eq(S.taxi.carId, 0, 'taxi: the cab is tracked while the fare runs');
  ok(S.taxi.fare >= 40 && S.taxi.fare <= 90, 'taxi: fare on the meter in range');
  const dest = D.TAXI_SPOTS[S.taxi.dest];
  const money0 = p.money;
  car.x = dest.x; car.z = dest.z; car.speed = 0; p.x = car.x; p.z = car.z;
  run(sim, 0.25, IN());
  eq(S.taxi.phase, 'wait', 'taxi: fare completes at the destination');
  ok(p.money > money0, 'taxi: passenger pays');
  eq(S.taxi.carId, -1, 'taxi: cab released after the fare');
}

// robbery: the register only empties while E is physically held for 4 s
{
  const sim = mkSim(); const S = sim.S; const p = S.player;
  const shop = D.ROBBERY_SHOPS[0];
  p.x = shop.x; p.z = shop.z; p.mode = 'foot';
  sim.step(1 / 60, IN({ interactPressed: true, interactHeld: true }));
  ok(S.robHold !== null, 'robbery: channel starts on the E press');
  run(sim, 3.5, IN({ interactHeld: true }));
  eq(S.robbery[0].count, 0, 'robbery: not paid before the 4 s hold completes');
  run(sim, 1.0, IN({ interactHeld: true }));
  eq(S.robbery[0].count, 1, 'robbery: pays after a full 4 s hold');
  ok(S.wanted.ledger >= 3, 'robbery: heat jumps to two stars');
  // releasing E mid-channel cancels it for good
  const sim2 = mkSim(); const S2 = sim2.S; const p2 = S2.player;
  p2.x = shop.x; p2.z = shop.z; p2.mode = 'foot';
  sim2.step(1 / 60, IN({ interactPressed: true, interactHeld: true }));
  run(sim2, 2, IN({ interactHeld: true }));
  ok(S2.robHold !== null, 'robbery: channel alive mid-hold');
  sim2.step(1 / 60, IN({ interactHeld: false }));
  eq(S2.robHold, null, 'robbery: releasing E cancels the channel');
  run(sim2, 3, IN({ interactHeld: false }));
  eq(S2.robbery[0].count, 0, 'robbery: a cancelled channel never pays');
}

// traffic: a driver approaching a red light stops at the line
{
  const sim = mkSim(); const S = sim.S;
  let guard = 0;
  while (S.lightPhase !== 1 && guard++ < 2000) sim.step(1 / 60, IN());
  eq(S.lightPhase, 1, 'traffic: light phase flips (NS red)');
  const car = S.cars.find(c => c.driver && c.type === 'sedan');
  car.axis = 'NS'; car.road = 3; car.dir = 1; car.along = 48; car.speed = 12;
  car.x = D.ROADS[3] + 3.4; car.z = 48;
  run(sim, 1.2, IN());
  ok(car.along < 60, `traffic: car held at the red line (along ${car.along.toFixed(1)} of 64)`);
  ok(car.speed < 4, 'traffic: car nearly stopped at red');
}

// police escalation at five stars: cars dispatched, helis follow, a roadblock is set
{
  const sim = mkSim(); const S = sim.S; const p = S.player;
  const car = S.cars[0];
  car.x = 0; car.z = 0; car.ang = 0; car.parked = false; car.speed = 8;
  p.mode = 'car'; p.carId = 0; p.x = 0; p.z = 0; p.ang = 0;
  S.wanted.ledger = 12; S.wanted.episode = true; S.wanted.search = 1;
  run(sim, 10, IN({ moveZ: 1 }));
  eq(sim.stars(), 5, 'police: five stars at ledger 12');
  ok(S.policeCars.some(u => u.active), 'police: pursuit cars dispatched');
  ok(S.helis.filter(h => h.mode === 'follow').length >= 2, 'police: helicopters follow at 5 stars');
  ok(S.blocksSet >= 1, 'police: a roadblock was set ahead of the player');
  // and at two stars no roadblock ever forms
  const sim2 = mkSim(); const S2 = sim2.S; const p2 = S2.player;
  const car2 = S2.cars[0];
  car2.x = 0; car2.z = 0; car2.parked = false;
  p2.mode = 'car'; p2.carId = 0; p2.x = 0; p2.z = 0;
  S2.wanted.ledger = 3; S2.wanted.episode = true; S2.wanted.search = 1;
  run(sim2, 3, IN());
  eq(S2.blocksSet, 0, 'police: no roadblocks below four stars');
}

// ---- street races: the crimson rival ----
{
  // starting a race spawns the rival on the grid at gate zero
  const sim = mkSim(); const S = sim.S;
  const car = S.cars[0];
  car.x = D.RACES[0].start.x; car.z = D.RACES[0].start.z;
  S.player.carId = 0; S.player.mode = 'car';
  S.player.x = car.x; S.player.z = car.z;
  sim.step(1 / 60, IN({ interactPressed: true }));
  ok(S.race && S.race.rival, 'starting a race spawns the rival');
  eq(S.race.rival.next, 0, 'rival begins at gate zero');
  ok(Number.isFinite(S.race.rival.x) && Number.isFinite(S.race.rival.z), 'rival holds a finite grid position');
  // leave the player parked: the rival still runs the whole route and wins
  run(sim, 60, IN());
  eq(S.race, null, 'a rival win ends the race');
  ok(S.raceResult && S.raceResult.win === false && S.raceResult.name === 'Avenida Sprint', 'parked player loses the Avenida Sprint to the rival');
}
{
  // crossing every gate before the rival pays the winner's purse
  const sim = mkSim(); const S = sim.S;
  const car = S.cars[1];
  car.x = D.RACES[0].start.x; car.z = D.RACES[0].start.z;
  S.player.carId = 1; S.player.mode = 'car';
  S.player.x = car.x; S.player.z = car.z;
  sim.step(1 / 60, IN({ interactPressed: true }));
  ok(S.race, 'race running for the player-win run');
  const before = S.player.money;
  for (const g of D.RACES[0].gates) {
    car.x = g.x; car.z = g.z; car.speed = 0;
    sim.step(1 / 60, IN());
  }
  eq(S.race, null, 'crossing the last gate first ends the race');
  ok(S.raceResult && S.raceResult.win === true, 'player win is recorded');
  eq(S.player.money, before + 150, 'first win over the rival pays $150');
  eq((S.raceRecords['Avenida Sprint'] || {}).wins, 1, 'the win lands in the race records');
}
{
  // the rival's line is deterministic and it takes Port Run gates too
  const simA = mkSim(), simB = mkSim();
  for (const sim of [simA, simB]) {
    const S = sim.S;
    S.cars[0].x = D.RACES[1].start.x; S.cars[0].z = D.RACES[1].start.z;
    S.player.carId = 0; S.player.mode = 'car';
    S.player.x = S.cars[0].x; S.player.z = S.cars[0].z;
    sim.step(1 / 60, IN({ interactPressed: true }));
  }
  for (let i = 0; i < 600; i++) { simA.step(1 / 60, IN()); simB.step(1 / 60, IN()); }
  const A = simA.S, B = simB.S;
  ok(A.race && B.race, 'Port Run still running in both sims');
  eq(A.race.rival.x, B.race.rival.x, 'rival line is deterministic (x)');
  eq(A.race.rival.z, B.race.rival.z, 'rival line is deterministic (z)');
  ok(A.race.rival.next >= 1, 'rival has taken at least one Port Run gate');
}

// ---- fleet variety ----
{
  const types = new Set(mkSim().S.cars.map(c => c.type));
  ok(types.has('pickup'), 'the fleet includes pickups');
  ok(types.has('compact'), 'the fleet includes compact hatchbacks');
  ok(D.VEHICLE_STATS.pickup.top > 0 && D.VEHICLE_STATS.compact.top > 0, 'new types carry driving stats');
  ok(D.CHOP_PAY.pickup > 0 && D.CHOP_PAY.compact > 0, 'the chop shop prices the new types');
}

// ---- round 4: contract 1 pickup is vehicle-locked ----
{
  const sim = mkSim(); const S = sim.S; const p = S.player;
  p.x = D.SITES.mara.x; p.z = D.SITES.mara.z; p.mode = 'foot';
  sim.step(1 / 60, IN({ interactPressed: true }));
  eq(S.story.active, 0, 'veh: contract 1 accepted');
  eq(S.story.currentStep().kind, 'collect', 'veh: first step is the pickup');
  // on foot at the crate: nothing happens
  p.x = -115; p.z = 13; p.speedNow = 0;
  run(sim, 0.5, IN());
  eq(S.story.currentStep().kind, 'collect', 'veh: on foot at the crate does not complete it');
  // in a sedan at the crate: still nothing (cars rest on the road edge at
  // x=-121, 6 units from the marker — inside the 7-unit completion ring)
  const sedan = S.cars.find(c => c.type === 'sedan' && c.id !== 0);
  sedan.x = -121; sedan.z = 13; sedan.speed = 0; sedan.parked = false; sedan.driver = false;
  p.mode = 'car'; p.carId = sedan.id; p.x = sedan.x; p.z = sedan.z;
  run(sim, 0.5, IN());
  eq(S.story.currentStep().kind, 'collect', 'veh: a sedan at the crate does not complete it');
  // in a pickup: the crate fits, the step completes
  const pk = S.cars.find(c => c.type === 'pickup');
  pk.x = -121; pk.z = 13; pk.speed = 0; pk.parked = false; pk.driver = false;
  p.carId = pk.id; p.x = pk.x; p.z = pk.z;
  run(sim, 0.5, IN());
  eq(S.story.currentStep().kind, 'deliver', 'veh: arriving in a pickup completes the pickup');
}

// ---- round 4: contract 3 ends with a boat leg through sea gates ----
{
  const sim = mkSim(); const S = sim.S; const p = S.player;
  S.story.done = 2;
  p.x = D.SITES.mara.x; p.z = D.SITES.mara.z; p.mode = 'foot';
  sim.step(1 / 60, IN({ interactPressed: true }));
  eq(S.story.active, 2, 'boat: contract 3 accepted');
  S.guards.forEach(g => { g.down = true; });
  run(sim, 0.25, IN());
  eq(S.story.currentStep().kind, 'collect', 'boat: guards down advances to the drive pickup');
  p.x = 141; p.z = 177;
  run(sim, 0.25, IN());
  eq(S.story.currentStep().kind, 'boat', 'boat: the drive pickup opens the boat leg');
  sim.setBoats([{ x: 266, z: 88, ang: 0, speed: 0 }]);
  p.mode = 'boat'; p.boatId = 0; p.x = 266; p.z = 88;
  run(sim, 0.25, IN());
  eq(S.storyGate, 1, 'boat: first sea gate cleared');
  S.boats[0].x = 266; S.boats[0].z = 58;
  run(sim, 0.25, IN());
  eq(S.storyGate, 2, 'boat: second sea gate cleared');
  const money0 = p.money;
  S.boats[0].x = 250; S.boats[0].z = 44;
  run(sim, 0.25, IN());
  eq(S.story.done, 3, 'boat: reaching the pier completes contract 3');
  eq(p.money, money0 + 950, 'boat: contract 3 pays $950');
}

// ---- round 4: contract 4 is a timed escape with forced heat ----
{
  const sim = mkSim(); const S = sim.S; const p = S.player;
  S.story.done = 3;
  p.x = D.SITES.mara.x; p.z = D.SITES.mara.z; p.mode = 'foot';
  sim.step(1 / 60, IN({ interactPressed: true }));
  eq(S.story.active, 3, 'flee: contract 4 accepted');
  eq(sim.stars(), 2, 'flee: two stars are forced from the moment the job is taken');
  p.x = 77; p.z = -115;
  sim.step(1 / 60, IN({ interactPressed: true }));
  eq(S.story.currentStep().kind, 'flee', 'flee: killing the transmitter opens the escape');
  ok(S.story.timerStarted, 'flee: the lockout timer starts with the transmitter');
  const money0 = p.money;
  p.x = 13; p.z = 77; p.speedNow = 0;
  run(sim, 0.25, IN());
  eq(S.story.done, 4, 'flee: reaching the safehouse completes contract 4');
  eq(p.money, money0 + 1100, 'flee: contract 4 pays $1100');
  eq(S.wanted.heatFloor, 0, 'flee: the safehouse burns the forced heat');
}
{
  // timing out fails the contract but never locks it: Mara offers it again
  const sim = mkSim(); const S = sim.S; const p = S.player;
  S.story.done = 3;
  p.x = D.SITES.mara.x; p.z = D.SITES.mara.z; p.mode = 'foot';
  sim.step(1 / 60, IN({ interactPressed: true }));
  p.x = 77; p.z = -115;
  sim.step(1 / 60, IN({ interactPressed: true }));
  p.hp = 1e6; p.armour = 100; // outlast the escort, watch the clock instead
  run(sim, 92, IN());
  eq(S.story.active, null, 'flee: the lockout expiring fails the contract');
  eq(S.story.done, 3, 'flee: a failed escape keeps progress at 3 contracts');
  S.wanted.episode = false; S.wanted.ledger = 0; S.wanted.heatFloor = 0;
  p.x = D.SITES.mara.x; p.z = D.SITES.mara.z;
  sim.step(1 / 60, IN({ interactPressed: true }));
  eq(S.story.active, 3, 'flee: the contract can be taken again after a timeout');
}

// ---- round 4: witness reports — theft, delay, escape ----
{
  const sim = mkSim(); const S = sim.S; const p = S.player;
  const car = S.cars.find(c => c.parked && !c.owned && !c.mission && c.type !== 'bike');
  p.x = car.x; p.z = car.z; p.mode = 'foot';
  sim.step(1 / 60, IN({ enterPressed: true }));
  eq(p.mode, 'car', 'theft: the player is in the stolen car');
  eq(S.wanted.episode, false, 'theft: an unseen theft opens no episode');
  ok(S.wanted.report !== null, 'theft: an unseen theft files a witness report');
  eq(sim.stars(), 0, 'theft: no star while the report is pending');
  run(sim, 3.4, IN()); // linger at the scene
  eq(S.wanted.points, 1, 'theft: the report matures into a point at the scene');
  eq(sim.stars(), 1, 'theft: one star once the report lands');
  eq(S.wanted.episode, true, 'theft: the episode opens when the report lands');
}
{
  const sim = mkSim(); const S = sim.S; const p = S.player;
  const car = S.cars.find(c => c.parked && !c.owned && !c.mission && c.type !== 'bike');
  p.x = car.x; p.z = car.z; p.mode = 'foot';
  sim.step(1 / 60, IN({ enterPressed: true }));
  ok(S.wanted.report !== null, 'report: filed at the theft');
  const sx = S.wanted.report.x, sz = S.wanted.report.z;
  const fx = Math.abs(sx - (-190)) > Math.abs(sx - 200) ? -190 : 200;
  const fz = Math.abs(sz - (-190)) > Math.abs(sz - 200) ? -190 : 200;
  car.x = fx; car.z = fz; p.x = fx; p.z = fz; // break away before it matures
  run(sim, 3.4, IN());
  eq(S.wanted.points, 0, 'report: leaving the area kills the report');
  eq(S.wanted.episode, false, 'report: no episode from a dead report');
  eq(S.wanted.report, null, 'report: the report slot clears either way');
}
{
  const sim = mkSim(); const S = sim.S; const p = S.player;
  const car = S.cars.find(c => c.inLot) || S.cars.find(c => c.parked && !c.owned && c.type !== 'bike');
  const u = S.policeCars[0];
  u.active = true; u.x = car.x + 8; u.z = car.z; u.speed = 0;
  p.x = car.x; p.z = car.z; p.mode = 'foot';
  sim.step(1 / 60, IN({ enterPressed: true }));
  eq(S.wanted.points, 1, 'theft seen: stealing in front of a patrol scores instantly');
  eq(S.wanted.episode, true, 'theft seen: the episode opens instantly');
  eq(S.wanted.report, null, 'theft seen: no witness delay when police watch');
}

// ---- round 4: light offences accumulate into a report ----
{
  const sim = mkSim(); const S = sim.S; const p = S.player;
  const car = S.cars[0];
  car.x = 0; car.z = 0; car.ang = 0; car.parked = false; car.speed = 0;
  p.mode = 'car'; p.carId = 0; p.x = 0; p.z = 0;
  const o = S.cars.find(c => c.id !== 0 && c.type !== 'bike');
  for (let k = 0; k < 3; k++) {
    o.x = car.x; o.z = car.z + 2.5; o.speed = 0; o.parked = false; o.driver = false;
    car.speed = 14; car.ang = 0;
    sim.step(1 / 60, IN({ moveZ: 1 }));
    S.wanted.minorNext = 0; // staged bumps: lift the 2.5 s filing cooldown
    car.speed = 0;
  }
  eq(sim.stars(), 0, 'minor: recorded bumps alone raise no star');
  ok(S.wanted.report !== null && S.wanted.report.pts === 1, 'minor: three recorded bumps file a one-point report');
  run(sim, 3.4, IN());
  eq(sim.stars(), 1, 'minor: the matured report raises one star');
}

// ---- round 4: ramming a patrol car is an instant point ----
{
  const sim = mkSim(); const S = sim.S; const p = S.player;
  const car = S.cars[0];
  car.x = 0; car.z = 0; car.ang = 0; car.parked = false; car.speed = 0;
  p.mode = 'car'; p.carId = 0; p.x = 0; p.z = 0;
  const u = S.policeCars[0];
  u.active = true; u.x = 0; u.z = 2.8; u.speed = 0; u.hp = 140;
  car.speed = 12;
  sim.step(1 / 60, IN({ moveZ: 1 }));
  eq(S.wanted.points, 1, 'ramcop: ramming a patrol car scores a point instantly');
  eq(S.wanted.episode, true, 'ramcop: the episode opens instantly');
  eq(S.wanted.report, null, 'ramcop: no witness delay for a rammed patrol');
  ok(u.hp < 140, 'ramcop: the patrol car takes damage');
}

// ---- round 4: the interceptor runs ahead of the player at 3 stars ----
{
  const sim = mkSim(); const S = sim.S; const p = S.player;
  const car = S.cars[0];
  car.x = 0; car.z = -100; car.ang = 0; car.parked = false; car.speed = 10;
  p.mode = 'car'; p.carId = 0; p.x = 0; p.z = -100; p.ang = 0;
  S.wanted.ledger = 6; S.wanted.episode = true; S.wanted.search = 1; // 3 stars
  let ic = null, maxAhead = -1e9;
  for (let chunk = 0; chunk < 48 && !ic; chunk++) {
    run(sim, 0.25, IN({ moveZ: 1 }));
    if (Math.abs(car.speed) < 8) car.speed = 18; // keep the run rolling after bumps
    ic = S.policeCars.find(u => u.active && u.role === 'intercept') || null;
  }
  ok(ic !== null, 'interceptor: a unit runs interceptor at three stars');
  for (let chunk = 0; chunk < 24 && ic; chunk++) {
    run(sim, 0.25, IN({ moveZ: 1 }));
    if (Math.abs(car.speed) < 8) car.speed = 18;
    const ahead = (ic.tx - p.x) * Math.sin(p.ang) + (ic.tz - p.z) * Math.cos(p.ang);
    if (ahead > maxAhead) maxAhead = ahead;
    if (!ic.active) break;
  }
  ok(maxAhead > 5, `interceptor: its target sits ahead of the player's line (best ${maxAhead.toFixed(1)})`);
}

// ================= ROUND 5 — the played game, not only the sim =============
// The round-4 suite passed 677 while the shipped game had a dead dialogue
// system, an unreachable boat leg and a contract that completed at the
// wrong address: it tested the sim's data, not the paths a player walks.
// These blocks drive the real mechanics — real ui.js, real walking, real
// firing, and one full story playthrough.
function mkSimBoats() { const s = mkSim(); s.setBoats(D.BOATS.map(b => ({ x: b.x, z: b.z, ang: b.ang, speed: 0 }))); return s; }
function clearWanted(S) { const w = S.wanted; w.ledger = 0; w.points = 0; w.episode = false; w.search = 1; w.seen = false; w.heatFloor = 0; w.report = null; w.minorCount = 0; }

// ---- round 5: refuel no longer throws (F2) ----
{
  const sim = mkSim(); const S = sim.S; const p = S.player;
  const car = S.cars[0];
  car.x = -51; car.z = 13; car.ang = 0; car.speed = 0; car.fuel = 40;
  p.mode = 'car'; p.carId = 0; p.x = -51; p.z = 13; p.money = 300;
  let threw = false;
  try { sim.step(1 / 60, IN({ interactPressed: true })); } catch (e) { threw = true; }
  ok(!threw, 'refuel: the station interact does not throw (F2)');
  eq(car.fuel, 100, 'refuel: the tank fills');
  eq(p.money, 240, 'refuel: 60 units at $1 are charged');
}

// ---- round 5: walk the pier, board the boat — no teleport (F4) ----
{
  const sim = mkSimBoats(); const S = sim.S; const p = S.player;
  p.x = 205; p.z = 42; p.mode = 'foot'; p.carId = -1;
  let maxX = -1e9, boarded = false;
  for (let i = 0; i < 60 * 25 && !boarded; i++) {
    const nearBoat = S.boats.some(b => (b.x - p.x) ** 2 + (b.z - p.z) ** 2 < 50);
    sim.step(1 / 60, IN({ moveX: 1, sprint: true, enterPressed: nearBoat }));
    if (p.x > maxX) maxX = p.x;
    if (p.mode === 'boat') boarded = true;
  }
  ok(maxX > 230, `pier walk: on foot the player passes the old 222 waterline (reached x=${maxX.toFixed(1)}) (F4)`);
  ok(boarded, 'pier walk: walking the pier boards a boat through the real enter path (F4)');
}

// ---- round 5: the title screen cannot wipe a save (F21) ----
{
  const store = new Map();
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: k => { store.delete(k); },
  };
  const sim = mkSim(); const S = sim.S; const p = S.player;
  // an existing save from a previous session, written in the game's format
  p.money = 777;
  S.sessionLive = true; // write it the way a live session would
  sim.saveGame();
  S.sessionLive = false;
  const before = store.get(D.SAVE_KEY);
  ok(typeof before === 'string' && JSON.parse(before).player.money === 777, 'save gate: fixture save written (777)');
  // title screen: a fresh default sim state sits over the save, then unload
  p.money = 300;
  sim.saveGame();
  eq(store.get(D.SAVE_KEY), before, 'save gate: unload at the title leaves the existing save untouched (F21)');
  // once play actually starts, saving works again
  sim.beginSession();
  p.money = 555;
  sim.saveGame();
  eq(JSON.parse(store.get(D.SAVE_KEY)).player.money, 555, 'save gate: after beginSession the save writes normally (F21)');
  delete globalThis.localStorage;
}

// ---- round 5: respawn never takes cash below zero (F18) ----
{
  const sim = mkSim(); const S = sim.S; const p = S.player;
  p.money = 30; p.dead = true;
  sim.respawn();
  eq(p.money, 0, 'respawn: the clinic takes what you carry, never more (F18)');
  eq(p.hp, 100, 'respawn: back on your feet at full health');
}

// ---- round 5: taking a hit flashes (F19, sim half) ----
{
  const sim = mkSim(); const S = sim.S; const p = S.player;
  const n0 = S.events.length;
  sim.hurtPlayer(20);
  ok(p.hp < 100, 'hit feedback: the damage lands');
  ok(S.events.slice(n0).some(e => e.k === 'hitflash'), 'hit feedback: a landed hit emits the flash event (F19)');
}

// ---- round 5: a car towed in dry comes back with a rescue tank (F7) ----
{
  const sim = mkSim(); const S = sim.S; const p = S.player;
  const car = S.cars[0];
  car.x = -185; car.z = -60; car.disabled = true; car.hp = 10; car.fuel = 0; car._fuelOut = true; car.parked = false;
  p.x = 60; p.z = 60; p.mode = 'foot'; // the owner is across town
  run(sim, 75, IN());
  eq(car.fuel, 50, 'tow rescue: the depot returns the dry car with 50 fuel (F7)');
  eq(car.disabled, false, 'tow rescue: the car runs again');
  ok(car.x === -170 && car.z === -45, 'tow rescue: the car waits at the depot yard');
  eq(car._fuelOut, false, 'tow rescue: the dry flag is cleared');
}

// ---- round 5: the Coast Run pays for records, not laps (F15) ----
{
  const sim = mkSim(); const S = sim.S; const p = S.player;
  const car = S.cars[0];
  const runCoast = (idleSeconds) => {
    // the trial starts from the driver's seat, like the races
    p.mode = 'car'; p.carId = 0; car.x = D.SITES.trial.x; car.z = D.SITES.trial.z; car.speed = 0; p.x = car.x; p.z = car.z;
    sim.step(1 / 60, IN({ interactPressed: true }));
    const gs = D.COAST_RUN.gates;
    for (let i = 0; i < gs.length - 1; i++) { car.x = gs[i].x; car.z = gs[i].z; car.speed = 0; p.x = gs[i].x; p.z = gs[i].z; run(sim, 0.25, IN()); }
    if (idleSeconds) run(sim, idleSeconds, IN());
    const last = gs[gs.length - 1];
    car.x = last.x; car.z = last.z; car.speed = 0; p.x = last.x; p.z = last.z;
    run(sim, 0.25, IN());
  };
  const m0 = p.money;
  runCoast(0);
  eq(p.money, m0 + 350, 'coast: a first run takes the $350 record prize');
  ok(S.coastBest > 0, 'coast: the best time is recorded');
  const best1 = S.coastBest;
  runCoast(6);
  eq(p.money, m0 + 350, 'coast: a slower run pays nothing (F15)');
  eq(S.coastBest, best1, 'coast: the best time stands');
  eq(S.coast, null, 'coast: the run is closed');
}

// ---- round 5: races and the Coast Run die when the driver walks off (F6) ----
{
  const sim = mkSim(); const S = sim.S; const p = S.player;
  const car = S.cars[0];
  car.x = D.RACES[0].start.x; car.z = D.RACES[0].start.z;
  p.carId = 0; p.mode = 'car'; p.x = car.x; p.z = car.z;
  sim.step(1 / 60, IN({ interactPressed: true }));
  ok(!!S.race, 'abort: the race is running');
  p.mode = 'foot'; p.carId = -1; // the driver gets out and walks away
  run(sim, 11, IN());
  eq(S.race, null, 'abort: eleven seconds on foot abandons the race (F6)');
}
{
  const sim = mkSim(); const S = sim.S; const p = S.player;
  const car = S.cars[0];
  car.x = D.SITES.trial.x; car.z = D.SITES.trial.z; car.speed = 0;
  p.mode = 'car'; p.carId = 0; p.x = car.x; p.z = car.z;
  sim.step(1 / 60, IN({ interactPressed: true }));
  ok(!!S.coast, 'abort: the Coast Run is running');
  p.mode = 'foot'; p.carId = -1; // the driver gets out and walks away
  run(sim, 11, IN());
  eq(S.coast, null, 'abort: eleven seconds on foot abandons the Coast Run (F6)');
}

// ---- round 5: night parking happens at the curb, never in a crossing (F30) ----
{
  const sim = mkSim(); const S = sim.S;
  const target = S.cars.find(c => c.driver && c.id % 10 < 3);
  ok(!!target, 'night park: a parking-slice car exists');
  for (const c of S.cars) if (c !== target) c.parked = true; // empty streets: only the slice car circulates
  S.hours = 23;
  let badStop = 0, parkedAtCurb = false;
  for (let i = 0; i < 60 * 120; i++) {
    sim.step(1 / 60, IN());
    if (i % 30 !== 0) continue;
    const alongMod = ((target.along % 64) + 64) % 64;
    const inBox = alongMod < 7 || alongMod > 57; // the cross-road pavement itself
    const lateral = target.axis === 'NS' ? Math.abs(target.x - D.ROADS[target.road]) : Math.abs(target.z - D.ROADS[target.road]);
    if (Math.abs(target.speed) < 0.05 && inBox && lateral < 5) badStop++;
    if (Math.abs(target.speed) < 0.05 && lateral > 6) parkedAtCurb = true;
  }
  eq(badStop, 0, 'night park: the slice car never stops inside an intersection (F30)');
  ok(parkedAtCurb, 'night park: the slice car ends the night parked at the curb (F30)');
}

// ---- round 5: guards collide, and cannot see through walls (F31) ----
{
  const sim = mkSim(); const S = sim.S; const p = S.player;
  S.story.done = 2;
  p.x = D.SITES.mara.x; p.z = D.SITES.mara.z; p.mode = 'foot';
  sim.step(1 / 60, IN({ interactPressed: true }));
  eq(S.guards.length, 3, 'guards: contract 3 fields three guards');
  p.x = 160; p.z = 160; // behind the warehouse at (151,170) from every guard
  run(sim, 2, IN());
  ok(S.guards.every(g => !g.aggro), 'guards: no aggro through the warehouse wall (F31)');
  const g = S.guards[1]; g.aggro = true;
  let inside = false;
  for (let i = 0; i < 60 * 20; i++) {
    sim.step(1 / 60, IN());
    for (const b of c1.buildings) if (Math.abs(g.x - b.x) < b.w / 2 && Math.abs(g.z - b.z) < b.d / 2) inside = true;
    if (g.down) break;
  }
  ok(!inside, 'guards: an aggroed guard\u2019s path never crosses a building footprint (F31)');
}

// ---- round 5: the night heli holds you only while it can see you (F16) ----
{
  const sim = mkSim(); const S = sim.S; const p = S.player;
  S.policeCars = []; S.policeFoot = []; S.blockCars = [];
  S.hours = 21;
  p.x = 23; p.z = 10; p.mode = 'foot';
  const w = S.wanted; w.ledger = 6; w.episode = true; w.search = 1; w.heatFloor = 0;
  const h = S.helis[0]; h.mode = 'follow';
  // control: the beam is on the player under a clear sky — the episode holds
  for (let i = 0; i < 60 * 3; i++) { h.x = 10; h.z = 10; sim.step(1 / 60, IN()); }
  ok(w.episode, 'heli: a clear searchlight holds the episode open');
  // the same heli, a warehouse between it and the player: search must drain
  let cleared = false;
  for (let i = 0; i < 60 * 45; i++) { h.x = 23; h.z = 60; sim.step(1 / 60, IN()); if (!w.episode) { cleared = true; break; } }
  ok(cleared, 'heli: out of the beam\u2019s sight the search drains and wanted clears at night (F16)');
}

// ---- round 5: source guards for the render-side fixes (F5, F13, F28, F11) ----
{
  const fs = require('node:fs');
  const mainSrc = fs.readFileSync(new URL('../game/src/main.js', import.meta.url), 'utf8');
  const worldSrc = fs.readFileSync(new URL('../game/src/world.js', import.meta.url), 'utf8');
  ok(mainSrc.includes("st.kind === 'rendezvous') objPos = { x: st.x, z: st.z }"), 'marker: the rendezvous objective sits on the step\u2019s own coordinates (F5)');
  ok(mainSrc.includes("st.kind === 'delivercar') objPos = { x: st.x, z: st.z }"), 'marker: the delivery objective sits on the step\u2019s own coordinates (F13)');
  ok(!mainSrc.includes('fpsCount * 2'), 'pause fps: the render counter is no longer doubled (F28)');
  ok(worldSrc.includes("'COAST RUN'") && worldSrc.includes("'RACE'"), 'signs: race starts and the Coast Run have world signs (F11)');
}

// ---- round 5: the real dialogue UI, driven headless (F1, F14, F11) ----
{
  class FakeCtx {
    constructor() { this.styles = []; }
    set fillStyle(v) { this.styles.push(v); }
    get fillStyle() { return ''; }
    set strokeStyle(v) { this.styles.push(v); }
    get strokeStyle() { return ''; }
    fillRect() {} clearRect() {} beginPath() {} closePath() {} arc() {} fill() {} stroke() {}
    moveTo() {} lineTo() {} fillText() {} save() {} restore() {} translate() {}
    rotate() {} scale() {} setLineDash() {} drawImage() {} rect() {} clip() {}
    ellipse() {} quadraticCurveTo() {} bezierCurveTo() {} setTransform() {}
    createLinearGradient() { return { addColorStop() {} }; }
    measureText() { return { width: 10 }; }
  }
  class FakeEl {
    constructor(tag) {
      this.tagName = tag; this.children = []; this.style = {}; this.dataset = {};
      this._text = ''; this._html = ''; this.listeners = {}; this.disabled = false; this.id = ''; this.className = '';
      const set = new Set();
      this.classList = { add: c => set.add(c), remove: c => set.delete(c), contains: c => set.has(c), toggle: c => (set.has(c) ? set.delete(c) : set.add(c)) };
    }
    appendChild(c) { this.children.push(c); return c; }
    removeChild(c) { this.children = this.children.filter(x => x !== c); return c; }
    get firstChild() { return this.children[0] || null; }
    remove() {}
    addEventListener(k, f) { (this.listeners[k] = this.listeners[k] || []).push(f); }
    click() { (this.listeners.click || []).slice().forEach(f => f()); }
    set textContent(v) { this._text = String(v); this._html = ''; this.children = []; }
    get textContent() { return this._text + this._html + this.children.map(c => c.textContent).join(''); }
    set innerHTML(v) { this._html = String(v); this._text = ''; this.children = []; }
    get innerHTML() { return this._html; }
    getContext() { return this._ctx || (this._ctx = new FakeCtx()); }
    getBoundingClientRect() { return { width: 300, height: 300, left: 0, top: 0 }; }
  }
  const fakeDoc = { createElement: t => new FakeEl(t), head: new FakeEl('head'), body: new FakeEl('body'), addEventListener() {} };
  const fakeWin = { addEventListener() {}, innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1 };
  globalThis.document = fakeDoc;
  globalThis.window = fakeWin;
  const walkEls = (rootEl, out = []) => { out.push(rootEl); for (const c of rootEl.children) walkEls(c, out); return out; };
  const findText = (sub) => walkEls(fakeDoc.body).find(e => (e.textContent || '').includes(sub));
  const allCtxStyles = () => { const out = []; for (const e of walkEls(fakeDoc.body)) if (e._ctx) out.push(...e._ctx.styles); return out; };
  let ui = null, uiThrew = false;
  try {
    const SLU = require('../game/src/ui.js');
    ui = SLU.createUI({ sfx() {}, objectivePos: () => null, hasSave: false, onNewGame() {}, onContinue() {}, onPause() {}, onResume() {}, onRespawn() { return true; }, onRescue() { return true; }, onSearchCut() {} });
  } catch (e) { uiThrew = true; console.log('ui load error:', e && e.message); }
  ok(!uiThrew && !!ui, 'dialogue UI: the real ui.js builds headless (F1)');
  if (ui) {
    // a full contract dialogue, from the real data, through the real card
    let doneFlag = false, dlgThrew = false;
    try {
      ui.showDialogue(D.CONTRACTS[0].start, '01 / A favor in the sun — $450', () => { doneFlag = true; });
      ok(!!findText('MARA'), 'dialogue UI: the speaker renders (MARA)');
      ok(!!findText('Port Sol ledger is packed'), 'dialogue UI: the line renders verbatim');
      for (let i = 0; i < 8 && !doneFlag; i++) {
        const btn = walkEls(fakeDoc.body).find(e => e.tagName === 'button' && (e.textContent === 'NEXT' || e.textContent === 'BACK TO THE CITY'));
        if (!btn) break;
        btn.click();
      }
    } catch (e) { dlgThrew = true; console.log('dialogue error:', e && e.message); }
    ok(!dlgThrew, 'dialogue UI: a full contract dialogue runs without throwing (F1)');
    ok(doneFlag, 'dialogue UI: clicking through fires the completion callback');
    // the chapter card and the completion banner ride the same fixed path
    let cardThrew = false;
    try {
      ui.showChapter(D, 0);
      ok(!!findText('CHAPTER 1'), 'dialogue UI: the chapter card renders its title');
      ui.showComplete();
      ok(!!findText('VICE HEAT COMPLETE'), 'dialogue UI: the completion banner renders');
      const endS = { stats: { earned: 6500, distance: 12345, races: 2 }, story: { done: 6 }, shellsGot: new Set([1, 2, 3]), day: 2 };
      ui.showEndCard(endS, D);
      ok(!!findText('VICE HEAT — COMPLETE'), 'finale card: the end card renders (F29)');
      ok(!!findText('6 / 6'), 'finale card: the end card carries the run stats (F29)');
    } catch (e) { cardThrew = true; console.log('card error:', e && e.message); }
    ok(!cardThrew, 'dialogue UI: chapter card, banner and end card run without throwing');
    // the big map: honest discount percentages + the activity dots
    const mapS = {
      player: { x: 5, z: 15, ang: 0 }, story: { active: null, done: 0 },
      standing: { 'OLD QUARTER': 80, 'GLASS DISTRICT': 10, 'LITTLE PALM': 10, 'CORAL HEIGHTS': 10, 'PORT SOL': 10, 'SUNSTRAND BEACH': 10 },
      shellsGot: new Set(), taxi: { phase: 'wait', passengerOut: false, dest: 0, spot: 0 },
      race: null, policeCars: [], policeFoot: [], helis: [], cars: [], guards: [], coastBest: 0,
    };
    let mapThrew = false;
    try { ui.toggleMap(mapS, D); } catch (e) { mapThrew = true; console.log('map error:', e && e.message); }
    ok(!mapThrew, 'big map: the panel opens headless');
    ok(!!findText('20%'), 'big map: an 80-standing district shows its real 20% discount (F14)');
    ok(!findText('0.2%'), 'big map: no district shows the raw fraction as a percent (F14)');
    const styles = allCtxStyles();
    ok(styles.includes('#ff7847'), 'big map: race starts are dotted (F11)');
    ok(styles.includes('#53e08a'), 'big map: the Coast Run point is dotted (F11)');
    try { ui.toggleMap(mapS, D); } catch (e) { /* closing is best-effort here */ }
  }
  delete globalThis.document;
  delete globalThis.window;
}

// ---- round 5: THE PLAYTHROUGH — contracts 1→6 through real mechanics ----
{
  const sim = mkSimBoats(); const S = sim.S; const p = S.player;
  const stepKind = () => { const st = S.story.currentStep(); return st ? st.kind : 'done'; };
  const acceptNext = () => {
    clearWanted(S);
    p.mode = 'foot'; p.carId = -1; p.boatId = -1;
    p.x = D.SITES.mara.x; p.z = D.SITES.mara.z;
    sim.step(1 / 60, IN({ interactPressed: true }));
  };
  const killGuards = (fx, fz) => {
    // Real aim, real line of sight, real hits. The player fights from a
    // fixed open firing point (fx, fz) with clear lines to the guard
    // posts — the guards aggro, walk out and trade fire, exactly as in
    // play. Survivability is staged (armour topped up) the way the suite
    // stages positions; the kills are not.
    p.x = fx; p.z = fz;
    for (const g of S.guards) {
      // wake it first: one guard posts inside the warehouse doorway,
      // where no line of sight reaches — step within earshot (proximity
      // aggros through walls), then fall back to the firing point and
      // let it walk out after you, as a player would
      p.hp = 100; p.armour = 100; p.x = g.x; p.z = g.z + 8;
      run(sim, 0.3, IN());
      p.x = fx; p.z = fz;
      let guard = 0;
      while (!g.down && guard++ < 80) {
        p.hp = 100; p.armour = 100; p.x = fx; p.z = fz;
        if (p.clip <= 0) { sim.step(1 / 60, IN({ reloadPressed: true })); run(sim, 1.6, IN()); }
        S.camYaw = Math.atan2(g.x - p.x, g.z - p.z); // aim the real gun
        sim.step(1 / 60, IN({ fire: true }));
        run(sim, 0.3, IN());
      }
    }
  };
  // contract 1 — the pickup-locked ledger run
  acceptNext();
  eq(S.story.active, 0, 'play: contract 1 accepted from Mara');
  const pickup = S.cars.find(c => c.type === 'pickup' && c.parked);
  ok(!!pickup, 'play: a parked pickup exists for the crate');
  p.x = pickup.x; p.z = pickup.z;
  sim.step(1 / 60, IN({ enterPressed: true }));
  eq(p.mode, 'car', 'play: entered a car at the kerb');
  ok(sim.currentCar() && sim.currentCar().type === 'pickup', 'play: it is the pickup the crate demands');
  pickup.x = -115; pickup.z = 13; pickup.speed = 0; p.x = -115; p.z = 13;
  run(sim, 0.3, IN());
  eq(stepKind(), 'deliver', 'play: the crate is collected from the pickup');
  pickup.x = 77; pickup.z = 141; p.x = 77; p.z = 141;
  run(sim, 0.3, IN());
  eq(S.story.done, 1, 'play: contract 1 complete');
  // contract 2 — the coupe goes to Nico's garage, not the chop shop (F13)
  acceptNext();
  eq(S.story.active, 1, 'play: contract 2 accepted');
  const coupe = S.cars.find(c => c.id === 1);
  p.mode = 'foot'; p.carId = -1; p.x = coupe.x; p.z = coupe.z;
  sim.step(1 / 60, IN({ enterPressed: true }));
  eq(stepKind(), 'delivercar', 'play: taking the coupe opens the delivery');
  coupe.x = D.SITES.chop.x; coupe.z = D.SITES.chop.z; coupe.speed = 0; p.x = coupe.x; p.z = coupe.z;
  run(sim, 0.5, IN());
  eq(stepKind(), 'delivercar', 'play: the chop shop does NOT complete contract 2 (F13)');
  coupe.x = -179; coupe.z = -52; p.x = -179; p.z = -52;
  run(sim, 0.5, IN());
  eq(S.story.done, 2, 'play: the coupe delivered to Nico completes contract 2');
  // contract 3 — guards, the drive, and the boat leg walked + sailed (F4)
  acceptNext();
  eq(S.story.active, 2, 'play: contract 3 accepted');
  p.hp = 100; p.armour = 100;
  killGuards(130, 195); // the open road south of the Port Sol yard
  eq(stepKind(), 'collect', 'play: guards down opens the drive pickup');
  p.x = 141; p.z = 177;
  run(sim, 0.3, IN());
  eq(stepKind(), 'boat', 'play: the drive is in hand — the boat leg opens');
  p.x = 205; p.z = 42;
  let boarded = false;
  for (let i = 0; i < 60 * 25 && !boarded; i++) {
    const nearBoat = S.boats.some(b => (b.x - p.x) ** 2 + (b.z - p.z) ** 2 < 50);
    sim.step(1 / 60, IN({ moveX: 1, sprint: true, enterPressed: nearBoat }));
    if (p.mode === 'boat') boarded = true;
  }
  ok(boarded, 'play: the boat is boarded by walking the pier');
  const sailTo = (tx, tz, seconds) => {
    for (let i = 0; i < 60 * seconds; i++) {
      const b = S.boats[p.boatId];
      const err = Math.atan2(tx - b.x, tz - b.z) - b.ang;
      const wrapped = Math.atan2(Math.sin(err), Math.cos(err));
      sim.step(1 / 60, IN({ moveZ: 1, moveX: Math.max(-1, Math.min(1, -wrapped * 2)) }));
      if ((b.x - tx) ** 2 + (b.z - tz) ** 2 < 100) return true;
    }
    return false;
  };
  // east past the pier end first — the pier's push-out band traps a
  // diagonal course, exactly as a player discovers in the first seconds
  ok(sailTo(262, 40, 25) && sailTo(266, 88, 40), 'play: sailed to the first sea gate');
  run(sim, 0.3, IN({ moveZ: 1 }));
  eq(S.storyGate, 1, 'play: first sea gate cleared');
  ok(sailTo(266, 58, 40), 'play: sailed to the second sea gate');
  run(sim, 0.3, IN({ moveZ: 1 }));
  eq(S.storyGate, 2, 'play: second sea gate cleared');
  ok(sailTo(250, 44, 40), 'play: sailed home to the Sunstrand pier');
  run(sim, 0.5, IN());
  eq(S.story.done, 3, 'play: contract 3 complete — the boat leg sails end to end');
  // contract 4 — transmitter, then the timed flight to the safehouse
  acceptNext();
  eq(S.story.active, 3, 'play: contract 4 accepted');
  p.x = 77; p.z = -115;
  sim.step(1 / 60, IN({ interactPressed: true }));
  eq(stepKind(), 'flee', 'play: the transmitter is dead — run');
  p.x = 13; p.z = 77;
  run(sim, 0.3, IN());
  eq(S.story.done, 4, 'play: contract 4 complete at the safehouse');
  // contract 5 — the four-leg archive run against its own clock
  acceptNext();
  eq(S.story.active, 4, 'play: contract 5 accepted');
  for (const [lx, lz] of [[-115, -179], [-179, 77], [141, 13], [205, 77]]) { p.x = lx; p.z = lz; run(sim, 0.3, IN()); }
  eq(S.story.done, 5, 'play: contract 5 complete');
  // contract 6 — raiders, the upload, and the clean rendezvous (F5, F29)
  acceptNext();
  eq(S.story.active, 5, 'play: contract 6 accepted');
  p.hp = 100; p.armour = 100;
  killGuards(13, 58); // the open street south of the safehouse
  eq(stepKind(), 'interact', 'play: raiders down opens the upload');
  p.x = -51; p.z = -51;
  sim.step(1 / 60, IN({ interactPressed: true }));
  eq(stepKind(), 'rendezvous', 'play: the upload is sent — the rendezvous is last');
  clearWanted(S);
  p.x = 5; p.z = 15; // Mara's doorstep: the old marker's address
  run(sim, 0.5, IN());
  eq(stepKind(), 'rendezvous', 'play: Mara\u2019s doorstep does NOT complete the rendezvous (F5)');
  const evMark = S.events.length;
  p.x = 205; p.z = -51;
  run(sim, 0.5, IN());
  eq(S.story.done, 6, 'play: the rendezvous completes contract 6');
  ok(S.storyComplete === true, 'play: the story completes');
  const evs = S.events.slice(evMark);
  const di = evs.findIndex(e => e.k === 'dialogue' && e.lines === D.CONTRACTS[5].done);
  const si = evs.findIndex(e => e.k === 'storycomplete');
  ok(di >= 0 && si > di, 'play: the closing dialogue is emitted before story-complete (F29)');
  eq(p.money, 6800, 'play: the $300 stake plus $6,500 of contracts is $6,800');
}


console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
