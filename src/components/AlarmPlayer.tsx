import React, { useRef, useImperativeHandle, forwardRef } from 'react';
import { WebView } from 'react-native-webview';
import { View } from 'react-native';

const BUZZER_URL = 'https://www.myinstants.com/media/sounds/wrong-lie-incorrect-buzzer.mp3';

export interface AlarmPlayerRef {
    play: () => void;
    stop: () => void;
}

const AlarmPlayer = forwardRef<AlarmPlayerRef>((_, ref) => {
    const webViewRef = useRef<WebView>(null);

    useImperativeHandle(ref, () => ({
        play: () => {
            webViewRef.current?.injectJavaScript(`
                if (!window._alarm) {
                    window._alarm = new Audio('${BUZZER_URL}');
                    window._alarm.loop = true;
                    window._alarm.volume = 1.0;
                }
                window._alarm.currentTime = 0;
                window._alarm.play().catch(() => {});
                true;
            `);
        },
        stop: () => {
            webViewRef.current?.injectJavaScript(`
                if (window._alarm) {
                    window._alarm.pause();
                    window._alarm.currentTime = 0;
                }
                true;
            `);
        },
    }));

    return (
        <View style={{ width: 0, height: 0, position: 'absolute' }}>
            <WebView
                ref={webViewRef}
                originWhitelist={['*']}
                source={{ html: '<html><body></body></html>' }}
                mediaPlaybackRequiresUserAction={false}
                allowsInlineMediaPlayback={true}
                javaScriptEnabled={true}
                style={{ width: 0, height: 0 }}
            />
        </View>
    );
});

export default AlarmPlayer;
