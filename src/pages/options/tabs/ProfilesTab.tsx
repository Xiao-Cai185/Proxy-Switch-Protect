import { useState } from 'react';
import {
  AlertCircle,
  Check,
  Edit3,
  Lock,
  Palette,
  Plus,
  RefreshCw,
  Server,
  Trash2,
} from 'lucide-react';
import { DEFAULT_BYPASS, PROFILE_COLORS } from '../../../shared/constants';
import { sendCmd } from '../../../shared/messages';
import { loadProfiles, saveProfiles } from '../../../shared/storage';
import type { ProfileCheckResult, ProxyProfile, ProxyScheme } from '../../../shared/types';
import { Empty, Flag, ProfileBadge } from '../../ui/components';
import { useActiveProfileId, useCheckState, useProfileChecks, useProfiles } from '../../ui/hooks';
import { inputValue, timeAgo } from '../../ui/util';

const SCHEMES: ProxyScheme[] = ['http', 'https', 'socks4', 'socks5'];

const TEMPLATES: Omit<ProxyProfile, 'id' | 'bypassList'>[] = [
  {
    name: 'V2RayN',
    scheme: 'socks5',
    host: '127.0.0.1',
    port: 10808,
    icon: 'v2ray',
    color: '#3b82f6',
  },
  {
    name: 'Clash Verge',
    scheme: 'socks5',
    host: '127.0.0.1',
    port: 7897,
    icon: 'clash',
    color: '#10b981',
  },
];

