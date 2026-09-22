import { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Clock,
  Download,
  Play,
  Plus,
  Shield,
  Sliders,
  Sparkles,
  Trash2,
  Upload,
  Zap,
} from 'lucide-react';
import { SCHEMA_VERSION } from '../../../shared/constants';
import { sendCmd, type TestCheckerResult } from '../../../shared/messages';
import {
  loadDismissed,
  loadHabits,
  loadProfiles,
  loadSettings,
  loadSites,
  saveDismissed,
  saveHabits,
  saveProfiles,
  saveSettings,
  saveSites,
} from '../../../shared/storage';
import { POLICY_LEVELS } from '../../../shared/constants';
import type { CheckerConfig, ExportBundle, Settings } from '../../../shared/types';
import { Switch } from '../../ui/components';
import { useSettings } from '../../ui/hooks';
import { downloadText, inputValue } from '../../ui/util';

/** 全局定时复检常用预设档位（分钟） */
const RECHECK_PRESETS = [0, 5, 10, 15, 30, 45, 60, 120, 240];

/** 安全防护颜色映射：程度从低到高由红到绿整体变化 */
function getSecurityScoreColor(score: number): string {
  switch (score) {
    case 1:
      return '#ef4444'; // 鲜红 (极低)
    case 2:
      return '#f97316'; // 橙红 (低)
    case 3:
      return '#eab308'; // 亮黄 (中)
    case 4:
      return '#84cc16'; // 黄绿 (高)
    case 5:
    default:
      return '#10b981'; // 翡翠绿 (极高)
  }
}

/** 直通速度颜色映射：程度由优到良由绿到黄整体变化 */
function getSpeedScoreColor(score: number): string {
  switch (score) {
    case 5:
      return '#10b981'; // 纯正翡翠绿 (优)
    case 4:
      return '#22c55e'; // 鲜绿 (优-)
    case 3:
      return '#84cc16'; // 草木黄绿 (良+)
    case 2:
      return '#eab308'; // 明黄 (良)
    case 1:
    default:
      return '#f59e0b'; // 琥珀黄 (良-)
  }
}

