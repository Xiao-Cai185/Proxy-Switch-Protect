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
     - 优化表单输入提示：“生效范围：*.xxx（支持泛域名，自动包含全部多级子域）”。
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













