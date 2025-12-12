// Firebase Configuration and Initialization
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyAXfasYzYVL-zCArx_agaYPwctWq8RwThY",
    authDomain: "barret-firebase.firebaseapp.com",
    projectId: "barret-firebase",
    storageBucket: "barret-firebase.firebasestorage.app",
    messagingSenderId: "340392912968",
    appId: "1:340392912968:web:3c60652e1347853ac1107d",
    measurementId: "G-5260Q382VC"
};

// VAPID Key
const vapidKey = "BKoFZRX5eaFdNBoxbEZkOGDr_fW-prVcrsNYs_cLwL7gun2ye_yhM92D3QRv5RSEnIroNPs3iKwNwgpRlnzJ6Vw";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

// Make available globally
window.firebaseApp = app;
window.firebaseMessaging = messaging;
window.getFirebaseToken = getToken;
window.onFirebaseMessage = onMessage;
window.firebaseVapidKey = vapidKey;

console.log('🔥 Firebase initialized');
