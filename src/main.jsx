import { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  handleReload = () => {
    try {
      localStorage.removeItem('bonyan_logged_in_v3');
      localStorage.removeItem('bonyan_current_user_v3');
    } catch (e) {
      console.error(e);
    }
    window.location.replace(window.location.origin + '/?cb=' + Date.now());
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #1e4d44 0%, #12312b 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ffffff',
          fontFamily: 'Cairo, sans-serif',
          direction: 'rtl',
          padding: '2rem',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>⚠️</div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: '800', marginBottom: '0.8rem' }}>عذراً، حدث خطأ غير متوقع!</h2>
          <p style={{ opacity: 0.9, fontSize: '0.95rem', maxWidth: '400px', marginBottom: '1rem' }}>
            واجه التطبيق خطأً مفاجئاً أثناء التشغيل. اضغط على الزر أدناه لتحديث الصفحة وإصلاح المشكلة تلقائياً.
          </p>
          
          {/* Debug Info Box */}
          <div style={{
            background: 'rgba(0,0,0,0.4)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '8px',
            padding: '1rem',
            maxWidth: '600px',
            width: '100%',
            marginBottom: '2rem',
            textAlign: 'left',
            fontFamily: 'monospace',
            fontSize: '0.8rem',
            color: '#ff8a80',
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            direction: 'ltr',
            boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.5)'
          }}>
            <strong style={{ color: '#ffb74d' }}>Error Diagnostics:</strong><br />
            {this.state.error ? this.state.error.toString() : 'Unknown error'}<br />
            {this.state.error && this.state.error.stack ? this.state.error.stack.split('\n').slice(0, 3).join('\n') : ''}
          </div>

          <button 
            onClick={this.handleReload}
            style={{
              backgroundColor: '#f5c324',
              color: '#12312b',
              border: 'none',
              borderRadius: '8px',
              padding: '0.8rem 2rem',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
            }}
          >
            تحديث وإعادة تشغيل المنصة
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
