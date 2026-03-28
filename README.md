# SSFD — Smart Firefighter Safety Device

<p align="center">
  <img src="./assets/icon.png" width="96" alt="SSFD Icon" />
</p>

<p align="center">
  <strong>Real-time firefighter vitals, GPS tracking & emergency alerting — in your pocket.</strong><br/>
  A React Native + Expo mobile companion app for the SSFD monitoring system.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Expo-SDK%2052-000020?logo=expo&logoColor=white" />
  <img src="https://img.shields.io/badge/React%20Native-0.76-61DAFB?logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/Firebase-Realtime%20DB-FFCA28?logo=firebase&logoColor=black" />
  <img src="https://img.shields.io/badge/TypeScript-5.3-3178C6?logo=typescript&logoColor=white" />
</p>

---

## 📖 Project Overview

SSFD (*Smart Firefighter Safety Device*) is an end-to-end IoT system designed to monitor a firefighter's safety in real-time. A wearable embedded device streams live sensor telemetry (body-zone temperature, motion, GPS location) over Wi-Fi directly to Firebase, where a **mobile app** and a **web dashboard** display the data and raise alerts.

This repository contains the **React Native / Expo mobile application** — the companion to the [web dashboard](../web-dashboard/).

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  FIELD DEVICE (ESP8266/ESP32)               │
│                                                             │
│  DHT11 ──► Temperature  ─┐                                  │
│  MPU6050 ► Motion/Fall   ├──► Firmware (Arduino C++) ──►   │
│  Neo-6M  ► GPS Location  ┘         Wi-Fi (802.11 b/g/n)    │
└─────────────────────────────────────────────────────────────┘
                              │  HTTPS / WebSocket
                              ▼
              ┌──────────────────────────────┐
              │   Firebase Realtime Database │
              │  firefighters/{device_id}/   │
              │    temperature, status,      │
              │    latitude, longitude,      │
              │    movement, gps_status,     │
              │    system_status             │
              └──────────────────────────────┘
                     │                  │
          ┌──────────┘                  └──────────┐
          ▼                                        ▼
  ┌───────────────┐                    ┌───────────────────┐
  │   SSFD App    │                    │   Web Dashboard   │
  │ (React Native)│                    │  (Next.js 16)     │
  └───────────────┘                    └───────────────────┘
