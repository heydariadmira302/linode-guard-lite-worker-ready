export function handleSetupPage(request: Request): Response {
  const origin = new URL(request.url).origin;
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Linode Guard Lite 初始化安装</title>
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 760px; margin: 0 auto; padding: 32px 18px; line-height: 1.6; color: #111827; background: #f9fafb; }
    .card { background: white; border: 1px solid #e5e7eb; border-radius: 16px; padding: 22px; margin: 18px 0; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06); }
    label { display: block; font-weight: 700; margin-bottom: 8px; }
    input { width: 100%; box-sizing: border-box; padding: 12px; border: 1px solid #d1d5db; border-radius: 10px; font-size: 15px; }
    button { border: 0; border-radius: 10px; padding: 12px 16px; margin: 8px 8px 8px 0; font-weight: 700; cursor: pointer; background: #2563eb; color: white; }
    button.secondary { background: #4b5563; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; background: #111827; color: #d1fae5; border-radius: 12px; padding: 14px; min-height: 80px; }
    .warn { color: #b45309; font-weight: 700; }
    .muted { color: #6b7280; }
  </style>
</head>
<body>
  <h1>Linode Guard Lite 初始化安装</h1>
  <p>这个页面用于在 Worker 已部署、D1 已绑定后，通过网页按钮激活初始化。你不用手动复制 SQL，也不用手动填写数据库表。</p>
  <p class="warn">先确认 Cloudflare Worker 已绑定 D1，Binding 变量名必须是 DB。</p>

  <div class="card">
    <label for="token">管理 Token</label>
    <input id="token" type="password" autocomplete="off" placeholder="输入你初始化后生成的 API_AUTH_TOKEN；如果还没生成，可先用 TELEGRAM_BOT_TOKEN 进入 /setup initialize" />
    <p class="muted">首次 initialize 会自动生成独立的 API_AUTH_TOKEN、Telegram webhook secret 和加密密钥，并保存到 D1。Token 只在当前浏览器里用于请求本 Worker，不会保存到服务器。</p>
  </div>

  <div class="card">
    <h2>第 1 步：初始化数据库表结构</h2>
    <p>点击后会调用 <code>/api/v1/setup/schema</code>，由 Worker 自动执行内置 schema，创建 D1 表。</p>
    <button onclick="callApi('/api/v1/setup/schema')">初始化数据库表结构</button>
  </div>

  <div class="card">
    <h2>第 2 步：初始化默认设置和系统 jobs</h2>
    <p>点击后会调用 <code>/api/v1/setup/initialize</code>，写入默认 settings、jobs 和管理员保活初始记录。</p>
    <button onclick="callApi('/api/v1/setup/initialize')">初始化默认设置和系统 jobs</button>
  </div>

  <div class="card">
    <h2>第 3 步：自检</h2>
    <button class="secondary" onclick="callApi('/api/v1/diagnostics/deployment', 'GET')">检查部署状态</button>
    <button class="secondary" onclick="callApi('/api/v1/diagnostics/jobs', 'GET')">检查 jobs</button>
  </div>

  <h2>结果</h2>
  <pre id="result">等待操作...</pre>

<script>
const origin = ${JSON.stringify(origin)};
async function callApi(path, method = 'POST') {
  const token = document.getElementById('token').value.trim();
  const result = document.getElementById('result');
  if (!token) {
    result.textContent = '请先输入管理 Token（初始化后生成的 API_AUTH_TOKEN，或首次初始化前使用 TELEGRAM_BOT_TOKEN）';
    return;
  }
  result.textContent = '请求中...';
  try {
    const res = await fetch(origin + path, {
      method,
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const text = await res.text();
    try {
      result.textContent = JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      result.textContent = text;
    }
  } catch (err) {
    result.textContent = String(err && err.message ? err.message : err);
  }
}
</script>
</body>
</html>`;

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
