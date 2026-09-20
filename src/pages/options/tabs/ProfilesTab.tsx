import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Download,
  Edit3,
  Lock,
  Palette,
  Plus,
  RefreshCw,
  Server,
  Trash2,
  Upload,
} from 'lucide-react';
import { DEFAULT_BYPASS, PROFILE_COLORS } from '../../../shared/constants';
import { sendCmd } from '../../../shared/messages';
import { loadProfiles, saveProfiles } from '../../../shared/storage';
import type { ProfileCheckResult, ProxyProfile, ProxyScheme } from '../../../shared/types';
import { Empty, Flag, ProfileBadge } from '../../ui/components';
import { useActiveProfileId, useCheckState, useProfileChecks, useProfiles } from '../../ui/hooks';
import { downloadText, hexToRgba, inputValue, timeAgo } from '../../ui/util';

const SCHEMES: ProxyScheme[] = ['http', 'https', 'socks4', 'socks5'];

const TEMPLATES: Omit<ProxyProfile, 'id' | 'bypassList'>[] = [
  {
    name: 'V2RayN',
    scheme: 'socks5',
    host: '127.0.0.1',
    port: 10808,
    icon: 'v2ray',
    color: '#3B82F6',
  },
  {
    name: 'Clash Verge',
    scheme: 'socks5',
    host: '127.0.0.1',
    port: 7897,
    icon: 'clash',
    color: '#BAA5FD',
  },
];

