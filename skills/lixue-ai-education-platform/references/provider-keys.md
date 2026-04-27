# 服务商密钥说明

李雪 AI 教育平台使用独立的服务商配置，不会自动复用聊天工具自身的模型或 API Key。

## 基本原则

- 不要求用户在聊天中发送 API Key。
- 优先让用户在 Vercel 环境变量或页面设置中配置密钥。
- 文字默认模型固定为 `kimi:moonshotai/kimi-k2.6`。
- 第三方服务商名称保持原名，例如 ZenMux、MiniMax、MinerU、Vercel。

## 常见配置

- 语言模型：只使用 `ZENMUX_API_KEY`。
- 联网搜索：`TAVILY_API_KEY`。
- 图像生成：对应图片服务商的 API Key。
- 视频生成：对应视频服务商的 API Key。
- 语音合成：对应 TTS 服务商的 API Key。

## 出错处理

- 认证失败：检查对应 API Key。
- 模型不存在：检查模型 ID 和服务商前缀。
- 文字模型服务地址固定为 ZenMux，不通过页面或请求参数改 Base URL。
- 不通过临时请求参数绕过服务端配置。
