"use strict";

const fs = require("node:fs");
const crypto = require("node:crypto");

const TRIP_TRANSITIONS = Object.freeze({
  requested: new Set(["matched", "cancelled"]),
  matched: new Set(["arriving", "cancelled"]),
  arriving: new Set(["in_progress", "cancelled"]),
  in_progress: new Set(["completed"]),
  completed: new Set(),
  cancelled: new Set(),
});

const PAYMENT_METHODS = new Set(["cash", "jazzcash", "easypaisa", "xmr"]);

function assertFiniteNonNegative(value, name) {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${name} must be a finite non-negative number`);
  }
}

function stableId(prefix, parts) {
  const digest = crypto
    .createHash("sha256")
    .update(JSON.stringify(parts))
    .digest("hex")
    .slice(0, 16);
  return `${prefix}_${digest}`;
}

function normalizePoint(point, name) {
  if (!point || typeof point !== "object") {
    throw new TypeError(`${name} must be an object`);
  }
  const lat = Number(point.lat);
  const lon = Number(point.lon);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new RangeError(`${name}.lat must be between -90 and 90`);
  }
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    throw new RangeError(`${name}.lon must be between -180 and 180`);
  }
  return { lat, lon };
}

function quoteFare({
  distanceKm,
  durationMin = 0,
  baseFare = 100,
  perKm = 45,
  perMinute = 3,
  minimumFare = 150,
  surge = 1,
} = {}) {
  for (const [name, value] of Object.entries({
    distanceKm,
    durationMin,
    baseFare,
    perKm,
    perMinute,
    minimumFare,
    surge,
  })) {
    assertFiniteNonNegative(Number(value), name);
  }
  if (Number(surge) === 0) {
    throw new RangeError("surge must be greater than zero");
  }

  const subtotal =
    Number(baseFare) +
    Number(distanceKm) * Number(perKm) +
    Number(durationMin) * Number(perMinute);
  const total = Math.max(Number(minimumFare), subtotal * Number(surge));

  return Object.freeze({
    currency: "PKR",
    distanceKm: Number(distanceKm),
    durationMin: Number(durationMin),
    baseFare: Number(baseFare),
    perKm: Number(perKm),
    perMinute: Number(perMinute),
    minimumFare: Number(minimumFare),
    surge: Number(surge),
    total: Math.round(total * 100) / 100,
  });
}

class RydeaCore {
  constructor(state = {}) {
    this.trips = new Map((state.trips || []).map((trip) => [trip.id, trip]));
    this.safetyEvents = Array.isArray(state.safetyEvents) ? state.safetyEvents : [];
    this.driverLocations = new Map(
      Object.entries(state.driverLocations || {})
    );
  }

  requestTrip({
    riderId,
    pickup,
    dropoff,
    distanceKm,
    durationMin = 0,
    paymentMethod = "cash",
    requestedAt = new Date().toISOString(),
    pricing = {},
  }) {
    if (!riderId || typeof riderId !== "string") {
      throw new TypeError("riderId is required");
    }
    const method = String(paymentMethod).toLowerCase();
    if (!PAYMENT_METHODS.has(method)) {
      throw new RangeError(`unsupported payment method: ${paymentMethod}`);
    }

    const normalizedPickup = normalizePoint(pickup, "pickup");
    const normalizedDropoff = normalizePoint(dropoff, "dropoff");
    const quote = quoteFare({ distanceKm, durationMin, ...pricing });
    const id = stableId("trip", [
      riderId,
      normalizedPickup,
      normalizedDropoff,
      requestedAt,
    ]);

    if (this.trips.has(id)) {
      return this.trips.get(id);
    }

    const trip = {
      id,
      riderId,
      driverId: null,
      pickup: normalizedPickup,
      dropoff: normalizedDropoff,
      paymentMethod: method,
      quote,
      state: "requested",
      requestedAt,
      history: [{ state: "requested", at: requestedAt }],
    };
    this.trips.set(id, trip);
    return trip;
  }

  assignDriver(tripId, driverId, at = new Date().toISOString()) {
    if (!driverId || typeof driverId !== "string") {
      throw new TypeError("driverId is required");
    }
    const trip = this.#trip(tripId);
    if (trip.state !== "requested") {
      throw new Error(`driver can only be assigned to requested trips`);
    }
    trip.driverId = driverId;
    return this.transition(tripId, "matched", at);
  }

  transition(tripId, nextState, at = new Date().toISOString()) {
    const trip = this.#trip(tripId);
    const allowed = TRIP_TRANSITIONS[trip.state];
    if (!allowed || !allowed.has(nextState)) {
      throw new Error(`invalid trip transition: ${trip.state} -> ${nextState}`);
    }
    trip.state = nextState;
    trip.history.push({ state: nextState, at });
    return trip;
  }

  updateDriverLocation(tripId, point, at = new Date().toISOString()) {
    const trip = this.#trip(tripId);
    if (!trip.driverId) {
      throw new Error("trip has no assigned driver");
    }
    if (["completed", "cancelled"].includes(trip.state)) {
      throw new Error("cannot update location for a terminal trip");
    }
    const location = { ...normalizePoint(point, "driverLocation"), at };
    this.driverLocations.set(tripId, location);
    return location;
  }

  triggerSOS(tripId, reason = "rider_sos", at = new Date().toISOString()) {
    const trip = this.#trip(tripId);
    const event = {
      id: stableId("sos", [tripId, reason, at]),
      tripId,
      riderId: trip.riderId,
      driverId: trip.driverId,
      reason: String(reason),
      at,
    };
    this.safetyEvents.push(event);
    return event;
  }

  getTrip(tripId) {
    return this.#trip(tripId);
  }

  listTrips({ riderId, state } = {}) {
    return [...this.trips.values()].filter((trip) =>
      (!riderId || trip.riderId === riderId) &&
      (!state || trip.state === state)
    );
  }

  snapshot() {
    return {
      trips: [...this.trips.values()],
      safetyEvents: [...this.safetyEvents],
      driverLocations: Object.fromEntries(this.driverLocations),
    };
  }

  save(path) {
    fs.writeFileSync(path, JSON.stringify(this.snapshot(), null, 2) + "\n");
  }

  static load(path) {
    if (!fs.existsSync(path)) {
      return new RydeaCore();
    }
    return new RydeaCore(JSON.parse(fs.readFileSync(path, "utf8")));
  }

  #trip(tripId) {
    const trip = this.trips.get(tripId);
    if (!trip) {
      throw new Error(`unknown trip: ${tripId}`);
    }
    return trip;
  }
}

module.exports = {
  PAYMENT_METHODS,
  TRIP_TRANSITIONS,
  RydeaCore,
  quoteFare,
};
