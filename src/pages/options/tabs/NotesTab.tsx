import { useState } from 'react';
import {
  BookOpen,
  Check,
  Copy,
  Edit3,
  Eye,
  EyeOff,
  Plus,
  Search,
} from 'lucide-react';
import { normalizeDomain } from '../../../shared/matchers';
import { loadSites, saveSites } from '../../../shared/storage';
import { Empty, Flag } from '../../ui/components';
import { useSites } from '../../ui/hooks';
import { inputValue, maskEmail, timeAgo } from '../../ui/util';
import { CountrySelect } from '../components/CountrySelect';

export function NotesTab() {
  const sites = useSites() ?? [];
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);

  const filtered = sites.filter((s) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      s.domainPattern.includes(q) ||
      s.note?.email?.toLowerCase().includes(q) ||
      s.note?.alias?.toLowerCase().includes(q) ||
      s.note?.text?.toLowerCase().includes(q) ||
      s.note?.regions?.some((cc) => cc.toLowerCase().includes(q))
    );
  });

  const saveNote = async (
    siteId: string,
    note: { email: string; alias: string; text: string; regions: string[] },
  ) => {
    const list = await loadSites();
    const idx = list.findIndex((x) => x.id === siteId);
    if (idx < 0) return;
    const hasNote = Boolean(
      note.email.trim() ||
      note.alias.trim() ||
      note.text.trim() ||
      note.regions.length > 0,
    );
    list[idx] = {
      ...list[idx],
      note: hasNote
        ? {
            email: note.email.trim() || undefined,
            alias: note.alias.trim() || undefined,
            regions: note.regions.length > 0 ? note.regions : undefined,
            text: note.text.trim() || undefined,
            updatedAt: Date.now(),
          }
        : undefined,
      updatedAt: Date.now(),
    };
    await saveSites(list);
    setEditingId(null);
  };

  const createNoteOnly = async (
    domainRaw: string,
    note: { email: string; alias: string; text: string; regions: string[] },
  ): Promise<string | null> => {
    const domain = normalizeDomain(domainRaw);
    if (!domain) return '域名格式无效，示例：github.com';
    const list = await loadSites();
    if (list.some((s) => s.domainPattern === domain)) {
      return '该域名已存在条目，请直接在列表中编辑';
    }
    const now = Date.now();
    list.push({
      id: crypto.randomUUID(),
      domainPattern: domain,
      expectedCountries: [],
      expectedIpRanges: [],
      matchMode: 'any',
      enabled: false,
      note: {
        email: note.email.trim() || undefined,
        alias: note.alias.trim() || undefined,
        regions: note.regions.length > 0 ? note.regions : undefined,
        text: note.text.trim() || undefined,
        updatedAt: now,
      },
      createdAt: now,
      updatedAt: now,
    });
    await saveSites(list);
    setCreating(false);
    return null;
  };

  const copyText = (text: string, id: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedEmail(id);
    setTimeout(() => setCopiedEmail(null), 1500);
  };

  return (
    <div className="tab-container">
      <div className="row-between tab-header-row">
        <div>
          <h2 className="tab-title">站点安全备忘与记事本</h2>
          <div className="muted small" style={{ marginTop: '2px' }}>
            记录各服务账号的绑定邮箱、别名与惯用地区，触发异常拦截时将在提示页展示参考
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Plus size={15} />
          <span>新建备忘</span>
        </button>
      </div>

      <div className="banner banner-info">
        <BookOpen size={16} />
        <div className="small">
          所有账号与邮箱备忘信息**完全仅存放在您的本机浏览器本地存储中**，绝不上载任何云端，支持随时导出与清空。
        </div>
      </div>

      <div className="notes-search-wrapper">
        <Search size={15} className="notes-search-icon" />
        <input
          type="search"
          className="notes-search-input"
          placeholder="搜索域名、账号邮箱、别名或备忘关键字…"
          value={search}
          onChange={(e) => setSearch(inputValue(e))}
        />
      </div>

      {creating && (
        <NoteEditor
          title="新建独立备忘条目（仅记录备忘，暂不启用拦截守护）"
          withDomain
          onCancel={() => setCreating(false)}
          onSubmit={createNoteOnly}
        />
      )}

      <div className="card o-list">
        {filtered.map((site) =>
          editingId === site.id ? (
            <div className="o-row" key={site.id}>
              <NoteEditor
                title={`编辑 ${site.domainPattern} 的安全备忘`}
                initial={{
                  email: site.note?.email ?? '',
                  alias: site.note?.alias ?? '',
                  text: site.note?.text ?? '',
                  regions: site.note?.regions ?? [],
                }}
                onCancel={() => setEditingId(null)}
                onSubmit={async (_d, note) => {
                  await saveNote(site.id, note);
                  return null;
                }}
              />
            </div>
          ) : (
            <div className="o-row note-item-row" key={site.id}>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="row" style={{ gap: '8px', flexWrap: 'wrap' }}>
                  <b className="mono note-domain">{site.domainPattern}</b>
                  {site.enabled ? (
                    <span className="tag tag-ok" style={{ fontSize: '10px' }}>
                      守护中
                    </span>
                  ) : (
                    <span className="tag tag-muted" style={{ fontSize: '10px' }}>
                      仅备忘
                    </span>
                  )}
                  {site.expectedCountries.map((cc) => (
                    <Flag key={cc} cc={cc} size={13} />
                  ))}
                </div>

                {site.note ? (
                  <div className="note-preview-box" style={{ marginTop: '6px' }}>
                    {site.note.alias && (
                      <div className="note-preview-line">
                        <span className="muted">账号标识：</span>
                        <b>{site.note.alias}</b>
                      </div>
                    )}
                    {site.note.email && (
                      <div className="note-preview-line row" style={{ gap: '6px' }}>
                        <span className="muted">登录邮箱：</span>
                        <span className="mono" style={{ fontSize: '12px' }}>
                          {revealed[site.id]
                            ? site.note.email
                            : maskEmail(site.note.email)}
                        </span>
                        <button
                          className="btn btn-ghost btn-icon"
                          title={revealed[site.id] ? '隐藏邮箱' : '显示完整邮箱'}
                          onClick={() =>
                            setRevealed({ ...revealed, [site.id]: !revealed[site.id] })
                          }
                        >
                          {revealed[site.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                        <button
                          className="btn btn-ghost btn-icon"
                          title="复制完整邮箱"
                          onClick={() => copyText(site.note?.email ?? '', site.id)}
                        >
                          {copiedEmail === site.id ? (
                            <Check size={13} style={{ color: 'var(--ok)' }} />
                          ) : (
                            <Copy size={13} className="muted" />
                          )}
                        </button>
                      </div>
                    )}
                    {site.note.regions && site.note.regions.length > 0 && (
                      <div className="note-preview-line row" style={{ gap: '6px', flexWrap: 'wrap' }}>
                        <span className="muted">常用注册/落地地区：</span>
                        {site.note.regions.map((cc) => (
                          <Flag key={cc} cc={cc} withName size={13} />
                        ))}
                      </div>
                    )}
                    {site.note.text && (
                      <div className="note-text-snippet">{site.note.text}</div>
                    )}
                    <div className="muted small" style={{ marginTop: '4px', fontSize: '11px' }}>
                      更新于 {timeAgo(site.note.updatedAt)}
                    </div>
                  </div>
                ) : (
                  <div className="muted small" style={{ marginTop: '4px' }}>
                    暂无备忘内容，点击右侧按钮添加
                  </div>
                )}
              </div>

              <button
                className="btn btn-sm"
                onClick={() => setEditingId(site.id)}
              >
                <Edit3 size={13} />
                <span>{site.note ? '编辑' : '添加备忘'}</span>
              </button>
            </div>
          ),
        )}
        {filtered.length === 0 && (
          <Empty text="未找到匹配的备忘条目" icon={BookOpen} />
        )}
      </div>
    </div>
  );
}

type NoteDraft = { email: string; alias: string; text: string; regions: string[] };

function NoteEditor({
  title,
  withDomain = false,
  initial,
  onSubmit,
  onCancel,
}: {
  title: string;
  withDomain?: boolean;
  initial?: NoteDraft;
  onSubmit: (domain: string, note: NoteDraft) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [domain, setDomain] = useState('');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [alias, setAlias] = useState(initial?.alias ?? '');
  const [text, setText] = useState(initial?.text ?? '');
  const [regions, setRegions] = useState<string[]>(initial?.regions ?? []);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const err = await onSubmit(domain, { email, alias, text, regions });
    setError(err);
  };

  return (
    <div className="card note-editor-card grow" style={{ boxShadow: 'none' }}>
      <div className="o-section-title" style={{ marginBottom: '10px' }}>
        {title}
      </div>
      <div className="form-grid">
        {withDomain && (
          <label className="field full">
            <span className="field-label">关联网站域名</span>
            <input
              type="text"
              value={domain}
              placeholder="如：github.com"
              onChange={(e) => setDomain(inputValue(e))}
            />
          </label>
        )}
        <label className="field">
          <span className="field-label">账号邮箱</span>
          <input
            type="text"
            value={email}
            placeholder="如：username@example.com"
            onChange={(e) => setEmail(inputValue(e))}
          />
        </label>
        <label className="field">
          <span className="field-label">账号别名</span>
          <input
            type="text"
            value={alias}
            placeholder="如：GitHub 主账号"
            onChange={(e) => setAlias(inputValue(e))}
          />
        </label>
        <div className="field full">
          <span className="field-label">常用落地地区</span>
          <CountrySelect value={regions} onChange={setRegions} />
        </div>
        <label className="field full">
          <span className="field-label">备忘与注意事项</span>
          <textarea
            value={text}
            rows={3}
            placeholder="如：勿使用机房 IP 登录；关联了海外信用卡；仅限香港/日本节点…"
            onChange={(e) => setText(inputValue(e))}
          />
        </label>
      </div>
      {error && <div className="field-error">{error}</div>}
      <div className="form-actions">
        <button className="btn" onClick={onCancel}>
          取消
        </button>
        <button className="btn btn-primary" onClick={() => void submit()}>
          保存备忘
        </button>
      </div>
    </div>
  );
}
