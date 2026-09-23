// HTTP 冒烟：对构建产物 dist 启动真实 HTTP 服务并发起请求，
// 校验首页与打包资源可达。任何失败以非零退出码结束。
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';

const DIST = join(process.cwd(), 'dist');
const PORT = Number(process.env.SMOKE_PORT ?? 8099);
const HOST = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('冒烟失败：dist/index.html 不存在，请先执行构建');
  process.exit(1);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${HOST}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const filePath = normalize(join(DIST, pathname));
  if (!filePath.startsWith(DIST) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(200, { 'Content-Type': MIME['.html'] });
    createReadStream(join(DIST, 'index.html')).pipe(res);
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' });
  createReadStream(filePath).pipe(res);
});

const failures = [];

async function check(path, expect) {
  const res = await fetch(`http://${HOST}:${PORT}${path}`);
  const body = await res.text();
  const problem = expect(body, res.status);
  if (problem) failures.push(`${path}: ${problem}`);
  console.log(`  ${res.status === 200 ? 'OK ' : 'ERR'} GET ${path} -> ${res.status} (${body.length} bytes)`);
}

server.listen(PORT, HOST, async () => {
  console.log(`冒烟服务已启动 http://${HOST}:${PORT}`);
  try {
    await check('/', (body, status) => {
      if (status !== 200) return `状态码 ${status}`;
      if (!body.includes('<div id="root">')) return '首页缺少 #root 挂载点';
      if (!body.includes('/src/main.tsx') && !body.includes('/assets/')) return '首页未引用应用资源';
      return null;
    });

    // 从首页解析出打包后的 JS 资源并验证可达
    const index = await (await fetch(`http://${HOST}:${PORT}/`)).text();
    const assetMatch = /src="([^"]+\.js)"/.exec(index);
    if (!assetMatch) {
      failures.push('/: 未能在首页找到 JS 资源引用');
    } else {
      await check(assetMatch[1], (body, status) => {
        if (status !== 200) return `状态码 ${status}`;
        if (body.length < 1000) return 'JS 资源体积异常偏小';
        return null;
      });
    }

    if (!index.includes('寄存器加权混合复核台')) {
      failures.push('/: 首页标题不匹配');
    }
  } catch (e) {
    failures.push(`请求异常：${e.message}`);
  } finally {
    server.close(() => {
      if (failures.length > 0) {
        console.error('\nHTTP 冒烟失败：');
        for (const f of failures) console.error(' - ' + f);
        process.exit(1);
      }
      console.log('\nHTTP 冒烟全部通过');
      process.exit(0);
    });
  }
});
