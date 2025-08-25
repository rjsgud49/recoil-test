import React, { useEffect, useRef, useState } from "react";

// 안전 clamp
function clamp(v, a, b) {
    return Math.min(b, Math.max(a, v));
}

const DEFAULT_SETTINGS = {
    countdownSec: 3,
    durationSec: 30,
    startGraceMs: 250,
    deadZoneY: 0.5,
    recoilSpeed: 220,      // px/s
    recoilJitter: 12,      // px/s 랜덤 상하 변동
    compensationGain: 1.0, // 마우스 내림 보정 gain
    targetRadius: 22,
    showPath: true,
    showHeatmap: true,
    crosshairSize: 16,
    cursorMode: "fixed",   // 'fixed' | 'free'
};

export default function CanvasDrill({
    settings = DEFAULT_SETTINGS,
    onClickUpdate,
    onSessionEnd,
}) {
    const setg = { ...DEFAULT_SETTINGS, ...settings };

    // refs
    const canvasRef = useRef(null);
    const sparkRef = useRef(null);
    const dprRef = useRef(window.devicePixelRatio || 1);

    const size = useRef({ w: 0, h: 0 });
    const aimRef = useRef({ x: 0, y: 0 });      // 내부 십자선 좌표
    const target = useRef({ x: 0, y: 0 });      // 타겟 좌표
    const lastMouseDy = useRef(0);              // 최근 프레임의 마우스 Y 이동
    const errorHistory = useRef([]);            // 오차 스파크라인
    const pathPoints = useRef([]);              // 경로 표시용
    const heatmapEnable = useRef(true);

    const leftCount = useRef(0);
    const midCount = useRef(0);
    const rightCount = useRef(0);
    const lTimestamps = useRef([]);             // 좌클릭 타임스탬프(초)

    const buttons = useRef({ L: false, M: false, R: false });

    // rAF/시간 관리
    const rafId = useRef(0);
    const startedAtMs = useRef(0);              // 세션 시작 시각(ms, performance.now)
    const countdownStartMs = useRef(0);
    const sessionEndAtMs = useRef(0);
    const lastSecondShown = useRef(-1);         // timeLeft 표시 최적화

    // state
    const [running, setRunning] = useState(false);
    const [countdown, setCountdown] = useState(0);
    const [timeLeft, setTimeLeft] = useState(0);

    // ===== 리사이즈 & DPR 대응 (ResizeObserver) =====
    useEffect(() => {
        const canvas = canvasRef.current;
        const spark = sparkRef.current;
        if (!canvas || !spark) return;

        const ro = new ResizeObserver(() => {
            const rect = canvas.getBoundingClientRect();
            const dpr = Math.max(1, window.devicePixelRatio || 1);
            dprRef.current = dpr;

            canvas.width = Math.round(rect.width * dpr);
            canvas.height = Math.round(rect.height * dpr);
            spark.width = Math.round(rect.width * dpr);
            spark.height = Math.round(60 * dpr);

            size.current = { w: rect.width, h: rect.height };

            // 리사이즈 시 내부 십자선 중앙 정렬
            aimRef.current = { x: rect.width / 2, y: rect.height / 2 };

            const ctx = canvas.getContext("2d");
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const sctx = spark.getContext("2d");
            sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        });

        ro.observe(canvas);

        return () => ro.disconnect();
    }, []);

    // ===== 포인터락 & 마우스 이벤트 =====
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const onMouseDown = (e) => {
            if (e.button === 0) {
                buttons.current.L = true;
                leftCount.current++;
                lTimestamps.current.push(performance.now() / 1000);
            }
            if (e.button === 1) {
                buttons.current.M = true;
                midCount.current++;
            }
            if (e.button === 2) {
                buttons.current.R = true;
                rightCount.current++;
            }
            e.preventDefault();

            // 포인터락 진입
            if (document.pointerLockElement !== canvas) {
                canvas.requestPointerLock?.();
            }
        };

        const onMouseUp = (e) => {
            if (e.button === 0) buttons.current.L = false;
            if (e.button === 1) buttons.current.M = false;
            if (e.button === 2) buttons.current.R = false;
        };

        const onContext = (e) => e.preventDefault();

        const onMouseMove = (e) => {
            // movementY는 pointerLock 상태일 때만 유효
            const dy = document.pointerLockElement === canvas ? e.movementY || 0 : 0;
            lastMouseDy.current = dy;

            // free 모드일 땐 십자선을 실제 마우스 이동으로 이동
            if (setg.cursorMode === "free") {
                const { w, h } = size.current;
                if (document.pointerLockElement === canvas) {
                    const nx = clamp(aimRef.current.x + (e.movementX || 0), 0, w);
                    const ny = clamp(aimRef.current.y + (e.movementY || 0), 0, h);
                    aimRef.current = { x: nx, y: ny };
                } else {
                    const rect = canvas.getBoundingClientRect();
                    const nx = clamp(e.clientX - rect.left, 0, w);
                    const ny = clamp(e.clientY - rect.top, 0, h);
                    aimRef.current = { x: nx, y: ny };
                }
            }
        };

        const onPointerLockChange = () => {
            // 포인터락 해제 시, 마우스 이동은 clientX/Y 기준
            // 추가로 필요한 처리 있으면 여기에
        };

        const onPointerLockError = () => {
            console.warn("Pointer lock error");
        };

        canvas.addEventListener("mousedown", onMouseDown);
        window.addEventListener("mouseup", onMouseUp);
        canvas.addEventListener("contextmenu", onContext);
        window.addEventListener("mousemove", onMouseMove);
        document.addEventListener("pointerlockchange", onPointerLockChange);
        document.addEventListener("pointerlockerror", onPointerLockError);

        return () => {
            canvas.removeEventListener("mousedown", onMouseDown);
            window.removeEventListener("mouseup", onMouseUp);
            canvas.removeEventListener("contextmenu", onContext);
            window.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("pointerlockchange", onPointerLockChange);
            document.removeEventListener("pointerlockerror", onPointerLockError);
        };
    }, [setg.cursorMode]);

    // ===== Space 시작/중지 =====
    useEffect(() => {
        const onKey = (e) => {
            if (e.code === "Space") {
                e.preventDefault();
                if (running) endSession();
                else startSession();
            }
            // ESC로 포인터락 해제 시 자연 동작
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [running]); // running만 의존

    // ===== 탭 숨김시 안전 중지(옵션) =====
    useEffect(() => {
        const onVis = () => {
            if (document.hidden && running) {
                endSession();
            }
        };
        document.addEventListener("visibilitychange", onVis);
        return () => document.removeEventListener("visibilitychange", onVis);
    }, [running]);

    function startSession() {
        const now = performance.now();
        countdownStartMs.current = now;
        startedAtMs.current = 0; // 카운트다운 종료 뒤 설정
        sessionEndAtMs.current = 0;

        setCountdown(setg.countdownSec);
        setTimeLeft(setg.durationSec);
        lastSecondShown.current = -1;

        setRunning(true);

        // 통계 초기화
        errorHistory.current = [];
        pathPoints.current = [];
        leftCount.current = 0;
        midCount.current = 0;
        rightCount.current = 0;
        lTimestamps.current = [];
        lastMouseDy.current = 0;

        // 위치 초기화
        const { w, h } = size.current;
        target.current = { x: w / 2, y: Math.floor(h * 0.75) };
        aimRef.current = { x: w / 2, y: h / 2 };
    }

    function endSession() {
        // 루프 중지
        if (rafId.current) cancelAnimationFrame(rafId.current);
        rafId.current = 0;

        setRunning(false);
        setCountdown(0);

        // 결과 집계
        const errors = errorHistory.current;
        const avgError = errors.length
            ? errors.reduce((a, b) => a + b, 0) / errors.length
            : 0;

        const shots = leftCount.current;
        const hitRadius = setg.targetRadius;
        let approxHits = 0;
        if (shots > 0 && errors.length > 0) {
            const hitFrames = errors.filter((e) => e <= hitRadius).length;
            approxHits = Math.round(hitFrames * (shots / errors.length));
        }
        const hitRate = shots ? approxHits / shots : 0;

        const ts = lTimestamps.current;
        let avgCps = 0;
        if (ts.length >= 2) {
            const dur = ts[ts.length - 1] - ts[0];
            avgCps = dur > 0 ? ts.length / dur : 0;
        }

        onSessionEnd?.({
            endedAt: new Date().toLocaleString(),
            durationSec: setg.durationSec,
            avgError: Number(avgError.toFixed(1)),
            hitRate: Number((hitRate * 100).toFixed(1)),
            shots,
            avgCps: Number(avgCps.toFixed(2)),
        });
    }

    // ===== 메인 루프 =====
    useEffect(() => {
        if (!running) return;

        const loop = () => {
            const canvas = canvasRef.current;
            const spark = sparkRef.current;
            if (!canvas || !spark) {
                rafId.current = requestAnimationFrame(loop);
                return;
            }

            const ctx = canvas.getContext("2d");
            const sctx = spark.getContext("2d");
            const dpr = dprRef.current;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            sctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            const now = performance.now();
            const { w, h } = size.current;

            // === 카운트다운 ===
            const cdElapsed = now - countdownStartMs.current;
            const cdLeft = Math.max(0, setg.countdownSec - Math.floor(cdElapsed / 1000));

            if (cdLeft !== countdown) {
                setCountdown(cdLeft);
            }

            // === 세션 시간 ===
            if (countdown <= 0) {
                if (!startedAtMs.current) {
                    startedAtMs.current = now;
                    sessionEndAtMs.current = startedAtMs.current + setg.durationSec * 1000;
                }
                const msLeft = Math.max(0, sessionEndAtMs.current - now);
                const secLeftRounded = Math.ceil(msLeft / 1000);

                if (secLeftRounded !== lastSecondShown.current) {
                    lastSecondShown.current = secLeftRounded;
                    setTimeLeft(msLeft / 1000);
                    if (msLeft <= 0) {
                        // 다음 틱에서 안전 종료
                        setTimeout(endSession, 0);
                    }
                }
            }

            // === 배경 ===
            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = "#0b0f14";
            ctx.fillRect(0, 0, w, h);
            ctx.strokeStyle = "#1e2a36";
            ctx.lineWidth = 2;
            ctx.strokeRect(0, 0, w, h);

            // === 타겟 이동 ===
            if (countdown <= 0) {
                // 상향(반동) + 랜덤 지터
                const upPerSec = setg.recoilSpeed + (Math.random() * 2 - 1) * setg.recoilJitter;
                // 프레임 기반 이동량 추정(초당 픽셀 → ms당 → 이번 프레임)
                // rAF dt를 별도 저장하지 않고, 대략 60fps 가정으로 충분(정밀도 필요 시 dt 추적 가능)
                const dt = 1 / 60;
                let vy = upPerSec * dt;

                // 시작 직후 그레이스: 살짝 내린 건 보정에서 제외
                let dy = lastMouseDy.current;
                const sinceSessionStart =
                    startedAtMs.current ? now - startedAtMs.current : cdElapsed - setg.countdownSec * 1000;

                const inGrace = sinceSessionStart < setg.startGraceMs;

                if (Math.abs(dy) < setg.deadZoneY) dy = 0; // 데드존
                if (inGrace && dy > 0) dy = 0;             // 그레이스 구간: 내림만 무시

                // fixed 모드에서만 내려보정 적용
                const comp = setg.cursorMode === "fixed" ? dy * setg.compensationGain : 0;

                target.current.y -= vy;
                target.current.y += comp;

                // 화면 위로 사라지면 아래로 워프 + X 약간 랜덤
                if (target.current.y < -setg.targetRadius) {
                    target.current.y = h + setg.targetRadius;
                    target.current.x = clamp(
                        target.current.x + (Math.random() * 200 - 100),
                        setg.targetRadius,
                        w - setg.targetRadius
                    );
                }
            }

            // === 경로 ===
            if (setg.showPath) {
                pathPoints.current.push([target.current.x, target.current.y]);
                if (pathPoints.current.length > 800) pathPoints.current.shift();
                ctx.beginPath();
                ctx.lineWidth = 1;
                ctx.strokeStyle = "#2c7be5";
                for (let i = 0; i < pathPoints.current.length; i++) {
                    const [px, py] = pathPoints.current[i];
                    if (i === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.stroke();
            } else {
                pathPoints.current = [];
            }

            // === 히트맵 점 ===
            if (setg.showHeatmap && heatmapEnable.current) {
                ctx.save();
                ctx.globalAlpha = 0.12;
                ctx.fillStyle = "#ff7800";
                ctx.beginPath();
                ctx.arc(
                    target.current.x,
                    target.current.y,
                    Math.max(3, setg.targetRadius * 0.35),
                    0,
                    Math.PI * 2
                );
                ctx.fill();
                ctx.restore();
            }

            // === 타겟 ===
            ctx.beginPath();
            ctx.fillStyle = "#ff375f";
            ctx.arc(target.current.x, target.current.y, setg.targetRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = "#ffffff20";
            ctx.stroke();

            // === 십자선 ===
            const ax = setg.cursorMode === "free" ? aimRef.current.x : w / 2;
            const ay = setg.cursorMode === "free" ? aimRef.current.y : h / 2;

            ctx.strokeStyle = "#b2f5ff";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(ax - setg.crosshairSize, ay);
            ctx.lineTo(ax + setg.crosshairSize, ay);
            ctx.moveTo(ax, ay - setg.crosshairSize);
            ctx.lineTo(ax, ay + setg.crosshairSize);
            ctx.stroke();

            // === 오차 기록 & 스파크라인 ===
            const err = Math.hypot(target.current.x - ax, target.current.y - ay);
            errorHistory.current.push(err);
            if (errorHistory.current.length > 300) errorHistory.current.shift();

            const sw = size.current.w;
            const sh = 60;
            sctx.clearRect(0, 0, sw, sh);
            sctx.fillStyle = "#0b0f14";
            sctx.fillRect(0, 0, sw, sh);
            const pad = 8;
            const gh = sh - pad * 2;
            const gw = sw - pad * 2;
            const arr = errorHistory.current;
            const maxErr = Math.max(60, ...arr);
            sctx.strokeStyle = "#36d399";
            sctx.lineWidth = 2;
            sctx.beginPath();
            for (let i = 0; i < arr.length; i++) {
                const x = pad + (i / (arr.length - 1 || 1)) * gw;
                const y = pad + gh * (1 - clamp(arr[i] / maxErr, 0, 1));
                if (i === 0) sctx.moveTo(x, y);
                else sctx.lineTo(x, y);
            }
            sctx.stroke();
            sctx.fillStyle = "#9aa4af";
            sctx.font = `12px ui-sans-serif`;
            sctx.fillText(`오차 스파크라인 (현재 ${err.toFixed(1)}px)`, pad, pad + 12);

            // === HUD: 시간/카운트다운 ===
            if (running) {
                ctx.fillStyle = "#9aa4af";
                ctx.font = `16px ui-sans-serif`;
                ctx.fillText(
                    `남은시간 ${Math.max(0, Math.ceil(timeLeft))}s`,
                    12,
                    22
                );
            }
            if (running && countdown > 0) {
                ctx.fillStyle = "#ffffff";
                ctx.font = `64px ui-sans-serif`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(`${countdown}`, w / 2, h / 2);
                ctx.textAlign = "start";
                ctx.textBaseline = "alphabetic";
            }

            // === CPS 업데이트 ===
            {
                const nowS = now / 1000;
                lTimestamps.current = lTimestamps.current.filter((t) => nowS - t <= 1);
                const cps = lTimestamps.current.length;
                onClickUpdate?.({
                    L: buttons.current.L,
                    M: buttons.current.M,
                    R: buttons.current.R,
                    cps,
                    counts: {
                        left: leftCount.current,
                        mid: midCount.current,
                        right: rightCount.current,
                    },
                });
            }

            rafId.current = requestAnimationFrame(loop);
        };

        rafId.current = requestAnimationFrame(loop);
        return () => {
            if (rafId.current) cancelAnimationFrame(rafId.current);
            rafId.current = 0;
        };
    }, [running, countdown, timeLeft, setg, onClickUpdate]);

    return (
        <div className="canvasWrap">
            <div className="topBar">
                <button
                    className={`btn ${running ? "danger" : "primary"}`}
                    onClick={() => (running ? endSession() : startSession())}
                >
                    {running ? "중지" : "시작 (Space)"}
                </button>
                <div className="timer">
                    {running ? `남은시간 ${Math.max(0, Math.ceil(timeLeft))}s` : "대기중"}
                </div>
            </div>
            <canvas ref={canvasRef} className="drillCanvas" />
            <canvas ref={sparkRef} className="sparkCanvas" />
        </div>
    );
}
