# AGENTS.md —— otools-cadcraft 移植约定

给后续接手这个仓库的 agent（和人）的规则。核心一句话：**`upstream/` 一行都不要改**，
所有移植代码都放在 `shell/`，这样 `git subtree pull` 永远干净。

## 铁律

1. **`upstream/` 保持上游原样**。它是 `git subtree` 挂进来的
   `storytold/cadcraft`。任何「顺手改一下上游」的念头都会在下次
   `git subtree pull --prefix=upstream ... --squash` 时变成冲突。
2. **`shell/src/upload.rs`、`shell/src/download.rs` 是上游原样副本**，不要就地改；
   要改行为就改 `shell/src/otools.rs` 或 `shell/src/main.rs`。
3. **不引入 native cdylib**。OTools 宿主已经注入了
   `tools_webview_read_file` / `tools_webview_write_file` / 文件对话框，
   够用；再加 FFI 只是多一份 `lib/Windows.dll` 要跟着分发与签名。
4. **改 `shell/Cargo.toml` 的上游依赖版本时，对齐 `upstream/Cargo.toml` 的
   `[workspace.dependencies]`**（egui/eframe 等是 `0.36` 这一档）。

## 上手前必须知道的三件事

- **rustc 版本**：上游 `rust-version = "1.95"`（egui 0.36 用了 1.95 才稳定的
  `Vec::push_mut`）。本机 1.94 会在 `epaint` 上直接 `E0658`。
  `scripts/build-wasm.mjs` 会检查并提示。本机环境变量 `RUSTC_WRAPPER=sccache`
  指向 PATH 里的旧 rustc，会让 cargo 用错工具链——构建前 `unset RUSTC_WRAPPER`。
- **git 拉取要走 git CLI**：cargo 的 libgit2 过代理会 502。
  `CARGO_NET_GIT_FETCH_WITH_CLI=true` 可解（上游的 `craft-ui` 是 git 依赖）。
- **trunk 首次运行会下载 wasm-bindgen-cli 与 wasm-opt**（GitHub release），
  国内网络可能要直连。

## 移植层的地图

| 文件 | 作用 |
| --- | --- |
| `shell/index.html` | 唯一的 JS：`window.cadcraftOtools`（available/theme/openFiles/saveFile） |
| `shell/src/otools.rs` | 桥：`pick_open` / `pick_save` / `deliver` / 主题 |
| `shell/src/main.rs` | 外壳：`set_io`、`set_deliver` 的选择、`services()`、`?cpu/?webgl/?sample` |
| `shell/src/upload.rs` | 上游副本：`Inbox`，把读到的字节在下一帧喂给 `CadApp` |
| `shell/src/download.rs` | 上游副本：非 OTools 环境下退回浏览器下载 |

## 常见任务

- **上游更新了** → `git subtree pull --prefix=upstream https://github.com/storytold/cadcraft.git main --squash`，
  再 diff `upstream/apps/cadcraft-web/src/*.rs` 与 `shell/src/*.rs`。
- **要加一个新的宿主能力**（例如把 DWG 另存 PDF 走宿主）→ 在 `shell/index.html`
  的 `window.cadcraftOtools` 上加函数，在 `shell/src/otools.rs` 加 `extern "C"` 绑定
  和调用点；**不要**改 `upstream/`。
- **要改 OTools 侧的元信息**（名称/图标/关键词）→ `plugin.json`。

## 不要做的事

- 不要给 `upstream/` 里的 crate 打 patch、加 `.cfg`、写 TODO。
- 不要把 `dist/` 提交进 git（OTools 仓库本地构建）。
- 不要在本仓库跑 `cargo build` 而不管 target：外壳是 wasm-only 的，
  宿主（x86_64）下 `main()` 只会打印一行提示，别把它当编译报错。
