import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Vibration, Modal, Platform, StatusBar } from 'react-native';
import { ref, onValue } from 'firebase/database';
import { rtdb } from '../lib/firebase';
import { Thermometer, Droplets, Activity, ShieldCheck, AlertTriangle, Siren, Zap, Wifi, Wind, AlertCircle, Moon, Sun } from 'lucide-react-native';
import MapWrapper from '../components/MapWrapper';
import AnalyticsPanel, { SensorStatus } from '../components/AnalyticsPanel';
import { DeviceData, DeviceState } from '../lib/types';
import AlarmPlayer, { AlarmPlayerRef } from '../components/AlarmPlayer';

const DEVICE_ID = 'firefighter_01';

export default function Dashboard() {
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [deviceData, setDeviceData] = useState<DeviceData | null>(null);
    
    // Theme colors
    const theme = {
        bg: isDarkMode ? '#0f172a' : '#f1f5f9',
        card: isDarkMode ? '#1e293b' : '#fff',
        text: isDarkMode ? '#f8fafc' : '#1e293b',
        subtext: isDarkMode ? '#94a3b8' : '#64748b',
        border: isDarkMode ? '#334155' : '#e2e8f0',
    };

    const toggleTheme = () => setIsDarkMode(!isDarkMode);
    const [lastHeartbeat, setLastHeartbeat] = useState<Date | null>(null);
    const [trail, setTrail] = useState<[number, number][]>([]);
    const [secondsOffline, setSecondsOffline] = useState<number>(0);
    const [alertVisible, setAlertVisible] = useState(false);
    const [alertMessage, setAlertMessage] = useState('');
    const [sensorStatus, setSensorStatus] = useState<SensorStatus>({
        gps: 'unknown',
        dht11: 'unknown',
        mpu6050: 'unknown',
        wifi: 'unknown',
    });

    const lastKnownData = useRef<DeviceData | null>(null);
    const mountTime = useRef<Date>(new Date());
    const alarmRef = useRef<AlarmPlayerRef>(null);


    // Analytics state
    const [tempHistory, setTempHistory] = useState<{ time: string; temp: number }[]>([]);
    const [movementHistory, setMovementHistory] = useState<{ time: string; moving: number }[]>([]);
    const [statusCounts, setStatusCounts] = useState<{ name: string; value: number; color: string }[]>([
        { name: 'Normal', value: 0, color: '#10b981' },
        { name: 'Warning', value: 0, color: '#f59e0b' },
        { name: 'Emergency', value: 0, color: '#ef4444' },
        { name: 'SOS', value: 0, color: '#a855f7' },
    ]);

    const pushAnalytics = useCallback((temp: number, movement: 'MOVING' | 'STILL', status: string) => {
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

    useEffect(() => {
        setTrail([]);
        setTempHistory([]);
        setMovementHistory([]);

        // Real Firebase RTDB listener matching the screenshot
        const deviceRef = ref(rtdb, DEVICE_ID);
        const unsubDevice = onValue(deviceRef, snap => {
            if (!snap.exists()) return;
            const rtdbData = snap.val();
            
            // Map status from device_state
            let mappedStatus = 'NORMAL';
            const s: string = rtdbData.device_state || '';
            if (s.includes('EMERGENCY')) mappedStatus = 'EMERGENCY';
            else if (s.includes('WARNING')) mappedStatus = 'WARNING';
            else if (s.includes('SOS')) mappedStatus = 'SOS';

            const DEFAULT_LAT = 16.508948062198765;
            const DEFAULT_LNG = 80.65804243873862;
            
            // Map GPS from nested object seen in screenshot
            const rawLat: number = rtdbData.gps?.lat ?? 0;
            const rawLng: number = rtdbData.gps?.lng ?? 0;
            const hasGpsFix = rawLat !== 0 && rawLng !== 0;

            const data: any = {
                device_id: DEVICE_ID,
                temperature: rtdbData.temperature ?? null,
                humidity: rtdbData.humidity ?? null,
                gas: rtdbData.gas_ppm ?? 0,
                falling: rtdbData.fall_detected ?? false,
                movement: rtdbData.movement === 'MOVING' ? 'MOVING' : 'STABLE',
                status: mappedStatus as DeviceState,
                systemStatus: rtdbData.dht_status || 'UNKNOWN',
                battery: 100,
                signal: rtdbData.gps_status === 'OK' ? 100 : rtdbData.gps_status === 'MOCK' ? 80 : 20,
                packetLoss: 0,
                latency: 50,
                location: {
                    lat: hasGpsFix ? rawLat : DEFAULT_LAT,
                    lng: hasGpsFix ? rawLng : DEFAULT_LNG,
                },
            };

            setSensorStatus({
                gps: rtdbData.gps_status === 'OK' || rtdbData.gps_status === 'MOCK' ? 'ok'
                    : 'unknown',
                dht11: (rtdbData.temperature != null || rtdbData.humidity != null) ? 'ok' : 'error',
                mpu6050: rtdbData.movement != null ? 'ok' : 'unknown',
                wifi: rtdbData.dht_status === 'OK' ? 'ok' : 'error',
            });

            console.log("RTDB DATA RECEIVED:", rtdbData);
            console.log("STATUS:", mappedStatus, "FALLING:", data.falling);
            setDeviceData(data);
            lastKnownData.current = data;
            setLastHeartbeat(new Date());
            setSecondsOffline(0);
            if (data.temperature !== null) pushAnalytics(data.temperature, data.movement, mappedStatus);

            // Critical alert: buzzer + notification
            const isCritical = mappedStatus === 'EMERGENCY' || mappedStatus === 'SOS' || data.falling === true;
            if (isCritical && Date.now() - lastAlertTime.current > 10000) {
                lastAlertTime.current = Date.now();
                Vibration.vibrate([0, 5000, 1000, 5000, 1000, 5000, 1000, 5000, 1000, 5000], false);
                alarmRef.current?.play();
                setAlertMessage(`${DEVICE_ID} needs attention!\nStatus: ${mappedStatus}${data.falling ? '\n⚠️ FALL DETECTED' : ''}`);
                setAlertVisible(true);
            } else if (!isCritical) {
                // Auto-dismiss when state returns to NORMAL
                Vibration.cancel();
                alarmRef.current?.stop();
                setAlertVisible(false);
            }

            if (hasGpsFix) {
                setTrail(prev => {
                    const last = prev[prev.length - 1];
                    if (!last || Math.abs(last[0] - data.location.lat) > 0.0001 || Math.abs(last[1] - data.location.lng) > 0.0001) {
                        return [...prev.slice(-50), [data.location.lat, data.location.lng]];
                    }
                    return prev;
                });
            }
        });

        return () => unsubDevice();
    }, [pushAnalytics]);

    // Tick secondsOffline every second
    useEffect(() => {
        const tick = setInterval(() => {
            const now = Date.now();
            const base = lastHeartbeat ? lastHeartbeat.getTime() : mountTime.current.getTime();
            const secs = Math.floor((now - base) / 1000);
            setSecondsOffline(secs >= 60 ? secs : 0);
        }, 1000);
        return () => clearInterval(tick);
    }, [lastHeartbeat]);

    // lastAlertTime ref for critical buzzer cooldown
    const lastAlertTime = useRef<number>(0);

    const isOnline = lastHeartbeat !== null && Date.now() - lastHeartbeat.getTime() < 60000;
    const isDeviceOffline = !isOnline && secondsOffline >= 60;
    const displayData = useMemo(
        () => (isDeviceOffline && lastKnownData.current ? lastKnownData.current : deviceData),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [deviceData, isDeviceOffline, secondsOffline]
    );
    const displayStatus: DeviceState = isDeviceOffline ? 'OFFLINE' : (displayData?.status ?? 'NORMAL');

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
                    <Text style={styles.appTitle}>SSFD</Text>
                    <View>
                        <Text style={[styles.unitId, { color: theme.text }]}>{DEVICE_ID}</Text>
                        <Text style={[styles.unitName, { color: theme.subtext }]}>
                            RSMK <Text style={styles.callsign}>(Omega)</Text>
                        </Text>
                        <Text style={[styles.lastUpdated, { color: theme.subtext }]}>
                            Last updated: {lastHeartbeat ? lastHeartbeat.toLocaleTimeString() : 'Waiting...'}
                        </Text>
                    </View>
                </View>
                <View style={styles.headerRight}>
                    <TouchableOpacity onPress={toggleTheme} style={styles.themeToggle}>
                        {isDarkMode ? <Sun size={20} color="#fbbf24" strokeWidth={2.5} /> : <Moon size={20} color="#64748b" strokeWidth={2} />}
                    </TouchableOpacity>
                    <View style={[styles.liveIndicator, { backgroundColor: isOnline ? (isDarkMode ? '#064e3b' : '#dcfce7') : (isDarkMode ? '#334155' : '#f1f5f9') }]}>
                        <View style={[styles.liveDot, { backgroundColor: isOnline ? '#10b981' : '#94a3b8' }]} />
                        <Text style={[styles.liveText, { color: isOnline ? (isDarkMode ? '#34d399' : '#166534') : theme.subtext }]}>
                            {isOnline ? 'LIVE' : 'OFFLINE'}
                        </Text>
                    </View>
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
                {/* Status Card */}
                <View style={[styles.statusCard, { borderColor: statusBorderColor(), backgroundColor: theme.card }]}>
                    {getStatusIcon(displayStatus)}
                    <Text style={[styles.statusText, { color: statusBorderColor() }]}>{displayStatus}</Text>
                </View>

                {/* Map */}
                <View style={[styles.mapContainer, { borderColor: theme.border }]}>
                    <MapWrapper
                        lat={displayData?.location?.lat ?? 16.508948062198765}
                        lng={displayData?.location?.lng ?? 80.65804243873862}
                        trail={trail}
                        status={displayData ? displayStatus : 'CONNECTING...'}
                        isDarkMode={isDarkMode}
                    />
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
                                {(displayData?.temperature != null && displayData.temperature !== -999)
                                    ? `${displayData.temperature.toFixed(1)}°C`
                                    : 'N/A'}
                            </Text>
                        </View>
                    </View>
                    <View style={[styles.sensorBox, { backgroundColor: theme.card }]}>
                        <View style={[styles.sensorIconBg, { backgroundColor: displayData?.status === 'NORMAL' ? (isDarkMode ? '#0c4a6e' : '#e0f2fe') : (isDarkMode ? '#7f1d1d' : '#fee2e2') }]}>
                            <Activity size={20} color={displayData?.status === 'NORMAL' ? (isDarkMode ? '#38bdf8' : '#0ea5e9') : '#ef4444'} />
                        </View>
                        <View style={styles.sensorInfo}>
                            <Text style={[styles.sensorLabel, { color: theme.subtext }]}>MOTION & STATE</Text>
                            <Text style={[styles.sensorValue, { color: theme.text }]}>
                                {displayData?.movement ?? 'STABLE'} | {displayData?.status ?? 'NORMAL'}
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
                                {(displayData?.humidity != null)
                                    ? `${displayData.humidity.toFixed(1)}%`
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
                                {displayData?.gas != null ? `${displayData.gas} PPM` : 'N/A'}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Status Alert Row if Falling */}
                {displayData?.falling && (
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
                    sensorStatus={sensorStatus}
                    isDarkMode={isDarkMode}
                />

                {/* Footer / Copyright */}
                <View style={[styles.footer, { borderTopColor: theme.border }]}>
                    <Text style={[styles.footerText, { color: theme.subtext }]}>
                        © 2026 Power Pulse Team. All rights reserved.
                    </Text>
                    <Text style={[styles.footerSubtext, { color: theme.subtext }]}>
                        Firefighter Safety Dashboard (SSFD) v1.0.0
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
    statusCard: {
        backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
        paddingVertical: 28, borderRadius: 20,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
        marginBottom: 16, borderWidth: 2,
    },
    statusText: { fontSize: 20, fontWeight: '900', marginTop: 8, letterSpacing: 2 },
    mapContainer: {
        height: 350, borderRadius: 24, overflow: 'hidden', backgroundColor: '#e2e8f0',
        marginBottom: 16,
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 4,
    },
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
