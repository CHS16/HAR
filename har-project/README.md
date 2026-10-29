# MotionSense: Human Activity Recognition & Real-Time Pedometer with Smartphone Sensors

MotionSense is a full-stack, production-grade Human Activity Recognition (HAR) and real-time sensor analytics platform. It classifies human motion (**Walking, Running, Walking Upstairs, Walking Downstairs, Sitting, Standing, and Laying**) using deep learning (**Conv1D + LSTM**) and physical biomechanical kinematics from smartphone accelerometers and gyroscopes.

| Layer | Technology |
|---|---|
| **ML Model** | TensorFlow / Keras, Conv1D + LSTM neural network trained on UCI HAR with biomechanical calibration |
| **Backend** | Python 3, Flask, JWT Bearer Authentication, RESTful API |
| **Database** | MongoDB Atlas (with in-memory `mongomock` fallback for local demo) |
| **Frontend** | React 18, Vite (HTTPS enabled), Tailwind CSS v4, Recharts, Lucide Icons, Axios |
| **Mobile Access** | Built-in HTTPS (`@vitejs/plugin-basic-ssl`) & Cloudflare Tunnel for secure sensor access from any smartphone |

---

## 1. Key Features

- **Real Phone Sensor Mode (`DeviceMotionEvent`)**:
  - Connect your smartphone directly to the web app over HTTPS or a global Cloudflare tunnel.
  - Classifies activities in real time directly from your device's physical accelerometer and gyroscope.
  - Displays dynamic gravity pose estimation, step frequency (cadence in steps/s), dynamic impact shocks ($g$), and classification confidence.
- **Precision Hardware Pedometer**:
  - Continuous IIR low-pass filter (~3.5 Hz) + dynamic baseline tracking on the phone's native sensor stream.
  - 240 ms anti-bounce refractory timing and 2-step cadence confirmation to eliminate false counts from phone handling or typing.
  - Real-time step counter with live distance estimation ($\approx \text{km}$) and instantaneous reset.
- **Comprehensive Activity Coverage (7 Classes)**:
  - `WALKING`, `WALKING_UPSTAIRS`, `WALKING_DOWNSTAIRS`, `RUNNING`, `SITTING`, `STANDING`, and `LAYING`.
  - Advanced kinetic discrimination cleanly separates normal walking heel strikes from flight-phase running impact shocks.
- **Dataset Replay Simulator**:
  - Simulates phone recordings window-by-window (2.56 s window every 1.28 s) from UCI HAR test subjects.
  - Interactive activity jumping buttons (Standing, Sitting, Laying, Walking, Upstairs, Downstairs, Running).
  - Variable speed control (1× to 8×) and Gaussian noise injection ($\sigma$).
- **Dashboard & History Tracking**:
  - Aggregates total predictions, total steps tracked, distance walked, accuracy, and class distribution.
  - Session replay detail pages with second-by-second sensor timelines and step metrics.
- **Model Inspector**:
  - View model architecture, confusion matrix, precision/recall/F1 metrics, and inference latency.

---

## 2. Project Structure

```
har-project/
├── README.md
├── backend/
│   ├── run.py                       # Flask application entry point
│   ├── requirements.txt             # Python dependencies
│   ├── .env.example                 # Environment configuration template
│   ├── app/
│   │   ├── __init__.py              # Flask app factory, CORS, blueprints, error handling
│   │   ├── config.py                # Configuration loader
│   │   ├── db.py                    # MongoDB Atlas & mongomock connection
│   │   ├── routes/
│   │   │   ├── auth.py              # /api/auth (register, login, me)
│   │   │   ├── predict.py           # /api/predict, /api/predict/live_sensor, /api/predict/upload
│   │   │   ├── stream.py            # /api/stream (session start, next window, jump, stop)
│   │   │   ├── history.py           # /api/history (predictions, stats, session details)
│   │   │   └── model.py             # /api/model/info
│   │   ├── services/
│   │   │   ├── model_service.py     # Keras Conv1D+LSTM loader & inference engine
│   │   │   ├── sensor_processor.py  # Real phone sensor feature extraction, gravity decomposition & gait kinematics
│   │   │   ├── stream_service.py    # UCI HAR dataset stream engine
│   │   │   └── prediction_log.py    # Log persistence
│   │   └── utils/
│   │       ├── auth.py              # Password hashing, JWT token creation/verification
│   │       └── serialize.py         # MongoDB ObjectId/datetime JSON serialization
│   ├── ml/
│   │   ├── model_def.py             # Conv1D + LSTM neural network definition
│   │   └── train.py                 # Training script for UCI HAR dataset
│   ├── models/
│   │   ├── har_conv1d_lstm.keras    # Trained deep learning model
│   │   ├── preprocessing.json       # Feature scaler parameters & labels
│   │   └── metrics.json             # Validation metrics & confusion matrix
│   └── data/
│       ├── test.csv                 # UCI HAR test dataset
│       └── train.csv                # UCI HAR training dataset
└── frontend/
    ├── package.json
    ├── vite.config.js               # HTTPS config, basic-ssl, proxy to Flask (:5000)
    └── src/
        ├── App.jsx                  # Main router & page navigation
        ├── index.css                # Design system & styles
        ├── api/client.js            # Axios client with JWT interceptor
        ├── pages/
        │   ├── Dashboard.jsx        # Stats, step counters, class distributions
        │   ├── LiveMonitor.jsx      # Phone hardware sensor mode & dataset replay simulator
        │   ├── Predict.jsx          # Single window & CSV batch prediction
        │   ├── History.jsx          # Filterable prediction log history
        │   ├── SessionDetail.jsx    # Session replay & sensor history graphs
        │   └── ModelInfo.jsx        # Neural network architecture & metrics
        └── components/              # StatTile, Card, ActivityBadge, charts, navigation
```

