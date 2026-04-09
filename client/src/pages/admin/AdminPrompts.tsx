// Migrated from Admin.tsx — AI Prompt management tab
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Wand2, Loader2, Plus, Save } from "lucide-react";

// ─── Prompt type definitions ────────────────────────────────────
const PROMPT_TYPES = [
  { key: "email.warm",     label: "首封开发信", desc: "引导 AI 撰写初次联系的开发信邮件" },
  { key: "email.followup", label: "跟进邮件",   desc: "引导 AI 撰写未回复时的跟进邮件" },
  { key: "email.reply",    label: "回复邮件",   desc: "引导 AI 撰写对客户回复的跟进内容" },
];

export default function AdminPrompts() {
  const [selectedKey, setSelectedKey] = useState("email.warm");
  const [promptText, setPromptText] = useState("");
  const [isDirty, setIsDirty] = useState(false);

  const { data: prompts, refetch } = trpc.admin.listAiPrompts.useQuery();

  // ── Sync prompt text when selection or data changes ────────
  useEffect(() => {
    const matched = prompts?.find((p: any) => p.promptKey === selectedKey);
    setPromptText(matched?.promptText ?? "");
    setIsDirty(false);
  }, [prompts, selectedKey]);

  const savePrompt = trpc.admin.updateAiPrompt.useMutation({
    onSuccess: () => {
      toast.success("提示词已保存");
      setIsDirty(false);
      refetch();
    },
    onError: e => toast.error("保存失败：" + e.message),
  });

  const selectedType = PROMPT_TYPES.find(p => p.key === selectedKey);
  const currentPrompt = prompts?.find((p: any) => p.promptKey === selectedKey);

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">AI 提示词管理</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          配置管理员级别的提示词，指导 AI 邮件生成的风格和策略
        </p>
      </div>

      {/* Prompt type selector */}
      <div className="grid grid-cols-3 gap-3">
        {PROMPT_TYPES.map(pt => {
          const hasCustom = prompts?.some((p: any) => p.promptKey === pt.key && p.promptText);
          return (
            <button
              key={pt.key}
              onClick={() => setSelectedKey(pt.key)}
              className={`text-left p-4 rounded-xl border-2 transition-all ${
                selectedKey === pt.key
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/30 hover:bg-muted/40"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{pt.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">{pt.desc}</p>
                </div>
                {hasCustom ? (
                  <Badge className="text-[9px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 shrink-0">已配置</Badge>
                ) : (
                  <Badge variant="outline" className="text-[9px] text-muted-foreground shrink-0">默认</Badge>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Editor card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-primary" />
              {selectedType?.label} — 提示词编辑器
            </CardTitle>
            <div className="flex items-center gap-2">
              {isDirty && (
                <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
                  未保存
                </Badge>
              )}
              {currentPrompt?.updatedAt && (
                <span className="text-[10px] text-muted-foreground">
                  上次保存：{new Date(currentPrompt.updatedAt).toLocaleString("zh-CN")}
                </span>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            <strong>说明：</strong>此处输入的提示词会作为系统级指令，在 AI 生成「{selectedType?.label}」时被优先参考。
            可以在此设置邮件风格、禁止内容、特殊要求等。留空则使用系统默认提示词。
          </div>

          <Textarea
            value={promptText}
            onChange={e => { setPromptText(e.target.value); setIsDirty(true); }}
            rows={18}
            placeholder={`输入管理员提示词，用于指导 AI 生成「${selectedType?.label}」…\n\n示例：\n- 邮件语气要专业、简洁，避免过于销售化的措辞\n- 重点突出产品差异化优势\n- 邮件长度控制在 200-300 字以内\n- 结尾必须包含明确的行动号召（CTA）`}
            className="font-mono text-sm resize-none"
          />

          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              {promptText.length > 0 ? `已输入 ${promptText.length} 字符` : "（空）将使用系统默认提示词"}
            </div>
            <div className="flex gap-2">
              {promptText && (
                <Button
                  variant="outline" size="sm"
                  onClick={() => { setPromptText(""); setIsDirty(true); }}
                >
                  清空
                </Button>
              )}
              <Button
                onClick={() => savePrompt.mutate({ promptKey: selectedKey, promptText })}
                disabled={savePrompt.isPending || !isDirty}
                size="sm"
                className="gap-1.5"
              >
                {savePrompt.isPending
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />保存中…</>
                  : <><Save className="h-3.5 w-3.5" />保存提示词</>
                }
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* All prompts summary */}
      {prompts && prompts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">已配置的提示词</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {prompts.map((p: any) => {
                const type = PROMPT_TYPES.find(t => t.key === p.promptKey);
                return (
                  <div key={p.promptKey} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{type?.label ?? p.promptKey}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {p.promptText ? p.promptText.substring(0, 80) + "…" : "（空）"}
                      </p>
                    </div>
                    <Button
                      variant="ghost" size="sm" className="text-xs"
                      onClick={() => setSelectedKey(p.promptKey)}
                    >
                      编辑
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
