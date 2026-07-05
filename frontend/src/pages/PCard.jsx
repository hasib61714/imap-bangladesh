import { useContext } from "react";
import { useC, useTr, LangCtx, FavsCtx } from "../contexts";
import { T } from "../constants/translations";
import { Av, Stars } from "../components/ui";

export default function PCard({p,delay=0,onBook,onView}) {
  const C=useC();
  const tr=useTr();
  const lang=useContext(LangCtx)===T.en?"en":"bn";
  const {favs,toggleFav}=useContext(FavsCtx);
  const isFav=favs.includes(p.id);
  const name=lang==="en"?p.nameEn:p.name;
  const svc=lang==="en"?p.svcEn:p.svc;
  const loc=lang==="en"?p.locEn:p.loc;
  const note=lang==="en"?p.noteEn:p.note;
  const tags=lang==="en"?p.tagsEn:p.tags;
  return (
    <div className="card pcard" style={{position:"relative",overflow:"hidden",padding:20,animation:`fadeUp .4s ease ${delay}s both`,cursor:"pointer"}} onClick={()=>onView(p)}>
      {/* Bookmark btn */}
      <button onClick={e=>{e.stopPropagation();toggleFav(p.id);}} style={{position:"absolute",top:12,right:12,background:isFav?"#FEF9C3":C.bg,border:`1px solid ${isFav?"#F59E0B":C.bdr}`,borderRadius:8,width:30,height:30,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",transition:"all .2s",zIndex:1}}>{isFav?"🔖":"🏷️"}</button>
      <div className="row" style={{gap:12,marginBottom:12}}>
        <Av av={p.av} col={p.col} size={52}/>
        <div style={{flex:1,minWidth:0}}>
          <div className="row" style={{gap:5,flexWrap:"wrap"}}>
            <span style={{fontSize:15,fontWeight:700,color:C.text,lineHeight:1.2}}>{name}</span>
            {p.ok&&<span className="badge" style={{background:"rgba(16,185,129,.15)",color:"#065F46",fontSize:10}}>✓</span>}
            {p.top&&<span className="badge" style={{background:"rgba(245,158,11,.12)",color:"#A35C03",fontSize:10}}>⭐ {p.badge}</span>}
            {p.ai_score>=80&&<span className="badge" style={{background:"rgba(139,92,246,.12)",color:"#5B21B6",fontSize:10}}>🏆 AI Pick</span>}
            {p.ai_score>=60&&p.ai_score<80&&<span className="badge" style={{background:"rgba(59,130,246,.12)",color:"#1E40AF",fontSize:10}}>⭐ Recommended</span>}
          </div>
          <div style={{fontSize:12,color:C.muted,marginTop:2}}>{svc} · 📍 {loc}</div>
          <div className="row" style={{gap:5,marginTop:4}}><Stars r={p.r} size={11}/><span style={{fontSize:12,fontWeight:700}}>{p.r}</span><span style={{fontSize:11,color:C.muted}}>({p.rev}) · {p.jobs} {tr.jobs}</span></div>
        </div>
      </div>
      <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:12}}>
        {tags.map(t=><span key={t} className="tag">{t}</span>)}
      </div>
      <div className="row" style={{justifyContent:"space-between",borderTop:`1px solid ${C.bdr}`,paddingTop:12}}>
        <div><div style={{fontSize:10,color:C.muted}}>{note}</div><div style={{
          fontSize:20,fontWeight:800,
          background:`linear-gradient(135deg,${C.p},${C.pdk})`,
          WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"
        }}>{p.price}</div></div>
        <div className="row" style={{gap:7}}>
          <button className="btn btn-gh" style={{border:`1px solid ${C.bdr}`,fontSize:12}} onClick={e=>{e.stopPropagation();onView(p);}}>{tr.profileBtn}</button>
          <button className="btn btn-g" style={{padding:"8px 13px",fontSize:12}} onClick={e=>{e.stopPropagation();onBook(p);}}>{tr.bookNow}</button>
        </div>
      </div>
    </div>
  );
}
