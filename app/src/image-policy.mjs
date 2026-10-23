export const LIMITS = Object.freeze({
  maxInputBytes: 80 * 1024 * 1024,
  maxHeaderBytes: 1024 * 1024,
  maxInputPixels: 28000000,
  maxInputSide: 12000,
  maxOutputPixels: 80000000,
  maxOutputSide: 30000,
  maxUpscaledPixels: 40000000,
  maxExportBytes: 160 * 1024 * 1024
});
const signature = [137,80,78,71,13,10,26,10];
// Upscaling adds no detail, so scales above 100 % get a smaller budget to bound export memory.
export function outputFits(width,height,scale=1) {
  return width*height<=(scale>1?LIMITS.maxUpscaledPixels:LIMITS.maxOutputPixels)&&Math.max(width,height)<=LIMITS.maxOutputSide;
}
function bytes(value) {
  if (!(value instanceof Uint8Array)) throw Error("The image data is not valid.");
  return value;
}
function dimensions(width,height,output=false) {
  const maxPixels=output?LIMITS.maxOutputPixels:LIMITS.maxInputPixels;
  const maxSide=output?LIMITS.maxOutputSide:LIMITS.maxInputSide;
  if (!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1) throw Error("The image has invalid dimensions.");
  if(width>maxSide||height>maxSide||width*height>maxPixels) {
    throw Error(output?"The composition exceeds 80 megapixels or 30,000 pixels per side.":"The image exceeds the 28 megapixel or 12,000 pixels per side limit.");
  }
}
export function inspectEncodedImage(value,{output=false}={}) {
  const data=bytes(value),v=new DataView(data.buffer,data.byteOffset,data.byteLength);
  if(data.length>=8&&signature.every((b,i)=>data[i]===b)) {
    if(data.length<33||v.getUint32(8)!==13||v.getUint32(12)!==0x49484452)throw Error("The PNG header is incomplete or invalid.");
    const width=v.getUint32(16),height=v.getUint32(20);
    dimensions(width,height,output);
    return {width,height,mime:"image/png"};
  }
  if(data.length>=2&&data[0]===255&&data[1]===216) {
    let offset=2,frame=null;
    const frames=new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
    while(offset<data.length&&offset<LIMITS.maxHeaderBytes) {
      if(data[offset++]!==255)throw Error("The JPG header is invalid.");
      while(data[offset]===255)offset++;
      if(offset>=data.length)break;
      const marker=data[offset++];
      if(marker===0xda&&frame)return frame;
      if(marker===0xd9)break;
      if(marker===0x01||(marker>=0xd0&&marker<=0xd8))continue;
      if(offset+2>data.length)break;
      const length=v.getUint16(offset);
      if(length<2||offset+length>data.length)break;
      if(frames.has(marker)) {
        if(length<8)throw Error("The JPG header is invalid.");
        const height=v.getUint16(offset+3),width=v.getUint16(offset+5);
        dimensions(width,height,output);
        if(frame)throw Error("The JPG contains multiple image headers and is not supported.");
        frame={width,height,mime:"image/jpeg"};
      }
      offset+=length;
    }
    throw Error("Could not read the JPG dimensions within the header limit (1 MB).");
  }
  throw Error("Select a valid PNG or JPG image.");
}
export async function validateImageBlob(blob) {
  if(!blob||!Number.isFinite(blob.size)||blob.size<1||blob.size>LIMITS.maxInputBytes)throw Error("The image is empty or exceeds 80 MB.");
  const header=new Uint8Array(await blob.slice(0,LIMITS.maxHeaderBytes).arrayBuffer());
  return inspectEncodedImage(header);
}
export function sanitizeExportPNG(value) {
  const data=bytes(value);
  if(data.length>LIMITS.maxExportBytes)throw Error("The exported PNG exceeds 160 MB.");
  inspectEncodedImage(data,{output:true});
  const v=new DataView(data.buffer,data.byteOffset,data.byteLength),parts=[data.subarray(0,8)];
  let offset=8,seenHeader=false,seenData=false,seenEnd=false,total=8;
  while(offset+12<=data.length) {
    const length=v.getUint32(offset),end=offset+12+length;
    if(end>data.length)throw Error("The exported PNG is incomplete.");
    const type=v.getUint32(offset+4);
    if(!seenHeader&&type!==0x49484452)throw Error("The exported PNG is not valid.");
    if(type===0x49484452) {
      if(seenHeader||length!==13)throw Error("The PNG header is invalid.");
      seenHeader=true;
    } else if(type===0x49444154)seenData=true;
    else if(type===0x49454e44) {
      if(length!==0||!seenData)throw Error("The exported PNG is not valid.");
      seenEnd=true;
    } else if((data[offset+4]&32)===0)throw Error("The exported PNG contains an unsupported image chunk.");
    // Canvas exports need only these chunks. Discard metadata and trailing bytes.
    if(type===0x49484452||type===0x49444154||type===0x49454e44){parts.push(data.subarray(offset,end));total+=end-offset;}
    offset=end;
    if(seenEnd)break;
  }
  if(!seenEnd)throw Error("The exported PNG is incomplete.");
  if(total===data.length)return data;
  const clean=new Uint8Array(total);let position=0;
  for(const part of parts){clean.set(part,position);position+=part.length;}
  return clean;
}
