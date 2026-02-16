export function getUI(){
  const $ = (id)=>document.getElementById(id);
  return {
    statusPill: $("statusPill"),
    apiUrl: $("apiUrl"),
    sheetName: $("sheetName"),
    maxCars: $("maxCars"),
    loadBtn: $("loadBtn"),
    demoBtn: $("demoBtn"),
    apiLog: $("apiLog"),

    taskMode: $("taskMode"),
    course: $("course"),
    cameraMode: $("cameraMode"),
    focusCar: $("focusCar"),
    startPauseBtn: $("startPauseBtn"),
    resetBtn: $("resetBtn"),

    tfBox: $("tfBox"),
    telemetry: $("telemetry"),

    kpIn: document.getElementById("kpIn"),
    kiIn: document.getElementById("kiIn"),
    kdIn: document.getElementById("kdIn"),
    dfHzIn: document.getElementById("dfHzIn"),
    awIn: document.getElementById("awIn"),
    vIn: document.getElementById("vIn"),
    lookIn: document.getElementById("lookIn"),
    steerLimIn: document.getElementById("steerLimIn"),
    applyGainBtn: document.getElementById("applyGainBtn"),
    loadGainBtn: document.getElementById("loadGainBtn"),
  };
}

export function setStatus(ui, text){
  ui.statusPill.textContent = text;
}

export function setApiLog(ui, text){
  ui.apiLog.textContent = text;
}

export function setFocusList(ui, cars){
  ui.focusCar.innerHTML = "";
  cars.forEach((c, i)=>{
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `${i}: ${c.name}`;
    ui.focusCar.appendChild(opt);
  });
}

export function setTransferFunction(ui, params){
  // display-only: show concept model (straight course explanation)
  const {tau=0.18, K=1.0} = params || {};
  ui.tfBox.innerHTML = `
  $$G_{\\delta}(s)=\\frac{1}{\\tau s + 1},\\quad \\tau=${tau.toFixed(3)}$$
  $$G_{e_y}(s)\\approx \\frac{K}{s^2(\\tau s + 1)},\\quad K=${K.toFixed(2)}$$
  $$\\delta(s)=C(s)e_y(s),\\quad C(s)=K_p+\\frac{K_i}{s}+K_d s$$
  `;
}
