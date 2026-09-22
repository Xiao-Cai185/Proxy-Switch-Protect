# Proxy-Protect 开发与演进记录 (Agents_Edit.md)

## 第一章 项目架构、框架、开发语言与脚手架

### 1.1 项目概述与核心目标

Proxy-Protect 是一款面向 Chromium 内核（Chrome / Edge 等）的现代化 Manifest V3 浏览器扩展，专为多代理环境下的访问安全与隐私保护设计。其核心解决两大核心诉求：

1. **浏览器代理极速切换**：管理并一键切换上游代理档案（HTTP / HTTPS / SOCKS4 / SOCKS5 / 直连 / 系统代理），实时检测多源双栈（IPv4 / IPv6）落地真实出口 IP、国家地区（矢量 SVG 国旗）与 ISP 信息。
2. **域名-IP 一致性安全守护（Fail-Closed）**：针对对登录 IP/地区敏感的目标网站（如 OpenAI ChatGPT、金融及云平台账号），绑定该域名期望的合法落地地区或 IP 段。当代理出现意外漂移、未连接或国家地区不匹配时，利用 Chrome 声明式网络请求（DeclarativeNetRequest）在请求发出前实行同步阻断拦截并导向防护提示页，避免账号因异地 IP 突变触发平台风控。

### 1.2 技术栈与选型详情

- **开发语言**：TypeScript 5.x / 7.x（严格类型检查，全链路类型安全）。
- **前端框架**：React 19（原 Preact 升级为 React 19，全面拥抱现代 Hooks 状态流）。
- **构建工具与脚手架**：Vite 8.x + `@vitejs/plugin-react`。
  - 多页面应用架构（MPA）：独立打包 `popup.html`（快捷弹窗）、`options.html`（选项设置与控制中心）、`blocked.html`（安全拦截页）。
  - 后台服务进程：Rollup 单独配置入口编译输出无哈希的 `dist/background.js`（作为 MV3 Service Worker）。
- **图标与矢量体系**：`lucide-react`（专业级现代矢量图标体系，彻底替代纯文字与 Emoji） + Flag SVG/PNG 渐进式多国国旗渲染库。
- **样式与设计系统**：Vanilla CSS 现代设计系统（CSS Tokens 变量化架构、毛玻璃晶体拟态 Glassmorphism、科技深蓝/暗黑自适应深浅色调、微动效与平滑过渡过渡曲线）。
- **测试框架**：Vitest 5.x（单元测试覆盖 IP 检查器降级、双栈校验、习惯学习器、CIDR 匹配引擎与国旗转换）。

### 1.3 项目目录架构

```
Proxy-Protect/
├── public/                     # 静态资源（manifest.json、扩展图标、客户端软件 Logo）
│   ├── manifest.json           # MV3 配置文件
│   └── icons/                  # 扩展各尺寸图标、v2rayn-icon.ico、Clash-Verge.ico
├── src/
│   ├── background/             # MV3 Service Worker 后台守护核心
│   │   ├── index.ts            # 后台入口、生命周期协调与消息路由
│   │   ├── proxy.ts            # ProxyManager：chrome.proxy 核心控制与 scheme 映射
│   │   ├── checker.ts          # IpChecker：双栈出口 IP 多源检测与容灾竞速
│   │   ├── guard.ts            # GuardEngine：Fail-Closed 状态机与 DNR 拦截规则同步
│   │   ├── habit.ts            # HabitLearner：访问域名与地区习惯学习器
│   │   └── webrtc.ts           # WebRTC 隐私保护（防止非代理 UDP 泄露公网 IP）
│   ├── pages/                  # 前端各页面
│   │   ├── popup/              # 扩展快捷弹窗页面（Popup UI）
│   │   ├── options/            # 完整控制中心（Options Dashboard & Tabs）
│   │   ├── blocked/            # 安全拦截提示页（Blocked Fallback Page）
│   │   ├── icon/               # 原始客户端高清图标源码
│   │   └── ui/                 # 页面共享组件、Hooks、工具函数
│   ├── shared/                 # 前后台共享公共模块
│   │   ├── constants.ts        # 默认配置、存储 Key 与基础常量
│   │   ├── types.ts            # 核心数据结构接口定义
│   │   ├── storage.ts          # chrome.storage 抽象与变更侦听器
│   │   ├── messages.ts         # 前后台强类型 RPC 消息信道
│   │   ├── matchers.ts         # 域名通配符与 CIDR IP 匹配器
│   │   ├── countries.ts        # ISO 国家代号与中英文映射表
│   │   └── flags.ts            # 国旗 SVG/PNG 生成器
│   └── styles/                 # 全局设计规范与基础主题样式
│       └── base.css            # 现代全局设计系统（Tokens、Buttons、Switch、Cards）
├── tests/                      # Vitest 单元测试集
├── tools/                      # 构建与生成辅助脚本
├── popup.html                  # 弹窗 HTML 入口
├── options.html                # 设置面板 HTML 入口
├── blocked.html                # 拦截页 HTML 入口
├── vite.config.ts              # Vite 构建配置
├── tsconfig.json               # TypeScript 编译配置
└── package.json                # 依赖包与运行脚本
```

---

## 第二章 功能开发、更新演进与 Bug 修复历史

### [2026-09-06] 前端架构升级与控制面板/Popup UI 全面焕新重塑

- **需求背景**：用户反馈插件的原生 Web UI 与设置控制面板前端较为简朴，希望升级为更佳的前端技术栈，打造现代化、高颜值的控制台，同时严格保证底层网络与代理逻辑代码不变。
- **架构改动**：
  1. 将前端运行框架由基础 Preact 升级为 React 19 生态，引入 `@vitejs/plugin-react` 与 `@types/react`、`@types/react-dom`。
  2. 引入 `lucide-react` 专业级现代图标库，全面替换原先简陋的 Emoji 符号与纯字符图标。
  3. 全面重构 `base.css` 设计系统，引入晶体毛玻璃、精致发光、现代化卡片流布局、iOS 级切换开关、深浅双色自适应主题。
  4. 重构并美化 Popup 快捷弹窗、Options 五大核心选项卡（代理档案、守护规则、站点记事本、统计建议、系统设置）以及 Blocked 拦截提示页。

---

### [2026-09-06] 代理档案国家标记/模板支持与国家选择器上层下拉优化

#### 1. 需求背景与功能目标

用户提出三项细化体验与功能优化诉求：

1. 代理档案页面支持对 IP 落地页的国家进行标记，使用旗帜体现上一次检测结果，跟随探测参数与周期刷新功能同步后续检测。
2. 代理档案节点中添加两个模板代理软件设置：V2RayNG（默认 `127.0.0.1:10808` Socks5）和 Clash Verge（默认 `127.0.0.1:7897`），并引入对应官方 Logo 图标作为备注，支持用户自行修改与色盘自定义备注色卡。
3. 守护规则中的国家下拉菜单改为上层悬浮下拉菜单（Floating Dropdown），输入框失焦或按回车确定后自动隐藏，不破坏表单布局。

#### 2. 技术实现与详细代码演进

- **落地国家标记与周期探测持久化**：
  - 在 `src/shared/types.ts` 中为 `ProxyProfile` 扩展 `icon?: string` 与 `lastCheck?: ProfileCheckResult` 字段定义。
  - 在 `src/shared/constants.ts` 与 `src/shared/storage.ts` 中新增 `profileChecks` 存储键及存取访问器。
  - 修改 `src/background/ip-checker.ts` 中的 `doCheck()` 函数：当探测成功后，自动将本次落地的国家代码、IP、城市与时间戳写入活跃节点对象的 `lastCheck` 以及全局 `profileChecks` 映射表。
  - 当后台 `ALARM_RECHECK` 周期刷新或手动重新检测时，状态与节点国旗标记自动响应式同步更新。
  - 在 `src/pages/ui/hooks.ts` 中新增 `useProfileChecks()` 订阅 Hook。
- **模板节点与专属 Icon 备注支持**：
  - 将 `src/pages/icon/v2rayn-icon.ico` 与 `src/pages/icon/Clash-Verge.ico` 部署到 `public/icons/` 公共资源目录。
  - 在 `src/pages/ui/components.tsx` 中封装共享组件 `ProfileBadge`：支持按 `icon === 'v2ray' | 'clash'` 渲染高清客户端 Logo，或根据 `color` 渲染自适应色块。
  - 在 `src/pages/options/tabs/ProfilesTab.tsx` 中：
    - 顶部操作栏提供「＋ V2RayNG (10808)」与「＋ Clash Verge (7897)」一键快捷创建按钮。
    - 表单内提供快捷预填与「客户端图标选择」（纯色卡 / V2Ray / Clash Verge）。
    - 提供预设调色盘以及原生 `<input type="color">` 调色器，支持任意自定义色卡。
    - 节点卡片中渲染上次检测落地国家 `<Flag cc={...} withName />` 徽章与出口 IP。
  - 在 `src/pages/popup/App.tsx` 的节点列表中同步渲染客户端 Logo 图标与上次检测落地的国旗标记。
- **国家多选浮动下拉菜单 (CountrySelect)**：
  - 重构 `src/pages/options/components/CountrySelect.tsx`：
    - 增加 `isOpen` 状态与 `useRef`，输入框获取焦点 (`onFocus`) 或点击时展开浮动面板。
    - 监听按键：`Enter` 键自动选中匹配项或自定义代码并立即收起；`Escape` 键直接收起。
    - 监听失焦 (`onBlur`) 与全局点击事件：点击输入框外部自动隐藏下拉面板；菜单内部 `onMouseDown` 阻止冒泡避免多选时误收起。
  - 重构 `src/pages/options/options.css`：
    - 将 `.country-select` 设为 `position: relative`。
    - 下拉菜单采用绝对定位 `.country-list-overlay` (`position: absolute; top: calc(100% + 4px); z-index: 100; box-shadow: var(--shadow-md); backdrop-filter: blur(16px);`)，彻底改为上层悬浮菜单，不再撑开表单。

#### 3. 验证与回归测试记录

- **静态类型检查 (TypeScript)**：执行 `tsc --noEmit`，全项目 **0 错误、0 警告**。
- **单元测试集 (Vitest)**：执行 `npm test`，全部 6 个测试套件、45 项核心逻辑测试 **100% 通过**。
- **生产环境打包 (Vite)**：执行 `npm run build`，成功输出 `dist/`，全部静态产物正常生成，打包耗时 586ms。

---

### [2026-09-06] 四项核心 BUG 诊断与深度修复演进

#### 1. 问题诊断与根因分析

1. **小面板落地检测死循环无限刷新**：
   - **根因分析**：在 `src/background/ip-checker.ts` 中，检测完成后调用了 `saveProfiles(profiles)` 更新激活节点的 `lastCheck` 时间戳；而在 `src/background/index.ts` 中侦听到 `chrome.storage.onChanged` 的 `K.profiles` 变更时，使用 `JSON.stringify(oldP) !== JSON.stringify(newP)` 判定代理档案变更，进而调用 `guard.lockAndRecheck()` 重新触发 `doCheck()`。这导致“检测成功 -> 写 profiles -> 触发变更监听 -> 重新锁屏检测 -> 再次写 profiles”的无限死循环。
2. **ProfilesTab 顶部按钮与表单快捷套用重复建设**：
   - **根因分析**：`tab-header-row` 中添加了「＋ V2RayNG (10808)」和「＋ Clash Verge (7897)」两个直接生成未命名配置的按钮，与下方新建代理档案表单内的快捷套用按钮功能重复且破坏界面视觉焦点。
3. **代理档案页面缺少节点直接检测落地 IP 功能**：
   - **根因分析**：此前只有在小面板切换代理时才会触发该代理的落地探测，在选项页无法对已建档案进行即时落地检测，必须切回弹窗切换才能验证代理是否有效。
4. **直连模式下无法检测到 IPv4 地址**：
   - **根因分析**：在 `src/shared/dual-stack.ts` 中，纯 IPv4 探测源硬编码了 `https://api.ipify.org`，而在中国大陆网络直连环境下，该域名存在极高的连接重置（Connection Reset by Peer）阻断率；且当 IPv6 成功而 IPv4 失败时，双栈逻辑直接退出，未对 IPv4 实施多源竞速与补齐；在双栈降级到 checkers 时，双栈域名走 IPv6 导致获取到的仍是 IPv6，IPv4 始终为空。

#### 2. 技术实现与修复细节

- **根治检测死循环 (ip-checker.ts & index.ts)**：
  - 在 `src/background/index.ts` 中引入 `isProxyConnectionEqual(a, b)`，严格限定只比对 `host`、`port`、`scheme`、`auth` 和 `bypassList` 核心网络参数；当仅有 `lastCheck`、`name`、`icon`、`color` 等元数据变化时，不触发代理重新应用与锁屏重验。
  - 在 `src/background/ip-checker.ts` 中彻底剥离 `saveProfiles(profiles)` 调用，所有节点的落地检测结果仅持久化在专用的 `K.profileChecks` 键中，从源头上与 `K.profiles` 变更解耦。
- **清理顶部重复按钮 (ProfilesTab.tsx)**：
  - 移除 `tab-header-row` 中的两个一键创建模板按钮，仅保留高辨识度的「＋ 新增代理档案」主操作按钮，模板套用统一集中在表单内的快捷工具栏中。
  - 同步更新列表空状态提示文案。
- **代理节点卡片增加「检测落地」操作按钮 (ProfilesTab.tsx)**：
  - 为每个已创建的代理卡片右侧操作栏添加「检测落地」功能按钮。
  - 若为当前激活档案，点击后发送 `recheckIp` 指令刷新当前落地检测；若为非激活档案，点击后调用 `switchProfile` 一键激活并立即开始探测该节点的落地 IP。
  - 按钮集成 Loading 旋转动效与状态联动，检测完成后自动刷新该卡片的国旗、IP 与地理位置。
- **双栈 IPv4 多源高可用竞速探测器 (dual-stack.ts)**：
  - IPv4 独立探测源重构为包含 `https://ipv4.icanhazip.com`（Cloudflare 官方权威 IPv4，国内直连极速稳定）、`https://v4.ident.me`、`https://api4.ipify.org` 等多节点的高可用列表。
  - IPv6 独立探测源采用 `https://ipv6.icanhazip.com`、`https://v6.ident.me` 等多源保障。
  - 实现 `fetchFirstValidIp(urls, timeoutMs, wantV4)`，使用 `Promise.any` 进行高并发竞速与容灾回退；只要网络具备 IPv4，即可在秒级精准捕获真实公网 IPv4。
  - 增强 `lookupGeo` 归属地查询：优先 `ipwho.is`，异常时降级至 `freeipapi`，确保单 IP 与双栈归属地信息完备。
  - 降级 checkers 补充逻辑：若首选检测源仅返回 IPv6，主动尝试快速补齐 IPv4，确保双栈信息完整呈现。

#### 3. 验证与回归测试记录

- **静态类型检查 (TypeScript)**：执行 `tsc --noEmit`，全项目 **0 错误、0 警告**。
- **单元测试集 (Vitest)**：执行 `npm test`，全部 6 个测试套件、45 项核心逻辑测试 **100% 通过**。
- **生产环境打包 (Vite)**：执行 `npm run build`，成功输出 `dist/`，全部静态产物正常生成。

---

### [2026-09-06] Popup 小面板底部布局精简与冗余链接移除

#### 1. 需求背景

Popup 弹窗右上角已具备直观的齿轮设置图标按钮（`<SettingsIcon />`），可直接点击调起扩展控制中心（Options 页面）。底部原有的 `<footer className="popup-footer row-between">` 说明文本与“管理中心”重复超链接显得繁冗，故予以精简删除，提升弹窗底部整洁度与紧凑度。

#### 2. 技术实现

- 在 `src/pages/popup/App.tsx` 中移除 `<footer className="popup-footer">` 容器及其子元素，并移除未使用的 `ExternalLink` 图标导入。
- 在 `src/pages/popup/popup.css` 中清理已不再使用的 `.popup-footer` 样式规则，保持弹窗整体由统一的 `padding: 14px` 提供自然的底部呼吸感。

#### 3. 验证记录

- `tsc --noEmit` 静态类型检查 **0 错误**。
- `npm test` 单元测试 **45 项 100% 通过**。
- `npm run build` 打包构建成功，`dist/` 产物已同步更新。

---

### [2026-09-06] 安全阻断界面风险评分与归因增强、固定路由打开、节点直切支持与 V2RayN 命名统一

#### 1. 需求背景与功能目标

1. **安全阻断界面精准归因与风险评分**：阻断界面明确告知用户是具体由于“落地出口 IP 不符合允许网段”、“落地地区不匹配”，还是“WebRTC 泄露防护未开启”（未开启 WebRTC 保护同样强制阻断），并给出当前阻断的风险综合评分与风险因子明细。
2. **控制中心按钮升级与固定路由打开**：操作按钮文字由“打开控制中心切换代理”优化为“打开控制中心检查代理”，点击时在浏览器新建标签页访问插件后台固定的 `options.html` 页面路由。
3. **代理档案节点页面支持直接切换**：在代理档案卡片操作栏中添加直观的「切换到」按钮，允许用户直接在控制中心页面切换当前激活的代理节点，无需依赖弹窗小面板。
4. **统一客户端模板命名**：将快捷套用中的 `V2Ray` 规范更正为 `V2RayN`。

#### 2. 技术实现细节

- **守护规则引擎与 WebRTC 联动阻断 (guard-engine.ts & matchers.ts)**：
  - 在 `src/shared/matchers.ts` 中新增 `evaluateSiteDetails()` 函数，分别输出 `countryMatch`、`ipMatch` 与多维度配置存在状态。
  - 在 `src/background/guard-engine.ts` 的 `recomputeFromCheck()` 流程中引入 `loadSettings()`：
    - 严格检查 `settings.webrtcProtect !== false`；
    - 哪怕出口地区和 IP 均满足，只要 WebRTC 保护未开启，受保护站点同样判定为 `locked` 强制阻断，杜绝浏览器通过非代理 UDP 导致公网真实 IP 穿透泄露；
    - 生成详实的阻断原因 `reason`（标明具体违规维度：地区不匹配、IP 超出网段、WebRTC 未开启）。
- **阻断界面风险评分模型与可视化 (blocked/App.tsx & blocked.css)**：
  - 构建多因子加权风险评估模型：
    - 基础阻断分（50）、未确认出口（95）、地区违规（+30，若是大陆 IP 访问敏感海外站再 +15）、IP 段违规（+25）、WebRTC 保护关闭（+30）、双栈泄露（+15），评分动态封顶 99 分。
    - 自动判定风险等级：极高风险（80-99）、高风险（65-79）、中风险（50-64）。
  - 在阻断页面新增 `<div className="blocked-risk-card">`，直观呈现风险评分仪表盘（如 `85/100 极高风控风险`）、动态不匹配胶囊以及各项触发阻断的风险因子详细清单。
  - 将操作按钮更新为“打开控制中心检查代理”，点击执行 `chrome.tabs.create({ url: chrome.runtime.getURL('options.html') })`，以新建标签页的形式直达固定页面。
- **代理档案卡片直切代理功能 (ProfilesTab.tsx)**：
  - 在 `ProfilesTab.tsx` 中实现 `switchToProfile(id)` 函数。
  - 在每个代理卡片右侧操作栏中：
    - 未激活节点：新增蓝色的「切换到」主按钮，点击后发送 `switchProfile` 指令并执行落地验证。
    - 激活中节点：展示「使用中」安全绿色标签。
- **模板与全站 V2RayN 命名统一 (ProfilesTab.tsx & components.tsx)**：
  - `TEMPLATES` 中的模板名称更正为 `V2RayN`。
  - 表单顶部快捷套用按钮文本由 `V2Ray` 更正为 `V2RayN`。
  - 表单内占位符文案、图标选项文本以及 `ProfileBadge` 的 alt 属性全量统一为 `V2RayN`。

#### 3. 验证与回归测试记录

- **静态类型检查 (TypeScript)**：执行 `tsc --noEmit`，全项目 **0 错误、0 警告**。
- **单元测试集 (Vitest)**：执行 `npm test`，全部 6 个测试套件、45 项测试 **100% 通过**。
- **生产环境打包 (Vite)**：执行 `npm run build`，成功输出包含 `blocked.html`、`options.html`、`popup.html` 的生产资源包。

---

### [2026-09-06] 六项高阶安全与效率功能演进（智能自愈修复、自学习录入严格度、RTT 延迟测量、配置备份与链接解析、隐私跳转工具集、内外分流检测）

#### 1. 需求背景与功能目标

用户提出了 6 项系统级安全防护与易用性增强诉求：

1. **安全拦截页智能自愈修复**：前提条件必须是插件内检测到有符合当前受阻网站期望（匹配允许国家/IP段）的已配置代理节点时，才在 `blocked.html` 呈现一键修复卡片；点击后自动无缝切换该合规节点并自动重定向回原网站。
2. **养号策略自学习严格度确认**：在原有域名与国家学习的基础上，引入代理落地真实 IP 样本（`sampleIp`）的自动捕获；用户在自学习确认面板（HabitsTab）中可自主选择录入规则的严格程度（“标准国家匹配”或“严苛 /24 子网匹配”）。
3. **RTT 延迟测量与全景呈现**：在代理落地检测时精确测量 HTTP 往返时延（`rttMs`），持久化保存并在代理档案卡片（ProfilesTab）及网络面板中通过带颜色区分的时延徽章（如 `⚡ 85ms`）清晰体现。
4. **配置备份导入导出与快捷链接解析**：支持将所有代理配置一键导出为纯文本 JSON 备份文件，并支持从 JSON 导入合并；在代理添加面板支持粘贴 `socks5://`、`http://`、`https://` 代理 URL 快捷识别解析并自动填充表单。
5. **网络隐私与质量跳转工具集**：在落地网络状态面板中添加一键诊断快捷超链接按钮：
   - `https://ip.net.coffee/`（IP 质量评分与 DNS 泄露检测）
   - `https://www.ip2location.com/{ip}`（IP2Location 深度归属、ASN 与运营商查询）
   - `https://browserleaks.com/webrtc`（WebRTC STUN/ICE 真实公网穿透泄露检测）
6. **内外分流检测与全局代理安全风控**：检测代理服务是否做了内外分流（访问国内接口返回大陆真实 IP，而访问海外返回国外代理 IP）。在代理档案界面标记 `⚠️ 非全局分流`；同时作为安全阻断界面的重要风险评分维度（计入阻断风险评估）。

#### 2. 技术实现与架构演进

- **方向一：智能条件自愈修复引擎 (blocked/App.tsx & blocked.css)**：
  - 在 `blocked/App.tsx` 中建立 `healingCandidate` 计算逻辑：遍历所有可用代理档案（排除当前激活节点），对照当前站点的 `expectedCountries` 和 `expectedIpRanges` 进行严格匹配。
  - **严格前提约束**：若没有任何可用档案满足该站点的规则期望，自愈卡片**坚决不显示**，避免误导；只有存在匹配档案时，才在拦截页显眼位置渲染 Emerald 翡翠流光渐变配色的 `.blocked-heal-card`。
  - 用户点击「立即切换并访问」时，后台调用 `switchProfile` 一键激活该合规节点，并自动执行 `window.location.replace(targetUrl)` 重新跳转，实现一键闭环自愈。
