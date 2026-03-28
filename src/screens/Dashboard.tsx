import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Vibration, Modal, Platform, StatusBar } from 'react-native';
import { ref, onValue, set, get } from 'firebase/database';
import { rtdb } from '../lib/firebase';
import { Thermometer, Droplets, Activity, ShieldCheck, AlertTriangle, Siren, Zap, Wifi, Wind, AlertCircle, Moon, Sun } from 'lucide-react-native';
import MapWrapper from '../components/MapWrapper';
import AnalyticsPanel, { SensorStatus } from '../components/AnalyticsPanel';
import { DeviceData, DeviceState, FirefighterUnit, GeofenceZone, HistoricalPoint, MovementState } from '../lib/types';
import AlarmPlayer, { AlarmPlayerRef } from '../components/AlarmPlayer';

const DEVICE_IDS = ['firefighter_01', 'firefighter_02'];

const DEFAULT_COORDS = { lat: 16.508948062198765, lng: 80.65804243873862 };

const DEFAULT_ZONES: GeofenceZone[] = [
    {
        id: 'safe-command',
        name: 'Command Safe Zone',
        type: 'SAFE',
        center: { lat: 16.508948062198765, lng: 80.65804243873862 },
        radiusMeters: 500,
    },
    {
        id: 'danger-heat-01',
        name: 'Heat Pocket A',
        type: 'DANGER',
        center: { lat: 16.5122, lng: 80.6625 },
        radiusMeters: 140,
    },
    {
        id: 'danger-radiation-01',
        name: 'Radiation Pocket B',
        type: 'DANGER',
        center: { lat: 16.5064, lng: 80.6544 },
        radiusMeters: 120,
    },
];

const HISTORY_WRITE_COOLDOWN_MS = 15000;
const ALERT_COOLDOWN_MS = 12000;
const REPLAY_SPEED_OPTIONS = [0.5, 1, 2, 4] as const;
const BREADCRUMB_DEPTH_OPTIONS = [20, 50, 100] as const;

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function mapStatus(value: string): DeviceState {
    if (value.includes('EMERGENCY')) return 'EMERGENCY';
    if (value.includes('WARNING')) return 'WARNING';
    if (value.includes('SOS')) return 'SOS';
    return 'NORMAL';
}

function formatReplayTime(ts?: number) {
    if (!ts) return 'N/A';
    return new Date(ts).toLocaleTimeString();
}

function parseZonesFromFirebase(raw: any): GeofenceZone[] {
    if (!raw) return [];
    const zones = Object.entries(raw)
        .map(([key, value]: [string, any]) => ({
            id: value?.id ?? key,
            name: value?.name ?? key,
            type: (value?.type === 'DANGER' ? 'DANGER' : 'SAFE') as GeofenceZone['type'],
            center: {
                lat: Number(value?.center?.lat ?? value?.lat ?? DEFAULT_COORDS.lat),
                lng: Number(value?.center?.lng ?? value?.lng ?? DEFAULT_COORDS.lng),
            },
            radiusMeters: Number(value?.radiusMeters ?? value?.radius ?? 100),
        }))
        .filter(zone => Number.isFinite(zone.center.lat) && Number.isFinite(zone.center.lng) && Number.isFinite(zone.radiusMeters) && zone.radiusMeters > 0);
    return zones;
}

function parseIncomingData(deviceId: string, rtdbData: any): DeviceData {
    const rawLat: number = rtdbData.gps?.lat ?? 0;
    const rawLng: number = rtdbData.gps?.lng ?? 0;
    const hasGpsFix = rawLat !== 0 && rawLng !== 0;

    return {
        device_id: deviceId,
        temperature: rtdbData.temperature ?? null,
        humidity: rtdbData.humidity ?? null,
        gas: rtdbData.gas_ppm ?? 0,
        falling: rtdbData.fall_detected ?? false,
        movement: (rtdbData.movement === 'MOVING' ? 'MOVING' : 'STILL') as MovementState,
        status: mapStatus(rtdbData.device_state || ''),
        battery: 100,
        signal: rtdbData.gps_status === 'OK' ? 100 : rtdbData.gps_status === 'MOCK' ? 80 : 20,
        packetLoss: 0,
        latency: 50,
        location: {
            lat: hasGpsFix ? rawLat : DEFAULT_COORDS.lat,
            lng: hasGpsFix ? rawLng : DEFAULT_COORDS.lng,
        },
    };
}

