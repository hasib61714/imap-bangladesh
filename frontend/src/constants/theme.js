export const C_LIGHT = { p:"#1DBF73",pdk:"#15A360",plt:"#E8FBF2",acc:"#F5A623",dark:"#0C1C14",text:"#142018",sub:"#4A6358",muted:"#8BA89A",bdr:"#D6ECE3",bg:"#F4F9F6",card:"#FFFFFF",red:"#E03131" };
export const C_DARK  = { p:"#1DBF73",pdk:"#15A360",plt:"#0D2E22",acc:"#F5A623",dark:"#E8F5F0",text:"#D4EDE4",sub:"#7AB89E",muted:"#4A7A63",bdr:"#1A3D2E",bg:"#0C1C14",card:"#112820",red:"#F87171" };

export const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@300;400;500;600;700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html,body{font-family:'Hind Siliguri','Noto Sans Bengali',sans-serif;background:#F4F9F6;color:#142018;-webkit-font-smoothing:antialiased;}
::-webkit-scrollbar{width:4px;height:4px;}::-webkit-scrollbar-thumb{background:#D6ECE3;border-radius:99px;}
@keyframes fadeUp{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
@keyframes fadeIn{from{opacity:0;}to{opacity:1;}}
@keyframes slideUp{from{transform:translateY(100%);opacity:0;}to{transform:translateY(0);opacity:1;}}
@keyframes pulse{0%,100%{transform:scale(1);}50%{transform:scale(1.06);}}
@keyframes glow{0%,100%{box-shadow:0 0 18px #1DBF7344;}50%{box-shadow:0 0 32px #1DBF7377;}}
@keyframes ticker{0%{transform:translateX(0);}100%{transform:translateX(-50%);}}
@keyframes dot{0%,60%,100%{transform:translateY(0);}30%{transform:translateY(-5px);}}
@keyframes bounce{0%,80%,100%{transform:scale(0);opacity:.4;}40%{transform:scale(1);opacity:1;}}
.fu{animation:fadeUp .45s ease both;}.fi{animation:fadeIn .25s ease both;}
.sx{overflow-x:auto;scrollbar-width:none;}.sx::-webkit-scrollbar{display:none;}
.jc{display:flex;align-items:center;justify-content:center;}.row{display:flex;align-items:center;}
.card{background:#fff;border-radius:16px;border:1px solid #D6ECE3;transition:transform .2s,box-shadow .2s,border-color .2s;}
.card:hover{transform:translateY(-3px);box-shadow:0 10px 30px rgba(21,163,96,.10);border-color:#1DBF7344;}
.pcard::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#1DBF73,#6EE7B7);opacity:0;transition:opacity .2s;border-radius:16px 16px 0 0;}
.pcard:hover::before{opacity:1;}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;font-family:'Hind Siliguri',sans-serif;cursor:pointer;border:none;transition:all .18s;font-weight:600;}
.btn-g{background:linear-gradient(135deg,#1DBF73,#15A360);color:#fff;border-radius:10px;padding:12px 20px;font-size:14px;}
.btn-g:hover{filter:brightness(1.06);transform:translateY(-1px);box-shadow:0 5px 16px #1DBF7355;}
.btn-g:disabled{opacity:.5;cursor:not-allowed;transform:none;filter:none;}
.btn-o{background:#fff;color:#1DBF73;border:1.5px solid #1DBF73!important;border-radius:10px;padding:11px 18px;font-size:13px;}
.btn-o:hover{background:#E8FBF2;}
.btn-gh{background:transparent;color:#4A6358;border-radius:8px;padding:7px 12px;font-size:13px;}
.btn-gh:hover{background:#F4F9F6;color:#1DBF73;}
.nv{color:#4A6358;font-size:14px;font-weight:500;padding:8px 13px;border-radius:8px;cursor:pointer;transition:all .15s;background:none;border:none;font-family:'Hind Siliguri',sans-serif;white-space:nowrap;}
.nv:hover,.nv.act{color:#1DBF73;background:#E8FBF2;}
.badge{display:inline-flex;align-items:center;gap:3px;padding:3px 9px;border-radius:99px;font-size:11px;font-weight:600;}
.tag{background:#E8FBF2;color:#1DBF73;padding:4px 10px;border-radius:99px;font-size:11px;font-weight:600;white-space:nowrap;}
.star-on{color:#F59E0B;}.star-off{color:#D1D5DB;}
.dot{width:7px;height:7px;border-radius:50%;background:#1DBF73;display:inline-block;animation:dot 1.2s ease-in-out infinite;}
.dot:nth-child(2){animation-delay:.2s;}.dot:nth-child(3){animation-delay:.4s;}
input,textarea,select{outline:none;font-family:'Hind Siliguri',sans-serif;}
.sec-h{font-family:'Plus Jakarta Sans',sans-serif;font-size:clamp(20px,3vw,28px);font-weight:800;color:#142018;}
.sec-s{font-size:15px;color:#8BA89A;margin-top:6px;line-height:1.6;}
.ov{position:fixed;inset:0;background:rgba(0,0,0,.52);z-index:999;display:flex;align-items:center;justify-content:center;padding:16px;animation:fadeIn .2s ease;}
.modal{background:#fff;border-radius:22px;max-height:90vh;overflow-y:auto;width:100%;animation:fadeUp .3s ease;}
.g6{display:grid;grid-template-columns:repeat(6,1fr);gap:14px;}
.g3{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;}
.g4{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;}
.g2{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;}
.hl{display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:center;}
.sb{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
.wp{max-width:1280px;margin:0 auto;padding:0 28px;}
.sp{padding:72px 0;}
.mnav{display:none;}.dnav{display:flex;}
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
  .mnav{display:flex;position:fixed;bottom:0;left:0;right:0;background:#fff;border-top:1px solid #D6ECE3;z-index:800;height:62px;box-shadow:0 -4px 20px rgba(0,0,0,.07);}
  .dnav{display:none!important;}.dbtn{display:none!important;}.nsearch{display:none!important;}
  .hs{padding:44px 16px 56px!important;}.hh{font-size:30px!important;}.hsw{max-width:100%!important;}
  .ov{align-items:flex-end;padding:0;}.modal{border-radius:22px 22px 0 0;max-height:92vh;animation:slideUp .3s ease;}
  .card:hover{transform:none;box-shadow:none;}
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
  html,body{background:#0C1C14;color:#D4EDE4;}
  .card{background:#112820!important;border-color:#1A3D2E!important;}
  .card:hover{border-color:#1DBF7344!important;box-shadow:0 10px 30px rgba(29,191,115,.12)!important;}
  .btn-o{background:#112820!important;border-color:#1DBF73!important;}
  .btn-gh{color:#7AB89E!important;}.btn-gh:hover{background:#1A3D2E!important;color:#1DBF73!important;}
  .nv{color:#7AB89E!important;}.nv:hover,.nv.act{background:#0D2E22!important;color:#1DBF73!important;}
  .tag{background:#0D2E22!important;color:#1DBF73!important;}
  .badge{filter:brightness(.9);}
  input,textarea,select{background:#112820!important;color:#D4EDE4!important;border-color:#1A3D2E!important;}
  .mnav{background:#112820!important;border-color:#1A3D2E!important;}
  .modal{background:#112820!important;color:#D4EDE4;}
  .ov{background:rgba(0,0,0,.72)!important;}
  ::-webkit-scrollbar-thumb{background:#1A3D2E!important;}
  .sec-h{color:#D4EDE4!important;}
`;
