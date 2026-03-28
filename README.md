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
| Multi-unit fleet monitoring | Tracks multiple firefighter units simultaneously on a shared map and status dashboard. |
| Per-second firefighter search | Polls each firefighter node every second in addition to realtime listeners for resilient state refresh. |
| Database-driven status | Uses database values (including OFFLINE and timestamp fields) as source of truth for state/freshness. |
| Offline status detection | Units automatically show OFFLINE when telemetry freshness window is exceeded. |
| Emergency alerting | Modal + alarm + vibration for EMERGENCY/SOS/FALL conditions. |
| Auto-dismiss alarms | Active critical popup/alarm auto-clears when the triggering unit returns to NORMAL and fall condition clears. |
| Geofence safety zones | Supports SAFE and DANGER zones from Firebase config with breach/entry detection. |
| Incident history logging | Writes periodic incident points to Firebase for forensic replay. |
| Incident replay controls | 1h/3h/6h windows with play/pause, step, scrub, and speed control (0.5x/1x/2x/4x). |
| Breadcrumb recovery path | Draws recent movement path for selected unit to support backtracking/recovery. |
| Offline map mode | Switches to offline-safe map style while preserving markers, paths, and zone overlays. |
| Smooth map interaction | Reduced camera jitter and better user pan/zoom control under frequent updates. |

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