export function ProfilesTab() {
  const profiles = useProfiles() ?? [];
  const activeId = useActiveProfileId();
  const profileChecks = useProfileChecks() ?? {};
  const checkState = useCheckState();
  const [editing, setEditing] = useState<ProxyProfile | 'new' | null>(null);
  const [isFormDirty, setIsFormDirty] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  // 安全切换或打开编辑档案的调度函数（检测修改并防丢）
  const requestEdit = (target: ProxyProfile | 'new') => {
    // 若点击的是当前正在编辑的同一个档案，无需切换
    if (editing && editing !== 'new' && target !== 'new' && editing.id === target.id) {
      return;
    }
    if (editing === 'new' && target === 'new') {
      return;
    }

    // 检测修改行为：如果当前表单已被修改过
    if (editing && isFormDirty) {
      const currentName =
        editing === 'new' ? '新建档案' : `「${editing.name}」`;
      const targetName =
        target === 'new' ? '新建代理档案' : `「${target.name}」`;
      const confirmed = window.confirm(
        `当前正在编辑的 ${currentName} 存在尚未保存的修改！\n\n` +
          `• 点击「确定」：放弃未保存的修改，直接切换到编辑 ${targetName}\n` +
          `• 点击「取消」：留在当前编辑表单中，以便您保存修改`,
      );
      if (!confirmed) {
        return; // 用户取消，保留在当前编辑表单
      }
    }

    // 若无修改行为或用户已确认放弃更改，直接无感切换
    setIsFormDirty(false);
    setEditing(target);
  };

  const handleCancelEdit = () => {
    if (isFormDirty) {
      const currentName =
        !editing || editing === 'new' ? '新建档案' : `「${editing.name}」`;
      if (
        !window.confirm(
          `当前正在编辑的 ${currentName} 存在尚未保存的修改，确定放弃并退出编辑？`,
        )
      ) {
        return;
      }
    }
    setIsFormDirty(false);
    setEditing(null);
  };

  const save = async (p: ProxyProfile) => {
    const list = await loadProfiles();
    const idx = list.findIndex((x) => x.id === p.id);
    if (idx >= 0) list[idx] = p;
    else list.push(p);
    await saveProfiles(list);
    setIsFormDirty(false);
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
    if (editing && editing !== 'new' && editing.id === p.id) {
      setIsFormDirty(false);
      setEditing(null);
    }
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
        await sendCmd<ProfileCheckResult>({ type: 'testProfile', profileId: p.id });
      }
    } catch (e) {
      alert(`落地检测失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTimeout(() => setTestingId(null), 800);
    }
  };

  const exportProfilesJson = () => {
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
      d.getDate(),
    ).padStart(2, '0')}`;
    downloadText(`proxy-profiles-backup-${stamp}.json`, JSON.stringify(profiles, null, 2));
  };

  const importProfilesJson = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      let incoming: ProxyProfile[] = [];
      if (Array.isArray(parsed)) {
        incoming = parsed;
      } else if (parsed && Array.isArray(parsed.profiles)) {
        incoming = parsed.profiles;
      } else {
        throw new Error('JSON 格式不符，需为代理档案数组或备份对象');
      }
      if (!incoming.length) throw new Error('文件中未包含任何有效代理档案');
      const cur = await loadProfiles();
      const merged = [...cur];
      let count = 0;
      for (const p of incoming) {
        if (!p.name || !p.host || !p.port || !p.scheme) continue;
        const exists = merged.findIndex((x) => x.id === p.id);
        if (exists >= 0) {
          merged[exists] = p;
        } else {
          merged.push({ ...p, id: p.id || crypto.randomUUID() });
        }
        count++;
      }
      await saveProfiles(merged);
      alert(`✓ 成功导入并合并 ${count} 个代理档案！`);
    } catch (e) {
      alert(`导入失败：${e instanceof Error ? e.message : String(e)}`);
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
        <div className="row" style={{ gap: '8px', flexWrap: 'wrap' }}>
          <button
            className="btn btn-sm btn-ghost"
            onClick={exportProfilesJson}
            title="导出当前所有代理档案为 JSON 文件"
          >
            <Download size={13} />
            <span>导出 JSON</span>
          </button>
          <label
            className="btn btn-sm btn-ghost"
            style={{ cursor: 'pointer' }}
            title="从 JSON 文件导入代理档案"
          >
            <Upload size={13} />
            <span>导入 JSON</span>
            <input
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = (e.currentTarget as HTMLInputElement).files?.[0];
                if (f) void importProfilesJson(f);
                (e.currentTarget as HTMLInputElement).value = '';
              }}
            />
          </label>
          <button className="btn btn-primary" onClick={() => requestEdit('new')}>
            <Plus size={15} />
            <span>新增代理档案</span>
          </button>
        </div>
      </div>

      <div className="banner banner-info">
        <AlertCircle size={16} />
        <div className="small">
          修改使用中的代理档案会立即重新应用并同步触发落地 IP 验证与国旗更新。节点信息会跟随探测参数与周期刷新功能持续自动维护。
        </div>
      </div>

      {editing && (
        <ProfileForm
          key={editing === 'new' ? 'new' : editing.id}
          initial={editing === 'new' ? null : editing}
          onSave={save}
          onCancel={handleCancelEdit}
          onDirtyChange={setIsFormDirty}
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
              style={
                isActive
                  ? {
                      background: `linear-gradient(90deg, ${hexToRgba(p.color || '#3b82f6', 0.15)} 0%, ${hexToRgba(p.color || '#3b82f6', 0.03)} 100%)`,
                      borderColor: hexToRgba(p.color || '#3b82f6', 0.35),
                    }
                  : undefined
              }
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
                      style={{ gap: '6px', fontSize: '11px', padding: '2px 8px' }}
                      title={`最近探测：${check.ip} (${check.city ?? ''}) · ${timeAgo(check.checkedAt)}`}
                    >
                      <Flag cc={check.countryCode} size={13} withName />
                      {typeof check.rttMs === 'number' && (
                        <span
                          className="mono"
                          style={{
                            fontWeight: 600,
                            color: check.rttMs < 250 ? 'var(--ok)' : check.rttMs < 800 ? 'var(--warn)' : 'var(--danger)',
                          }}
                          title={`往返延迟 RTT：${check.rttMs}ms`}
                        >
                          {check.rttMs}ms
                        </span>
                      )}
                      <span className="mono muted small" style={{ fontSize: '10.5px' }}>
                        {check.ip}
                      </span>
                    </span>
                  ) : null}
                  {check?.isSplitTunnel && (
                    <span
                      className="tag tag-warn row"
                      style={{ gap: '3px', fontSize: '10.5px' }}
                      title={`非全局代理：检测到分流规则（国内直连 IP: ${check.domesticIp ?? '国内IP'}，国外代理 IP: ${check.ip}），访问可能绕过代理泄露真实 IP`}
                    >
                      <AlertTriangle size={11} />
                      <span>非全局分流</span>
                    </span>
                  )}
                  {check?.countryCode && !check.isSplitTunnel && check.countryCode !== 'CN' && (
                    <span
                      className="tag tag-ok"
                      style={{ fontSize: '10px' }}
                      title="全局代理：境内外网络均走此代理转发"
                    >
                      全局代理
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
                  className={`btn btn-sm ${editing && editing !== 'new' && editing.id === p.id ? 'btn-primary' : ''}`}
                  onClick={() => requestEdit(p)}
                  title="编辑档案"
                >
                  <Edit3 size={13} />
                  <span>{editing && editing !== 'new' && editing.id === p.id ? '编辑中' : '编辑'}</span>
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

function parseProxyUrl(raw: string): {
  scheme: ProxyScheme;
  host: string;
  port: number;
  username?: string;
  password?: string;
  name?: string;
} | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    let urlStr = trimmed;
    if (!/^[a-zA-Z0-9]+:\/\//.test(urlStr)) {
      urlStr = 'socks5://' + urlStr;
    }
    const parsed = new URL(urlStr);
    let scheme: ProxyScheme = 'socks5';
    const proto = parsed.protocol.replace(':', '').toLowerCase();
    if (['http', 'https', 'socks4', 'socks5'].includes(proto)) {
      scheme = proto as ProxyScheme;
    }
    const host = parsed.hostname;
    const port = parsed.port ? parseInt(parsed.port, 10) : scheme === 'https' ? 443 : 80;
    const username = parsed.username ? decodeURIComponent(parsed.username) : undefined;
    const password = parsed.password ? decodeURIComponent(parsed.password) : undefined;
    const name = parsed.hash ? decodeURIComponent(parsed.hash.replace(/^#/, '')) : undefined;
    if (!host || isNaN(port) || port < 1 || port > 65535) return null;
    return { scheme, host, port, username, password, name };
  } catch {
    return null;
  }
}

function ProfileForm({
  initial,
  onSave,
  onCancel,
  onDirtyChange,
  onApplyTemplate,
}: {
  initial: ProxyProfile | null;
  onSave: (p: ProxyProfile) => Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onApplyTemplate?: (tmpl: (typeof TEMPLATES)[number]) => void;
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
  const [quickUrl, setQuickUrl] = useState('');
  const [parseHint, setParseHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 严格比对用户当前表单是否有实质性修改（Dirty Checking）
  const isDirty = useMemo(() => {
    if (!initial) {
      return (
        name.trim() !== '' ||
        scheme !== 'socks5' ||
        host.trim() !== '' ||
        port.trim() !== '' ||
        username.trim() !== '' ||
        password.trim() !== '' ||
        bypass.trim() !== DEFAULT_BYPASS.join('\n').trim() ||
        color.toLowerCase() !== PROFILE_COLORS[0].toLowerCase() ||
        icon !== '' ||
        quickUrl.trim() !== ''
      );
    }
    const initName = initial.name ?? '';
    const initScheme = initial.scheme ?? 'socks5';
    const initHost = initial.host ?? '';
    const initPort = initial.port != null ? String(initial.port) : '';
    const initUsername = initial.auth?.username ?? '';
    const initPassword = initial.auth?.password ?? '';
    const initBypass = (initial.bypassList ?? DEFAULT_BYPASS).join('\n');
    const initColor = (initial.color ?? PROFILE_COLORS[0]).toLowerCase();
    const initIcon = initial.icon ?? '';

    return (
      name !== initName ||
      scheme !== initScheme ||
      host !== initHost ||
      port !== initPort ||
      username !== initUsername ||
      password !== initPassword ||
      bypass.trim() !== initBypass.trim() ||
      color.toLowerCase() !== initColor ||
      icon !== initIcon ||
      quickUrl.trim() !== ''
    );
  }, [
    initial,
    name,
    scheme,
    host,
    port,
    username,
    password,
    bypass,
    color,
    icon,
    quickUrl,
  ]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const isSocks = scheme === 'socks4' || scheme === 'socks5';

  const handleQuickParse = () => {
    setParseHint(null);
    const parsed = parseProxyUrl(quickUrl);
    if (!parsed) {
      setParseHint('未能识别格式。支持格式如：socks5://127.0.0.1:10808 或 http://user:pass@host:port#名称');
      return;
    }
    setScheme(parsed.scheme);
    setHost(parsed.host);
    setPort(String(parsed.port));
    if (parsed.username) setUsername(parsed.username);
    if (parsed.password) setPassword(parsed.password);
    if (parsed.name) setName(parsed.name);
    else if (!name) setName(`${parsed.scheme.toUpperCase()}-${parsed.host}:${parsed.port}`);
    setParseHint('✓ 解析成功！已自动填充表单');
    setTimeout(() => setParseHint(null), 3000);
  };

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

      {/* 快捷解析输入区 */}
      <div
        className="card"
        style={{
          background: 'var(--bg-surface)',
          padding: '8px 12px',
          marginBottom: '14px',
          border: '1px dashed var(--border-card)',
        }}
      >
        <div className="row" style={{ gap: '8px', flexWrap: 'wrap' }}>
          <span className="muted small" style={{ flex: 'none' }}>
            快速解析：
          </span>
          <input
            type="text"
            className="grow"
            style={{ fontSize: '12px', padding: '4px 8px' }}
            value={quickUrl}
            placeholder="粘贴代理链接（如 socks5://127.0.0.1:10808 或 http://user:pass@host:port#名称）"
            onChange={(e) => setQuickUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleQuickParse();
              }
            }}
          />
          <button
            type="button"
            className="btn btn-sm"
            onClick={handleQuickParse}
            title="解析链接并自动填充"
          >
            <span>一键识别解析</span>
          </button>
        </div>
        {parseHint && (
          <div
            className="small"
            style={{
              marginTop: '4px',
              color: parseHint.startsWith('✓') ? 'var(--success)' : 'var(--danger)',
            }}
          >
            {parseHint}
          </div>
        )}
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
                onClick={() => {
                  setIcon('v2ray');
                  setColor('#3B82F6');
                }}
              >
                <img src="/icons/v2rayn-icon.ico" width={14} height={14} alt="" />
                <span>V2RayN 图标</span>
              </button>
              <button
                type="button"
                className={`btn btn-sm ${icon === 'clash' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => {
                  setIcon('clash');
                  setColor('#BAA5FD');
                }}
              >
                <img src="/icons/Clash-Verge.ico" width={14} height={14} alt="" />
                <span>Clash Verge 图标</span>
              </button>
            </div>

            {/* 色盘预设与自助选择调色盘 */}
            <div
              className="row"
              style={{
                gap: '12px',
                alignItems: 'center',
                flexWrap: 'wrap',
                marginTop: '6px',
                width: '100%',
                background: 'var(--bg-surface)',
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div className="row" style={{ gap: '6px', alignItems: 'center' }}>
                <span className="muted small" style={{ fontWeight: 600 }}>预设色卡：</span>
                <div className="color-palette">
                  {PROFILE_COLORS.map((c) => (
                    <button
                      type="button"
                      key={c}
                      className={`color-swatch ${color === c ? 'color-swatch-active' : ''}`}
                      style={{ backgroundColor: c }}
                      onClick={() => setColor(c)}
                      title={`选择预设色 ${c}`}
                    />
                  ))}
                </div>
              </div>

              {/* 自助调色盘取色器 */}
              <div className="row" style={{ gap: '6px', alignItems: 'center', marginLeft: 'auto' }}>
                <span className="muted small" style={{ fontWeight: 600 }}>自助调色盘：</span>
                <label
                  className={`color-swatch-custom ${!PROFILE_COLORS.includes(color) ? 'color-swatch-active' : ''}`}
                  title="点击打开系统色盘，自助选取任意专属色彩"
                  style={{
                    backgroundColor: color,
                    borderColor: !PROFILE_COLORS.includes(color) ? 'var(--text-main)' : 'var(--border-card)',
                    boxShadow: !PROFILE_COLORS.includes(color) ? `0 0 10px ${hexToRgba(color, 0.5)}` : undefined,
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
                  <Palette size={13} style={{ color: '#fff', filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.8))' }} />
                </label>
                <span className="mono custom-color-hex" title="当前选择的色彩十六进制代码">
                  {color.toUpperCase()}
                </span>
              </div>
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
