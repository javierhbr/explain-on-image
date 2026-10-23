import test from "node:test";
import assert from "node:assert/strict";
import {layout,imagePoint,normalRect,nextNumber,moveAnnotation,History,defaults,cleanPreferences,hitAnnotation} from "../src/core.mjs";
test("16:9 contains full portrait screenshot at native resolution",()=>{const l=layout(900,1800,{...defaults,ratio:"wide",signature:true});assert.equal(l.width/l.height,16/9);assert.ok(l.x>=64&&l.y>=64);assert.ok(l.x+900<=l.width-64);assert.ok(l.y+1800<=l.height-64-38);assert.equal(l.imageWidth,900);assert.equal(l.imageHeight,1800);});
test("automatic format reserves signature outside screenshot",()=>{const l=layout(1200,700,{...defaults,margin:0,signature:true});assert.equal(l.height,738);assert.equal(l.y,0);assert.ok(l.height-19>=l.y+700);});
test("coordinates stay attached through zoom and window resize",()=>{const l=layout(1920,1080,defaults);for(const scale of [.1,.25,.5,1,1.25,1.5,2,4]){const b={left:123,top:67,width:l.width*scale,height:l.height*scale};const p=imagePoint(123+(l.x+745)*scale,67+(l.y+386)*scale,b,l);assert.ok(Math.abs(p.x-745)<1e-8);assert.ok(Math.abs(p.y-386)<1e-8);}});
test("undo a number reuses its sequence and a new edit discards redo",()=>{const initial={annotations:[]};const h=new History(initial);let s=initial;for(let i=1;i<=3;i++){s={annotations:[...s.annotations,{type:"number",number:nextNumber(s.annotations)}]};h.push(s);}s=h.undo();assert.equal(nextNumber(s.annotations),3);s.annotations.push({type:"number",number:nextNumber(s.annotations)});h.push(s);assert.deepEqual(s.annotations.map(a=>a.number),[1,2,3]);assert.equal(h.canRedo,false);});
test("move undo redo retains exact image coordinates without mutating history",()=>{const a={id:"1",type:"arrow",x:25,y:30,x2:100,y2:130};const h=new History([a]);moveAnnotation(a,70,18);h.push([a]);assert.equal(h.undo()[0].x,25);assert.equal(h.redo()[0].x2,170);const undone=h.undo();undone[0].x=999;assert.equal(h.redo()[0].x,95);});
test("reversed selection is normalized and arrow hit testing is geometric",()=>{assert.deepEqual(normalRect(100,80,20,10),{x:20,y:10,w:80,h:70});const a={type:"arrow",x:10,y:10,x2:100,y2:100,width:3};assert.equal(hitAnnotation(a,{x:50,y:51}),true);assert.equal(hitAnnotation(a,{x:10,y:90}),false);});
test("preferences constrain values and colors",()=>{const p=cleanPreferences({finish:{margin:500,radius:-5,background:"evil",ratio:"wide"},style:{color:"url(x)",width:100}});assert.equal(p.finish.margin,200);assert.equal(p.finish.radius,0);assert.equal(p.style.color,"#ff8a3d");assert.equal(p.style.width,16);});

import captureGeometry from "../src/capture-geometry.cjs";
test("physical capture mapping at 100%, 125%, 150% and 200% DPI",()=>{
  for(const scale of [1,1.25,1.5,2]){
    const logical={width:1920,height:1080};
    const rect={x:250/logical.width,y:100/logical.height,width:800/logical.width,height:600/logical.height};
    assert.deepEqual(captureGeometry.cropRectangle(rect,logical.width*scale,logical.height*scale),{x:Math.floor(250*scale),y:Math.floor(100*scale),width:Math.round(800*scale),height:Math.round(600*scale)});
  }
});
test("capture geometry clamps screen edges and rejects tiny or invalid selections",()=>{
  assert.deepEqual(captureGeometry.cropRectangle({x:.9,y:.9,width:.5,height:.5},1000,1000),{x:900,y:900,width:100,height:100});
  assert.equal(captureGeometry.cropRectangle({x:0,y:0,width:.001,height:.001},100,100),null);
  assert.throws(()=>captureGeometry.cropRectangle({x:NaN,y:0,width:1,height:1},100,100));
});
test("missing preferences preserve defaults",()=>assert.deepEqual(cleanPreferences({}).finish,defaults));
