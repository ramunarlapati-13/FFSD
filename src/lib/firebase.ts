import { initializeApp, getApps, getApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

// Set these in a .env file at the project root:
// EXPO_PUBLIC_FIREBASE_API_KEY=...
// EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=...
// EXPO_PUBLIC_FIREBASE_PROJECT_ID=...
// EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=...
// EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
// EXPO_PUBLIC_FIREBASE_APP_ID=...
// EXPO_PUBLIC_FIREBASE_DATABASE_URL=...
const firebaseConfig = {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
    databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL,
};

// Security check: Never hardcode keys. Throw an error if environment is not set up correctly.
if (!firebaseConfig.apiKey) {
    throw new Error('MISSING_FIREBASE_API_KEY: Please ensure you have EXPO_PUBLIC_FIREBASE_API_KEY in your .env file.');
}

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Use the explicit URL for the database to ensure regional connectivity
const globalAny: any = global;
if (!globalAny._rtdb) {
    globalAny._rtdb = getDatabase(app, firebaseConfig.databaseURL);
}

export const rtdb = globalAny._rtdb;
