import { useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Edit3,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { normalizeDomain, parseCidr } from '../../../shared/matchers';
import { loadSites, saveSites } from '../../../shared/storage';
import { getPolicyMeta } from '../../../shared/constants';
import type { ProtectedSite, TrafficValidationLevel } from '../../../shared/types';
import { Empty, Flag, StatusDot, Switch } from '../../ui/components';
import { useGuardStates, useSettings, useSites } from '../../ui/hooks';
import { inputValue } from '../../ui/util';
import { CountrySelect } from '../components/CountrySelect';
import { PolicyLevelSlider } from '../components/PolicyLevelSlider';

export function SitesTab() {
  const sites = useSites() ?? [];
  const guardStates = useGuardStates() ?? {};
  const settings = useSettings();
  const [editing, setEditing] = useState<ProtectedSite | 'new' | null>(null);

  const save = async (site: ProtectedSite) => {
    const list = await loadSites();
    const idx = list.findIndex((x) => x.id === site.id);
    if (idx >= 0) list[idx] = site;
    else list.push(site);
    await saveSites(list);
    setEditing(null);
  };

  const remove = async (site: ProtectedSite) => {
    if (!confirm(`确定删除对 ${site.domainPattern} 的守护规则？相关备注也会一并删除。`)) return;
    await saveSites((await loadSites()).filter((x) => x.id !== site.id));
  };

  const toggleEnabled = async (site: ProtectedSite) => {
    const list = await loadSites();
    const idx = list.findIndex((x) => x.id === site.id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], enabled: !list[idx].enabled, updatedAt: Date.now() };
      await saveSites(list);
    }
  };

  return (
    <div className="tab-container">
      <div className="row-between tab-header-row">
        <div>
          <h2 className="tab-title">域名安全守护规则</h2>
          <div className="muted small" style={{ marginTop: '2px' }}>
            为敏感站点绑定期望出口地区或 IP 段，出口不符时毫秒级自动阻断访问
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>
          <Plus size={15} />
          <span>新增守护规则</span>
        </button>
      </div>

      <div className="banner banner-info">
        <AlertCircle size={16} />
        <div className="small">
          <b>Fail-Closed 极速防护机制</b>：在切换代理、浏览器启动、检测中等任何未就绪状态下，受守护站点均默认保持拦截，仅当落地 IP 明确符合期望时才同步放行。
        </div>
      </div>

      {editing && (
        <SiteForm
          initial={editing === 'new' ? null : editing}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}

      <div className="card o-list">
        {sites.map((site) => {
          const guardState = guardStates[site.id];
          return (
            <div
              className={`o-row site-rule-item ${!site.enabled ? 'o-row-disabled' : ''}`}
              key={site.id}
            >
              <StatusDot status={site.enabled ? guardState?.status : undefined} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="row" style={{ gap: '8px' }}>
                  <b className="mono site-rule-domain">{site.domainPattern}</b>
                  {site.domainPattern.startsWith('*.') && (
                    <span className="tag tag-ok" style={{ fontSize: '10px', padding: '1px 6px' }}>
                      泛域名
                    </span>
                  )}
                  {!site.enabled && <span className="tag tag-muted">已停用</span>}
                  {site.note?.email && (
                    <span className="tag tag-primary" style={{ fontSize: '11px' }}>
                      <BookOpen size={10} />
                      有备注
                    </span>
                  )}
                </div>
                <div className="row small" style={{ gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                  {site.expectedCountries.map((cc) => (
                    <Flag key={cc} cc={cc} withName size={14} />
                  ))}
                  {site.expectedIpRanges.length > 0 && (
                    <span className="muted mono" style={{ fontSize: '11px' }}>
                      IP: {site.expectedIpRanges.join('、')}
                    </span>
                  )}
                  {site.expectedCountries.length > 0 && site.expectedIpRanges.length > 0 && (
                    <span className="tag tag-muted" style={{ fontSize: '10px' }}>
                      {site.matchMode === 'all' ? '全部满足' : '任一满足'}
                    </span>
                  )}
                  {site.validationLevel && site.validationLevel !== 'default' ? (
                    (() => {
                      const meta = getPolicyMeta(site.validationLevel);
                      return (
                        <span
                          className={`tag ${meta.badgeClass}`}
                          style={{ fontSize: '10px' }}
                          title={`独立定制策略：第 ${meta.level} 等级 · ${meta.name}`}
                        >
                          L{meta.level} {meta.shortName}
                        </span>
                      );
                    })()
                  ) : (
                    (() => {
                      const meta = getPolicyMeta(settings?.trafficValidationLevel);
                      return (
                        <span
                          className="tag tag-muted"
                          style={{ fontSize: '10px' }}
                          title={`继承全局策略：第 ${meta.level} 等级 · ${meta.name}`}
                        >
                          跟随全局: L{meta.level} {meta.shortName}
                        </span>
                      );
                    })()
                  )}
                </div>
                {site.enabled && guardState?.reason && (
                  <div className="muted small" style={{ marginTop: '2px' }}>
                    {guardState.reason}
                  </div>
                )}
              </div>

              <div className="row" style={{ gap: '10px' }}>
                <Switch
                  checked={site.enabled}
                  onChange={() => void toggleEnabled(site)}
                  label={site.enabled ? '守护中' : '已停用'}
                />
                <button
                  className="btn btn-sm"
                  onClick={() => setEditing(site)}
                  title="编辑规则"
                >
                  <Edit3 size={13} />
                  <span>编辑</span>
                </button>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => void remove(site)}
                  title="删除规则"
                >
                  <Trash2 size={13} />
                  <span>删除</span>
                </button>
              </div>
            </div>
          );
        })}
        {sites.length === 0 && (
          <Empty
            text="暂无守护规则。例如：为 chatgpt.com 绑定新加坡（SG），当落地 IP 漂移到其他地区时自动阻断。"
            icon={ShieldCheck}
          />
        )}
      </div>
    </div>
  );
}

function SiteForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: ProtectedSite | null;
  onSave: (s: ProtectedSite) => Promise<void>;
  onCancel: () => void;
}) {
  const [domain, setDomain] = useState(initial?.domainPattern ?? '');
  const [countries, setCountries] = useState<string[]>(initial?.expectedCountries ?? []);
  const [ranges, setRanges] = useState((initial?.expectedIpRanges ?? []).join('\n'));
  const [matchMode, setMatchMode] = useState<'any' | 'all'>(initial?.matchMode ?? 'any');
  const settings = useSettings();
  const globalLevel: TrafficValidationLevel = settings?.trafficValidationLevel || 'relaxed';
  const [inheritGlobal, setInheritGlobal] = useState<boolean>(
    initial?.validationLevel == null || initial.validationLevel === 'default',
  );
  const [customLevel, setCustomLevel] = useState<TrafficValidationLevel>(
    initial?.validationLevel && initial.validationLevel !== 'default'
      ? initial.validationLevel
      : globalLevel,
  );
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [email, setEmail] = useState(initial?.note?.email ?? '');
  const [alias, setAlias] = useState(initial?.note?.alias ?? '');
  const [regions, setRegions] = useState<string[]>(initial?.note?.regions ?? []);
  const [noteText, setNoteText] = useState(initial?.note?.text ?? '');
  const [error, setError] = useState<string | null>(null);

  const normalized = normalizeDomain(domain);

  const submit = () => {
    if (!normalized) return setError('域名格式无效，示例：chatgpt.com');
    const rangeList = ranges
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const r of rangeList) {
      if (!parseCidr(r)) return setError(`IP 段格式无效：${r}（示例：203.0.113.0/24）`);
    }
    if (countries.length === 0 && rangeList.length === 0) {
      return setError('请至少选择一个期望国家/地区，或填写一个期望出口 IP 段');
    }
    const now = Date.now();
    const hasNote = !!(email.trim() || alias.trim() || noteText.trim() || regions.length > 0);
    const site: ProtectedSite = {
      id: initial?.id ?? crypto.randomUUID(),
      domainPattern: normalized,
      expectedCountries: countries,
      expectedIpRanges: rangeList,
      matchMode,
      validationLevel: inheritGlobal ? undefined : customLevel,
      enabled,
      note: hasNote
        ? {
            email: email.trim() || undefined,
            alias: alias.trim() || undefined,
            regions: regions.length > 0 ? regions : undefined,
            text: noteText.trim() || undefined,
            updatedAt: now,
          }
        : undefined,
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    };
    void onSave(site);
  };

  return (
    <div className="card site-form-card" style={{ marginBottom: '14px' }}>
      <div className="o-section-title" style={{ marginBottom: '12px' }}>
        {initial ? '编辑守护规则' : '新建守护规则'}
      </div>
      <div className="form-grid">
        <label className="field full">
          <span className="field-label">网站主域名或通配域名（自动包含全部子域）</span>
          <input
            type="text"
            value={domain}
            placeholder="如：chatgpt.com 或 *.openai.com"
            onChange={(e) => setDomain(inputValue(e))}
          />
          {domain.trim() && (
            <span className={normalized ? 'field-hint' : 'field-error'}>
              {normalized
                ? `生效范围：${normalized}（支持泛域名，自动包含全部多级子域）`
                : '域名格式不合法，支持如 chatgpt.com 或 *.openai.com'}
            </span>
          )}
        </label>

        <div className="field full">
          <span className="field-label">期望合法落地国家 / 地区（多选）</span>
          <CountrySelect value={countries} onChange={setCountries} />
        </div>

        <label className="field">
          <span className="field-label">期望出口 IP 段 (CIDR，可选，每行一条)</span>
          <textarea
            value={ranges}
            placeholder={'如：203.0.113.0/24\n198.51.100.7'}
            rows={3}
            onChange={(e) => setRanges(inputValue(e))}
          />
        </label>

        <div className="field">
          <span className="field-label">匹配策略</span>
          <div className="row" style={{ gap: '12px', marginTop: '6px' }}>
            <label className="row small" style={{ cursor: 'pointer' }}>
              <input
                type="radio"
                name="matchMode"
                checked={matchMode === 'any'}
                onChange={() => setMatchMode('any')}
              />
              <span>任一维度满足即放行</span>
            </label>
            <label className="row small" style={{ cursor: 'pointer' }}>
              <input
                type="radio"
                name="matchMode"
                checked={matchMode === 'all'}
                onChange={() => setMatchMode('all')}
              />
              <span>必须全部满足</span>
            </label>
          </div>
          <div style={{ marginTop: '12px' }}>
            <Switch
              checked={enabled}
              onChange={setEnabled}
              label={enabled ? '保存后立即启用此守护规则' : '先保存，暂不启用'}
            />
          </div>
        </div>

        <div className="field full" style={{ marginTop: '2px' }}>
          <div
            className="row-between"
            style={{
              marginBottom: '10px',
              paddingBottom: '8px',
              borderBottom: '1px solid var(--border-subtle)',
              alignItems: 'center',
            }}
          >
            <div>
              <span className="field-label" style={{ marginBottom: 0 }}>
                流量判定校验策略等级
              </span>
              <div className="muted small" style={{ fontSize: '11px', marginTop: '2px' }}>
                {inheritGlobal
                  ? '当前已开启继承全局策略，自动跟随全局设置，滑块已锁定'
                  : '已关闭继承全局，可针对当前受守护域名自由滑动定制策略'}
              </div>
            </div>
            <div className="row" style={{ gap: '10px', alignItems: 'center' }}>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: inheritGlobal ? 'var(--primary)' : 'var(--text-secondary)',
                }}
              >
                {inheritGlobal ? '继承全局策略' : '单独定制策略'}
              </span>
              <Switch
                checked={inheritGlobal}
                onChange={(checked) => {
                  setInheritGlobal(checked);
                  if (checked) {
                    setCustomLevel(globalLevel);
                  }
                }}
                label={inheritGlobal ? '继承中' : '独立定制'}
              />
            </div>
          </div>

          <PolicyLevelSlider
            value={inheritGlobal ? globalLevel : customLevel}
            onChange={(lvl) => {
              if (!inheritGlobal) {
                setCustomLevel(lvl);
              }
            }}
            disabled={inheritGlobal}
            disabledHint={`当前规则已开启继承全局策略（第 ${getPolicyMeta(globalLevel).level} 等级 · ${getPolicyMeta(globalLevel).name}）。关掉右侧开关后即可启用滑块单独定制。`}
          />
        </div>

        <div className="field full" style={{ borderTop: '1px dashed var(--border-card)', paddingTop: '10px' }}>
          <div className="row" style={{ gap: '6px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
            <BookOpen size={14} />
            <b>站点安全备忘记事本（可选，仅保存在本地设备）</b>
          </div>
        </div>

        <label className="field">
          <span className="field-label">绑定账号邮箱</span>
          <input
            type="text"
            value={email}
            placeholder="如：account@example.com"
            onChange={(e) => setEmail(inputValue(e))}
          />
        </label>

        <label className="field">
          <span className="field-label">账号别名或标签</span>
          <input
            type="text"
            value={alias}
            placeholder="如：OpenAI 企业主账号"
            onChange={(e) => setAlias(inputValue(e))}
          />
        </label>

        <div className="field full">
          <span className="field-label">常用注册与使用地区（仅作提示参考）</span>
          <CountrySelect value={regions} onChange={setRegions} />
        </div>

        <label className="field full">
          <span className="field-label">安全备忘自由文本</span>
          <textarea
            value={noteText}
            placeholder={'如：长期使用新加坡节点登录；切忌使用美西原生节点；绑定了手机号验证…'}
            rows={2}
            onChange={(e) => setNoteText(inputValue(e))}
          />
        </label>
      </div>

      {error && <div className="field-error">{error}</div>}
      <div className="form-actions">
        <button className="btn" onClick={onCancel}>
          取消
        </button>
        <button className="btn btn-primary" onClick={submit}>
          保存守护规则
        </button>
      </div>
    </div>
  );
}
