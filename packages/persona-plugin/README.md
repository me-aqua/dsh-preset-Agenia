# @agenia/persona-plugin

`agenia` 这份 agent preset 的**每轮注入器**。它在每个模型请求前读一组 markdown，
把它们作为 prompt **context** 追加到请求末尾 —— 所以改**其中一份 markdown** 的一个字，
正在跑的会话**下一个步骤**就变：不用重启，不用新开会话。
（`inject.js` 自己是代码，不适用这条 —— 见下面「改代码之后」。）

- **两拨受众，靠标记分。** 每条组员行的 `persona` 以 `【组员:<role>】` 开头，
  标记躺在装配自己的段里；扫到标记就注入他那一份说明书，扫不到就当组长。
  **组长**：`persona · leader · process · world · work · practices · 名册 [· 状态板]`；
  **组员**：`world · process · work · practices · 自己那份说明书`。
- **顺带是写权限门禁与流程账本。** `product` / `review` / `retro` 三个角色只能写项目里
  `.team/` 下的东西、且没有 shell；组长每轮看到一行流程状态。
- **12 份内容**（`persona.md` · `leader.md` · `process.md` · `work-guidelines.md` ·
  `codebase-practices.md` · `team/world.md` · `team/{product,dev,test,review,retro,hire}.md`）
  在 `content/` 里各放一份，那是**默认**内容根。

## 装它

**官方路径是 `dsh plugin`**（2026-09-20 在本机真跑过，退出 0）：

```bash
npm pack                                                    # 产出 agenia-persona-plugin-<版本>.tgz
dsh plugin --profile <profile> add <那个 .tgz 的路径>        # 例：dsh plugin --profile web add agenia-persona-plugin-1.0.0.tgz
```

它会把这个包**登记进 profile 的 `package.json` 依赖**，再交给 pnpm 装。本机实测登记成
`"@agenia/persona-plugin": "file:…/agenia-persona-plugin-1.0.0.tgz"`，落点是
`node_modules/@agenia/persona-plugin/`（hoisted）。（`dsh plugin` 是 pnpm 的一层薄转发：
先装，再把 `dsh.profile.bundles` 对着安装结果对一遍。）

> ⚠️ **别用 `npm install --no-save`。** `--no-save` 的意思是"别记进依赖清单"，
> 而 pnpm 认的就是那张清单 —— 下次谁在 profile 里跑一次 `pnpm install`，
> 没登记的那份会被当多余的东西清掉，而且**清的时候不报错**：要到下一次挂载才响亮地失败。

装的时候 dsh 会打一句警告：

```
dsh: warning: @agenia/persona-plugin declares no dsh.bundle — installed as a plain dependency, not a profile layer
```

**这句是预期的，不是你装错了。** 它后面那句解释就是 "a plain library is fine; the
warning is orientation"。我们**要**它当一个普通依赖 —— 预设那一行按裸包名 import 它；
它也不该是 profile 层，这个包里没有 `cordis.patch.yml`。要它变成 profile 层，
就得给它加一个 `dsh.bundle` 声明，那与它现在的用途无关。

**「那个目录」是哪**：harness 把裸包名交给 Node 的 ESM 解析器，起点是挂载预设的那层
上下文自己的 `baseUrl`。**实测（2026-09-20）**：本机是 `~/.dsh/profiles/web/`
（`dsh-app-boot` 用 profile 的 `cordis.yml` 所在目录设的），装完落在
`~/.dsh/profiles/web/node_modules/@agenia/persona-plugin/`。
包名不会从 preset 自己的目录往上找 —— 把包放进 preset 旁边**不生效**。

## 这个包不是一份能跑的 Agenia —— 预设本体在仓库里

**包里只有注入器 + 12 份文本**（`npm pack` 的清单就是 `inject.js` · `content/` · `README.md`）。
**预设本体不在这个包里**：`agent.cordis.yml`、`preset.yml`，以及那些 markdown 的**真身**，
都在**仓库的 `presets/agenia/`**。包里的 `content/` 只是"谁都没点名内容根时的默认副本"。

所以**这不是一条命令能装完的东西**，至少要三步：

