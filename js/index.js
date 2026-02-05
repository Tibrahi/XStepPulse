/* --- CONFIGURATION & STATE --- */
const STATE = {
    isTracking: false,
    startTime: 0,
    elapsedTime: 0,
    steps: 0,
    timerInterval: null,
    wakeLock: null,
    db: null,
    goal: { active: false, steps: 0, minutes: 0 },
    lastStepTime: 0,
    // Pedometer State
    gravity: { x: 0, y: 0, z: 0 },
    lastLinearAcc: 0
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
    // New Inputs
    inputSteps: document.getElementById('goalSteps'),
    wheelMinutes: document.getElementById('goalMinutesWheel'),
    
    views: {
        tracker: document.getElementById('viewTracker'),
        dashboard: document.getElementById('viewDashboard')
    },
    nav: {
        tracker: document.getElementById('navTracker'),
        dashboard: document.getElementById('navDashboard')
    },
    historyList: document.getElementById('historyList'),
    // Custom Modals
    modal: document.getElementById('customModal'),
    modalTitle: document.getElementById('modalTitle'),
    modalMsg: document.getElementById('modalMessage'),
    modalConfirmBtn: document.getElementById('modalConfirm'),
    modalCancelBtn: document.getElementById('modalCancel'),
    toast: document.getElementById('toast'),
    toastTitle: document.getElementById('toastTitle'),
    toastMsg: document.getElementById('toastMessage')
};

let modalCallback = null;

/* --- 1. UTILITIES & NOTIFICATIONS --- */

function updateRealTimeClock() {
    ui.realTime.textContent = new Date().toLocaleTimeString();
}

// Custom Toast Notification
function showToast(title, msg) {
    ui.toastTitle.textContent = title;
    ui.toastMsg.textContent = msg;
    ui.toast.classList.add('toast-visible');
    
    // Auto hide after 3s
    setTimeout(() => {
        ui.toast.classList.remove('toast-visible');
    }, 3500);
}

// Custom Confirmation Modal
function showConfirmation(title, msg, onConfirm) {
    ui.modalTitle.textContent = title;
    ui.modalMsg.textContent = msg;
    ui.modal.classList.remove('hidden');
    modalCallback = onConfirm;
}

function hideModal() {
    ui.modal.classList.add('hidden');
    modalCallback = null;
}

ui.modalCancelBtn.onclick = hideModal;
ui.modalConfirmBtn.onclick = () => {
    if (modalCallback) modalCallback();
    hideModal();
};

/* --- 2. THREE.JS VISUALIZATION --- */
let scene, camera, renderer, coreMesh, wireMesh;

function initThreeJS() {
    const container = document.getElementById('canvas-container');
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.02);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 5;

    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // Objects
    const geometry = new THREE.IcosahedronGeometry(2, 1);
    const wireMat = new THREE.MeshBasicMaterial({ color: 0x22c55e, wireframe: true, transparent: true, opacity: 0.3 });
    const coreMat = new THREE.MeshBasicMaterial({ color: 0x000000 });

    wireMesh = new THREE.Mesh(geometry, wireMat);
    coreMesh = new THREE.Mesh(geometry, coreMat);
    scene.add(wireMesh);
    scene.add(coreMesh);
    scene.add(new THREE.AmbientLight(0x404040));

    animateThreeJS();
    window.addEventListener('resize', onWindowResize, false);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animateThreeJS() {
    requestAnimationFrame(animateThreeJS);
    wireMesh.rotation.x += 0.002;
    wireMesh.rotation.y += 0.003;
    if (wireMesh.scale.x > 1) {
        wireMesh.scale.x -= 0.03; wireMesh.scale.y -= 0.03; wireMesh.scale.z -= 0.03;
    } else {
        wireMesh.scale.set(1, 1, 1);
    }
    renderer.render(scene, camera);
}

function triggerVisualPulse() {
    if(wireMesh) {
        wireMesh.scale.set(1.4, 1.4, 1.4);
        wireMesh.rotation.y += 0.5;
    }
}

/* --- 3. PEDOMETER LOGIC (SENSITIVE) --- */
// Using Low Pass Filter to remove Gravity
const ALPHA = 0.8; // Filter constant
const STEP_THRESHOLD = 1.2; // Linear acceleration (m/s^2) threshold for walking

