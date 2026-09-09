import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { PracticePage } from './pages/PracticePage.tsx'
import { LoginPage } from './pages/LoginPage.tsx'
import { RegisterPage } from './pages/RegisterPage.tsx'
import { Spinner } from './components/ui/Spinner.tsx'
import { AuthProvider } from './auth/AuthContext.tsx'
import { PublicOnly, RequireAuth } from './auth/guards.tsx'

// Route-split the heavier screens: Results/Progress pull in Recharts, which the
// initial Practice screen shouldn't pay for, and the welcome reel is only ever
// reached after signing in. Login/Register stay eager — they are the first
// thing a signed-out visitor sees, so a loading flash there is a bad trade.
const ResultsPage = lazy(() =>
  import('./pages/ResultsPage.tsx').then((m) => ({ default: m.ResultsPage })),
)
const ProgressPage = lazy(() =>
  import('./pages/ProgressPage.tsx').then((m) => ({ default: m.ProgressPage })),
)
const HowItsScoredPage = lazy(() =>
  import('./pages/HowItsScoredPage.tsx').then((m) => ({ default: m.HowItsScoredPage })),
)
const WelcomePage = lazy(() =>
  import('./pages/WelcomePage.tsx').then((m) => ({ default: m.WelcomePage })),
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<Spinner label="Loading…" />}>
          <Routes>
            <Route
              path="/login"
              element={
                <PublicOnly>
                  <LoginPage />
                </PublicOnly>
              }
            />
            <Route
              path="/register"
              element={
                <PublicOnly>
                  <RegisterPage />
                </PublicOnly>
              }
            />
            {/* Full-bleed, outside the app chrome. */}
            <Route
              path="/welcome"
              element={
                <RequireAuth>
                  <WelcomePage />
                </RequireAuth>
              }
            />
            <Route
              element={
                <RequireAuth>
                  <App />
                </RequireAuth>
              }
            >
              <Route index element={<PracticePage />} />
              <Route path="results/:id" element={<ResultsPage />} />
              <Route path="progress" element={<ProgressPage />} />
              <Route path="how-its-scored" element={<HowItsScoredPage />} />
              {/* A mistyped URL lands on the dashboard rather than a blank page. */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
