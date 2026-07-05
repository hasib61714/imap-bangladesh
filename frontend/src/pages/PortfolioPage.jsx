import { useContext, useState, useEffect } from "react";
import { useC, useTr, LangCtx } from "../contexts";
import { T } from "../constants/translations";
import { PF_PROVIDERS } from "../constants/data";
import { providers as providersApi } from "../api";

export default function PortfolioPage(){
  const C=useC();const tr=useTr();const lang=useContext(LangCtx)===T.en?"en":"bn";
  const [pfProviders,setPfProviders]=useState(PF_PROVIDERS);
  const [sel,setSel]=useState(PF_PROVIDERS[0]);

  useEffect(()=>{
    providersApi.list({limit:6,sort:"rating"}).then(data=>{
      const list=(data.providers||[]).map(p=>({
        id:p.id,
        name:p.name,
        skill:p.service_type_en||p.service_type_bn||"Service",
        rating:Number(p.rating)||0,
        jobs:p.total_jobs||0,
        exp:p.experience_yrs||1,
        about:p.bio_bn||p.bio_en||"",
        aboutEn:p.bio_en||p.bio_bn||"",
        skills:p.service_type_en?[p.service_type_en,...(p.cat_en&&p.cat_en!==p.service_type_en?[p.cat_en]:[])]:["General Service"],
        gallery:[p.cat_icon||"⚡","🔧","🛠️","🔌","💡","⚙️"],
      }));
      if(list.length){setPfProviders(list);setSel(list[0]);}
    }).catch(()=>{});
  },[]);

  return(
    <div>
      {/* Provider selector */}
      <div style={{display:"flex",gap:10,marginBottom:20,overflowX:"auto",paddingBottom:4}}>
        {pfProviders.map(p=>(
          <button key={p.id} onClick={()=>setSel(p)}
            style={{flexShrink:0,padding:"10px 16px",borderRadius:12,border:`2px solid ${sel.id===p.id?C.p:C.bdr}`,background:sel.id===p.id?C.plt:C.card,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>
            <div style={{fontSize:13,fontWeight:700,color:sel.id===p.id?C.p:C.text}}>{p.name}</div>
            <div style={{fontSize:11,color:C.muted}}>{p.skill}</div>
          </button>
        ))}
      </div>
      {/* Profile card */}
      <div style={{background:C.card,borderRadius:16,padding:"18px",border:`1px solid ${C.bdr}`,marginBottom:16}}>
        <div style={{display:"flex",gap:14,alignItems:"flex-start"}}>
          <div style={{width:64,height:64,borderRadius:16,background:"linear-gradient(135deg,#006A4E,#004D38)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,flexShrink:0}}>
            {sel.skill==="Electrician"?"⚡":"🧹"}
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:16,fontWeight:800,color:C.text}}>{sel.name}</div>
            <div style={{fontSize:13,color:C.p,fontWeight:700}}>{sel.skill}</div>
            <div style={{display:"flex",gap:12,marginTop:6}}>
              <span style={{fontSize:12,color:C.sub}}>⭐ {sel.rating}</span>
              <span style={{fontSize:12,color:C.sub}}>📋 {sel.jobs} {lang==="en"?"jobs":"কাজ"}</span>
              <span style={{fontSize:12,color:C.sub}}>📅 {sel.exp} {tr.pfYears}</span>
            </div>
          </div>
        </div>
        <div style={{marginTop:14,fontSize:13,color:C.sub,lineHeight:1.6}}>{lang==="en"?sel.aboutEn:sel.about}</div>
      </div>
      {/* Skills */}
      <div style={{background:C.card,borderRadius:16,padding:"16px",border:`1px solid ${C.bdr}`,marginBottom:16}}>
        <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:10}}>{tr.pfSkills}</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
          {sel.skills.map(s=>(
            <span key={s} style={{padding:"5px 12px",borderRadius:20,background:C.plt,color:C.p,fontSize:12,fontWeight:700}}>✓ {s}</span>
          ))}
        </div>
      </div>
      {/* Gallery */}
      <div style={{background:C.card,borderRadius:16,padding:"16px",border:`1px solid ${C.bdr}`}}>
        <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:12}}>{tr.pfGallery} / {tr.pfWork}</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
          {sel.gallery.map((g,i)=>(
            <div key={i} style={{aspectRatio:"1",borderRadius:10,background:`linear-gradient(135deg,${C.plt},${C.bdr})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:32,border:`1px solid ${C.bdr}`}}>{g}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