export default function Dashboard() {
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [fleet, setFleet] = useState<Record<string, FirefighterUnit>>({});
    const [selectedUnitId, setSelectedUnitId] = useState<string>(DEVICE_IDS[0]);
    const [clockTick, setClockTick] = useState<number>(Date.now());
    const [zones, setZones] = useState<GeofenceZone[]>(DEFAULT_ZONES);
    const [zonesSource, setZonesSource] = useState<'firebase' | 'fallback'>('fallback');
    
    // Theme colors
    const theme = {
        bg: isDarkMode ? '#0f172a' : '#f1f5f9',
        card: isDarkMode ? '#1e293b' : '#fff',
        text: isDarkMode ? '#f8fafc' : '#1e293b',
        subtext: isDarkMode ? '#94a3b8' : '#64748b',
        border: isDarkMode ? '#334155' : '#e2e8f0',
    };

    const toggleTheme = () => setIsDarkMode(!isDarkMode);
    const [alertVisible, setAlertVisible] = useState(false);
    const [alertMessage, setAlertMessage] = useState('');
    const [sensorStatusByUnit, setSensorStatusByUnit] = useState<Record<string, SensorStatus>>({});

    const alarmRef = useRef<AlarmPlayerRef>(null);
    const selectedUnitRef = useRef<string>(DEVICE_IDS[0]);
    const historyWriteRef = useRef<Record<string, number>>({});
    const alertCooldownRef = useRef<Record<string, number>>({});
    const geofenceStateRef = useRef<Record<string, { outsideSafe: boolean; dangerZones: string[] }>>({});

    // Replay state
    const [isReplayMode, setIsReplayMode] = useState(false);
    const [replayWindowHours, setReplayWindowHours] = useState(1);
    const [replayData, setReplayData] = useState<HistoricalPoint[]>([]);
    const [replayCursor, setReplayCursor] = useState(0);
    const [isReplayPlaying, setIsReplayPlaying] = useState(false);
    const [replaySpeed, setReplaySpeed] = useState<number>(1);
    const [offlineMapMode, setOfflineMapMode] = useState(false);
    const [breadcrumbMode, setBreadcrumbMode] = useState(true);
    const [breadcrumbDepth, setBreadcrumbDepth] = useState<(typeof BREADCRUMB_DEPTH_OPTIONS)[number]>(50);


    // Analytics state
    const [tempHistory, setTempHistory] = useState<{ time: string; temp: number }[]>([]);
    const [movementHistory, setMovementHistory] = useState<{ time: string; moving: number }[]>([]);
    const [statusCounts, setStatusCounts] = useState<{ name: string; value: number; color: string }[]>([
        { name: 'Normal', value: 0, color: '#10b981' },
        { name: 'Warning', value: 0, color: '#f59e0b' },
        { name: 'Emergency', value: 0, color: '#ef4444' },
        { name: 'SOS', value: 0, color: '#a855f7' },
    ]);

    const pushAnalytics = useCallback((temp: number | null, movement: MovementState, status: string) => {
        const time = new Date().toLocaleTimeString();
        if (temp !== -999 && temp != null) {
            setTempHistory(prev => [...prev.slice(-59), { time, temp }]);
        }
        setMovementHistory(prev => [...prev.slice(-59), { time, moving: movement === 'MOVING' ? 1 : 0 }]);
        setStatusCounts(prev => prev.map(s => {
            const match =
                (s.name === 'Normal' && status === 'NORMAL') ||
                (s.name === 'Warning' && status === 'WARNING') ||
                (s.name === 'Emergency' && status === 'EMERGENCY') ||
                (s.name === 'SOS' && status === 'SOS');
            return match ? { ...s, value: s.value + 1 } : s;
        }));
    }, []);

    const triggerAlert = useCallback(async (unitId: string, alertType: string, body: string, withAlarm: boolean) => {
        const cooldownKey = `${unitId}:${alertType}`;
        const now = Date.now();
        const lastTs = alertCooldownRef.current[cooldownKey] ?? 0;
        if (now - lastTs < ALERT_COOLDOWN_MS) return;
        alertCooldownRef.current[cooldownKey] = now;

        if (withAlarm) {
            Vibration.vibrate([0, 5000, 1000, 5000], false);
            alarmRef.current?.play();
            setAlertMessage(`${unitId} needs attention!\n${body}`);
            setAlertVisible(true);
        }
    }, []);

    const evaluateGeofence = useCallback(async (unit: DeviceData) => {
        const safeZones = zones.filter(zone => zone.type === 'SAFE');
        const dangerZones = zones.filter(zone => zone.type === 'DANGER');

        const insideAnySafe = safeZones.length === 0
            ? true
            : safeZones.some(zone =>
                haversineMeters(unit.location.lat, unit.location.lng, zone.center.lat, zone.center.lng) <= zone.radiusMeters
            );

        const activeDangerZones = dangerZones
            .filter(zone => haversineMeters(unit.location.lat, unit.location.lng, zone.center.lat, zone.center.lng) <= zone.radiusMeters)
            .map(zone => zone.name);

        const previousState = geofenceStateRef.current[unit.device_id] ?? { outsideSafe: false, dangerZones: [] };
        const outsideSafe = !insideAnySafe;

        if (!previousState.outsideSafe && outsideSafe) {
            await triggerAlert(
                unit.device_id,
                '🛡️ FFSD: SAFE ZONE BREACH',
                `${unit.device_id} left all safe zones. Check movement immediately.`,
                false
            );
        }

        for (const zoneName of activeDangerZones) {
            if (!previousState.dangerZones.includes(zoneName)) {
                await triggerAlert(
                    unit.device_id,
                    '⚠️ FFSD: DANGER ZONE ENTRY',
                    `${unit.device_id} entered danger zone: ${zoneName}.`,
                    true
                );
            }
        }

        geofenceStateRef.current[unit.device_id] = {
            outsideSafe,
            dangerZones: activeDangerZones,
        };
    }, [triggerAlert, zones]);

    const writeIncidentHistory = useCallback(async (unit: DeviceData) => {
        const now = Date.now();
        const lastWrite = historyWriteRef.current[unit.device_id] ?? 0;
        if (now - lastWrite < HISTORY_WRITE_COOLDOWN_MS) return;
        historyWriteRef.current[unit.device_id] = now;

        const historyPath = ref(rtdb, `incident_history/${unit.device_id}/${now}`);
        await set(historyPath, {
            ts: now,
            lat: unit.location.lat,
            lng: unit.location.lng,
            temperature: unit.temperature,
            humidity: unit.humidity,
            gas: unit.gas ?? 0,
            falling: unit.falling ?? false,
            movement: unit.movement,
            status: unit.status,
        });
    }, []);

    const loadReplayData = useCallback(async (unitId: string, windowHours: number) => {
        const cutoff = Date.now() - windowHours * 60 * 60 * 1000;
        const snapshot = await get(ref(rtdb, `incident_history/${unitId}`));
        if (!snapshot.exists()) {
            setReplayData([]);
            setReplayCursor(0);
            return;
        }

        const raw = snapshot.val() as Record<string, HistoricalPoint>;
        const points = Object.values(raw)
            .filter(point => point?.ts >= cutoff)
            .sort((a, b) => a.ts - b.ts);

        setReplayData(points);
        setReplayCursor(points.length > 0 ? points.length - 1 : 0);
    }, []);

    useEffect(() => {
        selectedUnitRef.current = selectedUnitId;
    }, [selectedUnitId]);

    useEffect(() => {
        const zonesRef = ref(rtdb, 'config/geofence_zones');
        const unsubZones = onValue(zonesRef, snap => {
            if (!snap.exists()) {
                setZones(DEFAULT_ZONES);
                setZonesSource('fallback');
                return;
            }

            const parsed = parseZonesFromFirebase(snap.val());
            if (parsed.length === 0) {
                setZones(DEFAULT_ZONES);
                setZonesSource('fallback');
                return;
            }

            setZones(parsed);
            setZonesSource('firebase');
        });

        return () => unsubZones();
    }, []);

    useEffect(() => {
        const unsubs = DEVICE_IDS.map(deviceId => {
            const deviceRef = ref(rtdb, deviceId);
            return onValue(deviceRef, async snap => {
                if (!snap.exists()) return;
                const rtdbData = snap.val();
                const data = parseIncomingData(deviceId, rtdbData);

                setSensorStatusByUnit(prev => ({
                    ...prev,
                    [deviceId]: {
                        gps: rtdbData.gps_status === 'OK' || rtdbData.gps_status === 'MOCK' ? 'ok' : 'unknown',
                        dht11: (rtdbData.temperature != null || rtdbData.humidity != null) ? 'ok' : 'error',
                        mpu6050: rtdbData.movement != null ? 'ok' : 'unknown',
                        wifi: rtdbData.dht_status === 'OK' ? 'ok' : 'error',
                    },
                }));

                setFleet(prev => {
                    const existing = prev[deviceId];
                    const lastTrail = existing?.history.map(h => [h.lat, h.lng] as [number, number]) ?? [];
                    const point: HistoricalPoint = {
                        ts: Date.now(),
                        lat: data.location.lat,
                        lng: data.location.lng,
                        temperature: data.temperature,
                        humidity: data.humidity,
                        gas: data.gas ?? 0,
                        falling: data.falling ?? false,
                        movement: data.movement,
                        status: data.status,
                    };

                    const shouldAppendPoint = (() => {
                        const last = lastTrail[lastTrail.length - 1];
                        if (!last) return true;
                        return Math.abs(last[0] - data.location.lat) > 0.0001 || Math.abs(last[1] - data.location.lng) > 0.0001;
                    })();

                    const history = shouldAppendPoint
                        ? [...(existing?.history ?? []).slice(-199), point]
                        : (existing?.history ?? []);

                    return {
                        ...prev,
                        [deviceId]: {
                            ...data,
                            history,
                            lastHeartbeatMs: Date.now(),
                        },
                    };
                });

                if (selectedUnitRef.current === deviceId) {
                    pushAnalytics(data.temperature, data.movement, data.status);
                }

                const isCritical = data.status === 'EMERGENCY' || data.status === 'SOS' || data.falling === true;
                if (isCritical) {
                    await triggerAlert(
                        deviceId,
                        `🚨 FFSD: ${data.status} ALERT`,
                        `${deviceId} requires immediate assistance!${data.falling ? ' (FALL DETECTED)' : ''}`,
                        true
                    );
                }

                await evaluateGeofence(data);
                await writeIncidentHistory(data);
            });
        });

        return () => {
            unsubs.forEach(unsub => unsub());
        };
    }, [evaluateGeofence, pushAnalytics, triggerAlert, writeIncidentHistory]);

    useEffect(() => {
        const interval = setInterval(() => setClockTick(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!isReplayMode || replayData.length === 0 || !isReplayPlaying) return;
        const intervalMs = Math.max(120, Math.round(700 / replaySpeed));
        const interval = setInterval(() => {
            setReplayCursor(prev => {
                if (prev >= replayData.length - 1) {
                    setIsReplayPlaying(false);
                    return prev;
                }
                return prev + 1;
            });
        }, intervalMs);
        return () => clearInterval(interval);
    }, [isReplayMode, replayData, isReplayPlaying, replaySpeed]);

    useEffect(() => {
        if (!isReplayMode) return;
        loadReplayData(selectedUnitId, replayWindowHours);
    }, [isReplayMode, selectedUnitId, replayWindowHours, loadReplayData]);

    const fleetUnits = useMemo(() => {
        return DEVICE_IDS
            .map(id => {
                const unit = fleet[id];
                if (!unit) {
                    return {
                        id,
                        lat: DEFAULT_COORDS.lat,
                        lng: DEFAULT_COORDS.lng,
                        status: 'OFFLINE' as DeviceState,
                        trail: [] as [number, number][],
                    };
                }
                const isOnline = clockTick - unit.lastHeartbeatMs < 60000;
                return {
                    id,
                    lat: unit.location.lat,
                    lng: unit.location.lng,
                    status: isOnline ? unit.status : 'OFFLINE',
                    trail: unit.history.map(point => [point.lat, point.lng] as [number, number]),
                };
            });
    }, [fleet, clockTick]);

    const selectedUnit = fleet[selectedUnitId] ?? null;
    const isSelectedOnline = selectedUnit ? (clockTick - selectedUnit.lastHeartbeatMs < 60000) : false;
    const displayStatus: DeviceState = selectedUnit
        ? (isSelectedOnline ? selectedUnit.status : 'OFFLINE')
        : 'OFFLINE';

    const selectedSensorStatus = sensorStatusByUnit[selectedUnitId] ?? {
        gps: 'unknown',
        dht11: 'unknown',
        mpu6050: 'unknown',
        wifi: 'unknown',
    };

    const replayPath = isReplayMode
        ? replayData.slice(0, replayCursor + 1).map(point => [point.lat, point.lng] as [number, number])
        : [];

    const breadcrumbPath = useMemo(() => {
        if (!breadcrumbMode || !selectedUnit || selectedUnit.history.length === 0) return [] as [number, number][];
        return selectedUnit.history
            .slice(-breadcrumbDepth)
            .map(point => [point.lat, point.lng] as [number, number]);
    }, [breadcrumbMode, selectedUnit, breadcrumbDepth]);

    const scrubberPoints = useMemo(() => {
        if (replayData.length === 0) return [] as Array<{ index: number; ts: number }>;
        const maxPoints = 28;
        const stride = Math.max(1, Math.floor(replayData.length / maxPoints));
        const points: Array<{ index: number; ts: number }> = [];
        for (let i = 0; i < replayData.length; i += stride) {
            points.push({ index: i, ts: replayData[i].ts });
        }
        if (points[points.length - 1]?.index !== replayData.length - 1) {
            points.push({ index: replayData.length - 1, ts: replayData[replayData.length - 1].ts });
        }
        return points;
    }, [replayData]);

    const fleetStatusCounts = useMemo(() => {
        return fleetUnits.reduce(
            (acc, unit) => {
                acc.total += 1;
                if (unit.status === 'OFFLINE') acc.offline += 1;
                if (unit.status === 'EMERGENCY' || unit.status === 'SOS') acc.critical += 1;
                return acc;
            },
            { total: 0, offline: 0, critical: 0 }
        );
    }, [fleetUnits]);

    const getStatusIcon = (s: DeviceState) => {
        switch (s) {
            case 'NORMAL':    return <ShieldCheck size={36} color="#10b981" />;
            case 'WARNING':   return <AlertTriangle size={36} color="#f59e0b" />;
            case 'EMERGENCY': return <Siren size={36} color="#ef4444" />;
            case 'SOS':       return <Zap size={36} color="#a855f7" />;
            default:          return <Wifi size={36} color="#64748b" />;
        }
    };

    const statusBorderColor = () => {
        switch (displayStatus) {
            case 'EMERGENCY': return '#ef4444';
            case 'SOS':       return '#a855f7';
            case 'WARNING':   return '#f59e0b';
            default:          return '#10b981';
        }
    };

    return (
        <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.bg }]}>
            <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} backgroundColor={isDarkMode ? '#020617' : '#f1f5f9'} />
            {/* Hidden alarm sound player */}
            <AlarmPlayer ref={alarmRef} />
            {/* Header */}
            <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
                <View style={styles.headerLeft}>
                    <Text style={styles.appTitle}>FFSD</Text>
                    <View>
                        <Text style={[styles.unitId, { color: theme.text }]}>{selectedUnitId}</Text>
                        <Text style={[styles.unitName, { color: theme.subtext }]}>
                            Monitoring: {selectedUnitId}
                        </Text>
                        <Text style={[styles.lastUpdated, { color: theme.subtext }]}>
                            Last updated: {selectedUnit ? new Date(selectedUnit.lastHeartbeatMs).toLocaleTimeString() : 'Waiting...'}
                        </Text>
                    </View>
                </View>
                <View style={styles.headerRight}>
                    <TouchableOpacity onPress={toggleTheme} style={styles.themeToggle}>
                        {isDarkMode ? <Sun size={20} color="#fbbf24" strokeWidth={2.5} /> : <Moon size={20} color="#64748b" strokeWidth={2} />}
                    </TouchableOpacity>
                    <View style={[styles.liveIndicator, { backgroundColor: isSelectedOnline ? (isDarkMode ? '#064e3b' : '#dcfce7') : (isDarkMode ? '#334155' : '#f1f5f9') }]}>
                        <View style={[styles.liveDot, { backgroundColor: isSelectedOnline ? '#10b981' : '#94a3b8' }]} />
                        <Text style={[styles.liveText, { color: isSelectedOnline ? (isDarkMode ? '#34d399' : '#166534') : theme.subtext }]}>
                            {isSelectedOnline ? 'LIVE' : 'OFFLINE'}
                        </Text>
                    </View>
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
                <View style={[styles.fleetSummary, { backgroundColor: theme.card }]}> 
                    <Text style={[styles.fleetSummaryText, { color: theme.text }]}>Fleet: {fleetStatusCounts.total}</Text>
                    <Text style={[styles.fleetSummaryText, { color: theme.subtext }]}>Critical: {fleetStatusCounts.critical}</Text>
                    <Text style={[styles.fleetSummaryText, { color: theme.subtext }]}>Offline: {fleetStatusCounts.offline}</Text>
                </View>

                <Text style={[styles.sectionTitle, { color: theme.text }]}>Fleet Overview</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fleetOverviewRow}>
                    {fleetUnits.map(unit => {
                        const fullUnit = fleet[unit.id];
                        const cardBorderColor = unit.status === 'EMERGENCY' || unit.status === 'SOS'
                            ? '#ef4444'
                            : unit.status === 'WARNING'
                                ? '#f59e0b'
                                : unit.status === 'OFFLINE'
                                    ? '#64748b'
                                    : '#10b981';
                        return (
                            <TouchableOpacity
                                key={unit.id}
                                style={[
                                    styles.fleetCard,
                                    {
                                        backgroundColor: theme.card,
                                        borderColor: cardBorderColor,
                                    },
                                ]}
                                onPress={() => setSelectedUnitId(unit.id)}
                            >
                                <Text style={[styles.fleetCardTitle, { color: theme.text }]}>{unit.id}</Text>
                                <Text style={[styles.fleetCardStatus, { color: cardBorderColor }]}>{unit.status}</Text>
                                <Text style={[styles.fleetCardMetric, { color: theme.subtext }]}>Temp: {fullUnit?.temperature != null && fullUnit.temperature !== -999 ? `${fullUnit.temperature.toFixed(1)}°C` : 'N/A'}</Text>
                                <Text style={[styles.fleetCardMetric, { color: theme.subtext }]}>Humidity: {fullUnit?.humidity != null ? `${fullUnit.humidity.toFixed(1)}%` : 'N/A'}</Text>
                                <Text style={[styles.fleetCardMetric, { color: theme.subtext }]}>Gas: {fullUnit?.gas != null ? `${fullUnit.gas} PPM` : 'N/A'}</Text>
                                <Text style={[styles.fleetCardMetric, { color: theme.subtext }]}>Motion: {fullUnit?.movement ?? 'STILL'}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.unitTabs}>
                    {DEVICE_IDS.map(id => {
                        const unit = fleetUnits.find(u => u.id === id);
                        const active = id === selectedUnitId;
                        const bg = active ? '#4f46e5' : (isDarkMode ? '#334155' : '#e2e8f0');
                        return (
                            <TouchableOpacity
                                key={id}
                                style={[styles.unitTab, { backgroundColor: bg }]}
                                onPress={() => setSelectedUnitId(id)}
                            >
                                <Text style={[styles.unitTabText, { color: active ? '#fff' : (isDarkMode ? '#e2e8f0' : '#334155') }]}>
                                    {id} ({unit?.status ?? 'OFFLINE'})
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>

                {/* Status Card */}
                <View style={[styles.statusCard, { borderColor: statusBorderColor(), backgroundColor: theme.card }]}>
                    {getStatusIcon(displayStatus)}
                    <Text style={[styles.statusText, { color: statusBorderColor() }]}>{displayStatus}</Text>
                </View>

                {/* Map */}
                <View style={[styles.mapContainer, { borderColor: theme.border }]}>
                    <MapWrapper
                        units={fleetUnits}
                        selectedUnitId={selectedUnitId}
                        zones={zones}
                        replayPath={replayPath}
                        breadcrumbPath={breadcrumbPath}
                        offlineMode={offlineMapMode}
                        isDarkMode={isDarkMode}
                        onSelectUnit={setSelectedUnitId}
                    />
                </View>

                <View style={[styles.replayCard, { backgroundColor: theme.card }]}> 
                    <View style={styles.replayRow}>
                        <Text style={[styles.replayTitle, { color: theme.text }]}>Low-Connectivity & Recovery</Text>
                        <TouchableOpacity
                            style={[styles.replayToggle, { backgroundColor: offlineMapMode ? '#0284c7' : '#475569' }]}
                            onPress={() => setOfflineMapMode(prev => !prev)}
                        >
                            <Text style={styles.replayToggleText}>{offlineMapMode ? 'Offline Map ON' : 'Offline Map OFF'}</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.replayRow}>
                        <Text style={[styles.replayMeta, { color: theme.subtext }]}>Breadcrumb Recovery Path</Text>
                        <TouchableOpacity
                            style={[styles.replayToggle, { backgroundColor: breadcrumbMode ? '#16a34a' : '#475569' }]}
                            onPress={() => setBreadcrumbMode(prev => !prev)}
                        >
                            <Text style={styles.replayToggleText}>{breadcrumbMode ? 'Enabled' : 'Disabled'}</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.replayWindowRow}>
                        {BREADCRUMB_DEPTH_OPTIONS.map(depth => (
                            <TouchableOpacity
                                key={depth}
                                style={[
                                    styles.windowBtn,
                                    { backgroundColor: breadcrumbDepth === depth ? '#16a34a' : (isDarkMode ? '#334155' : '#e2e8f0') },
                                ]}
                                onPress={() => setBreadcrumbDepth(depth)}
                                disabled={!breadcrumbMode}
                            >
                                <Text style={[styles.windowBtnText, { color: breadcrumbDepth === depth ? '#fff' : theme.text }]}>
                                    Last {depth}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <Text style={[styles.replayMeta, { color: theme.subtext }]}>Path points on map: {breadcrumbPath.length}</Text>
                </View>

                <View style={[styles.replayCard, { backgroundColor: theme.card }]}> 
                    <View style={styles.replayRow}>
                        <Text style={[styles.replayTitle, { color: theme.text }]}>Incident Replay</Text>
                        <TouchableOpacity
                            style={[styles.replayToggle, { backgroundColor: isReplayMode ? '#0ea5e9' : '#475569' }]}
                            onPress={() => {
                                const next = !isReplayMode;
                                setIsReplayMode(next);
                                setIsReplayPlaying(false);
                            }}
                        >
                            <Text style={styles.replayToggleText}>{isReplayMode ? 'ON' : 'OFF'}</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.replayWindowRow}>
                        {[1, 3, 6].map(hours => (
                            <TouchableOpacity
                                key={hours}
                                style={[
                                    styles.windowBtn,
                                    { backgroundColor: replayWindowHours === hours ? '#4f46e5' : (isDarkMode ? '#334155' : '#e2e8f0') },
                                ]}
                                onPress={() => setReplayWindowHours(hours)}
                            >
                                <Text style={[styles.windowBtnText, { color: replayWindowHours === hours ? '#fff' : theme.text }]}>{hours}h</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <View style={styles.replayWindowRow}>
                        {REPLAY_SPEED_OPTIONS.map(speed => (
                            <TouchableOpacity
                                key={speed}
                                style={[
                                    styles.windowBtn,
                                    { backgroundColor: replaySpeed === speed ? '#0ea5e9' : (isDarkMode ? '#334155' : '#e2e8f0') },
                                ]}
                                onPress={() => setReplaySpeed(speed)}
                            >
                                <Text style={[styles.windowBtnText, { color: replaySpeed === speed ? '#fff' : theme.text }]}>{speed}x</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <View style={styles.replayControls}>
                        <TouchableOpacity
                            style={[styles.controlBtn, { backgroundColor: isDarkMode ? '#334155' : '#e2e8f0' }]}
                            onPress={() => setReplayCursor(0)}
                            disabled={replayData.length === 0}
                        >
                            <Text style={[styles.controlBtnText, { color: theme.text }]}>Start</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.controlBtn, { backgroundColor: '#0ea5e9' }]}
                            onPress={() => setIsReplayPlaying(prev => !prev)}
                            disabled={!isReplayMode || replayData.length === 0}
                        >
                            <Text style={styles.controlBtnText}>{isReplayPlaying ? 'Pause' : 'Play'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.controlBtn, { backgroundColor: isDarkMode ? '#334155' : '#e2e8f0' }]}
                            onPress={() => setReplayCursor(Math.max(0, replayCursor - 1))}
                            disabled={replayData.length === 0}
                        >
                            <Text style={[styles.controlBtnText, { color: theme.text }]}>-1</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.controlBtn, { backgroundColor: isDarkMode ? '#334155' : '#e2e8f0' }]}
                            onPress={() => setReplayCursor(Math.min(replayData.length - 1, replayCursor + 1))}
                            disabled={replayData.length === 0}
                        >
                            <Text style={[styles.controlBtnText, { color: theme.text }]}>+1</Text>
                        </TouchableOpacity>
                    </View>
                    <Text style={[styles.replayMeta, { color: theme.subtext }]}>Cursor Time: {formatReplayTime(replayData[replayCursor]?.ts)}</Text>
                    <Text style={[styles.replayMeta, { color: theme.subtext }]}>Zones Source: {zonesSource === 'firebase' ? 'Firebase Config' : 'Fallback Defaults'}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrubberRow}>
                        {scrubberPoints.map(point => {
                            const active = point.index <= replayCursor;
                            return (
                                <TouchableOpacity
                                    key={`${point.index}-${point.ts}`}
                                    style={[
                                        styles.scrubberPoint,
                                        { backgroundColor: active ? '#0ea5e9' : (isDarkMode ? '#334155' : '#cbd5e1') },
                                    ]}
                                    onPress={() => setReplayCursor(point.index)}
                                >
                                    <Text style={styles.scrubberPointText}>{formatReplayTime(point.ts)}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                    <Text style={[styles.replayMeta, { color: theme.subtext }]}>Points: {replayData.length}</Text>
                </View>

                {/* Sensor Cards */}
                <View style={styles.sensorsRow}>
                    <View style={[styles.sensorBox, { backgroundColor: theme.card }]}>
                        <View style={styles.sensorIconBg}>
                            <Thermometer size={20} color="#6366f1" />
                        </View>
                        <View style={styles.sensorInfo}>
                            <Text style={[styles.sensorLabel, { color: theme.subtext }]}>TEMPERATURE</Text>
                            <Text style={[styles.sensorValue, { color: theme.text }]}>
                                {(selectedUnit?.temperature != null && selectedUnit.temperature !== -999)
                                    ? `${selectedUnit.temperature.toFixed(1)}°C`
                                    : 'N/A'}
                            </Text>
                        </View>
                    </View>
                    <View style={[styles.sensorBox, { backgroundColor: theme.card }]}>
                        <View style={[styles.sensorIconBg, { backgroundColor: selectedUnit?.status === 'NORMAL' ? (isDarkMode ? '#0c4a6e' : '#e0f2fe') : (isDarkMode ? '#7f1d1d' : '#fee2e2') }]}>
                            <Activity size={20} color={selectedUnit?.status === 'NORMAL' ? (isDarkMode ? '#38bdf8' : '#0ea5e9') : '#ef4444'} />
                        </View>
                        <View style={styles.sensorInfo}>
                            <Text style={[styles.sensorLabel, { color: theme.subtext }]}>MOTION & STATE</Text>
                            <Text style={[styles.sensorValue, { color: theme.text }]}>
                                {selectedUnit?.movement ?? 'STILL'} | {displayStatus}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Sensor Cards Bottom Row */}
                <View style={styles.sensorsRow}>
                    <View style={[styles.sensorBox, { backgroundColor: theme.card }]}>
                        <View style={[styles.sensorIconBg, { backgroundColor: isDarkMode ? '#064e3b' : '#dcfce7' }]}>
                            <Droplets size={20} color="#10b981" />
                        </View>
                        <View style={styles.sensorInfo}>
                            <Text style={[styles.sensorLabel, { color: theme.subtext }]}>HUMIDITY</Text>
                            <Text style={[styles.sensorValue, { color: theme.text }]}>
                                {(selectedUnit?.humidity != null)
                                    ? `${selectedUnit.humidity.toFixed(1)}%`
                                    : 'N/A'}
                            </Text>
                        </View>
                    </View>
                    <View style={[styles.sensorBox, { backgroundColor: theme.card }]}>
                        <View style={[styles.sensorIconBg, { backgroundColor: isDarkMode ? '#7f1d1d' : '#fee2e2' }]}>
                            <Wind size={20} color="#ef4444" />
                        </View>
                        <View style={styles.sensorInfo}>
                            <Text style={[styles.sensorLabel, { color: theme.subtext }]}>GAS LEVEL</Text>
                            <Text style={[styles.sensorValue, { color: theme.text }]}>
                                {selectedUnit?.gas != null ? `${selectedUnit.gas} PPM` : 'N/A'}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Status Alert Row if Falling */}
                {selectedUnit?.falling && (
                    <View style={styles.fallAlert}>
                        <AlertCircle size={24} color="#fff" />
                        <Text style={styles.fallAlertText}>FALL DETECTED!</Text>
                    </View>
                )}

                {/* Analytics */}
                <AnalyticsPanel
                    tempHistory={tempHistory}
                    movementHistory={movementHistory}
                    statusCounts={statusCounts}
                    sensorStatus={selectedSensorStatus}
                    isDarkMode={isDarkMode}
                />

                {/* Footer / Copyright */}
                <View style={[styles.footer, { borderTopColor: theme.border }]}>
                    <Text style={[styles.footerText, { color: theme.subtext }]}>
                        © 2026 Power Pulse Team. All rights reserved.
                    </Text>
                    <Text style={[styles.footerSubtext, { color: theme.subtext }]}>
                        Fire Fighter Safety Device (FFSD) v1.0.0
                    </Text>
                </View>
            </ScrollView>

            {/* Critical Alert Modal */}
            <Modal visible={alertVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalBox}>
                        <Text style={styles.modalIcon}>🚨</Text>
                        <Text style={styles.modalTitle}>CRITICAL ALERT</Text>
                        <Text style={styles.modalMessage}>{alertMessage}</Text>
                        <TouchableOpacity
                            style={styles.modalDismiss}
                            onPress={() => { Vibration.cancel(); alarmRef.current?.stop(); setAlertVisible(false); }}
                        >
                            <Text style={styles.modalDismissText}>DISMISS</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#f1f5f9',
        paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    },
    // Header
    header: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1,
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    appTitle: { fontSize: 22, fontWeight: '900', color: '#4f46e5', letterSpacing: 1 },
    unitId: { fontSize: 10, fontWeight: '800', letterSpacing: 2 },
    unitName: { fontSize: 14, fontWeight: '700' },
    callsign: { fontWeight: '400', color: '#64748b' },
    lastUpdated: { fontSize: 10, marginTop: 2, fontStyle: 'italic' },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    themeToggle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
    },
    liveIndicator: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
    liveDot: { width: 6, height: 6, borderRadius: 3 },
    liveText: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
    simBtn: { backgroundColor: '#e0e7ff', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
    simBtnText: { color: '#4f46e5', fontWeight: '600', fontSize: 12 },
    // Content
    container: { padding: 16, paddingBottom: 32 },
    fleetSummary: {
        borderRadius: 12,
        padding: 12,
        marginBottom: 12,
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    fleetSummaryText: { fontSize: 13, fontWeight: '700' },
    sectionTitle: { fontSize: 15, fontWeight: '800', marginBottom: 10 },
    fleetOverviewRow: { gap: 10, marginBottom: 16 },
    fleetCard: {
        width: 180,
        borderRadius: 14,
        borderWidth: 1.5,
        padding: 12,
    },
    fleetCardTitle: { fontSize: 13, fontWeight: '800', marginBottom: 4 },
    fleetCardStatus: { fontSize: 12, fontWeight: '800', marginBottom: 8 },
    fleetCardMetric: { fontSize: 12, fontWeight: '600', marginBottom: 2 },
    unitTabs: { gap: 10, paddingBottom: 10 },
    unitTab: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
    unitTabText: { fontWeight: '700', fontSize: 12 },
    statusCard: {
        backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
        paddingVertical: 28, borderRadius: 20,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
        marginBottom: 16, borderWidth: 2,
    },
    statusText: { fontSize: 20, fontWeight: '900', marginTop: 8, letterSpacing: 2 },
    mapContainer: {
        height: 385, borderRadius: 24, overflow: 'hidden', backgroundColor: '#e2e8f0',
        marginBottom: 16,
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 4,
    },
    replayCard: {
        borderRadius: 16,
        padding: 12,
        marginBottom: 16,
    },
    replayRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    replayTitle: { fontSize: 15, fontWeight: '800' },
    replayToggle: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
    replayToggleText: { color: '#fff', fontWeight: '700', fontSize: 12 },
    replayWindowRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
    windowBtn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
    windowBtnText: { fontWeight: '700', fontSize: 12 },
    replayControls: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    controlBtn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
    controlBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
    replayMeta: { fontSize: 12, fontWeight: '600' },
    scrubberRow: { gap: 6, marginTop: 8, marginBottom: 8 },
    scrubberPoint: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
    scrubberPointText: { color: '#fff', fontSize: 10, fontWeight: '700' },
    mapPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
    mapPlaceholderText: { color: '#94a3b8', fontSize: 14 },
    sensorsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
    sensorBox: {
        flex: 1, backgroundColor: '#fff', padding: 14, borderRadius: 16,
        flexDirection: 'row', alignItems: 'center', gap: 10,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
    },
    sensorIconBg: { backgroundColor: '#ede9fe', padding: 8, borderRadius: 10 },
    sensorInfo: { flex: 1 },
    sensorLabel: { fontSize: 9, fontWeight: '800', color: '#94a3b8', letterSpacing: 1 },
    sensorValue: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginTop: 2 },
    fallAlert: {
        backgroundColor: '#ef4444', flexDirection: 'row', alignItems: 'center', gap: 12,
        padding: 16, borderRadius: 16, marginTop: -8, marginBottom: 16,
        shadowColor: '#ef4444', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6,
    },
    fallAlertText: { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 1 },
    // Critical alert modal
    modalOverlay: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center', alignItems: 'center', padding: 24,
    },
    modalBox: {
        backgroundColor: '#1e1e2e', borderRadius: 24, padding: 32,
        alignItems: 'center', width: '100%', maxWidth: 340,
        borderWidth: 2, borderColor: '#ef4444',
        shadowColor: '#ef4444', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 10,
    },
    modalIcon: { fontSize: 48, marginBottom: 12 },
    modalTitle: { fontSize: 22, fontWeight: '900', color: '#ef4444', letterSpacing: 2, marginBottom: 12 },
    modalMessage: { fontSize: 15, color: '#e2e8f0', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
    modalDismiss: {
        backgroundColor: '#ef4444', paddingVertical: 14, paddingHorizontal: 48,
        borderRadius: 12,
    },
    modalDismissText: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 2 },
    // Footer
    footer: {
        marginTop: 32,
        paddingTop: 16,
        borderTopWidth: 1,
        alignItems: 'center',
        paddingBottom: 20,
    },
    footerText: { fontSize: 12, fontWeight: '700' },
    footerSubtext: { fontSize: 10, marginTop: 4 },
});
