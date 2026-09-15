# 现成做法

这份文件是**实例库**：`work-guidelines.md` 讲原则，这里给具体做法。
素材来自一个真实项目的重构——原生 JS 版本被一位资深工程师用 52 次提交重写为
规范化工程（139 个文件，+21499/-3394 行）。下面每条都是他实际落地的配置与做法，
**照抄是安全的**。

## 一、检查体系怎么搭

**三层 git 钩子，按耗时分工**（关键：每次提交跑的必须快）：

| 钩子 | 时机 | 耗时 | 跑什么 |
| --- | --- | --- | --- |
| `pre-commit` | 每次提交 | ~5s | 密钥 → 换行/编码/BOM → 语法 → ASCII → 标识符 → 内联提示词 → ESLint → 类型 + 单测（并行）→ Prettier |
| `pre-push` | 每次推送 | ~12s | 覆盖率门禁 → 构建 → 端到端 |
| `commit-msg` | 每次提交 | <1s | 约定式提交前缀 |

**一个命令串起来**（谁来都用这一条）：

```jsonc
"scripts": {
  "check":  "npm run typecheck && npm run lint && npm run format:check && npm test",
  "verify": "npm run check && npm run test:coverage && npm run e2e"
}
```

**跳过要留痕**：`SKIP_DISCIPLINE=1 git commit ...`，且**必须在提交信息里说明理由**。

**这些检查他自己写脚本实现**，各管一件事，都放在 `.githooks/checks/`：
密钥 `secrets.mjs`、语法 `syntax.mjs`、ASCII `ascii.mjs`、标识符 `identifiers.mjs`、
提示词 `prompts.mjs`。

**会改文件的检查必须放最后**：格式化若排在前面并 `exit(1)`，**前面收集到的真正原因
（例如密钥）永远打不出来**，只会看到"已格式化"。规则是：发现问题立刻报告并退出。

## 二、提交信息与版本

约定式提交，**这不是洁癖**——CHANGELOG 与语义化版本号都依赖它：

```
feat(card): 新游戏的第一帧由卡的开局决定（阶段 6a）
refactor(card): 卡格式 card/2 —— 顶层按「谁读」分三块，顺序只声明一次
chore(ci): 重型检查搬去 CI，本地钩子只留秒级门禁（阶段 8）
fix(e2e): 组件故事的「深色」截图其实全是浅色
```

`commitlint.config.js` 的做法（中文项目要改这几条）：

```js
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'subject-case': [0],              // 标题用中文，英文的 subject-case 规则不适用
    'subject-full-stop': [2, 'never', '.'],
    'header-max-length': [2, 'always', 100],
    'body-max-line-length': [0],      // 中文的行长限制无意义
  },
}
```

注意提交信息里带**阶段编号**（`阶段 6a`、`阶段 8`）——大改分阶段时，
一眼就能看出这次提交属于哪一步、还剩几步。

## 三、代码规范怎么定

**ESLint 抓真 bug，Prettier 管排版，两者不越界。** 配置开头就写清定位：

> 只开「错了就是错了」的规则，不写「我更喜欢哪种写法」的规则。

**开类型感知 linting**（`projectService`），因为这几条"真 bug"规则需要类型信息：

```js
'@typescript-eslint/no-floating-promises': 'error',   // 忘了 await 的 Promise
'@typescript-eslint/no-misused-promises': 'error',    // 把 Promise 当同步用
'@typescript-eslint/no-explicit-any': 'error',        // 真正的 any 要出声
'preserve-caught-error': 'error',                     // 重抛要带 cause，否则丢上下文
```

**豁免要写理由**，例如关掉全角空格检查：

```js
// ⚠️ 关掉 no-irregular-whitespace：中文排版里全角空格 U+3000 是故意的缩进
//    （例如叙事文本的首行缩进），不是脏字符。
'no-irregular-whitespace': 'off',
```

