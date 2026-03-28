export type DeviceState = 'NORMAL' | 'WARNING' | 'EMERGENCY' | 'SOS' | 'OFFLINE';
export type MovementState = 'MOVING' | 'STILL';

export type ZoneType = 'SAFE' | 'DANGER';

export interface GeofenceZone {
    id: string;
    name: string;
    type: ZoneType;
    center: { lat: number; lng: number };
    radiusMeters: number;
}

export interface HistoricalPoint {
    ts: number;
    lat: number;
    lng: number;
    temperature: number | null;
    humidity: number | null;
    gas: number;
    falling: boolean;
    movement: MovementState;
    status: DeviceState;
}

export interface DeviceData {
    device_id: string;
    temperature: number;
    humidity: number;
    movement: MovementState;
    status: DeviceState;
    battery: number;
    signal: number;
    packetLoss: number;
    latency: number;
    gas?: number;
    falling?: boolean;
    location: { lat: number; lng: number };
}

export interface FirefighterUnit extends DeviceData {
    lastHeartbeatMs: number;
    history: HistoricalPoint[];
}
