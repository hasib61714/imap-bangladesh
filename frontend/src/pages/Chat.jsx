import { useState, useRef, useEffect } from "react";
import { useC, useTr } from "../contexts";
import { C_DARK } from "../constants/theme";
import { T } from "../constants/translations";
import { ai } from "../api";

export default function Chat({isMobile}) {
  const C=useC();
  const dark=C===C_DARK;
  const tr=useTr();
  const lang=tr===T.en?"en":"bn";
  const [open,setOpen]=useState(false);
  const [msgs,setMsgs]=useState([{from:"ai",text:lang==="en"?"Hello! I'm IMAP AI 🤖 What service do you need?":"আস্সালামুয়ালাইকুম! আমি IMAP AI 🤖 কোন সেবা দরকার?", source:"system"}]);
  const [inp,setInp]=useState("");
  const [typing,setTyping]=useState(false);
  const [isListening,setIsListening]=useState(false);
  const ref=useRef(null);
  const recRef=useRef(null);
  const voiceSentRef=useRef(false); // prevents double-send
  const sendRef=useRef(null);       // always holds latest send() to avoid stale closure

  const QUICK_BN=["ইলেকট্রিশিয়ান 🔌","নার্স 🏥","জরুরি সেবা 🚨","দাম জানতে 💰","বুকিং করতে 📋"];
  const QUICK_EN=["Electrician 🔌","Nurse 🏥","Emergency 🚨","Pricing 💰","How to book 📋"];

  // Build OpenAI-style history from msgs
  const buildHistory=()=>msgs.slice(-8).map(m=>({role:m.from==="user"?"user":"assistant",content:m.text}));

  const send=async (t)=>{
    const txt=(t||inp).trim();
    if(!txt)return;
    setMsgs(m=>[...m,{from:"user",text:txt}]);
    setInp("");
    const streamId=Date.now();
    setMsgs(m=>[...m,{id:streamId,from:"ai",text:"",streaming:true,source:null}]);
    setTyping(true);
    try{
      const history=buildHistory();
      let acc="";
      for await(const chunk of ai.chatStream([...history,{role:"user",content:txt}],lang)){
        acc+=chunk;
        setMsgs(m=>m.map(msg=>msg.id===streamId?{...msg,text:acc}:msg));
      }
      setMsgs(m=>m.map(msg=>msg.id===streamId?{...msg,streaming:false,source:"gemini"}:msg));
    }catch(err){
      setMsgs(m=>m.map(msg=>msg.id===streamId?{...msg,streaming:false,text:lang==="en"?"Sorry, I had trouble connecting. Try again!":"দুঃখিত, সংযোগে সমস্যা হয়েছে। আবার চেষ্টা করুন!",source:"error"}:msg));
    }finally{
      setTyping(false);
    }
  };

  sendRef.current=send; // kept after send declaration — ref always has latest version

  // Voice input (Web Speech API) — auto-sends after recognition
  const startVoice=()=>{
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR)return alert(lang==="en"?"Voice not supported in this browser":"এই ব্রাউজারে ভয়েস সমর্থিত নয়");
    try{recRef.current?.stop();}catch{}
    const rec=new SR();
    rec.lang=lang==="bn"?"bn-BD":"en-US";
    rec.interimResults=true;
    rec.maxAlternatives=1;
    voiceSentRef.current=false;
    let capturedText=""; // local var — no React state closure issues
    rec.onresult=e=>{
      let interim="";
      let final="";
      for(let i=0;i<e.results.length;i++){
        if(e.results[i].isFinal) final+=e.results[i][0].transcript;
        else interim+=e.results[i][0].transcript;
      }
      const shown=final||interim;
      capturedText=shown;
      setInp(shown);
      if(final && !voiceSentRef.current){
        voiceSentRef.current=true;
        setIsListening(false);
        sendRef.current(final); // use ref — always the latest send()
      }
    };
    rec.onerror=e=>{console.warn("Voice error:",e.error);setIsListening(false);};
    rec.onend=()=>{
      setIsListening(false);
      // Fallback: browser ended without isFinal (e.g. silence timeout)
      if(!voiceSentRef.current && capturedText.trim()){
        voiceSentRef.current=true;
        sendRef.current(capturedText); // safe: not inside a state setter
      }
    };
    recRef.current=rec;
    try{rec.start();setIsListening(true);}catch(e){console.warn("SR start:",e);}
  };
  const stopVoice=()=>{recRef.current?.stop();setIsListening(false);};

  useEffect(()=>{if(ref.current)ref.current.scrollTop=ref.current.scrollHeight;},[msgs,typing]);

  const bot=isMobile?76:28;
  if(!open)return(
    <button onClick={()=>setOpen(true)} className="jc" style={{position:"fixed",bottom:bot,right:18,width:52,height:52,background:`linear-gradient(135deg,${C.p},${C.pdk})`,border:"none",borderRadius:15,cursor:"pointer",fontSize:22,boxShadow:`0 6px 22px ${C.p}66`,zIndex:700,animation:"glow 3s infinite"}}>🤖</button>
  );

  return(
    <div style={{position:"fixed",bottom:bot,right:14,width:320,height:460,background:C.card,borderRadius:20,boxShadow:"0 16px 50px rgba(0,0,0,.18)",zIndex:700,display:"flex",flexDirection:"column",border:`1px solid ${C.bdr}`,animation:"fadeUp .3s ease"}}>
      {/* Header */}
      <div style={{background:`linear-gradient(135deg,${C.p},${C.pdk})`,padding:"13px 15px",borderRadius:"20px 20px 0 0",display:"flex",alignItems:"center",gap:9}}>
        <div className="jc" style={{width:34,height:34,borderRadius:10,background:"rgba(255,255,255,.2)",fontSize:18,flexShrink:0}}>🤖</div>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:700,color:"#fff"}}>{tr.chatTitle||"IMAP AI"}</div>
          <div style={{fontSize:10,color:"rgba(255,255,255,.75)"}}>{tr.chatOnline||"সর্বদা অনলাইন"}</div>
        </div>
        <button onClick={()=>setOpen(false)} style={{background:"rgba(255,255,255,.2)",border:"none",borderRadius:7,width:27,height:27,cursor:"pointer",color:"#fff",fontSize:14}}>✕</button>
      </div>

      {/* Messages */}
      <div ref={ref} style={{flex:1,overflowY:"auto",padding:"10px 12px",display:"flex",flexDirection:"column",gap:9}}>
        {msgs.map((m,i)=>(
          <div key={i} style={{display:"flex",justifyContent:m.from==="user"?"flex-end":"flex-start"}}>
            <div style={{maxWidth:"84%",padding:"9px 13px",borderRadius:m.from==="user"?"14px 14px 4px 14px":"14px 14px 14px 4px",background:m.from==="user"?`linear-gradient(135deg,${C.p},${C.pdk})`:"#fff",color:m.from==="user"?"#fff":C.text,fontSize:12.5,lineHeight:1.65,border:m.from==="ai"?`1px solid ${C.bdr}`:"none",boxShadow:m.from==="ai"?"0 2px 8px rgba(0,0,0,.05)":"none",position:"relative"}}>
              {m.text}{m.streaming&&<span style={{display:"inline-block",animation:"pulse 1s infinite",color:C.p,fontWeight:700,marginLeft:1}}>▋</span>}
              {m.from==="ai"&&m.source&&m.source!=="system"&&!m.streaming&&(
                <div style={{fontSize:9,color:m.source==="llm"||m.source==="gemini"?"#006A4E":C.muted,marginTop:4,fontWeight:600}}>
                  {m.source==="gemini"?"✨ Gemini":m.source==="llm"?"🤖 GPT":"📚 Smart"}
                </div>
              )}
            </div>
          </div>
        ))}
        {typing&&(
          <div style={{
            display:"flex",gap:4,padding:"10px 13px",
            background:dark?"rgba(15,30,22,.85)":"rgba(255,255,255,.98)",
            backdropFilter:"blur(2px)",WebkitBackdropFilter:"blur(2px)",
            border:`1px solid ${C.bdr}`,borderRadius:"14px 14px 14px 4px",width:58,
            boxShadow:"0 4px 14px rgba(0,0,0,.08)"
          }}>
            <div className="dot"/><div className="dot"/><div className="dot"/>
          </div>
        )}
      </div>

      {/* Quick replies */}
      <div className="sx" style={{padding:"4px 10px 0"}}>
        <div style={{display:"flex",gap:5,width:"max-content"}}>
          {(lang==="en"?QUICK_EN:QUICK_BN).map(q=>(
            <button key={q} onClick={()=>send(q)} className="btn" style={{padding:"4px 10px",background:C.plt,borderRadius:99,fontSize:10.5,color:C.p,whiteSpace:"nowrap",fontWeight:600}}>{q}</button>
          ))}
        </div>
      </div>

      {/* Input area */}
      <div style={{padding:"7px 10px 10px",display:"flex",gap:6,alignItems:"center"}}>
        {/* Mic button */}
        <button onClick={isListening?stopVoice:startVoice} className="btn jc" title={lang==="en"?"Voice input":"ভয়েস দিয়ে লিখুন"} style={{width:36,height:36,borderRadius:9,background:isListening?C.red:C.plt,border:`1.5px solid ${isListening?C.red:C.bdr}`,fontSize:16,flexShrink:0,animation:isListening?"pulse 1s infinite":"none"}}>
          {isListening?"🔴":"🎙️"}
        </button>
        <input
          value={inp}
          onChange={e=>setInp(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()}
          placeholder={tr.chatPh||"মেসেজ টাইপ করুন..."}
          style={{flex:1,padding:"8px 11px",border:`1.5px solid ${C.bdr}`,borderRadius:9,fontSize:12.5,color:C.text,background:C.card,outline:"none"}}
        />
        <button onClick={()=>send()} disabled={!inp.trim()&&!typing} className="btn btn-g jc" style={{width:36,height:36,borderRadius:9,padding:0,fontSize:15,opacity:inp.trim()?1:0.5}}>
          ➤
        </button>
      </div>
    </div>
  );
}
