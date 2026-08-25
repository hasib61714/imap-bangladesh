import { useState, useEffect } from "react";
import { useC, useTr, useUser } from "../contexts";
import { T } from "../constants/translations";
import { PBar } from "../components/ui";
import { users as usersApi, kyc as kycApi } from "../api";

export default function NIDPage({onClose}) {
  const C=useC();
  const tr=useTr();
  const {user:authUser}=useUser();
  const [profileStats,setProfileStats]=useState(null);
  const [step,setStep]=useState(0);

  useEffect(()=>{
    usersApi.getProfile()
      .then(d=>{ if(d) setProfileStats(d); })
      .catch(()=>{});
  },[]);
  const [uploads,setUploads]=useState({front:false,back:false,selfie:false});
  const [files,setFiles]=useState({front:null,back:null,selfie:null});
  const [b64,setB64]=useState({front:"",back:"",selfie:""});
  const [scanning,setScanning]=useState(null);
  const [submitting,setSubmitting]=useState(false);
  const [nidExtracted,setNidExtracted]=useState("");
  const trust=87;
  const allUploaded=Object.values(uploads).every(Boolean);

  const toBase64=(file)=>new Promise((res,rej)=>{
    const r=new FileReader();
    r.onload=()=>res(r.result);
    r.onerror=rej;
    r.readAsDataURL(file);
  });

  const handleFileSelect=async(key,file)=>{
    if(!file)return;
    const url=URL.createObjectURL(file);
    setFiles(f=>({...f,[key]:url}));
    setUploads(u=>({...u,[key]:true}));
    try{
      const b64str=await toBase64(file);
      setB64(p=>({...p,[key]:b64str}));
    }catch(e){console.warn("base64 error:",e);}
    // OCR on front side to extract NID number
    if(key==="front"){
      setScanning("front");
      try{
        const {createWorker}=await import("tesseract.js");
        const worker=await createWorker("eng");
        const {data:{text}}=await worker.recognize(file);
        await worker.terminate();
        // Look for 10–17 digit NID pattern
        const match=text.replace(/\s/g,"").match(/\d{10,17}/);
        if(match) setNidExtracted(match[0]);
      }catch(e){console.warn("OCR error:",e.message);}
      setScanning(null);
    }
  };

  const handleSubmitNid=async()=>{
    if(!allUploaded||submitting)return;
    setSubmitting(true);
    try{
      await kycApi.submit({
        doc_type:"nid",
        doc_number:nidExtracted||"UNKNOWN",
        img_front:b64.front,
        img_back:b64.back||null,
        img_selfie:b64.selfie||null,
      });
      setStep(2);
    }catch(e){console.warn("KYC submit:",e?.data?.error||e.message);alert(lang==="en"?"Submission failed — please try again.":"জমা ব্যর্থ হয়েছে — আবার চেষ্টা করুন।");}finally{setSubmitting(false);}
  };

  if(step===2) return (
    <div style={{padding:24,textAlign:"center"}}>
      <div style={{fontSize:64,marginBottom:14}}>✅</div>
      <div style={{fontSize:18,fontWeight:700}}>{tr.nidProcessing}</div>
      <div style={{fontSize:13,color:C.muted,marginTop:6,lineHeight:1.65,whiteSpace:"pre-line"}}>{tr.nidMsg}</div>
      <div style={{background:C.plt,borderRadius:14,padding:16,margin:"16px 0",border:`1px solid ${C.p}30`}}>
        <div style={{fontSize:12,color:C.muted}}>{tr.nidScoreAfter}</div>
        <div style={{fontSize:26,fontWeight:700,color:C.p,marginTop:4}}>100/100 🛡️</div>
      </div>
      <button className="btn btn-g" style={{width:"100%",padding:"13px"}} onClick={onClose||null}>{tr.doneBtn||"Done"}</button>
    </div>
  );
  const lang=tr===T.en?"en":"bn";
  const verified_items=lang==="en"?[["Phone Verified",true],["Email Verified",true],["NID Verified",false],["Photo Verified",false],["Background Check",false]]:[["ফোন নম্বর যাচাই",true],["ইমেইল যাচাই",true],["NID কার্ড যাচাই",false],["ছবি যাচাই",false],["ব্যাকগ্রাউন্ড চেক",false]];
  const joinedDate=profileStats?.joined_at
    ? new Date(profileStats.joined_at).toLocaleDateString(lang==="en"?"en-GB":"bn-BD",{month:"short",year:"numeric"})
    : authUser?.created_at
      ? new Date(authUser.created_at).toLocaleDateString(lang==="en"?"en-GB":"bn-BD",{month:"short",year:"numeric"})
      : (lang==="en"?"Jan 2024":"জানু ২০২৪");
  const profile_stats=[
    ["📋", tr.totalBookings||"Bookings",   profileStats?.total_bookings ?? "—"],
    ["⭐", tr.avgRating   ||"Avg Rating",  "4.8"],
    ["💰", tr.totalSpent  ||"Spent",       profileStats?.total_spent != null ? `৳${Number(profileStats.total_spent).toLocaleString()}` : "—"],
    ["📅", tr.joinedDate  ||"Joined",      joinedDate],
  ];
  return (
    <div style={{padding:24}}>
      <div className="row" style={{justifyContent:"space-between",marginBottom:18}}>
        <div style={{fontSize:17,fontWeight:700}}>🪪 {tr.nidTitle}</div>
        {onClose&&<button className="btn btn-gh" style={{fontSize:20}} onClick={onClose}>✕</button>}
      </div>
      {step===0&&<>
        <div style={{background:`${C.p}10`,borderRadius:14,padding:16,marginBottom:16,border:`1px solid ${C.p}25`}}>
          <div className="row" style={{justifyContent:"space-between",marginBottom:8}}>
            <div style={{fontSize:14,fontWeight:700}}>{tr.trustScoreL}</div>
            <div style={{fontSize:22,fontWeight:700,color:C.p}}>{trust}/100</div>
          </div>
          <PBar v={trust}/>
          <div style={{fontSize:11,color:C.muted,marginTop:6}}>{tr.nidNote}</div>
        </div>
        <div style={{
          background:C.card,borderRadius:13,
          border:`1px solid ${C.bdr}`,overflow:"hidden",marginBottom:16,
          boxShadow:`0 3px 12px rgba(0,0,0,.04)`
        }}>
          {verified_items.map(([l,done],i,arr)=>(
            <div key={i} className="row" style={{padding:"11px 14px",borderBottom:i<arr.length-1?`1px solid ${C.bdr}`:"none",gap:10}}>
              <div className="jc" style={{width:28,height:28,borderRadius:8,background:done?"#D1FAE5":"#FEF9C3",fontSize:13}}>{done?"✅":"⏳"}</div>
              <div style={{flex:1,fontSize:13}}>{l}</div>
              {!done&&<button className="btn btn-g" style={{padding:"5px 10px",fontSize:11}} onClick={()=>setStep(1)}>{tr.verifyBtn}</button>}
            </div>
          ))}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>
          {profile_stats.map(([ic,l,v],i)=>(
            <div key={i} style={{
              background:C.card,borderRadius:11,padding:12,
              border:`1px solid ${C.bdr}`,textAlign:"center",
              boxShadow:`0 2px 8px rgba(0,0,0,.03),inset 0 1px 0 rgba(255,255,255,.4)`
            }}>
              <div style={{fontSize:18,marginBottom:3}}>{ic}</div>
              <div style={{fontSize:14,fontWeight:700,color:C.p}}>{v}</div>
              <div style={{fontSize:11,color:C.muted}}>{l}</div>
            </div>
          ))}
        </div>
      </>}
      {step===1&&<>
        <div style={{background:C.bg,borderRadius:12,padding:12,marginBottom:14,border:`1px solid ${C.bdr}`}}>
          <div style={{fontSize:13,fontWeight:600,marginBottom:5}}>{tr.nidDocsNote}</div>
          <div style={{fontSize:12,color:C.muted,lineHeight:1.8}}>• {tr.nidFront}<br/>• {tr.nidBack}<br/>• {tr.nidSelfie}</div>
        </div>
        {[["front",tr.nidFront],["back",tr.nidBack],["selfie",tr.nidSelfie]].map(([key,label])=>(
          <div key={key} style={{position:"relative"}}>
            <label style={{display:"block",background:uploads[key]?"#D1FAE5":"#fff",borderRadius:13,padding:16,marginBottom:10,border:`2px dashed ${uploads[key]?C.p:C.bdr}`,textAlign:"center",cursor:"pointer",transition:"all .2s"}}>
              <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleFileSelect(key,e.target.files[0])}/>
              {scanning===key
                ?<div style={{fontSize:13,color:C.p,fontWeight:600,padding:"10px 0"}}>🔍 স্ক্যান হচ্ছে...</div>
                :<>
                  {files[key]&&<img src={files[key]} alt="" style={{width:"100%",maxHeight:80,objectFit:"cover",borderRadius:8,marginBottom:6}}/>}
                  <div style={{fontSize:uploads[key]?22:26,marginBottom:4}}>{uploads[key]?"✅":"📤"}</div>
                  <div style={{fontSize:13,fontWeight:600,color:uploads[key]?C.p:C.text}}>{label}</div>
                  <div style={{fontSize:12,color:uploads[key]?"#065F46":C.muted,marginTop:3}}>{uploads[key]?tr.uploadedL:tr.tapUpload}</div>
                </>
              }
            </label>
          </div>
        ))}
        {nidExtracted&&(
          <div style={{background:"rgba(16,185,129,.12)",borderRadius:11,padding:"10px 14px",marginBottom:10,border:"1.5px solid rgba(5,150,105,.4)"}}>
            <div style={{fontSize:11,color:"#065F46",fontWeight:700,marginBottom:2}}>🤖 AI স্ক্যান — NID নম্বর:</div>
            <div style={{fontSize:16,fontWeight:700,letterSpacing:2,color:"#047857"}}>{nidExtracted}</div>
          </div>
        )}
        <div className="row" style={{gap:8,marginTop:4}}>
          <button className="btn btn-gh" style={{flex:1,border:`1px solid ${C.bdr}`}} onClick={()=>setStep(0)}>{tr.backBtn||"← Back"}</button>
          <button className="btn btn-g" style={{flex:2}} onClick={handleSubmitNid} disabled={!allUploaded||!!scanning||submitting}>
            {scanning?"স্ক্যান হচ্ছে...":submitting?"দাখিল হচ্ছে...":tr.submitNid}
          </button>
        </div>
      </>}
    </div>
  );
}
