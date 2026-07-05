import { useContext, useState, useEffect } from "react";
import { useC, useTr, LangCtx } from "../contexts";
import { T } from "../constants/translations";
import { PA_MONTHS, PA_EARNINGS, PA_REVIEWS } from "../constants/data";
import { providers as providersApi } from "../api";

export default function ProviderAnalyticsPage(){
  const C=useC();const tr=useTr();const lang=useContext(LangCtx)===T.en?"en":"bn";
  const [tab,setTab]=useState("overview");
  const [paMonths,setPaMonths]=useState(PA_MONTHS);
  const [paEarnings,setPaEarnings]=useState(PA_EARNINGS);
  const [paStats,setPaStats]=useState({jobs:48,rating:4.9,views:1200,thisMonth:PA_EARNINGS[PA_EARNINGS.length-1]});
  const [paReviews,setPaReviews]=useState(PA_REVIEWS);

  useEffect(()=>{
    providersApi.analytics().then(data=>{
      if(data.months&&data.months.length){
        setPaMonths(data.months);
        setPaEarnings(data.earnings);
      }
      if(data.stats) setPaStats(s=>({...s,...data.stats}));
      if(data.reviews&&data.reviews.length) setPaReviews(data.reviews);
    }).catch(()=>{});
  },[]);

  const maxEarn=Math.max(...paEarnings,1);

  return(
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
        {[[tr.paEarnings,"💰","৳"+paStats.thisMonth.toLocaleString(),C.p],[tr.paJobs,"📋",String(paStats.jobs),"#3B82F6"],[tr.paRating,"⭐",Number(paStats.rating).toFixed(1),"#F59E0B"],[tr.paViews,"👁️",paStats.views>=1000?(paStats.views/1000).toFixed(1)+"K":String(paStats.views),"#8B5CF6"]].map(([lbl,ic,val,col])=>(
          <div key={lbl} style={{background:C.card,borderRadius:16,padding:"14px",border:`1px solid ${C.bdr}`}}>
            <div style={{fontSize:20}}>{ic}</div>
            <div style={{fontSize:22,fontWeight:800,color:col,letterSpacing:-0.5}}>{val}</div>
            <div style={{fontSize:11,color:C.sub,marginTop:2}}>{lbl}</div>
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:8,marginBottom:16,background:C.card,borderRadius:14,padding:5,border:`1px solid ${C.bdr}`}}>
        {[["overview",tr.paMonthly],["reviews",tr.paReviews]].map(([id,lbl])=>(
          <button key={id} onClick={()=>setTab(id)} style={{flex:1,padding:"9px",borderRadius:10,border:"none",background:tab===id?C.p:"transparent",color:tab===id?"#fff":C.sub,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>{lbl}</button>
        ))}
      </div>
      {tab==="overview"&&(
        <div style={{background:C.card,borderRadius:16,padding:"16px",border:`1px solid ${C.bdr}`,marginBottom:16}}>
          <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:14}}>{tr.paMonthly}</div>
          <div style={{display:"flex",alignItems:"flex-end",gap:8,height:100}}>
            {paEarnings.map((v,i)=>(
              <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                <div style={{fontSize:9,color:C.sub}}>{(v/1000).toFixed(1)}k</div>
                <div style={{width:"100%",borderRadius:"6px 6px 0 0",background:i===paEarnings.length-1?C.p:"#D1FAE5",height:`${(v/maxEarn)*80}px`,minHeight:8}}/>
                <div style={{fontSize:9,color:C.muted}}>{paMonths[i]}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {tab==="reviews"&&(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {paReviews.map((r,i)=>(
            <div key={i} style={{background:C.card,borderRadius:14,padding:"14px 16px",border:`1px solid ${C.bdr}`}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                <div style={{fontSize:13,fontWeight:700,color:C.text}}>{r.name}</div>
                <div style={{display:"flex",gap:2}}>{"⭐".repeat(Math.min(r.stars||r.rating||5,5))}</div>
              </div>
              <div style={{fontSize:13,color:C.sub,lineHeight:1.5}}>{lang==="en"?(r.textEn||r.text||r.comment||""):(r.text||r.comment||"")}</div>
              <div style={{fontSize:11,color:C.muted,marginTop:6}}>{r.date}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