```

---

## 📱 Mobile App Features

| Feature | Description |
|---|---|
| **Live Status Card** | Real-time device state: `NORMAL`, `WARNING`, `EMERGENCY`, `SOS`, `OFFLINE` |
| **GPS Map** | Live position marker + movement trail on react-native-maps |
| **Temperature Display** | Live DHT11 readings; shows `N/A` gracefully on sensor error (-999) |
| **Motion Monitor** | MPU6050-based movement state: `MOVING` / `STILL` |
| **Sensor Health Grid** | Shows OK/ERROR/SEARCHING for GPS, DHT11, MPU6050, Wi-Fi |
| **Status Breakdown** | Running count of each alert type across the session |
| **Simulation Mode** | Built-in mock data loop — test all states without hardware |
| **Offline Resilience** | Shows last-known data when device goes offline (30 s timeout) |

---

## 🛠️ Tech Stack

### 📱 Frontend (Client Applications)

#### Mobile Application (This Repository)
| Layer | Technology | Version |
|---|---|---|
| Framework | **React Native** | 0.76.x |
| Build Toolchain | **Expo** (SDK 52, stable) | ~52.0.36 |
| Language | **TypeScript** | ~5.3 |
| Maps | **react-native-maps** | 1.20.1 |
| UI & Icons | **lucide-react-native** + svg | ^0.475 |

#### Web Dashboard (Companion App)
| Layer | Technology |
|---|---|
| Framework | **Next.js 16** (App Router) |
| Styling | **TailwindCSS v4** |
| Mapping | **MapLibre GL** |
| Data Visualization | **Recharts**, **Framer Motion** |

### ⚙️ Backend & Infrastructure
| Layer | Technology |
|---|---|
| Real-time Data | **Firebase Realtime Database** (v10 modular) |
| Data Storage | **Firebase Firestore** |
| Hosting & Deploy | **Vercel** (Web), **EAS** (Mobile) |

### 📟 Embedded Firmware (IoT Device)

| Component | Technology |
|---|---|
| Microcontroller | **ESP8266 / ESP32** |
| Language | **Arduino C++** |
| Temperature Sensor | **DHT11** |
| Motion / Fall Sensor | **MPU-6050** (I²C, 6-axis IMU) |
| GPS Module | **Neo-6M** (UART, NMEA protocol) |
| Connectivity | Wi-Fi 802.11 b/g/n → HTTPS |
| Protocol | Firebase REST / Realtime SDK over TLS |

---

## 📡 Communication Protocols

| Protocol | Used For |
|---|---|
| **Wi-Fi 802.11 b/g/n** | Device → Internet connectivity |
| **HTTPS / TLS 1.2+** | Secure data transmission to Firebase |
| **WebSocket (Firebase SDK)** | Real-time push from RTDB to mobile/web |
| **NMEA 0183** | GPS module → ESP UART serial parse |
| **I²C (400 kHz)** | ESP ↔ MPU-6050 sensor bus |
| **1-Wire / GPIO** | ESP ↔ DHT11 temperature sensor |

---

## 🔥 Firebase Realtime Database Schema

```jsonc
// Path: firefighters/{device_id}
{
  "temperature":    36.5,           // °C, -999 on DHT11 error
  "movement":       "MOVING",       // "MOVING" | "STILL"
  "status":         "NORMAL",       // "NORMAL" | "WARNING (HIGH TEMP)" | "EMERGENCY" | "SOS"
  "latitude":       16.50905,       // 0.0 when no GPS fix
  "longitude":      80.65858,
  "gps_status":     "OK",           // "OK" | "SEARCHING (X sats)" | "NO_DATA"
  "system_status":  "OK"            // "OK" | error string
}
```

### Device States

| State | Trigger | UI Color |
|---|---|---|
| `NORMAL` | All vitals in range | 🟢 Green |
| `WARNING` | Temperature approaching limit | 🟡 Amber |
| `EMERGENCY` | Critical temperature / inactivity | 🔴 Red |
| `SOS` | Manual SOS button on device | 🟣 Purple |
| `OFFLINE` | No heartbeat for 30+ seconds | ⚫ Grey |

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm 9+
- [Expo Go](https://expo.dev/go) app installed on your Android / iOS device (**latest version from store**)

### 1. Clone repo

```bash
git clone https://github.com/Rsmk27/firefighter-monitoring-device.git
cd firefighter-monitoring-device/SSFD
```

### 2. Install dependencies

```bash
npm install --legacy-peer-deps
```

### 3. Configure Firebase

Copy `.env.example` to `.env` and fill in your project credentials:

```bash
cp .env.example .env
```

```env
EXPO_PUBLIC_FIREBASE_API_KEY=your-api-key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
EXPO_PUBLIC_FIREBASE_APP_ID=your-app-id
EXPO_PUBLIC_FIREBASE_DATABASE_URL=https://your-project-default-rtdb.firebaseio.com
```

### 4. Start the development server

```bash
npx expo start
```

Scan the QR code with Expo Go on your phone.

---

## 📁 Project Structure

```
SSFD/
├── App.tsx                    # Root component
├── app.json                   # Expo config (name: SSFD)
├── index.ts                   # Entry point
├── .env.example               # Firebase env template
├── assets/                    # App icons & splash
└── src/
    ├── components/
    │   ├── MapWrapper.tsx     # GPS map (react-native-maps)
    │   └── AnalyticsPanel.tsx # Sensor health + status counters
    ├── screens/
    │   └── Dashboard.tsx      # Main dashboard screen
    └── lib/
        ├── firebase.ts        # Firebase RTDB initialisation
        └── types.ts           # Shared TypeScript types
```

---


## 🔒 Security Notes

- All Firebase credentials are loaded from environment variables — **never hardcode API keys**.
- The `.env` file is in `.gitignore` — only `.env.example` is committed.
- Firebase Realtime Database rules should restrict write access to authenticated firmware clients only.

---

## 📸 Screenshots

> Launch the app with **Simulate** mode enabled to see all states without hardware.

---

## 📄 License

MIT © SSFD Project Team
