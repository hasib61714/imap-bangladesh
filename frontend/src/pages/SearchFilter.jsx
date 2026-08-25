import { useState } from "react";
import { useC, useTr, useLiveData } from "../contexts";
import { T } from "../constants/translations";
import { SVCS } from "../constants/data";
import { Av, Stars } from "../components/ui";
import { toUiProv } from "../utils/helpers";
import { ai } from "../api";

export default function SearchFilter({onClose,onBook,onView}) {
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
