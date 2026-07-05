import { useState, useEffect, useContext } from "react";
import { useC, useTr, LangCtx } from "../contexts";
import { T } from "../constants/translations";
import { disaster as disasterApi } from "../api";

const ALERTS=[
  {id:1,type:"flood",icon:"🌊",level:"high",titleBn:"বন্যা সতর্কতা — সিলেট, সুনামগঞ্জ",titleEn:"Flood Warning — Sylhet, Sunamganj",descBn:"নদীর পানি বিপদসীমার ওপরে। নিচু এলাকার বাসিন্দারা নিরাপদ স্থানে যান।",descEn:"River water above danger level. Residents of low-lying areas should move to safety.",time:"2h ago",color:"#1D4ED8",bg:"#EFF6FF"},
  {id:2,type:"cyclone",icon:"🌀",level:"extreme",titleBn:"ঘূর্ণিঝড় সতর্কতা — চাঁদপুর, বরগুনা",titleEn:"Cyclone Alert — Chandpur, Barguna",descBn:"ঘণ্টায় ১৫০–১৮০ কিমি বেগে বাতাস। সমুদ্র সননিকট এলাকা খালি করুন।",descEn:"Winds at 150–180 km/h. Evacuate coastal areas immediately.",time:"30m ago",color:"#7C3AED",bg:"#F5F3FF"},
  {id:3,type:"earthquake",icon:"🌍",level:"moderate",titleBn:"ভূমিকম্প — মাতামাতা, চট্টগ্রাম",titleEn:"Earthquake — Matamuhuri, Chattogram",descBn:"4.2 মাত্রার ভূমিকম্প অনুভূত। ভবন ছেড়ে খোলা জায়গায় আশ্রয় নিন।",descEn:"4.2 magnitude felt. Move to open areas away from buildings.",time:"1h ago",color:"#D97706",bg:"#FFFBEB"},
];
const SHELTERS=[
  {name:"ঢাকা স্টেডিয়াম শেল্টার",nameEn:"Dhaka Stadium Shelter",cap:2000,dist:1.2},
  {name:"মিরপুর শিক্ষা সংস্থা কেন্দ্র",nameEn:"Mirpur Education Centre",cap:800,dist:2.1},
  {name:"উত্তরা কমিউনিটি হল",nameEn:"Uttara Community Hall",cap:500,dist:3.8},
];
const HOTLINES=[
  {label:"999",desc:"Police / Fire / Ambulance",icon:"🚨"},
  {label:"10941",desc:"Flood Helpline (BWDB)",icon:"🌊"},
  {label:"01755-614420",desc:"DDM Emergency",icon:"🌀"},
  {label:"16321",desc:"Red Crescent Helpline",icon:"❤️"},
];
export default function DisasterPage() {
  const C=useC(); const tr=useTr(); const lang=useContext(LangCtx)===T.en?"en":"bn";
  const [tab,setTab]=useState("alerts"); // alerts | shelters | tips | report
  const [reported,setReported]=useState(false);
  const [reporting,setReporting]=useState(false);
  const [shared,setShared]=useState(false);
  const [repType,setRepType]=useState("");
  const [repDesc,setRepDesc]=useState("");
  const [alerts,setAlerts]=useState(ALERTS);

  useEffect(()=>{
    disasterApi.getAlerts()
      .then(r=>{
        if(r?.alerts?.length){
          // Normalize DB rows to match ALERTS format
          const mapped=r.alerts.map(a=>({
            id:a.id,
            icon:a.type==="flood"?"🌊":a.type==="cyclone"?"🌀":a.type==="fire"?"🔥":a.type==="earthquake"?"🏚️":"⚠️",
            level:a.severity==="critical"?"extreme":a.severity==="high"?"high":"moderate",
            color:a.severity==="critical"?"#DC2626":a.severity==="high"?"#D97706":"#006A4E",
            bg:a.severity==="critical"?"#FEF2F2":a.severity==="high"?"#FFFBEB":"#F0FDF4",
            titleBn:a.type+" – "+a.area,
            titleEn:a.type+" – "+a.area,
            descBn:a.description||"",
            descEn:a.description||"",
            time:new Date(a.created_at).toLocaleString("bn-BD"),
          }));
          setAlerts(mapped);
        }
      })
      .catch(()=>{});
  },[]);

  const sendReport=async()=>{
    if(!repType||reporting) return;
    setReporting(true);
    const rawType=repType.replace(/^[^\s]+\s/,"").toLowerCase(); // strip emoji
    try{
      await disasterApi.report(rawType, repDesc, "", "high");
      setReported(true);
      setTimeout(()=>{setReported(false);setRepType("");setRepDesc("");},3000);
    }catch(e){
      alert(lang==="en"?`Report failed: ${e.data?.error||e.message||"Please try again."}`:`রিপোর্ট ব্যর্থ: ${e.data?.error||e.message||"আবার চেষ্টা করুন।"}`);
    }finally{
      setReporting(false);
    }
  };
  const TIPS_BN=[

    ["🌪️ ঘূর্ণিঝড়",["পাকা ঘরে থাকুন","🔋 শেয়ারযোগ্য ইন্ধন সংগ্রহ করুন","👰️ সরকারি নির্দেশ মানুন","📱 ডিভাইস চার্জ দিয়ে রাখুন"]],
    ["🌊 বন্যা",["দোতলায় উঠুন","পানির বোতল সংগ্রহ করুন","বিদ্যুৎ সুইচ অফ করুন","পোষা প্রাণী সাথে নিন"]],
    ["🌍 ভূমিকম্প",["টেবিলের নীচে আশ্রয় নিন","जানালা থেকে দূরে থাকুন","লিফট ব্যবহার না করুন","শান্ত থাকুন ও দলের সাথে বেরিয়ে পড়ুন"]],
  ];
  const TIPS_EN=[
    ["🌪️ Cyclone",["Stay in a sturdy building","⚡ Store charged devices","👮 Follow government orders","📱 Keep devices charged"]],
    ["🌊 Flood",["Move to higher floors","Store bottled water","Turn off electricity mains","Take pets with you"]],
    ["🌍 Earthquake",["Take cover under a table","Stay away from windows","Do not use elevators","Stay calm and exit with your group"]],
  ];
  const TIPS=lang==="en"?TIPS_EN:TIPS_BN;

  const LEVEL_COL={high:"#D97706",extreme:"#DC2626",moderate:"#006A4E"};
  const LEVEL_LBL={high:lang==="en"?"HIGH":"তীব্র",extreme:lang==="en"?"EXTREME":"জরুরি",moderate:lang==="en"?"MODERATE":"মাধ্যম"};

  const REPORT_TYPES=lang==="en"
    ?["🌊 Flood","🌀 Cyclone","🔥 Fire","🏚️ Building Collapse","⚡ Power Outage","🚗 Road Block"]
    :["🌊 বন্যা","🌀 ঘূর্ণিঝড়","🔥 আগুন","🏠 ভবন ধস","⚡ বিদ্যুৎ বিচ্ছিন্ন","🚗 রাস্তা বন্ধ"];

  return (
    <div>
      {/* Hero */}
      <div style={{background:"linear-gradient(135deg,#7F1D1D,#DC2626)",borderRadius:18,padding:"20px",marginBottom:20,color:"#fff",position:"relative",overflow:"hidden"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
          <span style={{fontSize:28,animation:"pulse 2s infinite"}}>🚨</span>
          <div style={{fontSize:21,fontWeight:800}}>{tr.dsTitle}</div>
        </div>
        <div style={{fontSize:13,opacity:.85,marginBottom:14}}>{tr.dsActive}: <strong>{alerts.length}</strong></div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={()=>{setShared(true);setTimeout(()=>setShared(false),2000);}}
            style={{padding:"7px 14px",borderRadius:10,background:"rgba(255,255,255,.2)",border:"1.5px solid rgba(255,255,255,.5)",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>
            {shared?"✅ "+tr.dsShared:"📍 "+tr.dsShare}
          </button>
          <a href="tel:999" style={{
            padding:"7px 14px",borderRadius:10,
            background:"rgba(255,255,255,.18)",border:"1.5px solid rgba(255,255,255,.5)",
            backdropFilter:"blur(2px)",WebkitBackdropFilter:"blur(2px)",
            color:"#fff",fontSize:12,fontWeight:800,cursor:"pointer",
            fontFamily:"'Hind Siliguri',sans-serif",textDecoration:"none",
            display:"flex",alignItems:"center",gap:5,
            boxShadow:"0 4px 14px rgba(0,0,0,.15)"
          }}>
            🚨 999
          </a>
        </div>
        <div style={{position:"absolute",right:-16,top:-16,width:80,height:80,borderRadius:"50%",background:"rgba(255,255,255,.08)"}}/>       
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:6,marginBottom:20,background:C.card,borderRadius:14,padding:5,border:`1px solid ${C.bdr}`}}>
        {[["alerts","🚨",lang==="en"?"Alerts":"সতর্ক"],["shelters","🏕️",lang==="en"?"Shelters":"আশ্রয়"],["tips","💡",lang==="en"?"Tips":"টিপস"],["report","📋",lang==="en"?"Report":"রিপোর্ট"]].map(([id,ic,lbl])=>(
          <button key={id} onClick={()=>setTab(id)}
            style={{flex:1,padding:"8px 4px",borderRadius:10,border:"none",background:tab===id?"#DC2626":"transparent",color:tab===id?"#fff":C.sub,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif",transition:"all .15s"}}>{ic} {lbl}</button>
        ))}
      </div>

      {/* ALERTS TAB */}
      {tab==="alerts"&&(
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {alerts.length===0&&(
            <div style={{textAlign:"center",padding:"40px 20px",color:C.muted}}>
              <div style={{fontSize:48,marginBottom:8}}>✅</div>
              <div>{tr.dsNoAlert}</div>
            </div>
          )}
          {alerts.map((a,i)=>(
            <div key={a.id} className="card fu" style={{animationDelay:`${i*.07}s`,padding:"16px",borderLeft:`4px solid ${a.color}`,background:a.bg}}>
              <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
                <div style={{fontSize:28,flexShrink:0,animation:a.level==="extreme"?"pulse 1.5s infinite":"none"}}>{a.icon}</div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                    <span style={{fontSize:11,fontWeight:800,background:LEVEL_COL[a.level],color:"#fff",borderRadius:6,padding:"2px 8px"}}>{LEVEL_LBL[a.level]}</span>
                    <span style={{fontSize:11,color:C.muted}}>{a.time}</span>
                  </div>
                  <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:4}}>{lang==="en"?a.titleEn:a.titleBn}</div>
                  <div style={{fontSize:13,color:C.sub,lineHeight:1.6}}>{lang==="en"?a.descEn:a.descBn}</div>
                </div>
              </div>
            </div>
          ))}
          {/* Hotlines */}
          <div style={{background:C.card,borderRadius:16,padding:"16px",border:`1px solid ${C.bdr}`}}>
            <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:12}}>📞 {tr.dsHotline}</div>
            {HOTLINES.map((h,i)=>(
              <a key={i} href={`tel:${h.label}`} style={{display:"flex",alignItems:"center",gap:12,padding:"9px 0",borderBottom:i<HOTLINES.length-1?`1px solid ${C.bdr}`:"none",textDecoration:"none"}}>
                <span style={{fontSize:18}}>{h.icon}</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:800,color:"#DC2626"}}>{h.label}</div>
                  <div style={{fontSize:12,color:C.muted}}>{h.desc}</div>
                </div>
                <span style={{fontSize:12,color:C.p,fontWeight:700}}>{lang==="en"?"Call":"কল"} →</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* SHELTERS TAB */}
      {tab==="shelters"&&(
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {SHELTERS.map((s,i)=>(
            <div key={i} className="card fu" style={{animationDelay:`${i*.07}s`,padding:"16px",display:"flex",gap:14,alignItems:"center"}}>
              <div style={{width:44,height:44,borderRadius:12,background:"linear-gradient(135deg,#006A4E,#004D38)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>🏕️</div>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:700,color:C.text}}>{lang==="en"?s.nameEn:s.name}</div>
                <div style={{fontSize:12,color:C.muted,marginTop:3}}>👥 {s.cap.toLocaleString()} {lang==="en"?"capacity":"জন’র ধারণ ক্ষমতা"} · 📍 {s.dist} km</div>
              </div>
              <button style={{padding:"7px 13px",borderRadius:9,background:C.p,border:"none",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>{lang==="en"?"Navigate":"যান"}</button>
            </div>
          ))}
          <div style={{background:"rgba(16,185,129,.1)",borderRadius:14,padding:"14px 16px",border:"1px solid rgba(16,185,129,.3)",fontSize:13,color:"#065F46",display:"flex",alignItems:"flex-start",gap:10,marginTop:4}}>
            <span style={{fontSize:20}}>ℹ️</span>
            <div style={{lineHeight:1.6}}>{lang==="en"?"All shelters are government-approved and stocked with food, water and medical supplies.":"সকল আশ্রয়কেন্দ্র সরকারি অনুমোদিত এবং খাদ্য, পানি ও চিকিৎসা সরবরাহদে সজ্জিত।"}</div>
          </div>
        </div>
      )}

      {/* TIPS TAB */}
      {tab==="tips"&&(
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {TIPS.map(([disaster,tips],i)=>(
            <div key={i} className="card" style={{padding:"16px"}}>
              <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:10}}>{disaster}</div>
              {tips.map((tip,j)=>(
                <div key={j} style={{display:"flex",alignItems:"flex-start",gap:9,padding:"6px 0",borderBottom:j<tips.length-1?`1px dashed ${C.bdr}`:"none",fontSize:13,color:C.sub,lineHeight:1.6}}>
                  <span style={{color:C.p,fontWeight:800,flexShrink:0}}>•</span>{tip}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* REPORT TAB */}
      {tab==="report"&&(
        <div style={{background:C.card,borderRadius:16,padding:20,border:`1px solid ${C.bdr}`}}>
          <div style={{fontSize:15,fontWeight:700,marginBottom:16,color:C.text}}>📋 {tr.dsReportBtn}</div>
          {reported&&(
            <div style={{background:"rgba(16,185,129,.12)",borderRadius:12,padding:"12px 16px",marginBottom:16,fontSize:13,color:"#065F46",fontWeight:600,border:"1px solid rgba(16,185,129,.25)"}}>✅ {tr.dsReported}</div>
          )}
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div>
              <div style={{fontSize:12,fontWeight:600,color:C.sub,marginBottom:8}}>{lang==="en"?"Incident Type":"ঘটনার ধরন"} *</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                {REPORT_TYPES.map((t,i)=>(
                  <button key={i} onClick={()=>setRepType(t)}
                    style={{padding:"7px 13px",borderRadius:10,border:`2px solid ${repType===t?"#DC2626":C.bdr}`,background:repType===t?"#DC2626":C.card,color:repType===t?"#fff":C.text,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>{t}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={{fontSize:12,fontWeight:600,color:C.sub,marginBottom:6}}>{lang==="en"?"Description (optional)":"বর্ণনা (ঐচ্ছিক)"}</div>
              <textarea value={repDesc} onChange={e=>setRepDesc(e.target.value)} rows={3}
                placeholder={lang==="en"?"Location, severity, people affected...":"স্থান, মাত্রা, কতজন ক্ষতিগ্রস্ত..."}
                style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1.5px solid ${C.bdr}`,background:C.bg,color:C.text,fontSize:13,fontFamily:"'Hind Siliguri',sans-serif",resize:"vertical"}}/>
            </div>
            <button onClick={sendReport} disabled={!repType||reporting}
              style={{width:"100%",padding:"13px",borderRadius:12,background:repType&&!reporting?"#DC2626":"#ccc",border:"none",color:"#fff",fontSize:14,fontWeight:700,cursor:repType&&!reporting?"pointer":"default",fontFamily:"'Hind Siliguri',sans-serif"}}>
              {reporting?(lang==="en"?"Submitting...":"পাঠানো হচ্ছে..."):`🚨 ${tr.dsReportBtn}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
