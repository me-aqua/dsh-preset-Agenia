# 装上 Agenia —— 一步一步来

> **这份文件是给"别人"看的**：一个没参与过这个仓库、手上只有它的人。
> 它假设你会用命令行，但不假设你知道 DSH 的内部。
> **每一步都写了要做什么；第 5 步是唯一的总验收** —— 别的步骤也有"怎么知道成了"，
> 但只有第 5 步能一次判定整件事成没成。
>
> **本文的命令在 Windows 上实测过（2026-09-20）**；macOS / Linux 上把路径分隔符换掉即可。
>
> ⚠️ **先说清楚一件最容易误会的事**：**没有"一条命令装上"这回事。**
> DSH 找 agent preset 只认三个地方 —— 随它自带的、配置里登记的目录、
> `~/.dsh/.agent-presets/`。**没有任何机制能让一个 npm 包装上就变成一份 preset。**
> 所以下面必须手写一小段配置。**藏这句话比多写这一段贵得多**，所以写在最前面。

---

## 0. 前提

| 要有 | 怎么确认 | 成了长这样 |
| --- | --- | --- |
| Node.js ≥ 22.13 | `node --version` | 打印 `v22.13.0` 或更高 |
| pnpm | `pnpm --version` | 打印一个版本号。**没有就装：`npm i -g pnpm`**（Node 那个 22.13 的门槛就是它要的） |
| 一个能跑的 DSH | `npx @deepseek-ai/dsh web` | 终端里打印一行 `dsh web: http://127.0.0.1:<端口>/?token=…`，浏览器能打开 |
| 这个仓库 | 拿到它，放在一个你记得住的目录 | 下面管它叫 `<仓库>` |

⚠️ **关于 `dsh` 这个命令**：上面用的是 `npx @deepseek-ai/dsh`。
**如果你从来没把 DSH 装成全局命令，那你的机器上就没有 `dsh`** ——
下面凡出现 `dsh` 的地方，都写成 `npx @deepseek-ai/dsh` 就行。两种写法等价。

---

## 1. 打一个包文件

```sh
cd <仓库>/packages/persona-plugin
npm pack
```

**成了长这样**：目录里多出一个 `agenia-persona-plugin-<版本>.tgz`，
而且最后一行会打印文件名与文件数（1.0.0 时是 **15 个文件**）。
⚠️ **别去核字节数** —— 那十二份 `.md` 是给人天天改的（见第 6 步），
**改一个字这个数就变，那不是错**。（核对时的读数是 65613 字节。）

**包里有什么**：`inject.js` + `package.json` + `README.md` + `content/` 下的十二份 markdown。
**包里没有什么**：**预设本体**。`agent.cordis.yml`、`preset.yml` 在 `<仓库>/presets/agenia/`，
**不在包里** —— 这一点很关键，第 3 步要用。

---

## 2. 把包装进你的 profile

```sh
dsh plugin --profile web add <上面那个 .tgz 的路径>
# 没有全局 dsh 的话：
npx @deepseek-ai/dsh plugin --profile web add <上面那个 .tgz 的路径>
```

**成了长这样**：

```
+ @agenia/persona-plugin file:.../agenia-persona-plugin-1.0.0.tgz
Done in ... using pnpm v...        ← 退出码 0
```

（耗时和 pnpm 版本号每次都不同，**别逐字比**。）它会把这个包写进
`~/.dsh/profiles/web/package.json` 的 `dependencies`。

⚠️ **别用 `npm install --no-save` 代替它。** `--no-save` 的字面意思就是"别登记"，
而这个 profile 认的是那张登记表（`package.json` 的 `dependencies`）——
**没登记的东西，pnpm 对不上账**。

