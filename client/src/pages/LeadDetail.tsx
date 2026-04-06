import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { toast } from "sonner";
import {
  Loader2, ArrowLeft, Mail, Send, RefreshCw, MessageSquare,
  ChevronDown, ChevronUp, Copy, Check, Globe, Building2,
  Target, Lightbulb, Brain, SkipForward
} from "lucide-react";

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const leadId = parseInt(params.id || '0');
  const utils = trpc.useUtils();

  const { data, isLoading, error } = trpc.workflow.loadLead.useQuery(
    { leadId },
    { enabled: leadId > 0 }
  );

  const markSent = trpc.workflow.markSent.useMutation({
    onSuccess: () => { toast.success('已标记为已发送'); utils.workflow.loadLead.invalidate({ leadId }); utils.leads.list.invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  const generateFollowup = trpc.workflow.generateFollowup.useMutation({
    onSuccess: () => { toast.success('跟进邮件已生成'); utils.workflow.loadLead.invalidate({ leadId }); utils.leads.list.invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  const regenerateEmail = trpc.workflow.regenerateEmail.useMutation({
    onSuccess: () => { toast.success('邮件已重新生成'); utils.workflow.loadLead.invalidate({ leadId }); },
    onError: (err) => toast.error(err.message),
  });

  const [replyContent, setReplyContent] = useState('');
  const analyzeReplyMut = trpc.workflow.analyzeReply.useMutation({
    onSuccess: () => { toast.success('回复已分析，新邮件已生成'); setReplyContent(''); utils.workflow.loadLead.invalidate({ leadId }); utils.leads.list.invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  const markNoReply = trpc.workflow.markNoReply.useMutation({
    onSuccess: () => { toast.success('已标记无回复'); utils.workflow.loadLead.invalidate({ leadId }); },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-muted-foreground">客户不存在或无权访问</p>
        <Button variant="outline" onClick={() => setLocation('/leads')}>
          <ArrowLeft className="mr-2 h-4 w-4" />返回列表
        </Button>
      </div>
    );
  }

  const { lead, state, timeline } = data;
  const currentState = state?.currentState || 'input_ready';
  const currentRound = state?.currentRound || 0;

  const isProcessing = markSent.isPending || generateFollowup.isPending || analyzeReplyMut.isPending || regenerateEmail.isPending || markNoReply.isPending;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation('/leads')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              {lead.companyName || lead.website}
            </h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{lead.email}</span>
              <span className="flex items-center gap-1"><Globe className="h-3 w-3" />{lead.website}</span>
            </div>
          </div>
        </div>
        <Badge variant="outline" className="shrink-0">
          Round {currentRound}
        </Badge>
      </div>

      {/* Action Bar */}
      <Card className="border-primary/20">
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground flex-1 min-w-0">
              <span className="font-medium text-foreground">{state?.nextAction || '等待操作'}</span>
            </p>

            {(currentState === 'waiting_user_send' || currentState === 'waiting_user_send_followup' || currentState === 'drafting_reply_email') && (
              <Button
                onClick={() => markSent.mutate({ leadId })}
                disabled={isProcessing}
                size="sm"
              >
                {markSent.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                标记已发送
              </Button>
            )}

            {currentState === 'waiting_response_status' && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">客户是否回复？</span>
                <Button
                  onClick={() => {
                    const replySection = document.getElementById('reply-section');
                    if (replySection) replySection.scrollIntoView({ behavior: 'smooth' });
                  }}
                  disabled={isProcessing}
                  variant="default"
                  size="sm"
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  有回复
                </Button>
                <Button
                  onClick={() => generateFollowup.mutate({ leadId })}
                  disabled={isProcessing}
                  variant="outline"
                  size="sm"
                >
                  {generateFollowup.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <SkipForward className="mr-2 h-4 w-4" />}
                  无回复 - 生成跟进
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Reply Input */}
      {(currentState === 'waiting_response_status' || currentState === 'waiting_user_send' || currentState === 'waiting_user_send_followup') && (
        <Card id="reply-section">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              粘贴客户回复
            </CardTitle>
            <CardDescription>粘贴客户的回复内容，AI 会分析意图并生成回复邮件</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              placeholder="将客户的回复邮件内容粘贴到这里..."
              rows={4}
            />
            <Button
              onClick={() => {
                if (!replyContent.trim()) { toast.error('请粘贴回复内容'); return; }
                analyzeReplyMut.mutate({ leadId, replyContent });
              }}
              disabled={isProcessing || !replyContent.trim()}
              size="sm"
            >
              {analyzeReplyMut.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />分析中...</>
              ) : (
                <><Brain className="mr-2 h-4 w-4" />分析回复并生成邮件</>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">工作流时间线</h2>
        {timeline?.length ? (
          <div className="space-y-4">
            {timeline.map((item: any) => {
              if (item.kind === 'thinking') {
                return <ThinkingCard key={item.id} title={item.title} cards={item.cards} />;
              }
              if (item.kind === 'email') {
                return (
                  <EmailCard
                    key={item.id}
                    email={item.email}
                    onRegenerate={() => regenerateEmail.mutate({ leadId, emailId: item.email.id })}
                    isRegenerating={regenerateEmail.isPending}
                  />
                );
              }
              return null;
            })}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center text-muted-foreground">
              暂无工作流数据
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function ThinkingCard({ title, cards }: { title: string; cards: Array<{ title: string; items: string[] }> }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Card className="bg-secondary/30 border-secondary">
      <CardContent className="py-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center justify-between w-full text-left"
        >
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">{title}</span>
          </div>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
        {expanded && (
          <div className="mt-3 space-y-3">
            {cards?.map((card: any, i: number) => (
              <div key={i} className="pl-6 border-l-2 border-primary/20">
                <p className="text-sm font-medium text-primary">{card.title}</p>
                <ul className="mt-1 space-y-0.5">
                  {card.items?.map((item: string, j: number) => (
                    <li key={j} className="text-xs text-muted-foreground">{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EmailCard({ email, onRegenerate, isRegenerating }: {
  email: { id: number; subject: string; body: string; type: string; round: number; status?: string };
  onRegenerate: () => void;
  isRegenerating: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const typeLabels: Record<string, string> = {
    warm: '首封开发信',
    followup: '跟进邮件',
    reply: '回复邮件',
  };

  const copyToClipboard = () => {
    const text = `Subject: ${email.subject}\n\n${email.body}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      toast.success('已复制到剪贴板');
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">{typeLabels[email.type] || email.type}</CardTitle>
            {email.round > 0 && <Badge variant="secondary" className="text-xs">R{email.round}</Badge>}
            {email.status === 'draft' && <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-400 border-amber-500/20">草稿</Badge>}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={copyToClipboard}>
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost" size="icon" className="h-8 w-8"
              onClick={onRegenerate} disabled={isRegenerating}
            >
              <RefreshCw className={`h-4 w-4 ${isRegenerating ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-xs text-muted-foreground mb-1">主题</p>
          <p className="text-sm font-medium">{email.subject}</p>
        </div>
        <Separator />
        <div>
          <p className="text-xs text-muted-foreground mb-1">正文</p>
          <div className="text-sm whitespace-pre-wrap leading-relaxed">{email.body}</div>
        </div>
      </CardContent>
    </Card>
  );
}
