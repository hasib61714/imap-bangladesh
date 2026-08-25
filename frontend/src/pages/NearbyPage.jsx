import { useState } from "react";
import { useC, useTr, useLiveData } from "../contexts";
import { toUiProv, haversine } from "../utils/helpers";
import PCard from "./PCard";

export default function NearbyPage({onBook,onView}) {
  const C=useC(); const tr=useTr();
  const [status,setStatus]=useState("idle"); // idle|detecting|done|error|denied
  const [userPos,setUserPos]=useState(null);
  const [sorted,setSorted]=useState([]);
  const [filter,setFilter]=useState("all");
  const { providers: ctxProviders } = useLiveData();
  const provData = ctxProviders.map(toUiProv);

  const detect=()=>{
    if(!navigator.geolocation){setStatus("error");return;}
    setStatus("detecting");
    navigator.geolocation.getCurrentPosition(
      pos=>{
        const {latitude:lat,longitude:lng}=pos.coords;
        setUserPos({lat,lng});
        const withDist=provData.map(p=>({...p,dist:haversine(lat,lng,p.lat||23.8,p.lng||90.4)}))
          .sort((a,b)=>a.dist-b.dist);
        setSorted(withDist); setStatus("done");
      },
      err=>{setStatus(err.code===1?"denied":"error");},
      {enableHighAccuracy:true,timeout:10000}
    );
  };

  const fmtDist=d=>{
    if(d<1) return `${Math.round(d*1000)} ${tr.gpsM}`;
    return `${d.toFixed(1)} ${tr.gpsKm}`;
  };

  const svcs=[...new Set(provData.map(p=>p.svcEn))];
  const list=filter==="all"?sorted:sorted.filter(p=>p.svcEn===filter);

  return (
    <div>
      {/* Header */}
      <div style={{background:`linear-gradient(135deg,${C.p},${C.pdk})`,borderRadius:18,padding:"22px 20px 20px",marginBottom:22,color:"#fff",position:"relative",overflow:"hidden"}}>
        <div style={{fontSize:22,fontWeight:800,marginBottom:4}}>{tr.gpsTitle}</div>
        <div style={{fontSize:13,opacity:.85,marginBottom:16}}>আপনার কাছের সেরা প্রদানকারী খুঁজুন</div>
        {status==="idle"&&(
          <button onClick={detect} style={{
            background:"rgba(255,255,255,.18)",color:"#fff",
            border:"1.5px solid rgba(255,255,255,.5)",
            backdropFilter:"blur(2px)",WebkitBackdropFilter:"blur(2px)",
            borderRadius:12,padding:"10px 20px",fontWeight:700,fontSize:14,
            cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif",
            display:"flex",alignItems:"center",gap:7,
            boxShadow:"0 4px 16px rgba(0,0,0,.15)"
          }}>
            <span>📍</span>{tr.gpsDetect}
          </button>
        )}
        {status==="detecting"&&(
          <div style={{display:"flex",alignItems:"center",gap:10,background:"rgba(255,255,255,.18)",borderRadius:12,padding:"10px 16px",fontSize:14,fontWeight:600}}>
            <span style={{animation:"pulse 1s infinite"}}>📡</span> {tr.gpsDetecting}
          </div>
        )}
        {(status==="done"||status==="error"||status==="denied")&&(
          <button onClick={detect} style={{background:"rgba(255,255,255,.2)",color:"#fff",border:"1.5px solid rgba(255,255,255,.5)",borderRadius:12,padding:"8px 16px",fontWeight:600,fontSize:13,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>
            🔄 {tr.gpsDetect}
          </button>
        )}
        <div style={{position:"absolute",right:-18,top:-18,width:90,height:90,borderRadius:"50%",background:"rgba(255,255,255,.08)"}}/>
        <div style={{position:"absolute",right:24,bottom:-30,width:70,height:70,borderRadius:"50%",background:"rgba(255,255,255,.06)"}}/>
      </div>

      {/* Error states */}
      {status==="denied"&&(
        <div style={{background:"rgba(245,158,11,.1)",border:"1px solid rgba(245,158,11,.35)",borderRadius:12,padding:"14px 16px",marginBottom:16,fontSize:13,color:"#856404",display:"flex",alignItems:"center",gap:9}}>
          🔒 {tr.gpsPermDenied}
        </div>
      )}
      {status==="error"&&(
        <div style={{background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.35)",borderRadius:12,padding:"14px 16px",marginBottom:16,fontSize:13,color:"#991B1B",display:"flex",alignItems:"center",gap:9}}>
          ⚠️ {tr.gpsError}
        </div>
      )}

      {/* User location badge */}
      {userPos&&(
        <div style={{display:"flex",alignItems:"center",gap:8,background:C.plt,borderRadius:12,padding:"10px 16px",marginBottom:16,fontSize:13,color:C.pdk,fontWeight:600}}>
          📍 {userPos.lat.toFixed(4)}°N, {userPos.lng.toFixed(4)}°E
        </div>
      )}

      {/* Filter chips */}
      {status==="done"&&(
        <div className="sx" style={{display:"flex",gap:8,marginBottom:18,paddingBottom:2}}>
          {["all",...svcs].map(s=>(
            <button key={s} onClick={()=>setFilter(s)} style={{flexShrink:0,padding:"6px 14px",borderRadius:20,border:`1.5px solid ${filter===s?C.p:C.bdr}`,background:filter===s?C.p:C.card,color:filter===s?"#fff":C.sub,fontSize:12,cursor:"pointer",fontWeight:600,fontFamily:"'Hind Siliguri',sans-serif",transition:"all .15s"}}>
              {s==="all"?tr.gpsAll:s}
            </button>
          ))}
        </div>
      )}

      {/* Sorted provider list */}
      {status==="done"&&list.length===0&&(
        <div style={{textAlign:"center",padding:"40px 20px",color:C.muted,fontSize:14}}>কোনো প্রদানকারী পাওয়া যায়নি।</div>
      )}
      {status==="done"&&(
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {list.map((p,i)=>(
            <div key={p.id} className="fu" style={{position:"relative",animationDelay:`${i*.07}s`}}>
              <PCard p={p} onBook={onBook} onView={onView}/>
              <div style={{position:"absolute",top:12,left:12,background:C.p,color:"#fff",borderRadius:10,padding:"3px 10px",fontSize:11,fontWeight:700,display:"flex",alignItems:"center",gap:4,pointerEvents:"none"}}>
                {i===0?"🥇":"📍"} {fmtDist(p.dist)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Idle CTA */}
      {status==="idle"&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14}}>
          {provData.map((p,i)=><PCard key={p.id} p={p} delay={i*.07} onBook={onBook} onView={onView}/>)}
        </div>
      )}
    </div>
  );
}
