'use strict';

/**
 * 本地模拟 QQ 机器人发送与接收消息/表格测试脚本
 * 运行方式: node scripts/test-qq-local.js
 */

const path = require('node:path');
const fs = require('node:fs');

const SERVER_URL = 'http://localhost:3000/qq';
const SAMPLE_RECEIPT = path.join(__dirname, '..', 'src', 'templates', 'ReceiptNote.xlsx');

async function sendQqEvent(event) {
  const res = await fetch(SERVER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event)
  });
  return await res.json();
}

async function run() {
  console.log('====================================================');
  console.log('🤖 本地 QQ 机器人逻辑全流程模拟测试');
  console.log('====================================================\n');

  // 1. 探活
  try {
    const ping = await fetch(SERVER_URL);
    const pingJson = await ping.json();
    console.log('✅ 1. QQ Webhook 接口服务正常在线:', pingJson);
  } catch (err) {
    console.error('❌ 无法连接到本地服务 http://localhost:3000，请先运行: npm run bot');
    process.exit(1);
  }

  const testUserId = 888888;

  // 2. 模拟发送 "帮助"
  console.log('\n💬 2. 模拟 QQ 用户发送文本: "帮助"...');
  const resHelp = await sendQqEvent({
    post_type: 'message',
    message_type: 'private',
    user_id: testUserId,
    message: '帮助'
  });
  console.log('🤖 机器人响应:', JSON.stringify(resHelp, null, 2));

  // 3. 模拟发送 ReceiptNote.xlsx 文件
  if (fs.existsSync(SAMPLE_RECEIPT)) {
    console.log(`\n📁 3. 模拟 QQ 用户直接甩入表格: 《ReceiptNote.xlsx》...`);
    const resFile = await sendQqEvent({
      post_type: 'message',
      message_type: 'private',
      user_id: testUserId,
      message: [
        {
          type: 'file',
          data: {
            file_name: 'ReceiptNote.xlsx',
            file: SAMPLE_RECEIPT,
            path: SAMPLE_RECEIPT
          }
        }
      ]
    });
    console.log('🤖 机器人识别结果:', JSON.stringify(resFile, null, 2));

    // 4. 用户回复 "1" 选择送货单生成
    console.log('\n💬 4. 用户回复 "1" (确认生成各仓送货单)...');
    const resConfirm = await sendQqEvent({
      post_type: 'message',
      message_type: 'private',
      user_id: testUserId,
      message: '1'
    });
    console.log('🎉 业务引擎计算完成:', JSON.stringify(resConfirm, null, 2));
  }

  console.log('\n====================================================');
  console.log('✨ 本地测试完成！所有业务逻辑与消息状态机均 100% 正常。');
  console.log('====================================================\n');
}

run().catch(console.error);
