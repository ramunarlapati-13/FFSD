# FFSD - Fire Fighter Safety Device

<p align="center">
  <strong>Real-time firefighter vitals, geofence intelligence, incident replay, and recovery support.</strong><br/>
  Multi-unit operational dashboard built with React Native + Expo + Firebase Realtime Database.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Expo-SDK%2055-000020?logo=expo&logoColor=white" />
  <img src="https://img.shields.io/badge/React%20Native-0.83-61DAFB?logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/Firebase-Realtime%20DB-FFCA28?logo=firebase&logoColor=black" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white" />
</p>

---

## Project Overview

FFSD is an end-to-end firefighter safety monitoring app for multi-unit field operations.
Wearable devices stream telemetry into Firebase, and the mobile app provides command-level situational awareness for live response and post-incident analysis.

Core operational goals:
- Continuous monitoring of firefighter vitals and movement.
- Fast identification of emergency states and unsafe positioning.
- Reliable tracking behavior in low-connectivity scenarios.
- Actionable incident replay for debriefing and training.

---

## Current Capabilities

| Capability | What it does |
|---|---|
| Multi-unit fleet monitoring | Tracks multiple firefighter units in one dashboard with fleet cards, status summary, and quick unit switching. |
| Realtime + per-second fallback polling | Uses Firebase realtime listeners as primary stream, with 1-second polling fallback for resilient refresh in unstable connectivity. |
| Database-driven state mapping | Converts incoming `device_state` values into NORMAL/WARNING/EMERGENCY/SOS/OFFLINE operational states. |
| Freshness-based offline detection | Marks units OFFLINE when heartbeat/timestamp freshness window is exceeded. |
| Critical emergency handling | Triggers CRITICAL ALERT modal with looping alarm and vibration for EMERGENCY, SOS, and FALL conditions. |
| Auto-dismiss on normalization | Auto-clears active critical alerts when the triggering unit returns to NORMAL and fall is cleared. |
| Alert cooldown protection | Applies per-unit/per-alert cooldowns to avoid notification/alarm spam during bursty updates. |
| Geofence monitoring (SAFE + DANGER) | Loads zones from Firebase (`config/geofence_zones`) and detects safe-zone breach and danger-zone entry events. |
| Geofence fallback defaults | Automatically falls back to built-in default zones when Firebase config is missing/invalid. |
| Incident history persistence | Writes periodic incident points to Firebase (`incident_history/{firefighterId}/{timestamp}`) for debrief and replay. |
| Incident replay mode | Supports replay window selection (1h/3h/6h), playback speeds (0.5x/1x/2x/4x), play/pause, and frame stepping. |
| Replay scrubber timeline | Provides clickable replay timeline points for fast manual scrubbing to incident moments. |
| Breadcrumb recovery mode | Draws recent movement breadcrumbs (20/50/100 points) to support route backtracking/recovery. |
| Live movement trails | Maintains per-unit path trails and displays selected-unit trajectory on map. |
| Offline map style | Switches map rendering into offline-safe style while preserving overlays and operational markers. |
| Multi-layer map controls | Supports vector and satellite map styles with in-app layer toggle. |
| Focus and external navigation actions | Offers map focus/centering action and opens platform navigation apps toward selected unit coordinates. |
| Geofence/map overlays | Renders SAFE/DANGER polygons, live trail, replay path, and breadcrumb overlays simultaneously. |
| Sensor telemetry panels | Displays temperature, humidity, gas, movement/state, fall status, and unit-level sensor health states (GPS, DHT11, MPU6050, Wi-Fi). |
| Operational analytics panel | Shows status breakdown and sensor health summary for command awareness. |
| Dark/Light theme toggle | Runtime theme switching for better readability across lighting conditions. |

---

## Screenshots

