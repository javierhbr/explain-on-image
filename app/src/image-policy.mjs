export const LIMITS = Object.freeze({
  maxInputBytes: 80 * 1024 * 1024,
  maxHeaderBytes: 1024 * 1024,
  maxInputPixels: 28000000,
  maxInputSide: 12000,
  maxOutputPixels: 80000000,
  maxOutputSide: 30000,
  maxExportBytes: 160 * 1024 * 1024
});
const signature = [137,80,78,71,13,10,26,10];
function bytes(value) {
  if (!(value instanceof Uint8Array)) throw Error("Los datos de imagen no son válidos.");
  return value;
}
function dimensions(width,height,output=false) {
  const maxPixels=output?LIMITS.maxOutputPixels:LIMITS.maxInputPixels;
  const maxSide=output?LIMITS.maxOutputSide:LIMITS.maxInputSide;
  if (!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1) throw Error("La imagen tiene dimensiones no válidas.");
  if(width>maxSide||height>maxSide||width*height>maxPixels) {
    throw Error(output?"La composición supera los 80 megapíxeles o 30 000 píxeles por lado.":"La imagen supera el límite de 28 megapíxeles o 12 000 píxeles por lado.");
  }
}
export function inspectEncodedImage(value,{output=false}={}) {
  const data=bytes(value),v=new DataView(data.buffer,data.byteOffset,data.byteLength);
  if(data.length>=8&&signature.every((b,i)=>data[i]===b)) {
    if(data.length<33||v.getUint32(8)!==13||v.getUint32(12)!==0x49484452)throw Error("La cabecera PNG está incompleta o no es válida.");
    const width=v.getUint32(16),height=v.getUint32(20);
    dimensions(width,height,output);
    return {width,height,mime:"image/png"};
  }
  if(!output&&data.length>=2&&data[0]===255&&data[1]===216) {
    let offset=2,frame=null;
    const frames=new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
    while(offset<data.length&&offset<LIMITS.maxHeaderBytes) {
      if(data[offset++]!==255)throw Error("La cabecera JPG no es válida.");
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
        if(length<8)throw Error("La cabecera JPG no es válida.");
        const height=v.getUint16(offset+3),width=v.getUint16(offset+5);
        dimensions(width,height);
        if(frame)throw Error("El JPG contiene varias cabeceras de imagen y no es compatible.");
        frame={width,height,mime:"image/jpeg"};
      }
      offset+=length;
    }
    throw Error("No se han podido leer las dimensiones del JPG dentro del límite de cabecera (1 MB).");
  }
  throw Error("Selecciona una imagen PNG o JPG válida.");
}
export async function validateImageBlob(blob) {
  if(!blob||!Number.isFinite(blob.size)||blob.size<1||blob.size>LIMITS.maxInputBytes)throw Error("La imagen está vacía o supera los 80 MB.");
  const header=new Uint8Array(await blob.slice(0,LIMITS.maxHeaderBytes).arrayBuffer());
  return inspectEncodedImage(header);
}
export function sanitizeExportPNG(value) {
  const data=bytes(value);
  if(data.length>LIMITS.maxExportBytes)throw Error("El PNG exportado supera los 160 MB.");
  inspectEncodedImage(data,{output:true});
  const v=new DataView(data.buffer,data.byteOffset,data.byteLength),parts=[data.subarray(0,8)];
  let offset=8,seenHeader=false,seenData=false,seenEnd=false,total=8;
  while(offset+12<=data.length) {
    const length=v.getUint32(offset),end=offset+12+length;
    if(end>data.length)throw Error("El PNG exportado está incompleto.");
    const type=v.getUint32(offset+4);
    if(!seenHeader&&type!==0x49484452)throw Error("El PNG exportado no es válido.");
    if(type===0x49484452) {
      if(seenHeader||length!==13)throw Error("La cabecera PNG no es válida.");
      seenHeader=true;
    } else if(type===0x49444154)seenData=true;
    else if(type===0x49454e44) {
      if(length!==0||!seenData)throw Error("El PNG exportado no es válido.");
      seenEnd=true;
    } else if((data[offset+4]&32)===0)throw Error("El PNG exportado contiene un bloque de imagen no admitido.");
    // Canvas exports need only these chunks. Discard metadata and trailing bytes.
    if(type===0x49484452||type===0x49444154||type===0x49454e44){parts.push(data.subarray(offset,end));total+=end-offset;}
    offset=end;
    if(seenEnd)break;
  }
  if(!seenEnd)throw Error("El PNG exportado está incompleto.");
  if(total===data.length)return data;
  const clean=new Uint8Array(total);let position=0;
  for(const part of parts){clean.set(part,position);position+=part.length;}
  return clean;
}
