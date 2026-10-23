import test from "node:test";
import assert from "node:assert/strict";
import { FrameScheduler } from "../src/frame-scheduler.mjs";
test("a burst of pointer updates schedules one frame",()=>{
  const callbacks=new Map();let serial=0,painted=0,value=0,last;
  const s=new FrameScheduler(()=>{painted++;last=value;},fn=>{callbacks.set(++serial,fn);return serial;},id=>callbacks.delete(id));
  for(let i=1;i<=120;i++){value=i;s.request();}
  assert.equal(callbacks.size,1);[...callbacks.values()][0]();
  assert.equal(painted,1);assert.equal(last,120);
});
test("flush cancels pending work and paints once",()=>{
  const callbacks=new Map();let painted=0;
  const s=new FrameScheduler(()=>painted++,fn=>{callbacks.set(1,fn);return 1;},id=>callbacks.delete(id));
  s.request();s.flush();assert.equal(callbacks.size,0);assert.equal(painted,1);
  s.dispose();s.request();assert.equal(painted,1);
});
