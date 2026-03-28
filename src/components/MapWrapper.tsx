import React, { useRef, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

interface MapProps {
    lat: number;
    lng: number;
    trail: [number, number][];
    status: string;
}

const LeafletHTML = `
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <style>
        body { padding: 0; margin: 0; }
        html, body, #map { height: 100%; width: 100vw; background-color: #e2e8f0; }
        .leaflet-control-attribution { display: none; }
        
        @keyframes pulse {
            0% { transform: scale(0.5); opacity: 0.8; }
            100% { transform: scale(3.5); opacity: 0; }
        }
        .pulse-circle {
            position: absolute;
            top: 32px;
            left: 16px;
            width: 20px;
            height: 20px;
            margin-top: -10px;
            margin-left: -10px;
            background-color: rgba(37, 99, 235, 0.6);
            border-radius: 50%;
            animation: pulse 1.5s infinite ease-out;
            z-index: -1;
            pointer-events: none;
        }
    </style>
</head>
<body>
    <div id="map"></div>
    <script>
        var map = L.map('map', { zoomControl: false }).setView([16.508948062198765, 80.65804243873862], 16);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
        
        var fireIcon = L.divIcon({
            html: '<div style="position: relative; width: 32px; height: 32px;">' +
                  '<div class="pulse-circle"></div>' +
                  '<div style="font-size: 32px; line-height: 32px; text-align: center;">📍</div>' +
                  '</div>',
            className: '',
            iconSize: [32, 32],
            iconAnchor: [16, 32]
        });
        var marker = L.marker([16.508948062198765, 80.65804243873862], { icon: fireIcon }).addTo(map);
        var polyline = L.polyline([], {color: '#10b981', weight: 4}).addTo(map);

        var isFirstLoad = true;

        function updateMap(data) {
            var latlng = [data.lat, data.lng];
            
            if (isFirstLoad) {
                map.setView(latlng, 16);
                isFirstLoad = false;
            } else {
                map.panTo(latlng, { animate: true, duration: 1.5 });
            }

            marker.setLatLng(latlng);
            
            if (data.trail && data.trail.length > 0) {
                polyline.setLatLngs(data.trail);
                polyline.setStyle({ color: data.trailColor });
            }
        }

        document.addEventListener('message', function(e) {
            try {
                var data = JSON.parse(e.data);
                if(data.type === 'update') updateMap(data);
            } catch(err) { console.log(err); }
        });
        window.addEventListener('message', function(e) {
            try {
                var data = JSON.parse(e.data);
                if(data.type === 'update') updateMap(data);
            } catch(err) { console.log(err); }
        });
    </script>
</body>
</html>
`;

export default function MapWrapper({ lat, lng, trail, status }: MapProps) {
    const webViewRef = useRef<WebView>(null);
    const isEmergency = status === 'EMERGENCY' || status === 'SOS';
    const trailColor = isEmergency ? '#ef4444' : '#10b981';
    const markerColor = isEmergency ? 'red' : 'green';

    useEffect(() => {
        if (webViewRef.current) {
            const data = { type: 'update', lat, lng, trail, status, markerColor, trailColor };
            webViewRef.current.postMessage(JSON.stringify(data));
        }
    }, [lat, lng, trail, status, markerColor, trailColor]);

    return (
        <View style={styles.container}>
            <WebView
                ref={webViewRef}
                originWhitelist={['*']}
                source={{ html: LeafletHTML }}
                style={styles.map}
                bounces={false}
                nestedScrollEnabled={true}
                onLoadEnd={() => {
                    if (webViewRef.current) {
                        const data = { type: 'update', lat, lng, trail, status, markerColor, trailColor };
                        webViewRef.current.postMessage(JSON.stringify(data));
                    }
                }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#e2e8f0', overflow: 'hidden', borderRadius: 20 },
    map: { flex: 1, opacity: 0.99 },
});
