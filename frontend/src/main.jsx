import React, { Component } from 'react'
import ReactDOM from 'react-dom/client'
import 'leaflet/dist/leaflet.css'
import App from './App.jsx'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { err: null, cleared: false };
    this.handleClearAndReload = this.handleClearAndReload.bind(this);
  }
  static getDerivedStateFromError(e) { return { err: e }; }
  componentDidCatch(e) {
    console.error('[IMAP Error]', e);
    const reloadCount = parseInt(sessionStorage.getItem('imap_reloads') || '0', 10);
    if (reloadCount < 2) {
      sessionStorage.setItem('imap_reloads', String(reloadCount + 1));
      setTimeout(() => window.location.reload(), 1500);
    }
  }
  async handleClearAndReload() {
    this.setState({ cleared: true });
    try {
      const regs = await navigator.serviceWorker?.getRegistrations() || [];
      await Promise.all(regs.map(r => r.unregister()));
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    } catch(_e) {}
    sessionStorage.removeItem('imap_reloads');
    window.location.reload(true);
  }
  render() {
    if (this.state.err) {
      if (typeof window.hideSplash === "function") window.hideSplash();
      const reloadCount = parseInt(sessionStorage.getItem('imap_reloads') || '0', 10);
      // Still auto-reloading — show splash-style screen
      if (reloadCount <= 2) {
        return (
          <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"#080F0B"}}>
            <div style={{fontSize:48,marginBottom:16}}>🌿</div>
            <div style={{fontSize:18,fontWeight:700,color:"#16A34A",marginBottom:8}}>IMAP</div>
            <div style={{fontSize:13,color:"rgba(255,255,255,.5)"}}>পুনরায় লোড হচ্ছে...</div>
          </div>
        );
      }
      // Auto-reload limit reached — show recovery UI
      return (
        <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"#080F0B",padding:24,textAlign:"center"}}>
          <div style={{fontSize:52,marginBottom:12}}>🌿</div>
          <div style={{fontSize:20,fontWeight:800,color:"#16A34A",marginBottom:6}}>IMAP</div>
          <div style={{fontSize:14,color:"rgba(255,255,255,.85)",marginBottom:4,fontWeight:600}}>অ্যাপ লোড করতে সমস্যা হচ্ছে</div>
          <div style={{fontSize:12,color:"rgba(255,255,255,.45)",marginBottom:24}}>পুরানো cache সাফ করে আবার চেষ্টা করুন</div>
          <button
            disabled={this.state.cleared}
            onClick={this.handleClearAndReload}
            style={{background:"#16A34A",color:"#fff",border:"none",borderRadius:14,padding:"14px 32px",fontSize:15,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 18px rgba(22,163,74,.35)",marginBottom:16}}>
            {this.state.cleared ? "⏳ লোড হচ্ছে..." : "🔄 Cache সাফ করে পুনরায় লোড করুন"}
          </button>
          <div style={{fontSize:11,color:"rgba(255,255,255,.35)"}}>এটি পুরানো ডেটা মুছে নতুনভাবে লোড করবে</div>
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
