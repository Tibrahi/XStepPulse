/* --- CONFIGURATION & STATE --- */
const STATE = {
    isTracking: false,
    startTime: 0,
    elapsedTime: 0,
    steps: 0,
    timerInterval: null,
    clockInterval: null,
    wakeLock: null,
    db: null,
    goal: { active: false, steps: 0, minutes: 0 },
    lastStepTime: 0
};

// UI Elements
const ui = {
    timer: document.getElementById('timerDisplay'),
    steps: document.getElementById('stepDisplay'),
    dist: document.getElementById('distanceDisplay'),
    toggleBtn: document.getElementById('toggleBtn'),
    resetBtn: document.getElementById('resetBtn'),
    liveDot: document.getElementById('liveIndicator'),
    sensorOverlay: document.getElementById('sensorRequest'),
    realTime: document.getElementById('realTimeClock'),
    goalStatus: document.getElementById('goalStatus'),
    goalToggle: document.getElementById('goalToggle'),
    goalInputs: document.getElementById('goalInputs'),
    inputs: {
        steps: document.getElementById('goalSteps'),
        mins: document.getElementById('goalMinutes')
    },
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

/* --- 1. THREE.JS VISUALIZATION --- */
// We create a "Core" sphere that pulses when steps happen
let scene, camera, renderer, coreMesh, wireMesh;

function initThreeJS() {
    const container = document.getElementById('canvas-container');
    
    // Scene setup
    scene = new THREE.Scene();
    // Use minimal fog for depth
    scene.fog = new THREE.FogExp2(0x000000, 0.02);

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 5;

    // Renderer
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // Objects: A Wireframe Icosahedron (The "Core")
    const geometry = new THREE.IcosahedronGeometry(2, 1);
    
    // Material 1: Glowing Green Wireframe
    const wireMat = new THREE.MeshBasicMaterial({ 
        color: 0x22c55e, 
        wireframe: true,
        transparent: true,
        opacity: 0.3
    });
    
    // Material 2: Inner Core
    const coreMat = new THREE.MeshBasicMaterial({
        color: 0x000000
    });

    wireMesh = new THREE.Mesh(geometry, wireMat);
    coreMesh = new THREE.Mesh(geometry, coreMat);
    
    // Group them
    scene.add(wireMesh);
    scene.add(coreMesh);

    // Lights (ambient)
    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);

    animateThreeJS();

    // Handle Resize
    window.addEventListener('resize', onWindowResize, false);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animateThreeJS() {
    requestAnimationFrame(animateThreeJS);

    // Idle Rotation
    wireMesh.rotation.x += 0.002;
    wireMesh.rotation.y += 0.003;

    // Pulse Effect Decay (Return to scale 1)
    if (wireMesh.scale.x > 1) {
        wireMesh.scale.x -= 0.03;
        wireMesh.scale.y -= 0.03;
        wireMesh.scale.z -= 0.03;
    } else {
        // Ensure it stays at 1 minimum
        wireMesh.scale.set(1, 1, 1);
    }
    
    renderer.render(scene, camera);
}

// Trigger this on step
function triggerVisualPulse() {
    if(wireMesh) {
        // Bump scale up
        wireMesh.scale.set(1.4, 1.4, 1.4);
        // Randomize rotation speed briefly for effect? (Simpler is better for performance)
        wireMesh.rotation.y += 0.5;
    }
}


/* --- 2. PEDOMETER LOGIC --- */
let lastMag = 0;
const THRESHOLD = 12; 

function handleMotion(event) {
    if (!STATE.isTracking) return;

    const acc = event.accelerationIncludingGravity;
    if (!acc) return;

    const magnitude = Math.sqrt(acc.x*acc.x + acc.y*acc.y + acc.z*acc.z);
    const delta = Math.abs(magnitude - lastMag);
    
    if (delta > 2 && magnitude > THRESHOLD) {
        const now = Date.now();
        if (now - STATE.lastStepTime > 350) {
            STATE.steps++;
            STATE.lastStepTime = now;
            updateUI();
            triggerVisualPulse(); // 3D Effect
            checkGoals(); // Auto-stop logic
        }
    }
    lastAcc = acc;
    lastMag = magnitude;
}

function checkGoals() {
    if (!STATE.goal.active) return;

    let met = false;
    // Check Step Goal
    if (STATE.goal.steps > 0 && STATE.steps >= STATE.goal.steps) met = true;
    
    // Check Time Goal (convert ms to mins)
    const currentMins = STATE.elapsedTime / 60000;
    if (STATE.goal.minutes > 0 && currentMins >= STATE.goal.minutes) met = true;

    if (met) {
        // Goal Reached!
        // Vibrate if available
        if ("vibrate" in navigator) navigator.vibrate([200, 100, 200]);
        resetTracking(true); // True = auto saved
        alert("🎉 GOAL REACHED! Session Auto-Saved.");
    }
}

/* --- 3. APP LOGIC --- */

function updateRealTimeClock() {
    const now = new Date();
    ui.realTime.textContent = now.toLocaleTimeString();
}

function startTracking() {
    // Read Goals
    const sGoal = parseInt(ui.inputs.steps.value) || 0;
    const mGoal = parseInt(ui.inputs.mins.value) || 0;
    
    if (ui.goalToggle.checked && (sGoal > 0 || mGoal > 0)) {
        STATE.goal = { active: true, steps: sGoal, minutes: mGoal };
        ui.goalStatus.classList.remove('hidden');
    } else {
        STATE.goal.active = false;
        ui.goalStatus.classList.add('hidden');
    }

    STATE.isTracking = true;
    STATE.startTime = Date.now() - STATE.elapsedTime;
    
    ui.toggleBtn.innerHTML = '<span class="relative z-10">PAUSE</span>';
    ui.toggleBtn.classList.replace('bg-green-600', 'bg-yellow-600');
    ui.liveDot.className = "w-2 h-2 rounded-full bg-green-500 animate-ping";

    window.addEventListener('devicemotion', handleMotion);
    
    if ('wakeLock' in navigator) {
        navigator.wakeLock.request('screen').then(lock => STATE.wakeLock = lock).catch(console.error);
    }

    // High frequency timer for milliseconds
    STATE.timerInterval = setInterval(() => {
        STATE.elapsedTime = Date.now() - STATE.startTime;
        updateUI();
        if(STATE.goal.active) checkGoals(); // Check time based goals every tick
    }, 43); // ~24fps update for timer text
}

function pauseTracking() {
    STATE.isTracking = false;
    clearInterval(STATE.timerInterval);
    window.removeEventListener('devicemotion', handleMotion);
    
    if(STATE.wakeLock) STATE.wakeLock.release();

    ui.toggleBtn.innerHTML = '<span class="relative z-10">RESUME</span>';
    ui.toggleBtn.classList.replace('bg-yellow-600', 'bg-green-600');
    ui.liveDot.className = "w-2 h-2 rounded-full bg-red-500";
}

function resetTracking(autoSave = false) {
    pauseTracking();
    if(autoSave || STATE.steps > 0 || STATE.elapsedTime > 5000) {
        saveSession();
    }
    
    STATE.elapsedTime = 0;
    STATE.steps = 0;
    STATE.goal.active = false;
    ui.goalStatus.classList.add('hidden');
    
    ui.toggleBtn.innerHTML = '<span class="relative z-10">START SYSTEM</span>';
    updateUI();
}

function updateUI() {
    // Time Formatter (HH:MM:SS.ms)
    const diff = STATE.elapsedTime;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    const ms = Math.floor((diff % 1000) / 10); // 2 digits

    ui.timer.innerHTML = `${pad(h)}:${pad(m)}:${pad(s)}<span class="text-lg text-gray-500">.${pad(ms)}</span>`;

    ui.steps.textContent = STATE.steps;
    const km = (STATE.steps * 0.000762).toFixed(2);
    ui.dist.textContent = km;
}

function pad(n) { return n < 10 ? '0' + n : n; }

/* --- 4. PERSISTENCE (IndexedDB) --- */
const DB_NAME = 'XstepPulseDB';
function initDB() {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('sessions')) {
            db.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
        }
    };
    request.onsuccess = (e) => {
        STATE.db = e.target.result;
        loadHistory();
    };
}