- **方向二：自学习录入严格度确认与样本 IP 捕获 (habit-learner.ts, HabitsTab.tsx & messages.ts)**：
  - 数据模型升级：在 `Suggestion` 接口中扩展 `sampleIp?: string` 字段；在 `BgCommand.acceptSuggestion` 指令中扩展 `expectedIpRanges?: string[]` 与 `matchMode?: 'any' | 'all'`。
  - 学习器采样：在 `src/background/habit-learner.ts` 中，当触发阈值生成推荐建议时，将当时检测到的落地 IPv4 地址记入 `sampleIp`。
  - 确认录入面板交互重构：在 `HabitsTab.tsx` 中，用户点击「采纳并创建规则」时展开自学习确认面板：
    - **标准国家匹配**：仅将主导国家/地区加入规则，适合动态住宅代理池或大型 CDN 节点。
    - **严苛 /24 子网匹配**：基于捕获的 `sampleIp` 自动计算提取前三个段（如 `104.28.19.0/24`），实现子网级严苛锁定，强力防御跳池封号风险。
- **方向三：高精度 RTT 往返时延测量 (dual-stack.ts, types.ts & ProfilesTab.tsx)**：
  - 在 `src/shared/types.ts` 中的 `ProfileCheckResult` 和 `ExitIpResult` 中扩充 `rttMs?: number` 属性。
  - 在 `src/shared/dual-stack.ts` 中，以请求发起时刻 `startTime = Date.now()` 为基准，在成功响应并解析完成时刻计算 `rttMs = Date.now() - startTime`。
  - 延迟指标持久化保存至 `profileChecks` 存储映射表中，在 `ProfilesTab.tsx` 的节点卡片中根据时延梯队渲染颜色徽章：`<250ms` 绿色极速、`<800ms` 橙黄良好、`>=800ms` 红色高延迟。
- **方向四：JSON 备份导入导出与代理链接一键解析 (ProfilesTab.tsx)**：
  - 在 `ProfilesTab.tsx` 顶部操作栏中新增「导出 JSON」与「导入 JSON」工具按钮，支持独立导出 `proxy-profiles-backup-*.json`，导入时支持智能合并去重与自动补全 UUID。
  - 在新建/编辑表单顶部新增「快速解析」交互栏，内建正则解析函数 `parseProxyUrl`：
    - 兼容匹配 `socks5://[user:pass@]host:port[#name]`、`http://`、`https://` 格式标准 URI；
    - 自动提取协议、地址、端口、用户名、密码与 Hash 备注名，一键填表并给予友好的即时解析反馈。
- **方向五：网络隐私与质量跳转工具集 (ExitIpPanel.tsx)**：
  - 在公共组件 `ExitIpPanel.tsx` 中新增紧凑精致的 `.exit-toolkit` 跳转工具栏，集成 `ExternalLink` 矢量图标：
    - 一键直达 `https://ip.net.coffee/` 进行 IP 欺诈度打分与 DNS 污染泄露探测；
    - 一键直达 `https://www.ip2location.com/${ip}` 进行深度归属地与 ASN 运营商核验；
    - 一键直达 `https://browserleaks.com/webrtc` 检测 WebRTC 是否穿透代理泄漏真实本地公网 IP。
- **方向六：内外分流非全局代理检测与风险评估模型 (dual-stack.ts, ProfilesTab.tsx & blocked/App.tsx)**：
  - 双探针分流探测：在 `src/shared/dual-stack.ts` 中实现 `fetchDomesticIp('https://ip.3322.net')`；当代理访问海外节点为境外 IP（非 CN），而访问国内探针返回有效国内 IP 且与海外 IP 不一致时，判定为 `isSplitTunnel: true`。
  - 卡片与面板安全警示：在 `ProfilesTab.tsx` 代理卡片中显著呈现 `⚠️ 非全局分流` 警示标签（全局代理则显示 `🌐 全局代理`）；在 `ExitIpPanel.tsx` 中呈现内外分流风险警示条。
  - 安全阻断界面风控评分加权：在 `blocked/App.tsx` 风险评分模型中加入非全局代理风险因子（分流 +20 分，并在风险详情中提示“检测到代理存在内外分流，境内域名直连国内网络，存在目标域名绕过代理被平台风控的隐患”）。

#### 3. 验证与回归测试记录

- **静态类型检查 (TypeScript)**：执行 `tsc --noEmit`，全项目 **0 错误、0 警告**。
- **单元测试集 (Vitest)**：执行 `npm test`，全部 6 个测试套件、45 项测试 **100% 通过**。
- **生产环境打包 (Vite)**：执行 `npm run build`，成功编译输出 `dist/`，全部前端页面与 Service Worker 均无异常。

---

### [2026-09-06] 代理单节点隔离检测落地 BUG 修复与「当前站点一键加护」卡片演进

#### 1. 需求背景与问题诊断

1. **代理档案检测导致代理被动切换 BUG 修复**：
   - **问题现象**：在代理档案卡片中点击「检测落地」时，非激活节点的检测代码直接调用了 `switchProfile`，导致当前浏览器的全局代理与激活档案被动切换为被检测的节点，破坏了用户的网络连续性。
   - **优化诉求**：点击检测仅用于单条代理的探测与更新，绝不改变当前浏览器的代理设置；只有在用户主动点击「切换到」按钮时才执行切换；检测使用的管线必须与当前浏览器实际代理实现完全隔离。
2. **「当前站点一键加护」卡片按钮功能实现**：
   - **功能目标**：在 Popup 弹窗中自动读取当前活跃标签页的 URL 域名、当前代理服务器名称、真实出口 IP、落地国家地区，当即供用户按需选择严格程度（标准国家、严苛 /24 网段、锁定单一 IP）并一键保存为新的守护规则，实现即开即护。

#### 2. 技术实现细节

- **代理独立测试与 PAC 隔离管线 (proxy-manager.ts, ip-checker.ts & ProfilesTab.tsx)**：
  - 在 `src/background/proxy-manager.ts` 中实现 `buildTestPacScript(testProfile, activeProfile, customHosts)`：
    - 采用 Chromium 原生 PAC 脚本机制：仅将探测相关的指定探针域名（`icanhazip.com`, `ident.me`, `ipify.org`, `ipwho.is`, `freeipapi.com`, `3322.net` 等）导流至待测代理；
    - 其余所有网站流量继续保持走当前实际激活的代理（或直连），彻底做到检测流量与业务流量物理隔离。
  - 在 `src/background/ip-checker.ts` 中实现 `testProfileIsolated(profileId)`：
    - 针对非激活节点，临时应用 PAC 脚本并在 `finally` 结构中必定调用 `restoreActiveProxy()` 恢复原始代理；
    - 检测结果写入 `profileChecks[profileId]`，绝不更改 `activeProfileId`，不污染全局 `checkState`；
    - 支持代理 HTTP 认证隔离凭据传递（`setTestingProfile`）。
  - 在 `src/background/index.ts` 消息中心注册 `testProfile` 指令并在 `src/shared/messages.ts` 扩展类型。
  - 在 `src/pages/options/tabs/ProfilesTab.tsx` 中将 `checkProfileIp` 的非激活分支从 `switchProfile` 切换为 `testProfile`，点击「检测落地」仅刷新当前卡片信息，用户点击「切换到」才调用 `switchProfile`。
- **「当前站点一键加护」专属卡片 (popup/App.tsx & popup.css)**：
  - **当前标签页自动识别**：在 `popup/App.tsx` 加载时通过 `chrome.tabs.query({ active: true, currentWindow: true })` 读取激活标签页 URL 并提取规范化域名（忽略 `chrome://` 等本地页面）。
  - **未加护状态（一键加护）**：
    - 展示当前网络四要素网格（访问域名、当前代理服务器、落地出口 IP、落地国家地区 Flag）。
    - 引入三档严格度选择器：
      - **标准国家**：仅绑定国家代码，适合动态住宅池。
      - **严苛 /24 网段**：提取当前 IP 的前三段（`x.x.x.0/24`），防跳池、防跨机房异地风控。
      - **锁定单一 IP**：严格限定当前单一出口（`/32`），适合独享固定静态原生 IP。
    - 点击「一键开启加护」即刻生成 `ProtectedSite`，写入 `sites` 存储，触发 `guard.onSitesChanged()` 毫秒级应用 Fail-Closed 保护。
  - **已加护状态（实时看板）**：
    - 自动匹配已有规则（`urlMatchesDomain`），展示「当前网站已受安全守护」卡片、实时放行/拦截状态胶囊、绑定的期望国家国旗及限定 IP 网段。
  - **样式与微动效**：在 `popup.css` 中增加科技高光侧边条、毛玻璃卡片 `.current-site-card` 与 `.strict-selector` 胶囊交互设计。

#### 3. 验证与回归测试记录

- **静态类型检查 (TypeScript)**：执行 `tsc --noEmit`，全项目 **0 错误、0 警告**。
- **单元测试集 (Vitest)**：执行 `npm test`，全部 6 个测试套件、45 项核心测试 **100% 通过**。
- **生产环境打包 (Vite)**：执行 `npm run build`，成功打包输出全部扩展产物。

---

### [2026-09-06] 项目版本号正式跃升至 v3.0.1

- **版本号同步更新**：
  - `public/manifest.json`：`"version": "3.0.1"`
  - `package.json`：`"version": "3.0.1"`
  - `package-lock.json`：`"version": "3.0.1"`
- **产物构建与验证**：执行 `npm run build`，重新生成并打包生产环境资源，Popup 弹窗及 Options 控制台顶部动态展示版本号已全面更新为 `v3.0.1`。

---

### [2026-09-06] 彻底解决「当前网站一键加护」卡片被压缩排版缺陷

- **深度根因排查**：
  1. **Chrome 扩展宿主弹窗视口机制**：之前仅针对 `.popup-body` 声明了 `width: 416px`，但 MV3 Action Popup 宿主窗口尺寸优先由根元素 `<html>` 决定。若 `html` 缺少明确的 `width` 与 `min-width`，Chromium 会在 Windows 桌面高 DPI 缩放（如 125%/150%）及垂直滚动条（17px）出现时，自动将弹窗可用宽度压缩至 340px 左右。
  2. **Flexbox 纵向弹性挤压 Bug**：`.popup` 容器使用了 `display: flex; flex-direction: column; max-height: 600px; overflow-y: auto;`，但子项缺少 `flex-shrink: 0;`。当弹窗中包含落地卡片、一键加护、习惯推荐、代理列表等多重元素超出 600px 时，CSS Flexbox 会在触发滚动条前优先压缩子项高度，导致加护卡片被垂直压扁逼仄。
  3. **胶囊按钮折行挤压**：`.strict-selector` 内部按钮由于未强制 `white-space: nowrap`，文字在较窄栅格中出现偶发折行（如 `/24 子网` 与 `掩码` 分开两行），高度参差不齐。
  4. **Flex 元素未声明 min-width 0**：目标域名通栏行及环境信息行缺少 `min-width: 0; flex: 1` 约束，右侧标签和左侧文字互相争抢宽度。
- **针对性重构方案**：
  1. **视口双层硬锁与宽幅拓展**：在 `popup.css` 中同时对 `html` 与 `body.popup-body` 声明 `width: 460px; min-width: 460px; overflow-x: hidden;`，全面提升可用视口宽度，消除窄窗问题。
  2. **弹性纵向挤压全局清零**：为 `.popup > *` 及 `.current-site-card` 配置 `flex-shrink: 0;`，确保所有卡片始终维持原始丰满的内边距与自然高度，仅通过垂直滚动条承载长列表。
  3. **选择器抗折行与文案精修**：按钮文字添加 `white-space: nowrap;`，精简文案为「标准国家（限 XX）」、「同机房网段（/24 网段）」、「单一出口（单一 IP (/32)）」，网格间距微调为 `8px`，左右留白充裕美观。
  4. **域名通栏流式抗挤压**：引入 `Globe` 矢量地球图标，采用 `minWidth: 0, flex: 1` 配合 `ellipsis`，超长域名优雅省略截断，右侧状态小胶囊 `flex: none` 绝对不被推挤。
- **验证与产物构建**：
  - **静态类型检查 (TypeScript)**：执行 `tsc --noEmit`，全项目 **0 错误、0 警告**。
  - **单元测试集 (Vitest)**：执行 `npm test`，全部 6 个测试套件、45 项测试 **100% 通过**。
  - **生产构建打包 (Vite)**：执行 `npm run build`，成功编译输出至 `dist/`，最新 CSS 与 JS 产物生效。

---

### [2026-09-06] 色卡自助调色盘拓展与选中态/沉浸光晕色彩动态联动

- **功能背景与目标**：
  提升用户对代理节点色彩标记的自由度与面板视觉沉浸感。通过色盘允许自主选取任意自定义色，并让当前选中节点与整体面板的背景渐变光晕跟随该颜色联动。
- **具体改造内容**：
  1. **色卡自助调色盘与 Hex 预览**：
     - 在控制台「代理档案」编辑表单中，除原有 8 种高频预设色卡外，增加了带 Palette 图标的全色域「自助调色盘」取色器；
     - 增加实时十六进制色值标签（如 `#8B5CF6`），支持直观识别与高亮反馈；自定义色选中时带有专属柔光外发光。
  2. **小面板被选中项淡色微光渐变**：
     - 小面板中 `.list-row.profile-row.profile-active` 采用基于当前节点颜色的横向淡色渐变 `linear-gradient(90deg, rgba(color, 0.16) 0%, rgba(color, 0.03) 100%)`；
     - 节点活跃标识 `.profile-active-check` 与外边框光晕同步采用节点专属色彩渲染，打通直连模式（翡翠绿）、系统代理（灰蓝）与所有自定义节点。
  3. **整体面板右下角沉浸光晕联动**：
     - 将小面板右下角固定紫色光晕 `radial-gradient(80% 50% at 100% 100%, var(--purple-glow))` 升级为动态 CSS 变量 `var(--active-theme-glow)`；
     - 「当前网站一键加护」卡片右下角微光与高光装饰边条亦同步自适应当前激活节点的主色调，切换节点时呈现丝滑的沉浸光影流转。
- **验证与构建**：
  - `tsc --noEmit` 静态类型检查 **0 错误**；
  - `npm test` 单元测试全部 45 项测试 **100% 通过**；
  - `npm run build` 成功完成打包构建，产物全面写入 `dist/`。

---

### [2026-09-06] 模版色卡默认颜色绑定与档案编辑无感/防丢切换机制

#### 1. 需求背景与问题诊断

1. **模版色卡默认颜色绑定**：
   - 用户诉求：Clash Verge 模版组默认使用 `#BAA5FD`（标志性淡紫）；V2RayN 默认使用 `#3B82F6`（科技蓝）。在套用模板及客户端图标切换时需同步应用对应专属色卡。
2. **编辑状态无感与防丢切换机制**：
   - **问题现象**：在编辑一个档案时，点击列表中另一份档案的“编辑”按钮表单无法自动切换，内容仍停留在之前的档案。
   - **根因分析**：`<ProfileForm />` 组件内部使用 `useState(initial?.xxx)` 初始化状态，且外层挂载时缺少唯一的 `key` 绑定。当父组件的 `editing` 切换为另一份档案时，React 默认复用既有 DOM 与组件实例，导致 `useState` 初始值未被重新求值，表单死锁在旧档案。
   - **防误触诉求**：检测用户当前表单是否有实际修改行为（Dirty Checking）。若表单发生过实质修改，用户点击切换至其他档案编辑或新建时弹出二次确认提示保存或放弃；若无任何修改行为，直接无感切换到目标档案的编辑表单。

#### 2. 技术实现细节 (ProfilesTab.tsx)

- **模版与客户端图标颜色联动**：
  - 在 `src/pages/options/tabs/ProfilesTab.tsx` 中更新 `TEMPLATES` 常量，Clash Verge 色彩配置为 `#BAA5FD`，V2RayN 配置为 `#3B82F6`。
  - 在 `ProfileForm` 客户端图标切换处理中，点击「V2RayN 图标」同步设置 `color: #3B82F6`，点击「Clash Verge 图标」同步设置 `color: #BAA5FD`。
- **表单脏状态检测 (Dirty Checking)**：
  - 在 `ProfileForm` 内部通过 `useMemo` 实时监测 9 项核心配置状态（`name`, `scheme`, `host`, `port`, `username`, `password`, `bypass`, `color`, `icon`, `quickUrl`）。
  - 与初始值 `initial` 进行严格一致性判定（其中 `color` 进行大小写不敏感比对，`bypass` 进行空行去除规整）。一旦任一字段被用户键入或修改，即标记为 `isDirty: true`，并通过 `onDirtyChange` 实时通知父级控制器。
- **安全调度器与无感刷新 (requestEdit & key 机制)**：
  - 在父组件 `ProfilesTab` 中实现调度器 `requestEdit(target: ProxyProfile | 'new')`：
    - 若目标为当前正在编辑的档案，直接返回；
    - 若当前表单处于 `isDirty: true` 状态，触发 `window.confirm` 提示用户是否放弃未保存的修改；若用户点击「取消」则留在当前编辑表单以便保存；若确认放弃则允许切换；
    - 若无修改行为或已确认放弃，立即更新 `editing` 状态。
  - 为 `<ProfileForm />` 注入唯一键 `key={editing === 'new' ? 'new' : editing.id}`：
    - 切换目标时触发 React 彻底销毁旧实例并按新 `initial` 数据重新挂载，彻底根除表单死锁未切换缺陷。
  - 同步优化表头「新增代理档案」按钮、列表项「编辑」按钮（编辑中状态高亮）以及「取消」按钮的防丢保护。

#### 3. 验证与回归测试记录

- **静态类型检查 (TypeScript)**：执行 `tsc --noEmit`，全项目 **0 错误、0 警告**。
- **单元测试集 (Vitest)**：执行 `npm test`，全部 6 个测试套件、45 项核心测试 **100% 通过**。
- **生产构建打包 (Vite)**：执行 `npm run build`，成功在 805ms 内构建输出全部生产资源，静态代码已全面同步至 `dist/`。

---

### [2026-09-07] 网络隐私与质量检测工具集下移至 Footer、节点延迟紧随国旗展示与版本跃升至 v3.1.5

#### 1. 需求背景与功能目标

1. **网络隐私与质量检测工具集布局优化**：
   - 原先在 `ExitIpPanel.tsx` 中，工具栏夹在 IP 详情信息与卡片底部元数据（`exit-meta`）之间，割裂了 IP 检测源和检测时间的信息连续性。
   - 用户诉求：将「网络隐私与质量检测工具集」统一放置在卡片下方的 Footer 区域。
2. **节点选项延迟信息位置调整**：
   - 用户诉求：将 `⚡ 164ms` 延迟信息紧随放置在代理档案节点选项的国旗后，使落地国家、国旗与往返延迟浑然一体，方便在小面板（Popup）与控制台（Options）中一眼纵览代理质量。
3. **版本号统一升级**：
   - 将插件整体版本跃升为 `v3.1.5`，并重新完成全链路生产构建与打包。

#### 2. 技术实现细节

- **工具集沉底卡片 Footer (ExitIpPanel.tsx)**：
  - 调整组件 JSX 布局流：将原本位于中间的 `.exit-toolkit` 移至 `exit-meta`（源和检测时间）下方，作为卡片最底部的独立 Footer 区域（附加 `.exit-card-footer` 样式）。
  - 保留 IP 质量/DNS 泄露、IP2Location 归属与 WebRTC 穿透检测三大快捷跳转链接，边框采用虚线分割，卡片排版主次更加分明。
- **节点选项延迟紧随国旗后展示 (popup/App.tsx & ProfilesTab.tsx)**：
  - **Popup 小面板 (`ProfileRow`)**：在 `<Flag cc={...} />` 及国家代号标签后追加 `{typeof props.lastCheck.rttMs === 'number' && <span className="mono">⚡ {props.lastCheck.rttMs}ms</span>}`，让用户在弹窗节点列表中即可直观感知节点测速延迟。
  - **Options 控制台 (`ProfilesTab.tsx`)**：将原先独立浮在后方的延迟标签整合进国旗信息胶囊内部，紧随 `<Flag />` 后渲染高亮延迟数值（根据延迟大小自适应绿/橙/红三色），并紧邻出口 IP，布局更为紧凑专业。
- **全项目版本号跃升至 v3.1.5**：
  - `public/manifest.json`：`"version": "3.1.5"`
  - `package.json`：`"version": "3.1.5"`
  - `package-lock.json`：`"version": "3.1.5"`

#### 3. 验证与回归测试记录

- **静态类型检查 (TypeScript)**：执行 `tsc --noEmit`，全项目 **0 错误、0 警告**。
- **生产构建打包 (Vite)**：执行 `npm run build`，成功耗时 750ms 重新编译生成 `dist/`，所有页面动态读取版本号均为 `v3.1.5`。

---

### [2026-09-07] 网络隐私与质量检测工具集移至全局卡片 Footer、删除 exit-meta 与清理延迟小闪电 Emoji

#### 1. 需求背景与功能目标

1. **网络隐私与质量检测工具集全局沉底**：
   - 之前将工具集仅置于落地 IP 卡片底部；用户明确要求将该工具集放置在**整个 Proxy Protect 卡片的 Footer 区域**，即位于「域名安全守护板块」之后，作为弹窗最底部的全功能工具栏。
2. **清理冗余元数据行**：
   - 彻底删除 `ExitIpPanel.tsx` 中的 `<div className="row-between muted small exit-meta">`（包含源和更新时间），消除单体卡片底部繁杂信息，视觉更聚焦。
3. **精简延迟显示 Emoji**：
   - 移除代理列表中往返延迟前的小闪电 Emoji（`⚡ `），仅保留清晰整洁的数值与单位（如 `164ms`），消除视觉冗余。

#### 2. 技术实现细节

- **整个 Proxy Protect 卡片 Footer 重构 (popup/App.tsx & popup.css)**：
  - 从 `ExitIpPanel.tsx` 中彻底移除 `exit-toolkit` 及未使用的 `ExternalLink`、`timeAgo` 依赖。
  - 在 `src/pages/popup/App.tsx` 中，将工具集移至域名安全守护 `<section className="popup-section">` 之后，作为整个弹窗的 `<footer className="popup-footer exit-toolkit">`。
  - 动态读取检测到的公网 IP（`checkState?.result?.ipv4 || checkState?.result?.ip`），自动绑定至 IP2Location 归属地深度查询链接；同时保留 IP 质量/DNS 泄露与 WebRTC 穿透检测两大快捷链接。
  - 在 `popup.css` 中为 `.popup-footer` 配置内边距、虚线边框与卡片背景底衬。
- **删除 exit-meta 元数据行 (ExitIpPanel.tsx)**：
  - 移除 `<div className="row-between muted small exit-meta">`，落地 IP 卡片在双栈/分流提示后直接自然闭合。
- **清理代理列表往返延迟小闪电 Emoji (popup/App.tsx & ProfilesTab.tsx)**：
  - 在 Popup 的 `ProfileRow` 中将 `⚡ {props.lastCheck.rttMs}ms` 改为 `{props.lastCheck.rttMs}ms`。
  - 在 Options 控制台的 `ProfilesTab.tsx` 中将 `⚡ {check.rttMs}ms` 改为 `{check.rttMs}ms`。

#### 3. 验证与回归测试记录

- **静态类型检查 (TypeScript)**：执行 `tsc --noEmit`，全项目 **0 错误、0 警告**。
- **单元测试集 (Vitest)**：执行 `npm test`，全部 6 个测试套件、45 项核心测试 **100% 通过**。
- **生产构建打包 (Vite)**：执行 `npm run build`，成功编译输出全部生产资源至 `dist/`，耗时 728ms。

---

### [2026-09-07] 面板延迟绿黄红三色动态分级展示与后台静默周期复检间隔默认调整为 30 分钟

#### 1. 需求背景与功能目标

1. **面板延迟三色动态指示**：
   - 用户诉求：让 Proxy Protect 面板中的延迟分为绿、黄、红三种颜色去显示，方便用户一眼识别当前代理节点的网络质量优劣。
