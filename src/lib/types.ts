export type DeviceState = 'NORMAL' | 'WARNING' | 'EMERGENCY' | 'SOS' | 'OFFLINE';

export interface DeviceData {
    device_id: string;
    temperature: number;
    humidity: number;
    movement: 'MOVING' | 'STILL';
    status: DeviceState;
    battery: number;
    signal: number;
    packetLoss: number;
    latency: number;
    gas?: number;
    falling?: boolean;
    location: { lat: number; lng: number };
}
