import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// TODO: Replace this configuration with the one you copied from the Firebase Console
const firebaseConfig = {
  apiKey: "AIzaSyAUTXzcQfWJuSN0CmAD3zTH2OjMurgPzGk",
  authDomain: "mnema-memory-companion.firebaseapp.com",
  projectId: "mnema-memory-companion",
  storageBucket: "mnema-memory-companion.firebasestorage.app",
  messagingSenderId: "160362884417",
  appId: "1:160362884417:web:2e22dcca49a63d5e5545c0"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);

// Initialize Firestore with persistent offline caching (enabled for multiple tabs)
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

export const storage = getStorage(app);
export default app;