2. **后台静默周期复检间隔默认调整**：
   - 用户诉求：后台静默周期复检间隔默认设置由 10 分钟调整为 30 分钟，降低后台静默轮询频次，节能省电。

#### 2. 技术实现细节

- **面板延迟三色动态分级 (popup/App.tsx)**：
  - 在 `ProfileRow` 中渲染的延迟标签引入智能分级算法：
    - `< 250ms`：呈现绿色 `var(--ok)`，并赋予 `rgba(34, 197, 94, 0.15)` 微透明高品质底衬；
    - `250ms ~ 800ms`：呈现黄色/橙色 `var(--warn)`，并赋予 `rgba(245, 158, 11, 0.18)` 微透明底衬；
    - `>= 800ms`：呈现红色 `var(--danger)`，并赋予 `rgba(239, 68, 68, 0.18)` 微透明底衬。
  - 配合国旗紧随展示，极大增强了不同网络时延节点的视觉辨识度。
- **默认周期复检间隔更新 (constants.ts)**：
  - 在 `src/shared/constants.ts` 中将 `DEFAULT_SETTINGS.recheckMinutes` 从 `10` 更新为 `30`。
  - 扩展新安装或重置配置时默认以 30 分钟为周期调度 `chrome.alarms` 执行静默校验。

#### 3. 验证与回归测试记录

- **静态类型检查 (TypeScript)**：执行 `tsc --noEmit`，全项目 **0 错误、0 警告**。
- **生产构建打包 (Vite)**：执行 `npm run build`，成功编译输出最新扩展资源至 `dist/`，耗时 571ms。

---

### [2026-09-07] 版本自增迭代规范确立与项目版本跃升至 v3.1.6

#### 1. 需求背景与功能目标

- **版本号迭代规范确立**：用户明确后续每次功能优化迭代均按 Semantic Versioning 规则递增 `0.0.1` 个版本号（patch 位自增）。
- **当前版本跃升**：在上一版本 `3.1.5` 基础上追加递增一次版本号，正式跃升至 `v3.1.6`。

#### 2. 技术实现细节

- **全链路版本配置同步更新**：
  - `public/manifest.json`：`"version": "3.1.6"`
  - `package.json`：`"version": "3.1.6"`
  - `package-lock.json`：`"version": "3.1.6"`
- **动态版本读取**：Popup 弹窗与 Options 控制台顶部均通过 `chrome.runtime.getManifest().version` 实时读取，界面无缝展示 `v3.1.6`。

#### 3. 验证与回归测试记录

- **静态类型检查 (TypeScript)**：执行 `tsc --noEmit`，全项目 **0 错误、0 警告**。
- **单元测试集 (Vitest)**：执行 `npm test`，全部 6 个测试套件、45 项核心测试 **100% 通过**。
- **生产构建打包 (Vite)**：执行 `npm run build`，成功编译输出全部生产资源至 `dist/`，耗时 562ms。

---

### [2026-09-07] 删除代理按钮悬浮变白 Bug 根治、当前网站一键加护集成可选账号备注与版本跃升至 v3.1.7

#### 1. 需求背景与功能目标

1. **删除代理按钮悬浮变白 Bug 修复**：
   - **Bug 现象**：在代理档案列表或表单中，鼠标悬浮至「删除」危险按钮（`.btn-danger`）时，按钮整体底色意外变成白色，导致白底白字无法辨识。
   - **根因分析**：`src/styles/base.css` 中通用 `.btn:hover` 预设了 `background: var(--bg-card-hover);`（浅色模式下取值为接近纯白的 `#f8fafc`）。原 `.btn-danger:hover` 仅声明了 `color: #ffffff; box-shadow: ...`，未对 `background` 进行显式定义或渐变重载。在 CSS 优先级与层叠规则下，`.btn:hover` 的白底覆盖了危险红底色，导致悬浮时按钮“整体变白”。
2. **当前网站一键加护集成可选账号备注表单**：
   - **用户诉求**：在 Popup 小面板的「当前网站一键加护」卡片中，允许用户一次性录入完整的守护规则与账号备忘（支持邮箱、账号别名、防封备忘说明），但保持表单为**可选填写**，不强迫填写且不破坏小面板的紧凑布局。
3. **版本自增迭代**：
   - 遵循此前确立的递增规则，版本号自增 `0.0.1`，由 `v3.1.6` 升级为 `v3.1.7`。

#### 2. 技术实现细节

- **删除按钮悬浮态样式加固 (src/styles/base.css)**：
  - 在 `.btn-danger:hover` 中显式指定危险红高光渐变：`background: linear-gradient(135deg, #ef4444 0%, #991b1b 100%)`，并重置 `border-color: transparent` 与深红光晕投影 `box-shadow: 0 4px 14px var(--danger-glow)`。
  - 同步补充 `.btn-danger:active` 点击下压深色态 `background: #991b1b`，彻底消除鼠标交互时的变白现象。
- **一键加护卡片轻量折叠备忘表单 (src/pages/popup/App.tsx & popup.css)**：
  - **折叠胶囊入口**：在当前保护粒度选择器下方新增折叠式触发按钮，默认收起以保持极简尺寸；折叠胶囊根据填写状态智能展示「＋ 填写账号备注备忘 (可选)」或「已填写账号备注 (点击修改)」。
  - **三合一紧凑表单**：
    - 第一行双栏网格：登录邮箱/账号（`noteEmail`）+ 账号别名/标识（`noteAlias`）；
    - 第二行通栏：附加备忘说明/防封注意事项（`noteText`）；
    - 统一样式：支持聚焦发光、暗色适配与微小圆角，并标明「可选 · 仅存本机」，安全私密。
  - **一次性保存逻辑 (handleAddGuard)**：
    - 组装 `ProtectedSite.note` 结构体，将别名、邮箱、用户备忘与自动生成的加护时间及当前代理信息合并，一次性写入 `chrome.storage.local`。
  - **已加护状态反显**：
    - 当当前域名已受守护且存在备忘时，在加护绿色卡片中动态展示绑定的别名、脱敏账号与备忘摘要。
- **全项目版本跃升至 v3.1.7**：
  - `public/manifest.json`：`"version": "3.1.7"`
  - `package.json`：`"version": "3.1.7"`
  - `package-lock.json`：`"version": "3.1.7"`

#### 3. 验证与回归测试记录

- **静态类型检查 (TypeScript)**：执行 `tsc --noEmit`，全项目 **0 错误、0 警告**。
- **单元测试集 (Vitest)**：执行 `npm test`，全部 6 个测试套件、45 项核心测试 **100% 通过**。
- **生产构建打包 (Vite)**：执行 `npm run build`，成功耗时 596ms 编译生成 `dist/`，全部资源顺利更新。

---

### [2026-09-20] 流量处理逻辑深度重构与三等级调节策略（严格拦截 / 抽样检测 / 宽松效率）全面演进与版本跃升至 v3.1.8

#### 1. 需求背景与根因分析

- **问题现象**：
  在绑定了域名+规则的网页内进行日常访问与交互时，插件对每一条 HTTP 请求均做判定校验，导致代理连接效率极度下降，页面出现明显的加载停顿、接口阻塞甚至断流。
- **深度根因排查**：
  1. **监听链路过频触发**：`src/background/index.ts` 中通过 `webNavigation.onBeforeNavigate`、`tabs.onActivated` 与 `tabs.onUpdated`（`status === 'loading'`）监听了主框架导航、标签页切回与页面加载更新，只要命中域名即无差别调用 `guard.onProtectedAccess`。
  2. **DNR 动态规则无差别全量阻断（核心根因）**：一旦调用 `onProtectedAccess`，目标域名立刻被置入 `checking` 状态，并通过 Chromium 的 `declarativeNetRequest` 动态下发规则：**直接对网页内所有的子资源请求（包括 Fetch/XHR、JS、CSS、图片、字体、WebSocket 等全部 `SUB_RESOURCE_TYPES`）下发 `block` 阻断规则**！
  3. **外部网络探测延迟与页面渲染卡顿**：锁屏后必须等待外部多源测速探针（耗时 500ms~2500ms），在此期间页面 HTML 正在解析加载的全部后续请求被 DNR 判定丢弃或挂起；即使 1.5 秒防抖过后，只要用户点击链接、单页应用路由切换（SPA pushState）或标签页切回，又会重新进入 `checking` 加锁阻断，导致用户感知为“对每一条 HTTP 请求都在做校验”，代理速度极度迟缓。

#### 2. 技术方案与架构演进

针对上述痛点，系统性引入三等级流量判定校验策略（`TrafficValidationLevel`），兼顾极端安全性与极致连接效率：

1. **三等级调节策略模型设计**：
   - **最高等级（严格拦截 · 实时强校验 - `strict`）**：
     - **与原版本机制完全一致**。开屏首检、切回标签页、页面加载更新每次均强制触发实时锁屏与外部 IP 探测（Fail-Closed）。
     - 未放行前通过 DeclarativeNetRequest 同步阻断网页全部子资源，必须拿到最新通过结果才放行，适合对异地风控极度敏感的金融资产与核心控制台。
   - **第二等级（抽样检测 · 平衡模式 - `sampling`）**：
     - **开屏请求必检，后续交互轻量抽样二次复核**。开屏首次请求通过后放行后续交互流量，绝不盲目对整站下发子资源阻断。
     - 对后续页面内请求通过只读非阻塞的 `webRequest.onBeforeRequest` 进行请求计数（每 15 次交互）与时间窗口（60 秒）轻量抽样。
     - 抽检在后台异步比对当前缓存，平滑无感；仅在抽检确认 IP 漂移或发生违规时才触发锁定与阻断，兼顾安全与流畅。
   - **第三等级（宽松效率 · 极速流畅 - `relaxed` - 默认推荐）**：
     - **只对标签页开屏请求进行校验，校验通过默认信任后续交互**。仅在标签页首次打开/主框架开屏请求时校验落地 IP。
     - 校验通过后，记录当前标签页该域名的放行许可（`TabSession`）。后续该标签页内的所有交互流量（Fetch/XHR、子资源加载、单页应用 SPA 路由切换、切回激活等）全部默认放行，绝不重复触发锁屏和外部探测。
     - 代理连接 100% 满血极速直通，彻底解决卡顿与断流。

2. **核心模块演进细节**：
   - **数据模型扩展 (`src/shared/types.ts` & `src/shared/constants.ts`)**：
     - 声明 `TrafficValidationLevel = 'strict' | 'sampling' | 'relaxed'`。
     - 在 `Settings` 接口新增 `trafficValidationLevel`，并在 `DEFAULT_SETTINGS` 中默认启用 `'relaxed'` 宽松效率模式。
     - 在 `ProtectedSite` 规则中扩展可选字段 `validationLevel?: TrafficValidationLevel | 'default'`，支持单个站点独立指定或继承全局。
     - 在 `SK`（session 存储键）中新增 `tabSessions` 标识。
   - **流量会话与策略调度器 (`src/background/traffic-policy.ts`)**：
     - 实现 `TabSession` 机制，管理各标签页的开屏验证状态、域名、放行时间戳、请求计数器与上次抽检时间。
     - 提供 `resolveEffectiveLevel`（解析站点级与全局级生效策略）、`isTabSessionVerified`、`markTabVerified`、`removeTabSession` 与 `clearAllTabSessions`。
     - 提供 `recordTabRequest`（针对 sampling 模式的阈值触发器）与 `isCheckStateMatching`。
     - 自动侦听 `chrome.tabs.onRemoved` 销毁关闭标签页的会话；并在切换代理节点、规则修改、用户强行锁定（`relockAll`）时一键重置全部会话，确保安全性无死角。
   - **守护引擎与后台路由重构 (`src/background/guard-engine.ts` & `src/background/index.ts`)**：
     - `onProtectedAccess(url, tabId)`：支持传递 `tabId`。在 `relaxed` 与 `sampling` 模式下，若当前标签页已通过开屏验证，直接放行；若为开屏请求且当前已有新鲜合规的检测缓存，直接放行当前标签页，免去重复加锁与外部测速。
     - 新增 `triggerSamplingCheck(siteId)`：针对抽样检测模式执行后台平滑二次校验。
     - 在 `index.ts` 中注册 `initTrafficPolicy()`，并通过 `webRequest.onBeforeRequest` 实现非阻塞的后续交互抽样触发器；显式返回 `undefined` 严格契合 `@types/chrome` 的 `BlockingResponse | undefined` 联合签名，杜绝 IDE 静态检查误报。
   - **控制中心 Settings 选项卡 UI 改造 (`SettingsTab.tsx`)**：
     - 在 WebRTC 防护下方新增「流量判定校验与放行策略等级」专属交互卡片，提供三档策略的单选卡片、高亮微光、场景标签与机制详述。
   - **守护规则 Sites 选项卡 UI 改造 (`SitesTab.tsx`)**：
     - 规则列表中为每个站点动态展示策略标签（严格拦截 / 抽样检测 / 宽松效率 / 跟随全局）。
     - 在新建与编辑规则表单 `SiteForm` 中添加策略等级单选组，支持针对特定敏感站点单独设定等级。
   - **Popup 快捷弹窗适配与一键加护联动 (`popup/App.tsx`)**：
     - 在当前站点已加护卡片中反显当前站点的策略胶囊。
     - 在一键加护卡片展开备忘表单中提供策略等级快速选择切换。

3. **版本自增迭代**：
   - 遵循 Semantic Versioning 规范，版本号由 `v3.1.7` 自增至 `v3.1.8`。
   - `public/manifest.json`：`"version": "3.1.8"`
   - `package.json`：`"version": "3.1.8"`

#### 3. 验证与回归测试记录

- **静态类型检查 (TypeScript)**：执行 `npm run typecheck`，全项目 **0 错误、0 警告**。
- **单元测试集 (Vitest)**：执行 `npm test`，全部 6 个测试套件、45 项核心测试 **100% 通过**。
- **生产构建打包 (Vite)**：执行 `npm run build`，耗时 817ms 顺利编译输出 `dist/`，全部前端页面与 Service Worker 均无异常。

---

### [2026-09-21] 新建标签页拦截优化与零数据包泄露（DNR Session Rules excludedTabIds 架构演进）与版本跃升至 v3.1.9

#### 1. 需求背景与根因排查

- **问题现象**：
  用户（彩彩）在测试中反馈：新建标签页访问受保护敏感站点时，仍然会放走数据包，页面在屏幕上先加载出来随后才被拦截，违背了 Fail-Closed 防护初衷。用户强调：“首屏是指新建标签页，优化这里的拦截逻辑，并不是浏览器打开的首屏”。
- **深度底层根因排查**：
  1. **Chromium MV3 `onBeforeNavigate` 异步非阻塞**：当用户新建标签页输入网址并回车时，Chromium C++ 网络底层已同步发起 DNS 解析、TCP/TLS 握手并发出 HTTP GET 主文档请求。`chrome.webNavigation.onBeforeNavigate` 仅为只读广播通知，无法拦截正在发出的网络包。
  2. **原架构在站点放行时直接清空了底层 DNR 规则**：此前当某个站点处于 `allowed` 状态时，`guard-engine.ts` 中的 `_setAll` 会将该站点的 `declarativeNetRequest` 规则全盘移除。因此当用户新建标签页访问该域名时，Chromium 网络底层没有任何规则拦截，数据包直通目标服务器并渲染出页面。
  3. **动态规则对正在传输的请求无追溯取消能力**：随后后台 SW 虽尝试重新置为 `checking` 并补发动态规则，但 Chromium 规范限制动态规则对已发起的请求不生效，导致页面先加载出来、数秒后探测完成或触发子路由才被拦截，造成严重的异地 IP 数据包泄露风险。

#### 2. 技术方案与底层架构演进（DNR Session Rules 常驻 + `excludedTabIds` 放行白名单）

升级利用 Chromium 92+ 官方原生支持的 `chrome.declarativeNetRequest.updateSessionRules` 与 `RuleCondition.excludedTabIds`，从根本上解决网络层泄露问题：

1. **底层物理级常驻拦截（Fail-Closed 0 字节泄露）**：
   - 所有启用的受保护站点，其主框架重定向规则（导向 `blocked.html`）与子资源阻断规则在 Chromium 网络层**底层常驻生效**；
   - 规则的 `condition` 中注入 `excludedTabIds?: number[]` 放行白名单；
   - **未验证的新标签页**：由于其 `tabId` 默认不在 `excludedTabIds` 中，Chromium C++ 网络层在发出任何 TCP SYN 或 TLS 握手前，**强制同步将请求重定向至 `blocked.html`，0 数据包抵达目标服务器，绝不可能先加载出网页**。
2. **已放行标签页满血直通（兼顾极致流畅体验）**：
   - 凡已通过开屏验证的标签页，其 `tabId` 记录于 `excludedTabIds` 中。Chromium 网络层对该标签页的所有页面内交互、子资源加载、单页应用 SPA 路由切换 100% 满速直连，不走任何 DNR 拦截，零延迟不卡顿。
3. **拦截页与后台极速安全核验联动 (`verifyAndAuthorizeTab`)**：
   - 当新标签页首次访问受保护站点被截流至 `blocked.html` 时，页面挂载瞬间获取当前 `tabId` 并向后台发送 `verifyAndAllowTab`：
     - **宽松模式 (Level 3) / 抽样模式 (Level 2)**：后台优先比对内存中当前代理出口的新鲜合规状态。若当前落地地区与 IP 满足站点期望，立即将该 `tabId` 写入白名单并刷新 Session 规则，前端以毫秒级微动效执行 `location.replace(from)` 瞬间切入目标网站，用户无感且 0 数据包泄露；
     - **严格模式 (Level 1)**：每次新建标签页强制执行多源实时探测 `ensureCheck(true)`，探测通过后放行；
     - **异地违规 / 代理断流**：停留在 `blocked.html`，展示综合风险评分、差异对比看板与一键代理自愈，目标网站全程未发送任何数据包。
4. **生命周期与安全闭环管理**：
   - 切换代理节点（`switchProfile`）、规则变更（`onSitesChanged`）或用户手动锁定（`relockAll`）时：一键清空所有放行白名单，全浏览器所有标签页瞬间重回底层封锁；
   - 标签页关闭（`tabs.onRemoved`）时自动清理对应会话，防止内存泄露。

#### 3. 修改的文件与技术细节

- **`src/shared/rules.ts`**：
  - `DnrRuleJson['condition']` 扩充 `excludedTabIds?: number[]`；
  - `buildSiteRules` 改造为支持传递 `excludedTabIds`，主框架重定向规则与子资源阻断规则同步注入标签页白名单。
- **`src/background/traffic-policy.ts`**：
  - `TabSession` 重构支持多站点白名单映射结构 `verifiedSites: Record<string, number>`；
  - 导出 `getExcludedTabIdsForSite(siteId)` 查询接口供 DNR 规则实时读取；
  - 完善 `markTabVerified`、`recordTabRequest`、`clearAllTabSessions` 与标签页移除监听。
- **`src/background/guard-engine.ts`**：
  - 将原 `updateDynamicRules` 全面升级为 `dnrUpdateSessionRules` 与 `dnrGetSessionRules`，并提供 `dnrClearLegacyDynamicRules` 清理历史动态规则；
  - `_setAll` 重构为常驻规则结构，站点 `allowed` 时自动提取并填入 `excludedTabIds`；
  - 实现并导出 `syncDnrRules()` 规则白名单极速同步机制；
  - 实现并导出核心核验逻辑 `verifyAndAuthorizeTab(siteId, tabId)`。
- **`src/shared/messages.ts`**：
  - `BgCommand` 新增 `{ type: 'verifyAndAllowTab'; siteId: string; tabId: number }` 指令定义；
  - 导出 `VerifyTabResult` 接口。
- **`src/background/index.ts`**：
  - `handleCommand` 中注册接入 `verifyAndAllowTab` 消息路由。
- **`src/pages/blocked/App.tsx`**：
  - 引入 `validating` 状态，页面加载首屏即刻安全核验当前标签页；
  - 若通过安全核验，执行毫秒级平滑 `location.replace(from)`，页面绝不先加载，目标网站 0 数据包泄露；
  - 守护恢复时联动更新白名单并无感跳回；
  - 优化核验微加载态与阻断风险卡片之间的切换逻辑。
- **`tests/rules.test.ts`**：
  - 新增针对 `buildSiteRules` 生成 `excludedTabIds` 字段的单元测试用例。
- **全项目版本跃升至 v3.1.9**：
  - `public/manifest.json`：`"version": "3.1.9"`
  - `package.json`：`"version": "3.1.9"`
  - `package-lock.json`：`"version": "3.1.9"`

#### 4. 验证与回归测试记录

- **单元测试集 (Vitest)**：执行 `npm test`，全部 6 个测试套件、46 项测试（含新增规则白名单测试）**100% 通过**。
- **静态类型检查 (TypeScript)**：执行 `npm run typecheck`，全链路类型声明严谨无误，**0 错误、0 警告**。
- **生产构建打包 (Vite)**：执行 `npm run build`，成功耗时 547ms 编译生成 `dist/`，全部资源打包正常。

---

### [2026-09-21] 拦截一闪而过放行竞态修复与开屏实时探测/插件红绿状态同步优化

#### 1. 需求背景与根因排查

- **问题现象**：
  用户（彩彩）在测试中反馈：“首屏检测确实有了，但是拦截一闪而过就放行了，经过我的观察，右上角插件当前代理的IP判定没有同步更新，可能造成了这样的写了，逻辑遵循，开屏检测，规则生效，结果同步插件红绿状态，后续再进行正常的周期检测”。
- **深度根因排查**：
  1. **前端页面存在首屏旧状态直接跳回的竞态**：在 `src/pages/blocked/App.tsx` 中，定义了响应 `state?.status === 'allowed'` 的自动跳回钩子。当页面首次挂载时，`guardStates` 读取的是本地 Session 中上一次存留的历史状态（之前为 `allowed`），钩子在没有等待实时核验完成的情况下，直接触发了 `setRedirecting(true)` 并执行 `location.replace(from)`，导致拦截页“一闪而过”就退出了。
  2. **后台核验依赖了 5 分钟旧缓存，未执行实时新探测**：在 `src/background/guard-engine.ts` 的 `verifyAndAuthorizeTab` 中，宽松与抽样模式优先比对了 `getCheckState()`。由于该缓存有效期为 5 分钟，若用户在插件外切换了节点、断开了代理或发生异地漂移，旧缓存依然判断为通过，直接返回了放行结果。
  3. **Action Badge 未在开屏检测时同步刷新**：由于未执行真实的主动探测，`updateBadge` 未被调用，导致右上角小图标（国家代码及绿/橙/红颜色状态）未能反映最新的网络判定。

#### 2. 解决方案与执行逻辑遵循

按照彩彩制定的严密逻辑体系重塑流程：

1. **开屏检测（实时新鲜探测）**：
   - 彻底废弃对旧缓存的盲信。在新建标签页触发开屏校验时，`verifyAndAuthorizeTab` 统一调用 `recheckAndApply(true)`，通过多源探针实时拉取当前真正的出口 IP、国家地区与 WebRTC 双栈特征。
2. **规则生效（真实状态重算）**：
   - 将实时拿到的检测结果代入站点规则比对引擎（`recomputeFromCheck`）。若真实落地与站点配置（国家代码、CIDR 网段、WebRTC 防护）一致，站点置为 `allowed`，将当前 `tabId` 写入 `excludedTabIds` 放行白名单；若存在异地不匹配或断流，站点坚决置为 `locked`，绝不放行。
