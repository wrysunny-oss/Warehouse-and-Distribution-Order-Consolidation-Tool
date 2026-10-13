# 仓配订单汇总工具 · 云端部署与多人使用全指南

本指南专为**“将服务部署在云端服务器，脱离本地电脑，供团队多人随时使用”**量身定制。

---

## 一、系统架构与多人使用模式

```text
               【团队同事/外部人员】
                     │
         ┌───────────┴───────────┐
         ▼                       ▼
    【手机/电脑 QQ】        【手机/电脑 浏览器】
  (直接甩 Excel 表格)      (打开云端网址直接上传)
         │                       │
         ▼                       ▼
   ┌─────────────┐       ┌────────────────┐
   │  NapCat QQ  │       │                │
   │  (OneBot)   │──────▶│  Node.js 后台  │ (5大业务算法引擎)
   └─────────────┘  HTTP │  (端口 3000)   │ (送货单/库存/采购/开票/费用)
         ▲          /WS  └────────────────┘
         │                       │
         └───────────────────────┘
          自动回传生成的 Excel 结果文件
```

### 多人使用的两大入口：
1. **入口 1：QQ 机器人聊天（手机/电脑原生体验，零学习成本）**
   - **私聊使用**：同事加机器人 QQ 为好友，直接把 Excel 拖入聊天框（或手机 QQ 发送文件），机器人自动识别并生成，直接把做好的 Excel 附件回传给同事！
   - **群聊使用**：将机器人拉入业务群，同事在群里发送表格或输入指令，机器人自动在群里处理并把结果文件上传到群文件或回复给该同事。
   - **独立隔离**：每位同事的上传和计算任务基于 QQ 号独立隔离，多人并发互不串台。

2. **入口 2：网页端直传（浏览器打开即可用，无需加 QQ）**
   - 访问地址：`http://你的服务器IP:3000/upload`
   - 同事在手机微信、电脑浏览器直接打开，挑选 Excel 文件，点击“立即生成”，1 秒完成并点击“下载结果”。

---

## 二、云服务器选型推荐

系统极为轻量高效（基于 Node.js 22 纯函数计算与原生 ExcelJS）：
- **推荐机型**：腾讯云 / 阿里云 / 华为云 **轻量应用服务器**
- **配置建议**：2 核 CPU / 2G~4G 内存 / 50G 系统盘
- **操作系统**：Ubuntu 22.04 LTS 或 Debian 12 / CentOS 7+ / TencentOS
- **费用参考**：约 20~30 元 / 月

---

## 三、方式 A：Docker Compose 一键部署（最推荐，运维零门槛）

整个系统已容器化打包，包含**业务后台 + QQ 网关**两个容器，一步到位。

### 1. 将项目上传到云服务器
在服务器终端中克隆或上传项目代码：
```bash
git clone <你的仓库地址>
cd Warehouse-and-Distribution-Order-Consolidation-Tool
```

### 2. 检查并按需修改 QQ 配置 (`qq-bot-config.json`)
```json
{
  "enabled": true,
  "onebotHttpUrl": "http://napcat:3001",
  "webhookPath": "/qq",
  "port": 3000,
  "whiteListUsers": [],
  "enableGroup": true,
  "whiteListGroups": []
}
```
> **白名单说明**：
> - `whiteListUsers`: 若填入 `[12345678, 87654321]`，则**仅允许指定的 QQ 号**使用机器人；若保持 `[]` 空数组，则**允许所有好友**使用。
> - `enableGroup`: 是否允许在群聊中响应。

### 3. 一键启动 Docker 编排
在项目目录下执行：
```bash
docker compose up -d
```
Docker 会自动构建 `excel-bot-server` 镜像并拉取官方 `napcat-docker` 镜像。

### 4. 扫码登录 QQ（仅需一次）
1. 在云服务器控制台的安全组/防火墙中，放行 **3000**（Web/API）和 **6099**（NapCat WebUI）端口；
2. 在电脑或手机浏览器打开：
   ```text
   http://你的服务器IP:6099/webui
   ```
3. 页面将呈现 NapCat 控制台与二维码，使用你准备好的**机器人 QQ 账号**扫码确认登录；
4. 登录成功后，凭据将自动持久化保存在服务器本地磁盘中，容器重启无需重新扫码！

### 5. 在 NapCat WebUI 配置 OneBot 回调（10 秒搞定）
在 NapCat 网页控制台左侧菜单【网络配置】中：
- **HTTP 服务端**：监听 `0.0.0.0`，端口 `3001`
- **HTTP POST 上报**：添加一条上报 URL：
  ```text
  http://excel-bot:3000/qq
  ```
保存后，QQ 机器人与业务后台便完成了全自动双向连通！

---

## 四、方式 B：使用 PM2 在原生 Linux 服务器运行

如果你的服务器没有安装 Docker，也可以直接使用 Node.js + PM2 运行：

### 1. 安装 Node.js 22 与 PM2
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2
```

### 2. 安装依赖并启动
```bash
npm ci --omit=dev
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 3. 运行 NapCat 桌面端或独立服务
在服务器上安装 NapCat Shell 版运行即可。

---

## 五、QQ 机器人防风控与稳定运行经验

腾讯对在云服务器（机房 IP）登录的 QQ 账号有一套安全风控机制，遵循以下几点可长期稳定不掉线：

1. **QQ 账号选择**：
   - 强烈建议使用**有一定使用年限的老号**或绑过实名、常用设备的正常 QQ 号；
   - 避免使用“刚注册不到 3 天、未绑定手机的新号”，新号在机房 IP 容易被临时冻结；
2. **首次登录操作**：
   - 如果扫码提示“异地登录受限”，可在手机 QQ 设置中点击【账号安全】->【登录设备管理】中信任该设备，或用手机热点网络让服务器走代理完成首次握手；
3. **白名单保护**：
   - 建议在 `qq-bot-config.json` 中的 `whiteListUsers` 填入团队成员的 QQ 号，防止无关路人频繁发送垃圾文件触发腾讯短时间消息风控。

---

## 六、日常运维与服务管理

- **查看服务运行日志**：
  ```bash
  docker compose logs -f excel-bot
  ```
- **重启服务**：
  ```bash
  docker compose restart
  ```
- **更新代码或配置**：
  ```bash
  git pull
  docker compose up -d --build
  ```
- **修改商品字典或仓库预设**：
  直接在服务器上编辑 `product-preset.json` 或 `warehouse-preset.json`，服务自动热重载，无需重启！
