(function(){
'use strict';
const N=20, T=0.14, HF=2.7, HC=0.42, FH=0.05, PI=Math.PI, MAX_L=10, SAVE_KEY='minha-casa-3d-v1';
const ACC=0x3d63e6, RED=0xe0483c;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const $=id=>document.getElementById(id);
const app=$('app');
const fail=msg=>app.insertAdjacentHTML('beforeend',`<div class="fail"><p>${msg}</p></div>`);
if(typeof THREE==='undefined'||!THREE.OrbitControls){fail('Não foi possível carregar o motor 3D. Confirma a ligação à internet e recarrega a página.');return;}

/* ---------------- motor 3D ---------------- */
let renderer;
try{
  renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
}catch(err){
  fail('Este navegador não conseguiu ligar o 3D (WebGL). Experimenta abrir a página no Chrome ou no Edge, num computador.');
  return;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputEncoding=THREE.sRGBEncoding;
renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.0;
renderer.domElement.id='view'; app.prepend(renderer.domElement);
const cv=renderer.domElement;
const ANISO=Math.min(8,renderer.capabilities.getMaxAnisotropy());

const scene=new THREE.Scene();
scene.fog=new THREE.Fog(0xcfe0f0,48,170);
const camera=new THREE.PerspectiveCamera(50,1,0.05,420);
camera.position.set(12,14,17);
const controls=new THREE.OrbitControls(camera,cv);
controls.enableDamping=true; controls.dampingFactor=0.08; controls.maxPolarAngle=1.5; controls.minDistance=2.5; controls.maxDistance=60; controls.screenSpacePanning=false;

const house=new THREE.Group(); house.position.set(-N/2,0,-N/2); scene.add(house);
const gWalls=new THREE.Group(), gFloors=new THREE.Group(), gItems=new THREE.Group(), gHelp=new THREE.Group();
house.add(gWalls,gFloors,gItems,gHelp);

const hemi=new THREE.HemisphereLight(0xd3e3ff,0x6b5c48,0.55); scene.add(hemi);
const sun=new THREE.DirectionalLight(0xffffff,2.6);
sun.castShadow=true; sun.shadow.mapSize.set(2048,2048);
Object.assign(sun.shadow.camera,{left:-15,right:15,top:15,bottom:-15,near:1,far:95});
sun.shadow.bias=-0.0004; sun.shadow.normalBias=0.025; sun.shadow.camera.updateProjectionMatrix();
scene.add(sun,sun.target);

/* ---------------- texturas procedimentais ---------------- */
function rng(seed){let s=(seed*2654435761)>>>0||1;return()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296;};}
function lin(h){return new THREE.Color(h).convertSRGBToLinear();}
function noise(ctx,S,amt,r){const id=ctx.getImageData(0,0,S,S),d=id.data;for(let i=0;i<d.length;i+=4){const n=(r()-0.5)*amt;d[i]+=n;d[i+1]+=n;d[i+2]+=n;}ctx.putImageData(id,0,0);}
function wrapRect(ctx,S,x,y,w,h){x=((x%S)+S)%S;ctx.fillRect(x,y,w,h);if(x+w>S)ctx.fillRect(x-S,y,w,h);}
function wrap9(S,fn){for(const ox of[-S,0,S])for(const oy of[-S,0,S])fn(ox,oy);}
function rr(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
const tint=v=>v>0?`rgba(255,248,235,${v})`:`rgba(0,0,0,${-v})`;

function pWood(base,rows,seed,vertical,seams=true){return(ctx,S)=>{
  const r=rng(seed);
  if(vertical){ctx.save();ctx.translate(S/2,S/2);ctx.rotate(PI/2);ctx.translate(-S/2,-S/2);}
  ctx.fillStyle=base;ctx.fillRect(0,0,S,S);
  const rh=S/rows;
  for(let i=0;i<rows;i++){
    const x0=r()*S;let x=x0;
    while(x<x0+S-2){
      const len=Math.min(S*(0.42+r()*0.55),x0+S-x);
      ctx.fillStyle=tint((r()-0.5)*(seams?0.26:0.1));wrapRect(ctx,S,x,i*rh,len,rh);
      if(seams){ctx.fillStyle='rgba(25,14,6,0.6)';wrapRect(ctx,S,x,i*rh,2,rh);}
      x+=len;
    }
    if(seams){ctx.fillStyle='rgba(25,14,6,0.55)';ctx.fillRect(0,i*rh,S,2);}
  }
  for(let k=0;k<rows*16;k++){
    const y0=r()*S,amp=0.8+r()*3.5,fr=1+Math.floor(r()*3),ph=r()*6.283,a=0.04+r()*0.1,lw=0.5+r()*1.4;
    ctx.strokeStyle=`rgba(45,25,10,${a})`;ctx.lineWidth=lw;ctx.beginPath();
    for(let x=0;x<=S;x+=8){const y=y0+Math.sin(x/S*6.283*fr+ph)*amp;if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}
    ctx.stroke();
  }
  for(let k=0;k<rows;k++){if(r()<0.55)continue;const x=r()*S,y=r()*S,rad=3+r()*6;ctx.fillStyle='rgba(50,28,12,0.22)';ctx.beginPath();ctx.ellipse(x,y,rad*2.2,rad,0,0,6.283);ctx.fill();}
  if(vertical)ctx.restore();
  noise(ctx,S,12,r);
};}
function pTiles(base,grout,n,seed,alt,va){return(ctx,S)=>{
  const r=rng(seed);ctx.fillStyle=grout;ctx.fillRect(0,0,S,S);
  const ts=S/n,g=Math.max(3,S*0.007);
  for(let i=0;i<n;i++)for(let j=0;j<n;j++){
    const x=i*ts+g/2,y=j*ts+g/2,w=ts-g;
    ctx.save();ctx.beginPath();ctx.rect(x,y,w,w);ctx.clip();
    ctx.fillStyle=(alt&&(i+j)%2)?alt:base;ctx.fillRect(x,y,w,w);
    ctx.fillStyle=tint((r()-0.5)*va*2);ctx.fillRect(x,y,w,w);
    if(va>0.1){for(let m=0;m<16;m++){ctx.fillStyle=`rgba(${r()<0.5?'90,40,20':'235,175,125'},${0.05+r()*0.08})`;ctx.beginPath();ctx.arc(x+r()*w,y+r()*w,4+r()*16,0,6.283);ctx.fill();}}
    const gr=ctx.createLinearGradient(x,y,x+w,y+w);gr.addColorStop(0,'rgba(255,255,255,0.08)');gr.addColorStop(1,'rgba(0,0,0,0.06)');ctx.fillStyle=gr;ctx.fillRect(x,y,w,w);
    ctx.restore();
  }
  noise(ctx,S,7,r);
};}
function pMarble(base,seed){return(ctx,S)=>{
  const r=rng(seed);ctx.fillStyle=base;ctx.fillRect(0,0,S,S);
  for(let k=0;k<22;k++){
    const x=r()*S,y=r()*S,rad=40+r()*150,dark=r()<0.5,a=0.03+r()*0.05;
    wrap9(S,(ox,oy)=>{const gr=ctx.createRadialGradient(x+ox,y+oy,0,x+ox,y+oy,rad);gr.addColorStop(0,dark?`rgba(110,105,100,${a})`:`rgba(255,255,255,${a})`);gr.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=gr;ctx.fillRect(x+ox-rad,y+oy-rad,rad*2,rad*2);});
  }
  for(let k=0;k<8;k++){
    let x=r()*S,y=r()*S,a=r()*6.283;const pts=[[x,y]];const steps=40+((r()*50)|0);
    for(let s=0;s<steps;s++){a+=(r()-0.5)*0.55;x+=Math.cos(a)*8;y+=Math.sin(a)*8;pts.push([x,y]);}
    const lw=0.6+r()*2.4,al=0.12+r()*0.3;
    wrap9(S,(ox,oy)=>{ctx.beginPath();pts.forEach(([px,py],i)=>i?ctx.lineTo(px+ox,py+oy):ctx.moveTo(px+ox,py+oy));
      ctx.strokeStyle=`rgba(95,92,90,${al*0.25})`;ctx.lineWidth=lw*4;ctx.stroke();ctx.strokeStyle=`rgba(95,92,90,${al})`;ctx.lineWidth=lw;ctx.stroke();});
  }
  ctx.fillStyle='rgba(150,145,140,0.35)';ctx.fillRect(0,0,S,1.5);ctx.fillRect(0,0,1.5,S);ctx.fillRect(0,S/2,S,1.5);ctx.fillRect(S/2,0,1.5,S);
  noise(ctx,S,4,r);
};}
function pCarpet(base,seed){return(ctx,S)=>{const r=rng(seed);ctx.fillStyle=base;ctx.fillRect(0,0,S,S);noise(ctx,S,34,r);};}
function pConcrete(base,seed){return(ctx,S)=>{
  const r=rng(seed);ctx.fillStyle=base;ctx.fillRect(0,0,S,S);
  for(let k=0;k<30;k++){const x=r()*S,y=r()*S,rad=30+r()*120,dark=r()<0.5,a=0.03+r()*0.05;
    wrap9(S,(ox,oy)=>{const gr=ctx.createRadialGradient(x+ox,y+oy,0,x+ox,y+oy,rad);gr.addColorStop(0,dark?`rgba(70,70,68,${a})`:`rgba(255,255,255,${a})`);gr.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=gr;ctx.fillRect(x+ox-rad,y+oy-rad,rad*2,rad*2);});}
  noise(ctx,S,16,r);
  for(let k=0;k<140;k++){ctx.fillStyle=`rgba(40,40,40,${0.15+r()*0.2})`;ctx.beginPath();ctx.arc(r()*S,r()*S,0.6+r()*1.6,0,6.283);ctx.fill();}
};}
function pGrass(seed){return(ctx,S)=>{
  const r=rng(seed);ctx.fillStyle='#557f3a';ctx.fillRect(0,0,S,S);
  const cols=['#3f6a2a','#5e8c3e','#6f9a48','#48752f','#7aa356','#365b24'];ctx.lineWidth=1.3;ctx.lineCap='round';
  for(let k=0;k<6500;k++){const x=r()*S,y=r()*S,l=4+r()*9,a=-PI/2+(r()-0.5)*0.9;ctx.strokeStyle=cols[(r()*cols.length)|0];ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(a)*l,y+Math.sin(a)*l);ctx.stroke();}
  noise(ctx,S,10,r);
};}
function pCalcada(seed){return(ctx,S)=>{
  const r=rng(seed);ctx.fillStyle='#7d7a73';ctx.fillRect(0,0,S,S);const n=22,cs=S/n;
  for(let i=0;i<n;i++)for(let j=0;j<n;j++){
    const cx=(i+0.5)*cs+(r()-0.5)*cs*0.16,cy=(j+0.5)*cs+(r()-0.5)*cs*0.16;
    const wv=(((cy+S*0.09*Math.sin(cx/S*6.283*2))%(S/2))+S/2)%(S/2);
    const dark=wv<S*0.11;const b=dark?[43,43,46]:[233,229,219];const v=(r()-0.5)*26;
    ctx.fillStyle=`rgb(${b[0]+v|0},${b[1]+v|0},${b[2]+v|0})`;
    const w=cs*(0.78+r()*0.12),h=cs*(0.78+r()*0.12);
    ctx.save();ctx.translate(cx,cy);ctx.rotate((r()-0.5)*0.5);rr(ctx,-w/2,-h/2,w,h,cs*0.22);ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.12)';rr(ctx,-w/2,-h/2,w*0.7,h*0.5,cs*0.18);ctx.fill();ctx.restore();
  }
  noise(ctx,S,10,r);
};}
function pBrick(seed){return(ctx,S)=>{
  const r=rng(seed);ctx.fillStyle='#bcb4a8';ctx.fillRect(0,0,S,S);
  const rows=16,rh=S/rows,bw=S/4,g=4,cols=['#9a4b33','#a9573a','#8c432f','#b3623f','#93503a','#a24f36','#874230'];
  for(let i=0;i<rows;i++){
    const off=(i%2)*bw/2;const rowc=[0,1,2,3].map(()=>[cols[(r()*cols.length)|0],(r()-0.5)*0.22]);
    for(let k=-1;k<=4;k++){const[c,v]=rowc[((k%4)+4)%4];const x=k*bw+off;ctx.fillStyle=c;ctx.fillRect(x+g/2,i*rh+g/2,bw-g,rh-g);ctx.fillStyle=tint(v);ctx.fillRect(x+g/2,i*rh+g/2,bw-g,rh-g);}
  }
  for(let k=0;k<1400;k++){ctx.fillStyle=`rgba(${r()<0.5?'50,20,10':'230,190,160'},${0.1+r()*0.15})`;ctx.fillRect(r()*S,r()*S,1+r()*2,1+r()*2);}
  noise(ctx,S,18,r);
};}
function pStone(seed){return(ctx,S)=>{
  const r=rng(seed);ctx.fillStyle='#857d70';ctx.fillRect(0,0,S,S);
  const cols=['#b9ad98','#a89c88','#c4b8a2','#9f9686','#b3a690','#cbbfa8'];
  let y=0;const hs=[];while(y<S){let h=S*(0.12+r()*0.1);if(S-y-h<S*0.1)h=S-y;hs.push([y,h]);y+=h;}
  for(const[y0,h]of hs){const x0=r()*S;let x=x0;
    while(x<x0+S-2){const len=Math.min(S*(0.16+r()*0.24),x0+S-x);
      ctx.fillStyle=cols[(r()*cols.length)|0];wrapRect(ctx,S,x+3,y0+3,len-6,h-6);
      ctx.fillStyle=tint((r()-0.5)*0.16);wrapRect(ctx,S,x+3,y0+3,len-6,h-6);
      ctx.fillStyle='rgba(255,255,255,0.08)';wrapRect(ctx,S,x+3,y0+3,len-6,4);x+=len;}}
  for(let k=0;k<900;k++){ctx.fillStyle=`rgba(${r()<0.5?'60,55,48':'240,235,225'},${0.12+r()*0.15})`;ctx.fillRect(r()*S,r()*S,1+r()*2.5,1+r()*2.5);}
  noise(ctx,S,16,r);
};}
function pAzulejo(seed){return(ctx,S)=>{
  const r=rng(seed),n=6,ts=S/n,B='#1f4c9a',W='#f3f1ea';ctx.fillStyle='#cfd2d4';ctx.fillRect(0,0,S,S);
  for(let i=0;i<n;i++)for(let j=0;j<n;j++){
    const x=i*ts,y=j*ts,g=2;ctx.save();ctx.beginPath();ctx.rect(x+g/2,y+g/2,ts-g,ts-g);ctx.clip();
    ctx.fillStyle=W;ctx.fillRect(x,y,ts,ts);const cx=x+ts/2,cy=y+ts/2;ctx.fillStyle=B;ctx.strokeStyle=B;
    ctx.lineWidth=ts*0.06;for(const[qx,qy]of[[x,y],[x+ts,y],[x,y+ts],[x+ts,y+ts]]){ctx.beginPath();ctx.arc(qx,qy,ts*0.26,0,6.283);ctx.stroke();ctx.beginPath();ctx.arc(qx,qy,ts*0.1,0,6.283);ctx.fill();}
    for(let k=0;k<4;k++){ctx.save();ctx.translate(cx,cy);ctx.rotate(k*PI/2+PI/4);ctx.beginPath();ctx.ellipse(ts*0.2,0,ts*0.13,ts*0.055,0,0,6.283);ctx.fill();ctx.restore();}
    ctx.lineWidth=ts*0.025;for(let k=0;k<4;k++){const a=k*PI/2;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(a)*ts*0.36,cy+Math.sin(a)*ts*0.36);ctx.stroke();}
    ctx.beginPath();ctx.arc(cx,cy,ts*0.09,0,6.283);ctx.fill();ctx.fillStyle=W;ctx.beginPath();ctx.arc(cx,cy,ts*0.04,0,6.283);ctx.fill();
    const gr=ctx.createLinearGradient(x,y,x+ts,y+ts);gr.addColorStop(0,'rgba(255,255,255,0.10)');gr.addColorStop(1,'rgba(0,0,40,0.05)');ctx.fillStyle=gr;ctx.fillRect(x,y,ts,ts);
    ctx.restore();
  }
  noise(ctx,S,5,r);
};}
function pPlaster(ctx,S){const r=rng(41);ctx.fillStyle='#f6f6f5';ctx.fillRect(0,0,S,S);
  for(let k=0;k<26;k++){const x=r()*S,y=r()*S,rad=30+r()*110,a=0.015+r()*0.03;wrap9(S,(ox,oy)=>{const gr=ctx.createRadialGradient(x+ox,y+oy,0,x+ox,y+oy,rad);gr.addColorStop(0,`rgba(0,0,0,${a})`);gr.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=gr;ctx.fillRect(x+ox-rad,y+oy-rad,rad*2,rad*2);});}
  noise(ctx,S,9,r);}