function handleMotion(event) {
    if (!STATE.isTracking) return;

    // Get raw data
    const x = event.accelerationIncludingGravity.x || 0;
    const y = event.accelerationIncludingGravity.y || 0;
    const z = event.accelerationIncludingGravity.z || 0;

    // Isolate Gravity (Low Pass Filter)
    STATE.gravity.x = ALPHA * STATE.gravity.x + (1 - ALPHA) * x;
    STATE.gravity.y = ALPHA * STATE.gravity.y + (1 - ALPHA) * y;
    STATE.gravity.z = ALPHA * STATE.gravity.z + (1 - ALPHA) * z;

    // Remove Gravity (High Pass Filter) to get Linear Acceleration
    const linX = x - STATE.gravity.x;
    const linY = y - STATE.gravity.y;
    const linZ = z - STATE.gravity.z;

    // Calculate magnitude of linear acceleration
    const linearMagnitude = Math.sqrt(linX*linX + linY*linY + linZ*linZ);

    // Peak detection logic
    const now = Date.now();
    if (linearMagnitude > STEP_THRESHOLD && (now - STATE.lastStepTime > 350)) {
        // Confirm it's a peak (rising edge) - Simplified for this demo
        STATE.steps++;
        STATE.lastStepTime = now;
        updateUI();
        triggerVisualPulse();
        checkGoals();
    }
}

/* --- 4. WHEEL PICKER LOGIC --- */
function initWheelPicker() {
    const wheel = ui.wheelMinutes;
    // Populate 1 to 120 minutes
    for (let i = 1; i <= 120; i++) {
        const li = document.createElement('li');
        li.className = "snap-center py-2 cursor-pointer hover:text-green-400";
        li.textContent = i;
        li.dataset.val = i;
        li.onclick = function() {
            // Scroll to this element
            wheel.scrollTo({ top: this.offsetTop - wheel.offsetHeight/2 + this.offsetHeight/2, behavior: 'smooth' });
        }
        wheel.appendChild(li);
    }

    // Add padding elements at bottom to allow last item to hit center
    const spacer = document.createElement('li');
    spacer.className = "h-10";
    wheel.appendChild(spacer);
}

function getWheelValue() {
    const wheel = ui.wheelMinutes;
    const center = wheel.scrollTop + (wheel.offsetHeight / 2);
    const elements = wheel.getElementsByTagName('li');
    
    let closest = null;
    let closestDist = Infinity;

    for (let el of elements) {
        const elCenter = el.offsetTop + (el.offsetHeight / 2);
        const dist = Math.abs(center - elCenter);
        if (dist < closestDist) {
            closestDist = dist;
            closest = el;
        }
    }
    
    if (closest && closest.dataset.val) return parseInt(closest.dataset.val);
    return 0;
}

/* --- 5. APP LOGIC --- */

function startTracking() {
    // Read Goals
    const sGoal = parseInt(ui.inputSteps.value) || 0;
    const mGoal = getWheelValue(); // Get from custom wheel
    
    if (ui.goalToggle.checked && (sGoal > 0 || mGoal > 0)) {
        STATE.goal = { active: true, steps: sGoal, minutes: mGoal };
        ui.goalStatus.classList.remove('hidden');
        ui.goalStatus.textContent = `TARGET: ${sGoal > 0 ? sGoal + ' steps' : ''} ${mGoal > 0 ? mGoal + ' mins' : ''}`;
    } else {
        STATE.goal = { active: false, steps: 0, minutes: 0 };
        ui.goalStatus.classList.add('hidden');
    }

    STATE.isTracking = true;
    STATE.startTime = Date.now() - STATE.elapsedTime;
    
    ui.toggleBtn.innerHTML = '<span class="relative z-10">PAUSE</span>';
    ui.toggleBtn.classList.replace('bg-green-600', 'bg-yellow-600');
    ui.liveDot.className = "w-2 h-2 rounded-full bg-green-500 animate-ping";

    window.addEventListener('devicemotion', handleMotion);
    
    if ('wakeLock' in navigator) navigator.wakeLock.request('screen').then(l => STATE.wakeLock = l).catch(e=>console.log(e));

    STATE.timerInterval = setInterval(() => {
        STATE.elapsedTime = Date.now() - STATE.startTime;
        updateUI();
        if(STATE.goal.active) checkGoals();
    }, 43);
}

function checkGoals() {
    if (!STATE.goal.active) return;
    let met = false;
    if (STATE.goal.steps > 0 && STATE.steps >= STATE.goal.steps) met = true;
    if (STATE.goal.minutes > 0 && (STATE.elapsedTime / 60000) >= STATE.goal.minutes) met = true;

    if (met) {
        if ("vibrate" in navigator) navigator.vibrate([200, 100, 200]);
        resetTracking(true); 
        showToast("GOAL REACHED!", "Session auto-saved successfully.");
    }
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
        if(!autoSave) showToast("Session Saved", "Your data has been logged.");
    } else if (!autoSave) {
        showToast("Discarded", "Session was too short to save.");
    }
    
    STATE.elapsedTime = 0;
    STATE.steps = 0;
    STATE.goal.active = false;
    ui.goalStatus.classList.add('hidden');
    
    ui.toggleBtn.innerHTML = '<span class="relative z-10">START SYSTEM</span>';
    updateUI();
}

