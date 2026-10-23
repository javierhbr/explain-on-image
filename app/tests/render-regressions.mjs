import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
const root=path.resolve(import.meta.dirname,"../..");
let app;
const results=[];
try {
  app=await electron.launch({args:[path.join(root,"app")],env:{...process.env,EXPLAIN_TEST:"1"}});
  const page=await app.firstWindow();
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(w=>w.hide()));
  await page.waitForFunction(()=>document.querySelectorAll("i svg").length>15);
  async function check(name,fn){try{const detail=await fn();results.push({name,status:"PASS",detail});console.log("PASS",name,detail||"");}catch(e){results.push({name,status:"FAIL",error:e.stack});console.error("FAIL",name,e.message);}}
  await check("opaque redaction invariance with overlapping blur",async()=>{
    const result=await page.evaluate(async()=>{
      const {renderComposition}=await import("./render.mjs");
      const f={margin:0,radius:0,shadow:false,background:"white",ratio:"auto",signature:false};
      async function source(color){const c=document.createElement("canvas");c.width=400;c.height=300;const x=c.getContext("2d");x.fillStyle="#ffffff";x.fillRect(0,0,400,300);x.fillStyle=color;x.fillRect(150,100,100,80);return createImageBitmap(c);}
      const a=await source("#000000"),b=await source("#ff0000"),annotations=[{type:"redact",x:150,y:100,w:100,h:80,color:"#111827"},{type:"blur",x:120,y:80,w:160,h:120}];
      const ac=renderComposition(a,annotations,f).canvas,bc=renderComposition(b,annotations,f).canvas;
      const av=ac.getContext("2d").getImageData(0,0,400,300).data,bv=bc.getContext("2d").getImageData(0,0,400,300).data;
      let changed=0;for(let i=0;i<av.length;i++)if(av[i]!==bv[i])changed++;
      a.close();b.close();ac.width=bc.width=1;
      return {changedChannels:changed};
    });
    assert.equal(result.changedChannels,0);return result;
  });
  await check("preview and interaction surfaces are bounded by viewport",async()=>{
    const result=await page.evaluate(async()=>{
      const c=document.createElement("canvas");c.width=3000;c.height=2000;const x=c.getContext("2d");x.fillStyle="#627fa1";x.fillRect(0,0,c.width,c.height);
      const data=c.toDataURL("image/png");c.width=1;
      await (await import("./editor.mjs")).loadImage({bytes:Uint8Array.from(atob(data.split(",")[1]),c=>c.charCodeAt(0)),mime:"image/png",name:"Prueba de recursos"});
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const vp=document.querySelector("#viewport");
      return {preview:document.querySelector("#composition").width*document.querySelector("#composition").height,interaction:document.querySelector("#interaction").width*document.querySelector("#interaction").height,max:Math.ceil(vp.clientWidth*2)*Math.ceil(vp.clientHeight*2)};
    });
    assert.ok(result.preview<=result.max);assert.ok(result.interaction<=result.max);return result;
  });

  await check("large portrait format does not allocate export-sized preview surfaces",async()=>{
    const result=await page.evaluate(async()=>{
      const c=document.createElement("canvas");c.width=2000;c.height=6500;
      c.getContext("2d").fillRect(0,0,c.width,c.height);
      const b=await new Promise(r=>c.toBlob(r));c.width=c.height=1;
      await (await import("./editor.mjs")).loadImage({bytes:new Uint8Array(await b.arrayBuffer()),mime:"image/png",name:"Prueba vertical de 13 MP"});
    });
    await page.locator("#ratio-wide").click();
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const before=await page.evaluate(async()=>{const m=await import("./editor.mjs");return{state:m.snapshot(),resources:m.renderDiagnostics()};});
    assert.ok(before.state.composition.width*before.state.composition.height>75000000);
    assert.ok(before.resources.previewPixels<4300000&&before.resources.selectionPixels<4300000);
    assert.equal(before.resources.nativePaints,0);
    await page.locator("#zoom-value").click();await page.locator("#zoom-in").click();
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const after=await page.evaluate(async()=>(await import("./editor.mjs")).renderDiagnostics());
    assert.equal(after.previewPixels,before.resources.previewPixels);
    assert.equal(after.selectionPixels,before.resources.selectionPixels);
    return {compositionPixels:before.state.composition.width*before.state.composition.height,previewPixels:after.previewPixels,selectionPixels:after.selectionPixels};
  });
  await check("unchanged filtered tiles are reused and their combined cache is bounded",async()=>{
    const result=await page.evaluate(async()=>{
      const {CompositionRenderer}=await import("./render.mjs");
      const source=document.createElement("canvas");source.width=3000;source.height=2000;
      source.getContext("2d").fillRect(0,0,3000,2000);
      const bitmap=await createImageBitmap(source);source.width=source.height=1;
      const renderer=new CompositionRenderer(bitmap),target=document.createElement("canvas");
      let assignments=0;
      for(const key of ["width","height"]){const descriptor=Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype,key);Object.defineProperty(target,key,{get(){return descriptor.get.call(this);},set(value){assignments++;descriptor.set.call(this,value);}});}
      const annotations=[0,1,2].map(i=>({type:"blur",x:50+i*200,y:50+i*50,w:2400,h:1600}));
      annotations.push({type:"arrow",x:30,y:30,x2:100,y2:100,color:"#ff8a3d",width:5});
      const finish={margin:64,radius:16,shadow:true,background:"dark",ratio:"auto",signature:false};
      const l=(await import("./core.mjs")).layout(3000,2000,finish);
      for(let i=0;i<24;i++){annotations.at(-1).x=i+30;renderer.renderPreview(target,annotations,finish,l,{width:900,height:600,dpr:1,left:0,top:0,scale:.25});}
      const diagnostics=renderer.diagnostics();
      target.getContext("2d").getImageData(200,200,1,1);
      const dimensionAssignments=assignments;
      renderer.dispose();bitmap.close();target.width=target.height=1;
      return {assignments:dimensionAssignments,...diagnostics};
    });
    assert.equal(result.assignments,2);
    assert.equal(result.blurBuilds,3);
    assert.ok(result.blurCachePixels<=result.blurCacheLimit);
    return result;
  });
  await check("native export surfaces are released after asynchronous PNG encoding",async()=>{
    const result=await page.evaluate(async()=>{
      const {CompositionRenderer}=await import("./render.mjs"),c=document.createElement("canvas");
      c.width=640;c.height=360;const image=await createImageBitmap(c);c.width=c.height=1;
      const renderer=new CompositionRenderer(image);
      const blob=await renderer.exportPNG([],{margin:64,radius:16,shadow:true,background:"dark",ratio:"auto",signature:false});
      const diagnostics=renderer.diagnostics();renderer.dispose();image.close();
      return {bytes:blob.size,...diagnostics};
    });
    assert.ok(result.bytes>0);assert.equal(result.activeExportPixels,0);
    return result;
  });
  await check("PNG and real clipboard remain invariant under masked-source changes",async()=>{
    const files=[path.join(root,"verification/privacy-a.png"),path.join(root,"verification/privacy-b.png")];
    const clipboardBitmaps=[];
    for(let n=0;n<2;n++){
      await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},files[n]);
      const result=await page.evaluate(async color=>{
        const {CompositionRenderer}=await import("./render.mjs"),c=document.createElement("canvas");
        c.width=400;c.height=300;const x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,400,300);x.fillStyle=color;x.fillRect(150,100,100,80);
        const image=await createImageBitmap(c);c.width=c.height=1;const renderer=new CompositionRenderer(image);
        const annotations=[{type:"redact",x:150,y:100,w:100,h:80,color:"#111827"},{type:"blur",x:120,y:80,w:160,h:120}];
        const blob=await renderer.exportPNG(annotations,{margin:0,radius:0,shadow:false,background:"white",ratio:"auto",signature:false});
        const data=new Uint8Array(await blob.arrayBuffer());
        await window.desktop.chooseSave();const save=await window.desktop.save(data),copy=await window.desktop.copy(data);
        renderer.dispose();image.close();return {save,copy};
      },n?"#ff0000":"#000000");
      assert.ok(!result.save.error&&!result.copy.error);
      clipboardBitmaps.push(await app.evaluate(async({clipboard,nativeImage})=>{
        const items=await clipboard.read(),item=items.find(i=>i.types.includes("image/png"));
        const blob=await item.getType("image/png");return nativeImage.createFromBuffer(Buffer.from(await blob.arrayBuffer())).toBitmap().toString("base64");
      }));
    }
    assert.equal(clipboardBitmaps[0],clipboardBitmaps[1]);
    assert.deepEqual(await fs.readFile(files[0]),await fs.readFile(files[1]));
    return {pngIdentical:true,clipboardPixelsIdentical:true};
  });
  await check("main process rejects oversized headers before native decode",async()=>{
    const file=path.join(root,"verification/oversized-header.png"),b=Buffer.alloc(33);
    b.set([137,80,78,71,13,10,26,10]);b.writeUInt32BE(13,8);b.write("IHDR",12);b.writeUInt32BE(20000,16);b.writeUInt32BE(20000,20);b[24]=8;b[25]=6;
    await fs.writeFile(file,b);
    await app.evaluate(({dialog,nativeImage},file)=>{globalThis.decodeCalls=0;const original=nativeImage.createFromPath;globalThis.restoreDecoder=()=>{nativeImage.createFromPath=original;};nativeImage.createFromPath=()=>{globalThis.decodeCalls++;throw Error("Decoder must not run");};dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);
    try{
      const result=await page.evaluate(()=>window.desktop.openImage());
      assert.match(result.error,/28|000/);
      assert.equal(await app.evaluate(()=>globalThis.decodeCalls),0);
      return {nativeDecoderCalls:0};
    }finally{await app.evaluate(()=>globalThis.restoreDecoder());}
  });

} finally {
  if(app)await app.close();
  await fs.mkdir(path.join(root,"verification"),{recursive:true});
  await fs.writeFile(path.join(root,"verification/render-regressions.json"),JSON.stringify(results,null,2));
}
if(results.some(r=>r.status==="FAIL"))process.exitCode=1;
