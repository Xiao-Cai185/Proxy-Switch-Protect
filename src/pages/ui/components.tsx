import { useState } from 'react';
import { Inbox } from 'lucide-react';
import { countryName } from '../../shared/countries';
import { flagPngUrl, flagSvgUrl } from '../../shared/flags';
import type { GuardStatus } from '../../shared/types';

/** SVG 国旗（Windows 下旗帜 Emoji 常无法显示） */
export function Flag({
  cc,
  withName = false,
  size = 16,
}: {
  cc: string;
  withName?: boolean;
  size?: number;
}) {
  const [stage, setStage] = useState<'svg' | 'png' | 'text'>('svg');
  const svg = flagSvgUrl(cc);
  const png = flagPngUrl(cc, Math.max(40, size * 3));
  const title = `${countryName(cc)}（${cc.toUpperCase()}）`;
  const h = Math.round(size * 0.75);
  const src = stage === 'svg' ? svg : stage === 'png' ? png : null;

  return (
    <span className="flag" title={title}>
      {src ? (
        <img
          className="flag-img"
          src={src}
          alt={cc.toUpperCase()}
          width={size}
          height={h}
          loading="lazy"
          onError={() => setStage((s) => (s === 'svg' ? 'png' : 'text'))}
        />
      ) : (
        <span className="flag-fallback">{cc.toUpperCase()}</span>
      )}
      {withName && <span className="flag-name">{countryName(cc)}</span>}
    </span>
  );
}

export const GUARD_STATUS_META: Record<
  GuardStatus,
  { label: string; className: string }
> = {
  allowed: { label: '已放行', className: 'dot-ok' },
  locked: { label: '已锁定', className: 'dot-danger' },
  checking: { label: '验证中', className: 'dot-warn dot-pulse' },
  bypass: { label: '临时放行', className: 'dot-bypass' },
};

export function StatusDot({ status }: { status: GuardStatus | undefined }) {
  const meta = status ? GUARD_STATUS_META[status] : undefined;
  return (
    <span
      className={`dot ${meta?.className ?? 'dot-muted'}`}
      title={meta?.label ?? '未启用'}
    />
  );
}

export function Empty({
  text,
  icon: Icon = Inbox,
}: {
  text: string;
  icon?: React.ComponentType<{ className?: string; size?: number }>;
}) {
  return (
    <div className="empty">
      <Icon className="empty-icon" size={28} />
      <span>{text}</span>
    </div>
  );
}

/** iOS 风格平滑 Switch 开关 */
export function Switch({
  checked,
  onChange,
  disabled = false,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <label className="pp-switch">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="pp-switch-track">
        <span className="pp-switch-thumb" />
      </span>
      {label && <span className="small">{label}</span>}
    </label>
  );
}

/** 代理节点应用 Icon 或色彩圆点徽章 */
export function ProfileBadge({
  icon,
  color,
  size = 18,
}: {
  icon?: string;
  color?: string;
  size?: number;
}) {
  if (icon === 'v2ray') {
    return (
      <img
        src="/icons/v2rayn-icon.ico"
        alt="V2RayN"
        width={size}
        height={size}
        style={{ borderRadius: 3, objectFit: 'contain', flexShrink: 0 }}
      />
    );
  }
  if (icon === 'clash') {
    return (
      <img
        src="/icons/Clash-Verge.ico"
        alt="Clash Verge"
        width={size}
        height={size}
        style={{ borderRadius: 3, objectFit: 'contain', flexShrink: 0 }}
      />
    );
  }
  return (
    <span
      className="profile-color-pip"
      style={{
        backgroundColor: color ?? 'var(--border-card)',
        width: Math.max(8, Math.round(size * 0.45)),
        height: Math.max(8, Math.round(size * 0.45)),
      }}
    />
  );
}
