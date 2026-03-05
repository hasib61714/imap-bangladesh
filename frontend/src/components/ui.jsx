import { useC } from "../contexts";

export const Av = ({av, col, size=52, fs=18, rad=14}) =>
  <div className="jc" style={{
    width:size, height:size, minWidth:size, borderRadius:rad,
    background:`linear-gradient(135deg,${col}EE,${col}99)`,
    color:"#fff", fontWeight:800, fontSize:fs, flexShrink:0,
    boxShadow:`0 4px 14px ${col}55, 0 1px 4px rgba(0,0,0,.15), inset 0 1px 0 rgba(255,255,255,.25)`,
    border:`1.5px solid ${col}44`,
    position:"relative", overflow:"hidden",
  }}>
    <span style={{position:"relative",zIndex:1,textShadow:"0 1px 3px rgba(0,0,0,.2)"}}>{av}</span>
    <div style={{
      position:"absolute",top:0,left:0,right:0,height:"50%",
      background:"linear-gradient(180deg,rgba(255,255,255,.22),rgba(255,255,255,0))",
      borderRadius:`${rad}px ${rad}px 0 0`,pointerEvents:"none"
    }}/>
  </div>;

export const Stars = ({r, size=13}) =>
  <span>{[1,2,3,4,5].map(s=>(
    <span key={s} className={s<=Math.round(r)?"star-on":"star-off"} style={{fontSize:size, transition:"transform .1s"}}>★</span>
  ))}</span>;

export const PBar = ({v, col}) => {
  const C = useC();
  return (
    <div style={{
      height:8, background:`linear-gradient(90deg,${C.bdr},${C.bdr}80)`,
      borderRadius:99, overflow:"hidden",
      boxShadow:`inset 0 1px 3px rgba(0,0,0,.08)`
    }}>
      <div style={{
        height:"100%", width:`${v}%`,
        background:`linear-gradient(90deg,${col||C.p},${col||C.pdk})`,
        borderRadius:99,
        boxShadow:`0 0 8px ${col||C.p}55`,
        transition:"width .6s cubic-bezier(.16,1,.3,1)",
        position:"relative",overflow:"hidden"
      }}>
        <div style={{
          position:"absolute",top:0,left:0,right:0,height:"50%",
          background:"linear-gradient(180deg,rgba(255,255,255,.4),transparent)",
          borderRadius:"99px 99px 0 0"
        }}/>
      </div>
    </div>
  );
};

export const MiniBar = ({data, tr}) => {
  const C = useC();
  const mx = Math.max(...data);
  const days = [tr.d0,tr.d1,tr.d2,tr.d3,tr.d4,tr.d5,tr.d6];
  return (
    <div className="row" style={{gap:6, alignItems:"flex-end", height:84}}>
      {data.map((v,i) => (
        <div key={i} style={{flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3}}>
          <div style={{fontSize:8, color:C.muted, fontWeight:600}}>{v>=1000?`${(v/1000).toFixed(1)}k`:v}</div>
          <div style={{
            width:"100%",
            background:i===5
              ? `linear-gradient(180deg,${C.p},${C.pdk})`
              : `linear-gradient(180deg,${C.p}CC,${C.pdk}99)`,
            borderRadius:"4px 4px 0 0",
            height:Math.round((v/mx)*64),
            boxShadow:i===5?`0 -3px 12px ${C.p}44`:`0 -1px 4px ${C.p}22`,
            transition:"height .4s ease",
            position:"relative",overflow:"hidden"
          }}>
            <div style={{
              position:"absolute",top:0,left:0,right:0,height:"40%",
              background:"linear-gradient(180deg,rgba(255,255,255,.25),transparent)",
              borderRadius:"4px 4px 0 0"
            }}/>
          </div>
          <div style={{fontSize:8, color:C.muted, fontWeight:500}}>{days[i]}</div>
        </div>
      ))}
    </div>
  );
};
