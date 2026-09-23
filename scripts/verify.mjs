#!/usr/bin/env node
/**
 * verify 一次性服务：运行单元测试 → 生产构建 → 启动本地静态服务并做 HTTP 冒烟，
 * 随后自行退出，退出码报告整体成败（0 成功，非 0 失败）。
 * 不依赖任何业务后端。
 */
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const rootDir = process.cwd();
const distDir = join(rootDir, 'dist');
const PORT = Number(process.env.PORT || 4173);

function run(cmd, args) {
  console.log(`\n▶ ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { stdio: 'inherit', cwd: rootDir });
}

// 异步运行（不能用 execFileSync：会阻塞本进程事件循环，
// 而 HTTP 服务就在同一进程里，会导致冒烟请求永远无法被受理）。
function runAsync(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', cwd: rootDir });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} 退出码 ${code}`))));
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = (req.url ?? '/').split('?')[0];
      if (url === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ok');
        return;
      }
      let rel = normalize(url).replace(/^(\.\.[/\\])+/, '');
      if (rel === '/' || rel === '.') rel = '/index.html';
      const filePath = join(distDir, rel);
      if (!filePath.startsWith(distDir)) {
        res.writeHead(403);
        res.end('forbidden');
        return;
      }
      try {
        const body = await readFile(filePath);
        res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' });
        res.end(body);
      } catch {
        // SPA 回退
        try {
          const body = await readFile(join(distDir, 'index.html'));
          res.writeHead(200, { 'Content-Type': MIME['.html'] });
          res.end(body);
        } catch {
          res.writeHead(503);
          res.end('dist missing');
        }
      }
    });
    server.on('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

async function main() {
  try {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    run(npm, ['run', 'test:run']);
    run(npm, ['run', 'build']);

    const server = await startStaticServer();
    console.log(`\n▶ 静态服务已在 http://127.0.0.1:${PORT} 启动，开始 HTTP 冒烟`);
    try {
      await runAsync(process.execPath, [join(rootDir, 'scripts/smoke.mjs'), `http://127.0.0.1:${PORT}`]);
    } finally {
      await new Promise((r) => server.close(r));
    }
    console.log('\n✅ verify 全部通过（测试 + 构建 + HTTP 冒烟）。');
    process.exit(0);
  } catch (e) {
    console.error('\n❌ verify 失败：', e?.message ?? e);
    process.exit(1);
  }
}

main();
