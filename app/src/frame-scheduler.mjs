export class FrameScheduler {
  constructor(paint,request=fn=>requestAnimationFrame(fn),cancel=id=>cancelAnimationFrame(id)) {
    this.paint=paint;this.requestFrame=request;this.cancelFrame=cancel;this.pending=null;this.disposed=false;
  }
  request() {
    if(this.disposed||this.pending!==null)return;
    this.pending=this.requestFrame(()=>{this.pending=null;if(!this.disposed)this.paint();});
  }
  flush() {
    if(this.disposed)return;
    if(this.pending!==null){this.cancelFrame(this.pending);this.pending=null;}
    this.paint();
  }
  dispose() {
    if(this.pending!==null)this.cancelFrame(this.pending);
    this.pending=null;this.disposed=true;
  }
}
