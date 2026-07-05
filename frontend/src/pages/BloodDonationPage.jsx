import { useContext, useState, useEffect } from "react";
import { useC, useTr, LangCtx } from "../contexts";
import { T } from "../constants/translations";
import { DONORS, BLOOD_GROUPS, BG_COL_MAP } from "../constants/data";
import { blood as bloodApi } from "../api";
import BloodDonorMap from "./BloodDonorMap";

export default function BloodDonationPage() {
  const C=useC(); const tr=useTr(); const lang=useContext(LangCtx)===T.en?"en":"bn";
  const [tab,setTab]=useState("donors"); // donors | request | become
  const [bgFilter,setBgFilter]=useState("all");
  const [reqBg,setReqBg]=useState("");
  const [reqMsg,setReqMsg]=useState("");
  const [reqName,setReqName]=useState("");
  const [sent,setSent]=useState(false);
  const [sending,setSending]=useState(false);
  const [contacted,setContacted]=useState(()=>JSON.parse(localStorage.getItem("imap_blood_contacted")||"[]"));
  const [donors,setDonors]=useState(DONORS);
  const [donorsLoading,setDonorsLoading]=useState(false);

  useEffect(()=>{
    setDonorsLoading(true);
    bloodApi.getDonors(bgFilter==="all"?null:bgFilter)
      .then(r=>{ if(r?.donors?.length) setDonors(r.donors); })
      .catch(()=>{})
      .finally(()=>setDonorsLoading(false));
  },[bgFilter]);

  const filtered=donors;

  const sendRequest=async()=>{
    if(!reqBg||!reqName.trim()||sending) return;
    setSending(true);
    try{
      await bloodApi.request({blood_group:reqBg, name:reqName, message:reqMsg});
      setSent(true);
      setTimeout(()=>setSent(false),3000);
      setReqBg(""); setReqMsg(""); setReqName("");
    }catch(e){
      alert(lang==="en"?`Request failed: ${e.data?.error||e.message||"Please try again."}`:`অনুরোধ ব্যর্থ: ${e.data?.error||e.message||"আবার চেষ্টা করুন।"}`);
    }finally{
      setSending(false);
    }
  };

  const GROUP_COMPAT={"A+":["A+","AB+"],"A-":["A+","A-","AB+","AB-"],"B+":["B+","AB+"],"B-":["B+","B-","AB+","AB-"],"AB+":["AB+"],"AB-":["AB+","AB-"],"O+":["A+","B+","AB+","O+"],"O-":["A+","A-","B+","B-","AB+","AB-","O+","O-"]};

  return (
    <div>
      {/* Hero */}
      <div style={{background:"linear-gradient(135deg,#DC2626,#991B1B)",borderRadius:18,padding:"22px 20px",marginBottom:20,color:"#fff",position:"relative",overflow:"hidden"}}>
        <div style={{fontSize:22,fontWeight:800,marginBottom:4}}>{tr.bdTitle}</div>
        <div style={{fontSize:13,opacity:.85,marginBottom:16}}>{tr.bdSub}</div>
        <div style={{display:"flex",gap:16}}>
          {[["🩸",donors.length,lang==="en"?"Donors":"ডোনার"],["✅",donors.filter(d=>d.avail).length,lang==="en"?"Available":"উপলব্ধ"],["💉",donors.reduce((s,d)=>s+d.dons,0),lang==="en"?"Total Donated":"মোট দান"]].map(([ic,n,lbl])=>(
            <div key={lbl} style={{textAlign:"center"}}>
              <div style={{fontSize:20,fontWeight:800}}>{n}</div>
              <div style={{fontSize:10,opacity:.8}}>{ic} {lbl}</div>
            </div>
          ))}
        </div>
        <div style={{position:"absolute",right:-20,top:-20,width:100,height:100,borderRadius:"50%",background:"rgba(255,255,255,.07)"}}/>        
        <div style={{position:"absolute",right:30,bottom:-35,width:80,height:80,borderRadius:"50%",background:"rgba(255,255,255,.05)"}}/>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:8,marginBottom:20,background:C.card,borderRadius:14,padding:5,border:`1px solid ${C.bdr}`}}>
        {[["donors",tr.bdDonors,"🩸"],["request",tr.bdReq,"📋"],["become",tr.bdBecome,"❤️"],["map",lang==="en"?"Map":"মানচিত্র","🗺️"]].map(([id,lbl,ic])=>(
          <button key={id} onClick={()=>setTab(id)} style={{flex:1,padding:"9px 6px",borderRadius:10,border:"none",background:tab===id?"#DC2626":"transparent",color:tab===id?"#fff":C.sub,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif",transition:"all .15s"}}>{ic} {lbl}</button>
        ))}
      </div>

      {/* DONOR LIST TAB */}
      {tab==="donors"&&(
        <div>
          {/* Blood group filter */}
          <div className="sx" style={{display:"flex",gap:7,marginBottom:16,paddingBottom:2}}>
            {["all",...BLOOD_GROUPS].map(bg=>(
              <button key={bg} onClick={()=>setBgFilter(bg)}
                style={{flexShrink:0,padding:"6px 13px",borderRadius:20,border:`1.5px solid ${bgFilter===bg?"#DC2626":C.bdr}`,background:bgFilter===bg?"#DC2626":C.card,color:bgFilter===bg?"#fff":C.sub,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>
                {bg==="all"?tr.bdAllGroup:bg}
              </button>
            ))}
          </div>

          {/* Compatibility tip */}
          {bgFilter!=="all"&&(
            <div style={{background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.25)",borderRadius:10,padding:"9px 13px",marginBottom:14,fontSize:12,color:"#991B1B"}}>
              🩸 <strong>{bgFilter}</strong> {lang==="en"?"can donate to:":"দিতে পারবেন:"} <strong>{(GROUP_COMPAT[bgFilter]||[]).join(", ")}</strong>
            </div>
          )}

          {/* Donor cards */}
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {filtered.map((d,i)=>{
              const name=lang==="en"?d.nameEn:d.name;
              const loc=lang==="en"?d.locEn:d.loc;
              const contacted_=contacted.includes(d.id);
              return (
                <div key={d.id} className="card fu" style={{animationDelay:`${i*.06}s`,padding:"14px 16px",display:"flex",alignItems:"center",gap:14,opacity:d.avail?1:.6}}>
                  {/* Blood group badge */}
                  <div style={{width:46,height:46,borderRadius:12,background:d.avail?"#DC2626":"#9CA3AF",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:"#fff",fontWeight:800,fontSize:14}}>{d.bg}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:14,color:C.text}}>{name}</div>
                    <div style={{fontSize:12,color:C.muted,marginTop:2}}>📍 {loc} · {d.dist} {tr.bdDist}</div>
                    <div style={{fontSize:11,color:C.sub,marginTop:2}}>💉 {d.dons} {tr.bdDong} · {tr.bdLastDon}: {d.lastDon} {lang==="en"?"mo ago":"মাস আগে"}</div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:5,flexShrink:0}}>
                    {d.avail
                      ?<span style={{fontSize:10,background:"rgba(16,185,129,.15)",color:"#065F46",borderRadius:6,padding:"2px 7px",fontWeight:700}}>✓ {tr.bdAvail}</span>
                      :<span style={{fontSize:10,background:"rgba(0,0,0,.08)",color:C.muted,borderRadius:6,padding:"2px 7px",fontWeight:600}}>⏸ Unavailable</span>
                    }
                    {d.avail&&(
                      <button onClick={()=>{
                        const next=contacted_?contacted.filter(x=>x!==d.id):[...contacted,d.id];
                        setContacted(next);
                        localStorage.setItem("imap_blood_contacted",JSON.stringify(next));
                      }}
                        style={{padding:"5px 11px",borderRadius:8,border:`1.5px solid ${contacted_?"#DC2626":C.bdr}`,background:contacted_?"#DC2626":C.card,color:contacted_?"#fff":C.text,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>
                        {contacted_?"✓ Sent":tr.bdContact}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* BLOOD REQUEST TAB */}
      {tab==="request"&&(
        <div style={{background:C.card,borderRadius:16,padding:20,border:`1px solid ${C.bdr}`}}>
          <div style={{fontSize:15,fontWeight:700,marginBottom:16,color:C.text}}>🆘 {tr.bdReq}</div>
          {sent&&(
            <div style={{background:"rgba(16,185,129,.12)",borderRadius:12,padding:"12px 16px",marginBottom:16,fontSize:13,color:"#065F46",fontWeight:600,border:"1px solid rgba(16,185,129,.25)"}}>✅ {tr.bdSent}</div>
          )}
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div>
              <div style={{fontSize:12,fontWeight:600,color:C.sub,marginBottom:5}}>{lang==="en"?"Your Name":"আপনার নাম"} *</div>
              <input value={reqName} onChange={e=>setReqName(e.target.value)} placeholder={lang==="en"?"Enter your name":"নাম লিখুন"}
                style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1.5px solid ${C.bdr}`,background:C.bg,color:C.text,fontSize:13,fontFamily:"'Hind Siliguri',sans-serif"}}/>
            </div>
            <div>
              <div style={{fontSize:12,fontWeight:600,color:C.sub,marginBottom:5}}>{lang==="en"?"Blood Group Needed":"প্রয়োজনীয় গ্রুপ"} *</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                {BLOOD_GROUPS.map(bg=>(
                  <button key={bg} onClick={()=>setReqBg(bg)}
                    style={{padding:"7px 15px",borderRadius:10,border:`2px solid ${reqBg===bg?"#DC2626":C.bdr}`,background:reqBg===bg?"#DC2626":C.card,color:reqBg===bg?"#fff":C.text,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>{bg}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={{fontSize:12,fontWeight:600,color:C.sub,marginBottom:5}}>{lang==="en"?"Message (optional)":"বার্তা (ঐচ্ছিক)"}</div>
              <textarea value={reqMsg} onChange={e=>setReqMsg(e.target.value)} rows={3} placeholder={lang==="en"?"Hospital name, urgency, contact...":"হাসপাতাল, জরুরি অবস্থা, যোগাযোগ..."}
                style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1.5px solid ${C.bdr}`,background:C.bg,color:C.text,fontSize:13,fontFamily:"'Hind Siliguri',sans-serif",resize:"vertical"}}/>
            </div>
            <button onClick={sendRequest} disabled={!reqBg||!reqName.trim()||sending}
              style={{width:"100%",padding:"13px",borderRadius:12,background:reqBg&&reqName.trim()&&!sending?"#DC2626":"#ccc",border:"none",color:"#fff",fontSize:14,fontWeight:700,cursor:reqBg&&reqName.trim()&&!sending?"pointer":"default",fontFamily:"'Hind Siliguri',sans-serif"}}>
              {sending?(lang==="en"?"Sending...":"পাঠানো হচ্ছে..."):`🆘 ${tr.bdRequest}`}
            </button>
          </div>
        </div>
      )}

      {/* BECOME DONOR TAB */}
      {tab==="become"&&(
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {/* Steps */}
          {[["1","💉",lang==="en"?"Check Eligibility":"যোগ্যতা যাচাই",lang==="en"?"18–60 years, weight 50kg+, healthy":"১৮–৬০ বছর, ওজন ৫০কেজি+, সুস্বাস্থ্য"],["2","🏥",lang==="en"?"Visit a Blood Bank":"ব্লাড ব্যাংক যান",lang==="en"?"Nearest government hospital or SANBS center":"নিকটস্থ সরকারি হাসপাতাল বা SANBS কেন্দ্র"],["3","✅",lang==="en"?"Register & Donate":"নিবন্ধন ও দান",lang==="en"?"Process takes ~30 min. Free certificate issued.":"প্রক্রিয়া ~৩০ মিনিট। বিনামূল্যে সার্টিফিকেট দেওয়া হয়।"]].map(([n,ic,t,d])=>(
            <div key={n} style={{display:"flex",gap:14,alignItems:"flex-start",background:C.card,borderRadius:14,padding:"14px 16px",border:`1px solid ${C.bdr}`}}>
              <div style={{width:38,height:38,borderRadius:"50%",background:"#DC2626",color:"#fff",fontWeight:800,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{ic}</div>
              <div>
                <div style={{fontWeight:700,fontSize:14,color:C.text}}>{t}</div>
                <div style={{fontSize:12,color:C.muted,marginTop:3,lineHeight:1.6}}>{d}</div>
              </div>
            </div>
          ))}
          {/* Benefits */}
          <div style={{background:"rgba(239,68,68,.08)",borderRadius:14,padding:"16px",border:"1px solid rgba(239,68,68,.2)"}}>
            <div style={{fontWeight:700,fontSize:13,color:"#991B1B",marginBottom:10}}>❤️ {lang==="en"?"Benefits of Donating":"দানের সুবিধা"}</div>
            {(lang==="en"?
              ["🩺 Free health check-up","💪 Burns 650 calories per donation","🛡️ Reduces heart disease risk","🏅 Donor certificate & badge","📞 Priority in emergency requests"]
              :["🩺 বিনামূল্যে স্বাস্থ্য পরীক্ষা","💪 প্রতি দানে ৬৫০ ক্যালোরি বার্ন","🛡️ হার্ট রোগের ঝুঁকি কমে","🏅 ডোনার সার্টিফিকেট ও ব্যাজ","📞 জরুরি অনুরোধে অগ্রাধিকার"]
            ).map((b,i)=>(
              <div key={i} style={{fontSize:13,color:C.text,padding:"5px 0",borderBottom:i<4?`1px dashed ${C.bdr}`:"none"}}>{b}</div>
            ))}
          </div>
          <button style={{width:"100%",padding:"14px",borderRadius:14,background:"#DC2626",border:"none",color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>
            ❤️ {tr.bdBecome}
          </button>
        </div>
      )}

      {/* BLOOD DONOR MAP TAB */}
      {tab==="map"&&(
        <div>
          <div style={{fontSize:13,color:"#666",marginBottom:12}}>🗺️ {lang==="en"?`${donors.length} donors in Dhaka`:`ঢাকায় ${donors.length} জন ডোনার`}</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:12}}>
            {Object.entries(BG_COL_MAP).map(([bg,col])=>(
              <span key={bg} style={{display:"flex",alignItems:"center",gap:4,fontSize:12,fontWeight:700}}>
                <span style={{width:13,height:13,borderRadius:"50%",background:col,display:"inline-block",flexShrink:0}}/>{bg}
              </span>
            ))}
          </div>
          <BloodDonorMap donors={donors} lang={lang}/>
          <div style={{fontSize:11,color:"#888",marginTop:8,textAlign:"center"}}>
            {lang==="en"?"Tap a pin to see donor info & call":"পিনে ট্যাপ করুন — ডোনারের তথ্য ও কল বাটন দেখুন"}
          </div>
        </div>
      )}
    </div>
  );
}
