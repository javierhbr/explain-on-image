export const defaults = Object.freeze({ margin: 64, radius: 16, shadow: true, background: "dark", ratio: "auto", signature: false });
export const defaultStyle = Object.freeze({ color: "#ff8a3d", width: 5, fontSize: 30 });
export const clone = value => JSON.parse(JSON.stringify(value));
export const clamp = (v,min,max) => Math.max(min,Math.min(max,v));
export function cleanPreferences(value = {}) {
  const f = value.finish || {};
  const s = value.style || {};
  return { finish: { margin: clamp(Number.isFinite(Number(f.margin))?Number(f.margin):defaults.margin,0,200), radius: clamp(Number.isFinite(Number(f.radius))?Number(f.radius):defaults.radius,0,60), shadow: typeof f.shadow === "boolean" ? f.shadow : defaults.shadow, background: ["white","dark","gradient"].includes(f.background)?f.background:defaults.background, ratio: f.ratio === "wide"?"wide":"auto", signature: f.signature === true }, style: { color: /^#[\da-f]{6}$/i.test(s.color)?s.color:defaultStyle.color, width: clamp(Number(s.width)||5,2,16), fontSize: clamp(Number(s.fontSize)||30,16,72) } };
}
export function layout(w,h,finish) {
  const margin = finish.margin;
  const signature = finish.signature ? 38 : 0;
  let width = w + margin*2, height = h + margin*2 + signature;
  if (finish.ratio === "wide") {
    // Multiples of 16 and 9 preserve an exact 16:9 output with integer pixels.
    const unit = Math.ceil(Math.max(width/16,height/9));
    width = unit*16; height = unit*9;
  }
  return { width, height, x: Math.floor((width-w)/2), y: Math.floor((height-signature-h)/2), imageWidth:w,imageHeight:h, signature };
}
export function imagePoint(clientX,clientY,bounds,composition) {
  return { x:(clientX-bounds.left)*composition.width/bounds.width-composition.x, y:(clientY-bounds.top)*composition.height/bounds.height-composition.y };
}
export function normalRect(x1,y1,x2,y2) { return {x:Math.min(x1,x2),y:Math.min(y1,y2),w:Math.abs(x2-x1),h:Math.abs(y2-y1)}; }
export function nextNumber(annotations) { return Math.max(0,...annotations.filter(a=>a.type==="number").map(a=>a.number))+1; }
export function annotationBounds(a) {
  if(a.type==="arrow")return normalRect(a.x,a.y,a.x2,a.y2);
  if(a.type==="number")return {x:a.x-a.size/2,y:a.y-a.size/2,w:a.size,h:a.size};
  return {x:a.x,y:a.y,w:a.w,h:a.h};
}
function segmentDistance(p,a) {
  const dx=a.x2-a.x,dy=a.y2-a.y,den=dx*dx+dy*dy;
  const t=den?clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/den,0,1):0;
  return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
}
export function hitAnnotation(a,p,tolerance=6) {
  if(a.type==="arrow")return segmentDistance(p,a)<Math.max(tolerance,a.width*2);
  if(a.type==="number")return Math.hypot(p.x-a.x,p.y-a.y)<=a.size/2+tolerance;
  const r=annotationBounds(a);
  return p.x>=r.x-tolerance&&p.x<=r.x+r.w+tolerance&&p.y>=r.y-tolerance&&p.y<=r.y+r.h+tolerance;
}
export function moveAnnotation(a,dx,dy) { a.x+=dx;a.y+=dy;if(a.type==="arrow"){a.x2+=dx;a.y2+=dy;} return a; }
export class History {
  constructor(initial,limit=100){this.states=[clone(initial)];this.index=0;this.limit=limit;}
  get canUndo(){return this.index>0;}
  get canRedo(){return this.index<this.states.length-1;}
  push(state){const value=clone(state);if(JSON.stringify(value)===JSON.stringify(this.states[this.index]))return;this.states=this.states.slice(0,this.index+1);this.states.push(value);if(this.states.length>this.limit)this.states.shift();this.index=this.states.length-1;}
  undo(){if(this.canUndo)this.index--;return clone(this.states[this.index]);}
  redo(){if(this.canRedo)this.index++;return clone(this.states[this.index]);}
}
