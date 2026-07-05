import { useContext, useState, useEffect } from "react";
import { useC, useTr, LangCtx, useLiveData } from "../contexts";
import { C_DARK } from "../constants/theme";
import { T } from "../constants/translations";
import { Av, Stars } from "../components/ui";
import { ai, bookings as bookingsApi, users as usersApi } from "../api";

export default function BookModal({p,onClose,onSuccess}) {
  const C=useC();
  const dark=C===C_DARK;
  const tr=useTr();
  const lang=useContext(LangCtx)===T.en?"en":"bn";
  const {setBalance}=useLiveData();
  const name=lang==="en"?p.nameEn:p.name;
  const svc=lang==="en"?p.svcEn:p.svc;
  const eta=lang==="en"?p.etaEn:p.eta;
  const [step,setStep]=useState(0);
  const [time,setTime]=useState(null);
  const [pay,setPay]=useState("bKash");
  const [done,setDone]=useState(false);
  const [fraudWarn,setFraudWarn]=useState(null);
  const [bundles,setBundles]=useState([]);
  const [dynPrice,setDynPrice]=useState(null);
  const [loadingConfirm,setLoadingConfirm]=useState(false);
  const [bookErr,setBookErr]=useState(null);
  const [bookingRef,setBookingRef]=useState(null);
  const [otpStep,setOtpStep]=useState(false);
  const [otpVal,setOtpVal]=useState("");
  const [otpCode]=useState(()=>String(Math.floor(100000+Math.random()*900000)));
  const [otpPhone]=useState(()=>"01"+Math.floor(Math.random()*900000000+100000000).toString());
  const [otpErr,setOtpErr]=useState(false);
  const TIMES=[tr.t1,tr.t2,tr.t3,tr.t4,tr.t5,tr.t6];
  const STEPS=[lang==="en"?"Service":"সেবা",lang==="en"?"Time":"সময়",lang==="en"?"Payment":"পেমেন্ট"];
  const baseAmount=parseInt(String(p.price||"").replace(/[৳,]/g,""))||350;

  // Fetch dynamic price when modal opens
  useEffect(()=>{
    ai.dynamicPrice(p.svcEn||p.svc||"general").then(d=>setDynPrice(d)).catch(()=>{});
  },[]);

  const handleConfirm=async(force=false)=>{
    if(loadingConfirm)return;
    // OTP step for digital payments
    if(pay!=="Cash"&&!otpStep&&!force){
      setOtpStep(true);
      return;
    }
    if(otpStep&&otpVal!==otpCode){
      setOtpErr(true);
      return;
    }
    setOtpStep(false);
    setLoadingConfirm(true);
    // Fraud check first
    if(!force){
      try{
        const f=await ai.fraudCheck(null,p.id,dynPrice?.dynamicPrice||baseAmount,p.svcEn||p.svc);
        if(f.riskLevel==="high"||f.riskLevel==="medium"){
          setFraudWarn(f);
          setLoadingConfirm(false);
          return;
        }
      }catch(e){ console.warn("fraud-check:",e.message); }
    }
    setFraudWarn(null);
    try {
      const resp = await bookingsApi.create({
        provider_id:    p.id,
        service_type:   p.svcEn||p.svc||p.service_category||"",
        scheduled_at:   time,
        payment_method: pay,
        total_amount:   dynPrice?.dynamicPrice||baseAmount,
        notes:          "",
      });
      setBookingRef(resp?.id || null);
    } catch(e){ setLoadingConfirm(false); setBookErr(e.data?.error||e.message||(lang==="en"?"Booking failed. Please try again.":"বুকিং ব্যর্থ হয়েছে। আবার চেষ্টা করুন।")); return; }
    // Refresh wallet balance in context
    usersApi.getWallet().then(d=>{if(d.balance!=null)setBalance(d.balance);}).catch(()=>{});
    // Bundle suggestions
    try{
      const b=await ai.bundleSuggest(p.svcEn||p.svc||"general");
      if(b.suggestions?.length) setBundles(b.suggestions.slice(0,3));
    }catch(e){}
    setLoadingConfirm(false);
    setDone(true);
  };

  // OTP verification UI for digital payments
  if(otpStep) return (
    <div style={{padding:24,textAlign:"center"}}>
      <div style={{fontSize:48,marginBottom:10}}>📲</div>
      <div style={{fontSize:17,fontWeight:700,marginBottom:6}}>{lang==="en"?"Verify Payment":"পেমেন্ট যাচাই করুন"}</div>
      <div style={{fontSize:13,color:C.muted,marginBottom:4}}>{lang==="en"?`Enter code sent via ${pay}`:pay+" এ পাঠানো কোড দিন"}</div>
      <div style={{fontSize:13,fontWeight:700,marginBottom:14,color:C.p}}>{otpPhone}</div>
      <div style={{background:"rgba(59,130,246,.1)",borderRadius:12,padding:"10px 18px",marginBottom:16,border:"1px solid rgba(59,130,246,.3)",fontSize:13,color:"#1D4ED8"}}>
        🎯 {lang==="en"?"Demo OTP:":"ডেমো OTP:"} <b style={{fontSize:20,letterSpacing:4}}>{otpCode}</b>
      </div>
      <input
        value={otpVal}
        onChange={e=>{setOtpVal(e.target.value.replace(/\D/g,"").slice(0,6));setOtpErr(false);}}
        placeholder="• • • • • •"
        maxLength={6}
        style={{width:"100%",padding:"14px",border:`2px solid ${otpErr?"#EF4444":otpVal.length===6?C.p:C.bdr}`,borderRadius:12,fontSize:24,textAlign:"center",letterSpacing:10,fontWeight:700,background:C.bg,color:C.p,marginBottom:6,outline:"none",boxSizing:"border-box"}}
      />
      {otpErr&&<div style={{fontSize:12,color:"#EF4444",marginBottom:10}}>{lang==="en"?"Incorrect OTP. Try again.":"ভুল OTP — আবার চেষ্টা করুন"}</div>}
      {!otpErr&&<div style={{fontSize:11,color:C.muted,marginBottom:14}}>{lang==="en"?"Enter the 6-digit code above":"উপরের ৬ সংখ্যার কোডটি লিখুন"}</div>}
      <div className="row" style={{gap:8}}>
        <button className="btn btn-gh" style={{flex:1,border:`1px solid ${C.bdr}`}} onClick={()=>{setOtpStep(false);setOtpVal("");setOtpErr(false);}}>{tr.backBtn}</button>
        <button className="btn btn-g" style={{flex:2}} disabled={otpVal.length<6||loadingConfirm} onClick={()=>handleConfirm(false)}>
          {loadingConfirm?"⏳...":(lang==="en"?"Verify & Pay":"যাচাই করে পেমেন্ট করুন")}
        </button>
      </div>
    </div>
  );

  // Show fraud warning overlay
  if(fraudWarn) return (
    <div style={{padding:24,textAlign:"center"}}>
      <div style={{fontSize:56,marginBottom:10}}>⚠️</div>
      <div style={{fontSize:17,fontWeight:700,color:"#DC2626",marginBottom:8}}>{lang==="en"?"Suspicious Activity Detected":"সন্দেহজনক কার্যকলাপ শনাক্ত"}</div>
      <div style={{background:"rgba(239,68,68,.08)",borderRadius:12,padding:14,marginBottom:14,border:"1px solid rgba(239,68,68,.25)"}}>
        {fraudWarn.flags.map((f,i)=>(
          <div key={i} style={{fontSize:12,color:"#7F1D1D",marginBottom:4}}>• {f}</div>
        ))}
      </div>
      <div style={{fontSize:13,color:C.muted,marginBottom:16}}>{lang==="en"?"Still want to proceed?":"তারপরও কি এগিয়ে যেতে চান?"}</div>
      <div className="row" style={{gap:8}}>
        <button className="btn btn-gh" style={{flex:1,border:`1px solid ${C.bdr}`}} onClick={()=>setFraudWarn(null)}>{lang==="en"?"Cancel":"বাতিল"}</button>
        <button className="btn" style={{flex:2,background:"#DC2626",color:"#fff",border:"none",borderRadius:10,padding:"11px"}} onClick={()=>handleConfirm(true)}>{lang==="en"?"Proceed Anyway":"তবুও এগান"}</button>
      </div>
    </div>
  );

  if(done) return (
    <div style={{padding:24,textAlign:"center"}}>
      <div style={{fontSize:64,marginBottom:14}}>🎉</div>
      <div style={{fontSize:21,fontWeight:700}}>{tr.bookDone}</div>
      <div style={{fontSize:14,color:C.muted,marginTop:6}}>{name} {eta} {tr.min} {tr.arrives}</div>
      <div style={{
        background:dark?"rgba(34,212,127,.06)":"rgba(29,191,115,.05)",
        borderRadius:16,padding:18,margin:"14px 0",
        border:`1.5px solid ${C.p}30`,
        boxShadow:`0 8px 24px ${C.p}12,inset 0 1px 0 rgba(255,255,255,.3)`
      }}>
        <div style={{fontSize:11,color:C.muted}}>{tr.bookId}</div>
        <div style={{fontSize:22,fontWeight:700,color:C.p,marginTop:4}}>#{bookingRef?bookingRef.slice(0,8).toUpperCase():"BK-"+Math.floor(Math.random()*9000+1000)}</div>
        {dynPrice?.surgeActive&&<div style={{fontSize:10,color:"#F59E0B",marginTop:6}}>⚡ {dynPrice.surgeReason}</div>}
      </div>
      {bundles.length>0&&(
        <div style={{marginBottom:14,textAlign:"left"}}>
          <div style={{fontSize:12,fontWeight:700,color:C.p,marginBottom:8}}>🤖 {lang==="en"?"You may also need:":"আরো যা লাগতে পারে:"}</div>
          <div style={{display:"flex",flexDirection:"column",gap:7}}>
            {bundles.map((b,i)=>(
              <div key={i} style={{background:C.bg,borderRadius:10,padding:"9px 12px",border:`1px solid ${C.bdr}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:13}}>{b.service}</span>
                <span style={{fontSize:10,color:C.muted,background:C.plt,borderRadius:99,padding:"2px 7px"}}>🔥 {b.popularity}x</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <button className="btn btn-g" style={{width:"100%",padding:"14px"}} onClick={()=>{onSuccess?.();onClose();}}>{tr.doneBtn}</button>
    </div>
  );
  return (
    <div style={{padding:24}}>
      <div className="row" style={{justifyContent:"space-between",marginBottom:18}}>
        <div style={{fontSize:17,fontWeight:700}}>📋 {tr.bookTitle}</div>
        <button className="btn btn-gh" style={{fontSize:20}} onClick={onClose}>✕</button>
      </div>
      <div className="row" style={{gap:4,marginBottom:20}}>
        {STEPS.map((s,i)=>(
          <div key={i} className="row" style={{flex:1,gap:4}}>
            <div className="jc" style={{width:26,height:26,borderRadius:"50%",fontSize:11,fontWeight:700,flexShrink:0,background:i<step?C.p:i===step?`${C.p}18`:"#E5E7EB",color:i<step?"#fff":i===step?C.p:C.muted,border:i===step?`2px solid ${C.p}`:"2px solid transparent"}}>{i<step?"✓":i+1}</div>
            <div style={{fontSize:11,fontWeight:i===step?700:400,color:i<=step?C.p:C.muted}}>{s}</div>
            {i<2&&<div style={{flex:1,height:1,background:i<step?C.p:C.bdr}}/>}
          </div>
        ))}
      </div>
      {step===0&&<>
        <div style={{background:C.bg,borderRadius:12,padding:14,marginBottom:12,display:"flex",gap:12,alignItems:"center"}}>
          <Av av={p.av} col={p.col} size={46}/><div><div style={{fontSize:15,fontWeight:700}}>{name}</div><div style={{fontSize:12,color:C.muted}}>{svc}</div><Stars r={p.r} size={12}/></div>
        </div>
        <div style={{background:`${C.p}0C`,borderRadius:12,padding:12,marginBottom:14,border:`1px solid ${C.p}22`}}>
          <div style={{fontSize:12,fontWeight:700,color:C.p,marginBottom:4}}>{tr.aiTip}</div>
          <div style={{fontSize:13,color:C.sub,lineHeight:1.65}}>{name} — {tr.aiMsg} {p.price}. {eta} {tr.min} {tr.aiArrival}</div>
        </div>
        <button className="btn btn-g" style={{width:"100%",padding:"13px"}} onClick={()=>setStep(1)}>{tr.timeBtn}</button>
      </>}
      {step===1&&<>
        <div style={{fontSize:14,fontWeight:600,marginBottom:12}}>{tr.selTime}</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(85px,1fr))",gap:8,marginBottom:16}}>
          {TIMES.map(t=><button key={t} className="btn" onClick={()=>setTime(t)} style={{padding:"11px 4px",border:`2px solid ${time===t?C.p:C.bdr}`,borderRadius:10,background:time===t?`${C.p}12`:"#fff",color:time===t?C.p:C.text,fontSize:12,fontWeight:time===t?700:400}}>{t}</button>)}
        </div>
        <div className="row" style={{gap:8}}>
          <button className="btn btn-gh" style={{flex:1,border:`1px solid ${C.bdr}`}} onClick={()=>setStep(0)}>{tr.backBtn}</button>
          <button className="btn btn-g" style={{flex:2}} onClick={()=>time&&setStep(2)} disabled={!time}>{tr.nextBtn}</button>
        </div>
      </>}
      {step===2&&<>
        <div style={{fontSize:14,fontWeight:600,marginBottom:12}}>{tr.payMethod}</div>
        {[["bKash","💳","#E31E50"],["Nagad","📱","#F97316"],["Rocket","🚀","#7C3AED"],["Cash","💵","#00C170"]].map(([nm,ic,cl])=>(
          <div key={nm} onClick={()=>setPay(nm)} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 14px",borderRadius:11,border:`2px solid ${pay===nm?C.p:C.bdr}`,background:pay===nm?`${C.p}08`:"#fff",marginBottom:7,cursor:"pointer",transition:"all .15s"}}>
            <div className="jc" style={{width:38,height:38,borderRadius:9,background:cl+"22",fontSize:17,flexShrink:0}}>{ic}</div>
            <div style={{flex:1,fontSize:14,fontWeight:600}}>{nm}</div>
            <div className="jc" style={{width:19,height:19,borderRadius:"50%",border:`2px solid ${pay===nm?C.p:C.bdr}`}}>{pay===nm&&<div style={{width:9,height:9,borderRadius:"50%",background:C.p}}/>}</div>
          </div>
        ))}
        <div style={{background:C.bg,borderRadius:11,padding:12,margin:"12px 0"}}>
          {[[tr.serviceFee,`৳${baseAmount}`],[tr.platformFee,`৳${Math.round(baseAmount*0.1)}`]].map(([l,v],i)=>(
            <div key={i} className="row" style={{justifyContent:"space-between",marginBottom:5}}><span style={{fontSize:13,color:C.muted}}>{l}</span><span style={{fontSize:13}}>{v}</span></div>
          ))}
          {dynPrice?.surgeActive&&(
            <div className="row" style={{justifyContent:"space-between",marginBottom:5}}>
              <span style={{fontSize:12,color:"#F59E0B"}}>⚡ Surge ({dynPrice.surgeReason})</span>
              <span style={{fontSize:12,color:"#F59E0B"}}>×{dynPrice.multiplier}</span>
            </div>
          )}
          <div style={{height:1,background:C.bdr,margin:"7px 0"}}/>
          <div className="row" style={{justifyContent:"space-between"}}>
            <span style={{fontSize:14,fontWeight:700}}>{tr.total}</span>
            <div style={{textAlign:"right"}}>
              {dynPrice?.surgeActive&&<div style={{fontSize:11,color:C.muted,textDecoration:"line-through"}}>৳{dynPrice.basePrice+Math.round(dynPrice.basePrice*0.1)}</div>}
              <span style={{fontSize:17,fontWeight:700,color:C.p}}>৳{dynPrice?(dynPrice.dynamicPrice+Math.round(dynPrice.dynamicPrice*0.1)):(baseAmount+Math.round(baseAmount*0.1))}</span>
            </div>
          </div>
        </div>
        {bookErr&&<div style={{background:"rgba(239,68,68,.1)",borderRadius:10,padding:"10px 14px",marginBottom:10,fontSize:13,color:"#B91C1C",fontWeight:600,border:"1px solid rgba(239,68,68,.25)"}}>❌ {bookErr}</div>}
        <div className="row" style={{gap:8}}>
          <button className="btn btn-gh" style={{flex:1,border:`1px solid ${C.bdr}`}} onClick={()=>setStep(1)}>{tr.backBtn}</button>
          <button className="btn btn-g" style={{flex:2}} disabled={loadingConfirm} onClick={()=>{setBookErr(null);handleConfirm(false);}}>{loadingConfirm?(lang==="en"?"Checking...":"যাচাই হচ্ছে..."):tr.confirmBtn}</button>
        </div>
      </>}
    </div>
  );
}