（⚠️ 这里原先写的是"下次谁跑一次 `pnpm install`，没登记的会被当多余的东西清掉"。
**那句话没测过，2026-09-20 实测是假的**：在同一台机器上复现"手工放、不登记"的状态，
`pnpm install --force` 和 `pnpm prune` 都报 `Already up to date`，**都没删它**。
所以别把"没登记"当成一颗定时炸弹 —— 它只是**歪的**，不是**会炸的**。）

⚠️ **你会看到一句警告，那是预期的，不是错误**：

```
dsh: warning: @agenia/persona-plugin declares no dsh.bundle —
installed as a plain dependency, not a profile layer
```

这个包是给**预设里的某一行**当普通依赖用的，它**本来就不该**是 profile 层。

---

## 3. 让 DSH 找到那份 preset（**这一步没法自动化**）

> ## ⚠️⚠️ 先把 harness 关掉再做这一步
>
> `~/.dsh/profiles/web/cordis.patch.yml` 是**热加载**的
> （这个 profile 的 `package.json` 里写着 `patchReload: live`）。
> **你一存盘，DSH 会当场重新应用整套补丁** —— 而补丁指向 `agent-presets` 那一行，
> **所有正在跑的会话，它们的预设层（工具 + 提示词段落）都挂在这一行底下**，会被一起拆掉。
>
> **症状**：工具一个个消失（`cordis_*` → `pwsh`/`read`/`write`），
> 而且**不可恢复** —— agent 还能说话，只是什么也做不了。
>
> **所以：关掉 harness，再改这个文件。**
> 建议先把这份说明存到本地再看（你现在可能就开着 harness 在读它）。
>
> ⚠️ **万一你已经这么干了**：关掉 harness 重来一遍就行，**配置本身没写坏**。

打开 `~/.dsh/profiles/web/cordis.patch.yml`，加上这一段：

```yaml
- id: agent-presets
  config:
    default: standard
    roots:
      - path: <仓库>/presets
        trust: user
```

三件必须知道的事：

1. **`path` 填的是「装着 `agenia/` 的那个目录本身」** —— 也就是 `<仓库>/presets`。
   ⚠️ **不是它的上一层 `<仓库>`。** 填错**不会报错**，只是 Agenia 不出现（见第 5 步的第三种）。
2. **`config:` 是整体替换，不是合并。** 所以 `default` 必须一起写上，漏了 harness 起不来。
   你想默认就用 Agenia，就把 `default` 改成 `agenia`。
3. ⚠️ **如果你已经有 `- id: agent-presets` 这一段了，只加 `roots` 那一项，
   别把整段抄两遍** —— 同一个 `id` 出现两次会让 harness 直接报
   `duplicate loader entry id` 起不来。

**这一步没有自己的判据** —— YAML 写对没有、DSH 认不认，都要等第 5 步才知道。
所以第 4 步别跳。

---

## 4. 重启 harness

**重启 = 先停掉现在这个，确认它退了，再重新起一个。**

- 停：在你起它的那个终端里按 **Ctrl-C**；确认终端回到了提示符
- 起：再跑一次 `npx @deepseek-ai/dsh web`
- **成了的样子**：终端里重新出现 `dsh web: http://127.0.0.1:<端口>/?token=…`

⚠️ **别直接再开一个 —— 那不叫重启。** 两个实例会抢
`~/.dsh/.credentials.yaml` 的写锁，第二个会报
`atomic-write: timed out waiting for the writer lock`（见第 8 步）。

**为什么必须重启**：补丁里 `roots` 那一项只在插件启动时读一次。
⚠️ 这跟"热加载"不矛盾 —— 热加载管的是**补丁文件本身被改**，
`roots` 这种**启动期**配置读一次就不再看。

---

## 5. 怎么知道成了（**唯一的总验收**）

在界面上**新开一个会话**，点开输入框上方那一格「标准模式」，
切成「**Agenia 模式**」，然后问它一句：

> 你是谁？你收到的上下文里的"内容目录"是什么？

**成了的样子**：它自称 16 岁的组长，并且报出

