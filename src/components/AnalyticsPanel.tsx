import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';

export interface SensorStatus {
    gps: 'ok' | 'error' | 'searching' | 'unknown';
    dht11: 'ok' | 'error' | 'unknown';
    mpu6050: 'ok' | 'error' | 'unknown';
    wifi: 'ok' | 'error' | 'unknown';
    gpsStatusText?: string;
}

interface AnalyticsProps {
    tempHistory: { time: string; temp: number }[];
    movementHistory: { time: string; moving: number }[];
    statusCounts: { name: string; value: number; color: string }[];
    sensorStatus: SensorStatus;
    isDarkMode?: boolean;
}

export default function AnalyticsPanel({ tempHistory, movementHistory, statusCounts, sensorStatus, isDarkMode }: AnalyticsProps) {
    const recentParams = [
        { label: 'GPS', status: sensorStatus.gps },
        { label: 'DHT11', status: sensorStatus.dht11 },
        { label: 'MPU6050', status: sensorStatus.mpu6050 },
        { label: 'Wi-Fi', status: sensorStatus.wifi },
    ];

    const theme = {
        bg: isDarkMode ? '#0f172a' : '#f8fafc',
        card: isDarkMode ? '#1e293b' : '#ffffff',
        text: isDarkMode ? '#f1f5f9' : '#1e293b',
        subtext: isDarkMode ? '#94a3b8' : '#475569',
        border: isDarkMode ? '#334155' : '#f1f5f9',
    };

    return (
        <ScrollView style={[styles.container, { backgroundColor: theme.bg }]}>
            <View style={[styles.card, { backgroundColor: theme.card }]}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>Sensor Health</Text>
                <View style={styles.sensorGrid}>
                    {recentParams.map((param, index) => (
                        <View key={index} style={[styles.sensorRow, { borderBottomColor: theme.border }]}>
                            <Text style={[styles.sensorName, { color: theme.subtext }]}>{param.label}</Text>
                            <Text style={[styles.sensorStatus, param.status === 'ok' ? styles.statusOk : styles.statusErr]}>
                                {param.status.toUpperCase()}
                            </Text>
                        </View>
                    ))}
                </View>
            </View>

            <View style={[styles.card, { backgroundColor: theme.card }]}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>Status Breakdown</Text>
                {statusCounts.map((sc, i) => (
                    <View key={i} style={styles.statRow}>
                        <Text style={[styles.statLabel, { color: theme.subtext }]}>{sc.name}</Text>
                        <Text style={[styles.statValue, { color: sc.color }]}>{sc.value}</Text>
                    </View>
                ))}
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc', padding: 8 },
    card: {
        backgroundColor: '#ffffff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        elevation: 2,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2,
    },
    cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#1e293b', marginBottom: 12 },
    sensorGrid: { flex: 1 },
    sensorRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
    sensorName: { fontSize: 14, color: '#475569', fontWeight: 'bold' },
    sensorStatus: { fontSize: 12, fontWeight: 'bold', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
    statusOk: { backgroundColor: '#dcfce7', color: '#166534' },
    statusErr: { backgroundColor: '#fee2e2', color: '#b91c1c' },
    statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    statLabel: { fontSize: 14, color: '#475569' },
    statValue: { fontSize: 16, fontWeight: 'bold' },
});