3. **结果同步插件红绿状态**：
   - 在状态机重算以及 `verifyAndAuthorizeTab` 中，显式调用 `updateBadge()`，使右上角 Action Badge 实时显示最新检测到的国家代码，并立即根据判定结果变色：
     - **绿色 (`#16a34a`)**：全部规则校验通过且无双栈泄漏，正常放行；
     - **橙色 (`#ea580c`)**：存在规则不满足（落地地区违规、网段不符等），已拦截阻断；
     - **黄色 (`#d97706`)**：存在双栈国家不一致等异常特征；
     - **红色 (`#dc2626`)**：无法确定出口或探针失败。
4. **彻底消除前端“一闪而过”竞态**：
   - 在 `blocked/App.tsx` 的自动跳回 `useEffect` 中增加 `validating` 校验阻断保护：当首屏实时核验正在进行中时（`validating === true`），严禁执行任何基于旧状态的跳转。只有在首屏核验完成、且用户通过一键自愈/手动切换代理/临时放行使规则转为通过时，才允许跳回原网站。
5. **后续正常周期检测**：
   - 页面放行后，该标签页进入正常的放行模式（宽松模式满速交互，抽样模式按阈值抽样检测），后台 alarm 定时器按照用户设置的周期进行日常巡检，完全契合预期。

#### 3. 修改的文件清单

- **`src/background/guard-engine.ts`**：
  - 导出 `updateBadge`，在 `recomputeFromCheck` 结尾加入实时更新调用；
  - 重构 `verifyAndAuthorizeTab`：执行强制实时探测 `recheckAndApply(true)`，同步刷新 Action Badge 红绿状态，并根据最新状态决定是否放行。
- **`src/pages/blocked/App.tsx`**：
  - 在自动跳回 `useEffect` 依赖与条件中加入 `validating` 阻断，彻底消除首屏旧状态造成的闪烁放行缺陷。

#### 4. 验证与回归测试记录

- **单元测试集 (Vitest)**：执行 `npm test`，全套 6 个测试套件、46 项测试 **100% 全部通过**。
- **静态类型检查 (TypeScript)**：执行 `npm run typecheck`，**0 错误、0 警告**。
- **生产环境打包 (Vite)**：执行 `npm run build`，耗时 630ms 成功编译生成 `dist/`，全部资源构建正常。

---

### [2026-09-21] 泛域名规则支持、安全核验通过评分/UI纠正、1秒平滑确认延迟与 v3.2.0 版本跃升

#### 1. 需求背景与问题排查

用户（彩彩）在实测中反馈以下问题并提供了界面运行截图：

1. **安全监测通过时的评分与 UI 不一致**：
   - 目标站点在开屏核验通过时，落地页标题虽然显示“安全校验通过，正在自动返回…”，但下方评分卡片却显示 `50/100`、`中等风险 · 存在安全隐患`、黄色药丸 `安全阻断`，副文本亦显示“当前实际网络状态未满足放行要求...已在网络层强制拦截”，对比网格中间也标注为“安全阻断”，产生严重逻辑与视觉矛盾。
   - **根因分析**：`src/pages/blocked/App.tsx` 中的 `risk` 计算逻辑硬编码了 `let score = 40` 与 `Math.max(50, score)`，当规则满足放行且无任何风险因子时，未设立安全通过分支，直接回退至 `50分` 与 `medium` 中等风险；同时页面说明文本与对比中间药丸写死为阻断描述。
2. **落地跳转需延长至 1 秒**：
   - 此前开屏通过后的跳回延迟为 150ms/250ms，跳转过快不仅一闪而过让用户无法看清环境匹配状态，也未给后台白名单规则持久化与浏览器网络连接层留出充足确认时间。
3. **域名规则需支持泛域名**：
   - 用户期望支持形如 `*.google.com` 或 `.google.com` 的泛域名规则，能同时精准覆盖本域及全部多级子域名。此前 `normalizeDomain` 强行剥离通配符，导致无法录入带 `*.` 的泛域名规则，且原域名比对函数未适配泛域名前缀。
4. **版本号升级**：
   - 从 `v3.1.9` 自增跃升至 `v3.2.0`。

#### 2. 技术设计与详细改造

1. **泛域名规则全面支持体系**：
   - **`src/shared/matchers.ts`**：
     - 重构 `normalizeDomain`：清洗协议（`https://` 等）、路径与端口后，识别 `*.` 或 `.` 前缀并将其规范化为标准泛域名 `*.domain.tld`，严格校验域名合法性；
     - 新增并导出 `domainMatchesPattern(host: string, pattern: string): boolean`：
       - 若模式为 `*.google.com`，自动匹配本域 `google.com` 以及各级子域（`www.google.com`、`mail.google.com`、`a.b.google.com`），绝不误伤 `fakegoogle.com`；
       - 若模式为多级泛域名 `*.api.domain.com`，精准匹配 `api.domain.com` 和 `v1.api.domain.com`，与同域其他分支子域有效隔离；
     - 重构 `urlMatchesDomain`：统一调用 `domainMatchesPattern` 进行严谨判定。
   - **`src/shared/rules.ts`**：
     - 在 `buildSiteRules` 中生成 Chrome DeclarativeNetRequest 规则时，自动将泛域名通配符剥离为纯域名 `requestDomains: [dnrDomain]`（因 Chrome DNR 原生不支持通配符字符，但原生自动匹配其所有子域）。
   - **`src/shared/habits-core.ts`**：
     - 重构 `domainCovered`：调用 `domainMatchesPattern`，使习惯学习覆盖检测天然兼容泛域名。
   - **`src/pages/options/tabs/SitesTab.tsx`**：
     - 规则列表对泛域名提供专属绿色 `泛域名` 标签；
     - 优化表单输入提示：“生效范围：\*.xxx（支持泛域名，自动包含全部多级子域）”。
2. **安全核验放行评分卡片与正向 UI 彻底修正**：
   - **`src/pages/blocked/App.tsx`**：
     - 重构 `risk` 计算：当处于放行中状态（`redirecting`）或检测状态合规放行时，评分为 **100/100 满分**，等级置为 `'safe'`（`安全合规 · 准予通行`），药丸显示绿色 `安全放行`，火苗图标替换为绿色安全盾牌 `<ShieldCheck />`，风险因子展示正向安全说明；
     - 动态文案适配：当放行时，描述文本切换为：“目标站点 **{domain}** 地区守护核验通过。当前实际落地网络环境与期望完全一致，安全校验达标，正在自动返回目标网站…”；
     - 对比网格中间药丸：通过时展示绿色 `环境匹配`（`.compare-match-pill`），中间图标显示绿色盾牌徽标；
     - 探测落地国家药丸：在通过时变更为绿色 `tag-ok`。
   - **`src/pages/blocked/blocked.css`**：
     - 新增 `.blocked-risk-card.risk-safe`、`.risk-safe .risk-score-num`、`.risk-safe .risk-shield-icon`；
     - 新增 `.compare-match-pill` 与 `.compare-divider-icon.success` 绿色高亮主题。
3. **1 秒跳转延迟与确认反馈机制**：
   - 将开屏校验通过与守卫生效跳回的定时器从 150ms/250ms 统一调整为 **1000ms（1秒）**；
   - 标题动态展示：“安全校验通过，1 秒后自动返回…”，并在下方呈现平滑同步指示器：“底层放行白名单与网络规则已确认，即将进入…”，给用户清晰感知，为底层网络连接提供充足确认窗口。
4. **全项目版本跃升至 v3.2.0**：
   - `public/manifest.json`：`"version": "3.2.0"`
   - `package.json`：`"version": "3.2.0"`
   - `package-lock.json`：`"version": "3.2.0"`

#### 3. 修改的文件清单

- **`src/shared/matchers.ts`**：升级 `normalizeDomain`，新增 `domainMatchesPattern`，重构 `urlMatchesDomain`；
- **`src/shared/rules.ts`**：在 `buildSiteRules` 中规整剥离通配符，生成合法 DNR `requestDomains`；
- **`src/shared/habits-core.ts`**：引入 `domainMatchesPattern` 支持泛域名覆盖判定；
- **`src/pages/blocked/App.tsx`**：重构放行通过时的评分（100分）、safe 状态、正向描述与绿色对比徽标，延时统一设置为 1000ms；
- **`src/pages/blocked/blocked.css`**：新增 `risk-safe` 与 `compare-match-pill` 样式；
- **`src/pages/options/tabs/SitesTab.tsx`**：为泛域名规则显示专属徽章与输入提示；
- **`tests/matchers.test.ts`** & **`tests/rules.test.ts`**：补充泛域名解析、匹配与 DNR 规则生成的单测用例；
- **`package.json`**、`package-lock.json`、`public/manifest.json`：版本号自增至 `3.2.0`。

#### 4. 验证与回归测试记录

- **单元测试集 (Vitest)**：执行 `npm test`，全部 6 个测试套件、49 项测试（含新增泛域名单测）**100% 全部通过**。
- **静态类型检查 (TypeScript)**：执行 `npm run typecheck`，**0 错误、0 警告**。
- **生产环境打包 (Vite)**：执行 `npm run build`，耗时 738ms 成功打包输出生产包至 `dist/`，全部资源构建正常。

---

### [2026-09-21] 落地核验通过跳转延迟受控化、默认3秒与实时倒计时体验升级

#### 1. 需求背景与功能目标

用户（彩彩）反馈：“检测通过落地页现在是一秒延迟，设置成可以控制长度的，默认三秒”。
为进一步提升自主把控度并给网络底层充足的会话建立确认时间，需要将放行跳转延迟从写死时长改造为用户全局可调控参数，默认值调整为 3 秒。

#### 2. 技术设计与详细改造

1. **全局设置扩展与持久化**：
   - **`src/shared/types.ts`**：在 `Settings` 接口新增 `passRedirectDelaySec?: number` 属性，标明通过落地页返回目标网站的等待延迟秒数。
   - **`src/shared/constants.ts`**：在 `DEFAULT_SETTINGS` 中配置 `passRedirectDelaySec: 3`，默认 3 秒。
2. **控制中心选项配置面板**：
   - **`src/pages/options/tabs/SettingsTab.tsx`**：在探测参数卡片中新增「安全检测通过后自动返回原网站延迟（秒）」控制器，支持 1 ~ 30 秒范围配置，附带清晰说明文案。
3. **落地页逐秒倒计时与人性化快速跳回**：
   - **`src/pages/blocked/App.tsx`**：
     - 读取 `settings?.passRedirectDelaySec ?? 3`，首屏实时核验通过以及守护恢复自动放行均动态适配该时长；
     - 增加 `countdown` 状态与每秒平滑递减定时器管理器，大标题动态展示：“安全校验通过，X 秒后自动返回…”；
     - 归零时平滑执行 `location.replace(from)`；
     - 提示条新增「立即跳回」快捷按钮，允许用户随时提前跳过倒计时直接进入网站。

#### 3. 修改的文件清单

- **`src/shared/types.ts`**：`Settings` 接口增加 `passRedirectDelaySec?: number`；
- **`src/shared/constants.ts`**：`DEFAULT_SETTINGS` 增加 `passRedirectDelaySec: 3`；
- **`src/pages/options/tabs/SettingsTab.tsx`**：增加延迟时间输入配置项；
- **`src/pages/blocked/App.tsx`**：重构落地页倒计时与跳转逻辑，增加逐秒反馈与立即跳回按钮。

#### 4. 验证与回归测试记录

- **单元测试集 (Vitest)**：执行 `npm test`，全套 6 个测试套件、49 项测试 **100% 全部通过**。
- **静态类型检查 (TypeScript)**：执行 `npm run typecheck`，**0 错误、0 警告**。
- **生产环境打包 (Vite)**：执行 `npm run build`，耗时 593ms 成功打包至 `dist/`，全部资源构建正常。

---

### [2026-09-21] 缺省状态下代理档案节点卡片 (list-card) 表现形式重塑

#### 1. 需求背景与痛点排查

用户（彩彩）反馈：“插件刚安装，缺省值是直连状态或者基于其他代理软件或者插件控制的系统代理模式，但是无论是这两种模式的任意一种，代理档案节点中的选项都是没有被选择的状态，虽然IP检测是正确的，修改一下缺省状态下class="card list-card"的表现形式”。

- **问题分析**：
  扩展刚安装或未明确选择代理节点时，`activeProfileId` 为 `null`。此时浏览器处于直连或外部代理软件（如 Clash、v2rayN 等）接管的系统代理环境。顶部双栈出口 IP 检测能精准探测真实落地，但在节点列表卡片中，所有选项（包括直连与系统代理）均呈现无勾选、无高亮的空白未选状态，缺少状态说明，容易给用户造成“未生效”或“空白空洞”的疑惑。

#### 2. 技术设计与详细改造

1. **缺省状态识别与容器样式联动**：
   - 在 `src/pages/popup/App.tsx` 中识别未激活节点的缺省状态 `!activeId`。
   - 当处于缺省态时，为 `<div className="card list-card">` 附加专属样式类名 `.list-card-default-mode`，赋予浅蓝科技感渐变底色与细腻虚线边框。
2. **缺省托管状态指示横幅 (Default State Banner)**：
   - 在 `list-card` 容器内部顶部新增缺省态状态说明横幅：
     - 配备绿色平滑呼吸指示灯（`.default-pulse-dot`），指示“出口监测正常”；
     - 标题与描述清晰传达：“当前处于缺省托管状态。尚未指定代理节点，当前网络由系统默认环境或外部代理软件（如 Clash、v2rayN）托管。点击下方任意节点可立即接管切换。”彻底消除空洞感。
3. **内置节点缺省基准指示**：
   - 优化 `ProfileRow` 组件，接收 `isDefaultEnv` 标识。在缺省状态下，为直连与系统代理内置节点呈现虚线「缺省环境」标签，表明当前网络正在基于此基准环境运行。
4. **一键加护面板缺省文案同步**：
   - 修正 `CurrentSiteGuardCard`：当 `activeId` 为空时，当前代理节点显示为“系统/外部托管 (缺省)”，替代原本回退为“自定义节点”的不准确描述。
5. **CSS 动画与视觉增强**：
   - 在 `src/pages/popup/popup.css` 中定义 `.list-card-default-mode`、`.list-default-banner`、`.default-pulse-dot` 呼吸灯动画与 `.profile-default-tag` 样式。

#### 3. 修改的文件清单

- **`src/pages/popup/App.tsx`**：为 `list-card` 注入缺省横幅、为内置行传递 `isDefaultEnv` 标识、修正一键加护当前节点文案；
- **`src/pages/popup/popup.css`**：新增缺省托管横幅、指示灯呼吸微动效与节点状态标签样式。

#### 4. 验证与回归测试记录

- **单元测试集 (Vitest)**：执行 `npm test`，全套 6 个测试套件、49 项测试 **100% 全部通过**。
- **静态类型检查 (TypeScript)**：执行 `npm run typecheck`，**0 错误、0 警告**。
- **生产环境打包 (Vite)**：执行 `npm run build`，耗时 753ms 成功打包至 `dist/`，全部资源构建正常。

---

### [2026-09-21] 缺省橙色图标与图钉引导、第四等级时间画像免检策略与严格模式宽容放行

#### 1. 需求背景与功能目标

用户（彩彩）提出 3 项关键性网络体验与交互升级需求：

1. **缺省托管状态橙色图标与图钉固定引导**：
   - 在未激活任何代理档案（缺省托管 / 系统默认 / 外部代理客户端托管）时，扩展图标切换为专属橙色盾牌图标（`icon*-orange.png`），Action Badge 颜色联动为橙色，直观标识当前运行状态；
   - 在快捷弹窗 Popup 顶部优雅引导用户使用浏览器图钉（Pin 📌）将插件 Logo 固定到工具栏，便于日常随时监控出口 IP 与节点。
2. **第四等级：基于时间画像策略 (`time_window`)**：
   - 针对代理 IP 相对固定、追求极速访问与首屏秒开的场景，在设定的固定时间窗口内（可自定义，默认 60 分钟），对已通过验证的受保护站点免除第二次首屏阻塞加锁 IP 验证，直接放行访问；
   - 由后台静默周期复检间隔与用户手动检测作为兜底保障，一旦检测到 IP 漂移或规则不满足，立即强行中断访问。
3. **严格模式宽容范围与周期复检机制**：
   - 解决最高等级严格拦截模式下因逐条判定导致网页大量子资源阻塞、引起“网页整体不可用”的痛点；
   - 单次标签页打开在验证放行过 5 条（可自定义，默认 5 条）页内资源后，对后续资源请求宽容放行，确保页面排版与交互流畅；
   - 每隔特定分钟（可自定义，默认 5 分钟）在后台执行静默复检，若发现异常立即撤销放行并配合强拦截。

#### 2. 技术设计与详细改造

1. **橙色盾牌图标生成与缺省状态动态切换**：
   - **`tools/gen-icons.mjs`**：手写抗锯齿超采样 PNG 编码器，新增橙色渐变盾牌主题（`#F97316` 至 `#C2410C`），生成 `public/icons/icon{16,32,48,128}-orange.png`；
   - **`src/background/guard-engine.ts`**：
     - 重构 `updateBadge()`：读取当前激活档案 `activeId`，若 `!activeId`（缺省托管状态），调用 `chrome.action.setIcon` 切换为橙色图标，Badge 徽章背景色同步设为橙色 `#ea580c`；激活节点后恢复蓝色盾牌图标与常规红绿状态；
   - **`src/background/index.ts`**：在 `chrome.storage.onChanged` 中监听 `K.activeProfileId` 变更，节点切换或取消选择时即时响应更新图标与徽标。
2. **工具栏图钉固定引导组件 (Pin Guide Banner)**：
   - **`src/pages/popup/App.tsx`**：在 Popup 头部下方增设专属图钉引导卡片，展示 📌 矢量图标与 🧩 拼图图标，引导文案清晰传达固定方法，配备关闭按钮，状态持久化写入本地缓存避免重复打扰；
   - **`src/pages/popup/popup.css`**：配置晶体毛玻璃、微渐变边框与柔光微动效（`.banner-pin-guide`、`.pin-guide-badge-wrap` 等）。
3. **第四等级时间画像免检策略架构与逻辑实现**：
   - **`src/shared/types.ts`**：`TrafficValidationLevel` 联合类型扩充 `'time_window'`；`Settings` 接口扩充 `timeWindowMinutes?: number`；
   - **`src/shared/constants.ts`**：`DEFAULT_SETTINGS` 扩充 `timeWindowMinutes: 60`；
   - **`src/background/traffic-policy.ts`**：
     - 新增 `SiteVerificationRecord` 结构与 `siteVerifications` 会话存储管理器；
     - 提供 `recordSiteVerification(siteId, profileId)`、`clearSiteVerifications()` 与 `isSiteWithinTimeWindow(siteId, profileId, windowMinutes)`；
   - **`src/background/guard-engine.ts`**：
     - 在 `onProtectedAccess()` 中，当站点策略为 `time_window` 且当前代理与上次验证记录一致并在时间窗口内时，直接调用 `markTabVerified()` 并更新规则白名单放行，完全免除阻塞式检测，首屏秒开；
     - 在周期检测或手动检测发现 IP 异常时，通过 `clearSiteVerifications()` 彻底清除验证记录并全锁拦截。
4. **严格模式宽容放行与周期复检机制**：
   - **`src/shared/types.ts`**：`Settings` 接口新增 `strictToleranceCount?: number`（默认 5 条）与 `strictRecheckMinutes?: number`（默认 5 分钟）；
   - **`src/shared/constants.ts`**：`DEFAULT_SETTINGS` 赋默认值；
   - **`src/background/traffic-policy.ts`**：
     - 在 `TabSession` 中扩充 `strictResourceCount`（页内资源放行计数）与 `strictLastRecheckAt`（上次复检时间戳）；
     - 实现 `recordStrictResourceRequest(tabId, siteId, toleranceCount, recheckMinutes)`，判定宽容放行与周期复检触发时机；
   - **`src/background/index.ts`**：在 `handleSubsequentRequest()` 中接入严格模式资源监听，达到复检周期后异步触发复检；
   - **`src/background/guard-engine.ts`**：实现 `triggerStrictPeriodicRecheck(siteId, tabId)`，在后台静默验证，若检测到 IP 漂移或规则不满足，立即撤销单标签页与全局放行会话，触发强行阻断拦截。
5. **设置控制面板与规则管理界面联动**：
   - **`src/pages/options/tabs/SettingsTab.tsx`**：
     - 流量策略等级列表加入「第四等级：基于时间画像策略」专属推荐卡片；
     - 策略卡片下方新增高级微调控制区：「时间画像免检窗口时长（分钟）」、「严格模式页内资源宽容放行数（条）」与「严格模式页内放行周期复检间隔（分钟）」；
   - **`src/pages/options/tabs/SitesTab.tsx`**：规则表单与单选组支持选择第四等级，站点列表展示「时间画像」专属徽章；
   - **`src/pages/popup/App.tsx`**：一键加护面板策略选项与当前站点守护卡片支持第四等级选择与状态展示。

#### 3. 修改与新增的文件清单

- **`tools/gen-icons.mjs`**：生成 `public/icons/icon*-orange.png`；
- **`public/icons/icon{16,32,48,128}-orange.png`**：新增缺省托管状态橙色盾牌图标资源；
- **`src/shared/types.ts`**：扩展 `TrafficValidationLevel` 增加 `'time_window'`，`Settings` 扩展时间画像与严格模式宽容参数；
- **`src/shared/constants.ts`**：`DEFAULT_SETTINGS` 补充 `timeWindowMinutes: 60`、`strictToleranceCount: 5`、`strictRecheckMinutes: 5`；
- **`src/background/traffic-policy.ts`**：实现时间画像记录与免检判定、严格模式宽容计数与复检状态流；
- **`src/background/guard-engine.ts`**：实现缺省橙色图标与 Badge 联动、时间画像免阻断放行与严格模式后台周期复检；
- **`src/background/index.ts`**：监听 `activeProfileId` 实时同步图标状态、接入 webRequest 严格模式后续请求监听；
- **`src/pages/popup/App.tsx`**：实现图钉固定引导卡片、一键加护面板与站点状态时间画像策略适配；
- **`src/pages/popup/popup.css`**：新增图钉引导卡片、徽章与微动效样式；
- **`src/pages/options/tabs/SettingsTab.tsx`**：增加第四等级卡片与时间画像、严格模式高级参数细调配置面板；
- **`src/pages/options/tabs/SitesTab.tsx`**：规则表单单选与列表标签适配第四等级；
- **`Agents_Edit.md`**：本记录文档详细归档。

#### 4. 验证与回归测试记录

- **单元测试集 (Vitest)**：执行 `npm test`，全套 6 个测试套件、49 项测试 **100% 全部通过**。
- **静态类型检查 (TypeScript)**：执行 `npm run typecheck`，**0 错误、0 警告**。
- **生产环境打包 (Vite)**：执行 `npm run build`，耗时 582ms 成功打包输出至 `dist/`，产物包含全部图标、后台 SW 与前端 MPA 页面，资源完整无误。

---

### [2026-09-21] 项目版本号跃升至 v3.3.0 与第四等级适用场景文案细化

#### 1. 需求背景与功能目标

用户（彩彩）在微调「第四等级：基于时间画像策略」适用场景文案（补充“仅适用”强调语境）后，要求进行版本号迭代。
鉴于本次版本上线了缺省橙色图标体系、图钉引导、第四等级时间画像全新免检架构以及严格模式宽容放行与周期复检三大核心特性，全项目版本号由 `v3.2.0` 正式跃升至 `v3.3.0`。

#### 2. 技术设计与详细改造

1. **全项目版本号自增跃升**：
   - **`package.json`**：`"version": "3.3.0"`
   - **`package-lock.json`**：`"version": "3.3.0"`（根对象及包引用节点双向更新）
   - **`public/manifest.json`**：`"version": "3.3.0"`（MV3 扩展发布版本）
