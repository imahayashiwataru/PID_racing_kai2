export class PID {
  constructor({kp=2, ki=0, kd=0.8, dfHz=10, aw=0.5}={}){
    this.kp=kp; this.ki=ki; this.kd=kd;
    this.dfHz=dfHz;
    this.aw=aw;
    this.i=0;
    this.dState=0;
    this.prevE=undefined;
  }
  reset(){
    this.i=0; this.dState=0; this.prevE=undefined;
  }
  step(e, dt, uMin=-Infinity, uMax=Infinity){
    const de = (this.prevE===undefined) ? 0 : (e - this.prevE)/dt;
    this.prevE = e;

    const alpha = 1 - Math.exp(-2*Math.PI*this.dfHz*dt);
    this.dState += alpha * (de - this.dState);

    // candidate
    const p = this.kp * e;
    const d = this.kd * this.dState;

    this.i += e*dt;
    let uRaw = p + this.ki*this.i + d;

    // saturate
    const uSat = Math.max(uMin, Math.min(uMax, uRaw));

    // anti-windup (back-calculation)
    if (this.ki > 1e-9 && Number.isFinite(this.aw) && this.aw > 0){
      const diff = (uSat - uRaw);
      this.i += (this.aw * diff / this.ki);
    }
    return {u: uSat, p, i: this.ki*this.i, d};
  }
}
