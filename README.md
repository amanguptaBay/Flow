# Brain Flow

A keyboard-driven thought visualization tool that renders ideas as interactive tree graphs. Work offline with localStorage or sign in with Google to sync across devices via Firebase.

## Features

- **Tree Graph Editor** -- Create, edit, delete, and navigate nodes in a D3.js-powered SVG canvas with smooth animations and zoom/pan
- **Keyboard-First Workflow** -- Navigate parent/child/sibling nodes, create children, edit labels, and delete nodes entirely from the keyboard
- **Timeline Replay** -- Step through or auto-play the full history of a graph, watching it build up action by action
- **Cloud Sync** -- Sign in with Google to save unlimited graphs to Firestore with automatic 2-second debounced saves and offline caching
- **Offline Mode** -- Work locally with localStorage persistence, export/import JSON files, and optionally migrate to cloud later
- **Export / Import** -- Download any graph as a JSON file or load one from disk

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Type + **Enter** | Create child node |
| **Escape** | Cancel edit |
| **Cmd/Ctrl + Up** | Navigate to parent |
| **Cmd/Ctrl + Down** | Navigate to first child |
| **Cmd/Ctrl + Left/Right** | Navigate between siblings |
| **Cmd/Ctrl + D** | Edit current node label |
| **Backspace** (empty input) | Delete current node |
| **Click** node | Select as working node |
| **Double-click** node | Edit node label |

## Tech Stack

- **Vanilla JS** (ES modules, no bundler or build step)
- **D3.js v7** (CDN) -- tree layout, zoom/pan, transitions
- **Firebase v10.12.0** (CDN) -- Auth, Firestore, IndexedDB offline persistence
- **GitHub Pages** for hosting (any static host works)

## Setup

### 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com) and create a new project
2. Enable **Authentication** > Sign-in methods > **Google**
3. Create a **Firestore Database** in production mode

### 2. Configure Credentials

Copy your Firebase config from Project Settings > Web App, then update `js/firebase-config.js`:

```js
const firebaseConfig = {
    apiKey: 'YOUR_API_KEY',
    authDomain: 'YOUR_PROJECT.firebaseapp.com',
    projectId: 'YOUR_PROJECT',
    storageBucket: 'YOUR_PROJECT.firebasestorage.app',
    messagingSenderId: 'YOUR_SENDER_ID',
    appId: 'YOUR_APP_ID',
};
```

### 3. Deploy Firestore Rules

In the Firebase Console under Firestore > Rules, publish:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/files/{fileId} {
      allow read, write: if request.auth.uid == userId;
    }
  }
}
```

Or via CLI:

```bash
npm install -g firebase-tools
firebase login
firebase init  # select Firestore only, skip Hosting
firebase deploy --only firestore:rules
```

### 4. Deploy

**GitHub Pages:**
Push to GitHub, then Settings > Pages > Deploy from `main`.

**Local dev:**
```bash
python3 -m http.server 8000
# or
npx http-server
```

No build step required -- just serve the directory.

## Project Structure

```
index.html              Main HTML (auth, file list, editor, timeline)
style.css               Dark theme styles (CSS custom properties)
js/
  app.js                Controller -- wires up screens, events, toolbar
  graph.js              Tree data structure (nodes, index, CRUD)
  graph-tracker.js      Action log wrapper (mutations, replay, serialization)
  visualizer.js         D3 rendering (layout, zoom, labels, ghost node)
  timeline.js           Replay controls (play, step, jump to start)
  firebase-config.js    Firebase SDK init + offline persistence
  auth.js               Google OAuth (signInWithPopup)
  firestore.js          Firestore CRUD for users/{uid}/files/{fileId}
  fs-helpers.js         localStorage + file import/export helpers
  flags.js              Feature flags
```

## Data Model

All graph state is stored as an **action log** -- an ordered array of mutations that can be replayed to reconstruct any point in history:

```json
[
  { "type": "init", "rootId": "abc-123", "timestamp": 1700000000 },
  { "type": "addNode", "parentId": "abc-123", "childId": "def-456", "childLabel": "idea" },
  { "type": "setWorking", "id": "def-456" },
  { "type": "editNodeLabel", "nodeId": "def-456", "oldLabel": "idea", "newLabel": "better idea" }
]
```

This log is saved to localStorage (offline) and Firestore (cloud), and powers the timeline replay feature.

## Feature Flags

Edit `js/flags.js` to toggle features:

```js
export const FLAGS = {
    timeline_scrub: false,  // true = show slider for free scrubbing in replay
};
```