function pFabric(ctx,S){const r=rng(42);ctx.fillStyle='#e9e9e9';ctx.fillRect(0,0,S,S);
  ctx.fillStyle='rgba(0,0,0,0.07)';for(let y=0;y<S;y+=4)ctx.fillRect(0,y,S,1.5);
  ctx.fillStyle='rgba(255,255,255,0.06)';for(let x=0;x<S;x+=4)ctx.fillRect(x,0,1.5,S);
  noise(ctx,S,24,r);}

const TEX={};
function canvasTex(key,painter,size=512){
  if(TEX[key])return TEX[key];
  const c=document.createElement('canvas');c.width=c.height=size;painter(c.getContext('2d'),size);
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.encoding=THREE.sRGBEncoding;t.anisotropy=ANISO;
  return TEX[key]=t;
}

/* ---------------- materiais ---------------- */
const SURF={
  carvalho:{n:'Carvalho',k:'f',p:()=>pWood('#b98b5c',6,11),r:0.55,b:0.002},
  nogueira:{n:'Nogueira',k:'f',p:()=>pWood('#6f4a30',6,12),r:0.5,b:0.002},
  freixo:{n:'Freixo',k:'f',p:()=>pWood('#d4b891',7,13),r:0.55,b:0.002},
  mosaico:{n:'Mosaico',k:'f',p:()=>pTiles('#ecebe6','#c4c0b8',3,21,null,0.05),r:0.22,b:0.004},
  tijoleira:{n:'Tijoleira',k:'f',p:()=>pTiles('#b0623d','#d6c9b8',3,22,null,0.16),r:0.7,b:0.004},
  xadrez:{n:'Xadrez',k:'f',p:()=>pTiles('#efeee9','#9b9a95',4,23,'#25272b',0.04),r:0.18,b:0.003},
  marmore:{n:'Mármore',k:'fw',p:()=>pMarble('#eeece7',24),r:0.14,b:0.0008},
  alcatifa:{n:'Alcatifa',k:'f',p:()=>pCarpet('#8b9199',25),r:0.98,b:0.002},
  betao:{n:'Betão',k:'fw',p:()=>pConcrete('#a9a8a3',26),r:0.82,b:0.002},
  deck:{n:'Deck',k:'x',p:()=>pWood('#8c6c4f',5,14),r:0.75,b:0.003},
  calcada:{n:'Calçada',k:'x',p:()=>pCalcada(27),r:0.7,b:0.006},
  relva:{n:'Relva',k:'x',p:()=>pGrass(28),r:0.95,b:0.004},
  tijolo:{n:'Tijolo',k:'w',p:()=>pBrick(31),r:0.85,b:0.006},
  pedra:{n:'Pedra',k:'w',p:()=>pStone(32),r:0.85,b:0.008},
  azulejo:{n:'Azulejo',k:'w',p:()=>pAzulejo(33),r:0.12,b:0.002},
  lambrim:{n:'Lambrim',k:'w',p:()=>pWood('#c49a6c',8,15,true),r:0.55,b:0.002},
};
const EXT=new Set(['deck','calcada','relva']);
const PAINTS=[['#f3f2ee','Branco'],['#e3e7ea','Gelo'],['#cbc4b8','Pedra-pomes'],['#a7b59e','Salva'],['#86a1b9','Azul-céu'],['#e6cd8c','Ocre'],['#d9aaa0','Rosa velho'],['#41594b','Verde-garrafa'],['#2f3a52','Azul-noite'],['#3a3c41','Grafite']];
const WHITE='c:#f3f2ee';
const MATS={};
const cm=(k,f)=>MATS[k]||(MATS[k]=f());
const std=o=>new THREE.MeshStandardMaterial(Object.assign({envMapIntensity:0.5},o));
const plasterTex=()=>canvasTex('plaster',pPlaster);
function surfMat(key){
  return cm('s:'+key,()=>{
    if(/^c:#[0-9a-f]{6}$/i.test(key)){const t=plasterTex();return std({color:lin(key.slice(2)),map:t,bumpMap:t,bumpScale:0.0015,roughness:0.92});}
    const d=SURF[key]||SURF.betao;const t=canvasTex('s_'+(SURF[key]?key:'betao'),d.p());
    return std({map:t,bumpMap:t,bumpScale:d.b,roughness:d.r});
  });
}
const WOODHEX={carvalho:'#b98b5c',nogueira:'#6f4a30',freixo:'#d4b891'};
const veneer=k=>cm('v:'+k,()=>{const t=canvasTex('v_'+k,pWood(WOODHEX[k],9,50+k.length,false,false));return std({map:t,roughness:0.5});});
const lacq=(h,r=0.4)=>cm('l'+h+r,()=>std({color:lin(h),roughness:r}));
const metal=(h,r=0.3)=>cm('m'+h+r,()=>std({color:lin(h),roughness:r,metalness:0.9,envMapIntensity:1}));
const fabricTex=()=>{const t=canvasTex('fabric',pFabric);t.repeat.set(4,4);return t;};
const fab=h=>cm('f'+h,()=>{const t=fabricTex();return std({color:lin(h),map:t,bumpMap:t,bumpScale:0.001,roughness:0.96});});
const CER=()=>lacq('#f3f3f1',0.12), CHR=()=>metal('#e3e5e8',0.12), BLK=()=>lacq('#1e1f22',0.45), BRASS=()=>metal('#b8955a',0.35);
const SCR=()=>cm('screen',()=>std({color:lin('#06080b'),roughness:0.1,metalness:0.4,emissive:lin('#0d1b2b'),emissiveIntensity:0.5,envMapIntensity:1}));
const MIRROR=()=>cm('mirror',()=>std({color:lin('#f2f4f5'),metalness:1,roughness:0.02,envMapIntensity:1}));
const GLASS=()=>cm('glass',()=>std({color:lin('#bcd6de'),roughness:0.03,metalness:0.1,transparent:true,opacity:0.22,depthWrite:false,envMapIntensity:1.4}));
const CAP=()=>lacq('#d9d6cf',0.9);
const SHADES=new Set();
const shadeMat=h=>cm('shade'+h,()=>{const m=std({color:lin(h),emissive:lin('#ffcf8f'),emissiveIntensity:0,roughness:0.9,side:THREE.DoubleSide});SHADES.add(m);return m;});

const DOORS={carvalho:['Carvalho',()=>veneer('carvalho')],nogueira:['Nogueira',()=>veneer('nogueira')],branca:['Lacado branco',()=>lacq('#f2f1ed',0.35)]};
const FRAMES={branco:['Branco',()=>lacq('#f0f0ee',0.4)],preto:['Preto',()=>metal('#2a2b2e',0.45)],madeira:['Madeira',()=>veneer('carvalho')]};

/* ---------------- geometria partilhada ---------------- */
const GC={};
const boxG=(w,h,d)=>GC['b'+w+','+h+','+d]||(GC['b'+w+','+h+','+d]=new THREE.BoxGeometry(w,h,d));
const cylG=(a,b,h,s,o)=>{const k='c'+[a,b,h,s,o];return GC[k]||(GC[k]=new THREE.CylinderGeometry(a,b,h,s,1,!!o));};
const sphG=new THREE.SphereGeometry(1,16,12);
function mk(g,geo,m,x,y,z){const o=new THREE.Mesh(geo,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;g.add(o);return o;}
const B=(g,w,h,d,x,y,z,m)=>mk(g,boxG(w,h,d),m,x,y+h/2,z);
const C=(g,a,b,h,x,y,z,m,s=16,o=false)=>mk(g,cylG(a,b,h,s,o),m,x,y+h/2,z);
const S=(g,r,x,y,z,m)=>{const o=mk(g,sphG,m,x,y,z);o.scale.setScalar(r);return o;};
const legs=(g,pts,h,m)=>pts.forEach(([x,z])=>C(g,0.022,0.018,h,x,0,z,m,10));
function worldUV(geo,ox,oy,oz){
  const p=geo.attributes.position,n=geo.attributes.normal,uv=geo.attributes.uv;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i)+ox,y=p.getY(i)+oy,z=p.getZ(i)+oz;
    if(Math.abs(n.getY(i))>0.5)uv.setXY(i,x,z);else if(Math.abs(n.getX(i))>0.5)uv.setXY(i,z,y);else uv.setXY(i,x,y);
  }
  uv.needsUpdate=true;
}

/* ---------------- catálogo de móveis ---------------- */
const FABRICS=[['#7f8b97','Azul-cinza'],['#bdb5a7','Linho'],['#56654f','Musgo'],['#9a5843','Tijolo'],['#3b3e45','Grafite'],['#d9c9a9','Areia']];
const WOODS=[['carvalho','Carvalho'],['nogueira','Nogueira'],['freixo','Freixo'],['#f1f0ec','Lacado branco'],['#2d2e31','Lacado preto']];
const KITCH=[['#f1f0ec','Branco'],['#5b6f5c','Verde-oliva'],['#2f3b52','Azul-noite'],['#cdbb9e','Bege'],['carvalho','Carvalho'],['#2d2e31','Preto']];
const APPL=[['inox','Inox'],['#f1f0ec','Branco'],['#2d2e31','Preto']];
const BEDS=[['#e7e2d8','Cru'],['#7f8b97','Azul-cinza'],['#b07a62','Argila'],['#56654f','Musgo'],['#d8b9b0','Rosa']];
const POTS=[['#b5653f','Terracota'],['#e9e6df','Branco'],['#33363b','Antracite']];
const WHITEONLY=[['#f3f3f1','Branco']];

