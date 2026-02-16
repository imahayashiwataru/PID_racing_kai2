import {getUI, setStatus, setApiLog, setFocusList, setTransferFunction} from "./ui.js";
import {fetchSheetRows, normalizeRows} from "./sheets_api.js";
import {Courses} from "./courses.js";
import {Track} from "./track.js";
import {Vehicle} from "./vehicle.js";
import {Renderer3D} from "./renderer.js";

const ui = getUI();
const canvas = document.getElementById("view");
const r3 = new Renderer3D(canvas);

let cars = [];
let track = null;
let paused = false;
let focusId = 0;

const FIXED_DT = 1/120;
let acc = 0;
let lastT = performance.now();

function getFocusCar(){
  if (!cars.length) return null;
  return cars[Math.max(0, Math.min(cars.length-1, focusId))];
}

function loadGainsFromCar(){
  const c = getFocusCar();
  if (!c) return;

  // 課題モードに左右されない「元ゲイン」を表示
  const g = c.baseGains ?? c.pid;

  ui.kpIn.value = g.kp;
  ui.kiIn.value = g.ki;
  ui.kdIn.value = g.kd;
  ui.dfHzIn.value = g.dfHz;
  ui.awIn.value = g.aw;

  ui.vIn.value = c.v;
  ui.lookIn.value = c.lookahead;
  ui.steerLimIn.value = (c.steerLimit * 180/Math.PI).toFixed(2);
}

function applyGainsToCar(){
  const c = getFocusCar();
  if (!c) return;

  // PID（+ baseGains）を更新：vehicle.js の setGains を使うのが正解
  c.setGains({
    kp: Number(ui.kpIn.value) || 0,
    ki: Number(ui.kiIn.value) || 0,
    kd: Number(ui.kdIn.value) || 0,
    dfHz: Math.max(0.1, Number(ui.dfHzIn.value) || 10),
    aw: Math.max(0, Number(ui.awIn.value) || 0),
  });

  // ついでに「車両パラメータ」も反映（UIにあるのに未反映なので）
  c.v = Math.max(0, Number(ui.vIn.value) || c.v);
  c.lookahead = Math.max(0.1, Number(ui.lookIn.value) || c.lookahead);
  c.steerLimit = (Math.max(0.1, Number(ui.steerLimIn.value) || 22)) * Math.PI/180;

  setApiLog(ui, `Applied tuning to focus car: ${c.name}`);
}

function buildTrack(courseKey){
  const course = Courses[courseKey] ?? Courses.OVAL;
  const {pts, laneW, closed} = course.build();
  track = new Track({pts, laneW, closed: (closed ?? true)});
  r3.setTrack(track);
}

function buildCars(specs){
  const count = specs.length;
  cars = specs.map((s, i)=>{
    const spawn = track.spawn(i, count);
    return new Vehicle({
      name: s.name,
      team: s.team,
      colorIndex: i,
      kp: s.kp, ki: s.ki, kd: s.kd,
      dfHz: s.dfHz, aw: s.aw,
      v: s.v, lookahead: s.lookahead,
      steerLimitDeg: s.steerLimitDeg,
      L: s.L,
      spawn
    });
  });
  setFocusList(ui, cars);
  focusId = 0;
}

function resetAll(){
  cars.forEach((c, i)=>c.reset(track.spawn(i, cars.length)));
}

function demoSpecs(n=1){
  const out = [];
  for (let i=0;i<n;i++){
    // generate diverse PID for fun
    const kp = 1.0 + 3.0*Math.random();
    const kd = 0.2 + 1.6*Math.random();
    const ki = (Math.random() < 0.35) ? (0.005 + 0.03*Math.random()) : 0.0;
    out.push({
      name: `demo-${i}`,
      team: "",
      kp, ki, kd,
      dfHz: 8 + 10*Math.random(),
      aw: 0.4 + 0.6*Math.random(),
      v: 9 + 5*Math.random(),
      lookahead: 10 + 8*Math.random(),
      steerLimitDeg: 18 + 10*Math.random(),
      L: 2.6
    });
  }
  return out;
}

// UI events
ui.startPauseBtn.onclick = () => {
  paused = !paused;
  ui.startPauseBtn.textContent = paused ? "Resume" : "Pause";
};

ui.resetBtn.onclick = () => resetAll();
ui.loadGainBtn.onclick = () => loadGainsFromCar();
ui.applyGainBtn.onclick = () => applyGainsToCar();

