'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { loadQqConfig } = require('./qq-config');

class QqBotAdapter {
  constructor(options = {}) {
    this.config = { ...loadQqConfig(), ...options };
    this.sessionManager = options.sessionManager || null;
    this.wsClient = null;
    this.reconnectTimer = null;
    this.isDestroyed = false;

    if (this.config.enabled && this.config.onebotWsUrl) {
      this.initWebSocket();
    }
  }

  updateConfig(newConfig = {}) {
    this.config = { ...this.config, ...newConfig };
    if (this.config.enabled && this.config.onebotWsUrl && !this.wsClient) {
      this.initWebSocket();
    }
  }

  /**
   * 初始化 OneBot 正向 WebSocket 连接（NapCat 作为 WS 服务端）
   */
  initWebSocket() {
    if (!this.config.onebotWsUrl || typeof WebSocket === 'undefined') return;

    try {
      console.log(`[QQBot] 正在连接 OneBot WebSocket: ${this.config.onebotWsUrl}`);
      this.wsClient = new WebSocket(this.config.onebotWsUrl);

      this.wsClient.onopen = () => {
        console.log('[QQBot] 🟢 OneBot WebSocket 长连接已建立成功');
      };

      this.wsClient.onmessage = async (event) => {
        try {
          const raw = typeof event.data === 'string' ? event.data : event.data.toString();
          const data = JSON.parse(raw);
          await this.handleOneBotEvent(data);
        } catch (err) {
          console.warn('[QQBot] 解析 WebSocket 消息失败:', err.message);
        }
      };

      this.wsClient.onerror = (err) => {
        console.warn('[QQBot] OneBot WebSocket 异常:', err.message || err);
      };

      this.wsClient.onclose = () => {
        this.wsClient = null;
        if (!this.isDestroyed && this.config.enabled && this.config.onebotWsUrl) {
          console.log('[QQBot] WebSocket 连接已断开，5秒后自动重连...');
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = setTimeout(() => this.initWebSocket(), 5000);
        }
      };
    } catch (err) {
      console.warn('[QQBot] 创建 WebSocket 客户端失败:', err.message);
    }
  }

  destroy() {
    this.isDestroyed = true;
    clearTimeout(this.reconnectTimer);
    if (this.wsClient) {
      try {
        this.wsClient.close();
      } catch {}
      this.wsClient = null;
    }
  }

  /**
   * 检查用户是否在白名单中
   */
  isUserAllowed(userId) {
    const list = this.config.whiteListUsers;
    if (!Array.isArray(list) || list.length === 0) return true;
    const target = String(userId).trim();
    return list.some((item) => String(item).trim() === target);
  }

  /**
   * 检查群是否在白名单中
   */
  isGroupAllowed(groupId) {
    if (!this.config.enableGroup) return false;
    const list = this.config.whiteListGroups;
    if (!Array.isArray(list) || list.length === 0) return true;
    const target = String(groupId).trim();
    return list.some((item) => String(item).trim() === target);
  }

