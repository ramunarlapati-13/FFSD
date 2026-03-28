import React, { useRef, useEffect, useState } from 'react';
import { StyleSheet, View, TouchableOpacity, Linking, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { Layers, Map as MapIcon, Crosshair, Navigation } from 'lucide-react-native';

interface MapProps {
    lat: number;
    lng: number;
    trail: [number, number][];
    status: string;
    isDarkMode: boolean;
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
        let marker;
        let currentMode = null;
        let currentLayer = 'vector';
        let latestCoords = [80.658042, 16.508948];
        
        const STYLES = {
            dark: 'https://tiles.openfreemap.org/styles/dark',
            light: 'https://tiles.openfreemap.org/styles/bright',
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

        function setupOverlay() {
            if (marker) marker.remove();
            
            const el = document.createElement('div');
            el.className = 'marker';
            el.innerHTML = '<div class="pulse"></div>📍';
            marker = new maplibregl.Marker({ element: el })
                .setLngLat(latestCoords)
                .addTo(map);

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
        }

        window.updateData = (data) => {
            if (!map) {
                currentMode = data.isDarkMode;
                currentLayer = data.layerType || 'vector';
                latestCoords = [data.lng, data.lat];
                
                let initialStyle = currentLayer === 'satellite' ? STYLES.satellite : (data.isDarkMode ? STYLES.dark : STYLES.light);
                
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
                });
                return;
            }

            if (data.layerType !== undefined && data.layerType !== currentLayer) {
                currentLayer = data.layerType;
                map.setStyle(currentLayer === 'satellite' ? STYLES.satellite : (currentMode ? STYLES.dark : STYLES.light));
                return;
            }

            if (data.isDarkMode !== undefined && data.isDarkMode !== currentMode) {
                currentMode = data.isDarkMode;
                if (currentLayer === 'vector') {
                    map.setStyle(data.isDarkMode ? STYLES.dark : STYLES.light);
                }
            }

            latestCoords = [data.lng, data.lat];
            if (marker) marker.setLngLat(latestCoords);
            map.easeTo({ center: latestCoords, duration: 1500 });

            if (data.trail) {
                const coords = data.trail.map(p => [p[1], p[0]]);
                const source = map.getSource('trail');
                if (source) {
                    source.setData({
                        'type': 'Feature',
                        'geometry': { 'type': 'LineString', 'coordinates': coords }
                    });
                }
            }
        };

        window.focusTarget = () => {
            if (map) {
                map.flyTo({
                    center: latestCoords,
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

export default function MapWrapper({ lat, lng, trail, status, isDarkMode }: MapProps) {
    const webViewRef = useRef<WebView>(null);
    const [layerType, setLayerType] = useState<'vector' | 'satellite'>('vector');
    const trailColor = (status === 'EMERGENCY' || status === 'SOS') ? '#ef4444' : '#3b82f6';

    useEffect(() => {
        if (webViewRef.current) {
            const data = { type: 'update', lat, lng, trail, status, trailColor, isDarkMode, layerType };
            webViewRef.current.postMessage(JSON.stringify(data));
        }
    }, [lat, lng, trail, status, trailColor, isDarkMode, layerType]);

    const handleFocus = () => {
        if (webViewRef.current) {
            webViewRef.current.postMessage(JSON.stringify({ type: 'focus' }));
        }
    };

    const handleOpenDirections = () => {
        const url = Platform.select({
            ios: `maps://app?daddr=${lat},${lng}`,
            android: `google.navigation:q=${lat},${lng}`,
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
                onLoadEnd={() => {
                    const data = { type: 'update', lat, lng, trail, status, trailColor, isDarkMode, layerType };
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
