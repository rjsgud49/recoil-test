import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * 380 BPM Click Trainer – single-file React component
 * - Adjustable BPM (default 380)
 * - Duration & 3-2-1 countdown, auto stop
 * - Visual pulse metronome + optional beep (WebAudio)
 * - Left-click or Space to register hits
 * - Optional “RMB gate” (accept hits only while right mouse is held)
 * - Real-time CPS, estimated BPM, hit window scoring, summary & log
 * - No Tailwind required (scoped <style>)
 *
 * Drop this into a Vite + React project as src/App.jsx/tsx and run.
 */

export default function App() {
  // ====== SETTINGS ======
  const [bpm, setBpm] = useState(380);
  const [durationSec, setDurationSec] = useState(30);
  const [countdownSec, setCountdownSec] = useState(3);
  const [hitWindowMs, setHitWindowMs] = useState(120); // max timing error to count as a hit
  const [beepEnabled, setBeepEnabled] = useState(true);
  const [visualEnabled, setVisualEnabled] = useState(true);
  const [rmbGate, setRmbGate] = useState(false);

  // ====== RUNTIME STATE ======
  const [isCountingDown, setIsCountingDown] = useState(false);
  const [countdown, setCountdown] = useState(countdownSec);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);

  // Stats & log
  const [hits, setHits] = useState([]); // {t: ms, err: ms, rating: string, beatIdx: number}
  const [misses, setMisses] = useState(0);

  // ====== TIMING REFS ======
  const startTimeRef = useRef(0); // performance.now() when session begins
  const endTimeRef = useRef(0);
  const rafRef = useRef(0);

  // For metronome scheduling
  const beatIdxRef = useRef(0);
  const nextBeatTimerRef = useRef(/** @type {number | null} */(null));
  const audioRef = useRef(/** @type {AudioContext | null} */(null));

  // Input state
  const rmbDownRef = useRef(false);
  const recentClicksRef = useRef(/** @type {number[]} */([])); // timestamps for CPS/BPM estimation

  const intervalMs = useMemo(() => 60000 / bpm, [bpm]);
  const targetCPS = useMemo(() => bpm / 60, [bpm]);

  // ====== AUDIO ======
  const ensureAudio = useCallback(() => {
    if (!audioRef.current) {
      try {
        audioRef.current = new (window.AudioContext || (window).webkitAudioContext)();
      } catch (e) {
        console.warn("WebAudio unavailable", e);
      }
    }
    return audioRef.current;
  }, []);

  const beep = useCallback((when = 0) => {
    if (!beepEnabled) return;
    const ac = ensureAudio();
    if (!ac) return;
    const t = when || ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "square";
    osc.frequency.value = 880; // crisp tick
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ac.destination);
    const DUR = 0.03; // 30ms pop
    osc.start(t);
    osc.stop(t + DUR);
  }, [beepEnabled, ensureAudio]);

  // ====== METRONOME SCHEDULER ======
  const scheduleNextBeat = useCallback(() => {
    if (!running) return;
    const ac = audioRef.current;
    const nowMs = performance.now();
    const start = startTimeRef.current;
    const idx = beatIdxRef.current;
    const beatTimeMs = start + intervalMs * idx;

    // If we're late, catch up
    let delayMs = beatTimeMs - nowMs;
    if (delayMs < -intervalMs) {
      // skip ahead to current beat
      const lateBeats = Math.floor((-delayMs) / intervalMs) + 1;
      beatIdxRef.current += lateBeats;
      return scheduleNextBeat();
    }

    if (delayMs < 0) delayMs = 0;

    // schedule beep
    if (beepEnabled) {
      const acNow = ac ? ac.currentTime : 0;
      const scheduleAt = ac ? acNow + delayMs / 1000 : 0;
      beep(scheduleAt);
    }

    // schedule next callback exactly one beat later
    const id = window.setTimeout(() => {
      beatIdxRef.current += 1;
      scheduleNextBeat();
    }, delayMs + intervalMs);
    nextBeatTimerRef.current = id;
  }, [intervalMs, beep, beepEnabled, running]);

  // ====== ANIMATION RAF (for pulse/progress) ======
  const [now, setNow] = useState(0);
  useEffect(() => {
    function loop() {
      setNow(performance.now());
      rafRef.current = requestAnimationFrame(loop);
    }
    if (running || isCountingDown) {
      rafRef.current = requestAnimationFrame(loop);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [running, isCountingDown]);

  // ====== CLICK HANDLING ======
  const registerClick = useCallback((evtTimeMs) => {
    if (!running) return;
    if (rmbGate && !rmbDownRef.current) return; // require RMB held

    const start = startTimeRef.current;
    const idx = Math.round((evtTimeMs - start) / intervalMs);
    const ideal = start + idx * intervalMs;
    const err = evtTimeMs - ideal; // +late, -early

    // Score
    const aerr = Math.abs(err);
    let rating = "MISS";
    if (aerr <= 20) rating = "PERFECT";
    else if (aerr <= 40) rating = "GREAT";
    else if (aerr <= 80) rating = "GOOD";
    else if (aerr <= hitWindowMs) rating = "OK";
    else {
      setMisses((m) => m + 1);
    }

    if (aerr <= hitWindowMs) {
      setHits((list) => {
        const next = [...list, { t: evtTimeMs, err, rating, beatIdx: idx }];
        // limit log length
        return next.slice(-200);
      });
    }

    // Track for CPS/BPM estimates
    recentClicksRef.current.push(evtTimeMs);
    const cutoff = evtTimeMs - 3000; // last 3s
    while (recentClicksRef.current.length && recentClicksRef.current[0] < cutoff) {
      recentClicksRef.current.shift();
    }
  }, [hitWindowMs, intervalMs, rmbGate, running]);

  // Global listeners
  useEffect(() => {
    const onMouseDown = (e) => {
      if (e.button === 2) rmbDownRef.current = true;
      if (e.button === 0) registerClick(performance.now());
    };
    const onMouseUp = (e) => {
      if (e.button === 2) rmbDownRef.current = false;
    };
    const onContextMenu = (e) => {
      if (rmbGate) e.preventDefault();
    };
    const onKeyDown = (e) => {
      if (e.repeat) return;
      if (e.code === "Space") {
        e.preventDefault();
        registerClick(performance.now());
      }
    };

    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [registerClick, rmbGate]);

  // ====== SESSION CONTROL ======
  const resetAll = useCallback(() => {
    setRunning(false);
    setIsCountingDown(false);
    setFinished(false);
    setHits([]);
    setMisses(0);
    startTimeRef.current = 0;
    endTimeRef.current = 0;
    beatIdxRef.current = 0;
    if (nextBeatTimerRef.current) window.clearTimeout(nextBeatTimerRef.current);
  }, []);

  const start = useCallback(async () => {
    resetAll();
    setCountdown(countdownSec);
    setIsCountingDown(true);

    // Warm up AudioContext (user gesture)
    if (beepEnabled) {
      const ac = ensureAudio();
      if (ac && ac.state === "suspended") await ac.resume();
    }

    // 3-2-1 countdown
    const t0 = performance.now();
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(id);
          setIsCountingDown(false);
          // Begin session
          const startMs = performance.now();
          startTimeRef.current = startMs;
          endTimeRef.current = startMs + durationSec * 1000;
          beatIdxRef.current = 0;
          setRunning(true);

          // Schedule first beat at exact start
          if (beepEnabled) beep();
          scheduleNextBeat();

          // Auto stop
          const endId = setTimeout(() => {
            setRunning(false);
            setFinished(true);
          }, durationSec * 1000);
          (window)._trainerEndId && clearTimeout((window)._trainerEndId);
          (window)._trainerEndId = endId;
        }
        return c - 1;
      });
    }, 1000);

    // flash countdown sync beep (optional)
    if (beepEnabled) {
      // 3 beeps in the countdown second edges
      setTimeout(() => beep(), 100);
      setTimeout(() => beep(), 1100);
      setTimeout(() => beep(), 2100);
    }
  }, [beep, beepEnabled, countdownSec, durationSec, resetAll, scheduleNextBeat]);

  const stop = useCallback(() => {
    setRunning(false);
    setFinished(true);
    if (nextBeatTimerRef.current) window.clearTimeout(nextBeatTimerRef.current);
  }, []);

  // ====== METRICS ======
  const elapsedMs = running ? Math.max(0, now - startTimeRef.current) : finished ? endTimeRef.current - startTimeRef.current : 0;
  const progress = useMemo(() => {
    const total = durationSec * 1000;
    return total ? Math.min(1, elapsedMs / total) : 0;
  }, [elapsedMs, durationSec]);

  const cps = useMemo(() => {
    const arr = recentClicksRef.current;
    if (arr.length < 2) return 0;
    const span = (arr[arr.length - 1] - arr[0]) / 1000;
    if (span <= 0) return 0;
    return arr.length / span;
  }, [now]);

  const estBpm = useMemo(() => Math.round(cps * 60), [cps]);

  const summary = useMemo(() => {
    if (!hits.length && !misses) return null;
    const abs = hits.map((h) => Math.abs(h.err));
    const mean = abs.length ? (abs.reduce((a, b) => a + b, 0) / abs.length) : 0;
    const sorted = [...abs].sort((a, b) => a - b);
    const p95 = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0;
    const counts = hits.reduce((m, h) => { m[h.rating] = (m[h.rating] || 0) + 1; return m; }, {});
    const total = hits.length + misses;
    const acc = total ? Math.round((hits.length / total) * 100) : 0;
    return { mean, p95, counts, acc, total };
  }, [hits, misses]);

  // ====== RENDER ======
  const currentBeatPhase = useMemo(() => {
    if (!running) return 0;
    const t = performance.now() - startTimeRef.current;
    const phase = (t % intervalMs) / intervalMs; // 0..1
    return phase;
  }, [running, intervalMs, now]);

  return (
    <div style={styles.page}>
      <style>{css}</style>
      <div style={styles.container}>
        {/* LEFT: Controls */}
        <section style={styles.leftPanel}>
          <h2>🎯 380 BPM Click Trainer</h2>
          <div className="control">
            <label>Target BPM</label>
            <div className="row">
              <input
                type="range"
                min={60}
                max={600}
                value={bpm}
                onChange={(e) => setBpm(parseInt(e.target.value || "380", 10))}
              />
              <input
                type="number"
                min={1}
                max={999}
                value={bpm}
                onChange={(e) => setBpm(Number(e.target.value))}
                style={{ width: 80 }}
              />
              <button onClick={() => setBpm(380)}>380</button>
              <span className="muted">Target CPS: {targetCPS.toFixed(2)}</span>
            </div>
          </div>

          <div className="control">
            <label>Duration</label>
            <div className="row">
              <select value={durationSec} onChange={(e) => setDurationSec(Number(e.target.value))}>
                {[10, 20, 30, 45, 60, 90].map((s) => (
                  <option key={s} value={s}>{s}s</option>
                ))}
              </select>
              <label style={{ marginLeft: 12 }}>Countdown</label>
              <select value={countdownSec} onChange={(e) => setCountdownSec(Number(e.target.value))}>
                {[0, 1, 2, 3, 5].map((s) => (
                  <option key={s} value={s}>{s}s</option>
                ))}
              </select>
            </div>
          </div>

          <div className="control">
            <label>Hit Window (ms)</label>
            <div className="row">
              <input
                type="range"
                min={30}
                max={200}
                value={hitWindowMs}
                onChange={(e) => setHitWindowMs(parseInt(e.target.value, 10))}
              />
              <span>{hitWindowMs} ms</span>
            </div>
          </div>

          <div className="control row">
            <label className="row"><input type="checkbox" checked={beepEnabled} onChange={(e) => setBeepEnabled(e.target.checked)} /> Beep</label>
            <label className="row"><input type="checkbox" checked={visualEnabled} onChange={(e) => setVisualEnabled(e.target.checked)} /> Visual</label>
            <label className="row"><input type="checkbox" checked={rmbGate} onChange={(e) => setRmbGate(e.target.checked)} /> RMB Gate</label>
          </div>

          <div className="row gap">
            {!running && !isCountingDown && (
              <button className="primary" onClick={start}>Start</button>
            )}
            {(running || isCountingDown) && (
              <button className="danger" onClick={stop}>Stop</button>
            )}
            {finished && (
              <button onClick={resetAll}>Reset</button>
            )}
          </div>

          <p className="muted" style={{ marginTop: 10 }}>
            Tip: 좌클릭 또는 <b>Space</b>로 히트. {rmbGate ? "오른쪽 버튼을 누르고 있어야 인식합니다." : ""}
          </p>
        </section>

        {/* CENTER: Stage */}
        <section style={styles.stage}>
          {!running && !isCountingDown && (
            <div className="centerNote">Ready? Click <b>Start</b></div>
          )}
          {isCountingDown && (
            <div className="countdown">{countdown}</div>
          )}

          {running && visualEnabled && (
            <div className="metronome">
              <div
                className="pulse"
                style={{ transform: `scale(${0.9 + 0.2 * Math.cos(2 * Math.PI * currentBeatPhase)})` }}
              />
              <div className="progress">
                <div className="bar" style={{ width: `${(progress * 100).toFixed(1)}%` }} />
              </div>
            </div>
          )}

          {/* Big numbers: CPS & BPM */}
          <div className="bigStats">
            <div>
              <div className="label">CPS</div>
              <div className="value">{cps.toFixed(2)}</div>
            </div>
            <div>
              <div className="label">Est. BPM</div>
              <div className="value">{estBpm}</div>
            </div>
          </div>
        </section>

        {/* RIGHT: Live / Summary */}
        <section style={styles.rightPanel}>
          <h3>Live</h3>
          <ul className="liveList">
            {hits.slice(-12).reverse().map((h, i) => (
              <li key={i} className={`chip ${h.rating.toLowerCase()}`}>
                Beat {h.beatIdx} <span>{h.err > 0 ? "+" : ""}{Math.round(h.err)} ms</span> <b>{h.rating}</b>
              </li>
            ))}
          </ul>

          <h3 style={{ marginTop: 16 }}>Summary</h3>
          {summary ? (
            <div className="summary">
              <div className="row space">
                <div>Accuracy</div>
                <b>{summary.acc}%</b>
              </div>
              <div className="row space">
                <div>Mean Abs Err</div>
                <b>{summary.mean.toFixed(1)} ms</b>
              </div>
              <div className="row space">
                <div>p95 Abs Err</div>
                <b>{summary.p95?.toFixed(1) || 0} ms</b>
              </div>
              <div className="badges">
                {Object.entries(summary.counts).map(([k, v]) => (
                  <span key={k} className={`badge ${k.toLowerCase()}`}>{k}: {v as any}</span>
                ))}
                {misses ? <span className="badge miss">MISS: {misses}</span> : null}
              </div>
            </div>
          ) : (
            <div className="muted">결과는 세션이 끝나면 요약됩니다.</div>
          )}
        </section>
      </div>
    </div>
  );
}