  /**
   * 调用 OneBot API (优先 HTTP，智能尝试 NapCat 容器地址，可选 WS)
   */
  async callOneBotApi(action, params = {}) {
    const candidates = [
      this.config.onebotHttpUrl,
      'http://napcat:3001',
      'http://napcat-qq:3001',
      'http://172.17.0.1:3001',
      'http://127.0.0.1:3001'
    ].filter(Boolean);

    const headers = { 'Content-Type': 'application/json' };
    if (this.config.onebotToken) {
      headers['Authorization'] = `Bearer ${this.config.onebotToken}`;
    }

    const uniqueCandidates = [...new Set(candidates)];
    for (const httpBase of uniqueCandidates) {
      try {
        const url = `${httpBase.replace(/\/+$/, '')}/${action}`;
        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(params),
          signal: AbortSignal.timeout(3000)
        });
        if (res.ok) {
          // 记录成功的地址以加速后续调用
          this.config.onebotHttpUrl = httpBase;
          return await res.json();
        }
        console.warn(`[QQBot] 尝试 ${httpBase}/${action} 响应 HTTP ${res.status}`);
      } catch (err) {
        console.warn(`[QQBot] 尝试 ${httpBase}/${action} 失败: ${err.message}`);
      }
    }
    console.warn(`[QQBot] 调用 API ${action} 失败，已尝试所有候选地址:`, uniqueCandidates);

    // 备用：通过 WS 发送
    if (this.wsClient && this.wsClient.readyState === 1) {
      try {
        const echo = Date.now().toString();
        this.wsClient.send(JSON.stringify({ action, params, echo }));
        return { status: 'sent_ws', echo };
      } catch (err) {
        console.warn(`[QQBot] WS 发送 API ${action} 失败:`, err.message);
      }
    }

    return null;
  }

  /**
   * 发送私聊消息
   */
  async sendPrivateMsg(userId, message) {
    return this.callOneBotApi('send_private_msg', {
      user_id: Number(userId) || userId,
      message
    });
  }

  /**
   * 发送群消息
   */
  async sendGroupMsg(groupId, message) {
    return this.callOneBotApi('send_group_msg', {
      group_id: Number(groupId) || groupId,
      message
    });
  }

  /**
   * 发送私聊文件 (NapCat 核心能力)
   */
  async uploadPrivateFile(userId, filePath, fileName) {
    return this.callOneBotApi('upload_private_file', {
      user_id: Number(userId) || userId,
      file: filePath,
      name: fileName || path.basename(filePath)
    });
  }

  /**
   * 发送群文件
   */
  async uploadGroupFile(groupId, filePath, fileName) {
    return this.callOneBotApi('upload_group_file', {
      group_id: Number(groupId) || groupId,
      file: filePath,
      name: fileName || path.basename(filePath)
    });
  }

  /**
   * 从 OneBot 消息段或字段中提取文件信息
   */
  extractFileInfo(message) {
    if (!message) return null;

    if (Array.isArray(message)) {
      for (const seg of message) {
        if (seg.type === 'file' && seg.data) {
          return {
            name: seg.data.file_name || seg.data.name || seg.data.file,
            url: seg.data.url,
            path: seg.data.path || (fs.existsSync(seg.data.file) ? seg.data.file : null),
            size: seg.data.file_size || seg.data.size
          };
        }
      }
    }

    if (typeof message === 'string') {
      const match = message.match(/\[CQ:file,file=([^,\]]+)(?:,url=([^,\]]+))?(?:,file_name=([^,\]]+))?/);
      if (match) {
        return {
          name: match[3] || match[1],
          url: match[2] || null,
          path: fs.existsSync(match[1]) ? match[1] : null
        };
      }
    }

    return null;
  }

  /**
   * 从消息中提取纯文本
   */
  extractText(message) {
    if (typeof message === 'string') {
      return message.replace(/\[CQ:[^\]]+\]/g, '').trim();
    }
    if (Array.isArray(message)) {
      return message
        .filter((seg) => seg.type === 'text' && seg.data?.text)
        .map((seg) => seg.data.text)
        .join(' ')
        .trim();
    }
    return '';
  }

  /**
   * 确保将 OneBot 传入的文件拉取/保存到本地供业务引擎使用
   */
  async downloadOrResolveFile(fileInfo, targetDir) {
    fs.mkdirSync(targetDir, { recursive: true });
    const fileName = fileInfo.name || `qq_file_${Date.now()}.xlsx`;
    const destPath = path.join(targetDir, fileName);

    // 1. 本地路径直接存在 (NapCat 本地运行模式或 Docker 挂载)
    if (fileInfo.path && fs.existsSync(fileInfo.path)) {
      if (fileInfo.path !== destPath) {
        fs.copyFileSync(fileInfo.path, destPath);
      }
      return destPath;
    }

    // 2. 具备下载 URL
    if (fileInfo.url) {
      console.log(`[QQBot] 正在下载 QQ 传入文件: ${fileName}`);
      const res = await fetch(fileInfo.url);
      if (!res.ok) {
        throw new Error(`下载文件失败，HTTP ${res.status}`);
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(destPath, buffer);
      return destPath;
    }

    // 3. 传入的是本地临时绝对路径
    if (fileInfo.file && fs.existsSync(fileInfo.file)) {
      fs.copyFileSync(fileInfo.file, destPath);
      return destPath;
    }

    throw new Error('未获取到有效的文件下载地址或本地路径');
  }

  /**
   * 核心：处理来自 OneBot v11 的所有推送事件
   */
  async handleOneBotEvent(event) {
    if (!event || typeof event !== 'object') return { handled: false };

    // 忽略心跳与元事件
    if (event.post_type === 'meta_event') {
      return { handled: true, type: 'meta' };
    }

    // A. 私聊消息
    if (event.post_type === 'message' && event.message_type === 'private') {
      const rawUserId = event.user_id;
      if (!this.isUserAllowed(rawUserId)) {
        console.log(`[QQBot] 🔒 拦截未授权用户私聊: ${rawUserId}`);
        await this.sendPrivateMsg(rawUserId, '抱歉，您暂未在此机器人白名单中，请联系管理员添加权限。');
        return { handled: true, action: 'blocked' };
      }

      const fileInfo = this.extractFileInfo(event.message);
      if (fileInfo) {
        return this.processFileAction({
          sessionUserId: `qq_${rawUserId}`,
          rawUserId,
          fileInfo,
          isGroup: false
        });
      }

      const text = this.extractText(event.message) || event.raw_message || '';
      return this.processTextAction({
        sessionUserId: `qq_${rawUserId}`,
        rawUserId,
        text,
        isGroup: false
      });
    }

    // B. 私聊离线文件上传通知 (OneBot notice: offline_file)
    if (event.post_type === 'notice' && event.notice_type === 'offline_file') {
      const rawUserId = event.user_id;
      if (!this.isUserAllowed(rawUserId)) return { handled: true, action: 'blocked' };

      return this.processFileAction({
        sessionUserId: `qq_${rawUserId}`,
        rawUserId,
        fileInfo: event.file,
        isGroup: false
      });
    }

    // C. 群聊消息
    if (event.post_type === 'message' && event.message_type === 'group') {
      const groupId = event.group_id;
      const rawUserId = event.user_id;
      if (!this.isGroupAllowed(groupId)) return { handled: true, action: 'group_ignored' };

      // 检查是否包含文件
      const fileInfo = this.extractFileInfo(event.message);
      if (fileInfo) {
        return this.processFileAction({
          sessionUserId: `qq_group_${groupId}_${rawUserId}`,
          rawUserId,
          groupId,
          isGroup: true,
          fileInfo
        });
      }

      const text = this.extractText(event.message);
      // 群里如果有人发数字指令或关键词，进行处理
      if (text && /^(1|2|3|4|5|送货单|库存|采购需求|开票|费用|帮助|菜单|重置|取消)$/i.test(text)) {
        return this.processTextAction({
          sessionUserId: `qq_group_${groupId}_${rawUserId}`,
          rawUserId,
          groupId,
          isGroup: true,
          text
        });
      }

      return { handled: true, action: 'group_skipped' };
    }

    // D. 群文件上传通知 (OneBot notice: group_upload)
    if (event.post_type === 'notice' && event.notice_type === 'group_upload') {
      const groupId = event.group_id;
      const rawUserId = event.user_id;
      if (!this.isGroupAllowed(groupId)) return { handled: true, action: 'group_ignored' };

      return this.processFileAction({
        sessionUserId: `qq_group_${groupId}_${rawUserId}`,
        rawUserId,
        groupId,
        isGroup: true,
        fileInfo: event.file
      });
    }

    return { handled: false, reason: 'unsupported_event' };
  }

  /**
   * 处理文本指令
   */
  async processTextAction({ sessionUserId, rawUserId, groupId, isGroup, text }) {
    if (!this.sessionManager) {
      console.warn('[QQBot] sessionManager 未注入');
      return { handled: false };
    }

    console.log(`[QQBot] 💬 收到 ${isGroup ? `群 [${groupId}]` : '私聊'} [${rawUserId}] 文本: "${text}"`);
    const reply = await this.sessionManager.handleText(sessionUserId, text);

    if (reply.text) {
      const sendText = isGroup ? `[CQ:at,qq=${rawUserId}]\n${reply.text}` : reply.text;
      if (isGroup) {
        await this.sendGroupMsg(groupId, sendText);
      } else {
        await this.sendPrivateMsg(rawUserId, sendText);
      }
    }

    if (reply.files && reply.files.length) {
      await this.dispatchGeneratedFiles({ rawUserId, groupId, isGroup, files: reply.files });
    }

    return { handled: true, action: 'text_processed', reply };
  }

  /**
   * 处理接收到的 Excel 文件
   */
  async processFileAction({ sessionUserId, rawUserId, groupId, isGroup, fileInfo }) {
    if (!this.sessionManager) return { handled: false };

    const fileName = fileInfo.name || 'excel_table.xlsx';
    console.log(`[QQBot] 📁 收到 ${isGroup ? `群 [${groupId}]` : '私聊'} [${rawUserId}] 文件: 《${fileName}》`);

    // 即时给用户正向反馈
    const ackText = isGroup
      ? `[CQ:at,qq=${rawUserId}] 📥 已收到文件《${fileName}》，正在智能识别并处理中...`
      : `📥 已收到表格《${fileName}》，正在智能识别并处理中...`;
    if (isGroup) {
      await this.sendGroupMsg(groupId, ackText);
    } else {
      await this.sendPrivateMsg(rawUserId, ackText);
    }

    try {
      const userDir = this.sessionManager.getUserDir(sessionUserId);
      const localFilePath = await this.downloadOrResolveFile(fileInfo, userDir);

      const result = await this.sessionManager.handleFile(sessionUserId, {
        filePath: localFilePath,
        fileName
      });

      if (result.text) {
        const textMsg = isGroup ? `[CQ:at,qq=${rawUserId}]\n${result.text}` : result.text;
        if (isGroup) {
          await this.sendGroupMsg(groupId, textMsg);
        } else {
          await this.sendPrivateMsg(rawUserId, textMsg);
        }
      }

      if (result.files && result.files.length) {
        await this.dispatchGeneratedFiles({ rawUserId, groupId, isGroup, files: result.files });
      }

      return { handled: true, action: 'file_processed', result };
    } catch (err) {
      console.error(`[QQBot] 处理表格《${fileName}》异常:`, err);
      const errMsg = `❌ 表格处理失败: ${err.message}\n请检查文件是否为标准 Excel 或联系管理员。`;
      if (isGroup) {
        await this.sendGroupMsg(groupId, `[CQ:at,qq=${rawUserId}] ${errMsg}`);
      } else {
        await this.sendPrivateMsg(rawUserId, errMsg);
      }
      return { handled: true, error: err.message };
    }
  }

  /**
   * 向用户/群回传生成好的 Excel 文件
   */
  async dispatchGeneratedFiles({ rawUserId, groupId, isGroup, files }) {
    for (const f of files) {
      const displayName = f.fileName || path.basename(f.filePath);
      console.log(`[QQBot] 📤 正在发送生成文件: ${displayName} -> ${isGroup ? `群 ${groupId}` : `QQ ${rawUserId}`}`);

      let uploadRes = null;
      if (isGroup) {
        uploadRes = await this.uploadGroupFile(groupId, f.filePath, displayName);
      } else {
        uploadRes = await this.uploadPrivateFile(rawUserId, f.filePath, displayName);
      }

      // 如果有配置外网公网域名，提供一条兜底的直链下载提示
      if (this.config.publicBaseUrl) {
        const downloadUrl = `${this.config.publicBaseUrl.replace(/\/+$/, '')}/api/download?file=${encodeURIComponent(f.filePath)}&name=${encodeURIComponent(displayName)}`;
        const linkMsg = `🔗 备用网页下载直链: ${downloadUrl}`;
        if (isGroup) {
          await this.sendGroupMsg(groupId, linkMsg);
        } else {
          await this.sendPrivateMsg(rawUserId, linkMsg);
        }
      }
    }
  }
}

module.exports = {
  QqBotAdapter
};
