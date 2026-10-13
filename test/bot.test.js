'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const ExcelJS = require('exceljs');

const {
  getSignature,
  verifySignature,
  encryptMessage,
  decryptMessage,
  parseXmlTags
} = require('../src/bot/crypto');
const { SessionManager } = require('../src/bot/session-manager');
const { WechatBotServer } = require('../src/bot/server');
const { isConfigured } = require('../src/bot/config');

const templatesDir = path.join(__dirname, '..', 'src', 'templates');

test('微信加密与签名算法：加解密与验签完整性', () => {
  const token = 'mytesttoken123';
  const timestamp = '1700000000';
  const nonce = 'randomnonce999';
  const corpId = 'ww1234567890abcdef';
  // 43 位合法 Base64 编码 AES Key
  const encodingAESKey = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';

  const rawXml = '<xml><ToUserName>wxbot</ToUserName><FromUserName>user_01</FromUserName><Content>你好</Content></xml>';

  // 加密
  const encryptedBase64 = encryptMessage(encodingAESKey, corpId, rawXml);
  assert.ok(typeof encryptedBase64 === 'string' && encryptedBase64.length > 0);

  // 计算并验证签名
  const sig = getSignature(token, timestamp, nonce, encryptedBase64);
  assert.equal(verifySignature(token, timestamp, nonce, encryptedBase64, sig), true);
  assert.equal(verifySignature(token, timestamp, nonce, encryptedBase64, 'wrong_sig'), false);

  // 解密
  const decrypted = decryptMessage(encodingAESKey, corpId, encryptedBase64);
  assert.equal(decrypted.corpId, corpId);
  assert.equal(decrypted.message, rawXml);

  // XML 标签提取
  const tags = parseXmlTags(decrypted.message);
  assert.equal(tags.ToUserName, 'wxbot');
  assert.equal(tags.FromUserName, 'user_01');
  assert.equal(tags.Content, '你好');
});

test('会话状态机：菜单查询与重置状态', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-session-test-'));
  try {
    const sm = new SessionManager({ tempDir });
    const replyMenu = await sm.handleText('user_test', '帮助');
    assert.ok(replyMenu.text.includes('仓配数据助手'));

    const replyCancel = await sm.handleText('user_test', '重置');
    assert.ok(replyCancel.text.includes('已重置'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('会话状态机向导模式：指令开启送货单并提交文件直接生成', async () => {
  const receiptPath = path.join(templatesDir, 'ReceiptNote.xlsx');
  if (!fs.existsSync(receiptPath)) return;

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-session-flow-'));
  try {
    const sm = new SessionManager({ tempDir });

    // 1. 用户输入 "1"
    const step1 = await sm.handleText('user_flow', '1');
    assert.ok(step1.text.includes('送货单汇总'));

    // 2. 用户发送 ReceiptNote 文件
    const step2 = await sm.handleFile('user_flow', {
      filePath: receiptPath,
      fileName: 'ReceiptNote.xlsx'
    });
    assert.ok(step2.text.includes('成功生成') || step2.text.includes('处理完成'));
    assert.ok(step2.files && step2.files.length > 0);
    assert.ok(fs.existsSync(step2.files[0].filePath));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('会话状态机极速嗅探模式：直接发送实时库存表自动推导任务', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-session-sniff-'));
  try {
    const sm = new SessionManager({ tempDir });

    // 创建一个包含实时库存特征的临时表
    const invPath = path.join(tempDir, '实时库存表.xlsx');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sheet1');
    ws.addRow(['仓库名称', '货品名称', '良品可用']);
    ws.addRow(['上海仓', '大米5kg', 100]);
    await wb.xlsx.writeFile(invPath);

    // 用户在空闲状态直接发文件
    const reply = await sm.handleFile('user_auto', {
      filePath: invPath,
      fileName: '实时库存表.xlsx'
    });

    assert.ok(reply.text.includes('实时库存表'));
    assert.ok(reply.text.includes('旧表三'));

    // 会话状态已自动切换为 inventory 任务
    const session = sm.getSession('user_auto');
    assert.equal(session.taskType, 'inventory');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('微信服务器：URL 验证与健康检查端点', async () => {
  const token = 'testtoken888';
  const timestamp = '1700000001';
  const nonce = 'nonce123';
  const corpId = 'wwtestcorp123456';
  const encodingAESKey = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';

  const botServer = new WechatBotServer({
    corpId,
    token,
    encodingAESKey,
    port: 39999
  });

  await botServer.start(39999);

  try {
    // 1. 测试 /health
    const healthRes = await fetch('http://localhost:39999/health');
    assert.equal(healthRes.status, 200);
    const healthData = await healthRes.json();
    assert.equal(healthData.status, 'ok');

    // 2. 测试微信 URL 验证 (GET /wechat)
    const echostrEncrypted = encryptMessage(encodingAESKey, corpId, 'ECHO_TEST_STRING_OK');
    const signature = getSignature(token, timestamp, nonce, echostrEncrypted);

    const verifyUrl = `http://localhost:39999/wechat?msg_signature=${encodeURIComponent(signature)}&timestamp=${timestamp}&nonce=${nonce}&echostr=${encodeURIComponent(echostrEncrypted)}`;
    const verifyRes = await fetch(verifyUrl);
    assert.equal(verifyRes.status, 200);
    const verifyBody = await verifyRes.text();
    assert.equal(verifyBody, 'ECHO_TEST_STRING_OK');

    // 3. 错误签名拒绝
    const badVerifyUrl = `http://localhost:39999/wechat?msg_signature=BAD_SIG&timestamp=${timestamp}&nonce=${nonce}&echostr=${encodeURIComponent(echostrEncrypted)}`;
    const badRes = await fetch(badVerifyUrl);
    assert.equal(badRes.status, 403);
  } finally {
    await botServer.stop();
  }
});
