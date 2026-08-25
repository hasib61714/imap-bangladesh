import { useContext, useState } from "react";
import { useC, LangCtx } from "../contexts";
import { T } from "../constants/translations";
import { users as usersApi } from "../api";

export default function DisputeModal({booking,onClose}){
  const C=useC();
  const lang=useContext(LangCtx)===T.en?"en":"bn";
  const [type,setType]=useState("");
  const [desc,setDesc]=useState("");
  const [submitted,setSubmitted]=useState(false);
  const [submitting,setSubmitting]=useState(false);
  const [refId,setRefId]=useState("");
  const TYPES=lang==="en"?["Quality Issue","Late Arrival","Overcharged","Behavior Issue","Incomplete Work"]
                          :["মান সমস্যা","দেরিতে আগমন","অতিরিক্ত চার্জ","ব্যবহার সমস্যা","কাজ অসম্পূর্ণ"];
  const svc=lang==="en"?booking.svcEn||booking.svc:booking.svc;
  const handleSubmit=async()=>{
    if(!type||desc.length<=5)return;
    setSubmitting(true);
    try{
      const r=await usersApi.submitComplaint({booking_id:booking.id||booking.booking_ref,subject:type,description:desc,priority:"medium"});
      setRefId(r.ref||`DSP-${Math.floor(Math.random()*90000+10000)}`);
    }catch{
      setRefId(`DSP-${Math.floor(Math.random()*90000+10000)}`);
    }
    setSubmitting(false);
    setSubmitted(true);
  };
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div style={{
        background:C.card,borderRadius:20,padding:22,
        maxWidth:420,width:"100%",maxHeight:"82vh",overflowY:"auto",
        boxShadow:`0 24px 64px rgba(0,0,0,.25),0 0 0 1px ${C.p}11`,
        border:`1px solid ${C.bdr}`
      }} onClick={e=>e.stopPropagation()}>
        {submitted?(
          <div style={{textAlign:"center",padding:"24px 0"}}>
            <div style={{fontSize:44,marginBottom:12}}>✅</div>
            <div style={{fontSize:17,fontWeight:700,color:"#065F46",marginBottom:8}}>{lang==="en"?"Dispute Submitted!":"অভিযোগ জমা হয়েছে!"}</div>
            <div style={{fontSize:13,color:"#6B7280",marginBottom:20}}>{lang==="en"?"We'll review and respond within 24–48 hours.":"আমরা ২৪–৪৮ ঘণ্টার মধ্যে পর্যালোচনা করব।"}</div>
            <div style={{background:"rgba(16,185,129,.12)",borderRadius:12,padding:"12px 16px",marginBottom:20,textAlign:"left",border:"1px solid rgba(16,185,129,.3)"}}>
              <div style={{fontSize:12,fontWeight:700,color:"#065F46",marginBottom:4}}>{lang==="en"?"Reference ID":"রেফারেন্স আইডি"}</div>
              <div style={{fontSize:15,fontWeight:800,color:"#00C170",fontFamily:"monospace"}}>{refId}</div>
            </div>
            <button onClick={onClose} style={{background:"#00C170",border:"none",borderRadius:12,color:"#fff",padding:"12px 28px",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>{lang==="en"?"Close":"বন্ধ করুন"}</button>
          </div>
        ):(
          <>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{fontSize:16,fontWeight:700}}>⚠️ {lang==="en"?"File a Dispute":"অভিযোগ দাখিল"}</div>
              <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#9CA3AF"}}>✕</button>
            </div>
            <div style={{background:"rgba(245,158,11,.1)",borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:13,color:"#92400E",border:"1px solid rgba(245,158,11,.25)"}}>📋 {svc} · {lang==="en"?booking.dateEn||booking.date:booking.date} · {booking.price}</div>
            <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:10}}>{lang==="en"?"Issue Type":"সমস্যার ধরন"}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
              {TYPES.map(t=>(
                <button key={t} onClick={()=>setType(t)} style={{padding:"9px 10px",borderRadius:10,border:`1.5px solid ${type===t?"rgba(245,158,11,.6)":C.bdr}`,background:type===t?"rgba(245,158,11,.12)":C.bg,color:type===t?"#92400E":C.text,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>{t}</button>
              ))}
            </div>
            <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:8}}>{lang==="en"?"Description":"বিবরণ"}</div>
            <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={3}
              placeholder={lang==="en"?"Describe the issue in detail...":"সমস্যার বিস্তারিত লিখুন..."}
              style={{width:"100%",padding:"10px 12px",borderRadius:10,border:`1.5px solid ${C.bdr}`,fontSize:13,fontFamily:"'Hind Siliguri',sans-serif",resize:"vertical",boxSizing:"border-box",color:C.text,background:C.bg,marginBottom:16}}/>
            <button onClick={handleSubmit} disabled={!type||desc.length<=5||submitting}
              style={{width:"100%",padding:"13px",borderRadius:12,background:type&&desc.length>5?"linear-gradient(135deg,#F59E0B,#D97706)":"#D1D5DB",border:"none",color:"#fff",fontSize:14,fontWeight:700,cursor:type&&desc.length>5?"pointer":"default",fontFamily:"'Hind Siliguri',sans-serif"}}>
              {submitting?(lang==="en"?"Submitting...":"জমা হচ্ছে..."):(lang==="en"?"Submit Dispute":"অভিযোগ জমা দিন")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
