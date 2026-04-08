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
  Brain, SkipForward, CheckCircle2, Clock
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

  const batchSend = trpc.batch.sendEmails.useMutation({
    onSuccess: () => { toast.success('邮件已发送'); utils.workflow.loadLead.invalidate({ leadId }); utils.leads.list.invalidate(); },
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

  const [showSendConfirm, setShowSendConfirm] = useState(false);
  const [emailToSend, setEmailToSend] = useState<{ id: number; subject: string; body: string } | null>(null);

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

  const isProcessing = markSent.isPending || generateFollowup.isPending || analyzeReplyMut.isPending || regenerateEmail.isPending || markNoReply.isPending || batchSend.isPending;

  // Find the latest draft email for sending
  const latestDraftEmail = timeline?.filter((t: any) => t.kind === 'email' && t.email?.status === 'draft').pop() as any;

  const handleSendViaGmail = (email: { id: number; subject: string; body: string }) => {
    setEmailToSend(email);
    setShowSendConfirm(true);
  };

  const handleConfirmSend = async () => {
    if (!emailToSend) return;
    setShowSendConfirm(false);
    try {
      await batchSend.mutateAsync({
        emailIds: [emailToSend.id],
      });
    } catch { /* handled by mutation */ }
    setEmailToSend(null);
  };

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

            {(currentState === 'waiting_user_send' || currentState === 'waiting_user_send_followup' || currentState === 'drafting_reply_email') && latestDraftEmail && (
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => handleSendViaGmail(latestDraftEmail.email)}
                  disabled={isProcessing}
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {batchSend.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  发送邮件
                </Button>
                <Button
                  onClick={() => markSent.mutate({ leadId, emailId: latestDraftEmail.email.id })}
                  disabled={isProcessing}
                  size="sm"
                  variant="outline"
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  手动标记已发送
                </Button>
              </div>
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
                <span className="flex items-center gap-2"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 分析中...</span>
              ) : (
                <span className="flex items-center gap-2"><Brain className="mr-2 h-4 w-4" /> 分析回复并生成邮件</span>
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
                    leadEmail={lead.email}
                    leadId={leadId}
                    onRegenerate={() => regenerateEmail.mutate({ leadId, emailId: item.email.id })}
                    onSend={() => handleSendViaGmail(item.email)}
                    isRegenerating={regenerateEmail.isPending}
                    isSending={batchSend.isPending}
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

      {/* Send Confirmation Dialog */}
      <Dialog open={showSendConfirm} onOpenChange={setShowSendConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认发送邮件</DialogTitle>
            <DialogDescription>
              即将发送邮件给 <strong>{lead.email}</strong>。发送后将开始48小时自动跟进倒计时。
            </DialogDescription>
          </DialogHeader>
          {emailToSend && (
            <div className="space-y-3 my-2">
              <div className="p-3 rounded-lg bg-accent/50">
                <p className="text-xs text-muted-foreground mb-1">收件人</p>
                <p className="text-sm font-medium">{lead.email}</p>
              </div>
              <div className="p-3 rounded-lg bg-accent/50">
                <p className="text-xs text-muted-foreground mb-1">主题</p>
                <p className="text-sm font-medium">{emailToSend.subject}</p>
              </div>
              <div className="p-3 rounded-lg bg-accent/50 max-h-40 overflow-y-auto">
                <p className="text-xs text-muted-foreground mb-1">正文预览</p>
                <p className="text-sm whitespace-pre-wrap">{emailToSend.body.substring(0, 300)}{emailToSend.body.length > 300 ? '...' : ''}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSendConfirm(false)}>取消</Button>
            <Button onClick={handleConfirmSend} className="bg-emerald-600 hover:bg-emerald-700">
              <Send className="h-4 w-4 mr-2" />
              确认发送
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

// Status progression steps
const EMAIL_STATUS_STEPS = [
  { key: 'draft', label: '草稿', color: 'text-amber-400', bgActive: 'bg-amber-500', bgInactive: 'bg-muted-foreground/30' },
  { key: 'sent', label: '已发送', color: 'text-blue-400', bgActive: 'bg-blue-500', bgInactive: 'bg-muted-foreground/30' },
  { key: 'delivered', label: '已送达', color: 'text-emerald-400', bgActive: 'bg-emerald-500', bgInactive: 'bg-muted-foreground/30' },
  { key: 'replied', label: '已回复', color: 'text-violet-400', bgActive: 'bg-violet-500', bgInactive: 'bg-muted-foreground/30' },
] as const;

function getStatusIndex(status?: string): number {
  if (!status) return 0;
  const map: Record<string, number> = { draft: 0, sent: 1, delivered: 2, replied: 3 };
  return map[status] ?? 0;
}

function EmailStatusBar({ status }: { status?: string }) {
  const currentIdx = getStatusIndex(status);
  return (
    <div className="flex items-center gap-1 w-full">
      {EMAIL_STATUS_STEPS.map((step, i) => {
        const isActive = i <= currentIdx;
        const isCurrent = i === currentIdx;
        return (
          <div key={step.key} className="flex items-center gap-1 flex-1">
            <div className="flex flex-col items-center flex-1">
              <div className={`h-1.5 w-full rounded-full transition-colors ${
                isActive ? step.bgActive : step.bgInactive
              }`} />
              <span className={`text-[10px] mt-1 transition-colors ${
                isCurrent ? step.color + ' font-medium' : isActive ? 'text-muted-foreground' : 'text-muted-foreground/50'
              }`}>
                {step.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EmailCard({ email, leadEmail, leadId, onRegenerate, onSend, isRegenerating, isSending }: {
  email: { id: number; subject: string; body: string; type: string; round: number; status?: string; sentAt?: string | null };
  leadEmail: string;
  leadId: number;
  onRegenerate: () => void;
  onSend: () => void;
  isRegenerating: boolean;
  isSending: boolean;
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

  const isSent = email.status === 'sent' || email.status === 'delivered' || email.status === 'replied';

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">{typeLabels[email.type] || email.type}</CardTitle>
            {email.round > 0 && <Badge variant="secondary" className="text-xs">R{email.round}</Badge>}
            {email.sentAt && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(email.sentAt).toLocaleString()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={copyToClipboard}>
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
            {!isSent && (
              <>
                <Button
                  variant="ghost" size="icon" className="h-8 w-8"
                  onClick={onRegenerate} disabled={isRegenerating}
                >
                  <RefreshCw className={`h-4 w-4 ${isRegenerating ? 'animate-spin' : ''}`} />
                </Button>
                <Button
                  variant="ghost" size="sm" className="h-8 text-emerald-400 hover:text-emerald-300"
                  onClick={onSend} disabled={isSending}
                >
                  {isSending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                  发送
                </Button>
              </>
            )}
          </div>
        </div>
        {/* Status progression bar */}
        <div className="mt-2">
          <EmailStatusBar status={email.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-xs text-muted-foreground mb-1">收件人: {leadEmail} | 主题</p>
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
