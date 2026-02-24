import { useState, useEffect, useRef, useCallback, useContext } from "react";
import L from "leaflet";
import { C_LIGHT, C_DARK, CSS, CSS_DARK } from "./constants/theme";
import { T } from "./constants/translations";
import { SVCS, PROVIDERS, MY_BOOKINGS, NOTIFS_DATA } from "./constants/data";
import { ThemeCtx, useC, LangCtx, useTr, FavsCtx, LiveDataCtx, useLiveData, UserCtx, useUser } from "./contexts";
import { Av, Stars, PBar, MiniBar } from "./components/ui";
import AuthPage from "./pages/AuthPage";
import KYCPage from "./pages/KYCPage";
import AdminPanel from "./pages/AdminPanel";
import ProviderPortal from "./pages/ProviderPortal";
import LandingPage from "./pages/LandingPage";
import VoiceCommand from "./components/VoiceCommand";
import { useSocket } from "./hooks/useSocket";
import { users as usersApi, providers as providersApi, bookings as bookingsApi, reviews as reviewsApi, ai, blood as bloodApi, disaster as disasterApi, chat as chatApi, promos as promosApi, schedule as scheduleApi, kyc as kycApi, getToken, sos as sosApi, payments as paymentsApi, upload as uploadApi, loans as loansApi } from "./api";

const C = C_LIGHT; // module-level fallback

/* ── Map a backend provider row → UI provider shape ── */
const toUiProv = p => ({
  id:       p.id,
  name:     p.name,
  nameEn:   p.name,
  // service: API returns service_type_bn / service_type_en (from providers table)
  // or cat_bn / cat_en (from categories join), or legacy p.svc
  svc:      p.service_type_bn||p.cat_bn||p.service_category||p.svc||"",
  svcEn:    p.service_type_en||p.cat_en||p.service_category||p.svcEn||"",
  r:        parseFloat(p.rating)||p.r||4.5,
  rev:      p.review_count||p.rev||10,
  price:    p.hourly_rate?`৳${p.hourly_rate}`:(p.price||"৳৩৫০"),
  note:     p.bio_bn||p.bio||p.note||"",
  noteEn:   p.bio_en||p.bio||p.noteEn||"",
  ok:       p.nid_verified!==undefined?!!p.nid_verified:(p.ok!==undefined?p.ok:true),
  top:      p.top||false,
  av:       p.av||(p.name?.[0]||"P"),
  col:      p.col||"#10B981",
  score:    p.trust_score||p.score||80,
  jobs:     p.total_jobs||p.jobs||0,
  badge:    p.badge||"",
  // area: API returns area_bn / area_en
  loc:      p.area_bn||p.location||p.loc||"ঢাকা",
  locEn:    p.area_en||p.location||p.locEn||"Dhaka",
  eta:      p.eta||"১৫",
  etaEn:    p.etaEn||"15",
  tags:     Array.isArray(p.tags)?p.tags:(p.tags?String(p.tags).split(",").filter(Boolean):[]),
  tagsEn:   Array.isArray(p.tagsEn)?p.tagsEn:(p.tagsEn?String(p.tagsEn).split(",").filter(Boolean):[]),
  lat:      p.lat||p.latitude,
  lng:      p.lng||p.longitude,
  earnings: Array.isArray(p.earnings)?p.earnings:[0,0,0,0,0,0,0],
  loanScore:p.loanScore||p.loan_score||82,
  ai_score: p.ai_score||0,
});



