'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { sniffExcelFile } = require('../services/sniffer-service');
const { processDeliveryTask } = require('../services/delivery-service');
const { processInventoryTask } = require('../services/inventory-service');
const { processProcurementTask } = require('../services/procurement-service');
const { processInvoiceTask } = require('../services/invoice-service');
const { processPlatformFeeTask } = require('../services/platform-fee-service');

class SessionManager {
  constructor(options = {}) {
    this.timeoutMinutes = options.timeoutMinutes || 15;
    this.baseTempDir = options.tempDir || path.join(os.tmpdir(), 'excel-bot-sessions');
    this.sessions = new Map(); // userId -> session
    fs.mkdirSync(this.baseTempDir, { recursive: true });
  }

  getUserDir(userId) {
    const dir = path.join(this.baseTempDir, `user_${userId.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  getSession(userId) {
    const now = Date.now();
    let session = this.sessions.get(userId);

    // 检查超时自动重置
    if (session && now - session.lastActive > this.timeoutMinutes * 60 * 1000) {
      this.clearSession(userId);
      session = null;
    }

    if (!session) {
      session = {
        userId,
        state: 'IDLE', // 'IDLE' | 'AWAITING_FILES'
        taskType: null, // 'delivery' | 'inventory' | 'procurement' | 'invoice' | 'platform-fee'
        files: {},
        pendingFile: null, // 当收到双用途文件（如 ReceiptNote）时暂存
        lastActive: now
      };
      this.sessions.set(userId, session);
    } else {
      session.lastActive = now;
    }

    return session;
  }

  resetSessionState(userId) {
    const session = this.sessions.get(userId);
    if (session) {
      session.state = 'IDLE';
      session.taskType = null;
      session.files = {};
      session.pendingFile = null;
      session.lastActive = Date.now();
    }
  }

  clearSession(userId) {
    const session = this.sessions.get(userId);
    if (session) {
      this.sessions.delete(userId);
    }
    const userDir = path.join(this.baseTempDir, `user_${userId.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
    if (fs.existsSync(userDir)) {
      try {
        fs.rmSync(userDir, { recursive: true, force: true });
      } catch {}
    }
  }

  getHelpMenu() {
    return [
      '🤖 仓配数据助手为您服务！',
      '您可以直接发送指令，或把表格直接发给我：',
      '',
      '【1】送货单汇总（发送货单/入库单，自动分仓汇总）',
      '【2】库存更新（发旧表三 + 实时库存表/在途表）',
      '【3】采购需求表（发入库单 ReceiptNote 或表三）',
      '【4】开票通知单（发天猫超市对账单流水）',
      '【5】平台费用核销（发平台费用流水账单）',
      '',
      '💡 快捷操作：',
      '• 直接把 Excel 表格发到对话框，系统会自动识别表头并提示！',
      '• 发送【取消】或【重置】可随时清空当前未完成任务。'
    ].join('\n');
  }

  /**
   * 处理用户文本消息
   */
  async handleText(userId, text) {
    const session = this.getSession(userId);
    const clean = String(text || '').trim();

    // 1. 帮助与菜单
    if (/^(帮助|菜单|help|\?|？)$/i.test(clean)) {
      return { text: this.getHelpMenu() };
    }

    // 2. 取消与重置
    if (/^(取消|重置|清空|退出|quit|exit)$/i.test(clean)) {
      this.clearSession(userId);
      return { text: '已重置当前任务状态，随时准备开启新任务。' };
    }

    // 3. 待决文件的数字选择（如 ReceiptNote 即可做送货单也可做需求表）
    if (session.pendingFile) {
      const pending = session.pendingFile;
      session.pendingFile = null;
      if (clean === '1' || clean.includes('送货单')) {
        session.taskType = 'delivery';
        session.files.receiptFilePath = pending.filePath;
        return this.tryExecuteTask(session);
      } else if (clean === '3' || clean.includes('需求')) {
        session.taskType = 'procurement';
        session.files.inputFilePath = pending.filePath;
        return this.tryExecuteTask(session);
      }
    }

    // 4. 任务关键词启动
    if (clean === '1' || clean.includes('送货单')) {
      session.taskType = 'delivery';
      session.state = 'AWAITING_FILES';
      session.files = {};
      return {
        text: '📦【送货单汇总】已就绪！\n请将《送货单 / 入库明细 Excel》直接发送到本对话框。\n（货品字典将自动加载系统内置最新预设）'
      };
    }

    if (clean === '2' || clean.includes('库存') || clean.includes('表三')) {
      session.taskType = 'inventory';
      session.state = 'AWAITING_FILES';
      session.files = { inventoryFilePaths: [] };
      return {
        text: '📊【库存更新】已就绪！\n请将以下文件发送到对话框：\n1. 旧表三 Excel（包含仓库名称、货品名称、良品可用）\n2. 实时库存表（可发送多份）\n3. 库存在途明细表（可选）'
      };
    }

    if (clean === '3' || clean.includes('采购需求') || clean.includes('需求表')) {
      session.taskType = 'procurement';
      session.state = 'AWAITING_FILES';
      session.files = {};
      return {
        text: '📋【采购需求表】已就绪！\n请将《ReceiptNote 入库明细》或《表三 Excel》直接发送到本对话框。\n（将自动匹配大区米厂预设并推导采购需求）'
      };
    }

    if (clean === '4' || clean.includes('开票') || clean.includes('对账')) {
      session.taskType = 'invoice';
      session.state = 'AWAITING_FILES';
      session.files = { reconciliationFilePaths: [] };
      return {
        text: '🧾【开票通知单】已就绪！\n请将《天猫超市对账单 Excel》直接发送到本对话框。'
      };
    }

    if (clean === '5' || clean.includes('费用') || clean.includes('核销')) {
      session.taskType = 'platform-fee';
      session.state = 'AWAITING_FILES';
      session.files = {};
      return {
        text: '💰【平台费用核销】已就绪！\n请将《平台费用流水账单 Excel / CSV》直接发送到本对话框。'
      };
    }

    // 未知文本指令
    return {
      text: `收到消息：“${clean}”。\n若要处理表格，请直接发送 Excel 文件，或回复数字选择功能：\n\n${this.getHelpMenu()}`
    };
  }

  /**
   * 处理用户发送的文件
   */
  async handleFile(userId, { filePath, fileName }) {
    const session = this.getSession(userId);
    let sniff;
    try {
      sniff = await sniffExcelFile(filePath);
    } catch (err) {
      return {
        text: `无法读取表格表头：${err.message}，请确认发送的是合规的 Excel 文件。`
      };
    }

    // 智能路由逻辑：如果当前用户没有选定任务，根据表头类型智能推导
    if (!session.taskType || session.state === 'IDLE') {
      return this.handleSniffedFileIdle(session, sniff, filePath, fileName);
    }

    // 用户已经在特定任务流程中，装配文件槽位
    return this.handleFileInTask(session, sniff, filePath, fileName);
  }

  /**
   * 当用户处于空闲状态直接发文件时的嗅探逻辑
   */
  async handleSniffedFileIdle(session, sniff, filePath, fileName) {
    switch (sniff.type) {
      case 'table3':
        session.taskType = 'inventory';
        session.state = 'AWAITING_FILES';
        session.files = { table3FilePath: filePath, inventoryFilePaths: [] };
        return {
          text: `✅ 识别到【旧表三】《${fileName}》！\n已为您开启【库存更新】任务。请继续发送【实时库存表】（可发送多份）。`
        };

      case 'realtime-inventory':
        session.taskType = 'inventory';
        session.state = 'AWAITING_FILES';
        session.files = { inventoryFilePaths: [filePath] };
        return {
          text: `✅ 识别到【实时库存表】《${fileName}》！\n已为您开启【库存更新】任务。请继续发送【旧表三】。`
        };

      case 'in-transit':
        session.taskType = 'inventory';
        session.state = 'AWAITING_FILES';
        session.files = { transitFilePath: filePath, inventoryFilePaths: [] };
        return {
          text: `✅ 识别到【库存在途明细】《${fileName}》！\n已开启【库存更新】任务。请继续发送【旧表三】。`
        };

      case 'delivery-note':
        session.taskType = 'delivery';
        session.state = 'AWAITING_FILES';
        session.files = { receiptFilePath: filePath };
        // 送货单只要有送货单文件即可使用内置商品预设直接生成！
        return this.tryExecuteTask(session);

      case 'receipt-note':
        // ReceiptNote 既可以生成送货单，也可以生成采购需求表
        session.pendingFile = { filePath, fileName };
        return {
          text: `✅ 识别到【入库单明细 ReceiptNote】《${fileName}》！\n请回复数字选择处理方式：\n【1】生成各仓送货单\n【3】推导大区采购需求表`
        };

      case 'reconciliation':
        session.taskType = 'invoice';
        session.state = 'AWAITING_FILES';
        session.files = { reconciliationFilePaths: [filePath] };
        return this.tryExecuteTask(session);

      case 'platform-fee':
        session.taskType = 'platform-fee';
        session.state = 'AWAITING_FILES';
        session.files = { feeFilePath: filePath };
        return this.tryExecuteTask(session);

      default:
        return {
          text: `收到表格《${fileName}》，但未能匹配到典型业务表头。\n识别字段：${sniff.headers.slice(0, 5).join('、')}。\n您可以回复【1~5】手动指定希望执行的任务类型。`
        };
    }
  }

  /**
   * 用户在明确任务中发送文件时的处理
   */
  async handleFileInTask(session, sniff, filePath, fileName) {
    if (session.taskType === 'delivery') {
      if (sniff.type === 'product-catalog') {
        session.files.productFilePath = filePath;
        if (!session.files.receiptFilePath) {
          return { text: `✅ 已更新商品字典《${fileName}》，请继续发送【送货单/入库单】。` };
        }
      } else {
        session.files.receiptFilePath = filePath;
      }
      return this.tryExecuteTask(session);
    }

    if (session.taskType === 'inventory') {
      if (sniff.type === 'table3') {
        session.files.table3FilePath = filePath;
      } else if (sniff.type === 'in-transit') {
        session.files.transitFilePath = filePath;
      } else {
        if (!Array.isArray(session.files.inventoryFilePaths)) session.files.inventoryFilePaths = [];
        session.files.inventoryFilePaths.push(filePath);
      }
      return this.tryExecuteTask(session);
    }

    if (session.taskType === 'procurement') {
      session.files.inputFilePath = filePath;
      return this.tryExecuteTask(session);
    }

    if (session.taskType === 'invoice') {
      if (!Array.isArray(session.files.reconciliationFilePaths)) session.files.reconciliationFilePaths = [];
      session.files.reconciliationFilePaths.push(filePath);
      return this.tryExecuteTask(session);
    }

    if (session.taskType === 'platform-fee') {
      session.files.feeFilePath = filePath;
      return this.tryExecuteTask(session);
    }

    return { text: `已收到文件《${fileName}》。` };
  }

  /**
   * 检查条件是否满足并执行计算
   */
  async tryExecuteTask(session) {
    const outputDir = this.getUserDir(session.userId);

    try {
      // 1. 送货单
      if (session.taskType === 'delivery') {
        if (!session.files.receiptFilePath) {
          return { text: '已就绪，请发送《送货单》或《入库明细》文件。' };
        }
        const result = await processDeliveryTask({
          receiptFilePath: session.files.receiptFilePath,
          productFilePath: session.files.productFilePath,
          outputDir
        });
        this.resetSessionState(session.userId);
        return {
          text: `🎉 ${result.summaryText}\n正在将生成的文件发送给您...`,
          files: result.files.map((f) => ({ filePath: f.filePath, fileName: f.fileName }))
        };
      }

      // 2. 库存更新
      if (session.taskType === 'inventory') {
        const hasTable3 = Boolean(session.files.table3FilePath);
        const hasInv = Boolean(session.files.inventoryFilePaths?.length || session.files.transitFilePath);

        if (!hasTable3) {
          const invCount = session.files.inventoryFilePaths?.length || 0;
          return { text: `已收到 ${invCount} 份实时库存，还缺少【旧表三】，请继续发送旧表三。` };
        }
        if (!hasInv) {
          return { text: '已收到旧表三，还缺少【实时库存表】或【在途明细表】，请继续发送。' };
        }

        const result = await processInventoryTask({
          table3FilePath: session.files.table3FilePath,
          inventoryFilePaths: session.files.inventoryFilePaths,
          transitFilePath: session.files.transitFilePath,
          outputDir
        });
        this.resetSessionState(session.userId);
        return {
          text: `🎉 ${result.summaryText}\n正在将更新后的表三发送给您...`,
          files: [{ filePath: result.filePath, fileName: result.fileName }]
        };
      }

      // 3. 采购需求表
      if (session.taskType === 'procurement') {
        if (!session.files.inputFilePath) {
          return { text: '请发送《ReceiptNote 入库明细》或《表三》文件。' };
        }
        const result = await processProcurementTask({
          inputFilePath: session.files.inputFilePath,
          outputDir
        });
        this.resetSessionState(session.userId);
        return {
          text: `🎉 ${result.summaryText}\n正在将生成的采购需求表发送给您...`,
          files: [{ filePath: result.filePath, fileName: result.fileName }]
        };
      }

      // 4. 开票通知单
      if (session.taskType === 'invoice') {
        if (!session.files.reconciliationFilePaths?.length) {
          return { text: '请发送《天猫超市对账单》文件。' };
        }
        const result = await processInvoiceTask({
          reconciliationFilePaths: session.files.reconciliationFilePaths,
          outputDir
        });
        this.resetSessionState(session.userId);
        return {
          text: `🎉 ${result.summaryText}\n正在将开票通知单发送给您...`,
          files: [{ filePath: result.filePath, fileName: result.fileName }]
        };
      }

      // 5. 平台费用核销
      if (session.taskType === 'platform-fee') {
        if (!session.files.feeFilePath) {
          return { text: '请发送《平台费用流水账单》文件。' };
        }
        const result = await processPlatformFeeTask({
          feeFilePath: session.files.feeFilePath,
          outputDir
        });
        this.resetSessionState(session.userId);
        return {
          text: `🎉 ${result.summaryText}\n正在将费用核销汇总表发送给您...`,
          files: [{ filePath: result.filePath, fileName: result.fileName }]
        };
      }
    } catch (err) {
      return {
        text: `❌ 处理过程中发生异常：${err.message}\n请检查表格格式是否正确，或发送【重置】重新开始。`
      };
    }

    return { text: '正在等待更多所需文件...' };
  }
}

module.exports = {
  SessionManager
};