function saveSession() {
    const transaction = STATE.db.transaction(['sessions'], 'readwrite');
    const store = transaction.objectStore('sessions');
    const session = {
        date: new Date().toISOString(),
        steps: STATE.steps,
        duration: STATE.elapsedTime,
        distance: (STATE.steps * 0.000762).toFixed(2)
    };
    store.add(session);
    loadHistory();
}

function loadHistory() {
    if (!STATE.db) return;
    const transaction = STATE.db.transaction(['sessions'], 'readonly');
    const store = transaction.objectStore('sessions');
    const request = store.getAll();

    request.onsuccess = () => {
        const data = request.result.reverse();
        
        if (data.length === 0) {
            ui.historyList.innerHTML = '<li class="text-gray-500 text-center py-10 font-mono text-xs">NO DATA FOUND</li>';
            return;
        }

        ui.historyList.innerHTML = data.map(item => {
            const dateObj = new Date(item.date);
            const date = dateObj.toLocaleDateString();
            const time = dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            
            // Format duration logic
            const ms = item.duration;
            const h = Math.floor(ms / 3600000);
            const m = Math.floor((ms % 3600000) / 60000);
            const s = Math.floor((ms % 60000) / 1000);
            const durStr = `${pad(h)}:${pad(m)}:${pad(s)}`;

            return `
                <li class="glass-panel rounded p-4 flex justify-between items-center transform hover:scale-[1.01] transition duration-300">
                    <div>
                        <div class="text-white font-black text-xl">${item.steps} <span class="text-[10px] text-green-500 uppercase">Steps</span></div>
                        <div class="text-gray-500 text-[10px] font-bold tracking-widest">${date} • ${time}</div>
                    </div>
                    <div class="text-right">
                        <div class="text-green-400 font-mono text-sm">${durStr}</div>
                        <div class="text-gray-500 text-[10px] uppercase">${item.distance} KM</div>
                    </div>
                </li>
            `;
        }).join('');
    };
}

