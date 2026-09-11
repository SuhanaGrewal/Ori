import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import WorkflowBuildDemo from "./WorkflowBuildDemo";
import LandingPage from "./LandingPage";
import LandingPageWithDemo from "./LandingPageWithDemo";
import DraftingBackground from "./DraftingBackground";
import LoginPage from "./pages/LoginPage";
import GoogleConsentPage from "./pages/GoogleConsentPage";
import DashboardPage from "./pages/DashboardPage";
import SettingsPage from "./pages/SettingsPage";
import AuditLogPage from "./pages/AuditLogPage";
import QueuePage from "./pages/QueuePage";
import ProtectedRoute from "./components/ProtectedRoute";
import { captureSessionFromUrl, hydrateSession } from "./auth/realAuth";

const VIEW = "site"; // "site" = full page | "landingWithDemo" | "landing" | "demo"

const PAPER_WARM = "#FBF9F4";
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23g)' opacity='0.14'/%3E%3C/svg%3E\")";

// the page is just the hero — one drafting-desk surface, no sections below it
function Site() {
  return (
    <div style={{ position: "relative", background: PAPER_WARM, backgroundImage: GRAIN }}>
      <DraftingBackground />
      <div style={{ position: "relative", zIndex: 1 }}>
        <LandingPageWithDemo />
      </div>
    </div>
  );
}

function DebugView() {
  if (VIEW === "demo") {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", padding: 40 }}>
        <WorkflowBuildDemo />
      </div>
    );
  }
  if (VIEW === "landingWithDemo") {
    return <LandingPageWithDemo />;
  }
  if (VIEW === "site") {
    return <Site />;
  }
  return <LandingPage />;
}

// Resolves the real session (a "?session=<token>" dropped by the OAuth
// callback's redirect, or one already stored from a prior visit) before
// any route renders - getCurrentUser() elsewhere in the app stays
// synchronous (matching every page's existing call pattern) only because
// this gate has already populated its cache by the time routes mount.
function AuthBoot({ children }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    captureSessionFromUrl();
    hydrateSession().finally(() => setReady(true));
  }, []);

  if (!ready) return null;
  return children;
}

function App() {
  return (
    <BrowserRouter>
      <AuthBoot>
        <Routes>
          <Route path="/" element={<DebugView />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/google" element={<GoogleConsentPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/audit"
            element={
              <ProtectedRoute>
                <AuditLogPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/queue"
            element={
              <ProtectedRoute>
                <QueuePage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthBoot>
    </BrowserRouter>
  );
}

export default App;
