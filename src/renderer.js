import * as THREE from "https://unpkg.com/three@0.161.0/build/three.module.js";

function makeCarBodyGeometry(){
  // ボンネット（低い箱）
  const hood = new THREE.BoxGeometry(3.0, 0.7, 1.6);
  hood.translate(0.2, 0.35, 0);

  // キャビン（高い箱）
  const cabin = new THREE.BoxGeometry(1.6, 0.9, 1.4);
  cabin.translate(-0.8, 0.85, 0);

  // スポイラー（薄い板）
  const spoiler = new THREE.BoxGeometry(0.9, 0.15, 1.7);
  spoiler.translate(-1.8, 1.05, 0);

  // 3つを1つのBufferGeometryへ結合（手動merge）
  const g = new THREE.BufferGeometry();
  const geometries = [hood, cabin, spoiler].map(x => x.toNonIndexed());

  // concatenate attributes
  const pos = [];
  const nor = [];
  for (const gg of geometries){
    const p = gg.getAttribute("position").array;
    const n = gg.getAttribute("normal").array;
    for (let i=0;i<p.length;i++) pos.push(p[i]);
    for (let i=0;i<n.length;i++) nor.push(n[i]);
  }
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.computeBoundingSphere();
  return g;
}

function colorFromIndex(i){
  // いい感じに散るHSV
  const c = new THREE.Color();
  c.setHSL((i * 0.6180339887) % 1, 0.75, 0.55);
  return c;
}

