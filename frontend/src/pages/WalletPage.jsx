import { useContext, useState, useEffect } from "react";
import { useC, useTr, LangCtx, useLiveData } from "../contexts";
import { T } from "../constants/translations";
import { TRANSACTIONS, TOPUP_AMOUNTS, TOPUP_METHODS } from "../constants/data";
import { escHtml } from "../utils/helpers";
import { users as usersApi, payments as paymentsApi } from "../api";

export default function WalletPage() {
  const C=useC(); const tr=useTr(); const lang=useContext(LangCtx)===T.en?"en":"bn";
  const { balance: ctxBalance, setBalance: setCtxBalance } = useLiveData();
  const [tab,setTab]=useState("history"); // history | topup
  const [filter,setFilter]=useState("all");
  const [selAmt,setSelAmt]=useState(500);
  const [custAmt,setCustAmt]=useState("");
  const [selMethod,setSelMethod]=useState("bkash");
  const [success,setSuccess]=useState(false);
  const [balance,setBalance]=useState(ctxBalance);
  const [topping,setTopping]=useState(false);
  const [apiTxns,setApiTxns]=useState(null); // null = not loaded yet

  // Load real transactions from API
  useEffect(()=>{
    usersApi.getWallet().then(data=>{
      if(data.balance!=null){ setBalance(data.balance); setCtxBalance(data.balance); }
      if(Array.isArray(data.transactions)){
        setApiTxns(data.transactions.map(t=>({
          id: t.id?`TXN-${String(t.id).slice(0,8).toUpperCase()}`:("TXN-"+Math.random().toString(36).slice(2,8).toUpperCase()),
          icon: t.type==="topup"?"💳":t.type==="credit"||t.type==="refund"?"🔄":"💸",
          type: t.type==="debit"?"payment":t.type==="topup"?"topup":"refund",
          titleBn: t.description_bn||t.description||"লেনদেন",
          titleEn: t.description_en||t.description||"Transaction",
          provider: "",
          amount: t.type==="debit"?-Math.abs(parseFloat(t.amount||0)):+Math.abs(parseFloat(t.amount||0)),
          method: t.method||"Wallet",
          date: t.created_at?new Date(t.created_at).toLocaleDateString("bn-BD"):"সম্প্রতি",
          dateEn: t.created_at?new Date(t.created_at).toLocaleDateString("en-GB"):"Recent",
          status:"success",
        })));
      }
    }).catch(()=>{});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // Keep local balance in sync when context changes (API load)
  useEffect(()=>{ setBalance(ctxBalance); },[ctxBalance]);

  const displayTxns=apiTxns!=null?apiTxns:TRANSACTIONS;
  const income=displayTxns.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0);
  const spent=Math.abs(displayTxns.filter(t=>t.amount<0).reduce((s,t)=>s+t.amount,0));

  const filtered=filter==="all"?displayTxns:displayTxns.filter(t=>t.type===filter);

  const finalAmt=custAmt?parseInt(custAmt)||0:selAmt;

  const doTopUp=async()=>{
    if(!finalAmt||finalAmt<10||topping) return;
    setTopping(true);
    try {
      const d=await paymentsApi.initiateTopup(finalAmt,selMethod);
      if(d.url){
        // Real gateway — redirect (user returns with ?payment=success)
        window.location.href=d.url;
        return;
      }
      // Mock/dev mode — top-up credited immediately, refresh wallet
      const walletData=await usersApi.getWallet();
      if(walletData.balance!==undefined){ setBalance(walletData.balance); setCtxBalance(walletData.balance); }
      if(Array.isArray(walletData.transactions)){
        setApiTxns(walletData.transactions.map(t=>({
          id: t.id?`TXN-${String(t.id).slice(0,8).toUpperCase()}`:"TXN-"+Math.random().toString(36).slice(2,8).toUpperCase(),
          icon: t.type==="topup"?"💳":t.type==="credit"||t.type==="refund"?"🔄":"💸",
          type: t.type==="debit"?"payment":t.type==="topup"?"topup":"refund",
          titleBn: t.description_bn||t.description||"লেনদেন",
          titleEn: t.description_en||t.description||"Transaction",
          provider: "",
          amount: t.type==="debit"?-Math.abs(parseFloat(t.amount||0)):+Math.abs(parseFloat(t.amount||0)),
          method: t.method||"Wallet",
          date: t.created_at?new Date(t.created_at).toLocaleDateString("bn-BD"):"সম্প্রতি",
          dateEn: t.created_at?new Date(t.created_at).toLocaleDateString("en-GB"):"Recent",
          status:"success",
        })));
      }
      setSuccess(true); setTimeout(()=>setSuccess(false),3500);
    } catch(e){ console.warn("topup:",e); alert(lang==="en"?"Top-up failed. Please try again.":"টপ-আপ ব্যর্থ হয়েছে। আবার চেষ্টা করুন।"); }
    finally{ setTopping(false); }
  };

  const txColor=t=>t.amount>0?"#006A4E":"#DC2626";
  const txSign=t=>t.amount>0?"+":"";

  const printReceipt=t=>{
    const w=window.open("","_blank","width=480,height=620");
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>IMAP Receipt</title>
    <style>body{font-family:'Segoe UI',sans-serif;background:#f8fafc;margin:0;padding:20px}
    .card{background:#fff;border-radius:14px;padding:28px;max-width:400px;margin:0 auto;box-shadow:0 2px 12px rgba(0,0,0,.08)}
    .header{text-align:center;border-bottom:2px dashed #E5E7EB;padding-bottom:18px;margin-bottom:18px}
    .logo{font-size:32px;margin-bottom:6px}.title{font-size:18px;font-weight:800;color:#006A4E}
    .sub{font-size:12px;color:#9CA3AF;margin-top:3px}.badge{display:inline-block;background:#D1FAE5;color:#065F46;padding:4px 12px;border-radius:99px;font-size:11px;font-weight:700;margin-top:8px}
    .row{display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid #F3F4F6}
    .row label{font-size:12px;color:#6B7280}.row span{font-size:13px;font-weight:700;color:#111}
    .amount{text-align:center;padding:18px 0}.amount .val{font-size:32px;font-weight:800;color:${txColor(t)}}
    .footer{text-align:center;margin-top:18px;font-size:11px;color:#9CA3AF}
    @media print{body{background:#fff;padding:0}}</style></head>
    <body onload="window.print()"><div class="card">
    <div class="header"><div class="logo">🧾</div><div class="title">IMAP Receipt</div>
    <div class="sub">পেমেন্ট রসিদ</div><div class="badge">✓ ${lang==="en"?"Successful":"সফল"}</div></div>
    <div class="amount"><div class="val">${txSign(t)}৳${Math.abs(t.amount)}</div></div>
    <div class="row"><label>Transaction ID</label><span style="font-family:monospace">${escHtml(t.id)}</span></div>
    <div class="row"><label>${lang==="en"?"Service":"সেবা"}</label><span>${escHtml(lang==="en"?t.titleEn:t.titleBn)}</span></div>
    <div class="row"><label>${lang==="en"?"Method":"মাধ্যম"}</label><span>${escHtml(t.method)}</span></div>
    <div class="row"><label>${lang==="en"?"Date":"তারিখ"}</label><span>${escHtml(lang==="en"?t.dateEn:t.date)}</span></div>
    <div class="row"><label>${lang==="en"?"Type":"ধরন"}</label><span>${escHtml(t.type)}</span></div>
    <div class="footer">IMAP Platform · imap.com.bd<br>This is a computer-generated receipt.</div>
    </div></body></html>`);
    w.document.close();
  };

  return (
    <div>
      {/* Balance card */}
      <div style={{background:"linear-gradient(135deg,#006A4E,#004D38)",borderRadius:18,padding:"22px 20px",marginBottom:20,color:"#fff",position:"relative",overflow:"hidden"}}>
        <div style={{fontSize:13,opacity:.85,marginBottom:4}}>{tr.wlBalance}</div>
        <div style={{fontSize:34,fontWeight:800,letterSpacing:-1,marginBottom:16}}>৳{balance.toLocaleString()}</div>
        <div style={{display:"flex",gap:24,marginBottom:18}}>
          {[[tr.wlIncome,"⬆️",income],[tr.wlSpent,"⬇️",spent]].map(([lbl,ic,amt])=>(
            <div key={lbl}>
              <div style={{fontSize:11,opacity:.8}}>{ic} {lbl}</div>
              <div style={{fontSize:16,fontWeight:700}}>৳{amt.toLocaleString()}</div>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:10}}>
          {[[tr.wlTopUp,"topup"],[tr.wlWithdraw,"history"]].map(([lbl,t])=>(
            <button key={lbl} onClick={()=>setTab(t)}
              style={{padding:"8px 18px",borderRadius:10,background:tab===t?"#fff":"rgba(255,255,255,.2)",border:"1.5px solid rgba(255,255,255,.4)",color:tab===t?"#004D38":"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif",transition:"all .15s"}}>
              {lbl}
            </button>
          ))}
        </div>
        <div style={{position:"absolute",right:-20,top:-20,width:100,height:100,borderRadius:"50%",background:"rgba(255,255,255,.08)"}}/>
        <div style={{position:"absolute",right:40,bottom:-30,width:70,height:70,borderRadius:"50%",background:"rgba(255,255,255,.06)"}}/>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:8,marginBottom:20,background:C.card,borderRadius:14,padding:5,border:`1px solid ${C.bdr}`}}>
        {[["history",tr.wlHistory,"📋"],["topup",tr.wlTopUp,"➕"]].map(([id,lbl,ic])=>(
          <button key={id} onClick={()=>setTab(id)} style={{flex:1,padding:"9px",borderRadius:10,border:"none",background:tab===id?C.p:"transparent",color:tab===id?"#fff":C.sub,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif",transition:"all .15s"}}>{ic} {lbl}</button>
        ))}
      </div>

      {/* HISTORY TAB */}
      {tab==="history"&&(
        <div>
          {/* Filter chips */}
          <div className="sx" style={{display:"flex",gap:8,marginBottom:16,paddingBottom:2}}>
            {[["all",tr.wlAll],["payment",tr.wlPay],["refund",tr.wlRefund],["topup",tr.wlTopUpL]].map(([f,lbl])=>(
              <button key={f} onClick={()=>setFilter(f)}
                style={{flexShrink:0,padding:"6px 14px",borderRadius:20,border:`1.5px solid ${filter===f?C.p:C.bdr}`,background:filter===f?C.p:C.card,color:filter===f?"#fff":C.sub,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>
                {lbl}
              </button>
            ))}
          </div>

          {/* Transaction list */}
          <div style={{display:"flex",flexDirection:"column",gap:2}}>
            {filtered.map((t,i)=>(
              <div key={t.id} className="fu" style={{animationDelay:`${i*.04}s`,display:"flex",alignItems:"center",gap:14,padding:"13px 16px",background:C.card,borderRadius:i===0?"14px 14px 6px 6px":i===filtered.length-1?"6px 6px 14px 14px":"6px",marginBottom:2,border:`1px solid ${C.bdr}`}}>
                <div style={{width:40,height:40,borderRadius:11,background:t.type==="refund"?"#D1FAE5":t.type==="topup"?"#EFF6FF":C.plt,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{t.icon}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{lang==="en"?t.titleEn:t.titleBn}</div>
                  <div style={{fontSize:11,color:C.muted,marginTop:2}}>{t.id} · {t.method} · {lang==="en"?t.dateEn:t.date}</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontSize:15,fontWeight:800,color:txColor(t)}}>{txSign(t)}৳{Math.abs(t.amount)}</div>
                  <div style={{display:"flex",alignItems:"center",gap:6,justifyContent:"flex-end",marginTop:4}}>
                    <div style={{fontSize:10,color:"#006A4E"}}>✓ {lang==="en"?"Success":"সফল"}</div>
                    <button onClick={()=>printReceipt(t)} title={lang==="en"?"Download Receipt":"রসিদ ডাউনলোড"}
                      style={{background:"none",border:"none",cursor:"pointer",fontSize:13,padding:0,color:C.p,lineHeight:1}}>📄</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TOPUP TAB */}
      {tab==="topup"&&(
        <div style={{background:C.card,borderRadius:16,padding:20,border:`1px solid ${C.bdr}`}}>
          {success&&(
            <div style={{background:"rgba(16,185,129,.12)",borderRadius:12,padding:"12px 16px",marginBottom:16,fontSize:14,color:"#065F46",fontWeight:700,textAlign:"center",border:"1px solid rgba(16,185,129,.25)"}}>{tr.wlSuccess} +৳{finalAmt}</div>
          )}
          {/* Amount presets */}
          <div style={{fontSize:13,fontWeight:700,color:C.sub,marginBottom:10}}>{lang==="en"?"Select Amount":"পরিমাণ বেছুন"}</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(90px,1fr))",gap:9,marginBottom:12}}>
            {TOPUP_AMOUNTS.map(a=>(
              <button key={a} onClick={()=>{setSelAmt(a);setCustAmt("");}}
                style={{padding:"10px",borderRadius:10,border:`2px solid ${selAmt===a&&!custAmt?C.p:C.bdr}`,background:selAmt===a&&!custAmt?C.plt:C.bg,color:selAmt===a&&!custAmt?C.p:C.text,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif",transition:"all .15s"}}>
                ৳{a.toLocaleString()}
              </button>
            ))}
          </div>
          {/* Custom amount */}
          <input value={custAmt} onChange={e=>setCustAmt(e.target.value.replace(/\D/g,""))}
            placeholder={lang==="en"?"Custom amount (min ৳10)":"নিজে লিখুন (সর্বনিম্ন ৳১০)"}
            style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1.5px solid ${custAmt?C.p:C.bdr}`,background:C.bg,color:C.text,fontSize:13,fontFamily:"'Hind Siliguri',sans-serif",marginBottom:16,boxSizing:"border-box"}}/>

          {/* Payment method */}
          <div style={{fontSize:13,fontWeight:700,color:C.sub,marginBottom:10}}>{lang==="en"?"Pay Via":"পেমেন্ট মাধ্যম"}</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(72px,1fr))",gap:8,marginBottom:20}}>
            {TOPUP_METHODS.map(m=>(
              <button key={m.id} onClick={()=>setSelMethod(m.id)}
                style={{padding:"10px 6px",borderRadius:12,border:`2px solid ${selMethod===m.id?C.p:C.bdr}`,background:selMethod===m.id?C.plt:C.card,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:5,fontFamily:"'Hind Siliguri',sans-serif",transition:"all .15s"}}>
                <span style={{fontSize:20}}>{m.icon}</span>
                <span style={{fontSize:11,fontWeight:700,color:selMethod===m.id?C.p:C.sub}}>{m.label}</span>
              </button>
            ))}
          </div>

          {/* Total & confirm */}
          <div style={{background:C.plt,borderRadius:12,padding:"12px 16px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:13,color:C.sub}}>{lang==="en"?"Total to add":"মোট যোগ হবে"}</span>
            <span style={{fontSize:18,fontWeight:800,color:C.p}}>৳{(finalAmt||0).toLocaleString()}</span>
          </div>

          <button onClick={doTopUp} disabled={!finalAmt||finalAmt<10||topping}
            style={{width:"100%",padding:"14px",borderRadius:14,background:(finalAmt>=10&&!topping)?C.p:"#ccc",border:"none",color:"#fff",fontSize:15,fontWeight:700,cursor:(finalAmt>=10&&!topping)?"pointer":"default",fontFamily:"'Hind Siliguri',sans-serif"}}>
            {topping?"⏳ প্রক্রিয়া হচ্ছে...":`➕ ${tr.wlTopUp} via ${TOPUP_METHODS.find(m=>m.id===selMethod)?.label}`}
          </button>
        </div>
      )}
    </div>
  );
}
