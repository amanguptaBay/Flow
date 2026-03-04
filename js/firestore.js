import { db } from './firebase-config.js';
import {
    collection, doc, getDocs, getDoc, addDoc,
    updateDoc, deleteDoc, serverTimestamp, query, orderBy,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function filesCol(userId)          { return collection(db, 'users', userId, 'files'); }
function fileRef(userId, fileId)   { return doc(db, 'users', userId, 'files', fileId); }

// ── CRUD ──────────────────────────────────────────────────────────────────────

/** List all files for a user, most-recently-updated first. */
export async function listFiles(userId) {
    const q = query(filesCol(userId), orderBy('updatedAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Create a new file. Returns the new document ID. */
export async function createFile(userId, name, actionLog = []) {
    const ref = await addDoc(filesCol(userId), {
        name,
        actionLog,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
    return ref.id;
}

/** Load a single file by ID. Returns null if not found. */
export async function loadFile(userId, fileId) {
    const snap = await getDoc(fileRef(userId, fileId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
}

/** Overwrite the actionLog for a file. */
export async function saveFile(userId, fileId, actionLog) {
    await updateDoc(fileRef(userId, fileId), {
        actionLog,
        updatedAt: serverTimestamp(),
    });
}

/** Rename a file. */
export async function renameFile(userId, fileId, newName) {
    await updateDoc(fileRef(userId, fileId), {
        name: newName,
        updatedAt: serverTimestamp(),
    });
}

/** Delete a file. */
export async function deleteFile(userId, fileId) {
    await deleteDoc(fileRef(userId, fileId));
}

// ── Log compaction ────────────────────────────────────────────────────────────

/**
 * Strip redundant consecutive setWorking actions to reduce payload size
 * before writing to Firestore.
 */
export function compactLog(log) {
    const result = [];
    for (let i = 0; i < log.length; i++) {
        // Skip setWorking if the very next action is also setWorking
        if (log[i].type === 'setWorking' && log[i + 1]?.type === 'setWorking') continue;
        result.push(log[i]);
    }
    return result;
}
