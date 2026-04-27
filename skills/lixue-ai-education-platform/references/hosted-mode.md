# Vercel 部署模式

本项目以 Vercel Pro 部署为准。

## 地址

- 个人网址：https://teacher.li-xue.com/
- 健康检查：`https://teacher.li-xue.com/api/health`

## 配置边界

- 模型、语音、图片、视频、联网搜索、PDF 解析等服务密钥应在 Vercel 环境变量或页面设置中配置。
- 不在代码中配置 Function Max Duration。
- 不把 API Key、访问码、账号密码写入仓库文件。
- 出现服务商认证或模型配置错误时，应修改 Vercel 环境变量或受控配置后再重试。
