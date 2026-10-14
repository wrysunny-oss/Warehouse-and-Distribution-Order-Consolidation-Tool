import os
import aiohttp
import asyncio
import tempfile
from pathlib import Path
from typing import Optional, Dict, Any, List

from astrbot.api.event import filter, AstrMessageEvent, MessageChain
from astrbot.api.star import Context, Star
import astrbot.api.message_components as Comp
from astrbot.api import logger

# 默认后端算力服务地址 (容器网络内为 http://excel-bot:3000，宿主机内为 http://127.0.0.1:3000)
BACKEND_BASE_URL = os.environ.get("EXCEL_BOT_URL", "http://excel-bot:3000").rstrip("/")
SHARED_DIR = Path(os.environ.get("EXCEL_BOT_SHARED_DIR", "/tmp/excel-bot-sessions"))


class WarehouseExcelPlugin(Star):
    def __init__(self, context: Context):
        super().__init__(context)
        self.user_states: Dict[str, Dict[str, Any]] = {}
        logger.info(f"[WarehouseExcelPlugin] 插件初始化完成，后端算力地址: {BACKEND_BASE_URL}")

    def _get_user_state(self, user_id: str) -> Dict[str, Any]:
        if user_id not in self.user_states:
            self.user_states[user_id] = {
                "task_type": "auto",
                "pending_files": []
            }
        return self.user_states[user_id]

    def _clear_user_state(self, user_id: str):
        if user_id in self.user_states:
            del self.user_states[user_id]

    # ==================== 指令交互 ====================

    @filter.command("excel")
    async def cmd_excel_help(self, event: AstrMessageEvent):
        """显示仓配订单汇总小助手的帮助菜单与支持的表格类型"""
        help_text = (
            "🤖 【仓配订单汇总小助手】使用指南\n"
            "━━━━━━━━━━━━━━━━━━━━━━\n"
            "支持直接发送 Excel 表格，系统将智能自动识别并处理！\n\n"
            "📌 支持的 5 大业务单据：\n"
            "  1. 送货单汇总：直接发送《入库单/送货单》ReceiptNote 表格\n"
            "  2. 库存更新：发送《实时库存表》与《旧表三》\n"
            "  3. 采购需求：发送《ReceiptNote》自动推导分仓采购表\n"
            "  4. 开票通知：发送《天猫超市对账单流水》\n"
            "  5. 费用核销：发送平台费用流水明细\n\n"
            "💡 快捷指令：\n"
            "  /送货单  - 锁定处理模式为送货单汇总\n"
            "  /库存更新 - 锁定处理模式为库存更新\n"
            "  /采购需求 - 锁定处理模式为采购需求生成\n"
            "  /开票对账 - 锁定处理模式为开票通知单\n"
            "  /费用核销 - 锁定处理模式为平台费用核销\n"
            "  /重置    - 清除当前会话状态\n"
            "━━━━━━━━━━━━━━━━━━━━━━\n"
            "👉 提示：如果开启了智谱 AI (GLM-4-Flash)，您也可以直接打字对话，如：“帮我把刚才的送货单汇总一下”"
        )
        yield event.plain_result(help_text)

    @filter.command("帮助")
    async def cmd_help_alias(self, event: AstrMessageEvent):
        """显示仓配汇总帮助菜单"""
        async for res in self.cmd_excel_help(event):
            yield res

    @filter.command("送货单")
    async def cmd_set_delivery(self, event: AstrMessageEvent):
        """设定当前任务为送货单汇总"""
        user_id = str(event.get_sender_id())
        state = self._get_user_state(user_id)
        state["task_type"] = "delivery"
        yield event.plain_result(
            "📦 已切换至【送货单汇总】模式！\n"
            "请直接发送《入库单/送货单》ReceiptNote Excel 文件，系统将自动汇总各品牌送货单并回传结果。"
        )

    @filter.command("库存更新")
    async def cmd_set_inventory(self, event: AstrMessageEvent):
        """设定当前任务为库存更新"""
        user_id = str(event.get_sender_id())
        state = self._get_user_state(user_id)
        state["task_type"] = "inventory"
        yield event.plain_result(
            "📊 已切换至【库存更新】模式！\n"
            "本模式需要两个文件：\n"
            "1. 请先发送《实时库存表》Excel\n"
            "2. 紧接着发送《旧表三》Excel\n"
            "系统收到后将自动更新良品可用并导出新表。"
        )

    @filter.command("采购需求")
    async def cmd_set_procurement(self, event: AstrMessageEvent):
        """设定当前任务为采购需求推导"""
        user_id = str(event.get_sender_id())
        state = self._get_user_state(user_id)
        state["task_type"] = "procurement"
        yield event.plain_result(
            "📋 已切换至【采购需求】模式！\n"
            "请直接发送《ReceiptNote 入库单》Excel 文件，系统将结合仓库工厂预设推导出采购需求汇总表。"
        )

    @filter.command("开票对账")
    async def cmd_set_invoice(self, event: AstrMessageEvent):
        """设定当前任务为开票对账"""
        user_id = str(event.get_sender_id())
        state = self._get_user_state(user_id)
        state["task_type"] = "invoice"
        yield event.plain_result(
            "🧾 已切换至【开票通知/对账】模式！\n"
            "请直接发送天猫超市对账流水 Excel，系统将自动进行正负费用抵扣与开票通知单拆分。"
        )

    @filter.command("费用核销")
    async def cmd_set_platform_fee(self, event: AstrMessageEvent):
        """设定当前任务为费用核销"""
        user_id = str(event.get_sender_id())
        state = self._get_user_state(user_id)
        state["task_type"] = "platform-fee"
        yield event.plain_result(
            "💰 已切换至【平台费用核销】模式！\n"
            "请直接发送平台费用账单明细 Excel / CSV，系统将按预设科目自动计算汇总。"
        )

    @filter.command("重置")
    async def cmd_reset_state(self, event: AstrMessageEvent):
        """清空当前用户的任务会话状态"""
        user_id = str(event.get_sender_id())
        self._clear_user_state(user_id)
        yield event.plain_result("🔄 会话状态已重置为自动识别模式。")

    # ==================== 文件监听与自动处理 ====================

    @filter.event_message_type(filter.EventMessageType.ALL)
    async def on_message(self, event: AstrMessageEvent):
        """监听并拦截收到的 Excel 表格文件"""
        files = await self._extract_files_from_event(event)
        if not files:
            return  # 普通文本消息，交给后续大模型或指令处理

        user_id = str(event.get_sender_id())
        state = self._get_user_state(user_id)
        task_type = state.get("task_type", "auto")

        logger.info(f"[WarehouseExcelPlugin] 收到用户 {user_id} 发送的 {len(files)} 个文件，当前任务模式: {task_type}")

        # 如果是库存更新模式且需要两个文件
        if task_type == "inventory":
            state["pending_files"].extend(files)
            if len(state["pending_files"]) < 2:
                yield event.plain_result(f"📄 已收到第 1 个文件：《{files[0]['name']}》，请继续发送第 2 个文件（旧表三）...")
                return
            # 两个文件已就绪
            process_files = state["pending_files"][:2]
            state["pending_files"] = []
            async for res in self._process_and_reply(event, user_id, "inventory", process_files):
                yield res
            return

        # 其他单文件模式或自动模式
        async for res in self._process_and_reply(event, user_id, task_type, files):
            yield res

    async def _process_and_reply(self, event: AstrMessageEvent, user_id: str, task_type: str, files: List[Dict[str, Any]]):
        """调用业务算力 API 并将生成的结果文件回传给用户"""
        yield event.plain_result(f"⏳ 正在智能分析并汇总表格《{files[0]['name']}》，请稍候...")

        try:
            result = await self._call_backend_api(user_id, task_type, files)
            if not result.get("success"):
                err_msg = result.get("error", "未知错误")
                yield event.plain_result(f"❌ 处理失败：{err_msg}")
                return

            text_summary = result.get("text", "处理完成！")
            output_files = result.get("files", [])

            if not output_files:
                yield event.plain_result(f"ℹ️ {text_summary}")
                return

            # 回传文件
            for f_info in output_files:
                file_name = f_info.get("fileName", "汇总结果.xlsx")
                local_path = f_info.get("filePath")
                download_url = f_info.get("downloadUrl")

                # 如果本地共享路径存在，优先使用本地路径
                send_path = None
                if local_path and os.path.exists(local_path):
                    send_path = local_path
                elif download_url:
                    # 通过后端下载到临时文件
                    send_path = await self._download_result_file(download_url, file_name)

                if send_path and os.path.exists(send_path):
                    chain = [
                        Comp.Plain(f"🎉 处理完成！\n{text_summary}\n\n正在发送结果文件："),
                        Comp.File(file=send_path, name=file_name)
                    ]
                    yield event.chain_result(chain)
                else:
                    # 备用方案：输出下载地址
                    full_url = f"{BACKEND_BASE_URL}{download_url}" if download_url and download_url.startswith("/") else download_url
                    yield event.plain_result(f"🎉 处理完成！\n{text_summary}\n\n📥 下载链接：\n{full_url}")

        except Exception as e:
            logger.error(f"[WarehouseExcelPlugin] 处理出错: {e}", exc_info=True)
            yield event.plain_result(f"⚠️ 处理发生异常: {str(e)}")

    # ==================== 大模型 Tool Calling (Function Calling) ====================

    @filter.llm_tool(name="process_warehouse_order")
    async def process_warehouse_order(self, event: AstrMessageEvent, task_type: str = "auto") -> str:
        """处理仓配订单表格（送货单、库存更新、采购需求、开票对账、费用核销）。当用户想要汇总或分析表格时调用此工具。

        Args:
            task_type (str): 业务类型，可选：'delivery' (送货单汇总), 'inventory' (库存更新), 'procurement' (采购需求), 'invoice' (开票对账), 'platform-fee' (平台费用核销), 或 'auto' (自动识别)。
        """
        user_id = str(event.get_sender_id())
        state = self._get_user_state(user_id)
        state["task_type"] = task_type
        return f"已将任务类型切换为 [{task_type}]。请让用户直接在聊天窗口中发送对应的 Excel 文件，系统将立即进行计算并回传结果。"

    @filter.llm_tool(name="query_warehouse_rules")
    async def query_warehouse_rules(self, event: AstrMessageEvent, keyword: str = "") -> str:
        """查询仓配订单汇总的业务规则、仓库米厂映射关系或支持的单据类型。

        Args:
            keyword (str): 要查询的关键词，如 '仓库', '工厂', '单据', '送货单', '采购'。
        """
        rules = (
            "【仓配订单汇总核心规则】：\n"
            "1. 送货单汇总：根据 ReceiptNote 单据中的目的仓，自动匹配并归属到国宝桥米、稻花翁、大区中转等米厂，生成标准多联送货单。\n"
            "2. 采购需求：提取入库数量，结合仓库与米厂对应预设，自动合并相同商品并导出采购需求清单。\n"
            "3. 库存更新：将实时库存数据更新至表三良品可用列，保留原有公式结构。\n"
            "4. 开票通知：针对天猫超市对账流水，根据正负金额抵扣规则合并同类商品并拆分正负向通知单。\n"
            "5. 平台费用：自动核销天猫扣款流水，按推广费、仓租、佣金归类汇总。"
        )
        return rules

    # ==================== 内部网络请求与文件工具 ====================

    async def _extract_files_from_event(self, event: AstrMessageEvent) -> List[Dict[str, Any]]:
        """从 AstrMessageEvent 中智能提取 Excel / CSV 文件对象"""
        extracted = []
        msg_obj = event.message_obj
        if not msg_obj:
            return extracted

        # 1. 检查 AstrBot 官方消息组件 Comp.File
        if hasattr(msg_obj, "message") and isinstance(msg_obj.message, list):
            for comp in msg_obj.message:
                if isinstance(comp, Comp.File) or getattr(comp, "type", "") == "file":
                    file_path = None
                    if hasattr(comp, "get_file"):
                        try:
                            file_path = await comp.get_file()
                        except Exception as e:
                            logger.warn(f"[WarehouseExcelPlugin] comp.get_file() 异步下载异常: {e}")
                    if not file_path:
                        file_path = getattr(comp, "path", None)
                    file_url = getattr(comp, "url", None)
                    file_name = getattr(comp, "name", None) or (os.path.basename(file_path) if file_path else "table.xlsx")
                    if self._is_excel_or_csv(file_name) or (file_path and self._is_excel_or_csv(file_path)):
                        extracted.append({
                            "name": file_name,
                            "path": file_path,
                            "url": file_url
                        })

        # 2. 检查底层 raw_message (OneBot v11 / NapCat 协议兼容)
        raw = getattr(msg_obj, "raw_message", None)
        if not extracted and isinstance(raw, dict):
            # OneBot file message segment
            message_list = raw.get("message")
            if isinstance(message_list, list):
                for seg in message_list:
                    if isinstance(seg, dict) and seg.get("type") == "file":
                        data = seg.get("data", {})
                        fname = data.get("file_name") or data.get("name") or "table.xlsx"
                        if self._is_excel_or_csv(fname):
                            extracted.append({
                                "name": fname,
                                "path": data.get("path") or data.get("file"),
                                "url": data.get("url"),
                                "file_id": data.get("file_id") or data.get("id")
                            })

        # 3. 检查微信消息 / 企微协议原始数据
        if not extracted and isinstance(raw, dict):
            if "File" in raw or raw.get("MsgType") == "file":
                fname = raw.get("FileName") or "table.xlsx"
                if self._is_excel_or_csv(fname):
                    extracted.append({
                        "name": fname,
                        "url": raw.get("Url") or raw.get("DownloadUrl"),
                        "media_id": raw.get("MediaId")
                    })

        return extracted

    def _is_excel_or_csv(self, filename: str) -> bool:
        lower = filename.lower()
        return lower.endswith(".xlsx") or lower.endswith(".xls") or lower.endswith(".csv")

    async def _call_backend_api(self, user_id: str, task_type: str, files: List[Dict[str, Any]]) -> Dict[str, Any]:
        """将文件发送到 Node.js 算力服务 /api/upload"""
        api_url = f"{BACKEND_BASE_URL}/api/upload"

        timeout = aiohttp.ClientTimeout(total=180)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            data = aiohttp.FormData()
            data.add_field("userId", user_id)
            data.add_field("taskType", task_type)

            temp_files_to_clean = []
            try:
                for idx, f_item in enumerate(files[:2]):
                    field_name = f"file{idx + 1}"
                    file_path = f_item.get("path")
                    file_url = f_item.get("url")
                    file_name = f_item.get("name") or f"file{idx + 1}.xlsx"

                    file_bytes = None
                    if file_path and os.path.exists(file_path):
                        with open(file_path, "rb") as fp:
                            file_bytes = fp.read()
                    elif file_url:
                        async with session.get(file_url) as resp:
                            if resp.status == 200:
                                file_bytes = await resp.read()

                    if file_bytes is not None:
                        data.add_field(field_name, file_bytes, filename=file_name)
                    else:
                        raise ValueError(f"无法读取文件内容: {file_name}")

                async with session.post(api_url, data=data) as resp:
                    if resp.status != 200:
                        err_text = await resp.text()
                        return {"success": False, "error": f"后台返回 HTTP {resp.status}: {err_text}"}
                    return await resp.json()

            finally:
                for tf in temp_files_to_clean:
                    try:
                        os.remove(tf)
                    except Exception:
                        pass

    async def _download_result_file(self, download_url: str, file_name: str) -> Optional[str]:
        """从后台下载生成好的文件到本地临时文件"""
        full_url = download_url
        if download_url.startswith("/"):
            full_url = f"{BACKEND_BASE_URL}{download_url}"

        try:
            tmp_dir = tempfile.gettempdir()
            target_path = os.path.join(tmp_dir, file_name)
            async with aiohttp.ClientSession() as session:
                async with session.get(full_url) as resp:
                    if resp.status == 200:
                        content = await resp.read()
                        with open(target_path, "wb") as f:
                            f.write(content)
                        return target_path
        except Exception as e:
            logger.warn(f"[WarehouseExcelPlugin] 下载结果文件失败: {e}")
        return None
