import {PID} from "./pid.js";

export class Vehicle {
  constructor(spec){
    this.name = spec.name ?? "car";
    this.team = spec.team ?? "";
    this.colorIndex = spec.colorIndex ?? 0;

    this.L = spec.L ?? 2.6;
    this.v = spec.v ?? 10;
    this.lookahead = spec.lookahead ?? 12;
    this.steerLimit = (spec.steerLimitDeg ?? 22) * Math.PI/180;

    this.pid = new PID({
      kp: spec.kp ?? 2,
      ki: spec.ki ?? 0,
      kd: spec.kd ?? 0.8,
      dfHz: spec.dfHz ?? 10,
      aw: spec.aw ?? 0.5
    });

    // ★元ゲインを保持（課題モードで壊さないため）
    this.baseGains = {
      kp: this.pid.kp,
      ki: this.pid.ki,
      kd: this.pid.kd,
      dfHz: this.pid.dfHz,
      aw: this.pid.aw
    };

    // === Disturbance / Wall / Accel params ===
    // 外乱（確率は「1ステップあたり」）
    // ※0.00001% = 1e-7 は dt=1/120 だとほぼ起きないので、授業では 1e-5〜1e-4 推奨
    this.pStepDist = spec.pStepDist ?? 1e-7;  // 0.00001%/step
    this.distDuration = spec.distDuration ?? 1.0; // [s]
    this.distYawRate = spec.distYawRate ?? 0.35;  // [rad/s] ステップ外乱（ヨーレート加算）

    // 壁減速
    this.vMinRatio = spec.vMinRatio ?? 0.15; // 外れても最低この割合では動く
    this.kWall = spec.kWall ?? 0.8;          // 減速の強さ（大きいほど厳しい）

    // 加速：一次遅れで vCmd に追従（約10秒でほぼ到達）
    this.tauV = spec.tauV ?? 3.3;            // [s] 3*tau ≈ 10s で95%到達

   // 速度状態（v は「最高速 vMax」として扱う）
   this.vNow = 0;
   this.wDist = 0;       // 外乱ヨーレート
   this.distT = 0;       // 外乱残り時間

   this.disturbanceOn = false;
   this.pStepDist = spec.pStepDist ?? 1e-5;   // 現実的確率（授業用）
   this.distDuration = spec.distDuration ?? 1.0;
   this.distYawRate = spec.distYawRate ?? 0.35;

   this.wDist = 0;
   this.distT = 0;


    this.reset(spec.spawn ?? {x:0,y:0,psi:0, idx:0});
    this.vNow = 0;
    this.wDist = 0;
    this.distT = 0;

  }

  reset(spawn){
    this.x = spawn.x;
    this.y = spawn.y;
    this.psi = spawn.psi;
    this.delta = 0;
    this.idx = spawn.idx ?? 0;
    this.lap = 0;
    this.lapTime = 0;
    this.score = 0;
    this.pid.reset();
    this._prevIdx = this.idx;
  }

  // ★UIからゲイン変更するときに呼ぶと便利（任意）
  setGains(g){
    if (typeof g.kp === "number") this.pid.kp = g.kp;
    if (typeof g.ki === "number") this.pid.ki = g.ki;
    if (typeof g.kd === "number") this.pid.kd = g.kd;
    if (typeof g.dfHz === "number") this.pid.dfHz = g.dfHz;
    if (typeof g.aw === "number") this.pid.aw = g.aw;

    this.baseGains = { kp:this.pid.kp, ki:this.pid.ki, kd:this.pid.kd, dfHz:this.pid.dfHz, aw:this.pid.aw };
  }

  step(dt, track, taskMode){
    // 1) 最近傍点（白線上の目標点）
    const near = track.nearestLocal(this.x, this.y, this.idx, 25);
    this.idx = near.bestI;

    // 2) 横ずれ誤差（白線からの距離）
    const e = near.e_ct;

    // 3) 課題モードに応じて（P/PD/PID）ゲインを一時的に制限
    const kp = this.baseGains.kp;
    const kd = (taskMode === "P") ? 0 : this.baseGains.kd;
    const ki = (taskMode === "PID") ? this.baseGains.ki : 0;

    this.pid.kp = kp;
    this.pid.kd = kd;
    this.pid.ki = ki;
    // dfHz / aw はそのまま（UIで変えたら反映される）

    // 4) 操舵：e→δ（符号は現状踏襲）
    const {u, p, i, d} = this.pid.step(-e, dt, -this.steerLimit, this.steerLimit);
    this.delta = u;

    // --- ここまで：near / e / taskMode / PIDで this.delta を決める ---
// e は near.e_ct（横ずれ）

// 1) ランダム外乱（ステップ外乱）
// 外乱中でなければ、確率で発生させる
if (this.distT <= 0 && Math.random() < this.pStepDist) {
  this.distT = this.distDuration;
  const sgn = (Math.random() < 0.5) ? -1 : 1;
  this.wDist = sgn * this.distYawRate;
}
// 外乱の時間経過
if (this.distT > 0) {
  this.distT -= dt;
  if (this.distT <= 0) {
    this.distT = 0;
    this.wDist = 0;
  }
}

// 2) 壁減速（ラインからズレるほど遅くなる）
const off = Math.max(0, Math.abs(e) - track.laneW); // laneW以内なら0
// 線形減速：mu=1（内側）→ mu=vMinRatio（大外れ）
let mu = 1 - this.kWall * off;
mu = Math.max(this.vMinRatio, Math.min(1, mu));

// 3) 加速（10秒で最高速付近）
// v は最高速 vMax として使う
const vCmd = this.v * mu;
// 一次遅れ：dv/dt = (vCmd - vNow)/tauV
this.vNow += (vCmd - this.vNow) * (dt / Math.max(1e-6, this.tauV));

// 4) 車両運動（自転車モデル）＋外乱（ヨーレートに加算）
const psiDot = (this.vNow / this.L) * Math.tan(this.delta) + this.wDist;
this.psi = wrapPi(this.psi + psiDot * dt);

// 位置更新（vNow を使う）
this.x += this.vNow * Math.cos(this.psi) * dt;
this.y += this.vNow * Math.sin(this.psi) * dt;

// スコアにも外れ/外乱の影響を入れるなら（任意）
this.score += (e*e + 0.05*(this.delta*this.delta) + 0.5*off*off) * dt;

// テレメトリ用に保存（任意）
this._mu = mu;
this._off = off;
this._wDist = this.wDist;
this._vNow = this.vNow;


    

    return {e, p, i, d};
  }
}

function wrapPi(a){
  a = (a + Math.PI) % (2*Math.PI);
  if (a < 0) a += 2*Math.PI;
  return a - Math.PI;
}
