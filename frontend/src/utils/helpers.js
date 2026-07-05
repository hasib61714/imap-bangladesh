export const escHtml = s => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");

export const toUiProv = p => ({
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
  col:      p.col||"#00C170",
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

export const pseudoBooked=(pid,dateStr,slot)=>{
  const h=([...`${pid}${dateStr}${slot}`].reduce((a,c)=>a+c.charCodeAt(0),0))%7;
  return h<2;
};

export const haversine=(lat1,lng1,lat2,lng2)=>{
  const R=6371,dLat=(lat2-lat1)*Math.PI/180,dLng=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
};

export function showBrowserNotif(title,body){
  if(typeof Notification==="undefined"||Notification.permission!=="granted") return;
  try{
    if(navigator.serviceWorker?.controller){
      navigator.serviceWorker.ready.then(r=>r.showNotification(title,{body,icon:"/icons/icon-192.png",badge:"/icons/icon-192.png",vibrate:[100,50,100]})).catch(()=>new Notification(title,{body}));
    } else { new Notification(title,{body}); }
  }catch{}
}

