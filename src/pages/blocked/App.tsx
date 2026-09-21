import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Eye,
  EyeOff,
  Flame,
  Globe,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Unlock,
} from 'lucide-react';
import { DEFAULT_BYPASS_MINUTES } from '../../shared/constants';
import { countryName } from '../../shared/countries';
import { primaryMatchIp } from '../../shared/dual-stack';
import { ipInCidr } from '../../shared/matchers';
import { sendCmd, type VerifyTabResult } from '../../shared/messages';
import { Flag, ProfileBadge } from '../ui/components';
import {
  useActiveProfileId,
  useCheckState,
  useGuardStates,
  useProfileChecks,
  useProfiles,
  useSettings,
  useSites,
} from '../ui/hooks';
import { maskEmail, timeAgo } from '../ui/util';

/**
 * 解析拦截页参数。
 * from 由 DNR regexSubstitution 以原文追加（可能含 & 等字符），
 * 因此必须手动截取，不能直接用 URLSearchParams。
 */
function parseParams(): { siteId: string; from: string } {
  const q = location.search.startsWith('?') ? location.search.slice(1) : location.search;
  const siteMatch = /(?:^|&)site=([^&]*)/.exec(q);
  const siteId = siteMatch ? decodeURIComponent(siteMatch[1]) : '';
  const idx = q.indexOf('from=');
  let from = idx >= 0 ? q.slice(idx + 5) : '';
  if (from && !/^https?:\/\//i.test(from)) {
    try {
      const dec = decodeURIComponent(from);
      if (/^https?:\/\//i.test(dec)) from = dec;
      else from = '';
    } catch {
      from = '';
    }
  }
  return { siteId, from };
}

export function App() {
  const { siteId, from } = useMemo(parseParams, []);
  const sites = useSites();
  const guardStates = useGuardStates();
  const checkState = useCheckState();
  const settings = useSettings();
  const profiles = useProfiles() ?? [];
  const profileChecks = useProfileChecks() ?? {};
  const activeProfileId = useActiveProfileId();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEmail, setShowEmail] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [validating, setValidating] = useState(true);

  const targetDelaySec = Math.max(1, settings?.passRedirectDelaySec ?? 3);
  const [countdown, setCountdown] = useState<number>(3);

  const site = (sites ?? []).find((s) => s.id === siteId);
  const state = guardStates?.[siteId];
  const result = checkState?.status === 'ok' ? checkState.result : undefined;
  const webrtcOn = settings?.webrtcProtect !== false;

  // 页面加载首屏即刻安全核验当前新建标签页
  useEffect(() => {
    if (!siteId || !from) {
      setValidating(false);
      return;
    }

    let isMounted = true;
    void (async () => {
      try {
        const tab = await chrome.tabs.getCurrent();
        const tabId = tab?.id;
        if (typeof tabId === 'number' && tabId > 0) {
          const res = await sendCmd<VerifyTabResult>({
            type: 'verifyAndAllowTab',
            siteId,
            tabId,
          });
          if (!isMounted) return;
          if (res.pass) {
            setCountdown(targetDelaySec);
            setRedirecting(true);
            return;
          }
        }
      } catch {
        // 忽略异常，平滑展示拦截 UI
      } finally {
        if (isMounted) setValidating(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [siteId, from, targetDelaySec]);

  // 守护恢复（首屏核验完成之后，因用户自愈/手动重检/临时放行状态恢复）后自动加入白名单并跳回原页面
  useEffect(() => {
    if (!from || redirecting || validating) return;
    if (state?.status === 'allowed' || state?.status === 'bypass') {
      setCountdown(targetDelaySec);
      setRedirecting(true);
      void (async () => {
        try {
          const tab = await chrome.tabs.getCurrent();
          if (tab?.id) {
            await sendCmd({ type: 'verifyAndAllowTab', siteId, tabId: tab.id });
          }
        } catch {
          // ignore
        }
      })();
    }
  }, [state?.status, from, redirecting, validating, siteId, targetDelaySec]);

  // 倒计时管理器：当 redirecting 为 true 时每秒递减，归零时执行替换跳转
  useEffect(() => {
    if (!redirecting || !from) return;
    if (countdown <= 0) {
      location.replace(from);
      return;
    }
    const timer = setTimeout(() => {
      setCountdown((c) => c - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [redirecting, countdown, from]);

  const recheck = async () => {
    setBusy(true);
    setError(null);
    try {
      await sendCmd({ type: 'recheckIp' });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const forceAllow = async () => {
    if (!site) return;
    const ok = confirm(
      `确定要强行临时放行 ${site.domainPattern} 吗？\n\n` +
        `当前落地 IP 与该站点的期望地区不符。强行放行 ${DEFAULT_BYPASS_MINUTES} 分钟内该站点将不再受守护，` +
        `可能导致账号在异常异地 IP 下被访问从而触发风控。仅在明确了解风险时使用。`,
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await sendCmd({ type: 'forceAllow', siteId, minutes: DEFAULT_BYPASS_MINUTES });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  // 检索符合条件的可用代理候选（前提条件：有符合条件的代理才呈现一键自愈）
  const healingCandidate = useMemo(() => {
    if (!site) return null;
    for (const p of profiles) {
      if (p.id === activeProfileId) continue;
      const check = p.lastCheck ?? profileChecks[p.id];
      if (!check || !check.countryCode) continue;

      const countryPass = site.expectedCountries.length > 0
        ? site.expectedCountries.includes(check.countryCode.toUpperCase())
        : true;
      const ipPass = site.expectedIpRanges.length > 0
        ? site.expectedIpRanges.some((r) => ipInCidr(check.ip, r))
        : true;

      const isMatch = site.matchMode === 'all'
        ? countryPass && ipPass
        : site.expectedCountries.length > 0 && site.expectedIpRanges.length > 0
          ? countryPass || ipPass
          : countryPass && ipPass;

      if (isMatch) {
        return { profile: p, check };
      }
    }
    return null;
  }, [site, profiles, profileChecks, activeProfileId]);

  const handleHeal = async (targetProfileId: string) => {
    setBusy(true);
    setError(null);
    try {
      await sendCmd({ type: 'switchProfile', profileId: targetProfileId });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  // 综合风险评分与阻断原因深度评估
  const risk = useMemo(() => {
    if (!site) return null;

    const matchIp = result ? primaryMatchIp(result) : '';
    const hasCountry = site.expectedCountries.length > 0;
    const hasIp = site.expectedIpRanges.length > 0;
    const countryMatched = hasCountry && result
      ? site.expectedCountries.includes(result.countryCode.toUpperCase())
      : true;
    const ipMatched = hasIp && result
      ? site.expectedIpRanges.some((r) => ipInCidr(matchIp, r))
      : true;
    const isError = checkState?.status === 'error' || (!result && checkState?.status !== 'checking');

    // 判定是否属于放行通过状态
    const isExplicitAllowed = redirecting || state?.status === 'allowed' || state?.status === 'bypass';
    const isEnvCompliant = !isError && countryMatched && ipMatched && webrtcOn && !result?.stackMismatch && (hasCountry || hasIp);

    if (isExplicitAllowed || isEnvCompliant) {
      return {
        score: 100,
        level: 'safe' as const,
        levelText: '安全合规 · 准予通行',
        mismatchPill: '安全通过',
        isSafe: true,
        factors: [
          {
            title: '网络落地环境匹配',
            desc: `当前探测实际落地为 [${result?.countryCode ?? ''}]（${countryName(result?.countryCode ?? '')}），完全符合站点配置的安全放行策略。`,
            badge: '环境匹配',
            isDanger: false,
          },
        ],
      };
    }

    const factors: { title: string; desc: string; badge: string; isDanger: boolean }[] = [];
    let score = 40;

    if (isError) {
      score = 95;
      factors.push({
        title: '落地出口状态未知',
        desc: '无法验证当前代理真实出口，为防范真实 IP 泄露已执行强制安全阻断。',
        badge: '无法验证',
        isDanger: true,
      });
    } else {
      if (!countryMatched && hasCountry) {
        score += 30;
        if (result?.countryCode.toUpperCase() === 'CN') score += 15;
        factors.push({
          title: '落地地区不匹配',
          desc: `目标站点期望在 [${site.expectedCountries.join(', ')}] 访问，当前检测实际落地为 [${result?.countryCode}]（${countryName(result?.countryCode ?? '')}）。`,
          badge: '地区违规',
          isDanger: true,
        });
      }
      if (!ipMatched && hasIp) {
        score += 25;
        factors.push({
          title: '出口 IP 不在允许网段',
          desc: `当前出口 IP (${matchIp}) 未命中配置的安全网段 (${site.expectedIpRanges.join(', ')})。`,
          badge: 'IP违规',
          isDanger: true,
        });
      }
      if (!hasCountry && !hasIp) {
        score += 20;
        factors.push({
          title: '未配置任何期望放行规则',
          desc: '该受保护站点尚未配置任何允许的国家或 IP 网段，根据 Fail-Closed 策略全量阻断。',
          badge: '规则缺失',
          isDanger: false,
        });
      }
      if (!webrtcOn) {
        score += 30;
        factors.push({
          title: 'WebRTC 隐私防护未开启',
          desc: '浏览器 WebRTC 未开启保护（未禁用非代理 UDP），目标网页可通过 STUN 探测嗅探出本机真实公网 IP。',
          badge: 'WebRTC泄露风险',
          isDanger: true,
        });
      }
      if (result?.stackMismatch) {
        score += 15;
        factors.push({
          title: 'IPv4 / IPv6 落地国家不一致',
          desc: `IPv4 (${result.ipv4CountryCode}) 与 IPv6 (${result.ipv6CountryCode}) 国家不一致，存在明显双栈泄漏特征。`,
          badge: '双栈泄漏',
          isDanger: false,
        });
      }
      if (result?.isSplitTunnel) {
        score += 20;
        factors.push({
          title: '非全局代理（内外分流风险）',
          desc: `检测到代理开启了分流规则：访问国内走直连真实 IP (${result.domesticIp ?? '国内IP'})，访问海外走代理 (${result.ip})，部分请求可能绕过代理导致关联泄露。`,
          badge: '非全局代理',
          isDanger: true,
        });
      }
    }

    const finalScore = Math.min(99, Math.max(50, score));
    const level: 'critical' | 'high' | 'medium' =
      finalScore >= 80 ? 'critical' : finalScore >= 65 ? 'high' : 'medium';
    const levelText =
      level === 'critical'
        ? '极高风控风险 · 存在封号危险'
        : level === 'high'
          ? '高风控风险 · 建议切换节点'
          : '中等风险 · 存在安全隐患';

    let mismatchPill = '安全阻断';
    if (!countryMatched && !ipMatched && hasCountry && hasIp) {
      mismatchPill = '地区与 IP 均不匹配';
    } else if (!countryMatched && hasCountry) {
      mismatchPill = '地区不匹配';
    } else if (!ipMatched && hasIp) {
      mismatchPill = '出口 IP 不符合';
    } else if (!webrtcOn) {
      mismatchPill = 'WebRTC 保护未开启';
    }

    return {
      score: finalScore,
      level,
      levelText,
      mismatchPill,
      isSafe: false,
      factors,
    };
  }, [site, result, checkState?.status, webrtcOn, redirecting, state?.status]);

  return (
    <div className="blocked-layout">
      <div className={`blocked-card card ${redirecting ? 'blocked-card-success' : ''}`}>
        {/* 顶部安全盾牌徽标 */}
        <div className="blocked-shield-badge">
          {redirecting ? (
            <ShieldCheck size={36} className="blocked-shield-icon-success" />
          ) : (
            <ShieldAlert size={36} className="blocked-shield-icon" />
          )}
        </div>

        <h1 className="blocked-title">
          {redirecting
            ? `安全校验通过，${countdown > 0 ? `${countdown} 秒后` : ''}自动返回…`
            : validating
              ? '正在安全核验当前标签页网络环境…'
              : '访问请求已被 Proxy Protect 安全阻断'}
        </h1>

        {redirecting && (
          <div className="row center" style={{ gap: '10px', margin: '4px 0 14px', color: 'var(--ok)' }}>
            <span className="spinner" style={{ width: '15px', height: '15px', borderWidth: '2px', borderColor: 'var(--ok)', borderTopColor: 'transparent', display: 'inline-block' }} />
            <span className="small" style={{ fontWeight: 600 }}>底层放行白名单与网络规则已确认，即将进入…</span>
            <button
              className="btn btn-sm"
              style={{
                padding: '2px 10px',
                fontSize: '11px',
                background: 'var(--ok-surface)',
                color: 'var(--ok)',
                borderColor: 'var(--ok)',
                borderRadius: 'var(--radius-full)',
              }}
              onClick={() => location.replace(from)}
              title="不等待倒计时，立即跳回目标网站"
            >
              立即跳回
            </button>
          </div>
        )}

        {validating && !redirecting && (
          <div className="center" style={{ margin: '24px 0', textAlign: 'center' }}>
            <span className="spinner" style={{ width: '26px', height: '26px', display: 'inline-block' }} />
            <div className="muted small" style={{ marginTop: '10px' }}>
              正在确认代理落地国家与 WebRTC 安全状态，请稍候…
            </div>
          </div>
        )}

        {!validating && !site && (
          <div className="banner banner-warn" style={{ marginTop: '12px' }}>
            <AlertTriangle size={16} />
            <span className="small">
              未检索到对应的守护规则（可能已被删除）。请点击下方按钮前往设置页面检查。
            </span>
          </div>
        )}

        {!validating && site && (
          <>
            {redirecting || risk?.level === 'safe' ? (
              <p className="blocked-desc blocked-desc-success">
                目标站点 <b className="mono blocked-domain-tag">{site.domainPattern}</b> 地区守护核验通过。
                当前实际落地网络环境与期望完全一致，安全校验达标，正在自动返回目标网站…
              </p>
            ) : (
              <p className="blocked-desc">
                目标站点 <b className="mono blocked-domain-tag">{site.domainPattern}</b>{' '}
                已配置严格的地区守护。当前实际网络状态未满足放行要求，为防范账号触发异地风控或公网 IP 泄露，已在网络层强制拦截。
              </p>
            )}

            {/* 综合风险评分仪表盘卡片 */}
            {risk && (
              <div className={`blocked-risk-card risk-${risk.level}`}>
                <div className="risk-header row-between">
                  <div className="row" style={{ gap: '12px' }}>
                    <div className="risk-score-badge">
                      <span className="risk-score-num">{risk.score}</span>
                      <span className="risk-score-max">/100</span>
                    </div>
                    <div>
                      <div className="row" style={{ gap: '6px' }}>
                        {risk.level === 'safe' ? (
                          <ShieldCheck size={15} className="risk-shield-icon" />
                        ) : (
                          <Flame size={14} className="risk-fire-icon" />
                        )}
                        <span className="risk-level-title">{risk.levelText}</span>
                      </div>
                      <div className="muted small" style={{ marginTop: '2px' }}>
                        {risk.level === 'safe'
                          ? '系统检测到 0 项安全风险因子，当前网络完全满足放行策略'
                          : `系统检测到 ${risk.factors.length} 项触发安全阻断的危险风险因子`}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`tag ${
                      risk.level === 'safe'
                        ? 'tag-ok'
                        : risk.level === 'critical'
                          ? 'tag-danger'
                          : 'tag-warn'
                    }`}
                  >
                    {risk.mismatchPill}
                  </span>
                </div>

                <div className="risk-factors-list">
                  {risk.factors.map((f, i) => (
                    <div className="risk-factor-item" key={i}>
                      <div className="row" style={{ gap: '6px', marginBottom: '2px' }}>
                        <span
                          className={`tag ${f.isDanger ? 'tag-danger' : risk.level === 'safe' ? 'tag-ok' : 'tag-warn'}`}
                          style={{ fontSize: '10px' }}
                        >
                          {f.badge}
                        </span>
                        <b style={{ fontSize: '12.5px' }}>{f.title}</b>
                      </div>
                      <div className="muted small" style={{ lineHeight: 1.45 }}>
                        {f.desc}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 核心状态对比看板 */}
            <div className="blocked-compare-grid">
              {/* 当前实际落地 */}
              <div className="compare-panel compare-panel-current">
                <div className="compare-panel-caption row" style={{ gap: '6px' }}>
                  <Globe size={13} />
                  <span>当前探测落地</span>
                </div>
                {checkState?.status === 'checking' && (
                  <div className="compare-status-loading row" style={{ gap: '8px' }}>
                    <span className="spinner" />
                    <span>正在重新探测…</span>
                  </div>
                )}
                {checkState?.status === 'ok' && result && (
                  <div className="compare-value-box">
                    <div className="row" style={{ gap: '8px' }}>
                      <Flag cc={result.countryCode} size={28} />
                      <div>
                        <div className="compare-country-name">
                          {countryName(result.countryCode)}
                          <span
                            className={`tag ${risk?.level === 'safe' ? 'tag-ok' : 'tag-warn'} mono`}
                            style={{ marginLeft: '6px', fontSize: '10px' }}
                          >
                            {result.countryCode.toUpperCase()}
                          </span>
                        </div>
                        <div className="muted small mono">{result.ip}</div>
                      </div>
                    </div>
                    <div className="muted small" style={{ marginTop: '6px' }}>
                      {result.source} · {timeAgo(result.checkedAt)}
                    </div>
                  </div>
                )}
                {checkState?.status === 'error' && (
                  <div className="compare-value-box" style={{ color: 'var(--danger)' }}>
                    <b>无法确定落地出口 IP</b>
                    <div className="muted small" style={{ marginTop: '2px' }}>
                      {checkState.error}
                    </div>
                  </div>
                )}
                {(!checkState || checkState.status === 'idle') && (
                  <div className="muted small">尚未探测</div>
                )}
              </div>

              {/* 中间对比箭头 */}
              <div className="compare-divider">
                <div className={`compare-divider-icon ${risk?.level === 'safe' ? 'success' : ''}`}>
                  {risk?.level === 'safe' ? <ShieldCheck size={18} /> : <ArrowRight size={18} />}
                </div>
                <span className={risk?.level === 'safe' ? 'compare-match-pill' : 'compare-mismatch-pill'}>
                  {risk?.level === 'safe' ? '环境匹配' : (risk?.mismatchPill ?? '安全阻断')}
                </span>
              </div>

              {/* 期望合法落地 */}
              <div className="compare-panel compare-panel-expected">
                <div className="compare-panel-caption row" style={{ gap: '6px' }}>
                  <Lock size={13} />
                  <span>期望放行地区</span>
                </div>
                <div className="compare-value-box">
                  <div className="row" style={{ gap: '6px', flexWrap: 'wrap' }}>
                    {site.expectedCountries.map((cc) => (
                      <span className="tag tag-ok" key={cc} style={{ padding: '4px 8px' }}>
                        <Flag cc={cc} withName size={14} />
                      </span>
                    ))}
                  </div>
                  {site.expectedIpRanges.length > 0 && (
                    <div className="muted small mono" style={{ marginTop: '6px' }}>
                      允许网段：{site.expectedIpRanges.join('、')}
                    </div>
                  )}
                  <div className="muted small" style={{ marginTop: '6px' }}>
                    模式：{site.matchMode === 'all' ? '全部满足' : '任一匹配即可放行'}
                  </div>
                </div>
              </div>
            </div>

            {/* 智能一键修复自愈建议卡片（仅在检测到有符合条件的代理时呈现） */}
            {healingCandidate && (
              <div className="blocked-heal-card">
                <div className="row-between" style={{ flexWrap: 'wrap', gap: '8px' }}>
                  <div className="row" style={{ gap: '10px' }}>
                    <div className="heal-icon-badge">
                      <Sparkles size={18} className="heal-sparkle-icon" />
                    </div>
                    <div>
                      <div className="row" style={{ gap: '6px' }}>
                        <span className="heal-title">发现符合访问条件的代理节点</span>
                        <span className="tag tag-ok" style={{ fontSize: '10px' }}>
                          一键可自愈
                        </span>
                      </div>
                      <div className="muted small" style={{ marginTop: '2px' }}>
                        切换至该节点可直接通过安全校验并恢复目标网站访问
                      </div>
                    </div>
                  </div>
                  <button
                    className="btn btn-primary btn-heal"
                    disabled={busy}
                    onClick={() => void handleHeal(healingCandidate.profile.id)}
                    title="立即切换至符合条件的代理节点并自动恢复访问"
                  >
                    <Sparkles size={14} />
                    <span>一键切换并自动访问</span>
                  </button>
                </div>

                <div className="heal-target-box row-between">
                  <div className="row" style={{ gap: '10px' }}>
                    <ProfileBadge
                      icon={healingCandidate.profile.icon}
                      color={healingCandidate.profile.color}
                      size={24}
                    />
                    <div>
                      <div className="row" style={{ gap: '6px' }}>
                        <b>{healingCandidate.profile.name}</b>
                        <span className="tag tag-primary mono" style={{ fontSize: '10px' }}>
                          {healingCandidate.profile.scheme.toUpperCase()}
                        </span>
                        <Flag cc={healingCandidate.check.countryCode} withName size={13} />
                      </div>
                      <div className="muted small mono" style={{ marginTop: '2px' }}>
                        {healingCandidate.check.ip}
                        {healingCandidate.check.city && ` · ${healingCandidate.check.city}`}
                      </div>
                    </div>
                  </div>
                  <div className="row" style={{ gap: '6px' }}>
                    {healingCandidate.check.rttMs && (
                      <span className="tag tag-ok mono" style={{ fontSize: '10px' }}>
                        ⚡ {healingCandidate.check.rttMs}ms
                      </span>
                    )}
                    {!healingCandidate.check.isSplitTunnel && (
                      <span className="tag tag-ok" style={{ fontSize: '10px' }}>
                        全局代理
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {state?.reason && (
              <div className="banner banner-warn" style={{ marginTop: '12px' }}>
                <AlertCircle size={15} />
                <span className="small">{state.reason}</span>
              </div>
            )}

            {/* 关联备忘记事本信息 */}
            {site.note &&
              (site.note.email ||
                site.note.alias ||
                site.note.text ||
                (site.note.regions && site.note.regions.length > 0)) && (
                <div className="blocked-note-card">
                  <div className="row" style={{ gap: '6px', marginBottom: '8px' }}>
                    <BookOpen size={15} style={{ color: 'var(--primary)' }} />
                    <b style={{ fontSize: '13px' }}>该网站的安全备忘提示</b>
                  </div>
                  <div className="blocked-note-grid">
                    {site.note.alias && (
                      <div className="blocked-note-row">
                        <span className="muted">账号别名：</span>
                        <b>{site.note.alias}</b>
                      </div>
                    )}
                    {site.note.email && (
                      <div className="blocked-note-row row" style={{ gap: '6px' }}>
                        <span className="muted">登录邮箱：</span>
                        <span className="mono">
                          {showEmail ? site.note.email : maskEmail(site.note.email)}
                        </span>
                        <button
                          className="btn btn-ghost btn-icon"
                          title={showEmail ? '隐藏' : '显示'}
                          onClick={() => setShowEmail(!showEmail)}
                        >
                          {showEmail ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </div>
                    )}
                    {site.note.regions && site.note.regions.length > 0 && (
                      <div className="blocked-note-row row" style={{ gap: '6px', flexWrap: 'wrap' }}>
                        <span className="muted">惯用地区：</span>
                        {site.note.regions.map((cc) => (
                          <Flag key={cc} cc={cc} withName size={13} />
                        ))}
                      </div>
                    )}
                    {site.note.text && (
                      <div className="blocked-note-text">{site.note.text}</div>
                    )}
                  </div>
                </div>
              )}

            {error && (
              <div className="banner banner-danger" style={{ marginTop: '12px' }}>
                <AlertCircle size={15} />
                <span className="small">{error}</span>
              </div>
            )}

            {/* 核心操作按钮 */}
            <div className="blocked-actions-bar">
              <button
                className="btn btn-primary"
                disabled={busy || checkState?.status === 'checking'}
                onClick={() => void recheck()}
              >
                <RefreshCw size={14} className={busy ? 'spin-icon' : ''} />
                <span>重新检测 IP</span>
              </button>
              <button
                className="btn"
                disabled={busy}
                onClick={() => {
                  chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
                }}
                title="新建标签页打开插件控制中心"
              >
                <Sliders size={14} />
                <span>打开控制中心检查代理</span>
              </button>
              <button
                className="btn btn-ghost"
                disabled={busy}
                style={{ color: 'var(--text-muted)' }}
                onClick={() => void forceAllow()}
              >
                <Unlock size={14} />
                <span>强行放行 {DEFAULT_BYPASS_MINUTES} 分钟</span>
              </button>
            </div>

            <div className="muted small center" style={{ marginTop: '8px', textAlign: 'center' }}>
              请在控制中心检查代理或右上角小面板切换到正确国家并确保 WebRTC 保护已开启，检测通过后本页面将<b>自动跳回原网站</b>。
            </div>
          </>
        )}

        {from && (
          <div className="blocked-from-url muted small mono ellipsis" title={from}>
            拦截来源目标：{from}
          </div>
        )}
      </div>
    </div>
  );
}
