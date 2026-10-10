import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { AgentDashboardPage } from './pages/AgentDashboardPage'
import { CalibrationPage } from './pages/CalibrationPage'
import { CreateWorldPage } from './pages/CreateWorldPage'
import { LandingPage } from './pages/LandingPage'
import { RescueMissionPage } from './pages/RescueMissionPage'
import { SimulationLabPage } from './pages/SimulationLabPage'
import { WorldExplorerPage } from './pages/WorldExplorerPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<LandingPage />} />
          <Route path="create" element={<CreateWorldPage />} />
          <Route path="calibrate" element={<CalibrationPage />} />
          <Route path="world" element={<WorldExplorerPage />} />
          <Route path="mission" element={<RescueMissionPage />} />
          <Route path="simulation" element={<SimulationLabPage />} />
          <Route path="rescue" element={<Navigate to="/mission" replace />} />
          <Route path="agents" element={<AgentDashboardPage />} />
          <Route path="showdown" element={<Navigate to="/agents" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
