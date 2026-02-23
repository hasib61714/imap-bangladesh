import React, { Component } from 'react'
import ReactDOM from 'react-dom/client'
import 'leaflet/dist/leaflet.css'
import App from './App.jsx'

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(e) { return { err: e }; }
  componentDidCatch(e) {
    console.error('[IMAP Error]', e);
    // Do NOT clear auth — just reload so the user stays logged in
    setTimeout(() => window.location.reload(), 1500);
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
