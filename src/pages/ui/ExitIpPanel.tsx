import { useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Globe,
  RefreshCw,
  WifiOff,
} from 'lucide-react';
import { countryName } from '../../shared/countries';
import type { CheckState, ExitIpResult } from '../../shared/types';
import { Flag } from './components';
import { timeAgo } from './util';

/** 落地 IP 状态面板：双栈展示，地理以 V4 为准，V4/V6 国家不一致时告警 */
export function ExitIpPanel({
  checkState,
  busy,
  onRecheck,
}: {
  checkState: CheckState | undefined;
  busy?: boolean;
  onRecheck?: () => void;
}) {
  const result = checkState?.status === 'ok' ? checkState.result : undefined;
  const isChecking = busy || checkState?.status === 'checking';

  return (
    <section
      className={`card exit-panel-card ${
        result?.stackMismatch ? 'exit-panel-mismatch' : ''
      }`}
    >
      <div className="exit-panel-header row-between">
        <div className="row" style={{ gap: '6px' }}>
          <Globe size={15} className="muted" />
          <span className="exit-panel-caption">落地网络状态</span>
        </div>
        {onRecheck && (
          <button
            className="btn btn-ghost btn-sm btn-recheck"
            disabled={isChecking}
            onClick={onRecheck}
            title="重新检测落地 IP"
          >
            <RefreshCw
              size={13}
              className={isChecking ? 'spin-icon' : ''}
            />
            <span>{isChecking ? '检测中' : '刷新'}</span>
          </button>
        )}
      </div>

      {checkState?.status === 'checking' && (
        <div className="exit-loading-state">
          <div className="row" style={{ gap: '10px' }}>
            <span className="spinner" />
            <div>
              <div className="status-main">正在探测出口落地 IP…</div>
              <div className="muted small">验证完成前，敏感站点保持拦截守护</div>
            </div>
          </div>
        </div>
      )}

      {checkState?.status === 'ok' && result && <ExitIpBody result={result} />}

      {checkState?.status === 'error' && (
        <div className="exit-error-state">
          <div className="row" style={{ gap: '8px', color: 'var(--danger)' }}>
            <WifiOff size={18} />
            <div className="status-main">无法确认落地 IP</div>
          </div>
          <div className="muted small" style={{ marginTop: '4px' }}>
            {checkState.error}
          </div>
          <div className="tag tag-danger" style={{ marginTop: '8px' }}>
            守护站点已全面锁定（Fail-Closed 模式生效中）
          </div>
        </div>
      )}

      {(!checkState || checkState.status === 'idle') && (
        <div className="muted small" style={{ padding: '8px 0' }}>
          尚未完成落地 IP 探测，请点击右上角刷新按钮。
        </div>
      )}
    </section>
  );
}

function ExitIpBody({ result }: { result: ExitIpResult }) {
  const geoCc = result.countryCode;
  const mismatch = !!result.stackMismatch;

  return (
    <div className="exit-ip">
      <div className="row exit-ip-head">
        <div className="exit-flag-wrapper">
          <Flag cc={geoCc} size={32} />
        </div>
        <div className="grow">
          <div className="row" style={{ gap: '6px' }}>
            <span className="status-main">{countryName(geoCc)}</span>
            <span className="tag tag-primary mono" style={{ fontSize: '11px' }}>
              {geoCc.toUpperCase()}
            </span>
          </div>
          <div className="muted small ellipsis" style={{ marginTop: '2px' }}>
            地理位置以 IPv4 为准
            {result.city || result.isp
              ? ` · ${[result.city, result.isp].filter(Boolean).join(' · ')}`
              : ''}
          </div>
        </div>
      </div>

      <div className={`stack-grid ${mismatch ? 'stack-grid-mismatch' : ''}`}>
        <StackRow
          label="IPv4"
          ip={result.ipv4}
          cc={result.ipv4CountryCode}
          primary
          warn={mismatch}
        />
        <StackRow
          label="IPv6"
          ip={result.ipv6}
          cc={result.ipv6CountryCode}
          warn={mismatch}
        />
      </div>

      {mismatch && (
        <div className="banner banner-warn stack-mismatch-banner">
          <AlertTriangle size={15} />
          <div>
            <span>IPv4 与 IPv6 落地国家不一致：</span>
            {result.ipv4CountryCode && (
              <span style={{ marginLeft: '4px' }}>
                V4=<Flag cc={result.ipv4CountryCode} size={13} withName />
              </span>
            )}
            {result.ipv6CountryCode && (
              <span style={{ marginLeft: '6px' }}>
                V6=<Flag cc={result.ipv6CountryCode} size={13} withName />
              </span>
            )}
            <div className="muted small" style={{ marginTop: '2px' }}>
              规则校验以 IPv4 为准，请注意潜在的双栈泄漏风险。
            </div>
          </div>
        </div>
      )}

      <div className="row-between muted small exit-meta">
        <span className="ellipsis">源：{result.source}</span>
        <span>{timeAgo(result.checkedAt)}</span>
      </div>
    </div>
  );
}

function StackRow({
  label,
  ip,
  cc,
  primary,
  warn,
}: {
  label: string;
  ip?: string;
  cc?: string;
  primary?: boolean;
  warn?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copyIp = (text: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className={`stack-row ${warn && ip && cc ? 'stack-row-warn' : ''} ${
        primary ? 'stack-row-primary' : ''
      }`}
    >
      <span className="stack-label">{label}</span>
      {ip ? (
        <div className="row grow" style={{ gap: '6px', minWidth: 0 }}>
          {cc && <Flag cc={cc} size={13} />}
          <span className="mono small stack-ip grow" title={ip}>
            {ip}
          </span>
          {cc && <span className="muted small">{cc}</span>}
          <button
            className="btn btn-ghost btn-icon btn-copy-ip"
            title="复制 IP"
            onClick={() => copyIp(ip)}
          >
            {copied ? (
              <Check size={12} style={{ color: 'var(--ok)' }} />
            ) : (
              <Copy size={12} className="muted" />
            )}
          </button>
        </div>
      ) : (
        <span className="muted small">未检测到</span>
      )}
    </div>
  );
}
