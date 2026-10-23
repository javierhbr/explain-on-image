import test from "node:test";
import assert from "node:assert/strict";
import { inspectEncodedImage, validateImageBlob, sanitizeExportPNG, LIMITS } from "../src/image-policy.mjs";

function pngHeader(width,height) {
  const b=new Uint8Array(33),v=new DataView(b.buffer);
  b.set([137,80,78,71,13,10,26,10]);v.setUint32(8,13);
  b.set([73,72,68,82],12);v.setUint32(16,width);v.setUint32(20,height);
  b[24]=8;b[25]=6;return b;
}
function jpeg(width,height) {
  return Uint8Array.from([255,216,255,224,0,4,0,0,255,192,0,17,8,height>>8,height&255,width>>8,width&255,3,1,17,0,2,17,0,3,17,0,255,218]);
}
test("PNG/JPEG dimensions are inspected without a decoder",()=>{
  assert.deepEqual(inspectEncodedImage(pngHeader(1200,720)),{width:1200,height:720,mime:"image/png"});
  assert.deepEqual(inspectEncodedImage(jpeg(1200,720)),{width:1200,height:720,mime:"image/jpeg"});
});
test("compact over-limit image headers are rejected before decode",()=>{
  for(const b of [pngHeader(20000,20000),pngHeader(8000,8000),jpeg(20000,20000)])assert.throws(()=>inspectEncodedImage(b),/28|000/);
});
test("rejects unsupported, incomplete and invalid image headers",()=>{
  for(const b of [new Uint8Array(),new Uint8Array(32),pngHeader(0,100),Uint8Array.from([255,216,255,192,255,255])])assert.throws(()=>inspectEncodedImage(b));
});
test("clipboard byte limit is checked before reading the blob",async()=>{
  let read=false;
  await assert.rejects(validateImageBlob({size:LIMITS.maxInputBytes+1,slice(){read=true;throw Error("Must not read");},arrayBuffer(){read=true;}}),/80 MB/);
  assert.equal(read,false);
});
test("clipboard headers are checked using a bounded slice",async()=>{
  let read=0;
  const data=pngHeader(500,300);
  const blob={size:10000000,slice(start,end){read=end-start;return new Blob([data]);},arrayBuffer(){throw Error("Full blob must not be read during header validation");}};
  assert.equal((await validateImageBlob(blob)).width,500);
  assert.ok(read<=LIMITS.maxHeaderBytes);
});
function chunk(name,payload=new Uint8Array()){
  const b=new Uint8Array(payload.length+12),v=new DataView(b.buffer);
  v.setUint32(0,payload.length);b.set([...name].map(c=>c.charCodeAt(0)),4);b.set(payload,8);return b;
}
function joined(...chunks){const n=chunks.reduce((n,b)=>n+b.length,0),out=new Uint8Array(n);let i=0;for(const b of chunks){out.set(b,i);i+=b.length;}return out;}
test("export removes metadata and trailing bytes without decoding pixels",()=>{
  const header=pngHeader(500,300);
  const data=joined(header,chunk("tEXt",new TextEncoder().encode("secret")),chunk("IDAT",Uint8Array.from([1,2,3])),chunk("IEND"),new Uint8Array([99,99]));
  const clean=sanitizeExportPNG(data),text=new TextDecoder().decode(clean);
  assert.ok(!text.includes("secret"));assert.ok(!text.includes("tEXt"));assert.equal(clean.length,33+15+12);
});
test("export rejects oversized dimensions and malformed chunk lengths",()=>{
  assert.throws(()=>sanitizeExportPNG(joined(pngHeader(30000,30000),chunk("IDAT"),chunk("IEND"))));
  assert.throws(()=>sanitizeExportPNG(joined(pngHeader(10,10),new Uint8Array([127,255,255,255,73,68,65,84]))));
});

test("ambiguous JPEG frame headers cannot bypass dimension preflight",()=>{
  const a=jpeg(20,20),b=jpeg(1200,720),data=new Uint8Array(a.length+b.length-4);
  data.set(a.subarray(0,a.length-2));data.set(b.subarray(2),a.length-2);
  assert.throws(()=>inspectEncodedImage(data),/varias cabeceras/);
});