export function ProfilesTab() {
  const profiles = useProfiles() ?? [];
  const activeId = useActiveProfileId();
  const profileChecks = useProfileChecks() ?? {};
  const checkState = useCheckState();
  const [editing, setEditing] = useState<ProxyProfile | 'new' | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const save = async (p: ProxyProfile) => {
    const list = await loadProfiles();
    const idx = list.findIndex((x) => x.id === p.id);
    if (idx >= 0) list[idx] = p;
    else list.push(p);
    await saveProfiles(list);
    setEditing(null);
  };

  const remove = async (p: ProxyProfile) => {
    const hint =
      activeId === p.id
        ? `「${p.name}」正在使用中，删除后将自动退回直连。确定删除？`
        : `确定删除代理档案「${p.name}」？`;
    if (!confirm(hint)) return;
    const list = (await loadProfiles()).filter((x) => x.id !== p.id);
    await saveProfiles(list);
  };

  const switchToProfile = async (id: string) => {
    setTestingId(id);
    try {
      await sendCmd({ type: 'switchProfile', profileId: id });
    } catch (e) {
      alert(`切换代理失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTimeout(() => setTestingId(null), 1200);
    }
  };

  const checkProfileIp = async (p: ProxyProfile) => {
    setTestingId(p.id);
    try {
      if (activeId === p.id) {
        await sendCmd({ type: 'recheckIp' });
      } else {
        await sendCmd({ type: 'switchProfile', profileId: p.id });
      }
    } catch (e) {
      alert(`落地检测失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTimeout(() => setTestingId(null), 1200);
    }
  };

  return (
    <div className="tab-container">
      <div className="row-between tab-header-row" style={{ flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h2 className="tab-title">代理档案节点</h2>
          <div className="muted small" style={{ marginTop: '2px' }}>
            管理本地与远程代理配置，自动同步并展现上一次落地检测结果与国旗标记
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>
          <Plus size={15} />
          <span>新增代理档案</span>
        </button>
      </div>

      <div className="banner banner-info">
        <AlertCircle size={16} />
        <div className="small">
          修改使用中的代理档案会立即重新应用并同步触发落地 IP 验证与国旗更新。节点信息会跟随探测参数与周期刷新功能持续自动维护。
        </div>
      </div>

      {editing && (
        <ProfileForm
          initial={editing === 'new' ? null : editing}
          onSave={save}
          onCancel={() => setEditing(null)}
          onApplyTemplate={(tmpl) => {
            // 在表单中快捷套用
          }}
        />
      )}

      <div className="card o-list">
        {profiles.map((p) => {
          const isActive = activeId === p.id;
          const check: ProfileCheckResult | undefined = p.lastCheck ?? profileChecks[p.id];
          const isChecking =
            (isActive && checkState?.status === 'checking') || testingId === p.id;

          return (
            <div
              className={`o-row profile-item ${isActive ? 'o-row-active' : ''}`}
              key={p.id}
            >
              <ProfileBadge icon={p.icon} color={p.color} size={22} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="row" style={{ gap: '8px', flexWrap: 'wrap' }}>
                  <b className="profile-item-name">{p.name}</b>
                  <span className="tag tag-primary mono" style={{ fontSize: '10px' }}>
                    {p.scheme.toUpperCase()}
                  </span>
                  {p.auth && (
                    <span className="tag tag-warn" style={{ fontSize: '10px' }}>
                      <Lock size={9} />
                      认证
                    </span>
                  )}
                  {isActive && (
                    <span className="tag tag-ok" style={{ fontSize: '10px' }}>
                      <Check size={10} />
                      使用中
                    </span>
                  )}
                  {/* 落地国家与国旗标记 */}
                  {isChecking ? (
                    <span className="tag tag-warn row" style={{ gap: '4px', fontSize: '11px' }}>
                      <span className="spinner" style={{ width: 10, height: 10 }} />
                      <span>正在探测落地…</span>
                    </span>
                  ) : check?.countryCode ? (
                    <span
                      className="tag tag-ok row"
                      style={{ gap: '4px', fontSize: '11px', padding: '2px 8px' }}
                      title={`最近探测：${check.ip} (${check.city ?? ''}) · ${timeAgo(check.checkedAt)}`}
                    >
                      <Flag cc={check.countryCode} size={13} withName />
                      <span className="mono muted small" style={{ fontSize: '10.5px' }}>
                        {check.ip}
                      </span>
                    </span>
                  ) : (
                    <span className="tag tag-muted" style={{ fontSize: '10px' }}>
                      未探测落地
                    </span>
                  )}
                </div>
                <div className="muted small mono" style={{ marginTop: '3px' }}>
                  {p.host}:{p.port}
                  {p.bypassList.length > 0 && ` · 绕过 ${p.bypassList.length} 条白名单`}
                  {check?.checkedAt && ` · 上次校验于 ${timeAgo(check.checkedAt)}`}
                </div>
              </div>
              <div className="row" style={{ gap: '6px' }}>
                {!isActive ? (
                  <button
                    className="btn btn-sm btn-primary"
                    disabled={isChecking}
                    onClick={() => void switchToProfile(p.id)}
                    title="立即将浏览器代理切换至该档案节点"
                  >
                    <Check size={13} />
                    <span>切换到</span>
                  </button>
                ) : (
                  <button
                    className="btn btn-sm btn-ghost"
                    disabled
                    style={{ opacity: 0.9, cursor: 'default' }}
                    title="当前正在使用此代理节点"
                  >
                    <Check size={13} style={{ color: 'var(--success)' }} />
                    <span style={{ color: 'var(--success)', fontWeight: 600 }}>使用中</span>
                  </button>
                )}
                <button
                  className={`btn btn-sm ${isActive ? 'btn-ghost' : 'btn-outline'}`}
                  disabled={isChecking}
                  onClick={() => void checkProfileIp(p)}
                  title={isActive ? '重新检测当前激活代理的落地 IP' : '切换并检测该代理的落地 IP'}
                >
                  <RefreshCw size={13} className={isChecking ? 'spin' : ''} />
                  <span>{isChecking ? '检测中…' : '检测落地'}</span>
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() => setEditing(p)}
                  title="编辑档案"
                >
                  <Edit3 size={13} />
                  <span>编辑</span>
                </button>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => void remove(p)}
                  title="删除档案"
                >
                  <Trash2 size={13} />
                  <span>删除</span>
                </button>
              </div>
            </div>
          );
        })}
        {profiles.length === 0 && (
          <Empty
            text="暂无自定义代理档案，点击上方「新增代理档案」按钮添加"
            icon={Server}
          />
        )}
      </div>
    </div>
  );
}

function ProfileForm({
  initial,
  onSave,
  onCancel,
  onApplyTemplate,
}: {
  initial: ProxyProfile | null;
  onSave: (p: ProxyProfile) => Promise<void>;
  onCancel: () => void;
  onApplyTemplate: (tmpl: (typeof TEMPLATES)[number]) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [scheme, setScheme] = useState<ProxyScheme>(initial?.scheme ?? 'socks5');
  const [host, setHost] = useState(initial?.host ?? '');
  const [port, setPort] = useState(initial ? String(initial.port) : '');
  const [username, setUsername] = useState(initial?.auth?.username ?? '');
  const [password, setPassword] = useState(initial?.auth?.password ?? '');
  const [bypass, setBypass] = useState(
    (initial?.bypassList ?? DEFAULT_BYPASS).join('\n'),
  );
  const [color, setColor] = useState(initial?.color ?? PROFILE_COLORS[0]);
  const [icon, setIcon] = useState<string>(initial?.icon ?? '');
  const [error, setError] = useState<string | null>(null);

  const isSocks = scheme === 'socks4' || scheme === 'socks5';

  const applyTmpl = (t: (typeof TEMPLATES)[number]) => {
    setName(t.name);
    setScheme(t.scheme);
    setHost(t.host);
    setPort(String(t.port));
    setColor(t.color);
    setIcon(t.icon ?? '');
  };

  const submit = () => {
    const portNum = Number(port);
    if (!name.trim()) return setError('请填写档案名称');
    if (!host.trim() || /[\s/]/.test(host.trim())) return setError('请填写有效的服务器地址');
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      return setError('端口需为 1-65535 的有效整数');
    }
    const p: ProxyProfile = {
      id: initial?.id ?? crypto.randomUUID(),
      name: name.trim(),
      color,
      icon: icon || undefined,
      scheme,
      host: host.trim(),
      port: portNum,
      auth:
        username.trim() && !isSocks
          ? { username: username.trim(), password }
          : undefined,
      bypassList: bypass
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      lastCheck: initial?.lastCheck,
    };
    void onSave(p);
  };

  return (
    <div className="card profile-form-card" style={{ marginBottom: '14px' }}>
      <div className="row-between" style={{ marginBottom: '12px' }}>
        <div className="o-section-title">
          {initial?.id ? '编辑代理档案' : '新建代理档案'}
        </div>
        <div className="row" style={{ gap: '6px' }}>
          <span className="muted small">快捷套用：</span>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => applyTmpl(TEMPLATES[0])}
          >
            <img src="/icons/v2rayn-icon.ico" width={13} height={13} alt="" />
            <span>V2RayN</span>
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => applyTmpl(TEMPLATES[1])}
          >
            <img src="/icons/Clash-Verge.ico" width={13} height={13} alt="" />
            <span>Clash Verge</span>
          </button>
        </div>
      </div>

      <div className="form-grid">
        <label className="field">
          <span className="field-label">档案名称</span>
          <input
            type="text"
            value={name}
            placeholder="如：新加坡专线 或 V2RayN 本地节点"
            onChange={(e) => setName(inputValue(e))}
          />
        </label>
        <label className="field">
          <span className="field-label">代理协议</span>
          <select
            value={scheme}
            onChange={(e) => setScheme(inputValue(e) as ProxyScheme)}
          >
            {SCHEMES.map((s) => (
              <option key={s} value={s}>
                {s.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">服务器域名或 IP</span>
          <input
            type="text"
            value={host}
            placeholder="如：127.0.0.1 或 proxy.example.com"
            onChange={(e) => setHost(inputValue(e))}
          />
        </label>
        <label className="field">
          <span className="field-label">端口号 (1-65535)</span>
          <input
            type="number"
            min={1}
            max={65535}
            value={port}
            placeholder="如：10808 / 7897"
            onChange={(e) => setPort(inputValue(e))}
          />
        </label>
        <label className="field">
          <span className="field-label">用户名 (仅 HTTP/HTTPS)</span>
          <input
            type="text"
            value={username}
            disabled={isSocks}
            placeholder={isSocks ? 'SOCKS 协议暂不支持认证' : '可选用户名'}
            onChange={(e) => setUsername(inputValue(e))}
          />
          {isSocks && (
            <span className="field-hint">
              Chromium 浏览器不支持 SOCKS 认证，如有需求请用 gost 等工具中转
            </span>
          )}
        </label>
        <label className="field">
          <span className="field-label">密码 (仅 HTTP/HTTPS)</span>
          <input
            type="password"
            value={password}
            disabled={isSocks}
            placeholder={isSocks ? 'SOCKS 协议暂不支持认证' : '可选密码'}
            onChange={(e) => setPassword(inputValue(e))}
          />
        </label>
        <label className="field full">
          <span className="field-label">
            <span>不走代理的直连绕过列表 (Bypass List，每行一条)</span>
            <span className="muted small mono">&lt;local&gt;, *.cn 等</span>
          </span>
          <textarea
            value={bypass}
            rows={3}
            onChange={(e) => setBypass(inputValue(e))}
          />
        </label>

        {/* 节点图标与备注标记选择 */}
        <div className="field full" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }}>
          <span className="field-label">客户端图标与备注标记</span>
          <div className="row" style={{ gap: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* 软件应用 Logo 选项 */}
            <div className="row" style={{ gap: '8px' }}>
              <button
                type="button"
                className={`btn btn-sm ${!icon ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setIcon('')}
              >
                <span>默认色卡</span>
              </button>
              <button
                type="button"
                className={`btn btn-sm ${icon === 'v2ray' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setIcon('v2ray')}
              >
                <img src="/icons/v2rayn-icon.ico" width={14} height={14} alt="" />
                <span>V2RayN 图标</span>
              </button>
              <button
                type="button"
                className={`btn btn-sm ${icon === 'clash' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setIcon('clash')}
              >
                <img src="/icons/Clash-Verge.ico" width={14} height={14} alt="" />
                <span>Clash Verge 图标</span>
              </button>
            </div>

            {/* 色盘预设与自定义调色盘 */}
            <div className="row" style={{ gap: '6px', alignItems: 'center', marginLeft: 'auto' }}>
              <span className="muted small">色卡：</span>
              <div className="color-palette">
                {PROFILE_COLORS.map((c) => (
                  <button
                    type="button"
                    key={c}
                    className={`color-swatch ${color === c ? 'color-swatch-active' : ''}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setColor(c)}
                    title={c}
                  />
                ))}
              </div>
              {/* 原生自定义色盘取色器 */}
              <label
                className="color-swatch-custom"
                title="打开系统色盘自定义任意色彩"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  position: 'relative',
                  width: '26px',
                  height: '26px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px dashed var(--border-card)',
                  backgroundColor: color,
                }}
              >
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  style={{
                    position: 'absolute',
                    opacity: 0,
                    width: '100%',
                    height: '100%',
                    cursor: 'pointer',
                  }}
                />
                <Palette size={12} style={{ color: '#fff', filter: 'drop-shadow(0 0 2px #000)' }} />
              </label>
            </div>
          </div>
        </div>
      </div>

      {error && <div className="field-error">{error}</div>}
      <div className="form-actions">
        <button className="btn" onClick={onCancel}>
          取消
        </button>
        <button className="btn btn-primary" onClick={submit}>
          保存档案
        </button>
      </div>
    </div>
  );
}
