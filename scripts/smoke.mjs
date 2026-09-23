#!/usr/bin/env node
/**
 * 针对已运行的静态站点做 HTTP 冒烟：
 *   node scripts/smoke.mjs [baseUrl]
 * 默认 baseUrl 取 SMOKE_URL 或 http://127.0.0.1:4173。
 * 检查 /、/healthz、以及被 HTML 引用的 JS 资源均可取到且内容合理。
 * 退出码 0 = 通过，非 0 = 失败。
 */

const base = (process.argv[2] || process.env.SMOKE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');

async function get(path) {
  const res = await fetch(base + path);
  const text = await res.text();
  return { status: res.status, contentType: res.headers.get('content-type') ?? '', text };
}

async function main() {
  const checks = [];
  const record = (name, ok, detail = '') => {
    checks.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  };

  try {
    const root = await get('/');
    record('GET / 返回 200', root.status === 200, `status=${root.status}`);
    record('HTML 含挂载点 #root', root.text.includes('<div id="root">'));
    const assetMatch = root.text.match(/src="(\/assets\/[^"]+\.js)"/);
    record('HTML 引用打包后的 JS 资源', Boolean(assetMatch), assetMatch?.[1] ?? '未找到 /assets/*.js');
    if (assetMatch) {
      const js = await get(assetMatch[1]);
      record('JS 资源返回 200', js.status === 200, `status=${js.status}`);
      record('JS 资源非空且为脚本', js.text.length > 1000, `${js.text.length} bytes`);
    }
    const health = await get('/healthz');
    record('GET /healthz 返回 200', health.status === 200, `body=${health.text.trim()}`);
  } catch (e) {
    record('请求站点', false, e.message);
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n冒烟结果：${checks.length - failed.length}/${checks.length} 通过`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main();
