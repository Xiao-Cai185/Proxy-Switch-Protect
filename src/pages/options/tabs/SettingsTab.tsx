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
import type { CheckerConfig, ExportBundle, Settings } from '../../../shared/types';
import { Switch } from '../../ui/components';
import { useSettings } from '../../ui/hooks';
import { downloadText, inputValue } from '../../ui/util';

export function SettingsTab() {
  const settings = useSettings();
  const [testResults, setTestResults] = useState<Record<string, string>>({});
  const [testingId, setTestingId] = useState<string | null>(null);
  const [addingChecker, setAddingChecker] = useState(false);
  const [importMsg, setImportMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  if (!settings) return null;

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

      {/* 流量判定校验与放行策略等级 */}
      <div className="tab-header-row">
        <div>
          <h2 className="tab-title">
            <Zap size={17} style={{ color: 'var(--warn)' }} />
            <span>流量判定校验与放行策略等级</span>
          </h2>
          <div className="muted small" style={{ marginTop: '2px' }}>
            调节在受守护域名内的流量检验机制与放行频率，避免网页子资源因过度校验导致代理卡顿
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
        {[
          {
            id: 'relaxed' as const,
            title: '第三等级：宽松效率模式 (推荐)',
            badge: '极速流畅 · 开屏首检',
            badgeClass: 'tag-ok',
            desc: '只对标签页开屏请求（首次主框架导航）进行落地 IP 校验。校验通过后，后续页面内所有交互流量（Fetch/XHR、子资源、单页应用 SPA 路由切换）默认放行。代理连接 100% 极速直通，彻底解决连接迟缓。',
            scene: '适用场景：OpenAI ChatGPT、Claude、密集型 WebApp 及日常大部分网站。',
          },
          {
            id: 'sampling' as const,
            title: '第二等级：抽样检测模式',
            badge: '平衡模式 · 轻量抽检',
            badgeClass: 'tag-primary',
            desc: '开屏请求强制校验，通过后放行后续交互流量；对后续请求按频次轻量抽样二次复核。抽检在后台异步比对当前缓存，不提前加锁阻断子资源，仅确认 IP 漂移时才中断访问。',
            scene: '适用场景：兼顾安全与流畅度，适合 Twitter/X、Facebook、海外云平台等常规账号。',
          },
          {
            id: 'strict' as const,
            title: '最高等级：严格拦截模式',
            badge: '最高安全 · 实时强校验',
            badgeClass: 'tag-warning',
            desc: '与原版本机制完全一致。每次开屏、切换标签页、页面加载更新均强制触发实时锁屏与外部 IP 探测。未放行前通过 DeclarativeNetRequest 同步阻断网页全部子资源。',
            scene: '适用场景：对异地 IP 变动极度敏感的高危金融、资产与敏感风控平台。',
          },
        ].map((item) => {
          const active = (settings.trafficValidationLevel || 'relaxed') === item.id;
          return (
            <div
              key={item.id}
              className={`card ${active ? 'policy-card-active' : ''}`}
              onClick={() => patch({ trafficValidationLevel: item.id })}
              style={{
                cursor: 'pointer',
                padding: '14px 16px',
                border: active ? '1.5px solid var(--primary)' : '1px solid var(--border-card)',
                background: active
                  ? 'radial-gradient(100% 120% at 0% 0%, var(--primary-glow) 0%, var(--bg-card) 70%)'
                  : 'var(--bg-card)',
                boxShadow: active ? '0 0 14px var(--primary-glow)' : 'var(--shadow-xs)',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              <div className="row-between" style={{ alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ gap: '8px', alignItems: 'center' }}>
                    <div
                      style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        border: active ? '5px solid var(--primary)' : '2px solid var(--border-subtle)',
                        background: active ? '#ffffff' : 'transparent',
                        flex: 'none',
                        transition: 'all 0.2s',
                      }}
                    />
                    <b style={{ fontSize: '14.5px', color: active ? 'var(--primary)' : 'var(--text-main)' }}>
                      {item.title}
                    </b>
                    <span className={`tag ${item.badgeClass}`} style={{ fontSize: '11px' }}>
                      {item.badge}
                    </span>
                  </div>
                  <div className="small" style={{ marginTop: '6px', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                    {item.desc}
                  </div>
                  <div className="small muted" style={{ marginTop: '4px', fontSize: '12px' }}>
                    {item.scene}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

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

      {/* 检测参数与周期复检 */}
      <div className="tab-header-row">
        <h2 className="tab-title">
          <Clock size={17} />
          <span>探测参数与周期刷新</span>
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
            <span className="field-label">后台静默周期复检间隔（分钟，0 为关闭）</span>
            <input
              type="number"
              min={0}
              max={240}
              value={settings.recheckMinutes}
              onChange={(e) =>
                patch({ recheckMinutes: Math.max(0, Number(inputValue(e)) || 0) })
              }
            />
            <span className="field-hint">
              每次打开守护网站都会执行强制验证，此周期值用于定期防范静默断网漂移。
            </span>
          </label>
          <label className="field full">
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
              安全核验通过后，落地页展示放行结果并等待自动返回目标网站的倒计时时长（支持 1 ~ 30 秒，默认 3 秒）。给程序与网络连接留出充足的确认时间。
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
                patch({ suggestWindowDays: Math.max(3, Number(inputValue(e)) || 14) })
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
                patch({ suggestMinDays: Math.max(2, Number(inputValue(e)) || 5) })
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