export class Renderer3D {
  constructor(canvas){
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({canvas, antialias:true});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0b10);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
    this.camPos = new THREE.Vector3(0, 12, 24);
    this.camLook = new THREE.Vector3(0, 0, 0);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x222244, 0.8);
    this.scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(30, 60, 40);
    this.scene.add(dir);

    // ground
    const g = new THREE.PlaneGeometry(2000, 2000);
    const m = new THREE.MeshStandardMaterial({color:0x101018, roughness:1, metalness:0});
    const ground = new THREE.Mesh(g, m);
    ground.rotation.x = -Math.PI/2;
    this.scene.add(ground);

    // track line group
    this.trackGroup = new THREE.Group();
    this.scene.add(this.trackGroup);

    // instanced cars (lazy init)
    this.carMesh = null;
    this.carCount = 0;
    // ★追加：最大台数と退避座標
    this.maxInstances = 1;
    this.offscreen = new THREE.Vector3(0, -100000, 0);

    window.addEventListener("resize", ()=>this.resize());
    this.resize();
  }

  resize(){
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w/h;
    this.camera.updateProjectionMatrix();
  }

    setTrack(track){
    // clear old
    while (this.trackGroup.children.length) {
      const obj = this.trackGroup.children[0];
      this.trackGroup.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    }

    if (!track || !track.samples || track.samples.length < 2) {
      console.warn("setTrack: invalid track");
      return;
    }

    const lane = track.laneW;

    // --- centerline (CLOSED) ---
    const center = track.samples.map(p => new THREE.Vector3(p.x, 0.05, -p.y));
    if (track.closed) center.push(center[0].clone());
    center.push(center[0].clone()); // ★閉じる
    const centerGeo = new THREE.BufferGeometry().setFromPoints(center);
    const centerMat = new THREE.LineBasicMaterial({color:0xffffff});
    this.trackGroup.add(new THREE.Line(centerGeo, centerMat));

    // --- left boundary (CLOSED) ---
    const left = track.samples.map(p => new THREE.Vector3(
      p.x + lane*p.nx, 0.05, -(p.y + lane*p.ny)
    ));
    if (track.closed) left.push(left[0].clone());
    left.push(left[0].clone()); // ★閉じる
    const leftGeo = new THREE.BufferGeometry().setFromPoints(left);
    const leftMat = new THREE.LineBasicMaterial({color:0x2a2a2a});
    this.trackGroup.add(new THREE.Line(leftGeo, leftMat));

    // --- right boundary (CLOSED) ---
    const right = track.samples.map(p => new THREE.Vector3(
      p.x - lane*p.nx, 0.05, -(p.y - lane*p.ny)
    ));
    if (track.closed) right.push(right[0].clone());
    right.push(right[0].clone()); // ★閉じる
    const rightGeo = new THREE.BufferGeometry().setFromPoints(right);
    const rightMat = new THREE.LineBasicMaterial({color:0x2a2a2a});
    this.trackGroup.add(new THREE.Line(rightGeo, rightMat));
  }

    setCars(count){
    this.carCount = count;

    // 初回だけ作る（容量 maxInstances で固定）
    if (!this.carMesh) {
      const geom = makeCarBodyGeometry();
      // ★車ごとの色を有効にする
      const mat  = new THREE.MeshStandardMaterial({
      color: 0xffffff,   // ← 白固定
      roughness: 0.35,
      metalness: 0.25
    });
      this.carMesh = new THREE.InstancedMesh(geom, mat, this.maxInstances);
      this.carMesh.frustumCulled = false;
      this.scene.add(this.carMesh);
      this.dummy = new THREE.Object3D();

      // ★全インスタンスを最初に退避しておく（原点に出ないように）
      for (let i=0; i<this.maxInstances; i++){
        this.dummy.position.copy(this.offscreen);
        this.dummy.rotation.set(0,0,0);
        this.dummy.updateMatrix();
        this.carMesh.setMatrixAt(i, this.dummy.matrix);
      }
      this.carMesh.instanceMatrix.needsUpdate = true;
    }

    // 表示する台数だけ count を変更
    this.carMesh.count = Math.max(0, Math.min(this.maxInstances, count));
  }


  render(cars, cameraMode, focusId, dt){
    const n = cars ? cars.length : 0;

    // ★台数設定（0でもOK）
    this.setCars(n);

    // ★使う分だけ更新
    for (let i=0; i<n; i++){
      const c = cars[i];
      this.dummy.position.set(c.x, 0.6, -c.y);
      this.dummy.rotation.set(0, c.psi, 0);
      this.dummy.updateMatrix();
      this.carMesh.setMatrixAt(i, this.dummy.matrix);
      this.carMesh.setColorAt(i, colorFromIndex(i));
      this.carMesh.instanceMatrix.needsUpdate = true;
      if (this.carMesh.instanceColor) this.carMesh.instanceColor.needsUpdate = true;
    }

    // ★余った分は必ず退避（これが「真ん中の止まった車」を消す決定打）
    for (let i=n; i<this.maxInstances; i++){
      this.dummy.position.copy(this.offscreen);
      this.dummy.rotation.set(0,0,0);
      this.dummy.updateMatrix();
      this.carMesh.setMatrixAt(i, this.dummy.matrix);
      this.carMesh.setColorAt(i, colorFromIndex(i));
      this.carMesh.instanceMatrix.needsUpdate = true;
      if (this.carMesh.instanceColor) this.carMesh.instanceColor.needsUpdate = true;
    }

    this.carMesh.instanceMatrix.needsUpdate = true;

    this.updateCamera(cars, cameraMode, focusId, dt);
    this.renderer.render(this.scene, this.camera);
  }

  updateCamera(cars, cameraMode, focusId, dt){

     // ★追加：車が0台なら固定カメラで終了（落ちない）
    if (!cars || cars.length === 0) {
      const desiredPos = new THREE.Vector3(0, 90, 140);
      const desiredLook= new THREE.Vector3(0, 0, 0);
      this.smoothCamera(desiredPos, desiredLook, dt, 3);
      this.camera.fov = 50;
      this.camera.updateProjectionMatrix();
      return;
    }

    const focus = cars[Math.max(0, Math.min(cars.length-1, focusId))];
    const targetPos = new THREE.Vector3(focus.x, 0.6, -focus.y);

    if (cameraMode === "TOP"){
      const desiredPos = targetPos.clone().add(new THREE.Vector3(0, 120, 0));
      const desiredLook= targetPos.clone();
      this.smoothCamera(desiredPos, desiredLook, dt, 6);
      this.camera.fov = 55;
      this.camera.updateProjectionMatrix();
      return;
    }

    if (cameraMode === "FIXED"){
      const desiredPos = new THREE.Vector3(0, 70, 120);
      const desiredLook= new THREE.Vector3(0, 0, 0);
      this.smoothCamera(desiredPos, desiredLook, dt, 2.5);
      this.camera.fov = 50;
      this.camera.updateProjectionMatrix();
      return;
    }

    // CHASE
    const forward = new THREE.Vector3(Math.cos(focus.psi), 0, -Math.sin(focus.psi));
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    const speed = focus.v;

    const backDist = 10 + 0.6*speed;
    const height = 4 + 0.15*speed;
    const side = 1.2;

    const desiredPos = targetPos.clone()
      .addScaledVector(forward, -backDist)
      .addScaledVector(new THREE.Vector3(0,1,0), height)
      .addScaledVector(right, side);

    const desiredLook = targetPos.clone().addScaledVector(forward, 10);

    this.smoothCamera(desiredPos, desiredLook, dt, 8);
    this.camera.fov = 55 + 0.7*speed;
    this.camera.updateProjectionMatrix();
  }

  smoothCamera(desiredPos, desiredLook, dt, stiffness){
    const k = 1 - Math.exp(-stiffness * dt);
    this.camPos.lerp(desiredPos, k);
    this.camLook.lerp(desiredLook, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }
}
