import { useState, useEffect } from "react";
import { C_LIGHT, C_DARK } from "../constants/theme";
import { T } from "../constants/translations";
import { kyc as kycApi, upload as uploadApi } from "../api";

export default function KYCPage({user,onClose,dark,lang,onUpdate}){
  const C  = dark ? C_DARK : C_LIGHT;
  const tr = T[lang]||T.bn;

  const DOC_TYPES=[
    {key:"nid",   icon:"🪪", lbn:"জাতীয় পরিচয়পত্র (NID)", len:"National ID (NID)"},
    {key:"driving",icon:"🚗", lbn:"ড্রাইভিং লাইসেন্স",      len:"Driving Licence"},
    {key:"passport",icon:"📘", lbn:"পাসপোর্ট",              len:"Passport"},
    {key:"birth", icon:"📜", lbn:"জন্ম নিবন্ধন সনদ",         len:"Birth Certificate"},
  ];

  const [docs,setDocs]=useState([]);
  const [loading,setLoading]=useState(true);
  const [adding,setAdding]=useState(false);
  const [selType,setSelType]=useState("nid");
  const [docNum,setDocNum]=useState("");
  const [imgFront,  setImgFront]  = useState(null);
  const [imgBack,   setImgBack]   = useState(null);
  const [imgSelfie, setImgSelfie] = useState(null);
  const [submitting,setSubmitting]=useState(false);
  const [toast,setToast]=useState("");

  const showToast=m=>{setToast(m);setTimeout(()=>setToast(""),2400);};

  // Load KYC docs from backend
  useEffect(()=>{
    kycApi.get().then(data=>{
      setDocs(Array.isArray(data)?data:(data.docs||[]));
    }).catch(()=>{
      // Fallback: try localStorage
      const saved=JSON.parse(localStorage.getItem("imap_kyc_"+(user.id||"guest"))||"[]");
      setDocs(saved);
    }).finally(()=>setLoading(false));
  },[]);

  const submitDoc=async()=>{
    if(!docNum.trim()){showToast(lang==="bn"?"নথি নম্বর দিন":"Enter document number");return;}
    if(!imgFront){showToast(lang==="bn"?"সামনের ছবি আপলোড করুন":"Upload front side");return;}
    setSubmitting(true);
    try{
      // Prefer multipart upload (works with R2 or base64 fallback)
      const fd = new FormData();
      fd.append("nid_front", imgFront);
      if(imgBack)   fd.append("nid_back", imgBack);
      if(imgSelfie) fd.append("selfie", imgSelfie);
      fd.append("doc_type",   selType);
      fd.append("doc_number", docNum.trim());
      await uploadApi.kyc({ nid_front: imgFront, nid_back: imgBack, selfie: imgSelfie, doc_type: selType, doc_number: docNum.trim() });
      // Refresh docs list from server
      const data=await kycApi.get();
      setDocs(Array.isArray(data)?data:(data.docs||[]));
      setAdding(false);
      setDocNum("");setImgFront(null);setImgBack(null);setImgSelfie(null);
      // Update user kycStatus in localStorage
      const u=JSON.parse(localStorage.getItem("imap_user")||"null");
      if(u){u.kycStatus="pending";localStorage.setItem("imap_user",JSON.stringify(u));if(onUpdate)onUpdate(u);}
      showToast(tr.kycSubmitted);
    }catch(e){
      // Fallback: submit via JSON with correct field names
      try{
        const toBase64=file=>new Promise((res,rej)=>{
          const r=new FileReader();r.onload=e=>res(e.target.result);r.onerror=rej;r.readAsDataURL(file);
        });
        const frontB64 = await toBase64(imgFront);
        const backB64  = imgBack   ? await toBase64(imgBack)   : null;
        const selfB64  = imgSelfie ? await toBase64(imgSelfie) : null;
        await kycApi.submit({
          doc_type:    selType,
          doc_number:  docNum.trim(),
          front_image: frontB64,
          back_image:  backB64,
          selfie_image:selfB64,
        });
        const data=await kycApi.get();
        setDocs(Array.isArray(data)?data:(data.docs||[]));
        setAdding(false);
        setDocNum("");setImgFront(null);setImgBack(null);setImgSelfie(null);
        const u=JSON.parse(localStorage.getItem("imap_user")||"null");
        if(u){u.kycStatus="pending";localStorage.setItem("imap_user",JSON.stringify(u));if(onUpdate)onUpdate(u);}
        showToast(tr.kycSubmitted);
      }catch(e2){
        showToast(e2.data?.error||(lang==="bn"?"দাখিল ব্যর্থ হয়েছে":"Submission failed"));
      }
    }finally{
      setSubmitting(false);
    }
  };

  const statusBadge=(s)=>{
    const m={pending:{bg:"#FEF3C7",col:"#92400E",icon:"⏳",lbn:"যাচাই চলছে",len:"Pending"},
      verified:{bg:"#D1FAE5",col:"#065F46",icon:"✅",lbn:"যাচাইকৃত",len:"Verified"},
      rejected:{bg:"#FEE2E2",col:"#991B1B",icon:"❌",lbn:"প্রত্যাখ্যাত",len:"Rejected"},
      not_submitted:{bg:"#F3F4F6",col:"#4B5563",icon:"📋",lbn:"দাখিল হয়নি",len:"Not Submitted"}};
    const item=m[s]||m.not_submitted;
    return <span style={{background:item.bg,color:item.col,borderRadius:20,padding:"4px 12px",fontSize:11,fontWeight:700}}>{item.icon} {lang==="bn"?item.lbn:item.len}</span>;
  };

  const UploadBtn=({field,label,value,setter})=>{
    const preview = value ? URL.createObjectURL(value) : null;
    return (
      <label style={{flex:1,padding:"14px 10px",borderRadius:12,border:`2px dashed ${value?C.p:C.bdr}`,background:value?C.plt:C.bg,cursor:"pointer",textAlign:"center",transition:"all .2s",display:"block"}}>
        <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{
          const f=e.target.files[0]; if(!f) return;
          setter(f);
        }}/>
        {preview
          ? <img src={preview} alt="preview" style={{width:"100%",height:56,objectFit:"cover",borderRadius:8,marginBottom:4}}/>
          : <div style={{fontSize:22,marginBottom:4}}>📷</div>}
        <div style={{fontSize:11,fontWeight:600,color:value?C.p:C.muted}}>{value?tr.kycUploaded:label}</div>
      </label>
    );
  };

  return(
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'Hind Siliguri','Noto Sans Bengali',sans-serif",color:C.text,maxWidth:620,margin:"0 auto",padding:"20px 16px 60px"}}>

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:22,paddingTop:8}}>
        <button onClick={onClose} style={{background:C.card,border:`1px solid ${C.bdr}`,borderRadius:10,width:38,height:38,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>←</button>
        <div>
          <div style={{fontWeight:800,fontSize:18}}>🛡️ {tr.kycTitle}</div>
          <div style={{fontSize:12,color:C.muted}}>{tr.kycSub}</div>
        </div>
      </div>

      {loading&&<div style={{textAlign:"center",padding:40,color:C.muted}}>⏳ {lang==="bn"?"লোড হচ্ছে...":"Loading..."}</div>}

      {/* Status banner */}
      {!loading&&docs.length>0&&(
        <div style={{background:docs.some(d=>d.status==="verified")?C.plt:docs.some(d=>d.status==="pending")?"#FEF3C7":"#FEE2E2",borderRadius:14,padding:"14px 16px",marginBottom:18,border:`1px solid ${docs.some(d=>d.status==="verified")?C.p:docs.some(d=>d.status==="pending")?"#FCD34D":"#FCA5A5"}`}}>
          <div style={{fontWeight:700,fontSize:13,color:docs.some(d=>d.status==="verified")?C.p:docs.some(d=>d.status==="pending")?"#92400E":"#991B1B"}}>
            {docs.some(d=>d.status==="verified")?"✅ "+tr.kycVerified:docs.some(d=>d.status==="pending")?"⏳ "+tr.kycPending:"❌ "+(lang==="bn"?"কিছু নথি প্রত্যাখ্যাত":"Some docs rejected")}
          </div>
          <div style={{fontSize:11,color:C.muted,marginTop:3}}>{tr.kycNote}</div>
        </div>
      )}

      {/* My submitted docs */}
      {!loading&&docs.length>0&&(
        <div style={{marginBottom:20}}>
          <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>{tr.kycMyDocs}</div>
          {docs.map(doc=>{
            const dtype=DOC_TYPES.find(d=>d.key===(doc.type||doc.doc_type))||DOC_TYPES[0];
            const docStatus=doc.status||"pending";
            const docNumber=doc.doc_number||doc.docNum||"";
            const submittedAt=doc.submitted_at?new Date(doc.submitted_at).toLocaleDateString():doc.submittedAt||"";
            const rejReason=doc.rejection_reason||doc.rejectionReason||"";
            return(
              <div key={doc.id} style={{background:C.card,borderRadius:14,padding:"16px",border:`1px solid ${C.bdr}`,marginBottom:10,borderLeft:`3px solid ${docStatus==="verified"?C.p:docStatus==="pending"?"#F59E0B":"#EF4444"}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:26}}>{dtype.icon}</span>
                    <div>
                      <div style={{fontWeight:700,fontSize:14}}>{lang==="bn"?dtype.lbn:dtype.len}</div>
                      <div style={{fontSize:12,color:C.muted}}>{lang==="bn"?"নথি নম্বর:":"Doc #:"} {docNumber}</div>
                      <div style={{fontSize:11,color:C.muted}}>{lang==="bn"?"দাখিল:":"Submitted:"} {submittedAt}</div>
                    </div>
                  </div>
                  {statusBadge(docStatus)}
                </div>
                {docStatus==="rejected"&&rejReason&&(
                  <div style={{marginTop:10,padding:"8px 12px",background:"#FEF2F2",borderRadius:8,fontSize:12,color:"#991B1B"}}>
                    <b>{tr.kycRejectReason}:</b> {rejReason}
                  </div>
                )}
                {docStatus==="rejected"&&(
                  <button onClick={()=>{setAdding(true);setSelType(doc.type||doc.doc_type||"nid");setDocNum(docNumber);setImgFront("");setImgBack("");setImgSelfie("");}} style={{marginTop:10,padding:"8px 16px",background:"#FEE2E2",color:"#EF4444",border:"none",borderRadius:8,fontSize:12,cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>
                    🔄 {tr.kycResubmit}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add new document */}
      {!loading&&(!adding?(
        <button onClick={()=>setAdding(true)} style={{width:"100%",padding:"14px",background:C.p,color:"#fff",border:"none",borderRadius:14,fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
          ➕ {docs.length===0?tr.kycSubmit:tr.kycAddDoc}
        </button>
      ):(
        <div style={{background:C.card,borderRadius:16,padding:20,border:`2px solid ${C.p}`}}>
          <div style={{fontWeight:700,fontSize:15,marginBottom:16}}>📋 {lang==="bn"?"নথির তথ্য দিন":"Document Details"}</div>

          {/* Doc type selection */}
          <div style={{fontSize:12,color:C.muted,fontWeight:600,marginBottom:8}}>{tr.kycSelectType}</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:16}}>
            {DOC_TYPES.map(dt=>(
              <button key={dt.key} onClick={()=>setSelType(dt.key)} style={{padding:"10px 8px",borderRadius:11,border:`2px solid ${selType===dt.key?C.p:C.bdr}`,background:selType===dt.key?C.plt:C.bg,cursor:"pointer",fontFamily:"inherit",textAlign:"center",transition:"all .2s"}}>
                <div style={{fontSize:20,marginBottom:3}}>{dt.icon}</div>
                <div style={{fontSize:11,fontWeight:700,color:selType===dt.key?C.p:C.text}}>{lang==="bn"?dt.lbn:dt.len}</div>
              </button>
            ))}
          </div>

          {/* Doc number */}
          <div style={{fontSize:12,color:C.muted,fontWeight:600,marginBottom:5}}>{tr.kycDocNumber}</div>
          <input value={docNum} onChange={e=>setDocNum(e.target.value)} placeholder={tr.kycDocNumberPh}
            style={{width:"100%",padding:"12px 14px",border:`1.5px solid ${C.bdr}`,borderRadius:11,fontSize:14,background:C.bg,color:C.text,outline:"none",boxSizing:"border-box",fontFamily:"inherit",marginBottom:14}}/>

          {/* Photo uploads */}
          <div style={{fontSize:12,color:C.muted,fontWeight:600,marginBottom:8}}>{lang==="bn"?"ছবি আপলোড করুন":"Upload Photos"}</div>
          <div style={{display:"flex",gap:8,marginBottom:14}}>
            <UploadBtn field="front" label={tr.kycFront} value={imgFront} setter={setImgFront}/>
            <UploadBtn field="back" label={tr.kycBack} value={imgBack} setter={setImgBack}/>
            <UploadBtn field="selfie" label={tr.kycSelfie} value={imgSelfie} setter={setImgSelfie}/>
          </div>
          <div style={{fontSize:11,color:C.muted,marginBottom:14}}>
            💡 {lang==="bn"?"ছবি নির্বাচন করতে ক্লিক করুন":"Click to select photo files"}
          </div>

          {/* Actions */}
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>{setAdding(false);setDocNum("");setImgFront("");setImgBack("");setImgSelfie("");}} style={{flex:1,padding:"12px",background:C.bg,border:`1px solid ${C.bdr}`,borderRadius:11,fontSize:13,cursor:"pointer",fontFamily:"inherit",color:C.sub,fontWeight:600}}>
              {lang==="bn"?"বাতিল":"Cancel"}
            </button>
            <button onClick={submitDoc} disabled={submitting} style={{flex:2,padding:"12px",background:submitting?"#ccc":C.p,color:"#fff",border:"none",borderRadius:11,fontSize:14,cursor:submitting?"default":"pointer",fontFamily:"inherit",fontWeight:700}}>
              {submitting?"⏳ ...":(tr.kycSubmit)}
            </button>
          </div>
        </div>
      ))}

      {/* Skip */}
      {!loading&&docs.length===0&&!adding&&(
        <div style={{textAlign:"center",marginTop:16}}>
          <span onClick={onClose} style={{fontSize:12,color:C.muted,cursor:"pointer",textDecoration:"underline"}}>{tr.kycSkip}</span>
        </div>
      )}

      {toast&&<div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:C.dark,color:"#fff",padding:"12px 22px",borderRadius:30,fontSize:13,fontWeight:700,zIndex:9999,boxShadow:"0 4px 20px rgba(0,0,0,.2)"}}>{toast}</div>}
    </div>
  );
}

