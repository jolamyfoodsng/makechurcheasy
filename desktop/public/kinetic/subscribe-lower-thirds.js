/*
 * Make Church Easy — "Subscribe" lower thirds (5 straps), registered into the
 * Motion engine (kinetic-lower-thirds.js must load first).
 *
 * Built from the subscribe-lower-thirds test bench: each strap was designed on a
 * 960x540 stage. Here the stage is cropped to the strap's own box and scaled, so
 * the Dock's Position and Size controls work like the other Motion straps.
 * The on-screen "action" (button flips to SUBSCRIBED, bell rings) plays at the end
 * of the IN animation, so one press of Send to OBS gives the full moment.
 *
 * Accent colour (red in the reference) follows the strap's colour setting.
 */
(function (global) {
  "use strict";
  var api = global.MCEKinetic;
  if (!api || !api.register) return;
  var gsap = global.gsap;

  var W = 960, H = 540, DARK = '#2e2e2e', WHITE = '#fff';
  var RED = '#fe2c2d'; // reassigned per build from the strap's colour setting
  var NS = 'http://www.w3.org/2000/svg';
  var FONT = 'Montserrat,"MCE Archivo",Arial,Helvetica,sans-serif';
  function initials(name) {
    var w = String(name || '').trim().split(/\s+/).filter(Boolean);
    return ((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase();
  }

/* ---------- tiny DOM helpers ---------- */
function el(root,css,html,tag){const d=document.createElement(tag||'div');d.style.cssText='position:absolute;'+css;if(html!=null)d.innerHTML=html;root.appendChild(d);return d}
function svg(root,vb,inner,css){const s=document.createElementNS(NS,'svg');s.setAttribute('viewBox',vb||`0 0 ${W} ${H}`);s.style.cssText='position:absolute;overflow:visible;'+(css||`left:0;top:0;width:${W}px;height:${H}px`);s.innerHTML=inner||'';root.appendChild(s);return s}
function txt(root,s,o){
  const d=el(root,`left:${o.x}px;top:${o.y}px;font:${o.w||800} ${o.size}px/1 ${FONT};color:${o.color||'#fff'};letter-spacing:${o.ls||0}px;white-space:nowrap;${o.css||''}`);
  d.textContent=s;
  gsap.set(d,{xPercent:o.ax==='l'?0:o.ax==='r'?-100:-50,yPercent:-50});
  return d;
}
function letters(d){const s=d.textContent;d.textContent='';return [...s].map(ch=>{const sp=document.createElement('span');sp.style.cssText='display:inline-block;white-space:pre';sp.textContent=ch;d.appendChild(sp);return sp})}
function reveal(tl,sp,at,dur,o){o=o||{};tl.fromTo(sp,{opacity:0,y:o.y||0,filter:o.blur?`blur(${o.blur}px)`:'blur(0px)'},{opacity:1,y:0,filter:'blur(0px)',duration:o.each||.16,ease:'power1.out',stagger:dur/Math.max(1,sp.length)},at)}
function unreveal(tl,sp,at,dur,o){o=o||{};tl.to(sp,{opacity:0,y:o.y||0,filter:o.blur?`blur(${o.blur}px)`:'blur(0px)',duration:o.each||.12,ease:'power1.in',stagger:{each:dur/Math.max(1,sp.length),from:o.from||'start'}},at)}
const ICON={
  arrow:'<path d="M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11z" stroke-width="1.2" stroke-linejoin="round"/>',
  thumb:'<path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/>',
  bell:'<path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>'
};
function icon(root,name,cx,cy,size,color,extra){
  const s=svg(root,'0 0 24 24',`<g fill="${color}" stroke="${color}">${ICON[name]}</g>`,`left:${cx-size/2}px;top:${cy-size/2}px;width:${size}px;height:${size}px;${extra||''}`);
  return s;
}
function label(root,text,css,font){const d=el(root,`display:flex;align-items:center;justify-content:center;white-space:nowrap;font:${font};${css}`);const sp=document.createElement('span');sp.textContent=text;sp.style.display='inline-block';d.appendChild(sp);d.sp=sp;return d}

/* ---------- motion-graphics helpers ---------- */
function burst(root,tl,at,cx,cy,o){o=o||{};
  const n=o.n||10,r0=o.r0||14,r1=o.r1||70,len=o.len||16,th=o.th||6,dur=o.dur||.55,cols=o.cols||[WHITE,RED],a0=o.a0||0;
  for(let i=0;i<n;i++){
    const a=a0+i/n*Math.PI*2+((o.jit||0)*(Math.sin(i*12.9)));
    const p=el(root,`left:${cx-len/2}px;top:${cy-th/2}px;width:${len}px;height:${th}px;border-radius:${th}px;background:${cols[i%cols.length]};opacity:0`);
    gsap.set(p,{rotation:a*180/Math.PI});
    const t0=at+(o.stag||0)*i,sx=Math.cos(a)*r0,sy=Math.sin(a)*r0;
    tl.fromTo(p,{x:sx,y:sy,scaleX:.35,opacity:0},{x:sx,y:sy,scaleX:.35,opacity:1,duration:.001},t0)
      .to(p,{x:Math.cos(a)*r1,y:Math.sin(a)*r1,opacity:0,scaleX:1,duration:dur,ease:'power2.out'},t0+.001);
  }
}
function trace(tl,paths,at,hd,tailAt,td,ease){
  const o={h:0,t:0};
  const apply=()=>{const len=Math.max(0,o.h-o.t);paths.forEach(p=>{p.style.strokeDasharray=`${len} 3`;p.style.strokeDashoffset=-o.t;p.style.visibility=len>.0008?'visible':'hidden'})};
  apply();
  tl.to(o,{h:1,duration:hd,ease:ease||'power2.out',onUpdate:apply},at);
  if(tailAt!=null)tl.to(o,{t:1,duration:td,ease:ease||'power2.inOut',onUpdate:apply},tailAt);
  return o;
}
function pop(tl,e,at,from,to,dur,ease){tl.fromTo(e,Object.assign({},from,{opacity:0}),Object.assign({},from,{opacity:1,duration:.001}),at).to(e,Object.assign({},to,{duration:dur,ease:ease||'power2.inOut'}),at+.001)}
function rnd(seed){let s=seed;return()=>{s=(s*16807)%2147483647;return(s-1)/2147483646}}
function swirl(root,tl,at,cx,cy,o){
  const R=rnd(o.seed||7);const s=svg(root);const n=o.n||6;const ps=[];
  for(let i=0;i<n;i++){
    const turns=.9+R()*1.2,a0=R()*6.28,rr=.4+R()*.6;const st=44,pts=[];
    for(let k=0;k<=st;k++){const t=k/st,ang=a0+t*turns*6.283,rad=(.2+.8*t)*rr;
      pts.push([cx+Math.cos(ang)*o.rx*rad*(1+.1*Math.sin(k*1.7)),cy+Math.sin(ang)*o.ry*rad*(1+.1*Math.cos(k*1.3))])}
    let d='M'+pts[0][0].toFixed(1)+' '+pts[0][1].toFixed(1);
    for(let k=1;k<pts.length-1;k++){const m=[(pts[k][0]+pts[k+1][0])/2,(pts[k][1]+pts[k+1][1])/2];d+='Q'+pts[k][0].toFixed(1)+' '+pts[k][1].toFixed(1)+' '+m[0].toFixed(1)+' '+m[1].toFixed(1)}
    const w=(o.cols||[WHITE,RED]);
    s.insertAdjacentHTML('beforeend',`<path d="${d}" pathLength="1" fill="none" stroke="${w[1]}" stroke-width="${(o.sw||5)-1}" stroke-linecap="round" transform="translate(2,3)"/><path d="${d}" pathLength="1" fill="none" stroke="${w[0]}" stroke-width="${o.sw||5}" stroke-linecap="round"/>`);
  }
  const all=[...s.querySelectorAll('path')];
  const groups=[];for(let i=0;i<n;i++)groups.push([all[i*2],all[i*2+1]]);
  groups.forEach((g,i)=>trace(tl,g,at+i*(o.dur||.6)*.06,(o.dur||.6)*.55,at+(o.dur||.6)*.35+i*.03,(o.dur||.6)*.6,'power1.inOut'));
  return s;
}
function blobPath(R,cx,cy,r,n,lump){
  const pts=[];for(let i=0;i<n;i++){const a=i/n*Math.PI*2,rr=r*(1-lump+R()*lump*2);pts.push([cx+Math.cos(a)*rr,cy+Math.sin(a)*rr])}
  const m=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2];let d=`M${m(pts[n-1],pts[0]).join(' ')}`;
  for(let i=0;i<n;i++){const c=pts[i],e=m(pts[i],pts[(i+1)%n]);d+=`Q${c.join(' ')} ${e.join(' ')}`}
  return d+'Z';
}
/* white ink splash with red rim, used by the "ink" transitions */
function ink(root,tl,at,cx,cy,o){
  const R=rnd(o.seed||3);const s=svg(root);const dur=o.dur||.6;
  const n=o.n||5;
  /* thick swirl strokes: white body with a red core */
  for(let i=0;i<n;i++){
    const turns=.8+R()*.9,a0=R()*6.28,rr=.45+R()*.55;const st=40,pts=[];
    for(let k=0;k<=st;k++){const t=k/st,ang=a0+t*turns*6.283,rad=(.25+.75*t)*rr;
      pts.push([cx+Math.cos(ang)*o.rx*rad*(1+.12*Math.sin(k*1.9)),cy+Math.sin(ang)*o.ry*rad*(1+.12*Math.cos(k*1.4))])}
    let d='M'+pts[0][0].toFixed(1)+' '+pts[0][1].toFixed(1);
    for(let k=1;k<pts.length-1;k++){const m=[(pts[k][0]+pts[k+1][0])/2,(pts[k][1]+pts[k+1][1])/2];d+='Q'+pts[k][0].toFixed(1)+' '+pts[k][1].toFixed(1)+' '+m[0].toFixed(1)+' '+m[1].toFixed(1)}
    s.insertAdjacentHTML('beforeend',`<path d="${d}" pathLength="1" fill="none" stroke="${RED}" stroke-width="${(o.sw||13)+5}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" pathLength="1" fill="none" stroke="#fff" stroke-width="${o.sw||13}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  const all=[...s.querySelectorAll('path')];
  for(let i=0;i<n;i++)trace(tl,[all[i*2],all[i*2+1]],at+i*dur*.05,dur*.5,at+dur*.3+i*dur*.03,dur*.55,'power1.inOut');
  /* a few flying droplets */
  const blobs=[];
  for(let i=0;i<(o.drops||6);i++){
    const bx=cx+(R()-.5)*o.rx*2.4,by=cy+(R()-.5)*o.ry*2.8,br=7+R()*11;
    const g=document.createElementNS(NS,'g');g.style.opacity=0;
    g.innerHTML=`<path d="${blobPath(R,bx,by,br,8,.3)}" fill="${RED}" transform="translate(0,3)"/><path d="${blobPath(R,bx,by,br*.88,8,.3)}" fill="#fff"/>`;
    s.appendChild(g);gsap.set(g,{transformOrigin:`${bx}px ${by}px`});
    const t0=at+dur*.2+R()*dur*.4;
    tl.fromTo(g,{opacity:0,scale:0},{opacity:1,scale:1,duration:.001},t0).to(g,{scale:1.1,duration:.2,ease:'power1.out'},t0+.001).to(g,{opacity:0,scale:.2,duration:.25,ease:'power2.in'},t0+.2);
  }
  return s;
}
/* flame-like burst (gamer sample) */
function flame(root,tl,at,cx,cy,o){
  const R=rnd(o.seed||11);const s=svg(root);const variants=[];
  for(let v=0;v<3;v++){
    const g=document.createElementNS(NS,'g');g.style.opacity=0;
    let h='';
    const parts=o.parts||5;
    for(let i=0;i<parts;i++){const bx=cx+(R()-.5)*o.rx*2,by=cy+(R()-.5)*o.ry*2,br=o.r*(.55+R()*.6);
      h+=`<path d="${blobPath(R,bx,by,br,10,.34)}" fill="${RED}" stroke="${RED}" stroke-width="10" stroke-linejoin="round"/>`;}
    for(let i=0;i<parts;i++){const bx=cx+(R()-.5)*o.rx*1.5,by=cy+(R()-.5)*o.ry*1.4,br=o.r*(.3+R()*.35);
      h+=`<path d="${blobPath(R,bx,by,br,9,.34)}" fill="#ffe94a"/>`;}
    g.innerHTML=h;s.appendChild(g);variants.push(g);
  }
  gsap.set(variants,{transformOrigin:`${cx}px ${cy}px`});
  const dur=o.dur||.6,steps=Math.round(dur*14);
  for(let k=0;k<steps;k++){
    const t=k/steps,v=variants[k%3];
    const sc=Math.sin(Math.min(1,t*1.15)*Math.PI*.5)*(1-Math.max(0,t-.62)*1.1);
    tl.set(variants,{opacity:0},at+t*dur).set(v,{opacity:1,scale:Math.max(.05,sc)},at+t*dur);
  }
  tl.set(variants,{opacity:0},at+dur);
  burst(root,tl,at+dur*.55,cx,cy,{n:10,r0:o.rx*.4,r1:o.rx*1.1,len:10,th:5,dur:.45,cols:[RED,'#ffe94a'],jit:.3});
  return s;
}
function pill(root,css){return el(root,css)}

/* ---------- the 12 samples ---------- */
const SAMPLES=[];
function add(s){SAMPLES.push(s)}

/* 1 — share-arrow pill */
add({id:1,name:'Share-arrow pill',desc:'Red dot → circle → white pill',hold:3,
fields:[{k:'main',l:'Title',d:'SUBSCRIBE'}],
build(root,P){
  const cx=262,cy=274,R=74,PH=126,FULL=577;
  const g=el(root,`left:0;top:0;width:${W}px;height:${H}px`);
  const red=el(g,`left:${cx-PH/2}px;top:${cy-PH/2}px;width:${PH}px;height:${PH}px;border-radius:${PH/2}px;background:${RED};opacity:0`);
  const wht=el(g,`left:${cx-PH/2}px;top:${cy-PH/2}px;width:${PH}px;height:${PH}px;border-radius:${PH/2}px;background:#fff;box-shadow:0 6px 16px rgba(0,0,0,.28);opacity:0`);
  const circ=el(g,`left:${cx-R}px;top:${cy-R}px;width:${2*R}px;height:${2*R}px;border-radius:50%;background:${RED}`);
  const ar=icon(g,'arrow',cx,cy,112,'#fff');
  const t=txt(g,P.main,{x:355,y:cy,size:56,color:'#262626',ax:'l',w:800});const L=letters(t);
  const I=gsap.timeline();
  burst(g,I,0,cx,cy,{n:8,r0:48,r1:112,len:24,th:6,dur:.5,cols:[WHITE,RED],a0:.4});
  I.set([red,wht],{opacity:1},.62)
   .fromTo(circ,{scale:0},{scale:1,duration:.32,ease:'back.out(1.8)'},.12)
   .fromTo(ar,{scale:0,rotation:-35},{scale:1,rotation:0,duration:.3,ease:'back.out(2)'},.3)
   .fromTo(red,{width:PH},{width:FULL,duration:.8,ease:'power3.inOut'},.62)
   .fromTo(wht,{width:PH},{width:FULL-14,duration:.8,ease:'power3.inOut'},.7)
   .to(wht,{width:FULL,duration:.2,ease:'power1.out'},1.5);
  reveal(I,L,.95,.6,{blur:3});
  burst(g,I,.8,740,214,{n:3,r0:0,r1:34,len:26,th:7,dur:.6,cols:[RED,WHITE],a0:-1.2});
  burst(g,I,.9,740,334,{n:3,r0:0,r1:34,len:26,th:7,dur:.6,cols:[WHITE,RED],a0:1.2});
  const O=gsap.timeline();
  unreveal(O,L,.3,.45,{from:'end'});
  O.to(wht,{width:PH,duration:.6,ease:'power3.inOut'},.55)
   .to(red,{width:PH,duration:.5,ease:'power3.inOut'},.8)
   .to(ar,{scale:0,duration:.3,ease:'power2.in'},1.35)
   .to(circ,{scale:0,duration:.32,ease:'back.in(2)'},1.35);
  burst(g,O,1.65,cx,cy,{n:6,r0:6,r1:34,len:10,th:5,dur:.35});
  O.to(red,{opacity:0,duration:.01},1.3).to(wht,{opacity:0,duration:.01},1.3);
  return {in:I,out:O};
}});

/* 2 — photo + subscribe card */
add({id:2,name:'Photo + subscribe card',desc:'Avatar with white box, red button and name bar',hold:3.2,
fields:[{k:'main',l:'Button',d:'SUBSCRIBE'},{k:'done',l:'Button after click',d:'SUBSCRIBED'},{k:'name',l:'Channel name',d:'CHANNEL NAME'}],avatar:true,
build(root,P){
  const g=el(root,`left:0;top:0;width:${W}px;height:${H}px`);
  const av=el(g,`left:193px;top:221px;width:150px;height:150px;${P.avatar?`background:url("${String(P.avatar).replace(/["\\\n\r]/g,'')}") center/cover`:'background:#1b1b1d'}`);
  if(!P.avatar)label(av,initials(P.name),'inset:0;color:#fff',`900 54px/1 ${FONT}`);
  const wb=el(g,'left:343px;top:221px;width:422px;height:91px;background:#fff;box-shadow:0 4px 14px rgba(0,0,0,.2)');
  const nb=el(g,'left:343px;top:312px;width:362px;height:59px;background:'+RED);
  const nt=label(g,P.name,'left:343px;top:312px;width:362px;height:59px;color:#fff;letter-spacing:.5px',`800 27px/1 ${FONT}`);const NL=letters(nt.sp);
  const btn=label(g,P.main,`left:404px;top:232px;width:300px;height:67px;background:${RED};color:#fff;letter-spacing:.5px`,`900 38px/1 ${FONT}`);
  const I=gsap.timeline();
  burst(g,I,.3,268,296,{n:8,r0:96,r1:130,len:16,th:5,dur:.45,cols:[WHITE,RED],a0:.2});
  I.fromTo(av,{scale:0,rotation:-20},{scale:1,rotation:0,duration:.5,ease:'back.out(1.6)'},.34)
   .fromTo(wb,{clipPath:'inset(0 100% 0 0)'},{clipPath:'inset(0 0% 0 0)',duration:.45,ease:'power3.out'},1.1)
   .fromTo(nb,{clipPath:'inset(0 100% 0 0)'},{clipPath:'inset(0 0% 0 0)',duration:.4,ease:'power3.out'},1.14)
   .fromTo(btn,{scale:0},{scale:1,duration:.3,ease:'back.out(2)'},1.52);
  reveal(I,NL,1.2,.45,{blur:2});
  burst(g,I,1.2,720,314,{n:2,r0:0,r1:60,len:34,th:9,dur:.6,cols:[WHITE,RED],a0:0});
  const M=gsap.timeline();
  M.to(btn,{scaleX:.62,duration:.16,ease:'power2.in'},0)
   .call(()=>{btn.sp.textContent=P.done;btn.sp.style.fontSize='33px'},null,.16)
   .to(btn,{scaleX:1,duration:.4,ease:'back.out(2)'},.16);
  const O=gsap.timeline();
  O.to(btn,{scale:.12,duration:.22,ease:'power2.in'},.38).to(btn,{opacity:0,duration:.03},.6);
  unreveal(O,NL,.5,.2,{from:'end'});
  O.to(nb,{clipPath:'inset(0 100% 0 0)',duration:.35,ease:'power2.in'},.7)
   .to(wb,{clipPath:'inset(0 100% 0 0)',duration:.3,ease:'power2.in'},.88);
  burst(g,O,1.14,430,290,{n:8,r0:10,r1:70,len:22,th:8,dur:.5,cols:[WHITE,RED]});
  O.to(av,{scale:0,rotation:15,duration:.3,ease:'back.in(1.7)'},1.2);
  return {in:I,mid:M,out:O,reset(){btn.sp.textContent=P.main;btn.sp.style.fontSize='38px'}};
}});

/* 4 — red bar, like + bell */
add({id:4,name:'Red bar · like + bell',desc:'Red slab wipe, thumbs-up and ringing bell',hold:3.4,
fields:[{k:'main',l:'Title',d:'SUBSCRIBE'}],
build(root,P){
  const X=216,Y=205,BW=532,BH=130;
  const g=el(root,`left:0;top:0;width:${W}px;height:${H}px`);
  const wrap=el(g,`left:${X}px;top:${Y}px;width:${BW}px;height:${BH}px`);
  const white=el(wrap,`inset:0;background:#fff`),pink2=el(wrap,`inset:0;background:#fbb4b5`),pink1=el(wrap,`inset:0;background:#fd7f80`),redb=el(wrap,`inset:0;background:${RED}`);
  const thumb=icon(g,'thumb',272,270,54,'#fff'),bell=icon(g,'bell',695,268,54,'#fff');
  const t=txt(g,P.main,{x:332,y:270,size:50,ax:'l',w:800});const L=letters(t);
  const I=gsap.timeline();
  const wipe=(e,s,d)=>I.fromTo(e,{clipPath:'inset(0 100% 0 0)'},{clipPath:'inset(0 0% 0 0)',duration:d,ease:'power3.out'},s);
  wipe(white,.55,.42);wipe(pink2,.62,.4);wipe(pink1,.68,.4);wipe(redb,.74,.4);
  I.to(white,{clipPath:'inset(0 0% 0 100%)',duration:.4,ease:'power3.inOut'},.78)
   .to(pink2,{clipPath:'inset(0 0% 0 100%)',duration:.4,ease:'power3.inOut'},.84)
   .to(pink1,{clipPath:'inset(0 0% 0 100%)',duration:.4,ease:'power3.inOut'},.9);
  reveal(I,L,.85,.5,{blur:3});
  I.fromTo(thumb,{scale:0,rotation:-40},{scale:1,rotation:0,duration:.3,ease:'back.out(2.2)'},1.55);
  I.fromTo(bell,{scale:0,rotation:40},{scale:1,rotation:0,duration:.3,ease:'back.out(2.2)'},2.55);
  I.to(bell,{rotation:0,duration:.01},3);
  const M=gsap.timeline();
  burst(g,M,.1,272,270,{n:4,r0:34,r1:44,len:12,th:3,dur:.4,cols:[WHITE],a0:0});
  M.to(thumb,{scale:.7,duration:.12},.0).to(thumb,{scale:1,duration:.3,ease:'back.out(3)'},.12);
  const ring=(a,s)=>{M.to(bell,{rotation:a,transformOrigin:'50% 15%',duration:.09,ease:'sine.inOut'},s)};
  [[16,.5],[-16,.59],[14,.68],[-14,.77],[10,.86],[-8,.95],[0,1.04]].forEach(x=>ring(x[0],x[1]));
  burst(g,M,.5,697,268,{n:6,r0:34,r1:46,len:10,th:3,dur:.45,cols:[WHITE],a0:.3});
  const O=gsap.timeline();
  [[16,0],[-16,.09],[12,.18]].forEach(x=>O.to(bell,{rotation:x[0],transformOrigin:'50% 15%',duration:.09},x[1]));
  O.to(t,{x:14,duration:.3,ease:'power1.inOut'},.2).to([t,bell],{opacity:0,duration:.25},.4);
  O.to(thumb,{scale:0,duration:.25,ease:'back.in(2)'},.9);
  [[white,.7],[pink2,.74],[pink1,.78],[redb,.82]].forEach(([e,s])=>{O.to(e,{clipPath:'inset(0 100% 0 0)',duration:.55,ease:'power2.inOut'},s)});
  return {in:I,mid:M,out:O};
}});

/* 5 — swoosh text */
add({id:5,name:'Tilted swoosh text',desc:'Italic title with red "on channel" tag and ink strokes',hold:3,
fields:[{k:'main',l:'Title',d:'SUBSCRIBE'},{k:'sub',l:'Tag',d:'ON CHANNEL'}],
build(root,P){
  const g=el(root,`left:0;top:0;width:${W}px;height:${H}px`);
  const grp=el(g,'left:480px;top:240px;width:0;height:0');gsap.set(grp,{rotation:-5});
  const t=txt(grp,P.main,{x:0,y:-14,size:72,w:900,css:'text-shadow:0 4px 12px rgba(0,0,0,.35);font-style:italic'});
  const bar=el(grp,`left:-100px;top:12px;width:208px;height:26px;background:${RED}`);
  const bt=label(bar,P.sub,'inset:0;color:#fff;letter-spacing:.5px',`800 17px/1 ${FONT}`);bt.style.fontStyle='italic';
  gsap.set([t,bar],{skewX:-8});
  const sv=svg(g);sv.insertAdjacentHTML('beforeend',`<path d="M250 205 C 330 120 560 120 700 190" pathLength="1" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" id="s5a"/><path d="M270 300 C 400 330 600 320 720 250" pathLength="1" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" id="s5b"/><ellipse cx="500" cy="262" rx="70" ry="26" fill="none" stroke="${RED}" stroke-width="7" pathLength="1" id="s5r" transform="rotate(-8 500 262)"/>`);
  const sa=sv.querySelector('#s5a'),sb=sv.querySelector('#s5b'),sr=sv.querySelector('#s5r');
  const I=gsap.timeline();
  I.fromTo(t,{x:-330,opacity:0,filter:'blur(14px)'},{x:0,opacity:1,filter:'blur(0px)',duration:.55,ease:'power3.out'},.25);
  trace(I,[sa],.3,.35,.55,.35);trace(I,[sb],.4,.35,.65,.35);
  trace(I,[sr],.72,.2,.88,.25,'power2.inOut');
  I.fromTo(bar,{clipPath:'inset(0 100% 0 0)'},{clipPath:'inset(0 0% 0 0)',duration:.3,ease:'power3.out'},.86);
  const O=gsap.timeline();
  const sv2=svg(g);sv2.insertAdjacentHTML('beforeend',`<path d="M250 230 C 380 190 560 280 720 240" pathLength="1" fill="none" stroke="${RED}" stroke-width="7" stroke-linecap="round" id="o5a"/><path d="M270 262 C 420 300 560 200 740 225" pathLength="1" fill="none" stroke="${RED}" stroke-width="5" stroke-linecap="round" id="o5b"/><path d="M300 175 C 380 120 520 150 640 195" pathLength="1" fill="none" stroke="${RED}" stroke-width="5" stroke-linecap="round" id="o5c"/>`);
  trace(O,[sv2.querySelector('#o5a')],.2,.4,.7,.35);trace(O,[sv2.querySelector('#o5b')],.35,.4,.85,.35);trace(O,[sv2.querySelector('#o5c')],.65,.35,1.05,.3);
  O.to(bar,{y:28,opacity:0,duration:.25,ease:'power2.in'},.95)
   .to(t,{x:-340,opacity:0,filter:'blur(14px)',duration:.35,ease:'power3.in'},1)
  burst(g,O,1.15,300,330,{n:7,r0:20,r1:90,len:20,th:7,dur:.6,cols:[RED,WHITE]});
  return {in:I,out:O};
}});

/* 7 — like + subscribe card */
add({id:7,name:'Like + subscribe card',desc:'White card, thumbs-up, button flips to SUBSCRIBED',hold:3.6,
fields:[{k:'main',l:'Button',d:'SUBSCRIBE'},{k:'done',l:'Button after click',d:'SUBSCRIBED'}],
build(root,P){
  const g=el(root,`left:0;top:0;width:${W}px;height:${H}px`);
  const card=el(g,`left:218px;top:219px;width:525px;height:130px;border-radius:34px;background:#fff;box-shadow:0 8px 22px rgba(0,0,0,.28)`);
  const thumb=icon(g,'thumb',294,284,62,'#2e2e2e');
  const btn=label(g,P.main,`left:371px;top:252px;width:333px;height:62px;border-radius:8px;background:${RED};color:#fff;box-shadow:0 3px 6px rgba(0,0,0,.2)`,`700 32px/1 ${FONT}`);
  const grp=[card,thumb,btn];
  const pv=el(g,'left:480px;top:284px;width:0;height:0');
  const I=gsap.timeline();
  burst(g,I,.22,480,284,{n:14,r0:30,r1:150,len:34,th:9,dur:.6,cols:[WHITE,RED],a0:.15,stag:.004});
  I.fromTo(card,{scaleX:.2,scaleY:.34,rotation:-8,opacity:0},{scaleX:1,scaleY:1,rotation:0,opacity:1,duration:.6,ease:'back.out(1.3)'},.3)
   .fromTo(thumb,{scale:0,rotation:-30},{scale:1,rotation:0,duration:.35,ease:'back.out(2.2)'},.62)
   .fromTo(btn,{scaleX:.12,scaleY:.6,opacity:0},{scaleX:1,scaleY:1,opacity:1,duration:.4,ease:'back.out(1.5)'},.95);
  const arc=svg(g);arc.insertAdjacentHTML('beforeend',`<path d="M262 258 A 40 40 0 0 0 264 316" pathLength="1" fill="none" stroke="#2e2e2e" stroke-width="5" stroke-linecap="round" id="a7"/>`);
  trace(I,[arc.querySelector('#a7')],.7,.4,1.05,.35,'power2.inOut');
  const M=gsap.timeline();
  M.to(btn,{scale:.9,duration:.12,ease:'power2.in'},0)
   .set(btn,{background:DARK},.12).call(()=>{btn.sp.textContent=P.done},null,.12)
   .to(btn,{scale:1,duration:.35,ease:'back.out(2.4)'},.12);
  burst(g,M,.14,480,284,{n:8,r0:236,r1:262,len:8,th:6,dur:.5,cols:[WHITE],a0:.2});
  const O=gsap.timeline();
  burst(g,O,.0,205,240,{n:1,r0:0,r1:30,len:20,th:7,dur:.5,cols:[WHITE]});
  O.to(grp,{rotation:-6,duration:.4,ease:'power1.inOut',transformOrigin:'480px 284px'},.5)
   .to(grp,{rotation:-22,scale:.1,x:-30,y:60,duration:.55,ease:'power2.in',transformOrigin:'480px 284px'},.9)
   .to(grp,{opacity:0,duration:.05},1.45);
  burst(g,O,1.5,452,340,{n:9,r0:10,r1:84,len:22,th:7,dur:.55,cols:[WHITE,RED]});
  return {in:I,mid:M,out:O,reset(){btn.sp.textContent=P.main}};
}});


  /* Crop box (x, y, w, h) on the 960x540 design stage for each strap. */
  var BOX = { 1: [180, 190, 620, 170], 2: [180, 205, 600, 180], 4: [205, 195, 560, 150], 5: [230, 110, 530, 250], 7: [200, 200, 560, 170] };
  var BASE_SCALE = 1.5; // 960-stage px -> 1920 canvas px, sized to sit like a lower third

  var KEY_FOR = { main: 'title', done: 'doneText', name: 'channelName', sub: 'tagText' };

  var templates = SAMPLES.map(function (s) {
    var fields = s.fields.map(function (f) {
      var key = KEY_FOR[f.k] || f.k;
      var def = f.k === 'name' ? 'MAKECHURCHEAZY' : f.d;
      return [f.k, key, f.l, def];
    });
    if (s.avatar) fields.push(['avatar', 'avatarImage', 'Channel photo', '']);
    return {
      id: 'sub-' + s.id,
      name: s.name.replace(/\s*·\s*/g, ' · '),
      ref: 'Subscribe ' + s.id,
      tech: s.desc,
      color: '#fe2c2d',
      family: 'subscribe',
      fields: fields,
      build: function (r, d, c) {
        RED = /^#[0-9a-f]{3,6}$/i.test(c.fg) ? c.fg : '#fe2c2d';
        var box = BOX[s.id], S = BASE_SCALE * (c.scale || 1);
        var crop = document.createElement('div');
        crop.style.cssText = 'position:relative;overflow:visible;width:' + Math.round(box[2] * S) + 'px;height:' + Math.round(box[3] * S) + 'px;color:#fff;font-family:' + FONT + ';line-height:1';
        var stage = document.createElement('div');
        stage.style.cssText = 'position:absolute;left:0;top:0;width:' + W + 'px;height:' + H + 'px;transform-origin:0 0;transform:scale(' + S + ') translate(' + (-box[0]) + 'px,' + (-box[1]) + 'px)';
        crop.appendChild(stage); r.appendChild(crop);
        var P = {};
        fields.forEach(function (f) { P[f[0]] = d[f[0]]; });
        if (!P.avatar || /^\{\{/.test(P.avatar)) P.avatar = '';
        var built = s.build(stage, P);
        if (built.reset) built.reset();
        var tin = gsap.timeline().add(built.in, 0);
        if (built.mid) tin.add(built.mid, built.in.duration() + 0.6);
        var tout = gsap.timeline().add(built.out, 0);
        tout.set(stage, { opacity: 0 }, built.out.duration() + 0.02);
        return { tin: tin, tout: tout };
      }
    };
  });

  api.register(templates);
})(typeof window !== "undefined" ? window : globalThis);
