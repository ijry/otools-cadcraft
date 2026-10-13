/**
 * 构建 CADCraft 的 OTools 插件前端（WASM + trunk → dist/）。
 * ------------------------------------------------------------------
 * 上游要求 rustc >= 1.95（egui 0.36 用了 1.95 才稳定的 Vec::push_mut）。
 * 本机 1.94 会在这里被拦住，脚本会给出「装哪个版本」的明确提示。
 *
 * 用法：node scripts/build-wasm.mjs [--debug]
 *
 * 依赖：
 *   - trunk           （cargo install trunk，或把 trunk 放到 PATH）
 *   - rustc >= 1.95 + wasm32-unknown-unknown 目标
 *                     （rustup toolchain install stable && rustup target add wasm32-unknown-unknown）
 *
 * trunk 首次运行会自行下载 wasm-bindgen-cli 与 wasm-opt（binaryen），
 * 走 GitHub release，国内网络可能需要在能直连的环境下构建一次。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const debug = process.argv.includes('--debug');

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) {
    console.error(`执行失败：${command} ${args.join(' ')}`);
    console.error(result.error.message);
    process.exit(1);
  }
  return result.status ?? 1;
};

const capture = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error) return null;
  return result.stdout?.trim() ?? '';
};

/** 找一个可用的 rustc：优先 `rustup` 的 default，其次 PATH 里的。 */
function resolveRustc() {
  const rustup = capture('rustup', ['which', 'rustc']);
  if (rustup && fs.existsSync(rustup)) return rustup;
  const which = process.platform === 'win32' ? 'where' : 'which';
  const found = capture(which, ['rustc']);
  const first = found?.split(/\r?\n/)[0];
  return first && fs.existsSync(first) ? first : null;
}

const rustc = resolveRustc();
if (!rustc) {
  console.error('找不到 rustc。请先安装 Rust（>= 1.95）：https://rustup.rs');
  process.exit(1);
}

const version = capture(rustc, ['--version']) ?? '';
const match = /(\d+)\.(\d+)\.(\d+)/.exec(version);
const [major, minor] = match ? [Number(match[1]), Number(match[2])] : [0, 0];
if (major === 0 || major < 1 || (major === 1 && minor < 95)) {
  console.error(`rustc 版本过低：${version}`);
  console.error('CADCraft 需要 rustc >= 1.95。升级：rustup update stable && rustup target add wasm32-unknown-unknown');
  process.exit(1);
}

const targets = capture('rustup', ['target', 'list', '--installed']) ?? '';
if (targets && !targets.includes('wasm32-unknown-unknown')) {
  console.error('缺少 wasm32-unknown-unknown 目标。安装：rustup target add wasm32-unknown-unknown');
  process.exit(1);
}

const trunk = capture(process.platform === 'win32' ? 'where' : 'which', ['trunk']);
if (!trunk) {
  console.error('找不到 trunk。安装：cargo install trunk（或下载 https://github.com/trunk-rs/trunk/releases 的预编译二进制放入 PATH）');
  process.exit(1);
}

console.log(`rustc: ${version}`);
console.log(`trunk: ${trunk}`);
console.log(`构建 ${debug ? 'debug' : 'release'} → ${path.join(repoRoot, 'dist')}`);

const status = run(trunk, ['build', debug ? '' : '--release'].filter(Boolean), { cwd: path.join(repoRoot, 'shell') });
if (status !== 0) {
  console.error('trunk 构建失败。');
  process.exit(status);
}

// 插件入口自检：plugin.json 的 entry 必须真的存在
const entry = path.join(repoRoot, 'dist', 'index.html');
if (!fs.existsSync(entry)) {
  console.error(`构建产物里没有 ${entry}，但 plugin.json 的 entry 指向它。`);
  process.exit(1);
}

const size = (file) => `${(fs.statSync(file).size / 1048576).toFixed(1)} MB`;
for (const name of fs.readdirSync(path.join(repoRoot, 'dist'))) {
  const file = path.join(repoRoot, 'dist', name);
  if (fs.statSync(file).isFile()) console.log(`  ${name}  ${size(file)}`);
}
console.log(`\n完成。${entry} 就绪；用 scripts/deploy-to-otools.ps1 同步到 otools 仓库即可本地试跑。`);
