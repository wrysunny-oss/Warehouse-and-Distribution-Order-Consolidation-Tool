'use strict';

const fs = require('node:fs');
const path = require('node:path');

class WechatApiClient {
  constructor(config = {}) {
    this.corpId = config.corpId || '';
    this.secret = config.secret || '';
    this.agentId = config.agentId || '';
    this.tokenCache = {
      accessToken: '',
      expiresAt: 0
    };
  }

  updateConfig(config = {}) {
    if (config.corpId) this.corpId = config.corpId;
    if (config.secret) this.secret = config.secret;
    if (config.agentId) this.agentId = config.agentId;
  }

  /**
   * 获取 AccessToken（自动缓存管理）
   */
  async getAccessToken() {
    const now = Date.now();
    if (this.tokenCache.accessToken && this.tokenCache.expiresAt > now + 300 * 1000) {
      return this.tokenCache.accessToken;
    }

    if (!this.corpId || !this.secret) {
      throw new Error('企业微信配置不完整: 缺少 CorpID 或 Secret');
    }

    const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(this.corpId)}&corpsecret=${encodeURIComponent(this.secret)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.errcode !== 0) {
      throw new Error(`获取企微 AccessToken 失败 [${data.errcode}]: ${data.errmsg}`);
    }

    this.tokenCache.accessToken = data.access_token;
    this.tokenCache.expiresAt = now + (data.expires_in || 7200) * 1000;
    return this.tokenCache.accessToken;
  }

  /**
   * 从企微服务器下载用户发送的文件素材
   */
  async downloadMedia(mediaId, destFilePath) {
    const token = await this.getAccessToken();
    const url = `https://qyapi.weixin.qq.com/cgi-bin/media/get?access_token=${encodeURIComponent(token)}&media_id=${encodeURIComponent(mediaId)}`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`下载文件失败，HTTP 状态码: ${res.status}`);
    }

    let extractedFileName = '';
    const disposition = res.headers.get('content-disposition') || '';
    const match = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i);
    if (match) {
      try {
        extractedFileName = decodeURIComponent(match[1].trim());
      } catch {
        extractedFileName = match[1].trim();
      }
    }

    let finalDest = destFilePath;
    if (extractedFileName && path.extname(destFilePath) === '') {
      finalDest = path.join(path.dirname(destFilePath), extractedFileName);
    }

    fs.mkdirSync(path.dirname(finalDest), { recursive: true });
    const arrayBuffer = await res.arrayBuffer();
    fs.writeFileSync(finalDest, Buffer.from(arrayBuffer));
    return { filePath: finalDest, fileName: extractedFileName || path.basename(finalDest) };
  }

  /**
   * 上传本地 Excel 文件为临时素材，返回 media_id
   */
  async uploadMedia(filePath, type = 'file') {
    if (!fs.existsSync(filePath)) {
      throw new Error(`上传的文件不存在: ${filePath}`);
    }
    const token = await this.getAccessToken();
    const url = `https://qyapi.weixin.qq.com/cgi-bin/media/upload?access_token=${encodeURIComponent(token)}&type=${encodeURIComponent(type)}`;

    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    const formData = new FormData();
    formData.append('media', new Blob([fileBuffer]), fileName);

    const res = await fetch(url, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    if (data.errcode !== 0) {
      throw new Error(`上传文件至企微失败 [${data.errcode}]: ${data.errmsg}`);
    }

    return data.media_id;
  }

  /**
   * 向指定用户发送文本消息
   */
  async sendTextMessage(toUser, content) {
    const token = await this.getAccessToken();
    const url = `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(token)}`;

    const payload = {
      touser: toUser,
      msgtype: 'text',
      agentid: this.agentId,
      text: { content }
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.errcode !== 0) {
      throw new Error(`发送文本消息失败 [${data.errcode}]: ${data.errmsg}`);
    }
    return data;
  }

  /**
   * 向指定用户发送文件附件消息
   */
  async sendFileMessage(toUser, mediaId) {
    const token = await this.getAccessToken();
    const url = `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(token)}`;

    const payload = {
      touser: toUser,
      msgtype: 'file',
      agentid: this.agentId,
      file: { media_id: mediaId }
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.errcode !== 0) {
      throw new Error(`发送文件消息失败 [${data.errcode}]: ${data.errmsg}`);
    }
    return data;
  }
}

module.exports = {
  WechatApiClient
};
