/* --- CONFIGURATION & STATE --- */
const STATE = {
    isTracking: false,
    startTime: 0,
    elapsedTime: 0,
    steps: 0,
    timerInterval: null,
    wakeLock: null,
    db: null
};

// UI Elements
const ui = {
    timer: document.getElementById('timerDisplay'),
    steps: document.getElementById('stepDisplay'),
    dist: document.getElementById('distanceDisplay'),
    toggleBtn: document.getElementById('toggleBtn'),
    resetBtn: document.getElementById('resetBtn'),
    ring: document.getElementById('progressRing'),
    liveDot: document.getElementById('liveIndicator'),
    sensorOverlay: document.getElementById('sensorRequest'),
    views: {
        tracker: document.getElementById('viewTracker'),
        dashboard: document.getElementById('viewDashboard')
    },
    nav: {
        tracker: document.getElementById('navTracker'),
        dashboard: document.getElementById('navDashboard')
    },
    historyList: document.getElementById('historyList')
};

/* --- 1. INDEXEDDB SETUP (Persistence) --- */
const DB_NAME = 'XstepPulseDB';
const DB_VERSION = 1;

function initDB() {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('sessions')) {
            db.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
        }
    };

    request.onsuccess = (e) => {
        STATE.db = e.target.result;
        loadHistory(); // Load data on startup
    };
    
    request.onerror = (e) => console.error("DB Error", e);
}

function saveSession() {
    if (STATE.steps === 0 && STATE.elapsedTime < 1000) return; // Don't save empty sessions

    const transaction = STATE.db.transaction(['sessions'], 'readwrite');
    const store = transaction.objectStore('sessions');
    
    const session = {
        date: new Date().toISOString(),
        steps: STATE.steps,
        duration: STATE.elapsedTime,
        distance: (STATE.steps * 0.000762).toFixed(2) // Approx 76cm per step
    };

    store.add(session);
    loadHistory(); // Refresh UI
}

function loadHistory() {
    if (!STATE.db) return;
    const transaction = STATE.db.transaction(['sessions'], 'readonly');
    const store = transaction.objectStore('sessions');
    const request = store.getAll();

    request.onsuccess = () => {
        const data = request.result.reverse(); // Newest first
        renderHistory(data);
    };
}

function clearHistory() {
    const transaction = STATE.db.transaction(['sessions'], 'readwrite');
    transaction.objectStore('sessions').clear();
    loadHistory();
}

/* --- 2. PEDOMETER LOGIC (Motion API) --- */
let lastAcc = { x: 0, y: 0, z: 0 };
let lastMag = 0;
const THRESHOLD = 12; // Sensitivity for step detection (Magnitude)

function handleMotion(event) {
    if (!STATE.isTracking) return;

    const acc = event.accelerationIncludingGravity;
    if (!acc) return;

    // Calculate Magnitude vector to handle phone in any pocket orientation
    const magnitude = Math.sqrt(acc.x*acc.x + acc.y*acc.y + acc.z*acc.z);
    
    // Simple Peak Detection
    const delta = Math.abs(magnitude - lastMag);
    
    // If change is drastic enough, count as step (debounce needed in real prod, simplified here)
    if (delta > 2 && magnitude > THRESHOLD) {
        // Prevent double counting within 300ms
        const now = Date.now();
        if (!this.lastStepTime || now - this.lastStepTime > 350) {
            STATE.steps++;
            this.lastStepTime = now;
            updateUI();
        }
    }
    
    lastAcc = acc;
    lastMag = magnitude;
}

async function requestPermissions() {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        try {
            const response = await DeviceMotionEvent.requestPermission();
            if (response === 'granted') {
                ui.sensorOverlay.classList.add('hidden');
                startTracking();
            } else {
                alert('Permission denied. Manual mode only.');
            }
        } catch (e) {
            console.error(e);
        }
    } else {
        // Non-iOS 13+ devices
        ui.sensorOverlay.classList.add('hidden');
        startTracking();
    }
}

