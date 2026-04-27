---
name: lixue-ai-education-platform
description: Guided notes for maintaining and using 李雪 AI 教育平台. Use when the user asks about this Vercel-deployed teaching platform, provider configuration, or classroom generation workflow.
user-invocable: true
metadata: { "site": "https://teacher.li-xue.com/" }
---

# 李雪 AI 教育平台 Skill

本 Skill 只记录当前项目的维护边界和使用流程。

## 项目信息

- 网站名称：李雪 AI 教育平台
- 所属机构：北京市朝阳区白家庄小学
- 负责人：李雪
- 个人网址：https://teacher.li-xue.com/
- 部署方式：Vercel Pro

## 使用原则

- 本项目以 Vercel 部署为准，本地没有固定运行环境。
- 未经用户同意，不运行 `pip`、`npm`、`npx` 等命令。
- API Key、访问码和服务商密钥应配置在 Vercel 环境变量或受控设置中，不要求用户把密钥发到聊天里。
- 不在代码里配置 Function Max Duration。
- 第三方服务商名称保持原名，例如 OpenAI、Gemini、MiniMax、MinerU、Vercel。

## 相关说明

- 品牌与维护说明见 [references/provider-keys.md](references/provider-keys.md)。
- 课堂生成流程见 [references/generate-flow.md](references/generate-flow.md)。
- 部署边界见 [references/hosted-mode.md](references/hosted-mode.md)。