function clearHistory() {
    const transaction = STATE.db.transaction(['sessions'], 'readwrite');
    transaction.objectStore('sessions').clear();
    loadHistory();
}

/* --- LISTENERS --- */
// Permission Request
async function requestPermissions() {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        try {
            const response = await DeviceMotionEvent.requestPermission();
            if (response === 'granted') {
                ui.sensorOverlay.classList.add('hidden');
                startTracking();
            } else {
                alert('Motion permission is required for this app to work.');
            }
        } catch (e) { console.error(e); }
    } else {
        ui.sensorOverlay.classList.add('hidden');
        startTracking();
    }
}

// Toggle Buttons
ui.toggleBtn.addEventListener('click', () => {
    if (!STATE.isTracking) {
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
    if(confirm('End session and save data?')) resetTracking();
});

document.getElementById('clearHistoryBtn').addEventListener('click', () => {
    if(confirm('Permanently delete all logs?')) clearHistory();
});

// View Switching
function switchView(v) {
    if (v === 'tracker') {
        ui.views.tracker.classList.remove('hidden-view');
        ui.views.dashboard.classList.add('hidden-view');
        ui.nav.tracker.classList.add('active-nav');
        ui.nav.dashboard.classList.remove('active-nav');
        // Resume 3D animation if needed
    } else {
        ui.views.tracker.classList.add('hidden-view');
        ui.views.dashboard.classList.remove('hidden-view');
        ui.nav.tracker.classList.remove('active-nav');
        ui.nav.dashboard.classList.add('active-nav');
        loadHistory();
    }
}
ui.nav.tracker.addEventListener('click', () => switchView('tracker'));
ui.nav.dashboard.addEventListener('click', () => switchView('dashboard'));

// Goal Toggle UI
ui.goalToggle.addEventListener('change', (e) => {
    if(e.target.checked) {
        ui.goalInputs.classList.remove('hidden');
    } else {
        ui.goalInputs.classList.add('hidden');
    }
});

// Initialization
initThreeJS();
initDB();
setInterval(updateRealTimeClock, 1000);
updateRealTimeClock();
console.log("XstepPulse 3D System Ready");