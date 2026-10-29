import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import Dashboard from "./pages/Dashboard";
import History from "./pages/History";
import LiveMonitor from "./pages/LiveMonitor";
import Login from "./pages/Login";
import ModelInfo from "./pages/ModelInfo";
import Predict from "./pages/Predict";
import Register from "./pages/Register";
import SessionDetail from "./pages/SessionDetail";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="live" element={<LiveMonitor />} />
        <Route path="predict" element={<Predict />} />
        <Route path="history" element={<History />} />
        <Route path="history/sessions/:id" element={<SessionDetail />} />
        <Route path="model" element={<ModelInfo />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
