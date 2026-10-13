'use strict';

const crypto = require('node:crypto');

/**
 * 计算微信消息签名 (SHA-1)
 */
function getSignature(token, timestamp, nonce, encrypt) {
  const list = [token, timestamp, nonce, encrypt].filter((item) => item !== undefined && item !== null).sort();
  const sha1 = crypto.createHash('sha1');
  sha1.update(list.join(''));
  return sha1.digest('hex');
}

/**
 * 校验签名
 */
function verifySignature(token, timestamp, nonce, encrypt, signature) {
  const expected = getSignature(token, timestamp, nonce, encrypt);
  return expected === signature;
}

/**
 * PKCS#7 填充 (块大小为 32 字节)
 */
function pkcs7Pad(buffer, blockSize = 32) {
  const padLength = blockSize - (buffer.length % blockSize);
  const padBuffer = Buffer.alloc(padLength, padLength);
  return Buffer.concat([buffer, padBuffer]);
}

/**
 * PKCS#7 去填充
 */
function pkcs7Unpad(buffer) {
  const padLength = buffer[buffer.length - 1];
  if (padLength < 1 || padLength > 32) {
    return buffer;
  }
  return buffer.subarray(0, buffer.length - padLength);
}

/**
 * 微信加密消息解密
 */
function decryptMessage(encodingAESKey, corpId, encryptedBase64) {
  const aesKey = Buffer.from(encodingAESKey + '=', 'base64');
  if (aesKey.length !== 32) {
    throw new Error('无效的 EncodingAESKey，长度必须为 43 位');
  }
  const iv = aesKey.subarray(0, 16);
  const cipherBuffer = Buffer.from(encryptedBase64, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, iv);
  decipher.setAutoPadding(false);

  const decrypted = Buffer.concat([decipher.update(cipherBuffer), decipher.final()]);
  const unpadded = pkcs7Unpad(decrypted);

  // 格式: 16字节随机数 + 4字节msg_len(网络字节序) + msg + corpId
  const msgLen = unpadded.readUInt32BE(16);
  const msgContent = unpadded.subarray(20, 20 + msgLen).toString('utf8');
  const fromCorpId = unpadded.subarray(20 + msgLen).toString('utf8');

  if (corpId && fromCorpId !== corpId) {
    throw new Error(`CorpID 校验不匹配: 期望 ${corpId}, 收到 ${fromCorpId}`);
  }

  return {
    message: msgContent,
    corpId: fromCorpId
  };
}

/**
 * 微信消息加密
 */
function encryptMessage(encodingAESKey, corpId, messageXml) {
  const aesKey = Buffer.from(encodingAESKey + '=', 'base64');
  const iv = aesKey.subarray(0, 16);

  const random16 = crypto.randomBytes(16);
  const msgBuffer = Buffer.from(messageXml, 'utf8');
  const lenBuffer = Buffer.alloc(4);
  lenBuffer.writeUInt32BE(msgBuffer.length, 0);
  const corpIdBuffer = Buffer.from(corpId, 'utf8');

  const combined = Buffer.concat([random16, lenBuffer, msgBuffer, corpIdBuffer]);
  const padded = pkcs7Pad(combined, 32);

  const cipher = crypto.createCipheriv('aes-256-cbc', aesKey, iv);
  cipher.setAutoPadding(false);

  const encrypted = Buffer.concat([cipher.update(padded), cipher.final()]);
  return encrypted.toString('base64');
}

/**
 * 简单从微信 XML 提取字段（免依赖轻量解析）
 */
function parseXmlTags(xmlString) {
  const result = {};
  const cleanXml = String(xmlString || '');
  // 匹配所有叶子节点（无论是顶层还是嵌套在 <File> 等容器内）
  const leafRegex = /<([a-zA-Z0-9_]+)>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]+?))<\/\1>/g;
  let match;
  while ((match = leafRegex.exec(cleanXml)) !== null) {
    const tagName = match[1];
    if (tagName.toLowerCase() === 'xml') continue;
    const value = match[2] !== undefined ? match[2] : match[3];
    result[tagName] = (value ?? '').trim();
  }
  return result;
}

/**
 * 构建微信被动回复加密 XML
 */
function buildEncryptedXml(encryptBase64, token, timestamp, nonce) {
  const signature = getSignature(token, timestamp, nonce, encryptBase64);
  return `<xml>\n` +
    `  <Encrypt><![CDATA[${encryptBase64}]]></Encrypt>\n` +
    `  <MsgSignature><![CDATA[${signature}]]></MsgSignature>\n` +
    `  <TimeStamp>${timestamp}</TimeStamp>\n` +
    `  <Nonce><![CDATA[${nonce}]]></Nonce>\n` +
    `</xml>`;
}

module.exports = {
  getSignature,
  verifySignature,
  decryptMessage,
  encryptMessage,
  parseXmlTags,
  buildEncryptedXml
};