ui.course.onchange = () => {
  buildTrack(ui.course.value);
  if (cars.length) resetAll();
};

ui.focusCar.onchange = () => {
  focusId = Number(ui.focusCar.value) || 0;
  loadGainsFromCar();
};

ui.demoBtn.onclick = () => {
  setStatus(ui, "demo");
  buildTrack(ui.course.value);
  const n = Math.min(2, Math.max(1, Number(ui.maxCars.value || 2)));
  buildCars(demoSpecs(n));
  setApiLog(ui, `Demo generated: ${n} cars`);
  loadGainsFromCar();
};

ui.taskMode.onchange = () => {
  cars.forEach(c => c.pid.reset());
};

ui.loadBtn.onclick = async () => {
  try{
    setStatus(ui, "loading");
    setApiLog(ui, "Fetching...");
    buildTrack(ui.course.value);

    const apiUrl = ui.apiUrl.value.trim();
    const sheetName = ui.sheetName.value.trim();
    const limit = Math.min(2, Math.max(1, Number(ui.maxCars.value || 2)));

    const rows = await fetchSheetRows({apiUrl, sheetName, limit: 500});
    const specsAll = normalizeRows(rows, 9999);

    // Apply current UI course/mode globally (授業運用の基本)
    // ただし、行のCourse/Modeも使いたければここを改造できます。
    const specs = specsAll.slice(0, limit);

    buildCars(specs);

    setStatus(ui, "ready");
    setApiLog(ui, `Loaded ${specs.length} cars from sheet.\nFirst: ${specs[0]?.name ?? "-"}`);
  } catch (err){
    setStatus(ui, "error");
    setApiLog(ui, String(err));
    console.error(err);
  }
};

// transfer function display
setTransferFunction(ui, {tau:0.18, K:1.0});

// init
buildTrack(ui.course.value);
setStatus(ui, "ready");

// main loop
requestAnimationFrame(loop);

function loop(now){
  const dt = Math.min(0.05, (now - lastT)/1000);
  lastT = now;

  if (!paused && cars.length){
    acc += dt;
    while (acc >= FIXED_DT){
      simulate(FIXED_DT);
      acc -= FIXED_DT;
    }
  }

  const cameraMode = ui.cameraMode.value;
  if (cars.length) focusId = Math.max(0, Math.min(cars.length - 1, focusId));
  r3.render(cars, cameraMode, focusId, dt);

  updateTelemetry();

  requestAnimationFrame(loop);
}

function simulate(dt){
  const taskMode = ui.taskMode.value;
  for (const c of cars){
    c.step(dt, track, taskMode);
  }
}

function updateTelemetry(){
  if (!cars.length){
    ui.telemetry.textContent = "no cars";
    return;
  }
  const c = cars[Math.max(0, Math.min(cars.length-1, focusId))];
  // rank by score (lower better)
  const sorted = [...cars].sort((a,b)=>a.score-b.score);
  const rank = sorted.findIndex(x=>x===c) + 1;

 ui.telemetry.textContent =
`cars: ${cars.length}
course: ${ui.course.value}
taskMode: ${ui.taskMode.value}
focus: ${focusId} ${c.name}
lap: ${c.lap}   lapTime: ${c.lapTime.toFixed(2)} s
v: ${c.v.toFixed(2)} m/s  L: ${c.L.toFixed(2)} m  lookahead: ${c.lookahead.toFixed(1)} m
delta: ${(c.delta*180/Math.PI).toFixed(2)} deg  score: ${c.score.toFixed(2)}
pos: x=${c.x.toFixed(2)}  y=${c.y.toFixed(2)}
psi: ${c.psi.toFixed(3)} rad  (${(c.psi*180/Math.PI).toFixed(1)} deg)
rank (by score): ${rank}/${cars.length}
PID: Kp=${c.pid.kp.toFixed(3)} Ki=${c.pid.ki.toFixed(4)} Kd=${c.pid.kd.toFixed(3)}  dfHz=${c.pid.dfHz.toFixed(1)} aw=${c.pid.aw.toFixed(2)}
vNow: ${(c._vNow ?? c.v).toFixed(2)}  mu: ${(c._mu ?? 1).toFixed(2)}  off: ${(c._off ?? 0).toFixed(2)}
dist(w): ${(c._wDist ?? 0).toFixed(3)} rad/s
`;
}
