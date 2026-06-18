import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import StampMark from './StampMark';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--ink-soft)',
      }}>
        <StampMark size={28} />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
