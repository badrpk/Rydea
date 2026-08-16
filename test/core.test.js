"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { RydeaCore, quoteFare } = require("../src/rydea/core");

test("fare quote is deterministic and respects minimum fare", () => {
  assert.deepEqual(
    quoteFare({ distanceKm: 1, durationMin: 0 }),
    quoteFare({ distanceKm: 1, durationMin: 0 })
  );
  assert.equal(quoteFare({ distanceKm: 0, durationMin: 0 }).total, 150);
});

test("trip request is idempotent for identical deterministic input", () => {
  const core = new RydeaCore();
  const input = {
    riderId: "r1",
    pickup: { lat: 33.68, lon: 73.04 },
    dropoff: { lat: 33.60, lon: 73.00 },
    distanceKm: 10,
    durationMin: 20,
    requestedAt: "2026-08-17T00:00:00Z",
  };
  const a = core.requestTrip(input);
  const b = core.requestTrip(input);
  assert.equal(a.id, b.id);
  assert.equal(core.listTrips().length, 1);
});

test("trip lifecycle rejects illegal transitions", () => {
  const core = new RydeaCore();
  const trip = core.requestTrip({
    riderId: "r1",
    pickup: { lat: 33.68, lon: 73.04 },
    dropoff: { lat: 33.60, lon: 73.00 },
    distanceKm: 10,
    requestedAt: "2026-08-17T00:00:00Z",
  });
  assert.throws(() => core.transition(trip.id, "completed"), /invalid trip transition/);
  core.assignDriver(trip.id, "d1", "2026-08-17T00:01:00Z");
  core.transition(trip.id, "arriving", "2026-08-17T00:02:00Z");
  core.transition(trip.id, "in_progress", "2026-08-17T00:03:00Z");
  core.transition(trip.id, "completed", "2026-08-17T00:10:00Z");
  assert.equal(core.getTrip(trip.id).state, "completed");
});

test("driver location requires an assigned active driver", () => {
  const core = new RydeaCore();
  const trip = core.requestTrip({
    riderId: "r1",
    pickup: { lat: 33.68, lon: 73.04 },
    dropoff: { lat: 33.60, lon: 73.00 },
    distanceKm: 10,
    requestedAt: "2026-08-17T00:00:00Z",
  });
  assert.throws(() => core.updateDriverLocation(trip.id, { lat: 1, lon: 1 }), /no assigned driver/);
});

test("SOS event is persisted with trip identity", () => {
  const core = new RydeaCore();
  const trip = core.requestTrip({
    riderId: "r1",
    pickup: { lat: 33.68, lon: 73.04 },
    dropoff: { lat: 33.60, lon: 73.00 },
    distanceKm: 10,
    requestedAt: "2026-08-17T00:00:00Z",
  });
  const event = core.triggerSOS(trip.id, "unsafe", "2026-08-17T00:05:00Z");
  assert.equal(event.tripId, trip.id);
  assert.equal(core.snapshot().safetyEvents.length, 1);
});

test("state round-trips through JSON", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rydea-"));
  const file = path.join(dir, "state.json");
  const core = new RydeaCore();
  const trip = core.requestTrip({
    riderId: "r1",
    pickup: { lat: 33.68, lon: 73.04 },
    dropoff: { lat: 33.60, lon: 73.00 },
    distanceKm: 10,
    requestedAt: "2026-08-17T00:00:00Z",
  });
  core.save(file);
  const loaded = RydeaCore.load(file);
  assert.equal(loaded.getTrip(trip.id).riderId, "r1");
});

test("unsupported payment methods are rejected", () => {
  const core = new RydeaCore();
  assert.throws(() => core.requestTrip({
    riderId: "r1",
    pickup: { lat: 33.68, lon: 73.04 },
    dropoff: { lat: 33.60, lon: 73.00 },
    distanceKm: 10,
    paymentMethod: "card-number-here",
    requestedAt: "2026-08-17T00:00:00Z",
  }), /unsupported payment method/);
});
