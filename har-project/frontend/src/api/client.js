import axios from "axios";

const TOKEN_KEY = "har_token";

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (t) => {
    try {
      localStorage.setItem(TOKEN_KEY, t);
    } catch {
      /* storage unavailable */
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable */
    }
  },
};

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL || ""}/api`,
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Broadcast 401s so the AuthContext can log the user out
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !err.config?.url?.startsWith("/auth/")) {
      window.dispatchEvent(new Event("har:unauthorized"));
    }
    return Promise.reject(err);
  }
);

export const errorMessage = (err) =>
  err?.response?.data?.error || (err?.code === "ERR_NETWORK" ? "Cannot reach the backend - is Flask running on port 5000?" : err?.message) || "Something went wrong";

// ---- Endpoints ---------------------------------------------------------------
export const authApi = {
  register: (data) => api.post("/auth/register", data).then((r) => r.data),
  login: (data) => api.post("/auth/login", data).then((r) => r.data),
  me: () => api.get("/auth/me").then((r) => r.data),
};

export const modelApi = {
  info: () => api.get("/model/info").then((r) => r.data),
  health: () => api.get("/health").then((r) => r.data),
};

export const predictApi = {
  predict: (features, true_label, source = "manual") =>
    api.post("/predict", { features, true_label, source }).then((r) => r.data),
  sample: (activity) => api.get("/predict/sample", { params: { activity } }).then((r) => r.data),
  upload: (file, onUploadProgress) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post("/predict/upload", fd, { onUploadProgress, timeout: 120000 }).then((r) => r.data);
  },
  predictLiveSensor: (samples) => api.post("/predict/live_sensor", { samples }).then((r) => r.data),
};

export const streamApi = {
  subjects: () => api.get("/stream/subjects").then((r) => r.data),
  start: (subject, noise, offset = 0, condensed = true) =>
    api.post("/stream/start", { subject, noise, offset, condensed }).then((r) => r.data),
  next: (id, count = 1) => api.post(`/stream/${id}/next`, { count }).then((r) => r.data),
  stop: (id) => api.post(`/stream/${id}/stop`).then((r) => r.data),
  seek: (id, offset) => api.post(`/stream/${id}/seek`, { offset }).then((r) => r.data),
  sessions: () => api.get("/stream/sessions").then((r) => r.data),
  session: (id) => api.get(`/stream/sessions/${id}`).then((r) => r.data),
};

export const historyApi = {
  predictions: (params) => api.get("/history/predictions", { params }).then((r) => r.data),
  clear: () => api.delete("/history/predictions").then((r) => r.data),
  stats: () => api.get("/history/stats").then((r) => r.data),
};

export default api;