2. **设置面板文案细化协同**：
   - **`src/pages/options/tabs/SettingsTab.tsx`**：第四等级适用场景文案精准校准为“仅适用代理 IP 相对固定、追求极致首屏秒开与稳定访问效率的场景”，强化风控边界提醒。
3. **打包构建与资产同步**：
   - 重新执行 Vite 生产打包，`dist/manifest.json` 与 Popup 页面标题栏版本号自动同步生效为 `v3.3.0`。

#### 3. 修改的文件清单

- **`package.json`**：版本号自增至 `3.3.0`；
- **`package-lock.json`**：版本号自增至 `3.3.0`；
- **`public/manifest.json`**：版本号自增至 `3.3.0`；
- **`src/pages/options/tabs/SettingsTab.tsx`**：场景文案细化；
- **`Agents_Edit.md`**：本记录文档归档。

#### 4. 验证与回归测试记录

- **单元测试集 (Vitest)**：执行 `npm test`，全套 6 个测试套件、49 项测试 **100% 全部通过**。
- **静态类型检查 (TypeScript)**：执行 `npm run typecheck`，**0 错误、0 警告**。
- **生产环境打包 (Vite)**：执行 `npm run build`，耗时 568ms 成功打包至 `dist/`，全部资源构建正常。

---

### [2026-09-21] 流量判定策略 1/2/3/4 等级依照顺序重构为交互式步进滑块模式

#### 1. 需求背景与设计目标

用户（彩彩）提出：“把1234等级依照顺序做成滑块模式”。
原先设置控制面板（`SettingsTab.tsx`）采用多张垂直卡片堆叠的形式呈现各策略等级，占用页面纵深较长且等级之间的递进关系与安全/效率权衡不够直观。
为了提供更具科技感、极具视觉冲击力与丝滑操作体验的前端交互，将 4 个策略等级按 **1 -> 2 -> 3 -> 4** 线性顺序完整重塑为**交互式步进滑块模式（Step Slider Mode）**：

- **第 1 等级（strict）**：第一等级：严格拦截模式（最高安全 · 实时强校验）；
- **第 2 等级（sampling）**：第二等级：抽样检测模式（平衡模式 · 轻量抽检）；
- **第 3 等级（relaxed）**：第三等级：宽松效率模式（极速流畅 · 首检放行）；
- **第 4 等级（time_window）**：第四等级：基于时间画像策略（智能画像 · 固定窗口免检）。

#### 2. 技术设计与详细实现

1. **策略等级线性元数据标准化 (`POLICY_LEVELS`)**：
   - 在 `src/pages/options/tabs/SettingsTab.tsx` 中规范声明 `POLICY_LEVELS` 常量数组，严格依照 `level: 1 -> 2 -> 3 -> 4` 映射对应的策略枚举标识；
   - 每一等级配置安全防护度（`securityScore: 1~5`）、访问直通效率（`speedScore: 1~5`）、主色调、图标徽章、详细工作机制及典型适用场景。
2. **现代化交互式步进滑块组件架构**：
   - **滑块头部 (`.policy-slider-header`)**：动态展示当前等级编号大徽章（带对应等级专属发光渐变投影）、等级名称、安全特性标签及 1/4 进度指示器；
   - **交互轨道与步进节点 (`.policy-slider-box`)**：
     - **渐变进度轨 (`.policy-slider-track-fill`)**：宽度随当前等级平滑过渡（0% -> 33.3% -> 66.6% -> 100%），采用金黄、湛蓝、翡翠绿、紫罗兰四色现代渐变流光；
     - **透明原生滑块输入层 (`.policy-native-slider`)**：底层覆盖 `<input type="range" min="1" max="4" step="1" />`，支持鼠标平滑拖曳、触控手势滑动以及键盘左右方向键微调；
     - **步进刻度交互节点行 (`.policy-steps-row`)**：提供 4 个步进数字节点（1、2、3、4），支持直接点击任意刻度瞬间切换，当前激活节点触发放大、呼吸光晕与加粗高亮；
3. **策略执行逻辑与双维刻度计卡片 (`.policy-detail-card`)**：
   - 卡片左侧配备等级主题色指示条与径向高光漫反射背景；
   - 顶部内嵌**安全防护**（主题色）与**直通速度**（翡翠绿）双维 5 档平滑指示刻度条（`score-bars`）；
   - 卡片内部完整阐述该等级的拦截与验证流转逻辑，并以晶体微光框标明具体业务适用场景。
4. **高级策略参数细调面板融合**：
   - 在滑块卡片底部直接集成高级微调项：时间画像免检窗口时长（分钟）、严格模式页内资源宽容放行数（条）与严格模式页内放行周期复检间隔（分钟），保持控制面板的一体化与紧凑度。
5. **CSS 现代设计系统支持 (`src/pages/options/options.css`)**：
   - 遵循规范的 CSS Tokens，编写完整的滑块轨道、节点点击态、毛玻璃晶体卡片与双维刻度计样式，并针对小屏自适应优化。

#### 3. 修改的文件清单

- **`src/pages/options/options.css`**：新增 `.policy-slider-card`、`.policy-slider-header`、`.policy-slider-box`、`.policy-steps-row`、`.policy-step-item`、`.policy-detail-card`、`.score-bars` 等滑块专用现代样式体系；
- **`src/pages/options/tabs/SettingsTab.tsx`**：引入 `POLICY_LEVELS` 配置表，将垂直卡片重塑为交互式步进滑块组件，与存储状态 `settings.trafficValidationLevel` 深度双向联动；
- **`Agents_Edit.md`**：记录本次功能重构细节。

#### 4. 验证与回归测试记录

- **单元测试集 (Vitest)**：执行 `npm test`，全套 6 个测试套件、49 项测试 **100% 全部通过**。
- **静态类型检查 (TypeScript)**：执行 `npm run typecheck`，**0 错误、0 警告**。
- **生产环境打包 (Vite)**：执行 `npm run build`，耗时 522ms 顺利完成无损打包，前端 MPA 与 Service Worker 全部产物生成完毕。

---

### [2026-09-21] 高级策略参数表单动态展开/隐藏改造与全局定时复检菜单整合

#### 1. 需求背景与功能目标

用户（彩彩）提出：“修改下方高级策略参数设置表单伴随拦截模式调整动态显示和隐藏，保留一个全局定时复检时间间隔设置菜单，默认30分钟”。

- 伴随用户在滑块模式中切换当前拦截策略，动态呈现该策略专属的高级微调参数，避免非相关模式的参数冗余显示；
- 在参数设置表单中无论切换至哪一等级，始终保留一个全局通用的「全局定时复检时间间隔设置菜单」（默认 30 分钟），方便统一调控后台静默复检防漂移机制。

#### 2. 技术设计与详细实现

1. **策略参数表单动态展开与隐藏联动**：
   - **第 1 等级（strict 严格模式）**：动态展开：
     - 严格模式页内资源宽容放行数（`strictToleranceCount`，默认 5 条）；
     - 严格模式页内放行周期复检间隔（`strictRecheckMinutes`，默认 5 分钟）；
     - 自动隐藏时间画像窗口时长；
   - **第 4 等级（time_window 时间画像）**：动态展开：
     - 时间画像免检窗口时长（`timeWindowMinutes`，默认 60 分钟）；
     - 自动隐藏严格模式专属参数；
   - **第 2 等级（sampling 抽样模式）与第 3 等级（relaxed 宽松模式）**：
     - 专属参数自动隐藏，保持界面清爽克制。
2. **全局定时复检时间间隔设置菜单构建**：
   - 在高级策略参数配置区域置顶常驻下拉菜单 `<select>`，绑定 `settings.recheckMinutes`（默认 30 分钟）；
   - 提供丰富常用档位：`0 分钟 (关闭定时复检)`、`5 分钟`、`10 分钟`、`15 分钟`、`30 分钟 (推荐默认)`、`45 分钟`、`60 分钟 (1小时)`、`120 分钟 (2小时)`、`240 分钟 (4小时)`，并支持自定义数值回显；
   - 当选中的策略无专属项时，该菜单自动自适应全宽占据，布局协调工整。
3. **消除重复设置与下层卡片对称重构**：
   - 将原先下层“探测参数”卡片中重复的“后台静默周期复检间隔”移除；
   - 下层卡片聚焦于“单源检测超时时间（毫秒）”与“安全检测通过后自动返回原网站延迟（秒）”，采用两列对称布局（`field` + `field`），界面清爽专业。

#### 3. 修改的文件清单

- **`src/pages/options/tabs/SettingsTab.tsx`**：
  - 高级策略参数区域实现基于 `curLevel.id` 的条件式动态渲染；
  - 接入常驻全局定时复检下拉菜单；
  - 下层探测响应参数卡片改为两列对称布局；
- **`Agents_Edit.md`**：本记录文档归档。

#### 4. 验证与回归测试记录

- **单元测试集 (Vitest)**：执行 `npm test`，全套 6 个测试套件、49 项测试 **100% 全部通过**。
- **静态类型检查 (TypeScript)**：执行 `npm run typecheck`，**0 错误、0 警告**。
- **生产环境打包 (Vite)**：执行 `npm run build`，耗时 553ms 成功打包至 `dist/`，全部产物更新完毕。

---

### [2026-09-21] 全局定时复检菜单「自定义输入分钟数」交互修复与动态联动增强

#### 1. 需求背景与问题定位

用户（彩彩）精准指出：`SettingsTab.tsx` 中全局定时复检菜单的“自定义”一处之前没有生效。

- **原因剖析**：此前仅在 `settings.recheckMinutes` 恰好处于非预设数值时被动在下拉列表中渲染一行只读文本，但下拉菜单中缺乏供用户主动选择的「自定义」操作入口，也缺少可供用户输入数字的控件，导致用户在前端界面中根本无法主动设置自定义分钟数。

#### 2. 技术设计与修复实现

1. **下拉菜单支持主动进入自定义模式**：
   - 在预设列表尾部正式提供 `<option value="custom">✏️ 自定义输入分钟数…</option>` 选项；
   - 增加 `isCustomRecheck` 状态与动态检测：当用户选择自定义或当前值不属于预设（0, 5, 10, 15, 30, 45, 60, 120, 240）时，自动激活自定义模式；
2. **平滑展开联动数字输入框**：
   - 激活自定义模式后，下拉框与右侧数字输入框以弹性比例平滑并排显示；
   - 支持自由输入 1 ~ 1440 分钟，输入即刻通过 `patch({ recheckMinutes })` 持久化；
   - 当用户在下拉列表中重新切回任一预设档位（如 30 分钟推荐默认）时，输入框自动平滑收起，下拉框恢复纯预设单选模式。

#### 3. 修改的文件清单

- **`src/pages/options/tabs/SettingsTab.tsx`**：重构全局定时复检菜单，实现自定义选项与动态数字输入框双向联动；
- **`Agents_Edit.md`**：本记录文档归档。

#### 4. 验证与回归测试记录

- **单元测试集 (Vitest)**：执行 `npm test`，全套 6 个测试套件、49 项测试 **100% 全部通过**。
- **静态类型检查 (TypeScript)**：执行 `npm run typecheck`，**0 错误、0 警告**。
- **生产环境打包 (Vite)**：执行 `npm run build`，耗时 645ms 顺利完成无损打包输出至 `dist/`。

---

### [2026-09-21] 策略滑块布局重塑：迁移至右上角并全面升级为 ChatGPT 极光胶囊滑块

#### 1. 需求背景与设计目标

用户（彩彩）提出：“把滑块调整到<span class="tag tag-muted" 这里，四个节点的滑条用不了下面那么长的距离，可以参考ChatGPT网页端的滑块，如图”。

- **痛点分析**：原先滑块采用在卡片下方通栏占据整整一行（`policy-slider-box`）的大跨度布局，4 个节点在宽屏下被拉得过长且占用了过多的垂直纵深，视觉重心松散；
- **重构目标**：将滑块整体移至卡片右上角原状态标签位，深度参考 ChatGPT 网页端模型切换滑块的紧凑设计，打造精致、高阶的极光微型胶囊滑块组件。

#### 2. 技术设计与详细实现

1. **组件位移与空间极简压缩**：
   - 将整行冗长的 `.policy-slider-box` 及 4 个大型圆点步进节点彻底移除；
   - 在右上角原 `<span class="tag tag-muted">` 处构建紧凑型 `.policy-mini-slider` 胶囊组件；
   - 卡片整体垂直空间减少约 110px，卡片头部与下方「策略执行逻辑解读卡片」无缝衔接，视觉层次大幅提振。
2. **ChatGPT 风格极光胶囊滑块体系构建**：
   - **标题居中文字**：显示当前选中的等级编号与简称（如 `1 严格拦截 ›`），配合等级主题色高亮，悬停时箭头微幅右移交互；
   - **极光星光微粒渐变轨**：175px 紧凑宽度、13px 纤巧高度，内部通过多重 CSS 径向渐变与线性渐变叠加，渲染出如同星光微粒点缀的极光流光效果；
   - **纯白高光圆球手柄 (Thumb)**：20px 纯白球形手柄，自带立体光影与投影，悬停放大 1.08 倍，滑动时带 `cubic-bezier(0.16, 1, 0.3, 1)` 丝滑阻尼过渡；
   - **四档步进无缝联动**：覆盖原生透明 `<input type="range" min={1} max={4} step={1} />`，支持拖拽滑动、任意位置点击跳档与键盘微调，实时驱动底层状态与左侧大徽章、详情卡片联动。
3. **CSS 样式体系升级 (`options.css`)**：
   - 编写 `.policy-mini-slider`、`.policy-mini-slider-title`、`.policy-mini-track-wrap`、`.policy-mini-track-fill`、`.policy-mini-thumb` 专属样式体系；
   - 增加移动端与窄屏响应式折行适配。

#### 3. 修改的文件清单

- **`src/pages/options/tabs/SettingsTab.tsx`**：引入 `ChevronRight`，将滑块移至右上角重构为 ChatGPT 胶囊微型滑块，清理下部冗余滑块结构；
- **`src/pages/options/options.css`**：新增 ChatGPT 胶囊滑块专属极光星光渐变与高光圆球手柄样式；
- **`Agents_Edit.md`**：本记录文档归档。

#### 4. 验证与回归测试记录

- **单元测试集 (Vitest)**：执行 `npm test`，全套 6 个测试套件、49 项测试 **100% 全部通过**。
- **静态类型检查 (TypeScript)**：执行 `npm run typecheck`，**0 错误、0 警告**。
- **生产环境打包 (Vite)**：执行 `npm run build`，耗时 526ms 顺利完成无损打包输出至 `dist/`。

---

### [2026-09-21] 右上角极光滑块微调：移除外围卡片外框实现极简纯净融入

#### 1. 需求背景与视觉优化

用户（彩彩）反馈：“去掉外面的框”。

- **分析**：右上角滑块组件此前外覆了一层药丸卡片容器（带有边框 `border`、深色底色 `background: var(--bg-surface)` 与卡片投影 `box-shadow`），在大卡片内形成了多重框线嵌套，略显沉重繁琐；
- **优化**：彻底剥离组件外围的边框与底色框，仅保留居中等级文字与极光星光滑轨本身，实现极简纯净的悬浮呈现。

#### 2. 技术设计与修改实现

- **`src/pages/options/options.css`**：
  - 将 `.policy-mini-slider` 设为 `background: transparent; border: none; box-shadow: none;`；
  - 移除非必要的内边距，使滑块直接轻盈贴合卡片右上角；
  - 悬停交互保持背景纯净无框。

#### 3. 验证与回归测试记录

- **单元测试集 (Vitest)**：执行 `npm test`，全套 6 个测试套件、49 项测试 **100% 全部通过**。
- **静态类型检查 (TypeScript)**：执行 `npm run typecheck`，**0 错误、0 警告**。
- **生产环境打包 (Vite)**：执行 `npm run build`，耗时 517ms 成功打包输出至 `dist/`。

---

### [2026-09-21] 策略等级依照严格程度反向重塑（一二三四递增）与滑块四虚线刻度点升级

#### 1. 需求背景与重塑目标

用户（彩彩）提出：“把<div class="policy-mini-slider-title">删除掉，没有必要，滑块中设置四个虚线点，等级重新定义，总体按照严格等级，反向排列一二三四”。

- **认知模型统一**：此前将最严格的 `strict` 定为第一等级，使得滑块从左向右滑动时严格度反而下降，不符合“等级越高、手柄拉满防御越强”的普遍直觉；
- **视觉精简化**：滑块上方冗余的标题文字占据纵深且分散注意力，予以移除；
- **刻度明确化**：在滑块轨道内部设置 4 个虚线刻度点，提供精准的四档视觉参照。

#### 2. 技术设计与详细实现

1. **等级元数据全链路反向重排 (`POLICY_LEVELS`)**：
   - **第 1 等级（Level 1）**：基于时间画像策略（`time_window`，极速免检）；
   - **第 2 等级（Level 2）**：宽松效率模式（`relaxed`，开屏首检，后续极速直通）；
   - **第 3 等级（Level 3）**：抽样检测模式（`sampling`，平衡抽样复核）；
   - **第 4 等级（Level 4）**：严格拦截模式（`strict`，最高安全实时强校验）；
   - 滑块从左向右滑动（1 -> 2 -> 3 -> 4），防御等级由宽松逐级提升至最高严格，与界面左侧大徽章（`L1 ~ L4`）与解读卡片完美联动。
2. **滑块极简微型化与 4 虚线刻度点植入**：
   - 移除 `.policy-mini-slider-title` 标题容器与无用矢量图标；
   - 在滑轨底槽内精密布局 4 个微型虚线刻度点（`policy-mini-ticks` 与 `policy-mini-tick`），点位在 X 轴上精准对准手柄 4 个停靠位点（`calc(10px + (100% - 20px) * (idx / 3))`）；
   - 手柄覆盖或经过刻度点时触发白光高亮聚合动效；
   - 渐变填充流光升级为紫色（L1） -> 翡翠绿（L2） -> 科技蓝（L3） -> 琥珀橙（L4）层层进阶流光；
   - 移动端自适应平滑适配。
3. **站点规则配置面板协同**：
   - 同步校准 `src/pages/options/tabs/SitesTab.tsx` 中的单选组，按第一等级（时间画像）至第四等级（严格拦截）依次呈现。

#### 3. 修改的文件清单

- **`src/pages/options/tabs/SettingsTab.tsx`**：反向重排 `POLICY_LEVELS`，删除滑块标题，植入 4 个虚线刻度点；
- **`src/pages/options/options.css`**：新增 `.policy-mini-ticks` 与 `.policy-mini-tick` 刻度点高亮微动效样式，调整流光渐变；
- **`src/pages/options/tabs/SitesTab.tsx`**：同步更新策略单选组顺序；
- **`Agents_Edit.md`**：本记录文档归档。

#### 4. 验证与回归测试记录

- **单元测试集 (Vitest)**：执行 `npm test`，全套 6 个测试套件、49 项测试 **100% 全部通过**。
- **静态类型检查 (TypeScript)**：执行 `npm run typecheck`，**0 错误、0 警告**。
- **生产环境打包 (Vite)**：执行 `npm run build`，耗时 578ms 顺利完成无损打包输出至 `dist/`。

---

### [2026-09-21] 极光滑块视觉升级：绿红安全光谱流光演进与轨道/手柄饱满度提升

#### 1. 需求背景与视觉目标

用户（彩彩）提出：“渐变从绿到红，条的宽度再高一些”。

- **色彩感知强化**：安全防御等级由最宽松直通（安全通行：绿）到最严格阻断（高危警示：红）具备天然的心理模型，将渐变光谱由紫色系升级为标准的「绿 -> 红」渐进流光；
- **尺寸比例饱满化**：原先轨道高度 13px 偏细偏平，适度增高并扩展整体宽度，手柄同步加大，操作感更佳。

#### 2. 技术设计与修改实现

1. **绿到红全链路光谱色彩升级**：
   - **第 1 等级（时间画像）**：`#10b981`（翡翠绿 · 极速通行）；
   - **第 2 等级（宽松效率）**：`#84cc16`（草木黄绿 · 宽松放行）；
   - **第 3 等级（抽样检测）**：`#f59e0b`（琥珀金黄 · 抽检警备）；
   - **第 4 等级（严格拦截）**：`#ef4444`（鲜艳警示红 · 强力拦截）；
   - 轨道填充采用 `linear-gradient(90deg, #10b981 0%, #84cc16 33%, #f59e0b 66%, #ef4444 100%)` 搭配星光粒子叠加，极具科技高级感。
2. **滑轨与手柄比例全面增高饱满化**：
   - **轨道高度**：从 `13px` 提升至 `16px`（增厚 23%），胶囊圆角更饱满；
   - **滑块总宽**：从 `155px` 适度加宽至 `180px`；
   - **白色圆球手柄 (Thumb)**：直径从 `20px` 增至 `22px`，手柄停留位置与 4 个虚线刻度点严格对齐 `calc(11px + (100% - 22px) * ratio)`。

#### 3. 修改的文件清单

- **`src/pages/options/tabs/SettingsTab.tsx`**：等级颜色重置为绿至红光谱，微调填充宽度与手柄/刻度停靠点；
- **`src/pages/options/options.css`**：更新 `.policy-mini-slider` 宽度为 180px，轨道高度提升为 16px，手柄直径 22px，并配置绿红流光背景；
- **`Agents_Edit.md`**：本记录文档归档。

#### 4. 验证与回归测试记录

- **单元测试集 (Vitest)**：执行 `npm test`，全套 6 个测试套件、49 项测试 **100% 全部通过**。
- **静态类型检查 (TypeScript)**：执行 `npm run typecheck`，**0 错误、0 警告**。
- **生产环境打包 (Vite)**：执行 `npm run build`，耗时 570ms 顺利完成无损打包输出至 `dist/`。

---

### [2026-09-21] 策略双维刻度计色彩重构：安全防护（红到绿）与直通速度（绿到黄）精准映射

#### 1. 需求背景与设计目标

用户（彩彩）提出：

- “安全防护：程度表示色块设置为从低到高红到绿的程度整体颜色变化”；
- “直通速度：程度表示色块设置为优到良绿到黄的程度整体颜色变化”。
- **目标**：彻底消除此前刻度计单调写死固定颜色的缺陷，以符合通用认知习惯的色彩直觉，直观量化呈现不同策略等级在“安全防护”与“访问效率”之间的权衡（Trade-Off）。

#### 2. 技术设计与详细实现

1. **安全防护色块动态光谱映射 (`getSecurityScoreColor`)**：
   - 程度由低到高（1~5 分），色块整体呈现由红到绿的渐进过渡：
     - 1 分（极低）：`#ef4444`（鲜红）
     - 2 分（低）：`#f97316`（橙红）
     - 3 分（中）：`#eab308`（亮黄）
     - 4 分（高）：`#84cc16`（黄绿）
     - 5 分（极高）：`#10b981`（翡翠绿）
   - 当策略安全防护等级较低（如时间画像 2 分）时，色块整体呈现醒目的橙红色警示；当处于最高防御（严格模式 5 分）时，色块全满翠绿，安全感拉满。
2. **直通速度色块动态光谱映射 (`getSpeedScoreColor`)**：
   - 程度由优到良（5~1 分），色块整体呈现由绿到黄的渐进过渡：
     - 5 分（极致直通 · 优）：`#10b981`（纯正翡翠绿）
     - 4 分（优-）：`#22c55e`（鲜绿）
     - 3 分（良+）：`#84cc16`（草木黄绿）
     - 2 分（强校验折损 · 良）：`#eab308`（明黄）
     - 1 分（良-）：`#f59e0b`（琥珀黄）
   - 当策略极速免检（如时间画像、宽松模式 5 分）时，色块全满翠绿直观表达极致流畅；当由于强校验影响速度（严格模式 2 分）时，色块整体呈现明黄色表达合理降速。
