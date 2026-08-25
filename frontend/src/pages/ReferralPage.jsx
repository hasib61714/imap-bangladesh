import { useContext, useState, useEffect } from "react";
import { useC, useTr, LangCtx, useUser } from "../contexts";
import { T } from "../constants/translations";
import { RF_FRIENDS, RF_STEPS } from "../constants/data";
import { users as usersApi } from "../api";

export default function ReferralPage(){
  const C=useC();const tr=useTr();const lang=useContext(LangCtx)===T.en?"en":"bn";
  const {user:authUser}=useUser();
  const [copied,setCopied]=useState(false);
  const [rfData,setRfData]=useState({referral_code:authUser?.referral_code||null, friends:RF_FRIENDS});

  useEffect(()=>{
    usersApi.getReferral()
      .then(d=>{ if(d) setRfData(prev=>({...prev,...d,friends:d.friends?.length?d.friends:prev.friends})); })
      .catch(()=>{});
  },[]);

  const refCode=rfData.referral_code||authUser?.referral_code||"IMAP-????";
  const friends=rfData.friends||RF_FRIENDS;
  const totalEarned=friends.reduce((s,f)=>s+f.earned,0);

  const doShare=()=>{
    navigator.share?.({title:"IMAP Referral",text:`Join IMAP with my code ${refCode} and get ৳150 bonus!`,url:"https://imap.app/?ref="+refCode}).catch(()=>{});
  };

  const doCopy=()=>{
    navigator.clipboard?.writeText(refCode).catch(()=>{});
    setCopied(true); setTimeout(()=>setCopied(false),2000);
  };

  return(
    <div>
      {/* Ref code card */}
      <div style={{background:"linear-gradient(135deg,#006A4E,#004D38)",borderRadius:18,padding:"22px 20px",marginBottom:20,color:"#fff",textAlign:"center",position:"relative",overflow:"hidden"}}>
        <div style={{fontSize:13,opacity:.85,marginBottom:8}}>{tr.rfCode}</div>
        <div style={{fontSize:26,fontWeight:900,letterSpacing:4,fontFamily:"monospace",background:"rgba(255,255,255,.15)",padding:"10px 20px",borderRadius:12,marginBottom:16,display:"inline-block"}}>{refCode}</div>
        <div style={{display:"flex",gap:10,justifyContent:"center"}}>
          <button onClick={doCopy} style={{padding:"10px 20px",borderRadius:10,background:"rgba(255,255,255,.2)",border:"1.5px solid rgba(255,255,255,.4)",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>
            {copied?tr.rfCopied:"📋 Copy"}
          </button>
          <button onClick={doShare} style={{
            padding:"10px 20px",borderRadius:10,
            background:"rgba(255,255,255,.18)",border:"1.5px solid rgba(255,255,255,.4)",
            backdropFilter:"blur(2px)",WebkitBackdropFilter:"blur(2px)",
            color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif",
            boxShadow:"0 4px 14px rgba(0,0,0,.15)"
          }}>
            📲 {tr.rfShare}
          </button>
        </div>
        <div style={{position:"absolute",right:-20,top:-20,width:80,height:80,borderRadius:"50%",background:"rgba(255,255,255,.08)"}}/>
      </div>
      {/* Stats */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(90px,1fr))",gap:12,marginBottom:20}}>
        {[[friends.length,tr.rfFriends,"👥"],[totalEarned,"৳ "+tr.rfEarned,"💰"],[friends.filter(f=>f.status==="pending").length,tr.rfPending,"⏳"]].map(([val,lbl,ic])=>(
          <div key={lbl} style={{background:C.card,borderRadius:14,padding:"14px 10px",border:`1px solid ${C.bdr}`,textAlign:"center"}}>
            <div style={{fontSize:20}}>{ic}</div>
            <div style={{fontSize:20,fontWeight:800,color:C.p,letterSpacing:-1}}>{val}{lbl==="৳ "+tr.rfEarned?"":""}</div>
            <div style={{fontSize:11,color:C.sub}}>{lbl}</div>
          </div>
        ))}
      </div>
      {/* How it works */}
      <div style={{background:C.card,borderRadius:16,padding:"16px",border:`1px solid ${C.bdr}`,marginBottom:16}}>
        <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:14}}>{tr.rfHow}</div>
        {RF_STEPS.map((s,i)=>(
          <div key={i} style={{display:"flex",gap:12,marginBottom:i<RF_STEPS.length-1?16:0}}>
            <div style={{width:36,height:36,borderRadius:10,background:C.plt,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{s.icon}</div>
            <div>
              <div style={{fontSize:13,color:C.text,fontWeight:600}}>{lang==="en"?s.en:s.bn}</div>
              {i===2&&<div style={{fontSize:12,color:C.p,fontWeight:800,marginTop:3}}>+৳150 {tr.rfBonus}</div>}
            </div>
          </div>
        ))}
      </div>
      {/* Friends list */}
      <div style={{background:C.card,borderRadius:16,padding:"4px 0",border:`1px solid ${C.bdr}`}}>
        <div style={{fontSize:13,fontWeight:700,color:C.text,padding:"12px 16px 8px"}}>{tr.rfFriends}</div>
        {friends.map((f,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 16px",borderTop:`1px solid ${C.bdr}`}}>
            <div style={{width:36,height:36,borderRadius:"50%",background:"linear-gradient(135deg,#006A4E,#004D38)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,color:"#fff",flexShrink:0}}>{f.name[0]}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:600,color:C.text}}>{f.nameEn||f.name}</div>
              <div style={{fontSize:11,color:C.muted}}>{f.date}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:11,fontWeight:700,background:f.status==="active"?"#D1FAE5":"#FEF3C7",color:f.status==="active"?"#065F46":"#92400E",padding:"2px 8px",borderRadius:6}}>{f.status}</div>
              {f.earned>0&&<div style={{fontSize:12,fontWeight:700,color:"#006A4E",marginTop:3}}>+৳{f.earned}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
