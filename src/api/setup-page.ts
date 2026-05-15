export function handleSetupPage(request: Request): Response {
  const origin = new URL(request.url).origin;
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Linode Guard Lite 一键安装</title>
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 820px; margin: 0 auto; padding: 32px 18px; line-height: 1.6; color: #111827; background: #f9fafb; }
    .card { background: white; border: 1px solid #e5e7eb; border-radius: 16px; padding: 22px; margin: 18px 0; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06); }
    label { display: block; font-weight: 700; margin: 12px 0 8px; }
    input { width: 100%; box-sizing: border-box; padding: 12px; border: 1px solid #d1d5db; border-radius: 10px; font-size: 15px; }
    button { border: 0; border-radius: 10px; padding: 13px 18px; margin: 8px 8px 8px 0; font-weight: 800; cursor: pointer; background: #2563eb; color: white; }
    button.secondary { background: #4b5563; }
    button:disabled { opacity: .65; cursor: not-allowed; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; background: #111827; color: #d1fae5; border-radius: 12px; padding: 14px; min-height: 120px; }
    .warn { color: #b45309; font-weight: 700; }
    .muted { color: #6b7280; }
    .ok { color: #047857; font-weight: 800; }
    details { margin-top: 14px; }
    summary { cursor: pointer; font-weight: 800; }
    code { background: #f3f4f6; padding: 2px 5px; border-radius: 6px; }
  </style>
</head>
<body>
  <h1>Linode Guard Lite 一键安装</h1>
  <p>这个页面会自动完成建表、默认设置、系统 jobs 和运行时密钥初始化。</p>
  <p class="muted">页面版本：one-click-setup-v4（自动配置 webhook，优化 Token 错误提示）</p>
  <p class="warn">先确认 Cloudflare Worker 已绑定 D1，Binding 变量名必须是 <code>DB</code>。</p>

  <div class="card">
    <label for="token">管理 Token</label>
    <input id="token" type="password" autocomplete="off" spellcheck="false" autocapitalize="off" placeholder="首次安装前：粘贴 BotFather 给你的 TELEGRAM_BOT_TOKEN" />
    <p class="muted">这里不是重新配置变量，而是验证你是部署者。首次安装前请输入 Cloudflare Secret 中已配置的 TELEGRAM_BOT_TOKEN；安装后请改用生成的 API_AUTH_TOKEN。</p>
  </div>

  <div class="card">
    <h2>安装方式</h2>
    <p class="ok">小白模式：下面高级选项全部留空，点击“一键安装”即可自动生成独立密钥。</p>
    <details>
      <summary>高级选项：手动指定 runtime secrets（可选）</summary>
      <p class="muted">留空 = 自动生成。只有首次安装且 D1 里还没有对应密钥时，手动输入才会生效。不要使用 Bot Token 充当这些值。</p>
      <label for="apiToken">API_AUTH_TOKEN（可选）</label>
      <input id="apiToken" type="text" autocomplete="off" spellcheck="false" autocapitalize="off" placeholder="留空自动生成，例如 lg_api_..." />
      <label for="webhookSecret">TELEGRAM_WEBHOOK_SECRET（可选）</label>
      <input id="webhookSecret" type="text" autocomplete="off" spellcheck="false" autocapitalize="off" placeholder="留空自动生成，例如 lg_wh_..." />
      <label for="encryptionKey">LINODE_TOKEN_ENCRYPTION_KEY（可选）</label>
      <input id="encryptionKey" type="text" autocomplete="off" spellcheck="false" autocapitalize="off" placeholder="留空自动生成，例如 lg_enc_..." />
    </details>
    <button id="installBtn" type="button">一键安装 / 初始化</button>
    <button id="checkBtn" class="secondary" type="button">自检</button>
  </div>

  <h2>结果</h2>
  <pre id="result">等待操作...</pre>

<script>
const origin = ${JSON.stringify(origin)};

function boot() {
  const installBtn = document.getElementById('installBtn');
  const checkBtn = document.getElementById('checkBtn');
  const result = document.getElementById('result');
  if (!installBtn || !checkBtn || !result) return;
  installBtn.addEventListener('click', oneClickInstall);
  checkBtn.addEventListener('click', checkAll);
  result.textContent = '页面已加载，可以开始安装。版本：one-click-setup-v4。';
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

function getToken() {
  return document.getElementById('token').value.trim();
}

function validateAscii(value, label) {
  if (value && !/^[\x20-\x7E]+$/.test(value)) throw new Error(label + ' 包含中文或全角字符，请只输入英文/数字/符号。');
}

function getManualSecrets() {
  const api = document.getElementById('apiToken').value.trim();
  const webhook = document.getElementById('webhookSecret').value.trim();
  const enc = document.getElementById('encryptionKey').value.trim();
  validateAscii(api, 'API_AUTH_TOKEN');
  validateAscii(webhook, 'TELEGRAM_WEBHOOK_SECRET');
  validateAscii(enc, 'LINODE_TOKEN_ENCRYPTION_KEY');
  const runtime_secrets = {};
  if (api) runtime_secrets.api_auth_token = api;
  if (webhook) runtime_secrets.telegram_webhook_secret = webhook;
  if (enc) runtime_secrets.linode_token_encryption_key = enc;
  return runtime_secrets;
}

async function oneClickInstall() {
  const btn = document.getElementById('installBtn');
  const result = document.getElementById('result');
  const token = getToken();
  if (!token) {
    result.textContent = '请先输入管理 Token：首次安装前填 BotFather 给你的 TELEGRAM_BOT_TOKEN；安装后填生成的 API_AUTH_TOKEN。';
    return;
  }
  try {
    validateAscii(token, '管理 Token');
    btn.disabled = true;
    result.textContent = '正在一键安装：建表、写入默认设置、初始化 jobs、生成 runtime secrets、配置 Telegram Webhook...';
    const data = await callApi('/api/v1/setup/initialize', 'POST', { runtime_secrets: getManualSecrets(), configure_telegram_webhook: true });
    result.textContent = formatInstallResult(data);
  } catch (err) {
    result.textContent = formatError(err);
  } finally {
    btn.disabled = false;
  }
}

async function checkAll() {
  const result = document.getElementById('result');
  try {
    const deployment = await callApi('/api/v1/diagnostics/deployment', 'GET');
    const jobs = await callApi('/api/v1/diagnostics/jobs', 'GET');
    result.textContent = JSON.stringify({ deployment, jobs }, null, 2);
  } catch (err) {
    result.textContent = formatError(err);
  }
}

async function callApi(path, method = 'POST', body) {
  const token = getToken();
  validateAscii(token, '管理 Token');
  const init = {
    method,
    headers: { 'Authorization': 'Bearer ' + token }
  };
  if (body && method !== 'GET') {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(origin + path, init);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(text); }
  if (!res.ok || json.ok === false) {
    const error = new Error((json.error && json.error.message) || '请求失败');
    error.code = json.error && json.error.code;
    error.payload = json;
    throw error;
  }
  return json;
}

function formatError(err) {
  if (err && err.code === 'UNAUTHORIZED') {
    return [
      '❌ 管理 Token 不正确。',
      '',
      '如果这是第一次全新安装：请填写 BotFather 给你的 TELEGRAM_BOT_TOKEN。',
      '如果已经安装/初始化过：请填写初始化结果里的 API_AUTH_TOKEN。',
      '',
      '如果忘记 API_AUTH_TOKEN：',
      '1. 打开 Cloudflare -> D1 -> linode-guard-lite -> 控制台',
      '2. 执行：SELECT value_json FROM settings WHERE key = \'runtime_secrets\';',
      '3. 复制里面的 api_auth_token 再回来填写。',
      '',
      '原始错误：',
      JSON.stringify(err.payload || { message: err.message }, null, 2)
    ].join(String.fromCharCode(10));
  }
  return String(err && err.message ? err.message : err);
}

function formatInstallResult(response) {
  const data = response.data || {};
  const values = data.runtime_secrets && data.runtime_secrets.values ? data.runtime_secrets.values : {};
  return [
    '✅ 一键安装完成',
    '',
    '请保存下面三个值：',
    'API_AUTH_TOKEN=' + (values.api_auth_token || ''),
    'TELEGRAM_WEBHOOK_SECRET=' + (values.telegram_webhook_secret || ''),
    'LINODE_TOKEN_ENCRYPTION_KEY=' + (values.linode_token_encryption_key || ''),
    '',
    'Telegram Webhook：' + formatWebhookStatus(data.telegram_webhook),
    '',
    '如果 Webhook 显示成功，直接给 bot 发送 /start；如果未手动设置 SUPER_ADMIN_TELEGRAM_ID，第一位发消息的人会自动绑定为管理员。',
    '',
    '后续进入 /setup 使用 API_AUTH_TOKEN，不要再使用 Bot Token。',
    '',
    '完整结果：',
    JSON.stringify(response, null, 2)
  ].join(String.fromCharCode(10));
}

function formatWebhookStatus(webhook) {
  if (!webhook || !webhook.attempted) return '未尝试自动配置';
  if (webhook.ok) return '✅ 已自动设置成功：' + webhook.webhook_url;
  return '⚠️ 自动设置失败：' + (webhook.error || '未知错误') + '。安装已完成，请检查 TELEGRAM_BOT_TOKEN 后重新点一键安装。';
}
</script>
</body>
</html>`;

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