3. **质感与光晕细节提升**：
   - 激活的色块均附带对应颜色 25% 柔和扩散光晕（`box-shadow: 0 0 5px ${color}40`），未激活色块保持低调半透明槽底，刻度反馈极其精致。

#### 3. 修改的文件清单

- **`src/pages/options/tabs/SettingsTab.tsx`**：实现 `getSecurityScoreColor` 与 `getSpeedScoreColor`，重构 `score-bars` 动态渲染；
- **`Agents_Edit.md`**：本记录文档归档。

#### 4. 验证与回归测试记录

- **单元测试集 (Vitest)**：执行 `npm test`，全套 6 个测试套件、49 项测试 **100% 全部通过**。
- **静态类型检查 (TypeScript)**：执行 `npm run typecheck`，**0 错误、0 警告**。
- **生产环境打包 (Vite)**：执行 `npm run build`，耗时 552ms 顺利完成无损打包输出至 `dist/`。

---

### [2026-09-22] 第 1 等级（基于时间画像策略）免检窗口期内重复触发首屏检测 Bug 根治修复

#### 1. 问题现象与根因深度剖析

用户（彩彩）在测试中反馈：

> “第 1 等级：基于时间画像策略模式下，一次校验放行，后面在时间画像免检窗口时长范围内，还是会进行首屏检测，按理说会记录状态，在这个时间内不做检测直接放行，对用户自身的代理素质要较高”

经过对后台 Service Worker 核心引擎、DNR 规则编译器与拦截页 RPC 信道的全链路追踪，定位到以下几处复合缺陷导致了该问题：

1. **DNR 规则在 `status === 'allowed'` 下盲目拦截新建标签页（核心根因）**：
   在 `guard-engine.ts` 的 `_setAll()` 中，此前在状态为 `allowed` 时，为所有受保护域名下发了 DNR 会话重定向规则，并仅将「已通过验证的 tabIds」填入 `excludedTabIds`。
   而在 Chromium 原生底层，网络层判定是同步由 C++ 执行的，当用户在浏览器新建标签页或新窗口打开受保护站点时，新标签页的 `tabId` 尚未被后台 JavaScript 获取或登记进白名单，导致 Chromium 在网络握手前即刻将主框架导航强制重定向至 `blocked.html`！
2. **`verifyAndAuthorizeTab` 无差别执行外网强制 IP 探测**：
   当新标签页被误重定向至 `blocked.html` 时，拦截页初始化触发 `sendCmd('verifyAndAllowTab')`。然而后端的 `verifyAndAuthorizeTab` 未判断当前站点是否已处于免检时间画像窗口或检测结果是否仍然匹配，而是机械化地无脑执行 `await recheckAndApply(true)`，发起高开销的外网 IP HTTP 探测，并要求前端展示 3 秒倒计时，导致用户体感上“即使选了时间画像，每次打开新标签页还是卡在拦截页重新检测”。
3. **`onProtectedAccess` 对时间画像免检条件判定过严**：
   在 `guard-engine.ts` 的 `onProtectedAccess()` 中，判定 `time_window` 是否可直通时，强行检查了 `prevStates[site.id]?.status === 'allowed'`。当 Service Worker 刚唤醒、规则变动重置或站点处于临界状态时，即便 `isSiteWithinTimeWindow` 明确在窗口期内，也会因为旧状态不是 allowed 而被误判为 `canDirectAllow = false`，退化执行加锁和重检。
4. **时间画像验证记录仅存放于 session 存储且存在误杀**：
   此前 `traffic-policy.ts` 中的 `SK_SITE_VERIFICATIONS` 仅保存在 `chrome.storage.session` 中，无法跨浏览器重启维持画像；同时在 `recomputeFromCheck` 中，一旦某单个站点因多国家规则判定锁定（如配置了多站点），错误调用了全局 `clearSiteVerifications()`，把其他合规站点的时间画像全部清空。
5. **`initGuard` 在 Service Worker 唤醒时盲目重置状态**：
   MV3 Service Worker 每 30 秒空闲便会被浏览器挂起，唤醒时 `initGuard()` 将全部站点状态重置为 `checking`，破坏了有效免检窗口内的放行延续性。

#### 2. 技术设计与详细修复实现

1. **DNR 规则下发策略精准分流 (`guard-engine.ts: _setAll`)**：
   - **第 1 等级（基于时间画像策略）**：只要状态为 `allowed` 且当前时间仍在免检窗口时长内（`isSiteWithinTimeWindow` 为真），**绝不下发任何 DNR 阻断或重定向规则**！新标签页、新窗口、任何资源均可在网络层 0 阻碍、0 延迟秒开直通；
   - **第 2 等级（宽松模式）与第 3 等级（抽样模式）**：首屏检测放行后，网络层直通，后续交互流量由 `webRequest` 后台静默监听与轻量抽检，不在首屏阻断主框架；
   - **第 4 等级（严格拦截模式）**：保留 `excludedTabIds` 的标签页级强管控，新开标签页必须通过严格的开屏核验。
2. **时间画像全链路持久化与精细化维护 (`traffic-policy.ts`)**：
   - 将 `siteVerifications` 切换至 `chrome.storage.local` 持久化，支持跨 Service Worker 挂起、浏览器关闭重启，在用户设定的免检窗口期内（默认 60 分钟）持续有效；
   - 新增 `removeSiteVerification(siteId)`：当某一站点发生 IP 漂移或规则违规锁定时，精准仅移除该违规站点的画像，绝不误杀全局其他合规站点；
   - 在 `isSiteWithinTimeWindow` 中增加过期自动清理机制。
3. **首屏访问守护优化 (`guard-engine.ts: onProtectedAccess`)**：
   - 当策略为 `time_window` 时，只要命中有效免检窗口且站点未被显式锁定，直接判定 `canDirectAllow = true`；
   - 命中免检时，自动恢复/确保护航状态为 `status: 'allowed'`，刷新标签页会话白名单，并直接 `return`，绝不加锁、绝不发起网络重检。
4. **标签页验证 RPC 极速直通 (`guard-engine.ts: verifyAndAuthorizeTab` & `blocked/App.tsx`)**：
   - 优化 `verifyAndAuthorizeTab`：优先检查是否在 `time_window` 免检期内，若是直接返回 `{ pass: true }` 并放行；优先检查当前探测结果是否新鲜匹配，若是直接放行；仅在未就绪或严格模式下才发起外网 IP 探测；
   - 在 `blocked/App.tsx` 中：首屏初始化核验若为 `pass`，直接调用 `location.replace(from)` 秒级返回原目标网页，彻底去除 3 秒等待倒计时。
5. **SW 启动与守护初始化保护 (`guard-engine.ts: initGuard`)**：
   - 在 `initGuard` 中，检测各受保护站点的时间画像有效性；对处于有效免检窗口期内的站点保留 `allowed` 状态，不被盲目重置为 `checking`。

#### 3. 修改的文件清单

- **`src/background/traffic-policy.ts`**：时间画像记录迁移至 `chrome.storage.local`，实现 `removeSiteVerification` 与过期清理；
- **`src/background/guard-engine.ts`**：
  - 重构 `_setAll`：免检窗口期内不向 Chromium 注册 DNR 阻断规则；
  - 修复 `onProtectedAccess`：时间画像命中时秒开放行并确保护航状态；
  - 优化 `verifyAndAuthorizeTab`：前置免检与新鲜缓存快慢分流；
  - 修复 `initGuard` 与 `recomputeFromCheck`：防止画像被盲目重置或误杀；
- **`src/pages/blocked/App.tsx`**：验证秒过时立刻跳转，消除多余倒计时；
- **`Agents_Edit.md`**：记录本次 Bug 根因剖析与完整修复细节。

#### 4. 验证与回归测试记录

- **单元测试集 (Vitest)**：执行 `npm test`，全套 6 个测试套件、49 项测试 **100% 全部通过**。
- **静态类型检查 (TypeScript)**：执行 `npm run typecheck`，**0 错误、0 警告**。
- **生产环境打包 (Vite)**：执行 `npm run build`，耗时 836ms 顺利完成无损打包输出至 `dist/`。

---

### [2026-09-22] 全项目版本号迭代跃升至 v3.4.0

#### 1. 需求背景与版本说明

鉴于近期系统完成了基于严格等级反向排列的现代化微型四档滑块重构（1 时间画像 -> 2 宽松效率 -> 3 抽样检测 -> 4 严格拦截）、双维刻度计动态色彩光谱映射（安全防护红到绿、直通速度绿到黄）、以及第 1 等级时间画像免检窗口期全链路直通与持久化等核心升级，根据用户（彩彩）指令，将全项目版本号由 `v3.3.0` 正式自增迭代至 `v3.4.0`。

#### 2. 修改的文件清单

- **`package.json`**：`"version": "3.4.0"`；
- **`package-lock.json`**：根节点及包信息同步迭代为 `3.4.0`；
- **`public/manifest.json`**：`"version": "3.4.0"`；
- **`Agents_Edit.md`**：本记录文档归档。

#### 3. 验证与构建测试记录

- **静态类型检查 (TypeScript)**：执行 `tsc --noEmit`，**0 错误、0 警告**；
- **单元测试集 (Vitest)**：执行 `npm test`，全套 6 个测试套件、49 项测试 **100% 全部通过**；
- **生产环境打包 (Vite)**：执行 `npm run build`，耗时 554ms 顺利完成无损打包，`dist/manifest.json`、Popup 与 Options 页面版本号展示自动同步为 `v3.4.0`。

---

### [2026-09-22] 策略等级变动全链路缓存刷新机制优化与小面板策略等级态标识新增

#### 1. 需求背景与痛点分析

用户（彩彩）在实测中反馈：

1. **策略等级切换时存在历史缓存粘黏耦合**：
   从第 1 等级（基于时间画像策略）切换到第 2、3、4 等级时，由于后台存储中仍保留了此前第 1 等级写入的放行状态与免检画像，且 `settings` 变动未联动清除缓存，导致切换后访问受保护站点依然没有触发预期中的“开屏首检”，产生状态粘黏；
2. **小面板缺少当前生效策略等级的直观标识**：
   在扩展 Popup 小面板中，用户无法一眼获知当前系统生效的全局策略等级或当前访问站点的防护等级态，操作中心不够直观。

#### 2. 技术设计与详细实现

1. **策略等级变动全链路响应与缓存刷新 (`guard-engine.ts: onSettingsChanged` & `index.ts`)**：
   - 在 `index.ts` 中新增对 `K.settings` 变动的深度监听，将旧设置与新设置传递给 `guard.onSettingsChanged(oldSettings, newSettings)`；
   - 当检测到全局 `trafficValidationLevel`、`timeWindowMinutes` 或严格模式参数发生变动时，立刻执行：
     1. `clearSiteVerifications()`：彻底清空第 1 等级遗留的时间画像验证时间戳记录；
     2. `clearAllTabSessions()`：清空已放行的标签页 Session 白名单；
     3. 将所有已启用的受保护站点护航状态重置为 `checking`（访问前重新开屏校验）；
     4. 重新调用 `_setAll` 重新编译下发全部 DNR 规则，并触发 `recheckAndApply(true)` 进行全新首屏核验；
   - 在 `onSitesChanged()` 中同样集成 `clearSiteVerifications()` 与 `clearAllTabSessions()`，彻底切断策略黏连。
2. **DNR 规则与首屏检测判定闭环 (`guard-engine.ts: _setAll` & `onProtectedAccess`)**：
   - 在 `_setAll()` 中明确分流：第 1 等级（`time_window`）在免检期内跳过注册阻断规则，实现极致直通；第 2（宽松）、第 3（抽样）、第 4（严格）等级下，对 `status === 'allowed'` 的站点必须将放行标签页列表放入 `excludedTabIds`，使得任何新开标签页（未在白名单内）必然被拦截进入“开屏检测”；
   - 在 `onProtectedAccess()` 中，对第 2、3、4 等级加入 `!isTabSessionVerified` 校验，未通过开屏检测的标签页坚决不提前放行，必须经由开屏检测验证后才加入放行会话。
3. **小面板（Popup）策略等级态标识呈现 (`popup/App.tsx` & `popup.css`)**：
   - 提取并共享全局 `POLICY_LEVELS` 与 `getPolicyMeta()` 辅助函数（位于 `constants.ts`）；
   - **头部操作区加入全局策略等级态胶囊徽章 (`chip-policy`)**：
     - 展示 `L1 时间画像`（翠绿）、`L2 宽松效率`（黄绿）、`L3 抽样检测`（琥珀黄）、`L4 严格拦截`（鲜红）；
     - 附带对应等级专属色彩、微光发光边框与闪电图标；悬停具备浮起与增亮交互；点击可一键直达 Options 控制中心快速调整等级；
   - **当前站点加护卡片（`CurrentSiteGuardCard`）等级态精细化呈现**：
     - 若当前站点已受守护，展示实际生效等级（`L{level} {shortName}`），并智能标明“站点独立指定”或“跟随全局策略”。

#### 3. 修改的文件清单

- **`src/shared/constants.ts`**：提取共享 `POLICY_LEVELS` 与 `getPolicyMeta()` 工具函数；
- **`src/pages/options/tabs/SettingsTab.tsx`**：复用共享的 `POLICY_LEVELS`，消除重复定义；
- **`src/background/guard-engine.ts`**：
  - 新增 `onSettingsChanged` 全面刷新策略缓存与重置状态；
  - `_setAll` 与 `onProtectedAccess` 严格限制第 2、3、4 等级必须开屏首检；
  - `onSitesChanged` 补齐缓存清空；
- **`src/background/index.ts`**：监听 `K.settings` 并路由至 `guard.onSettingsChanged`；
- **`src/pages/popup/App.tsx`**：头部与当前网站卡片增加策略等级态胶囊与标签；
- **`src/pages/popup/popup.css`**：新增 `.chip-policy` 样式与动态微动效；
- **`Agents_Edit.md`**：记录本次功能增强与缓存解耦细节。

#### 4. 验证与构建测试记录

- **单元测试集 (Vitest)**：执行 `npm test`，全套 6 个测试套件、49 项测试 **100% 全部通过**；
- **静态类型检查 (TypeScript)**：执行 `tsc --noEmit`，**0 错误、0 警告**；
- **生产环境打包 (Vite)**：执行 `npm run build`，耗时 530ms 顺利完成无损打包输出至 `dist/`。

---

### [2026-09-22] 小面板标识防挤压优化、等级超链接直达全局设置、第四等级 ChatGPT Ultra 流光星晶动效与版本跃升至 v3.5.0

#### 1. 需求背景与目标拆解

用户（彩彩）在实操体验中提出三项进一步雕琢优化诉求：

1. **小面板顶部状态胶囊挤压与直达设置**：
   - 弹窗头部操作区 `<div class="row popup-header-actions">` 中的策略等级徽章与 WebRTC 标识发生挤压；
   - 策略等级标识的点击超链接需要固定导航至 `options.html#settings`（全局设置页），方便用户随时调整策略等级；
2. **第四等级滑块 ChatGPT Ultra 质感流光亮晶星芒**：
   - 当设置界面的微型滑块拉动到最高等级（第 4 等级：严格拦截）时，在原有的绿到红渐变背景之上凸显如 ChatGPT Ultra 模式滑块般的流光亮晶效果（含散落的晶莹星芒粒子与光幕横掠），色彩搭配保持与现在一致；
3. **版本号迭代**：
   - 全项目版本号自增至 `v3.5.0`。

#### 2. 技术设计与详细实现

1. **小面板排版优化与 `#settings` 精准直达 (`popup/App.tsx`, `popup.css`, `options/App.tsx`)**：
   - **固定直达全局设置与标签页复用**：
     - 在 `popup/App.tsx` 中封装模块级 `openOptionsSettings(hash = 'settings')` 函数：通过 `chrome.tabs.query` 查询是否已存在打开的 `options.html` 标签页。若已打开，则平滑更新 URL 至目标哈希并激活窗口（聚焦），若未打开则直接创建 `options.html#settings` 标签页；
     - 在 `options/App.tsx` 中增加 `window.addEventListener('hashchange')` 监听，确保在控制面板页面已驻留后台时，从小面板点击能瞬间响应 hash 变化并无缝切换到「全局设置」Tab；
     - 点击小面板头部的策略等级胶囊或设置齿轮均调用 `openOptionsSettings('settings')`；站点独立卡片点击则智能定位至对应 Tab。
   - **头部布局弹性重构，根除挤压**：
     - 将头部左侧品牌区设为 `min-width: 0; flex: 1 1 auto;`，副标题文字加上文本溢出保护；
     - 右侧操作区设为 `flex-shrink: 0; flex-wrap: nowrap; gap: 5px;`；
     - 将 `.chip` 紧凑微调为 `padding: 2.5px 7px; font-size: 10.5px;`；
     - 精简 WebRTC 胶囊文案（开启时为 `[盾牌] WebRTC`，关闭时为 `[盾牌] WebRTC 关`），整体宽度削减近 25px，彻底消除任何换行或挤压现象；
     - 设置齿轮按钮增加 Hover 顺时针微旋转动画（`rotate(30deg)`），兼具高级感与灵动感。
2. **第四等级 ChatGPT Ultra 流光亮晶星芒动效 (`SettingsTab.tsx`, `options.css`)**：
   - **动态注入条件**：
     - 在 `SettingsTab.tsx` 中，仅当 `curLevel.level === 4` 时，为 `.policy-mini-track-fill` 注入类名 `.track-fill-ultra` 以及流光星芒动效容器 `.policy-ultra-sparkles`；
     - 包含 8 颗错落分布的多维晶体星芒微粒（`ultra-star-1` ~ `ultra-star-8`）和一道流光光幕（`ultra-shimmer-sweep`）；
   - **纯 CSS 高科技动效体系**：
     - 渐变底色维持原有的高饱和红绿极光渐变（`linear-gradient(90deg, #10b981 0%, #84cc16 33%, #f59e0b 66%, #ef4444 100%)`）完全不变；
     - 8 颗星芒拥有独立的高低起伏位置与发光半径（`box-shadow: 0 0 3~4.5px rgba(255,255,255,1)`），配合 `@keyframes ultraStarTwinkle` 实现不同频次的呼吸与晶莹闪烁；
     - 流光光幕配合 `@keyframes ultraShimmerSweep` 从 `-70%` 平滑掠至 `140%`，光辉横扫轨道粒子，营造出与 ChatGPT Ultra 模式如出一辙的星空流光质感；
     - 处于第 1、2、3 等级时轨道保持纯净平滑渐变，对比鲜明。
3. **全项目版本号跃升至 v3.5.0**：
   - 同步修改 `package.json`、`package-lock.json`、`public/manifest.json` 为 `3.5.0`。

#### 3. 修改的文件清单

- **`src/pages/popup/App.tsx`**：实现模块级 `openOptionsSettings`，优化头部品牌与操作区结构及等级点击直达；
- **`src/pages/popup/popup.css`**：头部防挤压弹性布局重构，调整 `.chip` 间距尺寸与设置图标微动效；
- **`src/pages/options/App.tsx`**：增加 `hashchange` 事件监听，实现外部 hash 改变时即时响应 Tab 切换；
- **`src/pages/options/tabs/SettingsTab.tsx`**：第四等级滑块注入 ChatGPT Ultra 星芒与扫光容器；
- **`src/pages/options/options.css`**：定义 `.policy-ultra-sparkles`、`.ultra-star` 闪烁动效与 `.ultra-shimmer-sweep` 流光掠过关键帧；
- **`package.json`**：版本号迭代为 `3.5.0`；
- **`package-lock.json`**：根节点与包信息版本号迭代为 `3.5.0`；
- **`public/manifest.json`**：版本号迭代为 `3.5.0`；
- **`Agents_Edit.md`**：记录本次开发与升级演进。

#### 4. 验证与构建测试记录

- **静态类型检查 (TypeScript)**：执行 `tsc --noEmit`，**0 错误、0 警告**；
- **单元测试集 (Vitest)**：执行 `npm test`，全套 6 个测试套件、49 项测试 **100% 全部通过**；
- **生产环境打包 (Vite)**：执行 `npm run build`，耗时 556ms 顺利完成无损打包，`dist/manifest.json` 自动同步为 `v3.5.0`。

---

### [2026-09-22] 滑条高度饱满化提升与 ChatGPT Ultra 璀璨星晶从左至右持续流淌动效优化

#### 1. 需求背景与痛点分析

用户（彩彩）在实测中进一步指出视觉质感调优方向：

1. **亮晶动效流动感不足**：此前亮晶粒子仅在固定位置处呼吸闪烁，缺少宇宙星河流淌的动态生命力，应当“从左到右一直流动”；
2. **滑条高度偏窄**：原轨条高度为 16px，对于展示流光与星河略显紧凑，视觉张力不足，需要进一步提高滑块高度，提升饱满度与高级感。

#### 2. 技术设计与详细实现

1. **滑条高度与核心交互组件饱满化调优 (`options.css` & `SettingsTab.tsx`)**：
   - 将轨槽 `.policy-mini-track` 高度由 `16px` 大幅提升至 `22px`（增幅约 38%），增强内阴影深度（`box-shadow: inset 0 1px 4px rgba(0,0,0,0.45)`）；
   - 将滑块外层包裹容器 `.policy-mini-track-wrap` 高度由 `26px` 提升至 `30px`；
   - 将高光白色手柄 `.policy-mini-thumb` 尺寸由 `22px` 同步提升至 `26px`（微凸出轨道 2px，比例匀称饱满）；
   - 虚线刻度点 `.policy-mini-tick` 尺寸由 `4px` 放大为 `5px`，居中对齐；
   - 在 `SettingsTab.tsx` 中同步将填充轨 `policy-mini-track-fill`、刻度点以及白色手柄的几何计算偏移由基准 `11px/22px` 升级为 `13px/26px`（对应手柄半径 13px 与总扣除量 26px），保证滑动到首末端时像素级无缝闭合。
2. **星晶粒子无缝从左向右持续流动动效 (`options.css` & `SettingsTab.tsx`)**：
   - **双星群无缝跑马灯流道结构 (`.ultra-stars-stream`)**：
     - 在 `SettingsTab.tsx` 中，第四等级激活时在流光容器内注入 `.ultra-stars-stream`，内含两个宽度各为 100% 的 `.ultra-stars-group`（各含 8 颗精心计算坐标与景深的高光星晶）；
     - `.ultra-stars-stream` 总宽 200%，起始位置 `left: -100%`；
   - **向右平滑流动与闪烁双重叠合**：
     - 配置 `@keyframes ultraStarsFlowRight`：从 `translateX(0)` 线性平滑移动至 `translateX(50%)`，耗时 6.5s，并在完成一个完整组后无缝重置，形成**源源不断、永不中断、从左向右奔涌流淌的璀璨星河**；
     - 每一颗星晶微粒在跟随星流漂移的同时，保持各自独立的 `@keyframes ultraStarTwinkle` 呼吸高光闪烁；
     - 与倾斜 20 度的柔白流光扫幕（`.ultra-shimmer-sweep`）共同交织，不仅保持现有的绿到红渐变底色，而且完美还原了 ChatGPT Ultra 模式中璀璨夺目的流光质感。

#### 3. 修改的文件清单

- **`src/pages/options/tabs/SettingsTab.tsx`**：手柄与刻度点基准调整为 13px/26px，构建双跑道无缝星流粒子容器；
- **`src/pages/options/options.css`**：滑条高度提升至 22px，手柄提升至 26px，新增 `@keyframes ultraStarsFlowRight` 无缝向右滚动关键帧；
- **`Agents_Edit.md`**：归档本次视觉饱满化与星流重构全过程。

