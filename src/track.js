const clamp = (x,a,b)=>Math.max(a,Math.min(b,x));

export class Track {
  constructor({pts, laneW=4.0, closed=true}){
    this.pts = pts;
    this.N = pts.length;
    this.laneW = laneW;
    this.closed = closed;

    if (!pts || this.N < 2) { this.samples=[]; this.totalLen=0; return; }

    const sArr = new Array(this.N);
    sArr[0] = 0;
    for (let i=1;i<this.N;i++){
      const a = pts[i-1], b = pts[i];
      sArr[i] = sArr[i-1] + Math.hypot(b.x-a.x, b.y-a.y);
    }

    const last = pts[this.N-1], first = pts[0];
    const closing = closed ? Math.hypot(first.x-last.x, first.y-last.y) : 0;
    this.totalLen = sArr[this.N-1] + closing;

    this.samples = new Array(this.N);
    for (let i=0;i<this.N;i++){
      const p = pts[i];

      // forward diff：open track なら端の接線を端の差分で作る
      const pNext = pts[(i+1)];
      const pPrev = pts[(i-1)];

      let tx, ty;
      if (closed){
        const pn = pts[(i+1)%this.N];
        tx = pn.x - p.x; ty = pn.y - p.y;
      } else {
        if (i === this.N-1){
          tx = p.x - pPrev.x; ty = p.y - pPrev.y;
        } else {
          tx = pNext.x - p.x; ty = pNext.y - p.y;
        }
      }

      const tlen = Math.hypot(tx,ty) || 1;
      tx /= tlen; ty /= tlen;
      const nx = -ty, ny = tx;
      this.samples[i] = {x:p.x, y:p.y, tx, ty, nx, ny, s:sArr[i]};
    }
  }

  nearestLocal(x, y, idxHint, window=25){
    if (!this.samples.length) return {bestI:0, p:{x:0,y:0,nx:0,ny:0,tx:1,ty:0}, e_ct:0};

    let bestI = ((idxHint % this.N) + this.N) % this.N;
    let bestD2 = Infinity;

    // local search
    for (let k=-window;k<=window;k++){
      const i = (bestI + k + this.N) % this.N;
      const p = this.samples[i];
      const dx = x - p.x, dy = y - p.y;
      const d2 = dx*dx + dy*dy;
      if (d2 < bestD2){ bestD2 = d2; bestI = i; }
    }

    // relock (global search) if too far
    const relockDist = this.laneW * 2.5;
    if (bestD2 > relockDist * relockDist){
      bestI = 0; bestD2 = Infinity;
      for (let i=0;i<this.N;i++){
        const p = this.samples[i];
        const dx = x - p.x, dy = y - p.y;
        const d2 = dx*dx + dy*dy;
        if (d2 < bestD2){ bestD2 = d2; bestI = i; }
      }
    }

    const p = this.samples[bestI];
    const ex = x - p.x, ey = y - p.y;
    const e_ct = ex*p.nx + ey*p.ny;
    return {bestI, p, e_ct};
  }

  lookaheadPoint(idx, lookaheadMeters){
    if (!this.samples.length) return {x:0,y:0,tx:1,ty:0,nx:0,ny:1,s:0};

    // average step length (loop)
    const step = this.totalLen / this.N;
    const k = Math.max(1, Math.floor(lookaheadMeters / Math.max(1e-6, step)));
    return this.samples[(idx + k) % this.N];
  }

  spawn(i, count){
    const base = this.samples[0] || {x:0,y:0,nx:0,ny:1,tx:1,ty:0};
    const offset = (i - (count-1)/2) * 0.35;
    return {
      x: base.x + base.nx * offset,
      y: base.y + base.ny * offset,
      psi: Math.atan2(base.ty, base.tx),
      idx: 0
    };
  }
}
