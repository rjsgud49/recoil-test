import React from 'react'

export default function RightPanel({ clickState, cps, counts, scoreLog }) {
    return (
        <div className="panel rightPanel">
            <h2>클릭 상태</h2>
            <div className="clickRow">
                <Badge on={clickState.L} label={`L (${counts.left})`} />
                <Badge on={clickState.M} label={`M (${counts.mid})`} />
                <Badge on={clickState.R} label={`R (${counts.right})`} />
            </div>
            <div className="cpsBox">
                <div className="cpsLabel">CPS</div>
                <div className="cpsValue">{cps}</div>
            </div>

            <div className="divider" />

            <h3>세션 점수 로그</h3>
            <div className="logList">
                {scoreLog.length === 0 && <div className="empty">아직 기록이 없어요.</div>}
                {scoreLog.map((it, idx) => (
                    <div className="logItem" key={idx}>
                        <div className="logHead">
                            <span className="time">{it.endedAt}</span>
                            <span className="dur">{it.durationSec}s</span>
                        </div>
                        <div className="logStats">
                            <span>평균오차 <b>{it.avgError}px</b></span>
                            <span>히트율 <b>{it.hitRate}%</b></span>
                            <span>샷 <b>{it.shots}</b></span>
                            <span>평균CPS <b>{it.avgCps}</b></span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

function Badge({ on, label }) {
    return (
        <div className={`badge ${on ? 'on' : ''}`}>{label}</div>
    )
}
