import { useState, useEffect } from "react";
import { useC, useTr, useLiveData } from "../contexts";
import { T } from "../constants/translations";
import { users as usersApi } from "../api";

export default function CustomerProfilePage({onNavigate, user, onAvatarUpdate}) {
  const C=useC();
  const tr=useTr();
  const lang=tr===T.en?"en":"bn";
  const { balance: ctxBalance, bookings: ctxBookings } = useLiveData();
  const u=user||{name:"অতিথি",email:"guest@example.com",role:"customer",kycStatus:"pending",points:320};
  const kycColor={verified:"#00C170",pending:"#F59E0B",rejected:"#EF4444"};
  const kycLabel=lang==="bn"?{verified:"✅ যাচাইকৃত",pending:"⏳ অপেক্ষায়",rejected:"❌ প্রত্যাখ্যাত"}:{verified:"✅ Verified",pending:"⏳ Pending",rejected:"❌ Rejected"};
  const statusBg={completed:["#D1FAE5","#065F46"],cancelled:["#FEE2E2","#B91C1C"],pending:["#FEF9C3","#7C5800"]};
  const statusLabel=lang==="bn"?{completed:"সম্পন্ন",cancelled:"বাতিল",pending:"অপেক্ষায়"}:{completed:"Completed",cancelled:"Cancelled",pending:"Pending"};

  const [referralCount,setReferralCount]=useState(0);

  // Derive recent bookings from live context — no extra API call
  const recentBookings = ctxBookings.slice(0,3).map(b=>({
    id:b.id||"—",
    service:lang==="bn"?(b.service_name_bn||b.service_name_en||"সেবা"):(b.service_name_en||b.service_name_bn||"Service"),
    provider:b.provider_name||(lang==="bn"?"প্রদানকারী":"Provider"),
    date:b.scheduled_time?(new Date(b.scheduled_time).toLocaleDateString(lang==="bn"?"bn-BD":"en-GB")):(b.scheduled_at?new Date(b.scheduled_at).toLocaleDateString(lang==="bn"?"bn-BD":"en-GB"):(b.date||"—")),
    status:b.status||"pending",
  }));
  const totalBookings = ctxBookings.length;

  useEffect(()=>{
    usersApi.getReferral().then(d=>{
      setReferralCount(d.friends?.length||d.referrals?.length||d.count||0);
    }).catch(()=>{});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  const stats=[
    {v:totalBookings||"—",label:lang==="bn"?"মোট বুকিং":"Total Bookings",icon:"📋"},
    {v:u.points||0,label:lang==="bn"?"লয়্যালটি পয়েন্ট":"Loyalty Points",icon:"🏅"},
    {v:referralCount,label:lang==="bn"?"রেফারেল":"Referrals",icon:"👥"},
    {v:`৳${ctxBalance.toLocaleString()}`,label:lang==="bn"?"ওয়ালেট":"Wallet",icon:"💰"},
  ];
  const quickActions=[
    {icon:"📋",label:lang==="bn"?"বুকিং":"Bookings",page:"bookings"},
    {icon:"💰",label:lang==="bn"?"ওয়ালেট":"Wallet",page:"wallet"},
    {icon:"🎁",label:lang==="bn"?"প্রোমো":"Promos",page:"promos"},
    {icon:"🏅",label:lang==="bn"?"পয়েন্ট":"Points",page:"loyalty"},
    {icon:"👥",label:lang==="bn"?"রেফারেল":"Referral",page:"referral"},
    {icon:"⚙️",label:lang==="bn"?"সেটিংস":"Settings",page:"settings"},
  ];
  return (
    <div style={{paddingBottom:80}}>
      {/* Hero card */}
      <div style={{background:`linear-gradient(135deg,${C.p},${C.pdk})`,padding:"36px 20px 28px",textAlign:"center",color:"#fff",position:"relative",backgroundAttachment:"local"}}>
        <label style={{cursor:"pointer",display:"inline-block",marginBottom:12}}>
          <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{
            const f=e.target.files[0]; if(!f) return;
            const r=new FileReader(); r.onload=async ev=>{
              const b64=ev.target.result;
              const saved=JSON.parse(localStorage.getItem("imap_user")||"null");
              if(saved){
                const updated={...saved,avatar:b64};
                localStorage.setItem("imap_user",JSON.stringify(updated));
                if(onAvatarUpdate) onAvatarUpdate(updated);
              }
              // Persist to backend silently
              try{ await usersApi.updateAvatar(b64); }catch{}
              // force re-render by updating a shadow element
              const el=document.getElementById("cprofile-av");
              if(el){el.src=b64;el.style.display="block";el.previousSibling&&(el.previousSibling.style.display="none");}
            }; r.readAsDataURL(f);
          }}/>
          <div style={{width:80,height:80,borderRadius:"50%",background:"rgba(255,255,255,.25)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:38,margin:"0 auto",border:"3px solid rgba(255,255,255,.5)",fontWeight:900,overflow:"hidden",position:"relative"}}>
            {(u.avatar&&u.avatar.startsWith("data:"))
              ?<img src={u.avatar} id="cprofile-av" style={{width:"100%",height:"100%",objectFit:"cover"}} alt="avatar"/>
              :<><span>{(u.name||"?")[0].toUpperCase()}</span><img id="cprofile-av" style={{display:"none",position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}} alt="avatar"/></>
            }
            <div style={{position:"absolute",bottom:0,right:0,width:24,height:24,borderRadius:"50%",background:C.p,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,border:"2px solid rgba(255,255,255,.8)"}}>📷</div>
          </div>
        </label>
        <div style={{fontWeight:800,fontSize:20,marginBottom:4}}>{u.name||"অতিথি"}</div>
        <div style={{fontSize:13,opacity:.85,marginBottom:10}}>{u.email||""}</div>
        <span style={{background:"rgba(255,255,255,.25)",borderRadius:20,padding:"4px 14px",fontSize:12,fontWeight:700}}>
          {lang==="bn"?"সেবাগ্রহণকারী":"Customer"}
        </span>
        <div style={{position:"absolute",top:14,right:16}}>
          <span style={{background:kycColor[u.kycStatus||"pending"]+"33",color:kycColor[u.kycStatus||"pending"],borderRadius:20,padding:"4px 12px",fontSize:11,fontWeight:700,border:`1px solid ${kycColor[u.kycStatus||"pending"]}55`}}>
            {kycLabel[u.kycStatus||"pending"]}
          </span>
        </div>
      </div>

      <div style={{padding:"0 16px",maxWidth:600,margin:"0 auto"}}>
        {/* Stats row */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(80px,1fr))",gap:8,margin:"18px 0"}}>
          {stats.map((s,i)=>(
            <div key={i} style={{background:C.card,border:`1px solid ${C.bdr}`,borderRadius:14,padding:"12px 6px",textAlign:"center"}}>
              <div style={{fontSize:20,marginBottom:4}}>{s.icon}</div>
              <div style={{fontWeight:800,fontSize:15,color:C.p}}>{s.v}</div>
              <div style={{fontSize:10,color:C.muted,fontWeight:600,lineHeight:1.3}}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Quick actions */}
        <div style={{background:C.card,border:`1px solid ${C.bdr}`,borderRadius:16,padding:16,marginBottom:18}}>
          <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>⚡ {lang==="bn"?"দ্রুত অ্যাকশন":"Quick Actions"}</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(82px,1fr))",gap:8}}>
            {quickActions.map((a,i)=>(
              <button key={i} onClick={()=>onNavigate&&onNavigate(a.page)} style={{background:C.bg,border:`1px solid ${C.bdr}`,borderRadius:12,padding:"12px 6px",cursor:"pointer",textAlign:"center",fontFamily:"inherit",transition:"all .15s"}} onMouseEnter={e=>e.currentTarget.style.background=C.plt} onMouseLeave={e=>e.currentTarget.style.background=C.bg}>
                <div style={{fontSize:22,marginBottom:4}}>{a.icon}</div>
                <div style={{fontSize:11,fontWeight:700,color:C.sub}}>{a.label}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Recent bookings */}
        <div style={{background:C.card,border:`1px solid ${C.bdr}`,borderRadius:16,padding:16,marginBottom:18}}>
          <div style={{fontWeight:700,fontSize:14,marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span>📋 {lang==="bn"?"সাম্প্রতিক বুকিং":"Recent Bookings"}</span>
            <span onClick={()=>onNavigate&&onNavigate("bookings")} style={{fontSize:12,color:C.p,cursor:"pointer",fontWeight:600}}>{lang==="bn"?"সব দেখুন →":"View all →"}</span>
          </div>
          {recentBookings.map(b=>(
            <div key={b.id} style={{borderBottom:`1px solid ${C.bdr}`,paddingBottom:10,marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div>
                <div style={{fontWeight:700,fontSize:13}}>{b.service}</div>
                <div style={{fontSize:11,color:C.muted}}>{b.provider} · {b.date}</div>
              </div>
              <span style={{background:(statusBg[b.status]||statusBg.pending)[0],color:(statusBg[b.status]||statusBg.pending)[1],borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:700,flexShrink:0}}>{statusLabel[b.status]||statusLabel.pending}</span>
            </div>
          ))}
        </div>

        {/* KYC nudge if pending */}
        {(u.kycStatus||"pending")==="pending"&&(
          <div style={{background:"rgba(245,158,11,.1)",border:"1px solid rgba(245,158,11,.35)",borderRadius:14,padding:16,marginBottom:18,display:"flex",gap:12,alignItems:"center"}}>
            <div style={{fontSize:28}}>🛡️</div>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:13,color:"#7C5800",marginBottom:3}}>{lang==="bn"?"KYC যাচাই বাকি আছে":"KYC Verification Pending"}</div>
              <div style={{fontSize:12,color:"#92400E"}}>{lang==="bn"?"পূর্ণ সেবা পেতে আপনার পরিচয় যাচাই করুন":"Verify your identity to unlock all services"}</div>
            </div>
            <button onClick={()=>onNavigate&&onNavigate("_kyc")} style={{padding:"8px 14px",background:"#F59E0B",color:"#fff",border:"none",borderRadius:9,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:700,flexShrink:0}}>{lang==="bn"?"যাচাই করুন":"Verify"}</button>
          </div>
        )}
      </div>
    </div>
  );
}
