import { auth } from './firebase-config.js';
import {
    GoogleAuthProvider,
    GithubAuthProvider,
    signInWithPopup,
    signOut as fbSignOut,
    onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

let currentUser = null;

export function getCurrentUser() { return currentUser; }
export function isSignedIn()     { return currentUser !== null; }

export async function signInWithGoogle() {
    return signInWithPopup(auth, new GoogleAuthProvider());
}

export async function signInWithGitHub() {
    return signInWithPopup(auth, new GithubAuthProvider());
}

export async function signOut() {
    return fbSignOut(auth);
}

/**
 * Start listening for auth state changes.
 * Dispatches a custom 'auth-state-changed' event on window so the App
 * controller can react without importing Firebase directly.
 */
export function initAuthListener() {
    onAuthStateChanged(auth, (user) => {
        currentUser = user;
        window.dispatchEvent(new CustomEvent('auth-state-changed', {
            detail: { user },
        }));
    });
}
