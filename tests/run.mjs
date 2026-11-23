// Headless test suite for Saltline: Vice Heat — node, no browser.
// Run: node tests/run.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const D = require('../game/src/data.js');

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