#### 4. 验证与构建测试记录

- **静态类型检查 (TypeScript)**：执行 `tsc --noEmit`，**0 错误、0 警告**；
- **单元测试集 (Vitest)**：执行 `npm test`，全套 6 个测试套件、49 项测试 **100% 全部通过**；
- **生产环境打包 (Vite)**：执行 `npm run build`，耗时 576ms 顺利完成无损打包输出至 `dist/`。

---

### [2026-09-22] ChatGPT Ultra 璀璨星河与光幕流向优化：调整为从右向左持续奔涌流淌

#### 1. 需求说明

根据用户（彩彩）反馈指正，将第四等级滑块的动效流向调整为**从右向左持续流动**，使星晶粒子由右侧产生并持续向左侧流淌隐没，同时光幕倾斜掠过方向也保持从右向左同步倾泻。

#### 2. 技术设计与详细实现

1. **星晶流道关键帧逆转 (`options.css`)**：
   - 将 `.ultra-stars-stream` 跑道容器的起始位置设定为 `left: 0`；
   - 动画替换为 `@keyframes ultraStarsFlowLeft`：由 `transform: translateX(0)` 线性无缝平移至 `transform: translateX(-50%)`，耗时 6.5s 并瞬时无缝衔接循环，视觉上呈现出完全连贯的从右向左璀璨星流；
2. **光幕扫掠同步向左 (`options.css`)**：
   - 将 `.ultra-shimmer-sweep` 的关键帧更新为 `@keyframes ultraShimmerSweepLeft`：由 `translateX(240%)` 掠至 `translateX(-120%)`，带柔和光晕自右向左扫过整个轨道；
3. **保留全量呼吸闪烁与红绿极光渐变**：
   - 维持红绿安全渐变底色与单颗星晶独立的 `ultraStarTwinkle` 呼吸高光动效，视觉体验浑然天成。

#### 3. 修改的文件清单

- **`src/pages/options/options.css`**：更新 `.ultra-stars-stream` 跑道定位为 `left: 0`，实现 `@keyframes ultraStarsFlowLeft` 与 `@keyframes ultraShimmerSweepLeft`；
- **`Agents_Edit.md`**：记录本次流向调优与全量构建过程。

#### 4. 验证与构建测试记录

- **静态类型检查 (TypeScript)**：执行 `tsc --noEmit`，**0 错误、0 警告**；
- **单元测试集 (Vitest)**：执行 `npm test`，全套 6 个测试套件、49 项测试 **100% 全部通过**；
- **生产环境打包 (Vite)**：执行 `npm run build`，耗时 541ms 顺利完成无损打包输出至 `dist/`。

---

### [2026-09-22] 滑块未填充区域刻度小点呈现、Hover 略微放大与独立点击切档交互支持

#### 1. 需求背景与痛点分析

用户（彩彩）提供 ChatGPT 网页端滑块在 Light（未拉满）状态下的截图并提出需求：

1. **未滑动填充渐变色之前显示小点**：在未被渐变色覆盖的胶囊轨道中，清晰呈现灰白小点（刻度标记），便于感知各等级位置；
2. **鼠标悬浮略微放大**：当光标移至小点时，小点产生平滑的放大与高亮发光微动效；
3. **支持点击控制**：小点本身应可被直接点击，点击后立即无缝切换至对应策略等级。

#### 2. 技术设计与详细实现

1. **刻度点组件重构与交互热区拓展 (`SettingsTab.tsx`)**：
   - 将原先纯展示性的 `span.policy-mini-tick` 重构为带独立语义的 `<button type="button" className="policy-mini-tick">`；
   - 每个按钮分配 24px 的点击热区（Hitbox），内嵌 `<span className="policy-mini-tick-dot" />` 圆点；
   - 绑定 `onClick={(e) => { e.stopPropagation(); patch({ trafficValidationLevel: targetLevel.id }); }}` 与专属悬浮 `title`，支持单点击点精准换档。
2. **样式调优、可见性保障与悬浮动效 (`options.css`)**：
   - **层级提升**：将 `.policy-mini-ticks` 容器层级提升至 `z-index: 5`（高于原生 input 的 `z-index: 4`），确保悬浮与点击即时响应，轨道空白处仍保留拖拽能力；
   - **未激活点清晰显现 (`.tick-inactive`)**：未被填充覆盖前，小圆点呈现 `rgba(255, 255, 255, 0.45)` 伴微阴影，在深浅胶囊轨条中清晰可见；
   - **Hover 放大发光动效**：设置 `.policy-mini-tick:hover .policy-mini-tick-dot` 为 `transform: scale(1.65)` 并叠加高亮白光（`box-shadow: 0 0 8px #ffffff`），手势变为 `cursor: pointer`，交互手感灵动精致。

#### 3. 修改的文件清单

- **`src/pages/options/tabs/SettingsTab.tsx`**：将刻度点升级为包含点击事件、独立热区与 title 提示的按钮结构；
- **`src/pages/options/options.css`**：新增 `.policy-mini-tick-dot`，配置未激活灰白对比度与 Hover 放大 1.65 倍高光动效；
- **`Agents_Edit.md`**：记录本次交互体验升级与验证记录。

#### 4. 验证与构建测试记录

- **静态类型检查 (TypeScript)**：执行 `tsc --noEmit`，**0 错误、0 警告**；
- **单元测试集 (Vitest)**：执行 `npm test`，全套 6 个测试套件、49 项测试 **100% 全部通过**；
- **生产环境打包 (Vite)**：执行 `npm run build`，耗时 549ms 顺利完成无损打包输出至 `dist/`。

---

### [2026-09-22] 刻度小点纯正冷灰色调深度调优与滑块 120Hz 零延迟极致跟手拖拽重构

#### 1. 需求背景与痛点诊断

用户（彩彩）在实测中敏锐指出两项直接影响操作手感的核心体验问题：

1. **小点偏白发虚不明显**：此前未填充区域的小点采用了偏白半透明样式，在胶囊轨条中与背景对比度不够锐利，需要换成更纯正中性的冷灰色调；
2. **拖拽不跟手（脱手滞后感）**：
   - 原刻度小点设置在 `z-index: 5`，占用了超过 50% 的滑轨水平空间，拖拽手势划过小点时会被小点子元素拦截，导致原生 input 的拖拽事件频繁脱手打断；
   - 原 CSS transition 具有 0.25s 的平滑延迟，在拖动过程中产生了“橡皮筋式”拖拽脱手感。

#### 2. 技术设计与详细实现

1. **纯正冷灰色调调优 (`options.css`)**：
   - 将未激活小点 `.policy-mini-tick.tick-inactive .policy-mini-tick-dot` 的背景色由偏白的 `rgba(255,255,255,0.45)` 调整为沉稳高级的纯正冷灰色 `#71717a`（Zinc-500 质感中灰），配合加深的底部投影（`box-shadow: 0 1px 2px rgba(0,0,0,0.45)`）；
   - 在胶囊底轨中轮廓极其锐利清晰，彻底告别过白与发虚；鼠标移至上方时（`.tick-hover`）平滑绽放为 1.65 倍高亮莹白。
2. **零脱手、120Hz 极致跟手拖拽架构重塑 (`SettingsTab.tsx` & `options.css`)**：
   - **顶层原生 input 全量捕获手势**：
     - 将 `.policy-mini-native-input` 提升至最高层（`z-index: 10`），任何位置的按下、拖动与滑动均由浏览器原生滑动器以 120Hz 无阻断捕获，从小点上方划过绝不中断；
   - **拖拽瞬态零延迟跟随 (`.no-transition`)**：
     - 在 `SettingsTab.tsx` 中引入 `isDragging` 与 `dragLevel` 实时驱动手柄与填充进度；
     - 拖拽进行中，动态向手柄与填充槽注入 `.no-transition`（`transition: none !important;`），光标移至哪手柄瞬间定位于哪，彻底根除 0.25s 动画带来的脱手感；松手时恢复平滑弹性过渡；
   - **精准光标距离计算驱动小点 Hover**：
     - 在滑轨内层容器监听 `onMouseMove`，根据光标绝对坐标与 4 个小点中心的几何距离（阈值 16px）动态判定悬停点，精准点亮 `.tick-hover` 放大动效。

#### 3. 修改的文件清单

- **`src/pages/options/tabs/SettingsTab.tsx`**：引入 `isDragging`、`dragLevel`、`hoveredTick` 实时拖拽响应与坐标距离算法；
- **`src/pages/options/options.css`**：小点色调升级为 `#71717a` 冷灰，配置 `.no-transition` 零延迟规则，提高 `native-input` 至 `z-index: 10`；
- **`Agents_Edit.md`**：完整归档本次跟手性重构与色调调优细节。

#### 4. 验证与构建测试记录

- **静态类型检查 (TypeScript)**：执行 `tsc --noEmit`，**0 错误、0 警告**；
- **单元测试集 (Vitest)**：执行 `npm test`，全套 6 个测试套件、49 项测试 **100% 全部通过**；
- **生产环境打包 (Vite)**：执行 `npm run build`，耗时 605ms 顺利完成无损打包输出至 `dist/`。

---

### [2026-09-22] 滑块 thumb 层级重构：手柄高于刻度小点，彻底杜绝小点穿透浮于滑块上方

#### 1. 需求说明

用户（彩彩）反馈指正：
在滑块交互中，`policy-mini-thumb` 小滑块应严格高于小白点，不希望鼠标悬浮或停留时小白点在滑块上方显示或穿透。

#### 2. 技术设计与详细实现

1. **物理层级关系倒置重构 (`options.css`)**：
   - 将白色高光圆球手柄 `.policy-mini-thumb` 的 `z-index` 调整为 `7`；
   - 将刻度小点容器 `.policy-mini-ticks` 的 `z-index` 调整为 `3`；
   - 在任何静止、滑动、动画状态下，白色手柄始终稳固位于刻度小点的物理上层，从根本上防止小点由于层级过高浮在滑块之上；
2. **手柄所在档位悬浮穿透屏蔽 (`SettingsTab.tsx`)**：
   - 优化 `hoveredTick` 计算逻辑：当鼠标悬停在手柄正下方对应档位（`closest === displayLevelNum - 1`）时，判定光标是在触控滑块本身，禁止该点触发 `.tick-hover` 放大动效；
   - 滑块圆球保持纯正晶莹的纯白外观，未覆盖档位小点依然保留灵动的 1.65 倍悬停放大。

#### 3. 修改的文件清单

- **`src/pages/options/options.css`**：`.policy-mini-thumb` 设置 `z-index: 7`，`.policy-mini-ticks` 设置 `z-index: 3`；
- **`src/pages/options/tabs/SettingsTab.tsx`**：当光标位于滑块档位时阻断小点悬停；
- **`Agents_Edit.md`**：记录本次层级优化全过程。

#### 4. 验证与构建测试记录

- **静态类型检查 (TypeScript)**：执行 `tsc --noEmit`，**0 错误、0 警告**；
- **单元测试集 (Vitest)**：执行 `npm test`，全套 6 个测试套件、49 项测试 **100% 全部通过**；
- **生产环境打包 (Vite)**：执行 `npm run build`，耗时 560ms 顺利完成无损打包输出至 `dist/`。

---

### [2026-09-22] 第四等级 ChatGPT Ultra 璀璨亮晶星流与流光扫幕向左穿梭速率大幅提速

#### 1. 需求说明

用户（彩彩）反馈指正：
在第四等级滑块的从右到左流动动效中，亮晶晶星群与流光的流淌速率可以“再快一些”，营造更加轻快迅疾、灵动璀璨的粒子穿梭感。

#### 2. 技术设计与详细实现

1. **星河跑道向左流动周期压缩 (`options.css`)**：
   - 将 `.ultra-stars-stream` 的 `@keyframes ultraStarsFlowLeft` 动画周期由 `3.5s` 大幅提速至 `2.0s`（流速提升约 75%），使无缝双星群粒子以更高频次、更敏捷的姿态自右向左奔涌穿梭；
2. **光幕扫掠同步提速 (`options.css`)**：
   - 将 `.ultra-shimmer-sweep` 的 `@keyframes ultraShimmerSweepLeft` 倾斜扫掠周期由 `3.0s` 提速至 `1.6s`，如闪电波纹般轻抚而过；
3. **星芒闪烁频次谐调微调 (`options.css`)**：
   - 将 8 颗散布星晶的 `@keyframes ultraStarTwinkle` 呼吸周期整体提频至 `1.1s ~ 1.9s`，使明暗呼吸节奏与极速星流向左奔涌形成和谐共振，整体流光动感极强。

#### 3. 修改的文件清单

- **`src/pages/options/options.css`**：调整 `ultraStarsFlowLeft` 周期为 2.0s，`ultraShimmerSweepLeft` 周期为 1.6s，调谐星晶闪烁频次；
- **`Agents_Edit.md`**：记录本次动效速率调优全过程。

#### 4. 验证与构建测试记录

- **静态类型检查 (TypeScript)**：执行 `tsc --noEmit`，**0 错误、0 警告**；
- **单元测试集 (Vitest)**：执行 `npm test`，全套 6 个测试套件、49 项测试 **100% 全部通过**；
- **生产环境打包 (Vite)**：执行 `npm run build`，耗时 581ms 顺利完成无损打包输出至 `dist/`。

---

### [2026-09-22] 刻度小点悬浮分态样式调优：已填充小点悬浮保持纯白高光仅放大尺寸

#### 1. 需求说明

根据用户（彩彩）需求：
针对刻度小点悬浮动效进行精细化分态处理，区分未填充小点与已填充小点：

- 未填充小点悬浮：由沉静灰放大并提亮至 `#acacac`；
- 已填充小点悬浮：背景颜色保持 `#ffffff` 纯白高光不变，仅将圆点大小平滑放大至 `scale(1.65)`。

#### 2. 技术设计与详细实现

1. **分态悬浮规则解耦与新增 (`options.css`)**：
   - 将原统一的 `.policy-mini-tick:hover` 拆分为状态限定选择器；
   - 针对 `.policy-mini-tick.tick-inactive` 保持悬浮颜色变为 `#acacac` 与 `scale(1.65)`；
   - 针对 `.policy-mini-tick.tick-active` 新增悬停样式：保持 `background: #ffffff; box-shadow: 0 0 8px rgba(255,255,255,1), 0 0 3px rgba(255,255,255,0.85);`，尺寸由 `scale(1.1)` 平滑扩大为 `scale(1.65)`，满足“颜色不变，只是大小放大”的视觉要求。

#### 3. 修改的文件清单

- **`src/pages/options/options.css`**：新增 `.policy-mini-tick.tick-active:hover` 与 `.tick-hover` 纯白放大规则；
- **`Agents_Edit.md`**：记录本次交互微动效调优与构建过程。

#### 4. 验证与构建测试记录

- **静态类型检查 (TypeScript)**：执行 `tsc --noEmit`，**0 错误、0 警告**；
- **单元测试集 (Vitest)**：执行 `npm test`，全套 6 个测试套件、49 项测试 **100% 全部通过**；
- **生产环境打包 (Vite)**：执行 `npm run build`，耗时 574ms 顺利完成无损打包输出至 `dist/`。

---

### [2026-09-22] 习惯学习滑动窗口与最少访问天数阈值默认值调整及全项目版本号迭代至 v3.5.1

#### 1. 需求说明

根据用户（彩彩）需求：

1. **统计时间滑动窗口（天）默认值调整**：由原 14 天默认值优化为 **5 天**，更敏捷地捕获近期访问特征；
2. **最少访问天数阈值默认值调整**：由原 5 天默认值优化为 **3 天**，更快识别高频访问落地习惯并触发智能绑定建议；
3. **版本号升级迭代**：全项目版本号自增跃升至 **v3.5.1**。

#### 2. 技术设计与详细实现

1. **全局默认配置更新 (`src/shared/constants.ts`)**：
   - 将 `DEFAULT_SETTINGS` 中的 `suggestWindowDays` 默认值调整为 `5`；
   - 将 `DEFAULT_SETTINGS` 中的 `suggestMinDays` 默认值调整为 `3`；
2. **设置界面输入框回退兜底同步 (`src/pages/options/tabs/SettingsTab.tsx`)**：
   - 调整设置面板中“统计时间滑动窗口（天）”输入组件在非法/清空输入时的默认回退值（`Number(inputValue(e)) || 5`）；
   - 调整“最少访问天数阈值”输入组件在非法/清空输入时的默认回退值（`Number(inputValue(e)) || 3`）；
3. **习惯学习面板空状态提示文案同步 (`src/pages/options/tabs/HabitsTab.tsx`)**：
   - 同步更新暂无绑定建议时的动态提示文案回退数值，与新默认配置保持严格一致（`settings?.suggestWindowDays ?? 5` 天内有 `settings?.suggestMinDays ?? 3` 天以上）；
4. **全项目版本号迭代递增至 v3.5.1**：
   - `package.json`：`version` 升级至 `3.5.1`；
   - `package-lock.json`：顶层与根 package 节点 `version` 升级至 `3.5.1`；
   - `public/manifest.json`：Chrome 扩展清单 `version` 升级至 `3.5.1`。

#### 3. 修改的文件清单

- **`src/shared/constants.ts`**：`DEFAULT_SETTINGS` 默认滑动窗口改为 5 天，最小天数改为 3 天；
- **`src/pages/options/tabs/SettingsTab.tsx`**：数值输入框兜底值同步为 5 与 3；
- **`src/pages/options/tabs/HabitsTab.tsx`**：空状态文案兜底天数同步为 5 与 3；
- **`package.json`**：版本升级至 `3.5.1`；
- **`package-lock.json`**：版本升级至 `3.5.1`；
- **`public/manifest.json`**：扩展版本号升级至 `3.5.1`；
- **`Agents_Edit.md`**：记录本次参数调优与版本迭代全过程。

#### 4. 验证与构建测试记录

- **静态类型检查 (TypeScript)**：执行 `tsc --noEmit`，**0 错误、0 警告**；
- **单元测试集 (Vitest)**：执行 `npm test`，全套 6 个测试套件、49 项测试 **100% 全部通过**；
- **生产环境打包 (Vite)**：执行 `npm run build`，耗时 534ms 顺利完成无损打包输出至 `dist/`，确认 `dist/manifest.json` 版本同步升级为 `v3.5.1`。

---

### [2026-09-22] 小面板右上角齿轮跳转路由定制为代理档案（#profiles）与 L 等级直达全局设置解耦

#### 1. 需求说明

根据用户（彩彩）需求：

1. **右上角齿轮图标跳转重定向**：点击右上角齿轮图标时，跳转直达控制中心的「代理档案」页面（`options.html#profiles`），方便用户快速查看和管理代理节点；
2. **L 等级徽章跳转保持**：保留点击 L 等级状态胶囊直达控制中心的「全局设置」页面（`options.html#settings`），便于用户微调或滑动策略等级。

#### 2. 技术设计与详细实现

1. **通用导航函数重构 (`src/pages/popup/App.tsx`)**：
   - 将原 `openOptionsSettings` 函数重构为更通用的 `openOptionsPage(hash = 'profiles')`，支持任意哈希标签页无缝复用与聚焦；
2. **头部齿轮按钮路由定制 (`src/pages/popup/App.tsx`)**：
   - 将 `.header-setting-btn` 的 `onClick` 更新为 `openOptionsPage('profiles')`，气泡提示（`title`）同步更新为“打开控制中心（代理档案）”；
3. **L 等级徽章路由保留 (`src/pages/popup/App.tsx`)**：
   - 维持 `.chip-policy` 胶囊的 `onClick` 为 `openOptionsPage('settings')`，实现策略等级与节点档案入口精准分流。

#### 3. 修改的文件清单

- **`src/pages/popup/App.tsx`**：优化 `openOptionsPage` 路由函数，齿轮指向 `#profiles`，L 徽章指向 `#settings`；
- **`Agents_Edit.md`**：记录本次路由导航重构与构建验证细节。

#### 4. 验证与构建测试记录

- **静态类型检查 (TypeScript)**：执行 `tsc --noEmit`，**0 错误、0 警告**；
- **单元测试集 (Vitest)**：执行 `npm test`，全套 6 个测试套件、49 项测试 **100% 全部通过**；
- **生产环境打包 (Vite)**：执行 `npm run build`，耗时 563ms 顺利完成无损打包输出至 `dist/`。

---

### [2026-09-22] 编写项目综合图文文档 README.md

#### 1. 需求说明

根据用户（彩彩）需求：
编写项目根目录综合介绍文档 `README.md`，使用相对路径引用 `docs/img/` 下的所有功能截图，涵盖：

- `board.webp`：board 弹窗快捷控制小面板；
- `index.png`：代理资料页（代理档案管理、内外分流、RTT 测速与快捷直切）；
- `rules-edit.png`：域名守护规则配置与编辑；
- `L1.png`、`L2.png`、`L3.png`、`L4.png`：一二三四级流量校验策略体系（时间画像、宽松效率、抽样检测、极限锁死与 Ultra 流光星晶粒子动效）；
- `habits.png`：访问习惯统计建议与智能绑定页；
- `notes.png`：域名安全备忘录页面；
  并辅以详尽系统的功能亮点、架构流程图与开发构建指南。

#### 2. 技术设计与详细实现

1. **结构化项目全景说明 (`README.md`)**：
   - 包含版本号（v3.5.1）、Manifest V3、Chrome 116+ 徽章与核心特性总结；
   - 梳理 7 大图文全景章节，采用居中图片卡片形式与详细说明；
   - 包含 Fail-Closed 安全拦截模型 Mermaid 流程图与核心原理剖析；
   - 整理完备的从源码安装、开发命令与打包指南。
2. **规范图片相对路径引用**：
   - 全量采用 `docs/img/<filename>` 标准相对路径引用，确保 GitHub / 本地离线预览均能正常渲染。

#### 3. 修改的文件清单

- **`README.md`**：全新编写项目综合图文介绍文档；
- **`Agents_Edit.md`**：记录本次文档建设与归档。

---

### [2026-09-22] 项目正式更名为 Proxy Switch Protect（全端展示与文档统一更名）

#### 1. 需求说明

根据用户（彩彩）需求：
项目正式更名为 **Proxy Switch Protect**，同步更新 `README.md` 中的所有名称及全项目前端界面的全部展示名称、窗口标题与扩展配置。

#### 2. 技术设计与详细实现

1. **前端页面展示名称更新**：
   - **Popup 弹窗 (`src/pages/popup/App.tsx` & `popup.css`)**：
     - 头部品牌标题更新为 `Proxy Switch Protect`，优化 `.popup-title` 样式（`white-space: nowrap; font-size: 14.5px;`），保障在 460px 宽度下与右侧三态徽章胶囊紧凑并列无折行；
     - 浏览器图钉固定引导卡片提示文案更新为“建议将 **Proxy Switch Protect** 固定到工具栏”；
   - **控制中心 (`src/pages/options/App.tsx`)**：
     - 头部大标题更新为 `Proxy Switch Protect 控制中心`；
     - 页脚版权与标准声明更新为 `Proxy Switch Protect · 守护您的海外敏感账号与代理网络安全 · Manifest V3 Standard`；
   - **阻断提示页 (`src/pages/blocked/App.tsx`)**：
     - 阻断主标题更新为 `访问请求已被 Proxy Switch Protect 安全阻断`；
2. **HTML 页面 Title 与扩展清单更新**：
   - `popup.html`：更新网页标题为 `<title>Proxy Switch Protect</title>`；
   - `options.html`：更新网页标题为 `<title>Proxy Switch Protect 控制中心</title>`；
   - `blocked.html`：更新网页标题为 `<title>访问已被 Proxy Switch Protect 拦截</title>`；
   - `public/manifest.json`：更新扩展名称为 `Proxy Switch Protect - 代理切换与域名守护`，`default_title` 为 `Proxy Switch Protect`；