---

## 3. Quick Start & Setup

### Prerequisites
- **Python**: 3.10 – 3.12 (TensorFlow compatible)
- **Node.js**: 18+ (20 LTS recommended)
- **MongoDB Atlas** or local MongoDB (an automatic in-memory mock DB is used if not configured)

---

### Step 1: Backend Setup

```bash
cd backend

# Create and activate virtual environment
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux / macOS:
source venv/bin/activate

# Install dependencies
pip install --upgrade pip
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env to set MONGO_URI (or set USE_MOCK_DB=true) and JWT_SECRET

# Start Flask backend (runs on http://localhost:5000)
python run.py
```

Health check: verify by navigating to `http://localhost:5000/api/health`.

---

### Step 2: Frontend Setup

Open a **separate terminal**:

```bash
cd frontend

# Install dependencies
npm install

# Start Vite HTTPS development server
npm run dev -- --host
```

The frontend will run on:
- Local: `https://localhost:5173`
- Network (LAN): `https://<YOUR_LOCAL_IP>:5173`

> **Note on HTTPS**: Mobile browsers require a secure HTTPS origin to grant access to physical motion sensors (`DeviceMotionEvent`). Vite automatically provisions a local SSL certificate using `@vitejs/plugin-basic-ssl`. When opening on mobile for the first time, simply accept the self-signed certificate warning ("Advanced" → "Proceed").

---

### Step 3: Remote Mobile Access (Optional Cloudflare Tunnel)

To access the sensor monitor from your smartphone over mobile data (or outside your local Wi-Fi):

```bash
# Using Cloudflare Tunnel:
.\cloudflared.exe tunnel --url https://localhost:5173 --no-tls-verify --protocol http2 --edge-ip-version 4
```

This generates an instant public HTTPS URL (e.g. `https://xxxx.trycloudflare.com`) that you can open on any phone anywhere in the world.

---

## 4. How the Sensor & Pedometer Pipeline Works

### Real-Time Phone Motion (`/api/predict/live_sensor`)
1. **Sensor Ingestion**: Captures triaxial acceleration ($a_x, a_y, a_z$) and rotation rate ($g_x, g_y, g_z$) at 50 Hz.
2. **Kinematic Decomposition**:
   - Isolates the static **gravity vector** to deduce device inclination (standing upright, sitting tilted, laying flat).
   - Computes dynamic **body acceleration** magnitude: $A_{\text{body}} = \sqrt{(a_x - g_x)^2 + (a_y - g_y)^2 + (a_z - g_z)^2}$.
   - Calculates **jerk** ($\frac{dA}{dt}$) to measure landing shock sharpness.
3. **Hardware Pedometer**:
   - Single-pole IIR low-pass filter ($\alpha = 0.22$, cutoff $\approx 3.5\text{ Hz}$) removes sensor noise.
   - Dynamic baseline tracking isolates true foot strikes ($\Delta \ge 1.15\text{ m/s}^2$).
   - A 240 ms anti-bounce refractory window prevents spurious counts from foot rebound or pocket movement.
   - Two-step confirmation window prevents false counts from handling or sitting down.
4. **Walking vs. Running Discrimination**:
   - `WALKING`: Body std $\in [0.08, 0.35]g$, cadence $1.4 - 2.2\text{ steps/s}$, moderate kinetic impact.
   - `RUNNING`: Requires true flight-phase impact shocks (cadence $\ge 2.6\text{ steps/s}$, body std $\ge 0.45g$, body peak $\ge 1.5g$).

---

## 5. API Reference

All protected endpoints require `Authorization: Bearer <token>`.

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | GET | Server health, database connection, model mode |
| `/api/auth/register` | POST | Register new account (`{name, email, password}`) |
| `/api/auth/login` | POST | User login, returns JWT token |
| `/api/auth/me` | GET | Current logged-in user profile |
| `/api/predict/live_sensor` | POST | Real-time sensor window inference from phone hardware |
| `/api/predict` | POST | Predict manual 561-feature vector or batch array |
| `/api/predict/upload` | POST | Upload CSV dataset file for batch classification & confusion matrix |
| `/api/predict/sample` | GET | Fetch a sample window by activity class |
| `/api/stream/subjects` | GET | List available UCI HAR test subjects |
| `/api/stream/start` | POST | Initialize simulated replay session (`{subject_id, noise, offset, condensed}`) |
| `/api/stream/<id>/next` | POST | Fetch and classify next window(s) with step accumulation |
| `/api/stream/<id>/stop` | POST | End replay session |
| `/api/history/stats` | GET | Total counts, step totals, distance, model accuracy |
| `/api/history/predictions` | GET | Paginated prediction log records |
| `/api/model/info` | GET | Neural network architecture layers and validation metrics |

---

## 6. Troubleshooting

- **"DeviceMotionEvent is not supported" on Phone**:
  Ensure you are opening the site via **HTTPS** (`https://...`), not HTTP. Browsers block motion sensors on unencrypted connections.
- **Steps Not Counting When Phone Is Shaken**:
  This is intended behavior. The pedometer requires a 2-step rhythmic cadence with physiological timing to reject accidental hand shakes and phone fidgeting.
- **Walking Showing as Running**:
  Ensure the phone is held or carried naturally. Running classification requires sustained flight-phase impact shocks ($> 1.5g$ peak acceleration).
- **Backend Connection Issues**:
  Check that the Flask server is running on `http://localhost:5000`. Vite automatically proxies `/api` calls from `localhost:5173` to `localhost:5000`.

---

## 7. License

Distributed under the MIT License. Built with the UCI Human Activity Recognition Dataset.
