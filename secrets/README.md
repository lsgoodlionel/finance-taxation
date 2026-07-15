# 本地凭证存放（secrets/）

存放**外部真连凭证**（诺诺开票 API、企业微信等）。这些是敏感信息，**严禁提交到 GitHub**。

## 规则（已由根 `.gitignore` 强制）

- `secrets/` 下**只有** `README.md` 与 `*.example.md` 模板会进入 git；
- 真实凭证写入 `secrets/credentials.local.md`（**被 gitignore 忽略，永不推送**）；
- 各类 `.env` / `.env.docker.local` / `.env.*.local` 也已忽略。

## 使用

1. 复制模板为本地文件（本地文件不会被提交）：
   ```bash
   cp secrets/credentials.example.md secrets/credentials.local.md
   ```
2. 在 `secrets/credentials.local.md` 中填入真实凭证。
3. 部署时把这些值注入运行环境（推荐环境变量，见下），**不要**把真实值写进任何被 git 跟踪的文件。

## 注入 docker 部署

真实值最终以环境变量进入容器。建议：
```bash
cp apps/api/.env.docker apps/api/.env.docker.local   # .local 已被 gitignore
# 在 .env.docker.local 填入 NUONUO_* / WEWORK_* 等真实值
docker compose up -d
```
`credentials.local.md` 作为人类可读的凭证台账，`.env.docker.local` 作为程序读取源，两者内容对应。

## 泄露应急

若真实凭证曾被提交：立即**轮换**（作废旧凭证、在诺诺/企微后台重新签发），再用 `git filter-repo` 等从历史移除，并强推（需团队协调）。
