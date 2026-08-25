import { useContext, useState } from "react";
import { useC, useTr, LangCtx } from "../contexts";
import { T } from "../constants/translations";
import { SC_COURSES } from "../constants/data";

export default function SkillCertPage(){
  const C=useC();const tr=useTr();const lang=useContext(LangCtx)===T.en?"en":"bn";
  const [tab,setTab]=useState("available");
  const [enrolled,setEnrolled]=useState(()=>JSON.parse(localStorage.getItem("imap_enrolled")||"[]"));
  const [enrollFlash,setEnrollFlash]=useState(null);

  const myCerts=SC_COURSES.filter(c=>c.issued);
  const available=SC_COURSES.filter(c=>!c.issued);

  const doEnroll=(id)=>{
    if(enrolled.includes(id)) return;
    const next=[...enrolled,id];
    setEnrolled(next);
    localStorage.setItem("imap_enrolled",JSON.stringify(next));
    setEnrollFlash(id);
    setTimeout(()=>setEnrollFlash(null),2000);
  };

  const levelColor={Beginner:"#00C170",Intermediate:"#F59E0B",Advanced:"#EF4444"};

  return(
    <div>
      <div style={{display:"flex",gap:8,marginBottom:20,background:C.card,borderRadius:14,padding:5,border:`1px solid ${C.bdr}`}}>
        {[["available",`📚 ${tr.scAvail}`],["mycerts",`🏅 ${tr.scMyCerts} (${myCerts.length})`]].map(([id,lbl])=>(
          <button key={id} onClick={()=>setTab(id)} style={{flex:1,padding:"9px",borderRadius:10,border:"none",background:tab===id?C.p:"transparent",color:tab===id?"#fff":C.sub,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>{lbl}</button>
        ))}
      </div>
      {tab==="available"&&(
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {available.map((c,i)=>{
            const isEnrolled=enrolled.includes(c.id);
            return(
              <div key={c.id} className="fu" style={{animationDelay:`${i*.05}s`,background:C.card,borderRadius:16,padding:"16px",border:`1px solid ${C.bdr}`}}>
                <div style={{display:"flex",gap:14,alignItems:"flex-start"}}>
                  <div style={{width:44,height:44,borderRadius:12,background:C.plt,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{c.icon}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:700,color:C.text}}>{lang==="en"?c.titleEn:c.titleBn}</div>
                    <div style={{display:"flex",gap:8,marginTop:5,flexWrap:"wrap"}}>
                      <span style={{fontSize:11,background:levelColor[c.level]+"22",color:levelColor[c.level],padding:"2px 8px",borderRadius:6,fontWeight:700}}>{c.level}</span>
                      <span style={{fontSize:11,color:C.muted}}>⏱️ {lang==="en"?c.duration:c.durationBn}</span>
                      <span style={{fontSize:11,color:C.p,fontWeight:700}}>+{c.pts} pts</span>
                    </div>
                  </div>
                  <button onClick={()=>doEnroll(c.id)}
                    style={{flexShrink:0,padding:"8px 14px",borderRadius:10,background:isEnrolled?"#D1FAE5":C.p,border:"none",color:isEnrolled?"#065F46":"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>
                    {enrollFlash===c.id?tr.scEnrolled.split("!")[0]+"!":isEnrolled?(lang==="en"?"Enrolled":"ভর্তি"):tr.scEnroll}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {tab==="mycerts"&&(
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {myCerts.map((c,i)=>(
            <div key={c.id} style={{background:`linear-gradient(135deg,${C.plt},${C.card})`,borderRadius:16,padding:"18px",border:`2px solid ${C.p}44`,position:"relative",overflow:"hidden"}}>
              <div style={{position:"absolute",right:-10,top:-10,fontSize:60,opacity:.08}}>{c.icon}</div>
              <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                <div style={{width:48,height:48,borderRadius:12,background:C.p+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>{c.icon}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:800,color:C.text}}>{lang==="en"?c.titleEn:c.titleBn}</div>
                  <div style={{fontSize:11,color:C.sub,marginTop:3}}>{tr.scIssued}: {c.issued}</div>
                  <div style={{fontSize:11,fontWeight:700,color:C.p,marginTop:2}}>CERT-{c.id.toString().padStart(4,"0")}</div>
                </div>
              </div>
              <div style={{display:"flex",gap:8,marginTop:14}}>
                <button style={{flex:1,padding:"8px",borderRadius:10,background:C.p,border:"none",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>⬇️ {tr.scDownload}</button>
                <button style={{flex:1,padding:"8px",borderRadius:10,background:C.bg,border:`1.5px solid ${C.bdr}`,color:C.sub,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>🔍 {tr.scVerify}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
