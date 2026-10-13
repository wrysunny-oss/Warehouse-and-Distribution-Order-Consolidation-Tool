# 使用官方 Node.js 22 精简镜像
FROM node:22-alpine

# 设置工作目录
WORKDIR /app

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3000

# 复制依赖配置
COPY package*.json ./

# 仅安装生产环境依赖
RUN npm ci --omit=dev --ignore-scripts

# 复制核心代码与预设文件
COPY src/ ./src/
COPY product-preset.json ./
COPY warehouse-preset.json ./
COPY wechat-bot-config.json ./
COPY qq-bot-config.json ./

# 创建共享会话临时目录
RUN mkdir -p /tmp/excel-bot-sessions

# 暴露 Web / Webhook 服务端口
EXPOSE 3000

# 启动服务
CMD ["node", "src/bot/server.js"]
