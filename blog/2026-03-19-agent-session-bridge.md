# 一个跨 Agent Session Bridge 的小想法

## Idea

最近一个很实际的问题是：我会同时开很多 coding agent，比如 `Codex`、`Claude`、`Cursor`、`Qoder`、`QoderCLI`。

并行本身没有问题，真正麻烦的是上下文不能自然流动。

比如我已经在 `Codex` 里把问题讲清楚了，做了一半，接下来想切到 `Cursor` 继续，往往还是要重新把背景、目标、上下文再讲一遍。这种重复本质上是在浪费时间。

所以这个项目的想法很简单：

**不要尝试迁移完整运行时状态，只迁移“足够继续工作的上下文”。**

也就是说：

- 找到 agent 的本地 session
- 把里面真正有用的 user / assistant 对话抽出来
- 转成一个统一格式
- 再生成一份 handoff 给另一个 agent

这样就能把：

- `codex -> cursor`
- `claude -> codex`
- `cursor -> codex`
- `qoder -> codex`

这种切换动作变成一个很轻的本地命令，而不是重新写一遍 prompt。

现在命令层也压短了，直接支持这种写法：

```bash
agent-session-bridge x2r
agent-session-bridge c2x
agent-session-bridge c x --split-recent 1
```

这里的缩写是：

- `x = codex`
- `c = claude`
- `r = cursor`
- `q = qoder`

## 实现

实现上我没有走复杂路线，整体只做了三件事。

### 1. 读取本地 session

先直接读取不同 agent 在本地的 session 存储。

这版已经接了三类真实来源：

- `Codex`: `~/.codex/sessions`
- `Claude`: `~/.claude/projects`
- `Qoder / QoderCLI`: `~/.qoder/projects`
- `Cursor`: `~/.cursor/projects/.../agent-transcripts`

这里三种 agent 的目录现状其实不太一样：

- `Codex`：物理存储按时间分桶，路径像 `~/.codex/sessions/YYYY/MM/DD/...jsonl`，但 session 内部有 `cwd`，而且 `resume` 也是按 `session id`
- `Claude`：`~/.claude/projects/<project-key>/<session-id>.jsonl` 是主数据源，`~/.claude/sessions/*.json` 更像运行态索引
- `Qoder`：`~/.qoder/projects` 下面除了 `jsonl`，还有独立的 `*-session.json` 元数据，里面有 `working_dir`、`title`、`updated_at`
- `Cursor`：`agent-transcripts` 里的内容更像纯消息流，项目归属主要靠 `~/.cursor/projects/<project-key>/...` 这一层目录名

所以默认选择逻辑也不能一刀切成“取最新”。

现在的实际策略是：

- 先按当前目录 `pwd` 去匹配对应 session
- `Codex` 看 `cwd`
- `Claude` 看 transcript 里的 `cwd`
- `Qoder` 看 `working_dir`
- `Cursor` 看由当前目录推导出的 project 目录
- 只有当前目录匹配不到时，才回退到该 agent 的全局最近 session

当然，也支持手动指定某个 session 文件。

另外最近又加了一条很实际的能力：`split`。

一个长 session 里经常会混进多个需求，或者执行中突然冒出一个新 idea。  
这时候更合理的不是继续把东西都塞进原 session，而是直接切一段新的 handoff 出来。

当前第一版的规则很简单：

- `--split-recent N`
- 保留最近 `N` 个真实 user turn 以及它们之后的内容
- 自动忽略类似 `[Request interrupted by user]` 这种中断占位消息

这样做的价值不只是 workflow 更干净，还有一个很实际的收益：

- 下一个 agent 吃进去的上下文更小
- 无关历史更少
- token 开销更低

对应地，`fork` 现在也有了第一版最小实现。

做法也很直接：

- 先选当前 session
- 如果需要，先 `--split-recent`
- 再用 `--fork "新 idea"` 追加一条新的 user 请求
- 输出一个新的 handoff bundle 给下一条工作线

例如：

```bash
agent-session-bridge c x --split-recent 1 --fork "把这个新 idea 单独拉出来，做成 fork"
```

这不是在复制完整运行时状态，而是在把“当前还需要的上下文 + 一个新的任务意图”打包成一条新的工作线。

### 2. 做 adapter 归一化

不同 agent 的 session 文件结构不一样，所以给每种来源做一个 parser / adapter。

最后统一转成一套中间格式：

```text
{
  agent,
  sessionId,
  cwd,
  messages: [
    { role, text }
  ]
}
```

这样来源层和输出层就解耦了。

以后如果要继续加 `Claude` 或 `Augment`，只要新增 adapter，不需要重写整条链路。

### 2.5. 实验性的 `claude -> codex resume`

后面又往前走了一步：不是只生成 handoff，还可以把 `Claude` 的可见对话直接转成一份 Codex 风格的 session 文件。

现在这个实验能力的边界是：

- 来源先只做 `Claude`
- 目标是生成一个 Codex `jsonl` session
- 里面主要写 `session_meta` 和 `response_item`
- 不尝试伪造 tool calls、reasoning 或隐藏运行态

这件事有意义，是因为我已经做过黑盒验证：

- `codex resume` 的发现逻辑会认这种文件
- `codex exec resume` 也会把写进去的 `response_item` 历史当成恢复上下文

所以这个方向不是概念验证，而是已经能通一条最小链路。

### 3. 生成 handoff 和启动 prompt

归一化之后，不是直接把原始 transcript 塞给新 agent，而是生成两份文件。

第一份是 handoff：

```md
# Agent Session Handoff

Source Agent: codex
Target Agent: cursor
Session ID: ...
Working Directory: ...
Conversation Title: ...

## Suggested Next Step

...

## Transcript

[user] ...

[assistant] ...
```

第二份是给新 agent 的启动 prompt，作用很单纯：

- 告诉它先读哪个 handoff 文件
- 让它先总结当前任务和下一步
- 明确要求它把 handoff 当作上下文，而不是绝对事实

这样新 agent 不需要一上来就把完整 transcript 作为启动上下文吞进去。

输出方式现在是：

- `--stdout`
- `--copy`
- `--out`

其中默认文件输出会同时生成：

- `handoff.md`
- `handoff.start.txt`

`--copy` 复制的是启动 prompt，不是原始 transcript。

所以它本质上不是在“恢复目标 agent 的完整状态”，而是在做一件更轻但更实用的事：

**把一个 agent 的本地 session 转成另一个 agent 能立即接上的 handoff。**

如果目标是 `Codex`，现在还多了一条实验路径：

**把 `Claude` session 直接转成一个可 `resume` 的 Codex session。**

我现在更倾向直接用内建短命令：

```bash
agent-session-bridge x2r
agent-session-bridge r2x
agent-session-bridge c2x
agent-session-bridge c x --split-recent 1
```

这就是这个项目最核心的实现目标：

**让多 agent 并行开发时，上下文切换的成本尽量低。**
