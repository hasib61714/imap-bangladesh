import { useRef, useEffect } from "react";
import L from "leaflet";
import { C_LIGHT as C } from "../constants/theme";
import { BG_COL_MAP } from "../constants/data";

export default function BloodDonorMap({donors,lang}){
  const mapElRef=useRef(null);
  const mapObjRef=useRef(null);
  useEffect(()=>{
    if(!mapElRef.current||mapObjRef.current) return;
    const m=L.map(mapElRef.current).setView([23.7808,90.4124],12);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",{attribution:"\u00a9 OpenStreetMap \u00a9 CartoDB",maxZoom:19}).addTo(m);
    mapObjRef.current=m;
    // SECURITY: donor fields (name/loc/phone) are user-supplied and are injected
    // into a Leaflet popup as innerHTML — Leaflet bypasses React's escaping, so
    // every interpolated value MUST be HTML-escaped to prevent stored XSS.
    const esc=(v)=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
    // Phone goes inside an href="tel:…" — strip to dialable chars only.
    const telSafe=(v)=>String(v==null?"":v).replace(/[^\d+\-() ]/g,"");
    donors.forEach(d=>{
      const lat=d.lat||(23.7808+(Math.random()-0.5)*0.08);
      const lng=d.lng||(90.4124+(Math.random()-0.5)*0.08);
      const col=BG_COL_MAP[d.bg]||"#666";
      const bg=esc(d.bg), name=esc(d.name), loc=esc(d.loc||d.locEn), phone=esc(d.phone), tel=telSafe(d.phone), dons=esc(d.dons);
      const icon=L.divIcon({className:"",html:`<div style="width:38px;height:38px;border-radius:50%;background:${col};border:3px solid #fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.3);opacity:${d.avail?1:0.45}">${bg}</div>`,iconSize:[38,38],iconAnchor:[19,19]});
      const mk=L.marker([lat,lng],{icon}).addTo(m);
      mk.bindPopup(`<div style="font-family:sans-serif;min-width:150px"><div style="font-weight:700;font-size:14px">${name}</div><div style="font-size:12px;color:#666;margin-bottom:6px">${loc}</div><div style="display:flex;gap:6px;margin-bottom:6px"><span style="background:${col};color:#fff;border-radius:20px;padding:2px 10px;font-size:12px;font-weight:700">${bg}</span><span style="background:${d.avail?"#D1FAE5":"#FEE2E2"};color:${d.avail?"#065F46":"#991B1B"};border-radius:20px;padding:2px 10px;font-size:12px">${d.avail?(lang==="en"?"Available":"ুপলব্ধ"):(lang==="en"?"Unavailable":"অনুপলব্ধ")}</span></div><div style="font-size:12px">📞 ${phone}</div><div style="font-size:11px;color:#888;margin-top:3px">💉 ${dons} ${lang==="en"?"donations":"বার দান"}</div>${d.avail?`<a href="tel:${tel}" style="display:block;margin-top:8px;background:${col};color:#fff;text-align:center;border-radius:8px;padding:6px 10px;text-decoration:none;font-size:12px;font-weight:700">${lang==="en"?"📞 Call":"📞 কল করুন"}</a>`:""}</div>`);
    });
    return()=>{m.remove();mapObjRef.current=null;};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[donors]);
  return <div ref={mapElRef} style={{height:420,borderRadius:14,overflow:"hidden",border:`1px solid ${C.bdr}`}}/>;
}