3. **后台通知与包配置更新**：
   - `src/background/guard-engine.ts`：更新锁定系统通知标题为 `Proxy Switch Protect 已锁定站点`；
   - `src/background/habit-learner.ts`：更新建议系统通知标题为 `Proxy Switch Protect 绑定建议`；
   - `src/pages/options/tabs/SettingsTab.tsx`：导出配置备份默认文件名更新为 `proxy-switch-protect-backup-${stamp}.json`；
   - `package.json` & `package-lock.json`：更新包名称为 `proxy-switch-protect`；
   - `docs/使用说明.md` & `docs/隐私政策.md`：标题同步更名为 `Proxy Switch Protect`；
4. **README.md 全量更名同步**：
   - 主标题、四级策略介绍、习惯统计说明、源码克隆与安装指引等所有位置全量同步更名为 `Proxy Switch Protect`。

#### 3. 修改的文件清单

- **`src/pages/popup/App.tsx`** & **`src/pages/popup/popup.css`**：更新弹窗标题及引导文案，防挤压排版优化；
- **`src/pages/options/App.tsx`**：更新控制中心标题与页脚说明；
- **`src/pages/blocked/App.tsx`**：更新安全阻断主标题文案；
- **`popup.html`**、**`options.html`**、**`blocked.html`**：更新各入口页面 HTML 标题；
- **`public/manifest.json`**：更新扩展名称与 action title；
- **`src/background/guard-engine.ts`** & **`src/background/habit-learner.ts`**：更新系统推送通知标题；
- **`src/pages/options/tabs/SettingsTab.tsx`**：更新导出备份默认前缀；
- **`package.json`** & **`package-lock.json`**：更新工程名称为 `proxy-switch-protect`；
- **`docs/使用说明.md`** & **`docs/隐私政策.md`**：文档标题同步更新；
- **`README.md`**：全量更名与仓库命令更新；
- **`Agents_Edit.md`**：记录本次正式更名全景。

#### 4. 验证与构建测试记录

- **静态类型检查 (TypeScript)**：执行 `tsc --noEmit`，**0 错误、0 警告**；
- **单元测试集 (Vitest)**：执行 `npm test`，全套 6 个测试套件、49 项测试 **100% 全部通过**；
- **生产环境打包 (Vite)**：执行 `npm run build`，耗时 1.00s 顺利完成无损打包输出至 `dist/`，确认 `dist/manifest.json` 与各打包 html 标题均同步为 `Proxy Switch Protect`。

---

### [2026-09-22] 修复拦截页放行延迟倒计时失效 Bug 与设置表单数字输入校验重构（支持删除重填、失焦校验标红、顶部 3 秒保存成功 Toast）

#### 1. 需求背景与问题根因

用户（彩彩）反馈指正：

1. **安全检测通过后自动返回原网站延迟（秒）设置后没有变化（固定 1 秒立即跳走）**：
   - **根本成因排查**：在 `src/pages/blocked/App.tsx` 中，首屏核验 `verifyAndAllowTab` 返回 `res.pass === true` 时，直接硬编码执行了 `location.replace(from)`，直接绕过了 `countdown` 倒计时逻辑；导致哪怕用户在设置中将延迟改为 5 秒或 10 秒，拦截页也会在开屏核验成功的瞬间（~1 秒）闪退跳转，用户设定的倒计时完全没有机会触发。
2. **设置表单中的数值无法彻底删除干净再重新输入**：
   - **根本成因排查**：原有数字输入框直接受控绑定 `onChange` 并通过 `Number(inputValue(e)) || fallback` 强制兜底，用户在输入框按退格键清空为 `""` 的瞬间，立即被 `|| fallback` 重置恢复为默认数值，导致用户无法清空重填。
3. **交互规范重构**：
   - 允许用户自由删除清空；
   - 在失焦（`onBlur`）或按 Enter 键时执行判定：数值合法则提交保存，数值异常（为空、非数字、超出 min/max 范围）则标红输入框并在下方展示具体的红色错误说明；
   - 正常保存设置时，在页面顶部弹出精美的 3 秒“配置保存成功”消息框（Toast），自动淡出消失。

#### 2. 技术设计与详细实现

1. **拦截页放行倒计时逻辑彻底修复 (`src/pages/blocked/App.tsx`)**：
   - 移除开屏通过后的硬跳转 `location.replace(from)`；
   - 在开屏核验放行及后台状态恢复（自愈切换/重新检测/临时放行）时，均通过 `await loadSettings()` 实时读取存储中最新的 `passRedirectDelaySec`（默认 3 秒）；
   - 触发 `setCountdown(delay)` 与 `setRedirecting(true)`，平滑激活倒计时效果，顶部主标题动态展示“安全校验通过，N 秒后自动返回…”，配合“立即进入”按钮，倒计时归零时平滑返回原网站；彻底解决参数被绕过的问题。
2. **封装通用受控校验输入组件 `ValidatedNumberInput` (`src/pages/options/tabs/SettingsTab.tsx`)**：
   - 内部维护独立 `draft` 草稿字符串状态，允许用户任意清空、退格删除；
   - 监听 `onBlur` 与 `onKeyDown(Enter)` 触发 `validateAndSave()`：
     - 若为空：提示“数值不能为空，请输入 min ~ max 之间的有效数字”；
     - 若为非有效数字：提示“请输入合规的有效数字”；
     - 若超出范围：提示“数值超出范围，请输入 min ~ max 之间的数字”；
     - 若校验不通过，输入框添加 `.input-error` 类名标红并显示错误提示行；
     - 若校验通过，更新草稿并触发保存与成功提示。
   - 全面替换全局设置面板中全部 9 处数字配置项：单源检测超时时间、安全检测通过后返回原网站延迟、自定义复检分钟数、严格模式宽容放行数、严格模式复检间隔、时间画像免检窗口、滑动窗口天数、最少访问天数、主导国家占比。
3. **全局 3 秒保存成功 Toast 消息框 (`SettingsTab.tsx` & `options.css`)**：
   - 在 `SettingsTab.tsx` 中使用 `useRef` + `setTimeout` 封装防抖 `triggerToast(msg)`，确保每次保存均稳定展示 3 秒；
   - 在 `options.css` 中设计现代化顶端悬浮胶囊 `.settings-toast-banner`（居中吸顶、玻璃拟态模糊滤镜、翡翠绿辉光高光、弹入动画），视觉效果极佳。
4. **全局表单错误态样式增强 (`src/styles/base.css`)**：
   - 增加 `.input-error` 规则：强制赋予危险红边框与高发光光晕（`border-color: var(--danger) !important; box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.25) !important;`）。

#### 3. 修改的文件清单

- **`src/pages/blocked/App.tsx`**：修复放行延迟绕过问题，统一通过倒计时与实时配置跳转；
- **`src/styles/base.css`**：补充 `.input-error` 表单报错红框与光晕；
- **`src/pages/options/options.css`**：新增 `.settings-toast-banner` 顶部 3 秒悬浮消息框样式；
- **`src/pages/options/tabs/SettingsTab.tsx`**：实现 `ValidatedNumberInput`，重构全部 9 项数字表单校验与失焦保存，集成顶部 3 秒 Toast 消息框；
- **`Agents_Edit.md`**：记录本次 Bug 修复与交互升级细节。

#### 4. 验证与构建测试记录

- **静态类型检查 (TypeScript)**：执行 `tsc --noEmit`，**0 错误、0 警告**；
- **单元测试集 (Vitest)**：执行 `npm test`，全套 6 个测试套件、49 项测试 **100% 全部通过**；
- **生产环境打包 (Vite)**：执行 `npm run build`，耗时 588ms 顺利完成无损打包输出至 `dist/`。

---

### [2026-09-22] 域名安全守护规则流量判定策略等级滑块重构与继承全局开关联动

#### 1. 需求背景与功能目标

用户（彩彩）反馈要求：

1. **域名安全守护规则校验策略优化成滑块**：在「域名安全守护规则」新建/编辑表单中，将原本传统的单选框（Radio Buttons）重构为现代化的 4 档极光滑块（支持 1~4 档平滑滑动与点击刻度点直达）。
2. **每条规则的“继承全局策略”做成独立开关**：
   - 当开关处于**开启（继承全局）**状态时：规则策略完全跟随全局设置，滑块呈现置灰锁定态，手柄与填充条自动对齐全局当前的策略等级，并清晰提示跟随全局的等级名称与解读，禁止拖拽修改。
   - 只有当用户将该开关**关闭（独立定制）**之后，才能启用滑块，支持为该特定域名单独自由滑动定制第 1~4 档策略等级。

#### 2. 技术设计与详细实现

1. **封装高复用滑块组件 `PolicyLevelSlider` (`src/pages/options/components/PolicyLevelSlider.tsx`)**：
   - 抽象出标准 Props：`value`（当前策略 ID）、`onChange`（档位切换回调）、`disabled`（锁定置灰态）、`disabledHint`（禁用提示文案）、`showDetails`（是否展示策略详情卡片）。
   - 保持与设置页完全一致的视觉体验：
     - 等级专属微光徽章（L1~L4）；
     - 4 档极光渐变滑动槽轨道、4 刻度小点悬浮放大动效、L4 极速向左流动星晶流光粒子、白色高光圆球手柄；
     - 策略解读卡片中动态渲染安全防护（1~5 刻度）与直通速度（1~5 刻度）双维计分条；
     - 支持 `disabled` 状态：给轨道、手柄、原生 input、刻度按钮施加统一置灰锁定与 `not-allowed` 交互样式。
2. **重构守护规则表单与开关联动逻辑 (`src/pages/options/tabs/SitesTab.tsx`)**：
   - 在 `SiteForm` 中添加 `inheritGlobal` 布尔状态（初始值：`initial?.validationLevel == null || initial.validationLevel === 'default'`）；
   - 添加 `customLevel` 状态（初始值：若有明确自定义则保留，否则预填当前全局设置等级 `globalLevel`）；
   - 在表单界面中，设计了独立的顶部切换头：左侧标题与辅助说明，右侧配置「继承全局」Switch 开关；
   - 开关开启时：显示“继承全局策略”，滑块置灰锁定并展示全局当前的策略级别；
   - 开关关闭时：显示“单独定制策略”，滑块完全激活，支持用户在 1~4 档间流畅滑动并切换；
   - 提交保存（`submit`）时：若 `inheritGlobal === true`，保存 `validationLevel: undefined`（完全恢复为全局继承）；若为 `false`，保存用户自定义的 `customLevel`。
3. **规则列表徽章展示统一升级 (`SitesTab.tsx`)**：
   - 列表项中的策略 Tag 引入 `getPolicyMeta()`，统一渲染标准标签等级与颜色（如 `L1 时间画像`、`L2 宽松效率`、`L3 抽样检测`、`L4 严格拦截`），继承全局时显示 `跟随全局: L2 宽松效率`，鼠标悬浮显示完整策略名称。
4. **内嵌样式与禁用态增强 (`src/pages/options/options.css`)**：
   - 补充 `.policy-slider-card-disabled` 降低亮度、淡灰边框样式；
   - 补充 `.site-form-card .policy-slider-card` 内嵌内边距与边框圆角，使其完美融合进规则编辑弹窗表单中；
   - 补充 `.policy-mini-slider.slider-disabled` 置灰滤镜与事件穿透屏蔽。

#### 3. 修改的文件清单

- **`src/pages/options/components/PolicyLevelSlider.tsx`** [NEW]：封装极光 4 档微型滑块通用组件，支持状态禁用、双维评分条及动效；
- **`src/pages/options/tabs/SitesTab.tsx`** [MODIFY]：在 `SiteForm` 中实现继承全局 Switch 开关与策略滑块联动，升级规则列表策略徽章；
- **`src/pages/options/options.css`** [MODIFY]：新增规则表单内嵌滑块卡片样式与置灰锁定态样式；
- **`Agents_Edit.md`** [MODIFY]：详细记录本次需求背景、组件封装、表单联动与测试情况。

#### 4. 验证与构建测试记录

- **静态类型检查 (TypeScript)**：执行 `tsc --noEmit`，**0 错误、0 警告**；
- **单元测试集 (Vitest)**：执行 `npm test`，全套 6 个测试套件、49 项测试 **100% 全部通过**；
- **生产环境打包 (Vite)**：执行 `npm run build`，耗时 496ms 顺利完成无损打包输出至 `dist/`。

---

### [2026-09-22] 安全拦截/放行页（Blocked）100 分及安全放行状态底色红转绿修复

#### 1. 需求背景与排查

用户（彩彩）反馈指正：

- **现象**：当安全检测通过、评分达到满分 100 分（安全合规·准予通行，或自动返回倒计时阶段）时，页面上方的盾牌圆形徽章底色、大背景光晕仍然呈现为红色（淡粉红色）。
- **根本成因排查**：
  1. 在 `src/pages/blocked/blocked.css` 中，`.blocked-shield-badge`（顶部大盾牌徽标）的背景色写死为 `var(--danger-surface)`（淡粉红色），边框与光晕也写死为 `var(--danger-glow)`，缺少安全通过时的专属类样式；
  2. 外层页面布局容器 `.blocked-layout` 的顶部径向光晕渐变固定为 `var(--danger-glow)`（红色光晕），并未在检测通过/100分时动态切换；
  3. `100/100` 分数徽标 `.risk-score-badge` 在 100 分时仅文字变绿，背景仍为普通浅色底，未凸显晶莹通关质感。

#### 2. 技术设计与详细实现

1. **统一安全通过/放行判定逻辑 (`src/pages/blocked/App.tsx`)**：
   - 提取全局放行/通过判定：`const isPassed = redirecting || risk?.level === 'safe' || risk?.score === 100;`；
   - 为页面外层容器挂载 `.blocked-layout.blocked-layout-success`；
   - 为卡片挂载 `.blocked-card-success`；
   - 为顶部盾牌徽标挂载 `.blocked-shield-badge.blocked-shield-badge-success`。
2. **重塑安全通过放行样式体系 (`src/pages/blocked/blocked.css`)**：
   - **大背景顶部光晕**：`.blocked-layout.blocked-layout-success` 背景顶部径向渐变切换为清透柔和的翡翠绿安全光晕（`rgba(16, 185, 129, 0.18)`），平滑过渡；
   - **顶部盾牌徽标底色**：`.blocked-shield-badge-success` 背景由浅粉红彻底改为清爽健康的安全绿底色（`var(--ok-surface)`），边框转为 `var(--ok-glow)`，并赋予 `rgba(16, 185, 129, 0.28)` 绿色光晕外发光；
   - **卡片边框与阴影**：`.blocked-card-success` 采用翡翠绿半透明边框与安全绿阴影扩散；
   - **100/100 评分徽标**：`.risk-safe .risk-score-badge` 赋予淡绿色晶莹背景（`rgba(16, 185, 129, 0.12)`）与绿色边框，彻底告别红底违和感。

#### 3. 修改的文件清单

- **`src/pages/blocked/blocked.css`** [MODIFY]：新增放行状态绿色背景光晕、绿色盾牌徽标底色及 100 分徽标绿色底色；
- **`src/pages/blocked/App.tsx`** [MODIFY]：统一引入 `isPassed`，在 100 分与放行倒计时状态下全面激活绿色安全态类名；
- **`Agents_Edit.md`** [MODIFY]：详细记录本次底色红转绿修复全过程。

#### 4. 验证与构建测试记录

- **静态类型检查 (TypeScript)**：执行 `tsc --noEmit`，**0 错误、0 警告**；
- **单元测试集 (Vitest)**：执行 `npm test`，全套 6 个测试套件、49 项测试 **100% 全部通过**；
- **生产环境打包 (Vite)**：执行 `npm run build`，顺利完成打包输出。

---

### [2026-09-22] 补充构建脚本 (npm run build) 自动导出 proxy-switch-protect-x.x.x 压缩包

#### 1. 需求背景与目标

用户（彩彩）反馈要求：

- 补充 `npm run build` 打包脚本，在完成代码编译后，自动导出命名为 `proxy-switch-protect-x.x.x.zip` 的压缩包（其中 `x.x.x` 为 `package.json` 中的当前版本号）；
- 压缩包统一输出到 `dist/zip/` 目录下；
- 压缩包解压后为完整的 Chromium 浏览器扩展根目录（包含 `manifest.json`、`background.js`、`options.html`、`popup.html`、`blocked.html`、`assets/`、`icons/` 等），即开即用。

#### 2. 技术设计与详细实现

1. **实现零依赖标准 ZIP 格式打包器 (`tools/pack-zip.mjs`)**：
   - 使用 Node.js 原生标准库（`node:fs`、`node:path`、`node:zlib`），完全不引入冗余第三方依赖包；
   - 自动解析 `package.json` 中的 `version` 字段，动态生成产物名 `proxy-switch-protect-${version}.zip`；
   - 遍历 `dist/` 目录下的所有文件：
     - 严格排除输出目录 `dist/zip` 及其自身，防止递归打包嵌套；
     - 忽略 `.DS_Store`、`Thumbs.db` 等系统临时文件；
     - 文件路径统一格式化为标准 POSIX 正斜杠（`/`）；
     - 使用 `zlib.crc32()` 校验数据并使用 `zlib.deflateRawSync()` 高阶压缩（level 9）；
     - 正确注入 DOS 日期时间戳；
     - 遵循 PKZIP 2.0 规范，输出合规的 Local File Header、Central Directory Header 与 End of Central Directory Record。
   - 打印清晰美观的打包统计信息（包含文件总数、原总体积、压缩包体积、压缩比及输出相对路径）。
2. **工程构建流联动 (`package.json`)**：
   - 将 `build` 脚本扩展为：`"npm run typecheck && vite build && node tools/pack-zip.mjs"`；
   - 新增独立打包指令：`"pack": "node tools/pack-zip.mjs"`，方便开发者无需全量重新编译时单独重新打包 ZIP；
   - 确保 `emptyOutDir: true` 正常清理与构建输出无缝衔接。

#### 3. 修改的文件清单

- **`tools/pack-zip.mjs`** [NEW]：零依赖标准 ZIP 打包脚本，支持自动版本提取与 `dist/zip/` 输出；
- **`package.json`** [MODIFY]：在 `scripts` 中串联打包脚本，增加 `build` 自动导出与 `pack` 独立打包命令；
- **`Agents_Edit.md`** [MODIFY]：详细记录本次构建增强与 ZIP 打包技术细节。

#### 4. 验证与构建测试记录

- **静态类型检查 (TypeScript)**：执行 `tsc --noEmit`，**0 错误、0 警告**；
- **单元测试集 (Vitest)**：执行 `npm test`，49 项测试 **100% 全部通过**；
- **构建并导出 ZIP**：执行 `npm run build`，成功完成前端 MPA 编译并在 `dist/zip/` 生成 `proxy-switch-protect-3.5.1.zip`（28 个文件，原始 518.6 KB，压缩至 214.6 KB，体积缩减 58.6%）；
- **ZIP 解压结构验证**：使用 `tar -tf dist/zip/proxy-switch-protect-3.5.1.zip` 验证包内层级，`manifest.json` 与各入口 HTML 均在根目录，无多余冗余路径，解压即可直接导入 Chrome/Edge 浏览器。

---

### [2026-09-22] 根目录下补充开源许可证 (LICENSE - MIT)

#### 1. 需求背景与目标

用户（彩彩）反馈要求：

- 在项目根目录下补充开源协议文件 `LICENSE`，协议内容采用标准 MIT 许可证；
- 与 `README.md` 中已声明的“本项目基于 MIT License 协议开源”保持对应与合规。

#### 2. 技术设计与详细实现

1. **创建根目录 `LICENSE` 文件**：
   - 写入国际通用的标准 MIT License 条款正文；
   - 声明版权归属：`Copyright (c) 2026 Xiao-Cai185`；
   - 赋予使用者不受限制地使用、修改、合并、发布、分发及销售副本的合法权利。
2. **规范化 `package.json` 元数据**：
   - 补充 `"license": "MIT"` 声明字段。

#### 3. 修改的文件清单

- **`LICENSE`** [NEW]：标准 MIT License 许可证文本；
- **`package.json`** [MODIFY]：新增 `"license": "MIT"` 属性；
- **`Agents_Edit.md`** [MODIFY]：记录开源许可证补充细节。

#### 4. 验证与构建测试记录

- **静态类型检查 (TypeScript)**：执行 `tsc --noEmit`，**0 错误、0 警告**；
- **生产构建与测试**：执行 `npm run build`，编译与自动打包正常完成。

---

### [2026-09-22] 版本号迭代至 v3.5.2 及 README 补充 Releases 快速安装与 ZIP 分发指引

#### 1. 需求背景与目标

用户（彩彩）反馈要求：

- 执行项目版本号迭代更新；
- 在 [README.md](file:///d:/Project2.0/Proxy-Protect/README.md) 中添加 GitHub [Releases](https://github.com/Xiao-Cai185/Proxy-Switch-Protect/releases) 超链接及详细的 ZIP 压缩包免环境安装方式，方便普通用户下载即用；
- 完善开发者本地构建方式与命令清单。

#### 2. 技术设计与详细实现

1. **全项目版本号自增至 v3.5.2**：
   - `package.json`：`version` 升级至 `3.5.2`；
   - `package-lock.json`：顶层与根节点 `version` 升级至 `3.5.2`；
   - `public/manifest.json`：Chromium 扩展版本号升级至 `3.5.2`；
   - `README.md`：顶部版本徽章升级为 `v3.5.2`。
2. **README.md 安装与使用全景重塑**：
   - **方式一（推荐：下载发布包安装）**：
     - 提供直接前往 GitHub [Releases](https://github.com/Xiao-Cai185/Proxy-Switch-Protect/releases) 页面下载 `proxy-switch-protect-x.x.x.zip` 的入口超链接；
     - 详细梳理 6 步直观安装教程（解压 -> 访问 `chrome://extensions/` 或 `edge://extensions/` -> 开启开发者模式 -> 加载已解压扩展程序 -> 固定至工具栏）；
   - **方式二（源码本地构建安装）**：
     - 更新为真实的开源仓库克隆路径 `https://github.com/Xiao-Cai185/Proxy-Switch-Protect.git`；
     - 明确指出 `npm run build` 会在 `dist/zip/` 目录下自动生成对应的发布压缩包；
   - **脚本命令清单**：
     - 补充 `npm run build` 与 `npm run pack` 的打包说明。
3. **自动化打包产物同步**：
   - 执行 `npm run build`，基于 v3.5.2 成功构建并在 `dist/zip/` 目录导出 `proxy-switch-protect-3.5.2.zip`。

#### 3. 修改的文件清单

- **`package.json`** [MODIFY]：版本号提升至 `3.5.2`；
- **`package-lock.json`** [MODIFY]：版本号提升至 `3.5.2`；
- **`public/manifest.json`** [MODIFY]：扩展清单版本号提升至 `3.5.2`；
- **`README.md`** [MODIFY]：版本徽章更新，新增 Releases 链接与图文安装指南；
- **`Agents_Edit.md`** [MODIFY]：记录版本迭代与文档更新细节。

#### 4. 验证与构建测试记录

- **静态类型检查 (TypeScript)**：执行 `tsc --noEmit`，**0 错误、0 警告**；
- **单元测试集 (Vitest)**：执行 `npm test`，49 项测试 **100% 全部通过**；
- **构建与打包**：执行 `npm run build`，成功编译输出并在 `dist/zip/` 生成 `proxy-switch-protect-3.5.2.zip`。