function kitchenBase(g,m,v){
  B(g,0.96,0.1,0.52,0,0,-0.04,BLK());B(g,1.0,0.76,0.58,0,0.1,-0.02,m);B(g,1.0,0.04,0.62,0,0.86,0,surfMat('marmore'));
  if(v==='stove'){const bg=lacq('#121316',0.08);B(g,0.6,0.5,0.01,0,0.16,0.275,bg);B(g,0.5,0.015,0.02,0,0.7,0.29,CHR());B(g,0.6,0.006,0.5,0,0.9,0,bg);
    const ring=lacq('#3a3b40',0.5);for(const[x,z]of[[-0.15,-0.11],[0.15,-0.11],[-0.15,0.12],[0.15,0.12]])C(g,0.075,0.075,0.002,x,0.906,z,ring,24);}
  else{B(g,0.006,0.6,0.01,0,0.12,0.27,BLK());B(g,0.96,0.006,0.01,0,0.72,0.27,BLK());B(g,0.4,0.015,0.02,0,0.79,0.285,CHR());}
  if(v==='sink'){B(g,0.56,0.004,0.42,0,0.9,0.02,metal('#b6babe',0.22));B(g,0.48,0.005,0.34,0,0.9,0.02,metal('#7f8388',0.3));C(g,0.016,0.018,0.26,0,0.9,-0.22,CHR(),12);B(g,0.022,0.022,0.17,0,1.14,-0.15,CHR());}
}
const ITEMS={
  sofa:{n:'Sofá',cat:'Sala',w:2.0,d:0.9,cm:'fab',colors:FABRICS,build(g,m){
    legs(g,[[-0.9,-0.36],[0.9,-0.36],[-0.9,0.38],[0.9,0.38]],0.1,veneer('nogueira'));
    B(g,2.0,0.22,0.86,0,0.1,0,m);B(g,2.0,0.5,0.2,0,0.1,-0.33,m);B(g,0.18,0.48,0.86,-0.91,0.1,0,m);B(g,0.18,0.48,0.86,0.91,0.1,0,m);
    for(const x of[-0.55,0,0.55]){B(g,0.545,0.13,0.64,x,0.32,0.09,m);B(g,0.54,0.36,0.15,x,0.42,-0.15,m).rotation.x=-0.16;}
    const p=fab('#e8e2d4');B(g,0.4,0.36,0.12,-0.63,0.45,-0.04,p).rotation.set(-0.2,0,0.18);B(g,0.4,0.36,0.12,0.63,0.45,-0.04,p).rotation.set(-0.2,0,-0.18);}},
  poltrona:{n:'Poltrona',cat:'Sala',w:0.9,d:0.85,cm:'fab',colors:FABRICS,build(g,m){
    legs(g,[[-0.38,-0.34],[0.38,-0.34],[-0.38,0.36],[0.38,0.36]],0.1,veneer('nogueira'));
    B(g,0.9,0.22,0.82,0,0.1,0,m);B(g,0.9,0.55,0.18,0,0.1,-0.32,m);B(g,0.14,0.45,0.82,-0.38,0.1,0,m);B(g,0.14,0.45,0.82,0.38,0.1,0,m);
    B(g,0.62,0.13,0.62,0,0.32,0.08,m);B(g,0.6,0.34,0.13,0,0.43,-0.16,m).rotation.x=-0.15;}},
  mesa_centro:{n:'Mesa de centro',cat:'Sala',w:1.1,d:0.6,cm:'wood',colors:WOODS,build(g,m){
    B(g,1.1,0.04,0.6,0,0.36,0,m);B(g,1.0,0.02,0.5,0,0.12,0,m);for(const x of[-0.5,0.5])for(const z of[-0.25,0.25])B(g,0.03,0.36,0.03,x,0,z,BLK());
    B(g,0.24,0.03,0.17,-0.25,0.4,0,fab('#2f4a6b'));B(g,0.21,0.03,0.15,-0.25,0.43,0.01,fab('#c9b28a'));C(g,0.045,0.035,0.16,0.28,0.4,0.05,CER());}},
  movel_tv:{n:'Móvel e TV',cat:'Sala',w:1.6,d:0.45,cm:'wood',colors:WOODS,build(g,m){
    for(const x of[-0.74,0.74])for(const z of[-0.17,0.17])B(g,0.03,0.12,0.03,x,0,z,BLK());
    B(g,1.6,0.42,0.42,0,0.12,0,m);for(const x of[-0.4,0,0.4])B(g,0.006,0.38,0.01,x,0.14,0.211,BLK());
    B(g,0.32,0.015,0.2,0,0.54,0,BLK());B(g,0.05,0.09,0.03,0,0.555,-0.04,BLK());B(g,1.24,0.72,0.035,0,0.62,-0.03,BLK());B(g,1.2,0.68,0.003,0,0.64,-0.011,SCR());
    C(g,0.05,0.04,0.2,0.65,0.54,0.02,CER());}},
  tapete:{n:'Tapete',cat:'Sala',w:2.0,d:1.4,cm:'fab',colors:[['#c9bfae','Lã'],['#7f8b97','Azul-cinza'],['#9a5843','Tijolo'],['#3b3e45','Grafite']],build(g,m){
    for(const o of[B(g,2.0,0.01,1.4,0,0,0,m),B(g,1.8,0.012,1.2,0,0,0,fab('#e7e1d5')),B(g,1.5,0.013,0.9,0,0,0,m)])o.castShadow=false;}},
  estante:{n:'Estante',cat:'Sala',w:0.9,d:0.35,cm:'wood',colors:WOODS,build(g,m){
    for(const x of[-0.4375,0.4375])B(g,0.025,1.9,0.35,x,0,0,m);for(const y of[0,0.37,0.74,1.11,1.48,1.875])B(g,0.85,0.025,0.35,0,y,0,m);B(g,0.9,1.9,0.01,0,0,-0.17,m);
    const r=rng(7),bc=['#7a2e2a','#2f4a6b','#c9b28a','#3f5a46','#d8d2c4','#b5653f','#2b2c30','#8a6d9e'];
    for(const y of[0.025,0.395,0.765,1.135]){let x=-0.41;while(x<0.38){if(r()<0.08){x+=0.07;continue;}const bw=0.022+r()*0.028,bh=0.19+r()*0.12;if(x+bw>0.41)break;B(g,bw,bh,0.2+r()*0.06,x+bw/2,y,0.03,fab(bc[(r()*bc.length)|0]));x+=bw+0.002;}}
    C(g,0.06,0.05,0.18,0.15,1.505,0,CER());}},
  candeeiro:{n:'Candeeiro de pé',cat:'Sala',w:0.4,d:0.4,cm:'fab',colors:[['#efe6d2','Linho'],['#c9b28a','Areia'],['#3b3e45','Grafite']],light:{x:0,y:1.42,z:0,i:1.3,d:7},build(g,m,c){
    C(g,0.16,0.17,0.025,0,0,0,BLK(),24);C(g,0.012,0.012,1.3,0,0.025,0,BLK(),8);C(g,0.17,0.22,0.32,0,1.28,0,shadeMat(c),24,true).castShadow=false;}},
  bancada:{n:'Bancada',cat:'Cozinha',w:1.0,d:0.62,cm:'kitchen',colors:KITCH,build(g,m){kitchenBase(g,m,'plain');}},
  lava_loica:{n:'Lava-loiça',cat:'Cozinha',w:1.0,d:0.62,cm:'kitchen',colors:KITCH,build(g,m){kitchenBase(g,m,'sink');}},
  fogao:{n:'Placa e forno',cat:'Cozinha',w:1.0,d:0.62,cm:'kitchen',colors:KITCH,build(g,m){kitchenBase(g,m,'stove');}},
  armario_parede:{n:'Armário de parede',cat:'Cozinha',w:1.0,d:0.35,cm:'kitchen',colors:KITCH,build(g,m){
    B(g,1.0,0.72,0.35,0,1.45,0,m);B(g,0.006,0.68,0.01,0,1.47,0.176,BLK());B(g,0.015,0.2,0.02,-0.04,1.48,0.185,CHR());B(g,0.015,0.2,0.02,0.04,1.48,0.185,CHR());}},
  frigorifico:{n:'Frigorífico',cat:'Cozinha',w:0.7,d:0.68,cm:'appl',colors:APPL,build(g,m){
    B(g,0.7,1.85,0.66,0,0,0,m);B(g,0.68,0.006,0.01,0,1.2,0.331,BLK());B(g,0.02,0.4,0.03,-0.29,1.33,0.345,CHR());B(g,0.02,0.6,0.03,-0.29,0.5,0.345,CHR());}},
  mesa_jantar:{n:'Mesa de jantar',cat:'Cozinha',w:1.6,d:0.9,cm:'wood',colors:WOODS,build(g,m){
    B(g,1.6,0.04,0.9,0,0.72,0,m);B(g,1.46,0.08,0.76,0,0.64,0,m);for(const x of[-0.74,0.74])for(const z of[-0.39,0.39])B(g,0.06,0.64,0.06,x,0,z,m);
    C(g,0.15,0.09,0.07,0,0.76,0,CER(),24);const o=lacq('#e07b2a',0.5);for(const[x,z]of[[-0.04,0.02],[0.05,-0.03],[0.01,0.06]])S(g,0.038,x,0.83,z,o);}},
  cadeira:{n:'Cadeira',cat:'Cozinha',w:0.45,d:0.5,cm:'wood',colors:WOODS,build(g,m){
    for(const x of[-0.19,0.19])for(const z of[-0.2,0.2])B(g,0.03,0.45,0.03,x,0,z,m);B(g,0.45,0.04,0.46,0,0.45,0,m);
    for(const x of[-0.19,0.19])B(g,0.03,0.45,0.03,x,0.49,-0.2,m);B(g,0.42,0.16,0.025,0,0.74,-0.205,m);}},
  cama:{n:'Cama de casal',cat:'Quarto',w:1.6,d:2.05,cm:'fab',colors:BEDS,build(g,m){
    const fr=veneer('carvalho'),wh=fab('#f2efe8');legs(g,[[-0.76,-0.98],[0.76,-0.98],[-0.76,0.98],[0.76,0.98]],0.08,fr);
    B(g,1.64,0.25,2.05,0,0.08,0,fr);B(g,1.56,0.2,1.96,0,0.33,0.03,wh);B(g,1.62,0.08,1.48,0,0.5,0.27,m);
    B(g,0.02,0.24,1.48,-0.81,0.34,0.27,m);B(g,0.02,0.24,1.48,0.81,0.34,0.27,m);B(g,1.62,0.24,0.02,0,0.34,1.01,m);B(g,1.6,0.1,0.2,0,0.52,-0.56,wh);
    for(const x of[-0.38,0.38])B(g,0.62,0.13,0.4,x,0.53,-0.78,fab('#f7f5f0')).rotation.x=-0.12;B(g,1.72,1.02,0.09,0,0.1,-1.0,fab('#8e9298'));}},
  mesinha:{n:'Mesa de cabeceira',cat:'Quarto',w:0.45,d:0.4,cm:'wood',colors:WOODS,light:{x:0.08,y:0.74,z:-0.05,i:0.55,d:4},build(g,m){
    for(const x of[-0.19,0.19])for(const z of[-0.16,0.16])B(g,0.025,0.08,0.025,x,0,z,BLK());B(g,0.45,0.46,0.4,0,0.08,0,m);B(g,0.41,0.005,0.01,0,0.34,0.2,BLK());S(g,0.012,0,0.43,0.205,BRASS());
    C(g,0.05,0.06,0.03,0.08,0.54,-0.05,CER(),16);C(g,0.008,0.008,0.17,0.08,0.57,-0.05,BRASS(),8);C(g,0.08,0.11,0.14,0.08,0.7,-0.05,shadeMat('#efe6d2'),20,true).castShadow=false;}},
  roupeiro:{n:'Roupeiro',cat:'Quarto',w:1.2,d:0.6,cm:'wood',colors:WOODS,build(g,m){
    B(g,1.16,0.08,0.56,0,0,-0.01,BLK());B(g,1.2,2.0,0.6,0,0.08,0,m);B(g,0.006,1.96,0.01,0,0.1,0.3,BLK());for(const x of[-0.05,0.05])B(g,0.015,0.32,0.025,x,0.95,0.31,BRASS());}},
  secretaria:{n:'Secretária',cat:'Quarto',w:1.2,d:0.6,cm:'wood',colors:WOODS,build(g,m){
    B(g,1.2,0.03,0.6,0,0.72,0,m);for(const x of[-0.56,0.56]){for(const z of[-0.26,0.26])B(g,0.03,0.72,0.03,x,0,z,BLK());B(g,0.03,0.03,0.52,x,0.06,0,BLK());}
    B(g,0.22,0.012,0.16,0,0.75,-0.17,BLK());B(g,0.035,0.2,0.02,0,0.76,-0.2,BLK());B(g,0.6,0.36,0.025,0,0.86,-0.18,BLK());B(g,0.57,0.33,0.003,0,0.875,-0.1665,SCR());
    const k=lacq('#d9d9d6',0.5);B(g,0.42,0.015,0.14,0,0.75,0.08,k);B(g,0.06,0.02,0.1,0.32,0.75,0.08,k);C(g,0.035,0.035,0.09,-0.42,0.75,0,CER(),16);}},
  cadeira_escritorio:{n:'Cadeira de escritório',cat:'Quarto',w:0.6,d:0.6,cm:'fab',colors:FABRICS,build(g,m){
    for(let k=0;k<5;k++){const a=k*2*PI/5;B(g,0.04,0.03,0.3,Math.sin(a)*0.15,0.04,Math.cos(a)*0.15,BLK()).rotation.y=a;S(g,0.025,Math.sin(a)*0.29,0.025,Math.cos(a)*0.29,BLK());}
    C(g,0.025,0.025,0.36,0,0.07,0,CHR(),10);B(g,0.48,0.08,0.46,0,0.43,0.02,m);B(g,0.46,0.52,0.06,0,0.55,-0.24,m);B(g,0.04,0.2,0.04,0,0.5,-0.24,BLK());}},
  sanita:{n:'Sanita',cat:'Casa de banho',w:0.4,d:0.68,cm:'appl',colors:WHITEONLY,build(g){
    const c=CER();B(g,0.38,0.36,0.17,0,0.42,-0.25,c);B(g,0.24,0.4,0.22,0,0,-0.16,c);C(g,0.19,0.14,0.4,0,0,0.05,c,24).scale.z=1.32;C(g,0.195,0.195,0.03,0,0.4,0.06,c,24).scale.z=1.32;C(g,0.022,0.022,0.012,0,0.78,-0.25,CHR(),12);}},
  lavatorio:{n:'Lavatório',cat:'Casa de banho',w:0.6,d:0.46,cm:'wood',colors:WOODS,build(g,m){
    B(g,0.6,0.48,0.44,0,0.32,-0.01,m);B(g,0.006,0.44,0.01,0,0.34,0.211,BLK());B(g,0.62,0.1,0.46,0,0.8,0,CER());B(g,0.44,0.004,0.3,0,0.9,0.03,lacq('#dde1e4',0.14));
    C(g,0.014,0.016,0.16,0,0.9,-0.17,CHR(),12);B(g,0.02,0.02,0.11,0,1.04,-0.12,CHR());B(g,0.58,0.74,0.02,0,1.12,-0.22,MIRROR());}},
  banheira:{n:'Banheira',cat:'Casa de banho',w:1.7,d:0.75,cm:'appl',colors:WHITEONLY,build(g){
    const c=CER();B(g,1.7,0.55,0.75,0,0,0,c);B(g,1.54,0.004,0.59,0,0.55,0,lacq('#e3e8eb',0.1));C(g,0.015,0.015,0.14,0.7,0.55,-0.3,CHR(),12);B(g,0.025,0.025,0.11,0.7,0.67,-0.25,CHR());}},
  planta:{n:'Planta',cat:'Decoração',w:0.5,d:0.5,cm:'lacq',colors:POTS,build(g,m){
    C(g,0.17,0.13,0.36,0,0,0,m,24);C(g,0.155,0.155,0.01,0,0.34,0,lacq('#3b2a1e',1),20);
    const r=rng(5),gr=['#3f6b35','#4f7d3c','#365e2e','#5a8a44'].map(h=>lacq(h,0.6));
    for(let k=0;k<13;k++){const pv=new THREE.Group();pv.position.set(0,0.36,0);pv.rotation.y=k*2.4+r()*0.3;const arm=new THREE.Group();arm.rotation.x=-(0.35+r()*0.75);
      const len=0.3+r()*0.28,leaf=new THREE.Mesh(sphG,gr[k%4]);leaf.scale.set(0.07,0.012,len/2);leaf.position.z=len/2;leaf.castShadow=true;arm.add(leaf);pv.add(arm);g.add(pv);}}},
};
const GREENS=[['#4f7d3c','Verde'],['#6f9a3c','Verde-claro'],['#56654f','Musgo'],['#c27a35','Outono']];
Object.assign(ITEMS,{
  planta_alta:{n:'Ave-do-paraíso',cat:'Decoração',w:0.6,d:0.6,cm:'lacq',colors:[['#e9e6df','Branco'],['#b5653f','Terracota'],['#33363b','Antracite']],build(g,m){
    C(g,0.2,0.15,0.5,0,0,0,m,24);const lf=lacq('#3f6b35',0.6);for(let k=0;k<7;k++){const a=k*2.4;S(g,1,Math.sin(a)*0.16,1.0+k*0.05,Math.cos(a)*0.16,lf).scale.set(0.09,0.22,0.03);}}},
  cato:{n:'Cato',cat:'Decoração',w:0.35,d:0.35,cm:'lacq',colors:POTS,build(g,m){
    C(g,0.13,0.1,0.2,0,0,0,m,20);C(g,0.055,0.06,0.42,0,0.2,0,lacq('#4e7a4a',0.7),12);}},
  arvore:{n:'Árvore',cat:'Jardim',w:2.2,d:2.2,cm:'leaf',colors:GREENS,build(g,m){
    C(g,0.08,0.14,1.9,0,0,0,lacq('#5a4632',0.95),10);for(let k=0;k<6;k++){const a=k*1.05;S(g,0.6,Math.sin(a)*0.45,2.6+(k%2)*0.5,Math.cos(a)*0.45,m);}}},
  arbusto:{n:'Arbusto',cat:'Jardim',w:0.9,d:0.9,cm:'leaf',colors:GREENS,build(g,m){
    for(const[x,y,z,r]of[[0,0.32,0,0.32],[0.15,0.25,0.1,0.22],[-0.14,0.24,-0.08,0.24]])S(g,r,x,y,z,m);}},
  floreira:{n:'Floreira',cat:'Jardim',w:1.2,d:0.4,cm:'lacq',colors:[['#8a6d9e','Lavanda'],['#c0392b','Vermelho'],['#e6b422','Amarelo'],['#f1f0ec','Branco']],build(g,m){
    B(g,1.2,0.4,0.4,0,0,0,lacq('#8f8a82',0.85));B(g,1.1,0.14,0.3,0,0.4,0,m);}},
  espreguicadeira:{n:'Espreguiçadeira',cat:'Jardim',w:0.7,d:1.9,cm:'wood',colors:WOODS,build(g,m){
    for(const x of[-0.3,0.3])for(const z of[-0.85,0.85])B(g,0.05,0.3,0.05,x,0,z,m);B(g,0.62,0.06,1.9,0,0.28,0,m);
    const c=fab('#e8e2d4');B(g,0.6,0.07,1.25,0,0.34,0.3,c);B(g,0.6,0.07,0.7,0,0.5,-0.6,c).rotation.x=0.75;}},
});
ITEMS.tapete.flat=true;
Object.assign(ITEMS,{
  candeeiro_teto:{n:'Candeeiro de teto',cat:'Luzes',w:0.5,d:0.5,cm:'fab',colors:[['#efe6d2','Linho'],['#c9b28a','Areia'],['#3b3e45','Grafite'],['#56654f','Musgo']],light:{x:0,y:2.12,z:0,i:2.4,d:9},build(g,m,c){
    C(g,0.003,0.003,0.4,0,2.3,0,BLK(),6);C(g,0.06,0.23,0.28,0,2.0,0,shadeMat(okHex(c)?c:'#efe6d2'),32,true).castShadow=false;}},
  interruptor:{n:'Interruptor',cat:'Luzes',w:0.1,d:0.03,cm:'lacq',sw:true,colors:[['#f4f3ef','Branco'],['#2d2e31','Preto']],build(g,m){B(g,0.086,0.086,0.012,0,1.02,-0.009,m);}},
});
ITEMS.arvore.hit=[0.4,0.4];
const NOBLOCK=new Set(['tapete','candeeiro_teto','interruptor','armario_parede']);
const CATS=['Sala','Cozinha','Quarto','Casa de banho','Decoração','Luzes','Jardim'];
function colorMat(def,v){
  if(v==='inox')return metal('#c9ccd0',0.3);
  if(WOODHEX[v])return veneer(v);
  if(!/^#[0-9a-f]{6}$/i.test(v||''))return v===def.colors[0][0]?lacq('#808080'):colorMat(def,def.colors[0][0]);
  return def.cm==='fab'?fab(v):lacq(v,def.cm==='kitchen'?0.3:def.cm==='leaf'?0.85:0.4);
}

/* ---------------- modelos do Blender (modelos/*.glb, gerados por blender/moveis.py) ---------------- */
const MODELS={};
const MODEL_KEYS=()=>[...Object.keys(ITEMS),'porta_aro','porta_folha','janela','envidracado','moeda','chave'];
function loadModels(){
  if(location.protocol==='file:'||!THREE.GLTFLoader)return Promise.resolve();
  const loader=new THREE.GLTFLoader();
  const one=k=>new Promise(res=>loader.load(`modelos/${k}.glb`,gl=>{MODELS[k]=gl.scene;res();},undefined,()=>res()));
  return Promise.race([Promise.all(MODEL_KEYS().map(one)),new Promise(r=>setTimeout(r,12000))]);
}
const okHex=v=>/^#[0-9a-f]{6}$/i.test(v||'');
function modelMat(name,m,c){
  const[t,a,b]=(name||'').split(':');
  switch(t){
    case 'Tecido':return fab(a);
    case 'Madeira':return veneer(WOODHEX[a]?a:'carvalho');
    case 'Lacado':return lacq(a,b?+b:0.4);
    case 'Metal':return metal(a,b?+b:0.3);
    case 'Folha':return cm('folha'+a,()=>std({color:lin(a),roughness:0.6,side:THREE.DoubleSide}));
    case 'Ceramica':return CER();
    case 'Cromado':return CHR();
    case 'Preto':return BLK();
    case 'Latao':return BRASS();
    case 'Ecra':return SCR();
    case 'Espelho':return MIRROR();
    case 'Vidro':return GLASS();
    case 'Marmore':return surfMat('marmore');
    case 'Abajur':return shadeMat(a==='cor'?(okHex(c)?c:'#efe6d2'):a);
  }
  return m;
}
/* copia um modelo, troca os materiais pelos do site e marca as peças (para escolher/apagar) */
function addModel(parent,k,m,c,ud,flat){
  const o=MODELS[k].clone(true);
  o.traverse(n=>{if(!n.isMesh)return;const nm=n.material&&n.material.name||'';n.material=modelMat(nm,m,c);
    const lit=/^(Abajur|Vidro)/.test(nm);n.castShadow=!flat&&!lit;n.receiveShadow=!lit;if(ud)n.userData=Object.assign({},ud);});
  parent.add(o);return o;
}

/* ---------------- estado ---------------- */
let state={v:1,walls:{},floors:{},items:[]};
const SEGC=new Map();
function segInfo(k){let s=SEGC.get(k);if(!s){const p=k.split(',');s={x:+p[0],z:+p[1],d:p[2]};SEGC.set(k,s);}return s;}
function region(walls,cx,cz){
  if(cx<0||cz<0||cx>=N||cz>=N)return[];
  const seen=new Set([cx+','+cz]),q=[[cx,cz]],out=[];
  while(q.length){const[x,z]=q.pop();out.push([x,z]);
    for(const[nx,nz,k]of[[x+1,z,`${x+1},${z},v`],[x-1,z,`${x},${z},v`],[x,z+1,`${x},${z+1},h`],[x,z-1,`${x},${z},h`]]){
      if(nx<0||nz<0||nx>=N||nz>=N||walls[k])continue;const key=nx+','+nz;if(seen.has(key))continue;seen.add(key);q.push([nx,nz]);}}
  return out;
}
function paintRegion(walls,cells,mat){
  for(const[x,z]of cells)for(const[k,side]of[[`${x},${z},h`,'b'],[`${x},${z+1},h`,'a'],[`${x},${z},v`,'b'],[`${x+1},${z},v`,'a']])if(walls[k])walls[k][side]=mat;
}
function facingCell(seg,side){const s=segInfo(seg);if(s.d==='h')return side==='b'?[s.x,s.z]:[s.x,s.z-1];return side==='b'?[s.x,s.z]:[s.x-1,s.z];}

function exampleState(){
  const s={v:1,walls:{},floors:{},items:[]};
  const W=(x0,z0,x1,z1)=>{if(z0===z1)for(let x=Math.min(x0,x1);x<Math.max(x0,x1);x++)s.walls[`${x},${z0},h`]={t:'wall',a:WHITE,b:WHITE};else for(let z=Math.min(z0,z1);z<Math.max(z0,z1);z++)s.walls[`${x0},${z},v`]={t:'wall',a:WHITE,b:WHITE};};
  W(4,5,15,5);W(4,14,15,14);W(4,5,4,14);W(15,5,15,14);W(10,5,10,14);W(10,10,15,10);W(12,10,12,14);W(4,9,7,9);
  const D=(k,st)=>Object.assign(s.walls[k],{t:'door',s:st});
  const Wi=(k,w='normal')=>Object.assign(s.walls[k],{t:'window',w,f:'branco'});
  D('11,14,h','nogueira');D('10,12,v','carvalho');D('10,10,h','carvalho');D('12,11,v','branca');
  ['5,14,h','6,14,h','8,14,h'].forEach(k=>Wi(k,'alta'));['4,13,v','5,5,h','7,5,h','4,6,v','14,5,h','15,7,v','15,12,v'].forEach(k=>Wi(k));
  const F=(x0,z0,x1,z1,m)=>{for(let x=x0;x<x1;x++)for(let z=z0;z<z1;z++)s.floors[x+','+z]=m;};
  F(4,9,10,14,'carvalho');F(4,5,10,9,'mosaico');F(10,5,15,10,'freixo');F(10,10,12,14,'marmore');F(12,10,15,14,'mosaico');F(4,14,10,17,'deck');F(10,14,13,20,'calcada');
  const P=(cx,cz,m)=>paintRegion(s.walls,region(s.walls,cx,cz),m);
  P(12,7,'c:#a7b59e');P(13,12,'azulejo');P(11,12,'c:#e3e7ea');
  for(let z=9;z<14;z++)s.walls[`4,${z},v`].b='c:#41594b';
  for(let x=4;x<10;x++)s.walls[`${x},5,h`].b='azulejo';
  let id=1;const I=(k,x,z,r,c)=>s.items.push({id:id++,k,x,z,r,c});
  I('tapete',6.2,11.5,1,'#c9bfae');I('movel_tv',4.295,11.5,1,'nogueira');I('sofa',7.85,11.5,3,'#7f8b97');I('mesa_centro',6.1,11.5,1,'carvalho');
  I('poltrona',6.2,13.4,2,'#9a5843');I('candeeiro',9.4,13.45,0,'#efe6d2');I('planta',4.45,13.5,0,'#b5653f');I('estante',9.755,10.0,3,'nogueira');
  [['bancada',4.57],['fogao',5.57],['bancada',6.57],['lava_loica',7.57],['bancada',8.57]].forEach(([k,x])=>I(k,x,5.38,0,'#f1f0ec'));
  I('frigorifico',9.55,5.41,0,'inox');I('mesa_jantar',6.6,7.35,0,'carvalho');
  for(const x of[6.15,7.05]){I('cadeira',x,6.7,0,'nogueira');I('cadeira',x,8.0,2,'nogueira');}
  I('cama',12.5,6.1,0,'#e7e2d8');I('mesinha',11.35,5.27,0,'carvalho');I('mesinha',13.65,5.27,0,'carvalho');
  I('roupeiro',10.37,8.2,1,'#f1f0ec');I('secretaria',14.63,8.6,3,'carvalho');I('cadeira_escritorio',14.0,8.6,1,'#3b3e45');
  I('banheira',14.08,13.555,0,'#f3f3f1');I('sanita',14.59,11.3,3,'#f3f3f1');I('lavatorio',13.3,10.3,0,'nogueira');
  I('candeeiro_teto',6.5,11.5,0,'#efe6d2');I('candeeiro_teto',6.6,7.35,0,'#c9b28a');I('candeeiro_teto',12.5,7.6,0,'#efe6d2');I('candeeiro_teto',13.4,12.3,0,'#efe6d2');I('candeeiro_teto',11,12.6,0,'#3b3e45');
  I('interruptor',9.915,13.35,3,'#f4f3ef');I('interruptor',11.6,9.915,2,'#f4f3ef');I('interruptor',12.085,12.6,1,'#f4f3ef');I('interruptor',10.085,13.4,1,'#f4f3ef');
  I('planta',10.4,13.55,0,'#e9e6df');I('planta',4.5,16.5,0,'#b5653f');I('planta',9.5,16.5,0,'#33363b');
  I('poltrona',6.0,15.6,1,'#d9c9a9');I('poltrona',8.0,15.6,3,'#d9c9a9');I('mesa_centro',7.0,15.6,1,'freixo');
  return s;
}
function sanitize(s){
  const okSurf=v=>typeof v==='string'&&(SURF[v]||/^c:#[0-9a-f]{6}$/i.test(v));
  const out={v:1,walls:{},floors:{},items:[]};
  if(!s||typeof s!=='object')throw new Error('bad');
  for(const[k,w]of Object.entries(s.walls||{})){
    if(!/^\d{1,2},\d{1,2},[hv]$/.test(k)||!w)continue;const sg=segInfo(k);if(sg.x>N||sg.z>N||(sg.d==='h'?sg.x:sg.z)>=N)continue;
    out.walls[k]={t:['wall','door','window'].includes(w.t)?w.t:'wall',a:okSurf(w.a)?w.a:WHITE,b:okSurf(w.b)?w.b:WHITE};
    if(out.walls[k].t==='door')out.walls[k].s=DOORS[w.s]?w.s:'carvalho';
    if(out.walls[k].t==='window'){out.walls[k].w=w.w==='alta'?'alta':'normal';out.walls[k].f=FRAMES[w.f]?w.f:'branco';}
  }
  for(const[k,m]of Object.entries(s.floors||{}))if(/^\d{1,2},\d{1,2}$/.test(k)&&SURF[m])out.floors[k]=m;
  let id=1;
  for(const it of(s.items||[])){if(!it||!ITEMS[it.k])continue;const x=+it.x,z=+it.z;if(!isFinite(x)||!isFinite(z))continue;
    out.items.push({id:id++,k:it.k,x:clamp(x,-2,N+2),z:clamp(z,-2,N+2),r:((it.r|0)%4+4)%4,c:typeof it.c==='string'?it.c:ITEMS[it.k].colors[0][0],...(it.off===true?{off:true}:{})});}
  return out;
}
function save(){try{localStorage.setItem(SAVE_KEY,JSON.stringify(state));}catch(e){}}
let undoS=[],redoS=[],pending=null;
function begin(){if(pending===null)pending=JSON.stringify(state);}
function end(){if(pending===null)return;const now=JSON.stringify(state);if(now!==pending){undoS.push(pending);if(undoS.length>80)undoS.shift();redoS=[];save();}pending=null;afterChange();}
function undo(){if(!undoS.length)return;cancelAct();redoS.push(JSON.stringify(state));state=JSON.parse(undoS.pop());sel=null;rebuildAll();save();afterChange();}
function redo(){if(!redoS.length)return;cancelAct();undoS.push(JSON.stringify(state));state=JSON.parse(redoS.pop());sel=null;rebuildAll();save();afterChange();}
const nextId=()=>state.items.reduce((m,i)=>Math.max(m,i.id),0)+1;
const getItem=id=>state.items.find(i=>i.id===id);

/* ---------------- construção da cena ---------------- */
let wallsCut=false;
function disposeGroup(gr){gr.traverse(o=>{if(o.isMesh&&o.userData.own)o.geometry.dispose();});while(gr.children.length)gr.remove(gr.children[0]);}
const wallH=()=>wallsCut&&!walk.on?HC:HF;
const SKIRT=()=>lacq('#f4f3ef',0.35);
const DOOR_OPEN=-1.15,DOORST={},DOORPV={};
const doorSt=k=>DOORST[k]||(DOORST[k]={open:true,locked:false,a:DOOR_OPEN});
function buildSegment(key,w,H,deg){
  const s=segInfo(key),g=new THREE.Group();g.position.set(s.x,0,s.z);if(s.d==='v')g.rotation.y=-PI/2;
  const plus=s.d==='h'?'b':'a',minus=s.d==='h'?'a':'b',mP=surfMat(w[plus]),mM=surfMat(w[minus]),cap=CAP(),uo=s.d==='h'?s.x:s.z;
  const piece=(u0,u1,y0,y1)=>{const geo=new THREE.BoxGeometry(u1-u0,y1-y0,T);worldUV(geo,(u0+u1)/2+uo,(y0+y1)/2,0);
    const m=new THREE.Mesh(geo,[mM,mM,cap,cap,mP,mM]);m.position.set((u0+u1)/2,(y0+y1)/2,0);m.castShadow=m.receiveShadow=true;m.userData={own:true,piece:true,seg:key,plus,minus};g.add(m);return m;};
  const part=(a,b,c,x,y,z,mat,sh=true)=>{const m=new THREE.Mesh(boxG(a,b,c),mat);m.position.set(x,y,z);m.castShadow=sh;m.receiveShadow=sh;m.userData={seg:key};g.add(m);return m;};
  if(w.t!=='door'&&!(w.t==='window'&&w.w==='alta')){
    const v0=s.x+','+s.z,v1=s.d==='h'?(s.x+1)+','+s.z:s.x+','+(s.z+1),e=T/2+0.012,e0=deg[v0]>1?e:0,e1=deg[v1]>1?e:0;
    for(const[side,zs]of[[plus,1],[minus,-1]]){const c=facingCell(key,side),f=state.floors[c.join(',')];if(!f||EXT.has(f))continue;
      part(1+e0+e1,0.08,0.012,(1+e1-e0)/2,FH+0.04,zs*(T/2+0.006),SKIRT(),false).receiveShadow=true;}
  }
  if(H<HF){
    if(w.t==='door')part(0.9,0.06,T,0.5,0.03,0,(DOORS[w.s]||DOORS.carvalho)[1]());else piece(0,1,0,H);
    return g;
  }
  if(w.t==='door'){
    piece(0,0.05,0,H);piece(0.95,1,0,H);piece(0.05,0.95,2.1,H);
    const fm=(DOORS[w.s]||DOORS.carvalho)[1](),tt=T+0.03;
    if(MODELS.porta_aro&&MODELS.porta_folha){
      addModel(g,'porta_aro',fm,null,{seg:key});
      const pv=new THREE.Group();pv.position.set(0.085,0,T/2-0.01);pv.rotation.y=doorSt(key).a;DOORPV[key]=pv;g.add(pv);addModel(pv,'porta_folha',fm,null,{seg:key});
      return g;
    }
    part(0.03,2.1,tt,0.065,1.05,0,fm);part(0.03,2.1,tt,0.935,1.05,0,fm);part(0.9,0.03,tt,0.5,2.085,0,fm);
    const pv=new THREE.Group();pv.position.set(0.085,0,T/2-0.01);pv.rotation.y=doorSt(key).a;DOORPV[key]=pv;g.add(pv);
    const leaf=new THREE.Mesh(boxG(0.83,2.05,0.04),fm);leaf.position.set(0.415,1.05,0.02);leaf.castShadow=leaf.receiveShadow=true;leaf.userData={seg:key};pv.add(leaf);
    for(const z of[-0.015,0.055]){const h=new THREE.Mesh(boxG(0.12,0.02,0.02),CHR());h.position.set(0.74,1.0,z);h.userData={seg:key};pv.add(h);}
    return g;
  }
  if(w.t==='window'){
    const fm=(FRAMES[w.f]||FRAMES.branco)[1]();
    const mk=w.w==='alta'?'envidracado':'janela';
    if(w.w==='alta'){piece(0,1,0,0.06);piece(0,1,2.4,H);piece(0,0.05,0.06,2.4);piece(0.95,1,0.06,2.4);}
    else{piece(0,1,0,0.95);piece(0,1,2.15,H);piece(0,0.1,0.95,2.15);piece(0.9,1,0.95,2.15);}
    if(MODELS[mk]){addModel(g,mk,fm,null,{seg:key});return g;}
    if(w.w==='alta'){
      part(0.045,2.34,0.07,0.0725,1.23,0,fm);part(0.045,2.34,0.07,0.9275,1.23,0,fm);part(0.9,0.045,0.07,0.5,2.3775,0,fm);part(0.9,0.045,0.07,0.5,0.0825,0,fm);part(0.03,2.25,0.06,0.5,1.23,0,fm);
      part(0.83,2.25,0.008,0.5,1.23,0,GLASS(),false);
    }else{
      part(0.05,1.2,0.07,0.125,1.55,0,fm);part(0.05,1.2,0.07,0.875,1.55,0,fm);part(0.8,0.05,0.07,0.5,2.125,0,fm);part(0.8,0.05,0.07,0.5,0.975,0,fm);part(0.035,1.1,0.06,0.5,1.55,0,fm);
      part(0.72,1.1,0.008,0.5,1.55,0,GLASS(),false);
      part(0.88,0.035,T+0.09,0.5,0.9325,0,surfMat('marmore'));
    }
    return g;
  }
  piece(0,1,0,H);return g;
}
function rebuildWalls(){
  disposeGroup(gWalls);for(const k in DOORPV)delete DOORPV[k];const H=wallH(),verts={},deg={};
  for(const k in state.walls){const s=segInfo(k),a=s.x+','+s.z,b=s.d==='h'?(s.x+1)+','+s.z:s.x+','+(s.z+1);deg[a]=(deg[a]||0)+1;deg[b]=(deg[b]||0)+1;}
  const addV=(x,z,slot,w)=>{const k=x+','+z;(verts[k]||(verts[k]={x,z}))[slot]=w;};
  for(const[k,w]of Object.entries(state.walls)){
    gWalls.add(buildSegment(k,w,H,deg));const s=segInfo(k);
    if(s.d==='h'){addV(s.x,s.z,'hr',w);addV(s.x+1,s.z,'hl',w);}else{addV(s.x,s.z,'vd',w);addV(s.x,s.z+1,'vu',w);}
  }
  const sz=T*1.012;
  for(const v of Object.values(verts)){
    const h=v.hl||v.hr,vv=v.vu||v.vd;
    const px=vv?vv.b:h.a,mx=vv?vv.a:h.a,pz=h?h.b:vv.a,mz=h?h.a:vv.a;
    const geo=new THREE.BoxGeometry(sz,H,sz);worldUV(geo,v.x,H/2,v.z);
    const m=new THREE.Mesh(geo,[surfMat(px),surfMat(mx),CAP(),CAP(),surfMat(pz),surfMat(mz)]);m.position.set(v.x,H/2,v.z);m.castShadow=m.receiveShadow=true;m.userData={own:true};gWalls.add(m);
  }
}
function rebuildFloors(){
  disposeGroup(gFloors);const geo=boxG(1,FH,1);
  for(const[k,m]of Object.entries(state.floors)){const[x,z]=k.split(',').map(Number);const o=new THREE.Mesh(geo,surfMat(m));o.position.set(x+0.5,FH/2,z+0.5);o.receiveShadow=true;gFloors.add(o);}
  rebuildWalls();
}
const baseY=(x,z)=>state.floors[Math.floor(x)+','+Math.floor(z)]?FH:0;
const LAMPS=[];
function makeItem(it,ghost){
  const def=ITEMS[it.k],g=new THREE.Group(),m=colorMat(def,it.c);
  if(MODELS[it.k])addModel(g,it.k,m,it.c,null,def.flat);else def.build(g,m,it.c);
  g.rotation.y=it.r*PI/2;g.position.set(it.x,baseY(it.x,it.z),it.z);g.userData.itemId=it.id;
  if(def.light&&!ghost){
    const mats=[];g.traverse(o=>{if(o.isMesh&&SHADES.has(o.material)){o.material=o.material.clone();mats.push(o.material);}});
    let pl=null;if(LAMPS.filter(l=>l.pl).length<MAX_L){const L=def.light;pl=new THREE.PointLight(0xffc98e,0,L.d,2);pl.position.set(L.x,L.y,L.z);g.add(pl);}
    LAMPS.push({pl,i:def.light.i,it,mats});
  }
  if(ghost)g.traverse(o=>{if(o.isMesh)o.castShadow=false;});
  return g;
}
function rebuildItems(){disposeGroup(gItems);for(const L of LAMPS)L.mats.forEach(m=>m.dispose());LAMPS.length=0;for(const it of state.items)if(ITEMS[it.k])gItems.add(makeItem(it,false));applyLamps();updateSel();}
function rebuildAll(){rebuildFloors();rebuildItems();}

/* ---------------- chão, céu e luz ---------------- */
const skyMat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,
  uniforms:{top:{value:new THREE.Color()},hor:{value:new THREE.Color()},bot:{value:new THREE.Color()},sunDir:{value:new THREE.Vector3(0,1,0)},sunCol:{value:new THREE.Color()}},
  vertexShader:'varying vec3 vP;void main(){vP=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader:'uniform vec3 top,hor,bot,sunCol;uniform vec3 sunDir;varying vec3 vP;void main(){vec3 d=normalize(vP);float h=d.y;vec3 c=h>0.0?mix(hor,top,pow(clamp(h,0.0,1.0),0.55)):mix(hor,bot,clamp(-h*4.0,0.0,1.0));float s=max(dot(d,normalize(sunDir)),0.0);c+=sunCol*(pow(s,700.0)*6.0+pow(s,10.0)*0.22);gl_FragColor=vec4(c,1.0);\n#include <tonemapping_fragment>\n#include <encodings_fragment>\n}'});
const skyMesh=new THREE.Mesh(new THREE.SphereGeometry(320,32,16),skyMat);skyMesh.renderOrder=-1;scene.add(skyMesh);
const envScene=new THREE.Scene();envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50,32,16),skyMat));
const pmrem=new THREE.PMREMGenerator(renderer);let envRT=null,envTimer=0;
function schedEnv(now){clearTimeout(envTimer);const run=()=>{const rt=pmrem.fromScene(envScene,0.035);if(envRT)envRT.dispose();envRT=rt;scene.environment=rt.texture;};if(now)run();else envTimer=setTimeout(run,140);}

