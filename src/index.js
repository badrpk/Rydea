#!/usr/bin/env node
"use strict";

const path = require("node:path");
const { RydeaCore, quoteFare } = require("./rydea/core");

function usage() {
  console.log(`Rydea CLI

Usage:
  node src/index.js quote <distance-km> [duration-min]
  node src/index.js demo [state-file]
  node src/index.js status [state-file]
`);
}

const [command, ...args] = process.argv.slice(2);

if (!command || command === "--help" || command === "-h") {
  usage();
  process.exit(0);
}

if (command === "quote") {
  const distanceKm = Number(args[0]);
  const durationMin = Number(args[1] || 0);
  console.log(JSON.stringify(quoteFare({ distanceKm, durationMin }), null, 2));
  process.exit(0);
}

const stateFile = path.resolve(args[0] || "rydea-state.json");
const core = RydeaCore.load(stateFile);

if (command === "status") {
  console.log(JSON.stringify(core.snapshot(), null, 2));
  process.exit(0);
}

if (command === "demo") {
  const trip = core.requestTrip({
    riderId: "demo-rider",
    pickup: { lat: 33.6844, lon: 73.0479 },
    dropoff: { lat: 33.5651, lon: 73.0169 },
    distanceKm: 18.5,
    durationMin: 32,
    paymentMethod: "cash",
    requestedAt: "2026-08-17T00:00:00Z",
  });

  core.assignDriver(trip.id, "demo-driver", "2026-08-17T00:01:00Z");
  core.transition(trip.id, "arriving", "2026-08-17T00:02:00Z");
  core.updateDriverLocation(
    trip.id,
    { lat: 33.68, lon: 73.04 },
    "2026-08-17T00:03:00Z"
  );
  core.save(stateFile);

  console.log(JSON.stringify(core.getTrip(trip.id), null, 2));
  process.exit(0);
}

console.error(`Unknown command: ${command}`);
usage();
process.exit(2);