风格类规则一律交给格式化器：`vue/attributes-order`、`vue/max-attributes-per-line`
这些都关掉，**不在 lint 里吵架**。

## 四、注释规范（写成了自定义 lint 规则）

**代码/变量/函数名全英文；注释全中文，只描述现在。**

```ts
/** 把毫秒差说成人话（1 年按 365 天折算） */
export function describeElapsed(ms: number): string {
```

- 函数上方一行说清**做什么**（不是怎么做）。
- `.vue` 的文件头注释写在 `<script setup>` **里面**，别写外面（看起来像 HTML 注释）。
- 行内注释只加在"代码看不出为什么"的地方：
  ```ts
  // ⚠️ 必须用 Object.hasOwn：写成 TOOLS[name] 时 constructor 会从原型链上取到真值
  ```

**禁止历史对比**——"原来的实现 / 旧版是 / 曾经 / 相比以前"。这种句子只对当时在场的
人有意义，过两轮重构就没人知道"原来"指哪一版。要说明约束，就写约束本身：

| 别写 | 写 |
| --- | --- |
| 原来用 innerHTML，现在改成模板插值，少了 XSS 隐患 | 全部走模板插值，由 Vue 自动转义，没有 innerHTML 拼接 |
| 之前这里忘了 triggerRef，界面不更新 | 整体替换也走容器属性：漏一处手动触发就是「界面不更新」这种查不出来的 bug |

**他为此写了自定义 ESLint 插件**（`tools/eslint-plugin-comment-style.js`），强制三件事：
具名函数必须有紧贴上方的注释、注释里不许有历史对比句式、`.vue` 文件头必须在
`<script setup>` 里。豁免也要有理由：一行写完的箭头函数、函数体 ≤3 行的小函数、
测试文件里的行内回调。

## 五、测试怎么分层

**五层，各测各的，别串层**：

| 层 | 位置 | 环境 | 测什么 |
| --- | --- | --- | --- |
| 单元 | `tests/*.test.ts` | node | 纯逻辑与边界 |
| 组件 | `tests/components.test.ts` | jsdom | 渲染契约、点击后 emit 什么（**不测样式**） |
| 组件故事 | `*.stories.ts` + `e2e/stories.spec.ts` | Storybook + Playwright | 每个 props 状态在真浏览器里的渲染 |
| 功能冒烟 | `e2e/smoke.spec.ts` | Playwright | 用户点得出来的路径 |
| 视觉矩阵 | `e2e/visual.spec.ts` | Playwright | 状态 × 屏幕 + 少量像素基线 |

**覆盖率门禁**（写在 `vitest.config.ts`，低于即失败）：

```
statements 99 / branches 94 / functions 100 / lines 99
```

数值是**实测后留余量**定的（实测 99.78 / 96.68 / 100 / 99.75），
作用是"新增功能不写测试就过不去"。

**"新增功能必须新增测试"是被钩子强制的**：`pre-commit` 检查**每个源码模块都要在
`tests/` 里被提到**，提不到就拒绝提交。

**测试里的网络一律假响应**，绝不发真实请求。Playwright 用 `page.route` 拦
`**/chat/completions`，而不是注入脚本改 `window.fetch`——注入那条路踩过
"注册顺序错了就静默不生效"，而且没法按用例控制延迟和错误码。

**选元素用稳定钩子**（`data-settings` / `data-language`），不要按文案找：
文案随语言变，按文字找元素等于把测试钉死在一种语言上。

**夹具在第二个文件里重复出现时**才提取。过早合并会让测试读不懂。

## 六、真浏览器验证（这条最容易被跳过）

**HTTP 200 只说明文件送到了，不说明页面能跑。** 要在真浏览器里读运行时 DOM。

用 CDP，**不需要 puppeteer**——Node 自带 WebSocket 就够：

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --user-data-dir=/tmp/cdp-x \
  --remote-debugging-port=9333 about:blank
