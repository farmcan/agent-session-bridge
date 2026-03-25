# Changelog / 更新记录

## Unreleased / 未发布

- Improved the ambiguous session chooser with spaced card-style entries, full paths, session ids, and recent real user messages.
- 改进了歧义 session 选择器，使用留白更清晰的卡片式条目，并展示完整路径、session id 和最近几条真实用户消息。

- Added `c2c` so Claude sessions can be forked into new native Claude sessions and resumed with a fresh session id.
- 增加了 `c2c`，支持把 Claude session fork 成新的原生 Claude session，并使用新的 session id 继续恢复。

- Added `kage update` and shorthand list commands like `kage c`, `kage q`, and `kage x`.
- 增加了 `kage update`，以及 `kage c`、`kage q`、`kage x` 这类简写的 session 列表命令。

- Tolerate corrupted JSONL rows during session discovery so one bad transcript does not break the whole scan.
- 在 session 发现阶段容忍损坏的 JSONL 行，避免单个坏文件导致整个扫描流程失败。

- Ignore Codex bootstrap pseudo-user messages when deriving chooser titles.
- 在生成选择器标题时忽略 Codex 注入的 bootstrap 伪 user 消息。

- Preserve full chooser titles and paths instead of truncating them.
- 保留完整的选择器标题和路径，不再固定截断。

- Clarify unknown route-alias errors by printing the supported alias list.
- 对未知 route alias 提供更明确的报错，并直接打印支持的 alias 列表。

- Document that rerunning the install command upgrades an existing install.
- 文档中补充说明：重新执行安装命令即可升级已有安装。

## Earlier Work / 早期工作

- Added native Codex, Claude, and Qoder session export flows.
- 增加了原生的 Codex、Claude 和 Qoder session 导出流程。

- Added the `kage` CLI alias and the GitHub install script.
- 增加了 `kage` CLI 别名和 GitHub 安装脚本。

- Added session-id lookup, `output-dir` support, and machine-readable JSON output.
- 增加了 `session-id` 查找、`output-dir` 支持和机器可读的 JSON 输出。
