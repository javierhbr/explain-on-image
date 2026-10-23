import { layout, annotationBounds, textFont } from "./core.mjs";
import { outputFits } from "./image-policy.mjs";
const makeCanvas=(w,h)=>{const c=document.createElement("canvas");c.width=w;c.height=h;return c;};
const isLight=hex=>{const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]>.179;};
function rounded(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,Math.min(r,w/2,h/2));}
function drawAnnotation(ctx,a,pixelScale=1){
  ctx.save();ctx.strokeStyle=a.color;ctx.fillStyle=a.color;ctx.lineWidth=a.width||5;ctx.lineJoin="round";ctx.lineCap="round";
  if(a.type==="arrow"){
    const angle=Math.atan2(a.y2-a.y,a.x2-a.x),head=Math.min(Math.max(17,a.width*4),Math.hypot(a.x2-a.x,a.y2-a.y)*0.6);
    ctx.shadowColor="#00000033";ctx.shadowBlur=2*pixelScale;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(a.x2-Math.cos(angle)*head*.6,a.y2-Math.sin(angle)*head*.6);ctx.stroke();
    ctx.beginPath();ctx.moveTo(a.x2,a.y2);ctx.lineTo(a.x2-head*Math.cos(angle-.43),a.y2-head*Math.sin(angle-.43));ctx.lineTo(a.x2-head*Math.cos(angle+.43),a.y2-head*Math.sin(angle+.43));ctx.closePath();ctx.fill();
  } else if(a.type==="rectangle") { ctx.fillStyle=a.color+"16";rounded(ctx,a.x,a.y,a.w,a.h,3);ctx.fill();ctx.stroke();
  } else if(a.type==="number") {
    ctx.shadowColor="#00000044";ctx.shadowBlur=6*pixelScale;ctx.shadowOffsetY=2*pixelScale;ctx.beginPath();ctx.arc(a.x,a.y,a.size/2,0,Math.PI*2);ctx.fill();ctx.shadowColor="transparent";ctx.strokeStyle="#ffffff";ctx.lineWidth=3;ctx.stroke();
    const rgb=[1,3,5].map(i=>parseInt(a.color.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);const lum=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];ctx.fillStyle=lum>.179?"#101923":"#ffffff";
    ctx.font=`800 ${Math.round(a.size*.53)}px "Segoe UI", system-ui, sans-serif`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(String(a.number),a.x,a.y+1);
  } else if(a.type==="text") {
    ctx.fillStyle="#101b2bee";rounded(ctx,a.x,a.y,a.w,a.h,6);ctx.fill();ctx.fillStyle=a.color;ctx.font=textFont(a);ctx.textBaseline="middle";ctx.fillText(a.text,a.x+12,a.y+a.h/2,a.w-24);
  }
  ctx.restore();
}

