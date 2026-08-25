

const PageLoader = () => (
  <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:"#0f172a" }}>
    <div style={{ textAlign:"center", color:"#60a5fa" }}>
      <div style={{ fontSize:36, marginBottom:8 }}>IMAP</div>
      <div style={{ width:40, height:4, background:"#3b82f6", borderRadius:2, margin:"0 auto", animation:"imap-bar 1s ease-in-out infinite alternate" }}/>
      <style>{`@keyframes imap-bar{from{opacity:.3;transform:scaleX(.5)}to{opacity:1;transform:scaleX(1)}}`}</style>
    </div>
  </div>
);
export default PageLoader;
