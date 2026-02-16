export const Courses = {
  STRAIGHT: {
    name: "STRAIGHT",
    build: () => {
      // a long straight centerline
      const pts = [];
      const L = 300; // meters
      const N = 2000;
      for (let i=0;i<N;i++){
        const t = i/(N-1);
        const x = -L/2 + t*L;
        const y = 0;
        pts.push({x,y});
      }
      return {pts, laneW: 4.0};
    }
  },
 OVAL: {
  name: "OVAL",
  build: () => {
    const R = 25;
    const S = 80;
    const N = 2400;

    const len = 2*S + 2*Math.PI*R;

    function point(s){
      s = ((s % len) + len) % len;
      const s1 = S;
      const s2 = s1 + Math.PI*R;
      const s3 = s2 + S;

      if (s < s1) return { x: -S/2 + s, y: +R };

      if (s < s2) {
        const u = (s - s1) / (Math.PI*R);
        const ang = (Math.PI/2) + u * (-Math.PI);
        const cx = +S/2;
        return { x: cx + R*Math.cos(ang), y: R*Math.sin(ang) };
      }

      if (s < s3) {
        const u = (s - s2);
        return { x: +S/2 - u, y: -R };
      }

      const u = (s - s3) / (Math.PI*R);
      const ang = (-Math.PI/2) + u * (Math.PI);
      const cx = -S/2;
      return { x: cx - R*Math.cos(ang), y: R*Math.sin(ang) };
    }

    const pts = [];
    for (let i=0; i<N; i++){
      const s = (i / N) * len;
      pts.push(point(s));
    }
    return { pts, laneW: 4.0 };
  }
},

  SLALOM: {
  name: "SLALOM",
  build: () => {
    const laneW = 4.0;

    // --- 調整パラメータ ---
    const L = 100;   // S字+直線の長さ（画面に収めたいなら小さめ）
    const A = 20;    // S字の振幅（大きいほどクネクネ）
    const W = 50;    // 直線の上下オフセット（半円の直径でもある）

    // サンプル数（滑らかさ）
    const N1 = 1400; // S字
    const N2 = 260;  // 右半円
    const N3 = 900;  // 直線（戻り）
    const N4 = 260;  // 左半円

    const pts = [];

    // 1) S字区間：x -L/2 → +L/2, y は「端で水平になる」ように窓を掛ける
    // y(t) = A * sin(2πt) * sin^2(πt)
    // → t=0,1 で y=0 かつ dy/dt=0（半円と繋ぎやすい）
    for (let i = 0; i < N1; i++) {
      const t = i / (N1 - 1);           // 0..1
      const x = -L/2 + t * L;
      const w = Math.sin(Math.PI * t);  // 0..1..0
      const y = A * Math.sin(3*Math.PI*t) * (w*w);
      pts.push({ x, y });
    }

    // 2) 右半円：(+L/2,0) → (+L/2,W)
    // center=(+L/2, W/2), R=W/2, angle -90°→+90°
    {
      const cx = +L/2;
      const cy = W/2;
      const R = W/2;
      for (let i = 1; i < N2; i++) {     // 端点重複を避けて 1 から
        const u = i / (N2 - 1);
        const th = -Math.PI/2 + u*Math.PI;
        pts.push({ x: cx + R*Math.cos(th), y: cy + R*Math.sin(th) });
      }
    }

    // 3) 直線（戻り）：x +L/2 → -L/2, y=W
    for (let i = 1; i < N3; i++) {       // 端点重複を避けて 1 から
      const t = i / (N3 - 1);
      const x = +L/2 - t * L;
      const y = W;
      pts.push({ x, y });
    }

    // 4) 左半円：(-L/2,W) → (-L/2,0)
    // center=(-L/2, W/2), angle +90°→-90°
    {
      const cx = -L/2;
      const cy = W/2;
      const R = W/2;
      for (let i = 1; i < N4; i++) {     // 端点重複を避けて 1 から
        const u = i / (N4 - 1);
        const th = +Math.PI/2 - u*Math.PI;
        pts.push({ x: cx - R*Math.cos(th), y: cy + R*Math.sin(th) });
      }
    }

    return { pts, laneW };
  }
},

  CHICANE: {
    name: "CHICANE",
    build: () => {
      // piecewise: straight -> left -> right -> straight
      const pts = [];
      const N = 2200;
      const L = 320;
      for (let i=0;i<N;i++){
        const t = i/(N-1);
        const x = -L/2 + t*L;
        let y = 0;
        // two gaussian bumps (left then right)
        y +=  22*Math.exp(-Math.pow((x+40)/18,2));
        y += -22*Math.exp(-Math.pow((x-40)/18,2));
        pts.push({x,y});
      }
      return {pts, laneW: 4.0};
    }
  }
};
