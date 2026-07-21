import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AuthProvider } from './context/AuthContext';
import DemoConsentModal from './components/DemoConsentModal';
import { LicenseProvider, useLicense } from './context/LicenseContext';
import LicenseActivationPage from './pages/LicenseActivationPage';
import LicenseLockedPage from './pages/LicenseLockedPage';
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
import FleetPage from './pages/FleetPage';
import WarehousePage from './pages/WarehousePage';
import ReportsPage from './pages/ReportsPage';
import PermissionsPage from './pages/PermissionsPage';
import GroupsPage from './pages/GroupsPage';
import DeliveryNoteSettingsPage from './pages/DeliveryNoteSettingsPage';
import DeliveryNotesPage from './pages/DeliveryNotesPage';
import ErrorBoundary from './components/ErrorBoundary';
import CalendarSyncPage from './pages/CalendarSyncPage';
import OrdersEmailSettingsPage from './pages/OrdersEmailSettingsPage';
import OrdersListPage from './pages/OrdersListPage';
import QuotesPage from './pages/QuotesPage';
import InvoicesPage from './pages/InvoicesPage';
import PortalPage from './pages/PortalPage';
import MaintenancePage from './pages/MaintenancePage';
import QuoteSettingsPage from './pages/QuoteSettingsPage';
import InvoiceSettingsPage from './pages/InvoiceSettingsPage';
import DevicesPage from './pages/DevicesPage';

function LicenseGate({ children }: { children: ReactNode }) {
  const { status, loading } = useLicense();
  const location = useLocation();

  // The client portal is for the customer's OWN end clients (e.g. a
  // hotel checking their service-call status) — showing them "this
  // installation is locked, contact your provider" would be
  // confusing and unprofessional; let that page render and handle
  // its own failure state if the API happens to be locked too.
  if (location.pathname.startsWith('/portal/')) return <>{children}</>;

  if (loading || !status) return null;
  if (status.state === 'NOT_ACTIVATED') return <LicenseActivationPage />;
  if (status.state === 'FULL_LOCKED' || status.state === 'ADMIN_LOCKED') return <LicenseLockedPage />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ErrorBoundary>
    <LicenseProvider>
    <LicenseGate>
    <AuthProvider>
      <DemoConsentModal />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/portal/:token" element={<PortalPage />} />
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
          <Route path="/fleet" element={<FleetPage />} />
          <Route path="/warehouse" element={<WarehousePage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/permissions" element={<PermissionsPage />} />
          <Route path="/groups" element={<GroupsPage />} />
          <Route path="/delivery-settings" element={<DeliveryNoteSettingsPage />} />
          <Route path="/delivery-notes" element={<DeliveryNotesPage />} />
          <Route path="/calendar-sync" element={<CalendarSyncPage />} />
          <Route path="/orders-email-settings" element={<OrdersEmailSettingsPage />} />
          <Route path="/orders" element={<OrdersListPage />} />
          <Route path="/quotes" element={<QuotesPage />} />
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/maintenance" element={<MaintenancePage />} />
          <Route path="/quote-settings" element={<QuoteSettingsPage />} />
          <Route path="/invoice-settings" element={<InvoiceSettingsPage />} />
          <Route path="/devices" element={<DevicesPage />} />
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
    </LicenseGate>
    </LicenseProvider>
    </ErrorBoundary>
  );
}