<p align="center">
  <img src="./docs/screenshots/normal_dashboard.jpg" width="280" alt="Normal Dashboard" />
  <img src="./docs/screenshots/warning_state.jpg" width="280" alt="Warning Dashboard" />
  <img src="./docs/screenshots/critical_alert.jpg" width="280" alt="Critical Alert Modal" />
</p>

---

## System Architecture

```text
Field Devices (firefighter_01..N)
  -> Wi-Fi / RTDB publish (temp, humidity, gas, fall, movement, gps, device_state, timestamp)
  -> Firebase Realtime Database
      - firefighter_01/
      - firefighter_02/
      - incident_history/{firefighterId}/{timestamp}
      - config/geofence_zones
  -> FFSD Mobile App (Dashboard)
      - Live map + unit markers + trails
      - Geofence overlays and alerts
      - Fleet vitals and status cards
      - Incident replay and breadcrumb recovery
```

---

## Firebase Data Shape

```json
// firefighter_01/
{
  "device_state": "NORMAL",
  "temperature": 32.5,
  "humidity": 45.0,
  "gas_ppm": 25,
  "fall_detected": false,
  "movement": "MOVING",
  "gps": {
    "lat": 12.9716,
    "lng": 77.5946
  },
  "ts": 1711700000000
}
```

Supported freshness timestamp keys:
- ts
- timestamp
- lastUpdated
- last_update
- updatedAt

```json
// incident_history/firefighter_01/{timestamp}/
{
  "ts": 1711700000000,
  "lat": 12.9716,
  "lng": 77.5946,
  "temperature": 32.5,
  "humidity": 45.0,
  "gas": 25,
  "falling": false,
  "movement": "MOVING",
  "status": "NORMAL"
}
```

```json
// config/geofence_zones/
{
  "zone_1": {
    "name": "Safe Zone A",
    "type": "SAFE",
    "center": { "lat": 12.9716, "lng": 77.5946 },
    "radiusMeters": 500
  },
  "zone_2": {
    "name": "Danger Zone B",
    "type": "DANGER",
    "center": { "lat": 12.98, "lng": 77.585 },
    "radiusMeters": 300
  }
}
```

---

## Project Structure

```text
.
|- app.json
|- App.tsx
|- index.ts
|- package.json
|- tsconfig.json
|- src/
|  |- components/
|  |  |- AlarmPlayer.tsx
|  |  |- AnalyticsPanel.tsx
|  |  |- MapWrapper.tsx
|  |- lib/
|  |  |- firebase.ts
|  |  |- types.ts
|  |- screens/
|     |- Dashboard.tsx
|- assets/
|- docs/screenshots/
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile framework | React Native (Expo SDK 55) |
| Language | TypeScript |
| Backend | Firebase Realtime Database |
| Mapping | MapLibre (inside WebView) + OpenFreemap/Esri styles |
| UI icons | lucide-react-native |
| Alert audio | expo-av |

---

## Getting Started

### Prerequisites

- Node.js 18+
- Expo Go on Android or iOS

### Install

```bash
git clone https://github.com/Rsmk27/firefighter-monitoring-device.git
cd firefighter-monitoring-device/FFSD
npm install --legacy-peer-deps
```

### Configure environment

Create .env from .env.example and set Firebase values.

```env
EXPO_PUBLIC_FIREBASE_API_KEY=your-key
EXPO_PUBLIC_FIREBASE_DATABASE_URL=https://your-project.firebaseio.com
```

### Run

```bash
npx expo start
```

---

## Reliability Notes

- Realtime stream remains primary for responsive updates.
- Per-second polling provides fallback search for each unit.
- OFFLINE behavior is freshness-based and follows database timestamp/state values.
- Critical alert popups are automatically dismissed when conditions normalize.

---

## Security

- Use environment variables for Firebase credentials.
- Do not commit .env or production credential files.
- Keep database rules strict for write/read scopes by role/device.

---

## License

Copyright (c) 2026 Power Pulse Team.
Licensed under MIT.
