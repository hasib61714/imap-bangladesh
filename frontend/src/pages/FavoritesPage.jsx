import { useContext } from "react";
import { useC, useTr, LangCtx, useLiveData } from "../contexts";
import { T } from "../constants/translations";
import { toUiProv } from "../utils/helpers";
import PCard from "./PCard";

export default function FavoritesPage({favs,onBook,onView,onToggle}) {
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
