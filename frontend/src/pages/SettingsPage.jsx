import { useContext, useState } from "react";
import { useC, useTr, LangCtx, useUser } from "../contexts";
import { T } from "../constants/translations";
import { users as usersApi } from "../api";

export default function SettingsPage(){
  const C=useC();const tr=useTr();const lang=useContext(LangCtx)===T.en?"en":"bn";
  const [tab,setTab]=useState("profile");
  const {user:authUser,setUser}=useUser();
  const [name,setName]=useState(authUser?.name||"");
  const [email,setEmail]=useState(authUser?.email||"");
  const [phone,setPhone]=useState(authUser?.phone||"");
  const [notifBook,setNotifBook]=useState(()=>localStorage.getItem("imap_notif_book")!=="false");
  const [notifPromo,setNotifPromo]=useState(()=>localStorage.getItem("imap_notif_promo")!=="false");
  const [notifSms,setNotifSms]=useState(()=>localStorage.getItem("imap_notif_sms")==="true");
  const [privacy2fa,setPrivacy2fa]=useState(()=>localStorage.getItem("imap_2fa")==="true");
  const [privacyLoc,setPrivacyLoc]=useState(()=>localStorage.getItem("imap_loc")!=="false");
  const [saved,setSaved]=useState(false);
  const [saving,setSaving]=useState(false);

  const doSave=async()=>{
    if(saving)return;
    setSaving(true);
    try{
      const profResult=await usersApi.updateProfile({name,email,phone});
      if(profResult?.user) setUser(profResult.user);
      await usersApi.saveSettings({notif_booking:notifBook,notif_promo:notifPromo,notif_sms:notifSms,privacy_2fa:privacy2fa,privacy_location:privacyLoc});
      // persist toggles locally too
      localStorage.setItem("imap_notif_book",String(notifBook));
      localStorage.setItem("imap_notif_promo",String(notifPromo));
      localStorage.setItem("imap_notif_sms",String(notifSms));
      localStorage.setItem("imap_2fa",String(privacy2fa));
      localStorage.setItem("imap_loc",String(privacyLoc));
      setSaved(true);setTimeout(()=>setSaved(false),2500);
    }catch(e){console.warn("settings save:",e.message);}finally{setSaving(false);}
  };

  const Toggle=({val,set})=>(
    <div onClick={()=>set(!val)} style={{width:44,height:24,borderRadius:12,background:val?C.p:C.bdr,position:"relative",cursor:"pointer",transition:"background .2s",flexShrink:0}}>
      <div style={{position:"absolute",top:3,left:val?22:3,width:18,height:18,borderRadius:"50%",background:"#fff",transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,.2)"}}/>
    </div>
  );

  return(
    <div>
      <div style={{display:"flex",gap:8,marginBottom:20,background:C.card,borderRadius:14,padding:5,border:`1px solid ${C.bdr}`}}>
        {[["profile","👤"],[" security","🔐"],["privacy","🔒"],["notifs","🔔"]].map(([id,ic])=>(
          <button key={id} onClick={()=>setTab(id.trim())} style={{flex:1,padding:"9px 4px",borderRadius:10,border:"none",background:tab===id.trim()?C.p:"transparent",color:tab===id.trim()?"#fff":C.sub,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>{ic}</button>
        ))}
      </div>
      {saved&&<div style={{background:"rgba(16,185,129,.12)",borderRadius:12,padding:"10px 16px",marginBottom:14,fontSize:13,color:"#065F46",fontWeight:700,textAlign:"center",border:"1px solid rgba(16,185,129,.3)"}}>{tr.stSaved}</div>}
      {tab==="profile"&&(
        <div style={{background:C.card,borderRadius:16,padding:18,border:`1px solid ${C.bdr}`}}>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",marginBottom:20}}>
            <div style={{width:72,height:72,borderRadius:"50%",background:"linear-gradient(135deg,#006A4E,#004D38)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,marginBottom:10}}>👤</div>
            <div style={{fontSize:15,fontWeight:700,color:C.text}}>{name}</div>
            <div style={{fontSize:12,color:C.muted}}>ID: IMAP-{authUser?.id||"User"}</div>
          </div>
          {[[tr.stProfile+" "+(lang==="en"?"Name":"নাম"),name,setName],[tr.stEmail,email,setEmail],[tr.stPhone,phone,setPhone]].map(([lbl,val,set])=>(
            <div key={lbl} style={{marginBottom:14}}>
              <label style={{fontSize:12,color:C.sub,fontWeight:600,display:"block",marginBottom:5}}>{lbl}</label>
              <input value={val} onChange={e=>set(e.target.value)} style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1.5px solid ${C.bdr}`,background:C.bg,color:C.text,fontSize:13,fontFamily:"'Hind Siliguri',sans-serif",boxSizing:"border-box"}}/>
            </div>
          ))}
          <button onClick={doSave} disabled={saving} style={{width:"100%",padding:"12px",borderRadius:12,background:saving?"#9ca3af":C.p,border:"none",color:"#fff",fontSize:14,fontWeight:700,cursor:saving?"not-allowed":"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>{saving?"⏳ সংরক্ষণ...": tr.stSave}</button>
        </div>
      )}
      {tab==="security"&&(
        <div style={{background:C.card,borderRadius:16,padding:18,border:`1px solid ${C.bdr}`}}>
          {[{lbl:lang==="en"?"Two-Factor Auth":"দুই ধাপ যাচাই",val:privacy2fa,set:setPrivacy2fa},{lbl:lang==="en"?"Login Alerts":"লগইন সতর্কতা",val:true,set:()=>{}},{lbl:lang==="en"?"Trusted Devices":"বিশ্বস্ত ডিভাইস",val:false,set:()=>{}}].map((item,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:i<2?`1px solid ${C.bdr}`:"none"}}>
              <div style={{fontSize:13,color:C.text,fontWeight:600}}>{item.lbl}</div>
              <Toggle val={item.val} set={item.set}/>
            </div>
          ))}
          <div style={{marginTop:16,padding:"12px 14px",background:"rgba(239,68,68,.08)",borderRadius:12,border:"1px solid rgba(239,68,68,.25)",cursor:"pointer"}}>
            <div style={{fontSize:13,fontWeight:700,color:"#DC2626"}}>🗑️ {tr.stDeleteAcc}</div>
            <div style={{fontSize:11,color:"#9CA3AF",marginTop:3}}>{lang==="en"?"This action cannot be undone":"এই পদক্ষেপ অপরিবর্তনযোগ্য"}</div>
          </div>
        </div>
      )}
      {tab==="privacy"&&(
        <div style={{background:C.card,borderRadius:16,padding:18,border:`1px solid ${C.bdr}`}}>
          {[{lbl:lang==="en"?"Share Location":"লোকেশন শেয়ার",val:privacyLoc,set:setPrivacyLoc},{lbl:lang==="en"?"Profile Visibility":"প্রোফাইল দৃশ্যমানতা",val:true,set:()=>{}},{lbl:lang==="en"?"Activity Status":"অ্যাক্টিভিটি স্ট্যাটাস",val:false,set:()=>{}}].map((item,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:i<2?`1px solid ${C.bdr}`:"none"}}>
              <div style={{fontSize:13,color:C.text,fontWeight:600}}>{item.lbl}</div>
              <Toggle val={item.val} set={item.set}/>
            </div>
          ))}
        </div>
      )}
      {tab==="notifs"&&(
        <div style={{background:C.card,borderRadius:16,padding:18,border:`1px solid ${C.bdr}`}}>
          {[{lbl:lang==="en"?"Booking Updates":"বুকিং আপডেট",val:notifBook,set:setNotifBook},{lbl:lang==="en"?"Promos & Offers":"অফার ও ডিল",val:notifPromo,set:setNotifPromo},{lbl:lang==="en"?"SMS Alerts":"এসএমএস সতর্কতা",val:notifSms,set:setNotifSms}].map((item,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:i<2?`1px solid ${C.bdr}`:"none"}}>
              <div style={{fontSize:13,color:C.text,fontWeight:600}}>{item.lbl}</div>
              <Toggle val={item.val} set={item.set}/>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
