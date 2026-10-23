import { layout, annotationBounds } from "./core.mjs";
const makeCanvas=(w,h)=>{const c=document.createElement("canvas");c.width=w;c.height=h;return c;};
function rounded(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,Math.min(r,w/2,h/2));}
function drawAnnotation(ctx,a){
  ctx.save();ctx.strokeStyle=a.color;ctx.fillStyle=a.color;ctx.lineWidth=a.width||5;ctx.lineJoin="round";ctx.lineCap="round";
  if(a.type==="arrow"){
    const angle=Math.atan2(a.y2-a.y,a.x2-a.x),head=Math.min(Math.max(17,a.width*4),Math.hypot(a.x2-a.x,a.y2-a.y)*0.6);
    ctx.shadowColor="#00000033";ctx.shadowBlur=2;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(a.x2-Math.cos(angle)*head*.6,a.y2-Math.sin(angle)*head*.6);ctx.stroke();
    ctx.beginPath();ctx.moveTo(a.x2,a.y2);ctx.lineTo(a.x2-head*Math.cos(angle-.43),a.y2-head*Math.sin(angle-.43));ctx.lineTo(a.x2-head*Math.cos(angle+.43),a.y2-head*Math.sin(angle+.43));ctx.closePath();ctx.fill();
  } else if(a.type==="rectangle") { ctx.fillStyle=a.color+"16";rounded(ctx,a.x,a.y,a.w,a.h,3);ctx.fill();ctx.stroke();
  } else if(a.type==="number") {
    ctx.shadowColor="#00000044";ctx.shadowBlur=6;ctx.shadowOffsetY=2;ctx.beginPath();ctx.arc(a.x,a.y,a.size/2,0,Math.PI*2);ctx.fill();ctx.shadowColor="transparent";ctx.strokeStyle="#ffffff";ctx.lineWidth=3;ctx.stroke();
    const rgb=[1,3,5].map(i=>parseInt(a.color.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);const lum=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];ctx.fillStyle=lum>.179?"#101923":"#ffffff";
    ctx.font=`800 ${Math.round(a.size*.53)}px "Segoe UI", system-ui, sans-serif`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(String(a.number),a.x,a.y+1);
  } else if(a.type==="text") {
    ctx.fillStyle="#101b2bee";rounded(ctx,a.x,a.y,a.w,a.h,6);ctx.fill();ctx.fillStyle=a.color;ctx.font=`600 ${a.fontSize}px "Segoe UI",system-ui,sans-serif`;ctx.textBaseline="middle";ctx.fillText(a.text,a.x+12,a.y+a.h/2,a.w-24);
  }
  ctx.restore();
}
export function renderComposition(image,annotations,finish,target=null){
  const l=layout(image.naturalWidth||image.width,image.naturalHeight||image.height,finish);
  const canvas=target||makeCanvas(l.width,l.height);canvas.width=l.width;canvas.height=l.height;const ctx=canvas.getContext("2d");
  if(finish.background==="gradient") {const g=ctx.createLinearGradient(0,0,l.width,l.height);g.addColorStop(0,"#263b55");g.addColorStop(.55,"#19283e");g.addColorStop(1,"#443344");ctx.fillStyle=g;}else ctx.fillStyle=finish.background==="white"?"#ffffff":"#101f34";
  ctx.fillRect(0,0,l.width,l.height);
  if(finish.shadow){ctx.save();ctx.shadowColor="#00000066";ctx.shadowBlur=28;ctx.shadowOffsetY=12;ctx.fillStyle="#101b2b";rounded(ctx,l.x,l.y,l.imageWidth,l.imageHeight,finish.radius);ctx.fill();ctx.restore();}
  ctx.save();rounded(ctx,l.x,l.y,l.imageWidth,l.imageHeight,finish.radius);ctx.clip();ctx.translate(l.x,l.y);ctx.drawImage(image,0,0);
  // Blur samples only the original image. Opaque redactions are always painted last.
  for(const a of annotations.filter(a=>a.type==="blur")){
    ctx.save();ctx.beginPath();ctx.rect(a.x,a.y,a.w,a.h);ctx.clip();ctx.filter="blur(12px)";ctx.drawImage(image,0,0);ctx.restore();
  }
  for(const a of annotations)if(!["blur","redact"].includes(a.type))drawAnnotation(ctx,a);
  for(const a of annotations.filter(a=>a.type==="redact")){ctx.fillStyle=a.color;ctx.fillRect(Math.floor(a.x),Math.floor(a.y),Math.ceil(a.w)+1,Math.ceil(a.h)+1);}
  ctx.restore();
  if(finish.signature){ctx.fillStyle=finish.background==="white"?"#4b5563":"#d0d8e5";ctx.font="500 15px Segoe UI,system-ui,sans-serif";ctx.textAlign="right";ctx.textBaseline="middle";ctx.fillText("Migue Baena IA",l.width-Math.max(20,finish.margin),l.height-Math.max(19,finish.margin/2));}
  return {canvas,layout:l};
}
export function renderSelection(ctx,a,scale,l){
  if(!a)return;const b=annotationBounds(a),size=8/scale;
  ctx.save();ctx.translate(l.x,l.y);ctx.strokeStyle="#2088ff";ctx.fillStyle="#ffffff";ctx.lineWidth=1.5/scale;ctx.setLineDash([5/scale,4/scale]);ctx.strokeRect(b.x-3/scale,b.y-3/scale,b.w+6/scale,b.h+6/scale);ctx.setLineDash([]);
  const handles=a.type==="arrow"?[[a.x,a.y],[a.x2,a.y2]]:a.type==="number"?[]:[[b.x,b.y],[b.x+b.w,b.y],[b.x,b.y+b.h],[b.x+b.w,b.y+b.h]];
  for(const [x,y]of handles){ctx.fillRect(x-size/2,y-size/2,size,size);ctx.strokeRect(x-size/2,y-size/2,size,size);}
  ctx.restore();
}
