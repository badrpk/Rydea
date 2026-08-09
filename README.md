# Xerus Rider - Ride Hailing Passenger App

Domain: `sastisawari.com` / `rider.xerus.biz`

Xerus Rider is the **next-generation Ride Hailing & Urban Mobility Passenger Application** for `sastisawari.com` and `xerus.biz`.

## Architecture & Features

- **Real-Time GPS Location & Route Search**: Interactive map picker, pickup & dropoff destination selection.
- **Dynamic Fare Estimator**: Transparent distance & duration pricing calculator.
- **Live Driver Tracking**: Real-time driver location updates & ETA calculations.
- **Multi-Rail Payment Engine**: Cash, JazzCash, EasyPaisa, and **Monero (XMR)** zero-knowledge crypto billing.
- **Sophyane AI Assistant**: Built-in voice & chat support for trip assistance and dispute resolution.

## App Structure

```text
xerus_rider/
├── src/
│   ├── components/       # Map, RideCard, PaymentModal, DriverTracker
│   ├── services/         # GPS, DispatchAPI, MoneroVault, SophyaneAI
│   └── views/            # HomeView, BookingView, ActiveTripView, HistoryView
├── public/               # Web App Manifest & App Icons
├── package.json          # React Native / Web App Configuration
└── README.md
```

## Quick Start

```bash
npm install
npm run dev
```
