import { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props { children: ReactNode; }
interface State { error: Error | null; }

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '60vh', padding: 40, textAlign: 'center'
        }}>
          <AlertTriangle size={48} color="var(--danger, #B5471B)" style={{ marginBottom: 16 }} />
          <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>Something went wrong</h2>
          <p style={{ color: 'var(--ink-soft)', marginBottom: 24, maxWidth: 400 }}>
            {this.state.error.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <RefreshCw size={16} /> Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