```
内容目录：<仓库>\presets\agenia
说明书目录：<仓库>\presets\agenia\team
```

（那两个标签在界面上就是这么写的，2026-09-20 实测过。）

**两种没成，长得完全不一样，别混：**

| 你看到的 | 是什么 | 去哪查 |
| --- | --- | --- |
| 能切到「Agenia 模式」，但它说自己是"一个编码 agent"、不知道名字 | **注入没生效**（预设被发现了，但这个包装的位置不对） | 第 2 步的 `dependencies`、第 8 步最后两行 |
| **那一格里根本没有「Agenia 模式」** | **预设根本没被发现** —— 不是注入的问题 | 自查三件事：① 第 4 步真重启了吗；② `roots` 的 `path` 是不是**正好**指向 `<仓库>/presets`；③ 补丁里那一行有没有和 `dsh-web-app` 自带的那行撞 `id`（第 8 步第一行） |

**第三种（半成）**：它自称 Agenia，但报出来的路径是 `node_modules` 里那一条 ——
那是内容目录没配，落回了包自带那份。查 `presets/agenia/agent.cordis.yml` 里那一行上
有没有 `config: { contentDir: '.' }`。

---

## 6. 装了之后怎么改

| 你想改的 | 改哪 | 什么时候生效 |
| --- | --- | --- |
| 人格、工序、守则、队员的说明书 | `<仓库>/presets/agenia/` 下的十二份 `.md`（清单见仓库 `README.md`） | **存盘即生效** —— 正在跑的会话下一个步骤就变，不用重启 |
| 注入器**代码** | `<仓库>/packages/persona-plugin/inject.js` | ⚠️ **必须重启 harness**（见下） |
| 组合本体（换能力行、换默认模型） | `<仓库>/presets/agenia/agent.cordis.yml` | ⚠️ 也要**重启** |

**为什么改代码要重启、改文本不用**：文本每轮从磁盘读（还按 `mtime+size` 判新旧）；
代码走 ESM 模块缓存，而**"导入失败"也会被缓存** —— 它曾经一度语法错误，
之后无论怎么修都一直复用坏掉的那份，症状是挂载正常、行状态正常、
**人格静默变成 0 字符且不报错**。

⚠️ **升版本号 + 重装不管用**：实测（2026-09-20）装出来的落点是
`…/node_modules/@agenia/persona-plugin/inject.js` —— **路径里既没有版本号也没有查询串**，
URL 不变、缓存照旧。

---

## 7. 不想要了怎么卸

```sh
dsh plugin --profile web remove @agenia/persona-plugin
```

（`dsh plugin` 是**把参数转给 pnpm** 的，所以 `remove` 就是 pnpm 的 remove。
没有全局 `dsh` 就写 `npx @deepseek-ai/dsh plugin …`。）

然后：

1. **关掉 harness**（同第 3 步的理由），把 `cordis.patch.yml` 里的 `- id: agent-presets`
   恢复成你装之前的样子 —— 要是那一行本来就是 `dsh-web-app` 自带的，
   就只删你加的 `roots` 那一项
2. 重启

**成了的样子**：新开会话，预设那一格里**不再有「Agenia 模式」**。

⚠️ **实测（2026-09-20）**：`remove` 会把依赖从 `package.json` 里去掉，
**但 `node_modules/@agenia/` 那个目录可能还留在磁盘上** ——
Node 的解析照样找得到它。所以想彻底干净，**手动把它删掉**；
否则将来你只把 `roots` 加回去（没重装）时，加载的可能是**这一份旧的**。

⚠️ 手改过 `package.json` 的话，在 profile 目录里跑一次 `pnpm install` 让 lockfile 对齐。

---

## 8. 踩过的坑（每条都是实测，不是提醒）

