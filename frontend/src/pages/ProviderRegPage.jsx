import { useContext, useState, Suspense, lazy } from "react";
import Icon from "../components/Icon";
import { useC, useTr, LangCtx } from "../contexts";
import { T } from "../constants/translations";
import { REG_SERVICES } from "../constants/data";
import { users as usersApi, providers as providersApi } from "../api";

const ProviderStanding = lazy(() => import("../components/ProviderStanding"));

export default function ProviderRegPage({onNavigate}){
  const C=useC();const tr=useTr();const lang=useContext(LangCtx)===T.en?"en":"bn";
  const [step,setStep]=useState(1);
  const [name,setName]=useState("");
  const [phone,setPhone]=useState("");
  const [nid,setNid]=useState("");
  const [svc,setSvc]=useState("");
  const [area,setArea]=useState("");
  const [exp,setExp]=useState("1");
  const [done,setDone]=useState(false);
  const [regSubmitting,setRegSubmitting]=useState(false);
  const [newProviderId,setNewProviderId]=useState(null);

  if(done) return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"60px 20px",textAlign:"center"}}>
      <div style={{fontSize:64,marginBottom:16}}><Icon name="success" size={64} /></div>
      <div style={{fontSize:20,fontWeight:800,color:C.p,marginBottom:8}}>{tr.prRegDone}</div>
      {/*
        This screen used to promise a review "within 24–48 hours" — an SLA
        nobody has committed to — and print APP-{last 6 digits of the clock},
        which is not a reference to anything. A provider who quoted it to
        support would be quoting a timestamp.

        What it shows instead is the real remaining work, read from the
        server: TRUST-ARCHITECTURE §5 makes listing a conjunction, and until
        every clause holds this application is not visible to a customer.
      */}
      <div style={{fontSize:13,color:C.sub,marginBottom:20,maxWidth:420}}>
        {lang==="en"
          ? "Your application is in. Here is what is still needed before customers can find you."
          : "আপনার আবেদন জমা হয়েছে। গ্রাহকরা আপনাকে খুঁজে পাওয়ার আগে যা যা বাকি:"}
      </div>
      <div style={{width:"100%",maxWidth:460,textAlign:"left"}}>
        <Suspense fallback={null}>
          <ProviderStanding C={C} lang={lang} providerId={newProviderId}
            onOpenKyc={()=>onNavigate&&onNavigate("_kyc")} />
        </Suspense>
      </div>
    </div>
  );

  return(
    <div>
      <div style={{display:"flex",alignItems:"center",marginBottom:24}}>
        {[1,2,3].map((s,i)=>[
          <div key={s} style={{width:28,height:28,borderRadius:"50%",background:step>=s?C.p:C.bdr,color:step>=s?"#fff":C.sub,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,flexShrink:0}}>{s}</div>,
          i<2&&<div key={"l"+i} style={{flex:1,height:2,background:step>s?C.p:C.bdr,margin:"0 4px"}}/>
        ].flat())}
      </div>
      <div style={{background:C.card,borderRadius:16,padding:18,border:`1px solid ${C.bdr}`}}>
        {step===1&&<>
          <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:14}}>{lang==="en"?"Personal Info":"ব্যক্তিগত তথ্য"}</div>
          {[[tr.prRegName,name,setName,"text"],[tr.prRegPhone,phone,setPhone,"tel"],[tr.prRegNid,nid,setNid,"text"]].map(([lbl,val,set,type])=>(
            <div key={lbl} style={{marginBottom:14}}>
              <label style={{fontSize:12,color:C.sub,fontWeight:600,display:"block",marginBottom:5}}>{lbl}</label>
              <input type={type} value={val} onChange={e=>set(e.target.value)} style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1.5px solid ${C.bdr}`,background:C.bg,color:C.text,fontSize:13,fontFamily:"'Hind Siliguri',sans-serif",boxSizing:"border-box"}}/>
            </div>
          ))}
          <button onClick={()=>(name&&phone&&nid)&&setStep(2)} style={{width:"100%",padding:"12px",borderRadius:12,background:(name&&phone&&nid)?C.p:"#ccc",border:"none",color:C.onP,fontSize:14,fontWeight:700,cursor:(name&&phone&&nid)?"pointer":"default",fontFamily:"'Hind Siliguri',sans-serif"}}>{lang==="en"?"Next →":"পরবর্তী →"}</button>
        </>}
        {step===2&&<>
          <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:14}}>{lang==="en"?"Service Details":"সেবার তথ্য"}</div>
          <div style={{fontSize:12,color:C.sub,fontWeight:600,marginBottom:8}}>{tr.prRegService}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
            {REG_SERVICES.map(s=>(
              <button key={s} onClick={()=>setSvc(s)} style={{padding:"9px 6px",borderRadius:9,border:`2px solid ${svc===s?C.p:C.bdr}`,background:svc===s?C.plt:C.bg,color:svc===s?C.p:C.sub,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>{s}</button>
            ))}
          </div>
          <label style={{fontSize:12,color:C.sub,fontWeight:600,display:"block",marginBottom:6}}>{tr.prRegArea}</label>
          <input value={area} onChange={e=>setArea(e.target.value)} placeholder={lang==="en"?"Dhaka, Chittagong...":"ঢাকা, চট্টগ্রাম..."} style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1.5px solid ${C.bdr}`,background:C.bg,color:C.text,fontSize:13,fontFamily:"'Hind Siliguri',sans-serif",marginBottom:14,boxSizing:"border-box"}}/>
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>setStep(1)} style={{flex:1,padding:"12px",borderRadius:12,background:C.bg,border:`1.5px solid ${C.bdr}`,color:C.sub,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>{lang==="en"?"←":"←"}</button>
            <button onClick={()=>(svc&&area)&&setStep(3)} style={{flex:2,padding:"12px",borderRadius:12,background:(svc&&area)?C.p:"#ccc",border:"none",color:C.onP,fontSize:14,fontWeight:700,cursor:(svc&&area)?"pointer":"default",fontFamily:"'Hind Siliguri',sans-serif"}}>{lang==="en"?"Next →":"পরবর্তী →"}</button>
          </div>
        </>}
        {step===3&&<>
          <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:14}}>{lang==="en"?"Experience":"অভিজ্ঞতা"}</div>
          <label style={{fontSize:12,color:C.sub,fontWeight:600,display:"block",marginBottom:8}}>{tr.prRegExp}</label>
          <div style={{display:"flex",gap:8,marginBottom:20}}>
            {["1","2","3","5","7","10+"].map(y=>(
              <button key={y} onClick={()=>setExp(y)} style={{flex:1,padding:"10px 4px",borderRadius:10,border:`2px solid ${exp===y?C.p:C.bdr}`,background:exp===y?C.plt:C.bg,color:exp===y?C.p:C.sub,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>{y}</button>
            ))}
          </div>
          <div style={{background:C.plt,borderRadius:12,padding:"12px 14px",marginBottom:16,fontSize:12,color:C.sub}}>
            <div style={{fontWeight:700,color:C.text,marginBottom:6}}><Icon name="document" size={14} style={{marginRight:6}} />{lang==="en"?"Summary":"সারসংক্ষেপ"}</div>
            <div><Icon name="user" size={14} style={{marginRight:6}} />{name} • <Icon name="phone" size={12} style={{margin:"0 4px"}} />{phone}</div>
            <div><Icon name="repair" size={14} style={{marginRight:6}} />{svc} • <Icon name="location" size={12} style={{margin:"0 3px"}} />{area} • <Icon name="pending" size={12} style={{margin:"0 3px"}} />{exp} {lang==="en"?"yrs":"বছর"}</div>
          </div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>setStep(2)} style={{flex:1,padding:"12px",borderRadius:12,background:C.bg,border:`1.5px solid ${C.bdr}`,color:C.sub,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>←</button>
            <button onClick={async()=>{
              if(regSubmitting)return;
              setRegSubmitting(true);
              try{await usersApi.updateProfile({name,phone});await providersApi.apply({service_type_en:svc,area_en:area,experience_yrs:parseInt(exp)||1,bio_en:`${svc} provider with ${exp} years experience`});
              // The apply response does not carry the id, and the done screen
              // needs one to read the standing. A failure here costs the panel,
              // not the registration — which already succeeded.
              try{const me=await providersApi.getMe();if(me&&me.id)setNewProviderId(me.id);}catch{/* panel falls back to generic copy */}
              setDone(true);}
              catch(e){console.error("provReg:",e);alert(lang==="en"?"Registration failed. Please try again.":"নিবন্ধন ব্যর্থ হয়েছে। আবার চেষ্টা করুন।");}
              finally{setRegSubmitting(false);}
            }} disabled={regSubmitting} style={{flex:2,padding:"12px",borderRadius:12,background:regSubmitting?"#9ca3af":C.p,border:"none",color:C.onP,fontSize:14,fontWeight:700,cursor:regSubmitting?"not-allowed":"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>{regSubmitting?"⏳ অপেক্ষাকরুন...": tr.prRegSubmit}</button>
          </div>
        </>}
      </div>
    </div>
  );
}
