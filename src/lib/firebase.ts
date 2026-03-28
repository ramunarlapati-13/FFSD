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
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "AIzaSyBbQ9BGFRrrDffRsLvyxBfQfV-a1omFWCo",
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "ffsd-942f1.firebaseapp.com",
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "ffsd-942f1",
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "ffsd-942f1.firebasestorage.app",
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "737843333211",
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "1:737843333211:android:aefc064d9ddb9d5390d77e",
    databaseURL: "https://ffsd-942f1-default-rtdb.asia-southeast1.firebasedatabase.app",
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Use the explicit URL for the database to ensure regional connectivity
const globalAny: any = global;
if (!globalAny._rtdb) {
    globalAny._rtdb = getDatabase(app, firebaseConfig.databaseURL);
}

export const rtdb = globalAny._rtdb;
