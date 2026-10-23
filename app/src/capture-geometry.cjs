"use strict";
function cropRectangle(rect, width, height) {
  if (!rect || ![rect.x, rect.y, rect.width, rect.height, width, height].every(Number.isFinite) || width < 1 || height < 1) throw Error("Invalid selection.");
  const x = Math.max(0, Math.min(width - 1, Math.floor(rect.x * width)));
  const y = Math.max(0, Math.min(height - 1, Math.floor(rect.y * height)));
  const w = Math.min(width - x, Math.round(rect.width * width));
  const h = Math.min(height - y, Math.round(rect.height * height));
  return w < 2 || h < 2 ? null : { x, y, width: w, height: h };
}
module.exports = { cropRectangle };