/* ══ LIVE MAP ══ */
function LiveMap({tracking,setTracking}) {
  const C=useC();
  const tr=useTr();
  const lang=tr===T.en?"en":"bn";

  // Refs — DOM div + Leaflet instances
  const mapDiv  =useRef(null);
  const lMap    =useRef(null);
  const uMark   =useRef(null);   // user marker
  const pMark   =useRef(null);   // provider car marker
  const routeLn =useRef(null);   // dashed route polyline
  const animId  =useRef(null);
  const watchId =useRef(null);
  const etaRef  =useRef(480);

  const [eta,   setEta  ]=useState(480);
  const [speed, setSpeed]=useState(0);
  const [gpsOk, setGpsOk]=useState(false);
  const [userPos,setUserPos]=useState([23.8103,90.4125]); // Dhaka default

  const PROV_START=[23.8268,90.4285]; // ~1.8 km NE

  // ── Init Leaflet ───────────────────────────────────────
  useEffect(()=>{
    if(!mapDiv.current||lMap.current) return;

    const map=L.map(mapDiv.current,{center:[23.8103,90.4125],zoom:15,zoomControl:false,attributionControl:false});

    // Google Maps tiles — requires no API key, looks identical to real Google Maps
    L.tileLayer("https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",{
      subdomains:["0","1","2","3"],maxZoom:20,
      attribution:"© Google Maps"
    }).addTo(map);

    // Satellite toggle button
    let satMode=false;
    let satLayer=L.tileLayer("https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",{subdomains:["0","1","2","3"],maxZoom:20});
    let roadLayer=L.tileLayer("https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",{subdomains:["0","1","2","3"],maxZoom:20});
    const satBtn=L.control({position:"topleft"});
    satBtn.onAdd=()=>{
      const d=L.DomUtil.create("button");
      d.innerHTML="🛰️";
      d.title="Toggle satellite";
      Object.assign(d.style,{background:"#fff",border:"2px solid #ccc",borderRadius:"8px",padding:"6px 9px",cursor:"pointer",fontSize:"15px",boxShadow:"0 2px 8px rgba(0,0,0,.15)"});
      L.DomEvent.on(d,"click",L.DomEvent.stopPropagation);
      L.DomEvent.on(d,"click",()=>{
        satMode=!satMode;
        if(satMode){map.removeLayer(roadLayer);satLayer.addTo(map);d.style.background="#1DBF73";d.style.color="#fff";}
        else{map.removeLayer(satLayer);roadLayer.addTo(map);d.style.background="#fff";d.style.color="#000";}
      });
      return d;
    };
    satBtn.addTo(map);

    // Custom zoom
    L.control.zoom({position:"topright"}).addTo(map);
    L.control.attribution({position:"bottomright",prefix:"© CARTO · © OSM"}).addTo(map);

    // User marker — pulsing blue dot
    const mkUser=()=>L.divIcon({className:"",html:`<div style="position:relative;width:22px;height:22px"><div style="position:absolute;inset:0;border-radius:50%;background:${C.p}2A;transform:scale(2.8);animation:pulse 1.8s ease-out infinite"></div><div style="position:absolute;inset:2px;border-radius:50%;background:${C.p};border:3px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.28)"></div></div>`,iconSize:[22,22],iconAnchor:[11,11]});
    uMark.current=L.marker([23.8103,90.4125],{icon:mkUser(),zIndexOffset:1000}).addTo(map);

    // Provider car marker
    const mkCar=()=>L.divIcon({className:"",html:`<div style="font-size:30px;line-height:1;filter:drop-shadow(1px 3px 6px rgba(0,0,0,.45))">🚗</div>`,iconSize:[34,34],iconAnchor:[17,22]});
    pMark.current=L.marker(PROV_START,{icon:mkCar(),zIndexOffset:999}).addTo(map);

    // Initial route
    routeLn.current=L.polyline([PROV_START,[23.8103,90.4125]],{color:C.p,weight:4,opacity:.8,dashArray:"10,8"}).addTo(map);

    lMap.current=map;
    return()=>{cancelAnimationFrame(animId.current);map.remove();lMap.current=null;};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // ── Real GPS ───────────────────────────────────────────
  useEffect(()=>{
    if(!navigator.geolocation) return;
    watchId.current=navigator.geolocation.watchPosition(
      ({coords})=>{
        const pos=[coords.latitude,coords.longitude];
        setUserPos(pos);setGpsOk(true);
        uMark.current?.setLatLng(pos);
        if(!tracking) lMap.current?.setView(pos,15,{animate:true});
      },
      ()=>{},
      {enableHighAccuracy:true,timeout:15000}
    );
    return()=>{if(watchId.current) navigator.geolocation.clearWatch(watchId.current);};
  },[tracking]);

  // ── Provider animation — moves toward user ─────────────
  useEffect(()=>{
    cancelAnimationFrame(animId.current);
    if(!tracking){
      pMark.current?.setLatLng(PROV_START);
      etaRef.current=480;setEta(480);setSpeed(0);return;
    }
    let [plat,plng]=[...PROV_START];
    setSpeed(Math.floor(20+Math.random()*16));
    // Fit map to show both markers
    if(lMap.current) lMap.current.fitBounds(L.latLngBounds([PROV_START,userPos]).pad(.25),{animate:true});

    const tick=()=>{
      const[ulat,ulng]=userPos;
      const dlat=ulat-plat,dlng=ulng-plng;
      const dist=Math.sqrt(dlat*dlat+dlng*dlng);
      if(dist<0.00007){setSpeed(0);return;}
      const s=0.000030;
      plat+=(dlat/dist)*s;plng+=(dlng/dist)*s;
      pMark.current?.setLatLng([plat,plng]);
      if(lMap.current){
        routeLn.current?.remove();
        routeLn.current=L.polyline([[plat,plng],[ulat,ulng]],{color:C.p,weight:4,opacity:.82,dashArray:"10,8"}).addTo(lMap.current);
      }
      etaRef.current=Math.max(0,etaRef.current-0.04);
      setEta(Math.round(etaRef.current));
      animId.current=requestAnimationFrame(tick);
    };
    animId.current=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(animId.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[tracking]);

  const eMin=Math.floor(eta/60),eSec=eta%60;

  return(
    <div style={{borderRadius:20,overflow:"hidden",boxShadow:"0 6px 32px rgba(21,163,96,.18)",position:"relative",background:"#EAF0E8"}}>
      {/* Leaflet map container */}
      <div ref={mapDiv} style={{width:"100%",height:270}}/>

      {/* GPS acquiring indicator */}
      {!gpsOk&&(
        <div style={{position:"absolute",top:10,left:10,background:"rgba(255,255,255,.92)",borderRadius:8,padding:"4px 10px",fontSize:10,color:"#888",display:"flex",alignItems:"center",gap:5,boxShadow:"0 2px 8px rgba(0,0,0,.1)"}}>
          <span>📍</span> {lang==="bn"?"লোকেশন নিচ্ছে...":"Getting location..."}
        </div>
      )}

      {/* ── TRACKING ON: Uber-style provider card ── */}
      {tracking&&(
        <div style={{position:"absolute",bottom:0,left:0,right:0,background:"#fff",borderRadius:"20px 20px 0 0",padding:"14px 16px 18px",boxShadow:"0 -4px 24px rgba(0,0,0,.13)"}}>
          {/* Provider row */}
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
            <div style={{width:46,height:46,borderRadius:"50%",background:`linear-gradient(135deg,${C.p},${C.pdk})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:800,color:"#fff",flexShrink:0,boxShadow:`0 3px 12px ${C.p}44`}}>
              র
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:800,fontSize:14,color:"#1a1a1a",display:"flex",alignItems:"center",gap:6}}>
                {lang==="bn"?"রাকিব হোসেন":"Rakib Hossain"}
                <span style={{background:"#D1FAE5",color:C.p,fontSize:9,fontWeight:700,borderRadius:6,padding:"2px 7px"}}>★ 4.9</span>
              </div>
              <div style={{fontSize:11,color:"#888",marginTop:2}}>
                🛵 {lang==="bn"?"মিরপুর রোড দিয়ে আসছেন":"via Mirpur Road"} · <span style={{color:C.p,fontWeight:700}}>{speed} km/h</span>
              </div>
            </div>
            {/* ETA box */}
            <div style={{background:C.plt,borderRadius:13,padding:"8px 12px",textAlign:"center",flexShrink:0,minWidth:54,border:`1px solid ${C.p}22`}}>
              <div style={{fontSize:19,fontWeight:900,color:C.p,lineHeight:1}}>{eMin}:{String(eSec).padStart(2,"0")}</div>
              <div style={{fontSize:9,color:C.p,fontWeight:600,marginTop:2}}>{lang==="bn"?"মিনিট":"ETA"}</div>
            </div>
          </div>
          {/* Progress */}
          <div style={{height:4,background:"#F3F4F6",borderRadius:4,overflow:"hidden",marginBottom:6}}>
            <div style={{height:4,background:`linear-gradient(90deg,${C.p},${C.pdk})`,width:`${Math.max(5,100-Math.round(eta/480*100))}%`,borderRadius:4,transition:"width .5s"}}/>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#bbb",marginBottom:12}}>
            <span>{lang==="bn"?"রওনা হয়েছেন":"Departed"}</span>
            <span>{lang==="bn"?"আপনার কাছে":"Your Location"}</span>
          </div>
          {/* Buttons */}
          <div style={{display:"flex",gap:8}}>
            <button style={{flex:1,padding:"10px 6px",background:`linear-gradient(135deg,${C.p},${C.pdk})`,color:"#fff",border:"none",borderRadius:12,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
              💬 {lang==="bn"?"চ্যাট":"Chat"}
            </button>
            <button style={{flex:1,padding:"10px 6px",background:"#F0FDF4",color:C.p,border:`1.5px solid ${C.p}44`,borderRadius:12,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
              📞 {lang==="bn"?"কল":"Call"}
            </button>
            <button onClick={()=>setTracking(false)} style={{flex:1,padding:"10px 6px",background:"#FEF2F2",color:"#EF4444",border:"1.5px solid #FECACA",borderRadius:12,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
              ✕ {lang==="bn"?"বাতিল":"Cancel"}
            </button>
          </div>
        </div>
      )}

      {/* ── TRACKING OFF: start button ── */}
      {!tracking&&(
        <div style={{position:"absolute",bottom:10,left:10,right:10,display:"flex",gap:8}}>
          <button onClick={()=>setTracking(true)} style={{flex:1,padding:"11px",background:`linear-gradient(135deg,${C.p},${C.pdk})`,color:"#fff",border:"none",borderRadius:13,fontSize:12.5,fontWeight:700,cursor:"pointer",fontFamily:"inherit",boxShadow:`0 4px 14px ${C.p}55`,display:"flex",alignItems:"center",justifyContent:"center",gap:7}}>
            📍 {lang==="bn"?"লাইভ ট্র্যাকিং শুরু করুন":"Start Live Tracking"}
          </button>
          {gpsOk&&(
            <div style={{width:42,height:42,background:"rgba(255,255,255,.95)",borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:C.p,boxShadow:"0 2px 8px rgba(0,0,0,.12)",flexDirection:"column",gap:1}}>
              <span style={{fontSize:15}}>📡</span><span>GPS</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ══ PROVIDER CARD ══ */
function PCard({p,delay=0,onBook,onView}) {
  const C=useC();
  const tr=useTr();
  const lang=useContext(LangCtx)===T.en?"en":"bn";
  const {favs,toggleFav}=useContext(FavsCtx);
  const isFav=favs.includes(p.id);
  const name=lang==="en"?p.nameEn:p.name;
  const svc=lang==="en"?p.svcEn:p.svc;
  const loc=lang==="en"?p.locEn:p.loc;
  const note=lang==="en"?p.noteEn:p.note;
  const tags=lang==="en"?p.tagsEn:p.tags;
  return (
    <div className="card pcard" style={{position:"relative",overflow:"hidden",padding:20,animation:`fadeUp .4s ease ${delay}s both`,cursor:"pointer"}} onClick={()=>onView(p)}>
      {/* Bookmark btn */}
      <button onClick={e=>{e.stopPropagation();toggleFav(p.id);}} style={{position:"absolute",top:12,right:12,background:isFav?"#FEF9C3":C.bg,border:`1px solid ${isFav?"#F59E0B":C.bdr}`,borderRadius:8,width:30,height:30,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",transition:"all .2s",zIndex:1}}>{isFav?"🔖":"🏷️"}</button>
      <div className="row" style={{gap:12,marginBottom:12}}>
        <Av av={p.av} col={p.col} size={52}/>
        <div style={{flex:1,minWidth:0}}>
          <div className="row" style={{gap:5,flexWrap:"wrap"}}>
            <span style={{fontSize:15,fontWeight:700,color:C.text,lineHeight:1.2}}>{name}</span>
            {p.ok&&<span className="badge" style={{background:"#D1FAE5",color:"#065F46",fontSize:10}}>✓</span>}
            {p.top&&<span className="badge" style={{background:"#FFF3CD",color:"#7C5800",fontSize:10}}>⭐ {p.badge}</span>}
            {p.ai_score>=80&&<span className="badge" style={{background:"#EDE9FE",color:"#5B21B6",fontSize:10}}>🏆 AI Pick</span>}
            {p.ai_score>=60&&p.ai_score<80&&<span className="badge" style={{background:"#DBEAFE",color:"#1E40AF",fontSize:10}}>⭐ Recommended</span>}
          </div>
          <div style={{fontSize:12,color:C.muted,marginTop:2}}>{svc} · 📍 {loc}</div>
          <div className="row" style={{gap:5,marginTop:4}}><Stars r={p.r} size={11}/><span style={{fontSize:12,fontWeight:700}}>{p.r}</span><span style={{fontSize:11,color:C.muted}}>({p.rev}) · {p.jobs} {tr.jobs}</span></div>
        </div>
      </div>
      <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:12}}>
        {tags.map(t=><span key={t} className="tag">{t}</span>)}
      </div>
      <div className="row" style={{justifyContent:"space-between",borderTop:`1px solid ${C.bdr}`,paddingTop:12}}>
        <div><div style={{fontSize:10,color:C.muted}}>{note}</div><div style={{fontSize:19,fontWeight:700,color:C.p}}>{p.price}</div></div>
        <div className="row" style={{gap:7}}>
          <button className="btn btn-gh" style={{border:`1px solid ${C.bdr}`,fontSize:12}} onClick={e=>{e.stopPropagation();onView(p);}}>{tr.profileBtn}</button>
          <button className="btn btn-g" style={{padding:"8px 13px",fontSize:12}} onClick={e=>{e.stopPropagation();onBook(p);}}>{tr.bookNow}</button>
        </div>
      </div>
    </div>
  );
}

/* ══ PROVIDER DETAIL ══ */
function PDetail({p,onClose,onBook,onChat}) {
  const C=useC();
  const tr=useTr();
  const lang=useContext(LangCtx)===T.en?"en":"bn";
  const name=lang==="en"?p.nameEn:p.name;
  const svc=lang==="en"?p.svcEn:p.svc;
  const loc=lang==="en"?p.locEn:p.loc;
  const tags=lang==="en"?p.tagsEn:p.tags;
  const eta=lang==="en"?p.etaEn:p.eta;
  const [tab,setTab]=useState("about");
  const [realRevs,setRealRevs]=useState(null);
  const [revLoading,setRevLoading]=useState(false);
  const [revSummary,setRevSummary]=useState(null);
  const [revSumLoading,setRevSumLoading]=useState(false);
  const REVS=[
    {av:"আ",name:tr.rv1name,r:5,t:tr.rv1,d:tr.rv1d},
    {av:"স",name:tr.rv2name,r:5,t:tr.rv2,d:tr.rv2d},
    {av:"ক",name:tr.rv3name,r:4,t:tr.rv3,d:tr.rv3d},
  ];
  // Load real reviews + AI summary when reviews tab opens
  useEffect(()=>{
    if(tab==="reviews"&&p.id&&realRevs===null){
      setRevLoading(true);
      reviewsApi.getByProvider(p.id)
        .then(d=>{
          const revs=d.reviews||[];
          setRealRevs(revs);
          if(revs.length>=2&&!revSummary){
            setRevSumLoading(true);
            const texts=revs.slice(0,6).map(r=>`${r.rating}★: ${r.comment||""}`).join("\n");
            const prompt=lang==="en"
              ?`Summarize these service provider reviews in 1-2 sentences with overall sentiment:\n${texts}`
              :`এই service provider এর reviews এর ১-২ বাক্যে সারসংক্ষেপ দাও:\n${texts}`;
            ai.chat([{role:"user",content:prompt}],lang)
              .then(r=>setRevSummary(r.reply))
              .catch(()=>{})
              .finally(()=>setRevSumLoading(false));
          }
        })
        .catch(()=>setRealRevs([]))
        .finally(()=>setRevLoading(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[tab]);
  return (
    <div style={{padding:24,maxWidth:640,width:"100%"}}>
      <div className="row" style={{gap:14,alignItems:"flex-start",marginBottom:16}}>
        <Av av={p.av} col={p.col} size={64} fs={22} rad={18}/>
        <div style={{flex:1}}>
          <div className="row" style={{gap:7,flexWrap:"wrap"}}>
            <span style={{fontSize:19,fontWeight:700}}>{name}</span>
            {p.ok&&<span className="badge" style={{background:"#D1FAE5",color:"#065F46"}}>✅</span>}
            {p.top&&<span className="badge" style={{background:"#FFF3CD",color:"#7C5800"}}>⭐ {p.badge}</span>}
          </div>
          <div style={{fontSize:13,color:C.muted,marginTop:3}}>{svc} · 📍 {loc}</div>
          <div className="row" style={{gap:12,marginTop:7,flexWrap:"wrap"}}>
            <span style={{fontSize:13}}><Stars r={p.r} size={12}/> <b>{p.r}</b> ({p.rev})</span>
            <span style={{fontSize:13,color:C.muted}}>✅ {p.jobs} {tr.jobs} · ⏱️ {eta} {tr.min}</span>
          </div>
        </div>
        <button className="btn btn-gh" style={{fontSize:20,flexShrink:0}} onClick={onClose}>✕</button>
      </div>
      <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:14}}>{tags.map(t=><span key={t} className="tag">{t}</span>)}</div>
      <div className="row" style={{gap:2,borderBottom:`2px solid ${C.bdr}`,marginBottom:16}}>
        {[["about",tr.tabAbout],["stats",tr.tabStats],["earnings",tr.tabEarnings],["reviews",tr.tabReviews]].map(([id,l])=>(
          <button key={id} className="btn btn-gh" onClick={()=>setTab(id)} style={{borderRadius:"8px 8px 0 0",paddingBottom:9,borderBottom:`2px solid ${tab===id?C.p:"transparent"}`,color:tab===id?C.p:C.sub,fontWeight:tab===id?700:400,marginBottom:-2,fontSize:12}}>{l}</button>
        ))}
      </div>
      {tab==="about"&&<div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(80px,1fr))",gap:10,marginBottom:14}}>
          {[["💼",tr.totalJobsL,p.jobs],["📊",tr.scoreL,p.score+"/100"],["💹",tr.loanScoreL,p.loanScore+"/100"]].map(([ic,l,v],i)=>(
            <div key={i} style={{background:C.bg,borderRadius:11,padding:12,textAlign:"center"}}><div style={{fontSize:20,marginBottom:4}}>{ic}</div><div style={{fontSize:16,fontWeight:700,color:C.p}}>{v}</div><div style={{fontSize:11,color:C.muted}}>{l}</div></div>
          ))}
        </div>
        <div style={{background:`${C.p}0A`,borderRadius:12,padding:12,border:`1px solid ${C.p}20`}}>
          <div style={{fontSize:12,fontWeight:700,color:C.p,marginBottom:6}}>{tr.verifiedL}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            {["✅ NID","✅ Phone","✅ Background","✅ Photo"].map(i=><div key={i} style={{fontSize:12,color:C.sub}}>{i}</div>)}
          </div>
        </div>
      </div>}
      {tab==="stats"&&<div>
        {[["📋",lang==="en"?"Service History":"সেবার ইতিহাস",95],["💳",lang==="en"?"Payment Regularity":"পেমেন্ট নিয়মিততা",88],["⭐",lang==="en"?"Customer Rating":"গ্রাহক রেটিং",92],["📱",lang==="en"?"Activity":"সক্রিয়তা",78]].map(([ic,l,s],i)=>(
          <div key={i} style={{marginBottom:12}}>
            <div className="row" style={{justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:13}}>{ic} {l}</span><span style={{fontSize:13,fontWeight:700,color:s>=80?C.p:"#F59E0B"}}>{s}%</span></div>
            <PBar v={s} col={s>=80?C.p:"#F59E0B"}/>
          </div>
        ))}
      </div>}
      {tab==="earnings"&&<div>
        <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>{tr.weeklyEarnings}</div>
        <MiniBar data={p.earnings} tr={tr}/>
        <div style={{background:C.bg,borderRadius:11,padding:12,marginTop:12}}>
          <div className="row" style={{justifyContent:"space-between"}}><span style={{fontSize:13,color:C.muted}}>{tr.weekTotal}</span><span style={{fontSize:15,fontWeight:700,color:C.p}}>৳{p.earnings.reduce((a,b)=>a+b,0).toLocaleString()}</span></div>
        </div>
      </div>}
      {tab==="reviews"&&<div style={{display:"flex",flexDirection:"column",gap:10}}>
        {(revSummary||revSumLoading)&&<div style={{background:`linear-gradient(135deg,${C.plt},#fff)`,border:`1.5px solid ${C.p}`,borderRadius:12,padding:12}}>
          <div style={{fontSize:11,fontWeight:700,color:C.p,marginBottom:5}}>🤖 AI {lang==="en"?"Summary":"সারসংক্ষেপ"}</div>
          {revSumLoading?<div style={{fontSize:12,color:C.muted}}>✨ {lang==="en"?"Analyzing reviews...":"রিভিউ বিশ্লেষণ হচ্ছে..."}</div>:<div style={{fontSize:12,color:C.sub,lineHeight:1.65}}>{revSummary}</div>}
        </div>}
        {revLoading&&<div style={{textAlign:"center",padding:24,color:C.muted}}>⏳ {lang==="en"?"Loading reviews...":"লোড হচ্ছে..."}</div>}
        {!revLoading&&(realRevs!==null?realRevs:REVS).map((rv,i)=>(
          <div key={rv.id||i} style={{padding:12,border:`1px solid ${C.bdr}`,borderRadius:12}}>
            <div className="row" style={{gap:9,marginBottom:6}}>
              <div className="jc" style={{width:34,height:34,borderRadius:9,background:`linear-gradient(135deg,${C.p},#6EE7B7)`,color:"#fff",fontWeight:700,fontSize:13,flexShrink:0}}>{rv.customer_name?rv.customer_name[0]:(rv.av||"?")}</div>
              <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700}}>{rv.customer_name||rv.name}</div><Stars r={rv.rating||rv.r} size={11}/></div>
              <div style={{fontSize:11,color:C.muted}}>{rv.created_at?new Date(rv.created_at).toLocaleDateString():rv.d}</div>
            </div>
            <div style={{fontSize:13,color:C.sub,lineHeight:1.65}}>{rv.comment||rv.t}</div>
            {rv.tags&&rv.tags.split(",").filter(Boolean).length>0&&(
              <div style={{marginTop:6,display:"flex",flexWrap:"wrap",gap:4}}>
                {rv.tags.split(",").filter(Boolean).map(t=><span key={t} style={{fontSize:10,background:C.plt,color:C.p,borderRadius:99,padding:"2px 8px",fontWeight:600}}>{t}</span>)}
              </div>
            )}
          </div>
        ))}
        {realRevs!==null&&realRevs.length===0&&(
          <div style={{textAlign:"center",padding:24,color:C.muted}}>⭐ {lang==="en"?"No reviews yet":"এখনো কোনো রিভিউ নেই"}</div>
        )}
        {realRevs!==null&&realRevs.length>1&&(
          <div style={{textAlign:"center",fontSize:12,color:C.muted,padding:6}}>
            ⭐ {lang==="en"?"Average":"গড়"}: <b style={{color:C.p}}>{(realRevs.reduce((s,r)=>s+(r.rating||0),0)/realRevs.length).toFixed(1)}</b> ({realRevs.length} {lang==="en"?"reviews":"টি রিভিউ"})
          </div>
        )}
      </div>}
      <div className="row" style={{gap:9,marginTop:18}}>
        <button className="btn btn-o" style={{flex:1}} onClick={()=>{onClose();onChat&&onChat(p);}}>{tr.msgBtn}</button>
        <button className="btn btn-g" style={{flex:2}} onClick={()=>{onClose();onBook(p);}}>{tr.bookNow} — {p.price}</button>
      </div>
    </div>
  );
}

/* ══ BOOKING MODAL ══ */
function BookModal({p,onClose}) {
  const C=useC();
  const tr=useTr();
  const lang=useContext(LangCtx)===T.en?"en":"bn";
  const name=lang==="en"?p.nameEn:p.name;
  const svc=lang==="en"?p.svcEn:p.svc;
  const eta=lang==="en"?p.etaEn:p.eta;
  const [step,setStep]=useState(0);
  const [time,setTime]=useState(null);
  const [pay,setPay]=useState("bKash");
  const [done,setDone]=useState(false);
  const [fraudWarn,setFraudWarn]=useState(null);
  const [bundles,setBundles]=useState([]);
  const [dynPrice,setDynPrice]=useState(null);
  const [loadingConfirm,setLoadingConfirm]=useState(false);
  const [otpStep,setOtpStep]=useState(false);
  const [otpVal,setOtpVal]=useState("");
  const [otpCode]=useState(()=>String(Math.floor(100000+Math.random()*900000)));
  const [otpPhone]=useState(()=>"01"+Math.floor(Math.random()*900000000+100000000).toString());
  const [otpErr,setOtpErr]=useState(false);
  const TIMES=[tr.t1,tr.t2,tr.t3,tr.t4,tr.t5,tr.t6];
  const STEPS=[lang==="en"?"Service":"সেবা",lang==="en"?"Time":"সময়",lang==="en"?"Payment":"পেমেন্ট"];
  const baseAmount=parseInt(String(p.price||"").replace(/[৳,]/g,""))||350;

  // Fetch dynamic price when modal opens
  useEffect(()=>{
    ai.dynamicPrice(p.svcEn||p.svc||"general").then(d=>setDynPrice(d)).catch(()=>{});
  },[]);

  const handleConfirm=async(force=false)=>{
    if(loadingConfirm)return;
    // OTP step for digital payments
    if(pay!=="Cash"&&!otpStep&&!force){
      setOtpStep(true);
      return;
    }
    if(otpStep&&otpVal!==otpCode){
      setOtpErr(true);
      return;
    }
    setOtpStep(false);
    setLoadingConfirm(true);
    // Fraud check first
    if(!force){
      try{
        const f=await ai.fraudCheck(null,p.id,dynPrice?.dynamicPrice||baseAmount,p.svcEn||p.svc);
        if(f.riskLevel==="high"||f.riskLevel==="medium"){
          setFraudWarn(f);
          setLoadingConfirm(false);
          return;
        }
      }catch(e){ console.warn("fraud-check:",e.message); }
    }
    setFraudWarn(null);
    try {
      await bookingsApi.create({
        provider_id:    p.id,
        service_type:   p.svcEn||p.svc||p.service_category||"",
        scheduled_at:   time,
        payment_method: pay,
        total_amount:   dynPrice?.dynamicPrice||baseAmount,
        notes:          "",
      });
    } catch(e){ console.error("Booking error:",e); }
    // Bundle suggestions
    try{
      const b=await ai.bundleSuggest(p.svcEn||p.svc||"general");
      if(b.suggestions?.length) setBundles(b.suggestions.slice(0,3));
    }catch(e){}
    setLoadingConfirm(false);
    setDone(true);
  };

  // OTP verification UI for digital payments
  if(otpStep) return (
    <div style={{padding:24,textAlign:"center"}}>
      <div style={{fontSize:48,marginBottom:10}}>📲</div>
      <div style={{fontSize:17,fontWeight:700,marginBottom:6}}>{lang==="en"?"Verify Payment":"পেমেন্ট যাচাই করুন"}</div>
      <div style={{fontSize:13,color:C.muted,marginBottom:4}}>{lang==="en"?`Enter code sent via ${pay}`:pay+" এ পাঠানো কোড দিন"}</div>
      <div style={{fontSize:13,fontWeight:700,marginBottom:14,color:C.p}}>{otpPhone}</div>
      <div style={{background:"#EFF6FF",borderRadius:12,padding:"10px 18px",marginBottom:16,border:"1px solid #BFDBFE",fontSize:13,color:"#1D4ED8"}}>
        🎯 {lang==="en"?"Demo OTP:":"ডেমো OTP:"} <b style={{fontSize:20,letterSpacing:4}}>{otpCode}</b>
      </div>
      <input
        value={otpVal}
        onChange={e=>{setOtpVal(e.target.value.replace(/\D/g,"").slice(0,6));setOtpErr(false);}}
        placeholder="• • • • • •"
        maxLength={6}
        style={{width:"100%",padding:"14px",border:`2px solid ${otpErr?"#EF4444":otpVal.length===6?C.p:C.bdr}`,borderRadius:12,fontSize:24,textAlign:"center",letterSpacing:10,fontWeight:700,background:C.bg,color:C.p,marginBottom:6,outline:"none",boxSizing:"border-box"}}
      />
      {otpErr&&<div style={{fontSize:12,color:"#EF4444",marginBottom:10}}>{lang==="en"?"Incorrect OTP. Try again.":"ভুল OTP — আবার চেষ্টা করুন"}</div>}
      {!otpErr&&<div style={{fontSize:11,color:C.muted,marginBottom:14}}>{lang==="en"?"Enter the 6-digit code above":"উপরের ৬ সংখ্যার কোডটি লিখুন"}</div>}
      <div className="row" style={{gap:8}}>
        <button className="btn btn-gh" style={{flex:1,border:`1px solid ${C.bdr}`}} onClick={()=>{setOtpStep(false);setOtpVal("");setOtpErr(false);}}>{tr.backBtn}</button>
        <button className="btn btn-g" style={{flex:2}} disabled={otpVal.length<6||loadingConfirm} onClick={()=>handleConfirm(false)}>
          {loadingConfirm?"⏳...":(lang==="en"?"Verify & Pay":"যাচাই করে পেমেন্ট করুন")}
        </button>
      </div>
    </div>
  );

  // Show fraud warning overlay
  if(fraudWarn) return (
    <div style={{padding:24,textAlign:"center"}}>
      <div style={{fontSize:56,marginBottom:10}}>⚠️</div>
      <div style={{fontSize:17,fontWeight:700,color:"#DC2626",marginBottom:8}}>{lang==="en"?"Suspicious Activity Detected":"সন্দেহজনক কার্যকলাপ শনাক্ত"}</div>
      <div style={{background:"#FEF2F2",borderRadius:12,padding:14,marginBottom:14,border:"1px solid #FECACA"}}>
        {fraudWarn.flags.map((f,i)=>(
          <div key={i} style={{fontSize:12,color:"#7F1D1D",marginBottom:4}}>• {f}</div>
        ))}
      </div>
      <div style={{fontSize:13,color:C.muted,marginBottom:16}}>{lang==="en"?"Still want to proceed?":"তারপরও কি এগিয়ে যেতে চান?"}</div>
      <div className="row" style={{gap:8}}>
        <button className="btn btn-gh" style={{flex:1,border:`1px solid ${C.bdr}`}} onClick={()=>setFraudWarn(null)}>{lang==="en"?"Cancel":"বাতিল"}</button>
        <button className="btn" style={{flex:2,background:"#DC2626",color:"#fff",border:"none",borderRadius:10,padding:"11px"}} onClick={()=>handleConfirm(true)}>{lang==="en"?"Proceed Anyway":"তবুও এগান"}</button>
      </div>
    </div>
  );

  if(done) return (
    <div style={{padding:24,textAlign:"center"}}>
      <div style={{fontSize:64,marginBottom:14}}>🎉</div>
      <div style={{fontSize:21,fontWeight:700}}>{tr.bookDone}</div>
      <div style={{fontSize:14,color:C.muted,marginTop:6}}>{name} {eta} {tr.min} {tr.arrives}</div>
      <div style={{background:C.bg,borderRadius:14,padding:18,margin:"14px 0",border:`1px solid ${C.bdr}`}}>
        <div style={{fontSize:11,color:C.muted}}>{tr.bookId}</div>
        <div style={{fontSize:22,fontWeight:700,color:C.p,marginTop:4}}>#BK-{Math.floor(Math.random()*9000+1000)}</div>
        {dynPrice?.surgeActive&&<div style={{fontSize:10,color:"#F59E0B",marginTop:6}}>⚡ {dynPrice.surgeReason}</div>}
      </div>
      {bundles.length>0&&(
        <div style={{marginBottom:14,textAlign:"left"}}>
          <div style={{fontSize:12,fontWeight:700,color:C.p,marginBottom:8}}>🤖 {lang==="en"?"You may also need:":"আরো যা লাগতে পারে:"}</div>
          <div style={{display:"flex",flexDirection:"column",gap:7}}>
            {bundles.map((b,i)=>(
              <div key={i} style={{background:C.bg,borderRadius:10,padding:"9px 12px",border:`1px solid ${C.bdr}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:13}}>{b.service}</span>
                <span style={{fontSize:10,color:C.muted,background:C.plt,borderRadius:99,padding:"2px 7px"}}>🔥 {b.popularity}x</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <button className="btn btn-g" style={{width:"100%",padding:"14px"}} onClick={onClose}>{tr.doneBtn}</button>
    </div>
  );
  return (
    <div style={{padding:24}}>
      <div className="row" style={{justifyContent:"space-between",marginBottom:18}}>
        <div style={{fontSize:17,fontWeight:700}}>📋 {tr.bookTitle}</div>
        <button className="btn btn-gh" style={{fontSize:20}} onClick={onClose}>✕</button>
      </div>
      <div className="row" style={{gap:4,marginBottom:20}}>
        {STEPS.map((s,i)=>(
          <div key={i} className="row" style={{flex:1,gap:4}}>
            <div className="jc" style={{width:26,height:26,borderRadius:"50%",fontSize:11,fontWeight:700,flexShrink:0,background:i<step?C.p:i===step?`${C.p}18`:"#E5E7EB",color:i<step?"#fff":i===step?C.p:C.muted,border:i===step?`2px solid ${C.p}`:"2px solid transparent"}}>{i<step?"✓":i+1}</div>
            <div style={{fontSize:11,fontWeight:i===step?700:400,color:i<=step?C.p:C.muted}}>{s}</div>
            {i<2&&<div style={{flex:1,height:1,background:i<step?C.p:C.bdr}}/>}
          </div>
        ))}
      </div>
      {step===0&&<>
        <div style={{background:C.bg,borderRadius:12,padding:14,marginBottom:12,display:"flex",gap:12,alignItems:"center"}}>
          <Av av={p.av} col={p.col} size={46}/><div><div style={{fontSize:15,fontWeight:700}}>{name}</div><div style={{fontSize:12,color:C.muted}}>{svc}</div><Stars r={p.r} size={12}/></div>
        </div>
        <div style={{background:`${C.p}0C`,borderRadius:12,padding:12,marginBottom:14,border:`1px solid ${C.p}22`}}>
          <div style={{fontSize:12,fontWeight:700,color:C.p,marginBottom:4}}>{tr.aiTip}</div>
          <div style={{fontSize:13,color:C.sub,lineHeight:1.65}}>{name} — {tr.aiMsg} {p.price}. {eta} {tr.min} {tr.aiArrival}</div>
        </div>
        <button className="btn btn-g" style={{width:"100%",padding:"13px"}} onClick={()=>setStep(1)}>{tr.timeBtn}</button>
      </>}
      {step===1&&<>
        <div style={{fontSize:14,fontWeight:600,marginBottom:12}}>{tr.selTime}</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(85px,1fr))",gap:8,marginBottom:16}}>
          {TIMES.map(t=><button key={t} className="btn" onClick={()=>setTime(t)} style={{padding:"11px 4px",border:`2px solid ${time===t?C.p:C.bdr}`,borderRadius:10,background:time===t?`${C.p}12`:"#fff",color:time===t?C.p:C.text,fontSize:12,fontWeight:time===t?700:400}}>{t}</button>)}
        </div>
        <div className="row" style={{gap:8}}>
          <button className="btn btn-gh" style={{flex:1,border:`1px solid ${C.bdr}`}} onClick={()=>setStep(0)}>{tr.backBtn}</button>
          <button className="btn btn-g" style={{flex:2}} onClick={()=>time&&setStep(2)} disabled={!time}>{tr.nextBtn}</button>
        </div>
      </>}
      {step===2&&<>
        <div style={{fontSize:14,fontWeight:600,marginBottom:12}}>{tr.payMethod}</div>
        {[["bKash","💳","#E31E50"],["Nagad","📱","#F97316"],["Rocket","🚀","#7C3AED"],["Cash","💵","#22C55E"]].map(([nm,ic,cl])=>(
          <div key={nm} onClick={()=>setPay(nm)} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 14px",borderRadius:11,border:`2px solid ${pay===nm?C.p:C.bdr}`,background:pay===nm?`${C.p}08`:"#fff",marginBottom:7,cursor:"pointer",transition:"all .15s"}}>
            <div className="jc" style={{width:38,height:38,borderRadius:9,background:cl+"22",fontSize:17,flexShrink:0}}>{ic}</div>
            <div style={{flex:1,fontSize:14,fontWeight:600}}>{nm}</div>
            <div className="jc" style={{width:19,height:19,borderRadius:"50%",border:`2px solid ${pay===nm?C.p:C.bdr}`}}>{pay===nm&&<div style={{width:9,height:9,borderRadius:"50%",background:C.p}}/>}</div>
          </div>
        ))}
        <div style={{background:C.bg,borderRadius:11,padding:12,margin:"12px 0"}}>
          {[[tr.serviceFee,`৳${baseAmount}`],[tr.platformFee,`৳${Math.round(baseAmount*0.1)}`]].map(([l,v],i)=>(
            <div key={i} className="row" style={{justifyContent:"space-between",marginBottom:5}}><span style={{fontSize:13,color:C.muted}}>{l}</span><span style={{fontSize:13}}>{v}</span></div>
          ))}
          {dynPrice?.surgeActive&&(
            <div className="row" style={{justifyContent:"space-between",marginBottom:5}}>
              <span style={{fontSize:12,color:"#F59E0B"}}>⚡ Surge ({dynPrice.surgeReason})</span>
              <span style={{fontSize:12,color:"#F59E0B"}}>×{dynPrice.multiplier}</span>
            </div>
          )}
          <div style={{height:1,background:C.bdr,margin:"7px 0"}}/>
          <div className="row" style={{justifyContent:"space-between"}}>
            <span style={{fontSize:14,fontWeight:700}}>{tr.total}</span>
            <div style={{textAlign:"right"}}>
              {dynPrice?.surgeActive&&<div style={{fontSize:11,color:C.muted,textDecoration:"line-through"}}>৳{dynPrice.basePrice+Math.round(dynPrice.basePrice*0.1)}</div>}
              <span style={{fontSize:17,fontWeight:700,color:C.p}}>৳{dynPrice?(dynPrice.dynamicPrice+Math.round(dynPrice.dynamicPrice*0.1)):(baseAmount+Math.round(baseAmount*0.1))}</span>
            </div>
          </div>
        </div>
        <div className="row" style={{gap:8}}>
          <button className="btn btn-gh" style={{flex:1,border:`1px solid ${C.bdr}`}} onClick={()=>setStep(1)}>{tr.backBtn}</button>
          <button className="btn btn-g" style={{flex:2}} disabled={loadingConfirm} onClick={()=>handleConfirm(false)}>{loadingConfirm?(lang==="en"?"Checking...":"যাচাই হচ্ছে..."):tr.confirmBtn}</button>
        </div>
      </>}
    </div>
  );
}

/* ══ RATING MODAL ══ */
function RatingModal({p,onClose}) {
  const C=useC();
  const tr=useTr();
  const lang=useContext(LangCtx)===T.en?"en":"bn";
  const name=lang==="en"&&p?p.nameEn:p?.name;
  const {bookings:ctxBookings}=useLiveData();
  const [rating,setRating]=useState(0);
  const [hover,setHover]=useState(0);
  const [selTags,setSelTags]=useState([]);
  const [comment,setComment]=useState("");
  const [done,setDone]=useState(false);
  const LABELS=["",tr.rl1,tr.rl2,tr.rl3,tr.rl4,tr.rl5];
  const TAGS=tr.rtags.split(",");
  if(done) return (
    <div style={{padding:28,textAlign:"center"}}>
      <div style={{fontSize:64,marginBottom:14}}>🎉</div>
      <div style={{fontSize:18,fontWeight:700}}>{tr.rDone}</div>
      <div style={{fontSize:13,color:C.muted,marginTop:6}}>{tr.rSubmitted}</div>
      <button className="btn btn-g" style={{marginTop:18,width:"100%",padding:"13px"}} onClick={onClose}>{tr.closeBtn}</button>
    </div>
  );
  return (
    <div style={{padding:24}}>
      <div className="row" style={{justifyContent:"space-between",marginBottom:16}}>
        <div style={{fontSize:16,fontWeight:700}}>⭐ {tr.ratingTitle}</div>
        <button className="btn btn-gh" style={{fontSize:20}} onClick={onClose}>✕</button>
      </div>
      {p&&<div style={{textAlign:"center",marginBottom:16}}><div style={{display:"flex",justifyContent:"center",marginBottom:8}}><Av av={p.av} col={p.col} size={56} rad={16}/></div><div style={{fontSize:16,fontWeight:700}}>{name}</div></div>}
      <div className="row" style={{justifyContent:"center",gap:8,marginBottom:8}}>
        {[1,2,3,4,5].map(s=><div key={s} onMouseEnter={()=>setHover(s)} onMouseLeave={()=>setHover(0)} onClick={()=>setRating(s)} style={{fontSize:38,cursor:"pointer",color:(hover||rating)>=s?"#F59E0B":"#E5E7EB",transition:"all .12s",transform:(hover||rating)>=s?"scale(1.18)":"scale(1)"}}>★</div>)}
      </div>
      {rating>0&&<div style={{textAlign:"center",fontSize:14,color:C.p,fontWeight:600,marginBottom:12}}>{LABELS[rating]}</div>}
      <div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:14}}>
        {TAGS.map(t=><button key={t} onClick={()=>setSelTags(prev=>prev.includes(t)?prev.filter(x=>x!==t):[...prev,t])} style={{padding:"6px 12px",borderRadius:99,border:`1.5px solid ${selTags.includes(t)?C.p:C.bdr}`,background:selTags.includes(t)?`${C.p}12`:"#fff",color:selTags.includes(t)?C.p:C.muted,fontSize:12,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif",fontWeight:600,transition:"all .15s"}}>{selTags.includes(t)?"✓ ":""}{t}</button>)}
      </div>
      <textarea value={comment} onChange={e=>setComment(e.target.value)} placeholder={tr.commentPh} rows={3} style={{width:"100%",padding:"11px",background:C.bg,border:`1px solid ${C.bdr}`,borderRadius:11,fontSize:13,color:C.text,resize:"none",marginBottom:14}}/>
      <div className="row" style={{gap:8}}>
        <button className="btn btn-gh" style={{flex:1,border:`1px solid ${C.bdr}`}} onClick={onClose}>{tr.cancelBtn}</button>
        <button className="btn btn-g" style={{flex:2}} disabled={!rating} onClick={async()=>{
          if(!rating)return;
          // Fake review check via AI
          try{
            const chk=await ai.reviewCheck(p?.id,rating,comment,null);
            if(chk.isSuspicious){
              const ok=window.confirm(
                lang==="en"
                  ?`AI flagged this review (${chk.confidence}% confidence).\n${chk.reasons.join("\n")}\n\nStill submit?`
                  :`AI এই রিভিউতে সমস্যা পেয়েছে (${chk.confidence}% নিশ্চিত)।\n${chk.reasons.join("\n")}\n\nতবুও জমা দেবেন?`
              );
              if(!ok)return;
            }
          }catch(e){ console.warn("review-check:",e.message); }
          const bk=ctxBookings.find(b=>(b.provider_id||b.pid)===p?.id&&(b.status==="completed"||b.status==="সম্পন্ন"));
          try{if(bk?.id)await reviewsApi.submit({booking_id:bk.id,rating,comment,tags:selTags.join(",")});}catch(e){console.error("review:",e);}
          setDone(true);
        }}>{tr.submitRating}</button>
      </div>
    </div>
  );
}

/* ══ DISPUTE MODAL ══ */
function DisputeModal({booking,onClose}){
  const C=useC();
  const lang=useContext(LangCtx)===T.en?"en":"bn";
  const [type,setType]=useState("");
  const [desc,setDesc]=useState("");
  const [submitted,setSubmitted]=useState(false);
  const [submitting,setSubmitting]=useState(false);
  const [refId,setRefId]=useState("");
  const TYPES=lang==="en"?["Quality Issue","Late Arrival","Overcharged","Behavior Issue","Incomplete Work"]
                          :["মান সমস্যা","দেরিতে আগমন","অতিরিক্ত চার্জ","ব্যবহার সমস্যা","কাজ অসম্পূর্ণ"];
  const svc=lang==="en"?booking.svcEn||booking.svc:booking.svc;
  const handleSubmit=async()=>{
    if(!type||desc.length<=5)return;
    setSubmitting(true);
    try{
      const r=await usersApi.submitComplaint({booking_id:booking.id||booking.booking_ref,subject:type,description:desc,priority:"medium"});
      setRefId(r.ref||`DSP-${Math.floor(Math.random()*90000+10000)}`);
    }catch{
      setRefId(`DSP-${Math.floor(Math.random()*90000+10000)}`);
    }
    setSubmitting(false);
    setSubmitted(true);
  };
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div style={{background:"#fff",borderRadius:18,padding:22,maxWidth:420,width:"100%",maxHeight:"82vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        {submitted?(
          <div style={{textAlign:"center",padding:"24px 0"}}>
            <div style={{fontSize:44,marginBottom:12}}>✅</div>
            <div style={{fontSize:17,fontWeight:700,color:"#065F46",marginBottom:8}}>{lang==="en"?"Dispute Submitted!":"অভিযোগ জমা হয়েছে!"}</div>
            <div style={{fontSize:13,color:"#6B7280",marginBottom:20}}>{lang==="en"?"We'll review and respond within 24–48 hours.":"আমরা ২৪–৪৮ ঘণ্টার মধ্যে পর্যালোচনা করব।"}</div>
            <div style={{background:"#D1FAE5",borderRadius:12,padding:"12px 16px",marginBottom:20,textAlign:"left"}}>
              <div style={{fontSize:12,fontWeight:700,color:"#065F46",marginBottom:4}}>{lang==="en"?"Reference ID":"রেফারেন্স আইডি"}</div>
              <div style={{fontSize:15,fontWeight:800,color:"#10B981",fontFamily:"monospace"}}>{refId}</div>
            </div>
            <button onClick={onClose} style={{background:"#10B981",border:"none",borderRadius:12,color:"#fff",padding:"12px 28px",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>{lang==="en"?"Close":"বন্ধ করুন"}</button>
          </div>
        ):(
          <>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{fontSize:16,fontWeight:700}}>⚠️ {lang==="en"?"File a Dispute":"অভিযোগ দাখিল"}</div>
              <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#9CA3AF"}}>✕</button>
            </div>
            <div style={{background:"#FEF3C7",borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:13,color:"#92400E"}}>📋 {svc} · {lang==="en"?booking.dateEn||booking.date:booking.date} · {booking.price}</div>
            <div style={{fontSize:13,fontWeight:700,color:"#374151",marginBottom:10}}>{lang==="en"?"Issue Type":"সমস্যার ধরন"}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
              {TYPES.map(t=>(
                <button key={t} onClick={()=>setType(t)} style={{padding:"9px 10px",borderRadius:10,border:`1.5px solid ${type===t?"#F59E0B":"#E5E7EB"}`,background:type===t?"#FFFBEB":"#F9FAFB",color:type===t?"#92400E":"#374151",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>{t}</button>
              ))}
            </div>
            <div style={{fontSize:13,fontWeight:700,color:"#374151",marginBottom:8}}>{lang==="en"?"Description":"বিবরণ"}</div>
            <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={3}
              placeholder={lang==="en"?"Describe the issue in detail...":"সমস্যার বিস্তারিত লিখুন..."}
              style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid #E5E7EB",fontSize:13,fontFamily:"'Hind Siliguri',sans-serif",resize:"vertical",boxSizing:"border-box",color:"#111",background:"#F9FAFB",marginBottom:16}}/>
            <button onClick={handleSubmit} disabled={!type||desc.length<=5||submitting}
              style={{width:"100%",padding:"13px",borderRadius:12,background:type&&desc.length>5?"linear-gradient(135deg,#F59E0B,#D97706)":"#D1D5DB",border:"none",color:"#fff",fontSize:14,fontWeight:700,cursor:type&&desc.length>5?"pointer":"default",fontFamily:"'Hind Siliguri',sans-serif"}}>
              {submitting?(lang==="en"?"Submitting...":"জমা হচ্ছে..."):(lang==="en"?"Submit Dispute":"অভিযোগ জমা দিন")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ══ SERVICE GUARANTEE MODAL ══ */
function GuaranteeModal({booking,onClose}){
  const C=useC();
  const lang=useContext(LangCtx)===T.en?"en":"bn";
  const svc=lang==="en"?booking.svcEn||booking.svc:booking.svc;
  const provider=lang==="en"?booking.providerEn||booking.provider:booking.provider;
  const date=lang==="en"?booking.dateEn||booking.date:booking.date;
  const printGuarantee=()=>{
    const w=window.open("","_blank","width=520,height=680");
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>IMAP Guarantee</title>
    <style>body{font-family:'Segoe UI',sans-serif;background:#f0fdf4;margin:0;padding:24px}
    .cert{background:#fff;border-radius:16px;padding:32px;max-width:440px;margin:0 auto;border:3px solid #10B981}
    .header{text-align:center;margin-bottom:24px}.logo{font-size:40px;margin-bottom:8px}
    .title{font-size:20px;font-weight:800;color:#065F46}.sub{font-size:13px;color:#6B7280;margin-top:4px}
    .seal{display:inline-block;background:#10B981;color:#fff;padding:6px 18px;border-radius:99px;font-size:12px;font-weight:700;margin:12px 0}
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
    <div class="field"><label>Service / সেবা</label><span>${svc}</span></div>
    <div class="field"><label>Provider / প্রদানকারী</label><span>${provider||"IMAP Provider"}</span></div>
    <div class="field"><label>Date / তারিখ</label><span>${date}</span></div>
    <div class="field"><label>Booking ID</label><span style="font-family:monospace">${booking.id||booking.booking_ref||"-"}</span></div>
    <div class="field"><label>Amount / পরিমাণ</label><span>${booking.price}</span></div>
    <div class="field"><label>Guarantee</label><span>৭ দিনের সন্তুষ্টি গ্যারান্টি · 7-day satisfaction guarantee</span></div>
    <div class="footer">Issued by IMAP Platform · imap.com.bd</div>
    </div></body></html>`);
    w.document.close();
  };
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div style={{background:"#fff",borderRadius:18,padding:22,maxWidth:420,width:"100%"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:16,fontWeight:700}}>🛡️ {lang==="en"?"Service Guarantee":"সার্ভিস গ্যারান্টি"}</div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#9CA3AF"}}>✕</button>
        </div>
        <div style={{background:"linear-gradient(135deg,#D1FAE5,#A7F3D0)",borderRadius:14,padding:18,marginBottom:16,border:"2px solid #10B981",textAlign:"center"}}>
          <div style={{fontSize:36,marginBottom:8}}>🛡️</div>
          <div style={{fontSize:16,fontWeight:800,color:"#065F46",marginBottom:4}}>{lang==="en"?"7-Day Satisfaction Guarantee":"৭ দিনের সন্তুষ্টি গ্যারান্টি"}</div>
          <div style={{fontSize:12,color:"#047857"}}>{lang==="en"?"Not satisfied? We'll fix it or refund — no questions asked.":"সন্তুষ্ট না হলে বিনামূল্যে সমাধান বা সম্পূর্ণ রিফান্ড।"}</div>
        </div>
        {[[lang==="en"?"Service":"সেবা",svc],[lang==="en"?"Provider":"প্রদানকারী",provider||"IMAP Provider"],[lang==="en"?"Date":"তারিখ",date],[lang==="en"?"Booking ID":"বুকিং আইডি",booking.id||"-"],[lang==="en"?"Amount":"পরিমাণ",booking.price]].map(([k,v])=>(
          <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:"1px solid #F3F4F6"}}>
            <span style={{fontSize:13,color:"#6B7280"}}>{k}</span>
            <span style={{fontSize:13,fontWeight:700,color:"#111"}}>{v}</span>
          </div>
        ))}
        <div style={{display:"flex",gap:10,marginTop:16}}>
          <button onClick={printGuarantee} style={{flex:1,padding:"12px",borderRadius:12,background:"linear-gradient(135deg,#10B981,#059669)",border:"none",color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>📄 {lang==="en"?"Download PDF":"PDF ডাউনলোড"}</button>
          <button onClick={onClose} style={{padding:"12px 16px",borderRadius:12,background:"#F3F4F6",border:"none",color:"#374151",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>✕</button>
        </div>
      </div>
    </div>
  );
}

/* ══ MY BOOKINGS ══ */
function MyBookings({onRate,onBook,onPay}) {
  const C=useC();
  const tr=useTr();
  const lang=useContext(LangCtx)===T.en?"en":"bn";
  const [filter,setFilter]=useState("all");
  const [dispute,setDispute]=useState(null);
  const [guarantee,setGuarantee]=useState(null);
  const { bookings: ctxBookings, providers: ctxProviders } = useLiveData();

  // Normalize API booking fields to the shape the UI expects
  const toUiBk = b=>({
    ...b,
    id:         b.booking_ref || b.id,
    svc:        b.service_name_bn || b.service_type || b.svc || "",
    svcEn:      b.service_name_en || b.service_type || b.svcEn || "",
    provider:   b.provider_name || b.provider || "",
    providerEn: b.provider_name || b.providerEn || "",
    status:     b.status==="completed"?"সম্পন্ন":b.status==="cancelled"?"বাতিল":(b.status||"চলমান"),
    statusEn:   b.status==="completed"?"Completed":b.status==="cancelled"?"Cancelled":(b.statusEn||"Ongoing"),
    date:       (b.scheduled_time||b.scheduled_at)?new Date(b.scheduled_time||b.scheduled_at).toLocaleDateString("bn-BD"):(b.date||""),
    dateEn:     (b.scheduled_time||b.scheduled_at)?new Date(b.scheduled_time||b.scheduled_at).toLocaleDateString("en-GB"):(b.dateEn||""),
    price:      (b.amount||b.total_amount)?`৳${b.amount||b.total_amount}`:(b.price||""),
    icon:       b.icon||"📋",
    pid:        b.provider_id||b.pid,
  });
  const bookingsData = ctxBookings.map(toUiBk);

  const STATUS_DISPLAY={completed:{bn:"সম্পন্ন",en:"Completed",bg:"#D1FAE5",col:"#065F46"},ongoing:{bn:"চলমান",en:"Ongoing",bg:"#DBEAFE",col:"#1D4ED8"},cancelled:{bn:"বাতিল",en:"Cancelled",bg:"#FEE2E2",col:"#B91C1C"}};
  const getStatus=b=>{if(b.status==="সম্পন্ন"||b.status==="completed"||b.statusEn==="Completed")return"completed";if(b.status==="বাতিল"||b.status==="cancelled"||b.statusEn==="Cancelled")return"cancelled";return"ongoing";};
  const list=filter==="all"?bookingsData:bookingsData.filter(b=>getStatus(b)===filter);
  // Find provider for rate/rebook (try context providers first, fall back to static)
  const findProvider = pid => ctxProviders.find(p=>p.id===pid)||PROVIDERS.find(p=>p.id===pid);

  const printReceipt=(b)=>{
    const w=window.open("","_blank","width=480,height=620");
    const sv=lang==="en"?b.svcEn||b.svc:b.svc;
    const pr=lang==="en"?b.providerEn||b.provider:b.provider;
    const dt=lang==="en"?b.dateEn||b.date:b.date;
    w.document.write("<!DOCTYPE html><html><head><meta charset='UTF-8'><title>Receipt</title>"+
      "<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;background:#f8fafc;padding:20px}"+
      ".rc{background:#fff;border-radius:12px;padding:28px;max-width:420px;margin:0 auto;border:1px solid #e2e8f0}"+
      ".logo{text-align:center;font-size:36px}.brand{text-align:center;font-weight:800;font-size:18px;color:#1e293b}"+
      ".tag{text-align:center;font-size:11px;color:#64748b;margin-bottom:16px}"+
      ".dv{border:none;border-top:2px dashed #e2e8f0;margin:12px 0}"+
      ".title{text-align:center;font-size:15px;font-weight:700;color:#0f172a;margin-bottom:12px}"+
      ".ab{background:#f0fdf4;border-radius:10px;padding:14px;text-align:center;margin:14px 0}"+
      ".av{font-size:26px;font-weight:900;color:#166534}.al{font-size:11px;color:#4ade80;margin-top:2px}"+
      ".st{display:inline-block;background:#dcfce7;color:#166534;padding:3px 12px;border-radius:99px;font-size:11px;font-weight:700;margin-top:4px}"+
      ".rw{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f1f5f9}"+
      ".lbl{font-size:12px;color:#64748b}.val{font-size:13px;font-weight:600;color:#0f172a;text-align:right}"+
      ".ft{text-align:center;font-size:10px;color:#94a3b8;margin-top:16px}"+
      "@media print{body{background:#fff;padding:0}}</style></head>"+
      "<body onload='window.print()'><div class='rc'>"+
      "<div class='logo'>\uD83E\uDDFE</div>"+
      "<div class='brand'>IMAP Bangladesh</div>"+
      "<div class='tag'>Payment Receipt &middot; \u09AA\u09C7\u09AE\u09C7\u09A8\u09CD\u099F \u09B0\u09B8\u09BF\u09A6</div>"+
      "<hr class='dv'/><div class='title'>&#x2705; Payment Successful</div>"+
      "<div class='ab'><div class='av'>"+b.price+"</div>"+
      "<div class='al'>Amount Paid &middot; \u09AA\u09CD\u09B0\u09A6\u09A4\u09CD\u09A4 \u09AA\u09B0\u09BF\u09AE\u09BE\u09A3</div>"+
      "<div class='st'>PAID</div></div><hr class='dv'/>"+
      "<div class='rw'><span class='lbl'>Receipt No</span><span class='val' style='font-family:monospace'>"+((b.id||b.booking_ref)||"\u2014")+"</span></div>"+
      "<div class='rw'><span class='lbl'>Service &middot; \u09B8\u09C7\u09AC\u09BE</span><span class='val'>"+( sv||"\u2014")+"</span></div>"+
      "<div class='rw'><span class='lbl'>Provider</span><span class='val'>"+( pr||"IMAP Provider")+"</span></div>"+
      "<div class='rw'><span class='lbl'>Date &middot; \u09A4\u09BE\u09B0\u09BF\u0996</span><span class='val'>"+( dt||"\u2014")+"</span></div>"+
      "<div class='rw'><span class='lbl'>Payment Method</span><span class='val'>SSLCommerz / MFS</span></div>"+
      "<div class='rw'><span class='lbl'>Status</span><span class='val' style='color:#16a34a'>Completed &#x2713;</span></div>"+
      "<hr class='dv'/><div class='ft'>IMAP Platform &middot; imap.com.bd<br/>This is an official payment receipt.</div>"+
      "</div></body></html>");
    w.document.close();
  };

  const printInvoice=(b)=>{
    const w=window.open("","_blank","width=560,height=760");
    const sv=lang==="en"?b.svcEn||b.svc:b.svc;
    const pr=lang==="en"?b.providerEn||b.provider:b.provider;
    const dt=lang==="en"?b.dateEn||b.date:b.date;
    const raw=parseFloat((b.price||"").toString().replace(/[^0-9.]/g,""))||0;
    const vat=parseFloat((raw*0.15).toFixed(2));
    const sub=parseFloat((raw-vat).toFixed(2));
    const now=new Date().toLocaleDateString("en-GB");
    const invNo="INV-"+((b.id||b.booking_ref||"0000").slice(-8).toUpperCase());
    w.document.write("<!DOCTYPE html><html><head><meta charset='UTF-8'><title>Invoice</title>"+
      "<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;background:#f8fafc;padding:20px}"+
      ".inv{background:#fff;border-radius:12px;padding:32px;max-width:500px;margin:0 auto;border:1px solid #e2e8f0}"+
      ".hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px}"+
      ".bn{font-size:22px;font-weight:900;color:#1e293b}.bs{font-size:11px;color:#64748b;margin-top:2px}"+
      ".ir{text-align:right}.it{font-size:20px;font-weight:900;color:#3b82f6;letter-spacing:1px}"+
      ".in{font-size:12px;color:#64748b;font-family:monospace;margin-top:4px}"+
      ".pt2{display:grid;grid-template-columns:1fr 1fr;gap:16px;background:#f8fafc;border-radius:10px;padding:16px;margin-bottom:20px}"+
      ".ptl{font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:6px}"+
      ".ptn{font-size:14px;font-weight:700;color:#0f172a}.pti{font-size:11px;color:#64748b;margin-top:2px}"+
      "table{width:100%;border-collapse:collapse;margin-bottom:16px}"+
      "th{background:#f8fafc;padding:10px 12px;font-size:11px;font-weight:700;color:#64748b;text-align:left;border-bottom:2px solid #e2e8f0}"+
      "td{padding:10px 12px;font-size:13px;border-bottom:1px solid #f1f5f9}"+
      ".tots{margin-left:auto;width:220px}"+
      ".tr2{display:flex;justify-content:space-between;padding:6px 0;font-size:13px;border-bottom:1px solid #f1f5f9}"+
      ".trt{border-bottom:none!important;font-weight:900;font-size:15px;color:#166534;padding-top:10px!important;margin-top:4px}"+
      ".ft{text-align:center;font-size:10px;color:#94a3b8;margin-top:20px;border-top:1px solid #f1f5f9;padding-top:12px}"+
      "@media print{body{background:#fff;padding:0}}</style></head>"+
      "<body onload='window.print()'><div class='inv'>"+
      "<div class='hdr'><div><div class='bn'>&#x1F3F7;&#xFE0F; IMAP</div><div class='bs'>Bangladesh Home Services</div></div>"+
      "<div class='ir'><div class='it'>INVOICE</div><div class='in'>"+invNo+"</div>"+
      "<div style='font-size:11px;color:#64748b;margin-top:2px'>Date: "+now+"</div></div></div>"+
      "<div class='pt2'>"+
      "<div><div class='ptl'>Billed To &middot; \u09AC\u09BF\u09B2 \u09AA\u09CD\u09B0\u09BE\u09AA\u0995</div><div class='ptn'>Customer</div><div class='pti'>IMAP Platform User</div></div>"+
      "<div><div class='ptl'>Service Provider</div><div class='ptn'>"+( pr||"IMAP Provider")+"</div><div class='pti'>IMAP Verified Professional</div></div></div>"+
      "<table><thead><tr><th>Description</th><th>Date</th><th style='text-align:right'>Amount</th></tr></thead>"+
      "<tbody><tr><td>"+( sv||"Home Service")+"</td><td>"+( dt||"\u2014")+"</td><td style='text-align:right;font-weight:700'>\u09F3"+sub.toLocaleString()+"</td></tr></tbody></table>"+
      "<div class='tots'>"+
      "<div class='tr2'><span>Subtotal</span><span>\u09F3"+sub.toLocaleString()+"</span></div>"+
      "<div class='tr2'><span>VAT (15%)</span><span>\u09F3"+vat.toLocaleString()+"</span></div>"+
      "<div class='tr2 trt'><span>Total</span><span>\u09F3"+raw.toLocaleString()+"</span></div></div>"+
      "<div class='ft'>Ref: "+((b.id||b.booking_ref)||"\u2014")+" &middot; Thank you for using IMAP &middot; imap.com.bd</div>"+
      "</div></body></html>");
    w.document.close();
  };

  const FILTERS=[["all",tr.all],["ongoing",tr.ongoing],["completed",tr.completed],["cancelled",tr.cancelled]];
  return (
    <div>
      <div className="row" style={{justifyContent:"space-between",marginBottom:20,flexWrap:"wrap",gap:10}}>
        <div style={{fontSize:18,fontWeight:700}}>📋 {tr.mbTitle}</div>
        <div className="row" style={{gap:7}}>
          {FILTERS.map(([f,l])=>(
            <button key={f} className="btn" onClick={()=>setFilter(f)} style={{padding:"6px 12px",borderRadius:99,border:`1.5px solid ${filter===f?C.p:C.bdr}`,background:filter===f?C.p:"#fff",color:filter===f?"#fff":C.sub,fontSize:12,fontWeight:600}}>{l}</button>
          ))}
        </div>
      </div>
      {list.map((b,i)=>{
        const st=getStatus(b);
        const S=STATUS_DISPLAY[st];
        const svc=lang==="en"?b.svcEn:b.svc;
        const provider=lang==="en"?b.providerEn:b.provider;
        const date=lang==="en"?b.dateEn:b.date;
        return (
          <div key={i} className="card" style={{padding:16,marginBottom:11,animation:`fadeUp .4s ease ${i*.06}s both`}}>
            <div className="row" style={{justifyContent:"space-between",marginBottom:st==="ongoing"?10:0}}>
              <div className="row" style={{gap:11}}>
                <div className="jc" style={{width:44,height:44,borderRadius:12,background:C.bg,fontSize:22,flexShrink:0}}>{b.icon}</div>
                <div>
                  <div style={{fontSize:14,fontWeight:700}}>{svc}</div>
                  <div style={{fontSize:12,color:C.muted}}>{provider}</div>
                  <div style={{fontSize:11,color:C.muted,marginTop:2}}>{date} · {b.id}</div>
                </div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:15,fontWeight:700,color:C.p}}>{b.price}</div>
                <span className="badge" style={{background:S.bg,color:S.col,marginTop:4,display:"inline-flex"}}>{S[lang]||S.en}</span>
              </div>
            </div>
            {st==="ongoing"&&(<div><div style={{background:"#EFF6FF",borderRadius:10,padding:10,border:"1px solid #BFDBFE"}}><div style={{fontSize:12,color:"#1D4ED8",fontWeight:600,marginBottom:5}}>🔵 {tr.pComing}</div><PBar v={60} col="#2563EB"/></div>{b.payment_status==="pending"&&onPay&&(<button onClick={()=>onPay(b.id||b.booking_ref)} style={{marginTop:8,width:"100%",padding:"9px",borderRadius:10,border:"none",background:"#6366F1",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>💳 {lang==="bn"?"পেমেন্ট করুন":"Pay Now"}</button>)}</div>)}
            {st==="completed"&&<div style={{marginTop:10}}>
              <div className="row" style={{gap:8,marginBottom:7}}>
                <button className="btn btn-gh" style={{flex:1,border:`1px solid ${C.bdr}`,fontSize:12}} onClick={()=>onRate(findProvider(b.pid))}>{tr.giveRating}</button>
                <button className="btn btn-g" style={{flex:1,padding:"8px",fontSize:12}} onClick={()=>onBook(findProvider(b.pid))}>{tr.rebookBtn}</button>
              </div>
              <div className="row" style={{gap:8}}>
                <button onClick={()=>setGuarantee(b)} style={{flex:1,padding:"7px",borderRadius:10,border:"1.5px solid #10B981",background:"#D1FAE5",color:"#065F46",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>🛡️ {lang==="en"?"Guarantee":"গ্যারান্টি"}</button>
                <button onClick={()=>setDispute(b)} style={{flex:1,padding:"7px",borderRadius:10,border:"1.5px solid #F59E0B",background:"#FFFBEB",color:"#92400E",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>⚠️ {lang==="en"?"Dispute":"অভিযোগ"}</button>
              </div>
              <div className="row" style={{gap:8,marginTop:7}}>
                <button onClick={()=>printReceipt(b)} style={{flex:1,padding:"7px",borderRadius:10,border:"1.5px solid #6366F1",background:"#EEF2FF",color:"#3730A3",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>🧾 {lang==="en"?"Receipt":"রসিদ"}</button>
                <button onClick={()=>printInvoice(b)} style={{flex:1,padding:"7px",borderRadius:10,border:"1.5px solid #3B82F6",background:"#EFF6FF",color:"#1D4ED8",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>📄 {lang==="en"?"Invoice":"ইনভয়েস"}</button>
              </div>
            </div>}
            {st==="cancelled"&&<div style={{marginTop:10}}>
              <button onClick={()=>setDispute(b)} style={{width:"100%",padding:"8px",borderRadius:10,border:"1.5px solid #EF4444",background:"#FEE2E2",color:"#B91C1C",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>⚠️ {lang==="en"?"File Dispute / Refund":"অভিযোগ / রিফান্ড"}</button>
            </div>}
          </div>
        );
      })}
      {list.length===0&&<div style={{textAlign:"center",padding:"30px 0",color:C.muted,fontSize:14}}>{tr.noBookings}</div>}
      {dispute&&<DisputeModal booking={dispute} onClose={()=>setDispute(null)}/>}
      {guarantee&&<GuaranteeModal booking={guarantee} onClose={()=>setGuarantee(null)}/>}
    </div>
  );
}

/* ══ LOAN SCORE ══ */
function LoanScore() {
  const C=useC();
  const tr=useTr();
  const lang=tr===T.en?"en":"bn";
  const { providers: ctxProviders } = useLiveData();
  const p=toUiProv(ctxProviders[0]||PROVIDERS[0]);
  const score=p.loanScore;
  const [applyOffer,setApplyOffer]=useState(null);
  const [loanName,setLoanName]=useState("");
  const [loanPhone,setLoanPhone]=useState("");
  const [loanPurpose,setLoanPurpose]=useState("");
  const [loanDone,setLoanDone]=useState(false);
  const [loanRef,setLoanRef]=useState("");
  const OFFERS=[
    {amt:"৳৫০,০০০",rate:"৯%",tenure:"12",badge:tr.lo1,best:true},
    {amt:"৳১,০০,০০০",rate:"১১%",tenure:"24",badge:tr.lo2,best:false},
    {amt:"৳২,০০,০০০",rate:"১৩%",tenure:"36",badge:tr.lo3,best:false},
  ];
  const msg=score>=80?tr.loanHigh:score>=60?tr.loanMid:tr.loanLow;

  if(applyOffer&&!loanDone) return (
    <div>
      <div style={{background:`linear-gradient(135deg,${C.dark},${C.p}99)`,borderRadius:18,padding:20,marginBottom:20,color:"#fff"}}>
        <div style={{fontSize:12,opacity:.7,marginBottom:4}}>💹 {lang==="en"?"Loan Application":"ঋণ আবেদন"}</div>
        <div style={{fontSize:22,fontWeight:800}}>{applyOffer.amt}</div>
        <div style={{fontSize:13,opacity:.8}}>{applyOffer.rate} {tr.interestL} · {applyOffer.tenure} {lang==="en"?"months":"মাস"}</div>
      </div>
      <div style={{background:C.card,borderRadius:16,padding:18,border:`1px solid ${C.bdr}`,marginBottom:16}}>
        {[[lang==="en"?"Full Name":"পূর্ণ নাম",loanName,setLoanName,"text"],[lang==="en"?"Phone Number":"ফোন নম্বর",loanPhone,setLoanPhone,"tel"],[lang==="en"?"Loan Purpose":"ঋণের উদ্দেশ্য",loanPurpose,setLoanPurpose,"text"]].map(([lbl,val,set,type])=>(
          <div key={lbl} style={{marginBottom:14}}>
            <label style={{fontSize:12,color:C.sub,fontWeight:600,display:"block",marginBottom:5}}>{lbl}</label>
            <input value={val} onChange={e=>set(e.target.value)} type={type} style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1.5px solid ${C.bdr}`,background:C.bg,color:C.text,fontSize:13,fontFamily:"'Hind Siliguri',sans-serif",boxSizing:"border-box"}}/>
          </div>
        ))}
        <div style={{background:`${C.p}10`,borderRadius:12,padding:"11px 14px",marginBottom:16,fontSize:12,color:C.sub}}>
          📊 {lang==="en"?"Your loan score:":"আপনার লোন স্কোর:"} <b style={{color:C.p}}>{score}/100</b> — {msg}
        </div>
      </div>
      <div style={{display:"flex",gap:10}}>
        <button onClick={()=>setApplyOffer(null)} style={{flex:1,padding:"12px",borderRadius:12,background:C.bg,border:`1.5px solid ${C.bdr}`,color:C.sub,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>{lang==="en"?"← Back":"← ফিরুন"}</button>
        <button onClick={()=>{
          if(!loanName.trim()||!loanPhone.trim())return;
          setLoanRef(`LN-${Math.floor(Math.random()*900000+100000)}`);
          setLoanDone(true);
        }} disabled={!loanName.trim()||!loanPhone.trim()} style={{flex:2,padding:"12px",borderRadius:12,background:loanName.trim()&&loanPhone.trim()?C.p:"#ccc",border:"none",color:"#fff",fontSize:14,fontWeight:700,cursor:loanName.trim()&&loanPhone.trim()?"pointer":"default",fontFamily:"'Hind Siliguri',sans-serif"}}>
          {lang==="en"?"Submit Application":"আবেদন জমা দিন"}
        </button>
      </div>
    </div>
  );

  if(loanDone) return (
    <div style={{textAlign:"center",padding:"24px 0"}}>
      <div style={{fontSize:56,marginBottom:12}}>🎉</div>
      <div style={{fontSize:18,fontWeight:700,color:"#065F46",marginBottom:8}}>{lang==="en"?"Application Submitted!":"আবেদন জমা হয়েছে!"}</div>
      <div style={{fontSize:13,color:C.muted,marginBottom:20}}>{lang==="en"?"We will review and contact you within 2–3 business days.":"আমরা ২–৩ কার্যদিবসের মধ্যে আপনার সাথে যোগাযোগ করব।"}</div>
      <div style={{background:"#D1FAE5",borderRadius:12,padding:"14px 18px",marginBottom:20,display:"inline-block"}}>
        <div style={{fontSize:12,color:"#065F46",fontWeight:700,marginBottom:4}}>{lang==="en"?"Application ID":"আবেদন আইডি"}</div>
        <div style={{fontSize:18,fontWeight:800,color:"#10B981",fontFamily:"monospace"}}>{loanRef}</div>
      </div>
      <br/>
      <button onClick={()=>{setLoanDone(false);setApplyOffer(null);}} style={{padding:"11px 28px",borderRadius:12,background:C.p,border:"none",color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>{lang==="en"?"Close":"বন্ধ করুন"}</button>
    </div>
  );

  return (
    <div>
      <div style={{background:`linear-gradient(135deg,${C.dark},${C.p}99)`,borderRadius:18,padding:20,marginBottom:14}}>
        <div style={{fontSize:11,color:"rgba(255,255,255,.6)",fontWeight:600,letterSpacing:1,textTransform:"uppercase",marginBottom:7}}>💹 {tr.loanTitle}</div>
        <div className="row" style={{alignItems:"flex-end",gap:8,marginBottom:10}}>
          <div style={{fontSize:52,fontWeight:800,color:"#fff",fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1}}>{score}</div>
          <div style={{fontSize:17,color:"rgba(255,255,255,.5)",paddingBottom:5}}>/100</div>
        </div>
        <PBar v={score} col="#fff"/>
        <div style={{fontSize:13,color:"rgba(255,255,255,.8)",marginTop:8}}>{msg}</div>
      </div>
      <div style={{background:"#fff",borderRadius:13,padding:14,marginBottom:14,border:`1px solid ${C.bdr}`}}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>{tr.scoreAnalysis}</div>
        {[["📋",95],["💳",88],["⭐",92],["📱",78],["🏆",70]].map(([ic,s],i)=>{
          const labels={en:["Service History","Payment Regularity","Customer Rating","Activity","Years of Experience"],bn:["সেবার ইতিহাস","পেমেন্ট নিয়মিততা","গ্রাহক রেটিং","সক্রিয়তা","অভিজ্ঞতার বছর"]};
          return (
            <div key={i} style={{marginBottom:10}}>
              <div className="row" style={{justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:12}}>{ic} {labels[lang][i]}</span><span style={{fontSize:12,fontWeight:700,color:s>=80?C.p:s>=60?"#F59E0B":"#EF4444"}}>{s}%</span></div>
              <PBar v={s} col={s>=80?C.p:s>=60?"#F59E0B":"#EF4444"}/>
            </div>
          );
        })}
      </div>
      <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>{tr.availOffers}</div>
      {OFFERS.map((o,i)=>(
        <div key={i} style={{background:"#fff",borderRadius:14,padding:15,marginBottom:10,border:`${o.best?"2px":"1px"} solid ${o.best?C.p:C.bdr}`,boxShadow:o.best?`0 4px 14px ${C.p}20`:"none"}}>
          {o.best&&<div style={{fontSize:10,fontWeight:700,color:C.p,letterSpacing:1,marginBottom:5}}>{tr.bestOfferL}</div>}
          <div className="row" style={{justifyContent:"space-between"}}>
            <div>
              <div style={{fontSize:19,fontWeight:700}}>{o.amt}</div>
              <div style={{fontSize:12,color:C.muted,marginTop:2}}>{o.rate} {tr.interestL} · {o.tenure} {tr.min==="মিনিট"?"মাস":"months"}</div>
              <span className="badge" style={{background:C.plt,color:C.p,marginTop:6,fontSize:10}}>{o.badge}</span>
            </div>
            <button onClick={()=>setApplyOffer(o)} className="btn" style={{padding:"10px 15px",background:o.best?`linear-gradient(135deg,${C.p},${C.pdk})`:"#fff",border:`1.5px solid ${o.best?"transparent":C.bdr}`,borderRadius:11,color:o.best?"#fff":C.p,fontSize:13,fontWeight:700,fontFamily:"'Hind Siliguri',sans-serif"}}>{tr.applyBtn}</button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ══ PROVIDER DASHBOARD ══ */
function ProviderDash() {
  const C=useC();
  const tr=useTr();
  const lang=tr===T.en?"en":"bn";
  const [tab,setTab]=useState("overview");
  const { providers: ctxProviders } = useLiveData();
  const p=toUiProv(ctxProviders[0]||PROVIDERS[0]);
  const JOBS=[
    {t:lang==="en"?"Electrical Repair":"ইলেকট্রিক মেরামত",loc:lang==="en"?"Mirpur 10":"মিরপুর ১০",price:"৳৪৫০",time:lang==="en"?"5 min ago":"৫ মি আগে",urgent:true},
    {t:lang==="en"?"Fan Connection":"পাখার সংযোগ",loc:lang==="en"?"Gulshan 2":"গুলশান ২",price:"৳২৫০",time:lang==="en"?"12 min ago":"১২ মি আগে",urgent:false},
    {t:lang==="en"?"Meter Box Fix":"মিটার বক্স ঠিক",loc:lang==="en"?"Dhanmondi":"ধানমন্ডি",price:"৳৬০০",time:lang==="en"?"30 min ago":"৩০ মি আগে",urgent:false},
  ];
  const name=lang==="en"?p.nameEn:p.name;
  const svc=lang==="en"?p.svcEn:p.svc;
  const loc=lang==="en"?p.locEn:p.loc;
  return (
    <div>
      <div style={{background:`linear-gradient(135deg,${C.dark},#0F3326)`,borderRadius:18,padding:20,marginBottom:16}}>
        <div className="row" style={{gap:14,marginBottom:16}}>
          <Av av={p.av} col={p.col} size={58} fs={20} rad={16}/>
          <div style={{flex:1}}>
            <div style={{fontSize:17,fontWeight:700,color:"#fff"}}>{name}</div>
            <div style={{fontSize:13,color:"rgba(255,255,255,.6)"}}>{svc} · {loc}</div>
            <div className="row" style={{gap:6,marginTop:5}}>
              <span className="badge" style={{background:"rgba(255,255,255,.15)",color:"#fff",fontSize:10}}>✓ {lang==="en"?"Verified":"যাচাইকৃত"}</span>
              <span className="badge" style={{background:"rgba(245,166,35,.3)",color:"#FCD34D",fontSize:10}}>★ {p.r}</span>
            </div>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(80px,1fr))",gap:10}}>
          {[["৳৪৮,৫০০",tr.thisMonth],["৮৪৭",tr.totalJobsM],["৯৮%",tr.successRate]].map(([v,l],i)=>(
            <div key={i} style={{textAlign:"center",background:"rgba(255,255,255,.08)",borderRadius:11,padding:10}}>
              <div style={{fontSize:16,fontWeight:700,color:"#fff"}}>{v}</div>
              <div style={{fontSize:10,color:"rgba(255,255,255,.55)"}}>{l}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="row" style={{gap:7,marginBottom:16}}>
        {[[" overview",tr.dOverview],["jobs",tr.dJobs],["earnings",tr.dEarnings],["loan",tr.dLoan]].map(([id,l])=>(
          <button key={id} className="btn" onClick={()=>setTab(id.trim())} style={{flex:1,padding:"9px 4px",borderRadius:11,border:`1.5px solid ${tab===id.trim()?C.p:C.bdr}`,background:tab===id.trim()?C.p:"#fff",color:tab===id.trim()?"#fff":C.sub,fontSize:11,fontWeight:600}}>{l}</button>
        ))}
      </div>
      {tab==="overview"&&<div>
        <div className="g2" style={{marginBottom:14}}>
          {[{ic:"📊",l:tr.perfScore,v:`${p.score}/100`,col:C.p},{ic:"⏱️",l:tr.avgResp,v:`8 ${tr.min}`,col:"#3B82F6"},{ic:"📋",l:tr.todayJobs,v:"3",col:"#F59E0B"},{ic:"💹",l:tr.loanScoreL||"Loan Score",v:`${p.loanScore}/100`,col:"#8B5CF6"}].map((item,i)=>(
            <div key={i} style={{background:"#fff",borderRadius:13,padding:14,border:`1px solid ${C.bdr}`}}>
              <div style={{fontSize:20,marginBottom:5}}>{item.ic}</div>
              <div style={{fontSize:16,fontWeight:700,color:item.col}}>{item.v}</div>
              <div style={{fontSize:11,color:C.muted}}>{item.l}</div>
            </div>
          ))}
        </div>
        <div style={{background:"#fff",borderRadius:13,padding:14,border:`1px solid ${C.bdr}`}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>{tr.badgesL}</div>
          <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
            {(lang==="en"?["⚡ Electrical Expert","🌟 Top Rated","⏰ On Time","🔒 Trusted"]:["⚡ বিদ্যুৎ বিশেষজ্ঞ","🌟 সেরা রেটিং","⏰ সময়মতো","🔒 বিশ্বস্ত"]).map(b=>(
              <span key={b} className="badge" style={{background:C.plt,color:C.p,fontSize:11,padding:"5px 11px"}}>{b}</span>
            ))}
          </div>
        </div>
      </div>}
      {tab==="jobs"&&<div>
        {JOBS.map((j,i)=>(
          <div key={i} className="card" style={{padding:14,marginBottom:10}}>
            <div className="row" style={{justifyContent:"space-between"}}>
              <div>
                <div className="row" style={{gap:7}}>
                  <div style={{fontSize:14,fontWeight:700}}>{j.t}</div>
                  {j.urgent&&<span className="badge" style={{background:"#FEE2E2",color:"#B91C1C",fontSize:10}}>{tr.urgent}</span>}
                </div>
                <div style={{fontSize:12,color:C.muted,marginTop:3}}>📍 {j.loc} · {j.time}</div>
              </div>
              <div style={{fontSize:16,fontWeight:700,color:C.p}}>{j.price}</div>
            </div>
            <div className="row" style={{gap:8,marginTop:11}}>
              <button className="btn btn-g" style={{flex:1,padding:"9px",fontSize:12}}>{tr.acceptBtn}</button>
              <button className="btn btn-gh" style={{flex:1,border:`1px solid ${C.bdr}`,fontSize:12}}>{tr.rejectBtn}</button>
            </div>
          </div>
        ))}
      </div>}
      {tab==="earnings"&&<div>
        <div style={{background:"#fff",borderRadius:13,padding:16,border:`1px solid ${C.bdr}`,marginBottom:14}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:14}}>{tr.weeklyEarnings}</div>
          <MiniBar data={p.earnings} tr={tr}/>
        </div>
        <div style={{background:"#fff",borderRadius:13,padding:14,border:`1px solid ${C.bdr}`}}>
          {[[tr.thisWeek,"৳১১,৪০০"],[tr.thisMonth,"৳৪৮,৫০০"],[tr.totalEarnings,"৳২,৯৬,৪৫০"]].map(([l,v],i)=>(
            <div key={i} className="row" style={{justifyContent:"space-between",padding:"10px 0",borderBottom:i<2?`1px solid ${C.bdr}`:"none"}}><span style={{fontSize:13,color:C.muted}}>{l}</span><span style={{fontSize:14,fontWeight:700,color:C.p}}>{v}</span></div>
          ))}
        </div>
      </div>}
      {tab==="loan"&&<LoanScore/>}
    </div>
  );
}

/* ══ NID PAGE ══ */
function NIDPage({onClose}) {
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
    }catch(e){console.warn("KYC submit:",e?.data?.error||e.message);}
    setSubmitting(false);
    setStep(2);
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
        <div style={{background:"#fff",borderRadius:13,border:`1px solid ${C.bdr}`,overflow:"hidden",marginBottom:16}}>
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
            <div key={i} style={{background:"#fff",borderRadius:11,padding:12,border:`1px solid ${C.bdr}`,textAlign:"center"}}>
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
          <div style={{background:"#D1FAE5",borderRadius:11,padding:"10px 14px",marginBottom:10,border:"1.5px solid #059669"}}>
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

/* ══ ELDERLY MODE ══ */
function ElderlyMode({onExit,onBook,onEmergency}) {
  const C=useC();
  const tr=useTr();
  const { providers: ctxProviders } = useLiveData();
  const pv = ctxProviders.map(toUiProv);
  const SERVICES=[{icon:"⚡",name:tr.elecProblem,p:pv[0]||PROVIDERS[0]},{icon:"🔧",name:tr.waterProblem,p:pv[2]||PROVIDERS[2]},{icon:"🏥",name:tr.docNurse,p:pv[1]||PROVIDERS[1]},{icon:"🧹",name:tr.cleanService,p:pv[3]||PROVIDERS[3]}];
  return (
    <div style={{minHeight:"100vh",background:"#F0FFF8",padding:"24px 16px 88px",fontFamily:"'Hind Siliguri',sans-serif"}}>
      <div className="row" style={{justifyContent:"space-between",marginBottom:24}}>
        <div><div style={{fontSize:26,fontWeight:700,color:C.text}}>{tr.elderlyGreet}</div><div style={{fontSize:16,color:C.muted}}>{tr.elderlyWith}</div></div>
        <button onClick={onExit} style={{background:C.plt,border:"none",borderRadius:11,padding:"10px 16px",fontSize:15,cursor:"pointer",color:C.p,fontWeight:700,fontFamily:"'Hind Siliguri',sans-serif"}}>{tr.normalMode}</button>
      </div>
      <button onClick={onEmergency} style={{width:"100%",padding:"28px",background:"linear-gradient(135deg,#E53E3E,#C53030)",border:"none",borderRadius:22,color:"#fff",fontSize:22,fontWeight:700,cursor:"pointer",marginBottom:22,boxShadow:"0 6px 25px rgba(229,62,62,.5)",animation:"pulse 2s infinite",fontFamily:"'Hind Siliguri',sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:14}}>
        <span style={{fontSize:42}}>🚨</span>
        <div style={{textAlign:"left"}}><div>{tr.emergency}</div><div style={{fontSize:16,opacity:.85}}>{tr.emergencyDesc.slice(0,30)}...</div></div>
      </button>
      <div style={{fontSize:20,fontWeight:700,marginBottom:16,color:C.text}}>{tr.needWhat}</div>
      <div className="g2" style={{gap:16,marginBottom:22}}>
        {SERVICES.map((s,i)=>(
          <button key={i} onClick={()=>onBook(s.p)} style={{padding:"26px 10px",background:"#fff",border:`3px solid ${C.bdr}`,borderRadius:20,cursor:"pointer",textAlign:"center",fontFamily:"'Hind Siliguri',sans-serif",boxShadow:"0 3px 12px rgba(21,163,96,.08)",width:"100%"}}>
            <div style={{fontSize:46,marginBottom:10}}>{s.icon}</div>
            <div style={{fontSize:18,fontWeight:700,color:C.text,lineHeight:1.3}}>{s.name}</div>
          </button>
        ))}
      </div>
      <div style={{background:"#fff",borderRadius:20,padding:20,border:`1px solid ${C.bdr}`,textAlign:"center"}}>
        <div style={{fontSize:46,marginBottom:8}}>🎙️</div>
        <div style={{fontSize:19,fontWeight:700}}>{tr.voiceHelp}</div>
        <div style={{fontSize:15,color:C.muted,marginTop:5,marginBottom:16}}>{tr.voiceSub}</div>
        <button className="jc" style={{width:68,height:68,borderRadius:"50%",background:`linear-gradient(135deg,${C.p},${C.pdk})`,border:"none",cursor:"pointer",fontSize:28,margin:"0 auto",boxShadow:`0 4px 20px ${C.p}60`}}>🎙️</button>
      </div>
    </div>
  );
}

/* ══ SEARCH / FILTER ══ */
function SearchFilter({onClose,onBook,onView}) {
  const C=useC();
  const tr=useTr();
  const lang=tr===T.en?"en":"bn";
  const [query,setQuery]=useState("");
  const [selCat,setSelCat]=useState("all");
  const [maxPrice,setMaxPrice]=useState(1000);
  const [minRating,setMinRating]=useState(0);
  const [sortBy,setSortBy]=useState("rating");
  const [aiSearching,setAiSearching]=useState(false);
  const [aiHint,setAiHint]=useState("");
  const { providers: ctxProviders } = useLiveData();
  const provData = ctxProviders.map(toUiProv);

  const doAiSearch=async()=>{
    if(!query.trim())return;
    setAiSearching(true);setAiHint("");
    try{
      const prompt=lang==="en"
        ?`IMAP service search: "${query}". Reply ONLY with valid JSON, no extra text: {"category":"electrical|plumbing|cleaning|nursing|cooking|all","sortBy":"rating|price|jobs","maxPrice":500,"hint":"one line"}`
        :`IMAP সার্ভিস সার্চ: "${query}"। শুধু valid JSON দাও, অতিরিক্ত কিছু না: {"category":"electrical|plumbing|cleaning|nursing|cooking|all","sortBy":"rating|price|jobs","maxPrice":500,"hint":"এক লাইন"}`;
      const r=await ai.chat([{role:"user",content:prompt}],lang);
      const m=r.reply.match(/\{[\s\S]*?\}/);
      if(m){const j=JSON.parse(m[0]);if(j.category)setSelCat(j.category);if(j.sortBy)setSortBy(j.sortBy);if(j.maxPrice)setMaxPrice(Math.min(2000,Math.max(200,j.maxPrice)));if(j.hint)setAiHint(j.hint);}
    }catch(e){setAiHint(lang==="en"?"Could not parse, showing all results":"ফলাফল দেখানো হচ্ছে");}
    finally{setAiSearching(false);}
  };

  const cats=[{id:"all",label:tr.allSvcs},...SVCS.map(s=>({id:s.nameEn,label:lang==="en"?s.nameEn:s.name}))];
  const filtered=provData.filter(p=>{
    const priceNum=parseInt(p.price.replace(/[৳,]/g,""))||0;
    const inCat=selCat==="all"||(lang==="en"?p.svcEn===selCat:p.svc===selCat)||(p.svcEn===selCat);
    const nm=lang==="en"?p.nameEn:p.name;
    const sv=lang==="en"?p.svcEn:p.svc;
    const lc=lang==="en"?p.locEn:p.loc;
    const inQ=!query||nm.toLowerCase().includes(query.toLowerCase())||sv.toLowerCase().includes(query.toLowerCase())||lc.toLowerCase().includes(query.toLowerCase());
    return inCat&&priceNum<=maxPrice&&p.r>=minRating&&inQ;
  }).sort((a,b)=>sortBy==="rating"?b.r-a.r:sortBy==="price"?parseInt(a.price.replace(/[৳,]/g,""))-parseInt(b.price.replace(/[৳,]/g,"")):b.jobs-a.jobs);
  return (
    <div style={{padding:22}}>
      <div className="row" style={{justifyContent:"space-between",marginBottom:16}}>
        <div style={{fontSize:17,fontWeight:700}}>{tr.searchTitle}</div>
        {onClose&&<button className="btn btn-gh" style={{fontSize:20}} onClick={onClose}>✕</button>}
      </div>
      <div style={{position:"relative",marginBottom:aiHint?6:14,display:"flex",gap:7,alignItems:"center"}}>
        <div style={{position:"relative",flex:1}}>
          <div style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:15,color:C.muted}}>🔍</div>
          <input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doAiSearch()} placeholder={tr.searchPh} style={{width:"100%",padding:"11px 14px 11px 38px",border:`1.5px solid ${C.bdr}`,borderRadius:11,fontSize:13,color:C.text,background:C.bg}} onFocus={e=>e.target.style.borderColor=C.p} onBlur={e=>e.target.style.borderColor=C.bdr}/>
        </div>
        <button onClick={doAiSearch} disabled={aiSearching||!query.trim()} className="btn btn-g" style={{padding:"10px 13px",borderRadius:11,fontSize:12,fontWeight:700,flexShrink:0,opacity:!query.trim()?0.4:1}}>{aiSearching?"⏳":"🤖 AI"}</button>
      </div>
      {aiHint&&<div style={{fontSize:11,color:C.p,fontWeight:600,marginBottom:10,padding:"4px 8px",background:C.plt,borderRadius:7}}>🤖 {aiHint}</div>}
      <div className="sx" style={{marginBottom:14}}>
        <div style={{display:"flex",gap:7,width:"max-content"}}>
          {cats.slice(0,9).map(cat=>(
            <button key={cat.id} onClick={()=>setSelCat(cat.id)} className="btn" style={{padding:"6px 12px",borderRadius:99,border:`1.5px solid ${selCat===cat.id?C.p:C.bdr}`,background:selCat===cat.id?C.p:"#fff",color:selCat===cat.id?"#fff":C.sub,fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}>{cat.label}</button>
          ))}
        </div>
      </div>
      <div style={{background:C.bg,borderRadius:12,padding:14,marginBottom:14}}>
        <div className="row" style={{justifyContent:"space-between",marginBottom:6}}>
          <div style={{fontSize:13,fontWeight:600}}>{tr.maxPrice}</div>
          <div style={{fontSize:13,fontWeight:700,color:C.p}}>৳{maxPrice}</div>
        </div>
        <input type="range" min={200} max={2000} step={50} value={maxPrice} onChange={e=>setMaxPrice(+e.target.value)} style={{width:"100%",accentColor:C.p}}/>
        <div className="row" style={{justifyContent:"space-between",marginTop:10}}>
          <div style={{fontSize:13,fontWeight:600}}>{tr.minRating}</div>
          <div style={{fontSize:13,fontWeight:700,color:C.p}}>{minRating>0?`${minRating}★`:tr.allRating}</div>
        </div>
        <input type="range" min={0} max={4.5} step={0.5} value={minRating} onChange={e=>setMinRating(+e.target.value)} style={{width:"100%",accentColor:C.p}}/>
      </div>
      <div className="row" style={{gap:7,marginBottom:14}}>
        {[["rating",tr.sortRating],["price",tr.sortPrice],["jobs",tr.sortJobs]].map(([id,l])=>(
          <button key={id} onClick={()=>setSortBy(id)} className="btn" style={{flex:1,padding:"8px 4px",borderRadius:99,border:`1.5px solid ${sortBy===id?C.p:C.bdr}`,background:sortBy===id?C.p:"#fff",color:sortBy===id?"#fff":C.sub,fontSize:11,fontWeight:600}}>{l}</button>
        ))}
      </div>
      <div style={{fontSize:12,color:C.muted,marginBottom:10,fontWeight:600}}>{filtered.length}{tr.resultsL}</div>
      <div style={{maxHeight:300,overflowY:"auto",display:"flex",flexDirection:"column",gap:9}}>
        {filtered.map((p,i)=>{
          const nm=lang==="en"?p.nameEn:p.name;
          const sv=lang==="en"?p.svcEn:p.svc;
          const lc=lang==="en"?p.locEn:p.loc;
          return (
            <div key={i} className="card" style={{padding:13,cursor:"pointer"}} onClick={()=>onView(p)}>
              <div className="row" style={{gap:10}}>
                <Av av={p.av} col={p.col} size={42}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:700}}>{nm}</div>
                  <div style={{fontSize:12,color:C.muted}}>{sv} · {lc}</div>
                  <div className="row" style={{gap:4,marginTop:3}}><Stars r={p.r} size={11}/><span style={{fontSize:11,fontWeight:600}}>{p.r}</span><span style={{fontSize:11,color:C.muted}}>· {p.jobs} {tr.jobs}</span></div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontSize:15,fontWeight:700,color:C.p}}>{p.price}</div>
                  <button className="btn btn-g" style={{padding:"5px 10px",fontSize:11,marginTop:5}} onClick={e=>{e.stopPropagation();onBook(p);}}>{tr.bookBtn}</button>
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length===0&&<div style={{textAlign:"center",padding:"20px 0",color:C.muted,fontSize:13}}>{tr.noResults}</div>}
      </div>
    </div>
  );
}

/* ══ CUSTOMER PROFILE OVERVIEW ══ */
function CustomerProfilePage({onNavigate, user, onAvatarUpdate}) {
  const C=useC();
  const tr=useTr();
  const lang=tr===T.en?"en":"bn";
  const { balance: ctxBalance } = useLiveData();
  const u=user||{name:"অতিথি",email:"guest@example.com",role:"customer",kycStatus:"pending",points:320};
  const kycColor={verified:"#10B981",pending:"#F59E0B",rejected:"#EF4444"};
  const kycLabel=lang==="bn"?{verified:"✅ যাচাইকৃত",pending:"⏳ অপেক্ষায়",rejected:"❌ প্রত্যাখ্যাত"}:{verified:"✅ Verified",pending:"⏳ Pending",rejected:"❌ Rejected"};
  const statusBg={completed:["#D1FAE5","#065F46"],cancelled:["#FEE2E2","#B91C1C"],pending:["#FEF9C3","#7C5800"]};
  const statusLabel=lang==="bn"?{completed:"সম্পন্ন",cancelled:"বাতিল",pending:"অপেক্ষায়"}:{completed:"Completed",cancelled:"Cancelled",pending:"Pending"};

  const [recentBookings,setRecentBookings]=useState([]);
  const [totalBookings,setTotalBookings]=useState(0);
  const [referralCount,setReferralCount]=useState(0);

  useEffect(()=>{
    bookingsApi.list({limit:3}).then(data=>{
      const list=Array.isArray(data)?data:(data.bookings||[]);
      const tot=data.total||list.length;
      setTotalBookings(tot);
      setRecentBookings(list.slice(0,3).map(b=>({
        id:b.id||"—",
        service:lang==="bn"?(b.service_name_bn||b.service_name_en||"সেবা"):(b.service_name_en||b.service_name_bn||"Service"),
        provider:b.provider_name||(lang==="bn"?"প্রদানকারী":"Provider"),
        date:b.scheduled_time?(new Date(b.scheduled_time).toLocaleDateString(lang==="bn"?"bn-BD":"en-GB")):(b.scheduled_at?new Date(b.scheduled_at).toLocaleDateString(lang==="bn"?"bn-BD":"en-GB"):(b.date||"—")),
        status:b.status||"pending",
      })));
    }).catch(()=>{});
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
              <span style={{background:statusBg[b.status][0],color:statusBg[b.status][1],borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:700,flexShrink:0}}>{statusLabel[b.status]}</span>
            </div>
          ))}
        </div>

        {/* KYC nudge if pending */}
        {(u.kycStatus||"pending")==="pending"&&(
          <div style={{background:"#FEF9C3",border:"1px solid #FCD34D",borderRadius:14,padding:16,marginBottom:18,display:"flex",gap:12,alignItems:"center"}}>
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

/* ══ NOTIFICATIONS ══ */
function NotifPage() {
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

/* ══ AI CHAT (Real API + Voice Input) ══ */
function Chat({isMobile}) {
  const C=useC();
  const tr=useTr();
  const lang=tr===T.en?"en":"bn";
  const [open,setOpen]=useState(false);
  const [msgs,setMsgs]=useState([{from:"ai",text:lang==="en"?"Hello! I'm IMAP AI 🤖 What service do you need?":"আস্সালামুয়ালাইকুম! আমি IMAP AI 🤖 কোন সেবা দরকার?", source:"system"}]);
  const [inp,setInp]=useState("");
  const [typing,setTyping]=useState(false);
  const [isListening,setIsListening]=useState(false);
  const ref=useRef(null);
  const recRef=useRef(null);
  const voiceSentRef=useRef(false); // prevents double-send
  const sendRef=useRef(null);       // always holds latest send() to avoid stale closure

  const QUICK_BN=["ইলেকট্রিশিয়ান 🔌","নার্স 🏥","জরুরি সেবা 🚨","দাম জানতে 💰","বুকিং করতে 📋"];
  const QUICK_EN=["Electrician 🔌","Nurse 🏥","Emergency 🚨","Pricing 💰","How to book 📋"];

  // Build OpenAI-style history from msgs
  const buildHistory=()=>msgs.slice(-8).map(m=>({role:m.from==="user"?"user":"assistant",content:m.text}));

  const send=async (t)=>{
    const txt=(t||inp).trim();
    if(!txt)return;
    setMsgs(m=>[...m,{from:"user",text:txt}]);
    setInp("");
    const streamId=Date.now();
    setMsgs(m=>[...m,{id:streamId,from:"ai",text:"",streaming:true,source:null}]);
    setTyping(true);
    try{
      const history=buildHistory();
      let acc="";
      for await(const chunk of ai.chatStream([...history,{role:"user",content:txt}],lang)){
        acc+=chunk;
        setMsgs(m=>m.map(msg=>msg.id===streamId?{...msg,text:acc}:msg));
      }
      setMsgs(m=>m.map(msg=>msg.id===streamId?{...msg,streaming:false,source:"gemini"}:msg));
    }catch(err){
      setMsgs(m=>m.map(msg=>msg.id===streamId?{...msg,streaming:false,text:lang==="en"?"Sorry, I had trouble connecting. Try again!":"দুঃখিত, সংযোগে সমস্যা হয়েছে। আবার চেষ্টা করুন!",source:"error"}:msg));
    }finally{
      setTyping(false);
    }
  };

  sendRef.current=send; // kept after send declaration — ref always has latest version

  // Voice input (Web Speech API) — auto-sends after recognition
  const startVoice=()=>{
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR)return alert(lang==="en"?"Voice not supported in this browser":"এই ব্রাউজারে ভয়েস সমর্থিত নয়");
    try{recRef.current?.stop();}catch{}
    const rec=new SR();
    rec.lang=lang==="bn"?"bn-BD":"en-US";
    rec.interimResults=true;
    rec.maxAlternatives=1;
    voiceSentRef.current=false;
    let capturedText=""; // local var — no React state closure issues
    rec.onresult=e=>{
      let interim="";
      let final="";
      for(let i=0;i<e.results.length;i++){
        if(e.results[i].isFinal) final+=e.results[i][0].transcript;
        else interim+=e.results[i][0].transcript;
      }
      const shown=final||interim;
      capturedText=shown;
      setInp(shown);
      if(final && !voiceSentRef.current){
        voiceSentRef.current=true;
        setIsListening(false);
        sendRef.current(final); // use ref — always the latest send()
      }
    };
    rec.onerror=e=>{console.warn("Voice error:",e.error);setIsListening(false);};
    rec.onend=()=>{
      setIsListening(false);
      // Fallback: browser ended without isFinal (e.g. silence timeout)
      if(!voiceSentRef.current && capturedText.trim()){
        voiceSentRef.current=true;
        sendRef.current(capturedText); // safe: not inside a state setter
      }
    };
    recRef.current=rec;
    try{rec.start();setIsListening(true);}catch(e){console.warn("SR start:",e);}
  };
  const stopVoice=()=>{recRef.current?.stop();setIsListening(false);};

  useEffect(()=>{if(ref.current)ref.current.scrollTop=ref.current.scrollHeight;},[msgs,typing]);

  const bot=isMobile?76:28;
  if(!open)return(
    <button onClick={()=>setOpen(true)} className="jc" style={{position:"fixed",bottom:bot,right:18,width:52,height:52,background:`linear-gradient(135deg,${C.p},${C.pdk})`,border:"none",borderRadius:15,cursor:"pointer",fontSize:22,boxShadow:`0 6px 22px ${C.p}66`,zIndex:700,animation:"glow 3s infinite"}}>🤖</button>
  );

  return(
    <div style={{position:"fixed",bottom:bot,right:14,width:320,height:460,background:C.card,borderRadius:20,boxShadow:"0 16px 50px rgba(0,0,0,.18)",zIndex:700,display:"flex",flexDirection:"column",border:`1px solid ${C.bdr}`,animation:"fadeUp .3s ease"}}>
      {/* Header */}
      <div style={{background:`linear-gradient(135deg,${C.p},${C.pdk})`,padding:"13px 15px",borderRadius:"20px 20px 0 0",display:"flex",alignItems:"center",gap:9}}>
        <div className="jc" style={{width:34,height:34,borderRadius:10,background:"rgba(255,255,255,.2)",fontSize:18,flexShrink:0}}>🤖</div>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:700,color:"#fff"}}>{tr.chatTitle||"IMAP AI"}</div>
          <div style={{fontSize:10,color:"rgba(255,255,255,.75)"}}>{tr.chatOnline||"সর্বদা অনলাইন"}</div>
        </div>
        <button onClick={()=>setOpen(false)} style={{background:"rgba(255,255,255,.2)",border:"none",borderRadius:7,width:27,height:27,cursor:"pointer",color:"#fff",fontSize:14}}>✕</button>
      </div>

      {/* Messages */}
      <div ref={ref} style={{flex:1,overflowY:"auto",padding:"10px 12px",display:"flex",flexDirection:"column",gap:9}}>
        {msgs.map((m,i)=>(
          <div key={i} style={{display:"flex",justifyContent:m.from==="user"?"flex-end":"flex-start"}}>
            <div style={{maxWidth:"84%",padding:"9px 13px",borderRadius:m.from==="user"?"14px 14px 4px 14px":"14px 14px 14px 4px",background:m.from==="user"?`linear-gradient(135deg,${C.p},${C.pdk})`:"#fff",color:m.from==="user"?"#fff":C.text,fontSize:12.5,lineHeight:1.65,border:m.from==="ai"?`1px solid ${C.bdr}`:"none",boxShadow:m.from==="ai"?"0 2px 8px rgba(0,0,0,.05)":"none",position:"relative"}}>
              {m.text}{m.streaming&&<span style={{display:"inline-block",animation:"pulse 1s infinite",color:C.p,fontWeight:700,marginLeft:1}}>▋</span>}
              {m.from==="ai"&&m.source&&m.source!=="system"&&!m.streaming&&(
                <div style={{fontSize:9,color:m.source==="llm"||m.source==="gemini"?"#059669":C.muted,marginTop:4,fontWeight:600}}>
                  {m.source==="gemini"?"✨ Gemini":m.source==="llm"?"🤖 GPT":"📚 Smart"}
                </div>
              )}
            </div>
          </div>
        ))}
        {typing&&(
          <div style={{display:"flex",gap:4,padding:"10px 13px",background:"#fff",border:`1px solid ${C.bdr}`,borderRadius:"14px 14px 14px 4px",width:58,boxShadow:"0 2px 8px rgba(0,0,0,.05)"}}>
            <div className="dot"/><div className="dot"/><div className="dot"/>
          </div>
        )}
      </div>

      {/* Quick replies */}
      <div className="sx" style={{padding:"4px 10px 0"}}>
        <div style={{display:"flex",gap:5,width:"max-content"}}>
          {(lang==="en"?QUICK_EN:QUICK_BN).map(q=>(
            <button key={q} onClick={()=>send(q)} className="btn" style={{padding:"4px 10px",background:C.plt,borderRadius:99,fontSize:10.5,color:C.p,whiteSpace:"nowrap",fontWeight:600}}>{q}</button>
          ))}
        </div>
      </div>

      {/* Input area */}
      <div style={{padding:"7px 10px 10px",display:"flex",gap:6,alignItems:"center"}}>
        {/* Mic button */}
        <button onClick={isListening?stopVoice:startVoice} className="btn jc" title={lang==="en"?"Voice input":"ভয়েস দিয়ে লিখুন"} style={{width:36,height:36,borderRadius:9,background:isListening?C.red:C.plt,border:`1.5px solid ${isListening?C.red:C.bdr}`,fontSize:16,flexShrink:0,animation:isListening?"pulse 1s infinite":"none"}}>
          {isListening?"🔴":"🎙️"}
        </button>
        <input
          value={inp}
          onChange={e=>setInp(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()}
          placeholder={tr.chatPh||"মেসেজ টাইপ করুন..."}
          style={{flex:1,padding:"8px 11px",border:`1.5px solid ${C.bdr}`,borderRadius:9,fontSize:12.5,color:C.text,background:C.card,outline:"none"}}
        />
        <button onClick={()=>send()} disabled={!inp.trim()&&!typing} className="btn btn-g jc" style={{width:36,height:36,borderRadius:9,padding:0,fontSize:15,opacity:inp.trim()?1:0.5}}>
          ➤
        </button>
      </div>
    </div>
  );
}


/* ══ ONBOARDING ══ */
function Onboarding({onDone}) {
  const C=useC(); const tr=useTr();
  const [slide,setSlide]=useState(0);
  const SLIDES=[
    {ic:tr.ob1ic,t:tr.ob1t,d:tr.ob1d,bg:`linear-gradient(135deg,${C.dark},#0F3326)`},
    {ic:tr.ob2ic,t:tr.ob2t,d:tr.ob2d,bg:`linear-gradient(135deg,#1D4ED8,#2563EB)`},
    {ic:tr.ob3ic,t:tr.ob3t,d:tr.ob3d,bg:`linear-gradient(135deg,#E31E50,#C2185B)`},
    {ic:tr.ob4ic,t:tr.ob4t,d:tr.ob4d,bg:`linear-gradient(135deg,#F59E0B,#D97706)`},
  ];
  const s=SLIDES[slide];
  return (
    <div style={{position:"fixed",inset:0,zIndex:2000,display:"flex",flexDirection:"column",background:s.bg,transition:"background .5s ease",fontFamily:"'Hind Siliguri',sans-serif"}}>
      {/* Skip */}
      <div style={{display:"flex",justifyContent:"flex-end",padding:"18px 20px"}}>
        <button onClick={onDone} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:99,padding:"6px 16px",color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer"}}>{tr.obSkip}</button>
      </div>
      {/* Main content */}
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"0 32px",textAlign:"center",gap:20}}>
        <div style={{fontSize:90,lineHeight:1,animation:"pulse 2s infinite"}}>{s.ic}</div>
        <div style={{fontSize:28,fontWeight:800,color:"#fff",fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.2}}>{s.t}</div>
        <div style={{fontSize:15,color:"rgba(255,255,255,.78)",lineHeight:1.75,maxWidth:340}}>{s.d}</div>
      </div>
      {/* Dots */}
      <div style={{display:"flex",justifyContent:"center",gap:8,marginBottom:16}}>
        {SLIDES.map((_,i)=><div key={i} style={{width:i===slide?24:8,height:8,borderRadius:99,background:i===slide?"#fff":"rgba(255,255,255,.35)",transition:"all .3s"}}/>)}
      </div>
      {/* Button */}
      <div style={{padding:"0 24px 44px"}}>
        <button onClick={()=>slide<SLIDES.length-1?setSlide(s=>s+1):onDone()} style={{width:"100%",padding:"16px",background:"rgba(255,255,255,.18)",border:"2px solid rgba(255,255,255,.4)",borderRadius:14,color:"#fff",fontSize:16,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif",backdropFilter:"blur(8px)",transition:"all .2s"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,.28)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,.18)"}>
          {slide<SLIDES.length-1?tr.obNext:tr.obStart}
        </button>
      </div>
    </div>
  );
}

/* ══ FAVORITES PAGE ══ */
function FavoritesPage({favs,onBook,onView,onToggle}) {
  const C=useC(); const tr=useTr(); const lang=useContext(LangCtx)===T.en?"en":"bn";
  const { providers: ctxProviders } = useLiveData();
  const list=ctxProviders.map(toUiProv).filter(p=>favs.includes(p.id));
  return (
    <div>
      <div style={{fontSize:18,fontWeight:700,marginBottom:20}}>{tr.favTitle} ({list.length})</div>
      {list.length===0
        ?<div style={{textAlign:"center",padding:"48px 20px",color:C.muted}}>
            <div style={{fontSize:56,marginBottom:12}}>🔖</div>
            <div style={{fontSize:14,lineHeight:1.7}}>{tr.favEmpty}</div>
          </div>
        :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:16}}>
            {list.map((p,i)=>(
              <div key={p.id} style={{position:"relative"}}>
                <PCard p={p} delay={i*.07} onBook={onBook} onView={onView}/>
                <button onClick={()=>onToggle(p.id)} style={{position:"absolute",top:12,right:12,background:C.red,border:"none",borderRadius:8,padding:"4px 9px",fontSize:11,color:"#fff",cursor:"pointer",fontWeight:700,fontFamily:"'Hind Siliguri',sans-serif"}}>{tr.unsave} ×</button>
              </div>
            ))}
          </div>
      }
    </div>
  );
}

/* ─── Smart Calendar ─────────────────────────────────── */
const CAL_SLOTS = {
  morning:  ["8:00 AM","9:00 AM","10:00 AM","11:00 AM"],
  afternoon:["12:00 PM","1:00 PM","2:00 PM","3:00 PM"],
  evening:  ["4:00 PM","5:00 PM","6:00 PM","7:00 PM"],
};
// Deterministic "booked" slots so UI looks realistic per provider
const pseudoBooked=(pid,dateStr,slot)=>{
  const h=([...`${pid}${dateStr}${slot}`].reduce((a,c)=>a+c.charCodeAt(0),0))%7;
  return h<2;
};
function CalendarPage({onBook}) {
  const C=useC(); const tr=useTr(); const lang=useContext(LangCtx)===T.en?"en":"bn";
  const today=new Date();
  const { providers: ctxProviders } = useLiveData();
  const provData = ctxProviders.map(toUiProv);
  const [selProv,setSelProv]=useState(provData[0]||PROVIDERS[0]);
  const [weekOffset,setWeekOffset]=useState(0);
  const [selDate,setSelDate]=useState(null);
  const [selSlot,setSelSlot]=useState(null);
  const [booked,setBooked]=useState(false);

  // Build 7 days starting from Monday of current week + offset
  const days=Array.from({length:7},(_,i)=>{
    const d=new Date(today);
    const dow=today.getDay()||7; // Mon=1
    d.setDate(today.getDate()-(dow-1)+i+weekOffset*7);
    return d;
  });

  const dayLabels = lang==="en"
    ? ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]
    : ["সোম","মঙ্গল","বুধ","বৃহ","শুক্র","শনি","রবি"];

  const dateStr=d=>`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const isToday=d=>d.toDateString()===today.toDateString();
  const isPast=d=>d<new Date(today.setHours(0,0,0,0));

  const sectionLabel={morning:tr.calMorn,afternoon:tr.calAftn,evening:tr.calEvng};

  const handleBook=async()=>{
    if(!selDate||!selSlot) return;
    setBooked(true);
    try {
      await bookingsApi.create({
        provider_id:  selProv.id,
        service_type: selProv.svcEn||selProv.svc||"",
        scheduled_at: `${selDate.toISOString().split("T")[0]} ${selSlot}`,
        payment_method:"cash",
        total_amount: parseInt(String(selProv.price||"").replace(/[৳,]/g,""))||350,
      });
    } catch(e){ console.error("Calendar booking error:",e); }
    setTimeout(()=>{setBooked(false);setSelSlot(null);onBook&&onBook(selProv);},1200);
  };

  const pName=p=>lang==="en"?p.nameEn:p.name;

  return (
    <div>
      {/* Header */}
      <div style={{background:`linear-gradient(135deg,${C.p},${C.pdk})`,borderRadius:18,padding:"20px",marginBottom:20,color:"#fff",position:"relative",overflow:"hidden"}}>
        <div style={{fontSize:21,fontWeight:800,marginBottom:3}}>{tr.calTitle}</div>
        <div style={{fontSize:13,opacity:.85}}>{lang==="en"?"Book your preferred time slot":"আপনার পছন্দের সময় বুক করুন"}</div>
        <div style={{position:"absolute",right:-16,top:-16,width:80,height:80,borderRadius:"50%",background:"rgba(255,255,255,.08)"}}/>
      </div>

      {/* Provider Selector */}
      <div style={{marginBottom:18}}>
        <div style={{fontSize:13,fontWeight:700,color:C.sub,marginBottom:9}}>{tr.calPick}</div>
        <div className="sx" style={{display:"flex",gap:10,paddingBottom:2}}>
          {provData.map(p=>(
            <button key={p.id} onClick={()=>{setSelProv(toUiProv(p));setSelDate(null);setSelSlot(null);}}
              style={{flexShrink:0,display:"flex",alignItems:"center",gap:8,padding:"8px 14px",borderRadius:14,border:`2px solid ${selProv.id===p.id?C.p:C.bdr}`,background:selProv.id===p.id?C.plt:C.card,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif",transition:"all .15s"}}>
              <div style={{width:28,height:28,borderRadius:8,background:`linear-gradient(135deg,${p.col},${p.col}bb)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"#fff",flexShrink:0}}>{p.av}</div>
              <div style={{textAlign:"left"}}>
                <div style={{fontSize:12,fontWeight:700,color:selProv.id===p.id?C.p:C.text,whiteSpace:"nowrap"}}>{pName(p)}</div>
                <div style={{fontSize:10,color:C.muted,whiteSpace:"nowrap"}}>{lang==="en"?p.svcEn:p.svc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Week navigation */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <button onClick={()=>{if(weekOffset>0)setWeekOffset(w=>w-1);}}
          style={{width:34,height:34,borderRadius:10,border:`1.5px solid ${C.bdr}`,background:weekOffset>0?C.card:"transparent",cursor:weekOffset>0?"pointer":"default",fontSize:16,color:weekOffset>0?C.p:C.muted,display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
        <div style={{fontSize:13,fontWeight:700,color:C.text}}>
          {days[0].toLocaleDateString(lang==="en"?"en-GB":"bn-BD",{day:"numeric",month:"short"})} – {days[6].toLocaleDateString(lang==="en"?"en-GB":"bn-BD",{day:"numeric",month:"short",year:"numeric"})}
        </div>
        <button onClick={()=>setWeekOffset(w=>w+1)}
          style={{width:34,height:34,borderRadius:10,border:`1.5px solid ${C.bdr}`,background:C.card,cursor:"pointer",fontSize:16,color:C.p,display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
      </div>

      {/* Day grid */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:6,marginBottom:20}}>
        {days.map((d,i)=>{
          const past=isPast(d);
          const sel=selDate&&d.toDateString()===selDate.toDateString();
          const tod=isToday(d);
          return (
            <button key={i} onClick={()=>{if(!past){setSelDate(d);setSelSlot(null);}}}
              style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"10px 4px",borderRadius:12,border:`2px solid ${sel?C.p:tod?C.pdk:C.bdr}`,background:sel?C.p:tod?C.plt:C.card,cursor:past?"default":"pointer",opacity:past?.4:1,transition:"all .15s",fontFamily:"'Hind Siliguri',sans-serif"}}>
              <div style={{fontSize:10,fontWeight:600,color:sel?"#fff":C.muted}}>{dayLabels[i]}</div>
              <div style={{fontSize:15,fontWeight:800,color:sel?"#fff":tod?C.p:C.text}}>{d.getDate()}</div>
              {!past&&<div style={{width:5,height:5,borderRadius:"50%",background:sel?"rgba(255,255,255,.7)":C.p}}/>}
            </button>
          );
        })}
      </div>

      {/* Time slots */}
      {selDate&&(
        <div>
          {Object.entries(CAL_SLOTS).map(([section,slots])=>(
            <div key={section} style={{marginBottom:18}}>
              <div style={{fontSize:12,fontWeight:700,color:C.sub,marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
                <span>{section==="morning"?"🌅":section==="afternoon"?"☀️":"🌙"}</span>
                {sectionLabel[section]}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
                {slots.map(slot=>{
                  const busy=pseudoBooked(selProv.id,dateStr(selDate),slot);
                  const sel2=selSlot===slot;
                  return (
                    <button key={slot} disabled={busy} onClick={()=>setSelSlot(slot)}
                      style={{padding:"9px 4px",borderRadius:10,border:`2px solid ${sel2?C.p:busy?C.bdr:C.bdr}`,background:sel2?C.p:busy?"#F3F4F6":C.card,color:sel2?"#fff":busy?C.muted:C.text,fontSize:12,fontWeight:600,cursor:busy?"not-allowed":"pointer",fontFamily:"'Hind Siliguri',sans-serif",transition:"all .15s",opacity:busy?.5:1}}>
                      {slot}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Legend */}
          <div style={{display:"flex",gap:16,marginBottom:18,fontSize:11,color:C.muted}}>
            {[[C.p,"#fff",tr.calAvail],["#F3F4F6",C.muted,tr.calBooked],[C.p,"#fff",tr.calSelected]].map(([bg,col,lbl],i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:5}}>
                <div style={{width:14,height:14,borderRadius:4,background:bg,border:`1.5px solid ${C.bdr}`}}/>
                {lbl}
              </div>
            ))}
          </div>

          {/* Book CTA */}
          <button onClick={handleBook} disabled={!selSlot||booked}
            style={{width:"100%",padding:"14px",borderRadius:14,background:selSlot&&!booked?C.p:"#ccc",border:"none",color:"#fff",fontSize:15,fontWeight:700,cursor:selSlot&&!booked?"pointer":"default",fontFamily:"'Hind Siliguri',sans-serif",transition:"background .2s",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            {booked?"✅ বুকিং সম্পন্ন!":(selSlot?`${tr.calBook} ${selSlot}`:tr.calSelectSlot)}
          </button>
        </div>
      )}

      {/* Prompt when no date selected */}
      {!selDate&&(
        <div style={{textAlign:"center",padding:"32px 20px",color:C.muted}}>
          <div style={{fontSize:48,marginBottom:10}}>📅</div>
          <div style={{fontSize:14}}>{lang==="en"?"Pick a day above to see available slots":"উপরে একটি দিন বেছে নিন"}</div>
        </div>
      )}
    </div>
  );
}

/* ─── Analytics Dashboard ───────────────────────────── */
const AN_MONTHS=["Jul","Aug","Sep","Oct","Nov","Dec","Jan"];
const AN_DATA=[2,3,1,4,3,5,4];
const AN_SERVICES=[{icon:"⚡",name:"Electrical",nameBn:"ইলেকট্রিক",pct:32,color:"#F59E0B"},{icon:"🧹",name:"Cleaning",nameBn:"পরিষ্কার",pct:24,color:"#10B981"},{icon:"🔧",name:"Plumber",nameBn:"প্লাম্বার",pct:18,color:"#3B82F6"},{icon:"🏥",name:"Medical",nameBn:"চিকিৎসা",pct:15,color:"#EF4444"},{icon:"📚",name:"Tutoring",nameBn:"শিক্ষা",pct:11,color:"#8B5CF6"}];
const AN_ACTIVITY=[{icon:"⚡",title:"Electrician booked",titleBn:"ইলেকট্রিশিয়ান বুক",date:"Today, 10:30 AM",amt:-385},{icon:"⭐",title:"Rated Farzana 5★",titleBn:"ফারজানাকে ৫★ দিলেন",date:"Yesterday",amt:0},{icon:"💳",title:"Wallet topped up",titleBn:"ওয়ালেট টপআপ",date:"2 days ago",amt:1000},{icon:"🔧",title:"Plumber booking",titleBn:"প্লাম্বার বুকিং",date:"3 days ago",amt:-280}];

function AnalyticsPage(){
  const C=useC();const tr=useTr();const lang=useContext(LangCtx)===T.en?"en":"bn";
  const {bookings:ctxBk}=useLiveData();

  // Real stats
  const totalBookings=ctxBk.length;
  const totalSpent=ctxBk.reduce((s,b)=>s+parseFloat(b.total_amount||b.amount||0),0);
  const savedAmt=Math.round(totalSpent*0.12);
  const now=new Date();
  const thisMonthBk=ctxBk.filter(b=>{const d=new Date(b.created_at||b.scheduled_at||0);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();}).length;
  const stats=[
    [tr.anBookings,"📋",totalBookings||AN_DATA.reduce((a,v)=>a+v,0),thisMonthBk?`+${thisMonthBk} ${lang==="en"?"this month":"এই মাসে"}`:"↑12%",C.p],
    [tr.anSpent,"💸",totalSpent?`৳${Math.round(totalSpent).toLocaleString()}`:"৳3,820",totalSpent?"":"↑8%","#F59E0B"],
    [tr.anSaved,"🎁",savedAmt?`৳${savedAmt.toLocaleString()}`:"৳640",savedAmt?"":"↑23%","#10B981"],
    [tr.anRating,"⭐","4.8","→0%","#8B5CF6"],
  ];

  // Last 7 months chart
  const chartMonths=[],chartData=[];
  for(let i=6;i>=0;i--){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    chartMonths.push(d.toLocaleString("en",{month:"short"}));
    chartData.push(ctxBk.filter(b=>{const bd=new Date(b.created_at||b.scheduled_at||0);return bd.getMonth()===d.getMonth()&&bd.getFullYear()===d.getFullYear();}).length);
  }
  const finalChartData=chartData.some(v=>v>0)?chartData:AN_DATA;
  const finalChartMonths=chartData.some(v=>v>0)?chartMonths:AN_MONTHS;

  // Service breakdown
  const svcMap={};
  ctxBk.forEach(b=>{const s=b.service_name_en||b.service_type||"Other";svcMap[s]=(svcMap[s]||0)+1;});
  const svcEntries=Object.entries(svcMap).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const SCOLS=["#F59E0B","#10B981","#3B82F6","#EF4444","#8B5CF6"],SICONS=["🔧","🧹","⚡","🏥","📚"];
  const sTot=svcEntries.reduce((s,[,c])=>s+c,0)||1;
  const serviceData=svcEntries.length?svcEntries.map(([name,cnt],i)=>({icon:SICONS[i]||"🔧",name,nameBn:name,pct:Math.round(cnt/sTot*100),color:SCOLS[i]||"#6B7280"})):AN_SERVICES;

  // Recent activity
  const activityData=ctxBk.length?ctxBk.slice(0,4).map(b=>({icon:b.icon||"📋",title:b.service_name_en||b.svcEn||"Service booked",titleBn:b.service_name_bn||b.svc||"সেবা বুকিং",date:b.created_at?new Date(b.created_at).toLocaleDateString("en-GB"):"Recently",amt:-parseFloat(b.total_amount||b.amount||0)})):AN_ACTIVITY;

  return(
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
        {stats.map(([lbl,ic,val,chg,col])=>(
          <div key={lbl} style={{background:C.card,borderRadius:16,padding:"16px",border:`1px solid ${C.bdr}`}}>
            <div style={{fontSize:22,marginBottom:6}}>{ic}</div>
            <div style={{fontSize:22,fontWeight:800,color:col}}>{val}</div>
            <div style={{fontSize:12,color:C.sub,marginTop:2}}>{lbl}</div>
            {chg&&<div style={{fontSize:11,color:"#16A34A",marginTop:4,fontWeight:700}}>{chg}</div>}
          </div>
        ))}
      </div>
      <div style={{background:C.card,borderRadius:16,padding:"16px 16px 20px",border:`1px solid ${C.bdr}`,marginBottom:16}}>
        <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:14}}>{tr.anMonthly}</div>
        <div style={{display:"flex",alignItems:"flex-end",gap:8,height:90}}>
          {finalChartData.map((v,i)=>(
            <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
              <div style={{fontSize:10,color:C.sub,fontWeight:700}}>{v||""}</div>
              <div style={{width:"100%",borderRadius:"6px 6px 0 0",background:i===finalChartData.length-1?C.p:"#D1FAE5",height:`${(v/Math.max(...finalChartData,1))*70}px`,minHeight:8,transition:"height .4s"}}/>
              <div style={{fontSize:9,color:C.muted}}>{finalChartMonths[i]}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{background:C.card,borderRadius:16,padding:"16px",border:`1px solid ${C.bdr}`,marginBottom:16}}>
        <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:12}}>{tr.anServices}</div>
        {serviceData.map(s=>(
          <div key={s.name} style={{marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
              <span style={{fontSize:12,color:C.text}}>{s.icon} {lang==="en"?s.name:s.nameBn}</span>
              <span style={{fontSize:12,fontWeight:700,color:s.color}}>{s.pct}%</span>
            </div>
            <div style={{height:6,borderRadius:4,background:C.bdr,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${s.pct}%`,background:s.color,borderRadius:4}}/>
            </div>
          </div>
        ))}
      </div>
      <div style={{background:C.card,borderRadius:16,padding:"16px",border:`1px solid ${C.bdr}`}}>
        <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:12}}>{tr.anRecent}</div>
        {activityData.map((a,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:i<activityData.length-1?`1px solid ${C.bdr}`:"none"}}>
            <div style={{width:36,height:36,borderRadius:10,background:C.plt,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17}}>{a.icon}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:600,color:C.text}}>{lang==="en"?a.title:a.titleBn}</div>
              <div style={{fontSize:11,color:C.muted}}>{a.date}</div>
            </div>
            {a.amt!==0&&<div style={{fontSize:13,fontWeight:700,color:a.amt>0?"#16A34A":"#DC2626"}}>{a.amt>0?"+":""}{a.amt>0?"৳"+a.amt:"৳"+Math.abs(a.amt)}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Settings / Privacy ─────────────────────────────── */
function SettingsPage(){
  const C=useC();const tr=useTr();const lang=useContext(LangCtx)===T.en?"en":"bn";
  const [tab,setTab]=useState("profile");
  const {user:authUser}=useUser();
  const [name,setName]=useState(authUser?.name||"");
  const [email,setEmail]=useState(authUser?.email||"");
  const [phone,setPhone]=useState(authUser?.phone||"");
  const [notifBook,setNotifBook]=useState(()=>localStorage.getItem("imap_notif_book")!=="false");
  const [notifPromo,setNotifPromo]=useState(()=>localStorage.getItem("imap_notif_promo")!=="false");
  const [notifSms,setNotifSms]=useState(()=>localStorage.getItem("imap_notif_sms")==="true");
  const [privacy2fa,setPrivacy2fa]=useState(()=>localStorage.getItem("imap_2fa")==="true");
  const [privacyLoc,setPrivacyLoc]=useState(()=>localStorage.getItem("imap_loc")!=="false");
  const [saved,setSaved]=useState(false);

  const doSave=async()=>{
    try{
      await usersApi.updateProfile({name,email,phone});
      await usersApi.saveSettings({notif_booking:notifBook,notif_promo:notifPromo,notif_sms:notifSms,privacy_2fa:privacy2fa,privacy_location:privacyLoc});
      // persist toggles locally too
      localStorage.setItem("imap_notif_book",String(notifBook));
      localStorage.setItem("imap_notif_promo",String(notifPromo));
      localStorage.setItem("imap_notif_sms",String(notifSms));
      localStorage.setItem("imap_2fa",String(privacy2fa));
      localStorage.setItem("imap_loc",String(privacyLoc));
    }catch(e){console.warn("settings save:",e.message);}
    setSaved(true);setTimeout(()=>setSaved(false),2500);
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
      {saved&&<div style={{background:"#D1FAE5",borderRadius:12,padding:"10px 16px",marginBottom:14,fontSize:13,color:"#065F46",fontWeight:700,textAlign:"center"}}>{tr.stSaved}</div>}
      {tab==="profile"&&(
        <div style={{background:C.card,borderRadius:16,padding:18,border:`1px solid ${C.bdr}`}}>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",marginBottom:20}}>
            <div style={{width:72,height:72,borderRadius:"50%",background:"linear-gradient(135deg,#1DBF73,#0D7F5F)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,marginBottom:10}}>👤</div>
            <div style={{fontSize:15,fontWeight:700,color:C.text}}>{name}</div>
            <div style={{fontSize:12,color:C.muted}}>ID: IMAP-8821</div>
          </div>
          {[[tr.stProfile+" "+lang==="en"?"Name":"নাম",name,setName],[tr.stEmail,email,setEmail],[tr.stPhone,phone,setPhone]].map(([lbl,val,set])=>(
            <div key={lbl} style={{marginBottom:14}}>
              <label style={{fontSize:12,color:C.sub,fontWeight:600,display:"block",marginBottom:5}}>{lbl}</label>
              <input value={val} onChange={e=>set(e.target.value)} style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1.5px solid ${C.bdr}`,background:C.bg,color:C.text,fontSize:13,fontFamily:"'Hind Siliguri',sans-serif",boxSizing:"border-box"}}/>
            </div>
          ))}
          <button onClick={doSave} style={{width:"100%",padding:"12px",borderRadius:12,background:C.p,border:"none",color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>{tr.stSave}</button>
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
          <div style={{marginTop:16,padding:"12px 14px",background:"#FEF2F2",borderRadius:12,border:"1px solid #FECACA",cursor:"pointer"}}>
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

/* ─── Service Request Form ───────────────────────────── */
const SR_TYPES=["electrical","plumbing","cleaning","medical","tutoring","carpentry","painting","ac_repair"];
const SR_TIMES=["08:00-10:00","10:00-12:00","12:00-14:00","14:00-16:00","16:00-18:00","18:00-20:00"];

function ServiceRequestPage(){
  const C=useC();const tr=useTr();const lang=useContext(LangCtx)===T.en?"en":"bn";
  const [step,setStep]=useState(1);
  const [svcType,setSvcType]=useState("");
  const [address,setAddress]=useState("");
  const [date,setDate]=useState("");
  const [time,setTime]=useState("");
  const [desc,setDesc]=useState("");
  const [budget,setBudget]=useState("");
  const [urgent,setUrgent]=useState(false);
  const [submitted,setSubmitted]=useState(false);

  const doSubmit=async()=>{try{await bookingsApi.create({service_name_en:svcType,address,scheduled_time:date&&time?`${date} ${time}`:date,amount:parseInt(budget)||300,payment_method:"cash",is_urgent:urgent?1:0,note:desc});}catch(e){console.error("svcReq:",e);}setSubmitted(true);};
  const canNext1=svcType&&address;
  const canNext2=date&&time;

  if(submitted) return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"60px 20px",textAlign:"center"}}>
      <div style={{fontSize:64,marginBottom:16}}>✅</div>
      <div style={{fontSize:20,fontWeight:800,color:C.p,marginBottom:8}}>{tr.srSubmitted}</div>
      <div style={{fontSize:13,color:C.sub,marginBottom:24}}>{lang==="en"?"We'll match you with the best provider soon!":"শীঘ্রই আপনাকে সেরা সেবাদাতার সাথে সংযুক্ত করা হবে!"}</div>
      <div style={{background:C.plt,borderRadius:14,padding:"12px 20px",fontSize:13,color:C.p,fontWeight:700}}>REQ-{Date.now().toString().slice(-6)}</div>
    </div>
  );

  return(
    <div>
      {/* Step indicator */}
      <div style={{display:"flex",alignItems:"center",marginBottom:24}}>
        {[1,2,3].map((s,i)=>[
          <div key={s} style={{width:28,height:28,borderRadius:"50%",background:step>=s?C.p:C.bdr,color:step>=s?"#fff":C.sub,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,flexShrink:0}}>{s}</div>,
          i<2&&<div key={"line"+i} style={{flex:1,height:2,background:step>s?C.p:C.bdr,margin:"0 4px"}}/>
        ].flat())}
      </div>
      {step===1&&(
        <div style={{background:C.card,borderRadius:16,padding:18,border:`1px solid ${C.bdr}`}}>
          <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:14}}>{tr.srType}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:18}}>
            {SR_TYPES.map(t=>(
              <button key={t} onClick={()=>setSvcType(t)}
                style={{padding:"10px 8px",borderRadius:10,border:`2px solid ${svcType===t?C.p:C.bdr}`,background:svcType===t?C.plt:C.bg,color:svcType===t?C.p:C.sub,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif",textTransform:"capitalize"}}>
                {t.replace("_"," ")}
              </button>
            ))}
          </div>
          <label style={{fontSize:12,color:C.sub,fontWeight:600,display:"block",marginBottom:6}}>{tr.srAddress}</label>
          <textarea value={address} onChange={e=>setAddress(e.target.value)} rows={2}
            placeholder={lang==="en"?"Full address...":"ঠিকানা লিখুন..."}
            style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1.5px solid ${C.bdr}`,background:C.bg,color:C.text,fontSize:13,fontFamily:"'Hind Siliguri',sans-serif",resize:"none",boxSizing:"border-box"}}/>
          <div style={{display:"flex",alignItems:"center",gap:10,margin:"12px 0",padding:"10px 14px",background:urgent?"#FEF2F2":C.bg,borderRadius:10,border:`1.5px solid ${urgent?"#FCA5A5":C.bdr}`,cursor:"pointer"}} onClick={()=>setUrgent(!urgent)}>
            <input type="checkbox" checked={urgent} onChange={()=>{}} style={{accentColor:"#DC2626",width:16,height:16}}/>
            <span style={{fontSize:13,fontWeight:700,color:urgent?"#DC2626":C.sub}}>🚨 {tr.srUrgent}</span>
          </div>
          <button onClick={()=>canNext1&&setStep(2)} style={{width:"100%",padding:"12px",borderRadius:12,background:canNext1?C.p:"#ccc",border:"none",color:"#fff",fontSize:14,fontWeight:700,cursor:canNext1?"pointer":"default",fontFamily:"'Hind Siliguri',sans-serif",marginTop:6}}>{lang==="en"?"Next →":"পরবর্তী →"}</button>
        </div>
      )}
      {step===2&&(
        <div style={{background:C.card,borderRadius:16,padding:18,border:`1px solid ${C.bdr}`}}>
          <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:14}}>{lang==="en"?"Schedule":"সময়সূচি"}</div>
          <label style={{fontSize:12,color:C.sub,fontWeight:600,display:"block",marginBottom:6}}>{tr.srDate}</label>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)}
            style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1.5px solid ${C.bdr}`,background:C.bg,color:C.text,fontSize:13,marginBottom:14,boxSizing:"border-box"}}/>
          <div style={{fontSize:12,color:C.sub,fontWeight:600,marginBottom:8}}>{tr.srTime}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:18}}>
            {SR_TIMES.map(t=>(
              <button key={t} onClick={()=>setTime(t)}
                style={{padding:"9px 6px",borderRadius:9,border:`2px solid ${time===t?C.p:C.bdr}`,background:time===t?C.plt:C.bg,color:time===t?C.p:C.sub,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>
                {t}
              </button>
            ))}
          </div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>setStep(1)} style={{flex:1,padding:"12px",borderRadius:12,background:C.bg,border:`1.5px solid ${C.bdr}`,color:C.sub,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>{lang==="en"?"← Back":"← পিছনে"}</button>
            <button onClick={()=>canNext2&&setStep(3)} style={{flex:2,padding:"12px",borderRadius:12,background:canNext2?C.p:"#ccc",border:"none",color:"#fff",fontSize:14,fontWeight:700,cursor:canNext2?"pointer":"default",fontFamily:"'Hind Siliguri',sans-serif"}}>{lang==="en"?"Next →":"পরবর্তী →"}</button>
          </div>
        </div>
      )}
      {step===3&&(
        <div style={{background:C.card,borderRadius:16,padding:18,border:`1px solid ${C.bdr}`}}>
          <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:14}}>{lang==="en"?"Details":"বিস্তারিত"}</div>
          <label style={{fontSize:12,color:C.sub,fontWeight:600,display:"block",marginBottom:6}}>{tr.srDesc}</label>
          <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={4}
            placeholder={lang==="en"?"Describe your issue in detail...":"সমস্যার বিস্তারিত বিবরণ দিন..."}
            style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1.5px solid ${C.bdr}`,background:C.bg,color:C.text,fontSize:13,fontFamily:"'Hind Siliguri',sans-serif",resize:"none",boxSizing:"border-box",marginBottom:14}}/>
          <label style={{fontSize:12,color:C.sub,fontWeight:600,display:"block",marginBottom:6}}>{tr.srBudget} (BDT)</label>
          <input value={budget} onChange={e=>setBudget(e.target.value.replace(/[^d]/g,""))}
            placeholder={lang==="en"?"Your budget (optional)":"বাজেট (ঐচ্ছিক)"}
            style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1.5px solid ${C.bdr}`,background:C.bg,color:C.text,fontSize:13,fontFamily:"'Hind Siliguri',sans-serif",marginBottom:16,boxSizing:"border-box"}}/>
          <div style={{background:C.plt,borderRadius:12,padding:"12px 14px",marginBottom:16,fontSize:12,color:C.sub}}>
            <div style={{fontWeight:700,color:C.text,marginBottom:6}}>📋 {lang==="en"?"Summary":"সারসংক্ষেপ"}</div>
            <div>✅ {svcType} • {urgent?"🚨 Urgent":""}</div>
            <div>📍 {address.slice(0,40)}</div>
            <div>📅 {date} {time}</div>
          </div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>setStep(2)} style={{flex:1,padding:"12px",borderRadius:12,background:C.bg,border:`1.5px solid ${C.bdr}`,color:C.sub,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>{lang==="en"?"← Back":"← পিছনে"}</button>
            <button onClick={doSubmit} style={{flex:2,padding:"12px",borderRadius:12,background:C.p,border:"none",color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>{tr.srSubmit}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Loyalty / Points ───────────────────────────────── */
const LOYALTY_REWARDS=[{pts:500,icon:"🎟️",titleEn:"₹50 off next booking",titleBn:"পরবর্তী বুকিং ৳৫০ ছাড়",code:"LY500"},{pts:1000,icon:"🎁",titleEn:"Free cleaning service",titleBn:"ফ্রি পরিষ্কার সেবা",code:"LY1000"},{pts:2000,icon:"⭐",titleEn:"Priority matching",titleBn:"অগ্রাধিকার ম্যাচিং",code:"LY2000"},{pts:5000,icon:"🏆",titleEn:"1 month premium",titleBn:"১ মাস প্রিমিয়াম",code:"LY5000"}];
const LEVELS=[{name:"Bronze",nameBn:"ব্রোন্জ",min:0,max:500,color:"#CD7F32",icon:"🥉"},{name:"Silver",nameBn:"সিলভার",min:500,max:1500,color:"#C0C0C0",icon:"🥈"},{name:"Gold",nameBn:"গোল্ড",min:1500,max:3000,color:"#FFD700",icon:"🥇"},{name:"Platinum",nameBn:"প্লাটিনাম",min:3000,max:6000,color:"#E5E4E2",icon:"💎"}];
const LY_HISTORY=[{icon:"⚡",titleEn:"Booked Electrician",titleBn:"ইলেকট্রিশিয়ান বুক",pts:+38,date:"Today"},{icon:"🎟️",titleEn:"Referral bonus",titleBn:"রেফারেল বোনাস",pts:+50,date:"Yesterday"},{icon:"🧹",titleEn:"Booked Cleaning",titleBn:"পরিষ্কার বুক",pts:+43,date:"2 days ago"},{icon:"💸",titleEn:"Redeemed coupon",titleBn:"কুপন রিডিম",pts:-200,date:"3 days ago"}];

function LoyaltyPage(){
  const C=useC();const tr=useTr();const lang=useContext(LangCtx)===T.en?"en":"bn";
  const {user:authUser}=useUser();
  const [tab,setTab]=useState("points");
  const [redeemedCode,setRedeemedCode]=useState(null);
  const [points,setPoints]=useState(authUser?.points||0);
  const [history,setHistory]=useState([]);

  useEffect(()=>{
    usersApi.getLoyalty()
      .then(d=>{ if(d?.points!=null) setPoints(d.points); if(d?.history) setHistory(d.history); })
      .catch(()=>{});
  },[]);

  const level=LEVELS.find(l=>points>=l.min&&points<l.max)||LEVELS[3];
  const nextLevel=LEVELS[LEVELS.indexOf(level)+1];
  const prog=nextLevel?Math.round(((points-level.min)/(nextLevel.min-level.min))*100):100;

  return(
    <div>
      {/* Points card */}
      <div style={{background:`linear-gradient(135deg,${level.color}22,${level.color}44)`,borderRadius:18,padding:"22px 20px",marginBottom:20,border:`2px solid ${level.color}55`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontSize:13,color:C.sub,marginBottom:4}}>{tr.lyTitle}</div>
            <div style={{fontSize:38,fontWeight:900,color:C.text,letterSpacing:-1}}>{points.toLocaleString()}</div>
            <div style={{fontSize:12,color:C.sub,marginTop:2}}>{tr.lyPoints}</div>
          </div>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:32}}>{level.icon}</div>
            <div style={{fontSize:12,fontWeight:800,color:level.color}}>{lang==="en"?level.name:level.nameBn}</div>
          </div>
        </div>
        {nextLevel&&<div style={{marginTop:14}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
            <span style={{fontSize:11,color:C.sub}}>{lang==="en"?(nextLevel.min-points)+" pts to "+nextLevel.name:nextLevel.nameBn+" এর জন্য আরও "+(nextLevel.min-points)}</span>
            <span style={{fontSize:11,fontWeight:700,color:level.color}}>{prog}%</span>
          </div>
          <div style={{height:8,borderRadius:4,background:C.bdr,overflow:"hidden"}}>
            <div style={{height:"100%",width:`${prog}%`,background:level.color,borderRadius:4,transition:"width .5s"}}/>
          </div>
        </div>}
      </div>
      {/* Tabs */}
      <div style={{display:"flex",gap:8,marginBottom:16,background:C.card,borderRadius:14,padding:5,border:`1px solid ${C.bdr}`}}>
        {[["points","🎯 "+tr.lyEarn+"/"+tr.lyRedeem],["history","📋 "+tr.lyHistory]].map(([id,lbl])=>(
          <button key={id} onClick={()=>setTab(id)} style={{flex:1,padding:"9px",borderRadius:10,border:"none",background:tab===id?C.p:"transparent",color:tab===id?"#fff":C.sub,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>{lbl}</button>
        ))}
      </div>
      {tab==="points"&&(
        <div>
          <div style={{background:C.plt,borderRadius:12,padding:"12px 16px",marginBottom:16,fontSize:13,color:C.sub}}>
            💡 {lang==="en"?"Earn 10 points per ৳100 spent":"প্রতি ৳১০০ খরচে ১০ পয়েন্ট অর্জন করুন"} • {tr.lyPerBook}: 10 pts
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {LOYALTY_REWARDS.map(r=>{
              const canRedeem=points>=r.pts;
              const isRedeemed=redeemedCode===r.code;
              return(
                <div key={r.pts} style={{background:C.card,borderRadius:14,padding:"14px 16px",border:`1.5px solid ${canRedeem?C.p:C.bdr}`,display:"flex",alignItems:"center",gap:14}}>
                  <div style={{fontSize:28}}>{r.icon}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:700,color:C.text}}>{lang==="en"?r.titleEn:r.titleBn}</div>
                    <div style={{fontSize:11,color:canRedeem?"#16A34A":"#DC2626",fontWeight:700,marginTop:3}}>{r.pts} {tr.lyPoints} {canRedeem?("✅ "+lang==="en"?"available":"পাওয়া যাচ্ছে"):("— "+(r.pts-points)+" "+lang==="en"?"more needed":"আরও দরকার")}</div>
                  </div>
                  <button onClick={async()=>{
                    if(!canRedeem||isRedeemed)return;
                    try{
                      const res=await usersApi.redeemPoints(r.pts,r.code);
                      if(res?.points!=null)setPoints(res.points);
                    }catch{setPoints(p=>p-r.pts<0?0:p-r.pts);}
                    setRedeemedCode(r.code);
                  }} disabled={!canRedeem||isRedeemed}
                    style={{padding:"8px 14px",borderRadius:9,background:isRedeemed?"#D1FAE5":canRedeem?C.p:C.bdr,border:"none",color:isRedeemed?"#065F46":canRedeem?"#fff":"#9CA3AF",fontSize:12,fontWeight:700,cursor:canRedeem&&!isRedeemed?"pointer":"default",fontFamily:"'Hind Siliguri',sans-serif"}}>
                    {isRedeemed?tr.lyRedeemed.split("!")[0]+"!":tr.lyRedeem}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {tab==="history"&&(
        <div style={{background:C.card,borderRadius:16,padding:"4px 0",border:`1px solid ${C.bdr}`}}>
          {history.length===0&&(
            <div style={{textAlign:"center",padding:"30px 20px",color:C.muted,fontSize:13}}>
              {lang==="en"?"No history yet — earn points by booking services!":"এখনো কোনো ইতিহাস নেই — সেবা বুক করে পয়েন্ট অর্জন করুন!"}
            </div>
          )}
          {history.map((h,i)=>(
            <div key={h.id||i} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderBottom:i<history.length-1?`1px solid ${C.bdr}`:"none"}}>
              <div style={{width:36,height:36,borderRadius:10,background:C.plt,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17}}>{h.points>0?"🎯":"🎁"}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:600,color:C.text}}>{lang==="en"?h.reason_en:h.reason_bn}</div>
                <div style={{fontSize:11,color:C.muted}}>{new Date(h.created_at).toLocaleDateString("bn-BD")}</div>
              </div>
              <div style={{fontSize:14,fontWeight:800,color:h.points>0?"#16A34A":"#DC2626"}}>{h.points>0?"+":""}{h.points}</div>
            </div>
          ))}
          {history.length===0&&<div/>}
        </div>
      )}
    </div>
  );
}

/* ─── Referral Program ───────────────────────────────── */
const RF_FRIENDS=[{name:"Karim Ahmed",nameEn:"Karim Ahmed",status:"active",earned:150,date:"Jan 12"},{name:"Nasrin Khatun",nameEn:"Nasrin Khatun",status:"active",earned:150,date:"Jan 8"},{name:"Alam Hossain",nameEn:"Alam Hossain",status:"pending",earned:0,date:"Jan 5"}];
const RF_STEPS=[{icon:"📲",en:"Share your code with friends",bn:"বন্ধুদের সাথে কোড শেয়ার করুন"},{icon:"✅",en:"Friend signs up & books a service",bn:"বন্ধু নিবন্ধন ও বুকিং করেন"},{icon:"💰",en:"You both earn ৳150 bonus",bn:"আপনি উভয়ই ৳১৫০ বোনাস পাবেন"}];

function ReferralPage(){
  const C=useC();const tr=useTr();const lang=useContext(LangCtx)===T.en?"en":"bn";
  const {user:authUser}=useUser();
  const [copied,setCopied]=useState(false);
  const [rfData,setRfData]=useState({referral_code:authUser?.referral_code||null, friends:RF_FRIENDS});

  useEffect(()=>{
    usersApi.getReferral()
      .then(d=>{ if(d) setRfData(prev=>({...prev,...d,friends:d.friends?.length?d.friends:prev.friends})); })
      .catch(()=>{});
  },[]);

  const refCode=rfData.referral_code||authUser?.referral_code||"IMAP-????";
  const friends=rfData.friends||RF_FRIENDS;
  const totalEarned=friends.reduce((s,f)=>s+f.earned,0);

  const doShare=()=>{
    navigator.share?.({title:"IMAP Referral",text:`Join IMAP with my code ${refCode} and get ৳150 bonus!`,url:"https://imap.app/?ref="+refCode}).catch(()=>{});
  };

  const doCopy=()=>{
    navigator.clipboard?.writeText(refCode).catch(()=>{});
    setCopied(true); setTimeout(()=>setCopied(false),2000);
  };

  return(
    <div>
      {/* Ref code card */}
      <div style={{background:"linear-gradient(135deg,#1DBF73,#0D7F5F)",borderRadius:18,padding:"22px 20px",marginBottom:20,color:"#fff",textAlign:"center",position:"relative",overflow:"hidden"}}>
        <div style={{fontSize:13,opacity:.85,marginBottom:8}}>{tr.rfCode}</div>
        <div style={{fontSize:26,fontWeight:900,letterSpacing:4,fontFamily:"monospace",background:"rgba(255,255,255,.15)",padding:"10px 20px",borderRadius:12,marginBottom:16,display:"inline-block"}}>{refCode}</div>
        <div style={{display:"flex",gap:10,justifyContent:"center"}}>
          <button onClick={doCopy} style={{padding:"10px 20px",borderRadius:10,background:"rgba(255,255,255,.2)",border:"1.5px solid rgba(255,255,255,.4)",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>
            {copied?tr.rfCopied:"📋 Copy"}
          </button>
          <button onClick={doShare} style={{padding:"10px 20px",borderRadius:10,background:"#fff",border:"none",color:"#0D7F5F",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>
            📲 {tr.rfShare}
          </button>
        </div>
        <div style={{position:"absolute",right:-20,top:-20,width:80,height:80,borderRadius:"50%",background:"rgba(255,255,255,.08)"}}/>
      </div>
      {/* Stats */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(90px,1fr))",gap:12,marginBottom:20}}>
        {[[friends.length,tr.rfFriends,"👥"],[totalEarned,"৳ "+tr.rfEarned,"💰"],[friends.filter(f=>f.status==="pending").length,tr.rfPending,"⏳"]].map(([val,lbl,ic])=>(
          <div key={lbl} style={{background:C.card,borderRadius:14,padding:"14px 10px",border:`1px solid ${C.bdr}`,textAlign:"center"}}>
            <div style={{fontSize:20}}>{ic}</div>
            <div style={{fontSize:20,fontWeight:800,color:C.p,letterSpacing:-1}}>{val}{lbl==="৳ "+tr.rfEarned?"":""}</div>
            <div style={{fontSize:11,color:C.sub}}>{lbl}</div>
          </div>
        ))}
      </div>
      {/* How it works */}
      <div style={{background:C.card,borderRadius:16,padding:"16px",border:`1px solid ${C.bdr}`,marginBottom:16}}>
        <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:14}}>{tr.rfHow}</div>
        {RF_STEPS.map((s,i)=>(
          <div key={i} style={{display:"flex",gap:12,marginBottom:i<RF_STEPS.length-1?16:0}}>
            <div style={{width:36,height:36,borderRadius:10,background:C.plt,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{s.icon}</div>
            <div>
              <div style={{fontSize:13,color:C.text,fontWeight:600}}>{lang==="en"?s.en:s.bn}</div>
              {i===2&&<div style={{fontSize:12,color:C.p,fontWeight:800,marginTop:3}}>+৳150 {tr.rfBonus}</div>}
            </div>
          </div>
        ))}
      </div>
      {/* Friends list */}
      <div style={{background:C.card,borderRadius:16,padding:"4px 0",border:`1px solid ${C.bdr}`}}>
        <div style={{fontSize:13,fontWeight:700,color:C.text,padding:"12px 16px 8px"}}>{tr.rfFriends}</div>
        {friends.map((f,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 16px",borderTop:`1px solid ${C.bdr}`}}>
            <div style={{width:36,height:36,borderRadius:"50%",background:"linear-gradient(135deg,#1DBF73,#0D7F5F)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,color:"#fff",flexShrink:0}}>{f.name[0]}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:600,color:C.text}}>{f.nameEn||f.name}</div>
              <div style={{fontSize:11,color:C.muted}}>{f.date}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:11,fontWeight:700,background:f.status==="active"?"#D1FAE5":"#FEF3C7",color:f.status==="active"?"#065F46":"#92400E",padding:"2px 8px",borderRadius:6}}>{f.status}</div>
              {f.earned>0&&<div style={{fontSize:12,fontWeight:700,color:"#16A34A",marginTop:3}}>+৳{f.earned}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Portfolio Page ─────────────────────────────────── */
const PF_PROVIDERS=[{id:1,name:"Md. Rakib",skill:"Electrician",exp:7,rating:4.9,jobs:320,skills:["Wiring","AC","Solar","Generator"],about:"7 বছরের অভিজ্ঞ ইলেকট্রিশিয়ান। ঢাকার সকল এলাকায় সেবা প্রদান।",aboutEn:"7-year experienced electrician serving all Dhaka areas.",gallery:["⚡","🔌","💡","🔧","⚙️","🛠️"]},{id:4,name:"Nasrin Begum",skill:"Cleaner",exp:5,rating:4.7,jobs:285,skills:["Deep Clean","Office","Post-Const","Kitchen"],about:"পেশাদার পরিষ্কারকর্মী। শতভাগ সন্তুষ্টি নিশ্চিত।",aboutEn:"Professional cleaner with 100% satisfaction guarantee.",gallery:["🧹","🧺","✨","🏠","🪣","🧽"]}];

function PortfolioPage(){
  const C=useC();const tr=useTr();const lang=useContext(LangCtx)===T.en?"en":"bn";
  const [pfProviders,setPfProviders]=useState(PF_PROVIDERS);
  const [sel,setSel]=useState(PF_PROVIDERS[0]);

  useEffect(()=>{
    providersApi.list({limit:6,sort:"rating"}).then(data=>{
      const list=(data.providers||[]).map(p=>({
        id:p.id,
        name:p.name,
        skill:p.service_type_en||p.service_type_bn||"Service",
        rating:Number(p.rating)||0,
        jobs:p.total_jobs||0,
        exp:p.experience_yrs||1,
        about:p.bio_bn||p.bio_en||"",
        aboutEn:p.bio_en||p.bio_bn||"",
        skills:p.service_type_en?[p.service_type_en,...(p.cat_en&&p.cat_en!==p.service_type_en?[p.cat_en]:[])]:["General Service"],
        gallery:[p.cat_icon||"⚡","🔧","🛠️","🔌","💡","⚙️"],
      }));
      if(list.length){setPfProviders(list);setSel(list[0]);}
    }).catch(()=>{});
  },[]);

  return(
    <div>
      {/* Provider selector */}
      <div style={{display:"flex",gap:10,marginBottom:20,overflowX:"auto",paddingBottom:4}}>
        {pfProviders.map(p=>(
          <button key={p.id} onClick={()=>setSel(p)}
            style={{flexShrink:0,padding:"10px 16px",borderRadius:12,border:`2px solid ${sel.id===p.id?C.p:C.bdr}`,background:sel.id===p.id?C.plt:C.card,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>
            <div style={{fontSize:13,fontWeight:700,color:sel.id===p.id?C.p:C.text}}>{p.name}</div>
            <div style={{fontSize:11,color:C.muted}}>{p.skill}</div>
          </button>
        ))}
      </div>
      {/* Profile card */}
      <div style={{background:C.card,borderRadius:16,padding:"18px",border:`1px solid ${C.bdr}`,marginBottom:16}}>
        <div style={{display:"flex",gap:14,alignItems:"flex-start"}}>
          <div style={{width:64,height:64,borderRadius:16,background:"linear-gradient(135deg,#1DBF73,#0D7F5F)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,flexShrink:0}}>
            {sel.skill==="Electrician"?"⚡":"🧹"}
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:16,fontWeight:800,color:C.text}}>{sel.name}</div>
            <div style={{fontSize:13,color:C.p,fontWeight:700}}>{sel.skill}</div>
            <div style={{display:"flex",gap:12,marginTop:6}}>
              <span style={{fontSize:12,color:C.sub}}>⭐ {sel.rating}</span>
              <span style={{fontSize:12,color:C.sub}}>📋 {sel.jobs} {lang==="en"?"jobs":"কাজ"}</span>
              <span style={{fontSize:12,color:C.sub}}>📅 {sel.exp} {tr.pfYears}</span>
            </div>
          </div>
        </div>
        <div style={{marginTop:14,fontSize:13,color:C.sub,lineHeight:1.6}}>{lang==="en"?sel.aboutEn:sel.about}</div>
      </div>
      {/* Skills */}
      <div style={{background:C.card,borderRadius:16,padding:"16px",border:`1px solid ${C.bdr}`,marginBottom:16}}>
        <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:10}}>{tr.pfSkills}</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
          {sel.skills.map(s=>(
            <span key={s} style={{padding:"5px 12px",borderRadius:20,background:C.plt,color:C.p,fontSize:12,fontWeight:700}}>✓ {s}</span>
          ))}
        </div>
      </div>
      {/* Gallery */}
      <div style={{background:C.card,borderRadius:16,padding:"16px",border:`1px solid ${C.bdr}`}}>
        <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:12}}>{tr.pfGallery} / {tr.pfWork}</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
          {sel.gallery.map((g,i)=>(
            <div key={i} style={{aspectRatio:"1",borderRadius:10,background:`linear-gradient(135deg,${C.plt},${C.bdr})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:32,border:`1px solid ${C.bdr}`}}>{g}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Provider Registration ──────────────────────────── */
const REG_SERVICES=["Electrical","Plumbing","Cleaning","Nursing","Carpentry","Painting","AC Repair","Tutoring","Gardening","Security"];

function ProviderRegPage(){
  const C=useC();const tr=useTr();const lang=useContext(LangCtx)===T.en?"en":"bn";
  const [step,setStep]=useState(1);
  const [name,setName]=useState("");
  const [phone,setPhone]=useState("");
  const [nid,setNid]=useState("");
  const [svc,setSvc]=useState("");
  const [area,setArea]=useState("");
  const [exp,setExp]=useState("1");
  const [done,setDone]=useState(false);

  if(done) return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"60px 20px",textAlign:"center"}}>
      <div style={{fontSize:64,marginBottom:16}}>🎉</div>
      <div style={{fontSize:20,fontWeight:800,color:C.p,marginBottom:8}}>{tr.prRegDone}</div>
      <div style={{fontSize:13,color:C.sub,marginBottom:24}}>{lang==="en"?"Our team will review your application within 24–48 hours.":"আমাদের টিম ২৪–৪৮ ঘণ্টার মধ্যে আপনার আবেদন পর্যালোচনা করবে।"}</div>
      <div style={{background:C.plt,borderRadius:14,padding:"12px 24px",fontSize:14,color:C.p,fontWeight:700}}>APP-{Date.now().toString().slice(-6)}</div>
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
          <button onClick={()=>(name&&phone&&nid)&&setStep(2)} style={{width:"100%",padding:"12px",borderRadius:12,background:(name&&phone&&nid)?C.p:"#ccc",border:"none",color:"#fff",fontSize:14,fontWeight:700,cursor:(name&&phone&&nid)?"pointer":"default",fontFamily:"'Hind Siliguri',sans-serif"}}>{lang==="en"?"Next →":"পরবর্তী →"}</button>
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
            <button onClick={()=>(svc&&area)&&setStep(3)} style={{flex:2,padding:"12px",borderRadius:12,background:(svc&&area)?C.p:"#ccc",border:"none",color:"#fff",fontSize:14,fontWeight:700,cursor:(svc&&area)?"pointer":"default",fontFamily:"'Hind Siliguri',sans-serif"}}>{lang==="en"?"Next →":"পরবর্তী →"}</button>
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
            <div style={{fontWeight:700,color:C.text,marginBottom:6}}>📋 {lang==="en"?"Summary":"সারসংক্ষেপ"}</div>
            <div>👤 {name} • 📱 {phone}</div>
            <div>🛠️ {svc} • 📍 {area} • ⏳ {exp} {lang==="en"?"yrs":"বছর"}</div>
          </div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>setStep(2)} style={{flex:1,padding:"12px",borderRadius:12,background:C.bg,border:`1.5px solid ${C.bdr}`,color:C.sub,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>←</button>
            <button onClick={async()=>{try{await usersApi.updateProfile({name,phone});await providersApi.apply({service_type_en:svc,area_en:area,experience_yrs:parseInt(exp)||1,bio_en:`${svc} provider with ${exp} years experience`});}catch(e){console.error("provReg:",e);}setDone(true);}} style={{flex:2,padding:"12px",borderRadius:12,background:C.p,border:"none",color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>{tr.prRegSubmit}</button>
          </div>
        </>}
      </div>
    </div>
  );
}

/* ─── Provider Analytics ─────────────────────────────── */
const PA_MONTHS=["Aug","Sep","Oct","Nov","Dec","Jan"];
const PA_EARNINGS=[8200,9500,7800,11200,10800,12500];
const PA_REVIEWS=[{name:"Rahim U.",stars:5,text:"অসাধারণ সেবা! সময়মতো এসেছেন।",textEn:"Excellent service! Arrived on time.",date:"Today"},{name:"Sultana B.",stars:4,text:"ভালো কাজ, দাম সঠিক।",textEn:"Good work, fair price.",date:"Yesterday"},{name:"Karim A.",stars:5,text:"100% সুপারিশ করব।",textEn:"100% recommended.",date:"3 days ago"}];

function ProviderAnalyticsPage(){
  const C=useC();const tr=useTr();const lang=useContext(LangCtx)===T.en?"en":"bn";
  const [tab,setTab]=useState("overview");
  const [paMonths,setPaMonths]=useState(PA_MONTHS);
  const [paEarnings,setPaEarnings]=useState(PA_EARNINGS);
  const [paStats,setPaStats]=useState({jobs:48,rating:4.9,views:1200,thisMonth:PA_EARNINGS[PA_EARNINGS.length-1]});
  const [paReviews,setPaReviews]=useState(PA_REVIEWS);

  useEffect(()=>{
    providersApi.analytics().then(data=>{
      if(data.months&&data.months.length){
        setPaMonths(data.months);
        setPaEarnings(data.earnings);
      }
      if(data.stats) setPaStats(s=>({...s,...data.stats}));
      if(data.reviews&&data.reviews.length) setPaReviews(data.reviews);
    }).catch(()=>{});
  },[]);

  const maxEarn=Math.max(...paEarnings,1);

  return(
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
        {[[tr.paEarnings,"💰","৳"+paStats.thisMonth.toLocaleString(),C.p],[tr.paJobs,"📋",String(paStats.jobs),"#3B82F6"],[tr.paRating,"⭐",Number(paStats.rating).toFixed(1),"#F59E0B"],[tr.paViews,"👁️",paStats.views>=1000?(paStats.views/1000).toFixed(1)+"K":String(paStats.views),"#8B5CF6"]].map(([lbl,ic,val,col])=>(
          <div key={lbl} style={{background:C.card,borderRadius:16,padding:"14px",border:`1px solid ${C.bdr}`}}>
            <div style={{fontSize:20}}>{ic}</div>
            <div style={{fontSize:22,fontWeight:800,color:col,letterSpacing:-0.5}}>{val}</div>
            <div style={{fontSize:11,color:C.sub,marginTop:2}}>{lbl}</div>
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:8,marginBottom:16,background:C.card,borderRadius:14,padding:5,border:`1px solid ${C.bdr}`}}>
        {[["overview",tr.paMonthly],["reviews",tr.paReviews]].map(([id,lbl])=>(
          <button key={id} onClick={()=>setTab(id)} style={{flex:1,padding:"9px",borderRadius:10,border:"none",background:tab===id?C.p:"transparent",color:tab===id?"#fff":C.sub,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>{lbl}</button>
        ))}
      </div>
      {tab==="overview"&&(
        <div style={{background:C.card,borderRadius:16,padding:"16px",border:`1px solid ${C.bdr}`,marginBottom:16}}>
          <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:14}}>{tr.paMonthly}</div>
          <div style={{display:"flex",alignItems:"flex-end",gap:8,height:100}}>
            {paEarnings.map((v,i)=>(
              <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                <div style={{fontSize:9,color:C.sub}}>{(v/1000).toFixed(1)}k</div>
                <div style={{width:"100%",borderRadius:"6px 6px 0 0",background:i===paEarnings.length-1?C.p:"#D1FAE5",height:`${(v/maxEarn)*80}px`,minHeight:8}}/>
                <div style={{fontSize:9,color:C.muted}}>{paMonths[i]}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {tab==="reviews"&&(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {paReviews.map((r,i)=>(
            <div key={i} style={{background:C.card,borderRadius:14,padding:"14px 16px",border:`1px solid ${C.bdr}`}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                <div style={{fontSize:13,fontWeight:700,color:C.text}}>{r.name}</div>
                <div style={{display:"flex",gap:2}}>{"⭐".repeat(Math.min(r.stars||r.rating||5,5))}</div>
              </div>
              <div style={{fontSize:13,color:C.sub,lineHeight:1.5}}>{lang==="en"?(r.textEn||r.text||r.comment||""):(r.text||r.comment||"")}</div>
              <div style={{fontSize:11,color:C.muted,marginTop:6}}>{r.date}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Skill Certification ────────────────────────────── */
const SC_COURSES=[{id:1,icon:"⚡",titleEn:"Certified Electrician",titleBn:"সার্টিফাইড ইলেকট্রিশিয়ান",duration:"4 weeks",durationBn:"৪ সপ্তাহ",level:"Beginner",pts:200,issued:"Nov 2024"},{id:2,icon:"🔧",titleEn:"Plumbing Professional",titleBn:"প্লাম্বিং পেশাদার",duration:"3 weeks",durationBn:"৩ সপ্তাহ",level:"Intermediate",pts:250,issued:null},{id:3,icon:"🧹",titleEn:"Home Cleaning Expert",titleBn:"গৃহ পরিষ্কার বিশেষজ্ঞ",duration:"2 weeks",durationBn:"২ সপ্তাহ",level:"Beginner",pts:150,issued:null},{id:4,icon:"🏥",titleEn:"Home Nursing Basics",titleBn:"হোম নার্সিং বেসিক",duration:"6 weeks",durationBn:"৬ সপ্তাহ",level:"Advanced",pts:300,issued:"Dec 2024"},{id:5,icon:"❄️",titleEn:"AC Technician",titleBn:"এসি টেকনিশিয়ান",duration:"3 weeks",durationBn:"৩ সপ্তাহ",level:"Intermediate",pts:250,issued:null}];

function SkillCertPage(){
  const C=useC();const tr=useTr();const lang=useContext(LangCtx)===T.en?"en":"bn";
  const [tab,setTab]=useState("available");
  const [enrolled,setEnrolled]=useState(()=>JSON.parse(localStorage.getItem("imap_enrolled")||"[]"));
  const [enrollFlash,setEnrollFlash]=useState(null);

  const myCerts=SC_COURSES.filter(c=>c.issued);
  const available=SC_COURSES.filter(c=>!c.issued);

  const doEnroll=(id)=>{
    if(enrolled.includes(id)) return;
    const next=[...enrolled,id];
    setEnrolled(next);
    localStorage.setItem("imap_enrolled",JSON.stringify(next));
    setEnrollFlash(id);
    setTimeout(()=>setEnrollFlash(null),2000);
  };

  const levelColor={Beginner:"#10B981",Intermediate:"#F59E0B",Advanced:"#EF4444"};

  return(
    <div>
      <div style={{display:"flex",gap:8,marginBottom:20,background:C.card,borderRadius:14,padding:5,border:`1px solid ${C.bdr}`}}>
        {[["available",`📚 ${tr.scAvail}`],["mycerts",`🏅 ${tr.scMyCerts} (${myCerts.length})`]].map(([id,lbl])=>(
          <button key={id} onClick={()=>setTab(id)} style={{flex:1,padding:"9px",borderRadius:10,border:"none",background:tab===id?C.p:"transparent",color:tab===id?"#fff":C.sub,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>{lbl}</button>
        ))}
      </div>
      {tab==="available"&&(
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {available.map((c,i)=>{
            const isEnrolled=enrolled.includes(c.id);
            return(
              <div key={c.id} className="fu" style={{animationDelay:`${i*.05}s`,background:C.card,borderRadius:16,padding:"16px",border:`1px solid ${C.bdr}`}}>
                <div style={{display:"flex",gap:14,alignItems:"flex-start"}}>
                  <div style={{width:44,height:44,borderRadius:12,background:C.plt,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{c.icon}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:700,color:C.text}}>{lang==="en"?c.titleEn:c.titleBn}</div>
                    <div style={{display:"flex",gap:8,marginTop:5,flexWrap:"wrap"}}>
                      <span style={{fontSize:11,background:levelColor[c.level]+"22",color:levelColor[c.level],padding:"2px 8px",borderRadius:6,fontWeight:700}}>{c.level}</span>
                      <span style={{fontSize:11,color:C.muted}}>⏱️ {lang==="en"?c.duration:c.durationBn}</span>
                      <span style={{fontSize:11,color:C.p,fontWeight:700}}>+{c.pts} pts</span>
                    </div>
                  </div>
                  <button onClick={()=>doEnroll(c.id)}
                    style={{flexShrink:0,padding:"8px 14px",borderRadius:10,background:isEnrolled?"#D1FAE5":C.p,border:"none",color:isEnrolled?"#065F46":"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>
                    {enrollFlash===c.id?tr.scEnrolled.split("!")[0]+"!":isEnrolled?(lang==="en"?"Enrolled":"ভর্তি"):tr.scEnroll}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {tab==="mycerts"&&(
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {myCerts.map((c,i)=>(
            <div key={c.id} style={{background:`linear-gradient(135deg,${C.plt},${C.card})`,borderRadius:16,padding:"18px",border:`2px solid ${C.p}44`,position:"relative",overflow:"hidden"}}>
              <div style={{position:"absolute",right:-10,top:-10,fontSize:60,opacity:.08}}>{c.icon}</div>
              <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                <div style={{width:48,height:48,borderRadius:12,background:C.p+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>{c.icon}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:800,color:C.text}}>{lang==="en"?c.titleEn:c.titleBn}</div>
                  <div style={{fontSize:11,color:C.sub,marginTop:3}}>{tr.scIssued}: {c.issued}</div>
                  <div style={{fontSize:11,fontWeight:700,color:C.p,marginTop:2}}>CERT-{c.id.toString().padStart(4,"0")}</div>
                </div>
              </div>
              <div style={{display:"flex",gap:8,marginTop:14}}>
                <button style={{flex:1,padding:"8px",borderRadius:10,background:C.p,border:"none",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>⬇️ {tr.scDownload}</button>
                <button style={{flex:1,padding:"8px",borderRadius:10,background:C.bg,border:`1.5px solid ${C.bdr}`,color:C.sub,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>🔍 {tr.scVerify}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Promo / Coupon System ──────────────────────────── */
const COUPONS = [
  {code:"IMAP20",pct:20,maxTk:150,minOrder:300,cat:"all",expiry:"31 Jan",uses:1240,limit:2000,tag:"hot",descBn:"সব সেবায় ২০% ছাড়",descEn:"20% off all services"},
  {code:"FIRST50",pct:50,maxTk:200,minOrder:200,cat:"all",expiry:"28 Feb",uses:890,limit:1000,tag:"new",descBn:"প্রথম বুকিংয়ে ৫০% ছাড়",descEn:"50% off your first booking"},
  {code:"ELEC15",pct:15,maxTk:120,minOrder:250,cat:"electrical",expiry:"15 Feb",uses:340,limit:500,tag:"",descBn:"ইলেকট্রিক সেবায় ১৫% ছাড়",descEn:"15% off electrical services"},
  {code:"CLEAN30",pct:30,maxTk:180,minOrder:300,cat:"cleaning",expiry:"20 Jan",uses:620,limit:800,tag:"",descBn:"গৃহপরিচ্ছন্নতায় ৩০% ছাড়",descEn:"30% off cleaning services"},
  {code:"NURSE10",pct:10,maxTk:100,minOrder:400,cat:"medical",expiry:"28 Feb",uses:180,limit:300,tag:"new",descBn:"নার্সিং সেবায় ১০% ছাড়",descEn:"10% off nursing services"},
  {code:"FLASH40",pct:40,maxTk:250,minOrder:500,cat:"all",expiry:"Today!",uses:1890,limit:2000,tag:"flash",descBn:"ফ্ল্যাশ সেল — ৪০% ছাড়",descEn:"Flash sale — 40% off"},
];
const PROMO_CATS=["all","electrical","cleaning","medical","plumbing","tutoring"];

function PromosPage(){
  const C=useC(); const tr=useTr(); const lang=useContext(LangCtx)===T.en?"en":"bn";
  const [code,setCode]=useState("");
  const [applyResult,setApplyResult]=useState(null); // null | "ok" | "err"
  const [appliedCode,setAppliedCode]=useState(null);
  const [tab,setTab]=useState("offers"); // offers | flash
  const [catFilter,setCatFilter]=useState("all");
  const [copied,setCopied]=useState(null);
  const [coupons,setCoupons]=useState(COUPONS);

  useEffect(()=>{
    promosApi.getAll()
      .then(r=>{ if(r?.coupons?.length) setCoupons(r.coupons); })
      .catch(()=>{});
  },[]);

  const visible=coupons.filter(c=>(tab==="flash"?c.tag==="flash":c.tag!=="flash")&&(catFilter==="all"||c.cat===catFilter||c.cat==="all"));

  const doApply=async()=>{
    if(!code.trim()) return;
    try{
      const r=await promosApi.validate(code);
      if(r?.valid&&r.promo){
        setApplyResult("ok");
        setAppliedCode({...r.promo, descBn:r.promo.titleBn, descEn:r.promo.titleEn});
      } else {
        setApplyResult("err"); setTimeout(()=>setApplyResult(null),2000);
      }
    }catch{
      // fallback to local check
      const found=coupons.find(c=>c.code===code.trim().toUpperCase());
      if(found){setApplyResult("ok");setAppliedCode(found);}
      else{setApplyResult("err");setTimeout(()=>setApplyResult(null),2000);}
    }
  };

  const copyCode=c=>{
    navigator.clipboard?.writeText(c.code).catch(()=>{});
    setCopied(c.code);
    setTimeout(()=>setCopied(null),1800);
  };

  const pctBar=c=>Math.round((c.uses/c.limit)*100);

  return(
    <div>
      {/* Coupon apply box */}
      <div style={{background:C.card,borderRadius:16,padding:18,marginBottom:16,border:`1px solid ${C.bdr}`}}>
        <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:10}}>🎟️ {lang==="en"?"Apply Coupon":"\u0995\u09c1\u09aa\u09a8 \u0995\u09cb\u09a1 \u09a6\u09bf\u09a8"}</div>
        {appliedCode&&(
          <div style={{background:"#D1FAE5",borderRadius:12,padding:"12px 16px",marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:13,fontWeight:800,color:"#065F46"}}>{appliedCode.code} — {appliedCode.pct}% {lang==="en"?"off":"ছাড়"}</div>
              <div style={{fontSize:11,color:"#047857"}}>{lang==="en"?`Max save ৳${appliedCode.maxTk}`:`সর্বোচ্চ ৳${appliedCode.maxTk} সাশ্রয়`}</div>
            </div>
            <button onClick={()=>{setAppliedCode(null);setApplyResult(null);setCode("");}} style={{background:"none",border:"none",color:"#DC2626",fontSize:18,cursor:"pointer"}}>✕</button>
          </div>
        )}
        <div style={{display:"flex",gap:8}}>
          <input value={code} onChange={e=>setCode(e.target.value.toUpperCase())}
            placeholder={tr.prCode}
            style={{flex:1,padding:"10px 14px",borderRadius:10,border:`1.5px solid ${applyResult==="err"?"#DC2626":applyResult==="ok"?C.p:C.bdr}`,background:C.bg,color:C.text,fontSize:13,fontFamily:"'Hind Siliguri',sans-serif",textTransform:"uppercase",letterSpacing:2}}
            onKeyDown={e=>e.key==="Enter"&&doApply()}/>
          <button onClick={doApply} style={{padding:"10px 20px",borderRadius:10,background:C.p,border:"none",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif",whiteSpace:"nowrap"}}>
            {tr.prApply}
          </button>
        </div>
        {applyResult==="err"&&<div style={{fontSize:12,color:"#DC2626",marginTop:6,fontWeight:600}}>{tr.prInvalid}</div>}
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:8,marginBottom:16,background:C.card,borderRadius:14,padding:5,border:`1px solid ${C.bdr}`}}>
        {[["offers",`🏷️ ${tr.prOffers}`],["flash",`⚡ ${tr.prDeals}`]].map(([id,lbl])=>(
          <button key={id} onClick={()=>setTab(id)} style={{flex:1,padding:"9px",borderRadius:10,border:"none",background:tab===id?C.p:"transparent",color:tab===id?"#fff":C.sub,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif",transition:"all .15s"}}>{lbl}</button>
        ))}
      </div>

      {/* Category filter */}
      <div className="sx" style={{display:"flex",gap:8,marginBottom:16,paddingBottom:2}}>
        {PROMO_CATS.map(cat=>(
          <button key={cat} onClick={()=>setCatFilter(cat)} style={{flexShrink:0,padding:"6px 14px",borderRadius:20,border:`1.5px solid ${catFilter===cat?C.p:C.bdr}`,background:catFilter===cat?C.p:C.card,color:catFilter===cat?"#fff":C.sub,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>
            {lang==="en"?cat.charAt(0).toUpperCase()+cat.slice(1):cat==="all"?tr.prAllCats:cat}
          </button>
        ))}
      </div>

      {/* Coupons grid */}
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {visible.length===0&&<div style={{textAlign:"center",padding:"40px 20px",color:C.muted,fontSize:14}}>{lang==="en"?"No offers in this category":"এই বিভাগে কোনো অফার নেই"}</div>}
        {visible.map((c,i)=>{
          const isApplied=appliedCode?.code===c.code;
          return(
          <div key={c.code} className="fu" style={{animationDelay:`${i*.05}s`,background:c.tag==="flash"?"linear-gradient(135deg,#FFF7ED,#FFEDD5)":C.card,borderRadius:16,border:`1.5px dashed ${c.tag==="flash"?"#FB923C":isApplied?C.p:C.bdr}`,padding:"16px 18px",position:"relative",overflow:"hidden"}}>
            {c.tag&&<div style={{position:"absolute",top:10,right:10,background:c.tag==="flash"?"#EA580C":c.tag==="hot"?"#DC2626":"#0369A1",color:"#fff",borderRadius:8,padding:"2px 9px",fontSize:10,fontWeight:800,textTransform:"uppercase"}}>{c.tag}</div>}
            <div style={{display:"flex",alignItems:"flex-start",gap:14}}>
              <div style={{width:50,height:50,borderRadius:12,background:c.tag==="flash"?"#FED7AA":C.plt,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>🎟️</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:20,fontWeight:800,color:C.p,letterSpacing:2,fontFamily:"monospace"}}>{c.code}</div>
                <div style={{fontSize:13,color:C.text,marginTop:2}}>{lang==="en"?c.descEn:c.descBn}</div>
                <div style={{fontSize:11,color:C.muted,marginTop:4}}>{lang==="en"?`Min order ৳${c.minOrder} · Max save ৳${c.maxTk} · Expires ${c.expiry}`:`সর্বনিম্ন ৳${c.minOrder} · সর্বোচ্চ সাশ্রয় ৳${c.maxTk} · মেয়াদ ${c.expiry}`}</div>
                {/* Usage bar */}
                <div style={{marginTop:8}}>
                  <div style={{height:4,borderRadius:3,background:C.bdr,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${pctBar(c)}%`,background:pctBar(c)>80?"#DC2626":C.p,borderRadius:3,transition:"width .4s"}}/>
                  </div>
                  <div style={{fontSize:10,color:C.muted,marginTop:3}}>{lang==="en"?`${c.uses} claimed of ${c.limit}`:`${c.limit} এর মধ্যে ${c.uses} ব্যবহার`}</div>
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:7,flexShrink:0}}>
                <button onClick={()=>copyCode(c)} style={{padding:"7px 12px",borderRadius:9,border:`1.5px solid ${C.bdr}`,background:C.bg,color:C.sub,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>
                  {copied===c.code?tr.prCopied:"📋 Copy"}
                </button>
                <button onClick={()=>{if(!isApplied){setCode(c.code);setAppliedCode(c);setApplyResult("ok");}else{setAppliedCode(null);setApplyResult(null);setCode("");}}}
                  style={{padding:"7px 12px",borderRadius:9,border:`1.5px solid ${isApplied?"#DC2626":C.p}`,background:isApplied?"#FEF2F2":C.plt,color:isApplied?"#DC2626":C.p,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>
                  {isApplied?tr.prApplied:tr.prApply}
                </button>
              </div>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Wallet / Transaction History ──────────────────── */
const TRANSACTIONS = [
  {id:"TXN-9021",icon:"⚡",type:"payment",titleBn:"ইলেকট্রিশিয়ান সেবা",titleEn:"Electrician Service",provider:"Md. Rakib",amount:-385,method:"bKash",date:"আজ, ১০:৩০ AM",dateEn:"Today 10:30 AM",status:"success"},
  {id:"TXN-9020",icon:"🔄",type:"refund",titleBn:"বুকিং বাতিল ফেরত",titleEn:"Booking Cancellation Refund",provider:"System",amount:+315,method:"Wallet",date:"আজ, ৮:০০ AM",dateEn:"Today 8:00 AM",status:"success"},
  {id:"TXN-9019",icon:"🏥",type:"payment",titleBn:"নার্সিং সেবা",titleEn:"Nursing Service",provider:"Farzana Akter",amount:-535,method:"Nagad",date:"গতকাল",dateEn:"Yesterday",status:"success"},
  {id:"TXN-9018",icon:"💳",type:"topup",titleBn:"ওয়ালেট টপআপ",titleEn:"Wallet Top Up",provider:"bKash",amount:+1000,method:"bKash",date:"২ দিন আগে",dateEn:"2 days ago",status:"success"},
  {id:"TXN-9017",icon:"🔧",type:"payment",titleBn:"প্লাম্বার সেবা",titleEn:"Plumber Service",provider:"Md. Sajid",amount:-280,method:"Wallet",date:"৩ দিন আগে",dateEn:"3 days ago",status:"success"},
  {id:"TXN-9016",icon:"❄️",type:"payment",titleBn:"AC সার্ভিস",titleEn:"AC Service",provider:"Karim Mia",amount:-450,method:"Rocket",date:"৫ দিন আগে",dateEn:"5 days ago",status:"success"},
  {id:"TXN-9015",icon:"💳",type:"topup",titleBn:"ওয়ালেট টপআপ",titleEn:"Wallet Top Up",provider:"Nagad",amount:+500,method:"Nagad",date:"৭ দিন আগে",dateEn:"7 days ago",status:"success"},
  {id:"TXN-9014",icon:"📚",type:"payment",titleBn:"গৃহশিক্ষক সেবা",titleEn:"Home Tutor Session",provider:"Nasrin Begum",amount:-400,method:"bKash",date:"১০ দিন আগে",dateEn:"10 days ago",status:"success"},
];
const TOPUP_AMOUNTS=[100,200,500,1000,2000,5000];
const TOPUP_METHODS=[{id:"bkash",label:"bKash",icon:"🟣"},{id:"nagad",label:"Nagad",icon:"🟠"},{id:"rocket",label:"Rocket",icon:"🟤"},{id:"card",label:"Card",icon:"💳"}];

function WalletPage() {
  const C=useC(); const tr=useTr(); const lang=useContext(LangCtx)===T.en?"en":"bn";
  const { balance: ctxBalance, setBalance: setCtxBalance } = useLiveData();
  const [tab,setTab]=useState("history"); // history | topup
  const [filter,setFilter]=useState("all");
  const [selAmt,setSelAmt]=useState(500);
  const [custAmt,setCustAmt]=useState("");
  const [selMethod,setSelMethod]=useState("bkash");
  const [success,setSuccess]=useState(false);
  const [balance,setBalance]=useState(ctxBalance);
  const [apiTxns,setApiTxns]=useState(null); // null = not loaded yet

  // Load real transactions from API
  useEffect(()=>{
    usersApi.getWallet().then(data=>{
      if(data.balance!=null){ setBalance(data.balance); setCtxBalance(data.balance); }
      if(Array.isArray(data.transactions)){
        setApiTxns(data.transactions.map(t=>({
          id: t.id?`TXN-${String(t.id).slice(0,8).toUpperCase()}`:("TXN-"+Math.random().toString(36).slice(2,8).toUpperCase()),
          icon: t.type==="topup"?"💳":t.type==="credit"||t.type==="refund"?"🔄":"💸",
          type: t.type==="debit"?"payment":t.type==="topup"?"topup":"refund",
          titleBn: t.description_bn||t.description||"লেনদেন",
          titleEn: t.description_en||t.description||"Transaction",
          provider: "",
          amount: t.type==="debit"?-Math.abs(parseFloat(t.amount||0)):+Math.abs(parseFloat(t.amount||0)),
          method: t.method||"Wallet",
          date: t.created_at?new Date(t.created_at).toLocaleDateString("bn-BD"):"সম্প্রতি",
          dateEn: t.created_at?new Date(t.created_at).toLocaleDateString("en-GB"):"Recent",
          status:"success",
        })));
      }
    }).catch(()=>{});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // Keep local balance in sync when context changes (API load)
  useEffect(()=>{ setBalance(ctxBalance); },[ctxBalance]);

  const displayTxns=apiTxns!=null?apiTxns:TRANSACTIONS;
  const income=displayTxns.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0);
  const spent=Math.abs(displayTxns.filter(t=>t.amount<0).reduce((s,t)=>s+t.amount,0));

  const filtered=filter==="all"?displayTxns:displayTxns.filter(t=>t.type===filter);

  const finalAmt=custAmt?parseInt(custAmt)||0:selAmt;

  const doTopUp=async()=>{
    if(!finalAmt||finalAmt<10) return;
    try {
      const d=await usersApi.topup(finalAmt,selMethod);
      const newBal=d.balance??balance+finalAmt;
      setBalance(newBal); setCtxBalance(newBal);
    } catch {
      setBalance(b=>b+finalAmt); // optimistic fallback
    }
    setSuccess(true);
    setCustAmt(""); setSelAmt(500);
    setTimeout(()=>setSuccess(false),2500);
  };

  const txColor=t=>t.amount>0?"#16A34A":"#DC2626";
  const txSign=t=>t.amount>0?"+":"";

  const printReceipt=t=>{
    const w=window.open("","_blank","width=480,height=620");
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>IMAP Receipt</title>
    <style>body{font-family:'Segoe UI',sans-serif;background:#f8fafc;margin:0;padding:20px}
    .card{background:#fff;border-radius:14px;padding:28px;max-width:400px;margin:0 auto;box-shadow:0 2px 12px rgba(0,0,0,.08)}
    .header{text-align:center;border-bottom:2px dashed #E5E7EB;padding-bottom:18px;margin-bottom:18px}
    .logo{font-size:32px;margin-bottom:6px}.title{font-size:18px;font-weight:800;color:#1DBF73}
    .sub{font-size:12px;color:#9CA3AF;margin-top:3px}.badge{display:inline-block;background:#D1FAE5;color:#065F46;padding:4px 12px;border-radius:99px;font-size:11px;font-weight:700;margin-top:8px}
    .row{display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid #F3F4F6}
    .row label{font-size:12px;color:#6B7280}.row span{font-size:13px;font-weight:700;color:#111}
    .amount{text-align:center;padding:18px 0}.amount .val{font-size:32px;font-weight:800;color:${txColor(t)}}
    .footer{text-align:center;margin-top:18px;font-size:11px;color:#9CA3AF}
    @media print{body{background:#fff;padding:0}}</style></head>
    <body onload="window.print()"><div class="card">
    <div class="header"><div class="logo">🧾</div><div class="title">IMAP Receipt</div>
    <div class="sub">পেমেন্ট রসিদ</div><div class="badge">✓ ${lang==="en"?"Successful":"সফল"}</div></div>
    <div class="amount"><div class="val">${txSign(t)}৳${Math.abs(t.amount)}</div></div>
    <div class="row"><label>Transaction ID</label><span style="font-family:monospace">${t.id}</span></div>
    <div class="row"><label>${lang==="en"?"Service":"সেবা"}</label><span>${lang==="en"?t.titleEn:t.titleBn}</span></div>
    <div class="row"><label>${lang==="en"?"Method":"মাধ্যম"}</label><span>${t.method}</span></div>
    <div class="row"><label>${lang==="en"?"Date":"তারিখ"}</label><span>${lang==="en"?t.dateEn:t.date}</span></div>
    <div class="row"><label>${lang==="en"?"Type":"ধরন"}</label><span>${t.type}</span></div>
    <div class="footer">IMAP Platform · imap.com.bd<br>This is a computer-generated receipt.</div>
    </div></body></html>`);
    w.document.close();
  };

  return (
    <div>
      {/* Balance card */}
      <div style={{background:"linear-gradient(135deg,#1DBF73,#0D7F5F)",borderRadius:18,padding:"22px 20px",marginBottom:20,color:"#fff",position:"relative",overflow:"hidden"}}>
        <div style={{fontSize:13,opacity:.85,marginBottom:4}}>{tr.wlBalance}</div>
        <div style={{fontSize:34,fontWeight:800,letterSpacing:-1,marginBottom:16}}>৳{balance.toLocaleString()}</div>
        <div style={{display:"flex",gap:24,marginBottom:18}}>
          {[[tr.wlIncome,"⬆️",income],[tr.wlSpent,"⬇️",spent]].map(([lbl,ic,amt])=>(
            <div key={lbl}>
              <div style={{fontSize:11,opacity:.8}}>{ic} {lbl}</div>
              <div style={{fontSize:16,fontWeight:700}}>৳{amt.toLocaleString()}</div>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:10}}>
          {[[tr.wlTopUp,"topup"],[tr.wlWithdraw,"history"]].map(([lbl,t])=>(
            <button key={lbl} onClick={()=>setTab(t)}
              style={{padding:"8px 18px",borderRadius:10,background:tab===t?"#fff":"rgba(255,255,255,.2)",border:"1.5px solid rgba(255,255,255,.4)",color:tab===t?"#0D7F5F":"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif",transition:"all .15s"}}>
              {lbl}
            </button>
          ))}
        </div>
        <div style={{position:"absolute",right:-20,top:-20,width:100,height:100,borderRadius:"50%",background:"rgba(255,255,255,.08)"}}/>
        <div style={{position:"absolute",right:40,bottom:-30,width:70,height:70,borderRadius:"50%",background:"rgba(255,255,255,.06)"}}/>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:8,marginBottom:20,background:C.card,borderRadius:14,padding:5,border:`1px solid ${C.bdr}`}}>
        {[["history",tr.wlHistory,"📋"],["topup",tr.wlTopUp,"➕"]].map(([id,lbl,ic])=>(
          <button key={id} onClick={()=>setTab(id)} style={{flex:1,padding:"9px",borderRadius:10,border:"none",background:tab===id?C.p:"transparent",color:tab===id?"#fff":C.sub,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif",transition:"all .15s"}}>{ic} {lbl}</button>
        ))}
      </div>

      {/* HISTORY TAB */}
      {tab==="history"&&(
        <div>
          {/* Filter chips */}
          <div className="sx" style={{display:"flex",gap:8,marginBottom:16,paddingBottom:2}}>
            {[["all",tr.wlAll],["payment",tr.wlPay],["refund",tr.wlRefund],["topup",tr.wlTopUpL]].map(([f,lbl])=>(
              <button key={f} onClick={()=>setFilter(f)}
                style={{flexShrink:0,padding:"6px 14px",borderRadius:20,border:`1.5px solid ${filter===f?C.p:C.bdr}`,background:filter===f?C.p:C.card,color:filter===f?"#fff":C.sub,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>
                {lbl}
              </button>
            ))}
          </div>

          {/* Transaction list */}
          <div style={{display:"flex",flexDirection:"column",gap:2}}>
            {filtered.map((t,i)=>(
              <div key={t.id} className="fu" style={{animationDelay:`${i*.04}s`,display:"flex",alignItems:"center",gap:14,padding:"13px 16px",background:C.card,borderRadius:i===0?"14px 14px 6px 6px":i===filtered.length-1?"6px 6px 14px 14px":"6px",marginBottom:2,border:`1px solid ${C.bdr}`}}>
                <div style={{width:40,height:40,borderRadius:11,background:t.type==="refund"?"#D1FAE5":t.type==="topup"?"#EFF6FF":C.plt,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{t.icon}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{lang==="en"?t.titleEn:t.titleBn}</div>
                  <div style={{fontSize:11,color:C.muted,marginTop:2}}>{t.id} · {t.method} · {lang==="en"?t.dateEn:t.date}</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontSize:15,fontWeight:800,color:txColor(t)}}>{txSign(t)}৳{Math.abs(t.amount)}</div>
                  <div style={{display:"flex",alignItems:"center",gap:6,justifyContent:"flex-end",marginTop:4}}>
                    <div style={{fontSize:10,color:"#16A34A"}}>✓ {lang==="en"?"Success":"সফল"}</div>
                    <button onClick={()=>printReceipt(t)} title={lang==="en"?"Download Receipt":"রসিদ ডাউনলোড"}
                      style={{background:"none",border:"none",cursor:"pointer",fontSize:13,padding:0,color:C.p,lineHeight:1}}>📄</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TOPUP TAB */}
      {tab==="topup"&&(
        <div style={{background:C.card,borderRadius:16,padding:20,border:`1px solid ${C.bdr}`}}>
          {success&&(
            <div style={{background:"#D1FAE5",borderRadius:12,padding:"12px 16px",marginBottom:16,fontSize:14,color:"#065F46",fontWeight:700,textAlign:"center"}}>{tr.wlSuccess} +৳{finalAmt}</div>
          )}
          {/* Amount presets */}
          <div style={{fontSize:13,fontWeight:700,color:C.sub,marginBottom:10}}>{lang==="en"?"Select Amount":"পরিমাণ বেছুন"}</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(90px,1fr))",gap:9,marginBottom:12}}>
            {TOPUP_AMOUNTS.map(a=>(
              <button key={a} onClick={()=>{setSelAmt(a);setCustAmt("");}}
                style={{padding:"10px",borderRadius:10,border:`2px solid ${selAmt===a&&!custAmt?C.p:C.bdr}`,background:selAmt===a&&!custAmt?C.plt:C.bg,color:selAmt===a&&!custAmt?C.p:C.text,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif",transition:"all .15s"}}>
                ৳{a.toLocaleString()}
              </button>
            ))}
          </div>
          {/* Custom amount */}
          <input value={custAmt} onChange={e=>setCustAmt(e.target.value.replace(/\D/g,""))}
            placeholder={lang==="en"?"Custom amount (min ৳10)":"নিজে লিখুন (সর্বনিম্ন ৳১০)"}
            style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1.5px solid ${custAmt?C.p:C.bdr}`,background:C.bg,color:C.text,fontSize:13,fontFamily:"'Hind Siliguri',sans-serif",marginBottom:16,boxSizing:"border-box"}}/>

          {/* Payment method */}
          <div style={{fontSize:13,fontWeight:700,color:C.sub,marginBottom:10}}>{lang==="en"?"Pay Via":"পেমেন্ট মাধ্যম"}</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(72px,1fr))",gap:8,marginBottom:20}}>
            {TOPUP_METHODS.map(m=>(
              <button key={m.id} onClick={()=>setSelMethod(m.id)}
                style={{padding:"10px 6px",borderRadius:12,border:`2px solid ${selMethod===m.id?C.p:C.bdr}`,background:selMethod===m.id?C.plt:C.card,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:5,fontFamily:"'Hind Siliguri',sans-serif",transition:"all .15s"}}>
                <span style={{fontSize:20}}>{m.icon}</span>
                <span style={{fontSize:11,fontWeight:700,color:selMethod===m.id?C.p:C.sub}}>{m.label}</span>
              </button>
            ))}
          </div>

          {/* Total & confirm */}
          <div style={{background:C.plt,borderRadius:12,padding:"12px 16px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:13,color:C.sub}}>{lang==="en"?"Total to add":"মোট যোগ হবে"}</span>
            <span style={{fontSize:18,fontWeight:800,color:C.p}}>৳{(finalAmt||0).toLocaleString()}</span>
          </div>

          <button onClick={doTopUp} disabled={!finalAmt||finalAmt<10}
            style={{width:"100%",padding:"14px",borderRadius:14,background:finalAmt>=10?C.p:"#ccc",border:"none",color:"#fff",fontSize:15,fontWeight:700,cursor:finalAmt>=10?"pointer":"default",fontFamily:"'Hind Siliguri',sans-serif"}}>
            ➕ {tr.wlTopUp} via {TOPUP_METHODS.find(m=>m.id===selMethod)?.label}
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Disaster Alert Mode ────────────────────────────── */
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
function DisasterPage() {
  const C=useC(); const tr=useTr(); const lang=useContext(LangCtx)===T.en?"en":"bn";
  const [tab,setTab]=useState("alerts"); // alerts | shelters | tips | report
  const [reported,setReported]=useState(false);
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
            color:a.severity==="critical"?"#DC2626":a.severity==="high"?"#D97706":"#16A34A",
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
    if(!repType) return;
    const rawType=repType.replace(/^[^\s]+\s/,"").toLowerCase(); // strip emoji
    try{
      await disasterApi.report(rawType, repDesc, "", "high");
    }catch(e){}
    setReported(true);
    setTimeout(()=>{setReported(false);setRepType("");setRepDesc("");},3000);
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

  const LEVEL_COL={high:"#D97706",extreme:"#DC2626",moderate:"#16A34A"};
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
          <a href="tel:999" style={{padding:"7px 14px",borderRadius:10,background:"#fff",border:"none",color:"#DC2626",fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif",textDecoration:"none",display:"flex",alignItems:"center",gap:5}}>
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
              <div style={{width:44,height:44,borderRadius:12,background:"linear-gradient(135deg,#16A34A,#166534)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>🏕️</div>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:700,color:C.text}}>{lang==="en"?s.nameEn:s.name}</div>
                <div style={{fontSize:12,color:C.muted,marginTop:3}}>👥 {s.cap.toLocaleString()} {lang==="en"?"capacity":"জন’র ধারণ ক্ষমতা"} · 📍 {s.dist} km</div>
              </div>
              <button style={{padding:"7px 13px",borderRadius:9,background:C.p,border:"none",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>{lang==="en"?"Navigate":"যান"}</button>
            </div>
          ))}
          <div style={{background:"#ECFDF5",borderRadius:14,padding:"14px 16px",border:"1px solid #A7F3D0",fontSize:13,color:"#065F46",display:"flex",alignItems:"flex-start",gap:10,marginTop:4}}>
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
            <div style={{background:"#D1FAE5",borderRadius:12,padding:"12px 16px",marginBottom:16,fontSize:13,color:"#065F46",fontWeight:600}}>✅ {tr.dsReported}</div>
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
            <button onClick={sendReport} disabled={!repType}
              style={{width:"100%",padding:"13px",borderRadius:12,background:repType?"#DC2626":"#ccc",border:"none",color:"#fff",fontSize:14,fontWeight:700,cursor:repType?"pointer":"default",fontFamily:"'Hind Siliguri',sans-serif"}}>
              🚨 {tr.dsReportBtn}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Blood Donation ─────────────────────────────────── */
const BLOOD_GROUPS=["A+","A-","B+","B-","AB+","AB-","O+","O-"];
const DONORS=[
  {id:1,name:"মো. কাদের",nameEn:"Md. Kader",bg:"A+",loc:"মিরপুর",locEn:"Mirpur",phone:"01700-000001",lastDon:"3",dist:0.8,dons:12,avail:true,lat:23.8041,lng:90.3660},
  {id:2,name:"রুমা খানম",nameEn:"Ruma Khanam",bg:"O+",loc:"গুলশান",locEn:"Gulshan",phone:"01700-000002",lastDon:"5",dist:1.9,dons:8,avail:true,lat:23.7860,lng:90.4158},
  {id:3,name:"তারিক ইসলাম",nameEn:"Tariq Islam",bg:"B+",loc:"ধানমন্ডি",locEn:"Dhanmondi",phone:"01700-000003",lastDon:"2",dist:2.4,dons:20,avail:false,lat:23.7461,lng:90.3742},
  {id:4,name:"সাদিয়া ইসলাম",nameEn:"Sadia Islam",bg:"AB+",loc:"উত্তরা",locEn:"Uttara",phone:"01700-000004",lastDon:"6",dist:5.1,dons:5,avail:true,lat:23.8759,lng:90.3795},
  {id:5,name:"হাসান আলী",nameEn:"Hasan Ali",bg:"O-",loc:"বারিধারা",locEn:"Baridhara",phone:"01700-000005",lastDon:"4",dist:3.2,dons:15,avail:true,lat:23.7937,lng:90.4241},
  {id:6,name:"নাজমা বেগম",nameEn:"Najma Begum",bg:"A-",loc:"বনানী",locEn:"Banani",phone:"01700-000006",lastDon:"7",dist:1.5,dons:3,avail:true,lat:23.7936,lng:90.4052},
  {id:7,name:"রাফিউল আলম",nameEn:"Rafiul Alam",bg:"B-",loc:"মোহাম্মদপুর",locEn:"Mohammadpur",phone:"01700-000007",lastDon:"8",dist:2.8,dons:9,avail:false,lat:23.7528,lng:90.3564},
  {id:8,name:"সিনথিয়া আক্তার",nameEn:"Sinthy Akter",bg:"AB-",loc:"রামপুরা",locEn:"Rampura",phone:"01700-000008",lastDon:"1",dist:4.0,dons:2,avail:true,lat:23.7628,lng:90.4243},
];

/* ── Blood Donor Map (Leaflet) ── */
const BG_COL_MAP={"A+":"#DC2626","A-":"#EF4444","B+":"#2563EB","B-":"#3B82F6","AB+":"#7C3AED","AB-":"#8B5CF6","O+":"#D97706","O-":"#F59E0B"};
function BloodDonorMap({donors,lang}){
  const mapElRef=useRef(null);
  const mapObjRef=useRef(null);
  useEffect(()=>{
    if(!mapElRef.current||mapObjRef.current) return;
    const m=L.map(mapElRef.current).setView([23.7808,90.4124],12);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",{attribution:"\u00a9 OpenStreetMap \u00a9 CartoDB",maxZoom:19}).addTo(m);
    mapObjRef.current=m;
    donors.forEach(d=>{
      const lat=d.lat||(23.7808+(Math.random()-0.5)*0.08);
      const lng=d.lng||(90.4124+(Math.random()-0.5)*0.08);
      const col=BG_COL_MAP[d.bg]||"#666";
      const icon=L.divIcon({className:"",html:`<div style="width:38px;height:38px;border-radius:50%;background:${col};border:3px solid #fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.3);opacity:${d.avail?1:0.45}">${d.bg}</div>`,iconSize:[38,38],iconAnchor:[19,19]});
      const mk=L.marker([lat,lng],{icon}).addTo(m);
      mk.bindPopup(`<div style="font-family:sans-serif;min-width:150px"><div style="font-weight:700;font-size:14px">${d.name}</div><div style="font-size:12px;color:#666;margin-bottom:6px">${d.loc||d.locEn}</div><div style="display:flex;gap:6px;margin-bottom:6px"><span style="background:${col};color:#fff;border-radius:20px;padding:2px 10px;font-size:12px;font-weight:700">${d.bg}</span><span style="background:${d.avail?"#D1FAE5":"#FEE2E2"};color:${d.avail?"#065F46":"#991B1B"};border-radius:20px;padding:2px 10px;font-size:12px">${d.avail?(lang==="en"?"Available":"ুপলব্ধ"):(lang==="en"?"Unavailable":"অনুপলব্ধ")}</span></div><div style="font-size:12px">📞 ${d.phone}</div><div style="font-size:11px;color:#888;margin-top:3px">💉 ${d.dons} ${lang==="en"?"donations":"বার দান"}</div>${d.avail?`<a href="tel:${d.phone}" style="display:block;margin-top:8px;background:${col};color:#fff;text-align:center;border-radius:8px;padding:6px 10px;text-decoration:none;font-size:12px;font-weight:700">${lang==="en"?"📞 Call":"📞 কল করুন"}</a>`:""}</div>`);
    });
    return()=>{m.remove();mapObjRef.current=null;};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[donors]);
  return <div ref={mapElRef} style={{height:420,borderRadius:14,overflow:"hidden",border:"1px solid #e5e7eb"}}/>;
}

function BloodDonationPage() {
  const C=useC(); const tr=useTr(); const lang=useContext(LangCtx)===T.en?"en":"bn";
  const [tab,setTab]=useState("donors"); // donors | request | become
  const [bgFilter,setBgFilter]=useState("all");
  const [reqBg,setReqBg]=useState("");
  const [reqMsg,setReqMsg]=useState("");
  const [reqName,setReqName]=useState("");
  const [sent,setSent]=useState(false);
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
    if(!reqBg||!reqName.trim()) return;
    try{
      await bloodApi.request({blood_group:reqBg, name:reqName, message:reqMsg});
    }catch(e){}
    setSent(true);
    setTimeout(()=>setSent(false),3000);
    setReqBg(""); setReqMsg(""); setReqName("");
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
            <div style={{background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:10,padding:"9px 13px",marginBottom:14,fontSize:12,color:"#991B1B"}}>
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
                      ?<span style={{fontSize:10,background:"#D1FAE5",color:"#065F46",borderRadius:6,padding:"2px 7px",fontWeight:700}}>✓ {tr.bdAvail}</span>
                      :<span style={{fontSize:10,background:"#F3F4F6",color:C.muted,borderRadius:6,padding:"2px 7px",fontWeight:600}}>⏸ Unavailable</span>
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
            <div style={{background:"#D1FAE5",borderRadius:12,padding:"12px 16px",marginBottom:16,fontSize:13,color:"#065F46",fontWeight:600}}>✅ {tr.bdSent}</div>
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
            <button onClick={sendRequest} disabled={!reqBg||!reqName.trim()}
              style={{width:"100%",padding:"13px",borderRadius:12,background:reqBg&&reqName.trim()?"#DC2626":"#ccc",border:"none",color:"#fff",fontSize:14,fontWeight:700,cursor:reqBg&&reqName.trim()?"pointer":"default",fontFamily:"'Hind Siliguri',sans-serif"}}>
              🆘 {tr.bdRequest}
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
          <div style={{background:"#FEF2F2",borderRadius:14,padding:"16px",border:"1px solid #FECACA"}}>
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

/* ─── GPS / Nearby ───────────────────────────────────── */
const haversine=(lat1,lng1,lat2,lng2)=>{
  const R=6371,dLat=(lat2-lat1)*Math.PI/180,dLng=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
};
function NearbyPage({onBook,onView}) {
  const C=useC(); const tr=useTr();
  const [status,setStatus]=useState("idle"); // idle|detecting|done|error|denied
  const [userPos,setUserPos]=useState(null);
  const [sorted,setSorted]=useState([]);
  const [filter,setFilter]=useState("all");
  const { providers: ctxProviders } = useLiveData();
  const provData = ctxProviders.map(toUiProv);

  const detect=()=>{
    if(!navigator.geolocation){setStatus("error");return;}
    setStatus("detecting");
    navigator.geolocation.getCurrentPosition(
      pos=>{
        const {latitude:lat,longitude:lng}=pos.coords;
        setUserPos({lat,lng});
        const withDist=provData.map(p=>({...p,dist:haversine(lat,lng,p.lat||23.8,p.lng||90.4)}))
          .sort((a,b)=>a.dist-b.dist);
        setSorted(withDist); setStatus("done");
      },
      err=>{setStatus(err.code===1?"denied":"error");},
      {enableHighAccuracy:true,timeout:10000}
    );
  };

  const fmtDist=d=>{
    if(d<1) return `${Math.round(d*1000)} ${tr.gpsM}`;
    return `${d.toFixed(1)} ${tr.gpsKm}`;
  };

  const svcs=[...new Set(provData.map(p=>p.svcEn))];
  const list=filter==="all"?sorted:sorted.filter(p=>p.svcEn===filter);

  return (
    <div>
      {/* Header */}
      <div style={{background:`linear-gradient(135deg,${C.p},${C.pdk})`,borderRadius:18,padding:"22px 20px 20px",marginBottom:22,color:"#fff",position:"relative",overflow:"hidden"}}>
        <div style={{fontSize:22,fontWeight:800,marginBottom:4}}>{tr.gpsTitle}</div>
        <div style={{fontSize:13,opacity:.85,marginBottom:16}}>আপনার কাছের সেরা প্রদানকারী খুঁজুন</div>
        {status==="idle"&&(
          <button onClick={detect} style={{background:"#fff",color:C.pdk,border:"none",borderRadius:12,padding:"10px 20px",fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif",display:"flex",alignItems:"center",gap:7}}>
            <span>📍</span>{tr.gpsDetect}
          </button>
        )}
        {status==="detecting"&&(
          <div style={{display:"flex",alignItems:"center",gap:10,background:"rgba(255,255,255,.18)",borderRadius:12,padding:"10px 16px",fontSize:14,fontWeight:600}}>
            <span style={{animation:"pulse 1s infinite"}}>📡</span> {tr.gpsDetecting}
          </div>
        )}
        {(status==="done"||status==="error"||status==="denied")&&(
          <button onClick={detect} style={{background:"rgba(255,255,255,.2)",color:"#fff",border:"1.5px solid rgba(255,255,255,.5)",borderRadius:12,padding:"8px 16px",fontWeight:600,fontSize:13,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif"}}>
            🔄 {tr.gpsDetect}
          </button>
        )}
        <div style={{position:"absolute",right:-18,top:-18,width:90,height:90,borderRadius:"50%",background:"rgba(255,255,255,.08)"}}/>
        <div style={{position:"absolute",right:24,bottom:-30,width:70,height:70,borderRadius:"50%",background:"rgba(255,255,255,.06)"}}/>
      </div>

      {/* Error states */}
      {status==="denied"&&(
        <div style={{background:"#FFF3CD",border:"1px solid #FFC107",borderRadius:12,padding:"14px 16px",marginBottom:16,fontSize:13,color:"#856404",display:"flex",alignItems:"center",gap:9}}>
          🔒 {tr.gpsPermDenied}
        </div>
      )}
      {status==="error"&&(
        <div style={{background:"#FEE2E2",border:"1px solid #FCA5A5",borderRadius:12,padding:"14px 16px",marginBottom:16,fontSize:13,color:"#991B1B",display:"flex",alignItems:"center",gap:9}}>
          ⚠️ {tr.gpsError}
        </div>
      )}

      {/* User location badge */}
      {userPos&&(
        <div style={{display:"flex",alignItems:"center",gap:8,background:C.plt,borderRadius:12,padding:"10px 16px",marginBottom:16,fontSize:13,color:C.pdk,fontWeight:600}}>
          📍 {userPos.lat.toFixed(4)}°N, {userPos.lng.toFixed(4)}°E
        </div>
      )}

      {/* Filter chips */}
      {status==="done"&&(
        <div className="sx" style={{display:"flex",gap:8,marginBottom:18,paddingBottom:2}}>
          {["all",...svcs].map(s=>(
            <button key={s} onClick={()=>setFilter(s)} style={{flexShrink:0,padding:"6px 14px",borderRadius:20,border:`1.5px solid ${filter===s?C.p:C.bdr}`,background:filter===s?C.p:C.card,color:filter===s?"#fff":C.sub,fontSize:12,cursor:"pointer",fontWeight:600,fontFamily:"'Hind Siliguri',sans-serif",transition:"all .15s"}}>
              {s==="all"?tr.gpsAll:s}
            </button>
          ))}
        </div>
      )}

      {/* Sorted provider list */}
      {status==="done"&&list.length===0&&(
        <div style={{textAlign:"center",padding:"40px 20px",color:C.muted,fontSize:14}}>কোনো প্রদানকারী পাওয়া যায়নি।</div>
      )}
      {status==="done"&&(
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {list.map((p,i)=>(
            <div key={p.id} className="fu" style={{position:"relative",animationDelay:`${i*.07}s`}}>
              <PCard p={p} onBook={onBook} onView={onView}/>
              <div style={{position:"absolute",top:12,left:12,background:C.p,color:"#fff",borderRadius:10,padding:"3px 10px",fontSize:11,fontWeight:700,display:"flex",alignItems:"center",gap:4,pointerEvents:"none"}}>
                {i===0?"🥇":"📍"} {fmtDist(p.dist)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Idle CTA */}
      {status==="idle"&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14}}>
          {provData.map((p,i)=><PCard key={p.id} p={p} delay={i*.07} onBook={onBook} onView={onView}/>)}
        </div>
      )}
    </div>
  );
}

/* ─── Live Chat ──────────────────────────────────────── */
function LiveChatPage({provider, onBack}) {
  const C=useC(); const tr=useTr(); const lang=useContext(LangCtx)===T.en?"en":"bn";
  const roomId = `provider_${provider.id||provider.phone||"general"}`;
  const initMsgs=[
    {id:1,from:"provider",text:tr.lcAuto1,time:"10:02 AM"},
  ];
  const [msgs,setMsgs]=useState(initMsgs);
  const [inp,setInp]=useState("");
  const [typing,setTyping]=useState(false);
  const [online]=useState(true);
  const [typingName,setTypingName]=useState(null);
  const endRef=useRef(null);
  const autoReplies=[tr.lcAuto2,tr.lcAuto3];
  const [autoIdx,setAutoIdx]=useState(0);
  const suggestions=[tr.lcSuggest1,tr.lcSuggest2,tr.lcSuggest3,tr.lcSuggest4];
  const { joinRoom, leaveRoom, on } = useSocket(getToken());

  // Real-time socket.io: join room, load history, listen for events
  useEffect(()=>{
    joinRoom(roomId);
    // Load message history once
    chatApi.getMessages(roomId,0).then(r=>{
      if(r?.messages?.length){
        const hist=r.messages.map(m=>({
          id:m.id,
          from:m.sender_role==="provider"?"provider":"user",
          text:m.message,
          time:new Date(m.created_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),
        }));
        setMsgs(prev=>{
          const ids=new Set(prev.map(x=>x.id));
          const fresh=hist.filter(m=>!ids.has(m.id));
          return fresh.length?[...prev,...fresh]:prev;
        });
      }
    }).catch(()=>{});

    const offMsg=on("new_message",msg=>{
      const newM={
        id:msg.id||Date.now(),
        from:msg.sender_role==="provider"?"provider":"user",
        text:msg.message,
        time:new Date(msg.created_at||Date.now()).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),
      };
      setMsgs(prev=>prev.find(m=>m.id===newM.id)?prev:[...prev,newM]);
    });
    const offTyping=on("user_typing",({name})=>setTypingName(name||tr.lcTyping||"…"));
    const offStop=on("user_stop_typing",()=>setTypingName(null));
    const offTyping2=on("typing",({name})=>setTypingName(name||tr.lcTyping||"…"));
    const offStop2=on("stop_typing",()=>setTypingName(null));

    return ()=>{
      leaveRoom(roomId);
      offMsg(); offTyping(); offStop(); offTyping2(); offStop2();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[roomId]);

  useEffect(()=>{ endRef.current?.scrollIntoView({behavior:"smooth"}); },[msgs,typing]);

  const sendMsg=async(text)=>{
    if(!text.trim()) return;
    const now=new Date();
    const timeStr=now.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
    const optimistic={id:Date.now(),from:"user",text:text.trim(),time:timeStr};
    setMsgs(m=>[...m,optimistic]); setInp("");
    // Try real API first; fallback to auto-reply on error
    try{
      await chatApi.send(roomId, text.trim());
    }catch(_){
      // fallback: show auto-reply
      setTyping(true);
      setTimeout(()=>{
        setTyping(false);
        const reply=autoReplies[autoIdx%autoReplies.length];
        setMsgs(m=>[...m,{id:Date.now()+1,from:"provider",text:reply,time:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}]);
        setAutoIdx(i=>i+1);
      },1400);
    }
  };

  const pName=lang==="en"?provider.nameEn:provider.name;
  const avatar=provider.avatar||provider.name[0];
  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",maxHeight:"100vh",background:C.bg,fontFamily:"'Hind Siliguri',sans-serif"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:12,padding:"14px 18px",background:C.card,borderBottom:`1px solid ${C.bdr}`,position:"sticky",top:0,zIndex:50}}>
        <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",fontSize:22,color:C.p,padding:"0 6px 0 0",lineHeight:1}}>←</button>
        <div style={{width:42,height:42,borderRadius:"50%",background:`linear-gradient(135deg,${C.p},${C.pdk})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:700,color:"#fff",flexShrink:0}}>
          {typeof avatar==="string"&&avatar.length===1?avatar:"👤"}
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:700,fontSize:15,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{pName}</div>
          <div style={{fontSize:12,color:typingName?C.p:online?C.p:C.muted,fontStyle:typingName?"italic":"normal"}}>
            {typingName?`${typingName} typing...`:online?tr.lcOnline:tr.lcOffline||"Offline"}
          </div>
        </div>
        <div style={{fontSize:11,color:C.muted}}>{tr.lcTitle}</div>
      </div>

      {/* Messages */}
      <div style={{flex:1,overflowY:"auto",padding:"16px 14px",display:"flex",flexDirection:"column",gap:10}}>
        <div style={{textAlign:"center",fontSize:11,color:C.muted,marginBottom:4}}>{tr.lcToday}</div>
        {msgs.map(m=>{
          const isUser=m.from==="user";
          return (
            <div key={m.id} style={{display:"flex",justifyContent:isUser?"flex-end":"flex-start",alignItems:"flex-end",gap:7}}>
              {!isUser&&<div style={{width:30,height:30,borderRadius:"50%",background:`linear-gradient(135deg,${C.p},${C.pdk})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"#fff",flexShrink:0}}>
                {typeof avatar==="string"&&avatar.length===1?avatar:"👤"}
              </div>}
              <div style={{maxWidth:"70%",background:isUser?C.p:C.card,color:isUser?"#fff":C.text,borderRadius:isUser?"18px 4px 18px 18px":"4px 18px 18px 18px",padding:"10px 14px",fontSize:14,lineHeight:1.5,boxShadow:`0 1px 4px ${C.bdr}`,wordBreak:"break-word"}}>
                {m.text}
                <div style={{fontSize:10,opacity:.65,marginTop:4,textAlign:isUser?"right":"left"}}>{m.time}</div>
              </div>
              {isUser&&<div style={{width:28,height:28,borderRadius:"50%",background:"#5B8AF0",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:"#fff",flexShrink:0}}>👤</div>}
            </div>
          );
        })}
        {typing&&(
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:30,height:30,borderRadius:"50%",background:`linear-gradient(135deg,${C.p},${C.pdk})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"#fff"}}>
              {typeof avatar==="string"&&avatar.length===1?avatar:"👤"}
            </div>
            <div style={{background:C.card,borderRadius:"4px 18px 18px 18px",padding:"10px 18px",display:"flex",gap:5,alignItems:"center",boxShadow:`0 1px 4px ${C.bdr}`}}>
              {[0,1,2].map(i=><span key={i} style={{width:7,height:7,borderRadius:"50%",background:C.muted,display:"inline-block",animation:`bounce 1.2s ${i*0.2}s infinite`}}/>)}
            </div>
          </div>
        )}
        <div ref={endRef}/>
      </div>

      {/* Suggestions */}
      <div style={{display:"flex",gap:7,padding:"6px 14px",overflowX:"auto",background:C.bg,scrollbarWidth:"none"}}>
        {suggestions.map((s,i)=>(
          <button key={i} onClick={()=>sendMsg(s)} style={{flexShrink:0,padding:"6px 14px",borderRadius:20,border:`1px solid ${C.p}`,background:C.card,color:C.p,fontSize:12,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif",fontWeight:600}}>{s}</button>
        ))}
      </div>

      {/* Input */}
      <div style={{display:"flex",gap:9,padding:"10px 14px 18px",background:C.card,borderTop:`1px solid ${C.bdr}`}}>
        <input value={inp} onChange={e=>setInp(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendMsg(inp)}
          placeholder={tr.lcPh} style={{flex:1,border:`1.5px solid ${C.bdr}`,borderRadius:24,padding:"10px 16px",fontSize:14,background:C.bg,color:C.text,outline:"none",fontFamily:"'Hind Siliguri',sans-serif"}}/>
        <button onClick={()=>sendMsg(inp)} disabled={!inp.trim()} style={{width:44,height:44,borderRadius:"50%",background:inp.trim()?C.p:"#ccc",border:"none",cursor:inp.trim()?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0,transition:"background .2s"}}>
          ➤
        </button>
      </div>
    </div>
  );
}
/* ══════════════════════════════════════════════════════════
   MAIN APP
══════════════════════════════════════════════════════════ */
/* ── Browser Push Notification helper ── */
function showBrowserNotif(title,body){
  if(typeof Notification==="undefined"||Notification.permission!=="granted") return;
  try{
    if(navigator.serviceWorker?.controller){
      navigator.serviceWorker.ready.then(r=>r.showNotification(title,{body,icon:"/icons/icon-192.png",badge:"/icons/icon-192.png",vibrate:[100,50,100]})).catch(()=>new Notification(title,{body}));
    } else { new Notification(title,{body}); }
  }catch{}
}

export default function IMAP() {
  const [page,setPage]        = useState("home");
  const [booking,setBooking]  = useState(null);
  const [detail,setDetail]    = useState(null);
  const [rateFor,setRateFor]  = useState(null);
  const [modal,setModal]      = useState(null);
  const [notifDrop,setNotifDrop] = useState(false);
  const [profDrop,setProfDrop]   = useState(false);
  const [emg,setEmg]          = useState(false);
  const [emgCnt,setEmgCnt]    = useState(null);
  const [emgSvc,setEmgSvc]    = useState(null);
  const [elderly,setElderly]  = useState(false);
  const [tracking,setTracking]= useState(false);
  const [lang,setLang]        = useState("bn");
  const [dark,setDark]        = useState(false);
  const [onboard,setOnboard]  = useState(()=>!localStorage.getItem("imap_ob"));
  const [favs,setFavs]        = useState(()=>JSON.parse(localStorage.getItem("imap_favs")||"[]"));
  const [chatWith,setChatWith] = useState(null);
  const [anim,setAnim]        = useState(false);
  const [showKyc,setShowKyc]  = useState(false);
  const [isMobile,setIsMobile]= useState(false);
  const [svcCat,setSvcCat]    = useState(null); // selected service category filter
  const [svcSearch,setSvcSearch] = useState(""); // service page search query

  // ── AUTH STATE ──
  const [authUser,setAuthUser] = useState(()=>{
    try{ return JSON.parse(localStorage.getItem("imap_user")||"null"); }
    catch{ localStorage.removeItem("imap_user"); return null; }
  });

  const [showLanding, setShowLanding] = useState(()=>!localStorage.getItem("imap_user"));
  const [showSos,     setShowSos]     = useState(false);
  const [sosType,     setSosType]     = useState("");
  const [sosDesc,     setSosDesc]     = useState("");
  const [sosLoading,  setSosLoading]  = useState(false);
  const [sosDone,     setSosDone]     = useState(false);
  // ── PAYMENT STATE ──
  const [showPayment,     setShowPayment]     = useState(false);
  const [payBookingId,    setPayBookingId]    = useState(null);
  const [payLoading,      setPayLoading]      = useState(false);
  const [payResult,       setPayResult]       = useState(null);
  const [payResultTranId, setPayResultTranId] = useState(null);

  // ── LIVE DATA STATE (falls back to static constants until API responds) ──
  const [liveProviders, setLiveProviders] = useState(PROVIDERS);
  const [liveBookings,  setLiveBookings]  = useState(MY_BOOKINGS);
  const [walletBalance, setWalletBalance] = useState(1545);

  // ── NOTIFICATION STATE (real-time polling) ──
  const [unreadCount,  setUnreadCount]  = useState(0);
  const [liveNotifs,   setLiveNotifs]   = useState(NOTIFS_DATA);

  const doLogin  = u  => { localStorage.setItem("imap_user",JSON.stringify(u)); localStorage.setItem("imap_ob","1"); setOnboard(false); setAuthUser(u); setShowLanding(false); };
  const doLogout = () => { localStorage.removeItem("imap_user"); localStorage.removeItem("imap_token"); setAuthUser(null); setShowLanding(true); };

  // Auto-logout when any authenticated API call returns 401 (expired/invalid token)
  // Using custom event avoids a window.location.reload() loop
  useEffect(()=>{
    const handler = () => doLogout();
    window.addEventListener("imap-unauthorized", handler);
    return () => window.removeEventListener("imap-unauthorized", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // ── VOICE COMMAND HANDLER ──
  const handleVoiceCommand = useCallback(({ transcript, match }) => {
    if (!match) return;
    if (match.action === "emergency") {
      setEmg(true);
      return;
    }
    if (match.action === "logout") {
      doLogout();
      return;
    }
    if (match.page) {
      setPage(match.page);
      setDetail(null);
      setBooking(null);
    }
  }, []);

  // ── ALL EFFECTS (must be before any conditional returns) ──
  useEffect(()=>{
    if(typeof window.hideSplash==="function") window.hideSplash();
    setTimeout(()=>setAnim(true),80);
    const check=()=>setIsMobile(window.innerWidth<=640);
    check(); window.addEventListener("resize",check);
    // Service worker is registered in index.html (with correct %BASE_URL% path)
    // Handle SSLCommerz payment redirect
    const params=new URLSearchParams(window.location.search);
    const payStatus=params.get("payment");
    const tranId=params.get("tran_id");
    if(payStatus&&["success","failed","cancelled"].includes(payStatus)){
      setPayResult(payStatus);
      setPayResultTranId(tranId);
      setShowPayment(true);
      window.history.replaceState({},"",window.location.pathname+window.location.hash);
    }
    return()=>window.removeEventListener("resize",check);
  },[])

  useEffect(()=>{
    if(emgCnt!==null&&emgCnt>0){
      const t=setTimeout(()=>setEmgCnt(c=>c-1),1000);
      return()=>clearTimeout(t);
    }
  },[emgCnt]);

  useEffect(()=>{
    // Pre-load public providers list even before login (endpoint is public)
    providersApi.list().then(d=>{if(d.providers?.length)setLiveProviders(d.providers);}).catch(()=>{});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  useEffect(()=>{
    if(!authUser) return;
    bookingsApi.list().then(d=>{if(d.bookings?.length)setLiveBookings(d.bookings);}).catch(()=>{});
    usersApi.getWallet().then(d=>{if(d.balance!=null)setWalletBalance(d.balance);}).catch(()=>{});
    // Request browser notification permission
    if("Notification" in window && Notification.permission==="default"){
      setTimeout(()=>Notification.requestPermission().catch(()=>{}),3000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[authUser?.id]);

  // ── NOTIFICATION POLLING (every 30s) ──
  useEffect(()=>{
    if(!authUser) return;
    const fetchNotifs=()=>{
      usersApi.getNotifications().then(d=>{
        if(d?.notifications?.length){
          setLiveNotifs(d.notifications.map(n=>({
            id:n.id, icon:n.icon||"🔔",
            t:n.title_bn||n.title||"", tEn:n.title_en||n.title||"",
            m:n.body_bn||n.body||"",   mEn:n.body_en||n.body||"",
            time:n.created_at||"", timeEn:n.created_at||"",
            unread:!n.is_read, type:n.type||"info",
          })));
          const cnt=d.notifications.filter(n=>!n.is_read).length;
          setUnreadCount(cnt);
        }
      }).catch(()=>{});
    };
    fetchNotifs();
    const id=setInterval(fetchNotifs,30000);
    return()=>clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[authUser?.id]);

  // ── SOCKET booking-status notifications ──
  const { on: onSocketEvent } = useSocket(getToken());
  useEffect(()=>{
    if(!authUser) return;
    const off=onSocketEvent("booking_updated",data=>{
      showBrowserNotif("IMAP বুকিং আপডেট 📋",data?.message||"আপনার বুকিংয়ে পরিবর্তন হয়েছে");
    });
    return off;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[authUser?.id]);

  // ── Show browser notif for new unread notifications ──
  const prevUnreadRef = useRef(0);
  useEffect(()=>{
    if(unreadCount > prevUnreadRef.current && liveNotifs.length>0 && document.hidden){
      const n=liveNotifs.find(x=>x.unread);
      if(n) showBrowserNotif(n.t||n.tEn||"IMAP নোটিফিকেশন 🔔", n.m||n.mEn||"নতুন বার্তা");
    }
    prevUnreadRef.current=unreadCount;
  },[unreadCount]);

  // ── AUTO MARK-READ WHEN NOTIFS PAGE IS OPEN ──
  useEffect(()=>{
    if(page==="notifs" && unreadCount>0){
      setUnreadCount(0);
      setLiveNotifs(n=>n.map(x=>({...x,unread:false})));
      usersApi.markNotifRead().catch(()=>{});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[page]);

  const refreshBookings = ()=>bookingsApi.list().then(d=>{if(d.bookings?.length)setLiveBookings(d.bookings);}).catch(()=>{});

  // ── ROLE-BASED ROUTING ──
  if(!authUser && showLanding) return <LandingPage dark={dark} setDark={setDark} lang={lang} setLang={setLang}
    onGetStarted={()=>setShowLanding(false)}
    onRegisterProvider={()=>setShowLanding(false)}/>;
  if(!authUser) return <AuthPage onAuth={doLogin} dark={dark} setDark={setDark} lang={lang} setLang={setLang}
    onBack={()=>setShowLanding(true)}/>;
  if(authUser.role==="admin") return <AdminPanel user={authUser} onLogout={doLogout} dark={dark} setDark={setDark} lang={lang} setLang={setLang}/>;
  if(authUser.role==="provider") return <ProviderPortal user={authUser} onLogout={doLogout} dark={dark} setDark={setDark} lang={lang} setLang={setLang}/>;
  if(showKyc) return <KYCPage user={authUser} onClose={()=>setShowKyc(false)} dark={dark} lang={lang} onUpdate={u=>{setAuthUser(u);localStorage.setItem("imap_user",JSON.stringify(u));}}/>;

  const tr = T[lang];
  const C  = dark ? C_DARK : C_LIGHT;

  const goBook = p=>{ setDetail(null); setModal(null); setBooking(p); };
  const closeAll = ()=>{ setNotifDrop(false); setProfDrop(false); };
  const toggleFav = id=>{ const next=favs.includes(id)?favs.filter(x=>x!==id):[...favs,id]; setFavs(next); localStorage.setItem("imap_favs",JSON.stringify(next)); };

  /* ── EMERGENCY MODAL ── */
  const EmgModal = ()=>(
    <div className="ov" onClick={()=>{setEmg(false);setEmgSvc(null);}}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:400,padding:28,textAlign:"center"}}>
        <div style={{fontSize:60,marginBottom:14,animation:"pulse 1s infinite"}}>🚨</div>
        <div style={{fontSize:20,fontWeight:700,color:C.red}}>{tr.emgTitle}</div>
        <div style={{fontSize:13,color:C.muted,marginTop:6}}>{tr.emgSub}</div>
        {emgCnt>0?(
          <div style={{margin:"20px 0"}}>
            <div style={{fontSize:56,fontWeight:700,color:C.red,lineHeight:1,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{emgCnt}</div>
            <div style={{fontSize:13,color:C.muted,marginBottom:10}}>{tr.emgConnecting}</div>
            <PBar v={((5-emgCnt)/5)*100} col={C.red}/>
          </div>
        ):(
          <div style={{background:"#FFF5F5",borderRadius:12,padding:14,margin:"16px 0",border:"1px solid #FED7D7"}}>
            <div style={{fontSize:14,fontWeight:600,color:C.red}}>{tr.emgConnected}</div>
          </div>
        )}
        <div className="g2" style={{marginBottom:12,gap:8}}>
          {(lang==="en"?["🏥 Ambulance","💊 Nurse","🩺 Doctor","🩸 Blood Donor"]:["🏥 অ্যাম্বুলেন্স","💊 নার্স","🩺 ডাক্তার","🩸 রক্তদাতা"]).map(item=>(
            <button key={item} onClick={()=>setEmgSvc(item)}
              style={{padding:"11px 6px",background:emgSvc===item?"#DC2626":"#FFF5F5",border:`2px solid ${emgSvc===item?"#DC2626":"#FED7D7"}`,borderRadius:10,fontSize:12,cursor:"pointer",color:emgSvc===item?"#fff":C.red,fontWeight:700,fontFamily:"'Hind Siliguri',sans-serif",transition:"all .15s"}}>{emgSvc===item?"✓ ":""}{item}</button>
          ))}
        </div>
        {emgSvc&&(
          <div style={{background:"#FFF5F5",borderRadius:10,padding:"10px 14px",marginBottom:12,fontSize:13,color:C.red,fontWeight:600,border:"1px solid #FED7D7"}}>✅ {lang==="en"?`Requesting ${emgSvc}...`:`${emgSvc} অনুরোধ পাঠানো হচ্ছে...`}</div>
        )}
        <button className="btn btn-gh" style={{width:"100%",border:`1px solid ${C.bdr}`}} onClick={()=>{setEmg(false);setEmgSvc(null);}}>{tr.emgCancel}</button>
      </div>
    </div>
  );

  /* ── NAVBAR ── */
  const Nav = ()=>(
    <nav style={{background:C.card,borderBottom:`1px solid ${C.bdr}`,position:"sticky",top:0,zIndex:600,boxShadow:"0 1px 12px rgba(0,0,0,.05)"}}>
      <div className="wp row" style={{height:62,gap:18}}>
        {/* Logo */}
        <div className="row" style={{gap:8,cursor:"pointer",flexShrink:0}} onClick={()=>{setPage("home");closeAll();}}>
          <div className="jc" style={{width:36,height:36,borderRadius:11,background:`linear-gradient(135deg,${C.p},${C.pdk})`,fontSize:17}}>🌿</div>
          <div>
            <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:19,fontWeight:800,color:C.p,lineHeight:1}}>IMAP</div>
            <div style={{fontSize:9,color:C.muted,letterSpacing:1.5,textTransform:"uppercase"}}>AI Powered Service Platform</div>
          </div>
        </div>
        {/* Search bar (desktop) */}
        <div className="nsearch" style={{flex:1,maxWidth:440,position:"relative"}}>
          <div style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:14,color:C.muted}}>🔍</div>
          <input placeholder={tr.search} readOnly onClick={()=>setModal("search")} style={{width:"100%",padding:"10px 14px 10px 38px",border:`1.5px solid ${C.bdr}`,borderRadius:11,fontSize:13,color:C.text,background:C.bg,cursor:"pointer"}} onFocus={e=>e.target.style.borderColor=C.p} onBlur={e=>e.target.style.borderColor=C.bdr}/>
        </div>
        {/* Desktop nav links — শুধু মূল পেজগুলো */}
        <div className="dnav row" style={{gap:2,flexShrink:0}}>
          {[["home",tr.home],["services",tr.services],["providers",tr.providers],["nearby",lang==="bn"?"নিকটে":"Nearby"],["how",tr.how]].map(([id,l])=>(
            <button key={id} className={`nv${page===id?" act":""}`} onClick={()=>{setPage(id);closeAll();}}>{l}</button>
          ))}
        </div>
        {/* Right controls */}
        <div className="row" style={{marginLeft:"auto",gap:8}}>
          {/* Language selector */}
          <LangSelector lang={lang} setLang={setLang} C={C}/>
          {/* Dark mode toggle */}
          <button onClick={()=>setDark(d=>!d)} title={dark?tr.lightMode:tr.darkMode} style={{width:36,height:36,border:`1px solid ${C.bdr}`,borderRadius:9,background:dark?"#1A3D2E":C.bg,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,transition:"all .2s"}}>{dark?"☀️":"🌙"}</button>
          {/* Icon buttons (desktop) */}
          {[["👴",tr.elderlyMode,()=>setElderly(true)],["🗺️",tr.map,()=>setModal("map")],["🔍",tr.find,()=>setModal("search")]].map(([ic,title,fn])=>(
            <button key={title} title={title} className="htab" onClick={fn} style={{width:36,height:36,border:`1px solid ${C.bdr}`,borderRadius:9,background:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,transition:"all .15s"}} onMouseEnter={e=>e.currentTarget.style.background=C.plt} onMouseLeave={e=>e.currentTarget.style.background="#fff"}>{ic}</button>
          ))}
          {/* Notification bell */}
          <div style={{position:"relative"}}>
            <button onClick={()=>{setNotifDrop(o=>!o);setProfDrop(false);}} style={{width:36,height:36,border:`1px solid ${C.bdr}`,borderRadius:9,background:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,position:"relative",transition:"all .15s"}} onMouseEnter={e=>e.currentTarget.style.background=C.plt} onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
              🔔
              {unreadCount>0&&<div className="jc" style={{position:"absolute",top:5,right:5,width:12,height:12,background:C.red,borderRadius:"50%",fontSize:8,color:"#fff",fontWeight:700}}>{unreadCount>9?"9+":unreadCount}</div>}
            </button>
            {notifDrop&&(
              <div style={{position:"absolute",right:0,top:44,width:310,background:C.card,borderRadius:16,boxShadow:"0 10px 40px rgba(0,0,0,.13)",border:`1px solid ${C.bdr}`,zIndex:700,overflow:"hidden",animation:"fadeUp .2s ease"}}
>
                <div className="row" style={{padding:"12px 15px",borderBottom:`1px solid ${C.bdr}`,justifyContent:"space-between"}}>
                  <div style={{fontSize:14,fontWeight:700}}>🔔 {tr.notifications}</div>
                  <button className="btn btn-gh" style={{fontSize:12,color:C.p}} onClick={()=>{setPage("notifs");setNotifDrop(false);}}>{tr.seeAll}</button>
                </div>
                {liveNotifs.slice(0,4).map((n,i)=>(
                  <div key={i} style={{padding:"10px 15px",borderBottom:i<3?`1px solid ${C.bdr}`:"none",background:n.unread?`${C.p}06`:"#fff",cursor:"pointer",transition:"background .12s"}} onMouseEnter={e=>e.currentTarget.style.background=C.bg} onMouseLeave={e=>e.currentTarget.style.background=n.unread?`${C.p}06`:"#fff"}>
                    <div className="row" style={{gap:9}}>
                      <div className="jc" style={{width:34,height:34,borderRadius:9,background:C.plt,fontSize:14,flexShrink:0}}>{n.icon}</div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:700}}>{lang==="en"?n.tEn:n.t}</div>
                        <div style={{fontSize:11,color:C.muted,marginTop:1}}>{lang==="en"?n.mEn:n.m}</div>
                      </div>
                      {n.unread&&<div style={{width:7,height:7,borderRadius:"50%",background:C.p,flexShrink:0}}/>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Profile */}
          <div style={{position:"relative"}}>
            <div className="jc" style={{width:36,height:36,borderRadius:9,background:`linear-gradient(135deg,${C.p},${C.pdk})`,color:"#fff",fontWeight:700,cursor:"pointer",fontSize:13}} onClick={()=>{setProfDrop(o=>!o);setNotifDrop(false);}}>{authUser?.name?.[0]||"আ"}</div>
            {profDrop&&(
              <div style={{position:"absolute",right:0,top:44,width:232,background:C.card,borderRadius:15,boxShadow:"0 10px 40px rgba(0,0,0,.13)",border:`1px solid ${C.bdr}`,zIndex:700,overflow:"hidden",animation:"fadeUp .2s ease",maxHeight:"80vh",overflowY:"auto"}}>
                {/* প্রোফাইল হেড */}
                <div style={{padding:14,borderBottom:`1px solid ${C.bdr}`,textAlign:"center"}}>
                  <div className="jc" style={{width:44,height:44,borderRadius:11,background:`linear-gradient(135deg,${C.p},${C.pdk})`,color:"#fff",fontWeight:700,fontSize:17,margin:"0 auto 7px"}}>{authUser?.name?.[0]||"আ"}</div>
                  <div style={{fontSize:14,fontWeight:700}}>{authUser?.name||(lang==="en"?"Customer":"গ্রাহক")}</div>
                  <div style={{fontSize:11,color:C.muted,marginTop:2}}>{authUser?.phone||""}</div>
                </div>
                {/* গ্রুপ ১: আমার অ্যাকাউন্ট */}
                {[
                  [`👤 ${lang==="bn"?"আমার প্রোফাইল":"My Profile"}`,"cprofile"],
                  [`📋 ${tr.myBookings}`,"bookings"],
                  [`🔔 ${tr.notifications}`,"notifs"],
                  [`🔖 ${lang==="bn"?"সেভ করা":"Saved"}`,"saved"],
                  [`📅 ${tr.calNav||"Calendar"}`,"calendar"],
                ].map(([item,pg],i)=>(
                  <div key={`acc-${i}`} onClick={()=>{setPage(pg);setProfDrop(false);}} style={{padding:"9px 15px",fontSize:13,cursor:"pointer",transition:"background .12s"}} onMouseEnter={e=>e.currentTarget.style.background=C.bg} onMouseLeave={e=>e.currentTarget.style.background="#fff"}>{item}</div>
                ))}
                {/* গ্রুপ ২: আর্থিক ও বিশেষ সেবা */}
                <div style={{height:1,background:C.bdr,margin:"2px 0"}}/>
                {[
                  [`💸 ${tr.wlNav||"Wallet"}`,"wallet"],
                  [`🎁 ${tr.prNav||"Offers"}`,"promos"],
                  [`🏅 ${lang==="bn"?"পয়েন্ট":"Loyalty Points"}`,"loyalty"],
                  [`🩸 ${tr.bdNav||"Blood Donate"}`,"blood"],
                  [`🌪️ ${tr.dsNav||"Disaster Alerts"}`,"disaster"],
                ].map(([item,pg],i)=>(
                  <div key={`fin-${i}`} onClick={()=>{setPage(pg);setProfDrop(false);}} style={{padding:"9px 15px",fontSize:13,cursor:"pointer",transition:"background .12s"}} onMouseEnter={e=>e.currentTarget.style.background=C.bg} onMouseLeave={e=>e.currentTarget.style.background="#fff"}>{item}</div>
                ))}
                {/* গ্রুপ ৩: যাচাই ও প্রদানকারী */}
                <div style={{height:1,background:C.bdr,margin:"2px 0"}}/>
                {[
                  [`🛡️ ${lang==="bn"?"KYC যাচাই":"KYC Verify"}`,"_kyc"],
                  [`🪪 ${tr.nidVerify}`,"_nid"],
                  [`💹 ${tr.loanScore}`,"_loan"],
                  [`👷 ${tr.dashboard}`,"dashboard"],
                  [`📋 ${lang==="bn"?"প্রদানকারী রেজি.":"Provider Reg."}`,"providerreg"],
                ].map(([item,pg],i)=>(
                  <div key={`vfy-${i}`} onClick={()=>{
                    if(["dashboard","providerreg"].includes(pg))setPage(pg);
                    else if(pg==="_kyc")setShowKyc(true);
                    else if(pg==="_nid")setModal("nid");
                    else if(pg==="_loan")setModal("loan");
                    setProfDrop(false);
                  }} style={{padding:"9px 15px",fontSize:13,cursor:"pointer",transition:"background .12s"}} onMouseEnter={e=>e.currentTarget.style.background=C.bg} onMouseLeave={e=>e.currentTarget.style.background="#fff"}>{item}</div>
                ))}
                {/* ভাষা ও থিম */}
                <div style={{height:1,background:C.bdr,margin:"2px 0"}}/>
                <div style={{padding:"9px 15px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <span style={{fontSize:13,color:C.sub}}>🌐 {lang==="bn"?"ভাষা":"Language"}</span>
                  <button onClick={()=>{setLang(l=>l==="bn"?"en":"bn");setProfDrop(false);}} style={{background:C.plt,color:C.p,border:`1px solid ${C.bdr}`,borderRadius:20,padding:"4px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{lang==="bn"?"EN 🌐":"বাং 🌐"}</button>
                </div>
                <div style={{padding:"9px 15px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <span style={{fontSize:13,color:C.sub}}>{dark?"☀️":"🌙"} {lang==="bn"?"থিম":"Theme"}</span>
                  <button onClick={()=>{setDark(d=>!d);setProfDrop(false);}} style={{background:C.plt,color:C.p,border:`1px solid ${C.bdr}`,borderRadius:20,padding:"4px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{dark?(lang==="bn"?"লাইট":"Light"):(lang==="bn"?"ডার্ক":"Dark")}</button>
                </div>
                {/* গ্রুপ ৪: সিস্টেম */}
                <div style={{height:1,background:C.bdr,margin:"2px 0"}}/>
                {[
                  [`⚙️ ${tr.stNav||"Settings"}`,"settings"],
                  [`👴 ${tr.elderlyMode}`,"_elderly"],
                  [`🚪 ${tr.logout}`,"_logout"],
                ].map(([item,pg],i)=>(
                  <div key={`sys-${i}`} onClick={()=>{
                    if(pg==="settings")setPage(pg);
                    else if(pg==="_elderly")setElderly(true);
                    else if(pg==="_logout")doLogout();
                    setProfDrop(false);
                  }} style={{padding:"9px 15px",fontSize:13,cursor:"pointer",transition:"background .12s",color:pg==="_logout"?C.red:"inherit"}} onMouseEnter={e=>e.currentTarget.style.background=C.bg} onMouseLeave={e=>e.currentTarget.style.background="#fff"}>{item}</div>
                ))}
              </div>
            )}
          </div>
          <button className="btn btn-g dbtn" style={{padding:"9px 16px",fontSize:13,whiteSpace:"nowrap"}} onClick={()=>setPage("services")}>{tr.book}</button>
        </div>
      </div>
    </nav>
  );

  /* ── MOBILE BOTTOM NAV ── */
  const MobNav = ()=>(
    <div className="mnav">
      {[["home","🏠",tr.home],["services","🛠️",tr.services],["nearby","📍",tr.gpsNav||"Nearby"],["saved","🔖",tr.favNav||"Saved"],["_profile","👤",tr.profile]].map(([id,icon,l])=>(
        <button key={id} onClick={()=>{
          if(id==="_map")setModal("map");
          else if(id==="_profile"){setProfDrop(o=>!o);}
          else{setPage(id);closeAll();}
        }} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,background:"none",border:"none",cursor:"pointer",padding:"7px 0",fontFamily:"'Hind Siliguri',sans-serif"}}>
          <div className="jc" style={{width:28,height:28,borderRadius:8,background:page===id?`linear-gradient(135deg,${C.p},${C.pdk})`:"transparent",fontSize:15,transition:"all .18s"}}>{icon}</div>
          <div style={{fontSize:10,fontWeight:600,color:page===id?C.p:C.muted}}>{l}</div>
        </button>
      ))}
    </div>
  );

  /* ── HOME PAGE ── */
  const Home = ()=>(
    <>
      {/* Hero */}
      <section className="hs" style={{background:`linear-gradient(155deg,${C.dark} 0%,#0F3326 55%,#174D38 100%)`,padding:"80px 0 96px",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",right:-80,top:-80,width:500,height:500,borderRadius:"50%",background:`${C.p}0A`,pointerEvents:"none"}}/>
        <div className="wp">
          <div className="hl">
            <div style={{opacity:anim?1:0,transform:anim?"none":"translateY(18px)",transition:"all .7s ease"}}>
              <div className="row" style={{display:"inline-flex",gap:8,background:"rgba(255,255,255,.08)",backdropFilter:"blur(8px)",borderRadius:99,padding:"6px 14px",marginBottom:20,border:"1px solid rgba(255,255,255,.12)"}}>
                {/* Bangladesh Flag Icon */}
                <div style={{width:22,height:15,borderRadius:3,background:"#006A4E",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:"0 1px 4px rgba(0,0,0,.3)"}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:"#F42A41"}}/>
                </div>
                <span style={{fontSize:12,fontWeight:700}}>
                  <span style={{color:"#F42A41"}}>{lang==="bn"?"বাংলাদেশের":"Bangladesh's"}</span>
                  <span style={{color:"#4ADE80"}}>{lang==="bn"?" নম্বর ১ সেবা মার্কেটপ্লেস":" Number 1 Service Marketplace"}</span>
                </span>
              </div>
              <h1 className="hh" style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:50,fontWeight:800,color:"#fff",lineHeight:1.15,marginBottom:16}}>
                {tr.heroTitle}<br/><span style={{color:C.p}}>{tr.heroAccent}</span>
              </h1>
              <p style={{fontSize:15,color:"rgba(255,255,255,.72)",lineHeight:1.75,marginBottom:26,maxWidth:440}}>{tr.heroDesc}</p>
              <div className="hsw row" style={{background:"#fff",borderRadius:14,padding:"7px 7px 7px 16px",gap:7,maxWidth:510,boxShadow:"0 10px 36px rgba(0,0,0,.22)"}}>
                <span style={{fontSize:17}}>🔍</span>
                <input readOnly placeholder={tr.search} style={{flex:1,border:"none",fontSize:13,color:C.text,background:"transparent",padding:"5px 0",cursor:"pointer"}} onClick={()=>setModal("search")}/>
                <button className="btn btn-g" style={{padding:"10px 16px",fontSize:13,borderRadius:10,flexShrink:0}} onClick={()=>setModal("search")}>{tr.find}</button>
              </div>
              <div className="sx" style={{marginTop:14}}>
                <div style={{display:"flex",gap:8,width:"max-content"}}>
                  {(lang==="en"?["⚡ Electrician","🏥 Nurse","📚 Tutor","🧹 Cleaning","🔧 Plumber"]:["⚡ ইলেকট্রিশিয়ান","🏥 নার্স","📚 গৃহশিক্ষক","🧹 পরিষ্কার","🔧 প্লাম্বার"]).map(s=>(
                    <button key={s} onClick={()=>setModal("search")} style={{padding:"6px 12px",background:"rgba(255,255,255,.10)",border:"1px solid rgba(255,255,255,.18)",borderRadius:99,color:"rgba(255,255,255,.9)",fontSize:11,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif",whiteSpace:"nowrap"}}>{s}</button>
                  ))}
                </div>
              </div>
            </div>
            {/* Hero stats (desktop) */}
            <div className="sb" style={{opacity:anim?1:0,transition:"opacity .8s ease .2s"}}>
              {[{ic:"✅",vBn:"৪৮,২৩৫+",vEn:"48,235+",l:tr.statDone,g:"+12%",d:.3},{ic:"🛡️",vBn:"৮,৪৯২",vEn:"8,492",l:tr.statVerified,g:"+8%",d:.4},{ic:"⭐",vBn:"২,১৫,৮৬৩",vEn:"215,863",l:tr.statHappy,g:"+23%",d:.5},{ic:"🗺️",vBn:"৬৪ জেলা",vEn:"64 Districts",l:tr.statNation,g:"100%",d:.6}].map((s,i)=>(
                <div key={i} style={{background:"rgba(255,255,255,.07)",backdropFilter:"blur(12px)",border:"1px solid rgba(255,255,255,.12)",borderRadius:18,padding:20,animation:`fadeUp .5s ease ${s.d}s both`}}>
                  <div style={{fontSize:27,marginBottom:8}}>{s.ic}</div>
                  <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:24,fontWeight:800,color:"#fff"}}>{lang==="en"?s.vEn:s.vBn}</div>
                  <div style={{fontSize:12,color:"rgba(255,255,255,.6)",marginTop:3}}>{s.l}</div>
                  <div style={{fontSize:11,color:C.p,marginTop:7,fontWeight:600}}>{s.g} ↑</div>
                </div>
              ))}
            </div>
          </div>
          {/* Emergency banner */}
          <div className="eb" style={{marginTop:36,background:"rgba(220,38,38,.82)",backdropFilter:"blur(8px)",borderRadius:14,padding:"15px 22px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,border:"1px solid rgba(255,255,255,.14)"}}>
            <div className="row" style={{gap:12}}>
              <span style={{fontSize:26,animation:"pulse 1.5s infinite"}}>🚨</span>
              <div>
                <div style={{fontSize:15,fontWeight:700,color:"#fff"}}>{tr.emergencyQ}</div>
                <div style={{fontSize:12,color:"rgba(255,255,255,.78)"}}>{tr.emergencyDesc}</div>
              </div>
            </div>
            <button className="btn" style={{padding:"11px 22px",background:"#fff",color:C.red,fontSize:13,fontWeight:700,borderRadius:11,whiteSpace:"nowrap",flexShrink:0}} onClick={()=>{setEmg(true);setEmgCnt(5);setEmgSvc(null);}}>🚨 {tr.emergency}</button>
          </div>
        </div>
      </section>

      {/* Ticker */}
      <div style={{background:C.p,padding:"9px 0",overflow:"hidden"}}>
        <div style={{display:"flex",gap:28,width:"max-content",animation:"ticker 22s linear infinite"}}>
          {[...Array(2)].map((_,ri)=>(
            (lang==="en"?["✅ 1,245 services done today","⚡ 342 providers active","⭐ Avg rating 4.8/5","🗺️ Services in 64 districts","💳 bKash · Nagad · Rocket","🛡️ NID verified providers"]:["✅ আজ ১,২৪৫ সেবা সম্পন্ন","⚡ ৩৪২ জন সক্রিয়","⭐ গড় রেটিং ৪.৮/৫","🗺️ ৬৪ জেলায় সেবা","💳 bKash · Nagad · Rocket","🛡️ NID যাচাইকৃত"]).map((t,i)=>(
              <span key={`${ri}-${i}`} style={{fontSize:13,fontWeight:600,color:"#fff",whiteSpace:"nowrap",paddingRight:40}}>{t}</span>
            ))
          ))}
        </div>
      </div>

      {/* How it Works */}
      <section className="sp" style={{background:"#fff"}}>
        <div className="wp">
          <div style={{textAlign:"center",marginBottom:44}}>
            <div style={{display:"inline-flex",gap:6,background:C.plt,borderRadius:99,padding:"6px 16px",marginBottom:12,alignItems:"center"}}>
              <span style={{fontSize:12,fontWeight:600,color:C.p}}>{tr.howBadge}</span>
            </div>
            <div className="sec-h">{tr.howTitle}</div>
            <div className="sec-s">{tr.howSub}</div>
          </div>
          <div className="g3">
            {[{n:"01",ic:"🔍",bg:"#EAF5F0",t:tr.s1t,d:tr.s1d},{n:"02",ic:"📋",bg:"#FEF3C7",t:tr.s2t,d:tr.s2d},{n:"03",ic:"✅",bg:"#EDE9FE",t:tr.s3t,d:tr.s3d}].map((h,i)=>(
              <div key={i} className="card" style={{padding:26,animation:`fadeUp .5s ease ${.2+i*.14}s both`}}>
                <div className="jc" style={{width:52,height:52,borderRadius:15,background:h.bg,fontSize:22,marginBottom:14}}>{h.ic}</div>
                <div style={{fontSize:10,fontWeight:700,color:C.p,letterSpacing:2,marginBottom:5}}>{tr.step} {h.n}</div>
                <div style={{fontSize:17,fontWeight:700,color:C.text,marginBottom:8}}>{h.t}</div>
                <div style={{fontSize:13,color:C.muted,lineHeight:1.75}}>{h.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Live Map preview */}
      <section style={{padding:"48px 0",background:C.bg}}>
        <div className="wp">
          <div className="row" style={{justifyContent:"space-between",marginBottom:24,flexWrap:"wrap",gap:10}}>
            <div><div className="sec-h">🗺️ {tr.mapTitle}</div><div className="sec-s">{tr.mapSub}</div></div>
            <button className="btn btn-o" onClick={()=>setModal("map")}>{tr.mapFull}</button>
          </div>
          <LiveMap tracking={tracking} setTracking={setTracking}/>
        </div>
      </section>

      {/* Service categories */}
      <section className="sp" style={{background:"#fff"}}>
        <div className="wp">
          <div className="row" style={{justifyContent:"space-between",marginBottom:32,flexWrap:"wrap",gap:12}}>
            <div><div className="sec-h">{tr.svcsTitle}</div><div className="sec-s">{tr.svcsSub}</div></div>
            <button className="btn btn-o" onClick={()=>setPage("services")}>{tr.viewAll}</button>
          </div>
          <div className="g6">
            {SVCS.map((s,i)=>(
              <div key={s.id} className="card" onClick={()=>setModal("search")} style={{padding:"18px 8px",textAlign:"center",cursor:"pointer",animation:`fadeUp .4s ease ${.04+i*.03}s both`}}>
                <div className="jc" style={{width:52,height:52,borderRadius:15,background:`${s.col}15`,fontSize:24,margin:"0 auto 10px"}}>{s.icon}</div>
                <div style={{fontSize:12,fontWeight:600,color:C.text,lineHeight:1.3}}>{lang==="en"?s.nameEn:s.name}</div>
                <div style={{fontSize:10,color:C.muted,marginTop:3}}>{s.count} {tr.available}</div>
                <div style={{fontSize:11,color:C.p,marginTop:3,fontWeight:600}}>{s.avg} {tr.startFrom}</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:3,justifyContent:"center",marginTop:7}}>
                  {(lang==="en"?s.subsEn:s.subs)?.slice(0,3).map(sub=>(
                    <span key={sub} style={{fontSize:9,background:`${s.col}18`,color:s.col,borderRadius:99,padding:"2px 6px",fontWeight:600,lineHeight:1.4}}>{sub}</span>
                  ))}
                  {s.subs?.length>3&&<span style={{fontSize:9,color:C.muted,padding:"2px 4px"}}>+{s.subs.length-3}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured providers */}
      <section className="sp" style={{background:C.bg}}>
        <div className="wp">
          <div className="row" style={{justifyContent:"space-between",marginBottom:28,flexWrap:"wrap",gap:12}}>
            <div><div className="sec-h">{tr.topTitle}</div><div className="sec-s">{tr.topSub}</div></div>
            <button className="btn btn-o" onClick={()=>setPage("providers")}>{tr.allProviders}</button>
          </div>
          <div className="g3">
            {liveProviders.map(toUiProv).map((p,i)=><PCard key={p.id} p={p} delay={.08+i*.07} onBook={goBook} onView={setDetail}/>)}
          </div>
        </div>
      </section>

      {/* Why IMAP */}
      <section className="sp" style={{background:`linear-gradient(140deg,${C.dark},#0F3326)`}}>
        <div className="wp">
          <div style={{textAlign:"center",marginBottom:44}}><div className="sec-h" style={{color:"#fff"}}>{tr.whyTitle}</div></div>
          <div className="g4 wg">
            {[{ic:"🛡️",t:tr.w1t,d:tr.w1d},{ic:"🤖",t:tr.w2t,d:tr.w2d},{ic:"💰",t:tr.w3t,d:tr.w3d},{ic:"🔒",t:tr.w4t,d:tr.w4d}].map((f,i)=>(
              <div key={i} style={{textAlign:"center",padding:18,animation:`fadeUp .5s ease ${i*.1}s both`}}>
                <div className="jc" style={{width:58,height:58,borderRadius:16,background:"rgba(255,255,255,.08)",fontSize:26,margin:"0 auto 14px"}}>{f.ic}</div>
                <div style={{fontSize:15,fontWeight:700,color:"#fff",marginBottom:6}}>{f.t}</div>
                <div style={{fontSize:12,color:"rgba(255,255,255,.55)",lineHeight:1.7}}>{f.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="sp" style={{background:C.bg}}>
        <div className="wp">
          <div style={{textAlign:"center",marginBottom:40}}><div className="sec-h">{tr.reviewsTitle}</div></div>
          <div className="g3">
            {(lang==="en"?[
              {av:"A",name:"Ahmed Rahat",loc:"Dhaka",r:5,svc:"Electrician",t:"Amazing service! Rakib came on time."},
              {av:"S",name:"Sumaiya Islam",loc:"Chittagong",r:5,svc:"Nurse",t:"Farzana's service is unmatched. Professional every time."},
              {av:"K",name:"Karim Saheb",loc:"Sylhet",r:5,svc:"Tutor",t:"AI matching really works! My son's exam results improved a lot."},
            ]:[
              {av:"আ",name:"আহমেদ রাহাত",loc:"ঢাকা",r:5,svc:"ইলেকট্রিশিয়ান",t:"অসাধারণ সেবা! রাকিব ভাই সময়মতো এসেছেন।"},
              {av:"স",name:"সুমাইয়া ইসলাম",loc:"চট্টগ্রাম",r:5,svc:"নার্স",t:"ফারজানা আপার সেবা অতুলনীয়।"},
              {av:"ক",name:"করিম সাহেব",loc:"সিলেট",r:5,svc:"গৃহশিক্ষক",t:"AI ম্যাচিং সত্যিই কাজ করে! ছেলের রেজাল্ট ভালো হয়েছে।"},
            ]).map((t,i)=>(
              <div key={i} className="card" style={{padding:22,animation:`fadeUp .5s ease ${i*.11}s both`}}>
                <div style={{display:"flex",gap:2,marginBottom:10}}><Stars r={t.r} size={14}/></div>
                <div style={{fontSize:13,color:C.sub,lineHeight:1.8,marginBottom:14,fontStyle:"italic"}}>"{t.t}"</div>
                <div className="row" style={{justifyContent:"space-between"}}>
                  <div className="row" style={{gap:9}}>
                    <div className="jc" style={{width:36,height:36,borderRadius:9,background:`linear-gradient(135deg,${C.p},${C.pdk})`,color:"#fff",fontWeight:700}}>{t.av}</div>
                    <div><div style={{fontSize:13,fontWeight:700}}>{t.name}</div><div style={{fontSize:11,color:C.muted}}>📍 {t.loc}</div></div>
                  </div>
                  <span className="tag" style={{fontSize:10}}>{t.svc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social impact + live stats */}
      <section className="sp" style={{background:"#fff"}}>
        <div className="wp">
          <div className="g2 sl" style={{gap:44,alignItems:"center"}}>
            <div>
              <div className="sec-h" style={{marginBottom:6}}>{tr.impactTitle}</div>
              <div className="sec-s" style={{marginBottom:20}}>{tr.impactSub}</div>
              {[[tr.si1,tr.si1v,"🩸"],[tr.si2,tr.si2v,"🤝"],[tr.si3,tr.si3v,"🌪️"],[tr.si4,tr.si4v,"💙"]].map(([l,v,ic],i)=>(
                <div key={i} className="row" style={{justifyContent:"space-between",padding:"12px 0",borderBottom:i<3?`1px solid ${C.bdr}`:"none"}}>
                  <div className="row" style={{gap:12}}><div className="jc" style={{width:42,height:42,borderRadius:11,background:C.plt,fontSize:20,flexShrink:0}}>{ic}</div><div style={{fontSize:14,fontWeight:600}}>{l}</div></div>
                  <div style={{fontSize:14,fontWeight:700,color:C.p}}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{background:`linear-gradient(140deg,${C.dark},#0F3326)`,borderRadius:22,padding:28}}>
              <div style={{fontSize:17,fontWeight:700,color:"#fff",marginBottom:18}}>📊 {tr.liveTitle}</div>
              {[[tr.ls1,"১,২৪৫"],[tr.ls2,"৩৪২"],[tr.ls3,`8 ${tr.min}`],[tr.ls4,"৳৩,৪৫,৬৭৮"],[tr.ls5,"৪.৮/৫"]].map(([l,v],i)=>(
                <div key={i} className="row" style={{justifyContent:"space-between",padding:"10px 0",borderBottom:i<4?"1px solid rgba(255,255,255,.08)":"none"}}>
                  <div style={{fontSize:13,color:"rgba(255,255,255,.65)"}}>{l}</div>
                  <div style={{fontSize:14,fontWeight:700,color:"#fff"}}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{padding:"56px 0",background:`linear-gradient(135deg,${C.plt},#fff)`}}>
        <div className="wp" style={{textAlign:"center"}}>
          <div className="sec-h" style={{marginBottom:8}}>{tr.ctaTitle}</div>
          <div className="sec-s" style={{marginBottom:24}}>{tr.ctaSub}</div>
          <div className="row" style={{gap:12,justifyContent:"center",flexWrap:"wrap"}}>
            <button className="btn btn-g" style={{padding:"13px 26px",fontSize:14}} onClick={()=>setPage("services")}>{tr.bookService}</button>
            <button className="btn btn-o" style={{padding:"13px 26px",fontSize:14}} onClick={()=>setPage("dashboard")}>{tr.providerDash}</button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{background:C.dark,padding:"48px 0 26px"}}>
        <div className="wp">
          <div className="fg" style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:36,marginBottom:36}}>
            <div>
              <div className="row" style={{gap:9,marginBottom:14}}>
                <div className="jc" style={{width:34,height:34,borderRadius:10,background:`linear-gradient(135deg,${C.p},${C.pdk})`,fontSize:17}}>🌿</div>
                <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:18,fontWeight:800,color:"#fff"}}>IMAP</div>
              </div>
              <div style={{fontSize:13,color:"rgba(255,255,255,.44)",lineHeight:1.8,maxWidth:260}}>{tr.footerDesc}</div>
              <div className="row" style={{gap:7,marginTop:16}}>
                {["📱 bKash","📱 Nagad","🚀 Rocket"].map(p=><span key={p} style={{padding:"3px 9px",background:"rgba(255,255,255,.07)",borderRadius:7,fontSize:11,color:"rgba(255,255,255,.55)"}}>{p}</span>)}
              </div>
            </div>
            {[[tr.footerServices,[tr.services,"AC","Nurse","Tutor","Cleaning"]],[tr.footerCompany,[tr.footerAbout,tr.footerCareers,tr.footerBlog,tr.footerPartner]],[tr.footerSupport,[tr.footerHelp,tr.footerContact,tr.footerPrivacy,tr.footerJoin]]].map(([title,links],i)=>(
              <div key={i}>
                <div style={{fontSize:13,fontWeight:700,color:"#fff",marginBottom:12}}>{title}</div>
                {links.map(l=><div key={l} style={{fontSize:12,color:"rgba(255,255,255,.4)",marginBottom:9,cursor:"pointer",transition:"color .14s"}} onMouseEnter={e=>e.currentTarget.style.color="rgba(255,255,255,.85)"} onMouseLeave={e=>e.currentTarget.style.color="rgba(255,255,255,.4)"}>{l}</div>)}
              </div>
            ))}
          </div>
          <div className="row" style={{borderTop:"1px solid rgba(255,255,255,.07)",paddingTop:18,justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
            <div style={{fontSize:11,color:"rgba(255,255,255,.3)"}}>{tr.footerCopy}</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,.3)"}}>{tr.footerMade}</div>
          </div>
        </div>
      </footer>
    </>
  );

  /* ── SERVICES PAGE ── */
  const Services = ()=>{
    const provData = liveProviders.map(toUiProv);

    // Filter SVCS by category and search
    const searchLow = svcSearch.toLowerCase();
    const filteredSvcs = SVCS.filter(s=>{
      const matchCat = !svcCat || s.id===svcCat;
      const matchSearch = !svcSearch ||
        s.nameEn.toLowerCase().includes(searchLow) ||
        s.name.includes(svcSearch) ||
        s.subsEn.some(sub=>sub.toLowerCase().includes(searchLow)) ||
        s.subs.some(sub=>sub.includes(svcSearch));
      return matchCat && matchSearch;
    });

    // Smart booking: find best matching provider for a service type
    const bookService = (s, subEn) => {
      const terms = subEn
        ? [subEn.toLowerCase()]
        : [...s.subsEn.map(x=>x.toLowerCase()), s.nameEn.toLowerCase()];
      const matched = provData.filter(p=>{
        const pSvc = (p.svcEn||p.svc||"").toLowerCase();
        return terms.some(t => pSvc.includes(t) || t.includes(pSvc.split(" ")[0]));
      });
      const best = matched.sort((a,b)=>(b.r||0)-(a.r||0))[0] || provData[0] || toUiProv(PROVIDERS[0]);
      goBook({...best});
    };

    return (
    <div style={{padding:"28px 0 80px"}}>
      {/* Header */}
      <div style={{background:`linear-gradient(135deg,${C.p},${C.pdk||"#0D7F5F"})`,borderRadius:18,padding:"22px 20px 20px",marginBottom:20,color:"#fff",position:"relative",overflow:"hidden"}}>
        <div style={{fontSize:22,fontWeight:800,marginBottom:4}}>{lang==="en"?"All Services":"সব সেবা সমূহ"}</div>
        <div style={{fontSize:13,opacity:.85,marginBottom:16}}>{SVCS.reduce((a,s)=>a+s.count,0).toLocaleString()}+ {lang==="en"?"service providers available":"সার্ভিস প্রোভাইডার উপলব্ধ"}</div>
        {/* Search bar */}
        <div style={{position:"relative"}}>
          <input
            value={svcSearch}
            onChange={e=>setSvcSearch(e.target.value)}
            placeholder={lang==="en"?"Search services, e.g. plumber, nurse…":"সেবা খুঁজুন, যেমন প্লাম্বার, নার্স…"}
            style={{width:"100%",padding:"11px 14px 11px 38px",borderRadius:12,border:"none",background:"rgba(255,255,255,.92)",color:"#111",fontSize:13,fontFamily:"'Hind Siliguri',sans-serif",boxSizing:"border-box"}}
          />
          <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:15,pointerEvents:"none"}}>🔍</span>
          {svcSearch&&<span onClick={()=>setSvcSearch("")} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",cursor:"pointer",fontSize:16,color:"#555"}}>✕</span>}
        </div>
        <div style={{position:"absolute",right:-18,top:-18,width:90,height:90,borderRadius:"50%",background:"rgba(255,255,255,.08)"}} />
      </div>

      {/* Category pill filters */}
      <div className="sx" style={{marginBottom:16}}>
        <div style={{display:"flex",gap:7,width:"max-content"}}>
          <button onClick={()=>{setSvcCat(null);setSvcSearch("");}} style={{flexShrink:0,padding:"7px 16px",borderRadius:99,border:`1.5px solid ${!svcCat?C.p:C.bdr}`,background:!svcCat?C.p:C.card,color:!svcCat?"#fff":C.sub,fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",fontFamily:"'Hind Siliguri',sans-serif"}}>
            {tr.allSvcs}
          </button>
          {SVCS.map(s=>(
            <button key={s.id} onClick={()=>{setSvcCat(svcCat===s.id?null:s.id);setSvcSearch("");}} style={{flexShrink:0,padding:"7px 14px",borderRadius:99,border:`1.5px solid ${svcCat===s.id?s.col:C.bdr}`,background:svcCat===s.id?s.col:C.card,color:svcCat===s.id?"#fff":C.sub,fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",fontFamily:"'Hind Siliguri',sans-serif",display:"flex",alignItems:"center",gap:5,transition:"all .15s"}}>
              <span>{s.icon}</span>{lang==="en"?s.nameEn:s.name}
            </button>
          ))}
        </div>
      </div>

      {/* Result count */}
      <div style={{fontSize:14,fontWeight:700,marginBottom:14,color:C.text}}>
        {tr.servicesTitle} ({filteredSvcs.length}{filteredSvcs.length<SVCS.length?` / ${SVCS.length}`:""})
        {(svcSearch||svcCat)&&<button onClick={()=>{setSvcCat(null);setSvcSearch("");}} style={{marginLeft:10,fontSize:11,color:C.p,background:"none",border:`1px solid ${C.p}`,borderRadius:20,padding:"2px 10px",cursor:"pointer",fontWeight:700}}>✕ {lang==="en"?"Clear":"মুছুন"}</button>}
      </div>

      {/* Service cards */}
      {filteredSvcs.length===0
        ? <div style={{textAlign:"center",padding:"60px 20px",color:C.muted}}>
            <div style={{fontSize:48,marginBottom:12}}>🔍</div>
            <div style={{fontSize:15,fontWeight:700}}>{lang==="en"?"No services found":"কোনো সেবা পাওয়া যায়নি"}</div>
            <div style={{fontSize:13,marginTop:6}}>{lang==="en"?"Try a different search term":"অন্য শব্দ দিয়ে খুঁজুন"}</div>
            <button onClick={()=>{setSvcCat(null);setSvcSearch("");}} className="btn btn-g" style={{marginTop:16,padding:"10px 24px"}}>{lang==="en"?"Show all":"সব দেখুন"}</button>
          </div>
        : <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:16}}>
          {filteredSvcs.map((s,i)=>{
            // Count providers matching this service from live data
            const liveCount = provData.filter(p=>
              (p.svcEn||p.svc||"").toLowerCase().includes(s.nameEn.toLowerCase().split(" ")[0].toLowerCase())
            ).length;
            return (
            <div key={s.id} className="card" style={{padding:22,cursor:"pointer",animation:`fadeUp .4s ease ${i*.04}s both`,border:`1.5px solid ${svcCat===s.id?s.col:C.bdr}`,transition:"box-shadow .15s"}}>
              {/* Card header */}
              <div className="row" style={{gap:13,marginBottom:10}}>
                <div className="jc" style={{width:52,height:52,borderRadius:15,background:`${s.col}18`,fontSize:24,flexShrink:0,border:`1.5px solid ${s.col}30`}}>{s.icon}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:15,fontWeight:700,color:C.text}}>{lang==="en"?s.nameEn:s.name}</div>
                  <div style={{fontSize:11,color:C.muted,marginTop:2}}>
                    {liveCount>0
                      ? <span style={{color:"#16A34A",fontWeight:600}}>✓ {liveCount} {lang==="en"?"available":"জন উপলব্ধ"}</span>
                      : <span>{s.count} {tr.available}</span>
                    }
                  </div>
                </div>
                <div className="row" style={{gap:3,flexShrink:0}}><span style={{color:"#F59E0B",fontSize:13}}>★</span><span style={{fontSize:13,fontWeight:700}}>{s.r}</span></div>
              </div>

              {/* Sub-service pills (clickable) */}
              <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:12}}>
                {(lang==="en"?s.subsEn:s.subs)?.slice(0,5).map((sub,si)=>(
                  <span key={sub} onClick={e=>{e.stopPropagation();bookService(s,s.subsEn[si]);}} style={{fontSize:10,background:`${s.col}15`,color:s.col,borderRadius:99,padding:"3px 9px",fontWeight:600,lineHeight:1.4,cursor:"pointer",border:`1px solid ${s.col}30`,transition:"background .1s"}} title={lang==="en"?"Book this sub-service":"এই সেবা বুক করুন"}>
                    {sub}
                  </span>
                ))}
                {(s.subs?.length||0)>5&&<span style={{fontSize:10,color:C.muted,padding:"3px 6px",alignSelf:"center"}}>+{(s.subs?.length||0)-5}</span>}
              </div>

              {/* Price & rating row */}
              <div className="row" style={{justifyContent:"space-between",marginBottom:14}}>
                <div>
                  <div style={{fontSize:10,color:C.muted}}>{tr.startFrom}</div>
                  <div style={{fontSize:18,fontWeight:800,color:s.col}}>{s.avg}</div>
                </div>
                <button onClick={e=>{e.stopPropagation();setSvcCat(s.id);}} style={{fontSize:11,color:s.col,background:`${s.col}12`,border:`1px solid ${s.col}30`,borderRadius:20,padding:"4px 10px",cursor:"pointer",fontWeight:700,fontFamily:"'Hind Siliguri',sans-serif"}}>
                  {lang==="en"?"Filter":"ফিল্টার"} {s.icon}
                </button>
              </div>

              {/* Book Now button */}
              <button className="btn btn-g" style={{width:"100%",padding:"11px",fontWeight:700}} onClick={()=>bookService(s,null)}>
                {tr.bookNow}
              </button>
            </div>
          );
          })}
        </div>
      }
    </div>
    );
  };

  /* ── PROVIDERS PAGE ── */
  const ProvidersPage = ()=>{
    const provData = liveProviders.map(toUiProv);
    return (
    <div style={{padding:"28px 0 80px"}}>
      <div className="row" style={{justifyContent:"space-between",marginBottom:20,flexWrap:"wrap",gap:10}}>
        <div style={{fontSize:18,fontWeight:700}}>{tr.allProviders} ({provData.length}+)</div>
        <div className="row" style={{gap:7}}>
          {[tr.filterBest,tr.filterNew,tr.filterNear].map(f=>(
            <button key={f} className="btn" style={{padding:"7px 13px",borderRadius:99,border:`1.5px solid ${C.bdr}`,background:"#fff",color:C.sub,fontSize:12,fontWeight:600}}>{f}</button>
          ))}
        </div>
      </div>
      <div className="pgrid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:18}}>
        {provData.map((p,i)=><PCard key={p.id} p={p} delay={i*.06} onBook={goBook} onView={setDetail}/>)}
      </div>
    </div>
    );
  };

  /* ── HOW PAGE ── */
  const HowPage = ()=>(
    <div style={{maxWidth:800,margin:"0 auto",padding:"48px 0 80px"}}>
      <div style={{textAlign:"center",marginBottom:44}}>
        <div className="sec-h">{tr.howPageTitle}</div>
        <div className="sec-s">{tr.howPageSub}</div>
      </div>
      {[{n:"1",ic:"🔍",bg:"#EAF5F0",t:tr.s1t,d:tr.s1d},{n:"2",ic:"📋",bg:"#FEF3C7",t:tr.s2t,d:tr.s2d},{n:"3",ic:"✅",bg:"#EDE9FE",t:tr.s3t,d:tr.s3d}].map((h,i)=>(
        <div key={i} className="card" style={{padding:28,marginBottom:16,display:"flex",gap:20,alignItems:"flex-start"}}>
          <div className="jc" style={{width:56,height:56,borderRadius:16,background:h.bg,fontSize:24,flexShrink:0}}>{h.ic}</div>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:C.p,letterSpacing:2,marginBottom:5}}>{tr.step} {h.n}</div>
            <div style={{fontSize:18,fontWeight:700,marginBottom:8}}>{h.t}</div>
            <div style={{fontSize:14,color:C.muted,lineHeight:1.75}}>{h.d}</div>
          </div>
        </div>
      ))}
    </div>
  );

  /* ── ELDERLY MODE ── */
  if(onboard) return (
    <ThemeCtx.Provider value={C}>
    <LangCtx.Provider value={tr}>
      <div><style>{CSS}{dark?CSS_DARK:""}</style>
        <Onboarding onDone={()=>{localStorage.setItem("imap_ob","1");setOnboard(false);}}/>
      </div>
    </LangCtx.Provider>
    </ThemeCtx.Provider>
  );

  /* ── ELDERLY MODE ── */
  if(elderly) return (
    <ThemeCtx.Provider value={C}>
    <LangCtx.Provider value={tr}>
      <div><style>{CSS}{dark?CSS_DARK:""}</style>
        <ElderlyMode onExit={()=>setElderly(false)} onBook={goBook} onEmergency={()=>{setEmg(true);setEmgCnt(5);setEmgSvc(null);}}/>
        {booking&&<div className="ov" onClick={()=>setBooking(null)}><div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:480}}><BookModal p={booking} onClose={()=>setBooking(null)}/></div></div>}
        {emg&&<EmgModal/>}
      </div>
    </LangCtx.Provider>
    </ThemeCtx.Provider>
  );

  /* ── MAIN RENDER ── */
  return (
    <ThemeCtx.Provider value={C}>
    <UserCtx.Provider value={{user:authUser}}>
    <LiveDataCtx.Provider value={{providers:liveProviders,bookings:liveBookings,balance:walletBalance,setBalance:setWalletBalance,refreshBookings}}>
    <FavsCtx.Provider value={{favs,toggleFav}}>
    <LangCtx.Provider value={tr}>
      <div style={{fontFamily:"'Hind Siliguri','Noto Sans Bengali',sans-serif",background:C.bg,minHeight:"100vh",color:C.text,transition:"background .3s,color .3s"}}>
        <style>{CSS}{dark?CSS_DARK:""}</style>
        <Nav/>
        <div style={{minHeight:"calc(100vh - 62px)"}}>
          {page==="home"      && <Home/>}
          {page==="cprofile" && <div className="wp" style={{padding:"0 0 80px"}}><CustomerProfilePage user={authUser} onAvatarUpdate={u=>{setAuthUser(u);}} onNavigate={pg=>{if(pg==="_kyc")setShowKyc(true);else setPage(pg);}}/></div>}
          {page==="services"  && <div className="wp sp"><Services/></div>}
          {page==="providers" && <div className="wp sp"><ProvidersPage/></div>}
          {page==="bookings"  && <div className="wp" style={{padding:"28px 0 80px"}}><MyBookings onRate={p=>{setRateFor(p);}} onBook={goBook} onPay={id=>{setPayBookingId(id);setPayResult(null);setShowPayment(true);}}/></div>}
          {page==="notifs"    && <div className="wp" style={{padding:"28px 0 80px"}}><NotifPage/></div>}
          {page==="dashboard" && <div className="wp" style={{padding:"28px 0 80px"}}><ProviderDash/></div>}
          {page==="how"       && <div className="wp"><HowPage/></div>}
          {page==="saved"     && <div className="wp" style={{padding:"28px 0 80px"}}><FavoritesPage favs={favs} onBook={goBook} onView={setDetail} onToggle={toggleFav}/></div>}
          {page==="nearby"    && <div className="wp" style={{padding:"28px 0 80px"}}><NearbyPage onBook={goBook} onView={setDetail}/></div>}
          {page==="calendar"  && <div className="wp" style={{padding:"28px 0 80px"}}><CalendarPage onBook={goBook}/></div>}
          {page==="blood"     && <div className="wp" style={{padding:"28px 0 80px"}}><BloodDonationPage/></div>}
          {page==="disaster"  && <div className="wp" style={{padding:"28px 0 80px"}}><DisasterPage/></div>}
          {page==="wallet"    && <div className="wp" style={{padding:"28px 0 80px"}}><WalletPage/></div>}
          {page==="promos"    && <div className="wp" style={{padding:"28px 0 80px"}}><PromosPage/></div>}
          {page==="analytics" && <div className="wp" style={{padding:"28px 0 80px"}}><AnalyticsPage/></div>}
          {page==="settings"  && <div className="wp" style={{padding:"28px 0 80px"}}><SettingsPage/></div>}
          {page==="srvreq"    && <div className="wp" style={{padding:"28px 0 80px"}}><ServiceRequestPage/></div>}
          {page==="loyalty"   && <div className="wp" style={{padding:"28px 0 80px"}}><LoyaltyPage/></div>}
          {page==="referral"  && <div className="wp" style={{padding:"28px 0 80px"}}><ReferralPage/></div>}
          {page==="portfolio" && <div className="wp" style={{padding:"28px 0 80px"}}><PortfolioPage/></div>}
          {page==="providerreg"&& <div className="wp" style={{padding:"28px 0 80px"}}><ProviderRegPage/></div>}
          {page==="panalytics"&& <div className="wp" style={{padding:"28px 0 80px"}}><ProviderAnalyticsPage/></div>}
          {page==="skillcert" && <div className="wp" style={{padding:"28px 0 80px"}}><SkillCertPage/></div>}
        </div>
        <MobNav/>

        {/* Provider detail modal */}
        {detail&&<div className="ov" onClick={()=>setDetail(null)}><div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:640}}><PDetail p={detail} onClose={()=>setDetail(null)} onBook={goBook} onChat={p=>{setDetail(null);setChatWith(p);}}/></div></div>}
        {chatWith&&<div style={{position:"fixed",inset:0,zIndex:200,background:C.bg}}><LiveChatPage provider={chatWith} onBack={()=>setChatWith(null)}/></div>}
        {/* Booking modal */}
        {booking&&<div className="ov" onClick={()=>setBooking(null)}><div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:480}}><BookModal p={booking} onClose={()=>setBooking(null)}/></div></div>}
        {/* Rating modal */}
        {rateFor&&<div className="ov" onClick={()=>setRateFor(null)}><div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:440}}><RatingModal p={rateFor} onClose={()=>setRateFor(null)}/></div></div>}
        {/* Search / filter modal */}
        {modal==="search"&&<div className="ov" onClick={()=>setModal(null)}><div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:580}}><SearchFilter onClose={()=>setModal(null)} onBook={goBook} onView={p=>{setModal(null);setDetail(p);}}/></div></div>}
        {/* Map modal */}
        {modal==="map"&&<div className="ov" onClick={()=>setModal(null)}><div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:500,padding:22}}>
          <div className="row" style={{justifyContent:"space-between",marginBottom:14}}>
            <div style={{fontSize:16,fontWeight:700}}>🗺️ {tr.mapTitle}</div>
            <button className="btn btn-gh" style={{fontSize:20}} onClick={()=>setModal(null)}>✕</button>
          </div>
          <LiveMap tracking={tracking} setTracking={setTracking}/>
          <div style={{marginTop:14,display:"flex",gap:10}}>
            <button className="btn btn-g" style={{flex:1,padding:"11px"}} onClick={()=>{setTracking(true);setModal(null);}}>{tr.trackBtn}</button>
            <button className="btn btn-o" style={{flex:1}} onClick={()=>setModal(null)}>{tr.trackClose}</button>
          </div>
        </div></div>}
        {/* NID modal */}
        {modal==="nid"&&<div className="ov" onClick={()=>setModal(null)}><div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:440}}><NIDPage onClose={()=>setModal(null)}/></div></div>}
        {/* Loan modal */}
        {modal==="loan"&&<div className="ov" onClick={()=>setModal(null)}><div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:460,padding:24}}>
          <div className="row" style={{justifyContent:"space-between",marginBottom:16}}>
            <div style={{fontSize:16,fontWeight:700}}>💹 {tr.loanTitle}</div>
            <button className="btn btn-gh" style={{fontSize:20}} onClick={()=>setModal(null)}>✕</button>
          </div>
          <LoanScore/>
        </div></div>}
        {/* Emergency */}
        {emg&&<EmgModal/>}
        {/* ── PAYMENT MODAL ── */}
        {showPayment&&(
          <div className="ov" onClick={()=>{if(!payLoading){setShowPayment(false);setPayResult(null);setPayBookingId(null);}}}>
            <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:400,padding:28,textAlign:"center"}}>
              {payResult==="success"?(<>
                <div style={{fontSize:64,marginBottom:8}}>✅</div>
                <div style={{fontSize:19,fontWeight:700,color:"#16A34A",marginBottom:6}}>{lang==="bn"?"পেমেন্ট সফল!":"Payment Successful!"}</div>
                <div style={{fontSize:13,color:C.muted,marginBottom:4}}>{lang==="bn"?"আপনার বুকিং নিশ্চিত হয়েছে।":"Your booking has been confirmed."}</div>
                {payResultTranId&&<div style={{fontSize:11,color:C.muted,marginBottom:20}}>TXN: {payResultTranId}</div>}
                <button className="btn btn-g" onClick={()=>{setShowPayment(false);setPayResult(null);setPayBookingId(null);setPage("bookings");}} style={{padding:"10px 32px"}}>{lang==="bn"?"বুকিং দেখুন":"View Bookings"}</button>
              </>):payResult==="failed"?(<>
                <div style={{fontSize:64,marginBottom:8}}>❌</div>
                <div style={{fontSize:19,fontWeight:700,color:"#EF4444",marginBottom:6}}>{lang==="bn"?"পেমেন্ট ব্যর্থ":"Payment Failed"}</div>
                <div style={{fontSize:13,color:C.muted,marginBottom:20}}>{lang==="bn"?"পুনরায় চেষ্টা করুন।":"Please try again."}</div>
                <button className="btn btn-gh" onClick={()=>{setShowPayment(false);setPayResult(null);}} style={{padding:"10px 32px"}}>{lang==="bn"?"ঠিক আছে":"OK"}</button>
              </>):payResult==="cancelled"?(<>
                <div style={{fontSize:64,marginBottom:8}}>🚫</div>
                <div style={{fontSize:19,fontWeight:700,color:C.muted,marginBottom:6}}>{lang==="bn"?"পেমেন্ট বাতিল":"Payment Cancelled"}</div>
                <button className="btn btn-gh" onClick={()=>{setShowPayment(false);setPayResult(null);}} style={{padding:"10px 32px"}}>{lang==="bn"?"ঠিক আছে":"OK"}</button>
              </>):(<>
                <div style={{fontSize:42,marginBottom:10}}>💳</div>
                <div style={{fontSize:17,fontWeight:700,marginBottom:4}}>{lang==="bn"?"পেমেন্ট করুন":"Complete Payment"}</div>
                <div style={{fontSize:12,color:C.muted,marginBottom:20}}>{lang==="bn"?"SSLCommerz — bKash, Nagad, Rocket, Card সহ সকল পদ্ধতি":"SSLCommerz — bKash, Nagad, Rocket, uPay, Cards & more"}</div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center",marginBottom:20}}>
                  {[["🟢","bKash"],["🔵","Nagad"],["🟠","Rocket"],["🟣","uPay"],["🔴","CelFin"],["💳","Card"]].map(([ic,lbl])=>(
                    <div key={lbl} style={{padding:"6px 14px",background:C.bg,border:`1px solid ${C.bdr}`,borderRadius:20,fontSize:12,fontWeight:600,color:C.text}}>{ic} {lbl}</div>
                  ))}
                </div>
                <div style={{display:"flex",gap:10}}>
                  <button className="btn btn-gh" style={{flex:1,padding:"11px 0"}} onClick={()=>setShowPayment(false)}>{lang==="bn"?"বাতিল":"Cancel"}</button>
                  <button className="btn" style={{flex:1,padding:"11px 0",background:"#6366F1",color:"#fff",borderRadius:12,border:"none",cursor:payLoading?"not-allowed":"pointer",fontWeight:700,fontSize:14,fontFamily:"inherit"}} disabled={payLoading}
                    onClick={async()=>{
                      if(!payBookingId)return;
                      setPayLoading(true);
                      try{
                        const res=await paymentsApi.initiate(payBookingId);
                        if(res.url){ window.location.href=res.url; }
                        else if(res.mock){
                          setPayResult("success");
                          bookingsApi.list().then(d=>{if(d.bookings?.length)setLiveBookings(d.bookings);}).catch(()=>{});
                        }
                      }catch(e){ alert(e.message||"পেমেন্ট শুরু করতে সমস্যা হয়েছে।"); }
                      finally{setPayLoading(false);}
                    }}>
                    {payLoading?(lang==="bn"?"প্রসেস হচ্ছে…":"Processing…"):(lang==="bn"?"💳 পেমেন্ট করুন":"💳 Pay Now")}
                  </button>
                </div>
                <div style={{marginTop:12,fontSize:10,color:C.muted}}>{lang==="bn"?"SSL নিরাপদ এনক্রিপ্টেড পেমেন্ট":"SSL secured encrypted payment — All data protected"}</div>
              </>)}
            </div>
          </div>
        )}
        {/* SOS floating button */}
        {!showSos && (
          <button onClick={()=>{setShowSos(true);setSosDone(false);setSosType("");setSosDesc("");}}
            title={lang==="bn"?"SOS জরুরি সতর্কতা":"SOS Emergency Alert"}
            style={{position:"fixed",bottom:isMobile?216:212,right:18,width:44,height:44,borderRadius:12,background:"#EF4444",border:"3px solid #fff",cursor:"pointer",fontSize:19,boxShadow:"0 4px 18px rgba(239,68,68,.55)",zIndex:698,display:"flex",alignItems:"center",justifyContent:"center",animation:"pulse 2s infinite"}}>
            🆘
          </button>
        )}
        {/* SOS Modal */}
        {showSos && (
          <div className="ov" onClick={()=>setShowSos(false)}>
            <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:380,padding:28,textAlign:"center"}}>
              {sosDone ? (
                <>
                  <div style={{fontSize:60,marginBottom:12}}>✅</div>
                  <div style={{fontSize:18,fontWeight:700,color:"#16A34A",marginBottom:8}}>{lang==="bn"?"উর্ধ্বতন কর্তৃপক্ষকে জানানো হয়েছে":"Admin & Call Center Notified"}</div>
                  <div style={{fontSize:13,color:C.muted,marginBottom:20}}>{lang==="bn"?"আমাদের টিম শীঘ্রই যোগাযোগ করবে। জরুরি নম্বর: ৯৯৯":"Our team will contact you shortly. Emergency: 999"}</div>
                  <button className="btn btn-g" onClick={()=>setShowSos(false)} style={{padding:"10px 28px"}}>{lang==="bn"?"ঠিক আছে":"OK"}</button>
                </>
              ) : (
                <>
                  <div style={{fontSize:50,marginBottom:10,animation:"pulse 1s infinite"}}>🆘</div>
                  <div style={{fontSize:18,fontWeight:700,color:"#EF4444",marginBottom:6}}>{lang==="bn"?"জরুরি সতর্কতা":"Emergency SOS Alert"}</div>
                  <div style={{fontSize:12,color:C.muted,marginBottom:18}}>{lang==="bn"?"আপনার Admin প্যানেল ও Call Center তাৎক্ষণিক সতর্ক হবে":"Admin panel & call center will be alerted immediately"}</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:8,justifyContent:"center",marginBottom:16}}>
                    {[{v:"harassment",bn:"হয়রানি",en:"Harassment"},{v:"fraud",bn:"প্রতারণা",en:"Fraud"},{v:"unsafe",bn:"অনিরাপদ",en:"Unsafe"},{v:"emergency",bn:"জরুরি",en:"Emergency"},{v:"other",bn:"অন্যান্য",en:"Other"}].map(t=>(
                      <button key={t.v} onClick={()=>setSosType(t.v)}
                        style={{padding:"7px 14px",borderRadius:20,border:`2px solid ${sosType===t.v?"#EF4444":C.bdr}`,background:sosType===t.v?"#FEF2F2":C.card,color:sosType===t.v?"#EF4444":C.text,cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:"inherit"}}>
                        {lang==="bn"?t.bn:t.en}
                      </button>
                    ))}
                  </div>
                  <textarea value={sosDesc} onChange={e=>setSosDesc(e.target.value)}
                    placeholder={lang==="bn"?"সংক্ষিপ্ত বিবরণ দিন (ঐচ্ছিক)…":"Brief description (optional)…"}
                    style={{width:"100%",border:`1.5px solid ${C.bdr}`,borderRadius:10,padding:"10px 12px",fontSize:13,background:C.card,color:C.text,resize:"none",height:72,fontFamily:"inherit",marginBottom:14}}/>
                  <div style={{display:"flex",gap:10}}>
                    <button className="btn btn-gh" style={{flex:1,padding:"11px 0"}} onClick={()=>setShowSos(false)}>{lang==="bn"?"বাতিল":"Cancel"}</button>
                    <button className="btn" style={{flex:1,padding:"11px 0",background:"#EF4444",color:"#fff",borderRadius:12,border:"none",cursor:sosLoading||!sosType?"not-allowed":"pointer",opacity:!sosType?.5:1,fontWeight:700,fontSize:14,fontFamily:"inherit"}} disabled={!sosType||sosLoading}
                      onClick={async()=>{
                        if(!sosType)return;
                        setSosLoading(true);
                        const send=(lat,lng)=>{
                          return sosApi?.send(sosType,sosDesc,null,lat,lng).catch(()=>{}).finally(()=>{setSosLoading(false);setSosDone(true);});
                        };
                        navigator.geolocation?.getCurrentPosition(
                          pos=>send(pos.coords.latitude,pos.coords.longitude),
                          ()=>send(null,null)
                        );
                      }}>
                      {sosLoading?"পাঠানো হচ্ছে…":lang==="bn"?"🆘 সতর্কতা পাঠান":"🆘 Send Alert"}
                    </button>
                  </div>
                  <div style={{marginTop:14,fontSize:11,color:"#EF4444",fontWeight:600}}>৯৯৯ · ১৯৯ বা সরাসরি ফোন করুন • 999 · 199 direct call</div>
                </>
              )}
            </div>
          </div>
        )}
        {/* Voice Command */}
        <VoiceCommand onCommand={handleVoiceCommand} isMobile={isMobile}/>
        {/* AI Chat */}
        <Chat isMobile={isMobile}/>
      </div>
    </LangCtx.Provider>
    </FavsCtx.Provider>
    </LiveDataCtx.Provider>
    </UserCtx.Provider>
    </ThemeCtx.Provider>
  );
}
