import { useRef, useState, useEffect } from "react";
import L from "leaflet";
import { useC, useTr } from "../contexts";
import { C_DARK } from "../constants/theme";
import { T } from "../constants/translations";

export default function LiveMap({tracking,setTracking}) {
  const C=useC();
  const dark=C===C_DARK;
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
      Object.assign(d.style,{background:"rgba(255,255,255,.98)",backdropFilter:"blur(3px)",borderRadius:"8px",padding:"6px 9px",cursor:"pointer",fontSize:"15px",border:"1.5px solid rgba(255,255,255,.6)",boxShadow:"0 4px 14px rgba(0,0,0,.15)"});
      L.DomEvent.on(d,"click",L.DomEvent.stopPropagation);
      L.DomEvent.on(d,"click",()=>{
        satMode=!satMode;
        if(satMode){map.removeLayer(roadLayer);satLayer.addTo(map);d.style.background="#006A4E";d.style.color="#fff";}
        else{map.removeLayer(satLayer);roadLayer.addTo(map);d.style.background="rgba(255,255,255,.98)";d.style.color="#000";}
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
    <div style={{
      borderRadius:24,overflow:"hidden",
      boxShadow:`0 12px 48px rgba(21,163,96,.2),0 4px 16px rgba(0,0,0,.08),0 0 0 1px ${dark?"rgba(30,69,53,.4)":"rgba(29,191,115,.1)"}`,
      position:"relative",background:dark?"#080F0B":"#EAF0E8"
    }}>
      {/* Leaflet map container */}
      <div ref={mapDiv} style={{width:"100%",height:270}}/>

      {/* GPS acquiring indicator */}
      {!gpsOk&&(
        <div style={{position:"absolute",top:10,left:10,background:"rgba(255,255,255,.88)",backdropFilter:"blur(2px) saturate(120%)",WebkitBackdropFilter:"blur(2px) saturate(120%)",borderRadius:10,padding:"4px 10px",fontSize:10,color:"#888",display:"flex",alignItems:"center",gap:5,boxShadow:"0 4px 14px rgba(0,0,0,.1)",border:"1px solid rgba(255,255,255,.6)"}}>
          <span>📍</span> {lang==="bn"?"লোকেশন নিচ্ছে...":"Getting location..."}
        </div>
      )}

      {/* ── TRACKING ON: Uber-style provider card ── */}
      {tracking&&(
        <div style={{
          position:"absolute",bottom:0,left:0,right:0,
          background:dark?"rgba(10,22,16,.96)":"rgba(255,255,255,.96)",
          backdropFilter:"blur(5px) saturate(120%)",WebkitBackdropFilter:"blur(5px) saturate(120%)",
          borderRadius:"22px 22px 0 0",padding:"16px 16px 20px",
          boxShadow:"0 -8px 32px rgba(0,0,0,.15),inset 0 1px 0 rgba(255,255,255,.3)",
          border:"1px solid rgba(255,255,255,.2)"
        }}>
          {/* Provider row */}
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
            <div style={{width:46,height:46,borderRadius:"50%",background:`linear-gradient(135deg,${C.p},${C.pdk})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:800,color:"#fff",flexShrink:0,boxShadow:`0 3px 12px ${C.p}44`}}>
              র
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:800,fontSize:14,color:C.text,display:"flex",alignItems:"center",gap:6}}>
                {lang==="bn"?"রাকিব হোসেন":"Rakib Hossain"}
                <span style={{background:"rgba(16,185,129,.15)",color:C.p,fontSize:9,fontWeight:700,borderRadius:6,padding:"2px 7px"}}>★ 4.9</span>
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
          <div style={{height:4,background:"rgba(0,0,0,.1)",borderRadius:4,overflow:"hidden",marginBottom:6}}>
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
            <button style={{flex:1,padding:"10px 6px",background:"rgba(29,191,115,.1)",color:C.p,border:`1.5px solid ${C.p}55`,borderRadius:12,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
              📞 {lang==="bn"?"কল":"Call"}
            </button>
            <button onClick={()=>setTracking(false)} style={{flex:1,padding:"10px 6px",background:"rgba(239,68,68,.1)",color:"#EF4444",border:"1.5px solid rgba(239,68,68,.35)",borderRadius:12,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
              ✕ {lang==="bn"?"বাতিল":"Cancel"}
            </button>
          </div>
        </div>
      )}

      {/* ── TRACKING OFF: start button ── */}
      {!tracking&&(
        <div style={{position:"absolute",bottom:10,left:10,right:10,display:"flex",gap:8}}>
          <button onClick={()=>setTracking(true)} style={{
            flex:1,padding:"12px",
            background:`linear-gradient(135deg,${C.p},${C.pdk})`,
            color:"#fff",border:"1px solid rgba(255,255,255,.2)",borderRadius:14,
            fontSize:12.5,fontWeight:700,cursor:"pointer",fontFamily:"inherit",
            boxShadow:`0 6px 20px ${C.p}55,inset 0 1px 0 rgba(255,255,255,.25)`,
            display:"flex",alignItems:"center",justifyContent:"center",gap:7
          }}>
            📍 {lang==="bn"?"লাইভ ট্র্যাকিং শুরু করুন":"Start Live Tracking"}
          </button>
          {gpsOk&&(
            <div style={{width:42,height:42,background:"rgba(255,255,255,.9)",backdropFilter:"blur(3px) saturate(120%)",WebkitBackdropFilter:"blur(3px) saturate(120%)",borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:C.p,boxShadow:`0 4px 14px rgba(0,0,0,.1),0 0 0 1px ${C.p}22`,border:`1px solid ${C.p}22`,flexDirection:"column",gap:1}}>
              <span style={{fontSize:15}}>📡</span><span>GPS</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
