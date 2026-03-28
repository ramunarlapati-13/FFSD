import React, { useRef, useEffect, useState, useMemo } from 'react';
import { StyleSheet, View, TouchableOpacity, Linking, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { Layers, Map as MapIcon, Crosshair, Navigation } from 'lucide-react-native';
import { DeviceState, GeofenceZone } from '../lib/types';

interface FleetMapUnit {
    id: string;
    lat: number;
    lng: number;
    status: DeviceState;
    trail: [number, number][];
}

interface MapProps {
    units: FleetMapUnit[];
    selectedUnitId: string;
    zones: GeofenceZone[];
    replayPath: [number, number][];
    breadcrumbPath: [number, number][];
    offlineMode: boolean;
    isDarkMode: boolean;
    onSelectUnit: (unitId: string) => void;
}

const MapLibreHTML = `
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <script src="https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.js"></script>
    <link href="https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.css" rel="stylesheet" />
    <style>
        body { margin: 0; padding: 0; background: #020617; overflow: hidden; }
        #map { position: absolute; top: 0; bottom: 0; width: 100%; height: 100%; }
        
        .marker {
            font-size: 40px;
            text-align: center;
            line-height: 40px;
            filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
        }

        @keyframes pulse {
            0% { transform: scale(1); opacity: 0.8; }
            100% { transform: scale(3.5); opacity: 0; }
        }
        .pulse {
            position: absolute;
            left: 50%;
            top: 50%;
            width: 30px;
            height: 30px;
            margin-left: -15px;
            margin-top: -15px;
            background: rgba(59, 130, 246, 0.6);
            border-radius: 50%;
            animation: pulse 1.5s infinite;
        }
        
        /* Custom Compass Logic Position */
        .maplibregl-ctrl-top-left { top: 10px; left: 10px; }
    </style>
</head>
<body>
    <div id="map"></div>
    <script>
        let map;
        let markers = {};
        let currentMode = null;
        let currentLayer = 'vector';
        let currentOffline = false;
        let isUserInteracting = false;
        let userInteractTimeout = null;
        let lastAutoCenterAt = 0;
        let lastSelectedUnitId = null;
        let selectedUnit = null;
        let latestCoords = [80.658042, 16.508948];
        
        const STYLES = {
            dark: 'https://tiles.openfreemap.org/styles/dark',
            light: 'https://tiles.openfreemap.org/styles/bright',
            offline: {
                "version": 8,
                "sources": {},
                "layers": [{
                    "id": "offline-background",
                    "type": "background",
                    "paint": {
                        "background-color": "#0b1220"
                    }
                }]
            },
            satellite: {
                "version": 8,
                "sources": {
                    "satellite": {
                        "type": "raster",
                        "tiles": ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
                        "tileSize": 256,
                        "attribution": "Esri"
                    }
                },
                "layers": [{
                    "id": "satellite",
                    "type": "raster",
                    "source": "satellite"
                }]
            }
        };

        function add3DLayer() {
            if (currentLayer === 'satellite') return;
            if (map.getLayer('3d-buildings')) return;
            
            const layers = map.getStyle().layers;
            let labelLayerId;
            for (let i = 0; i < layers.length; i++) {
                if (layers[i].type === 'symbol' && layers[i].layout['text-field']) {
                    labelLayerId = layers[i].id;
                    break;
                }
            }

            map.addLayer({
                'id': '3d-buildings',
                'source': 'openmaptiles',
                'source-layer': 'building',
                'type': 'fill-extrusion',
                'minzoom': 14,
                'paint': {
                    'fill-extrusion-color': currentMode ? '#334155' : '#e2e8f0',
                    'fill-extrusion-height': ['get', 'render_height'],
                    'fill-extrusion-base': ['get', 'render_min_height'],
                    'fill-extrusion-opacity': 0.8,
                    'fill-extrusion-vertical-gradient': true
                }
            }, labelLayerId);
        }

        function markerColor(status) {
            if (status === 'EMERGENCY') return '#ef4444';
            if (status === 'SOS') return '#a855f7';
            if (status === 'WARNING') return '#f59e0b';
            if (status === 'OFFLINE') return '#64748b';
            return '#10b981';
        }

        function createMarkerElement(unit) {
            const el = document.createElement('button');
            el.style.width = '26px';
            el.style.height = '26px';
            el.style.borderRadius = '13px';
            el.style.border = '2px solid #ffffff';
            el.style.background = markerColor(unit.status);
            el.style.cursor = 'pointer';
            el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.4)';
            el.title = unit.id;
            el.onclick = () => {
                if (window.ReactNativeWebView) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'selectUnit', unitId: unit.id }));
                }
            };
            return el;
        }

        function toCircle(center, radiusMeters, points = 48) {
            const coords = [];
            const lat = center[1] * Math.PI / 180;
            const lng = center[0] * Math.PI / 180;
            const d = radiusMeters / 6378137;
            for (let i = 0; i <= points; i++) {
                const brng = (2 * Math.PI * i) / points;
                const lat2 = Math.asin(Math.sin(lat) * Math.cos(d) + Math.cos(lat) * Math.sin(d) * Math.cos(brng));
                const lng2 = lng + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat), Math.cos(d) - Math.sin(lat) * Math.sin(lat2));
                coords.push([lng2 * 180 / Math.PI, lat2 * 180 / Math.PI]);
            }
            return coords;
        }

        function setupOverlay() {
            if (!map.getSource('trail')) {
                map.addSource('trail', {
                    'type': 'geojson',
                    'data': { 'type': 'Feature', 'geometry': { 'type': 'LineString', 'coordinates': [] } }
                });
            }

            if (!map.getLayer('trail-layer')) {
                map.addLayer({
                    'id': 'trail-layer',
                    'type': 'line',
                    'source': 'trail',
                    'layout': { 'line-join': 'round', 'line-cap': 'round' },
                    'paint': { 'line-color': '#3b82f6', 'line-width': 6, 'line-opacity': 0.8 }
                });
            }

            if (!map.getSource('replay')) {
                map.addSource('replay', {
                    'type': 'geojson',
                    'data': { 'type': 'Feature', 'geometry': { 'type': 'LineString', 'coordinates': [] } }
                });
            }

            if (!map.getSource('breadcrumb-line')) {
                map.addSource('breadcrumb-line', {
                    'type': 'geojson',
                    'data': { 'type': 'Feature', 'geometry': { 'type': 'LineString', 'coordinates': [] } }
                });
            }

            if (!map.getLayer('breadcrumb-line-layer')) {
                map.addLayer({
                    'id': 'breadcrumb-line-layer',
                    'type': 'line',
                    'source': 'breadcrumb-line',
                    'layout': { 'line-join': 'round', 'line-cap': 'round' },
                    'paint': {
                        'line-color': '#f59e0b',
                        'line-width': 3,
                        'line-opacity': 0.95,
                        'line-dasharray': [0.8, 1.8]
                    }
                });
            }

            if (!map.getSource('breadcrumb-points')) {
                map.addSource('breadcrumb-points', {
                    'type': 'geojson',
                    'data': { 'type': 'FeatureCollection', 'features': [] }
                });
            }

            if (!map.getLayer('breadcrumb-points-layer')) {
                map.addLayer({
                    'id': 'breadcrumb-points-layer',
                    'type': 'circle',
                    'source': 'breadcrumb-points',
                    'paint': {
                        'circle-radius': 3,
                        'circle-color': '#fbbf24',
                        'circle-stroke-color': '#1f2937',
                        'circle-stroke-width': 1,
                        'circle-opacity': 0.95,
                    }
                });
            }

            if (!map.getLayer('replay-layer')) {
                map.addLayer({
                    'id': 'replay-layer',
                    'type': 'line',
                    'source': 'replay',
                    'layout': { 'line-join': 'round', 'line-cap': 'round' },
                    'paint': {
                        'line-color': '#22d3ee',
                        'line-width': 4,
                        'line-opacity': 0.95,
                        'line-dasharray': [1.5, 1.5]
                    }
                });
            }

            if (!map.getSource('zones')) {
                map.addSource('zones', {
                    type: 'geojson',
                    data: { type: 'FeatureCollection', features: [] }
                });
            }

            if (!map.getLayer('zones-fill')) {
                map.addLayer({
                    id: 'zones-fill',
                    type: 'fill',
                    source: 'zones',
                    paint: {
                        'fill-color': ['match', ['get', 'zoneType'], 'SAFE', '#22c55e', '#ef4444'],
                        'fill-opacity': 0.18,
                    }
                });
            }

            if (!map.getLayer('zones-outline')) {
                map.addLayer({
                    id: 'zones-outline',
                    type: 'line',
                    source: 'zones',
                    paint: {
                        'line-color': ['match', ['get', 'zoneType'], 'SAFE', '#22c55e', '#ef4444'],
                        'line-width': 2,
                        'line-opacity': 0.9,
                    }
                });
            }
        }

        function updateMarkers(units) {
            const nextIds = {};
            units.forEach(unit => {
                nextIds[unit.id] = true;
                if (!markers[unit.id]) {
                    markers[unit.id] = new maplibregl.Marker({ element: createMarkerElement(unit) })
                        .setLngLat([unit.lng, unit.lat])
                        .addTo(map);
                } else {
                    markers[unit.id].setLngLat([unit.lng, unit.lat]);
                    const el = markers[unit.id].getElement();
                    el.style.background = markerColor(unit.status);
                }
            });

            Object.keys(markers).forEach(id => {
                if (!nextIds[id]) {
                    markers[id].remove();
                    delete markers[id];
                }
            });
        }

        function updateTrail(units, selectedUnitId) {
            const selected = units.find(u => u.id === selectedUnitId) || units[0] || null;
            selectedUnit = selected;
            if (!selected) return;
            latestCoords = [selected.lng, selected.lat];
            const coords = selected.trail.map(p => [p[1], p[0]]);
            const source = map.getSource('trail');
            if (source) {
                source.setData({
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates: coords }
                });
            }

            const now = Date.now();
            const selectedChanged = lastSelectedUnitId !== selectedUnitId;
            const shouldCenter = !isUserInteracting && (selectedChanged || now - lastAutoCenterAt > 1500);
            if (shouldCenter) {
                map.easeTo({ center: latestCoords, duration: selectedChanged ? 900 : 650, essential: true });
                lastAutoCenterAt = now;
            }
            lastSelectedUnitId = selectedUnitId;
        }

        function updateReplayPath(replayPath) {
            const source = map.getSource('replay');
            if (source) {
                source.setData({
                    type: 'Feature',
                    geometry: {
                        type: 'LineString',
                        coordinates: replayPath.map(p => [p[1], p[0]])
                    }
                });
            }
        }

        function updateBreadcrumbPath(breadcrumbPath) {
            const lineSource = map.getSource('breadcrumb-line');
            if (lineSource) {
                lineSource.setData({
                    type: 'Feature',
                    geometry: {
                        type: 'LineString',
                        coordinates: breadcrumbPath.map(p => [p[1], p[0]])
                    }
                });
            }

            const pointsSource = map.getSource('breadcrumb-points');
            if (pointsSource) {
                pointsSource.setData({
                    type: 'FeatureCollection',
                    features: breadcrumbPath.map((p, index) => ({
                        type: 'Feature',
                        properties: { step: index },
                        geometry: {
                            type: 'Point',
                            coordinates: [p[1], p[0]],
                        }
                    }))
                });
            }
        }

        function updateZones(zones) {
            const source = map.getSource('zones');
            if (!source) return;
            const features = zones.map(zone => ({
                type: 'Feature',
                properties: { zoneType: zone.type, zoneId: zone.id, name: zone.name },
                geometry: {
                    type: 'Polygon',
                    coordinates: [toCircle([zone.center.lng, zone.center.lat], zone.radiusMeters)]
                }
            }));
            source.setData({ type: 'FeatureCollection', features });
        }

        window.updateData = (data) => {
            if (!map) {
                currentMode = data.isDarkMode;
                currentLayer = data.layerType || 'vector';
                currentOffline = !!data.offlineMode;
                const first = data.units?.[0];
                latestCoords = first ? [first.lng, first.lat] : [80.658042, 16.508948];
                
                let initialStyle = currentOffline
                    ? STYLES.offline
                    : (currentLayer === 'satellite' ? STYLES.satellite : (data.isDarkMode ? STYLES.dark : STYLES.light));
                
                map = new maplibregl.Map({
                    container: 'map',
                    style: initialStyle, 
                    center: latestCoords,
                    zoom: 17,
                    pitch: 60,
                    bearing: -17,
                    antialias: true,
                    interactive: true,
                    dragRotate: true,
                    touchZoomRotate: true,
                    touchPitch: true,
                    pitchWithRotate: true
                });

                // Add Compass Navigation Control
                map.addControl(new maplibregl.NavigationControl({
                    showCompass: true,
                    showZoom: false,
                    visualizePitch: true
                }), 'top-left');

                map.on('style.load', () => {
                    if (currentLayer === 'vector') add3DLayer();
                    setupOverlay();
                    updateMarkers(data.units || []);
                    updateTrail(data.units || [], data.selectedUnitId);
                    updateReplayPath(data.replayPath || []);
                    updateBreadcrumbPath(data.breadcrumbPath || []);
                    updateZones(data.zones || []);
                });

                const onInteractStart = () => {
                    isUserInteracting = true;
                    if (userInteractTimeout) {
                        clearTimeout(userInteractTimeout);
                    }
                };

                const onInteractEnd = () => {
                    if (userInteractTimeout) {
                        clearTimeout(userInteractTimeout);
                    }
                    userInteractTimeout = setTimeout(() => {
                        isUserInteracting = false;
                    }, 1200);
                };

                map.on('dragstart', onInteractStart);
                map.on('zoomstart', onInteractStart);
                map.on('rotatestart', onInteractStart);
                map.on('pitchstart', onInteractStart);
                map.on('dragend', onInteractEnd);
                map.on('zoomend', onInteractEnd);
                map.on('rotateend', onInteractEnd);
                map.on('pitchend', onInteractEnd);
                return;
            }

            if (data.offlineMode !== undefined && !!data.offlineMode !== currentOffline) {
                currentOffline = !!data.offlineMode;
                const nextStyle = currentOffline
                    ? STYLES.offline
                    : (currentLayer === 'satellite' ? STYLES.satellite : (currentMode ? STYLES.dark : STYLES.light));
                map.setStyle(nextStyle);
                return;
            }

            if (data.layerType !== undefined && data.layerType !== currentLayer) {
                currentLayer = data.layerType;
                if (!currentOffline) {
                    map.setStyle(currentLayer === 'satellite' ? STYLES.satellite : (currentMode ? STYLES.dark : STYLES.light));
                }
                return;
            }

            if (data.isDarkMode !== undefined && data.isDarkMode !== currentMode) {
                currentMode = data.isDarkMode;
                if (currentLayer === 'vector' && !currentOffline) {
                    map.setStyle(data.isDarkMode ? STYLES.dark : STYLES.light);
                }
            }

            updateMarkers(data.units || []);
            updateTrail(data.units || [], data.selectedUnitId);
            updateReplayPath(data.replayPath || []);
            updateBreadcrumbPath(data.breadcrumbPath || []);
            updateZones(data.zones || []);
        };

        window.focusTarget = () => {
            if (map) {
                const coords = selectedUnit ? [selectedUnit.lng, selectedUnit.lat] : latestCoords;
                map.flyTo({
                    center: coords,
                    zoom: 18.5,
                    pitch: 65,
                    duration: 2000,
                    essential: true
                });
            }
        };

        document.addEventListener('message', e => {
            try {
                const data = JSON.parse(e.data);
                if (data.type === 'update') window.updateData(data);
                if (data.type === 'focus') window.focusTarget();
            } catch(err) {}
        });
    </script>
</body>
</html>
`;

export default function MapWrapper({ units, selectedUnitId, zones, replayPath, breadcrumbPath, offlineMode, isDarkMode, onSelectUnit }: MapProps) {
    const webViewRef = useRef<WebView>(null);
    const [layerType, setLayerType] = useState<'vector' | 'satellite'>('vector');
    const selectedUnit = useMemo(
        () => units.find(unit => unit.id === selectedUnitId) || units[0] || null,
        [units, selectedUnitId]
    );

    useEffect(() => {
        if (webViewRef.current) {
            const data = { type: 'update', units, selectedUnitId, zones, replayPath, breadcrumbPath, offlineMode, isDarkMode, layerType };
            webViewRef.current.postMessage(JSON.stringify(data));
        }
    }, [units, selectedUnitId, zones, replayPath, breadcrumbPath, offlineMode, isDarkMode, layerType]);

    const handleFocus = () => {
        if (webViewRef.current) {
            webViewRef.current.postMessage(JSON.stringify({ type: 'focus' }));
        }
    };

    const handleOpenDirections = () => {
        if (!selectedUnit) return;
        const url = Platform.select({
            ios: `maps://app?daddr=${selectedUnit.lat},${selectedUnit.lng}`,
            android: `google.navigation:q=${selectedUnit.lat},${selectedUnit.lng}`,
        });
        if (url) Linking.openURL(url);
    };

    return (
        <View style={styles.container}>
            <WebView
                ref={webViewRef}
                originWhitelist={['*']}
                source={{ html: MapLibreHTML }}
                style={styles.map}
                bounces={false}
                scrollEnabled={false} 
                onMessage={(event) => {
                    try {
                        const payload = JSON.parse(event.nativeEvent.data);
                        if (payload?.type === 'selectUnit' && payload?.unitId) {
                            onSelectUnit(payload.unitId);
                        }
                    } catch {
                        // Ignore malformed postMessage payloads.
                    }
                }}
                onLoadEnd={() => {
                    const data = { type: 'update', units, selectedUnitId, zones, replayPath, breadcrumbPath, offlineMode, isDarkMode, layerType };
                    webViewRef.current?.postMessage(JSON.stringify(data));
                }}
            />
            <View style={styles.buttonContainer}>
                <TouchableOpacity 
                    style={[styles.actionButton, { backgroundColor: '#4f46e5' }]} 
                    onPress={handleOpenDirections}
                >
                    <Navigation size={20} color="#fff" />
                </TouchableOpacity>

                <TouchableOpacity 
                    style={[styles.actionButton, { backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.9)' }]} 
                    onPress={handleFocus}
                >
                    <Crosshair size={20} color={isDarkMode ? '#fff' : '#1e293b'} />
                </TouchableOpacity>

                <TouchableOpacity 
                    style={[styles.actionButton, { backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.9)' }]} 
                    onPress={() => setLayerType(layerType === 'vector' ? 'satellite' : 'vector')}
                >
                    {layerType === 'vector' ? <MapIcon size={20} color={isDarkMode ? '#fff' : '#1e293b'} /> : <Layers size={20} color={isDarkMode ? '#fff' : '#1e293b'} />}
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f1f5f9', overflow: 'hidden', borderRadius: 24 },
    map: { flex: 1, opacity: 0.99 },
    buttonContainer: {
        position: 'absolute',
        top: 12,
        right: 12,
        gap: 8,
    },
    actionButton: {
        padding: 10,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.1)',
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 4.65,
    }
});
