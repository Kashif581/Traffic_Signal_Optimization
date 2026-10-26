"""
Build the dashboard from the recordings made by traci9_record.py.

    python build_dashboard.py

What it does
  1. turns the pictures in recordings/<controller>/frames/ into video.mp4 (needs ffmpeg:
     it uses the one from  pip install imageio-ffmpeg  or an ffmpeg already on your PATH)
  2. reads recordings/<controller>/metrics.csv
  3. writes dashboard.html  (open it with a double click; keep it next to the recordings folder)

Add --rebuild-videos to make the videos again even if they are up to date.
"""
import os
import sys
import csv
import json
import glob
import shutil
import subprocess

REC_DIR = "recordings"
ORDER = ["fixed", "ql", "dqn"]          # order of the columns on the page
DEFAULT_NAMES = {"fixed": "Fixed timing", "ql": "Q-learning", "dqn": "Deep Q-learning (DQN)"}

TEMPLATE = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Traffic signal control: fixed timing vs Q-learning vs DQN</title>
<style>
  :root {
    --bg: #f4f5f8; --fg: #1b2130; --card: #ffffff; --muted: #667085; --line: #d9dde6;
    --c0: #6b7280; --c1: #d97706; --c2: #2563eb; --good: #15803d;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #11141b; --fg: #e8ebf2; --card: #1b2030; --muted: #98a2b3; --line: #2b3347;
      --c0: #9ca3af; --c1: #f59e0b; --c2: #60a5fa; --good: #4ade80;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg);
         font: 15px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  .wrap { max-width: 1280px; margin: 0 auto; padding: 20px 16px 40px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { margin: 0 0 16px; color: var(--muted); }
  .controls { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; background: var(--card);
              border: 1px solid var(--line); border-radius: 10px; padding: 10px 14px; margin-bottom: 16px; }
  .controls button { font: inherit; font-weight: 600; padding: 7px 18px; border-radius: 8px; cursor: pointer;
                     border: 1px solid var(--line); background: var(--fg); color: var(--bg); min-width: 84px; }
  .controls input[type=range] { flex: 1 1 260px; min-width: 160px; }
  .controls select { font: inherit; padding: 5px 8px; border-radius: 6px; border: 1px solid var(--line);
                     background: var(--card); color: var(--fg); }
  #clock { font-variant-numeric: tabular-nums; color: var(--muted); min-width: 150px; }
  #runs { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
  .run { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px; }
  .run h2 { font-size: 16px; margin: 0 0 8px; display: flex; align-items: center; gap: 8px; }
  .dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
  video { width: 100%; display: block; border-radius: 8px; background: #000; aspect-ratio: 4 / 5; object-fit: contain; }
  .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
  .card { border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; }
  .card .lab { display: block; font-size: 12px; color: var(--muted); }
  .card b { font-size: 20px; font-variant-numeric: tabular-nums; }
  .card.best { border-color: var(--good); }
  .card.best .lab::after { content: "  lowest"; color: var(--good); font-weight: 600; }
  .sig { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
  .chart-box { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px; margin-top: 16px; }
  .chart-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 6px; }
  .chart-head h2 { font-size: 16px; margin: 0; }
  .legend { display: flex; gap: 14px; flex-wrap: wrap; color: var(--muted); font-size: 13px; }
  .legend span { display: inline-flex; align-items: center; gap: 6px; }
  canvas { width: 100%; height: 320px; display: block; }
  .note { color: var(--muted); font-size: 13px; margin-top: 14px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Traffic signal control: same junction, same traffic</h1>
  <p class="sub" id="sub"></p>

  <div class="controls">
    <button id="play" type="button">Play</button>
    <input id="seek" type="range" min="0" max="1" value="0" step="1" aria-label="Seek">
    <span id="clock">t = 0 s</span>
    <label>Speed
      <select id="speed">
        <option value="0.5">0.5x</option>
        <option value="1" selected>1x</option>
        <option value="2">2x</option>
        <option value="4">4x</option>
      </select>
    </label>
  </div>

  <div id="runs"></div>

  <div class="chart-box">
    <div class="chart-head">
      <h2 id="chartTitle"></h2>
      <div class="legend" id="legend"></div>
      <select id="metric" aria-label="Chart metric">
        <option value="queue">Vehicles at stop lines</option>
        <option value="halting">Stopped vehicles</option>
        <option value="cum">Cumulative reward</option>
      </select>
    </div>
    <canvas id="chart"></canvas>
  </div>

  <p class="note">"Vehicles at stop lines" counts every car inside the 8 detectors (the last 25 m before each stop line).
  The reward is minus that count at every step, so a higher (less negative) cumulative reward is better.
  The agents were recorded after training, with no exploration and no learning.</p>
</div>

<script>
const DATA = __DATA__;
const runs = DATA.runs, fps = DATA.fps, FE = DATA.frame_every, SL = DATA.step_length;
const secPerFrame = FE * SL;                                   // simulated seconds per picture
const nFrames = Math.min.apply(null, runs.map(r => r.queue.length));
const duration = nFrames / fps;                                // video length in seconds
const totalSim = nFrames * secPerFrame;                        // simulated seconds shown
const PHASES = ["Road B green", "Yellow", "All red", "Road A green", "Yellow", "All red"];
const PHASE_COLORS = ["#16a34a", "#eab308", "#dc2626", "#16a34a", "#eab308", "#dc2626"];
const SMOOTH = Math.max(1, Math.round(20 / secPerFrame));      // 20 s moving average

function movingAvg(a, w) {
  const out = []; let s = 0;
  for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= w) s -= a[i - w]; out.push(s / Math.min(i + 1, w)); }
  return out;
}
function prefixMean(a) {
  const out = []; let s = 0;
  a.forEach((v, i) => { s += v; out.push(s / (i + 1)); });
  return out;
}
runs.forEach(r => { r.queueSm = movingAvg(r.queue, SMOOTH); r.haltSm = movingAvg(r.halting, SMOOTH); r.avgQ = prefixMean(r.queue); });

document.getElementById("sub").textContent =
  "Seed " + DATA.seed + ", " + Math.round(totalSim) + " simulated seconds. " +
  "The numbers and the chart follow the video.";

// ---- build one column per controller ----
const runsEl = document.getElementById("runs");
const legendEl = document.getElementById("legend");
runs.forEach((r, i) => {
  const s = document.createElement("section");
  s.className = "run";
  s.innerHTML =
    '<h2><span class="dot" style="background:var(--c' + i + ')"></span>' + r.name + '</h2>' +
    '<video muted playsinline preload="auto" src="' + r.video + '"></video>' +
    '<div class="cards">' +
      '<div class="card"><span class="lab">Vehicles at stop lines</span><b data-k="q">0</b></div>' +
      '<div class="card" data-k="avgcard"><span class="lab">Average so far</span><b data-k="avg">0</b></div>' +
      '<div class="card"><span class="lab">Cumulative reward</span><b data-k="cum">0</b></div>' +
      '<div class="card"><span class="lab">Signal</span><b data-k="ph" style="font-size:15px">-</b></div>' +
    '</div>';
  runsEl.appendChild(s);
  r.el = s;
  r.vid = s.querySelector("video");
  r.q = s.querySelector('[data-k="q"]');
  r.avg = s.querySelector('[data-k="avg"]');
  r.avgCard = s.querySelector('[data-k="avgcard"]');
  r.cumEl = s.querySelector('[data-k="cum"]');
  r.ph = s.querySelector('[data-k="ph"]');
  const l = document.createElement("span");
  l.innerHTML = '<span class="dot" style="background:var(--c' + i + ')"></span>' + r.name;
  legendEl.appendChild(l);
});
const vids = runs.map(r => r.vid);

// ---- controls ----
const playBtn = document.getElementById("play");
const seek = document.getElementById("seek");
const clock = document.getElementById("clock");
const speedSel = document.getElementById("speed");
const metricSel = document.getElementById("metric");
seek.max = nFrames - 1;
let playing = false, t = 0, dragging = false;

function setTime(x) {
  t = Math.max(0, Math.min(duration - 0.001, x));
  vids.forEach(v => { try { v.currentTime = t; } catch (e) {} });
}
function play() {
  if (t >= duration - 0.06) setTime(0);
  playing = true;
  vids.forEach(v => { v.playbackRate = parseFloat(speedSel.value); const p = v.play(); if (p && p.catch) p.catch(() => {}); });
  playBtn.textContent = "Pause";
}
function pause() {
  playing = false;
  vids.forEach(v => v.pause());
  playBtn.textContent = "Play";
}
playBtn.addEventListener("click", () => playing ? pause() : play());
speedSel.addEventListener("change", () => vids.forEach(v => { v.playbackRate = parseFloat(speedSel.value); }));
seek.addEventListener("input", () => { dragging = true; setTime(parseFloat(seek.value) / fps); });
seek.addEventListener("change", () => { dragging = false; });
metricSel.addEventListener("change", () => render());
document.addEventListener("keydown", e => { if (e.code === "Space" && e.target === document.body) { e.preventDefault(); playBtn.click(); } });

// ---- chart ----
const METRICS = {
  queue:   { title: "Vehicles at stop lines (20 s average)", key: "queueSm" },
  halting: { title: "Stopped vehicles at stop lines (20 s average)", key: "haltSm" },
  cum:     { title: "Cumulative reward (higher is better)", key: "cum" }
};
const canvas = document.getElementById("chart");

function drawChart(idx) {
  const m = METRICS[metricSel.value];
  document.getElementById("chartTitle").textContent = m.title;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const cs = getComputedStyle(document.documentElement);
  const muted = cs.getPropertyValue("--muted").trim(), grid = cs.getPropertyValue("--line").trim();

  let lo = Infinity, hi = -Infinity;
  runs.forEach(r => r[m.key].forEach(v => { if (v < lo) lo = v; if (v > hi) hi = v; }));
  if (m.key !== "cum") lo = Math.min(lo, 0);
  if (hi === lo) hi = lo + 1;
  const pad = { l: 58, r: 12, t: 10, b: 26 };
  const X = i => pad.l + (w - pad.l - pad.r) * i / Math.max(1, nFrames - 1);
  const Y = v => pad.t + (h - pad.t - pad.b) * (1 - (v - lo) / (hi - lo));

  ctx.font = "12px system-ui, sans-serif";
  ctx.lineWidth = 1;
  for (let k = 0; k <= 4; k++) {
    const v = lo + (hi - lo) * k / 4, y = Y(v);
    ctx.strokeStyle = grid; ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
    ctx.fillStyle = muted; ctx.textAlign = "right";
    ctx.fillText(Math.abs(hi) >= 1000 ? Math.round(v).toLocaleString() : v.toFixed(1), pad.l - 6, y + 4);
  }
  ctx.textAlign = "center"; ctx.fillStyle = muted;
  for (let k = 0; k <= 5; k++) {
    const i = Math.round((nFrames - 1) * k / 5);
    ctx.fillText(Math.round(i * secPerFrame) + " s", X(i), h - 8);
  }
  runs.forEach((r, ri) => {
    ctx.strokeStyle = cs.getPropertyValue("--c" + ri).trim(); ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i <= idx; i++) { const x = X(i), y = Y(r[m.key][i]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.stroke();
  });
  ctx.strokeStyle = muted; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(X(idx), pad.t); ctx.lineTo(X(idx), h - pad.b); ctx.stroke();
  ctx.setLineDash([]);
}

// ---- update everything for the current time ----
function render() {
  const idx = Math.max(0, Math.min(nFrames - 1, Math.floor(t * fps)));
  let best = Infinity;
  runs.forEach(r => { if (r.avgQ[idx] < best) best = r.avgQ[idx]; });
  runs.forEach(r => {
    r.q.textContent = r.queue[idx];
    r.avg.textContent = r.avgQ[idx].toFixed(1);
    r.cumEl.textContent = Math.round(r.cum[idx]).toLocaleString();
    const p = r.phase[idx];
    r.ph.innerHTML = '<span class="sig" style="background:' + PHASE_COLORS[p] + '"></span>' + PHASES[p];
    r.avgCard.classList.toggle("best", runs.length > 1 && idx > 0 && r.avgQ[idx] === best);
  });
  clock.textContent = "t = " + Math.round(idx * secPerFrame) + " s / " + Math.round(totalSim) + " s";
  if (!dragging) seek.value = idx;
  drawChart(idx);
}

function loop() {
  if (playing) {
    t = vids[0].currentTime;                                    // the first video is the clock
    for (let i = 1; i < vids.length; i++) {
      if (Math.abs(vids[i].currentTime - t) > 0.2) vids[i].currentTime = t;
    }
    if (t >= duration - 0.06) pause();
  }
  render();
  requestAnimationFrame(loop);
}
setTime(0);
requestAnimationFrame(loop);
</script>
</body>
</html>
"""


def find_ffmpeg():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        pass
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    sys.exit("ffmpeg was not found. Install it with:  pip install imageio-ffmpeg")


def build_video(ffmpeg, run_dir, ext, fps, force):
    video = os.path.join(run_dir, "video.mp4")
    csv_path = os.path.join(run_dir, "metrics.csv")
    if not force and os.path.exists(video) and os.path.getmtime(video) > os.path.getmtime(csv_path):
        print("  video.mp4 is up to date")
        return video
    pattern = os.path.join(run_dir, "frames", f"%05d.{ext}")
    cmd = [ffmpeg, "-y", "-loglevel", "error", "-framerate", str(fps), "-i", pattern,
           "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",       # H.264 needs even width and height
           "-c:v", "libx264", "-preset", "medium", "-crf", "18",      # crf: lower = sharper (bigger file)
           "-pix_fmt", "yuv420p", "-movflags", "+faststart", video]
    print("  making video.mp4 ...")
    subprocess.run(cmd, check=True)
    return video


def read_metrics(run_dir, frame_every, n_frames):
    """Keep the CSV row that belongs to each picture (step = 0, frame_every, 2*frame_every, ...)."""
    cols = {"queue": [], "halting": [], "inNet": [], "arrived": [], "cum": [], "phase": []}
    with open(os.path.join(run_dir, "metrics.csv"), newline="") as f:
        for row in csv.DictReader(f):
            if int(row["step"]) % frame_every == 0 and len(cols["queue"]) < n_frames:
                cols["queue"].append(int(row["total_queue"]))
                cols["halting"].append(int(row["halting"]))
                cols["inNet"].append(int(row["in_network"]))
                cols["arrived"].append(int(row["arrived_total"]))
                cols["cum"].append(float(row["cumulative_reward"]))
                cols["phase"].append(int(row["phase"]))
    return cols


def main():
    force = "--rebuild-videos" in sys.argv
    ffmpeg = None
    runs = []
    for key in ORDER:
        run_dir = os.path.join(REC_DIR, key)
        meta_path = os.path.join(run_dir, "meta.json")
        if os.path.exists(meta_path):
            with open(meta_path) as f:
                meta = json.load(f)
        elif os.path.isdir(os.path.join(run_dir, "frames")) and os.path.exists(os.path.join(run_dir, "metrics.csv")):
            # The recording was stopped before it wrote meta.json: use the default settings of traci9_record.py
            ext = "jpg" if glob.glob(os.path.join(run_dir, "frames", "*.jpg")) else "png"
            print(f"[{key}] meta.json is missing (recording stopped early?). Using the default settings.")
            meta = {"name": DEFAULT_NAMES[key], "step_length": 0.1, "frame_every": 5,
                    "frame_ext": ext, "fps": 20, "seed": 42}
        else:
            print(f"[skip] {key}: nothing recorded in {os.path.abspath(run_dir)}")
            continue
        ext = meta["frame_ext"]
        n_frames = len(glob.glob(os.path.join(run_dir, "frames", f"*.{ext}")))
        if n_frames == 0:
            print(f"[skip] {key}: no pictures in {run_dir}/frames (was it recorded with --no-frames?)")
            continue
        print(f"[{key}] {meta['name']}: {n_frames} pictures")
        ffmpeg = ffmpeg or find_ffmpeg()
        build_video(ffmpeg, run_dir, ext, meta["fps"], force)
        cols = read_metrics(run_dir, meta["frame_every"], n_frames)
        runs.append({"key": key, "name": meta["name"],
                     "video": f"{REC_DIR}/{key}/video.mp4".replace("\\", "/"), **cols,
                     "_meta": meta})

    if not runs:
        sys.exit("Nothing to show. Record at least one controller first:  python traci9_record.py fixed")

    first = runs[0]["_meta"]
    data = {"fps": first["fps"], "frame_every": first["frame_every"],
            "step_length": first["step_length"], "seed": first["seed"],
            "runs": [{k: v for k, v in r.items() if k != "_meta"} for r in runs]}

    payload = json.dumps(data, separators=(",", ":")).replace("</", "<\\/")
    html = TEMPLATE.replace("__DATA__", payload)
    with open("dashboard.html", "w", encoding="utf-8") as f:
        f.write(html)
    print("\nDone. Open dashboard.html (it must stay next to the 'recordings' folder).")


if __name__ == "__main__":
    main()