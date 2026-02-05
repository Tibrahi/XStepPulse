# XSTEP PULSE 3D // SYSTEM OPERATIONAL SPECIFICATIONS

## 1. SYSTEM OVERVIEW

XstepPulse 3D is a browser-based biometric telemetry interface designed for real-time kinetic monitoring. The system utilizes advanced sensor fusion algorithms to interpret device motion, translating physical user activity into quantifiable metrics (step count and distance) while simultaneously driving a reactive 3D visualization core. The interface is constructed with a "Glassmorphism" aesthetic, ensuring high-contrast visibility and a futuristic Heads-Up Display (HUD) experience.

## 2. SENSOR LOGIC & MOTION ACQUISITION

Unlike primitive counters that require aggressive device agitation, this system employs a sophisticated **Linear Acceleration Algorithm**.

* **Gravity Compensation (Low-Pass Filter):** The system continuously ingests raw accelerometer data from the device. It applies a mathematical Low-Pass Filter to isolate the constant force of gravity. By subtracting this gravity vector from the total acceleration, the system derives "Linear Acceleration"—the true movement of the user.
* **Threshold Detection:** The system monitors the Linear Acceleration for specific magnitude peaks that exceed a calibrated threshold (set to detect the natural vertical bounce of a walking gait).
* **Bounce Rejection:** To prevent false positives from vibration or handling, a temporal gate (time-lock) is applied between detected steps, ensuring only rhythmic, human-scale motion is logged.

## 3. INTERFACE & INPUT MECHANICS

The User Interface (UI) has been upgraded to a fully immersive environment, removing all native browser interruptions (system alerts/popups) in favor of integrated overlay controls.

* **Tactile Scroll-Snap Input (The "Wrapper" Effect):**
Time-based goals are no longer entered via standard keypads. The system implements a **Kinetic Wheel Picker**. Users drag or flick a vertical tumbler to select target duration. This mimics the physics of a mechanical lock or iOS-style drum selector, utilizing scroll-snap physics to align the selected value perfectly within the focus window.
* **Non-Intrusive Notifications:**
System status updates (e.g., "Goal Reached," "Session Saved") are delivered via a **Toast Notification System**. These appear transiently in the upper visual periphery and auto-dismiss, maintaining the user's immersion without requiring confirmation clicks.
* **Custom Confirmation Modals:**
Critical destructive actions (such as purging the database or stopping a session) trigger a stylized, glass-overlay modal within the DOM, ensuring the visual theme remains consistent and the user never leaves the application context.

## 4. VISUALIZATION ENGINE

The central visual component is a WebGL-rendered Icosahedron "Core."

* **Idle State:** The core rotates on a dual-axis at a low frequency to indicate system readiness.
* **Reactive Pulse:** Upon the successful registration of a valid step, the core undergoes a momentary scale expansion and rotation acceleration. This provides immediate, peripheral visual feedback to the user that their motion has been captured.

## 5. DATA PERSISTENCE & STORAGE

The system operates on a "Local-First" architecture using **IndexedDB**.

* **Session Logging:** When a tracking session concludes (either manually or via auto-stop goals), the telemetry data (Date, Duration, Step Count, Calculated Distance) is serialized and committed to the browser's persistent storage.
* **Data Integrity:** This ensures that workout history remains available even after the browser is closed or the device is rebooted, without requiring external server connectivity.

## 6. ADAPTIVE VIEWPORT SCALING

The layout engine utilizes **Dynamic Viewport Height (dvh)** standards. This ensures that on mobile devices, the interface automatically accounts for dynamic system UI elements (such as URL bars or gesture navigation handles) preventing content occlusion and eliminating scroll-bounce on the main body. The system is locked to portrait or landscape constraints based on the device's physical orientation.