import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  MessageSquarePlus, Star, CheckCircle2, Clock, Sparkles, Bug, Lightbulb, Palette, MessageSquare
} from "lucide-react";

const CATEGORIES = [
  { value: "general", label: "综合体验", icon: MessageSquare, color: "text-blue-500" },
  { value: "feature", label: "功能建议", icon: Lightbulb, color: "text-amber-500" },
  { value: "bug", label: "问题反馈", icon: Bug, color: "text-red-500" },
  { value: "ux", label: "界面体验", icon: Palette, color: "text-purple-500" },
] as const;

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          className="transition-transform hover:scale-110"
        >
          <Star
            className={`h-7 w-7 transition-colors ${
              star <= (hover || value)
                ? "fill-amber-400 text-amber-400"
                : "text-muted-foreground/30"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; className?: string }> = {
    pending: { label: "分析中", variant: "secondary" },
    analyzed: { label: "已分析", variant: "outline" },
    valuable: { label: "有价值", variant: "default", className: "bg-emerald-500 hover:bg-emerald-600" },
    archived: { label: "已归档", variant: "outline", className: "text-muted-foreground" },
  };
  const s = map[status] || map.pending;
  return (
    <Badge variant={s.variant} className={s.className}>
      {s.label}
    </Badge>
  );
}

export default function FeedbackPage() {
  const [rating, setRating] = useState(0);
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<"general" | "bug" | "feature" | "ux">("general");
  const [submitted, setSubmitted] = useState(false);

  const { data: myFeedbacks, refetch } = trpc.feedback.myList.useQuery();
  const submitMutation = trpc.feedback.submit.useMutation();

  const handleSubmit = async () => {
    if (rating === 0) { toast.error("请先选择评分"); return; }
    if (content.trim().length < 5) { toast.error("请输入至少 5 个字的反馈内容"); return; }

    try {
      await submitMutation.mutateAsync({ rating, content: content.trim(), category });
      setSubmitted(true);
      setRating(0);
      setContent("");
      setCategory("general");
      toast.success("感谢您的反馈！我们会认真阅读每一条意见。");
      refetch();
      setTimeout(() => setSubmitted(false), 3000);
    } catch (e: any) {
      toast.error("提交失败：" + (e.message || "请稍后重试"));
    }
  };

  const ratingLabels = ["", "很差", "较差", "一般", "不错", "非常好"];

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-6 px-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageSquarePlus className="h-6 w-6 text-primary" />
          意见反馈
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          您的每一条反馈都会被 AI 分析，有价值的建议将直接推动产品改进。
        </p>
      </div>

      {/* Submit Form */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">提交新反馈</CardTitle>
          <CardDescription>告诉我们您的使用体验，帮助我们做得更好</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {submitted ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-500" />
              <p className="font-medium">反馈已提交！</p>
              <p className="text-sm text-muted-foreground">AI 正在分析您的反馈，感谢您帮助改进产品。</p>
            </div>
          ) : (
            <>
              {/* Rating */}
              <div className="space-y-2">
                <label className="text-sm font-medium">整体评分</label>
                <div className="flex items-center gap-3">
                  <StarRating value={rating} onChange={setRating} />
                  {rating > 0 && (
                    <span className="text-sm text-muted-foreground">{ratingLabels[rating]}</span>
                  )}
                </div>
              </div>

              {/* Category */}
              <div className="space-y-2">
                <label className="text-sm font-medium">反馈类型</label>
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    return (
                      <button
                        key={cat.value}
                        type="button"
                        onClick={() => setCategory(cat.value)}
                        className={`flex items-center gap-2 p-2.5 rounded-lg border text-sm transition-colors ${
                          category === cat.value
                            ? "border-primary bg-primary/5 text-foreground"
                            : "border-border hover:border-primary/50 text-muted-foreground"
                        }`}
                      >
                        <Icon className={`h-4 w-4 ${cat.color}`} />
                        {cat.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Content */}
              <div className="space-y-2">
                <label className="text-sm font-medium">详细描述</label>
                <Textarea
                  placeholder="请描述您的使用体验、遇到的问题或改进建议..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={4}
                  maxLength={2000}
                  className="resize-none"
                />
                <p className="text-[11px] text-muted-foreground text-right">{content.length}/2000</p>
              </div>

              <Button
                onClick={handleSubmit}
                disabled={submitMutation.isPending || rating === 0 || content.trim().length < 5}
                className="w-full"
              >
                {submitMutation.isPending ? (
                  <>
                    <Sparkles className="h-4 w-4 mr-2 animate-spin" />
                    提交中...
                  </>
                ) : (
                  <>
                    <MessageSquarePlus className="h-4 w-4 mr-2" />
                    提交反馈
                  </>
                )}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* My Feedback History */}
      {myFeedbacks && myFeedbacks.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">我的反馈历史</CardTitle>
            <CardDescription>您提交的 {myFeedbacks.length} 条反馈</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[...myFeedbacks].reverse().map((fb: any) => {
              const cat = CATEGORIES.find(c => c.value === fb.category);
              const Icon = cat?.icon || MessageSquare;
              return (
                <div key={fb.id} className="p-3 rounded-lg border bg-card space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${cat?.color || 'text-muted-foreground'}`} />
                      <div className="flex">
                        {[1, 2, 3, 4, 5].map(s => (
                          <Star key={s} className={`h-3.5 w-3.5 ${s <= fb.rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/20'}`} />
                        ))}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(fb.createdAt).toLocaleDateString('zh-CN')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {statusBadge(fb.status)}
                    </div>
                  </div>
                  <p className="text-sm text-foreground/80 line-clamp-2">{fb.content}</p>
                  {fb.aiAnalysis && (
                    <>
                      <Separator />
                      <div className="flex items-start gap-2">
                        <Sparkles className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                        <p className="text-xs text-muted-foreground">{fb.aiAnalysis}</p>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* AI Analysis Info */}
      <Card className="border-dashed">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium">AI 智能分析机制</p>
              <p className="text-xs text-muted-foreground">
                每条反馈提交后，AI 会自动评估其可行性和价值（0-100分）。
                评分 ≥60 的反馈将被标记为"有价值"并通知产品团队；
                低价值或无效反馈将自动归档。您可以在历史记录中查看 AI 的分析结果。
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
