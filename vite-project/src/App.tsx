import React, { useCallback, useMemo, useState } from 'react';
import ControlPanel from './components/ControlPanel.jsx';
import CanvasDrill from './components/CanvasDrill.jsx';
import RightPanel from './components/RightPanel.jsx';

type ClickUpdate = {
  L: boolean;
  M: boolean;
  R: boolean;
  cps: number;
  counts: { left: number; mid: number; right: number };
};

type SessionSummary = {
  endedAt: string;
  durationSec: number;
  avgError: number;
  hitRate: number;
  shots: number;
  avgCps: number;
};

export default function App() {
  const [settings, setSettings] = useState({
    durationSec: 30,
    countdownSec: 3,
    targetRadius: 20,
    crosshairSize: 14,
    recoilSpeed: 420,
    recoilJitter: 600,
    showPath: true,
    showHeatmap: true,
    compensationGain: 1.0,
    startGraceMs: 600,
    deadZoneY: 2,
    cursorMode: 'fixed' as 'fixed' | 'free',
  });

  const [clickState, setClickState] = useState({ L: false, M: false, R: false });
  const [cps, setCps] = useState(0);
  const [leftClicks, setLeftClicks] = useState(0);
  const [midClicks, setMidClicks] = useState(0);
  const [rightClicks, setRightClicks] = useState(0);

  const [scoreLog, setScoreLog] = useState<SessionSummary[]>([]);

  const onClickUpdate = useCallback(
    ({ L, M, R, cps, counts }: ClickUpdate) => {
      setClickState({ L, M, R });
      setCps(cps);
      setLeftClicks(counts.left);
      setMidClicks(counts.mid);
      setRightClicks(counts.right);
    },
    []
  );

  const onSessionEnd = useCallback((summary: SessionSummary) => {
    setScoreLog(prev => [summary, ...prev].slice(0, 50));
  }, []);

  const updateSetting = useCallback((key: keyof typeof settings, val: any) => {
    setSettings(prev => ({ ...prev, [key]: val }));
  }, []);

  const controlProps = useMemo(() => ({ settings, updateSetting }), [settings, updateSetting]);

  return (
    <div className="app">
      <aside className="left">
        <ControlPanel {...controlProps} />
      </aside>

      <main className="center">
        <CanvasDrill
          settings={settings}
          onClickUpdate={onClickUpdate}
          onSessionEnd={onSessionEnd}
        />
      </main>

      <aside className="right">
        <RightPanel
          clickState={clickState}
          cps={cps}
          counts={{ left: leftClicks, mid: midClicks, right: rightClicks }}
          scoreLog={scoreLog}
        />
      </aside>
    </div>
  );
}
