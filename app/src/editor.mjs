import { textFont,defaults,defaultStyle,SCALES,cleanSignature,clone,clamp,layout,imagePoint,normalRect,nextNumber,annotationBounds,hitAnnotation,moveAnnotation,History,cleanPreferences } from "./core.mjs";
import { CompositionRenderer,renderSelection } from "./render.mjs";
import { FrameScheduler } from "./frame-scheduler.mjs";
import { validateImageBlob, outputFits, LIMITS } from "./image-policy.mjs";
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const icons={collapse:"m6 6 6 6-6 6 M12 6l6 6-6 6",capture:"M8 3H4a1 1 0 0 0-1 1v4m13-5h4a1 1 0 0 1 1 1v4M3 16v4a1 1 0 0 0 1 1h4m8 0h4a1 1 0 0 0 1-1v-4M8 8h8v8H8z",image:"M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M3 16l6-6 5 5 3-3 4 4 M16 7h.01",paste:"M9 4H5v17h14V4h-4 M9 2h6v4H9z M8 11h8 M8 15h5",copy:"M8 8h12v13H8z M16 8V3H3v13h5",download:"M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",cursor:"m5 3 14 10-7 1-3 7z",arrow:"M4 20 20 4 M9 4h11v11",rectangle:"M3 5h18v14H3z",text:"M4 4h16 M12 4v17 M8 21h8",lock:"M5 10h14v11H5z M8 10V6a4 4 0 0 1 8 0v4 M12 14v3",blur:"M4 5h2m4 0h2m4 0h2M6 10h2m4 0h2m4 0h2M4 15h2m4 0h2m4 0h2M6 20h2m4 0h2m4 0h2",undo:"M8 4 3 9l5 5 M3 9h11a6 6 0 0 1 0 12",redo:"m16 4 5 5-5 5 M21 9H10a6 6 0 0 0 0 12",sliders:"M4 7h16M4 17h16 M8 4v6 M16 14v6",spark:"m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z",fit:"M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5",trash:"M3 6h18 M8 6V3h8v3 M6 6l1 15h10l1-15 M10 10v7m4-7v7",check:"m4 12 5 5L20 6"};
for(const i of $$("[data-icon]"))i.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[i.dataset.icon]||icons.rectangle}"/></svg>`;
const canvas=$("#composition"),interaction=$("#interaction"),stage=$("#stage"),viewport=$("#viewport");
let image=null,annotations=[],finish={...defaults},style={...defaultStyle},history=new History({annotations,finish,style});
let tool="select",selected=null,drag=null,zoom=1,fitMode=true,composition=null,prefsTimer,toastTimer,textPoint=null,textEditing=null,busy=false;
const renderer=new CompositionRenderer();
let previewDirty=false;
const frame=new FrameScheduler(paintPreview);
const hints={select:"Drag to move · Use the corners to resize · Delete to remove",number:"Click to place the next number.",arrow:"Drag from the start to the tip of the arrow.",rectangle:"Drag to frame an element.",text:"Click to write · Double-click a text to edit it.",redact:"Cover the whole value with an opaque rectangle. It is flattened on export.",blur:"Visual effect. To protect sensitive data, use “Redact”."};
function state(){return {annotations,finish,style};}
function persist(){clearTimeout(prefsTimer);prefsTimer=setTimeout(()=>window.desktop.savePreferences({finish,style}).then(r=>{if(r?.error)toast("Could not save preferences.",true);}),180);}
function commit(){history.push(state());persist();sync();}
function toast(message,error=false){clearTimeout(toastTimer);const el=$("#toast");el.textContent=message;el.classList.toggle("error",error);el.hidden=false;toastTimer=setTimeout(()=>el.hidden=true,error?6500:3200);}
function valid(result){if(result?.error){toast(result.error,true);return false;}return !!result;}
function sync(){
  $("#undo").disabled=!history.canUndo;$("#redo").disabled=!history.canRedo;
  $("#save").disabled=!image||busy;$("#copy").disabled=!image||busy;$("#delete").disabled=!selected;
  $("#count").textContent=`${annotations.length} ${annotations.length===1?"annotation":"annotations"}`;
  for(const button of $$("[data-tool]")){button.classList.toggle("active",button.dataset.tool===tool);button.setAttribute("aria-pressed",button.dataset.tool===tool);}
  for(const button of $$("[data-background]")){button.classList.toggle("active",button.dataset.background===finish.background);button.setAttribute("aria-pressed",button.dataset.background===finish.background);}
  $(".background-custom").classList.toggle("active",finish.background==="custom");$("#background-color").value=finish.backgroundColor;$("#background-swatch").style.background=finish.backgroundColor;$("#scale").value=String(finish.scale);
  $("#migue").classList.toggle("active",!!migueActive());$("#migue small").textContent=migueActive()?"Applied · Click to undo":"Orange. Blue. So you.";
  for(const key of ["margin","radius"]){$("#"+key).value=finish[key];$("#"+key+"-value").textContent=finish[key]+" px";}
  $("#shadow").checked=finish.shadow;$("#signature").checked=finish.signature;if(document.activeElement!==$("#signature-text"))$("#signature-text").value=finish.signatureText;
  $("#ratio-auto").classList.toggle("active",finish.ratio==="auto");$("#ratio-wide").classList.toggle("active",finish.ratio==="wide");
  const a=annotations.find(a=>a.id===selected),color=a?.color||(tool==="redact"?"#111827":style.color);
  $("#color").value=color;$("#stroke").value=String(a?.width||style.width);
  const t=a?.type==="text"?a:style;$("#font").value=t.font||"system";$("#font-size").value=String(t.fontSize);
  for(const b of $$("[data-color]"))b.classList.toggle("active",b.dataset.color===color);
  $("#edit-text").hidden=a?.type!=="text";
  $("#tool-hint").textContent=image?(tool==="number"?`Next number: ${nextNumber(annotations)} · Click on the image.`:hints[tool]):"Capture an area or open an image to get started.";
  interaction.style.cursor=toolCursor();
  $("#zoom-value").textContent=Math.round(zoom*100)+" %";
}
function requestPaint(preview=false){previewDirty ||= preview;frame.request();}
function computeZoom(){
  if(!composition)return;
  if(fitMode)zoom=Math.min(1,(viewport.clientWidth-80)/composition.width,(viewport.clientHeight-80)/composition.height);
  zoom=clamp(zoom,.03,4);
  const width=composition.width*zoom+"px",height=composition.height*zoom+"px";
  if(stage.style.width!==width)stage.style.width=width;
  if(stage.style.height!==height)stage.style.height=height;
  sync();requestPaint(true);
}
function camera(){
  const bounds=viewport.getBoundingClientRect(),stageBounds=stage.getBoundingClientRect();
  const width=viewport.clientWidth,height=viewport.clientHeight;
  const dpr=Math.min(devicePixelRatio||1,2,Math.sqrt((4*1024*1024)/Math.max(1,width*height)));
  return {width,height,dpr,left:stageBounds.left-bounds.left,top:stageBounds.top-bounds.top,scale:zoom};
}
function paintPreview(){
  if(!image||!composition)return;
  const view=camera();
  for(const c of [canvas,interaction]){c.style.width=view.width+"px";c.style.height=view.height+"px";}
  if(previewDirty){renderer.renderPreview(canvas,annotations,finish,composition,view);previewDirty=false;}
  const width=Math.max(1,Math.ceil(view.width*view.dpr)),height=Math.max(1,Math.ceil(view.height*view.dpr));
  if(interaction.width!==width)interaction.width=width;
  if(interaction.height!==height)interaction.height=height;
  const ctx=interaction.getContext("2d");ctx.clearRect(0,0,width,height);
  ctx.save();ctx.scale(view.dpr,view.dpr);ctx.translate(view.left,view.top);ctx.scale(zoom,zoom);
  renderSelection(ctx,annotations.find(a=>a.id===selected),zoom,composition);ctx.restore();
}
function drawSelection(){requestPaint();}
function render(){
  if(!image){sync();return;}
  const next=layout(image.width,image.height,finish);
  if(!composition||JSON.stringify(next)!==JSON.stringify(composition)){
    composition=next;$("#dimensions").textContent=composition.outputWidth+" × "+composition.outputHeight+" px";computeZoom();
  }
  requestPaint(true);
}
function undo(){if(!history.canUndo)return;({annotations,finish,style}=history.undo());selected=null;drag=null;render();persist();}
function redo(){if(!history.canRedo)return;({annotations,finish,style}=history.redo());selected=null;drag=null;render();persist();}
function setTool(value){tool=value;if(value!=="select")selected=null;sync();drawSelection();}
function deleteSelected(){if(!selected)return;annotations=annotations.filter(a=>a.id!==selected);selected=null;commit();render();}
function setZoom(value){fitMode=false;zoom=clamp(value,.03,4);computeZoom();drawSelection();}
function changeFinish(patch,record=true){const old=finish;finish={...finish,...patch};if(image){const l=layout(image.width,image.height,finish);if(!outputFits(l.outputWidth,l.outputHeight,finish.scale)){toast(finish.scale>1?"Exports above 100 % are limited to 40 megapixels. Choose a smaller size.":"This format exceeds 80 megapixels. Use the automatic format, a smaller size or a smaller image.",true);finish=old;sync();return false;}}render();if(record)commit();return true;}
async function confirmReplace(){if(!annotations.length)return true;const d=$("#replace-dialog");d.showModal();return new Promise(resolve=>{const end=value=>{d.close();resolve(value);};$("#replace-ok").onclick=()=>end(true);$("#replace-cancel").onclick=()=>end(false);d.oncancel=()=>resolve(false);});}
export async function loadImage(result){
  if(!valid(result))return;
  let next;
  try {
    if(!(result.bytes instanceof Uint8Array))throw Error("The image does not contain valid data.");
    const blob=new Blob([result.bytes],{type:result.mime||"application/octet-stream"});
    await validateImageBlob(blob);
    next=await createImageBitmap(blob);
    if(next.width*next.height>LIMITS.maxInputPixels||Math.max(next.width,next.height)>LIMITS.maxInputSide){next.close();throw Error("The image exceeds the 28 MP or 12,000 pixels per side limit.");}
  }catch(e){toast(e.message||"Could not open the image.",true);return;}
  const previous=image;renderer.setImage(next);image=next;previous?.close?.();
  annotations=[];selected=null;drag=null;fitMode=true;tool="select";composition=null;
  const fits=f=>{const l=layout(next.width,next.height,f);return outputFits(l.outputWidth,l.outputHeight,f.scale);},before=finish;
  if(!fits(finish))finish={...finish,ratio:"auto"};
  for(let i=SCALES.indexOf(finish.scale);i>0&&!fits(finish);i--)finish={...finish,scale:SCALES[i-1]};
  if(finish!==before)setTimeout(()=>toast("Format and size adjusted to keep this image within the export limit."));
  canvas.hidden=false;interaction.hidden=false;
  history=new History(state());$("#empty").hidden=true;stage.hidden=false;$("#saved").hidden=true;
  $("#document-name").textContent=result.name||"Untitled image";render();
}
async function capture(){
  const displays=await window.desktop.displays();if(!valid(displays))return;
  let id=displays[0]?.id;if(!id){toast("No screens available.",true);return;}
  if(displays.length>1){
    const d=$("#monitor-dialog"),list=$("#monitors");list.replaceChildren();d.showModal();
    id=await new Promise(resolve=>{for(const item of displays){const b=document.createElement("button");b.textContent=`${item.label}${item.primary?" · Primary":""}     ${item.width} × ${item.height} px`;b.onclick=()=>{d.close();resolve(item.id);};list.append(b);}$("#cancel-monitor").onclick=()=>{d.close();resolve(null);};d.oncancel=()=>resolve(null);});
  }
  if(!id)return;
  const result=await window.desktop.capture(id);if(result)await loadImage(result);
}
for(const button of $$("[data-action]"))button.addEventListener("click",async()=>{
  if(busy)return;busy=true;sync();try{if(!await confirmReplace())return;const action=button.dataset.action;if(action==="capture")await capture();if(action==="open")await loadImage(await window.desktop.openImage());if(action==="paste")await loadImage(await window.desktop.pasteImage());}catch(e){toast("Could not open the image: "+e.message,true);}finally{busy=false;sync();}
});
for(const b of $$("[data-tool]"))b.onclick=()=>setTool(b.dataset.tool);
$("#undo").onclick=undo;$("#redo").onclick=redo;$("#delete").onclick=deleteSelected;
$("#zoom-in").onclick=()=>setZoom(zoom*1.25);$("#zoom-out").onclick=()=>setZoom(zoom/1.25);$("#zoom-value").onclick=()=>setZoom(1);$("#fit").onclick=()=>{fitMode=true;computeZoom();drawSelection();};
new ResizeObserver(()=>{computeZoom();drawSelection();}).observe(viewport);
viewport.addEventListener("scroll",()=>requestPaint(true));
window.addEventListener("beforeunload",()=>{frame.dispose();renderer.dispose();image?.close?.();});
for(const key of ["margin","radius"]){$("#"+key).oninput=e=>changeFinish({[key]:Number(e.target.value)},false);$("#"+key).onchange=()=>commit();}
for(const key of ["shadow","signature"])$("#"+key).onchange=e=>changeFinish({[key]:e.target.checked});
$("#signature-text").oninput=e=>changeFinish({signatureText:cleanSignature(e.target.value)},false);$("#signature-text").onchange=()=>commit();
for(const b of $$("[data-background]"))b.onclick=()=>changeFinish({background:b.dataset.background});
$("#background-color").oninput=e=>changeFinish({background:"custom",backgroundColor:e.target.value},false);$("#background-color").onchange=()=>commit();
$("#scale").onchange=e=>{if(!changeFinish({scale:Number(e.target.value)}))e.target.value=String(finish.scale);};
$("#ratio-auto").onclick=()=>changeFinish({ratio:"auto"});$("#ratio-wide").onclick=()=>changeFinish({ratio:"wide"});
const migue={margin:64,radius:16,shadow:true,background:"dark"};
let migueBackup=null;
function migueActive(){return migueBackup&&style.color==="#ff8a3d"&&Object.entries(migue).every(([k,v])=>finish[k]===v);}
$("#migue").onclick=()=>{
  if(migueActive()){const b=migueBackup;if(changeFinish(b.finish,false)===false)return;migueBackup=null;style={...style,color:b.color};for(const a of annotations)if(a.id in b.colors)a.color=b.colors[a.id];selected=null;commit();render();toast("Beautify undone");return;}
  const backup={finish:Object.fromEntries(Object.keys(migue).map(k=>[k,finish[k]])),color:style.color,colors:Object.fromEntries(annotations.filter(a=>["arrow","number"].includes(a.type)).map(a=>[a.id,a.color]))};
  if(changeFinish(migue,false)===false)return;migueBackup=backup;style={...style,color:"#ff8a3d"};for(const a of annotations)if(["arrow","number"].includes(a.type))a.color="#ff8a3d";selected=null;commit();render();toast("Beautify applied");};
