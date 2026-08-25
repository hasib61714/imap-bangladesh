import { useSocket } from "../hooks/useSocket";
import { useContext, useState, useRef, useEffect } from "react";
import { useC, useTr, LangCtx } from "../contexts";
import { C_DARK } from "../constants/theme";
import { T } from "../constants/translations";
import { getToken, chat as chatApi } from "../api";

export default function LiveChatPage({provider, onBack}) {
  const C=useC(); const dark=C===C_DARK; const tr=useTr(); const lang=useContext(LangCtx)===T.en?"en":"bn";
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
  const sendingRef=useRef(false); // prevent concurrent sends
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
    if(!text.trim()||sendingRef.current) return;
    sendingRef.current=true;
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
    }finally{
      sendingRef.current=false;
    }
  };

  const pName=lang==="en"?provider.nameEn:provider.name;
  const avatar=provider.avatar||provider.name[0];
  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",maxHeight:"100vh",background:C.bg,fontFamily:"'Hind Siliguri',sans-serif"}}>
      {/* Header */}
      <div style={{
        display:"flex",alignItems:"center",gap:12,padding:"14px 18px",
        background:dark?"rgba(8,15,11,.9)":"rgba(255,255,255,.9)",
        backdropFilter:"blur(6px) saturate(130%)",WebkitBackdropFilter:"blur(6px) saturate(130%)",
        borderBottom:`1px solid ${dark?"rgba(30,69,53,.5)":"rgba(255,255,255,.6)"}`,
        position:"sticky",top:0,zIndex:50,
        boxShadow:dark?"0 2px 20px rgba(0,0,0,.3)":"0 2px 12px rgba(21,163,96,.05)"
      }}>
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
