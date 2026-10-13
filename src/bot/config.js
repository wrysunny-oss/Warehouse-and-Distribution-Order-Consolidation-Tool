'use strict';

const fs = require('node:fs');
const path = require('node:path');

const CONFIG_FILE_NAME = 'wechat-bot-config.json';

function getConfigFilePath() {
  // 优先在项目根目录查找或写入
  return path.join(__dirname, '..', '..', CONFIG_FILE_NAME);
}

const DEFAULT_CONFIG = {
  enabled: false,
  corpId: '',         // 企业微信 CorpID (在企业微信后台 -> 我的企业 底部查看)
  agentId: '',        // 自建应用的 AgentId (在应用管理 -> 自建应用详情查看)
  secret: '',         // 自建应用的 Secret
  token: '',          // 接收消息的回调 Token (在应用详情 -> API接收消息处设置)
  encodingAESKey: '', // 接收消息的 EncodingAESKey (43位字符)
  port: 3000,         // 本地 Webhook 服务监听端口
  webhookPath: '/wechat',
  sessionTimeoutMinutes: 15
};

function loadBotConfig() {
  const filePath = getConfigFilePath();
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(content);
      return { ...DEFAULT_CONFIG, ...parsed };
    } catch (err) {
      console.warn('读取微信机器人配置文件失败，使用默认配置:', err.message);
    }
  }
  return { ...DEFAULT_CONFIG };
}

function saveBotConfig(config) {
  const filePath = getConfigFilePath();
  const merged = { ...loadBotConfig(), ...config };
  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

function isConfigured(config = loadBotConfig()) {
  return Boolean(
    config.corpId &&
    config.agentId &&
    config.secret &&
    config.token &&
    config.encodingAESKey
  );
}

module.exports = {
  DEFAULT_CONFIG,
  getConfigFilePath,
  loadBotConfig,
  saveBotConfig,
  isConfigured
};
