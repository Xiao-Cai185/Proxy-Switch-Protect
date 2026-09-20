import { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  ChevronDown,
  ExternalLink,
  Globe,
  Lock,
  PauseCircle,
  PenLine,
  RotateCcw,
  Server,
  Settings as SettingsIcon,
  Shield,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { BUILTIN_PROFILES } from '../../shared/constants';
import { urlMatchesDomain } from '../../shared/matchers';
import { sendCmd, type LevelOfControlInfo } from '../../shared/messages';
import { loadSites, saveSites } from '../../shared/storage';
import type {
  GuardState,
  ProfileCheckResult,
  ProtectedSite,
  ProxyProfile,
  TrafficValidationLevel,
} from '../../shared/types';
import { Flag, GUARD_STATUS_META, ProfileBadge, StatusDot } from '../ui/components';
import { ExitIpPanel } from '../ui/ExitIpPanel';
import { hexToRgba } from '../ui/util';
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
  const [currentTab, setCurrentTab] = useState<{
    url: string;
    domain: string;
    title: string;
  } | null>(null);

  useEffect(() => {
    void sendCmd<LevelOfControlInfo>({ type: 'getLevelOfControl' })
      .then(setControl)
      .catch(() => undefined);

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const t = tabs[0];
      if (t?.url) {
        try {
          const u = new URL(t.url);
          if (u.protocol === 'http:' || u.protocol === 'https:') {
            setCurrentTab({
              url: t.url,
              domain: u.hostname,
              title: t.title || u.hostname,
            });
          }
        } catch {
          // ignore
        }
      }
    });
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
  const detectedIp = checkState?.result?.ipv4 || checkState?.result?.ip;

  const activeProfile = (profiles ?? []).find((p) => p.id === activeId);
  const activeColor =
    activeProfile?.color ||
    (activeId === 'direct' ? '#10b981' : activeId === 'system' ? '#64748b' : '#3b82f6');

  const popupThemeStyle = {
    '--active-theme-color': activeColor,
    '--active-theme-glow': hexToRgba(activeColor, 0.22),
    '--active-theme-surface': hexToRgba(activeColor, 0.08),
  } as React.CSSProperties;

  return (
    <div className="popup" style={popupThemeStyle}>
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

      {/* 当前站点一键加护卡片 */}
      <CurrentSiteGuardCard
        currentTab={currentTab}
        sites={sites}
        guardStates={guardStates}
        checkState={checkState}
        activeId={activeId}
        profiles={profiles}
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
              color={b.id === 'direct' ? '#10b981' : '#64748b'}
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

      {/* 整个 Proxy Protect 卡片的 Footer：网络隐私与质量检测工具集（在域名安全守护板块之后） */}
      <footer className="popup-footer exit-toolkit">
        <div
          className="muted small"
          style={{ marginBottom: '6px', fontSize: '11px', fontWeight: 500 }}
        >
          网络隐私与质量检测工具集：
        </div>
        <div className="row" style={{ gap: '6px', flexWrap: 'wrap' }}>
          <a
            href="https://ip.net.coffee/"
            target="_blank"
            rel="noreferrer"
            className="btn btn-sm btn-ghost"
            style={{
              fontSize: '11px',
              padding: '3px 8px',
              borderRadius: '6px',
              border: '1px solid var(--border-card)',
            }}
            title="一键 IP 欺诈度质量评分与 DNS 泄露检测"
          >
            <ExternalLink size={11} />
            <span>IP 质量 / DNS 泄露</span>
          </a>
          {detectedIp && (
            <a
              href={`https://www.ip2location.com/${detectedIp}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-sm btn-ghost"
              style={{
                fontSize: '11px',
                padding: '3px 8px',
                borderRadius: '6px',
                border: '1px solid var(--border-card)',
              }}
              title="IP2Location 深度 IP 归属与 ASN 运营商查询"
            >
              <ExternalLink size={11} />
              <span>IP2Location 归属</span>
            </a>
          )}
          <a
            href="https://browserleaks.com/webrtc"
            target="_blank"
            rel="noreferrer"
            className="btn btn-sm btn-ghost"
            style={{
              fontSize: '11px',
              padding: '3px 8px',
              borderRadius: '6px',
              border: '1px solid var(--border-card)',
            }}
            title="检测浏览器 WebRTC STUN/ICE 本机真实公网 IP 穿透泄露"
          >
            <ExternalLink size={11} />
            <span>WebRTC 穿透检测</span>
          </a>
        </div>
      </footer>
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
  const rowColor = props.color || '#3b82f6';
  const activeStyle = props.active
    ? ({
        '--profile-active-bg': `linear-gradient(90deg, ${hexToRgba(rowColor, 0.16)} 0%, ${hexToRgba(rowColor, 0.03)} 100%)`,
        '--profile-active-border': hexToRgba(rowColor, 0.38),
        '--profile-active-shadow': `0 2px 10px ${hexToRgba(rowColor, 0.14)}`,
        background: `linear-gradient(90deg, ${hexToRgba(rowColor, 0.16)} 0%, ${hexToRgba(rowColor, 0.03)} 100%)`,
        borderColor: hexToRgba(rowColor, 0.38),
        boxShadow: `0 2px 10px ${hexToRgba(rowColor, 0.14)}`,
      } as React.CSSProperties)
    : undefined;

  return (
    <button
      className={`list-row profile-row ${props.active ? 'profile-active' : ''}`}
      style={activeStyle}
      disabled={props.busy}
      onClick={props.onClick}
    >
      <ProfileBadge icon={props.icon} color={rowColor} size={18} />
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
              style={{ gap: '4px', fontSize: '10px', padding: '1px 5px' }}
              title={`上次落地：${props.lastCheck.ip}${props.lastCheck.rttMs ? ` · 往返延迟：${props.lastCheck.rttMs}ms` : ''}`}
            >
              <Flag cc={props.lastCheck.countryCode} size={11} />
              <span>{props.lastCheck.countryCode.toUpperCase()}</span>
              {typeof props.lastCheck.rttMs === 'number' && (
                <span
                  className="mono"
                  style={{
                    fontWeight: 600,
                    padding: '0 3px',
                    borderRadius: '3px',
                    background:
                      props.lastCheck.rttMs < 250
                        ? 'rgba(34, 197, 94, 0.15)'
                        : props.lastCheck.rttMs < 800
                        ? 'rgba(245, 158, 11, 0.18)'
                        : 'rgba(239, 68, 68, 0.18)',
                    color:
                      props.lastCheck.rttMs < 250
                        ? 'var(--ok)'
                        : props.lastCheck.rttMs < 800
                        ? 'var(--warn)'
                        : 'var(--danger)',
                  }}
                  title={`往返延迟 RTT：${props.lastCheck.rttMs}ms`}
                >
                  {props.lastCheck.rttMs}ms
                </span>
              )}
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
        <div
          className="profile-active-check"
          style={{
            backgroundColor: rowColor,
            boxShadow: `0 2px 8px ${hexToRgba(rowColor, 0.45)}`,
          }}
        >
          <Check size={14} />
        </div>
      ) : null}
    </button>
  );
}

function CurrentSiteGuardCard(props: {
  currentTab: { url: string; domain: string; title: string } | null;
  sites: ProtectedSite[] | undefined;
  guardStates: Record<string, GuardState> | undefined;
  checkState: ReturnType<typeof useCheckState>;
  activeId: string | null | undefined;
  profiles: ProxyProfile[] | undefined;
}) {
  const { currentTab, sites, guardStates, checkState, activeId, profiles } = props;
  const [strictMode, setStrictMode] = useState<'country' | 'subnet' | 'ip'>('country');
  const [policyLevel, setPolicyLevel] = useState<TrafficValidationLevel | 'default'>('default');
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteEmail, setNoteEmail] = useState('');
  const [noteAlias, setNoteAlias] = useState('');
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState(false);

  if (!currentTab) return null;

  const matchingSite = (sites ?? []).find((s) =>
    urlMatchesDomain(currentTab.url, s.domainPattern),
  );

  const activeProfileName =
    activeId === 'direct'
      ? '直连模式'
      : activeId === 'system'
      ? '系统代理'
      : profiles?.find((p) => p.id === activeId)?.name ?? '自定义节点';

  const checkResult = checkState?.status === 'ok' ? checkState.result : undefined;

  const handleAddGuard = async () => {
    if (!checkResult) return;
    setSaving(true);
    try {
      const cc = checkResult.countryCode;
      let ipRanges: string[] = [];
      if (strictMode === 'subnet' && checkResult.ipv4) {
        const parts = checkResult.ipv4.split('.');
        if (parts.length === 4) {
          ipRanges = [`${parts[0]}.${parts[1]}.${parts[2]}.0/24`];
        }
      } else if (strictMode === 'ip' && checkResult.ip) {
        ipRanges = [`${checkResult.ip}/32`];
      }

      const autoText = `于 ${new Date().toLocaleDateString()} 一键加护，当前代理：${activeProfileName}（${checkResult.ip}）`;
      const combinedText = noteText.trim()
        ? `${noteText.trim()}\n(${autoText})`
        : autoText;

      const newSite: ProtectedSite = {
        id: crypto.randomUUID(),
        domainPattern: currentTab.domain,
        expectedCountries: [cc],
        expectedIpRanges: ipRanges,
        matchMode: 'all',
        validationLevel: policyLevel === 'default' ? undefined : policyLevel,
        enabled: true,
        note: {
          email: noteEmail.trim() || undefined,
          alias: noteAlias.trim() || undefined,
          text: combinedText,
          regions: [cc],
          updatedAt: Date.now(),
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const cur = await loadSites();
      await saveSites([...cur, newSite]);
    } finally {
      setSaving(false);
    }
  };

  if (matchingSite) {
    const st = guardStates?.[matchingSite.id];
    return (
      <div className="card current-site-card current-site-guarded">
        <div className="row-between">
          <div className="row" style={{ gap: '6px' }}>
            <ShieldCheck size={15} style={{ color: 'var(--ok)' }} />
            <span className="small bold" style={{ color: 'var(--ok)' }}>
              当前网站已受安全守护
            </span>
          </div>
          <div className="row" style={{ gap: '6px' }}>
            <span
              className={`tag ${
                st?.status === 'allowed'
                  ? 'tag-ok'
                  : st?.status === 'bypass'
                  ? 'tag-warn'
                  : 'tag-danger'
              }`}
              style={{ fontSize: '10.5px' }}
            >
              {st?.status === 'allowed'
                ? '安全放行中'
                : st?.status === 'bypass'
                ? '临时放行'
                : '拦截保护中'}
            </span>
            <span className="tag tag-muted" style={{ fontSize: '10px' }}>
              {matchingSite.validationLevel === 'strict'
                ? '严格'
                : matchingSite.validationLevel === 'sampling'
                ? '抽样'
                : matchingSite.validationLevel === 'relaxed'
                ? '宽松'
                : '全局策略'}
            </span>
          </div>
        </div>

        <div
          className="current-site-target-row"
          style={{ background: 'var(--ok-surface)', borderColor: 'var(--ok-glow)' }}
        >
          <div className="row" style={{ gap: '8px', minWidth: 0, flex: 1 }}>
            <Globe size={14} style={{ color: 'var(--ok)', flex: 'none' }} />
            <b
              className="mono ellipsis current-site-domain-text"
              style={{ color: 'var(--ok)' }}
              title={currentTab.domain}
            >
              {currentTab.domain}
            </b>
          </div>
          <div className="row site-flags" style={{ gap: '4px', flex: 'none' }}>
            {matchingSite.expectedCountries.map((cc) => (
              <Flag key={cc} cc={cc} size={14} withName />
            ))}
          </div>
        </div>

        {matchingSite.expectedIpRanges && matchingSite.expectedIpRanges.length > 0 && (
          <div className="muted small mono ellipsis" style={{ fontSize: '11px' }}>
            锁定网段：{matchingSite.expectedIpRanges.join(', ')}
          </div>
        )}

        {matchingSite.note &&
          (matchingSite.note.alias ||
            matchingSite.note.email ||
            matchingSite.note.text) && (
            <div
              className="muted small"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 10px',
                fontSize: '11px',
                display: 'flex',
                flexDirection: 'column',
                gap: '3px',
                marginTop: '4px',
              }}
            >
              <div className="row" style={{ gap: '8px', flexWrap: 'wrap' }}>
                {matchingSite.note.alias && (
                  <span>
                    别名：
                    <b style={{ color: 'var(--text-main)' }}>
                      {matchingSite.note.alias}
                    </b>
                  </span>
                )}
                {matchingSite.note.email && (
                  <span className="mono">
                    账号：{matchingSite.note.email}
                  </span>
                )}
              </div>
              {matchingSite.note.text && (
                <div
                  className="ellipsis"
                  title={matchingSite.note.text}
                  style={{ opacity: 0.85 }}
                >
                  {matchingSite.note.text}
                </div>
              )}
            </div>
          )}
      </div>
    );
  }

  // 计算当前 IP 前缀 /24
  const subnet24 = checkResult?.ipv4
    ? `${checkResult.ipv4.split('.').slice(0, 3).join('.')}.0/24`
    : undefined;

  return (
    <div className="card current-site-card">
      <div className="row-between">
        <div className="row" style={{ gap: '6px' }}>
          <Shield size={14} style={{ color: 'var(--primary)' }} />
          <span className="small bold">当前网站一键加护</span>
        </div>
        <span className="tag tag-warn" style={{ fontSize: '10.5px' }}>
          未受守护
        </span>
      </div>

      {/* 目标域名宽幅通栏 */}
      <div className="current-site-target-row">
        <div className="row" style={{ gap: '8px', minWidth: 0, flex: 1 }}>
          <Globe size={14} style={{ color: 'var(--primary)', flex: 'none' }} />
          <b className="mono ellipsis current-site-domain-text" title={currentTab.domain}>
            {currentTab.domain}
          </b>
        </div>
        <span className="muted small mono" style={{ fontSize: '10.5px', flex: 'none' }}>
          待录入规则
        </span>
      </div>

      {/* 当前网络环境上下文 */}
      <div className="current-site-env-box">
        <div className="current-site-env-row">
          <span className="muted" style={{ flex: 'none' }}>当前代理节点</span>
          <span
            className="bold ellipsis mono"
            style={{ maxWidth: '240px', textAlign: 'right' }}
            title={activeProfileName}
          >
            {activeProfileName}
          </span>
        </div>
        <div className="current-site-env-row">
          <span className="muted" style={{ flex: 'none' }}>当前出口落地</span>
          <div className="row" style={{ gap: '6px', flex: 'none' }}>
            <span className="mono bold">
              {checkResult
                ? checkResult.ip
                : checkState?.status === 'checking'
                ? '探测中…'
                : '未探测'}
            </span>
            {checkResult?.countryCode && (
              <Flag cc={checkResult.countryCode} size={13} withName />
            )}
          </div>
        </div>
      </div>

      <div className="row-between" style={{ margin: '2px 0 0' }}>
        <span className="muted small" style={{ fontSize: '11px' }}>
          设定规则保护粒度：
        </span>
        <span className="muted small mono" style={{ fontSize: '10.5px' }}>
          {strictMode === 'country'
            ? '标准国家地区'
            : strictMode === 'subnet'
            ? '同机房 /24 网段'
            : '精准单一 /32 IP'}
        </span>
      </div>

      <div className="strict-selector">
        <button
          type="button"
          className={`strict-btn ${strictMode === 'country' ? 'active' : ''}`}
          onClick={() => setStrictMode('country')}
          title="仅绑定出口国家地区，任何合规代理均可放行，适合动态住宅池"
        >
          <span className="strict-btn-name">标准国家</span>
          <span className="strict-btn-desc">
            {checkResult?.countryCode ? `限 ${checkResult.countryCode}` : '限当前国家'}
          </span>
        </button>
        <button
          type="button"
          disabled={!subnet24}
          className={`strict-btn ${strictMode === 'subnet' ? 'active' : ''}`}
          onClick={() => setStrictMode('subnet')}
          title="绑定国家与 /24 出口网段，防跨机房跳池"
        >
          <span className="strict-btn-name">同机房网段</span>
          <span className="strict-btn-desc">/24 网段</span>
        </button>
        <button
          type="button"
          disabled={!checkResult?.ip}
          className={`strict-btn ${strictMode === 'ip' ? 'active' : ''}`}
          onClick={() => setStrictMode('ip')}
          title="严格限定当前单一出口 IP (/32)，适合独享固定原生 IP"
        >
          <span className="strict-btn-name">单一出口</span>
          <span className="strict-btn-desc">单一 IP (/32)</span>
        </button>
      </div>

      {/* 账号备注可选表单切换与内容 */}
      <div className="current-site-note-section">
        <div className="row-between" style={{ padding: '0 2px' }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{
              padding: '3px 6px',
              fontSize: '11px',
              gap: '4px',
              color:
                showNoteForm || noteEmail || noteAlias || noteText
                  ? 'var(--primary)'
                  : 'var(--text-secondary)',
            }}
            onClick={() => setShowNoteForm((v) => !v)}
            title="点击展开/收起账号备注表单（可选录入）"
          >
            <PenLine size={11} />
            <span>
              {showNoteForm
                ? '收起账号备注备忘'
                : noteEmail || noteAlias || noteText
                ? '已填写账号备注 (点击修改)'
                : '＋ 填写账号备注备忘 (可选)'}
            </span>
            <ChevronDown
              size={11}
              style={{
                transform: showNoteForm ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.2s ease',
              }}
            />
          </button>
          <span className="muted small" style={{ fontSize: '10.5px' }}>
            {showNoteForm ? '可选 · 仅存本机' : ''}
          </span>
        </div>

        {showNoteForm && (
          <div className="current-site-note-box">
            <div className="current-site-note-grid">
              <input
                type="text"
                className="current-site-note-input"
                placeholder="登录邮箱 / 账号 (可选)"
                value={noteEmail}
                onChange={(e) => setNoteEmail(e.target.value)}
              />
              <input
                type="text"
                className="current-site-note-input"
                placeholder="账号别名 / 标识 (可选)"
                value={noteAlias}
                onChange={(e) => setNoteAlias(e.target.value)}
              />
            </div>
            <input
              type="text"
              className="current-site-note-input"
              placeholder="附加备忘说明 / 防封注意事项 (可选)"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
            />
            <div className="row-between" style={{ marginTop: '4px', fontSize: '11px' }}>
              <span className="muted">流量策略：</span>
              <div className="row" style={{ gap: '4px' }}>
                {[
                  { id: 'default' as const, label: '全局' },
                  { id: 'relaxed' as const, label: '宽松' },
                  { id: 'sampling' as const, label: '抽样' },
                  { id: 'strict' as const, label: '严格' },
                ].map((lvl) => (
                  <button
                    key={lvl.id}
                    type="button"
                    className={`btn btn-xs ${policyLevel === lvl.id ? 'btn-primary' : ''}`}
                    style={{
                      padding: '2px 6px',
                      fontSize: '10.5px',
                      borderRadius: '4px',
                      background: policyLevel === lvl.id ? 'var(--primary)' : 'rgba(255, 255, 255, 0.06)',
                      color: policyLevel === lvl.id ? '#ffffff' : 'var(--text-secondary)',
                      border: '1px solid var(--border-subtle)',
                    }}
                    onClick={() => setPolicyLevel(lvl.id)}
                  >
                    {lvl.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        className="btn btn-primary btn-add-guard"
        style={{
          width: '100%',
          justifyContent: 'center',
          marginTop: '2px',
          padding: '8px 12px',
        }}
        disabled={saving || !checkResult}
        onClick={() => void handleAddGuard()}
      >
        <ShieldCheck size={15} />
        <span>
          {saving
            ? '正在加护并写入规则…'
            : !checkResult
            ? '请等待出口 IP 探测就绪…'
            : `一键加护当前网站（${
                strictMode === 'country'
                  ? `限 ${checkResult.countryCode}`
                  : strictMode === 'subnet'
                  ? `限 ${checkResult.countryCode} · /24`
                  : `限 ${checkResult.countryCode} · 单一 IP`
              }）`}
        </span>
      </button>
    </div>
  );
}
