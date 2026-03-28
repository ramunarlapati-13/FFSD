# SSFD — Smart Firefighter Safety Device

<p align="center">
  <img src="./assets/icon.png" width="96" alt="SSFD Icon" />
</p>

<p align="center">
  <strong>Real-time firefighter vitals, GPS tracking & emergency alerting — in your pocket.</strong><br/>
  A production-ready React Native + Expo mobile companion app for the SSFD monitoring system.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Expo-SDK%2055-000020?logo=expo&logoColor=white" />
  <img src="https://img.shields.io/badge/React%20Native-0.83-61DAFB?logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/Firebase-Realtime%20DB-FFCA28?logo=firebase&logoColor=black" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white" />
</p>

---

## 📖 Project Overview

SSFD (*Smart Firefighter Safety Device*) is an end-to-end IoT system designed to monitor a firefighter's safety in real-time. A wearable embedded device streams live sensor telemetry (body-zone temperature, gas levels, motion, GPS location) directly to Firebase, where this **mobile app** displays the status and triggers critical emergency alerts.

This app is strictly synchronized with hardware data streams and features a failsafe alerting system.

---

## 📸 Screenshots

<p align="center">
  <img src="./docs/screenshots/normal_dashboard.jpg" width="280" alt="Normal Dashboard" />

  <img src="./docs/screenshots/warning_state.jpg" width="280" alt="Warning Dashboard" />

  <img src="./docs/screenshots/critical_alert.jpg" width="280" alt="Critical Alert Modal" />
</p>

---

## 🛡️ Critical Alert System

The app features a multi-channel emergency alert system that triggers when `EMERGENCY`, `SOS`, or a **FALL** is detected:

- **🚨 Visual Popup**: A non-dismissible custom modal appears immediately.
- **🔊 Loud Audio**: A recurring buzzer sound (Incorrect/Wrong buzzer) plays at max volume.
- **📳 Vibration**: Persistent vibration pattern (5s bursts) to alert the user even if the phone is in a pocket.
- **🔄 Auto-Dismiss**: The alert popup, sound, and vibration stop automatically the moment the hardware reports a `NORMAL` state, ensuring responders only focus on active emergencies.

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  FIELD DEVICE (ESP32)                       │
│                                                             │
│  DHT11   ──► Temperature/Humidity ──┐                       │
│  MPU6050 ──► Motion / Fall Detection ├──► Arduino C++ ──►   │
│  MQ-series─► Gas Level (PPM)       ──┤      Wi-Fi           │
│  Neo-6M  ──► GPS Location          ──┘                      │
└─────────────────────────────────────────────────────────────┘
                              │  WebSocket / RTDB
                              ▼
              ┌──────────────────────────────┐
              │   Firebase Realtime Database │
              │  firefighters/firefighter_01 │
              │    temp, gas, falling,       │
              │    lat, lng, device_state    │
              └──────────────────────────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │          SSFD App            │
              │   (React Native + Expo)      │
              │   - Realtime Dashboard       │
              │   - GPS Mapping              │
              │   - Critical Alerts          │
              └──────────────────────────────┘
```

---

## 📱 Mobile App Features

| Feature | Description |
|---|---|
| **3D Architecture** | **Theme-Aware** 3D Building Extrusion (Dark/Light sync). |
| **Map Layer Switch** | Floating toggle for **Satellite** and **3D Vector** views. |
| **Tactical Focus** | High-precision **Crosshair** button to instantly center on target. |
| **Deep-Link Nav** | One-tap **Google/Apple Maps** routing to firefighter coordinates. |
| **Tactical Compass** | Real-time **Orientation & Pitch** visualization on-map. |
| **Theme Switching** | Instant toggle between **Light** and **Dark** modes (Sun/Moon button). |
| **Live Unit Status** | Strictly real-time monitoring of `firefighter_01` node in Firebase. |
| **Emergency Alerts** | Vibration + Sound + Modal popup for critical conditions. |
| **GPS Tracking** | Live map with movement trailing (react-native-maps). |
| **Sensor Suite** | Monitors Temperature, Humidity, and Gas Levels (PPM). |
| **Fall Detection** | Specialized monitoring for sudden impact/falls. |
| **Sensor Health** | Diagnostic grid for GPS, DHT, MPU, and Connectivity. |
| **Heartbeat Monitor** | Status automatically switches to `OFFLINE` if no packet for 30s. |

---

## 🎨 Theme Customization

The SSFD dashboard is designed for both high-stakes daylight monitoring and low-light tactical operations:

- **🌙 Dark Mode**: Deep blue/slate palette to reduce eye strain and save battery life.
- **☀️ Light Mode**: High-contrast, clean design for maximum outdoor legibility.
- **🔄 Instant Toggle**: Accessible Moon/Sun switch in the top-right header.

---

## 🛠️ Tech Stack

### 📱 Mobile Application
| Layer | Technology | Version |
|---|---|---|
| Framework | **React Native** | 0.83.4 |
| Build Toolchain | **Expo** (SDK 55) | 55.x |
| Language | **TypeScript** | ~5.9 |
| Maps | **react-native-maps** | 1.27.x |
| UI & Icons | **lucide-react-native** | ^0.475 |
| Audio/Video | **react-native-webview** (Buzzer) | ^13.16 |

---

## 🔥 Firebase Realtime Database Structure

```json
// Path: firefighter_01/
{
  "device_state": "NORMAL", // "NORMAL" | "EMERGENCY" | "SOS"
  "gas_ppm": 25,
  "fall_detected": false,
  "temperature": 32.5,
  "humidity": 45.0,
  "gps": {
    "lat": 12.9716,
    "lng": 77.5946,
    "fix": true
  }
}
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- [Expo Go](https://expo.dev/go) installed on your Android/iOS device.

### 1. Clone & Install

```bash
git clone https://github.com/Rsmk27/firefighter-monitoring-device.git
cd firefighter-monitoring-device/SSFD
npm install --legacy-peer-deps
```

### 2. Configure Credentials

Create a `.env` file in the root (use `.env.example` as a template):

```env
EXPO_PUBLIC_FIREBASE_API_KEY=your-key
EXPO_PUBLIC_FIREBASE_DATABASE_URL=https://your-proj.asia-southeast1.firebasedatabase.app
...
```

### 3. Launch App

```bash
npx expo start
```
Scan the QR code with **Expo Go**.

---

## 🔒 Security

- **Zero Hardcoded Secrets**: All API keys and Firebase identifiers are strictly managed via environment variables.
- **Git Hardening**: `.env` and `google-services.json` are globally excluded from version control to prevent leaks.
- **Encrypted Data Streams**: Uses secure TLS connections to the Firebase Realtime Database.
- **Failsafe Logic**: In-app safety checks throw descriptive errors if configuration is missing, rather than using fallback keys.

---

## 📄 License & Team

© 2026 **Power Pulse Team**. All rights reserved.

Licensed under the MIT License.
