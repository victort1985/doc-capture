import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import UsersPage from './pages/UsersPage';
import StoragePage from './pages/StoragePage';
import StorageRoutingPage from './pages/StorageRoutingPage';
import TemplatesPage from './pages/TemplatesPage';
import FilesPage from './pages/FilesPage';
import LocationsPage from './pages/LocationsPage';
import CallsPage from './pages/CallsPage';
import OrganizationsPage from './pages/OrganizationsPage';
import PhoneBookPage from './pages/PhoneBookPage';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/organizations" element={<OrganizationsPage />} />
          <Route path="/calls" element={<CallsPage />} />
          <Route path="/phonebook" element={<PhoneBookPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/locations" element={<LocationsPage />} />
          <Route path="/storage" element={<StoragePage />} />
          <Route path="/storage-routing" element={<StorageRoutingPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/files" element={<FilesPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/users" replace />} />
      </Routes>
    </AuthProvider>
  );
}
