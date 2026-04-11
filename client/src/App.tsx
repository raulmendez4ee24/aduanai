import { Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { LandingPage } from './pages/Landing';
import { LoginPage } from './pages/Login';
import { ClassifierPage } from './pages/Classifier';
import { QuoterPage } from './pages/Quoter';
import { CopilotPage } from './pages/Copilot';
import { DashboardPage } from './pages/Dashboard';
import { HistoryPage } from './pages/History';
import { AlertsPage } from './pages/Alerts';
import { OperationsPage } from './pages/Operations';
import { AnalyticsPage } from './pages/Analytics';

export function App() {
  const [token, setToken] = useState<string | null>(
    localStorage.getItem('aduanai_token')
  );

  useEffect(() => {
    if (token) {
      localStorage.setItem('aduanai_token', token);
    } else {
      localStorage.removeItem('aduanai_token');
    }
  }, [token]);

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={token ? <Navigate to="/app" replace /> : <LandingPage />} />
      <Route path="/login" element={token ? <Navigate to="/app" replace /> : <LoginPage onLogin={setToken} />} />

      {/* Protected routes */}
      <Route
        path="/app"
        element={
          token ? (
            <Layout onLogout={() => setToken(null)}>
              <DashboardPage />
            </Layout>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/clasificador"
        element={
          token ? (
            <Layout onLogout={() => setToken(null)}>
              <ClassifierPage />
            </Layout>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/cotizador"
        element={
          token ? (
            <Layout onLogout={() => setToken(null)}>
              <QuoterPage />
            </Layout>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/copilot"
        element={
          token ? (
            <Layout onLogout={() => setToken(null)}>
              <CopilotPage />
            </Layout>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/analytics"
        element={
          token ? (
            <Layout onLogout={() => setToken(null)}>
              <AnalyticsPage />
            </Layout>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/expediente"
        element={
          token ? (
            <Layout onLogout={() => setToken(null)}>
              <OperationsPage />
            </Layout>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/alertas"
        element={
          token ? (
            <Layout onLogout={() => setToken(null)}>
              <AlertsPage />
            </Layout>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/historial"
        element={
          token ? (
            <Layout onLogout={() => setToken(null)}>
              <HistoryPage />
            </Layout>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
