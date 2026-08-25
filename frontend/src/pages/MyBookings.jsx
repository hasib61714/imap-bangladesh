import { useContext, useState } from "react";
import { useC, useTr, LangCtx, useLiveData } from "../contexts";
import { T } from "../constants/translations";
import { PROVIDERS } from "../constants/data";
import { PBar } from "../components/ui";
import { escHtml } from "../utils/helpers";
import { bookings as bookingsApi } from "../api";
import DisputeModal from "./DisputeModal";
import GuaranteeModal from "./GuaranteeModal";

export default function MyBookings({onRate,onBook,onPay,onRefresh}) {
  const C=useC();
  const tr=useTr();
  const lang=useContext(LangCtx)===T.en?"en":"bn";
  const [filter,setFilter]=useState("all");
  const [dispute,setDispute]=useState(null);
  const [guarantee,setGuarantee]=useState(null);
  const [cancelledIds,setCancelledIds]=useState(()=>new Set());
  const [cancellingId,setCancellingId]=useState(null);
  const { bookings: ctxBookings, providers: ctxProviders } = useLiveData();

  // Normalize API booking fields to the shape the UI expects
  const toUiBk = b=>({
    ...b,
    rawId:      b.id,
    id:         b.booking_ref || b.id,
    svc:        b.service_name_bn || b.service_type || b.svc || "",
    svcEn:      b.service_name_en || b.service_type || b.svcEn || "",
    provider:   b.provider_name || b.provider || "",
    providerEn: b.provider_name || b.providerEn || "",
    status:     b.status==="completed"?"সম্পন্ন":b.status==="cancelled"?"বাতিল":(b.status||"চলমান"),
    statusEn:   b.status==="completed"?"Completed":b.status==="cancelled"?"Cancelled":(b.statusEn||"Ongoing"),
    date:       (b.scheduled_time||b.scheduled_at)?new Date(b.scheduled_time||b.scheduled_at).toLocaleDateString("bn-BD"):(b.date||""),
    dateEn:     (b.scheduled_time||b.scheduled_at)?new Date(b.scheduled_time||b.scheduled_at).toLocaleDateString("en-GB"):(b.dateEn||""),
    price:      (b.amount||b.total_amount)?`৳${b.amount||b.total_amount}`:(b.price||""),
    icon:       b.icon||"📋",
    pid:        b.provider_id||b.pid,
  });
  const bookingsData = ctxBookings.map(toUiBk);

  const STATUS_DISPLAY={completed:{bn:"সম্পন্ন",en:"Completed",bg:"#D1FAE5",col:"#065F46"},ongoing:{bn:"চলমান",en:"Ongoing",bg:"#DBEAFE",col:"#1D4ED8"},cancelled:{bn:"বাতিল",en:"Cancelled",bg:"#FEE2E2",col:"#B91C1C"}};
  const getStatus=b=>{if(cancelledIds.has(b.rawId))return"cancelled";if(b.status==="সম্পন্ন"||b.status==="completed"||b.statusEn==="Completed")return"completed";if(b.status==="বাতিল"||b.status==="cancelled"||b.statusEn==="Cancelled")return"cancelled";return"ongoing";};
  const cancelBooking=async(rawId)=>{
    if(cancellingId) return;
    setCancellingId(rawId);
    try{
      await bookingsApi.updateStatus(rawId,"cancelled");
      setCancelledIds(prev=>{const n=new Set(prev);n.add(rawId);return n;});
      onRefresh?.();
    }catch(e){alert(lang==="en"?"Cancel failed: "+(e.data?.error||e.message):"বাতিল ব্যর্থ: "+(e.data?.error||e.message));}
    finally{setCancellingId(null);}
  };
  const list=filter==="all"?bookingsData:bookingsData.filter(b=>getStatus(b)===filter);
  // Find provider for rate/rebook (try context providers first, fall back to static)
  const findProvider = pid => ctxProviders.find(p=>p.id===pid)||PROVIDERS.find(p=>p.id===pid);

  const printReceipt=(b)=>{
    const w=window.open("","_blank","width=480,height=620");
    const sv=lang==="en"?b.svcEn||b.svc:b.svc;
    const pr=lang==="en"?b.providerEn||b.provider:b.provider;
    const dt=lang==="en"?b.dateEn||b.date:b.date;
    w.document.write("<!DOCTYPE html><html><head><meta charset='UTF-8'><title>Receipt</title>"+
      "<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;background:#f8fafc;padding:20px}"+
      ".rc{background:#fff;border-radius:12px;padding:28px;max-width:420px;margin:0 auto;border:1px solid #e2e8f0}"+
      ".logo{text-align:center;font-size:36px}.brand{text-align:center;font-weight:800;font-size:18px;color:#1e293b}"+
      ".tag{text-align:center;font-size:11px;color:#64748b;margin-bottom:16px}"+
      ".dv{border:none;border-top:2px dashed #e2e8f0;margin:12px 0}"+
      ".title{text-align:center;font-size:15px;font-weight:700;color:#0f172a;margin-bottom:12px}"+
      ".ab{background:#f0fdf4;border-radius:10px;padding:14px;text-align:center;margin:14px 0}"+
      ".av{font-size:26px;font-weight:900;color:#004D38}.al{font-size:11px;color:#00C170;margin-top:2px}"+
      ".st{display:inline-block;background:#dcfce7;color:#004D38;padding:3px 12px;border-radius:99px;font-size:11px;font-weight:700;margin-top:4px}"+
      ".rw{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f1f5f9}"+
      ".lbl{font-size:12px;color:#64748b}.val{font-size:13px;font-weight:600;color:#0f172a;text-align:right}"+
      ".ft{text-align:center;font-size:10px;color:#94a3b8;margin-top:16px}"+
      "@media print{body{background:#fff;padding:0}}</style></head>"+
      "<body onload='window.print()'><div class='rc'>"+
      "<div class='logo'>\uD83E\uDDFE</div>"+
      "<div class='brand'>IMAP Bangladesh</div>"+
      "<div class='tag'>Payment Receipt &middot; \u09AA\u09C7\u09AE\u09C7\u09A8\u09CD\u099F \u09B0\u09B8\u09BF\u09A6</div>"+
      "<hr class='dv'/><div class='title'>&#x2705; Payment Successful</div>"+
      "<div class='ab'><div class='av'>"+escHtml(b.price)+"</div>"+
      "<div class='al'>Amount Paid &middot; \u09AA\u09CD\u09B0\u09A6\u09A4\u09CD\u09A4 \u09AA\u09B0\u09BF\u09AE\u09BE\u09A3</div>"+
      "<div class='st'>PAID</div></div><hr class='dv'/>"+
      "<div class='rw'><span class='lbl'>Receipt No</span><span class='val' style='font-family:monospace'>"+escHtml((b.id||b.booking_ref)||"\u2014")+"</span></div>"+
      "<div class='rw'><span class='lbl'>Service &middot; \u09B8\u09C7\u09AC\u09BE</span><span class='val'>"+escHtml(sv||"\u2014")+"</span></div>"+
      "<div class='rw'><span class='lbl'>Provider</span><span class='val'>"+(escHtml(pr)||"IMAP Provider")+"</span></div>"+
      "<div class='rw'><span class='lbl'>Date &middot; \u09A4\u09BE\u09B0\u09BF\u0996</span><span class='val'>"+escHtml(dt||"\u2014")+"</span></div>"+
      "<div class='rw'><span class='lbl'>Payment Method</span><span class='val'>SSLCommerz / MFS</span></div>"+
      "<div class='rw'><span class='lbl'>Status</span><span class='val' style='color:#006A4E'>Completed &#x2713;</span></div>"+
      "<hr class='dv'/><div class='ft'>IMAP Platform &middot; imap.com.bd<br/>This is an official payment receipt.</div>"+
      "</div></body></html>");
    w.document.close();
  };

  const printInvoice=(b)=>{
    const w=window.open("","_blank","width=560,height=760");
    const sv=lang==="en"?b.svcEn||b.svc:b.svc;
    const pr=lang==="en"?b.providerEn||b.provider:b.provider;
    const dt=lang==="en"?b.dateEn||b.date:b.date;
    const raw=parseFloat((b.price||"").toString().replace(/[^0-9.]/g,""))||0;
    const vat=parseFloat((raw*0.15).toFixed(2));
    const sub=parseFloat((raw-vat).toFixed(2));
    const now=new Date().toLocaleDateString("en-GB");
    const invNo="INV-"+((b.id||b.booking_ref||"0000").slice(-8).toUpperCase());
    w.document.write("<!DOCTYPE html><html><head><meta charset='UTF-8'><title>Invoice</title>"+
      "<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;background:#f8fafc;padding:20px}"+
      ".inv{background:#fff;border-radius:12px;padding:32px;max-width:500px;margin:0 auto;border:1px solid #e2e8f0}"+
      ".hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px}"+
      ".bn{font-size:22px;font-weight:900;color:#1e293b}.bs{font-size:11px;color:#64748b;margin-top:2px}"+
      ".ir{text-align:right}.it{font-size:20px;font-weight:900;color:#3b82f6;letter-spacing:1px}"+
      ".in{font-size:12px;color:#64748b;font-family:monospace;margin-top:4px}"+
      ".pt2{display:grid;grid-template-columns:1fr 1fr;gap:16px;background:#f8fafc;border-radius:10px;padding:16px;margin-bottom:20px}"+
      ".ptl{font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:6px}"+
      ".ptn{font-size:14px;font-weight:700;color:#0f172a}.pti{font-size:11px;color:#64748b;margin-top:2px}"+
      "table{width:100%;border-collapse:collapse;margin-bottom:16px}"+
      "th{background:#f8fafc;padding:10px 12px;font-size:11px;font-weight:700;color:#64748b;text-align:left;border-bottom:2px solid #e2e8f0}"+
      "td{padding:10px 12px;font-size:13px;border-bottom:1px solid #f1f5f9}"+
      ".tots{margin-left:auto;width:220px}"+
      ".tr2{display:flex;justify-content:space-between;padding:6px 0;font-size:13px;border-bottom:1px solid #f1f5f9}"+
      ".trt{border-bottom:none!important;font-weight:900;font-size:15px;color:#004D38;padding-top:10px!important;margin-top:4px}"+
      ".ft{text-align:center;font-size:10px;color:#94a3b8;margin-top:20px;border-top:1px solid #f1f5f9;padding-top:12px}"+
      "@media print{body{background:#fff;padding:0}}</style></head>"+
      "<body onload='window.print()'><div class='inv'>"+
      "<div class='hdr'><div><div class='bn'>&#x1F3F7;&#xFE0F; IMAP</div><div class='bs'>Bangladesh Home Services</div></div>"+
      "<div class='ir'><div class='it'>INVOICE</div><div class='in'>"+escHtml(invNo)+"</div>"+
      "<div style='font-size:11px;color:#64748b;margin-top:2px'>Date: "+now+"</div></div></div>"+
      "<div class='pt2'>"+
      "<div><div class='ptl'>Billed To &middot; \u09AC\u09BF\u09B2 \u09AA\u09CD\u09B0\u09BE\u09AA\u0995</div><div class='ptn'>Customer</div><div class='pti'>IMAP Platform User</div></div>"+
      "<div><div class='ptl'>Service Provider</div><div class='ptn'>"+(escHtml(pr)||"IMAP Provider")+"</div><div class='pti'>IMAP Verified Professional</div></div></div>"+
      "<table><thead><tr><th>Description</th><th>Date</th><th style='text-align:right'>Amount</th></tr></thead>"+
      "<tbody><tr><td>"+escHtml(sv||"Home Service")+"</td><td>"+escHtml(dt||"\u2014")+"</td><td style='text-align:right;font-weight:700'>\u09F3"+sub.toLocaleString()+"</td></tr></tbody></table>"+
      "<div class='tots'>"+
      "<div class='tr2'><span>Subtotal</span><span>\u09F3"+sub.toLocaleString()+"</span></div>"+
      "<div class='tr2'><span>VAT (15%)</span><span>\u09F3"+vat.toLocaleString()+"</span></div>"+
      "<div class='tr2 trt'><span>Total</span><span>\u09F3"+raw.toLocaleString()+"</span></div></div>"+
      "<div class='ft'>Ref: "+escHtml((b.id||b.booking_ref)||"\u2014")+" &middot; Thank you for using IMAP &middot; imap.com.bd</div>"+
      "</div></body></html>");
    w.document.close();
  };

  const FILTERS=[["all",tr.all],["ongoing",tr.ongoing],["completed",tr.completed],["cancelled",tr.cancelled]];
  return (
    <div>
      <div className="row" style={{justifyContent:"space-between",marginBottom:20,flexWrap:"wrap",gap:10}}>
        <div style={{fontSize:18,fontWeight:700}}>📋 {tr.mbTitle}</div>
        <div className="row" style={{gap:7}}>
          {FILTERS.map(([f,l])=>(
            <button key={f} className="btn" onClick={()=>setFilter(f)} style={{padding:"6px 12px",borderRadius:99,border:`1.5px solid ${filter===f?C.p:C.bdr}`,background:filter===f?C.p:"#fff",color:filter===f?"#fff":C.sub,fontSize:12,fontWeight:600}}>{l}</button>
          ))}
        </div>
      </div>
      {list.map((b,i)=>{
        const st=getStatus(b);
        const S=STATUS_DISPLAY[st];
        const svc=lang==="en"?b.svcEn:b.svc;
        const provider=lang==="en"?b.providerEn:b.provider;
        const date=lang==="en"?b.dateEn:b.date;
        return (
          <div key={i} className="card" style={{padding:16,marginBottom:11,animation:`fadeUp .4s ease ${i*.06}s both`}}>
            <div className="row" style={{justifyContent:"space-between",marginBottom:st==="ongoing"?10:0}}>
              <div className="row" style={{gap:11}}>
                <div className="jc" style={{width:44,height:44,borderRadius:12,background:C.bg,fontSize:22,flexShrink:0}}>{b.icon}</div>
                <div>
                  <div style={{fontSize:14,fontWeight:700}}>{svc}</div>
                  <div style={{fontSize:12,color:C.muted}}>{provider}</div>
                  <div style={{fontSize:11,color:C.muted,marginTop:2}}>{date} · {b.id}</div>
                </div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:15,fontWeight:700,color:C.p}}>{b.price}</div>
                <span className="badge" style={{background:S.bg,color:S.col,marginTop:4,display:"inline-flex"}}>{S[lang]||S.en}</span>
              </div>
            </div>
            {st==="ongoing"&&(<div><div style={{background:"rgba(59,130,246,.08)",borderRadius:10,padding:10,border:"1px solid rgba(59,130,246,.25)"}}><div style={{fontSize:12,color:"#1D4ED8",fontWeight:600,marginBottom:5}}>🔵 {tr.pComing}</div><PBar v={60} col="#2563EB"/></div>{b.payment_status==="pending"&&onPay&&(<button onClick={()=>onPay(b.id||b.booking_ref)} style={{marginTop:8,width:"100%",padding:"9px",borderRadius:10,border:"none",background:"#6366F1",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>💳 {lang==="bn"?"পেমেন্ট করুন":"Pay Now"}</button>)}<button onClick={()=>{if(window.confirm(lang==="en"?"Cancel this booking? Your wallet will be refunded.":"এই বুকিং বাতিল করবেন? আপনার ওয়ালেটে রিফান্ড হবে।"))cancelBooking(b.rawId||b.id);}} disabled={cancellingId===( b.rawId||b.id)} style={{marginTop:8,width:"100%",padding:"9px",borderRadius:10,border:"1.5px solid rgba(239,68,68,.4)",background:"rgba(239,68,68,.1)",color:"#EF4444",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>❌ {cancellingId===(b.rawId||b.id)?(lang==="bn"?"বাতিল হচ্ছে...":"Cancelling..."):(lang==="bn"?"বুকিং বাতিল করুন":"Cancel Booking")}</button></div>)}
            {st==="completed"&&<div style={{marginTop:10}}>
              <div className="row" style={{gap:8,marginBottom:7}}>
                <button className="btn btn-gh" style={{flex:1,border:`1px solid ${C.bdr}`,fontSize:12}} onClick={()=>onRate(findProvider(b.pid))}>{tr.giveRating}</button>
                <button className="btn btn-g" style={{flex:1,padding:"8px",fontSize:12}} onClick={()=>onBook(findProvider(b.pid))}>{tr.rebookBtn}</button>
              </div>
              <div className="row" style={{gap:8}}>
                <button onClick={()=>setGuarantee(b)} style={{flex:1,padding:"7px",borderRadius:10,border:"1.5px solid rgba(16,185,129,.5)",background:"rgba(16,185,129,.12)",color:"#065F46",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>🛡️ {lang==="en"?"Guarantee":"গ্যারান্টি"}</button>
                <button onClick={()=>setDispute(b)} style={{flex:1,padding:"7px",borderRadius:10,border:"1.5px solid rgba(245,158,11,.5)",background:"rgba(245,158,11,.12)",color:"#92400E",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>⚠️ {lang==="en"?"Dispute":"অভিযোগ"}</button>
              </div>
              <div className="row" style={{gap:8,marginTop:7}}>
                <button onClick={()=>printReceipt(b)} style={{flex:1,padding:"7px",borderRadius:10,border:"1.5px solid rgba(99,102,241,.5)",background:"rgba(99,102,241,.1)",color:"#3730A3",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>🧾 {lang==="en"?"Receipt":"রসিদ"}</button>
                <button onClick={()=>printInvoice(b)} style={{flex:1,padding:"7px",borderRadius:10,border:"1.5px solid rgba(59,130,246,.5)",background:"rgba(59,130,246,.1)",color:"#1D4ED8",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>📄 {lang==="en"?"Invoice":"ইনভয়েস"}</button>
              </div>
            </div>}
            {st==="cancelled"&&<div style={{marginTop:10}}>
              <button onClick={()=>setDispute(b)} style={{width:"100%",padding:"8px",borderRadius:10,border:"1.5px solid rgba(239,68,68,.4)",background:"rgba(239,68,68,.1)",color:"#B91C1C",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>⚠️ {lang==="en"?"File Dispute / Refund":"অভিযোগ / রিফান্ড"}</button>
            </div>}
          </div>
        );
      })}
      {list.length===0&&<div style={{textAlign:"center",padding:"30px 0",color:C.muted,fontSize:14}}>{tr.noBookings}</div>}
      {dispute&&<DisputeModal booking={dispute} onClose={()=>setDispute(null)}/>}
      {guarantee&&<GuaranteeModal booking={guarantee} onClose={()=>setGuarantee(null)}/>}
    </div>
  );
}