| 现象 | 真实原因 | 怎么办 |
| --- | --- | --- |
| **改到一半工具一个个没了，只剩说话** | **你开着 harness 写了那个热加载的补丁文件**（第 3 步） | 关掉 harness 重来，**配置本身没写坏** |
| harness 起不来，报 `duplicate loader entry id: agent-presets` | 你把这一行**又插了一遍**，而 `dsh-web-app` 本来就已经声明过它 | 改成"覆盖 config"（`- id:` 形式），不要用 `- insert:`（`- insert:` 是往树里**新增一行**，`- id:` 是**改已有那一行**） |
| harness 起不来，报缺 `default` | 补丁里的 `config:` 是**整体替换** | 把 `default` 一起写上 |
| **预设那一格里没有「Agenia 模式」** | 第 3 步的 `roots` 没被认出来（路径填错、或没重启） | 见第 5 步那张表 |
| 能切到 Agenia，但它说自己是"编码 agent" | 注入没生效 | 查第 2 步、以及第 5 步的"第三种" |
| `'dsh' is not recognized` | 你只通过 `npx` 用过 DSH，它没装成全局命令 | 在 `dsh` 前加 `npx @deepseek-ai/dsh` |
| `'pnpm' is not recognized` | PATH 上没有 pnpm | `npm i -g pnpm`。DSH 自带的那份**不在 PATH 上**，要用它得把那个目录加进 PATH，或者在那个目录里建一个 `pnpm.cmd` 指向它 |
| 第二个实例起不来，报 `atomic-write: timed out waiting for the writer lock` | 两个实例在抢 `~/.dsh/.credentials.yaml` 的写锁 | **重启 = 先停旧的**（第 4 步）。停在半路的实例会留下**僵锁** —— 删掉 `~/.dsh/.credentials.yaml.lock` 即可 |
| 用 Windows 目录联接（junction）把预设接到 `~/.dsh/.agent-presets/`，DSH 看不见 | Node 报 `isDirectory=false, isSymbolicLink=true`，扫描器会跳过 | **junction 这条路不行**。（把目录**拷**进去是另一回事，但**本文只教第 3 步那条路**，别的没验过。） |

---

## 9. 这个包到底交付了什么（别误会）

- ✅ **十二份 markdown + 一个注入器**：装得上、能升级、能被卸载。
- ❌ **不是** DSH 插件市场里的商品，**不会**自动出现在你的预设列表里 —— 第 3 步是你的活。
- ❌ **不含**预设本体（`agent.cordis.yml` / `preset.yml`）—— 它们在仓库里。

**为什么这么切**：人格文本本来就是要**天天改**的东西。把它塞进版本化的包，
等于给"改一个字"加一道发包工序。所以**文本住在仓库里、以磁盘为准**，
包里那份只是"没人指定内容根时的默认值"（这也是第 5 步"第三种"那个现象的来源）。

---

## 10. 这份说明书自己是怎么被验过的

**判据**：一个**没参与过改造的人**，只拿这份文件 + 一个干净目录，能不能把它跑起来。

**怎么验的（2026-09-20）**：让一个没参与的人**冷读**这份文件的**第一版**，逐字引用
"他在哪一句上停了一下"。他找出 **14 条**缺口，其中最贵的一条是：
**第一版第 3 步让你直接去写那个热加载的补丁文件，一句"先关掉 harness"都没有** ——
照字面走的人会把自己所有会话当场拆掉，而症状不在任何一行里。

**你现在读到的是补过之后的版本**：第 3 步那条警告、第 4 步"怎么重启"、
第 5 步的第三种、第 2 步的 `dsh`/`npx`、第 7 步的 `remove`、第 8 步补的四行坑，
以及本文所有"成了长这样"，都是照着他卡住的地方补的。

⚠️ **诚实交代两件没做到的**：① 他不是干净新人（harness 把那台机器上的项目规则文件
灌进了他的上下文），所以**严重度排序可能被污染**；② 他**没有 shell**，
所有"会发生什么"都是**推演** —— **命令本身是另一个人在真机器上跑的**。
