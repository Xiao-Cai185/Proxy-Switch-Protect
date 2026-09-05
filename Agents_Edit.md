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