/* --- 3. STOPWATCH & APP LOGIC --- */
function startTracking() {
    STATE.isTracking = true;
    STATE.startTime = Date.now() - STATE.elapsedTime;
    
    // UI Updates
    ui.toggleBtn.textContent = "Pause";
    ui.toggleBtn.classList.replace('bg-green-600', 'bg-yellow-600');
    ui.liveDot.className = "w-2 h-2 rounded-full bg-green-500 animate-ping";

    // Start Listeners
    window.addEventListener('devicemotion', handleMotion);
    
    // Wake Lock (Keep screen on)
    if ('wakeLock' in navigator) {
        navigator.wakeLock.request('screen').then(lock => STATE.wakeLock = lock).catch(console.error);
    }

    STATE.timerInterval = setInterval(() => {
        STATE.elapsedTime = Date.now() - STATE.startTime;
        updateUI();
    }, 1000);
}

function pauseTracking() {
    STATE.isTracking = false;
    clearInterval(STATE.timerInterval);
    window.removeEventListener('devicemotion', handleMotion);
    
    if(STATE.wakeLock) STATE.wakeLock.release();

    ui.toggleBtn.textContent = "Resume";
    ui.toggleBtn.classList.replace('bg-yellow-600', 'bg-green-600');
    ui.liveDot.className = "w-2 h-2 rounded-full bg-red-500";
}

function resetTracking() {
    pauseTracking();
    saveSession(); // Save before reset
    
    STATE.elapsedTime = 0;
    STATE.steps = 0;
    
    ui.toggleBtn.textContent = "Start";
    updateUI();
}

/* --- 4. UI HANDLERS --- */
function updateUI() {
    // Time
    const diff = STATE.elapsedTime;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    ui.timer.textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;

    // Steps & Dist
    ui.steps.textContent = STATE.steps;
    const km = (STATE.steps * 0.000762).toFixed(2);
    ui.dist.textContent = `${km}`;
    
    // Ring Animation
    const maxSecs = 60; 
    const pct = s / maxSecs;
    const offset = 754 - (754 * pct);
    ui.ring.style.strokeDashoffset = offset;
}

function renderHistory(data) {
    if (data.length === 0) {
        ui.historyList.innerHTML = '<li class="text-gray-600 text-center text-sm py-10 italic">No history yet. Start walking!</li>';
        return;
    }

    ui.historyList.innerHTML = data.map(item => {
        const date = new Date(item.date).toLocaleDateString();
        const time = new Date(item.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const dur = new Date(item.duration).toISOString().substr(11, 8);
        
        return `
            <li class="bg-gray-900 border border-gray-800 rounded-lg p-4 flex justify-between items-center shadow-lg">
                <div>
                    <div class="text-green-500 font-bold text-lg">${item.steps} <span class="text-xs text-gray-500 uppercase">Steps</span></div>
                    <div class="text-gray-500 text-xs">${date} at ${time}</div>
                </div>
                <div class="text-right">
                    <div class="text-white font-mono text-sm">${dur}</div>
                    <div class="text-gray-500 text-xs">${item.distance} km</div>
                </div>
            </li>
        `;
    }).join('');
}

function pad(n) { return n < 10 ? '0' + n : n; }

function switchTab(tab) {
    if (tab === 'tracker') {
        ui.views.tracker.classList.remove('hidden-view');
        ui.views.dashboard.classList.add('hidden-view');
        ui.nav.tracker.classList.add('active-nav');
        ui.nav.dashboard.classList.remove('active-nav');
    } else {
        ui.views.tracker.classList.add('hidden-view');
        ui.views.dashboard.classList.remove('hidden-view');
        ui.nav.tracker.classList.remove('active-nav');
        ui.nav.dashboard.classList.add('active-nav');
        loadHistory();
    }
}

/* --- EVENT LISTENERS --- */
ui.toggleBtn.addEventListener('click', () => {
    if (!STATE.isTracking) {
        // Check for iOS 13+ permission reqs
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function' && !STATE.permissionGranted) {
            ui.sensorOverlay.classList.remove('hidden');
        } else {
            startTracking();
        }
    } else {
        pauseTracking();
    }
});

document.getElementById('grantSensorBtn').addEventListener('click', () => {
    requestPermissions();
    STATE.permissionGranted = true;
});

ui.resetBtn.addEventListener('click', () => {
    if(confirm('Stop current session and save to history?')) {
        resetTracking();
    }
});

ui.nav.tracker.addEventListener('click', () => switchTab('tracker'));
ui.nav.dashboard.addEventListener('click', () => switchTab('dashboard'));
document.getElementById('clearHistoryBtn').addEventListener('click', () => {
    if(confirm('Delete all history?')) clearHistory();
});

// Init
initDB();
console.log("XstepPulse System Initialized");