function updateUI() {
    const diff = STATE.elapsedTime;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    const ms = Math.floor((diff % 1000) / 10);

    ui.timer.innerHTML = `${pad(h)}:${pad(m)}:${pad(s)}<span class="text-lg text-gray-500">.${pad(ms)}</span>`;
    ui.steps.textContent = STATE.steps;
    ui.dist.textContent = (STATE.steps * 0.000762).toFixed(2);
}

function pad(n) { return n < 10 ? '0' + n : n; }

/* --- 6. DATABASE & ACTIONS --- */
// (Keep existing indexedDB logic but removed alerts)
const DB_NAME = 'XstepPulseDB';
function initDB() {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
    };
    request.onsuccess = (e) => { STATE.db = e.target.result; loadHistory(); };
}

function saveSession() {
    const transaction = STATE.db.transaction(['sessions'], 'readwrite');
    const store = transaction.objectStore('sessions');
    store.add({
        date: new Date().toISOString(),
        steps: STATE.steps,
        duration: STATE.elapsedTime,
        distance: (STATE.steps * 0.000762).toFixed(2)
    });
    loadHistory();
}

function loadHistory() {
    if (!STATE.db) return;
    const store = STATE.db.transaction(['sessions'], 'readonly').objectStore('sessions');
    const request = store.getAll();
    request.onsuccess = () => {
        const data = request.result.reverse();
        ui.historyList.innerHTML = data.length === 0 
            ? '<li class="text-gray-500 text-center py-10 font-mono text-xs">NO DATA FOUND</li>' 
            : data.map(item => {
                const d = new Date(item.date);
                const ms = item.duration;
                const timeStr = `${pad(Math.floor(ms/3600000))}:${pad(Math.floor((ms%3600000)/60000))}:${pad(Math.floor((ms%60000)/1000))}`;
                return `
                <li class="glass-panel rounded p-4 flex justify-between items-center transform hover:scale-[1.01] transition duration-300">
                    <div>
                        <div class="text-white font-black text-xl">${item.steps} <span class="text-[10px] text-green-500 uppercase">Steps</span></div>
                        <div class="text-gray-500 text-[10px] font-bold tracking-widest">${d.toLocaleDateString()} • ${d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
                    </div>
                    <div class="text-right">
                        <div class="text-green-400 font-mono text-sm">${timeStr}</div>
                        <div class="text-gray-500 text-[10px] uppercase">${item.distance} KM</div>
                    </div>
                </li>`;
            }).join('');
    };
}

function clearHistory() {
    STATE.db.transaction(['sessions'], 'readwrite').objectStore('sessions').clear();
    loadHistory();
    showToast("Database Purged", "All logs have been removed.");
}

/* --- EVENT LISTENERS --- */

async function requestPermissions() {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        try {
            const response = await DeviceMotionEvent.requestPermission();
            if (response === 'granted') {
                ui.sensorOverlay.classList.add('hidden');
                startTracking();
            } else {
                showToast("Error", "Permission Denied. Cannot track steps.");
            }
        } catch (e) { console.error(e); }
    } else {
        ui.sensorOverlay.classList.add('hidden');
        startTracking();
    }
}

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
    showConfirmation("Stop & Save?", "This will end the current session.", () => {
        resetTracking();
    });
});

document.getElementById('clearHistoryBtn').addEventListener('click', () => {
    showConfirmation("Delete Logs?", "This cannot be undone.", () => {
        clearHistory();
    });
});

// View Switching
ui.nav.tracker.addEventListener('click', () => {
    ui.views.tracker.classList.remove('hidden-view');
    ui.views.dashboard.classList.add('hidden-view');
    ui.nav.tracker.classList.add('active-nav');
    ui.nav.dashboard.classList.remove('active-nav');
});

ui.nav.dashboard.addEventListener('click', () => {
    ui.views.tracker.classList.add('hidden-view');
    ui.views.dashboard.classList.remove('hidden-view');
    ui.nav.tracker.classList.remove('active-nav');
    ui.nav.dashboard.classList.add('active-nav');
    loadHistory();
});

// Goal Toggle
ui.goalToggle.addEventListener('change', (e) => {
    if(e.target.checked) ui.goalInputs.classList.remove('hidden');
    else ui.goalInputs.classList.add('hidden');
});

// Init
initThreeJS();
initDB();
initWheelPicker();
setInterval(updateRealTimeClock, 1000);
updateRealTimeClock();