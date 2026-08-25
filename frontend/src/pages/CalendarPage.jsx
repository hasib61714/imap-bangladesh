import { useContext, useState } from "react";
import { useC, useTr, LangCtx, useLiveData } from "../contexts";
import { T } from "../constants/translations";
import { PROVIDERS, CAL_SLOTS } from "../constants/data";
import { toUiProv, pseudoBooked } from "../utils/helpers";
import { bookings as bookingsApi } from "../api";

export default function CalendarPage({onBook}) {
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
    try {
      setBooked(true);
      await bookingsApi.create({
        provider_id:  selProv.id,
        service_type: selProv.svcEn||selProv.svc||"",
        scheduled_at: `${selDate.toISOString().split("T")[0]} ${selSlot}`,
        payment_method:"cash",
        total_amount: parseInt(String(selProv.price||"").replace(/[৳,]/g,""))||350,
      });
      setTimeout(()=>{setBooked(false);setSelSlot(null);onBook&&onBook(selProv);},1200);
    } catch(e){
      console.error("Calendar booking error:",e);
      setBooked(false);
      alert(lang==="en"?"Booking failed. Please try again.":"বুকিং ব্যর্থ হয়েছে। আবার চেষ্টা করুন।");
    }
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
