import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { CampaignProvider } from './contexts/CampaignContext';
import { ProtectedRoute } from './components/ProtectedRoute/ProtectedRoute';
import { Layout } from './components/Layout/Layout';
import { Login } from './screens/Login/Login';
import { Register } from './screens/Register/Register';
import { CampaignList } from './screens/CampaignList/CampaignList';
import { MapList } from './screens/MapList/MapList';
import { MapView } from './screens/MapView/MapView';
import { CampaignSettings } from './screens/CampaignSettings/CampaignSettings';
import { TerrainTypes } from './screens/TerrainTypes/TerrainTypes';

function CampaignRoutes() {
  return (
    <CampaignProvider>
      <Routes>
        <Route path="maps" element={<MapList />} />
        <Route path="maps/:mapId" element={<MapView />} />
        <Route path="settings" element={<CampaignSettings />} />
        <Route path="terrain-types" element={<TerrainTypes />} />
      </Routes>
    </CampaignProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
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
            <Route path="/campaigns" element={<CampaignList />} />
            <Route path="/campaigns/:campaignId/*" element={<CampaignRoutes />} />
          </Route>
          <Route path="*" element={<Navigate to="/campaigns" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
