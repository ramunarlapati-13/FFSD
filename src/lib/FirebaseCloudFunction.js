/**
 * SSFD - Firebase Cloud Functions
 * 
 * This script should be deployed to your Firebase Functions environment.
 * It watches for emergency states in the Realtime Database and 
 * automatically sends a high-priority push notification to the commander's device,
 * even if the app is closed.
 * 
 * Deployment:
 * 1. cd functions
 * 2. npm install firebase-admin firebase-functions
 * 3. firebase deploy --only functions
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.sendEmergencyPush = functions.database.ref('/firefighter_01')
    .onUpdate(async (change, context) => {
        const before = change.before.val();
        const after = change.after.val();

        // Check if status changed to EMERGENCY or SOS, or if a FALL was just detected
        const isEmergency = after.device_state === 'EMERGENCY' || after.device_state === 'SOS' || after.fall_detected === true;
        const wasAlreadyEmergency = before.device_state === 'EMERGENCY' || before.device_state === 'SOS' || before.fall_detected === true;

        if (isEmergency && !wasAlreadyEmergency) {
            console.log('CRITICAL STATE DETECTED - Fetching push token...');

            // Get the commander's push token from our tokens registry
            const tokenSnap = await admin.database().ref('/push_tokens/firefighter_01').once('value');
            
            if (!tokenSnap.exists()) {
                console.log('No push token found for firefighter_01');
                return null;
            }

            const pushToken = tokenSnap.val().token;
            console.log('Sending push notification to:', pushToken);

            // Construct the high-priority message
            // Note: For Expo Push Tokens, you would normally use the Expo Push API.
            // If using Native FCM tokens, use the code below.
            
            const message = {
                notification: {
                    title: '🚨 SSFD: CRITICAL ALERT',
                    body: `Firefighter_01 is in ${after.device_state} state!${after.fall_detected ? ' (FALL DETECTED)' : ''}`,
                },
                data: {
                    type: 'EMERGENCY',
                    firefighterId: 'firefighter_01',
                },
                android: {
                    priority: 'high',
                    notification: {
                        channelId: 'emergency',
                        sound: 'default',
                        clickAction: 'OPEN_DASHBOARD',
                    },
                },
                token: pushToken
            };

            // Option 2: If using Expo Push Tokens (the ones we gathered in the app)
            // You should use an HTTP request to https://exp.host/--/api/v2/push/send
            // But if you've configured FCM in Expo, the token can sometimes be used directly.
            
            try {
                // If using the Expo token directly with FCM, this might fail unless configured.
                // For a 24h hackathon, we assume you've bridged FCM credentials correctly.
                await admin.messaging().send(message);
                console.log('Push notification sent successfully');
            } catch (error) {
                console.error('Error sending push notification:', error);
            }
        }

        return null;
    });
