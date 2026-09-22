import { useEffect, useState } from 'react';
import {
  Activity,
  BookOpen,
  Server,
  ShieldCheck,
  Sliders,
} from 'lucide-react';
import { HabitsTab } from './tabs/HabitsTab';
import { NotesTab } from './tabs/NotesTab';
import { ProfilesTab } from './tabs/ProfilesTab';
import { SettingsTab } from './tabs/SettingsTab';
import { SitesTab } from './tabs/SitesTab';

const TABS = [
  { id: 'profiles', label: '代理档案', icon: Server },
  { id: 'sites', label: '守护规则', icon: ShieldCheck },
  { id: 'notes', label: '安全备忘', icon: BookOpen },
  { id: 'habits', label: '统计建议', icon: Activity },
  { id: 'settings', label: '全局设置', icon: Sliders },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function App() {
  const initial = (location.hash.slice(1) || 'profiles') as TabId;
  const [tab, setTab] = useState<TabId>(
    TABS.some((t) => t.id === initial) ? initial : 'profiles',
  );

  useEffect(() => {
    const handleHash = () => {
      const h = location.hash.slice(1) as TabId;
      if (TABS.some((t) => t.id === h)) {
        setTab(h);
      }
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  useEffect(() => {
    if (location.hash.slice(1) !== tab) {
      location.hash = tab;
    }
  }, [tab]);

  return (
    <div className="options-layout">
      {/* 顶部主品牌区 */}
      <header className="options-header card">
        <div className="options-brand-row">
          <div className="options-logo-badge">
            <ShieldCheck size={24} className="options-logo-icon" />
          </div>
          <div>
            <div className="row" style={{ gap: '8px' }}>
              <h1 className="options-title">Proxy Protect 控制中心</h1>
              <span className="tag tag-primary mono" style={{ fontSize: '11px' }}>
                v{chrome.runtime.getManifest().version}
              </span>
            </div>
            <div className="muted small" style={{ marginTop: '2px' }}>
              全链路代理管控 · 落地 IP 一致性主动防护 · 隐私数据仅存本地
            </div>
          </div>
        </div>
      </header>

      {/* 现代化选项卡导航栏 */}
      <nav className="options-nav-bar">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              className={`options-nav-tab ${isActive ? 'options-nav-tab-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <Icon size={16} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>

      {/* 选项卡内容区 */}
      <main className="options-main-card">
        {tab === 'profiles' && <ProfilesTab />}
        {tab === 'sites' && <SitesTab />}
        {tab === 'notes' && <NotesTab />}
        {tab === 'habits' && <HabitsTab />}
        {tab === 'settings' && <SettingsTab />}
      </main>

      {/* 底部信息 */}
      <footer className="options-footer muted small">
        Proxy Protect · 守护您的海外敏感账号与代理网络安全 · Manifest V3 Standard
      </footer>
    </div>
  );
}
