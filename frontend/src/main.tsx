import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { PracticePage } from './pages/PracticePage.tsx'
import { Spinner } from './components/ui/Spinner.tsx'

// Route-split the heavier screens: Results/Progress pull in Recharts, which the
// initial Practice screen shouldn't pay for.
const ResultsPage = lazy(() =>
  import('./pages/ResultsPage.tsx').then((m) => ({ default: m.ResultsPage })),
)
const ProgressPage = lazy(() =>
  import('./pages/ProgressPage.tsx').then((m) => ({ default: m.ProgressPage })),
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense fallback={<Spinner label="Loading…" />}>
        <Routes>
          <Route element={<App />}>
            <Route index element={<PracticePage />} />
            <Route path="results/:id" element={<ResultsPage />} />
            <Route path="progress" element={<ProgressPage />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
)