// ====== STYLES ======
const styles = {
  page: {
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Noto Sans KR, Ubuntu, Cantarell, 'Helvetica Neue', Arial, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif",
    background: "#0c0d10",
    color: "#eaeef2",
    minHeight: "100vh",
    padding: 20,
  },
  container: {
    display: "grid",
    gridTemplateColumns: "320px 1fr 360px",
    gap: 16,
    alignItems: "stretch",
    maxWidth: 1200,
    margin: "0 auto",
  },
  leftPanel: {
    background: "#13151b",
    border: "1px solid #232733",
    borderRadius: 12,
    padding: 16,
  },
  stage: {
    background: "#0f1116",
    border: "1px solid #1f2330",
    borderRadius: 12,
    position: "relative",
    overflow: "hidden",
    minHeight: 420,
  },
  rightPanel: {
    background: "#13151b",
    border: "1px solid #232733",
    borderRadius: 12,
    padding: 16,
  },
} as const;

const css = `
  .control { margin: 10px 0; }
  .control label { font-size: 14px; opacity: 0.9; margin-right: 8px; }
  .row { display: flex; align-items: center; gap: 8px; }
  .row.gap { gap: 12px; }
  .row.space { justify-content: space-between; }
  input[type="range"] { width: 180px; }
  .muted { opacity: 0.7; font-size: 13px; }

  button { background: #1e2433; border: 1px solid #2c3448; color: #eaeef2; padding: 8px 12px; border-radius: 8px; cursor: pointer; }
  button:hover { border-color: #5b6a8c; }
  button.primary { background: #2b6ae3; border-color: #2b6ae3; }
  button.primary:hover { filter: brightness(1.05); }
  button.danger { background: #cc3a3a; border-color: #cc3a3a; }

  .centerNote { position: absolute; inset: 0; display: grid; place-items: center; font-size: 24px; opacity: .9; }
  .countdown { position: absolute; inset: 0; display: grid; place-items: center; font-size: 96px; font-weight: 800; color: #eaeef2; }

  .metronome { position: absolute; inset: 0; display: grid; place-items: center; }
  .pulse { width: 180px; height: 180px; border-radius: 50%; background: radial-gradient( circle at 50% 50%, #3aa0ff 0%, #2b6ae3 40%, #1d2b59 100% ); box-shadow: 0 0 32px rgba(43,106,227,.45); transition: transform 50ms linear; }
  .progress { position: absolute; left: 0; right: 0; bottom: 0; height: 6px; background: #181c26; }
  .progress .bar { height: 100%; background: linear-gradient(90deg, #2b6ae3, #3aa0ff); box-shadow: 0 0 20px rgba(58,160,255,.35); }

  .bigStats { position: absolute; right: 14px; top: 14px; display: grid; grid-auto-flow: column; gap: 16px; }
  .bigStats .label { font-size: 12px; opacity: .7; }
  .bigStats .value { font-size: 28px; font-weight: 700; }

  .liveList { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; max-height: 220px; overflow: auto; }
  .chip { display: flex; justify-content: space-between; align-items: center; gap: 8px; background: #0f1116; border: 1px solid #232733; border-radius: 999px; padding: 6px 10px; font-size: 13px; }
  .chip span { opacity: .9; }
  .chip.perfect { border-color: #3ee37b77; }
  .chip.great { border-color: #e3de3e77; }
  .chip.good { border-color: #3eb4e377; }
  .chip.ok { border-color: #9a9faa77; }
  .chip.miss { border-color: #e33e3e77; }

  .summary { background: #0f1116; border: 1px solid #232733; border-radius: 12px; padding: 10px; display: grid; gap: 8px; }
  .badges { display: flex; flex-wrap: wrap; gap: 6px; }
  .badge { background: #1a1f2c; border: 1px solid #30384d; padding: 4px 8px; border-radius: 999px; font-size: 12px; }
  .badge.perfect { border-color: #3ee37b77; }
  .badge.great { border-color: #e3de3e77; }
  .badge.good { border-color: #3eb4e377; }
  .badge.ok { border-color: #9a9faa77; }
  .badge.miss { border-color: #e33e3e77; }
`;
