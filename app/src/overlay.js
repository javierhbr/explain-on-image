(async () => {
  const data = await window.desktop.overlayImage();
  if (!data || data.error) return window.desktop.overlayFinish(null);
  document.querySelector("#screen").src = data.data;
  let start;
  const box = document.querySelector("#selection");
  function area(event) { return { x: Math.min(start.x,event.clientX), y: Math.min(start.y,event.clientY), width: Math.abs(event.clientX-start.x), height: Math.abs(event.clientY-start.y) }; }
  document.addEventListener("pointerdown", event => { if(event.button !== 0)return; start={x:event.clientX,y:event.clientY}; document.querySelector("#shade").style.display="none"; document.querySelector("#hint").style.display="none"; });
  document.addEventListener("pointermove", event => { if(!start)return; const r=area(event); Object.assign(box.style,{display:"block",left:r.x+"px",top:r.y+"px",width:r.width+"px",height:r.height+"px"}); document.querySelector("#size").textContent=`${Math.round(r.width/innerWidth*data.width)} × ${Math.round(r.height/innerHeight*data.height)} px`; });
  document.addEventListener("pointerup", async event => { if(!start)return; const r=area(event); start=null; if(r.width<2||r.height<2){box.style.display="none";return;} await window.desktop.overlayFinish({x:r.x/innerWidth,y:r.y/innerHeight,width:r.width/innerWidth,height:r.height/innerHeight}); });
  document.addEventListener("keydown",event=>{if(event.key==="Escape")window.desktop.overlayFinish(null);});
})();
