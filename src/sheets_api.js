export async function fetchSheetRows({apiUrl, sheetName, limit=150}){
  if (!apiUrl) throw new Error("API URL is empty");
  const url = new URL(apiUrl);
  url.searchParams.set("sheet", sheetName || "フォームの回答 1");
  url.searchParams.set("limit", String(limit));

  const res = await fetch(url.toString(), {method:"GET"});
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "API error");
  return data.rows;
}

export function normalizeRows(rows, maxCars=150){
  // Convert sheet rows -> internal specs
  const out = [];
  for (const r of rows.slice(0, maxCars)){
    out.push({
      name: r.Name ?? "car",
      team: r.Team ?? "",
      mode: (r.Mode ?? "PID").toUpperCase(),
      course: (r.Course ?? "OVAL").toUpperCase(),

      kp: num(r.Kp, 2.0),
      ki: num(r.Ki, 0.0),
      kd: num(r.Kd, 0.8),
      dfHz: num(r.DfHz, 10),
      aw: num(r.AW, 0.5),

      v: num(r.V, 10),
      lookahead: num(r.Lookahead, 12),
      steerLimitDeg: num(r.SteerLimitDeg, 22),
      L: num(r.L, 2.6),
    });
  }
  return out;
}

function num(x, defVal){
  const n = Number(x);
  return Number.isFinite(n) ? n : defVal;
}
