import React, { Component } from 'react'
import ReactDOM from 'react-dom/client'
import 'leaflet/dist/leaflet.css'
import App from './App.jsx'

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(e) { return { err: e }; }
  componentDidCatch(e) {
    console.error('[IMAP Error]', e);
    // Limit reloads to 2 times — prevents infinite loop on persistent JS errors
    const reloadCount = parseInt(sessionStorage.getItem('imap_reloads') || '0', 10);
    if (reloadCount < 2) {
      sessionStorage.setItem('imap_reloads', String(reloadCount + 1));
      setTimeout(() => window.location.reload(), 1500);
    } else {
      sessionStorage.removeItem('imap_reloads');
    }
  }
  render() {
    if (this.state.err) {
      if (typeof window.hideSplash === "function") window.hideSplash();
      return (
        <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"#f0fdf4"}}>
          <div style={{fontSize:48,marginBottom:16}}>🌿</div>
          <div style={{fontSize:18,fontWeight:700,color:"#16A34A",marginBottom:8}}>IMAP</div>
          <div style={{fontSize:13,color:"#6b7280"}}>পুনরায় লোড হচ্ছে...</div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)
