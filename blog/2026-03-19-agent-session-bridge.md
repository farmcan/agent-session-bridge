# 一个跨 Agent Session Bridge 的小想法

## Idea

最近一个很实际的问题是：我会同时开很多 coding agent，比如 `Codex`、`Cursor`、`Qoder`、`QoderCLI`。

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
- `cursor -> codex`
- `qoder -> codex`

这种切换动作变成一个很轻的本地命令，而不是重新写一遍 prompt。

## 实现

实现上我没有走复杂路线，整体只做了三件事。

### 1. 读取本地 session

先直接读取不同 agent 在本地的 session 存储。

这版已经接了三类真实来源：

- `Codex`: `~/.codex/sessions`
- `Qoder / QoderCLI`: `~/.qoder/projects`
- `Cursor`: `~/.cursor/projects/.../agent-transcripts`

这里三种 agent 的目录现状其实不太一样：

- `Codex`：物理存储按时间分桶，路径像 `~/.codex/sessions/YYYY/MM/DD/...jsonl`，但 session 内部有 `cwd`，而且 `resume` 也是按 `session id`
- `Qoder`：`~/.qoder/projects` 下面除了 `jsonl`，还有独立的 `*-session.json` 元数据，里面有 `working_dir`
- `Cursor`：`agent-transcripts` 里的内容更像纯消息流，项目归属主要靠 `~/.cursor/projects/<project-key>/...` 这一层目录名

所以默认选择逻辑也不能一刀切成“取最新”。

现在的实际策略是：

- 先按当前目录 `pwd` 去匹配对应 session
- `Codex` 看 `cwd`
- `Qoder` 看 `working_dir`
- `Cursor` 看由当前目录推导出的 project 目录
- 只有当前目录匹配不到时，才回退到该 agent 的全局最近 session

当然，也支持手动指定某个 session 文件。

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

### 3. 生成 handoff

归一化之后，把结果渲染成一份干净的 Markdown transcript：

```md
# Agent Session Handoff

Source Agent: codex
Target Agent: cursor
Session ID: ...
Working Directory: ...

## Transcript

[user] ...

[assistant] ...
```

输出方式也保持最小：

- `--stdout`
- `--copy`
- `--out`

所以它本质上不是在“恢复目标 agent 的完整状态”，而是在做一件更轻但足够有用的事：

**把一个 agent 的本地 session 转成另一个 agent 能立即接上的 handoff。**

我现在自己最顺手的用法就是直接配 alias：

```bash
alias c2r='agent-session-bridge --agent codex --target cursor --copy'
alias r2c='agent-session-bridge --agent cursor --target codex --copy'
alias q2c='agent-session-bridge --agent qoder --target codex --copy'
```

这样日常切换 agent 时，基本就是：

```bash
c2r
r2c
q2c
```

这就是这个项目最核心的实现目标：

**让多 agent 并行开发时，上下文切换的成本尽量低。**
