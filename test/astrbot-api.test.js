'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { WechatBotServer } = require('../src/bot/server');

const TEST_PORT = 39995;
const templatesDir = path.join(__dirname, '..', 'src', 'templates');

test('AstrBot 算力接口测试：健康探活、JSON 直传与自动嗅探', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astrbot-test-'));
  const server = new WechatBotServer({
    port: TEST_PORT,
    tempDir
  });

  await server.start(TEST_PORT);

  try {
    // 1. 测试 /health 接口包含 astrbotReady
    await t.test('/health 接口正确返回 AstrBot 就绪状态', async () => {
      const res = await fetch(`http://localhost:${TEST_PORT}/health`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.status, 'ok');
      assert.equal(data.astrbotReady, true);
    });

    // 2. 测试状态主页 / 呈现 AstrBot 控制台入口
    await t.test('状态主页 / 呈现 AstrBot 控制台入口', async () => {
      const res = await fetch(`http://localhost:${TEST_PORT}/`);
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes('AstrBot 智能网关'));
      assert.ok(html.includes('6185'));
    });

    const realReceiptPath = path.join(templatesDir, 'ReceiptNote.xlsx');
    const testReceiptPath = path.join(tempDir, 'ReceiptNote.xlsx');
    fs.copyFileSync(realReceiptPath, testReceiptPath);

    // 3. 测试 /api/upload 支持 JSON 传参 (taskType: 'delivery')
    await t.test('/api/upload 接收 JSON 文件路径并处理送货单', async () => {
      const payload = {
        userId: 'test_astrbot_user',
        taskType: 'delivery',
        filePath1: testReceiptPath
      };

      const res = await fetch(`http://localhost:${TEST_PORT}/api/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.taskType, 'delivery');
      assert.ok(Array.isArray(json.files));
      assert.ok(json.files.length > 0);
      assert.ok(json.files[0].fileName);
      assert.ok(json.files[0].filePath);
      assert.ok(fs.existsSync(json.files[0].filePath));
      assert.ok(json.files[0].downloadUrl);

      // 验证可以通过 /api/download 下载该文件
      const dlRes = await fetch(`http://localhost:${TEST_PORT}${json.files[0].downloadUrl}`);
      assert.equal(dlRes.status, 200);
      const buf = await dlRes.arrayBuffer();
      assert.ok(buf.byteLength > 0);
    });

    // 4. 测试 /api/upload 支持 taskType: 'auto' 自动表头嗅探
    await t.test('/api/upload taskType 为 auto 时智能识别为送货单并处理', async () => {
      const payload = {
        userId: 'test_astrbot_auto',
        taskType: 'auto',
        filePath1: testReceiptPath
      };

      const res = await fetch(`http://localhost:${TEST_PORT}/api/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.taskType, 'delivery');
      assert.ok(json.files.length > 0);
    });

  } finally {
    await server.stop();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
