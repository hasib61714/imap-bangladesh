import { useC, useTr, useLiveData } from "../contexts";
import { PROVIDERS } from "../constants/data";
import { toUiProv } from "../utils/helpers";

export default function ElderlyMode({onExit,onBook,onEmergency}) {
  const C=useC();
  const tr=useTr();
  const { providers: ctxProviders } = useLiveData();
  const pv = ctxProviders.map(toUiProv);
  const SERVICES=[{icon:"⚡",name:tr.elecProblem,p:pv[0]||PROVIDERS[0]},{icon:"🔧",name:tr.waterProblem,p:pv[2]||PROVIDERS[2]},{icon:"🏥",name:tr.docNurse,p:pv[1]||PROVIDERS[1]},{icon:"🧹",name:tr.cleanService,p:pv[3]||PROVIDERS[3]}];
  return (
    <div style={{minHeight:"100vh",background:C.bg,padding:"24px 16px 88px",fontFamily:"'Hind Siliguri',sans-serif"}}>
      <div className="row" style={{justifyContent:"space-between",marginBottom:24}}>
        <div><div style={{fontSize:26,fontWeight:700,color:C.text}}>{tr.elderlyGreet}</div><div style={{fontSize:16,color:C.muted}}>{tr.elderlyWith}</div></div>
        <button onClick={onExit} style={{background:C.plt,border:"none",borderRadius:11,padding:"10px 16px",fontSize:15,cursor:"pointer",color:C.p,fontWeight:700,fontFamily:"'Hind Siliguri',sans-serif"}}>{tr.normalMode}</button>
      </div>
      <button onClick={onEmergency} style={{width:"100%",padding:"28px",background:"linear-gradient(135deg,#E53E3E,#C53030)",border:"none",borderRadius:22,color:"#fff",fontSize:22,fontWeight:700,cursor:"pointer",marginBottom:22,boxShadow:"0 6px 25px rgba(229,62,62,.5)",animation:"pulse 2s infinite",fontFamily:"'Hind Siliguri',sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:14}}>
        <span style={{fontSize:42}}>🚨</span>
        <div style={{textAlign:"left"}}><div>{tr.emergency}</div><div style={{fontSize:16,opacity:.85}}>{tr.emergencyDesc.slice(0,30)}...</div></div>
      </button>
      <div style={{fontSize:20,fontWeight:700,marginBottom:16,color:C.text}}>{tr.needWhat}</div>
      <div className="g2" style={{gap:16,marginBottom:22}}>
        {SERVICES.map((s,i)=>(
          <button key={i} onClick={()=>onBook(s.p)} style={{
            padding:"26px 10px",background:C.card,
            border:`2px solid ${C.bdr}`,borderRadius:20,cursor:"pointer",
            textAlign:"center",fontFamily:"'Hind Siliguri',sans-serif",
            boxShadow:`0 4px 16px rgba(21,163,96,.1),inset 0 1px 0 rgba(255,255,255,.5)`,
            width:"100%",transition:"all .2s"
          }}>
            <div style={{fontSize:46,marginBottom:10}}>{s.icon}</div>
            <div style={{fontSize:18,fontWeight:700,color:C.text,lineHeight:1.3}}>{s.name}</div>
          </button>
        ))}
      </div>
      <div style={{
        background:C.card,borderRadius:20,padding:20,
        border:`1px solid ${C.bdr}`,textAlign:"center",
        boxShadow:`0 6px 24px rgba(21,163,96,.08),inset 0 1px 0 rgba(255,255,255,.4)`
      }}>
        <div style={{fontSize:46,marginBottom:8}}>🎙️</div>
        <div style={{fontSize:19,fontWeight:700}}>{tr.voiceHelp}</div>
        <div style={{fontSize:15,color:C.muted,marginTop:5,marginBottom:16}}>{tr.voiceSub}</div>
        <button className="jc" style={{width:68,height:68,borderRadius:"50%",background:`linear-gradient(135deg,${C.p},${C.pdk})`,border:"none",cursor:"pointer",fontSize:28,margin:"0 auto",boxShadow:`0 4px 20px ${C.p}60`}}>🎙️</button>
      </div>
    </div>
  );
}