const groundTex=surfMat('relva').map.clone();groundTex.needsUpdate=true;groundTex.repeat.set(170,170);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(170,170),std({map:groundTex,roughness:0.96,color:lin('#e6ecd9')}));
ground.rotation.x=-PI/2;ground.receiveShadow=true;scene.add(ground);
const grid=new THREE.GridHelper(N,N,ACC,0x7f8bb0);grid.position.set(N/2,FH+0.004,N/2);grid.material.transparent=true;grid.material.opacity=0.28;grid.material.depthWrite=false;gHelp.add(grid);

const SKY={dayTop:lin('#3a74c4'),dayHor:lin('#cfe0f0'),goldTop:lin('#465c95'),goldHor:lin('#f2a46e'),nightTop:lin('#02040b'),nightHor:lin('#0e1730'),dayBot:lin('#45433d'),nightBot:lin('#040508')};
let nightF=0,curHour=16;
function setTime(h,now){
  curHour=h;const t=(h-6)/14,e=(t>=0&&t<=1)?Math.sin(PI*t)*1.08:-0.3,se=Math.sin(e);
  const day=smooth(-0.04,0.22,se),gold=(1-smooth(0.04,0.42,se))*smooth(-0.12,0.02,se),night=1-smooth(-0.1,0.08,se);nightF=night;
  const az=PI*clamp(t,0,1),dir=new THREE.Vector3(Math.cos(az)*Math.cos(e),Math.max(se,0.04),0.5*Math.cos(e)).normalize();
  let ld=dir,li=2.7*day;const lc=new THREE.Color(0xfff2df).lerp(new THREE.Color(0xff9a55),gold);
  if(day<0.05){ld=new THREE.Vector3(-0.35,0.85,-0.4).normalize();li=Math.max(li,0.32*night);lc.setHex(0x9fb4e6);}
  sun.position.copy(ld).multiplyScalar(42);sun.color.copy(lc);sun.intensity=li;
  hemi.color.setHex(0x24304f).lerp(new THREE.Color(0xd3e3ff),day);hemi.groundColor.setHex(0x15130f).lerp(new THREE.Color(0x6b5c48),day);hemi.intensity=0.22+0.36*day;
  const u=skyMat.uniforms;
  u.top.value.copy(SKY.dayTop).lerp(SKY.goldTop,gold).lerp(SKY.nightTop,night);
  u.hor.value.copy(SKY.dayHor).lerp(SKY.goldHor,gold).lerp(SKY.nightHor,night);
  u.bot.value.copy(SKY.dayBot).lerp(SKY.nightBot,night);
  u.sunDir.value.copy(dir);u.sunCol.value.copy(lc).multiplyScalar(day);
  scene.fog.color.copy(u.hor.value);
  renderer.toneMappingExposure=1.0+0.3*night;
  applyLamps();schedEnv(now);
  $('time-out').textContent=String(Math.floor(h)).padStart(2,'0')+':'+String(Math.round((h%1)*60)).padStart(2,'0');
}
function applyLamps(){
  SHADES.forEach(m=>m.emissiveIntensity=0.04+1.5*nightF);
  for(const L of LAMPS){const on=!L.it.off;if(L.pl)L.pl.intensity=on?L.i*(0.25+nightF*1.1):0;L.mats.forEach(m=>m.emissiveIntensity=on?0.3+1.3*nightF:0.01);}
}

