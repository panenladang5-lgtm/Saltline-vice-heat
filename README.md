# Saltline: Vice Heat

[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01)
[![rank](https://make.fun/badge/gta6-01/panenladang5-lgtm/Saltline-vice-heat/rank.svg)](https://make.fun/c/gta6-01)
[![reward](https://make.fun/badge/gta6-01/panenladang5-lgtm/Saltline-vice-heat/reward.svg)](https://make.fun/c/gta6-01)

An open-world crime game that runs entirely in the browser, offline, from
static files. You are a runner on the Saltline coast: take contracts from
Mara at the dispatch office, move packages, cars and worse across six
districts, and close all six contracts before the city closes on you.

Entry for the make.fun bounty [gta6-01](https://make.fun/c/gta6-01).

## The city

One seeded, deterministic city: 131 buildings, 98 street lamps that wake up
into a full night-lighting layer after dark, 720 pedestrians, 78 vehicles
with working traffic, traffic lights and night parking. Six districts —
Old Quarter, Glass District, Coral Heights, Little Palm, Port Sol and
Sunstrand Beach — each with its own standing: finish contracts and fares to
earn shop discounts, spill blood and it collapses.

## What you can do

- **Six-contract story** in three chapters, with briefings and dialogue,
  timed archive runs, a transmitter job that spikes your heat, guard crews
  that shoot back, and a finale that needs you to arrive clean.
- **Wanted system** — a casualty ledger drives one to five stars; police
  answer on foot and by car, and at three stars the helicopters join,
  sweeping a searchlight over you at night. Break line of sight and let the
  search bar drain.
- **Side money** — taxi fares with time bonuses, 20 Dusk Shells on the
  coast, four shop robberies, a chop shop in Port Sol that takes stolen
  civilian cars, two street races and the nine-gate Coast Run time trial.
- **Crew** — Mara's lookout warns you about incoming units and can cut a
  search for $50; Nico fixes cars, sells a 2-second quick fix in the field
  and fits clean plates that drop a star.
- **A living coast** — wadeable shallows, three boats at the piers, beach
  crowds that scatter when a storm rolls in, tow trucks that haul wrecks
  and abandoned cars, ambulances that revive the fallen, fuel that burns,
  weather that turns, and a day that runs from dawn patrol to last ferry.
- **Save anywhere** — progress, standing, shells, records and your car are
  kept in the browser and restored on Continue.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | Move / drive |
| Mouse drag | Look |
| Mouse click (hold) | Fire |
| Shift | Sprint |
| Space | Jump / handbrake |
| E | Interact (rob a shop register over 4 s) |
| F or Enter | Enter / exit car or boat |
| R | Reload |
| Q or Tab | Swap weapon (sidearm / baton) |
| M | Big map with district standing |
| Esc or P | Pause (stats, save, radio, volume) |

Touch controls appear on touch devices. The simulation steps at a fixed
60 Hz under a 30 fps presentation cap, so it plays the same on any machine.

## Running it

Open `game/index.html` in a desktop browser — no server, no network, no
build step. For local development, `node serve.ts` serves the game at
http://localhost:8080.

Built with three.js (vendored under `game/`), synthesized WebAudio sound
(engine, sirens, shots, a radio loop) and no assets: every building, car,
boat, helicopter and resident is generated from the city seed at load.

## Packaging

`mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts` copies the game and
screenshots into `out/` and writes the entry dossier there.
