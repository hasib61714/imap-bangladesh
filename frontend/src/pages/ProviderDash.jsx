import { useState } from "react";
import { useC, useTr, useLiveData } from "../contexts";
import { C_DARK } from "../constants/theme";
import { T } from "../constants/translations";
import { PROVIDERS } from "../constants/data";
import { Av, MiniBar } from "../components/ui";
import { toUiProv } from "../utils/helpers";
import LoanScore from "./LoanScore";

export default function ProviderDash() {
  const C=useC();
  const dark=C===C_DARK;
  const tr=useTr();
  const lang=tr===T.en?"en":"bn";
  const [tab,setTab]=useState("overview");
  const { providers: ctxProviders } = useLiveData();
  const p=toUiProv(ctxProviders[0]||PROVIDERS[0]);
  const JOBS=[
    {t:lang==="en"?"Electrical Repair":"ইলেকট্রিক মেরামত",loc:lang==="en"?"Mirpur 10":"মিরপুর ১০",price:"৳৪৫০",time:lang==="en"?"5 min ago":"৫ মি আগে",urgent:true},
    {t:lang==="en"?"Fan Connection":"পাখার সংযোগ",loc:lang==="en"?"Gulshan 2":"গুলশান ২",price:"৳২৫০",time:lang==="en"?"12 min ago":"১২ মি আগে",urgent:false},
    {t:lang==="en"?"Meter Box Fix":"মিটার বক্স ঠিক",loc:lang==="en"?"Dhanmondi":"ধানমন্ডি",price:"৳৬০০",time:lang==="en"?"30 min ago":"৩০ মি আগে",urgent:false},
  ];
  const name=lang==="en"?p.nameEn:p.name;
  const svc=lang==="en"?p.svcEn:p.svc;
  const loc=lang==="en"?p.locEn:p.loc;
  return (
    <div>
      <div style={{background:`linear-gradient(135deg,${C.dark},#0F3326)`,borderRadius:18,padding:20,marginBottom:16}}>
        <div className="row" style={{gap:14,marginBottom:16}}>
          <Av av={p.av} col={p.col} size={58} fs={20} rad={16}/>
          <div style={{flex:1}}>
            <div style={{fontSize:17,fontWeight:700,color:"#fff"}}>{name}</div>
            <div style={{fontSize:13,color:"rgba(255,255,255,.6)"}}>{svc} · {loc}</div>
            <div className="row" style={{gap:6,marginTop:5}}>
              <span className="badge" style={{background:"rgba(255,255,255,.15)",color:"#fff",fontSize:10}}>✓ {lang==="en"?"Verified":"যাচাইকৃত"}</span>
              <span className="badge" style={{background:"rgba(245,166,35,.3)",color:"#FCD34D",fontSize:10}}>★ {p.r}</span>
            </div>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(80px,1fr))",gap:10}}>
          {[["৳৪৮,৫০০",tr.thisMonth],["৮৪৭",tr.totalJobsM],["৯৮%",tr.successRate]].map(([v,l],i)=>(
            <div key={i} style={{textAlign:"center",background:"rgba(255,255,255,.08)",borderRadius:11,padding:10}}>
              <div style={{fontSize:16,fontWeight:700,color:"#fff"}}>{v}</div>
              <div style={{fontSize:10,color:"rgba(255,255,255,.55)"}}>{l}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="row" style={{gap:7,marginBottom:16}}>
        {[[" overview",tr.dOverview],["jobs",tr.dJobs],["earnings",tr.dEarnings],["loan",tr.dLoan]].map(([id,l])=>(
          <button key={id} className="btn" onClick={()=>setTab(id.trim())} style={{flex:1,padding:"9px 4px",borderRadius:11,border:`1.5px solid ${tab===id.trim()?C.p:C.bdr}`,background:tab===id.trim()?C.p:"#fff",color:tab===id.trim()?"#fff":C.sub,fontSize:11,fontWeight:600}}>{l}</button>
        ))}
      </div>
      {tab==="overview"&&<div>
        <div className="g2" style={{marginBottom:14}}>
          {[{ic:"📊",l:tr.perfScore,v:`${p.score}/100`,col:C.p},{ic:"⏱️",l:tr.avgResp,v:`8 ${tr.min}`,col:"#3B82F6"},{ic:"📋",l:tr.todayJobs,v:"3",col:"#F59E0B"},{ic:"💹",l:tr.loanScoreL||"Loan Score",v:`${p.loanScore}/100`,col:"#8B5CF6"}].map((item,i)=>(
            <div key={i} style={{
              background:C.card,borderRadius:13,padding:14,
              border:`1px solid ${C.bdr}`,
              boxShadow:`0 3px 12px rgba(0,0,0,.04),inset 0 1px 0 rgba(255,255,255,.4)`
            }}>
              <div style={{fontSize:20,marginBottom:5}}>{item.ic}</div>
              <div style={{fontSize:16,fontWeight:700,color:item.col}}>{item.v}</div>
              <div style={{fontSize:11,color:C.muted}}>{item.l}</div>
            </div>
          ))}
        </div>
        <div style={{
          background:C.card,borderRadius:13,padding:14,
          border:`1px solid ${C.bdr}`,
          boxShadow:`0 3px 12px rgba(0,0,0,.04),inset 0 1px 0 rgba(255,255,255,.4)`
        }}>
          <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
            {(lang==="en"?["⚡ Electrical Expert","🌟 Top Rated","⏰ On Time","🔒 Trusted"]:["⚡ বিদ্যুৎ বিশেষজ্ঞ","🌟 সেরা রেটিং","⏰ সময়মতো","🔒 বিশ্বস্ত"]).map(b=>(
              <span key={b} className="badge" style={{background:C.plt,color:C.p,fontSize:11,padding:"5px 11px"}}>{b}</span>
            ))}
          </div>
        </div>
      </div>}
      {tab==="jobs"&&<div>
        {JOBS.map((j,i)=>(
          <div key={i} className="card" style={{padding:14,marginBottom:10}}>
            <div className="row" style={{justifyContent:"space-between"}}>
              <div>
                <div className="row" style={{gap:7}}>
                  <div style={{fontSize:14,fontWeight:700}}>{j.t}</div>
                  {j.urgent&&<span className="badge" style={{background:"rgba(239,68,68,.12)",color:"#B91C1C",fontSize:10}}>{tr.urgent}</span>}
                </div>
                <div style={{fontSize:12,color:C.muted,marginTop:3}}>📍 {j.loc} · {j.time}</div>
              </div>
              <div style={{fontSize:16,fontWeight:700,color:C.p}}>{j.price}</div>
            </div>
            <div className="row" style={{gap:8,marginTop:11}}>
              <button className="btn btn-g" style={{flex:1,padding:"9px",fontSize:12}}>{tr.acceptBtn}</button>
              <button className="btn btn-gh" style={{flex:1,border:`1px solid ${C.bdr}`,fontSize:12}}>{tr.rejectBtn}</button>
            </div>
          </div>
        ))}
      </div>}
      {tab==="earnings"&&<div>
        <div style={{
          background:C.card,borderRadius:13,padding:16,marginBottom:14,
          border:`1px solid ${C.bdr}`,
          boxShadow:`0 3px 12px rgba(0,0,0,.04),inset 0 1px 0 rgba(255,255,255,.35)`
        }}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:14}}>{tr.weeklyEarnings}</div>
          <MiniBar data={p.earnings} tr={tr}/>
        </div>
        <div style={{
          background:C.card,borderRadius:13,padding:14,
          border:`1px solid ${C.bdr}`,
          boxShadow:`0 3px 12px rgba(0,0,0,.04),inset 0 1px 0 rgba(255,255,255,.35)`
        }}>
          {[[tr.thisWeek,"৳১১,৪০০"],[tr.thisMonth,"৳৪৮,৫০০"],[tr.totalEarnings,"৳২,৯৬,৪৫০"]].map(([l,v],i)=>(
            <div key={i} className="row" style={{justifyContent:"space-between",padding:"10px 0",borderBottom:i<2?`1px solid ${C.bdr}`:"none"}}><span style={{fontSize:13,color:C.muted}}>{l}</span><span style={{fontSize:14,fontWeight:700,color:C.p}}>{v}</span></div>
          ))}
        </div>
      </div>}
      {tab==="loan"&&<LoanScore/>}
    </div>
  );
}