/* ---------------- ajudantes visuais ---------------- */
const hlMat=new THREE.MeshBasicMaterial({color:ACC,transparent:true,opacity:0.3,depthWrite:false});
const hlBox=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),hlMat);hlBox.visible=false;hlBox.renderOrder=2;gHelp.add(hlBox);
const rectMat=new THREE.MeshBasicMaterial({color:ACC,transparent:true,opacity:0.32,depthWrite:false});
const hlRect=new THREE.Mesh(new THREE.PlaneGeometry(1,1).rotateX(-PI/2),rectMat);hlRect.visible=false;hlRect.renderOrder=2;gHelp.add(hlRect);
const dot=new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.14,0.02,24),new THREE.MeshBasicMaterial({color:ACC}));dot.visible=false;gHelp.add(dot);
const ghostWallMat=new THREE.MeshBasicMaterial({color:ACC,transparent:true,opacity:0.45,depthWrite:false});
const gWallGhost=new THREE.Group();gHelp.add(gWallGhost);
const gGhost=new THREE.Group();gHelp.add(gGhost);
function footprint(color,op){const f=new THREE.Group();const p=new THREE.Mesh(new THREE.PlaneGeometry(1,1).rotateX(-PI/2),new THREE.MeshBasicMaterial({color,transparent:true,opacity:op,depthWrite:false}));
  const l=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.5,0,-0.5),new THREE.Vector3(0.5,0,-0.5),new THREE.Vector3(0.5,0,0.5),new THREE.Vector3(-0.5,0,0.5)]),new THREE.LineBasicMaterial({color}));
  f.add(p,l);f.visible=false;gHelp.add(f);return f;}
const selFoot=footprint(ACC,0.18),ghostFoot=footprint(ACC,0.22),hoverFoot=footprint(ACC,0.12);
function placeFoot(f,def,r,x,z,color){const sw=r%2?def.d:def.w,sd=r%2?def.w:def.d;f.scale.set(sw+0.06,1,sd+0.06);f.position.set(x,baseY(x,z)+0.008,z);f.children[0].material.color.setHex(color||ACC);f.children[1].material.color.setHex(color||ACC);f.visible=true;}
function clearHL(){hlBox.visible=false;hlRect.visible=false;dot.visible=false;hoverFoot.visible=false;}
function showSegHL(key,color,side){
  const s=segInfo(key),H=wallH();hlMat.color.setHex(color);
  if(side){const off=(side==='b'?1:-1)*(T/2+0.012);
    if(s.d==='h'){hlBox.position.set(s.x+0.5,H/2,s.z+off);hlBox.scale.set(1,H,0.02);}else{hlBox.position.set(s.x+off,H/2,s.z+0.5);hlBox.scale.set(0.02,H,1);}}
  else if(s.d==='h'){hlBox.position.set(s.x+0.5,H/2,s.z);hlBox.scale.set(1.02,H+0.03,T+0.05);}else{hlBox.position.set(s.x,H/2,s.z+0.5);hlBox.scale.set(T+0.05,H+0.03,1.02);}
  hlBox.visible=true;
}
function showRect(c0,c1,color){const x0=Math.min(c0[0],c1[0]),x1=Math.max(c0[0],c1[0])+1,z0=Math.min(c0[1],c1[1]),z1=Math.max(c0[1],c1[1])+1;
  rectMat.color.setHex(color);hlRect.scale.set(x1-x0,1,z1-z0);hlRect.position.set((x0+x1)/2,FH+0.012,(z0+z1)/2);hlRect.visible=true;return[x1-x0,z1-z0];}

/* ---------------- interação ---------------- */
const ray=new THREE.Raycaster(),ndc=new THREE.Vector2(),gPlane=new THREE.Plane(new THREE.Vector3(0,1,0),-FH),tv=new THREE.Vector3();
function setRay(e){const r=cv.getBoundingClientRect();ndc.set(((e.clientX-r.left)/r.width)*2-1,-((e.clientY-r.top)/r.height)*2+1);ray.setFromCamera(ndc,camera);}
function groundPoint(e){setRay(e);if(!ray.ray.intersectPlane(gPlane,tv))return null;return{x:tv.x+N/2,z:tv.z+N/2};}
const snapV=p=>[clamp(Math.round(p.x),0,N),clamp(Math.round(p.z),0,N)];
const cellOf=(p,cl)=>{let x=Math.floor(p.x),z=Math.floor(p.z);if(cl){x=clamp(x,0,N-1);z=clamp(z,0,N-1);}return(x<0||z<0||x>=N||z>=N)?null:[x,z];};
function pickWall(e){setRay(e);const hits=ray.intersectObjects(gWalls.children,true);
  for(const h of hits){const u=h.object.userData;if(u.seg){let side=null;if(u.piece){const mi=h.face&&h.face.materialIndex;if(mi===4)side=u.plus;else if(mi===5)side=u.minus;}return{seg:u.seg,side};}return null;}return null;}
function itemIdOf(o){while(o&&o!==gItems){if(o.userData.itemId!=null)return o.userData.itemId;o=o.parent;}return null;}
function pickItem(e){setRay(e);const hits=ray.intersectObjects(gItems.children,true);return hits.length?itemIdOf(hits[0].object):null;}
function pickAny(e){setRay(e);const hits=ray.intersectObjects([gWalls,gItems],true);
  for(const h of hits){const id=itemIdOf(h.object);if(id!=null)return{item:id};if(h.object.userData.seg)return{seg:h.object.userData.seg};return null;}return null;}

function snapItem(def,r,cx,cz){
  const hx=(r%2?def.d:def.w)/2,hz=(r%2?def.w:def.d)/2,M=0.24,t=T/2;
  cx=Math.round(cx*20)/20;cz=Math.round(cz*20)/20;let bx=null,bz=null,dx=M,dz=M;
  for(const k in state.walls){const s=segInfo(k);
    if(s.d==='h'){if(cx+hx<=s.x+0.01||cx-hx>=s.x+0.99)continue;for(const c of[s.z+t+hz,s.z-t-hz]){const d=Math.abs(cz-c);if(d<dz){dz=d;bz=c;}}}
    else{if(cz+hz<=s.z+0.01||cz-hz>=s.z+0.99)continue;for(const c of[s.x+t+hx,s.x-t-hx]){const d=Math.abs(cx-c);if(d<dx){dx=d;bx=c;}}}
  }
  if(bx!==null)cx=bx;if(bz!==null)cz=bz;
  return[clamp(cx,hx-3,N+3-hx),clamp(cz,hz-3,N+3-hz)];
}

const ui={tool:'camera',wallMode:'line',floorMode:'rect',floorMat:'carvalho',paintMode:'room',paintMat:'c:#a7b59e',doorStyle:'carvalho',winType:'normal',winFrame:'branco',cat:'Sala',item:'sofa',colors:{},rot:0,min:false};
const colorFor=k=>ui.colors[k]||ITEMS[k].colors[0][0];
let sel=null,act=null,ghostKey=null,ghostPos=null,lastE=null;
const ptrs=new Set();
const measure=$('measure');
function showMeasure(x,z,text){tv.set(x-N/2,0.4,z-N/2).project(camera);const r=cv.getBoundingClientRect();measure.style.left=((tv.x+1)/2*r.width)+'px';measure.style.top=((1-tv.y)/2*r.height)+'px';measure.textContent=text;measure.hidden=false;}
const fmtN=n=>n.toLocaleString('pt-PT',{minimumFractionDigits:n%1?1:0,maximumFractionDigits:2});

function wallSegs(v0,v1,mode){
  const segs=[];
  if(mode==='room'&&v0[0]!==v1[0]&&v0[1]!==v1[1]){
    const x0=Math.min(v0[0],v1[0]),x1=Math.max(v0[0],v1[0]),z0=Math.min(v0[1],v1[1]),z1=Math.max(v0[1],v1[1]);
    for(let x=x0;x<x1;x++){segs.push(`${x},${z0},h`,`${x},${z1},h`);}for(let z=z0;z<z1;z++){segs.push(`${x0},${z},v`,`${x1},${z},v`);}
    return{segs,end:v1,text:`${x1-x0} × ${z1-z0} m · ${(x1-x0)*(z1-z0)} m²`};
  }
  const dx=v1[0]-v0[0],dz=v1[1]-v0[1];
  if(Math.abs(dx)>=Math.abs(dz)){const a=Math.min(v0[0],v1[0]),b=Math.max(v0[0],v1[0]);for(let x=a;x<b;x++)segs.push(`${x},${v0[1]},h`);return{segs,end:[v1[0],v0[1]],text:`${b-a} m`};}
  const a=Math.min(v0[1],v1[1]),b=Math.max(v0[1],v1[1]);for(let z=a;z<b;z++)segs.push(`${v0[0]},${z},v`);return{segs,end:[v0[0],v1[1]],text:`${b-a} m`};
}
function previewWall(){
  gWallGhost.clear();const{segs,end,text}=wallSegs(act.v0,act.v1,ui.wallMode),H=wallH();act.segs=segs;
  for(const k of segs){if(state.walls[k])continue;const s=segInfo(k);const m=new THREE.Mesh(s.d==='h'?boxG(1,H,T):boxG(T,H,1),ghostWallMat);
    if(s.d==='h')m.position.set(s.x+0.5,H/2,s.z);else m.position.set(s.x,H/2,s.z+0.5);gWallGhost.add(m);}
  dot.position.set(end[0],FH+0.012,end[1]);dot.visible=true;
  if(segs.length)showMeasure(end[0],end[1],text);else measure.hidden=true;
}
function applyPaint(h){
  const w=state.walls[h.seg];if(!w)return;
  if(ui.paintMode==='room'){const c=facingCell(h.seg,h.side);const cells=region(state.walls,c[0],c[1]);if(cells.length)paintRegion(state.walls,cells,ui.paintMat);else w[h.side]=ui.paintMat;}
  else w[h.side]=ui.paintMat;
  rebuildWalls();
}
function placeGhost(e){
  const p=groundPoint(e);if(!p){gGhost.visible=false;ghostFoot.visible=false;ghostPos=null;return;}
  const def=ITEMS[ui.item],[x,z]=snapItem(def,ui.rot,p.x,p.z),key=ui.item+'|'+colorFor(ui.item)+'|'+ui.rot;
  if(key!==ghostKey){gGhost.clear();gGhost.add(makeItem({id:-1,k:ui.item,x:0,z:0,r:ui.rot,c:colorFor(ui.item)},true));ghostKey=key;}
  gGhost.children[0].position.set(x,baseY(x,z),z);gGhost.visible=true;placeFoot(ghostFoot,def,ui.rot,x,z);ghostPos={x,z};
}
function hideGhost(){gGhost.visible=false;ghostFoot.visible=false;ghostPos=null;}
function eraseAt(e){
  const h=pickAny(e);
  if(h&&h.item!=null){state.items=state.items.filter(i=>i.id!==h.item);if(sel===h.item)sel=null;rebuildItems();return;}
  if(h&&h.seg){delete state.walls[h.seg];rebuildWalls();return;}
  if(h)return;
  const p=groundPoint(e),c=p&&cellOf(p);if(c){const k=c.join(',');if(state.floors[k]){delete state.floors[k];rebuildFloors();rebuildItems();}}
}

