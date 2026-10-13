'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const ExcelJS = require('exceljs');

const { QqBotAdapter } = require('../src/bot/qq-adapter');
const { SessionManager } = require('../src/bot/session-manager');
const { WechatBotServer } = require('../src/bot/server');

const templatesDir = path.join(__dirname, '..', 'src', 'templates');

test('QQ 机器人：白名单鉴权过滤', async () => {
  const adapter = new QqBotAdapter({
    enabled: true,
    whiteListUsers: [10001, '10002'],
    enableGroup: false
  });

  assert.equal(adapter.isUserAllowed(10001), true);
  assert.equal(adapter.isUserAllowed('10002'), true);
  assert.equal(adapter.isUserAllowed(99999), false);

  const openAdapter = new QqBotAdapter({
    enabled: true,
    whiteListUsers: []
  });
  assert.equal(openAdapter.isUserAllowed(99999), true);
  adapter.destroy();
  openAdapter.destroy();
});

test('QQ 机器人：私聊文本菜单交互与指令解析', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qq-test-text-'));
  try {
    const sm = new SessionManager({ tempDir });
    const sentMessages = [];

    const adapter = new QqBotAdapter({
      enabled: true,
      sessionManager: sm
    });

    // Mock API 调用
    adapter.callOneBotApi = async (action, params) => {
      sentMessages.push({ action, params });
      return { status: 'ok' };
    };

    // 1. 发送 "帮助"
    const eventHelp = {
      post_type: 'message',
      message_type: 'private',
      user_id: 12345,
      message: '帮助',
      raw_message: '帮助'
    };
    const resHelp = await adapter.handleOneBotEvent(eventHelp);
    assert.equal(resHelp.handled, true);
    assert.equal(sentMessages.length, 1);
    assert.equal(sentMessages[0].action, 'send_private_msg');
    assert.ok(sentMessages[0].params.message.includes('仓配数据助手'));

    // 2. 发送 "1" 选择送货单
    const event1 = {
      post_type: 'message',
      message_type: 'private',
      user_id: 12345,
      message: [{ type: 'text', data: { text: '1' } }]
    };
    await adapter.handleOneBotEvent(event1);
    assert.equal(sentMessages.length, 2);
    assert.ok(sentMessages[1].params.message.includes('送货单汇总'));

    adapter.destroy();
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('QQ 机器人：收到 Excel 文件自动识别并调用 upload_private_file 回传', async () => {
  const receiptPath = path.join(templatesDir, 'ReceiptNote.xlsx');
  if (!fs.existsSync(receiptPath)) return;

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qq-test-file-'));
  try {
    const sm = new SessionManager({ tempDir });
    const apiCalls = [];

    const adapter = new QqBotAdapter({
      enabled: true,
      sessionManager: sm
    });

    adapter.callOneBotApi = async (action, params) => {
      apiCalls.push({ action, params });
      return { status: 'ok' };
    };

    // 先发送 "1" 进入送货单模式
    await adapter.handleOneBotEvent({
      post_type: 'message',
      message_type: 'private',
      user_id: 88888,
      message: '1'
    });

    // 模拟发送文件消息 (OneBot 消息段格式)
    const eventFile = {
      post_type: 'message',
      message_type: 'private',
      user_id: 88888,
      message: [
        {
          type: 'file',
          data: {
            file_name: 'ReceiptNote.xlsx',
            file: receiptPath,
            path: receiptPath
          }
        }
      ]
    };

    const resFile = await adapter.handleOneBotEvent(eventFile);
    assert.equal(resFile.handled, true);

    // 验证是否调用了 upload_private_file
    const uploadCall = apiCalls.find((c) => c.action === 'upload_private_file');
    assert.ok(uploadCall, '应该调用 upload_private_file 上传生成的结果');
    assert.equal(uploadCall.params.user_id, 88888);
    assert.ok(fs.existsSync(uploadCall.params.file), '生成的文件应该真实存在于磁盘');

    adapter.destroy();
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('QQ 机器人：HTTP Webhook 端点 /qq 接收与响应', async () => {
  const botServer = new WechatBotServer({
    port: 39998,
    qq: {
      enabled: true,
      webhookPath: '/qq',
      onebotHttpUrl: 'http://127.0.0.1:3001'
    }
  });

  await botServer.start(39998);

  try {
    // 1. GET /qq 状态测试
    const getRes = await fetch('http://localhost:39998/qq');
    assert.equal(getRes.status, 200);
    const getJson = await getRes.json();
    assert.equal(getJson.service, 'QQ Bot OneBot Webhook');

    // 2. POST /qq 心跳事件
    const postHeartbeat = await fetch('http://localhost:39998/qq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_type: 'meta_event', meta_event_type: 'heartbeat' })
    });
    assert.equal(postHeartbeat.status, 200);
    const postJson = await postHeartbeat.json();
    assert.equal(postJson.status, 'ok');

    // 3. POST /qq 文本消息
    const postMsg = await fetch('http://localhost:39998/qq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        post_type: 'message',
        message_type: 'private',
        user_id: 123456,
        message: '帮助'
      })
    });
    assert.equal(postMsg.status, 200);
  } finally {
    await botServer.stop();
  }
});
