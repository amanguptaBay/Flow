import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth }       from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, enableIndexedDbPersistence }
    from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ── Firebase project config ───────────────────────────────────────────────────
// Your Firebase config (from Firebase Console → Project Settings)
const firebaseConfig = {
    apiKey:            'AIzaSyCUm1wmiKmix2vOf7heLmcTatqTJYaKWTs',
    authDomain:        'flow-6a16b.firebaseapp.com',
    projectId:         'flow-6a16b',
    storageBucket:     'flow-6a16b.firebasestorage.app',
    messagingSenderId: '211213446494',
    appId:             '1:211213446494:web:eb10c505dcfaa67cee33cf',
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// Enable offline persistence so Firestore works without network.
// Reads come from cache when offline; writes queue and sync when online.
enableIndexedDbPersistence(db).catch(err => {
    if (err.code === 'failed-precondition') {
        console.warn('[Firebase] Persistence failed: multiple tabs open');
    } else if (err.code === 'unimplemented') {
        console.warn('[Firebase] Persistence not available in this browser');
    }
});

export { app, auth, db };
