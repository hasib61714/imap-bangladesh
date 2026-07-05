import { useContext, useState, useEffect } from "react";
import { useC, useTr, LangCtx } from "../contexts";
import { T } from "../constants/translations";
import { COUPONS, PROMO_CATS } from "../constants/data";
import { promos as promosApi } from "../api";

export default function PromosPage(){
  const C=useC(); const tr=useTr(); const lang=useContext(LangCtx)===T.en?"en":"bn";
  const [code,setCode]=useState("");
  const [applyResult,setApplyResult]=useState(null); // null | "ok" | "err"
  const [appliedCode,setAppliedCode]=useState(null);
  const [tab,setTab]=useState("offers"); // offers | flash
  const [catFilter,setCatFilter]=useState("all");
  const [copied,setCopied]=useState(null);
  const [coupons,setCoupons]=useState(COUPONS);
  const [applying,setApplying]=useState(false);

  useEffect(()=>{
    promosApi.getAll()
      .then(r=>{ if(r?.coupons?.length) setCoupons(r.coupons); })
      .catch(()=>{});
  },[]);

  const visible=coupons.filter(c=>(tab==="flash"?c.tag==="flash":c.tag!=="flash")&&(catFilter==="all"||c.cat===catFilter||c.cat==="all"));

  const doApply=async()=>{
    if(!code.trim()||applying) return;
    setApplying(true);
    try{
      const r=await promosApi.validate(code);
      if(r?.valid&&r.promo){
        setApplyResult("ok");
        setAppliedCode({...r.promo, descBn:r.promo.titleBn, descEn:r.promo.titleEn});
      } else {
        setApplyResult("err"); setTimeout(()=>setApplyResult(null),2000);
      }
    }catch{
      // fallback to local check
      const found=coupons.find(c=>c.code===code.trim().toUpperCase());
      if(found){setApplyResult("ok");setAppliedCode(found);}
      else{setApplyResult("err");setTimeout(()=>setApplyResult(null),2000);}
    }finally{setApplying(false);}
  };

  const copyCode=c=>{
    navigator.clipboard?.writeText(c.code).catch(()=>{});
    setCopied(c.code);
    setTimeout(()=>setCopied(null),1800);
  };

  const pctBar=c=>Math.round((c.uses/c.limit)*100);

  return(
    <div>
      {/* Coupon apply box */}
      <div style={{background:C.card,borderRadius:16,padding:18,marginBottom:16,border:`1px solid ${C.bdr}`}}>
        <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:10}}>🎟️ {lang==="en"?"Apply Coupon":"\u0995\u09c1\u09aa\u09a8 \u0995\u09cb\u09a1 \u09a6\u09bf\u09a8"}</div>
        {appliedCode&&(
          <div style={{background:"rgba(16,185,129,.12)",borderRadius:12,padding:"12px 16px",marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center",border:"1px solid rgba(16,185,129,.25)"}}>
            <div>
              <div style={{fontSize:13,fontWeight:800,color:"#065F46"}}>{appliedCode.code} — {appliedCode.pct}% {lang==="en"?"off":"ছাড়"}</div>
              <div style={{fontSize:11,color:"#047857"}}>{lang==="en"?`Max save ৳${appliedCode.maxTk}`:`সর্বোচ্চ ৳${appliedCode.maxTk} সাশ্রয়`}</div>
            </div>
            <button onClick={()=>{setAppliedCode(null);setApplyResult(null);setCode("");}} style={{background:"none",border:"none",color:"#DC2626",fontSize:18,cursor:"pointer"}}>✕</button>
          </div>
        )}
        <div style={{display:"flex",gap:8}}>
          <input value={code} onChange={e=>setCode(e.target.value.toUpperCase())}
            placeholder={tr.prCode}
            style={{flex:1,padding:"10px 14px",borderRadius:10,border:`1.5px solid ${applyResult==="err"?"#DC2626":applyResult==="ok"?C.p:C.bdr}`,background:C.bg,color:C.text,fontSize:13,fontFamily:"'Hind Siliguri',sans-serif",textTransform:"uppercase",letterSpacing:2}}
            onKeyDown={e=>e.key==="Enter"&&doApply()}/>
          <button onClick={doApply} disabled={applying} style={{padding:"10px 20px",borderRadius:10,background:applying?"#9ca3af":C.p,border:"none",color:"#fff",fontWeight:700,fontSize:13,cursor:applying?"not-allowed":"pointer",fontFamily:"'Hind Siliguri',sans-serif",whiteSpace:"nowrap"}}>
            {applying?"⏳...": tr.prApply}
          </button>
        </div>
        {applyResult==="err"&&<div style={{fontSize:12,color:"#DC2626",marginTop:6,fontWeight:600}}>{tr.prInvalid}</div>}
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:8,marginBottom:16,background:C.card,borderRadius:14,padding:5,border:`1px solid ${C.bdr}`}}>
        {[["offers",`🏷️ ${tr.prOffers}`],["flash",`⚡ ${tr.prDeals}`]].map(([id,lbl])=>(
          <button key={id} onClick={()=>setTab(id)} style={{flex:1,padding:"9px",borderRadius:10,border:"none",background:tab===id?C.p:"transparent",color:tab===id?"#fff":C.sub,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif",transition:"all .15s"}}>{lbl}</button>
        ))}
      </div>

      {/* Category filter */}
      <div className="sx" style={{display:"flex",gap:8,marginBottom:16,paddingBottom:2}}>
        {PROMO_CATS.map(cat=>(
          <button key={cat} onClick={()=>setCatFilter(cat)} style={{flexShrink:0,padding:"6px 14px",borderRadius:20,border:`1.5px solid ${catFilter===cat?C.p:C.bdr}`,background:catFilter===cat?C.p:C.card,color:catFilter===cat?"#fff":C.sub,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>
            {lang==="en"?cat.charAt(0).toUpperCase()+cat.slice(1):cat==="all"?tr.prAllCats:cat}
          </button>
        ))}
      </div>

      {/* Coupons grid */}
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {visible.length===0&&<div style={{textAlign:"center",padding:"40px 20px",color:C.muted,fontSize:14}}>{lang==="en"?"No offers in this category":"এই বিভাগে কোনো অফার নেই"}</div>}
        {visible.map((c,i)=>{
          const isApplied=appliedCode?.code===c.code;
          return(
          <div key={c.code} className="fu" style={{animationDelay:`${i*.05}s`,background:c.tag==="flash"?"linear-gradient(135deg,#FFF7ED,#FFEDD5)":C.card,borderRadius:16,border:`1.5px dashed ${c.tag==="flash"?"#FB923C":isApplied?C.p:C.bdr}`,padding:"16px 18px",position:"relative",overflow:"hidden"}}>
            {c.tag&&<div style={{position:"absolute",top:10,right:10,background:c.tag==="flash"?"#EA580C":c.tag==="hot"?"#DC2626":"#0369A1",color:"#fff",borderRadius:8,padding:"2px 9px",fontSize:10,fontWeight:800,textTransform:"uppercase"}}>{c.tag}</div>}
            <div style={{display:"flex",alignItems:"flex-start",gap:14}}>
              <div style={{width:50,height:50,borderRadius:12,background:c.tag==="flash"?"#FED7AA":C.plt,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>🎟️</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:20,fontWeight:800,color:C.p,letterSpacing:2,fontFamily:"monospace"}}>{c.code}</div>
                <div style={{fontSize:13,color:C.text,marginTop:2}}>{lang==="en"?c.descEn:c.descBn}</div>
                <div style={{fontSize:11,color:C.muted,marginTop:4}}>{lang==="en"?`Min order ৳${c.minOrder} · Max save ৳${c.maxTk} · Expires ${c.expiry}`:`সর্বনিম্ন ৳${c.minOrder} · সর্বোচ্চ সাশ্রয় ৳${c.maxTk} · মেয়াদ ${c.expiry}`}</div>
                {/* Usage bar */}
                <div style={{marginTop:8}}>
                  <div style={{height:4,borderRadius:3,background:C.bdr,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${pctBar(c)}%`,background:pctBar(c)>80?"#DC2626":C.p,borderRadius:3,transition:"width .4s"}}/>
                  </div>
                  <div style={{fontSize:10,color:C.muted,marginTop:3}}>{lang==="en"?`${c.uses} claimed of ${c.limit}`:`${c.limit} এর মধ্যে ${c.uses} ব্যবহার`}</div>
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:7,flexShrink:0}}>
                <button onClick={()=>copyCode(c)} style={{padding:"7px 12px",borderRadius:9,border:`1.5px solid ${C.bdr}`,background:C.bg,color:C.sub,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>
                  {copied===c.code?tr.prCopied:"📋 Copy"}
                </button>
                <button onClick={()=>{if(!isApplied){setCode(c.code);setAppliedCode(c);setApplyResult("ok");}else{setAppliedCode(null);setApplyResult(null);setCode("");}}}
                  style={{padding:"7px 12px",borderRadius:9,border:`1.5px solid ${isApplied?"#DC2626":C.p}`,background:isApplied?"#FEF2F2":C.plt,color:isApplied?"#DC2626":C.p,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>
                  {isApplied?tr.prApplied:tr.prApply}
                </button>
              </div>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}
