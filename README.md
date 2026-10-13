# otools-cadcraft

**CADCraft**（[storytold/cadcraft](https://github.com/storytold/cadcraft)）的 **OTools 插件版**。

上游是一个「纯 Rust、零 Electron、无 webview」的开源 AutoCAD 式 CAD：`crates/*` 是引擎与文件格式，
`crates/ui-egui` 是 egui 界面，`apps/cadcraft-web` 用 trunk 把同一套 UI 编成 WebAssembly 跑在浏览器里。

OTools 插件本身就是「一个 webview + 一套前端静态资源」，所以移植的关键发现是：
**不用重写任何界面**。把上游的 WASM 版当插件前端，再把「文件从哪来、存到哪去」接到
OTools 宿主上，就得到了一个插件。上游 `crates/*` 一行没改。

## 目录

```
otools-cadcraft/
├── upstream/                 # 上游 storytold/cadcraft 的 git subtree（原样，勿改）
├── shell/                    # 我们唯一新写的 Rust 代码：OTools 外壳
│   ├── src/main.rs           #   改编自上游 apps/cadcraft-web/src/main.rs
│   ├── src/otools.rs         #   OTools 宿主桥（对话框 + 读写文件）
│   ├── src/upload.rs         #   上游原样副本（拖放/打开的文件进 Inbox）
│   ├── src/download.rs       #   上游原样副本（非 OTools 环境下的浏览器下载回退）
│   ├── index.html            #   入口 + window.cadcraftOtools 这段 JS 桥
│   ├── Trunk.toml            #   dist 指向仓库根的 dist/
│   └── Cargo.toml            #   path 依赖 ../upstream/crates/*，不复制上游代码
├── plugin.json               # OTools 插件清单（entry = dist/index.html）
├── scripts/
│   ├── build-wasm.mjs        #   trunk 构建 → dist/
│   └── deploy-to-otools.ps1  #   同步到 otools 仓库 plugins/ 目录
└── dist/                     # 构建产物（.gitignore，本地构建）
```

## 移植思路

上游的网页版本来就没有文件系统，靠三个钩子把「宿主」这一层换成插件需要的能力——
这些钩子是上游自己设计好的，所以**上游零改动**：

| 上游钩子 | 网页版行为 | OTools 插件版行为 |
| --- | --- | --- |
| `Services::pick_open` | `<input type=file>` 选文件 | `window.otools.dialog.open` → `readHostFile` 读盘 |
| `Services::pick_save` | 返回建议文件名 | 置「弹另存对话框」标记，返回建议文件名 |
| `cmd::file::set_deliver` | 浏览器下载 | `window.otools.writeHostFile` 写盘 |

JS 侧只有 `shell/index.html` 里那一段（约 120 行）：把 `window.otools` 的
`dialog.open/save`、`readHostFile`、`writeHostFile` 包成 `window.cadcraftOtools`，
`shell/src/otools.rs` 用 wasm-bindgen 直接调它。

**不引入 native cdylib**：宿主已经注入了无路径白名单限制的 `tools_webview_read_file` /
`tools_webview_write_file` 与文件对话框，再加一层 FFI 只会多一份分发产物。

## 构建

```bash
# 1) 工具链（上游要求 rustc >= 1.95：egui 0.36 用了 1.95 才稳定的 Vec::push_mut）
rustup toolchain install stable
rustup target add wasm32-unknown-unknown
cargo install trunk            # 或从 GitHub releases 下载预编译二进制

# 2) 构建
node scripts/build-wasm.mjs    # 等价于 cd shell && trunk build --release
```

trunk 第一次运行会自己下载 `wasm-bindgen-cli` 与 `wasm-opt`（binaryen），走 GitHub release，
国内网络可能需要能直连的环境。

## 跑起来

```powershell
pwsh -File scripts/deploy-to-otools.ps1     # 同步到 D:\Repos\xyito\otools\otools\plugins\otools-cadcraft
```

然后重载/重启 OTools，应用列表里会出现「CAD 制图」。

插件在纯浏览器里打开也能用（`dist/index.html` 直接拖进浏览器）：此时退回上游的
「下载即保存」行为，只是文件对话框是浏览器自己的。

URL 参数沿用上游：`?webgl` 强制 WebGL2、`?cpu` 用 egui 形状画布（不依赖 WebGPU/WebGL2）、
`?sample` 打开示例图纸、`?theme=dark|light` 覆盖初始主题（默认跟随 OTools 界面主题）。

## 跟进上游

上游以 **git subtree** 挂在 `upstream/`：

```bash
git subtree pull --prefix=upstream https://github.com/storytold/cadcraft.git main --squash
```

因为上游目录保持原样，这条命令不会产生冲突。之后要做的事只有两件：

1. `upstream/apps/cadcraft-web/src/{main,upload,download}.rs` 有没有变？变了就把改动
   合并进 `shell/src/` 同名文件（差异就是上面那张表的三处）。
2. `shell/Cargo.toml` 里上游 crate 的版本号（现在写死 `0.36` 等）跟着 `upstream/Cargo.toml`
   的 `[workspace.dependencies]` 走。

## 已知限制

- **「另存为」改名字后，标题栏仍显示旧名**：上游 `Services::pick_save` 是同步的，
  拿不到用户在对话框里选的新路径；保存本身是对的，只是 `st.path` 仍是建议名。
- **首次保存会弹一次对话框**：打开的文件是通过字节流进来的，上游没有「打开时的路径」可带
  （`open_bytes` 不接收路径）。所以第一次保存走「另存为」，之后再保存直接覆盖上次的路径。
- **WASM 内没有真实文件系统**：上游里少数直接调 `std::fs` 的路径（`SCRIPT {path}`、
  `AUDIT {path}`、`xref` 的按路径重载等）在网页版本来就不通，插件里同样不通；
  需要按文件操作的命令请用对应的 `{data: base64}` 形式。
- **缩略图/最近文件**：OTools 的插件列表用的是 `plugin.json` 的 `icon` 与 `screenshots`，
  与上游自己的启动页无关。

## 许可

上游为 MIT OR Apache-2.0。本仓库的移植层（`shell/`、`plugin.json`、`scripts/`）同样以
MIT OR Apache-2.0 分发；`upstream/` 保留上游的 `LICENSE-MIT` / `LICENSE-APACHE` / `NOTICE`。
