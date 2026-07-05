import { useContext } from "react";
import { useC, LangCtx } from "../contexts";
import { T } from "../constants/translations";
import { escHtml } from "../utils/helpers";

export default function GuaranteeModal({booking,onClose}){
  const C=useC();
  const lang=useContext(LangCtx)===T.en?"en":"bn";
  const svc=lang==="en"?booking.svcEn||booking.svc:booking.svc;
  const provider=lang==="en"?booking.providerEn||booking.provider:booking.provider;
  const date=lang==="en"?booking.dateEn||booking.date:booking.date;
  const printGuarantee=()=>{
    const w=window.open("","_blank","width=520,height=680");
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>IMAP Guarantee</title>
    <style>body{font-family:'Segoe UI',sans-serif;background:#f0fdf4;margin:0;padding:24px}
    .cert{background:#fff;border-radius:16px;padding:32px;max-width:440px;margin:0 auto;border:3px solid #00C170}
    .header{text-align:center;margin-bottom:24px}.logo{font-size:40px;margin-bottom:8px}
    .title{font-size:20px;font-weight:800;color:#065F46}.sub{font-size:13px;color:#6B7280;margin-top:4px}
    .seal{display:inline-block;background:#00C170;color:#fff;padding:6px 18px;border-radius:99px;font-size:12px;font-weight:700;margin:12px 0}
    .field{background:#F0FDF4;border-radius:10px;padding:12px 16px;margin:8px 0}
    .field label{font-size:11px;color:#6B7280;display:block;margin-bottom:4px}
    .field span{font-size:14px;font-weight:700;color:#064E3B}
    .footer{text-align:center;margin-top:20px;font-size:11px;color:#9CA3AF}
    @media print{body{background:#fff;padding:0}}</style></head>
    <body onload="window.print()"><div class="cert">
    <div class="header"><div class="logo">🛡️</div>
    <div class="title">IMAP Service Guarantee</div>
    <div class="sub">সার্ভিস গ্যারান্টি সার্টিফিকেট</div>
    <div class="seal">✅ VERIFIED & GUARANTEED</div></div>
    <div class="field"><label>Service / সেবা</label><span>${escHtml(svc)}</span></div>
    <div class="field"><label>Provider / প্রদানকারী</label><span>${escHtml(provider)||"IMAP Provider"}</span></div>
    <div class="field"><label>Date / তারিখ</label><span>${escHtml(date)}</span></div>
    <div class="field"><label>Booking ID</label><span style="font-family:monospace">${escHtml(booking.id||booking.booking_ref||"-")}</span></div>
    <div class="field"><label>Amount / পরিমাণ</label><span>${escHtml(booking.price)}</span></div>
    <div class="field"><label>Guarantee</label><span>৭ দিনের সন্তুষ্টি গ্যারান্টি · 7-day satisfaction guarantee</span></div>
    <div class="footer">Issued by IMAP Platform · imap.com.bd</div>
    </div></body></html>`);
    w.document.close();
  };
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div style={{
        background:C.card,borderRadius:20,padding:22,
        maxWidth:420,width:"100%",
        boxShadow:`0 24px 64px rgba(0,0,0,.25),0 0 0 1px ${C.p}11`,
        border:`1px solid ${C.bdr}`
      }} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:16,fontWeight:700}}>🛡️ {lang==="en"?"Service Guarantee":"সার্ভিস গ্যারান্টি"}</div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#9CA3AF"}}>✕</button>
        </div>
        <div style={{background:"linear-gradient(135deg,#D1FAE5,#A7F3D0)",borderRadius:14,padding:18,marginBottom:16,border:"2px solid #00C170",textAlign:"center"}}>
          <div style={{fontSize:36,marginBottom:8}}>🛡️</div>
          <div style={{fontSize:16,fontWeight:800,color:"#065F46",marginBottom:4}}>{lang==="en"?"7-Day Satisfaction Guarantee":"৭ দিনের সন্তুষ্টি গ্যারান্টি"}</div>
          <div style={{fontSize:12,color:"#047857"}}>{lang==="en"?"Not satisfied? We'll fix it or refund — no questions asked.":"সন্তুষ্ট না হলে বিনামূল্যে সমাধান বা সম্পূর্ণ রিফান্ড।"}</div>
        </div>
        {[[lang==="en"?"Service":"সেবা",svc],[lang==="en"?"Provider":"প্রদানকারী",provider||"IMAP Provider"],[lang==="en"?"Date":"তারিখ",date],[lang==="en"?"Booking ID":"বুকিং আইডি",booking.id||"-"],[lang==="en"?"Amount":"পরিমাণ",booking.price]].map(([k,v])=>(
          <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:`1px solid ${C.bdr}`}}>
            <span style={{fontSize:13,color:C.muted}}>{k}</span>
            <span style={{fontSize:13,fontWeight:700,color:C.text}}>{v}</span>
          </div>
        ))}
        <div style={{display:"flex",gap:10,marginTop:16}}>
          <button onClick={printGuarantee} style={{flex:1,padding:"12px",borderRadius:12,background:"linear-gradient(135deg,#00C170,#004D38)",border:"none",color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>📄 {lang==="en"?"Download PDF":"PDF ডাউনলোড"}</button>
          <button onClick={onClose} style={{padding:"12px 16px",borderRadius:12,background:C.bg,border:`1px solid ${C.bdr}`,color:C.text,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>✕</button>
        </div>
      </div>
    </div>
  );
}
