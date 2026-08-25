import { useContext, useState, useEffect } from "react";
import { useC, useTr, LangCtx } from "../contexts";
import { C_DARK } from "../constants/theme";
import { T } from "../constants/translations";
import { Av, Stars, PBar, MiniBar } from "../components/ui";
import { reviews as reviewsApi, ai } from "../api";

export default function PDetail({p,onClose,onBook,onChat}) {
  const C=useC();
  const dark=C===C_DARK;
  const tr=useTr();
  const lang=useContext(LangCtx)===T.en?"en":"bn";
  const name=lang==="en"?p.nameEn:p.name;
  const svc=lang==="en"?p.svcEn:p.svc;
  const loc=lang==="en"?p.locEn:p.loc;
  const tags=lang==="en"?p.tagsEn:p.tags;
  const eta=lang==="en"?p.etaEn:p.eta;
  const [tab,setTab]=useState("about");
  const [realRevs,setRealRevs]=useState(null);
  const [revLoading,setRevLoading]=useState(false);
  const [revSummary,setRevSummary]=useState(null);
  const [revSumLoading,setRevSumLoading]=useState(false);
  const REVS=[
    {av:"আ",name:tr.rv1name,r:5,t:tr.rv1,d:tr.rv1d},
    {av:"স",name:tr.rv2name,r:5,t:tr.rv2,d:tr.rv2d},
    {av:"ক",name:tr.rv3name,r:4,t:tr.rv3,d:tr.rv3d},
  ];
  // Load real reviews + AI summary when reviews tab opens
  useEffect(()=>{
    if(tab==="reviews"&&p.id&&realRevs===null){
      setRevLoading(true);
      reviewsApi.getByProvider(p.id)
        .then(d=>{
          const revs=d.reviews||[];
          setRealRevs(revs);
          if(revs.length>=2&&!revSummary){
            setRevSumLoading(true);
            const texts=revs.slice(0,6).map(r=>`${r.rating}★: ${r.comment||""}`).join("\n");
            const prompt=lang==="en"
              ?`Summarize these service provider reviews in 1-2 sentences with overall sentiment:\n${texts}`
              :`এই service provider এর reviews এর ১-২ বাক্যে সারসংক্ষেপ দাও:\n${texts}`;
            ai.chat([{role:"user",content:prompt}],lang)
              .then(r=>setRevSummary(r.reply))
              .catch(()=>{})
              .finally(()=>setRevSumLoading(false));
          }
        })
        .catch(()=>setRealRevs([]))
        .finally(()=>setRevLoading(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[tab]);
  return (
    <div style={{padding:24,maxWidth:640,width:"100%"}}>
      <div className="row" style={{gap:14,alignItems:"flex-start",marginBottom:16}}>
        <Av av={p.av} col={p.col} size={64} fs={22} rad={18}/>
        <div style={{flex:1}}>
          <div className="row" style={{gap:7,flexWrap:"wrap"}}>
            <span style={{fontSize:19,fontWeight:700}}>{name}</span>
            {p.ok&&<span className="badge" style={{background:"rgba(16,185,129,.15)",color:"#065F46"}}>✅</span>}
            {p.top&&<span className="badge" style={{background:"rgba(245,158,11,.12)",color:"#A35C03"}}>⭐ {p.badge}</span>}
          </div>
          <div style={{fontSize:13,color:C.muted,marginTop:3}}>{svc} · 📍 {loc}</div>
          <div className="row" style={{gap:12,marginTop:7,flexWrap:"wrap"}}>
            <span style={{fontSize:13}}><Stars r={p.r} size={12}/> <b>{p.r}</b> ({p.rev})</span>
            <span style={{fontSize:13,color:C.muted}}>✅ {p.jobs} {tr.jobs} · ⏱️ {eta} {tr.min}</span>
          </div>
        </div>
        <button className="btn btn-gh" style={{fontSize:20,flexShrink:0}} onClick={onClose}>✕</button>
      </div>
      <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:14}}>{tags.map(t=><span key={t} className="tag">{t}</span>)}</div>
      <div className="row" style={{gap:2,borderBottom:`2px solid ${C.bdr}`,marginBottom:16}}>
        {[["about",tr.tabAbout],["stats",tr.tabStats],["earnings",tr.tabEarnings],["reviews",tr.tabReviews]].map(([id,l])=>(
          <button key={id} className="btn btn-gh" onClick={()=>setTab(id)} style={{borderRadius:"8px 8px 0 0",paddingBottom:9,borderBottom:`2px solid ${tab===id?C.p:"transparent"}`,color:tab===id?C.p:C.sub,fontWeight:tab===id?700:400,marginBottom:-2,fontSize:12}}>{l}</button>
        ))}
      </div>
      {tab==="about"&&<div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(80px,1fr))",gap:10,marginBottom:14}}>
          {[["💼",tr.totalJobsL,p.jobs],["📊",tr.scoreL,p.score+"/100"],["💹",tr.loanScoreL,p.loanScore+"/100"]].map(([ic,l,v],i)=>(
            <div key={i} style={{
              background:dark?"rgba(34,212,127,.06)":"rgba(29,191,115,.05)",
              borderRadius:12,padding:12,textAlign:"center",
              border:`1px solid ${C.p}15`,
              boxShadow:`inset 0 1px 0 rgba(255,255,255,.5),0 2px 8px rgba(0,0,0,.04)`
            }}><div style={{fontSize:20,marginBottom:4}}>{ic}</div><div style={{fontSize:16,fontWeight:700,color:C.p}}>{v}</div><div style={{fontSize:11,color:C.muted}}>{l}</div></div>
          ))}
        </div>
      <div style={{
        background:`${C.p}0A`,borderRadius:13,padding:12,
        border:`1px solid ${C.p}25`,
        boxShadow:`0 4px 16px ${C.p}12,inset 0 1px 0 rgba(255,255,255,.4)`
      }}>
          <div style={{fontSize:12,fontWeight:700,color:C.p,marginBottom:6}}>{tr.verifiedL}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            {["✅ NID","✅ Phone","✅ Background","✅ Photo"].map(i=><div key={i} style={{fontSize:12,color:C.sub}}>{i}</div>)}
          </div>
        </div>
      </div>}
      {tab==="stats"&&<div>
        {[["📋",lang==="en"?"Service History":"সেবার ইতিহাস",95],["💳",lang==="en"?"Payment Regularity":"পেমেন্ট নিয়মিততা",88],["⭐",lang==="en"?"Customer Rating":"গ্রাহক রেটিং",92],["📱",lang==="en"?"Activity":"সক্রিয়তা",78]].map(([ic,l,s],i)=>(
          <div key={i} style={{marginBottom:12}}>
            <div className="row" style={{justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:13}}>{ic} {l}</span><span style={{fontSize:13,fontWeight:700,color:s>=80?C.p:"#F59E0B"}}>{s}%</span></div>
            <PBar v={s} col={s>=80?C.p:"#F59E0B"}/>
          </div>
        ))}
      </div>}
      {tab==="earnings"&&<div>
        <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>{tr.weeklyEarnings}</div>
        <MiniBar data={p.earnings} tr={tr}/>
        <div style={{background:C.bg,borderRadius:11,padding:12,marginTop:12}}>
          <div className="row" style={{justifyContent:"space-between"}}><span style={{fontSize:13,color:C.muted}}>{tr.weekTotal}</span><span style={{fontSize:15,fontWeight:700,color:C.p}}>৳{p.earnings.reduce((a,b)=>a+b,0).toLocaleString()}</span></div>
        </div>
      </div>}
      {tab==="reviews"&&<div style={{display:"flex",flexDirection:"column",gap:10}}>
        {(revSummary||revSumLoading)&&<div style={{background:`linear-gradient(135deg,${C.plt},#fff)`,border:`1.5px solid ${C.p}`,borderRadius:12,padding:12}}>
          <div style={{fontSize:11,fontWeight:700,color:C.p,marginBottom:5}}>🤖 AI {lang==="en"?"Summary":"সারসংক্ষেপ"}</div>
          {revSumLoading?<div style={{fontSize:12,color:C.muted}}>✨ {lang==="en"?"Analyzing reviews...":"রিভিউ বিশ্লেষণ হচ্ছে..."}</div>:<div style={{fontSize:12,color:C.sub,lineHeight:1.65}}>{revSummary}</div>}
        </div>}
        {revLoading&&<div style={{textAlign:"center",padding:24,color:C.muted}}>⏳ {lang==="en"?"Loading reviews...":"লোড হচ্ছে..."}</div>}
        {!revLoading&&(realRevs!==null?realRevs:REVS).map((rv,i)=>(
          <div key={rv.id||i} style={{padding:12,border:`1px solid ${C.bdr}`,borderRadius:12}}>
            <div className="row" style={{gap:9,marginBottom:6}}>
              <div className="jc" style={{width:34,height:34,borderRadius:9,background:`linear-gradient(135deg,${C.p},${C.plt||"#E6F4EF"})`,color:dark?"#fff":C.p,fontWeight:700,fontSize:13,flexShrink:0}}>{rv.customer_name?rv.customer_name[0]:(rv.av||"?")}</div>
              <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700}}>{rv.customer_name||rv.name}</div><Stars r={rv.rating||rv.r} size={11}/></div>
              <div style={{fontSize:11,color:C.muted}}>{rv.created_at?new Date(rv.created_at).toLocaleDateString():rv.d}</div>
            </div>
            <div style={{fontSize:13,color:C.sub,lineHeight:1.65}}>{rv.comment||rv.t}</div>
            {rv.tags&&rv.tags.split(",").filter(Boolean).length>0&&(
              <div style={{marginTop:6,display:"flex",flexWrap:"wrap",gap:4}}>
                {rv.tags.split(",").filter(Boolean).map(t=><span key={t} style={{fontSize:10,background:C.plt,color:C.p,borderRadius:99,padding:"2px 8px",fontWeight:600}}>{t}</span>)}
              </div>
            )}
          </div>
        ))}
        {realRevs!==null&&realRevs.length===0&&(
          <div style={{textAlign:"center",padding:24,color:C.muted}}>⭐ {lang==="en"?"No reviews yet":"এখনো কোনো রিভিউ নেই"}</div>
        )}
        {realRevs!==null&&realRevs.length>1&&(
          <div style={{textAlign:"center",fontSize:12,color:C.muted,padding:6}}>
            ⭐ {lang==="en"?"Average":"গড়"}: <b style={{color:C.p}}>{(realRevs.reduce((s,r)=>s+(r.rating||0),0)/realRevs.length).toFixed(1)}</b> ({realRevs.length} {lang==="en"?"reviews":"টি রিভিউ"})
          </div>
        )}
      </div>}
      <div className="row" style={{gap:9,marginTop:18}}>
        <button className="btn btn-o" style={{flex:1}} onClick={()=>{onClose();onChat&&onChat(p);}}>{tr.msgBtn}</button>
        <button className="btn btn-g" style={{flex:2}} onClick={()=>{onClose();onBook(p);}}>{tr.bookNow} — {p.price}</button>
      </div>
    </div>
  );
}