const MAX_BLUR_CACHE_PIXELS = 8 * 1024 * 1024;
const release = canvas => { if(canvas){canvas.width=1;canvas.height=1;} };
function resize(canvas,width,height) {
  if(canvas.width!==width)canvas.width=width;
  if(canvas.height!==height)canvas.height=height;
}
function imageSize(image) { return {width:image.naturalWidth||image.width,height:image.naturalHeight||image.height}; }
function paintRedactions(ctx,annotations) {
  for(const a of annotations)if(a.type==="redact"){
    ctx.fillStyle=a.color;
    ctx.fillRect(Math.floor(a.x),Math.floor(a.y),Math.ceil(a.w)+1,Math.ceil(a.h)+1);
  }
}
export class CompositionRenderer {
  constructor(image=null) {
    this.image=image;this.redacted=null;this.redactionKey=null;this.blurs=new Map();this.cachePixels=0;
    this.blurBudget=MAX_BLUR_CACHE_PIXELS;this.exportPixels=0;this.signatureFallback="";
    this.stats={previewPaints:0,nativePaints:0,blurBuilds:0,sourceBuilds:0};
  }
  clearBlurCache() {
    for(const tile of this.blurs.values())release(tile.canvas);
    this.blurs.clear();this.cachePixels=0;
  }
  setImage(image) {
    if(this.image===image)return;
    this.dispose();this.image=image;
  }
  dispose() {
    this.clearBlurCache();release(this.redacted);this.redacted=null;this.redactionKey=null;this.image=null;
  }
  source(annotations) {
    const redactions=annotations.filter(a=>a.type==="redact");
    const key=JSON.stringify(redactions.map(a=>[a.x,a.y,a.w,a.h,a.color]));
    if(key!==this.redactionKey) {
      this.clearBlurCache();
      this.redactionKey=key;
      if(!redactions.length){release(this.redacted);this.redacted=null;}
      else {
        const {width,height}=imageSize(this.image);
        this.redacted ||= makeCanvas(width,height);
        resize(this.redacted,width,height);
        const ctx=this.redacted.getContext("2d");
        ctx.clearRect(0,0,width,height);ctx.drawImage(this.image,0,0);
        // No filter or resampling may see pixels underneath these masks.
        paintRedactions(ctx,redactions);this.stats.sourceBuilds++;
      }
    }
    return this.redacted||this.image;
  }
  blurTile(source,a) {
    const {width,height}=imageSize(source),pad=40;
    const x=Math.max(0,Math.floor(a.x-pad)),y=Math.max(0,Math.floor(a.y-pad));
    const right=Math.min(width,Math.ceil(a.x+a.w+pad)),bottom=Math.min(height,Math.ceil(a.y+a.h+pad));
    const w=right-x,h=bottom-y;
    if(w<=0||h<=0||a.w<=0||a.h<=0)return null;
    const key=JSON.stringify([a.x,a.y,a.w,a.h]);
    const found=this.blurs.get(key);
    if(found){this.blurs.delete(key);this.blurs.set(key,found);return found;}
    const scale=Math.min(1,Math.sqrt(this.blurBudget/(w*h)));
    const tw=Math.max(1,Math.floor(w*scale)),th=Math.max(1,Math.floor(h*scale)),pixels=tw*th;
    while(this.cachePixels+pixels>MAX_BLUR_CACHE_PIXELS&&this.blurs.size){
      const [oldKey,old]=this.blurs.entries().next().value;
      this.blurs.delete(oldKey);this.cachePixels-=old.pixels;release(old.canvas);
    }
    const canvas=makeCanvas(tw,th),ctx=canvas.getContext("2d");
    ctx.filter=`blur(${12*Math.min(tw/w,th/h)}px)`;
    ctx.drawImage(source,x,y,w,h,0,0,tw,th);
    const tile={canvas,x,y,w,h,pixels};
    this.blurs.set(key,tile);this.cachePixels+=pixels;this.stats.blurBuilds++;
    return tile;
  }
  draw(ctx,annotations,finish,l,pixelScale=1) {
    const source=this.source(annotations);
    const budget=Math.max(1,Math.floor(MAX_BLUR_CACHE_PIXELS/Math.max(1,annotations.filter(a=>a.type==="blur"&&a.w>0&&a.h>0).length)));
    if(budget!==this.blurBudget){this.clearBlurCache();this.blurBudget=budget;}
    if(finish.background==="gradient"){
      const g=ctx.createLinearGradient(0,0,l.width,l.height);
      g.addColorStop(0,"#263b55");g.addColorStop(.55,"#19283e");g.addColorStop(1,"#443344");ctx.fillStyle=g;
    } else ctx.fillStyle=finish.background==="white"?"#ffffff":finish.background==="custom"?finish.backgroundColor:"#101f34";
    // "none" leaves the margin transparent in the exported PNG.
    if(finish.background!=="none")ctx.fillRect(0,0,l.width,l.height);
    if(finish.shadow){
      ctx.save();ctx.shadowColor="#00000066";ctx.shadowBlur=28*pixelScale;ctx.shadowOffsetY=12*pixelScale;
      ctx.fillStyle="#101b2b";rounded(ctx,l.x,l.y,l.imageWidth,l.imageHeight,finish.radius);ctx.fill();ctx.restore();
    }
    ctx.save();rounded(ctx,l.x,l.y,l.imageWidth,l.imageHeight,finish.radius);ctx.clip();ctx.translate(l.x,l.y);
    ctx.drawImage(source,0,0);
    for(const a of annotations)if(a.type==="blur"){
      const tile=this.blurTile(source,a);
      if(tile){
        ctx.save();ctx.beginPath();ctx.rect(a.x,a.y,a.w,a.h);ctx.clip();
        ctx.drawImage(tile.canvas,tile.x,tile.y,tile.w,tile.h);ctx.restore();
      }
    }
    for(const a of annotations)if(a.type!=="blur"&&a.type!=="redact")drawAnnotation(ctx,a,pixelScale);
    paintRedactions(ctx,annotations);
    ctx.restore();
    if(finish.signature){
      const light=finish.background==="white"||finish.background==="none"||(finish.background==="custom"&&isLight(finish.backgroundColor));
      ctx.fillStyle=light?"#4b5563":"#d0d8e5";ctx.font="500 15px Segoe UI,system-ui,sans-serif";
      ctx.textAlign="right";ctx.textBaseline="middle";
      const inset=Math.max(20,finish.margin);
      ctx.fillText(finish.signatureText||this.signatureFallback,l.width-inset,l.height-Math.max(19,finish.margin/2),Math.max(1,l.width-inset*2));
    }
  }
  renderNative(annotations,finish,target=null) {
    const {width,height}=imageSize(this.image),l=layout(width,height,finish);
    const w=l.outputWidth,h=l.outputHeight;
    if(!outputFits(w,h,finish.scale))throw Error("The composition exceeds the export size limit.");
    const canvas=target||makeCanvas(w,h);
    resize(canvas,w,h);
    const ctx=canvas.getContext("2d");ctx.clearRect(0,0,w,h);ctx.imageSmoothingQuality="high";
    ctx.save();ctx.scale(w/l.width,h/l.height);this.draw(ctx,annotations,finish,l,w/l.width);ctx.restore();this.stats.nativePaints++;
    return {canvas,layout:l};
  }
  renderPreview(canvas,annotations,finish,l,camera) {
    const {width,height,dpr,left,top,scale}=camera;
    resize(canvas,Math.max(1,Math.ceil(width*dpr)),Math.max(1,Math.ceil(height*dpr)));
    const ctx=canvas.getContext("2d");ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.save();ctx.scale(dpr,dpr);ctx.translate(left,top);ctx.scale(scale,scale);
    this.draw(ctx,annotations,finish,l,dpr*scale);ctx.restore();this.stats.previewPaints++;
  }
  exportPNG(annotations,finish) { return this.exportImage(annotations,finish,"image/png"); }
  async exportImage(annotations,finish,type="image/png") {
    if(this.exportPixels)throw Error("An export is already in progress.");
    // JPG has no alpha channel: a transparent margin would encode as black.
    if(type==="image/jpeg"&&finish.background==="none")finish={...finish,background:"white"};
    const {canvas}=this.renderNative(annotations,finish);
    this.exportPixels=canvas.width*canvas.height;
    try {
      const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error("Could not generate the image.")),type,.92));
      if(blob.size>160*1024*1024)throw Error("The exported image exceeds 160 MB.");
      return blob;
    } finally {release(canvas);this.exportPixels=0;}
  }
  diagnostics() {
    const s=this.image?imageSize(this.image):{width:0,height:0};
    return {...this.stats,blurCachePixels:this.cachePixels,blurCacheLimit:MAX_BLUR_CACHE_PIXELS,redactedPixels:this.redacted?s.width*s.height:0,activeExportPixels:this.exportPixels};
  }
}
export function renderComposition(image,annotations,finish,target=null) {
  const renderer=new CompositionRenderer(image);
  try{return renderer.renderNative(annotations,finish,target);}
  finally{renderer.dispose();}
}
export function renderSelection(ctx,a,scale,l){
  if(!a)return;const b=annotationBounds(a),size=8/scale;
  ctx.save();ctx.translate(l.x,l.y);ctx.strokeStyle="#2088ff";ctx.fillStyle="#ffffff";ctx.lineWidth=1.5/scale;ctx.setLineDash([5/scale,4/scale]);ctx.strokeRect(b.x-3/scale,b.y-3/scale,b.w+6/scale,b.h+6/scale);ctx.setLineDash([]);
  const handles=a.type==="arrow"?[[a.x,a.y],[a.x2,a.y2]]:a.type==="number"||a.type==="text"?[]:[[b.x,b.y],[b.x+b.w,b.y],[b.x,b.y+b.h],[b.x+b.w,b.y+b.h]];
  for(const [x,y]of handles){ctx.fillRect(x-size/2,y-size/2,size,size);ctx.strokeRect(x-size/2,y-size/2,size,size);}
  ctx.restore();
}
