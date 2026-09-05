import { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Lock,
  PauseCircle,
  RotateCcw,
  Server,
  Settings as SettingsIcon,
  Shield,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { BUILTIN_PROFILES } from '../../shared/constants';
import { sendCmd, type LevelOfControlInfo } from '../../shared/messages';
import type { ProfileCheckResult, ProxyProfile } from '../../shared/types';
import { Flag, GUARD_STATUS_META, ProfileBadge, StatusDot } from '../ui/components';
import { ExitIpPanel } from '../ui/ExitIpPanel';
import {
  useActiveProfileId,
  useCheckState,
  useGuardStates,
  useProfileChecks,
  useProfiles,
  useSettings,
  useSites,
  useSuggestions,
} from '../ui/hooks';

export function App() {
  const profiles = useProfiles();
  const activeId = useActiveProfileId();
  const profileChecks = useProfileChecks() ?? {};
  const sites = useSites();
  const guardStates = useGuardStates();
  const checkState = useCheckState();
  const suggestions = useSuggestions();
  const settings = useSettings();

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [control, setControl] = useState<LevelOfControlInfo | null>(null);

  useEffect(() => {
    void sendCmd<LevelOfControlInfo>({ type: 'getLevelOfControl' })
      .then(setControl)
      .catch(() => undefined);
  }, []);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const switchTo = (id: string) =>
    run(`switch:${id}`, () => sendCmd({ type: 'switchProfile', profileId: id }));

  const enabledSites = (sites ?? []).filter((s) => s.enabled);
  const anyBypass = Object.values(guardStates ?? {}).some((s) => s.status === 'bypass');
  const suggestion = (suggestions ?? [])[0];
  const webrtcOn = settings?.webrtcProtect !== false;

  return (
    <div className="popup">
      {/* 头部品牌栏 */}
      <header className="popup-header">
        <div className="row" style={{ gap: '10px' }}>
          <div className="popup-logo-badge">
            <ShieldCheck size={18} className="popup-logo-icon" />
          </div>
          <div>
            <div className="row" style={{ gap: '6px' }}>
              <h1 className="popup-title">Proxy Protect</h1>
              <span className="popup-version">
                v{chrome.runtime.getManifest().version}
              </span>
            </div>
            <div className="popup-sub muted small">智能代理切换 · 域名落地 IP 守护</div>
          </div>
        </div>
        <div className="row popup-header-actions">
          <span
            className={`chip ${webrtcOn ? 'chip-ok' : 'chip-muted'}`}
            title={
              webrtcOn
                ? 'WebRTC Protect 开启：禁用非代理 UDP 协议，防止公网 IP 泄漏'
                : 'WebRTC Protect 已关闭'
            }
          >
            <Shield size={11} />
            <span>WebRTC {webrtcOn ? '开启' : '关闭'}</span>
          </span>
          <button
            className="btn btn-ghost btn-icon"
            title="打开插件控制中心"
            onClick={() => chrome.runtime.openOptionsPage()}
          >
            <SettingsIcon size={16} />
          </button>
        </div>
      </header>

      {/* 控制权警告横幅 */}
      {control && !control.controlled && (
        <div className="banner banner-danger">
          <AlertCircle size={15} />
          <div className="grow small">
            代理设置受策略或其他扩展控制（{control.levelOfControl}），本插件切换可能受限。
          </div>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="banner banner-danger">
          <AlertTriangle size={15} />
          <div className="grow small">{error}</div>
        </div>
      )}

      {/* 双栈落地 IP 核心监控卡 */}
      <ExitIpPanel
        checkState={checkState}
        busy={busy !== null}
        onRecheck={() => void run('recheck', () => sendCmd({ type: 'recheckIp' }))}
      />

      {/* 智能习惯推荐卡片 */}
      {suggestion && (
        <div className="banner banner-info suggestion-banner">
          <Sparkles size={16} style={{ color: 'var(--primary)', flex: 'none' }} />
          <div className="grow small">
            检测到经常访问 <b>{suggestion.domain}</b>，建议绑定期望地区{' '}
            <Flag cc={suggestion.countryCode} withName />
          </div>
          <div className="row" style={{ gap: '6px', width: '100%', justifyContent: 'flex-end', marginTop: '4px' }}>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() =>
                run('suggest', () =>
                  sendCmd({ type: 'dismissSuggestion', domain: suggestion.domain }),
                )
              }
            >
              忽略
            </button>
            <button
              className="btn btn-sm btn-primary"
              onClick={() =>
                run('suggest', () =>
                  sendCmd({
                    type: 'acceptSuggestion',
                    domain: suggestion.domain,
                    countryCode: suggestion.countryCode,
                  }),
                )
              }
            >
              一键绑定
            </button>
          </div>
        </div>
      )}

      {/* 代理档案列表 */}
      <section className="popup-section">
        <div className="row-between section-title-row">
          <div className="section-title">
            <Server size={12} />
            <span>代理档案节点</span>
          </div>
          <span className="muted small">
            {(profiles ?? []).length + BUILTIN_PROFILES.length} 个节点
          </span>
        </div>
        <div className="card list-card">
          {BUILTIN_PROFILES.map((b) => (
            <ProfileRow
              key={b.id}
              name={b.name}
              desc={b.desc}
              lastCheck={profileChecks[b.id]}
              active={activeId === b.id}
              busy={busy === `switch:${b.id}`}
              onClick={() => switchTo(b.id)}
            />
          ))}
          {(profiles ?? []).map((p) => (
            <ProfileRow
              key={p.id}
              name={p.name}
              desc={`${p.scheme}://${p.host}:${p.port}`}
              color={p.color}
              icon={p.icon}
              scheme={p.scheme}
              authed={!!p.auth}
              lastCheck={p.lastCheck ?? profileChecks[p.id]}
              active={activeId === p.id}
              busy={busy === `switch:${p.id}`}
              onClick={() => switchTo(p.id)}
            />
          ))}
          {(profiles ?? []).length === 0 && (
            <div className="empty-inline muted small">
              暂无自定义代理档案，点击右上角设置添加
            </div>
          )}
        </div>
      </section>

      {/* 域名守护规则状态 */}
      <section className="popup-section">
        <div className="row-between section-title-row">
          <div className="section-title">
            <Shield size={12} />
            <span>域名安全守护 ({enabledSites.length})</span>
          </div>
          {enabledSites.length > 0 &&
            (anyBypass ? (
              <button
                className="btn btn-sm btn-ghost"
                style={{ color: 'var(--purple)', fontWeight: 600 }}
                disabled={busy !== null}
                onClick={() => run('relock', () => sendCmd({ type: 'relockAll' }))}
              >
                <RotateCcw size={12} />
                <span>立即恢复锁定</span>
              </button>
            ) : (
              <button
                className="btn btn-sm btn-ghost muted"
                disabled={busy !== null}
                title="临时放行全部守护站点 5 分钟"
                onClick={() => {
                  if (confirm('确定暂停全部守护 5 分钟？期间将不再阻断任何受保护站点的异常访问。')) {
                    void run('pause', () => sendCmd({ type: 'pauseGuard', minutes: 5 }));
                  }
                }}
              >
                <PauseCircle size={12} />
                <span>暂停 5 分钟</span>
              </button>
            ))}
        </div>
        <div className="card list-card">
          {enabledSites.map((site) => {
            const st = guardStates?.[site.id];
            const meta = st ? GUARD_STATUS_META[st.status] : undefined;
            return (
              <div className="list-row site-row" key={site.id}>
                <StatusDot status={st?.status} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="ellipsis site-domain">{site.domainPattern}</div>
                  <div className="muted small ellipsis" title={st?.reason ?? ''}>
                    {st?.status === 'bypass' && st.bypassUntil
                      ? `放行中，约 ${Math.max(
                          1,
                          Math.ceil((st.bypassUntil - Date.now()) / 60000),
                        )} 分钟后恢复`
                      : st?.reason ?? meta?.label ?? '正在就绪'}
                  </div>
                </div>
                <div className="row site-flags">
                  {site.expectedCountries.map((cc) => (
                    <Flag key={cc} cc={cc} size={16} />
                  ))}
                </div>
              </div>
            );
          })}
          {enabledSites.length === 0 && (
            <div className="empty-inline muted small">
              暂未配置守护站点。在「控制中心 → 守护规则」中添加。
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function ProfileRow(props: {
  name: string;
  desc: string;
  color?: string;
  icon?: string;
  scheme?: ProxyProfile['scheme'];
  authed?: boolean;
  lastCheck?: ProfileCheckResult;
  active: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`list-row profile-row ${props.active ? 'profile-active' : ''}`}
      disabled={props.busy}
      onClick={props.onClick}
    >
      <ProfileBadge icon={props.icon} color={props.color} size={18} />
      <div className="grow" style={{ textAlign: 'left', minWidth: 0 }}>
        <div className="row" style={{ gap: '6px', flexWrap: 'wrap' }}>
          <span className="ellipsis profile-name">{props.name}</span>
          {props.scheme && (
            <span className="tag tag-primary mono" style={{ fontSize: '10px' }}>
              {props.scheme.toUpperCase()}
            </span>
          )}
          {props.authed && (
            <span className="tag tag-warn" style={{ fontSize: '10px' }}>
              <Lock size={9} />
              认证
            </span>
          )}
          {props.lastCheck?.countryCode && (
            <span
              className="tag tag-ok row"
              style={{ gap: '3px', fontSize: '10px', padding: '1px 5px' }}
              title={`上次落地：${props.lastCheck.ip}`}
            >
              <Flag cc={props.lastCheck.countryCode} size={11} />
              <span>{props.lastCheck.countryCode.toUpperCase()}</span>
            </span>
          )}
        </div>
        <div className="muted small ellipsis mono" style={{ marginTop: '1px' }}>
          {props.desc}
        </div>
      </div>
      {props.busy ? (
        <span className="spinner" style={{ width: '13px', height: '13px' }} />
      ) : props.active ? (
        <div className="profile-active-check">
          <Check size={14} />
        </div>
      ) : null}
    </button>
  );
}