function toolDown(e){
  const t=ui.tool;
  if(t==='wall'){const p=groundPoint(e);if(!p)return;const v=snapV(p);act={k:'wall',v0:v,v1:v,segs:[]};previewWall();}
  else if(t==='door'||t==='window'){
    const h=pickWall(e);if(!h)return;const w=state.walls[h.seg];begin();
    if(t==='door'){if(w.t==='door'&&w.s===ui.doorStyle){w.t='wall';delete w.s;}else{w.t='door';w.s=ui.doorStyle;delete w.w;delete w.f;}}
    else{if(w.t==='window'&&w.w===ui.winType&&w.f===ui.winFrame){w.t='wall';delete w.w;delete w.f;}else{w.t='window';w.w=ui.winType;w.f=ui.winFrame;delete w.s;}}
    rebuildWalls();end();hover(e);
  }
  else if(t==='floor'){
    const p=groundPoint(e),c=p&&cellOf(p);if(!c)return;
    if(ui.floorMode==='room'){begin();for(const[x,z]of region(state.walls,c[0],c[1]))state.floors[x+','+z]=ui.floorMat;rebuildFloors();rebuildItems();end();}
    else{act={k:'floorRect',c0:c,c1:c};floorPreview();}
  }
  else if(t==='paint'){const h=pickWall(e);if(!h||!h.side)return;begin();applyPaint(h);act={k:'paint',last:h.seg+h.side};}
  else if(t==='furniture'){act={k:'place'};placeGhost(e);}
  else if(t==='select'){
    const id=pickItem(e);selectItem(id);if(id==null)return;const it=getItem(id),p=groundPoint(e);if(!p)return;
    begin();act={k:'drag',id,ox:it.x-p.x,oz:it.z-p.z};cv.style.cursor='grabbing';
  }
  else if(t==='erase'){begin();act={k:'erase'};eraseAt(e);}
}
function floorPreview(){const[w,d]=showRect(act.c0,act.c1,ACC);const x=Math.max(act.c0[0],act.c1[0])+1,z=Math.max(act.c0[1],act.c1[1])+1;showMeasure(x,z,`${w} × ${d} m · ${w*d} m²`);}
function toolMove(e){
  if(act.k==='wall'){const p=groundPoint(e);if(!p)return;const v=snapV(p);if(v[0]!==act.v1[0]||v[1]!==act.v1[1]){act.v1=v;previewWall();}}
  else if(act.k==='floorRect'){const p=groundPoint(e);if(!p)return;act.c1=cellOf(p,true);floorPreview();}
  else if(act.k==='paint'){const h=pickWall(e);if(h&&h.side&&h.seg+h.side!==act.last){act.last=h.seg+h.side;applyPaint(h);}}
  else if(act.k==='place')placeGhost(e);
  else if(act.k==='drag'){const p=groundPoint(e);if(!p)return;const it=getItem(act.id);if(!it)return;
    const[x,z]=snapItem(ITEMS[it.k],it.r,p.x+act.ox,p.z+act.oz);it.x=x;it.z=z;
    const g=gItems.children.find(c=>c.userData.itemId===it.id);if(g)g.position.set(x,baseY(x,z),z);updateSel();}
  else if(act.k==='erase')eraseAt(e);
}
function toolUp(){
  const a=act;act=null;measure.hidden=true;
  if(a.k==='wall'){gWallGhost.clear();dot.visible=false;const add=a.segs.filter(k=>!state.walls[k]);if(add.length){begin();for(const k of add)state.walls[k]={t:'wall',a:WHITE,b:WHITE};rebuildWalls();end();}}
  else if(a.k==='floorRect'){hlRect.visible=false;begin();const x0=Math.min(a.c0[0],a.c1[0]),x1=Math.max(a.c0[0],a.c1[0]),z0=Math.min(a.c0[1],a.c1[1]),z1=Math.max(a.c0[1],a.c1[1]);
    for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++)state.floors[x+','+z]=ui.floorMat;rebuildFloors();rebuildItems();end();}
  else if(a.k==='place'){if(ghostPos){begin();const id=nextId();state.items.push({id,k:ui.item,x:ghostPos.x,z:ghostPos.z,r:ui.rot,c:colorFor(ui.item)});rebuildItems();end();}if(a.touch)hideGhost();}
  else if(a.k==='drag'){cv.style.cursor='grab';end();}
  else end();
}
function cancelAct(){
  if(!act)return;const a=act;act=null;measure.hidden=true;gWallGhost.clear();dot.visible=false;hlRect.visible=false;
  if(a.k==='paint'||a.k==='erase'||a.k==='drag'){end();if(a.k==='drag')rebuildItems();}
}
function hover(e){
  clearHL();let cur='default';const t=ui.tool;
  if(t==='wall'){const p=groundPoint(e);if(p){const v=snapV(p);dot.position.set(v[0],FH+0.012,v[1]);dot.visible=true;cur='crosshair';}}
  else if(t==='door'||t==='window'){const h=pickWall(e);if(h){showSegHL(h.seg,ACC);cur='pointer';}}
  else if(t==='paint'){const h=pickWall(e);if(h&&h.side){showSegHL(h.seg,ACC,h.side);cur='pointer';}}
  else if(t==='floor'){const p=groundPoint(e),c=p&&cellOf(p);if(c){showRect(c,c,ACC);cur='crosshair';}}
  else if(t==='furniture'){placeGhost(e);cur='copy';}
  else if(t==='select'){const id=pickItem(e);if(id!=null&&id!==sel){const it=getItem(id);placeFoot(hoverFoot,ITEMS[it.k],it.r,it.x,it.z);}if(id!=null)cur='grab';}
  else if(t==='erase'){const h=pickAny(e);
    if(h&&h.item!=null){const it=getItem(h.item);placeFoot(hoverFoot,ITEMS[it.k],it.r,it.x,it.z,RED);cur='pointer';}
    else if(h&&h.seg){showSegHL(h.seg,RED);cur='pointer';}
    else if(!h){const p=groundPoint(e),c=p&&cellOf(p);if(c&&state.floors[c.join(',')]){showRect(c,c,RED);cur='pointer';}}}
  cv.style.cursor=cur;
}

cv.addEventListener('pointerdown',e=>{
  ptrs.add(e.pointerId);
  if(ptrs.size>1){cancelAct();hideGhost();return;}
  if(e.pointerType==='mouse'&&e.button!==0)return;
  closeMenu();
  if(ui.tool==='walk'){
    if(e.pointerType==='mouse'&&FINE){if(locked())interact();else try{const r=cv.requestPointerLock();if(r&&r.catch)r.catch(()=>{});}catch(err){}return;}
    act={k:'look',x:e.clientX,y:e.clientY};return;}
  if(ui.tool==='camera')return;
  toolDown(e);if(act&&e.pointerType!=='mouse')act.touch=true;
});
window.addEventListener('pointermove',e=>{
  if(walk.on&&locked()){walk.yaw-=e.movementX*0.0024;walk.pitch=clamp(walk.pitch-e.movementY*0.0024,-1.35,1.35);return;}
  if(act){if(act.k==='look'){walk.yaw-=(e.clientX-act.x)*0.0042;walk.pitch=clamp(walk.pitch-(e.clientY-act.y)*0.0042,-1.25,1.25);act.x=e.clientX;act.y=e.clientY;}else toolMove(e);}
  else if(e.target===cv&&e.pointerType==='mouse'){lastE=e;hover(e);}
});
window.addEventListener('pointerup',e=>{ptrs.delete(e.pointerId);if(act){if(act.k==='look')act=null;else toolUp(e);}});
window.addEventListener('pointercancel',e=>{ptrs.delete(e.pointerId);cancelAct();});
cv.addEventListener('pointerleave',()=>{if(!act){clearHL();if(ui.tool==='furniture')hideGhost();}});
cv.addEventListener('contextmenu',e=>e.preventDefault());

/* ---------------- seleção ---------------- */
function selectItem(id){sel=id;updateSel();if(ui.tool==='select')renderPanel();}
function updateSel(){const it=sel!=null&&getItem(sel);if(!it){selFoot.visible=false;if(sel!=null)sel=null;return;}placeFoot(selFoot,ITEMS[it.k],it.r,it.x,it.z);}
function rotateSel(){const it=getItem(sel);if(!it)return;begin();it.r=(it.r+1)%4;[it.x,it.z]=snapItem(ITEMS[it.k],it.r,it.x,it.z);rebuildItems();end();}
function dupSel(){const it=getItem(sel);if(!it)return;begin();const[x,z]=snapItem(ITEMS[it.k],it.r,it.x+0.6,it.z+0.6);const n={...it,id:nextId(),x,z};state.items.push(n);sel=n.id;rebuildItems();end();}
function delSel(){if(sel==null)return;begin();state.items=state.items.filter(i=>i.id!==sel);sel=null;rebuildItems();end();}

/* ---------------- passear ---------------- */
const walk={on:false,yaw:0,pitch:-0.05,x:0,z:0,y:0,vy:0,eye:1.6,keys:{},saved:null};
const FINE=matchMedia('(pointer: fine)').matches;
const locked=()=>document.pointerLockElement===cv;
function itemHit(i,pad){const d=ITEMS[i.k];if(!d||NOBLOCK.has(i.k))return null;const[w,dd]=d.hit||[d.w,d.d];return[(i.r%2?dd:w)/2+pad,(i.r%2?w:dd)/2+pad];}
function blocked(x,z){
  for(const i of state.items){const h=itemHit(i,0.2);if(h&&Math.abs(x-i.x)<h[0]&&Math.abs(z-i.z)<h[1])return true;}
  const R=0.27+T/2;for(const k in state.walls){if(state.walls[k].t==='door'){const ds=DOORST[k];if(!ds||ds.open&&!ds.locked)continue;}const s=segInfo(k);let d;
  if(s.d==='h'){const cx=clamp(x,s.x,s.x+1);d=Math.hypot(x-cx,z-s.z);}else{const cz=clamp(z,s.z,s.z+1);d=Math.hypot(x-s.x,z-cz);}if(d<R)return true;}return false;}
function enterWalk(){
  walk.saved={p:camera.position.clone(),t:controls.target.clone()};controls.enabled=false;
  let sx=controls.target.x+N/2,sz=controls.target.z+N/2,best=null,bd=1e9;
  for(const[k,m]of Object.entries(state.floors)){if(EXT.has(m))continue;const[x,z]=k.split(',').map(Number),cx=x+0.5,cz=z+0.5;if(blocked(cx,cz))continue;
    if(state.items.some(i=>Math.abs(i.x-cx)<0.5&&Math.abs(i.z-cz)<0.5))continue;const d=(cx-sx)**2+(cz-sz)**2;if(d<bd){bd=d;best=[cx,cz];}}
  if(best){sx=best[0];sz=best[1];}
  const dx=walk.saved.t.x-walk.saved.p.x,dz=walk.saved.t.z-walk.saved.p.z;
  walk.x=sx;walk.z=sz;walk.yaw=Math.atan2(-dx,-dz);walk.pitch=-0.05;walk.on=true;walk.keys={};
  camera.fov=70;camera.updateProjectionMatrix();grid.visible=false;if(wallsCut)rebuildWalls();
  walk.y=0;walk.vy=0;walk.eye=1.6;
  const touch=matchMedia('(pointer: coarse)').matches;$('walkpad').hidden=$('actpad').hidden=!touch;app.classList.add('walking');
  $('cross').hidden=false;$('hud').hidden=false;renderHud();
}
function exitWalk(){
  walk.on=false;camera.fov=50;camera.updateProjectionMatrix();camera.position.copy(walk.saved.p);controls.target.copy(walk.saved.t);controls.enabled=true;controls.update();
  $('walkpad').hidden=$('actpad').hidden=$('cross').hidden=$('prompt').hidden=$('hud').hidden=true;app.classList.remove('walking');
  if(locked())document.exitPointerLock();endGame(false);if(wallsCut)rebuildWalls();
}
let bob=0;
function walkStep(dt){
  const k=walk.keys,f=(k.KeyW||k.ArrowUp?1:0)-(k.KeyS||k.ArrowDown?1:0),s=(k.KeyD?1:0)-(k.KeyA?1:0),turn=(k.ArrowRight||k.TurnR?1:0)-(k.ArrowLeft||k.TurnL?1:0);
  walk.yaw-=turn*1.9*dt;
  const crouch=!!(k.KeyC||k.ControlLeft),sp=(crouch?0.9:k.ShiftLeft||k.ShiftRight?3.6:1.8)*dt,fx=-Math.sin(walk.yaw),fz=-Math.cos(walk.yaw),rx=Math.cos(walk.yaw),rz=-Math.sin(walk.yaw);
  let dx=(fx*f+rx*s)*sp,dz=(fz*f+rz*s)*sp;if(f&&s){dx*=0.707;dz*=0.707;}
  const stuck=blocked(walk.x,walk.z);
  if(dx&&(stuck||!blocked(walk.x+dx,walk.z)))walk.x+=dx;if(dz&&(stuck||!blocked(walk.x,walk.z+dz)))walk.z+=dz;
  walk.x=clamp(walk.x,-10,N+10);walk.z=clamp(walk.z,-10,N+10);
  if(k.Space&&walk.y<=0&&!crouch){walk.vy=3.6;sfx('jump');}
  walk.vy-=9.8*dt;walk.y=Math.max(0,walk.y+walk.vy*dt);if(walk.y===0)walk.vy=0;
  walk.eye+=((crouch?1.0:1.6)-walk.eye)*Math.min(1,dt*10);
  if((f||s)&&walk.y===0){const ob=Math.sin(bob);bob+=dt*(sp/dt)*3.2;if(ob<0&&Math.sin(bob)>=0)sfx('step');}
  camera.position.set(walk.x-N/2,FH+walk.eye+walk.y+Math.sin(bob)*0.022,walk.z-N/2);camera.rotation.set(walk.pitch,walk.yaw,0,'YXZ');
}
document.querySelectorAll('#walkpad button,#actpad button[data-k]').forEach(b=>{
  const k=b.dataset.k;b.addEventListener('pointerdown',e=>{e.preventDefault();walk.keys[k]=true;});
  for(const ev of['pointerup','pointerleave','pointercancel'])b.addEventListener(ev,()=>{walk.keys[k]=false;});
});

$('act-use').addEventListener('click',()=>interact());

/* o que está à frente dos olhos (a menos de 2,6 m) */
const CENTER=new THREE.Vector2(0,0);
function doorwayAhead(maxD){
  // a passagem de uma porta aberta não tem nada para o raio acertar: cruza o raio com o plano da porta
  const o=ray.ray.origin,d=ray.ray.direction,ox=o.x+N/2,oz=o.z+N/2;let best=null,bd=maxD;
  for(const k in state.walls){if(state.walls[k].t!=='door')continue;const s=segInfo(k),h=s.d==='h',den=h?d.z:d.x;if(Math.abs(den)<1e-4)continue;
    const t=((h?s.z:s.x)-(h?oz:ox))/den;if(t<=0||t>=bd)continue;const u=(h?ox+d.x*t:oz+d.z*t)-(h?s.x:s.z),y=o.y+d.y*t;
    if(u>0.05&&u<0.95&&y>0&&y<2.1){bd=t;best=k;}}
  return best?{door:best,dist:bd}:null;
}
function lookTarget(){
  ray.setFromCamera(CENTER,camera);ray.far=2.6;const hits=ray.intersectObjects([gWalls,gItems],true);ray.far=Infinity;
  const dw=doorwayAhead(2.6);
  for(const h of hits){
    if(dw&&dw.dist<h.distance)return{door:dw.door};
    const id=itemIdOf(h.object);
    if(id!=null){const it=getItem(id),d=it&&ITEMS[it.k];if(d&&(d.light||d.sw))return{item:it};continue;}
    const sg=h.object.userData.seg;if(sg&&state.walls[sg]&&state.walls[sg].t==='door')return{door:sg};
    return null;
  }
  return dw?{door:dw.door}:null;
}
function promptText(t){
  if(!t)return'';
  if(t.door){const d=doorSt(t.door);return d.locked?(game.hasKey?'Destrancar a porta':'Porta trancada'):d.open?'Fechar a porta':'Abrir a porta';}
  const d=ITEMS[t.item.k];return d.sw?'Carregar no interruptor':t.item.off?'Acender':'Apagar';
}
function roomLamps(x,z){const cells=new Set(region(state.walls,Math.floor(x),Math.floor(z)).map(c=>c.join(',')));
  return state.items.filter(i=>ITEMS[i.k]&&ITEMS[i.k].light&&cells.has(Math.floor(i.x)+','+Math.floor(i.z)));}
