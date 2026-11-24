# singbox2omega

一个 Cloudflare Worker，把 [sing-box](https://sing-box.sagernet.org/) 的 JSON rule-set 转换成 ZeroOmega / SwitchyOmega 可用的规则列表（Switchy 格式），供「自动切换」情景模式定时拉取。

每次请求都会实时拉取上游规则（边缘缓存 6 小时），所以上游更新后无需重新部署。

## 订阅地址

```
https://singbox2omega.<你的子域>.workers.dev/rules.txt
```

- `GET /rules.txt`：返回合并、去重后的规则列表
- `GET /rules.txt?nocache=1`：跳过缓存，强制拉取最新上游
- 其它路径返回 404

## 内置规则源

在 `src/index.js` 顶部的 `SOURCES` 数组中维护，所有源合并输出为一份列表：

- [MetaCubeX geosite/anthropic.json](https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/refs/heads/sing/geo/geosite/anthropic.json)
- [MetaCubeX geosite/openai.json](https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/refs/heads/sing/geo/geosite/openai.json)

新增源：往 `SOURCES` 里加一个 sing-box **源格式（.json）** rule-set 地址，提交到 `main` 即可自动部署。不支持二进制 `.srs`。

## 转换规则

| sing-box 字段 | 示例 | ZeroOmega 条件 | 含义 |
| --- | --- | --- | --- |
| `domain` | `claude.ai` | `claude.ai` | 精确匹配主机名 |
| `domain_suffix` | `openai.com` | `*.openai.com` | 匹配该域名及其所有子域 |
| `domain_suffix`（前导点） | `.openai.com` | `**.openai.com` | 只匹配子域 |
| `domain_keyword` | `claude` | `Keyword: claude` | 主机名包含关键词 |
| `domain_regex` | `^a\d+\.b\.com$` | `HostRegex: ^a\d+\.b\.com$` | 主机名正则 |
| `ip_cidr` | `10.0.0.0/8` | `Ip: 10.0.0.0/8` | IP 网段（单个 IP 自动补 `/32` 或 `/128`） |

以下规则无法在浏览器里表达，会**整条跳过**，并在输出顶部以 `; 跳过 ...` 注释说明：

- 逻辑规则（`type: logical`）
- `invert: true`
- 含 `port`、`process_name`、`network` 等其它字段的规则（它们与域名条件是"与"关系，只取域名部分会让匹配范围变宽）

任一上游拉取或解析失败时整体返回 502，不会输出残缺列表；ZeroOmega 下载失败时会继续使用上一次的列表。

## 在 ZeroOmega 中使用

1. 新建情景模式，类型选「规则列表」
2. 规则列表格式选 **Switchy**，地址填上面的订阅地址
3. 「规则列表规则」命中时切换到你的代理情景模式，其余走直连
4. `*.workers.dev` 在国内可能无法直连，建议把规则列表的下载设为经由代理

## 本地开发

需要 Node.js 24。

```bash
npm install
npm test          # 运行单元测试
npm run dev       # 本地启动，访问 http://localhost:8787/rules.txt
```

## 部署

### 自动部署（GitHub Actions）

推送到 `main` 分支或在 Actions 页面手动触发时，`.github/workflows/deploy.yml` 会依次执行 `npm ci`、`npm test`、`wrangler deploy`，测试不通过不会部署。

需要在仓库 Settings → Secrets and variables → Actions 中配置：

| Secret | 获取方式 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare 控制台 → My Profile → API Tokens，用 "Edit Cloudflare Workers" 模板创建 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 控制台 → Workers & Pages 页面右侧 |

### 手动部署

```bash
npx wrangler login
npm run deploy
```
