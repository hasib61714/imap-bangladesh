import { useState, useEffect } from "react";
import { useC, useTr } from "../contexts";
import { T } from "../constants/translations";
import { NOTIFS_DATA } from "../constants/data";
import { users as usersApi } from "../api";

export default function NotifPage() {
  const C=useC();
  const tr=useTr();
  const lang=tr===T.en?"en":"bn";
  const [notifs,setNotifs]=useState(NOTIFS_DATA);
  const [filter,setFilter]=useState("all");
  const [pushPerm,setPushPerm]=useState(()=>typeof Notification!=="undefined"?Notification.permission:"unsupported");
  const [pushLoading,setPushLoading]=useState(false);

  const VAPID_PUB=import.meta.env.VITE_VAPID_PUBLIC_KEY||"BF_hmW0seM25G-gFZagh8h-Sq_nDKhc_XKjTa2aU2uebfWUwhR7omk6S_0BGryEVslOqgb4gWnwttUmfVraKTw4";
  const urlB64ToU8=b64=>{const p=b64.replace(/-/g,"+").replace(/_/g,"/");const raw=atob(p);const a=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)a[i]=raw.charCodeAt(i);return a;};

  const subscribePush=async()=>{
    if(!("serviceWorker" in navigator&&"PushManager" in window)){
      alert(lang==="en"?"Push not supported in this browser.":"এই ব্রাউজারে পুশ নোটিফিকেশন সমর্থিত নয়।");return;
    }
    setPushLoading(true);
    try{
      const perm=await Notification.requestPermission();
      setPushPerm(perm);
      if(perm!=="granted"){setPushLoading(false);return;}
      const reg=await navigator.serviceWorker.ready;
      const sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlB64ToU8(VAPID_PUB)});
      await usersApi.pushSubscribe(sub.toJSON());
    }catch(e){console.warn("push subscribe error:",e);}
    setPushLoading(false);
  };

  // Load live notifications from backend (fallback to static NOTIFS_DATA)
  useEffect(()=>{
    usersApi.getNotifications().then(d=>{
      if(d.notifications?.length){
        setNotifs(d.notifications.map(n=>({
          id:   n.id,
          icon: n.icon||"🔔",
          t:    n.title_bn||n.title||"",
          tEn:  n.title_en||n.title||"",
          m:    n.body_bn||n.body||"",
          mEn:  n.body_en||n.body||"",
          time: n.created_at||"",
          timeEn: n.created_at||"",
          unread: !n.is_read,
          type: n.type||"info",
        })));
        usersApi.markNotifRead().catch(()=>{});
      }
    }).catch(()=>{});
  },[]);
  const TYPE_COL={booking:["#D1FAE5","#065F46"],promo:["#FEF9C3","#7C5800"],info:["#DBEAFE","#1D4ED8"],alert:["#FEE2E2","#B91C1C"],payment:["#EDE9FE","#5B21B6"]};
  const list=filter==="all"?notifs:notifs.filter(n=>n.type===filter);
  const FILTERS=[["all",tr.nAll],["booking",tr.nBooking],["promo",tr.nPromo],["alert",tr.nAlert],["payment",tr.nPayment]];
  return (
    <div>
      <div className="row" style={{justifyContent:"space-between",marginBottom:14,flexWrap:"wrap",gap:10}}>
        <div style={{fontSize:18,fontWeight:700}}>{tr.notifsTitle}</div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          {pushPerm!=="granted"&&pushPerm!=="unsupported"&&(
            <button className="btn" disabled={pushLoading} onClick={subscribePush}
              style={{fontSize:11,padding:"5px 11px",borderRadius:20,border:`1.5px solid ${C.p}`,color:C.p,background:C.plt,cursor:"pointer",fontWeight:600}}>
              {pushLoading?"⏳":(lang==="en"?"🔔 Enable Push":"🔔 পুশ চালু করুন")}
            </button>
          )}
          {pushPerm==="granted"&&(
            <>
              <span style={{fontSize:11,color:C.p,padding:"5px 11px",background:C.plt,borderRadius:20,border:`1px solid ${C.p}30`,fontWeight:600}}>
                🔔 {lang==="en"?"Push: On":"পুশ: চালু"}
              </span>
              <button className="btn" onClick={()=>usersApi.testPush().then(()=>alert(lang==="en"?"✅ Test push sent!":"✅ পুশ পাঠানো হয়েছে!")).catch(e=>alert("❌ "+e.message))}
                style={{fontSize:11,padding:"5px 11px",borderRadius:20,border:`1.5px solid ${C.p}`,color:C.p,background:C.plt,cursor:"pointer",fontWeight:600}}>
                🔔 {lang==="en"?"Test":"টেস্ট"}
              </button>
            </>
          )}
          <button className="btn btn-gh" style={{fontSize:12,border:`1px solid ${C.bdr}`}} onClick={()=>{setNotifs(n=>n.map(x=>({...x,unread:false})));usersApi.markNotifRead().catch(()=>{});}}>{tr.markRead}</button>
        </div>
      </div>
      <div className="sx" style={{marginBottom:14}}>
        <div style={{display:"flex",gap:7,width:"max-content"}}>
          {FILTERS.map(([f,l])=>(
            <button key={f} onClick={()=>setFilter(f)} className="btn" style={{padding:"6px 12px",borderRadius:99,border:`1.5px solid ${filter===f?C.p:C.bdr}`,background:filter===f?C.p:"#fff",color:filter===f?"#fff":C.sub,fontSize:12,fontWeight:600,whiteSpace:"nowrap"}}>{l}</button>
          ))}
        </div>
      </div>
      {list.map((n,i)=>(
        <div key={i} onClick={()=>{
          setNotifs(ns=>ns.map((x,j)=>j===i?{...x,unread:false}:x));
          if(n.id) usersApi.markNotifReadById(n.id).catch(()=>{});
        }} style={{display:"flex",gap:12,padding:13,background:n.unread?`${C.p}06`:"#fff",borderRadius:13,border:`1px solid ${n.unread?C.p+"30":C.bdr}`,cursor:"pointer",marginBottom:8,transition:"all .18s"}}>
          <div className="jc" style={{width:42,height:42,borderRadius:11,background:TYPE_COL[n.type][0],fontSize:18,flexShrink:0}}>{n.icon}</div>
          <div style={{flex:1}}>
            <div className="row" style={{justifyContent:"space-between"}}>
              <div style={{fontSize:13,fontWeight:700}}>{lang==="en"?n.tEn:n.t}</div>
              {n.unread&&<div style={{width:7,height:7,borderRadius:"50%",background:C.p,flexShrink:0}}/>}
            </div>
            <div style={{fontSize:12,color:C.muted,marginTop:2}}>{lang==="en"?n.mEn:n.m}</div>
            <div style={{fontSize:10,color:C.muted,marginTop:4}}>{lang==="en"?n.timeEn:n.time}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
