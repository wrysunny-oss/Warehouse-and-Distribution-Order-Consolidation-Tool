'use strict';

const http = require('node:http');
const url = require('node:url');
const path = require('node:path');
const fs = require('node:fs');

const { loadBotConfig, isConfigured } = require('./config');
const { loadQqConfig } = require('./qq-config');
const { verifySignature, decryptMessage, parseXmlTags } = require('./crypto');
const { WechatApiClient } = require('./wechat-api');
const { SessionManager } = require('./session-manager');
const { QqBotAdapter } = require('./qq-adapter');

const LOG_FILE = path.join(__dirname, '../../bot.log');
function botLog(...args) {
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  const str = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
  const line = `[${time}] ${str}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line, 'utf8');
  } catch {}
  console.log(...args);
}

class WechatBotServer {
  constructor(customConfig = {}) {
    this.customConfig = customConfig;
    this.config = { ...loadBotConfig(), ...customConfig };
    this.apiClient = new WechatApiClient(this.config);
    this.qqConfig = { ...loadQqConfig(), ...(customConfig.qq || {}) };
    this.sessionManager = new SessionManager({
      timeoutMinutes: this.config.sessionTimeoutMinutes || 15
    });
    this.qqAdapter = new QqBotAdapter({
      ...this.qqConfig,
      sessionManager: this.sessionManager
    });
    this.server = null;
  }

  start(port = this.config.port || 3000) {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));
      this.server.listen(port, () => {
        console.log(`[WechatBot] 机器人后台服务已在 http://localhost:${port} 启动`);
        resolve(this.server);
      });
      this.server.on('error', reject);
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (this.qqAdapter) {
        this.qqAdapter.destroy();
      }
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  async handleRequest(req, res) {
    // 每次请求动态同步最新配置，同时保留外部传入配置
    this.config = { ...loadBotConfig(), ...this.customConfig };
    this.apiClient.updateConfig(this.config);
    this.qqConfig = { ...loadQqConfig(), ...(this.customConfig.qq || {}) };
    this.qqAdapter.updateConfig(this.qqConfig);

    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    if (pathname !== '/health') {
      botLog(`[BotServer] 🌐 HTTP ${req.method} ${pathname}`);
    }

    // 1. 探活接口
    if (pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        status: 'ok',
        wechatConfigured: isConfigured(this.config),
        qqEnabled: Boolean(this.qqConfig.enabled),
        uptime: process.uptime()
      }));
      return;
    }

    // 2. 状态主页
    if (pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      const wechatConfigured = isConfigured(this.config);
      const qqEnabled = Boolean(this.qqConfig.enabled);
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>仓配订单汇总工具 - 机器人与网页服务控制台</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; padding: 24px; background: #f8fafc; color: #1e293b; max-width: 800px; margin: 0 auto; line-height: 1.6; }
            .card { background: white; border-radius: 12px; padding: 24px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); margin-bottom: 20px; }
            .badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; font-weight: 600; font-size: 14px; }
            .badge-green { background: #dcfce7; color: #15803d; }
            .badge-amber { background: #fef3c7; color: #b45309; }
            .badge-blue { background: #dbeafe; color: #1d4ed8; }
            .btn { display: inline-block; background: #166534; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 10px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 16px 0; }
            @media (max-width: 600px) { .grid { grid-template-columns: 1fr; } }
            .subcard { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; }
            code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>🤖 仓配订单汇总小助手 · 多平台服务控制台</h2>
            <p>已就绪！团队成员可通过 <strong>QQ 机器人聊天</strong>、<strong>网页直传</strong>、或 <strong>微信</strong> 快速处理 Excel 单据。</p>
            
            <div class="grid">
              <div class="subcard">
                <h3>🐧 QQ 机器人 (OneBot v11)</h3>
                <p>状态：<span class="badge ${qqEnabled ? 'badge-blue' : 'badge-amber'}">${qqEnabled ? '已启用 (支持好友/群聊甩文件)' : '未启用'}</span></p>
                <p>回调路径：<code>${this.qqConfig.webhookPath || '/qq'}</code></p>
                <p>NapCat 接口：<code>${this.qqConfig.onebotHttpUrl || 'http://127.0.0.1:3001'}</code></p>
                <p style="font-size:12px;color:#64748b;">支持手机/电脑 QQ 直接将 Excel 发送给机器人，自动识别并回传结果。</p>
              </div>

              <div class="subcard">
                <h3>💬 微信 / 企业微信自建应用</h3>
                <p>状态：<span class="badge ${wechatConfigured ? 'badge-green' : 'badge-amber'}">${wechatConfigured ? '已配置' : '等待填写'}</span></p>
                <p>回调路径：<code>${this.config.webhookPath || '/wechat'}</code></p>
                <p style="font-size:12px;color:#64748b;">支持企业微信文字交互与网页端互联推送。</p>
              </div>
            </div>

            <p><a href="/upload" class="btn">📱 打开全功能表格直传网页 (手机/电脑通用)</a></p>
          </div>
        </body>
        </html>
      `);
      return;
    }

    // 3. 手机/电脑网页直传页面 (GET /upload)
    if (pathname === '/upload') {
      return this.renderMobileUploadPage(req, res, parsedUrl.query);
    }

    // 4. 网页文件上传与生成 API (POST /api/upload)
    if (pathname === '/api/upload' && req.method === 'POST') {
      return this.handleWebUpload(req, res);
    }

    // 5. 文件下载 API (GET /api/download)
    if (pathname === '/api/download') {
      return this.handleFileDownload(req, res, parsedUrl.query);
    }

    // 6. 企业微信 Webhook 路由
    if (pathname === (this.config.webhookPath || '/wechat')) {
      if (req.method === 'GET') {
        return this.handleUrlVerification(parsedUrl.query, res);
      }
      if (req.method === 'POST') {
        return this.handleWebhookMessage(parsedUrl.query, req, res);
      }
    }

    // 7. QQ 机器人 (OneBot v11) Webhook 路由
    if (pathname === (this.qqConfig.webhookPath || '/qq')) {
      if (req.method === 'POST') {
        return this.handleQqWebhook(req, res);
      }
      if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          status: 'ok',
          service: 'QQ Bot OneBot Webhook',
          configured: Boolean(this.qqConfig.enabled),
          onebotHttpUrl: this.qqConfig.onebotHttpUrl
        }));
        return;
      }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  }

  /**
   * 渲染手机微信内直传页面
   */
  renderMobileUploadPage(req, res, query) {
    const user = query.user || 'LiShiDi';
    const task = query.task || 'delivery';

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
        <title>仓配订单汇总小助手 - 手机快速上传</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f1f5f9; color: #0f172a; padding: 16px; padding-bottom: 40px; }
          .header { text-align: center; margin-bottom: 20px; padding: 16px 0; }
          .title { font-size: 20px; font-weight: 700; color: #166534; display: flex; align-items: center; justify-content: center; gap: 8px; }
          .subtitle { font-size: 13px; color: #64748b; margin-top: 4px; }
          .card { background: white; border-radius: 16px; padding: 20px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); margin-bottom: 16px; }
          .label { font-size: 14px; font-weight: 600; color: #334155; margin-bottom: 8px; display: block; }
          .tabs { display: flex; gap: 6px; margin-bottom: 16px; overflow-x: auto; padding-bottom: 4px; }
          .tab { padding: 8px 12px; border-radius: 8px; font-size: 13px; font-weight: 600; background: #e2e8f0; color: #475569; border: none; cursor: pointer; white-space: nowrap; flex: 1; text-align: center; }
          .tab.active { background: #166534; color: white; }
          .file-box { border: 2px dashed #cbd5e1; border-radius: 12px; padding: 20px 12px; text-align: center; background: #f8fafc; cursor: pointer; margin-bottom: 16px; position: relative; }
          .file-box input[type="file"] { position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%; cursor: pointer; }
          .file-box.has-file { border-color: #22c55e; background: #f0fdf4; }
          .file-name { font-size: 14px; color: #166534; font-weight: 600; word-break: break-all; margin-top: 6px; }
          .file-hint { font-size: 12px; color: #94a3b8; }
          .btn-submit { width: 100%; background: #166534; color: white; padding: 14px; border-radius: 12px; font-size: 16px; font-weight: 600; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: opacity 0.2s; }
          .btn-submit:disabled { opacity: 0.6; cursor: not-allowed; }
          .result-card { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px; margin-top: 16px; display: none; }
          .result-title { font-size: 15px; font-weight: 700; color: #166534; margin-bottom: 6px; }
          .result-text { font-size: 13px; color: #334155; line-height: 1.5; margin-bottom: 12px; }
          .download-link { display: block; background: #22c55e; color: white; text-align: center; padding: 10px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600; margin-top: 8px; }
          .tip { font-size: 12px; color: #64748b; margin-top: 12px; text-align: center; line-height: 1.5; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">🤖 仓配订单汇总小助手</div>
          <div class="subtitle">微信端快速表格处理与结果下载</div>
        </div>

        <div class="card">
          <div class="tabs">
            <button type="button" class="tab ${task === 'delivery' ? 'active' : ''}" onclick="selectTask('delivery')">送货单</button>
            <button type="button" class="tab ${task === 'inventory' ? 'active' : ''}" onclick="selectTask('inventory')">库存更新</button>
            <button type="button" class="tab ${task === 'procurement' ? 'active' : ''}" onclick="selectTask('procurement')">采购需求</button>
            <button type="button" class="tab ${task === 'invoice' ? 'active' : ''}" onclick="selectTask('invoice')">开票通知</button>
            <button type="button" class="tab ${task === 'platform-fee' ? 'active' : ''}" onclick="selectTask('platform-fee')">费用核销</button>
          </div>

          <form id="uploadForm">
            <input type="hidden" id="userId" name="userId" value="${user}">
            <input type="hidden" id="taskType" name="taskType" value="${task}">

            <div id="fileArea1">
              <label class="label" id="label1">送货单 / 入库明细 Excel</label>
              <div class="file-box" id="box1">
                <input type="file" id="file1" name="file1" accept=".xlsx,.xls,.csv" onchange="fileChanged(1)">
                <div>📄 点击选择表格文件</div>
                <div class="file-hint">支持从微信聊天记录或手机本地选取</div>
                <div class="file-name" id="name1"></div>
              </div>
            </div>

            <div id="fileArea2">
              <label class="label" id="label2">旧表三 Excel (包含良品可用)</label>
              <div class="file-box" id="box2">
                <input type="file" id="file2" name="file2" accept=".xlsx,.xls,.csv" onchange="fileChanged(2)">
                <div>📄 点击选择旧表三</div>
                <div class="file-hint">支持从微信聊天记录选取</div>
                <div class="file-name" id="name2"></div>
              </div>
            </div>

            <button type="button" id="submitBtn" class="btn-submit" onclick="submitFiles()">🚀 立即生成并导出</button>
          </form>

          <div id="resultCard" class="result-card">
            <div class="result-title">🎉 处理成功！</div>
            <div class="result-text" id="resultText"></div>
            <div id="downloadLinks"></div>
          </div>

          <div class="tip">
            💡 提示：生成完毕后，微信小助手也会将做好的 Excel 附件直接同步推送到您的微信对话中！
          </div>
        </div>

        <script>
          let currentTask = '${task}';
          function selectTask(task) {
            currentTask = task;
            document.getElementById('taskType').value = task;
            document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
            event.target.classList.add('active');
            updateUI();
          }

          function updateUI() {
            const area1 = document.getElementById('fileArea1');
            const area2 = document.getElementById('fileArea2');
            const label1 = document.getElementById('label1');
            const label2 = document.getElementById('label2');

            if (currentTask === 'delivery') {
              area1.style.display = 'block';
              area2.style.display = 'block';
              label1.innerText = '1. 送货单 / 入库明细 Excel (必选)';
              label2.innerText = '2. 货品字典 Excel (可选，默认使用系统内置)';
            } else if (currentTask === 'inventory') {
              area1.style.display = 'block';
              area2.style.display = 'block';
              label1.innerText = '1. 实时库存表 Excel (必选)';
              label2.innerText = '2. 旧表三 Excel (必选)';
            } else if (currentTask === 'procurement') {
              area1.style.display = 'block';
              area2.style.display = 'none';
              label1.innerText = 'ReceiptNote 入库单 / 表三 Excel (必选)';
            } else if (currentTask === 'invoice') {
              area1.style.display = 'block';
              area2.style.display = 'none';
              label1.innerText = '天猫超市对账单流水 Excel (必选)';
            } else if (currentTask === 'platform-fee') {
              area1.style.display = 'block';
              area2.style.display = 'none';
              label1.innerText = '平台费用流水明细 Excel / CSV (必选)';
            }
          }
          updateUI();

          function fileChanged(idx) {
            const input = document.getElementById('file' + idx);
            const nameEl = document.getElementById('name' + idx);
            const box = document.getElementById('box' + idx);
            if (input.files && input.files[0]) {
              nameEl.innerText = '已选择：' + input.files[0].name;
              box.classList.add('has-file');
            } else {
              nameEl.innerText = '';
              box.classList.remove('has-file');
            }
          }

          async function submitFiles() {
            const file1 = document.getElementById('file1').files[0];
            const file2 = document.getElementById('file2').files[0];

            if (!file1 && (currentTask !== 'delivery' && !file2)) {
              alert('请至少选择一个表格文件');
              return;
            }

            const btn = document.getElementById('submitBtn');
            btn.disabled = true;
            btn.innerText = '⏳ 正在处理中，请稍候...';

            const formData = new FormData();
            formData.append('userId', document.getElementById('userId').value);
            formData.append('taskType', currentTask);
            if (file1) formData.append('file1', file1);
            if (file2) formData.append('file2', file2);

            try {
              const res = await fetch('/api/upload', { method: 'POST', body: formData });
              const json = await res.json();
              btn.disabled = false;
              btn.innerText = '🚀 立即生成并导出';

              if (!json.success) {
                alert('处理失败：' + (json.error || '未知错误'));
                return;
              }

              const resultCard = document.getElementById('resultCard');
              const resultText = document.getElementById('resultText');
              const downloadLinks = document.getElementById('downloadLinks');
              resultCard.style.display = 'block';
              resultText.innerText = json.text;
              downloadLinks.innerHTML = '';

              (json.files || []).forEach(f => {
                const a = document.createElement('a');
                a.className = 'download-link';
                a.href = f.downloadUrl;
                a.innerText = '📥 下载 ' + f.fileName;
                downloadLinks.appendChild(a);
              });
            } catch (err) {
              btn.disabled = false;
              btn.innerText = '🚀 立即生成并导出';
              alert('请求失败: ' + err.message);
            }
          }
        </script>
      </body>
      </html>
    `);
  }

  /**
   * 处理网页端上传并触发业务生成
   */
  async handleWebUpload(req, res) {
    try {
      const responseObj = new Response(req, { headers: req.headers });
      const formData = await responseObj.formData();

      const userId = formData.get('userId') || 'LiShiDi';
      const taskType = formData.get('taskType') || 'delivery';
      const file1 = formData.get('file1');
      const file2 = formData.get('file2');

      const userDir = this.sessionManager.getUserDir(userId);

      let path1 = '';
      let path2 = '';

      if (file1 && typeof file1 === 'object' && file1.name) {
        path1 = path.join(userDir, file1.name);
        fs.writeFileSync(path1, Buffer.from(await file1.arrayBuffer()));
      }
      if (file2 && typeof file2 === 'object' && file2.name) {
        path2 = path.join(userDir, file2.name);
        fs.writeFileSync(path2, Buffer.from(await file2.arrayBuffer()));
      }

      const session = this.sessionManager.getSession(userId);
      session.taskType = taskType;

      if (taskType === 'delivery') {
        session.files.receiptFilePath = path1;
        if (path2) session.files.productFilePath = path2;
      } else if (taskType === 'inventory') {
        session.files.inventoryFilePaths = [path1].filter(Boolean);
        session.files.table3FilePath = path2;
      } else if (taskType === 'procurement') {
        session.files.inputFilePath = path1;
      } else if (taskType === 'invoice') {
        session.files.reconciliationFilePaths = [path1].filter(Boolean);
      } else if (taskType === 'platform-fee') {
        session.files.feeFilePath = path1;
      }

      console.log(`[WechatBot] 📱 网页端触发任务: [${taskType}], 用户: [${userId}]`);
      const result = await this.sessionManager.tryExecuteTask(session);

      const filesWithDownload = (result.files || []).map((f) => ({
        fileName: f.fileName,
        downloadUrl: `/api/download?file=${encodeURIComponent(f.filePath)}&name=${encodeURIComponent(f.fileName)}`
      }));

      // 异步通过微信推送到用户手机对话中
      if (result.files && result.files.length) {
        (async () => {
          try {
            await this.apiClient.sendTextMessage(userId, `🎉 ${result.text}`);
            for (const f of result.files) {
              const mediaId = await this.apiClient.uploadMedia(f.filePath, 'file');
              await this.apiClient.sendFileMessage(userId, mediaId);
            }
          } catch (err) {
            console.warn('[WechatBot] 推送文件至企微会话提示:', err.message);
          }
        })();
      }

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        success: true,
        text: result.text,
        files: filesWithDownload
      }));
    } catch (err) {
      console.error('[WechatBot] 网页上传处理失败:', err);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
  }

  /**
   * 处理生成文件直接下载
   */
  handleFileDownload(req, res, query) {
    const filePath = query.file;
    const downloadName = query.name || path.basename(filePath || 'result.xlsx');

    if (!filePath || !fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('文件不存在或已失效');
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(downloadName)}"`
    });
    fs.createReadStream(filePath).pipe(res);
  }

  /**
   * 响应企业微信验证 URL 请求 (GET)
   */
  handleUrlVerification(query, res) {
    const { msg_signature, timestamp, nonce, echostr } = query;
    if (!msg_signature || !timestamp || !nonce || !echostr) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Missing URL parameters');
      return;
    }

    const valid = verifySignature(this.config.token, timestamp, nonce, echostr, msg_signature);
    if (!valid) {
      console.warn('[WechatBot] URL 签名校验失败');
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden: Signature mismatch');
      return;
    }

    try {
      const decrypted = decryptMessage(this.config.encodingAESKey, this.config.corpId, echostr);
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(decrypted.message);
    } catch (err) {
      console.error('[WechatBot] URL 验证解密失败:', err.message);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Decryption failed: ${err.message}`);
    }
  }

  /**
   * 响应企业微信消息回调 (POST)
   */
  async handleWebhookMessage(query, req, res) {
    const { msg_signature, timestamp, nonce } = query;
    const host = req.headers.host || 'localhost:3000';
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const baseUrl = `${proto}://${host}`;

    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('success');

      try {
        botLog(`[WechatBot] 📨 收到企业微信 Webhook POST 回调 (数据大小: ${body.length} 字节)`);
        const outerXml = parseXmlTags(body);
        const encryptedBase64 = outerXml.Encrypt;
        if (!encryptedBase64) {
          botLog('[WechatBot] ⚠️ Webhook 请求体中未找到 Encrypt 密文字段');
          return;
        }

        const valid = verifySignature(this.config.token, timestamp, nonce, encryptedBase64, msg_signature);
        if (!valid) {
          botLog('[WechatBot] ⚠️ 接收消息签名校验失败');
          return;
        }

        const { message } = decryptMessage(this.config.encodingAESKey, this.config.corpId, encryptedBase64);
        const msgXml = parseXmlTags(message);

        const fromUser = msgXml.FromUserName;
        const msgType = msgXml.MsgType;

        if (!fromUser) {
          botLog('[WechatBot] ⚠️ 解密后的 XML 中未找到 FromUserName');
          return;
        }

        await this.dispatchMessage(fromUser, msgType, msgXml, baseUrl);
      } catch (err) {
        botLog('[WechatBot] 处理消息异常:', err.message || err);
      }
    });
  }

  /**
   * 异步处理用户消息并调用企微 API 回传结果
   */
  async dispatchMessage(fromUser, msgType, msgXml, baseUrl = '') {
    botLog(`[WechatBot] 📩 收到来自用户 [${fromUser}] 的消息, 类型: [${msgType}]`);
    try {
      if (msgType === 'text') {
        const content = msgXml.Content || '';
        botLog(`[WechatBot] 📝 文本内容: "${content}"`);
        const reply = await this.sessionManager.handleText(fromUser, content);

        let finalReplyText = reply.text || '';
        // 自动附带手机微信内一键直传链接
        if (baseUrl) {
          const uploadLink = `${baseUrl}/upload?user=${encodeURIComponent(fromUser)}`;
          finalReplyText += `\n\n👉 手机微信选文件直传：\n${uploadLink}`;
        }

        if (finalReplyText) {
          botLog(`[WechatBot] 💬 回复用户文本提示...`);
          await this.apiClient.sendTextMessage(fromUser, finalReplyText);
        }
        if (reply.files && reply.files.length) {
          for (const f of reply.files) {
            botLog(`[WechatBot] 📤 上传并回传文件: ${f.fileName}...`);
            const mediaId = await this.apiClient.uploadMedia(f.filePath, 'file');
            await this.apiClient.sendFileMessage(fromUser, mediaId);
          }
        }
      } else if (msgType === 'file') {
        const mediaId = msgXml.MediaId;
        const rawFileName = msgXml.FileName || `file_${Date.now()}.xlsx`;
        botLog(`[WechatBot] 📎 收到文件素材: "${rawFileName}", MediaId: ${mediaId}`);
        const userDir = this.sessionManager.getUserDir(fromUser);
        const localFilePath = path.join(userDir, rawFileName);

        botLog(`[WechatBot] ⏳ 正在从腾讯服务器下载文件...`);
        const downloaded = await this.apiClient.downloadMedia(mediaId, localFilePath);
        const effectivePath = typeof downloaded === 'object' ? downloaded.filePath : localFilePath;
        const effectiveName = typeof downloaded === 'object' && downloaded.fileName ? downloaded.fileName : rawFileName;
        botLog(`[WechatBot] ✅ 文件下载完成: ${effectivePath}`);

        botLog(`[WechatBot] ⚙️ 正在分析表格并执行对应业务...`);
        const reply = await this.sessionManager.handleFile(fromUser, {
          filePath: effectivePath,
          fileName: effectiveName
        });

        if (reply.text) {
          botLog(`[WechatBot] 💬 回复用户: "${reply.text.slice(0, 50)}..."`);
          await this.apiClient.sendTextMessage(fromUser, reply.text);
        }
        if (reply.files && reply.files.length) {
          for (const f of reply.files) {
            botLog(`[WechatBot] 📤 上传生成结果文件: ${f.fileName}...`);
            const uploadedMediaId = await this.apiClient.uploadMedia(f.filePath, 'file');
            await this.apiClient.sendFileMessage(fromUser, uploadedMediaId);
            botLog(`[WechatBot] 🎉 成功将文件推送到用户微信！`);
          }
        }
      } else if (msgType === 'link') {
        botLog(`[WechatBot] 🔗 收到链接消息: ${msgXml.Title} (${msgXml.Url})`);
        await this.apiClient.sendTextMessage(
          fromUser,
          `收到链接《${msgXml.Title || '未命名'}》。\n目前机器人需要接收真实的 .xlsx 格式文件。\n\n👉 您也可以点击下方链接直接在微信内选表格上传：\n${baseUrl}/upload?user=${encodeURIComponent(fromUser)}`
        );
      } else {
        botLog(`[WechatBot] ℹ️ 收到其他类型消息 [${msgType}]: ${JSON.stringify(msgXml)}`);
        await this.apiClient.sendTextMessage(
          fromUser,
          `已收到您的消息（类型：${msgType}）。\n如需处理表格，点击下方链接即可在手机微信中快速选取文件上传：\n${baseUrl}/upload?user=${encodeURIComponent(fromUser)}`
        );
      }
    } catch (err) {
      botLog(`[WechatBot] ❌ 处理或回复用户 ${fromUser} 失败: ${err.message}`);
      try {
        await this.apiClient.sendTextMessage(fromUser, `❌ 处理失败: ${err.message}`);
      } catch {}
    }
  }

  /**
   * 处理 QQ 机器人 (OneBot v11) Webhook 回调
   */
  async handleQqWebhook(req, res) {
    try {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const raw = Buffer.concat(chunks).toString('utf8');
      botLog(`[QQBot] 📨 收到 OneBot Webhook POST 回调 (数据大小: ${raw.length} 字节)`);

      let event = {};
      try {
        event = JSON.parse(raw);
      } catch (parseErr) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ status: 'error', message: 'Invalid JSON body: ' + parseErr.message }));
        return;
      }

      const result = await this.qqAdapter.handleOneBotEvent(event);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ status: 'ok', result }));
    } catch (err) {
      botLog(`[QQBot] ❌ 处理 OneBot 回调异常: ${err.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ status: 'error', message: err.message }));
    }
  }
}

// 支持直接通过 node src/bot/server.js 独立运行
if (require.main === module) {
  const serverInstance = new WechatBotServer();
  serverInstance.start().catch((err) => {
    console.error('启动服务失败:', err);
    process.exit(1);
  });
}

module.exports = {
  WechatBotServer
};
