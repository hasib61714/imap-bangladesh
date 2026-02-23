import { useState, useEffect } from "react";
import { C_LIGHT, C_DARK } from "../constants/theme";
import { T } from "../constants/translations";
import { users as usersApi, providers as providersApi, reviews as reviewsApi, bookings as bookingsApi, schedule as scheduleApi, chat as chatApi } from "../api";
import { connectSocket, joinRoom, leaveRoom } from "../socket";

export default function ProviderPortal({user,onLogout,dark,setDark,lang,setLang}){
  const C  = dark ? C_DARK : C_LIGHT;
  const tr = T[lang]||T.bn;
  const [isMobile,setIsMobile]=useState(window.innerWidth<=640);
  useEffect(()=>{
    const onResize=()=>setIsMobile(window.innerWidth<=640);
    window.addEventListener("resize",onResize);
    return ()=>window.removeEventListener("resize",onResize);
  },[]);
  const [tab,setTab]=useState("dash");
  const [available,setAvailable]=useState(true);
  const [toast,setToast]=useState("");
  const [editMode,setEditMode]=useState(false);
  const [avatarB64,setAvatarB64]=useState(()=>{
    const saved=JSON.parse(localStorage.getItem("imap_user")||"null");
    return (saved&&saved.avatar&&saved.avatar.startsWith("data:"))?saved.avatar:"";
  });
  const saveAvatar=async(b64)=>{
    setAvatarB64(b64);
    const u=JSON.parse(localStorage.getItem("imap_user")||"null");
    if(u){localStorage.setItem("imap_user",JSON.stringify({...u,avatar:b64}));}
    try{ await usersApi.updateAvatar(b64); }catch(e){ console.warn("avatar API:",e.message); }
  };
  const [profile,setProfile]=useState({name:user.name,service:lang==="bn"?"ইলেকট্রিশিয়ান":"Electrician",area:lang==="bn"?"ঢাকা":"Dhaka",bio:lang==="bn"?"৫+ বছরের অভিজ্ঞতাসম্পন্ন দক্ষ পেশাদার।":"Skilled professional with 5+ years of experience.",rate:600,phone:user.phone});
  const [withdrawAmt,setWithdrawAmt]=useState("");

  // Hide splash screen on mount
  useEffect(()=>{ if(typeof window.hideSplash==="function") window.hideSplash(); },[]);

  // ── Load data from backend ──
  useEffect(()=>{
    // Jobs
    providersApi.myJobs().then(data=>{
      const list=data.bookings||data||[];
      if(list.length) {
        setJobs(list.map(j=>({
          id:j.id, customer:j.customer_name||j.customer_id,
          service:j.service_notes||j.category_slug||"Service",
          address:j.address||"", time:j.scheduled_time?new Date(j.scheduled_time).toLocaleString():"",
          amount:j.amount||0, status:j.status==="pending"?"incoming":j.status, urgent:false,
        })));
        const activeSessions=list
          .filter(j=>["confirmed","ongoing","active","incoming","pending"].includes(j.status))
          .map(j=>({id:j.id,customer:j.customer_name||j.customer_id||"Customer",job:j.service_notes||j.category_slug||"Service",unread:0}));
        if(activeSessions.length) setChatSessions(activeSessions);
      }
    }).catch(()=>{});
    // Wallet
    usersApi.getWallet().then(data=>{
      if(data.balance!==undefined){
        const txns=data.transactions||[];
        const now=new Date();
        const weekAgo=new Date(now-7*24*60*60*1000);
        const monthAgo=new Date(now.getFullYear(),now.getMonth(),1);
        const credits=txns.filter(t=>t.type==="credit");
        const thisWeek=credits.filter(t=>t.created_at&&new Date(t.created_at)>=weekAgo).reduce((s,t)=>s+parseFloat(t.amount||0),0);
        const thisMonth=credits.filter(t=>t.created_at&&new Date(t.created_at)>=monthAgo).reduce((s,t)=>s+parseFloat(t.amount||0),0);
        const total=credits.reduce((s,t)=>s+parseFloat(t.amount||0),0);
        setEarnings(e=>({...e,
          balance:data.balance,
          thisWeek:Math.round(thisWeek)||e.thisWeek,
          thisMonth:Math.round(thisMonth)||e.thisMonth,
          total:Math.round(total)||e.total,
          history:txns.slice(0,10).map(t=>({date:t.created_at?new Date(t.created_at).toLocaleDateString():"",desc:t.note||t.type,amount:t.type==="credit"?t.amount:-t.amount,type:t.type})),
        }));
      }
    }).catch(()=>{});
    // Notifications
    usersApi.getNotifications().then(data=>{
      const list=data.notifications||data||[];
      if(list.length) setPNotifs(list.slice(0,10).map(n=>({id:n.id,icon:n.icon||"🔔",title:n.title_bn||n.title_en||"Notification",msg:n.body_bn||n.body_en||"",time:n.created_at?new Date(n.created_at).toLocaleDateString():"",read:!!n.is_read})));
    }).catch(()=>{});
    // Reviews
    if(user.id){
      reviewsApi.getByProvider(user.id).then(data=>{
        const list=data.reviews||data||[];
        if(list.length) setReviews(list.map(r=>({id:r.id,customer:r.customer_name||"Customer",rating:r.rating,comment:r.comment||"",service:r.service_notes||"",date:r.created_at?new Date(r.created_at).toLocaleDateString():""})));
      }).catch(()=>{});
    }
    // Schedule
    scheduleApi.get().then(data=>{
      if(data?.slots && Object.keys(data.slots).length) setSchedule(data);
      else setSchedule({slots:{
        "সোমবার":[{id:null,t:"সকাল ৯টা",avail:true},{id:null,t:"দুপুর ১২টা",avail:true},{id:null,t:"বিকাল ৩টা",avail:true}],
        "মঙ্গলবার":[{id:null,t:"সকাল ১০টা",avail:true},{id:null,t:"দুপুর ২টা",avail:true}],
        "বুধবার":[{id:null,t:"সকাল ৯টা",avail:true},{id:null,t:"বিকাল ৪টা",avail:true}],
      }});
    }).catch(()=>{});
    // Provider profile
    providersApi.getMe().then(data=>{
      if(data && data.user_id) setProfile(p=>({
        ...p,
        name:     data.name     || p.name,
        service:  lang==="bn" ? (data.service_type_bn||data.service_type_en||p.service)
                               : (data.service_type_en||data.service_type_bn||p.service),
        area:     lang==="bn" ? (data.area_bn||data.area_en||data.area||p.area)
                               : (data.area_en||data.area_bn||data.area||p.area),
        bio:      lang==="bn" ? (data.bio_bn||data.bio_en||data.bio||p.bio)
                               : (data.bio_en||data.bio_bn||data.bio||p.bio),
        rate:     data.hourly_rate||p.rate,
        phone:    data.phone||p.phone,
      }));
    }).catch(()=>{});
  },[]);

  // ── Real-time chat for active booking ──
  useEffect(()=>{
    if(!activeChatId) return;
    const sock=connectSocket();
    joinRoom(activeChatId);
    setChatLoading(true);
    chatApi.getHistory(activeChatId).then(d=>{
      const msgs=(d.messages||[]).map(m=>({
        from:m.sender_role==="provider"?"provider":"customer",
        text:m.message,
        time:m.created_at?new Date(m.created_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):"",
      }));
      setChatMessages(prev=>({...prev,[activeChatId]:msgs}));
    }).catch(()=>{}).finally(()=>setChatLoading(false));
    const handler=(msg)=>{
      if(msg.booking_id!==activeChatId) return;
      setChatMessages(prev=>({
        ...prev,
        [activeChatId]:[...(prev[activeChatId]||[]),{
          from:msg.sender_role==="provider"?"provider":"customer",
          text:msg.message,
          time:new Date(msg.created_at||Date.now()).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),
        }],
      }));
    };
    sock.on("new_message",handler);
    return ()=>{ leaveRoom(activeChatId); sock.off("new_message",handler); };
  },[activeChatId]);

  const showToast=m=>{setToast(m);setTimeout(()=>setToast(""),2200);};

  const [jobs,setJobs]=useState([]);

  const [earnings,setEarnings]=useState({balance:0,thisWeek:0,thisMonth:0,total:0,history:[]});

  const [schedule,setSchedule]=useState({slots:{}});

  const [reviews,setReviews]=useState([]);
  const avgRating=reviews.length?(reviews.reduce((a,r)=>a+r.rating,0)/reviews.length).toFixed(1):"0.0";
  const ratingDist=[5,4,3,2,1].map(s=>({s,count:reviews.filter(r=>r.rating===s).length}));

  const [chatSessions, setChatSessions]=useState([]);
  const [chatLoading, setChatLoading]=useState(false);
  const [activeChatId,setActiveChatId]=useState(null);
  const [chatMessages,setChatMessages]=useState({});
  const [chatInput,setChatInput]=useState("");

  const [pNotifs,setPNotifs]=useState([]);

  const sendChatMsg=()=>{
    const txt=chatInput.trim();
    if(!txt||!activeChatId) return;
    const now=new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
    setChatMessages(prev=>({...prev,[activeChatId]:[...(prev[activeChatId]||[]),{from:"provider",text:txt,time:now}]}));
    setChatInput("");
    chatApi.send(activeChatId,txt).catch(e=>console.warn("chat send:",e.message));
  };

  const acceptJob=async id=>{
    setJobs(j=>j.map(x=>x.id===id?{...x,status:"active"}:x));
    showToast(lang==="bn"?"✅ কাজ গ্রহণ করা হয়েছে!":"✅ Job accepted!");
    try{ await bookingsApi.updateStatus(id,"confirmed"); }catch(e){console.warn("accept:",e.message);}
  };
  const declineJob=async id=>{
    setJobs(j=>j.map(x=>x.id===id?{...x,status:"declined"}:x));
    showToast(lang==="bn"?"কাজ করা হয়নি":"Job declined");
    try{ await bookingsApi.updateStatus(id,"cancelled"); }catch(e){console.warn("decline:",e.message);}
  };
  const completeJob=async id=>{
    setJobs(j=>j.map(x=>x.id===id?{...x,status:"completed"}:x));
    showToast(lang==="bn"?"✅ কাজ সম্পন্ড!":"✅ Job completed!");
    try{ await bookingsApi.updateStatus(id,"completed"); }catch(e){console.warn("complete:",e.message);}
  };

  const tabs=[
    {v:"dash",icon:"📊",lbn:"ড্যাশবোর্ড",len:"Dashboard"},
    {v:"jobs",icon:"💼",lbn:"কাজ",len:"Jobs"},
    {v:"schedule",icon:"📅",lbn:"সময়সূচি",len:"Schedule"},
    {v:"earnings",icon:"💰",lbn:"আয়",len:"Earnings"},
    {v:"profile",icon:"👤",lbn:"প্রোফাইল",len:"Profile"},
    {v:"reviews",icon:"⭐",lbn:"রিভিউ",len:"Reviews"},
    {v:"chat",icon:"💬",lbn:"চ্যাট",len:"Chat"},
    {v:"notifs",icon:"🔔",lbn:`বিজ্ঞপ্তি${pNotifs.filter(n=>!n.read).length>0?" ("+pNotifs.filter(n=>!n.read).length+")":""}`,len:`Notifs${pNotifs.filter(n=>!n.read).length>0?" ("+pNotifs.filter(n=>!n.read).length+")":""}`},
  ];

  const statCards=[
    {icon:"💼",val:jobs.filter(j=>j.status==="incoming").length,lbn:"নতুন অনুরোধ",len:"New Requests",col:"#3B82F6"},
    {icon:"🔄",val:jobs.filter(j=>j.status==="active").length,lbn:"সক্রিয় কাজ",len:"Active Jobs",col:C.p},
    {icon:"✅",val:jobs.filter(j=>j.status==="completed").length,lbn:"সম্পন্ড",len:"Completed",col:"#10B981"},
    {icon:"💰",val:"৳"+earnings.balance.toLocaleString(),lbn:"ব্যালেন্স",len:"Balance",col:"#F59E0B"},
    {icon:"⭐",val:"4.8",lbn:"রেটিং",len:"Rating",col:"#8B5CF6"},
    {icon:"📋",val:jobs.length,lbn:"মোট কাজ",len:"Total Jobs",col:"#EF4444"},
  ];

  return(
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'Hind Siliguri','Noto Sans Bengali',sans-serif",color:C.text}}>
      <div style={{background:C.card,borderBottom:`1px solid ${C.bdr}`,padding:"0 20px",height:58,display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{fontSize:20}}>🌿</div>
          <div>
            <div style={{fontWeight:800,fontSize:14,color:C.p}}>IMAP {lang==="bn"?"প্রদানকারী":"Provider"}</div>
            <div style={{fontSize:10,color:C.muted}}>{lang==="bn"?"এআই পাওয়ার্ড সার্ভিস প্ল্যাটফর্ম":"AI Powered Service Platform"}</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:isMobile?5:8}}>
          <div onClick={()=>{setAvailable(!available);showToast(available?(lang==="bn"?"ব্যস্ত মোড চালু":"Busy mode on"):(lang==="bn"?"উপলব্ধ":"Available"));}} style={{display:"flex",alignItems:"center",gap:6,background:available?C.plt:"#FEE2E2",borderRadius:20,padding:isMobile?"5px 8px":"5px 12px",cursor:"pointer",border:`1px solid ${available?C.p+"44":"#EF444444"}`}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:available?C.p:"#EF4444"}}/>
            {!isMobile&&<span style={{fontSize:12,fontWeight:700,color:available?C.p:"#EF4444"}}>{available?tr.ppAvailable:tr.ppBusy}</span>}
          </div>
          <button onClick={()=>setLang(lang==="bn"?"en":"bn")} style={{background:C.plt,color:C.p,border:"none",borderRadius:14,padding:"5px 10px",fontSize:11,cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>{lang==="bn"?"EN":"বাং"}</button>
          <button onClick={()=>setDark(!dark)} style={{background:C.plt,border:"none",borderRadius:14,padding:"5px 10px",fontSize:14,cursor:"pointer"}}>{dark?"☀️":"🌙"}</button>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <div style={{background:C.p,color:"#fff",borderRadius:"50%",width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>👷</div>
            {!isMobile&&<div style={{display:"flex",flexDirection:"column"}}>
              <div style={{fontWeight:700,fontSize:12,color:C.text}}>{user.name}</div>
              <div style={{fontSize:10,color:C.muted}}>{lang==="bn"?"প্রদানকারী":"Provider"}</div>
            </div>}
          </div>
          <button onClick={onLogout} style={{background:"#FEE2E2",color:"#EF4444",border:"none",borderRadius:8,padding:isMobile?"6px 8px":"6px 12px",fontSize:11,cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>{isMobile?"✕":tr.logout}</button>
        </div>
      </div>

      <div style={{display:"flex",background:C.card,borderBottom:`1px solid ${C.bdr}`,overflowX:"auto",gap:0}}>
        {tabs.map(t=>(
          <button key={t.v} onClick={()=>setTab(t.v)} style={{flex:"0 0 auto",padding:"12px 18px",border:"none",borderBottom:`2.5px solid ${tab===t.v?C.p:"transparent"}`,background:"transparent",color:tab===t.v?C.p:C.sub,fontWeight:tab===t.v?700:500,fontSize:12,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:5,whiteSpace:"nowrap",transition:"all .15s"}}>
            <span>{t.icon}</span><span>{lang==="bn"?t.lbn:t.len}</span>
            {t.v==="jobs"&&jobs.filter(j=>j.status==="incoming").length>0&&<span style={{background:C.p,color:"#fff",borderRadius:"50%",width:16,height:16,fontSize:10,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>{jobs.filter(j=>j.status==="incoming").length}</span>}
          </button>
        ))}
      </div>

      <div style={{padding:20,maxWidth:900,margin:"0 auto",paddingBottom:40}}>

        {tab==="dash"&&(
          <>
            <div style={{fontWeight:800,fontSize:18,marginBottom:16}}>{lang==="bn"?`🙏 শুভেচ্ছা, ${user.name}!`:`👋 Welcome, ${user.name}!`}</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:12,marginBottom:22}}>
              {statCards.map((s,i)=>(
                <div key={i} style={{background:C.card,borderRadius:14,padding:16,border:`1px solid ${C.bdr}`,borderTop:`3px solid ${s.col}`,textAlign:"center"}}>
                  <div style={{fontSize:24,marginBottom:6}}>{s.icon}</div>
                  <div style={{fontSize:20,fontWeight:800,color:s.col}}>{s.val}</div>
                  <div style={{fontSize:11,color:C.muted}}>{lang==="bn"?s.lbn:s.len}</div>
                </div>
              ))}
            </div>
            {jobs.filter(j=>j.status==="incoming").length>0&&(
              <div style={{background:C.card,borderRadius:16,padding:18,border:`2px solid ${C.p}`,marginBottom:16}}>
                <div style={{fontWeight:700,fontSize:14,color:C.p,marginBottom:12}}>🔔 {lang==="bn"?"নতুন অনুরোধ আসছে":"New incoming requests"}</div>
                {jobs.filter(j=>j.status==="incoming").map(j=>(
                  <div key={j.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${C.bdr}`}}>
                    <div>
                      {j.urgent&&<span style={{background:"#FEE2E2",color:"#EF4444",borderRadius:8,padding:"2px 8px",fontSize:10,fontWeight:700,marginBottom:4,display:"inline-block"}}>🚨 {lang==="bn"?"জরুরি":"Urgent"}</span>}
                      <div style={{fontWeight:600,fontSize:13}}>{j.service}</div>
                      <div style={{fontSize:11,color:C.muted}}>{j.customer} • {j.address} • {j.time}</div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontWeight:800,color:C.p,fontSize:14}}>৳{j.amount}</span>
                      <button onClick={()=>acceptJob(j.id)} style={{background:C.p,color:"#fff",border:"none",borderRadius:8,padding:"7px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>{tr.ppAccept}</button>
                      <button onClick={()=>declineJob(j.id)} style={{background:"#FEE2E2",color:"#EF4444",border:"none",borderRadius:8,padding:"7px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>{tr.ppDecline}</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{background:C.card,borderRadius:16,padding:18,border:`1px solid ${C.bdr}`,display:"grid",gridTemplateColumns:isMobile?"1fr":"repeat(3,1fr)",gap:isMobile?0:1}}>
              {[
                {lbn:"এই সপ্তাহে",len:"This Week",val:"৳"+earnings.thisWeek.toLocaleString(),col:C.p},
                {lbn:"এই মাসে",len:"This Month",val:"৳"+earnings.thisMonth.toLocaleString(),col:"#F59E0B"},
                {lbn:"সর্বমোট",len:"All Time",val:"৳"+earnings.total.toLocaleString(),col:"#8B5CF6"},
              ].map((e,i)=>(
                <div key={i} style={{textAlign:"center",padding:14,borderRight:!isMobile&&i<2?`1px solid ${C.bdr}`:"none",borderBottom:isMobile&&i<2?`1px solid ${C.bdr}`:"none"}}>
                  <div style={{fontSize:18,fontWeight:800,color:e.col}}>{e.val}</div>
                  <div style={{fontSize:11,color:C.muted,marginTop:3}}>{lang==="bn"?e.lbn:e.len}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab==="jobs"&&(
          <>
            <div style={{fontWeight:800,fontSize:18,marginBottom:16}}>{lang==="bn"?"💼 কাজের তালিকা":"💼 Job List"}</div>
            {["incoming","active","completed"].map(status=>{
              const list=jobs.filter(j=>j.status===status);
              const statusLabel={incoming:{bn:"নতুন অনুরোধ",en:"Incoming Requests",col:"#3B82F6"},active:{bn:"সক্রিয় কাজ",en:"Active Jobs",col:C.p},completed:{bn:"সম্পন্ড",en:"Completed",col:"#10B981"}};
              const sl=statusLabel[status];
              if(list.length===0) return null;
              return(
                <div key={status} style={{marginBottom:20}}>
                  <div style={{fontWeight:700,fontSize:14,color:sl.col,marginBottom:10}}>{lang==="bn"?sl.bn:sl.en} ({list.length})</div>
                  {list.map(j=>(
                    <div key={j.id} style={{background:C.card,borderRadius:14,padding:16,border:`1px solid ${C.bdr}`,marginBottom:10,borderLeft:`3px solid ${sl.col}`}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                        <div style={{flex:1}}>
                          {j.urgent&&<span style={{background:"#FEE2E2",color:"#EF4444",borderRadius:8,padding:"2px 8px",fontSize:10,fontWeight:700,marginBottom:6,display:"inline-block"}}>🚨 {lang==="bn"?"জরুরি":"Urgent"}</span>}
                          <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>{j.service}</div>
                          <div style={{fontSize:12,color:C.muted,marginBottom:2}}>👤 {j.customer}</div>
                          <div style={{fontSize:12,color:C.muted,marginBottom:2}}>📍 {j.address}</div>
                          <div style={{fontSize:12,color:C.muted}}>🕐 {j.time}</div>
                        </div>
                        <div style={{textAlign:"right"}}>
                          <div style={{fontWeight:800,fontSize:18,color:C.p}}>৳{j.amount}</div>
                          <div style={{fontSize:11,color:C.muted}}>#{j.id}</div>
                        </div>
                      </div>
                      {status==="incoming"&&(
                        <div style={{display:"flex",gap:8,marginTop:12}}>
                          <button onClick={()=>acceptJob(j.id)} style={{flex:1,padding:"10px",background:C.p,color:"#fff",border:"none",borderRadius:10,fontSize:13,cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>{tr.ppAccept}</button>
                          <button onClick={()=>declineJob(j.id)} style={{flex:1,padding:"10px",background:"#FEE2E2",color:"#EF4444",border:"none",borderRadius:10,fontSize:13,cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>{tr.ppDecline}</button>
                        </div>
                      )}
                      {status==="active"&&(
                        <button onClick={()=>completeJob(j.id)} style={{width:"100%",marginTop:12,padding:"10px",background:"#D1FAE5",color:"#065F46",border:"none",borderRadius:10,fontSize:13,cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>✅ {lang==="bn"?"সম্পন্ড চিহ্নিত করুন":"Mark as Completed"}</button>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
            {jobs.filter(j=>j.status!=="declined").length===0&&<div style={{textAlign:"center",padding:40,color:C.muted}}>{tr.ppNoJobs}</div>}
          </>
        )}

        {tab==="schedule"&&(
          <>
            <div style={{fontWeight:800,fontSize:18,marginBottom:16}}>{lang==="bn"?"📅 সাপ্তাহিক সময়সূচি":"📅 Weekly Schedule"}</div>
            {Object.entries(schedule.slots).map(([day,slots])=>(
              <div key={day} style={{background:C.card,borderRadius:14,padding:16,border:`1px solid ${C.bdr}`,marginBottom:12}}>
                <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>{day}</div>
                <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                  {slots.map((s,i)=>(
                    <div key={s.id||i} onClick={async()=>{
                      const newAvail=!s.avail;
                      // Optimistic update
                      setSchedule(prev=>{
                        const newSlots={...prev.slots};
                        newSlots[day]=newSlots[day].map((sl,idx)=>idx===i?{...sl,avail:newAvail}:sl);
                        return{...prev,slots:newSlots};
                      });
                      if(s.id) scheduleApi.toggle(s.id,newAvail).catch(()=>{});
                    }}
                    style={{padding:"9px 16px",borderRadius:10,background:s.avail?C.plt:"#F3F4F6",border:`1.5px solid ${s.avail?C.p:C.bdr}`,fontSize:13,fontWeight:600,color:s.avail?C.p:C.muted,cursor:"pointer",userSelect:"none"}}>
                      {s.avail?"✅":"❌"} {s.t}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div style={{background:C.card,borderRadius:14,padding:16,border:`1px solid ${C.bdr}`,marginTop:8}}>
              <div style={{fontWeight:700,fontSize:14,marginBottom:10}}>{lang==="bn"?"উপলব্ধতা সারাংশ":"Availability Summary"}</div>
              <div style={{display:"flex",gap:16,fontSize:13}}>
                <div><span style={{color:C.p,fontWeight:700}}>✅ {Object.values(schedule.slots).flat().filter(s=>s.avail).length}</span> <span style={{color:C.muted}}>{lang==="bn"?"উপলব্ধ":"Available"}</span></div>
                <div><span style={{color:C.muted,fontWeight:700}}>❌ {Object.values(schedule.slots).flat().filter(s=>!s.avail).length}</span> <span style={{color:C.muted}}>{lang==="bn"?"বুকড":"Booked"}</span></div>
              </div>
              <div style={{fontSize:11,color:C.sub,marginTop:8}}>{lang==="bn"?"স্লটে ক্লিক করে উপলব্ধতা পরিবর্তন করুন":"Click on a slot to toggle availability"}</div>
            </div>
          </>
        )}

        {tab==="earnings"&&(
          <>
            <div style={{fontWeight:800,fontSize:18,marginBottom:16}}>{lang==="bn"?"💰 আয় ও পেমেন্ট":"💰 Earnings & Payments"}</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12,marginBottom:20}}>
              {[
                {lbn:"ব্যালেন্স",len:"Balance",val:earnings.balance,icon:"💳",col:C.p},
                {lbn:"সাপ্তাহিক",len:"This Week",val:earnings.thisWeek,icon:"📈",col:"#10B981"},
                {lbn:"মাসিক",len:"Monthly",val:earnings.thisMonth,icon:"📊",col:"#F59E0B"},
                {lbn:"সর্বমোট",len:"All Time",val:earnings.total,icon:"🏆",col:"#8B5CF6"},
              ].map((e,i)=>(
                <div key={i} style={{background:C.card,borderRadius:14,padding:16,border:`1px solid ${C.bdr}`,display:"flex",alignItems:"center",gap:12}}>
                  <span style={{fontSize:28}}>{e.icon}</span>
                  <div>
                    <div style={{fontSize:20,fontWeight:800,color:e.col}}>৳{e.val.toLocaleString()}</div>
                    <div style={{fontSize:12,color:C.muted}}>{lang==="bn"?e.lbn:e.len}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{background:C.card,borderRadius:14,padding:18,border:`1px solid ${C.bdr}`,marginBottom:16}}>
              <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>💸 {tr.ppReqWithdraw}</div>
              <div style={{display:"flex",gap:10}}>
                <input value={withdrawAmt} onChange={e=>setWithdrawAmt(e.target.value)} placeholder={lang==="bn"?"পরিমাণ ৳":"Amount ৳"}
                  style={{flex:1,padding:"11px 14px",border:`1.5px solid ${C.bdr}`,borderRadius:10,fontSize:14,background:C.bg,color:C.text,outline:"none",fontFamily:"inherit"}}/>
                <button onClick={async()=>{
                  if(!withdrawAmt) return;
                  try{ await usersApi.withdraw(parseFloat(withdrawAmt),"bKash/Nagad"); showToast(tr.ppWithdrawDone); setWithdrawAmt(""); }
                  catch(e){ showToast(e.data?.error||(lang==="bn"?"ব্যর্থ":"Failed")); }
                }} style={{padding:"11px 20px",background:C.p,color:"#fff",border:"none",borderRadius:10,cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:13}}>bKash/Nagad</button>
              </div>
              <div style={{fontSize:12,color:C.muted,marginTop:8}}>{lang==="bn"?"bKash / Nagad / Rocket এ সরাসরি পাঠানো হবে":"Sent directly to your bKash / Nagad / Rocket"}</div>
            </div>
            <div style={{background:C.card,borderRadius:14,padding:18,border:`1px solid ${C.bdr}`}}>
              <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>{lang==="bn"?"লেনদেন ইতিহাস":"Transaction History"}</div>
              {earnings.history.map((h,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${C.bdr}`}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600}}>{h.desc}</div>
                    <div style={{fontSize:11,color:C.muted}}>{h.date}</div>
                  </div>
                  <div style={{fontWeight:800,fontSize:15,color:h.type==="credit"?C.p:"#EF4444"}}>{h.type==="credit"?"+":""}৳{Math.abs(h.amount).toLocaleString()}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab==="profile"&&(
          <>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{fontWeight:800,fontSize:18}}>{lang==="bn"?"👤 আমার প্রোফাইল":"👤 My Profile"}</div>
              <button onClick={()=>setEditMode(!editMode)} style={{background:editMode?C.plt:C.p,color:editMode?C.p:"#fff",border:editMode?`1px solid ${C.p}`:"none",borderRadius:10,padding:"8px 16px",fontSize:13,cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>
                {editMode?(lang==="bn"?"বাতিল":"Cancel"):tr.ppEditProfile}
              </button>
            </div>
            <div style={{background:C.card,borderRadius:16,padding:24,border:`1px solid ${C.bdr}`,marginBottom:16,textAlign:"center"}}>
              <label style={{cursor:"pointer",display:"inline-block",marginBottom:8}}>
                <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{
                  const f=e.target.files[0]; if(!f) return;
                  const r=new FileReader(); r.onload=ev=>saveAvatar(ev.target.result); r.readAsDataURL(f);
                }}/>
                <div style={{width:90,height:90,borderRadius:"50%",background:avatarB64?"transparent":C.plt,border:`3px solid ${C.p}`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto",overflow:"hidden",position:"relative"}}>
                  {avatarB64
                    ?<img src={avatarB64} style={{width:"100%",height:"100%",objectFit:"cover"}} alt="avatar"/>
                    :<span style={{fontSize:48}}>👷</span>
                  }
                  <div style={{position:"absolute",bottom:0,right:0,width:26,height:26,borderRadius:"50%",background:C.p,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,border:"2px solid #fff"}}>📷</div>
                </div>
              </label>
              <div style={{fontSize:11,color:C.p,fontWeight:600,marginBottom:6}}>{lang==="bn"?"ছবি পরিবর্তন করুন":"Change photo"}</div>
              <div style={{fontWeight:800,fontSize:18}}>{profile.name}</div>
              <div style={{fontSize:13,color:C.muted,marginTop:4}}>{profile.service} • {profile.area}</div>
              <div style={{display:"flex",justifyContent:"center",gap:8,marginTop:10}}>
                {user.nid?<span style={{background:C.plt,color:C.p,borderRadius:20,padding:"4px 12px",fontSize:11,fontWeight:700}}>🛡️ {lang==="bn"?"NID যাচাইকৃত":"NID Verified"}</span>:<span style={{background:"#FEF3C7",color:"#92400E",borderRadius:20,padding:"4px 12px",fontSize:11,fontWeight:700}}>⚠️ {lang==="bn"?"যাচাই বাকি":"Not Verified"}</span>}
                <span style={{background:"#D1FAE5",color:"#065F46",borderRadius:20,padding:"4px 12px",fontSize:11,fontWeight:700}}>⭐ 4.8</span>
              </div>
            </div>
            <div style={{background:C.card,borderRadius:16,padding:20,border:`1px solid ${C.bdr}`,marginBottom:16}}>
              {[
                {key:"name",lbn:"নাম",len:"Full Name",icon:"👤"},
                {key:"service",lbn:"সেবার ধরন",len:"Service Type",icon:"🔧"},
                {key:"area",lbn:"কাজের এলাকা",len:"Work Area",icon:"📍"},
                {key:"phone",lbn:"ফোন",len:"Phone",icon:"📱"},
                {key:"rate",lbn:"প্রতি ঘণ্টার রেট (৳)",len:"Hourly Rate (৳)",icon:"💰"},
              ].map(f=>(
                <div key={f.key} style={{marginBottom:14}}>
                  <div style={{fontSize:12,color:C.muted,marginBottom:5,fontWeight:600}}>{f.icon} {lang==="bn"?f.lbn:f.len}</div>
                  {editMode?(
                    <input value={profile[f.key]} onChange={e=>setProfile(p=>({...p,[f.key]:e.target.value}))}
                      style={{width:"100%",padding:"11px 14px",border:`1.5px solid ${C.bdr}`,borderRadius:10,fontSize:14,background:C.bg,color:C.text,outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
                  ):(
                    <div style={{padding:"11px 14px",background:C.bg,borderRadius:10,fontSize:14,border:`1px solid ${C.bdr}`}}>{profile[f.key]}</div>
                  )}
                </div>
              ))}
              <div style={{marginBottom:14}}>
                <div style={{fontSize:12,color:C.muted,marginBottom:5,fontWeight:600}}>📝 {lang==="bn"?"পরিচিতি":"Bio"}</div>
                {editMode?(
                  <textarea value={profile.bio} onChange={e=>setProfile(p=>({...p,bio:e.target.value}))} rows={3}
                    style={{width:"100%",padding:"11px 14px",border:`1.5px solid ${C.bdr}`,borderRadius:10,fontSize:14,background:C.bg,color:C.text,outline:"none",boxSizing:"border-box",fontFamily:"inherit",resize:"vertical"}}/>
                ):(
                  <div style={{padding:"11px 14px",background:C.bg,borderRadius:10,fontSize:14,border:`1px solid ${C.bdr}`,color:C.sub}}>{profile.bio}</div>
                )}
              </div>
              {editMode&&<button onClick={async()=>{
                setEditMode(false); showToast(tr.ppProfileSaved);
                try{ await providersApi.updateMe({
                  bio_bn:profile.bio, bio_en:profile.bio,
                  service_type_bn:profile.service, service_type_en:profile.service,
                  area_bn:profile.area, area_en:profile.area,
                  hourly_rate:parseFloat(profile.rate)||0,
                }); }catch(e){console.warn("save profile:",e.message);}
              }} style={{width:"100%",padding:"12px",background:C.p,color:"#fff",border:"none",borderRadius:12,fontSize:14,cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>{tr.ppSaveProfile}</button>}
            </div>
            {!user.nid&&(
              <div style={{background:"#FFFBEB",borderRadius:14,padding:16,border:"1px solid #FCD34D",marginBottom:16}}>
                <div style={{fontWeight:700,fontSize:14,color:"#92400E",marginBottom:6}}>⚠️ {lang==="bn"?"NID যাচাই করুন":"Verify your NID"}</div>
                <div style={{fontSize:12,color:"#B45309",marginBottom:12}}>{lang==="bn"?"NID যাচাইয়ের পর বেশি কাজ পাবেন এবং ট্রাস্ট স্কোর বাড়বে":"Verified providers get more jobs and higher trust score"}</div>
                <button style={{background:"#F59E0B",color:"#fff",border:"none",borderRadius:10,padding:"10px 18px",fontSize:13,cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>📷 {lang==="bn"?"NID ছবি তুলুন":"Upload NID Photos"}</button>
              </div>
            )}
            <button onClick={onLogout} style={{width:"100%",padding:"12px",background:"#FEE2E2",color:"#EF4444",border:"none",borderRadius:12,fontSize:14,cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>{tr.logout}</button>
          </>
        )}

        {tab==="reviews"&&(
          <>
            <div style={{fontWeight:800,fontSize:18,marginBottom:6}}>⭐ {lang==="bn"?"রিভিউ ও রেটিং":"Reviews & Ratings"}</div>
            <div style={{fontSize:13,color:C.muted,marginBottom:18}}>{lang==="bn"?"গ্রাহকদের মতামত":"Customer Feedback"}</div>
            <div style={{background:C.card,borderRadius:16,padding:20,border:`1px solid ${C.bdr}`,marginBottom:20,display:"flex",gap:24,alignItems:"center",flexWrap:"wrap"}}>
              <div style={{textAlign:"center",minWidth:80}}>
                <div style={{fontSize:48,fontWeight:900,color:C.p,lineHeight:1}}>{avgRating}</div>
                <div style={{fontSize:20,marginTop:4}}>{"⭐".repeat(Math.round(avgRating))}</div>
                <div style={{fontSize:12,color:C.muted,marginTop:4}}>{reviews.length} {lang==="bn"?"টি রিভিউ":"reviews"}</div>
              </div>
              <div style={{flex:1,minWidth:200}}>
                {ratingDist.map(({s,count})=>(
                  <div key={s} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                    <span style={{fontSize:12,fontWeight:700,minWidth:16}}>{s}⭐</span>
                    <div style={{flex:1,height:8,background:C.bdr,borderRadius:4,overflow:"hidden"}}>
                      <div style={{height:"100%",background:C.p,borderRadius:4,width:reviews.length?`${(count/reviews.length)*100}%`:"0%",transition:"width .5s"}}/>
                    </div>
                    <span style={{fontSize:12,color:C.muted,minWidth:16}}>{count}</span>
                  </div>
                ))}
              </div>
            </div>
            {reviews.map(r=>(
              <div key={r.id} style={{background:C.card,borderRadius:14,padding:18,border:`1px solid ${C.bdr}`,marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:40,height:40,borderRadius:"50%",background:C.plt,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>👤</div>
                    <div>
                      <div style={{fontWeight:700,fontSize:14}}>{r.customer}</div>
                      <div style={{fontSize:12,color:C.muted}}>{r.service}</div>
                    </div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:16}}>{"⭐".repeat(r.rating)}</div>
                    <div style={{fontSize:11,color:C.muted}}>{r.date}</div>
                  </div>
                </div>
                <div style={{marginTop:12,fontSize:13,color:C.sub,fontStyle:"italic",background:C.bg,borderRadius:10,padding:"10px 14px"}}>
                  "{r.comment}"
                </div>
              </div>
            ))}
          </>
        )}

        {tab==="chat"&&(
          <>
            <div style={{fontWeight:800,fontSize:18,marginBottom:16}}>💬 {lang==="bn"?"গ্রাহক সংলাপ":"Customer Chat"}</div>
            {chatSessions.length===0&&!activeChatId&&(
              <div style={{textAlign:"center",padding:40,color:C.muted,fontSize:14}}>
                {lang==="bn"?"কোনো সক্রিয় বুকিং নেই।":"No active bookings to chat with."}
              </div>
            )}
            {!activeChatId?(
              chatSessions.map(s=>(
                <div key={s.id} onClick={()=>setActiveChatId(s.id)} style={{background:C.card,borderRadius:14,padding:16,border:`1px solid ${C.bdr}`,marginBottom:10,cursor:"pointer",display:"flex",alignItems:"center",gap:12,transition:"all .15s"}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=C.p} onMouseLeave={e=>e.currentTarget.style.borderColor=C.bdr}>
                  <div style={{width:44,height:44,borderRadius:"50%",background:C.plt,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>👤</div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:14}}>{s.customer}</div>
                    <div style={{fontSize:12,color:C.muted}}>{s.job}</div>
                  </div>
                  {s.unread>0&&<div style={{background:C.p,color:"#fff",borderRadius:"50%",width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,flexShrink:0}}>{s.unread}</div>}
                  <span style={{color:C.muted,fontSize:16}}>›</span>
                </div>
              ))
            ):(()=>{
              const session=chatSessions.find(s=>s.id===activeChatId);
              const msgs=chatMessages[activeChatId]||[];
              return(
                <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 200px)",maxHeight:520}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                    <button onClick={()=>setActiveChatId(null)} style={{background:C.card,border:`1px solid ${C.bdr}`,borderRadius:10,width:36,height:36,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>←</button>
                    <div style={{fontWeight:700,fontSize:15}}>{session?.customer}</div>
                    <div style={{fontSize:11,color:C.muted}}>— {session?.job}</div>
                  </div>
                  <div style={{flex:1,overflowY:"auto",padding:"4px 0",display:"flex",flexDirection:"column",gap:8}}>
                    {chatLoading&&<div style={{textAlign:"center",padding:20,color:C.muted,fontSize:13}}>⏳ {lang==="bn"?"লোড হচ্ছে...":"Loading..."}</div>}
                    {msgs.map((m,i)=>(
                      <div key={i} style={{display:"flex",justifyContent:m.from==="provider"?"flex-end":"flex-start"}}>
                        <div style={{maxWidth:"75%",background:m.from==="provider"?C.p:C.card,color:m.from==="provider"?"#fff":C.text,borderRadius:m.from==="provider"?"18px 18px 4px 18px":"18px 18px 18px 4px",padding:"10px 14px",fontSize:13,border:m.from==="provider"?"none":`1px solid ${C.bdr}`}}>
                          <div>{m.text}</div>
                          <div style={{fontSize:10,opacity:.7,marginTop:3,textAlign:m.from==="provider"?"right":"left"}}>{m.time}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{display:"flex",gap:10,marginTop:12}}>
                    <input value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter") sendChatMsg();}} placeholder={lang==="bn"?"বার্তা লিখুন...":"Type a message..."}
                      style={{flex:1,padding:"11px 14px",border:`1.5px solid ${C.bdr}`,borderRadius:12,fontSize:14,background:C.bg,color:C.text,outline:"none",fontFamily:"inherit"}}/>
                    <button onClick={sendChatMsg} style={{padding:"0 18px",background:C.p,color:"#fff",border:"none",borderRadius:12,cursor:"pointer",fontSize:18}}>→</button>
                  </div>
                </div>
              );
            })()}
          </>
        )}

        {tab==="notifs"&&(
          <>
            <div style={{fontWeight:800,fontSize:18,marginBottom:16}}>🔔 {lang==="bn"?"বিজ্ঞপ্তি":"Notifications"}</div>
            {pNotifs.map(n=>(
              <div key={n.id} style={{background:C.card,borderRadius:14,padding:"14px 16px",border:`1px solid ${n.read?C.bdr:C.p}`,marginBottom:10,display:"flex",gap:14,alignItems:"flex-start",opacity:n.read?.75:1}}>
                <div style={{fontSize:28,flexShrink:0}}>{n.icon}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:14,marginBottom:3}}>{n.title}</div>
                  <div style={{fontSize:13,color:C.sub,marginBottom:5}}>{n.msg}</div>
                  <div style={{fontSize:11,color:C.muted}}>{n.time}</div>
                </div>
                {!n.read&&<div style={{width:10,height:10,borderRadius:"50%",background:C.p,flexShrink:0,marginTop:4}}/>}
              </div>
            ))}
          </>
        )}

      </div>

      {toast&&<div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:"#1A1A2E",color:"#fff",padding:"12px 22px",borderRadius:30,fontSize:13,fontWeight:700,zIndex:9999,boxShadow:"0 4px 20px rgba(0,0,0,.2)",pointerEvents:"none"}}>{toast}</div>}
    </div>
  );
}