export function SettingsTab() {
  const settings = useSettings();
  const [testResults, setTestResults] = useState<Record<string, string>>({});
  const [testingId, setTestingId] = useState<string | null>(null);
  const [addingChecker, setAddingChecker] = useState(false);
  const [importMsg, setImportMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [isCustomRecheck, setIsCustomRecheck] = useState(false);
  const [dragLevel, setDragLevel] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredTick, setHoveredTick] = useState<number | null>(null);

  if (!settings) return null;

  const isCustom = isCustomRecheck || !RECHECK_PRESETS.includes(settings.recheckMinutes ?? 30);

  const patch = (p: Partial<Settings>) => void saveSettings({ ...settings, ...p });

  const patchChecker = (id: string, p: Partial<CheckerConfig>) => {
    patch({
      checkers: settings.checkers.map((c) => (c.id === id ? { ...c, ...p } : c)),
    });
  };

  const testChecker = async (c: CheckerConfig) => {
    setTestingId(c.id);
    setTestResults((r) => ({ ...r, [c.id]: '正在探测…' }));
    try {
      const res = await sendCmd<TestCheckerResult>({ type: 'testChecker', checker: c });
      setTestResults((r) => ({
        ...r,
        [c.id]: `✓ 响应成功：${res.ip} · ${res.countryCode}${res.city ? ` · ${res.city}` : ''}`,
      }));
    } catch (e) {
      setTestResults((r) => ({
        ...r,
        [c.id]: `✗ 探测失败：${e instanceof Error ? e.message : String(e)}`,
      }));
    } finally {
      setTestingId(null);
    }
  };

  const exportData = async () => {
    const bundle: ExportBundle = {
      schemaVersion: SCHEMA_VERSION,
      exportedAt: Date.now(),
      profiles: await loadProfiles(),
      sites: await loadSites(),
      settings: await loadSettings(),
      habits: await loadHabits(),
      dismissedSuggestions: await loadDismissed(),
    };
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
      d.getDate(),
    ).padStart(2, '0')}`;
    downloadText(`proxy-protect-backup-${stamp}.json`, JSON.stringify(bundle, null, 2));
  };

  const importData = async (file: File) => {
    setImportMsg(null);
    try {
      const bundle = JSON.parse(await file.text()) as ExportBundle;
      if (
        bundle.schemaVersion !== SCHEMA_VERSION ||
        !Array.isArray(bundle.profiles) ||
        !Array.isArray(bundle.sites)
      ) {
        throw new Error('文件格式不正确或版本不兼容');
      }
      if (!confirm('导入将覆盖现有的代理档案、守护规则与配置，确定继续？')) return;
      await saveProfiles(bundle.profiles);
      await saveSites(bundle.sites);
      if (bundle.settings) await saveSettings(bundle.settings);
      if (bundle.habits) await saveHabits(bundle.habits);
      if (bundle.dismissedSuggestions) await saveDismissed(bundle.dismissedSuggestions);
      setImportMsg({ type: 'ok', text: '✓ 数据导入成功，已全面更新配置！' });
    } catch (e) {
      setImportMsg({
        type: 'err',
        text: `✗ 导入失败：${e instanceof Error ? e.message : String(e)}`,
      });
    }
  };

  const clearAll = async () => {
    if (
      !confirm(
        '【高危警告】确定清除全部插件数据（代理档案、守护规则、备注、习惯统计、配置项）？\n代理设置将自动退回直连状态，此操作不可恢复！',
      )
    ) {
      return;
    }
    try {
      await sendCmd({ type: 'switchProfile', profileId: 'direct' });
    } catch {
      // 忽略后台异常
    }
    await chrome.storage.local.clear();
    await chrome.storage.session.clear();
    location.reload();
  };

  return (
    <div className="tab-container">
      {/* WebRTC 隐私保护 */}
      <div className="tab-header-row">
        <h2 className="tab-title">
          <Shield size={17} style={{ color: 'var(--primary)' }} />
          <span>WebRTC 隐私防护</span>
        </h2>
      </div>
      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="row-between">
          <div>
            <b>禁用非代理 UDP 协议 (disable_non_proxied_udp)</b>
            <div className="muted small" style={{ marginTop: '3px' }}>
              通过 Chromium 原生隐私策略阻止 WebRTC / STUN 请求直连本机公网 IP，防止网络指纹追踪（可能影响部分网页音视频连线通话）。
            </div>
          </div>
          <Switch
            checked={settings.webrtcProtect}
            onChange={(v) => patch({ webrtcProtect: v })}
          />
        </div>
      </div>

      {/* 流量判定校验策略 */}
      <div className="tab-header-row">
        <h2 className="tab-title">
          <Zap size={17} style={{ color: 'var(--accent)' }} />
          <span>流量判定校验策略 (Traffic Validation Policy)</span>
        </h2>
        <div className="muted small" style={{ marginTop: '2px' }}>
          基于安全性与访问效率的权衡，支持 1 至 4 等级平滑滑动切换
        </div>
      </div>

      {(() => {
        const curLevelId = settings.trafficValidationLevel || 'relaxed';
        const curIndex = POLICY_LEVELS.findIndex((item) => item.id === curLevelId);
        const curLevel = POLICY_LEVELS[curIndex >= 0 ? curIndex : 1];

        return (
          <div className="policy-slider-card" style={{ marginBottom: '16px' }}>
            {/* 滑块头部：当前等级与简要概述 */}
            <div className="policy-slider-header">
              <div className="row-between" style={{ alignItems: 'flex-start' }}>
                <div className="row" style={{ gap: '10px' }}>
                  <div
                    className="policy-level-badge"
                    style={{
                      background: `linear-gradient(135deg, ${curLevel.color} 0%, rgba(255,255,255,0.18) 100%)`,
                      boxShadow: `0 2px 10px ${curLevel.color}40`,
                    }}
                  >
                    <span>L{curLevel.level}</span>
                  </div>
                  <div>
                    <div className="row" style={{ gap: '8px', alignItems: 'center' }}>
                      <b style={{ fontSize: '15.5px', color: 'var(--text-main)' }}>
                        第 {curLevel.level} 等级：{curLevel.name}
                      </b>
                      <span className={`tag ${curLevel.badgeClass}`} style={{ fontSize: '11px' }}>
                        {curLevel.badge}
                      </span>
                    </div>
                    <div className="muted small" style={{ marginTop: '2px', fontSize: '11.5px' }}>
                      滑动右上角滑块快速切换保护等级
                    </div>
                  </div>
                </div>

                {/* 紧凑微型四档滑块 (内嵌 4 个虚线刻度点) */}
                <div
                  className="policy-mini-slider"
                  title={`当前为第 ${curLevel.level} 等级：${curLevel.name} (滑动或点击 1~4 档微调)`}
                >
                  <div className="policy-mini-track-wrap">
                    {(() => {
                      const displayLevelNum = dragLevel ?? curLevel.level;
                      const isDisplayUltra = displayLevelNum === 4;
                      return (
                        <div
                          className="policy-mini-track-inner"
                          style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center' }}
                          onMouseMove={(e) => {
                            if (isDragging) {
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
                            // 若悬停在小滑块所在当前档位，则不触发小点放大，保持滑块纯净覆盖
                            if (closest === displayLevelNum - 1) {
                              setHoveredTick(null);
                            } else {
                              setHoveredTick(closest);
                            }
                          }}
                          onMouseLeave={() => setHoveredTick(null)}
                        >
                          <div className="policy-mini-track">
                            {/* 渐变流光填充槽（从绿到红，第4等级激活 ChatGPT Ultra 流光星晶无缝向左流动动效） */}
                            <div
                              className={`policy-mini-track-fill ${isDisplayUltra ? 'track-fill-ultra' : ''} ${
                                isDragging ? 'no-transition' : ''
                              }`}
                              style={{
                                width: `calc(13px + (100% - 26px) * ${((displayLevelNum - 1) / 3)})`,
                                background: `linear-gradient(90deg, #10b981 0%, #84cc16 33%, #f59e0b 66%, #ef4444 100%)`,
                              }}
                            >
                              {isDisplayUltra && (
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
                            {/* 4 个刻度小点（未填充前灰调清晰可见，支持 Hover 放大与点击控制） */}
                            <div className="policy-mini-ticks">
                              {[0, 1, 2, 3].map((idx) => {
                                const isPassed = displayLevelNum >= idx + 1;
                                const targetLevel = POLICY_LEVELS[idx];
                                const isHovered = hoveredTick === idx;
                                return (
                                  <button
                                    type="button"
                                    key={idx}
                                    className={`policy-mini-tick ${isPassed ? 'tick-active' : 'tick-inactive'} ${
                                      isHovered ? 'tick-hover' : ''
                                    }`}
                                    style={{
                                      left: `calc(13px + (100% - 26px) * ${idx / 3})`,
                                    }}
                                    title={`点击直达第 ${targetLevel.level} 等级：${targetLevel.name}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDragLevel(null);
                                      patch({ trafficValidationLevel: targetLevel.id });
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
                            }}
                          />
                          {/* 原生隐藏滑块，处于顶层零延迟响应拖拽与精准点击 */}
                          <input
                            type="range"
                            min={1}
                            max={4}
                            step={1}
                            value={displayLevelNum}
                            onPointerDown={() => setIsDragging(true)}
                            onPointerUp={() => {
                              setIsDragging(false);
                            }}
                            onInput={(e) => {
                              setIsDragging(true);
                              const val = Number((e.target as HTMLInputElement).value);
                              setDragLevel(val);
                            }}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setDragLevel(null);
                              setIsDragging(false);
                              const targetLevel = POLICY_LEVELS[val - 1];
                              if (targetLevel) patch({ trafficValidationLevel: targetLevel.id });
                            }}
                            className="policy-mini-native-input"
                            aria-label="流量判定校验策略等级"
                          />
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>

            {/* 当前等级高亮详情卡片 */}
            <div
              className="policy-detail-card"
              style={{
                borderLeft: `3.5px solid ${curLevel.color}`,
                background: `radial-gradient(120% 120% at 0% 0%, ${curLevel.color}14 0%, var(--bg-card) 70%)`,
              }}
            >
              <div className="row-between" style={{ marginBottom: '8px' }}>
                <div className="row" style={{ gap: '6px' }}>
                  <Sliders size={14} style={{ color: curLevel.color }} />
                  <b style={{ fontSize: '13.5px', color: 'var(--text-main)' }}>
                    策略执行逻辑解读
                  </b>
                </div>
                {/* 强度与效率双维刻度计 */}
                {(() => {
                  const secColor = getSecurityScoreColor(curLevel.securityScore);
                  const spdColor = getSpeedScoreColor(curLevel.speedScore);

                  return (
                    <div className="row policy-scores-row" style={{ gap: '16px' }}>
                      <div className="row small" style={{ gap: '6px' }}>
                        <span className="muted" style={{ fontSize: '11px' }}>安全防护:</span>
                        <div className="score-bars" title={`安全防护评级: ${curLevel.securityScore}/5`}>
                          {[1, 2, 3, 4, 5].map((s) => (
                            <span
                              key={s}
                              className={`score-bar ${s <= curLevel.securityScore ? 'score-bar-filled' : ''}`}
                              style={{
                                backgroundColor: s <= curLevel.securityScore ? secColor : 'var(--border-subtle)',
                                boxShadow: s <= curLevel.securityScore ? `0 0 5px ${secColor}40` : 'none',
                              }}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="row small" style={{ gap: '6px' }}>
                        <span className="muted" style={{ fontSize: '11px' }}>直通速度:</span>
                        <div className="score-bars" title={`访问直通效率评级: ${curLevel.speedScore}/5`}>
                          {[1, 2, 3, 4, 5].map((s) => (
                            <span
                              key={s}
                              className={`score-bar ${s <= curLevel.speedScore ? 'score-bar-filled' : ''}`}
                              style={{
                                backgroundColor: s <= curLevel.speedScore ? spdColor : 'var(--border-subtle)',
                                boxShadow: s <= curLevel.speedScore ? `0 0 5px ${spdColor}40` : 'none',
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="small" style={{ lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                {curLevel.desc}
              </div>

              <div
                className="small policy-scene-box"
                style={{
                  marginTop: '8px',
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-muted)',
                }}
              >
                <Sparkles size={12} style={{ color: curLevel.color, flex: 'none', marginRight: '4px' }} />
                <span>{curLevel.scene}</span>
              </div>
            </div>

            {/* 高级策略参数配置：伴随拦截模式动态展开/隐藏，始终保留全局定时复检设置菜单 */}
            <div style={{ marginTop: '16px', borderTop: '1px dashed var(--border-card)', paddingTop: '14px' }}>
              <div className="row-between" style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>
                  高级策略参数配置
                </div>
              </div>
              <div className="form-grid">
                {/* 始终保留：全局定时复检时间间隔设置菜单，默认 30 分钟 */}
                <label className={`field ${curLevel.id === 'sampling' || curLevel.id === 'relaxed' ? 'full' : ''}`}>
                  <span className="field-label">全局定时复检时间间隔设置菜单（默认 30 分钟）</span>
                  <div className="row" style={{ gap: '8px', alignItems: 'center' }}>
                    <select
                      style={{ flex: isCustom ? '1 1 52%' : '1 1 100%' }}
                      value={isCustom ? 'custom' : (settings.recheckMinutes ?? 30)}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'custom') {
                          setIsCustomRecheck(true);
                          if (RECHECK_PRESETS.includes(settings.recheckMinutes ?? 30)) {
                            patch({ recheckMinutes: 20 });
                          }
                        } else {
                          setIsCustomRecheck(false);
                          patch({ recheckMinutes: Number(val) });
                        }
                      }}
                    >
                      <option value={0}>0 分钟 (关闭定时复检，仅按需触发)</option>
                      <option value={5}>5 分钟 (高频防断流漂移)</option>
                      <option value={10}>10 分钟</option>
                      <option value={15}>15 分钟</option>
                      <option value={30}>30 分钟 (推荐默认)</option>
                      <option value={45}>45 分钟</option>
                      <option value={60}>60 分钟 (1 小时)</option>
                      <option value={120}>120 分钟 (2 小时)</option>
                      <option value={240}>240 分钟 (4 小时)</option>
                      <option value="custom">✏️ 自定义输入分钟数…</option>
                    </select>
                    {isCustom && (
                      <div className="row" style={{ flex: '1 1 48%', gap: '6px', alignItems: 'center' }}>
                        <input
                          type="number"
                          min={1}
                          max={1440}
                          step={1}
                          style={{ flex: 1 }}
                          placeholder="输入分钟数 (1~1440)"
                          value={settings.recheckMinutes ?? 20}
                          onChange={(e) =>
                            patch({
                              recheckMinutes: Math.max(1, Math.min(1440, Number(inputValue(e)) || 1)),
                            })
                          }
                        />
                        <span className="muted small" style={{ flex: 'none' }}>分钟</span>
                      </div>
                    )}
                  </div>
                  <span className="field-hint">
                    后台全局静默周期复检出口 IP 与连通性，防范节点断网或异地漂移（默认 30 分钟）。
                  </span>
                </label>

                {/* 严格模式专属动态显示 */}
                {curLevel.id === 'strict' && (
                  <>
                    <label className="field">
                      <span className="field-label">严格模式页内资源宽容放行数（条，默认 5 条）</span>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        step={1}
                        value={settings.strictToleranceCount ?? 5}
                        onChange={(e) =>
                          patch({ strictToleranceCount: Math.max(1, Math.min(50, Number(inputValue(e)) || 5)) })
                        }
                      />
                      <span className="field-hint">严格模式单标签页验证通过该数量页内资源后放行后续请求，避免页面不可用</span>
                    </label>
                    <label className="field full">
                      <span className="field-label">严格模式页内放行周期复检间隔（分钟，默认 5 分钟）</span>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        step={1}
                        value={settings.strictRecheckMinutes ?? 5}
                        onChange={(e) =>
                          patch({ strictRecheckMinutes: Math.max(1, Math.min(60, Number(inputValue(e)) || 5)) })
                        }
                      />
                      <span className="field-hint">严格模式页内资源宽容放行后，每隔此分钟在后台静默复检出口 IP，若异常则配合拦截</span>
                    </label>
                  </>
                )}

                {/* 时间画像模式专属动态显示 */}
                {curLevel.id === 'time_window' && (
                  <label className="field">
                    <span className="field-label">时间画像免检窗口时长（分钟，默认 60 分钟）</span>
                    <input
                      type="number"
                      min={5}
                      max={1440}
                      step={5}
                      value={settings.timeWindowMinutes ?? 60}
                      onChange={(e) =>
                        patch({ timeWindowMinutes: Math.max(5, Math.min(1440, Number(inputValue(e)) || 60)) })
                      }
                    />
                    <span className="field-hint">第四等级时间画像生效时，在此窗口期内访问同一站点免除二次首屏验证</span>
                  </label>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 落地 IP 检测源 */}
      <div className="row-between tab-header-row">
        <div>
          <h2 className="tab-title">
            <Activity size={17} />
            <span>落地 IP 检测源容灾配置</span>
          </h2>
          <div className="muted small" style={{ marginTop: '2px' }}>
            用于双栈失败时的备用回退源，按顺序串行探测
          </div>
        </div>
        <button
          className="btn btn-sm"
          onClick={() => setAddingChecker(!addingChecker)}
        >
          <Plus size={14} />
          <span>自定义检测源</span>
        </button>
      </div>

      {addingChecker && (
        <CheckerForm
          onSave={(c) => {
            patch({ checkers: [...settings.checkers, c] });
            setAddingChecker(false);
          }}
          onCancel={() => setAddingChecker(false)}
        />
      )}

      <div className="card o-list" style={{ marginBottom: '16px' }}>
        {settings.checkers.map((c) => {
          const isTesting = testingId === c.id;
          return (
            <div className="o-row" key={c.id}>
              <Switch
                checked={c.enabled}
                onChange={(v) => patchChecker(c.id, { enabled: v })}
              />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="row" style={{ gap: '8px' }}>
                  <b>{c.name}</b>
                  {c.builtin && <span className="tag tag-muted">内置预设</span>}
                </div>
                <div className="muted small mono ellipsis" style={{ marginTop: '2px' }}>
                  {c.url}
                </div>
                {testResults[c.id] && (
                  <div
                    className="small mono"
                    style={{
                      marginTop: '4px',
                      color: testResults[c.id].startsWith('✓') ? 'var(--ok)' : 'var(--danger)',
                    }}
                  >
                    {testResults[c.id]}
                  </div>
                )}
              </div>
              <div className="row" style={{ gap: '6px' }}>
                <button
                  className="btn btn-sm"
                  disabled={isTesting}
                  onClick={() => void testChecker(c)}
                  title="测试接口连通性"
                >
                  <Play size={12} className={isTesting ? 'spin-icon' : ''} />
                  <span>{isTesting ? '测试中' : '连通测试'}</span>
                </button>
                {!c.builtin && (
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() =>
                      patch({
                        checkers: settings.checkers.filter((x) => x.id !== c.id),
                      })
                    }
                    title="删除检测源"
                  >
                    <Trash2 size={12} />
                    <span>删除</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 探测超时与放行响应参数 */}
      <div className="tab-header-row">
        <h2 className="tab-title">
          <Clock size={17} />
          <span>探测超时与放行响应参数</span>
        </h2>
      </div>
      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="form-grid">
          <label className="field">
            <span className="field-label">单源检测超时时间（毫秒）</span>
            <input
              type="number"
              min={1000}
              max={30000}
              step={500}
              value={settings.timeoutMs}
              onChange={(e) =>
                patch({ timeoutMs: Math.max(1000, Number(inputValue(e)) || 5000) })
              }
            />
            <span className="field-hint">超时后将自动无缝降级尝试下一个备用检测源</span>
          </label>
          <label className="field">
            <span className="field-label">安全检测通过后自动返回原网站延迟（秒，默认 3 秒）</span>
            <input
              type="number"
              min={1}
              max={30}
              step={1}
              value={settings.passRedirectDelaySec ?? 3}
              onChange={(e) =>
                patch({
                  passRedirectDelaySec: Math.max(1, Math.min(30, Number(inputValue(e)) || 3)),
                })
              }
            />
            <span className="field-hint">
              安全核验通过后，落地页展示放行结果并等待自动返回目标网站的倒计时时长（默认 3 秒）。给程序与网络连接留出充足的确认时间。
            </span>
          </label>
        </div>
      </div>

      {/* 习惯学习与阈值配置 */}
      <div className="tab-header-row">
        <h2 className="tab-title">
          <Sparkles size={17} />
          <span>习惯学习与推荐阈值</span>
        </h2>
      </div>
      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px' }}>
          <Switch
            checked={settings.habitEnabled}
            onChange={(v) => patch({ habitEnabled: v })}
            label="启用习惯访问统计（仅在本地设备记录 域名 × 落地国家 × 访问日期）"
          />
          <Switch
            checked={settings.notifySuggestions}
            onChange={(v) => patch({ notifySuggestions: v })}
            label="识别出高频且固定的落地习惯时，主动弹出建议通知"
          />
        </div>

        <div className="form-grid">
          <label className="field">
            <span className="field-label">统计时间滑动窗口（天）</span>
            <input
              type="number"
              min={3}
              max={90}
              value={settings.suggestWindowDays}
              onChange={(e) =>
                patch({ suggestWindowDays: Math.max(3, Number(inputValue(e)) || 5) })
              }
            />
          </label>
          <label className="field">
            <span className="field-label">最少访问天数阈值</span>
            <input
              type="number"
              min={2}
              max={60}
              value={settings.suggestMinDays}
              onChange={(e) =>
                patch({ suggestMinDays: Math.max(2, Number(inputValue(e)) || 3) })
              }
            />
          </label>
          <label className="field full">
            <span className="field-label">主导国家占比阈值（%）</span>
            <input
              type="number"
              min={50}
              max={100}
              value={Math.round(settings.suggestRatio * 100)}
              onChange={(e) => {
                const n = Math.min(100, Math.max(50, Number(inputValue(e)) || 90));
                patch({ suggestRatio: n / 100 });
              }}
            />
            <span className="field-hint">
              当某国家地区访问频次占该域名总访问天数的比例高于此值时，触发绑定建议。
            </span>
          </label>
        </div>
      </div>

      {/* 数据管理与备份恢复 */}
      <div className="tab-header-row">
        <h2 className="tab-title">
          <Sliders size={17} />
          <span>本地数据备份与导入恢复</span>
        </h2>
      </div>
      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="row" style={{ flexWrap: 'wrap', gap: '8px' }}>
          <button className="btn btn-primary" onClick={() => void exportData()}>
            <Download size={14} />
            <span>导出完整数据备份 (JSON)</span>
          </button>
          <label className="btn" style={{ cursor: 'pointer' }}>
            <Upload size={14} />
            <span>从 JSON 备份文件恢复…</span>
            <input
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = (e.currentTarget as HTMLInputElement).files?.[0];
                if (f) void importData(f);
                (e.currentTarget as HTMLInputElement).value = '';
              }}
            />
          </label>
        </div>
        {importMsg && (
          <div
            className="small"
            style={{
              marginTop: '10px',
              fontWeight: 500,
              color: importMsg.type === 'ok' ? 'var(--ok)' : 'var(--danger)',
            }}
          >
            {importMsg.text}
          </div>
        )}
        <div className="muted small" style={{ marginTop: '8px' }}>
          插件中保存的代理节点密码与记事本隐私信息均仅保留在本地存储中，导出的 JSON 文件为纯文本，请妥善保管。
        </div>
      </div>

      {/* 危险操作区 */}
      <div className="card danger-zone">
        <div className="row-between">
          <div>
            <b style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertTriangle size={15} />
              <span>危险重置：清空所有插件数据</span>
            </b>
            <div className="muted small" style={{ marginTop: '2px' }}>
              彻底删除所有代理档案、守护规则、备忘录与历史统计，并立即退回直连模式。
            </div>
          </div>
          <button className="btn btn-danger" onClick={() => void clearAll()}>
            <Trash2 size={14} />
            <span>清除所有数据</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function CheckerForm({
  onSave,
  onCancel,
}: {
  onSave: (c: CheckerConfig) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [ipPath, setIpPath] = useState('ip');
  const [countryPath, setCountryPath] = useState('country_code');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!name.trim()) return setError('请填写检测源名称');
    if (!/^https:\/\//i.test(url.trim())) return setError('URL 必须以 https:// 开头');
    if (!ipPath.trim() || !countryPath.trim()) {
      return setError('请填写 IP 与国家代码的 JSON 键路径');
    }
    onSave({
      id: crypto.randomUUID(),
      name: name.trim(),
      url: url.trim(),
      ipPath: ipPath.trim(),
      countryPath: countryPath.trim(),
      enabled: true,
    });
  };

  return (
    <div className="card checker-form-card" style={{ marginBottom: '12px' }}>
      <div className="o-section-title" style={{ marginBottom: '10px' }}>
        添加自定义落地检测接口
      </div>
      <div className="form-grid">
        <label className="field">
          <span className="field-label">检测源名称</span>
          <input
            type="text"
            value={name}
            placeholder="如：自定义 IP 接口"
            onChange={(e) => setName(inputValue(e))}
          />
        </label>
        <label className="field">
          <span className="field-label">接口 URL (需返回 JSON 响应)</span>
          <input
            type="text"
            value={url}
            placeholder="https://api.example.com/geoip"
            onChange={(e) => setUrl(inputValue(e))}
          />
        </label>
        <label className="field">
          <span className="field-label">IP 字段路径</span>
          <input
            type="text"
            value={ipPath}
            placeholder="如：ip 或 data.ip"
            onChange={(e) => setIpPath(inputValue(e))}
          />
        </label>
        <label className="field">
          <span className="field-label">国家代码字段路径</span>
          <input
            type="text"
            value={countryPath}
            placeholder="如：country_code 或 country"
            onChange={(e) => setCountryPath(inputValue(e))}
          />
        </label>
      </div>
      {error && <div className="field-error">{error}</div>}
      <div className="form-actions">
        <button className="btn btn-sm" onClick={onCancel}>
          取消
        </button>
        <button className="btn btn-sm btn-primary" onClick={submit}>
          添加检测源
        </button>
      </div>
    </div>
  );
}
