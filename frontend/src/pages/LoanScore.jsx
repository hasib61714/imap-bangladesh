import { useState } from "react";
import { useC, useTr, useLiveData } from "../contexts";
import { C_DARK } from "../constants/theme";
import { T } from "../constants/translations";
import { PROVIDERS } from "../constants/data";
import { PBar } from "../components/ui";
import { toUiProv } from "../utils/helpers";
import { loans as loansApi } from "../api";

export default function LoanScore() {
  const C=useC();
  const dark=C===C_DARK;
  const tr=useTr();
  const lang=tr===T.en?"en":"bn";
  const { providers: ctxProviders } = useLiveData();
  const p=toUiProv(ctxProviders[0]||PROVIDERS[0]);
  const score=p.loanScore;
  const [applyOffer,setApplyOffer]=useState(null);
  const [loanName,setLoanName]=useState("");
  const [loanPhone,setLoanPhone]=useState("");
  const [loanPurpose,setLoanPurpose]=useState("");
  const [loanDone,setLoanDone]=useState(false);
  const [loanRef,setLoanRef]=useState("");
  const [loanLoading,setLoanLoading]=useState(false);
  const OFFERS=[
    {amt:"৳৫০,০০০",rate:"৯%",tenure:"12",badge:tr.lo1,best:true},
    {amt:"৳১,০০,০০০",rate:"১১%",tenure:"24",badge:tr.lo2,best:false},
    {amt:"৳২,০০,০০০",rate:"১৩%",tenure:"36",badge:tr.lo3,best:false},
  ];
  const msg=score>=80?tr.loanHigh:score>=60?tr.loanMid:tr.loanLow;

  if(applyOffer&&!loanDone) return (
    <div>
      <div style={{background:`linear-gradient(135deg,${C.dark},${C.p}99)`,borderRadius:18,padding:20,marginBottom:20,color:"#fff"}}>
        <div style={{fontSize:12,opacity:.7,marginBottom:4}}>💹 {lang==="en"?"Loan Application":"ঋণ আবেদন"}</div>
        <div style={{fontSize:22,fontWeight:800}}>{applyOffer.amt}</div>
        <div style={{fontSize:13,opacity:.8}}>{applyOffer.rate} {tr.interestL} · {applyOffer.tenure} {lang==="en"?"months":"মাস"}</div>
      </div>
      <div style={{background:C.card,borderRadius:16,padding:18,border:`1px solid ${C.bdr}`,marginBottom:16}}>
        {[[lang==="en"?"Full Name":"পূর্ণ নাম",loanName,setLoanName,"text"],[lang==="en"?"Phone Number":"ফোন নম্বর",loanPhone,setLoanPhone,"tel"],[lang==="en"?"Loan Purpose":"ঋণের উদ্দেশ্য",loanPurpose,setLoanPurpose,"text"]].map(([lbl,val,set,type])=>(
          <div key={lbl} style={{marginBottom:14}}>
            <label style={{fontSize:12,color:C.sub,fontWeight:600,display:"block",marginBottom:5}}>{lbl}</label>
            <input value={val} onChange={e=>set(e.target.value)} type={type} style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1.5px solid ${C.bdr}`,background:C.bg,color:C.text,fontSize:13,fontFamily:"'Hind Siliguri',sans-serif",boxSizing:"border-box"}}/>
          </div>
        ))}
        <div style={{background:`${C.p}10`,borderRadius:12,padding:"11px 14px",marginBottom:16,fontSize:12,color:C.sub}}>
          📊 {lang==="en"?"Your loan score:":"আপনার লোন স্কোর:"} <b style={{color:C.p}}>{score}/100</b> — {msg}
        </div>
      </div>
      <div style={{display:"flex",gap:10}}>
        <button onClick={()=>setApplyOffer(null)} style={{flex:1,padding:"12px",borderRadius:12,background:C.bg,border:`1.5px solid ${C.bdr}`,color:C.sub,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>{lang==="en"?"← Back":"← ফিরুন"}</button>
        <button onClick={async()=>{
          if(!loanName.trim()||!loanPhone.trim()||loanLoading)return;
          setLoanLoading(true);
          try{
            const amtNum=parseInt(String(applyOffer.amt).replace(/[^\d]/g,""))||50000;
            const r=await loansApi.apply({full_name:loanName.trim(),phone:loanPhone.trim(),purpose:loanPurpose.trim()||undefined,amount:amtNum,tenure_months:parseInt(applyOffer.tenure)||12});
            setLoanRef(r.reference_no||`LN-${Math.floor(Math.random()*900000+100000)}`);
            setLoanDone(true);
          }catch(e){
            alert(lang==="en"?`Application failed: ${e.data?.error||e.message}`:`আবেদন ব্যর্থ: ${e.data?.error||e.message}`);
          }
          setLoanLoading(false);
        }} disabled={!loanName.trim()||!loanPhone.trim()||loanLoading} style={{flex:2,padding:"12px",borderRadius:12,background:loanName.trim()&&loanPhone.trim()&&!loanLoading?C.p:"#ccc",border:"none",color:"#fff",fontSize:14,fontWeight:700,cursor:loanName.trim()&&loanPhone.trim()&&!loanLoading?"pointer":"default",fontFamily:"'Hind Siliguri',sans-serif"}}>
          {loanLoading?(lang==="en"?"Submitting...":"জমা হচ্ছে..."):(lang==="en"?"Submit Application":"আবেদন জমা দিন")}
        </button>
      </div>
    </div>
  );

  if(loanDone) return (
    <div style={{textAlign:"center",padding:"24px 0"}}>
      <div style={{fontSize:56,marginBottom:12}}>🎉</div>
      <div style={{fontSize:18,fontWeight:700,color:"#065F46",marginBottom:8}}>{lang==="en"?"Application Submitted!":"আবেদন জমা হয়েছে!"}</div>
      <div style={{fontSize:13,color:C.muted,marginBottom:20}}>{lang==="en"?"We will review and contact you within 2–3 business days.":"আমরা ২–৩ কার্যদিবসের মধ্যে আপনার সাথে যোগাযোগ করব।"}</div>
      <div style={{background:"rgba(16,185,129,.12)",borderRadius:12,padding:"14px 18px",marginBottom:20,display:"inline-block",border:"1px solid rgba(16,185,129,.3)"}}>
        <div style={{fontSize:12,color:"#065F46",fontWeight:700,marginBottom:4}}>{lang==="en"?"Application ID":"আবেদন আইডি"}</div>
        <div style={{fontSize:18,fontWeight:800,color:"#00C170",fontFamily:"monospace"}}>{loanRef}</div>
      </div>
      <br/>
      <button onClick={()=>{setLoanDone(false);setApplyOffer(null);}} style={{padding:"11px 28px",borderRadius:12,background:C.p,border:"none",color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>{lang==="en"?"Close":"বন্ধ করুন"}</button>
    </div>
  );

  return (
    <div>
      <div style={{background:`linear-gradient(135deg,${C.dark},${C.p}99)`,borderRadius:18,padding:20,marginBottom:14}}>
        <div style={{fontSize:11,color:"rgba(255,255,255,.6)",fontWeight:600,letterSpacing:1,textTransform:"uppercase",marginBottom:7}}>💹 {tr.loanTitle}</div>
        <div className="row" style={{alignItems:"flex-end",gap:8,marginBottom:10}}>
          <div style={{fontSize:52,fontWeight:800,color:"#fff",fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1}}>{score}</div>
          <div style={{fontSize:17,color:"rgba(255,255,255,.5)",paddingBottom:5}}>/100</div>
        </div>
        <PBar v={score} col="#fff"/>
        <div style={{fontSize:13,color:"rgba(255,255,255,.8)",marginTop:8}}>{msg}</div>
      </div>
      <div style={{
        background:C.card,borderRadius:13,padding:14,marginBottom:14,
        border:`1px solid ${C.bdr}`,
        boxShadow:`0 3px 12px rgba(0,0,0,.04),inset 0 1px 0 rgba(255,255,255,.35)`
      }}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>{tr.scoreAnalysis}</div>
        {[["📋",95],["💳",88],["⭐",92],["📱",78],["🏆",70]].map(([ic,s],i)=>{
          const labels={en:["Service History","Payment Regularity","Customer Rating","Activity","Years of Experience"],bn:["সেবার ইতিহাস","পেমেন্ট নিয়মিততা","গ্রাহক রেটিং","সক্রিয়তা","অভিজ্ঞতার বছর"]};
          return (
            <div key={i} style={{marginBottom:10}}>
              <div className="row" style={{justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:12}}>{ic} {labels[lang][i]}</span><span style={{fontSize:12,fontWeight:700,color:s>=80?C.p:s>=60?"#F59E0B":"#EF4444"}}>{s}%</span></div>
              <PBar v={s} col={s>=80?C.p:s>=60?"#F59E0B":"#EF4444"}/>
            </div>
          );
        })}
      </div>
      <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>{tr.availOffers}</div>
      {OFFERS.map((o,i)=>(
        <div key={i} style={{
          background:o.best?`${C.p}06`:C.card,
          borderRadius:14,padding:15,marginBottom:10,
          border:`${o.best?"2px":"1px"} solid ${o.best?C.p:C.bdr}`,
          boxShadow:o.best?`0 6px 20px ${C.p}25,inset 0 1px 0 rgba(255,255,255,.3)`:"0 2px 8px rgba(0,0,0,.04)"
        }}>
          {o.best&&<div style={{fontSize:10,fontWeight:700,color:C.p,letterSpacing:1,marginBottom:5}}>{tr.bestOfferL}</div>}
          <div className="row" style={{justifyContent:"space-between"}}>
            <div>
              <div style={{fontSize:19,fontWeight:700}}>{o.amt}</div>
              <div style={{fontSize:12,color:C.muted,marginTop:2}}>{o.rate} {tr.interestL} · {o.tenure} {tr.min==="মিনিট"?"মাস":"months"}</div>
              <span className="badge" style={{background:C.plt,color:C.p,marginTop:6,fontSize:10}}>{o.badge}</span>
            </div>
            <button onClick={()=>setApplyOffer(o)} className="btn" style={{padding:"10px 15px",background:o.best?`linear-gradient(135deg,${C.p},${C.pdk})`:"#fff",border:`1.5px solid ${o.best?"transparent":C.bdr}`,borderRadius:11,color:o.best?"#fff":C.p,fontSize:13,fontWeight:700,fontFamily:"'Hind Siliguri',sans-serif"}}>{tr.applyBtn}</button>
          </div>
        </div>
      ))}
    </div>
  );
}