```

然后 `fetch('http://127.0.0.1:9333/json/list')` 拿端点，连上后
`Page.navigate` → `Runtime.evaluate` 读 DOM。

**断言要落在运行时状态上**：组件是否挂载、交互后的 DOM、以及
**`Runtime.exceptionThrown` 与 4xx/5xx 必须为零**。

三个会让你误判"页面是坏的"的坑：

| 现象 | 真实原因 |
| --- | --- |
| 读到的内容跟源文件一样，像没渲染 | 连到了启动时的 `about:blank` 标签页，必须显式 `Page.navigate` |
| 页面是 `chrome-error://chromewebdata/` | 导航失败，**先 curl 确认地址可达** |
| 脚本里 `import` 先于其他语句执行 | `import` 会被**静态提升** |

> ⚠️ 如果要做的不只是"读一下页面"，而是要**驱动浏览器做交互**——
> 那就别手写 CDP 了，直接上 Playwright。手写协议实现在复杂交互上会非常脆。
> （这条有真实翻车：为了驱动浏览器自己写了 CDP 客户端，花很久且很脆；
> Playwright 是 `chromium.launch()` 一行的事。）

## 七、多平台协作的三条铁律

| 位置 | 要求 | 为什么 |
| --- | --- | --- |
| 仓库（索引） | 一律 **LF** | clone 到任何平台都一致 |
| 工作区：普通文本 | **LF** | Windows 编辑器默认写 CRLF，要拦 |
| 工作区：`.bat` / `.cmd` | **CRLF** | cmd.exe 用 LF 可能执行出错 |
| 所有文本 | 无 **BOM**、UTF-8 | BOM 多出三个字节；GBK 导致乱码 |

由 `.gitattributes` 声明、`pre-commit` 强制。**大小写**：macOS 不敏感、Linux 敏感，
引资源时大小写必须与磁盘一致，否则本地过、线上 404。

## 八、环境事实要写下来

把"这台机器/这个项目的既成事实"单独成文，**带日期和实测结论**：

- 版本上限由**下游工具**决定，不能只看上游的 latest。实例：TypeScript 只能停在 6.x，
  因为 `vue-tsc` 还在 require TS 7 已不再导出的内部路径 —— 三个版本都真跑过才敢下结论。
- 平台特有的坑要写明：Vite 8 默认只绑 IPv6（`curl 127.0.0.1` 返回 000，看起来像服务没起）；
  部署在子目录时**开发地址也带 base 前缀**。
- **过时的文档要明确标注**："上游文档里遗留的 Windows 路径已过时，本机是 macOS，
  不要再照那套排查。" —— 留着不管比删掉更坏。

## 九、文档结构

```
AGENTS.md              # 26 行：只有行为规则 + 快速入口，指向下面这些
doc/DESIGN.md          # 设计决策，编号（「决定 #22」），可被引用
doc/DESIGN-CARD.md     # 某个子系统的设计
doc/CHANGELOG.md       # 由约定式提交驱动
.agents/skills/*.md    # 各领域的操作手册：环境/检查/测试/UI 测试/调试/发布/注释
tools/                 # 自定义 lint 插件等自研工具
```

**入口文件要短**。`AGENTS.md` 只放"必须立刻知道"的，细节指向 skill——
一上来塞几千行，读的人（和 agent）会直接跳过。

## 十、每条规则都带"怎么被强制的"

这是最值得学的一点：他写文档时**顺手写清这条规则由哪个检查兜底**。

> 「新增功能必须新增测试」→ `pre-commit` 检查每个 `src` 模块在 `tests/` 里被提到
> 「注释不写历史对比」→ `tavern/comment-style` 规则
> 「提交信息规范」→ `commit-msg` 钩子

**写不出"怎么被强制"的规则，就是建议，不是纪律。** 要么给它加个检查，要么承认它只是偏好。
