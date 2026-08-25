import { useContext, useState, useEffect } from "react";
import { useC, useTr, LangCtx, useUser } from "../contexts";
import { T } from "../constants/translations";
import { LEVELS, LOYALTY_REWARDS } from "../constants/data";
import { users as usersApi } from "../api";

export default function LoyaltyPage(){
  const C=useC();const tr=useTr();const lang=useContext(LangCtx)===T.en?"en":"bn";
  const {user:authUser,setUser}=useUser();
  const [tab,setTab]=useState("points");
  const [redeemedCode,setRedeemedCode]=useState(null);
  const [redeemingCode,setRedeemingCode]=useState(null);
  const [points,setPoints]=useState(authUser?.points||0);
  const [history,setHistory]=useState([]);

  useEffect(()=>{
    usersApi.getLoyalty()
      .then(d=>{ if(d?.points!=null) setPoints(d.points); if(d?.history) setHistory(d.history); })
      .catch(()=>{});
  },[]);

  const level=LEVELS.find(l=>points>=l.min&&points<l.max)||LEVELS[3];
  const nextLevel=LEVELS[LEVELS.indexOf(level)+1];
  const prog=nextLevel?Math.round(((points-level.min)/(nextLevel.min-level.min))*100):100;

  return(
    <div>
      {/* Points card */}
      <div style={{background:`linear-gradient(135deg,${level.color}22,${level.color}44)`,borderRadius:18,padding:"22px 20px",marginBottom:20,border:`2px solid ${level.color}55`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontSize:13,color:C.sub,marginBottom:4}}>{tr.lyTitle}</div>
            <div style={{fontSize:38,fontWeight:900,color:C.text,letterSpacing:-1}}>{points.toLocaleString()}</div>
            <div style={{fontSize:12,color:C.sub,marginTop:2}}>{tr.lyPoints}</div>
          </div>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:32}}>{level.icon}</div>
            <div style={{fontSize:12,fontWeight:800,color:level.color}}>{lang==="en"?level.name:level.nameBn}</div>
          </div>
        </div>
        {nextLevel&&<div style={{marginTop:14}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
            <span style={{fontSize:11,color:C.sub}}>{lang==="en"?(nextLevel.min-points)+" pts to "+nextLevel.name:nextLevel.nameBn+" এর জন্য আরও "+(nextLevel.min-points)}</span>
            <span style={{fontSize:11,fontWeight:700,color:level.color}}>{prog}%</span>
          </div>
          <div style={{height:8,borderRadius:4,background:C.bdr,overflow:"hidden"}}>
            <div style={{height:"100%",width:`${prog}%`,background:level.color,borderRadius:4,transition:"width .5s"}}/>
          </div>
        </div>}
      </div>
      {/* Tabs */}
      <div style={{display:"flex",gap:8,marginBottom:16,background:C.card,borderRadius:14,padding:5,border:`1px solid ${C.bdr}`}}>
        {[["points","🎯 "+tr.lyEarn+"/"+tr.lyRedeem],["history","📋 "+tr.lyHistory]].map(([id,lbl])=>(
          <button key={id} onClick={()=>setTab(id)} style={{flex:1,padding:"9px",borderRadius:10,border:"none",background:tab===id?C.p:"transparent",color:tab===id?"#fff":C.sub,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>{lbl}</button>
        ))}
      </div>
      {tab==="points"&&(
        <div>
          <div style={{background:C.plt,borderRadius:12,padding:"12px 16px",marginBottom:16,fontSize:13,color:C.sub}}>
            💡 {lang==="en"?"Earn 10 points per ৳100 spent":"প্রতি ৳১০০ খরচে ১০ পয়েন্ট অর্জন করুন"} • {tr.lyPerBook}: 10 pts
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {LOYALTY_REWARDS.map(r=>{
              const canRedeem=points>=r.pts;
              const isRedeemed=redeemedCode===r.code;
              return(
                <div key={r.pts} style={{background:C.card,borderRadius:14,padding:"14px 16px",border:`1.5px solid ${canRedeem?C.p:C.bdr}`,display:"flex",alignItems:"center",gap:14}}>
                  <div style={{fontSize:28}}>{r.icon}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:700,color:C.text}}>{lang==="en"?r.titleEn:r.titleBn}</div>
                    <div style={{fontSize:11,color:canRedeem?"#006A4E":"#DC2626",fontWeight:700,marginTop:3}}>{r.pts} {tr.lyPoints} {canRedeem?(`✅ ${lang==="en"?"available":"পাওয়া যাচ্ছে"}`):(`— ${r.pts-points} ${lang==="en"?"more needed":"আরও দরকার"}`)}</div>
                  </div>
                  <button onClick={async()=>{
                    if(!canRedeem||isRedeemed||redeemingCode)return;
                    setRedeemingCode(r.code);
                    try{
                      const res=await usersApi.redeemPoints(r.pts,r.code);
                      if(res?.points!=null){ setPoints(res.points); setUser({...authUser,points:res.points}); }
                    }catch{ setPoints(p=>p-r.pts<0?0:p-r.pts); setUser({...authUser,points:Math.max(0,(authUser?.points||0)-r.pts)}); }
                    setRedeemedCode(r.code);
                    setRedeemingCode(null);
                  }} disabled={!canRedeem||isRedeemed||redeemingCode!=null}
                    style={{padding:"8px 14px",borderRadius:9,background:isRedeemed?"#D1FAE5":redeemingCode===r.code?"#9ca3af":canRedeem?C.p:C.bdr,border:"none",color:isRedeemed?"#065F46":canRedeem?"#fff":"#9CA3AF",fontSize:12,fontWeight:700,cursor:canRedeem&&!isRedeemed&&!redeemingCode?"pointer":"default",fontFamily:"'Hind Siliguri',sans-serif"}}>
                    {isRedeemed?tr.lyRedeemed.split("!")[0]+"!":redeemingCode===r.code?"⏳...":tr.lyRedeem}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {tab==="history"&&(
        <div style={{background:C.card,borderRadius:16,padding:"4px 0",border:`1px solid ${C.bdr}`}}>
          {history.length===0&&(
            <div style={{textAlign:"center",padding:"30px 20px",color:C.muted,fontSize:13}}>
              {lang==="en"?"No history yet — earn points by booking services!":"এখনো কোনো ইতিহাস নেই — সেবা বুক করে পয়েন্ট অর্জন করুন!"}
            </div>
          )}
          {history.map((h,i)=>(
            <div key={h.id||i} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderBottom:i<history.length-1?`1px solid ${C.bdr}`:"none"}}>
              <div style={{width:36,height:36,borderRadius:10,background:C.plt,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17}}>{h.points>0?"🎯":"🎁"}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:600,color:C.text}}>{lang==="en"?h.reason_en:h.reason_bn}</div>
                <div style={{fontSize:11,color:C.muted}}>{new Date(h.created_at).toLocaleDateString("bn-BD")}</div>
              </div>
              <div style={{fontSize:14,fontWeight:800,color:h.points>0?"#006A4E":"#DC2626"}}>{h.points>0?"+":""}{h.points}</div>
            </div>
          ))}
          {history.length===0&&<div/>}
        </div>
      )}
    </div>
  );
}
