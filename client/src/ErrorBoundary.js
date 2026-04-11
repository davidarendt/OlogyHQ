import { Component } from 'react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('App crashed:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center px-6">
          <div className="text-center">
            <div className="text-5xl mb-4">⚠️</div>
            <h2 className="text-white text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-gray-400 text-sm mb-6">{this.state.error.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 rounded-lg text-white font-semibold text-sm"
              style={{ backgroundColor: '#FF6B00' }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
