import { useState } from 'react';
import { Sliders } from 'lucide-react';
import { POLICY_LEVELS, type PolicyLevelMeta } from '../../../shared/constants';
import type { TrafficValidationLevel } from '../../../shared/types';

export function getSecurityScoreColor(score: number): string {
  switch (score) {
    case 5:
      return '#ef4444';
    case 4:
      return '#f59e0b';
    case 3:
      return '#84cc16';
    case 2:
    case 1:
    default:
      return '#10b981';
  }
}

export function getSpeedScoreColor(score: number): string {
  switch (score) {
    case 5:
      return '#10b981';
    case 4:
      return '#84cc16';
    case 3:
      return '#f59e0b';
    case 2:
    case 1:
    default:
      return '#ef4444';
  }
}

export interface PolicyLevelSliderProps {
  value: TrafficValidationLevel;
  onChange: (level: TrafficValidationLevel) => void;
  disabled?: boolean;
  disabledHint?: string;
  showDetails?: boolean;
}

export function PolicyLevelSlider({
  value,
  onChange,
  disabled = false,
  disabledHint,
  showDetails = true,
}: PolicyLevelSliderProps) {
  const [dragLevel, setDragLevel] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredTick, setHoveredTick] = useState<number | null>(null);

  const curIndex = POLICY_LEVELS.findIndex((item) => item.id === value);
  const curLevel: PolicyLevelMeta = POLICY_LEVELS[curIndex >= 0 ? curIndex : 1];

  const displayLevelNum = disabled ? curLevel.level : dragLevel ?? curLevel.level;
  const isDisplayUltra = displayLevelNum === 4;

  const activeLevelMeta = POLICY_LEVELS[displayLevelNum - 1] ?? curLevel;
  const secColor = getSecurityScoreColor(activeLevelMeta.securityScore);
  const spdColor = getSpeedScoreColor(activeLevelMeta.speedScore);

  return (
    <div
      className={`policy-slider-card ${disabled ? 'policy-slider-card-disabled' : ''}`}
      style={{ marginBottom: '12px' }}
    >
      {/* 滑块头部：当前等级与微型四档滑块 */}
      <div className="policy-slider-header">
        <div className="row-between" style={{ alignItems: 'flex-start' }}>
          <div className="row" style={{ gap: '10px' }}>
            <div
              className="policy-level-badge"
              style={{
                background: disabled
                  ? 'rgba(255, 255, 255, 0.08)'
                  : `linear-gradient(135deg, ${activeLevelMeta.color} 0%, rgba(255,255,255,0.18) 100%)`,
                boxShadow: disabled ? 'none' : `0 2px 10px ${activeLevelMeta.color}40`,
                opacity: disabled ? 0.6 : 1,
              }}
            >
              <span>L{activeLevelMeta.level}</span>
            </div>
            <div>
              <div className="row" style={{ gap: '8px', alignItems: 'center' }}>
                <b style={{ fontSize: '15px', color: 'var(--text-main)' }}>
                  第 {activeLevelMeta.level} 等级：{activeLevelMeta.name}
                </b>
                <span
                  className={`tag ${disabled ? 'tag-muted' : activeLevelMeta.badgeClass}`}
                  style={{ fontSize: '11px' }}
                >
                  {disabled ? '跟随全局' : activeLevelMeta.badge}
                </span>
              </div>
              <div className="muted small" style={{ marginTop: '2px', fontSize: '11.5px' }}>
                {disabled
                  ? disabledHint || '当前已继承全局策略。如需单独定制，请关闭上方继承开关。'
                  : '滑动右侧滑块或点击刻度点快速切换防护策略'}
              </div>
            </div>
          </div>

          {/* 紧凑微型四档滑块 */}
          <div
            className={`policy-mini-slider ${disabled ? 'slider-disabled' : ''}`}
            title={
              disabled
                ? '已继承全局策略，滑块已锁定'
                : `当前为第 ${activeLevelMeta.level} 等级：${activeLevelMeta.name} (滑动或点击 1~4 档微调)`
            }
          >
            <div className="policy-mini-track-wrap">
              <div
                className="policy-mini-track-inner"
                style={{
                  position: 'relative',
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                }}
                onMouseMove={(e) => {
                  if (disabled || isDragging) {
                    setHoveredTick(null);
                    return;
                  }
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const availableWidth = rect.width - 26;
                  let closest: number | null = null;
                  let minD = 16;
                  for (let i = 0; i < 4; i++) {
                    const tickX = 13 + (availableWidth * i) / 3;
                    const dist = Math.abs(x - tickX);
                    if (dist <= minD) {
                      minD = dist;
                      closest = i;
                    }
                  }
                  if (closest === displayLevelNum - 1) {
                    setHoveredTick(null);
                  } else {
                    setHoveredTick(closest);
                  }
                }}
                onMouseLeave={() => setHoveredTick(null)}
              >
                <div className="policy-mini-track">
                  {/* 渐变流光填充槽 */}
                  <div
                    className={`policy-mini-track-fill ${isDisplayUltra ? 'track-fill-ultra' : ''} ${
                      isDragging ? 'no-transition' : ''
                    }`}
                    style={{
                      width: `calc(13px + (100% - 26px) * ${((displayLevelNum - 1) / 3)})`,
                      background: disabled
                        ? 'rgba(255, 255, 255, 0.22)'
                        : `linear-gradient(90deg, #10b981 0%, #84cc16 33%, #f59e0b 66%, #ef4444 100%)`,
                    }}
                  >
                    {!disabled && isDisplayUltra && (
                      <div className="policy-ultra-sparkles" aria-hidden="true">
                        <div className="ultra-stars-stream">
                          <div className="ultra-stars-group">
                            <span className="ultra-star ultra-star-1" />
                            <span className="ultra-star ultra-star-2" />
                            <span className="ultra-star ultra-star-3" />
                            <span className="ultra-star ultra-star-4" />
                            <span className="ultra-star ultra-star-5" />
                            <span className="ultra-star ultra-star-6" />
                            <span className="ultra-star ultra-star-7" />
                            <span className="ultra-star ultra-star-8" />
                          </div>
                          <div className="ultra-stars-group" aria-hidden="true">
                            <span className="ultra-star ultra-star-1" />
                            <span className="ultra-star ultra-star-2" />
                            <span className="ultra-star ultra-star-3" />
                            <span className="ultra-star ultra-star-4" />
                            <span className="ultra-star ultra-star-5" />
                            <span className="ultra-star ultra-star-6" />
                            <span className="ultra-star ultra-star-7" />
                            <span className="ultra-star ultra-star-8" />
                          </div>
                        </div>
                        <div className="ultra-shimmer-sweep" />
                      </div>
                    )}
                  </div>

                  {/* 4 个刻度小点 */}
                  <div className="policy-mini-ticks">
                    {[0, 1, 2, 3].map((idx) => {
                      const isPassed = displayLevelNum >= idx + 1;
                      const targetLevel = POLICY_LEVELS[idx];
                      const isHovered = !disabled && hoveredTick === idx;
                      return (
                        <button
                          type="button"
                          key={idx}
                          disabled={disabled}
                          className={`policy-mini-tick ${isPassed ? 'tick-active' : 'tick-inactive'} ${
                            isHovered ? 'tick-hover' : ''
                          }`}
                          style={{
                            left: `calc(13px + (100% - 26px) * ${idx / 3})`,
                            cursor: disabled ? 'not-allowed' : 'pointer',
                          }}
                          title={
                            disabled
                              ? '继承全局中，已锁定'
                              : `点击直达第 ${targetLevel.level} 等级：${targetLevel.name}`
                          }
                          onClick={(e) => {
                            if (disabled) return;
                            e.stopPropagation();
                            setDragLevel(null);
                            onChange(targetLevel.id);
                          }}
                        >
                          <span className="policy-mini-tick-dot" />
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 白色高光圆球手柄 */}
                <div
                  className={`policy-mini-thumb ${isDragging ? 'no-transition' : ''}`}
                  style={{
                    left: `calc(13px + (100% - 26px) * ${((displayLevelNum - 1) / 3)})`,
                    opacity: disabled ? 0.6 : 1,
                  }}
                />

                {/* 原生隐藏滑块 */}
                <input
                  type="range"
                  min={1}
                  max={4}
                  step={1}
                  disabled={disabled}
                  value={displayLevelNum}
                  onPointerDown={() => !disabled && setIsDragging(true)}
                  onPointerUp={() => {
                    setIsDragging(false);
                  }}
                  onInput={(e) => {
                    if (disabled) return;
                    setIsDragging(true);
                    const val = Number((e.target as HTMLInputElement).value);
                    setDragLevel(val);
                  }}
                  onChange={(e) => {
                    if (disabled) return;
                    const val = Number(e.target.value);
                    setDragLevel(null);
                    setIsDragging(false);
                    const targetLevel = POLICY_LEVELS[val - 1];
                    if (targetLevel) onChange(targetLevel.id);
                  }}
                  className="policy-mini-native-input"
                  aria-label="流量判定校验策略等级"
                  style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 详情与评分卡片 */}
      {showDetails && (
        <div
          className="policy-detail-card"
          style={{
            borderLeft: `3.5px solid ${disabled ? 'var(--border-subtle)' : activeLevelMeta.color}`,
            background: disabled
              ? 'rgba(255, 255, 255, 0.02)'
              : `radial-gradient(120% 120% at 0% 0%, ${activeLevelMeta.color}14 0%, var(--bg-card) 70%)`,
          }}
        >
          <div className="row-between" style={{ marginBottom: '8px' }}>
            <div className="row" style={{ gap: '6px' }}>
              <Sliders
                size={14}
                style={{ color: disabled ? 'var(--text-muted)' : activeLevelMeta.color }}
              />
              <b style={{ fontSize: '13.5px', color: 'var(--text-main)' }}>
                {disabled ? '全局策略执行逻辑' : '策略执行逻辑解读'}
              </b>
            </div>
            {/* 强度与效率双维刻度计 */}
            <div className="row policy-scores-row" style={{ gap: '16px' }}>
              <div className="row small" style={{ gap: '6px' }}>
                <span className="muted" style={{ fontSize: '11px' }}>
                  安全防护:
                </span>
                <div className="score-bars" title={`安全防护评级: ${activeLevelMeta.securityScore}/5`}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <span
                      key={s}
                      className={`score-bar ${s <= activeLevelMeta.securityScore ? 'score-bar-filled' : ''}`}
                      style={{
                        backgroundColor:
                          s <= activeLevelMeta.securityScore
                            ? disabled
                              ? 'var(--text-muted)'
                              : secColor
                            : 'var(--border-subtle)',
                        boxShadow:
                          s <= activeLevelMeta.securityScore && !disabled
                            ? `0 0 5px ${secColor}40`
                            : 'none',
                      }}
                    />
                  ))}
                </div>
              </div>
              <div className="row small" style={{ gap: '6px' }}>
                <span className="muted" style={{ fontSize: '11px' }}>
                  直通速度:
                </span>
                <div className="score-bars" title={`访问直通效率评级: ${activeLevelMeta.speedScore}/5`}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <span
                      key={s}
                      className={`score-bar ${s <= activeLevelMeta.speedScore ? 'score-bar-filled' : ''}`}
                      style={{
                        backgroundColor:
                          s <= activeLevelMeta.speedScore
                            ? disabled
                              ? 'var(--text-muted)'
                              : spdColor
                            : 'var(--border-subtle)',
                        boxShadow:
                          s <= activeLevelMeta.speedScore && !disabled
                            ? `0 0 5px ${spdColor}40`
                            : 'none',
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div
            style={{
              fontSize: '12px',
              lineHeight: '1.65',
              color: 'var(--text-secondary)',
              marginBottom: '6px',
            }}
          >
            {activeLevelMeta.desc}
          </div>
          <div
            className="small"
            style={{
              fontSize: '11px',
              color: disabled ? 'var(--text-muted)' : activeLevelMeta.color,
              opacity: 0.9,
            }}
          >
            {activeLevelMeta.scene}
          </div>
        </div>
      )}
    </div>
  );
}
