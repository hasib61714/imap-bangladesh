import { useContext } from "react";
import { useC, useTr, LangCtx, useLiveData } from "../contexts";
import { T } from "../constants/translations";
import { AN_DATA, AN_MONTHS, AN_SERVICES, AN_ACTIVITY } from "../constants/data";

export default function AnalyticsPage(){
  const C=useC();const tr=useTr();const lang=useContext(LangCtx)===T.en?"en":"bn";
  const {bookings:ctxBk}=useLiveData();

  // Real stats
  const totalBookings=ctxBk.length;
  const totalSpent=ctxBk.reduce((s,b)=>s+parseFloat(b.total_amount||b.amount||0),0);
  const savedAmt=Math.round(totalSpent*0.12);
  const now=new Date();
  const thisMonthBk=ctxBk.filter(b=>{const d=new Date(b.created_at||b.scheduled_at||0);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();}).length;
  const stats=[
    [tr.anBookings,"📋",totalBookings||AN_DATA.reduce((a,v)=>a+v,0),thisMonthBk?`+${thisMonthBk} ${lang==="en"?"this month":"এই মাসে"}`:"↑12%",C.p],
    [tr.anSpent,"💸",totalSpent?`৳${Math.round(totalSpent).toLocaleString()}`:"৳3,820",totalSpent?"":"↑8%","#F59E0B"],
    [tr.anSaved,"🎁",savedAmt?`৳${savedAmt.toLocaleString()}`:"৳640",savedAmt?"":"↑23%","#00C170"],
    [tr.anRating,"⭐","4.8","→0%","#8B5CF6"],
  ];

  // Last 7 months chart
  const chartMonths=[],chartData=[];
  for(let i=6;i>=0;i--){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    chartMonths.push(d.toLocaleString("en",{month:"short"}));
    chartData.push(ctxBk.filter(b=>{const bd=new Date(b.created_at||b.scheduled_at||0);return bd.getMonth()===d.getMonth()&&bd.getFullYear()===d.getFullYear();}).length);
  }
  const finalChartData=chartData.some(v=>v>0)?chartData:AN_DATA;
  const finalChartMonths=chartData.some(v=>v>0)?chartMonths:AN_MONTHS;

  // Service breakdown
  const svcMap={};
  ctxBk.forEach(b=>{const s=b.service_name_en||b.service_type||"Other";svcMap[s]=(svcMap[s]||0)+1;});
  const svcEntries=Object.entries(svcMap).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const SCOLS=["#F59E0B","#00C170","#3B82F6","#EF4444","#8B5CF6"],SICONS=["🔧","🧹","⚡","🏥","📚"];
  const sTot=svcEntries.reduce((s,[,c])=>s+c,0)||1;
  const serviceData=svcEntries.length?svcEntries.map(([name,cnt],i)=>({icon:SICONS[i]||"🔧",name,nameBn:name,pct:Math.round(cnt/sTot*100),color:SCOLS[i]||"#6B7280"})):AN_SERVICES;

  // Recent activity
  const activityData=ctxBk.length?ctxBk.slice(0,4).map(b=>({icon:b.icon||"📋",title:b.service_name_en||b.svcEn||"Service booked",titleBn:b.service_name_bn||b.svc||"সেবা বুকিং",date:b.created_at?new Date(b.created_at).toLocaleDateString("en-GB"):"Recently",amt:-parseFloat(b.total_amount||b.amount||0)})):AN_ACTIVITY;

  return(
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
        {stats.map(([lbl,ic,val,chg,col])=>(
          <div key={lbl} style={{background:C.card,borderRadius:16,padding:"16px",border:`1px solid ${C.bdr}`}}>
            <div style={{fontSize:22,marginBottom:6}}>{ic}</div>
            <div style={{fontSize:22,fontWeight:800,color:col}}>{val}</div>
            <div style={{fontSize:12,color:C.sub,marginTop:2}}>{lbl}</div>
            {chg&&<div style={{fontSize:11,color:"#006A4E",marginTop:4,fontWeight:700}}>{chg}</div>}
          </div>
        ))}
      </div>
      <div style={{background:C.card,borderRadius:16,padding:"16px 16px 20px",border:`1px solid ${C.bdr}`,marginBottom:16}}>
        <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:14}}>{tr.anMonthly}</div>
        <div style={{display:"flex",alignItems:"flex-end",gap:8,height:90}}>
          {finalChartData.map((v,i)=>(
            <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
              <div style={{fontSize:10,color:C.sub,fontWeight:700}}>{v||""}</div>
              <div style={{width:"100%",borderRadius:"6px 6px 0 0",background:i===finalChartData.length-1?C.p:"#D1FAE5",height:`${(v/Math.max(...finalChartData,1))*70}px`,minHeight:8,transition:"height .4s"}}/>
              <div style={{fontSize:9,color:C.muted}}>{finalChartMonths[i]}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{background:C.card,borderRadius:16,padding:"16px",border:`1px solid ${C.bdr}`,marginBottom:16}}>
        <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:12}}>{tr.anServices}</div>
        {serviceData.map(s=>(
          <div key={s.name} style={{marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
              <span style={{fontSize:12,color:C.text}}>{s.icon} {lang==="en"?s.name:s.nameBn}</span>
              <span style={{fontSize:12,fontWeight:700,color:s.color}}>{s.pct}%</span>
            </div>
            <div style={{height:6,borderRadius:4,background:C.bdr,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${s.pct}%`,background:s.color,borderRadius:4}}/>
            </div>
          </div>
        ))}
      </div>
      <div style={{background:C.card,borderRadius:16,padding:"16px",border:`1px solid ${C.bdr}`}}>
        <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:12}}>{tr.anRecent}</div>
        {activityData.map((a,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:i<activityData.length-1?`1px solid ${C.bdr}`:"none"}}>
            <div style={{width:36,height:36,borderRadius:10,background:C.plt,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17}}>{a.icon}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:600,color:C.text}}>{lang==="en"?a.title:a.titleBn}</div>
              <div style={{fontSize:11,color:C.muted}}>{a.date}</div>
            </div>
            {a.amt!==0&&<div style={{fontSize:13,fontWeight:700,color:a.amt>0?"#006A4E":"#DC2626"}}>{a.amt>0?"+":""}{a.amt>0?"৳"+a.amt:"৳"+Math.abs(a.amt)}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