1. **让 DSH 找得到这份预设**：在 profile 的补丁层
   （`~/.dsh/profiles/<profile>/cordis.patch.yml`）里给 `agent-presets` 那一行登记 `roots`：

   ```yaml
   - id: agent-presets
     config:
       default: standard          # 必填；漏了 harness 起不来
       roots:
         - path: <装着 agenia/ 的那个目录>      # 就是仓库里 presets/ 那一层
           trust: user
   ```

   ⚠️ 补丁里的 `config:` 是**整体替换、从不合并** —— 要把那一行原本声明的键一起带过去，
   而且**写这个文件会让正在跑的会话当场掉工具集**，所以要在 harness 关着的时候改。
   这两条的来历见仓库 `AGENTS.md` 第 1、2 条。

2. **装这个包**（上面那条 `dsh plugin add`）。

3. **预设那一行**这样写（`contentDir: '.'` 是重点，见下）：

   ```yaml
   - id: persona-injector
     name: '@agenia/persona-plugin'
     config:
       contentDir: '.'      # 相对值按「声明这一行的组合自己的目录」解析，也就是 presets/agenia/
                            # 省略 = 用包自带的那份 content/
   ```

   `contentDir: '.'` 让注入器读**仓库里那份** markdown，于是"改 `persona.md` 存盘即生效"
   这条继续成立。用包自带的 `content/`，你改的就不是模型读的那一份。

`package.json` 必须同时有 **`name` 和 `version`**：宿主每请求清点活跃插件包，
拿到 `name` 却没有非空 `version` 的 manifest 会抛错，冒泡成 `REQUEST_EXTENSION`，
**看不出跟 package.json 有关**。

## 内容从哪来（三级，先命中先算）

| 顺位 | 来源 | 备注 |
| --- | --- | --- |
| 1 | 行的 `config.contentDir` | 相对路径按**声明这一行的组合自己的目录**解析（预设目录），**不按 `process.cwd()`** |
| 2 | 环境变量 `AGENIA_CONTENT_DIR` | 绝对路径。不改配置就能换个根试 |
| 3 | 包自带 `content/` | 谁都没点名时的默认 |

空串 = 没设，走下一顺位。**被点名的那个根是这些文件的唯一来源**：里面缺了哪份，
就少一节，**不会**悄悄回落到包自带那份 —— 静默回落等于"你以为改的是生效的那一份，
模型读的却是另一份"。

## 改代码之后：**必须重启 harness**

ESM 按 URL 缓存，而且**导入失败也按 URL 缓存失败** —— 文件曾经坏过、后来修好，
加载器照样复用那个坏实例（挂载正常、行状态正常，人格静默消失）。

**升版本号 + 重装没有用**（2026-09-20 实测，cwd = `C:\Users\DAVID\.dsh\profiles\web`）：

```console
$ node --input-type=module -e "console.log(import.meta.resolve('@agenia/persona-plugin'))"
resolved = file:///C:/Users/DAVID/.dsh/profiles/web/node_modules/@agenia/persona-plugin/inject.js
has query/version = false
```

行里写的是**裸包名**，安装布局是 hoisted（profile 的 `pnpm-workspace.yaml` 里
`nodeLinker: hoisted`），所以落点里**既没有版本号、也没有查询串**：
`version` 换成别的再重装，解析出来的**还是同一个 URL**，ESM 缓存照旧命中 ——
"改完没反应、而且哪儿都不报错"，正是项目 `AGENTS.md` 3e 记的那种**静默失效**。

**官方那条 `dsh plugin add` 装出来的也一样**（2026-09-20 同日实测，另起一个 profile
装同一个 `.tgz`）：`…/profiles/<profile>/node_modules/@agenia/persona-plugin/inject.js`。
hoisted 布局把它摊成一个**真目录**（不是指向 `.pnpm/<名字>@<版本>/…` 的符号链接），
路径里同样没有版本号。

⇒ **改 `inject.js` 之后要它生效，重启 harness。** 没有第二条路。

`content/` 下那 12 份 markdown **不受影响** —— 它们每轮从磁盘读，改完存盘即生效。
**只有 `inject.js` 这个代码文件要重启。**

## 它不做什么

**它不会把这份 preset 变成 `DSH` 认得的预设。** DSH 只从三个地方找 preset
（随部署自带的 · 配置里登记的 `roots` · `$DSH_HOME/.agent-presets/`），
**没有任何机制让一个 npm 包变成一份 preset** —— 预设目录仍然要人工放到其中一个位置。
这个包只负责"那一行跑起来要的代码"。
