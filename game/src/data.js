'use strict';
/* Saltline: Vice Heat — pure design data + rules logic.
   No DOM, no THREE: the browser simulation and the headless node tests both
   consume this file. Everything here is deterministic from the city seed. */
const SLD = (() => {

// ---------- deterministic RNG (mulberry32 streams) ----------
function stream(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ('0000000' + (h >>> 0).toString(16)).slice(-8);
}
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- world constants ----------
const SEED = 74017;
const ROADS = [-192, -128, -64, 0, 64, 128, 192];
const BOUNDS = { x0: -218, x1: 214, z0: -218, z1: 218 };
const PAINT = [0x3cc8cf, 0xf4bb45, 0xe46c70, 0xede4cf, 0x567eb8, 0x4d6967, 0x9c72b0, 0xccd0d3, 0x353b46];
const BUILDING_COLORS = [0xf0b89a, 0xe7c6a7, 0xc5ddd0, 0xf1d5b1, 0xe4a3ad, 0xb2c6d3, 0xe7e0ca, 0xb6d5ca];
const DISTRICTS = ['OLD QUARTER', 'GLASS DISTRICT', 'CORAL HEIGHTS', 'LITTLE PALM', 'PORT SOL', 'SUNSTRAND BEACH'];
const DISTRICT_ACCENT = {
  'OLD QUARTER': 0xd88145, 'GLASS DISTRICT': 0x3eaaa5, 'CORAL HEIGHTS': 0xe47271,
  'LITTLE PALM': 0x72b45c, 'PORT SOL': 0x48678d, 'SUNSTRAND BEACH': 0xf4bb45,
};
function districtAt(x, z) {
  if (x > 175) return 'SUNSTRAND BEACH';
  if (z > 124) return 'PORT SOL';
  if (x < -110) return 'LITTLE PALM';
  if (z < -110) return 'GLASS DISTRICT';
  if (x > 60) return 'CORAL HEIGHTS';
  return 'OLD QUARTER';
}

// ---------- city generation ----------
function blockKind(ix, iz) {
  if ((ix === 3 && iz === 2) || (ix === 1 && iz === 4)) return 'park';
  if (ix === 2 && iz === 3) return 'market';
  if (iz < 2 && ix > 2) return 'tower';
  if (iz === 5) return 'warehouse';
  return 'residential';
}
function genCity(seed) {
  const rng = stream(seed);
  const buildings = [];
  const blocks = [];
  let bid = 0;
  for (let ix = 0; ix < 6; ix++) for (let iz = 0; iz < 6; iz++) {
    const kind = blockKind(ix, iz);
    const cx0 = ROADS[ix], cz0 = ROADS[iz];
    blocks.push({ ix, iz, kind, x0: cx0, z0: cz0 });
    if (kind === 'park' || kind === 'market') continue;
    for (const [ox, oz] of [[23, 23], [42, 23], [23, 42], [42, 42]]) {
      const w = 13 + rng() * 3.2, d = 13 + rng() * 3.2;
      let h;
      if (kind === 'tower') h = 27 + rng() * 51;
      else if (kind === 'warehouse') h = 7 + rng() * 6;
      else h = 8 + rng() * 20;
      buildings.push({
        id: bid++, x: cx0 + ox, z: cz0 + oz, w, d, h, kind,
        color: BUILDING_COLORS[Math.floor(rng() * 8)],
        winFrac: 0.18 + rng() * 0.22,
        seed: Math.floor(rng() * 1e9),
      });
    }
  }
  // demolish the residential building at ~(170,42) for the parking lot
  let demoIdx = -1, demoDist = 1e9;
  buildings.forEach((b, i) => {
    const dd = (b.x - 170) ** 2 + (b.z - 42) ** 2;
    if (dd < demoDist) { demoDist = dd; demoIdx = i; }
  });
  const demolished = buildings.splice(demoIdx, 1)[0];
  // street lamps: 2 per intersection at diagonal corners
  const lamps = [];
  for (const rx of ROADS) for (const rz of ROADS) {
    lamps.push({ x: rx + 10.2, z: rz + 14, rot: Math.atan2(-1, 0.35) });
    lamps.push({ x: rx - 10.2, z: rz - 14, rot: Math.atan2(1, -0.35) });
  }
  // palms: 3-4 per block
  const palms = [];
  for (const bl of blocks) {
    const n = 3 + Math.floor(rng() * 2);
    for (let i = 0; i < n; i++) {
      palms.push({
        x: bl.x0 + 8 + rng() * 48, z: bl.z0 + 8 + rng() * 48,
        h: 5.05 + rng() * 1.9, lean: 0.26 + rng() * 0.31,
        dir: rng() * Math.PI * 2, seed: Math.floor(rng() * 1e9),
      });
    }
  }
  return { buildings, blocks, lamps, palms, demolished };
}
function cityFingerprint(city) {
  let s = '';
  for (const b of city.buildings) s += `${b.id}:${b.x},${b.z},${b.w.toFixed(3)},${b.d.toFixed(3)},${b.h.toFixed(3)},${b.color},${b.winFrac.toFixed(4)};`;
  s += '|';
  for (const l of city.lamps) s += `${l.x},${l.z};`;
  s += '|';
  for (const p of city.palms) s += `${p.x.toFixed(2)},${p.z.toFixed(2)},${p.h.toFixed(3)},${p.lean.toFixed(3)};`;
  return fnv1a(s);
}

// ---------- fixed world sites ----------
const SITES = {
  mara: { x: 7, z: 13, name: 'Mara / Dispatch' },
  nico: { x: -179, z: -52, name: 'Nico / Garage' },
  clinic: { x: 77, z: 13, name: 'Clinic + Supplies' },
  home: { x: 13, z: 77, name: 'Home / Safehouse' },
  trial: { x: 205, z: 77, name: 'Sunstrand Time Trial' },
  chop: { x: 150, z: 190, name: 'Chop Shop' },
  depot: { x: -192, z: -64 },
  ambulanceBase: { x: 64, z: 0 },
};
const FUEL_STATIONS = [
  { x: -51, z: 13 }, { x: 13, z: -179 }, { x: 141, z: 141 }, { x: 205, z: 42 },
];
const ROBBERY_SHOPS = [
  { x: 38, z: 8 }, { x: -30, z: -120 }, { x: 96, z: 8 }, { x: 10, z: 150 },
];
const TAXI_SPOTS = [
  { x: 0, z: 100 }, { x: 128, z: 20 }, { x: -128, z: 40 }, { x: 64, z: -150 },
  { x: 96, z: 128 }, { x: 192, z: -40 }, { x: -64, z: 180 }, { x: 30, z: -192 },
];
const SHELLS = [
  [208, -40], [211, 20], [206, 60], [210, 100], [207, 140], [238, 42], [246, 113],
  [96, 186], [160, 186], [32, 96], [-32, 96], [-160, -160], [160, -160], [96, 96],
  [-96, -96], [13, 84], [-186, -52], [70, 13], [200, 60], [-32, -100],
].map(([x, z]) => ({ x, z }));
const RACES = [
  { name: 'Avenida Sprint', start: { x: 0, z: -20 }, gates: [[0, -64], [-64, -64], [-64, -128], [0, -128], [64, -128], [64, -170]].map(([x, z]) => ({ x, z })) },
  { name: 'Port Run', start: { x: 60, z: 128 }, gates: [[128, 128], [192, 100], [192, 42], [192, -29], [128, -64]].map(([x, z]) => ({ x, z })) },
];
const COAST_RUN = {
  start: { x: 205, z: 77 },
  gates: [[188, 128], [128, 188], [0, 188], [-128, 188], [-188, 64], [-188, -128], [0, -188], [188, -128], [205, 77]].map(([x, z]) => ({ x, z })),
  prize: 350,
};
const PIERS = [-171, -100, -29, 42, 113, 184];
const BOATS = [
  { x: 243, z: 36.5, ang: Math.PI / 2, color: 0xf2efe8 }, { x: 243, z: 48.5, ang: Math.PI / 2, color: 0x3cc8cf }, { x: 243.5, z: 118.5, ang: Math.PI / 2, color: 0xf4bb45 },
];
const PARKING = {
  pad: { x0: 160, x1: 183, z0: 33, z1: 51 },
  carBays: [166.7, 170.1, 173.5, 176.9, 180.3].flatMap(x => [{ x, z: 36.2, ang: Math.PI }, { x, z: 47.8, ang: 0 }]),
  bikeBays: [36.2, 42, 47.8].map(z => ({ x: 161.9, z, ang: Math.PI / 2 })),
  sign: { x: 181.5, z: 48.4 },
};
const DISTRICT_BOARDS = [
  { name: 'OLD QUARTER', sub: 'AVENIDA', x: 0, z: 17, yaw: Math.PI, main: true },
  { name: 'GLASS DISTRICT', sub: 'SALTLINE', x: -69, z: -147, yaw: 0 },
  { name: 'CORAL HEIGHTS', sub: 'SALTLINE', x: 160, z: -83, yaw: 0 },
  { name: 'LITTLE PALM', sub: 'SALTLINE', x: -165, z: -28, yaw: 0 },
  { name: 'PORT SOL', sub: 'SALTLINE', x: 21, z: 163, yaw: Math.PI },
  { name: 'SUNSTRAND', sub: 'BEACH', x: 213, z: 87, yaw: Math.PI },
];
const HELI_ROUTE = [[-164, -164], [0, -186], [164, -164], [190, 0], [164, 164], [0, 186], [-164, 164], [-190, 0]].map(([x, z]) => ({ x, z }));

// ---------- population & vehicles (spawn data) ----------
function genPeds(seed) {
  const rng = stream(seed);
  const peds = [];
  const blocks = [];
  for (let ix = 0; ix < 6; ix++) for (let iz = 0; iz < 6; iz++) blocks.push({ x0: ROADS[ix], z0: ROADS[iz] });
  for (let i = 0; i < 720; i++) {
    const bl = blocks[i % 36];
    peds.push({
      id: i, bx: bl.x0, bz: bl.z0,
      dist: rng() * 160, speed: 0.85 + rng() * 0.8,
      cycle: 9 + rng() * 5, pauseLen: 1 + rng() * 2, phase: rng() * 14,
      scale: 0.91 + (i % 17) * 0.01,
      shirt: PAINT[Math.floor(rng() * 9)],
      pants: [0x314157, 0x434958, 0x676477, 0x385c64, 0x8f775f][Math.floor(rng() * 5)],
      skin: [0xc68c66, 0x734933, 0xe2b38d, 0xa66b46][Math.floor(rng() * 4)],
      hair: [0x34313d, 0x543a3c, 0x84624f, 0x272d36, 0xcc925e][Math.floor(rng() * 5)],
    });
  }
  return peds;
}
function pedPos(p) {
  // perimeter of the block, inset 12 from the centrelines corner; side length 40
  let d = ((p.dist % 160) + 160) % 160;
  const x0 = p.bx + 12, z0 = p.bz + 12;
  if (d < 40) return { x: x0 + d, z: z0, dir: 0 };
  d -= 40;
  if (d < 40) return { x: x0 + 40, z: z0 + d, dir: 1 };
  d -= 40;
  if (d < 40) return { x: x0 + 40 - d, z: z0 + 40, dir: 2 };
  d -= 40;
  return { x: x0, z: z0 + 40 - d, dir: 3 };
}
const VEHICLE_STATS = {
  sedan: { accel: 19, top: 29 }, sport: { accel: 24, top: 38 },
  van: { accel: 14, top: 29 }, taxi: { accel: 19, top: 29 },
  pickup: { accel: 16, top: 27 }, compact: { accel: 20, top: 30 },
  bike: { accel: 27, top: 34, steer: 2.4 },
};
function vehicleTypeFor(n) {
  if (n % 11 === 10) return 'van';
  if (n % 7 === 6) return 'taxi';
  if (n % 5 === 4) return 'sport';
  if (n % 9 === 8) return 'pickup';
  if (n % 6 === 5) return 'compact';
  return 'sedan';
}
function genVehicles(seed) {
  const rng = stream(seed);
  const cars = [];
  // id 0: player's blue sedan; id 1: mission yellow coupe
  cars.push({ id: 0, type: 'sedan', x: 19, z: 6.5, ang: Math.PI / 2, hp: 100, color: 0x28cad2, driver: false, parked: true, owned: true, mission: false });
  cars.push({ id: 1, type: 'sport', x: 5, z: -84, ang: 0, hp: 100, color: 0xf5c449, driver: false, parked: true, owned: false, mission: true });
  // 62 drivers, ids 2..63
  for (let i = 0; i < 62; i++) {
    const id = i + 2;
    const axis = rng() < 0.5 ? 'NS' : 'EW';
    const road = Math.floor(rng() * 7);
    const dir = rng() < 0.5 ? 1 : -1;
    cars.push({
      id, type: vehicleTypeFor(id), axis, road, dir,
      along: -192 + rng() * 384, speed: 8 + rng() * 7,
      hp: 100, color: PAINT[Math.floor(rng() * 9)],
      driver: true, parked: false, owned: false, mission: false,
      bike: i < 7, // first 7 circulating drivers phase in as bikes
    });
  }
  // 14 more parked, ids 64..77 (16 parked total incl. ids 0 and 1)
  for (let i = 0; i < 14; i++) {
    const id = i + 64;
    const ns = rng() < 0.5;
    const road = ROADS[Math.floor(rng() * 7)];
    const along = -185 + rng() * 370;
    const side = rng() < 0.5 ? 6.8 : -6.8;
    cars.push({
      id, type: vehicleTypeFor(id),
      x: ns ? road + side : along, z: ns ? along : road + side,
      ang: ns ? (side > 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2),
      hp: 100, color: PAINT[Math.floor(rng() * 9)],
      driver: false, parked: true, owned: false, mission: false,
    });
  }
  // relocate the 5 parked cars nearest the lot into its car bays
  const parkedCars = cars.filter(c => c.parked && !c.owned && !c.mission)
    .sort((a, b) => ((a.x - 170) ** 2 + (a.z - 42) ** 2) - ((b.x - 170) ** 2 + (b.z - 42) ** 2));
  parkedCars.slice(0, 5).forEach((c, i) => {
    const bay = PARKING.carBays[i];
    c.x = bay.x; c.z = bay.z; c.ang = bay.ang; c.inLot = true;
  });
  // 3 parked bikes in the bike bays
  const bikes = PARKING.bikeBays.map((bay, i) => ({
    id: 78 + i, type: 'bike', x: bay.x, z: bay.z, ang: bay.ang, hp: 100,
    color: PAINT[(i * 3) % 9], driver: false, parked: true, owned: false, mission: false, inLot: true,
  }));
  return { cars, bikes };
}

// ---------- wanted / police math ----------
const STAR_THRESHOLDS = [1, 3, 6, 9, 12];
function starsFromCasualties(n) {
  let s = 0;
  for (const t of STAR_THRESHOLDS) if (n >= t) s++;
  return s;
}
const DISPATCH_FOOT = [0, 2, 3, 4, 5, 6];
const DISPATCH_CAR = [0, 2, 3, 4, 5, 6];
function searchDecayRate(stars, standingHere) {
  let r = 1 / (12 + 3 * stars);
  if (standingHere >= 50) r *= 1.25;
  return r;
}
// clean plate: ledger value at the top of the band below the current stars
function ledgerBelowBand(stars) {
  return [0, 0, 2, 5, 8, 11][stars] || 0;
}

// ---------- standing ----------
function tierOf(score) {
  if (score >= 75) return { name: 'Family', discount: 0.20 };
  if (score >= 50) return { name: 'Respected', discount: 0.10 };
  if (score >= 25) return { name: 'Known', discount: 0.05 };
  return { name: 'Stranger', discount: 0 };
}
function priceWithDiscount(base, district, standing) {
  const t = tierOf(standing[district] ?? 10);
  return Math.round(base * (1 - t.discount));
}

// ---------- activities math ----------
function roadRouteLength(a, b) {
  // length along the road grid: snap each end to the nearest centreline crossing
  const snap = (v) => ROADS.reduce((p, c) => Math.abs(c - v) < Math.abs(p - v) ? c : p, ROADS[0]);
  const ax = snap(a.x), az = snap(a.z), bx = snap(b.x), bz = snap(b.z);
  return Math.abs(bx - ax) + Math.abs(bz - az) + Math.abs(a.x - ax) + Math.abs(a.z - az) + Math.abs(b.x - bx) + Math.abs(b.z - bz);
}
function taxiFare(routeLen) { return clamp(40 + routeLen * 0.09, 40, 90); }
function taxiTimeLimit(routeLen) { return routeLen / 11 + 25; }
function taxiDestination(spotIdx, seq) {
  // deterministic: (spot+3+seq) rotated past same-district entries
  let idx = (spotIdx + 3 + seq) % TAXI_SPOTS.length;
  const from = districtAt(TAXI_SPOTS[spotIdx].x, TAXI_SPOTS[spotIdx].z);
  let guard = 0;
  while (districtAt(TAXI_SPOTS[idx].x, TAXI_SPOTS[idx].z) === from && guard++ < 8) idx = (idx + 1) % TAXI_SPOTS.length;
  return idx;
}
function robberyPay(shopIdx, count) { return 120 + ((shopIdx * 37 + count * 53) % 81); }
const CHOP_PAY = { sedan: 80, taxi: 80, sport: 180, van: 120, pickup: 120, compact: 80 };
function chopEligible(car) {
  return !!car && !car.police && !car.service && car.type !== 'bike' && !car.mission && !car.owned && !!car.stolen;
}
function racePar(points) {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  return len / 12.5;
}

// ---------- fuel ----------
const FUEL_TANK = 100;
function fuelBurn(car, throttle, speed, dt) {
  // tuned so a sedan at full throttle lasts well over 20 minutes
  const rate = Math.abs(throttle) * (0.55 + Math.abs(speed) / 29 * 0.75);
  return car.fuel - rate * dt * (100 / 1800);
}

// ---------- weather state machine ----------
function genWeather(seed) {
  return { rngState: seed, storm: false, intensity: 0, phasesLeft: 0, target: 0 };
}
function weatherPhaseBoundary(w, rng) {
  if (!w.storm) {
    if (rng() < 0.22) {
      const r = rng();
      w.phasesLeft = r < 0.46 ? 1 : r < 0.77 ? 2 : r < 0.92 ? 3 : 4;
      w.storm = true; w.target = 1;
      return 'start';
    }
    return 'none';
  }
  w.phasesLeft--;
  if (w.phasesLeft <= 0) { w.storm = false; w.target = 0; return 'end'; }
  return 'continue';
}

// ---------- story contracts ----------
const CHAPTERS = [
  { upto: 2, name: 'CHAPTER 1 — THE PORT SOL FILE', closing: 'The ledger changed hands and the coupe is back in the garage. But in Port Sol a name is starting to circulate — and its archive is still locked tight.' },
  { upto: 4, name: 'CHAPTER 2 — THE PRICE OF A NAME', closing: 'The transmitter is dead, the trail cut. The archive is intact in Kai\'s hands — and now everyone knows exactly who holds it.' },
  { upto: 6, name: 'CHAPTER 3 — VICE HEAT', closing: 'Six contracts, one archive, one city that finally knows the truth. VICE HEAT is complete — the streets of Saltline are still yours.' },
];
const CONTRACTS = [
  {
    id: 1, giver: 'Mara', title: 'A favor in the sun', reward: 450,
    brief: 'Grab the blue courier car. Pick up a sealed ledger in Little Palm, then deliver it to the rooftop crew in Coral Heights. The ledger rides in a crate that only fits a pickup bed — arrive at the pickup point in a pickup.',
    steps: [
      { kind: 'collect', x: -115, z: 13, veh: 'pickup', label: 'Pick up the sealed ledger in Little Palm' },
      { kind: 'deliver', x: 77, z: 141, label: 'Deliver to the rooftop crew in Coral Heights' },
    ],
    start: [['MARA', 'The Port Sol ledger is packed. Pick it up in Little Palm, take it to the rooftop crew in Coral Heights.'], ['KAI', 'Take the blue car, drive slow, don\'t break the seal.'], ['MARA', 'Exactly. Seal intact, payment intact — $450.']],
    done: [['MARA', 'Rooftop crew confirms: the book arrived, seal intact.'], ['KAI', 'Easy. This city is kind to couriers who don\'t ask questions.'], ['MARA', 'Don\'t get cocky. Nico lost a car — he needs your hands.']],
  },
  {
    id: 2, giver: 'Nico', title: 'Borrowed horsepower', reward: 700,
    brief: 'Nico needs a sport coupe recovered. It is parked beside Glass Avenue. Bring it back in one piece.',
    steps: [
      { kind: 'stealcar', carId: 1, label: 'Take back the yellow coupe on Glass Avenue' },
      { kind: 'delivercar', carId: 1, x: -179, z: -52, label: 'Bring the coupe to Nico\'s garage' },
    ],
    start: [['NICO', 'The thief parked my yellow coupe on Glass Avenue. Take it back, Kai.'], ['KAI', 'Taking it will make noise — alarm, cops, all of it.'], ['NICO', 'Let it sing. What matters is it comes home to this garage without a scratch.']],
    done: [['NICO', 'Intact. You drive like this car belongs to your grandmother.'], ['KAI', 'I drive like the one paying is watching.'], ['MARA', 'Save your energy. The Port Sol crew is on the move — that archive is what they\'re guarding.']],
  },
  {
    id: 3, giver: 'Mara', title: 'Port of no return', reward: 950,
    brief: 'A crooked security crew at Port Sol is guarding evidence. Disable the three guards and take their drive. Then run the drive out by water — through the sea gates to the Sunstrand pier, where Mara\'s contact waits.',
    steps: [
      { kind: 'combat', x: 141, z: 177, count: 3, label: 'Disable the three guards at Port Sol' },
      { kind: 'collect', x: 141, z: 177, label: 'Take the drive' },
      { kind: 'boat', gates: [{ x: 266, z: 88 }, { x: 266, z: 58 }], dest: { x: 250, z: 44 }, label: 'Run the drive out by water to the Sunstrand pier' },
    ],
    start: [['MARA', 'The Port Sol security crew is guarding a drive full of their blackmail evidence.'], ['KAI', 'Three armed guards on the dock.'], ['MARA', 'Drop them, take the drive. Don\'t give them a chance to call it in.']],
    done: [['KAI', 'The drive is safe. Three guards are having nightmares on the dock.'], ['MARA', 'Don\'t stray far from trouble: that drive is broadcasting. They can follow us.']],
  },
  {
    id: 4, giver: 'Mara', title: 'Off the grid', reward: 1100, timed: 90,
    brief: 'The drive has an active tracker. The heat is on you from the moment you take this job. Find the transmitter in the Glass District, then reach the safehouse before the lockout — the clock starts when the transmitter dies.',
    steps: [
      { kind: 'interact', x: 77, z: -115, heat: 2, label: 'Kill the transmitter in the Glass District' },
      { kind: 'flee', x: 13, z: 77, label: 'Reach the safehouse before the lockout' },
    ],
    start: [['MARA', 'The transmitter is in the Glass District. Kill it, then vanish off the map.'], ['KAI', 'The cops will come the moment I kill it.'], ['MARA', 'Count on it. Alleys and distance break their line of sight — wait until the city forgets.']],
    done: [['MARA', 'Signal dead. We\'re ghosts again.'], ['KAI', 'And my name?'], ['MARA', 'It just went up in price. Lucky nobody can afford it.']],
  },
  {
    id: 5, giver: 'Nico', title: 'Last light run', reward: 1500, timed: 180,
    brief: 'Three drops, one clock. Deliver the archive pieces before the network lockout. The timer begins on your first pickup.',
    steps: [
      { kind: 'collect', x: -115, z: -179, label: 'Pick up the first archive piece' },
      { kind: 'deliver', x: -179, z: 77, label: 'Deliver to the west safehouse' },
      { kind: 'deliver', x: 141, z: 13, label: 'Deliver to Port Sol relay' },
      { kind: 'deliver', x: 205, z: 77, label: 'Deliver to the Sunstrand broadcast van' },
    ],
    start: [['NICO', 'Listen carefully: the network locks three minutes after the first piece is taken.'], ['KAI', 'Little Palm, Coral Heights, the Sunstrand broadcast van.'], ['NICO', 'You\'ve got it memorized. Now don\'t stop — not even for coffee.']],
    done: [['NICO', 'Three pieces, all delivered before the lock dropped. Good work.'], ['MARA', 'Celebrate later. They found our safehouse — come home now, Kai.']],
  },
  {
    id: 6, giver: 'Mara', title: 'The clean getaway', reward: 1800,
    brief: 'The port crew found our safehouse. Get there, stop the raiders, then bring the archive to the public relay.',
    steps: [
      { kind: 'combat', x: 13, z: 77, count: 3, label: 'Stop the raiders at the safehouse' },
      { kind: 'interact', x: -51, z: -51, label: 'Upload at the public relay' },
      { kind: 'rendezvous', x: 205, z: -51, label: 'Final rendezvous — arrive with a clean record' },
    ],
    start: [['MARA', 'Three raiders at the safehouse. If that house falls, the archive falls with it.'], ['KAI', 'And after them?'], ['MARA', 'Upload at the public relay. Once it\'s open, no grave is deep enough.']],
    done: [['MARA', 'The relay took it. The Port Sol archive belongs to the public now.'], ['KAI', 'So what do we become?'], ['MARA', 'Free people who still get called to run packages. This city remembers, Kai.']],
  },
];
function chapterOf(contractIdx) { // 0-based completed count -> chapter index or -1
  for (let i = 0; i < CHAPTERS.length; i++) if (contractIdx + 1 === CHAPTERS[i].upto) return i;
  return -1;
}
// Abstract story machine: sim feeds events, machine tracks progress.
function createStory() {
  return {
    done: 0, active: null, step: 0, timer: -1, timerStarted: false,
    accept() {
      if (this.active !== null || this.done >= 6) return false;
      this.active = this.done; this.step = 0; this.timer = -1; this.timerStarted = false;
      return true;
    },
    contract() { return this.active === null ? null : CONTRACTS[this.active]; },
    currentStep() { const c = this.contract(); return c ? c.steps[this.step] : null; },
    advance() {
      const c = this.contract(); if (!c) return 'none';
      if (c.timed && !this.timerStarted) { this.timerStarted = true; this.timer = c.timed; }
      this.step++;
      if (this.step >= c.steps.length) {
        const reward = c.reward;
        this.done++; this.active = null; this.step = 0; this.timer = -1; this.timerStarted = false;
        return 'complete:' + reward;
      }
      return 'step';
    },
    fail() { this.active = null; this.step = 0; this.timer = -1; this.timerStarted = false; },
    tick(dt) {
      if (this.timerStarted && this.timer > 0) {
        this.timer -= dt;
        if (this.timer <= 0) { this.fail(); return 'timeout'; }
      }
      return null;
    },
  };
}

// ---------- prices & help ----------
const PRICES = { repair: 100, heal: 60, armour: 90, ammo: 70, searchCut: 50, quickFix: 35, rescue: 100, respawn: 100 };
const HELP_TEXT = 'You are Kai, a courier. Work with Mara and the mechanic Nico to crack open the Port Sol blackmail archive. Finish six contracts; the city stays open after the story ends.';

// ---------- save snapshot (pure shape; storage lives in the sim) ----------
const SAVE_KEY = 'saltline-save-v1';
function defaultSave() {
  return {
    v: 1, player: { x: 5, z: 15, hp: 100, armour: 40, ammo: 72, clip: 12, money: 300, weapon: 'sidearm' },
    car: null, contractsDone: 0, clock: 16 + 40 / 60, day: 1,
    weather: { storm: false, intensity: 0, phasesLeft: 0 },
    standing: { 'OLD QUARTER': 10, 'GLASS DISTRICT': 10, 'CORAL HEIGHTS': 10, 'LITTLE PALM': 10, 'PORT SOL': 10, 'SUNSTRAND BEACH': 10 },
    shells: [], races: {}, coastBest: 0, cooldowns: { quickFix: 0, cleanPlate: 0 },
    stats: { distance: 0, contracts: 0, earned: 0, crashes: 0, shots: 0, races: 0, kills: 0 },
    settings: { volume: 0.55, music: true },
  };
}
function saveSnapshot(state) { return JSON.stringify(state); }
function loadSnapshot(str) {
  if (!str) return null;
  try {
    const o = JSON.parse(str);
    if (!o || o.v !== 1) return null;
    const d = defaultSave();
    return { ...d, ...o, player: { ...d.player, ...o.player }, standing: { ...d.standing, ...o.standing }, stats: { ...d.stats, ...o.stats }, settings: { ...d.settings, ...o.settings } };
  } catch { return null; }
}

return {
  stream, fnv1a, clamp, lerp, SEED, ROADS, BOUNDS, PAINT, BUILDING_COLORS, DISTRICTS, DISTRICT_ACCENT,
  SAVE_KEY, defaultSave, saveSnapshot, loadSnapshot,
  districtAt, genCity, cityFingerprint, SITES, FUEL_STATIONS, ROBBERY_SHOPS, TAXI_SPOTS, SHELLS,
  RACES, COAST_RUN, PIERS, BOATS, PARKING, DISTRICT_BOARDS, HELI_ROUTE,
  genPeds, pedPos, VEHICLE_STATS, genVehicles, starsFromCasualties, DISPATCH_FOOT, DISPATCH_CAR,
  searchDecayRate, ledgerBelowBand, tierOf, priceWithDiscount, roadRouteLength, taxiFare,
  taxiTimeLimit, taxiDestination, robberyPay, CHOP_PAY, chopEligible, racePar, FUEL_TANK, fuelBurn,
  genWeather, weatherPhaseBoundary, CHAPTERS, CONTRACTS, chapterOf, createStory, PRICES, HELP_TEXT,
};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = SLD;
