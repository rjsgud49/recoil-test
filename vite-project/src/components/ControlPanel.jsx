import React from 'react'

export default function ControlPanel({ settings, updateSetting }) {
    const S = settings

    return (
        <div className="panel">
            <h2>드릴 설정</h2>

            <div className="field">
                <label>카운트다운 (초)</label>
                <input type="number" min="0" max="10"
                    value={S.countdownSec}
                    onChange={(e) => updateSetting('countdownSec', Number(e.target.value) || 0)} />
            </div>

            <div className="field">
                <label>테스트 시간 (초)</label>
                <input type="number" min="5" max="600"
                    value={S.durationSec}
                    onChange={(e) => updateSetting('durationSec', Math.max(5, Number(e.target.value) || 5))} />
            </div>

            <div className="divider" />

            <div className="field">
                <label>타겟 반지름 (px)</label>
                <input type="range" min="8" max="80" step="1"
                    value={S.targetRadius}
                    onChange={(e) => updateSetting('targetRadius', Number(e.target.value))} />
                <span className="value">{S.targetRadius}px</span>
            </div>

            <div className="field">
                <label>십자선 크기 (px)</label>
                <input type="range" min="8" max="40" step="1"
                    value={S.crosshairSize}
                    onChange={(e) => updateSetting('crosshairSize', Number(e.target.value))} />
                <span className="value">{S.crosshairSize}px</span>
            </div>

            <div className="divider" />

            <div className="field">
                <label>상향 속도 (px/s)</label>
                <input type="range" min="120" max="1200" step="10"
                    value={S.recoilSpeed}
                    onChange={(e) => updateSetting('recoilSpeed', Number(e.target.value))} />
                <span className="value">{S.recoilSpeed}</span>
            </div>

            <div className="field">
                <label>상향 속도 폭 (px/s)</label>
                <input type="range" min="0" max="2000" step="20"
                    value={S.recoilJitter}
                    onChange={(e) => updateSetting('recoilJitter', Number(e.target.value))} />
                <span className="value">{S.recoilJitter}</span>
            </div>

            <div className="field">
                <label>보정 민감도 (↓감쇄)</label>
                <input type="range" min="0" max="3" step="0.05"
                    value={S.compensationGain}
                    onChange={(e) => updateSetting('compensationGain', Number(e.target.value))} />
                <span className="value">{S.compensationGain.toFixed(2)}</span>
            </div>

            <div className="field">
                <label>시작 그레이스(ms)</label>
                <input type="range" min="0" max="1500" step="50"
                    value={S.startGraceMs}
                    onChange={(e) => updateSetting('startGraceMs', Number(e.target.value))} />
                <span className="value">{S.startGraceMs}ms</span>
            </div>

            <div className="field">
                <label>미세 내림 데드존 (px)</label>
                <input type="range" min="0" max="8" step="1"
                    value={S.deadZoneY}
                    onChange={(e) => updateSetting('deadZoneY', Number(e.target.value))} />
                <span className="value">{S.deadZoneY}px</span>
            </div>

            <div className="divider" />
              <div className="field">
                <label>커서 모드</label>
                <select
                  value={S.cursorMode}
                  onChange={(e)=>updateSetting('cursorMode', e.target.value)}
                >
                  <option value="fixed">중앙 고정</option>
                  <option value="free">자유 이동</option>
                </select>
              </div>
            <div className="toggles">
                <label><input type="checkbox"
                    checked={S.showPath}
                    onChange={(e) => updateSetting('showPath', e.target.checked)} /> 경로 표시</label>

                <label><input type="checkbox"
                    checked={S.showHeatmap}
                    onChange={(e) => updateSetting('showHeatmap', e.target.checked)} /> 히트맵 표시</label>
            </div>

            <p className="hint">캔버스를 클릭하면 포인터 잠금(자유 시점) 됩니다. ESC로 해제.</p>
        </div>
    )
}
