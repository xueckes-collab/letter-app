# Email Quality and Crawler Eval Fixtures

本文档定义 5 个轻量客户场景、邮件质量验收标准，以及当前 crawler helper 需要暴露的纯函数。所有场景都应使用静态 fixture，不调用 OpenAI、Scrapling 或网络。

## Email Quality Pure Function Contract

建议生产侧新增并导出：

```ts
export function evaluateEmailQuality(input: {
  subject: string;
  body: string;
  customerDetails: string[];
  customerCompany?: string;
  senderCompany?: string;
  bannedTerms?: string[];
  peerCaution?: {
    prohibitedPeerNames: string[];
  };
}): {
  passed: boolean;
  wordCount: number;
  issues: Array<{
    code: "banned-words" | "cta-standalone-line" | "word-count" | "customer-detail" | "peer-caution";
    message: string;
    term?: string;
  }>;
}
```

验收规则：

- 禁用词：标记 `cutting-edge`、`one-stop`、`leverage`、`synergy` 等营销腔词。
- CTA 单独行：最后一个低门槛 CTA 必须独占非空行，不应黏在正文段落末尾。
- 词数：正文目标 80-120 词；超过 150 词必须失败，低于目标范围应提示。
- 客户细节：正文至少命中一个 `customerDetails` 中的具体客户细节，避免只写 `your company`。
- 同行谨慎：允许 `a similar distributor in your market` 这类泛化证明，不允许点名客户同行、竞品或敏感 peer 名称。

## Crawler Helper Coverage

当前 `server/services/scrapling-crawler.ts` 已导出以下纯函数，可在不调用 Scrapling 或网络的情况下测试：

```ts
export function normalizeWebsiteUrl(input: string): string | null;
export function inferPageType(
  url: string,
  anchorText?: string,
): { pageType: WebsiteResearchPageType; score: number };
export function discoverCorePages(
  content: string,
  homepageUrl: string,
  maxPages?: number,
): DiscoveredWebsitePage[];
```

验收规则：

- URL 标准化：补齐 `https://`，移除 hash，拒绝空值、`mailto:`、`tel:` 等非 HTTP 输入。
- pageType 分类：基于 URL path 和 anchor text 识别 homepage、about、products、contact、projects、certifications、news；未知页面返回 `other`。
- source filtering：通过 `discoverCorePages` 验证同域或 `www` 等价域名、HTML 页面筛选；过滤站外域名、文件下载、登录、购物车等低价值页面。
- 如仍需覆盖旧 `server/services/scraper.ts` 内部逻辑，需要额外导出 `findKeyPages` 所依赖的 URL normalize、page type classify、source filter 纯函数。

## Five Eval Scenarios

| ID | 客户场景 | 输入信号 | 期望邮件行为 | 失败条件 |
| --- | --- | --- | --- | --- |
| EQ-001 | 美国地板经销商扩张新展厅 | `Boulder showroom`、`acoustic wall panels`、`retail fit-outs` | 开头引用至少一个展厅或产品细节；正文 80-120 词；CTA 独立一行，例如 `Want me to send two sample finishes?` | 使用 `cutting-edge`/`one-stop`；没有客户细节；CTA 黏在正文后 |
| EQ-002 | SaaS 公司与地板产品低匹配 | `B2B scheduling software`、`remote team`、无装修采购信号 | 不强行关联地板需求；允许建议跳过或询问是否有建筑/装修客户转介 | 编造 `your office needs flooring`、`server room flooring` 等弱关联 |
| EQ-003 | 酒店项目承包商有交期压力 | `hotel renovation pipeline`、`Q3 opening`、`fire-rated materials` | 主卖点聚焦交期或认证；引用项目/认证细节；CTA 是低门槛资料或样品请求 | 一封信堆多个卖点；忽略交期和认证；请求直接开会 |
| EQ-004 | 电商卖家关注库存与图片素材 | `online flooring store`、`SKU refresh`、`product images` | 强调小批量试单、稳定库存或可用素材；避免企业宣传腔；CTA 让对方回复 yes/no | 写成泛泛公司介绍；超过 150 词；缺少具体 SKU 或图片素材细节 |
| EQ-005 | 有同行案例但需要谨慎表达 | `regional distributor`、`prohibited peer: StoneWorks Supply` | 可写 `a similar distributor in your market`；不点名同行；客户细节仍需出现 | 点名 `StoneWorks Supply` 或暗示客户竞争对手的敏感信息 |

## Fixture Acceptance Checklist

- 每个场景都应能在纯函数层完成判断，不依赖 LLM 输出。
- 每个失败条件至少映射到一个稳定 issue code。
- 对 crawler 的 URL 和 pageType fixture 使用固定字符串，不抓取页面。
- 测试运行时不读取 `.env`，不访问外部服务，不依赖数据库。
