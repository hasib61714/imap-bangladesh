import { useContext, useState } from "react";
import { useC, useTr, LangCtx, useLiveData } from "../contexts";
import { T } from "../constants/translations";
import { Av } from "../components/ui";
import { ai, reviews as reviewsApi } from "../api";

export default function RatingModal({p,onClose,onSuccess}) {
  const C=useC();
  const tr=useTr();
  const lang=useContext(LangCtx)===T.en?"en":"bn";
  const name=lang==="en"&&p?p.nameEn:p?.name;
  const {bookings:ctxBookings}=useLiveData();
  const [rating,setRating]=useState(0);
  const [hover,setHover]=useState(0);
  const [selTags,setSelTags]=useState([]);
  const [comment,setComment]=useState("");
  const [done,setDone]=useState(false);
  const [reviewSubmitting,setReviewSubmitting]=useState(false);
  const LABELS=["",tr.rl1,tr.rl2,tr.rl3,tr.rl4,tr.rl5];
  const TAGS=tr.rtags.split(",");
  if(done) return (
    <div style={{padding:28,textAlign:"center"}}>
      <div style={{fontSize:64,marginBottom:14}}>🎉</div>
      <div style={{fontSize:18,fontWeight:700}}>{tr.rDone}</div>
      <div style={{fontSize:13,color:C.muted,marginTop:6}}>{tr.rSubmitted}</div>
      <button className="btn btn-g" style={{marginTop:18,width:"100%",padding:"13px"}} onClick={onClose}>{tr.closeBtn}</button>
    </div>
  );
  return (
    <div style={{padding:24}}>
      <div className="row" style={{justifyContent:"space-between",marginBottom:16}}>
        <div style={{fontSize:16,fontWeight:700}}>⭐ {tr.ratingTitle}</div>
        <button className="btn btn-gh" style={{fontSize:20}} onClick={onClose}>✕</button>
      </div>
      {p&&<div style={{textAlign:"center",marginBottom:16}}><div style={{display:"flex",justifyContent:"center",marginBottom:8}}><Av av={p.av} col={p.col} size={56} rad={16}/></div><div style={{fontSize:16,fontWeight:700}}>{name}</div></div>}
      <div className="row" style={{justifyContent:"center",gap:8,marginBottom:8}}>
        {[1,2,3,4,5].map(s=><div key={s} onMouseEnter={()=>setHover(s)} onMouseLeave={()=>setHover(0)} onClick={()=>setRating(s)} style={{fontSize:38,cursor:"pointer",color:(hover||rating)>=s?"#F59E0B":"#E5E7EB",transition:"all .12s",transform:(hover||rating)>=s?"scale(1.18)":"scale(1)"}}>★</div>)}
      </div>
      {rating>0&&<div style={{textAlign:"center",fontSize:14,color:C.p,fontWeight:600,marginBottom:12}}>{LABELS[rating]}</div>}
      <div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:14}}>
        {TAGS.map(t=><button key={t} onClick={()=>setSelTags(prev=>prev.includes(t)?prev.filter(x=>x!==t):[...prev,t])} style={{padding:"6px 12px",borderRadius:99,border:`1.5px solid ${selTags.includes(t)?C.p:C.bdr}`,background:selTags.includes(t)?`${C.p}12`:"#fff",color:selTags.includes(t)?C.p:C.muted,fontSize:12,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif",fontWeight:600,transition:"all .15s"}}>{selTags.includes(t)?"✓ ":""}{t}</button>)}
      </div>
      <textarea value={comment} onChange={e=>setComment(e.target.value)} placeholder={tr.commentPh} rows={3} style={{width:"100%",padding:"11px",background:C.bg,border:`1px solid ${C.bdr}`,borderRadius:11,fontSize:13,color:C.text,resize:"none",marginBottom:14}}/>
      <div className="row" style={{gap:8}}>
        <button className="btn btn-gh" style={{flex:1,border:`1px solid ${C.bdr}`}} onClick={onClose}>{tr.cancelBtn}</button>
        <button className="btn btn-g" style={{flex:2}} disabled={!rating||reviewSubmitting} onClick={async()=>{
          if(!rating||reviewSubmitting)return;
          setReviewSubmitting(true);
          // Fake review check via AI
          try{
            const chk=await ai.reviewCheck(p?.id,rating,comment,null);
            if(chk.isSuspicious){
              const ok=window.confirm(
                lang==="en"
                  ?`AI flagged this review (${chk.confidence}% confidence).\n${chk.reasons.join("\n")}\n\nStill submit?`
                  :`AI এই রিভিউতে সমস্যা পেয়েছে (${chk.confidence}% নিশ্চিত)।\n${chk.reasons.join("\n")}\n\nতবুও জমা দেবেন?`
              );
              if(!ok){setReviewSubmitting(false);return;}
            }
          }catch(e){ console.warn("review-check:",e.message); }
          const bk=ctxBookings.find(b=>(b.provider_id||b.pid)===p?.id&&(b.status==="completed"||b.status==="সম্পন্ন"));
          try{if(bk?.id)await reviewsApi.submit({booking_id:bk.id,rating,comment,tags:selTags.join(",")});setDone(true);onSuccess?.();}catch(e){console.error("review:",e);alert(lang==="en"?"Failed to submit review. Please try again.":"রিভিউ জমা ব্যর্থ হয়েছে। আবার চেষ্টা করুন।");}finally{setReviewSubmitting(false);}
        }}>{reviewSubmitting?"⏳...":tr.submitRating}</button>
      </div>
    </div>
  );
}
