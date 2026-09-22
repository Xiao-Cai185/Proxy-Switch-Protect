import { useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Check,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { sendCmd } from '../../../shared/messages';
import { saveHabits } from '../../../shared/storage';
import { Empty, Flag } from '../../ui/components';
import { useHabits, useSettings, useSuggestions } from '../../ui/hooks';
import { timeAgo } from '../../ui/util';

interface DomainStat {
  domain: string;
  totalDays: number;
  countries: { cc: string; days: number }[];
}

export function HabitsTab() {
  const habits = useHabits() ?? {};
  const suggestions = useSuggestions() ?? [];
  const settings = useSettings();
  const [confirmingDomain, setConfirmingDomain] = useState<string | null>(null);
  const [strictMode, setStrictMode] = useState<'country' | 'subnet'>('country');

  const stats: DomainStat[] = useMemo(() => {
    return Object.entries(habits)
      .map(([domain, byCc]) => {
        const allDays = new Set<string>();
        const countries = Object.entries(byCc)
          .map(([cc, dates]) => {
            for (const d of dates) allDays.add(d);
            return { cc, days: dates.length };
          })
          .sort((a, b) => b.days - a.days);
        return { domain, totalDays: allDays.size, countries };
      })
      .sort((a, b) => b.totalDays - a.totalDays)
      .slice(0, 100);
  }, [habits]);

  const clearAll = async () => {
    if (!confirm('确定清空全部使用习惯统计？此操作不可撤销。')) return;
    await saveHabits({});
  };

  const handleConfirmAccept = async (s: (typeof suggestions)[number]) => {
    let expectedIpRanges: string[] = [];
    let matchMode: 'any' | 'all' = 'any';

    if (strictMode === 'subnet' && s.sampleIp) {
      const parts = s.sampleIp.split('.');
      if (parts.length === 4) {
        expectedIpRanges = [`${parts[0]}.${parts[1]}.${parts[2]}.0/24`];
        matchMode = 'all';
      }
    }

    await sendCmd({
      type: 'acceptSuggestion',
      domain: s.domain,
      countryCode: s.countryCode,
      expectedIpRanges,
      matchMode,
    });
    setConfirmingDomain(null);
  };

  return (
    <div className="tab-container">
      {/* 智能绑定建议 */}
      <div className="tab-header-row">
        <h2 className="tab-title">
          <Sparkles size={17} style={{ color: 'var(--primary)' }} />
          <span>智能绑定建议</span>
        </h2>
        <div className="muted small" style={{ marginTop: '2px' }}>
          基于您日常正常浏览的连续天数统计，自动发掘值得绑定的敏感网站并推荐最优落地地区
        </div>
      </div>

      <div className="card o-list" style={{ marginBottom: '20px' }}>
        {suggestions.map((s) => {
          const isConfirming = confirmingDomain === s.domain;
          const subnetStr = s.sampleIp ? `${s.sampleIp.split('.').slice(0, 3).join('.')}.0/24` : null;

          return (
            <div
              className={`o-row suggestion-item-row ${isConfirming ? 'o-row-active' : ''}`}
              key={s.domain}
              style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}
            >
              <div className="row-between" style={{ width: '100%' }}>
                <div className="grow">
                  <div className="row" style={{ gap: '8px' }}>
                    <b className="mono" style={{ fontSize: '14px' }}>{s.domain}</b>
                    <span className="tag tag-primary">建议绑定</span>
                    {s.sampleIp && (
                      <span className="tag mono muted small" style={{ fontSize: '10.5px' }}>
                        采样 IP: {s.sampleIp}
                      </span>
                    )}
                  </div>
                  <div className="small muted row" style={{ gap: '6px', marginTop: '3px' }}>
                    <span>最近 {s.days} 天习惯固定使用</span>
                    <Flag cc={s.countryCode} withName size={14} />
                    <span>出口访问 · {timeAgo(s.createdAt)}</span>
                  </div>
                </div>
                <div className="row" style={{ gap: '6px' }}>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() =>
                      void sendCmd({ type: 'dismissSuggestion', domain: s.domain })
                    }
                  >
                    忽略
                  </button>
                  <button
                    className={`btn btn-sm ${isConfirming ? 'btn-ghost' : 'btn-primary'}`}
                    onClick={() => {
                      if (isConfirming) setConfirmingDomain(null);
                      else {
                        setConfirmingDomain(s.domain);
                        setStrictMode('country');
                      }
                    }}
                  >
                    <Check size={13} />
                    <span>{isConfirming ? '收起配置' : '确认录入规则…'}</span>
                  </button>
                </div>
              </div>

              {/* 录入规则严格程度确认面板 */}
              {isConfirming && (
                <div
                  className="card"
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    padding: '12px 14px',
                    marginTop: '6px',
                  }}
                >
                  <div className="small" style={{ fontWeight: 600, marginBottom: '8px' }}>
                    选择该站点守护规则的严格程度（防封号策略）：
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label className="row" style={{ gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name={`strict-${s.domain}`}
                        checked={strictMode === 'country'}
                        onChange={() => setStrictMode('country')}
                      />
                      <div>
                        <div className="small" style={{ fontWeight: 600 }}>
                          🟢 国家地区守护（标准推荐 · 适合动态节点池）
                        </div>
                        <div className="muted small">
                          只要代理出口位于 <Flag cc={s.countryCode} withName size={12} /> 即允许访问，适合常用动态家宽/动态节点。
                        </div>
                      </div>
                    </label>

                    {subnetStr && (
                      <label className="row" style={{ gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name={`strict-${s.domain}`}
                          checked={strictMode === 'subnet'}
                          onChange={() => setStrictMode('subnet')}
                        />
                        <div>
                          <div className="small" style={{ fontWeight: 600 }}>
                            🛡️ 严苛双重锁定（国家 + 网段 {subnetStr} · 适合固定专线养号）
                          </div>
                          <div className="muted small">
                            必须同时满足所属国家且出口位于该 C 段网段，防范节点发生意外漂移。
                          </div>
                        </div>
                      </label>
                    )}
                  </div>

                  <div className="row" style={{ gap: '8px', marginTop: '12px', justifyContent: 'flex-end' }}>
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => setConfirmingDomain(null)}
                    >
                      取消
                    </button>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => void handleConfirmAccept(s)}
                    >
                      <Check size={13} />
                      <span>确认建立守护规则</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {suggestions.length === 0 && (
          <Empty
            text={
              settings?.habitEnabled === false
                ? '习惯统计功能已关闭，可在「全局设置」中开启'
                : `暂无绑定建议。当某域名在 ${settings?.suggestWindowDays ?? 5} 天内有 ${
                    settings?.suggestMinDays ?? 3
                  } 天以上习惯使用同一国家落地访问时，将自动在此处提示。`
            }
            icon={Sparkles}
          />
        )}
      </div>

      {/* 访问历史与地区分布统计 */}
      <div className="row-between tab-header-row" style={{ marginTop: '16px' }}>
        <div>
          <h2 className="tab-title">
            <BarChart3 size={17} />
            <span>域名 × 落地国家访问统计</span>
          </h2>
          <div className="muted small" style={{ marginTop: '2px' }}>
            按天去重统计，仅在落地 IP 验证通过的状态下记录，本地最多保留 90 天
          </div>
        </div>
        {stats.length > 0 && (
          <button
            className="btn btn-sm btn-danger"
            onClick={() => void clearAll()}
          >
            <Trash2 size={13} />
            <span>清空统计记录</span>
          </button>
        )}
      </div>

      <div className="card o-list">
        {stats.map((st) => (
          <div className="o-row stat-item-row" key={st.domain}>
            <div className="grow">
              <div className="row-between">
                <b className="mono ellipsis" style={{ fontSize: '13px' }}>
                  {st.domain}
                </b>
                <span className="tag tag-muted" style={{ fontSize: '11px' }}>
                  累计访问 {st.totalDays} 天
                </span>
              </div>
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {st.countries.map((c) => {
                  const maxDays = st.countries[0].days || 1;
                  const pct = Math.max(4, Math.round((c.days / maxDays) * 100));
                  return (
                    <div className="row small" key={c.cc} style={{ gap: '8px' }}>
                      <Flag cc={c.cc} size={14} />
                      <span className="mono" style={{ width: '32px', fontWeight: 600 }}>
                        {c.cc.toUpperCase()}
                      </span>
                      <div className="habit-bar-track grow">
                        <div
                          className="habit-bar"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="muted small mono" style={{ width: '45px', textAlign: 'right' }}>
                        {c.days} 天
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
        {stats.length === 0 && (
          <Empty
            text="暂无访问统计数据。当您在代理通过校验状态下正常访问网页时，系统将自动按天统计。"
            icon={Activity}
          />
        )}
      </div>
    </div>
  );
}
