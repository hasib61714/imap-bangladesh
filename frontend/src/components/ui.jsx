import { useC } from "../contexts";

export const Av = ({av, col, size=52, fs=18, rad=14}) =>
  <div className="jc" style={{width:size,height:size,minWidth:size,borderRadius:rad,background:`linear-gradient(135deg,${col},${col}bb)`,color:"#fff",fontWeight:700,fontSize:fs,flexShrink:0}}>{av}</div>;

export const Stars = ({r, size=13}) =>
  <span>{[1,2,3,4,5].map(s=><span key={s} className={s<=Math.round(r)?"star-on":"star-off"} style={{fontSize:size}}>★</span>)}</span>;

export const PBar = ({v, col}) => {
  const C = useC();
  return <div style={{height:6,background:C.bdr,borderRadius:99,overflow:"hidden"}}>
    <div style={{height:"100%",width:`${v}%`,background:col||C.p,borderRadius:99}}/>
  </div>;
};

export const MiniBar = ({data, tr}) => {
  const C = useC();
  const mx = Math.max(...data);
  const days = [tr.d0,tr.d1,tr.d2,tr.d3,tr.d4,tr.d5,tr.d6];
  return <div className="row" style={{gap:6,alignItems:"flex-end",height:80}}>
    {data.map((v,i)=>
      <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
        <div style={{fontSize:8,color:C.muted}}>{v>=1000?`${(v/1000).toFixed(1)}k`:v}</div>
        <div style={{width:"100%",background:`linear-gradient(180deg,${C.p},${C.pdk})`,borderRadius:"3px 3px 0 0",height:Math.round((v/mx)*64),opacity:.7+(i===5?.3:0)}}/>
        <div style={{fontSize:8,color:C.muted}}>{days[i]}</div>
      </div>
    )}
  </div>;
};
