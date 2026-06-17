import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  FileSearch,
  ShieldCheck,
  TrendingUp,
  XCircle,
} from "lucide-react";

type UnknownRecord = Record<string, unknown>;

type ResearchSource = {
  title: string;
  url?: string;
  type?: string;
  snippet?: string;
};

type TimelineItem = {
  kind?: string;
  cards?: Array<{ title?: string; items?: string[] }>;
};

const RESEARCH_STATUS: Record<string, { label: string; className: string; icon: typeof CircleDashed }> = {
  not_started: {
    label: "待背调",
    className: "border-slate-500/30 text-slate-400 bg-slate-500/10",
    icon: CircleDashed,
  },
  pending: {
    label: "排队中",
    className: "border-blue-500/30 text-blue-400 bg-blue-500/10",
    icon: CircleDashed,
  },
  queued: {
    label: "排队中",
    className: "border-blue-500/30 text-blue-400 bg-blue-500/10",
    icon: CircleDashed,
  },
  crawling: {
    label: "爬取官网",
    className: "border-blue-500/30 text-blue-400 bg-blue-500/10",
    icon: FileSearch,
  },
  researching: {
    label: "背调中",
    className: "border-blue-500/30 text-blue-400 bg-blue-500/10",
    icon: FileSearch,
  },
  brief_ready: {
    label: "Brief 就绪",
    className: "border-indigo-500/30 text-indigo-400 bg-indigo-500/10",
    icon: ShieldCheck,
  },
  writing: {
    label: "写信中",
    className: "border-amber-500/30 text-amber-400 bg-amber-500/10",
    icon: TrendingUp,
  },
  quality_checking: {
    label: "质检中",
    className: "border-amber-500/30 text-amber-400 bg-amber-500/10",
    icon: ShieldCheck,
  },
  running: {
    label: "背调中",
    className: "border-blue-500/30 text-blue-400 bg-blue-500/10",
    icon: FileSearch,
  },
  in_progress: {
    label: "背调中",
    className: "border-blue-500/30 text-blue-400 bg-blue-500/10",
    icon: FileSearch,
  },
  completed: {
    label: "已背调",
    className: "border-emerald-500/30 text-emerald-400 bg-emerald-500/10",
    icon: CheckCircle2,
  },
  done: {
    label: "已背调",
    className: "border-emerald-500/30 text-emerald-400 bg-emerald-500/10",
    icon: CheckCircle2,
  },
  ready: {
    label: "已完成",
    className: "border-emerald-500/30 text-emerald-400 bg-emerald-500/10",
    icon: CheckCircle2,
  },
  needs_review: {
    label: "需审核",
    className: "border-amber-500/30 text-amber-400 bg-amber-500/10",
    icon: AlertTriangle,
  },
  failed: {
    label: "背调失败",
    className: "border-rose-500/30 text-rose-400 bg-rose-500/10",
    icon: XCircle,
  },
  error: {
    label: "背调失败",
    className: "border-rose-500/30 text-rose-400 bg-rose-500/10",
    icon: XCircle,
  },
};

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("[") && !trimmed.startsWith("{"))) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function textFrom(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

function getNested(record: UnknownRecord, paths: string[][]): unknown {
  for (const path of paths) {
    let cursor: unknown = record;
    for (const key of path) {
      if (!isRecord(cursor) || !(key in cursor)) {
        cursor = undefined;
        break;
      }
      cursor = cursor[key];
    }
    if (cursor !== undefined && cursor !== null) return cursor;
  }
  return undefined;
}

function normalizeScore(value: unknown): number | null {
  const raw = typeof value === "string" ? Number.parseFloat(value) : value;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function normalizePercent(value: unknown): number | null {
  const raw = typeof value === "string" ? Number.parseFloat(value) : value;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  const percent = raw > 0 && raw <= 1 ? raw * 100 : raw;
  return Math.max(0, Math.min(100, Math.round(percent)));
}

function normalizeWarningNotes(value: unknown): string[] {
  const parsed = parseMaybeJson(value);
  if (Array.isArray(parsed)) {
    return parsed.flatMap((item) => normalizeWarningNotes(item)).filter(Boolean);
  }
  if (isRecord(parsed)) {
    return Object.values(parsed).flatMap((item) => normalizeWarningNotes(item)).filter(Boolean);
  }
  const text = textFrom(parsed);
  if (!text) return [];
  return text
    .split(/\n|;/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function sourceFromRecord(record: UnknownRecord, fallbackTitle?: string): ResearchSource | null {
  const title =
    textFrom(record.title) ||
    textFrom(record.name) ||
    textFrom(record.label) ||
    textFrom(record.source) ||
    textFrom(record.pageType) ||
    fallbackTitle;
  const url = textFrom(record.url) || textFrom(record.href) || textFrom(record.link);
  const snippet =
    textFrom(record.snippet) ||
    textFrom(record.summary) ||
    textFrom(record.description) ||
    textFrom(record.note) ||
    textFrom(record.text)?.slice(0, 240);
  const method = textFrom(record.extractionMethod);
  const confidence = typeof record.confidence === "number" ? `confidence ${Math.round(record.confidence)}%` : undefined;
  const type = textFrom(record.type) || textFrom(record.kind) || textFrom(record.category) || textFrom(record.pageType) || method || confidence;

  if (!title && !url && !snippet) return null;
  return {
    title: title || url || "Research source",
    url,
    type: [type, method && method !== type ? method : undefined, confidence].filter(Boolean).join(" · ") || undefined,
    snippet,
  };
}

function normalizeSourceItem(value: unknown, fallbackTitle?: string, depth = 0): ResearchSource[] {
  if (depth > 2) return [];
  const parsed = parseMaybeJson(value);

  if (Array.isArray(parsed)) {
    return parsed.flatMap((item) => normalizeSourceItem(item, fallbackTitle, depth + 1));
  }

  if (typeof parsed === "string") {
    const text = parsed.trim();
    if (!text) return [];
    const isUrl = /^https?:\/\//i.test(text);
    return [{ title: isUrl ? text.replace(/^https?:\/\//i, "") : text, url: isUrl ? text : undefined }];
  }

  if (isRecord(parsed)) {
    const direct = sourceFromRecord(parsed, fallbackTitle);
    if (direct) return [direct];

    return Object.entries(parsed).flatMap(([key, item]) => normalizeSourceItem(item, key, depth + 1));
  }

  return [];
}

function getLeadRecord(lead: unknown): UnknownRecord {
  return isRecord(lead) ? lead : {};
}

function getResearchStatus(lead: unknown): string {
  const record = getLeadRecord(lead);
  return textFrom(getNested(record, [["researchStatus"], ["research", "status"], ["customerResearch", "status"]])) || "not_started";
}

function getResearchSources(lead: unknown): ResearchSource[] {
  const record = getLeadRecord(lead);
  const value = getNested(record, [
    ["researchSources"],
    ["research", "sources"],
    ["customerResearch", "sources"],
    ["sources"],
  ]);
  return normalizeSourceItem(value);
}

function getHandoffBrief(lead: unknown, timeline?: TimelineItem[]): string | null {
  const record = getLeadRecord(lead);
  const direct = textFrom(getNested(record, [
    ["handoffBrief"],
    ["research", "handoffBrief"],
    ["customerResearch", "handoffBrief"],
    ["customerResearch", "brief"],
  ]));
  if (direct) return direct;

  const thinkingCards = timeline?.find((item) => item.kind === "thinking" && item.cards?.length)?.cards;
  if (!thinkingCards?.length) return null;
  return thinkingCards
    .slice(0, 3)
    .map((card) => {
      const items = card.items?.filter(Boolean).slice(0, 3).join("; ");
      return [card.title, items].filter(Boolean).join(": ");
    })
    .filter(Boolean)
    .join("\n");
}

function getQualityScore(lead: unknown): number | null {
  const record = getLeadRecord(lead);
  return normalizeScore(getNested(record, [
    ["qualityScore"],
    ["emailQuality", "qualityScore"],
    ["generatedEmailQuality", "qualityScore"],
    ["quality", "score"],
  ]));
}

function getReplyProbability(lead: unknown): number | null {
  const record = getLeadRecord(lead);
  return normalizePercent(getNested(record, [
    ["replyProbability"],
    ["emailQuality", "replyProbability"],
    ["generatedEmailQuality", "replyProbability"],
    ["quality", "replyProbability"],
  ]));
}

function getWarnings(lead: unknown): string[] {
  const record = getLeadRecord(lead);
  return normalizeWarningNotes(getNested(record, [
    ["warningNotes"],
    ["emailQuality", "warningNotes"],
    ["generatedEmailQuality", "warningNotes"],
    ["quality", "warningNotes"],
  ]));
}

function scoreTone(value: number | null): string {
  if (value === null) return "text-muted-foreground";
  if (value >= 80) return "text-emerald-400";
  if (value >= 60) return "text-amber-400";
  return "text-rose-400";
}

function ResearchStatusBadge({ lead }: { lead: unknown }) {
  const key = getResearchStatus(lead).toLowerCase();
  const config = RESEARCH_STATUS[key] || {
    label: key.replace(/_/g, " "),
    className: "border-slate-500/30 text-slate-400 bg-slate-500/10",
    icon: CircleDashed,
  };
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={config.className}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

function MetricBlock({
  icon: Icon,
  label,
  value,
  suffix = "",
}: {
  icon: typeof ShieldCheck;
  label: string;
  value: number | null;
  suffix?: string;
}) {
  return (
    <div className="rounded-lg border bg-accent/35 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          <span>{label}</span>
        </div>
        <span className={cn("text-sm font-semibold", scoreTone(value))}>
          {value === null ? "--" : `${value}${suffix}`}
        </span>
      </div>
      <Progress value={value ?? 0} className="mt-2 h-1.5" />
    </div>
  );
}

export function LeadIntelligenceBadges({ lead, className }: { lead: unknown; className?: string }) {
  const qualityScore = getQualityScore(lead);
  const replyProbability = getReplyProbability(lead);

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <ResearchStatusBadge lead={lead} />
      <Badge variant="outline" className="border-amber-500/30 text-amber-400 bg-amber-500/10">
        <ShieldCheck className="h-3 w-3" />
        质量 {qualityScore === null ? "--" : qualityScore}
      </Badge>
      <Badge variant="outline" className="border-violet-500/30 text-violet-400 bg-violet-500/10">
        <TrendingUp className="h-3 w-3" />
        回复 {replyProbability === null ? "--" : `${replyProbability}%`}
      </Badge>
    </div>
  );
}

export function LeadIntelligenceSummary({ leads }: { leads: unknown[] }) {
  const total = leads.length;
  const completeCount = leads.filter((lead) => ["completed", "done"].includes(getResearchStatus(lead).toLowerCase())).length;
  const runningCount = leads.filter((lead) => ["pending", "running", "in_progress"].includes(getResearchStatus(lead).toLowerCase())).length;
  const failedCount = leads.filter((lead) => ["failed", "error"].includes(getResearchStatus(lead).toLowerCase())).length;
  const qualityScores = leads.map(getQualityScore).filter((score): score is number => score !== null);
  const replyProbabilities = leads.map(getReplyProbability).filter((score): score is number => score !== null);
  const averageQuality = qualityScores.length
    ? Math.round(qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length)
    : null;
  const averageReply = replyProbabilities.length
    ? Math.round(replyProbabilities.reduce((sum, score) => sum + score, 0) / replyProbabilities.length)
    : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileSearch className="h-4 w-4 text-primary" />
          深度背调与质量结果
        </CardTitle>
        <CardDescription>当前客户列表的背调、邮件质量和回复概率</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border bg-accent/35 p-3">
            <p className="text-xs text-muted-foreground">背调完成</p>
            <p className="text-xl font-bold mt-1">{completeCount}/{total}</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {runningCount} 进行中 · {failedCount} 失败
            </p>
          </div>
          <MetricBlock icon={ShieldCheck} label="平均质量" value={averageQuality} />
          <MetricBlock icon={TrendingUp} label="平均回复概率" value={averageReply} suffix="%" />
        </div>
      </CardContent>
    </Card>
  );
}

export function LeadIntelligenceDetail({ lead, timeline }: { lead: unknown; timeline?: TimelineItem[] }) {
  const researchSources = getResearchSources(lead);
  const handoffBrief = getHandoffBrief(lead, timeline);
  const qualityScore = getQualityScore(lead);
  const replyProbability = getReplyProbability(lead);
  const warnings = getWarnings(lead);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <FileSearch className="h-4 w-4 text-primary" />
                Research Sources
              </CardTitle>
              <CardDescription>深度背调用到的网站、公开资料和线索来源</CardDescription>
            </div>
            <ResearchStatusBadge lead={lead} />
          </div>
        </CardHeader>
        <CardContent>
          {researchSources.length > 0 ? (
            <div className="space-y-2">
              {researchSources.slice(0, 6).map((source, index) => (
                <div key={`${source.title}-${index}`} className="rounded-lg border bg-accent/35 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium truncate">{source.title}</p>
                        {source.type && (
                          <Badge variant="secondary" className="text-[10px]">
                            {source.type}
                          </Badge>
                        )}
                      </div>
                      {source.snippet && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{source.snippet}</p>
                      )}
                    </div>
                    {source.url && (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted-foreground hover:text-foreground shrink-0"
                        aria-label={`Open ${source.title}`}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed bg-accent/20 p-4 text-sm text-muted-foreground">
              暂无 Research Sources
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Customer Research / Handoff Brief</CardTitle>
          <CardDescription>面向人工审核、销售跟进和邮件改写的客户摘要</CardDescription>
        </CardHeader>
        <CardContent>
          {handoffBrief ? (
            <div className="rounded-lg border bg-accent/35 p-4 text-sm leading-relaxed whitespace-pre-wrap">
              {handoffBrief}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed bg-accent/20 p-4 text-sm text-muted-foreground">
              暂无 Customer Research / Handoff Brief
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Generated Email Quality
          </CardTitle>
          <CardDescription>生成邮件的质量分、回复概率和风险提示</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <MetricBlock icon={ShieldCheck} label="Quality Score" value={qualityScore} />
            <MetricBlock icon={TrendingUp} label="Reply Probability" value={replyProbability} suffix="%" />
          </div>

          <Separator />

          <div>
            <div className="flex items-center gap-2 text-sm font-medium">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Warning Notes
            </div>
            {warnings.length > 0 ? (
              <ul className="mt-2 space-y-2">
                {warnings.slice(0, 5).map((warning, index) => (
                  <li key={`${warning}-${index}`} className="rounded-lg border bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
                    {warning}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 rounded-lg border border-dashed bg-accent/20 px-3 py-2 text-xs text-muted-foreground">
                暂无 Warning Notes
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