function setLamp(it,on){if(on)delete it.off;else it.off=true;}
function interact(){
  const t=lookTarget();if(!t)return;
  if(t.door){const d=doorSt(t.door);
    if(d.locked){if(game.hasKey){d.locked=false;d.open=true;game.hasKey=false;sfx('unlock');toast('Porta destrancada!');renderHud();}else{sfx('locked');toast('Está trancada. Procura a chave.');}return;}
    d.open=!d.open;sfx(d.open?'open':'close');return;}
  const it=t.item;
  if(ITEMS[it.k].sw){const ls=roomLamps(it.x,it.z);if(!ls.length){sfx('click');toast('Esta divisão não tem candeeiros');return;}const on=ls.every(i=>i.off);ls.forEach(i=>setLamp(i,on));}
  else setLamp(it,!!it.off);
  sfx('click');applyLamps();save();
}

/* ---------------- sons ---------------- */
let AC=null,muted=false;try{muted=localStorage.getItem('minha-casa-som')==='0';}catch(e){}
const SFX={coin:[[988,.06],[1319,.14]],key:[[660,.08],[880,.08],[1175,.18]],win:[[523,.12],[659,.12],[784,.12],[1047,.4]],click:[[1700,.025]],
  open:[[180,.14]],close:[[130,.1]],locked:[[150,.08],[120,.12]],unlock:[[440,.07],[660,.12]],jump:[[300,.06]],step:[[90,.04]]};
function sfx(kind){
  if(muted)return;
  try{AC=AC||new(window.AudioContext||window.webkitAudioContext)();if(AC.state==='suspended')AC.resume();}catch(e){return;}
  let t=AC.currentTime;const soft=kind==='step'||kind==='jump',vol=kind==='step'?0.05:soft?0.08:0.16;
  for(const[f,d]of SFX[kind]){const o=AC.createOscillator(),g=AC.createGain();o.type=['open','close','locked','step'].includes(kind)?'triangle':'sine';o.frequency.value=f;
    g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+0.01);g.gain.exponentialRampToValueAtTime(0.0001,t+d);o.connect(g).connect(AC.destination);o.start(t);o.stop(t+d+0.03);t+=d*0.9;}
}

/* ---------------- missão: moedas, chave e porta trancada ---------------- */
const gGame=new THREE.Group();house.add(gGame);
const game={on:false,pick:[],total:0,got:0,hasKey:false,keyPlaced:false,t0:0,lockedDoor:null};
const fmtT=sec=>String(Math.floor(sec/60)).padStart(2,'0')+':'+String(Math.floor(sec%60)).padStart(2,'0');
function pickMesh(kind){
  const g=new THREE.Group();
  if(MODELS[kind])addModel(g,kind,null,null,null,true);
  else if(kind==='moeda'){const m=new THREE.Mesh(cylG(0.1,0.1,0.016,24),metal('#e6b83f',0.25));m.rotation.x=PI/2;g.add(m);}
  else{const m=metal('#d9ad45',0.3);const a=new THREE.Mesh(boxG(0.2,0.024,0.012),m);a.position.x=0.03;const b=new THREE.Mesh(new THREE.TorusGeometry(0.045,0.012,8,20),m);b.position.x=-0.09;g.add(a,b);}
  return g;
}
function reachable(start,lockedDoor){
  const seen=new Set([start.join(',')]),q=[start],out=[];
  const pass=k=>{const w=state.walls[k];return!w||(w.t==='door'&&k!==lockedDoor);};
  while(q.length){const[x,z]=q.pop();out.push([x,z]);
    for(const[nx,nz,k]of[[x+1,z,`${x+1},${z},v`],[x-1,z,`${x},${z},v`],[x,z+1,`${x},${z+1},h`],[x,z-1,`${x},${z},h`]]){
      if(nx<0||nz<0||nx>=N||nz>=N||!pass(k))continue;const key=nx+','+nz;if(seen.has(key))continue;seen.add(key);q.push([nx,nz]);}}
  return out;
}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=(Math.random()*(i+1))|0;[a[i],a[j]]=[a[j],a[i]];}return a;}
function startGame(){
  if(!walk.on)return;endGame(false);
  const start=[Math.floor(walk.x),Math.floor(walk.z)];
  if(start[0]<0||start[1]<0||start[0]>=N||start[1]>=N){toast('Entra na casa para começar a missão');return;}
  const good=([x,z])=>{const f=state.floors[x+','+z];if(!f||EXT.has(f)||(x===start[0]&&z===start[1]))return false;
    return!state.items.some(i=>{const h=itemHit(i,0.1);return h&&Math.abs(x+0.5-i.x)<h[0]&&Math.abs(z+0.5-i.z)<h[1];});};
  const all=reachable(start,null).filter(good),key=c=>c.join(',');
  if(all.length<3){toast('A casa precisa de mais divisões com chão para a missão');return;}
  let lockedDoor=null,front=all,behind=[];
  const doors=shuffle(Object.keys(state.walls).filter(k=>state.walls[k].t==='door'));
  for(const d of doors){const fr=new Set(reachable(start,d).map(key)),f=all.filter(c=>fr.has(key(c))),b=all.filter(c=>!fr.has(key(c)));
    if(f.length>=1&&b.length>=1){lockedDoor=d;front=f;behind=b;break;}}
  const used=new Set(),take=list=>{const c=shuffle(list.slice()).find(c=>!used.has(key(c)));if(c)used.add(key(c));return c;};
  const total=Math.min(8,all.length-(lockedDoor?1:0)),spots=[];
  for(let i=0;i<Math.min(2,behind.length);i++)spots.push(take(behind));
  while(spots.length<total){const c=take(all);if(!c)break;spots.push(c);}
  const place=(kind,c)=>{const g=pickMesh(kind),x=c[0]+0.3+Math.random()*0.4,z=c[1]+0.3+Math.random()*0.4;g.position.set(x,FH+1.0,z);g.userData={kind,x,z,y:FH+1.0,ph:Math.random()*6};gGame.add(g);game.pick.push(g);};
  spots.forEach(c=>place('moeda',c));
  if(lockedDoor){const c=take(front);if(c){place('chave',c);const d=doorSt(lockedDoor);d.open=false;d.locked=true;game.lockedDoor=lockedDoor;}}
  Object.assign(game,{on:true,total:spots.length,got:0,hasKey:false,keyPlaced:!!game.lockedDoor,t0:performance.now()});
  sfx('unlock');toast(`Apanha as ${game.total} moedas!`+(game.lockedDoor?' Há uma porta trancada: procura a chave.':''));renderHud();
}
function endGame(){
  for(const g of game.pick)gGame.remove(g);game.pick=[];
  if(game.lockedDoor){const d=doorSt(game.lockedDoor);d.locked=false;d.open=true;}
  Object.assign(game,{on:false,lockedDoor:null,hasKey:false,keyPlaced:false});renderHud();
}
function bestTime(){try{return+localStorage.getItem('minha-casa-recorde')||0;}catch(e){return 0;}}
function winGame(){
  const sec=(performance.now()-game.t0)/1000,best=bestTime(),rec=!best||sec<best;
  if(rec)try{localStorage.setItem('minha-casa-recorde',String(sec));}catch(e){}
  endGame();sfx('win');if(locked())document.exitPointerLock();
  $('win-text').textContent=`Apanhaste as moedas todas em ${fmtT(sec)}.`+(rec?(best?' É o teu novo recorde!':''):` O teu recorde é ${fmtT(best)}.`);
  $('win').hidden=false;
}
function gameStep(dt,now){
  if(!game.on)return;
  const px=walk.x,pz=walk.z;
  for(const g of game.pick.slice()){const u=g.userData;g.rotation.y+=dt*2.2;g.position.y=u.y+Math.sin(now/400+u.ph)*0.06;
    if(Math.hypot(px-u.x,pz-u.z)<0.55){gGame.remove(g);game.pick.splice(game.pick.indexOf(g),1);
      if(u.kind==='chave'){game.hasKey=true;sfx('key');toast('Apanhaste a chave! Agora abre a porta trancada.');}
      else{game.got++;sfx('coin');}
      renderHud();if(game.got>=game.total){winGame();return;}}}
  const el=$('hud-time');if(el){const t=fmtT((now-game.t0)/1000);if(el.textContent!==t)el.textContent=t;}
}
function renderHud(){
  const h=$('hud');if(!h)return;
  const snd=`<button class="ib" data-game="sound" aria-label="${muted?'Ligar o som':'Desligar o som'}" title="${muted?'Ligar o som':'Desligar o som'}">${muted?'Sem som':'Som'}</button>`;
  h.innerHTML=game.on?`<span><b>${game.got}</b>/${game.total} moedas</span>${game.keyPlaced?`<span>${game.hasKey?'Tens a chave':game.lockedDoor&&!doorSt(game.lockedDoor).locked?'Porta aberta':'Sem chave'}</span>`:''}<span class="mono" id="hud-time">${fmtT((performance.now()-game.t0)/1000)}</span>${snd}<button class="ib" data-game="stop" aria-label="Desistir" title="Desistir">✕</button>`
    :`<button class="btn primary" data-game="start">Começar missão</button>${bestTime()?`<span class="mono" title="Recorde">Recorde ${fmtT(bestTime())}</span>`:''}${snd}`;
}
$('hud').addEventListener('click',e=>{const b=e.target.closest('[data-game]');if(!b)return;const a=b.dataset.game;
  if(a==='start')startGame();else if(a==='stop'){endGame();toast('Missão cancelada');}
  else if(a==='sound'){muted=!muted;try{localStorage.setItem('minha-casa-som',muted?'0':'1');}catch(e){}renderHud();}
  b.blur();});
$('win-again').addEventListener('click',()=>{$('win').hidden=true;startGame();});
$('win-close').addEventListener('click',()=>{$('win').hidden=true;});

