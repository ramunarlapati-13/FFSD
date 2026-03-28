import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { ref, update } from 'firebase/database';
import { rtdb } from './firebase';

export async function registerForPushNotificationsAsync() {
    let token;

    try {
        const isExpoGo = Constants.executionEnvironment === 'storeClient';

        if (Platform.OS === 'android') {
            if (isExpoGo) {
                console.log('--- SSFD PUSH SERVICE: OFFLINE (Running in Expo Go) ---');
            } else {
                await Notifications.setNotificationChannelAsync('emergency', {
                    name: 'Emergency Alerts',
                    importance: Notifications.AndroidImportance.MAX,
                    vibrationPattern: [0, 250, 250, 250],
                    lightColor: '#ff231f',
                    sound: 'alert.wav',
                });
            }
        }

        if (Device.isDevice) {
            const { status: existingStatus } = await Notifications.getPermissionsAsync();
            let finalStatus = existingStatus;
            if (existingStatus !== 'granted') {
                const { status } = await Notifications.requestPermissionsAsync();
                finalStatus = status;
            }
            if (finalStatus !== 'granted') {
                console.warn('Failed to get permissions for notifications!');
                return null;
            }
            
            if (isExpoGo && Platform.OS === 'android') {
                console.log('Push Service: In-App remote pushes disabled for Expo Go. Fallback to Local Alerts active.');
                return null;
            }

            // Remote Push Token Request (Standalone/DevBuild Only)
            token = (await Notifications.getExpoPushTokenAsync({
                projectId: Constants.expoConfig?.extra?.eas?.projectId ?? 'a-hacks-2026',
            })).data;
            console.log('Push Token:', token);
        } else {
            console.warn('Physical device required for Push testing');
        }
    } catch (error) {
        console.warn('SSFD PUSH REGISTRATION HALTED:', error);
        return null;
    }

    return token;
}

export async function savePushTokenToFirebase(token: string, firefighterId: string = 'firefighter_01') {
    try {
        const tokenRef = ref(rtdb, `push_tokens/${firefighterId}`);
        await update(tokenRef, {
            token: token,
            platform: Platform.OS,
            updatedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Error saving push token to Firebase:', error);
    }
}

// Handler for incoming notifications while the app is in foreground
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});
