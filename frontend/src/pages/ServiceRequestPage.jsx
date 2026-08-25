import { useContext, useState } from "react";
import { useC, useTr, LangCtx } from "../contexts";
import { T } from "../constants/translations";
import { SR_TYPES, SR_TIMES } from "../constants/data";
import { bookings as bookingsApi } from "../api";

export default function ServiceRequestPage(){
  const C=useC();const tr=useTr();const lang=useContext(LangCtx)===T.en?"en":"bn";
  const [step,setStep]=useState(1);
  const [svcType,setSvcType]=useState("");
  const [address,setAddress]=useState("");
  const [date,setDate]=useState("");
  const [time,setTime]=useState("");
  const [desc,setDesc]=useState("");
  const [budget,setBudget]=useState("");
  const [urgent,setUrgent]=useState(false);
  const [submitted,setSubmitted]=useState(false);
  const [srSubmitting,setSrSubmitting]=useState(false);

  const doSubmit=async()=>{
    if(srSubmitting)return;
    setSrSubmitting(true);
    try{
      await bookingsApi.create({service_name_en:svcType,address,scheduled_time:date&&time?`${date} ${time}`:date,amount:parseInt(budget)||300,payment_method:"cash",is_urgent:urgent?1:0,note:desc});
      setSubmitted(true);
    }catch(e){
      console.error("svcReq:",e);
      alert(lang==="en"?"Failed to submit request. Please try again.":"অনুরোধ পাঠানো ব্যর্থ হয়েছে। আবার চেষ্টা করুন।");
    }finally{setSrSubmitting(false);}
  };
  const canNext1=svcType&&address;
  const canNext2=date&&time;

  if(submitted) return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"60px 20px",textAlign:"center"}}>
      <div style={{fontSize:64,marginBottom:16}}>✅</div>
      <div style={{fontSize:20,fontWeight:800,color:C.p,marginBottom:8}}>{tr.srSubmitted}</div>
      <div style={{fontSize:13,color:C.sub,marginBottom:24}}>{lang==="en"?"We'll match you with the best provider soon!":"শীঘ্রই আপনাকে সেরা সেবাদাতার সাথে সংযুক্ত করা হবে!"}</div>
      <div style={{background:C.plt,borderRadius:14,padding:"12px 20px",fontSize:13,color:C.p,fontWeight:700}}>REQ-{Date.now().toString().slice(-6)}</div>
    </div>
  );

  return(
    <div>
      {/* Step indicator */}
      <div style={{display:"flex",alignItems:"center",marginBottom:24}}>
        {[1,2,3].map((s,i)=>[
          <div key={s} style={{width:28,height:28,borderRadius:"50%",background:step>=s?C.p:C.bdr,color:step>=s?"#fff":C.sub,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,flexShrink:0}}>{s}</div>,
          i<2&&<div key={"line"+i} style={{flex:1,height:2,background:step>s?C.p:C.bdr,margin:"0 4px"}}/>
        ].flat())}
      </div>
      {step===1&&(
        <div style={{background:C.card,borderRadius:16,padding:18,border:`1px solid ${C.bdr}`}}>
          <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:14}}>{tr.srType}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:18}}>
            {SR_TYPES.map(t=>(
              <button key={t} onClick={()=>setSvcType(t)}
                style={{padding:"10px 8px",borderRadius:10,border:`2px solid ${svcType===t?C.p:C.bdr}`,background:svcType===t?C.plt:C.bg,color:svcType===t?C.p:C.sub,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif",textTransform:"capitalize"}}>
                {t.replace("_"," ")}
              </button>
            ))}
          </div>
          <label style={{fontSize:12,color:C.sub,fontWeight:600,display:"block",marginBottom:6}}>{tr.srAddress}</label>
          <textarea value={address} onChange={e=>setAddress(e.target.value)} rows={2}
            placeholder={lang==="en"?"Full address...":"ঠিকানা লিখুন..."}
            style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1.5px solid ${C.bdr}`,background:C.bg,color:C.text,fontSize:13,fontFamily:"'Hind Siliguri',sans-serif",resize:"none",boxSizing:"border-box"}}/>
          <div style={{display:"flex",alignItems:"center",gap:10,margin:"12px 0",padding:"10px 14px",background:urgent?"#FEF2F2":C.bg,borderRadius:10,border:`1.5px solid ${urgent?"#FCA5A5":C.bdr}`,cursor:"pointer"}} onClick={()=>setUrgent(!urgent)}>
            <input type="checkbox" checked={urgent} onChange={()=>{}} style={{accentColor:"#DC2626",width:16,height:16}}/>
            <span style={{fontSize:13,fontWeight:700,color:urgent?"#DC2626":C.sub}}>🚨 {tr.srUrgent}</span>
          </div>
          <button onClick={()=>canNext1&&setStep(2)} style={{width:"100%",padding:"12px",borderRadius:12,background:canNext1?C.p:"#ccc",border:"none",color:"#fff",fontSize:14,fontWeight:700,cursor:canNext1?"pointer":"default",fontFamily:"'Hind Siliguri',sans-serif",marginTop:6}}>{lang==="en"?"Next →":"পরবর্তী →"}</button>
        </div>
      )}
      {step===2&&(
        <div style={{background:C.card,borderRadius:16,padding:18,border:`1px solid ${C.bdr}`}}>
          <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:14}}>{lang==="en"?"Schedule":"সময়সূচি"}</div>
          <label style={{fontSize:12,color:C.sub,fontWeight:600,display:"block",marginBottom:6}}>{tr.srDate}</label>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)}
            style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1.5px solid ${C.bdr}`,background:C.bg,color:C.text,fontSize:13,marginBottom:14,boxSizing:"border-box"}}/>
          <div style={{fontSize:12,color:C.sub,fontWeight:600,marginBottom:8}}>{tr.srTime}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:18}}>
            {SR_TIMES.map(t=>(
              <button key={t} onClick={()=>setTime(t)}
                style={{padding:"9px 6px",borderRadius:9,border:`2px solid ${time===t?C.p:C.bdr}`,background:time===t?C.plt:C.bg,color:time===t?C.p:C.sub,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>
                {t}
              </button>
            ))}
          </div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>setStep(1)} style={{flex:1,padding:"12px",borderRadius:12,background:C.bg,border:`1.5px solid ${C.bdr}`,color:C.sub,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>{lang==="en"?"← Back":"← পিছনে"}</button>
            <button onClick={()=>canNext2&&setStep(3)} style={{flex:2,padding:"12px",borderRadius:12,background:canNext2?C.p:"#ccc",border:"none",color:"#fff",fontSize:14,fontWeight:700,cursor:canNext2?"pointer":"default",fontFamily:"'Hind Siliguri',sans-serif"}}>{lang==="en"?"Next →":"পরবর্তী →"}</button>
          </div>
        </div>
      )}
      {step===3&&(
        <div style={{background:C.card,borderRadius:16,padding:18,border:`1px solid ${C.bdr}`}}>
          <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:14}}>{lang==="en"?"Details":"বিস্তারিত"}</div>
          <label style={{fontSize:12,color:C.sub,fontWeight:600,display:"block",marginBottom:6}}>{tr.srDesc}</label>
          <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={4}
            placeholder={lang==="en"?"Describe your issue in detail...":"সমস্যার বিস্তারিত বিবরণ দিন..."}
            style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1.5px solid ${C.bdr}`,background:C.bg,color:C.text,fontSize:13,fontFamily:"'Hind Siliguri',sans-serif",resize:"none",boxSizing:"border-box",marginBottom:14}}/>
          <label style={{fontSize:12,color:C.sub,fontWeight:600,display:"block",marginBottom:6}}>{tr.srBudget} (BDT)</label>
          <input value={budget} onChange={e=>setBudget(e.target.value.replace(/[^\d]/g,""))}
            placeholder={lang==="en"?"Your budget (optional)":"বাজেট (ঐচ্ছিক)"}
            style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1.5px solid ${C.bdr}`,background:C.bg,color:C.text,fontSize:13,fontFamily:"'Hind Siliguri',sans-serif",marginBottom:16,boxSizing:"border-box"}}/>
          <div style={{background:C.plt,borderRadius:12,padding:"12px 14px",marginBottom:16,fontSize:12,color:C.sub}}>
            <div style={{fontWeight:700,color:C.text,marginBottom:6}}>📋 {lang==="en"?"Summary":"সারসংক্ষেপ"}</div>
            <div>✅ {svcType} • {urgent?"🚨 Urgent":""}</div>
            <div>📍 {address.slice(0,40)}</div>
            <div>📅 {date} {time}</div>
          </div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>setStep(2)} style={{flex:1,padding:"12px",borderRadius:12,background:C.bg,border:`1.5px solid ${C.bdr}`,color:C.sub,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>{lang==="en"?"← Back":"← পিছনে"}</button>
            <button onClick={doSubmit} disabled={srSubmitting} style={{flex:2,padding:"12px",borderRadius:12,background:srSubmitting?"#9ca3af":C.p,border:"none",color:"#fff",fontSize:14,fontWeight:700,cursor:srSubmitting?"not-allowed":"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>{srSubmitting?"⏳...":tr.srSubmit}</button>
          </div>
        </div>
      )}
    </div>
  );
}