function applyColor(color){const a=annotations.find(a=>a.id===selected);if(a)a.color=color;else style.color=color;commit();render();}
for(const b of $$("[data-color]"))b.onclick=()=>applyColor(b.dataset.color);
$("#color").onchange=e=>applyColor(e.target.value);
function fitText(a){const ctx=canvas.getContext("2d");ctx.font=textFont(a);a.w=Math.min(image.width,Math.ceil(ctx.measureText(a.text).width+26));a.h=a.fontSize+24;a.x=clamp(a.x,0,Math.max(0,image.width-a.w));a.y=clamp(a.y,0,Math.max(0,image.height-a.h));}
// Applies to the selected text, or to the next text when none is selected.
function applyText(patch){const a=annotations.find(a=>a.id===selected&&a.type==="text");if(a){Object.assign(a,patch);fitText(a);}else style={...style,...patch};commit();render();}
$("#font").onchange=e=>applyText({font:e.target.value});$("#font-size").onchange=e=>applyText({fontSize:Number(e.target.value)});
$("#stroke").onchange=e=>{const width=Number(e.target.value),a=annotations.find(a=>a.id===selected);if(a)a.width=width;style.width=width;commit();render();};
function editText(a=null,p=null){textEditing=a?.id||null;textPoint=p;$("#text-title").textContent=a?"Edit text":"Add text";$("#text-value").value=a?.text||"";$("#text-dialog").returnValue="cancel";$("#text-dialog").showModal();$("#text-value").focus();$("#text-value").select();}
$("#text-cancel").onclick=()=>$("#text-dialog").close("cancel");
$("#text-dialog").addEventListener("close",()=>{
  if($("#text-dialog").returnValue!=="ok")return;
  const text=$("#text-value").value.trim();if(!text)return;
  const existing=annotations.find(a=>a.id===textEditing);
  if(existing){existing.text=text;fitText(existing);}
  else if(textPoint){const a={id:crypto.randomUUID(),type:"text",x:textPoint.x,y:textPoint.y,text,fontSize:style.fontSize,font:style.font,color:style.color,width:style.width};fitText(a);a.y=clamp(a.y,0,Math.max(0,image.height-a.h));annotations.push(a);selected=a.id;}
  commit();render();
});
$("#edit-text").onclick=()=>{const a=annotations.find(a=>a.id===selected);if(a?.type==="text")editText(a);};
function point(event){return imagePoint(event.clientX,event.clientY,stage.getBoundingClientRect(),composition);}
function inImage(p){return p.x>=0&&p.y>=0&&p.x<=image.width&&p.y<=image.height;}
function bounded(p){return {x:clamp(p.x,0,image.width),y:clamp(p.y,0,image.height)};}
function handleAt(a,p){
  const tolerance=10/zoom;
  if(a.type==="arrow"){if(Math.hypot(p.x-a.x,p.y-a.y)<tolerance)return "start";if(Math.hypot(p.x-a.x2,p.y-a.y2)<tolerance)return "end";return null;}
  if(a.type==="number"||a.type==="text")return null;
  const b=annotationBounds(a),corners=[["nw",b.x,b.y],["ne",b.x+b.w,b.y],["sw",b.x,b.y+b.h],["se",b.x+b.w,b.y+b.h]];
  return corners.find(([,x,y])=>Math.hypot(p.x-x,p.y-y)<tolerance)?.[0]||null;
}
// Existing annotations can be moved and resized with any tool. While drawing, area shapes are grabbed
// only by their edge so new annotations can still be placed inside them.
const areaTypes=["rectangle","redact","blur"];
// Redactions move only with Select, so drawing next to one can never uncover the data it hides.
const grabbable=a=>tool==="select"||a.type!=="redact";
function target(p){
  const a=annotations.find(a=>a.id===selected),handle=a&&grabbable(a)?handleAt(a,p):null;
  if(handle)return {a,handle};
  for(let i=annotations.length-1;i>=0;i--){const b=annotations[i];if(grabbable(b)&&hitAnnotation(b,p,6/zoom)&&(tool==="select"||!areaTypes.includes(b.type)||!hitAnnotation(b,p,-6/zoom)))return {a:b,handle:null};}
  return null;
}
function grab(p){
  const t=target(p);if(!t)return null;
  return t.handle?{kind:"resize",id:t.a.id,start:p,original:clone(t.a),handle:t.handle}:{kind:"move",id:t.a.id,start:p,original:clone(t.a)};
}
function toolCursor(){return tool==="select"?"default":tool==="text"?"text":"crosshair";}
interaction.addEventListener("pointerdown",event=>{
  if(!image||event.button!==0)return;const p=point(event);interaction.focus();interaction.setPointerCapture(event.pointerId);
  const grabbed=grab(p);
  if(grabbed){selected=grabbed.id;drag=grabbed;sync();drawSelection();return;}
  if(tool==="select"){selected=null;sync();drawSelection();return;}
  if(!inImage(p))return;
  if(tool==="text"){editText(null,p);return;}
  if(tool==="number"){
    const size=Math.min(Math.max(44,defaultStyle.fontSize*1.7),image.width,image.height);
    const a={id:crypto.randomUUID(),type:"number",x:clamp(p.x,size/2,image.width-size/2),y:clamp(p.y,size/2,image.height-size/2),size,number:nextNumber(annotations),color:style.color};annotations.push(a);selected=a.id;commit();render();return;
  }
  const a={id:crypto.randomUUID(),type:tool,x:p.x,y:p.y,w:0,h:0,width:style.width,color:tool==="redact"?"#111827":style.color};
  if(tool==="arrow"){a.x2=p.x;a.y2=p.y;}annotations.push(a);selected=a.id;drag={kind:"create",id:a.id,start:p};render();
});
function updateDrag(event){
  if(!drag||!image)return;const p=bounded(point(event)),a=annotations.find(a=>a.id===drag.id);if(!a)return;
  if(drag.kind==="create"){if(a.type==="arrow"){a.x2=p.x;a.y2=p.y;}else Object.assign(a,normalRect(drag.start.x,drag.start.y,p.x,p.y));}
  if(drag.kind==="move"){
    const b=annotationBounds(drag.original),dx=clamp(p.x-drag.start.x,-b.x,image.width-b.x-b.w),dy=clamp(p.y-drag.start.y,-b.y,image.height-b.y-b.h);
    Object.assign(a,moveAnnotation(clone(drag.original),dx,dy));
  }
  if(drag.kind==="resize"){
    const o=drag.original;
    if(a.type==="arrow"){if(drag.handle==="start"){a.x=p.x;a.y=p.y;}else{a.x2=p.x;a.y2=p.y;}}
    else{const oppositeX=drag.handle.includes("w")?o.x+o.w:o.x,oppositeY=drag.handle.includes("n")?o.y+o.h:o.y;Object.assign(a,normalRect(oppositeX,oppositeY,p.x,p.y));a.w=Math.max(3,a.w);a.h=Math.max(3,a.h);}
  }
  render();
}
interaction.addEventListener("pointermove",updateDrag);
interaction.addEventListener("pointermove",event=>{
  if(drag||!image)return;const t=target(point(event));
  const cursor=t?.handle?(["nw","se"].includes(t.handle)?"nwse-resize":["ne","sw"].includes(t.handle)?"nesw-resize":"grab"):t?"move":toolCursor();
  if(interaction.style.cursor!==cursor)interaction.style.cursor=cursor;
});
function finishDrag(event){if(!drag)return;if(event?.type==="pointerup")updateDrag(event);const a=annotations.find(a=>a.id===drag.id);if(drag.kind==="create"&&a){const b=annotationBounds(a);if((a.type==="arrow"&&Math.hypot(a.x2-a.x,a.y2-a.y)<5)||(a.type!=="arrow"&&(b.w<3||b.h<3))){annotations=annotations.filter(item=>item.id!==a.id);selected=null;}}drag=null;commit();render();}
interaction.addEventListener("pointerup",finishDrag);interaction.addEventListener("lostpointercapture",finishDrag);
interaction.addEventListener("dblclick",event=>{const p=point(event),a=[...annotations].reverse().find(a=>a.type==="text"&&hitAnnotation(a,p));if(a){selected=a.id;editText(a);}});
async function exportImage(kind){
  if(!image||busy)return;finishDrag();busy=true;sync();try{
    let type="image/png";
    if(kind==="save"){const choice=await window.desktop.chooseSave();if(!valid(choice))return;if(choice.format==="jpeg")type="image/jpeg";}
    const blob=await renderer.exportImage(annotations,finish,type);
    const result=await window.desktop[kind](new Uint8Array(await blob.arrayBuffer()));if(!valid(result))return;
    if(kind==="copy")toast("Full image copied to clipboard");else{$("#saved-name").textContent=result.name;$("#saved").hidden=false;}
  }catch(e){toast("Could not export: "+e.message,true);}finally{busy=false;sync();}
}
$("#copy").onclick=()=>exportImage("copy");$("#save").onclick=()=>exportImage("save");
async function runDoctor(){
  const list=$("#doctor-checks");list.replaceChildren();$("#doctor-rerun").disabled=true;$("#doctor-settings").hidden=true;$("#doctor-relaunch").hidden=true;
  const result=await window.desktop.doctor();$("#doctor-rerun").disabled=false;if(!valid(result))return;
  for(const check of result.checks){const li=document.createElement("li"),label=document.createElement("strong"),detail=document.createElement("small");li.className=check.status;label.textContent=check.label;detail.textContent=check.detail;li.append(label,detail);list.append(li);}
  const settings=result.checks.some(c=>c.action==="settings");$("#doctor-settings").hidden=!settings;$("#doctor-relaunch").hidden=!settings;
}
function collapseFinishing(collapsed){$(".finishing").classList.toggle("collapsed",collapsed);const b=$("#toggle-finishing");b.title=collapsed?"Expand panel":"Collapse panel";b.setAttribute("aria-expanded",!collapsed);localStorage.setItem("finishingCollapsed",collapsed?"1":"");}
$("#toggle-finishing").onclick=()=>collapseFinishing(!$(".finishing").classList.contains("collapsed"));
collapseFinishing(localStorage.getItem("finishingCollapsed")==="1");
$("#doctor").onclick=()=>{$("#doctor-dialog").showModal();runDoctor();};
$("#doctor-rerun").onclick=runDoctor;$("#doctor-close").onclick=()=>$("#doctor-dialog").close();
$("#doctor-settings").onclick=async()=>valid(await window.desktop.openPrivacySettings());$("#doctor-relaunch").onclick=async()=>{if(annotations.length&&!confirm("Restart now? Annotations that are not saved or copied will be lost."))return;clearTimeout(prefsTimer);await window.desktop.savePreferences({finish,style});window.desktop.relaunch();};
$("#open-saved").onclick=async()=>{valid((await window.desktop.openSaved())||{ok:true});};$("#reveal-saved").onclick=async()=>{valid((await window.desktop.revealSaved())||{ok:true});};$("#close-saved").onclick=()=>$("#saved").hidden=true;
document.addEventListener("keydown",async event=>{
  if($("dialog[open]")||["INPUT","TEXTAREA","SELECT"].includes(document.activeElement?.tagName))return;
  const key=event.key.toLowerCase(),mod=event.ctrlKey||event.metaKey;
  if(mod&&key==="z"){event.preventDefault();event.shiftKey?redo():undo();return;}
  if(mod&&key==="y"){event.preventDefault();redo();return;}
  if(mod&&key==="0"){event.preventDefault();fitMode=true;computeZoom();drawSelection();return;}
  if(mod&&key==="s"){event.preventDefault();await exportImage("save");return;}
  if(event.key==="Escape"){if(drag){if(drag.kind==="create")annotations=annotations.filter(a=>a.id!==drag.id);else Object.assign(annotations.find(a=>a.id===drag.id),drag.original);drag=null;}selected=null;setTool("select");render();return;}
  if(["Delete","Backspace"].includes(event.key)){event.preventDefault();deleteSelected();return;}
  if(!mod){const shortcuts={v:"select",n:"number",a:"arrow",r:"rectangle",t:"text",o:"redact",b:"blur"};if(shortcuts[key])setTool(shortcuts[key]);}
});
document.querySelector(".canvas-area").addEventListener("wheel",event=>{if(event.ctrlKey||event.metaKey){event.preventDefault();setZoom(zoom*(event.deltaY>0?.9:1.1));}else if(event.target===interaction){event.preventDefault();viewport.scrollBy({left:event.shiftKey?event.deltaY:event.deltaX,top:event.shiftKey?0:event.deltaY,behavior:"instant"});}},{passive:false});
const preferences=await window.desktop.preferences();if(preferences&&!preferences.error&&Object.keys(preferences).length){({finish,style}=cleanPreferences(preferences));history=new History(state());}
// The account name is only a suggestion: shown as placeholder, used if the signature is on and left empty, never saved.
const userName=await window.desktop.username();if(typeof userName==="string"){renderer.signatureFallback=cleanSignature(userName);$("#signature-text").placeholder=renderer.signatureFallback||"Signature text";}sync();
// Exported module functions are also used by the desktop integration tests; no test IPC is shipped.
export function snapshot(){return clone({annotations,finish,style,zoom,composition,selected,tool});}
export async function exportData(){if(!image)return null;const blob=await renderer.exportPNG(annotations,finish);return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});}
export function renderDiagnostics(){return {...renderer.diagnostics(),previewPixels:canvas.width*canvas.height,selectionPixels:interaction.width*interaction.height};}
