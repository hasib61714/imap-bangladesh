import { useState } from "react";
import { useC, useTr } from "../contexts";
import { C_DARK } from "../constants/theme";

export default function Onboarding({onDone}) {
  const C=useC(); const dark=C===C_DARK; const tr=useTr();
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
        <button onClick={()=>slide<SLIDES.length-1?setSlide(s=>s+1):onDone()} style={{width:"100%",padding:"16px",background:"rgba(255,255,255,.18)",border:"2px solid rgba(255,255,255,.4)",borderRadius:14,color:"#fff",fontSize:16,fontWeight:700,cursor:"pointer",fontFamily:"'Hind Siliguri',sans-serif",backdropFilter:"blur(2px)",transition:"all .2s"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,.28)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,.18)"}>
          {slide<SLIDES.length-1?tr.obNext:tr.obStart}
        </button>
      </div>
    </div>
  );
}