/* ---------------- interface ---------------- */
const TOOLS=[
  ['camera','Ver','<ellipse cx="12" cy="12" rx="9.5" ry="4.2"/><circle cx="12" cy="12" r="2.4"/>'],
  ['wall','Paredes','<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 9.7h18M3 14.3h18M9 5v4.7M15 9.7v4.6M9 14.3V19"/>'],
  ['door','Portas','<path d="M6 21V3.5h12V21"/><path d="M3 21h18"/><circle cx="14.6" cy="12.5" r="1" fill="currentColor"/>'],
  ['window','Janelas','<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M12 4v16M4 12h16"/>'],
  ['floor','Chão','<path d="M2.5 14.5 12 9l9.5 5.5L12 20z"/><path d="m7.2 11.8 9.5 5.5M16.8 11.8l-9.5 5.5"/>'],
  ['paint','Pintar','<rect x="3.5" y="3.5" width="13" height="5.5" rx="1.2"/><path d="M16.5 6.2h3.5v5.3h-8v2.5"/><rect x="10.5" y="14" width="3" height="7" rx="1"/>'],
  ['furniture','Móveis','<path d="M5 10.5v-3A1.5 1.5 0 0 1 6.5 6h11A1.5 1.5 0 0 1 19 7.5v3"/><path d="M3.5 10.5H5A1.5 1.5 0 0 1 6.5 12v1.5h11V12a1.5 1.5 0 0 1 1.5-1.5h1.5a1 1 0 0 1 1 1V17h-19v-5.5a1 1 0 0 1 1-1z"/><path d="M5 17v2.5M19 17v2.5"/>'],
  ['select','Mover','<path d="M12 3v18M3 12h18M12 3 9.5 5.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5"/>'],
  ['erase','Apagar','<path d="m15.5 4 5 5L10 19.5H5.5l-3-3z"/><path d="m10 9.5 5 5M10 19.5h11"/>'],
  ['walk','Passear','<circle cx="13" cy="4.5" r="2"/><path d="M8 21l3-7 3 3v4.5M7 12l2.5-4 4-.5 2 3.5 3 1.5M11 14l1.6-6.5"/>'],
];
const ico=p=>`<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
$('tools').innerHTML=TOOLS.map(([id,n,p],i)=>`<button class="tool" data-tool="${id}" title="${n} (${(i+1)%10})">${ico(p)}<span>${n}</span><kbd>${(i+1)%10}</kbd></button>`).join('');
$('tools').addEventListener('click',e=>{const b=e.target.closest('[data-tool]');if(b)setTool(b.dataset.tool);});

const HINTS={
  camera:'Arrasta para rodar à volta da casa · roda do rato para aproximar · botão direito desloca a vista',
  wall:'Arrasta na grelha para levantar paredes · botão direito roda a vista',
  door:'Clica numa parede para abrir uma porta · clica na mesma porta para a fechar',
  window:'Clica numa parede para pôr uma janela · clica na mesma janela para voltar a pôr parede',
  floor:'Arrasta para cobrir uma área com o chão escolhido',
  floorRoom:'Clica dentro de uma divisão para lhe pôr chão de uma vez',
  paint:'Clica no lado de uma parede para o pintar',
  furniture:'Clica para pousar · R roda · perto de uma parede, o móvel encosta-se sozinho',
  select:'Arrasta um móvel para o mudar de sítio · R roda · Delete apaga',
  erase:'Clica ou arrasta por cima de paredes, móveis ou chão',
  walk:'Clica para olhar com o rato · W A S D anda · E abre e acende · Espaço salta · Esc sai',
};
function setHint(){$('hint').textContent=ui.tool==='floor'&&ui.floorMode==='room'?HINTS.floorRoom:HINTS[ui.tool];}
function configControls(){
  const M=THREE.MOUSE,TT=THREE.TOUCH;
  if(ui.tool==='camera'){controls.mouseButtons={LEFT:M.ROTATE,MIDDLE:M.DOLLY,RIGHT:M.PAN};controls.touches={ONE:TT.ROTATE,TWO:TT.DOLLY_PAN};}
  else{controls.mouseButtons={LEFT:-1,MIDDLE:M.PAN,RIGHT:M.ROTATE};controls.touches={ONE:-1,TWO:TT.DOLLY_ROTATE};}
}
function setTool(t){
  if(t===ui.tool)return;
  cancelAct();clearHL();hideGhost();
  if(ui.tool==='walk')exitWalk();
  if(t!=='select'&&sel!=null){sel=null;updateSel();}
  ui.tool=t;ghostKey=null;
  if(t==='walk')enterWalk();
  grid.visible=['wall','floor','furniture','select','erase'].includes(t);
  configControls();setHint();renderPanel();
  document.querySelectorAll('.tool').forEach(b=>b.classList.toggle('on',b.dataset.tool===t));
  cv.style.cursor='default';
}

const THUMBS={};
function texURL(key,tex){if(!THUMBS[key]){const c=document.createElement('canvas');c.width=c.height=96;c.getContext('2d').drawImage(tex.image,0,0,96,96);THUMBS[key]=c.toDataURL('image/jpeg',0.85);}return THUMBS[key];}
const surfThumb=k=>k.startsWith('c:')?`background:${k.slice(2)}`:`background-image:url(${texURL('s'+k,surfMat(k).map)})`;
const woodThumb=k=>`background-image:url(${texURL('v'+k,veneer(k).map)})`;
function colorThumb(v){if(v==='inox')return'background:linear-gradient(135deg,#eef0f2,#9ea3a9)';if(WOODHEX[v])return woodThumb(v);return`background:${v}`;}
const sw=(act,v,name,style,on)=>`<button class="sw${on?' on':''}" data-act="${act}" data-v="${v}" aria-pressed="${on}"><span class="sw-img" style="${style}"></span><span class="sw-name">${name}</span></button>`;
const segc=(act,opts,cur)=>`<div class="seg">${opts.map(([v,l])=>`<button data-act="${act}" data-v="${v}" class="${v===cur?'on':''}" aria-pressed="${v===cur}">${l}</button>`).join('')}</div>`;
const grp=(l,h)=>`<div class="group"><div class="label">${l}</div>${h}</div>`;
const lead=t=>`<p class="lead">${t}</p>`;
const tip=t=>`<div class="tip">${t}</div>`;
function dotsHTML(act,def,cur){const name=(def.colors.find(c=>c[0]===cur)||def.colors[0])[1];
  return `<div class="dots">${def.colors.map(([v,n])=>`<button class="dot${v===cur?' on':''}" data-act="${act}" data-v="${v}" title="${n}" aria-label="${n}" style="${colorThumb(v)}"></button>`).join('')}</div><div class="dots-name">${name}</div>`;}
function computeStats(){
  let area=0,walls=0;for(const m of Object.values(state.floors))if(!EXT.has(m))area++;walls=Object.keys(state.walls).length;
  let doors=0,wins=0;for(const w of Object.values(state.walls)){if(w.t==='door')doors++;else if(w.t==='window')wins++;}
  const seen=new Set();let rooms=0;
  for(let x=0;x<N;x++)for(let z=0;z<N;z++){if(seen.has(x+','+z))continue;const cells=region(state.walls,x,z);let open=false;
    for(const[a,b]of cells){seen.add(a+','+b);if((a===0&&!state.walls[`0,${b},v`])||(a===N-1&&!state.walls[`${N},${b},v`])||(b===0&&!state.walls[`${a},0,h`])||(b===N-1&&!state.walls[`${a},${N},h`]))open=true;}
    if(!open)rooms++;}
  return{area,walls,doors,wins,rooms,items:state.items.length};
}
let stats=computeStats();
function afterChange(){
  stats=computeStats();
  $('s-area').textContent=stats.area;$('s-rooms').textContent=stats.rooms;$('s-walls').textContent=stats.walls;$('s-items').textContent=stats.items;
  $('b-undo').disabled=!undoS.length;$('b-redo').disabled=!redoS.length;
  if(ui.tool==='camera'||ui.tool==='select')renderPanel();
}
function panelHTML(){
  const s=stats;
  switch(ui.tool){
  case 'camera':return['Ver a casa',lead('Arrasta para rodar à volta da casa. Usa a roda do rato, ou dois dedos, para aproximar. O botão direito desloca a vista.')
    +grp('Vistas',segc('view',[['iso','Três quartos'],['top','Planta'],['front','Frente']],null))
    +grp('Esta casa',`<dl class="facts"><dt>Área interior</dt><dd>${s.area} m²</dd><dt>Divisões fechadas</dt><dd>${s.rooms}</dd><dt>Paredes</dt><dd>${s.walls} m</dd><dt>Portas · janelas</dt><dd>${s.doors} · ${s.wins}</dd><dt>Móveis</dt><dd>${s.items}</dd></dl>`)
    +tip('Escolhe uma ferramenta à esquerda para mudar a casa. Tudo fica guardado sozinho neste navegador.')];
  case 'wall':return['Paredes',lead('Arrasta na grelha para levantar paredes. Cada quadrado mede 1 metro e as paredes têm 2,7 m de altura.')
    +grp('Modo',segc('wallMode',[['line','Parede a parede'],['room','Divisão inteira']],ui.wallMode))
    +grp('Ver paredes',segc('cut',[['0','Inteiras'],['1','Baixas']],wallsCut?'1':'0'))
    +tip('Para apagar uma parede usa a ferramenta Apagar. Para pintar, usa Pintar.')];
  case 'door':return['Portas',lead('Clica numa parede para abrir uma porta de 90 cm. Clica de novo na mesma porta para voltar a pôr parede.')
    +grp('Acabamento',`<div class="sws">${Object.entries(DOORS).map(([k,[n]])=>sw('doorStyle',k,n,k==='branca'?'background:#f2f1ed':woodThumb(k),k===ui.doorStyle)).join('')}</div>`)];
  case 'window':return['Janelas',lead('Clica numa parede para pôr uma janela. Clica de novo na mesma janela para a tirar.')
    +grp('Tipo',segc('winType',[['normal','Janela'],['alta','Envidraçado']],ui.winType))
    +grp('Caixilharia',`<div class="sws">${Object.entries(FRAMES).map(([k,[n]])=>sw('winFrame',k,n,k==='madeira'?woodThumb('carvalho'):`background:${k==='branco'?'#f0f0ee':'#2a2b2e'}`,k===ui.winFrame)).join('')}</div>`)];
  case 'floor':{const list=f=>`<div class="sws">${Object.entries(SURF).filter(([,d])=>f(d)).map(([k,d])=>sw('floorMat',k,d.n,surfThumb(k),k===ui.floorMat)).join('')}</div>`;
    return['Chão',grp('Modo',segc('floorMode',[['rect','Retângulo'],['room','Divisão inteira']],ui.floorMode))
    +grp('Interior',list(d=>d.k==='f'||d.k==='fw'))+grp('Exterior',list(d=>d.k==='x'))];}
  case 'paint':{const cust=/^c:#/.test(ui.paintMat)&&!PAINTS.some(p=>'c:'+p[0]===ui.paintMat);
    return['Pintar paredes',grp('Modo',segc('paintMode',[['room','Divisão inteira'],['side','Só este lado']],ui.paintMode))
    +grp('Tintas',`<div class="sws">${PAINTS.map(([h,n])=>sw('paintMat','c:'+h,n,`background:${h}`,'c:'+h===ui.paintMat)).join('')}</div><label class="custom"><input type="color" id="paint-custom" value="${cust?ui.paintMat.slice(2):'#c8a27a'}">Outra cor${cust?' · escolhida':''}</label>`)
    +grp('Revestimentos',`<div class="sws">${Object.entries(SURF).filter(([,d])=>d.k==='w'||d.k==='fw').map(([k,d])=>sw('paintMat',k,d.n,surfThumb(k),k===ui.paintMat)).join('')}</div>`)
    +tip(ui.paintMode==='room'?'Pinta todas as paredes viradas para a divisão onde clicas. Por fora da casa, pinta a fachada toda.':'Pinta só o metro de parede onde clicas. Podes arrastar para pintar vários.')];}
  case 'furniture':{const def=ITEMS[ui.item];
    return['Móveis',`<div class="chips">${CATS.map(c=>`<button class="chip${c===ui.cat?' on':''}" data-act="cat" data-v="${c}">${c}</button>`).join('')}</div>`
    +`<div class="items">${Object.entries(ITEMS).filter(([,d])=>d.cat===ui.cat).map(([k,d])=>`<button class="it${k===ui.item?' on':''}" data-act="item" data-v="${k}" aria-pressed="${k===ui.item}">${MODELS[k]?`<img class="it-img" src="modelos/fotos/${k}.png" alt="" loading="lazy">`:''}<b>${d.n}</b><span>${fmtN(d.w)} × ${fmtN(d.d)} m</span></button>`).join('')}</div>`
    +(def.colors.length>1?grp('Cor · '+def.n,dotsHTML('itemColor',def,colorFor(ui.item))):'')
    +`<div class="actions"><button class="btn" data-act="rot">Rodar 90° <kbd class="k">R</kbd></button></div>`
    +tip('Perto de uma parede, o móvel encosta-se sozinho. Para mudar um móvel já pousado, usa Mover.')];}
  case 'select':{const it=sel!=null&&getItem(sel);
    if(!it)return['Mover móveis',lead('Clica num móvel para o escolher e arrasta-o para outro sítio. Perto de uma parede, encosta-se sozinho.')+tip('<kbd class="k">R</kbd> roda o móvel escolhido e <kbd class="k">Delete</kbd> apaga-o.')];
    const def=ITEMS[it.k];
    return[def.n,`<p class="dims">${fmtN(def.w)} × ${fmtN(def.d)} m</p>`+(def.colors.length>1?grp('Cor',dotsHTML('selColor',def,it.c)):'')
    +`<div class="actions"><button class="btn" data-act="selRot">Rodar 90°</button><button class="btn" data-act="selDup">Duplicar</button><button class="btn danger" data-act="selDel">Apagar</button></div>`];}
  case 'erase':return['Apagar',lead('Clica ou arrasta por cima do que queres tirar: paredes, portas, janelas, móveis ou chão.')+tip('Enganaste-te? <kbd class="k">Ctrl</kbd> + <kbd class="k">Z</kbd> desfaz.')];
  case 'walk':return['Passear',lead('Estás dentro da casa, à altura dos olhos. Clica no ecrã para controlar a vista com o rato. Abre portas, acende as luzes e faz a missão das moedas.')
    +`<dl class="facts"><dt>Andar</dt><dd>W A S D · setas</dd><dt>Olhar</dt><dd>rato</dd><dt>Abrir, acender</dt><dd>E · clique</dd><dt>Saltar</dt><dd>Espaço</dd><dt>Agachar</dt><dd>C</dd><dt>Correr</dt><dd>Shift</dd><dt>Missão</dt><dd>M</dd><dt>Soltar o rato · sair</dt><dd>Esc</dd></dl>`
    +tip('Na missão, apanha as moedas todas o mais depressa que conseguires. Se uma porta estiver trancada, a chave está algures do teu lado da casa. À noite, usa os interruptores para acender as luzes.')];
  }
  return['',''];
}
function renderPanel(){
  const body=document.querySelector('#panel .pbody'),scroll=body?body.scrollTop:0;
  const[title,html]=panelHTML();
  $('panel').innerHTML=`<div class="phead"><h2>${title}</h2><button class="ib collapse" data-act="collapse" aria-label="${ui.min?'Mostrar opções':'Esconder opções'}">${ui.min?'Opções ▴':'▾'}</button></div><div class="pbody">${html}</div>`;
  $('panel').classList.toggle('min',ui.min);
  const nb=document.querySelector('#panel .pbody');if(nb)nb.scrollTop=scroll;
}
function setView(v){
  if(walk.on)return;controls.target.set(0,0,0);
  if(v==='top')camera.position.set(0.01,27,0.6);else if(v==='front')camera.position.set(0,4.5,20);else camera.position.set(12,14,17);controls.update();
}
function setCut(on){wallsCut=on;$('b-cut').setAttribute('aria-pressed',String(on));rebuildWalls();if(ui.tool==='wall')renderPanel();}
$('panel').addEventListener('click',e=>{
  const b=e.target.closest('[data-act]');if(!b)return;const a=b.dataset.act,v=b.dataset.v;
  switch(a){
    case 'view':setView(v);return;
    case 'collapse':ui.min=!ui.min;break;
    case 'wallMode':ui.wallMode=v;break;
    case 'cut':setCut(v==='1');return;
    case 'doorStyle':ui.doorStyle=v;break;
    case 'winType':ui.winType=v;break;
    case 'winFrame':ui.winFrame=v;break;
    case 'floorMode':ui.floorMode=v;setHint();break;
    case 'floorMat':ui.floorMat=v;break;
    case 'paintMode':ui.paintMode=v;break;
    case 'paintMat':ui.paintMat=v;break;
    case 'cat':ui.cat=v;ui.item=Object.keys(ITEMS).find(k=>ITEMS[k].cat===v);ghostKey=null;break;
    case 'item':ui.item=v;ghostKey=null;break;
    case 'itemColor':ui.colors[ui.item]=v;ghostKey=null;break;
    case 'rot':ui.rot=(ui.rot+1)%4;ghostKey=null;toast('Rodado '+ui.rot*90+'°');return;
    case 'selColor':{const it=getItem(sel);if(it){begin();it.c=v;rebuildItems();end();}break;}
    case 'selRot':rotateSel();return;
    case 'selDup':dupSel();break;
    case 'selDel':delSel();break;
  }
  renderPanel();
});
$('panel').addEventListener('change',e=>{if(e.target.id==='paint-custom'){ui.paintMat='c:'+e.target.value.toLowerCase();renderPanel();}});

/* topo */
$('b-undo').addEventListener('click',undo);$('b-redo').addEventListener('click',redo);
$('b-cut').addEventListener('click',()=>setCut(!wallsCut));
$('time').addEventListener('input',e=>setTime(+e.target.value,false));
const menu=$('menu');
function closeMenu(){menu.hidden=true;$('b-menu').setAttribute('aria-expanded','false');}
window.addEventListener('pointerdown',e=>{if(!menu.hidden&&!menu.contains(e.target)&&!$('b-menu').contains(e.target))closeMenu();});
$('b-menu').addEventListener('click',()=>{menu.hidden=!menu.hidden;$('b-menu').setAttribute('aria-expanded',String(!menu.hidden));});
let toastT=0;function toast(t){const el=$('toast');el.textContent=t;el.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>el.hidden=true,2200);}
function loadState(s,msg){cancelAct();begin();state=s;sel=null;rebuildAll();end();if(msg)toast(msg);}
menu.addEventListener('click',e=>{
  const b=e.target.closest('[data-menu]');if(!b)return;closeMenu();const m=b.dataset.menu;
  if(m==='example')loadState(exampleState(),'Casa de exemplo aberta');
  else if(m==='clear')loadState({v:1,walls:{},floors:{},items:[]},'Terreno vazio. Ctrl+Z traz a casa de volta.');
  else if(m==='code'){$('code').value=JSON.stringify(state);$('modal').hidden=false;$('code').focus();$('code').select();}
});
$('code-close').addEventListener('click',()=>$('modal').hidden=true);
$('modal').addEventListener('click',e=>{if(e.target.id==='modal')$('modal').hidden=true;});
$('code-copy').addEventListener('click',()=>{const ta=$('code');
  navigator.clipboard.writeText(ta.value).then(()=>toast('Código copiado'),()=>{ta.focus();ta.select();toast('Seleciona o texto e copia com Ctrl+C');});});
$('code-load').addEventListener('click',()=>{
  try{const s=sanitize(JSON.parse($('code').value));$('modal').hidden=true;loadState(s,'Casa aberta');}
  catch(err){toast('Este código não parece ser de uma casa. Confirma que copiaste tudo.');}
});

/* teclado */
window.addEventListener('keydown',e=>{
  if(e.code==='Escape'&&!$('modal').hidden){$('modal').hidden=true;return;}
  const tag=(e.target.tagName||'').toLowerCase();if(tag==='input'||tag==='textarea')return;
  if((e.ctrlKey||e.metaKey)&&e.code==='KeyZ'){e.preventDefault();e.shiftKey?redo():undo();return;}
  if((e.ctrlKey||e.metaKey)&&e.code==='KeyY'){e.preventDefault();redo();return;}
  if(walk.on){if(['KeyW','KeyA','KeyS','KeyD','KeyC','ControlLeft','Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight'].includes(e.code)){walk.keys[e.code]=true;e.preventDefault();}
    if((e.code==='KeyE'||e.code==='KeyF'||e.code==='Enter')&&!e.repeat){e.preventDefault();if(!$('win').hidden){$('win').hidden=true;startGame();}else interact();}
    if(e.code==='KeyM'&&!e.repeat&&!game.on)startGame();
    if(e.code==='Escape')setTool('camera');return;}
  if(e.code==='Escape'){if(act)cancelAct();else if(!$('modal').hidden)$('modal').hidden=true;else if(sel!=null)selectItem(null);closeMenu();return;}
  if(e.code==='KeyR'){if(ui.tool==='furniture'){ui.rot=(ui.rot+1)%4;ghostKey=null;if(ghostPos&&lastE)placeGhost(lastE);}else if(sel!=null)rotateSel();return;}
  if((e.code==='Delete'||e.code==='Backspace')&&sel!=null){e.preventDefault();delSel();return;}
  if(/^Digit\d$/.test(e.code)&&!e.ctrlKey&&!e.metaKey&&!e.altKey){const d=+e.code.slice(5);const t=TOOLS[(d+9)%10];if(t)setTool(t[0]);}
});
window.addEventListener('keyup',e=>{walk.keys[e.code]=false;});
window.addEventListener('blur',()=>{walk.keys={};});

/* ---------------- arranque ---------------- */
function resize(){const w=app.clientWidth,h=app.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/Math.max(h,1);camera.updateProjectionMatrix();}
window.addEventListener('resize',resize);
let last=performance.now(),lastLook=0;
function loop(now){
  const dt=Math.min(0.05,(now-last)/1000);last=now;
  if(walk.on)walkStep(dt);else controls.update();
  for(const k in DOORPV){const d=DOORST[k];if(!d)continue;const tg=d.open&&!d.locked?DOOR_OPEN:0;if(d.a!==tg){d.a+=(tg-d.a)*Math.min(1,dt*7);if(Math.abs(tg-d.a)<0.002)d.a=tg;DOORPV[k].rotation.y=d.a;}}
  if(walk.on){gameStep(dt,now);if(now-lastLook>110){lastLook=now;const t=lookTarget(),txt=promptText(t),pr=$('prompt');
    const show=txt||(FINE&&!locked()?'Clica para olhar com o rato':'');pr.hidden=!show;if(show){const lbl=txt?(FINE?'E · ':'')+txt:show;if(pr.textContent!==lbl)pr.textContent=lbl;}$('cross').classList.toggle('on',!!txt);}}
  renderer.render(scene,camera);requestAnimationFrame(loop);
}
function start(){
  let s=null;
  try{const raw=localStorage.getItem(SAVE_KEY);if(raw)s=sanitize(JSON.parse(raw));}catch(e){}
  state=s||exampleState();
  rebuildAll();resize();setTime(16,true);
  ui.tool='';setTool('camera');setView('iso');afterChange();
  requestAnimationFrame(loop);
}
loadModels().then(start);
})();
