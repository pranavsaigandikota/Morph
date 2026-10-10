import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { AgentDashboardPage } from './pages/AgentDashboardPage'
import { LandingPage } from './pages/LandingPage'
import { SimulationLabPage } from './pages/SimulationLabPage'
import { WorldExplorerPage } from './pages/WorldExplorerPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<LandingPage />} />
          <Route path="world" element={<WorldExplorerPage />} />
          <Route path="simulation" element={<SimulationLabPage />} />
          <Route path="agents" element={<AgentDashboardPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
