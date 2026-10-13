'use strict';

const fs = require('node:fs');
const path = require('node:path');

const QQ_CONFIG_FILE_NAME = 'qq-bot-config.json';

function getQqConfigFilePath() {
  return path.join(__dirname, '..', '..', QQ_CONFIG_FILE_NAME);
}

const DEFAULT_QQ_CONFIG = {
  enabled: true,
  // OneBot v11 HTTP API 基础地址（NapCat 默认监听 3001）
  onebotHttpUrl: 'http://127.0.0.1:3001',
  // OneBot v11 正向 WebSocket 地址（可选，配置后会自动建立长连接）
  onebotWsUrl: '',
  // 接收 NapCat HTTP POST Webhook 回调的路径
  webhookPath: '/qq',
  // 本地服务端口（与 Web 共享 3000）
  port: 3000,
  // 用户白名单（QQ 号数组，如 [123456, 789012]，若为空数组则允许所有好友）
  whiteListUsers: [],
  // 是否允许在 QQ 群中响应
  enableGroup: true,
  // 群白名单（群号数组，若为空数组则允许所有群）
  whiteListGroups: [],
  // 外部访问基础域名（可选，用于生成外网直链）
  publicBaseUrl: ''
};

function loadQqConfig() {
  const filePath = getQqConfigFilePath();
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(content);
      return { ...DEFAULT_QQ_CONFIG, ...parsed };
    } catch (err) {
      console.warn('读取 QQ 机器人配置文件失败，使用默认配置:', err.message);
    }
  }
  return { ...DEFAULT_QQ_CONFIG };
}

function saveQqConfig(config) {
  const filePath = getQqConfigFilePath();
  const merged = { ...loadQqConfig(), ...config };
  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

module.exports = {
  DEFAULT_QQ_CONFIG,
  getQqConfigFilePath,
  loadQqConfig,
  saveQqConfig
};
