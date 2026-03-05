/* Bangladesh flag colours — green #006A4E · red #E8192C */
export const C_LIGHT = { p:"#006A4E",pdk:"#004D38",plt:"#E6F4EF",acc:"#E8192C",dark:"#0F1E18",text:"#1A2A24",sub:"#4A6A60",muted:"#8FAAA0",bdr:"#D4E8E0",bg:"#F4FBF7",card:"#FFFFFF",red:"#E8192C" };
export const C_DARK  = { p:"#00C170",pdk:"#009954",plt:"#0A2018",acc:"#FF4D5E",dark:"#E0EDE8",text:"#D8ECE4",sub:"#8FAAA0",muted:"#6A8880",bdr:"#1E3828",bg:"#0A100E",card:"#1A2820",red:"#FF4D5E" };

export const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@300;400;500;600;700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html,body{font-family:'Hind Siliguri','Noto Sans Bengali',sans-serif;background:#F4FBF7;color:#142018;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;}

/* ─── Premium Scrollbar ─── */
::-webkit-scrollbar{width:5px;height:5px;}
::-webkit-scrollbar-track{background:transparent;}
::-webkit-scrollbar-thumb{background:linear-gradient(180deg,#006A4E,#004D38);border-radius:99px;}
::-webkit-scrollbar-thumb:hover{background:linear-gradient(180deg,#00C170,#006A4E);}

/* ─── Keyframe Animations ─── */
@keyframes fadeUp{from{opacity:0;transform:translateY(20px);}to{opacity:1;transform:translateY(0);}}
@keyframes fadeIn{from{opacity:0;}to{opacity:1;}}
@keyframes slideUp{from{transform:translateY(100%);opacity:0;}to{transform:translateY(0);opacity:1;}}
@keyframes pulse{0%,100%{transform:scale(1);}50%{transform:scale(1.05);}}
@keyframes glow{0%,100%{box-shadow:0 0 20px #006A4E33,0 0 40px #006A4E11;}50%{box-shadow:0 0 30px #006A4E66,0 0 60px #006A4E33;}}
@keyframes ticker{0%{transform:translateX(0);}100%{transform:translateX(-50%);}}
@keyframes dot{0%,60%,100%{transform:translateY(0);}30%{transform:translateY(-5px);}}
@keyframes bounce{0%,80%,100%{transform:scale(0);opacity:.4;}40%{transform:scale(1);opacity:1;}}
@keyframes shimmer{0%{background-position:200% center;}100%{background-position:-200% center;}}
@keyframes float{0%,100%{transform:translateY(0px);}50%{transform:translateY(-6px);}}
@keyframes gradShift{0%{background-position:0% 50%;}50%{background-position:100% 50%;}100%{background-position:0% 50%;}}
@keyframes pressDown{0%,100%{transform:scale(1);}50%{transform:scale(.97);}}
@keyframes borderGlow{0%,100%{border-color:#006A4E22;}50%{border-color:#006A4E88;}}
@keyframes ripple{0%{transform:scale(0);opacity:.5;}100%{transform:scale(4);opacity:0;}}

.fu{animation:fadeUp .45s cubic-bezier(.16,1,.3,1) both;}
.fi{animation:fadeIn .25s ease both;}
.float{animation:float 3s ease-in-out infinite;}

/* ─── Layout Helpers ─── */
.sx{overflow-x:auto;scrollbar-width:none;}.sx::-webkit-scrollbar{display:none;}
.jc{display:flex;align-items:center;justify-content:center;}.row{display:flex;align-items:center;}
.wp{max-width:1280px;margin:0 auto;padding:0 28px;}
.sp{padding:72px 0;}
.g6{display:grid;grid-template-columns:repeat(6,1fr);gap:14px;}
.g3{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;}
.g4{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;}
.g2{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;}
.hl{display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:center;}
.sb{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
.mnav{display:none;}.dnav{display:flex;}

/* ─── Premium Glass Card ─── */
.card{
  background:rgba(255,255,255,.98);
  backdrop-filter:blur(2px) saturate(120%);
  -webkit-backdrop-filter:blur(2px) saturate(120%);
  border-radius:20px;
  border:1px solid rgba(255,255,255,.7);
  box-shadow:0 4px 16px rgba(21,163,96,.06),0 1px 3px rgba(0,0,0,.04),inset 0 1px 0 rgba(255,255,255,.8);
  transition:transform .25s cubic-bezier(.16,1,.3,1),box-shadow .25s ease,border-color .25s ease;
}
.card:hover{
  transform:translateY(-5px) scale(1.005);
  box-shadow:0 20px 48px rgba(21,163,96,.14),0 8px 20px rgba(0,0,0,.06),0 0 0 1px rgba(29,191,115,.12),inset 0 1px 0 rgba(255,255,255,.9);
  border-color:rgba(29,191,115,.3);
}

/* ─── Provider Card Top Accent ─── */
.pcard{position:relative;}
.pcard::before{
  content:'';position:absolute;top:0;left:0;right:0;height:3px;
  background:linear-gradient(90deg,#006A4E,#5DD4A0,#006A4E);
  background-size:200%;
  opacity:0;transition:opacity .3s;border-radius:20px 20px 0 0;
}
.pcard:hover::before{opacity:1;animation:shimmer 2s linear infinite;}

/* ─── 3D Premium Buttons ─── */
.btn{
  display:inline-flex;align-items:center;justify-content:center;gap:6px;
  font-family:'Hind Siliguri',sans-serif;cursor:pointer;border:none;
  transition:all .2s cubic-bezier(.16,1,.3,1);font-weight:700;
  position:relative;overflow:hidden;
}
.btn::after{
  content:'';position:absolute;inset:0;
  background:linear-gradient(135deg,rgba(255,255,255,.2) 0%,rgba(255,255,255,0) 50%);
  pointer-events:none;
}

/* Primary Gradient Button */
.btn-g{
  background:linear-gradient(135deg,#00C170 0%,#006A4E 40%,#004D38 100%);
  color:#fff;border-radius:12px;padding:12px 20px;font-size:14px;
  box-shadow:0 4px 15px rgba(29,191,115,.4),0 2px 4px rgba(0,0,0,.1),inset 0 1px 0 rgba(255,255,255,.25);
}
.btn-g:hover{
  background:linear-gradient(135deg,#00D480 0%,#00C170 40%,#006A4E 100%);
  transform:translateY(-2px) scale(1.02);
  box-shadow:0 8px 25px rgba(29,191,115,.5),0 4px 10px rgba(0,0,0,.12),inset 0 1px 0 rgba(255,255,255,.3);
}
.btn-g:active{transform:translateY(0) scale(.98);box-shadow:0 2px 8px rgba(29,191,115,.3);}
.btn-g:disabled{opacity:.5;cursor:not-allowed;transform:none;box-shadow:none;}

/* Outline Button */
.btn-o{
  background:rgba(255,255,255,.8);color:#006A4E;
  border:1.5px solid #006A4E!important;border-radius:12px;padding:11px 18px;font-size:13px;
  box-shadow:0 2px 8px rgba(29,191,115,.12),inset 0 1px 0 rgba(255,255,255,.9);
  backdrop-filter:blur(2px);
}
.btn-o:hover{
  background:linear-gradient(135deg,#E6F4EF,#F0FDF4);
  box-shadow:0 4px 16px rgba(29,191,115,.2),inset 0 1px 0 rgba(255,255,255,1);
  transform:translateY(-1px);
}

/* Ghost Button */
.btn-gh{
  background:rgba(244,249,246,.6);color:#4A6358;border-radius:10px;padding:7px 12px;font-size:13px;
  backdrop-filter:blur(2px);border:1px solid rgba(214,236,227,.5)!important;
}
.btn-gh:hover{
  background:rgba(232,251,242,.8);color:#006A4E;
  box-shadow:0 2px 8px rgba(29,191,115,.12);transform:translateY(-1px);
}

/* ─── Navigation ─── */
.nv{
  color:#4A6358;font-size:14px;font-weight:600;padding:8px 14px;border-radius:10px;
  cursor:pointer;transition:all .18s;background:none;border:none;
  font-family:'Hind Siliguri',sans-serif;white-space:nowrap;position:relative;
}
.nv:hover{color:#006A4E;background:rgba(232,251,242,.8);}
.nv.act{
  color:#006A4E;
  background:linear-gradient(135deg,rgba(232,251,242,.9),rgba(240,253,244,.9));
  box-shadow:0 2px 8px rgba(29,191,115,.12),inset 0 1px 0 rgba(255,255,255,.8);
}

/* ─── Badges & Tags ─── */
.badge{
  display:inline-flex;align-items:center;gap:3px;padding:3px 9px;border-radius:99px;
  font-size:11px;font-weight:700;
  box-shadow:0 1px 4px rgba(0,0,0,.08),inset 0 1px 0 rgba(255,255,255,.4);
}
.tag{
  background:linear-gradient(135deg,rgba(232,251,242,.9),rgba(209,250,229,.8));
  color:#065F46;padding:4px 11px;border-radius:99px;font-size:11px;font-weight:700;
  white-space:nowrap;border:1px solid rgba(29,191,115,.2);
  box-shadow:0 1px 4px rgba(29,191,115,.1);
}

/* ─── Stars ─── */
.star-on{color:#F59E0B;filter:drop-shadow(0 0 3px rgba(245,158,11,.4));}
.star-off{color:#E5E7EB;}

/* ─── Loading Dots ─── */
.dot{width:7px;height:7px;border-radius:50%;background:linear-gradient(135deg,#006A4E,#004D38);display:inline-block;animation:dot 1.2s ease-in-out infinite;box-shadow:0 0 6px rgba(29,191,115,.4);}
.dot:nth-child(2){animation-delay:.2s;}.dot:nth-child(3){animation-delay:.4s;}

/* ─── Form Elements ─── */
input,textarea,select{
  outline:none;font-family:'Hind Siliguri',sans-serif;
  transition:border-color .2s,box-shadow .2s;
}
input:focus,textarea:focus,select:focus{
  border-color:#006A4E!important;
  box-shadow:0 0 0 3px rgba(29,191,115,.15),0 2px 8px rgba(29,191,115,.1)!important;
}

/* ─── Section Typography ─── */
.sec-h{
  font-family:'Plus Jakarta Sans',sans-serif;
  font-size:clamp(20px,3vw,28px);font-weight:800;
  background:linear-gradient(135deg,#0C1C14 0%,#1A3D2E 60%,#006A4E 100%);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
}
.sec-s{font-size:15px;color:#8BA89A;margin-top:6px;line-height:1.6;}

/* ─── Overlay & Modal ─── */
.ov{
  position:fixed;inset:0;
  background:rgba(8,20,12,.65);
  backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);
  z-index:999;display:flex;align-items:center;justify-content:center;padding:16px;
  animation:fadeIn .2s ease;
}
.modal{
  background:rgba(255,255,255,.96);
  backdrop-filter:blur(6px) saturate(130%);-webkit-backdrop-filter:blur(6px) saturate(130%);
  border-radius:26px;max-height:90vh;overflow-y:auto;width:100%;
  box-shadow:0 32px 80px rgba(0,0,0,.2),0 8px 24px rgba(0,0,0,.1),inset 0 1px 0 rgba(255,255,255,.9);
  border:1px solid rgba(255,255,255,.7);
  animation:fadeUp .32s cubic-bezier(.16,1,.3,1) both;
}

/* ─── Gradient Text Utility ─── */
.grad-text{
  background:linear-gradient(135deg,#006A4E,#5DD4A0);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
}

/* ─── Responsive Breakpoints ─── */
@media(max-width:960px){
  .g6{grid-template-columns:repeat(4,1fr);}.g3{grid-template-columns:repeat(2,1fr);}
  .g4{grid-template-columns:repeat(2,1fr);}.hl{grid-template-columns:1fr;}.sb{display:none;}
  .wp{padding:0 18px;}.sp{padding:48px 0;}.htab{display:none!important;}
  .nsearch{display:none!important;}.dnav .nv{padding:6px 10px;font-size:13px;}
  .dbtn{padding:7px 12px!important;font-size:12px!important;}
}
@media(max-width:640px){
  .g6{grid-template-columns:repeat(3,1fr);gap:10px;}.g3{grid-template-columns:1fr;}
  .g4{grid-template-columns:repeat(2,1fr);gap:10px;}.g2{grid-template-columns:1fr;}
  .wp{padding:0 14px;}.sp{padding:20px 0 88px;}
  .mnav{
    display:flex;position:fixed;bottom:0;left:0;right:0;
    background:rgba(255,255,255,.98);
    backdrop-filter:blur(5px) saturate(120%);-webkit-backdrop-filter:blur(5px) saturate(120%);
    border-top:1px solid rgba(214,236,227,.8);z-index:800;height:62px;
    box-shadow:0 -8px 32px rgba(0,0,0,.1),inset 0 1px 0 rgba(255,255,255,.9);
  }
  .dnav{display:none!important;}.dbtn{display:none!important;}.nsearch{display:none!important;}
  .hs{padding:44px 16px 56px!important;}.hh{font-size:30px!important;}.hsw{max-width:100%!important;}
  .ov{align-items:flex-end;padding:0;}
  .modal{border-radius:26px 26px 0 0;max-height:92vh;animation:slideUp .35s cubic-bezier(.16,1,.3,1) both;}
  .card:hover{transform:none;box-shadow:0 4px 16px rgba(21,163,96,.06);}
  .eb{flex-direction:column!important;text-align:center!important;}
  .sl{grid-template-columns:1fr!important;}.fg{grid-template-columns:1fr!important;gap:20px!important;}
  .wg{grid-template-columns:repeat(2,1fr)!important;}.pgrid{grid-template-columns:1fr!important;}
}
@media(max-width:480px){
  .g6{grid-template-columns:repeat(2,1fr);gap:8px;}.g4{grid-template-columns:repeat(2,1fr);gap:8px;}
  .hh{font-size:26px!important;}.sec-h{font-size:20px!important;}
  .wp{padding:0 10px;}.modal{max-height:96vh;}
  .btn-g,.btn-o{padding:10px 14px!important;font-size:13px!important;}
  .hs{padding:36px 10px 52px!important;}
}`;

export const CSS_DARK = `
  html,body{background:#0A100E;color:#D4EDE4;}

  /* Dark Glass Cards */
  .card{
    background:rgba(14,31,24,.97)!important;
    backdrop-filter:blur(5px) saturate(120%)!important;
    -webkit-backdrop-filter:blur(5px) saturate(120%)!important;
    border-color:rgba(30,69,53,.8)!important;
    box-shadow:0 4px 20px rgba(0,0,0,.3),0 1px 3px rgba(0,0,0,.2),inset 0 1px 0 rgba(34,212,127,.06)!important;
  }
  .card:hover{
    border-color:rgba(34,212,127,.3)!important;
    box-shadow:0 20px 50px rgba(0,0,0,.4),0 0 0 1px rgba(34,212,127,.15),inset 0 1px 0 rgba(34,212,127,.08)!important;
  }
  
  /* Dark Buttons */
  .btn-o{
    background:rgba(14,31,24,.8)!important;
    border-color:#00C170!important;
    box-shadow:0 2px 12px rgba(34,212,127,.15),inset 0 1px 0 rgba(255,255,255,.05)!important;
    backdrop-filter:blur(2px)!important;
  }
  .btn-o:hover{background:rgba(34,212,127,.12)!important;}
  .btn-gh{
    color:#7AB89E!important;
    background:rgba(14,31,24,.6)!important;
    border-color:rgba(30,69,53,.6)!important;
  }
  .btn-gh:hover{background:rgba(30,69,53,.8)!important;color:#00C170!important;}
  
  /* Dark Nav */
  .nv{color:#7AB89E!important;}
  .nv:hover{background:rgba(13,46,34,.8)!important;color:#00C170!important;}
  .nv.act{
    background:linear-gradient(135deg,rgba(13,46,34,.9),rgba(13,46,34,.7))!important;
    color:#00C170!important;
    border:1px solid rgba(34,212,127,.2)!important;
    box-shadow:0 0 0 1px rgba(34,212,127,.1),inset 0 1px 0 rgba(34,212,127,.06)!important;
  }
  
  /* Dark Tags & Badges */
  .tag{
    background:linear-gradient(135deg,rgba(13,46,34,.9),rgba(13,46,34,.7))!important;
    color:#00D480!important;
    border-color:rgba(34,212,127,.2)!important;
  }
  .badge{filter:brightness(.95);}
  
  /* Dark Forms */
  input,textarea,select{
    background:rgba(8,15,11,.8)!important;color:#D4EDE4!important;
    border-color:rgba(30,69,53,.8)!important;
    backdrop-filter:blur(2px)!important;
  }
  input:focus,textarea:focus,select:focus{
    border-color:#00C170!important;
    box-shadow:0 0 0 3px rgba(34,212,127,.12),0 2px 8px rgba(34,212,127,.08)!important;
  }
  
  /* Dark Bottom Nav */
  .mnav{
    background:rgba(8,15,11,.92)!important;
    border-color:rgba(30,69,53,.8)!important;
    box-shadow:0 -8px 32px rgba(0,0,0,.4),inset 0 1px 0 rgba(34,212,127,.08)!important;
  }
  
  /* Dark Modal */
  .modal{
    background:rgba(10,22,16,.96)!important;color:#D4EDE4;
    border-color:rgba(30,69,53,.6)!important;
    box-shadow:0 32px 80px rgba(0,0,0,.5),0 0 0 1px rgba(34,212,127,.1),inset 0 1px 0 rgba(34,212,127,.06)!important;
  }
  
  /* Dark Overlay */
  .ov{background:rgba(4,10,7,.75)!important;}
  
  /* Dark Scrollbar */
  ::-webkit-scrollbar-thumb{background:linear-gradient(180deg,#00C170,#009954)!important;}
  
  /* Dark Section Header */
  .sec-h{
    background:linear-gradient(135deg,#D4EDE4 0%,#7AB89E 60%,#00C170 100%)!important;
    -webkit-background-clip:text!important;-webkit-text-fill-color:transparent!important;background-clip:text!important;
  }
`;
