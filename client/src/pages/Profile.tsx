import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, Save, Building2, Package, Award, Clock, FileUp, Trash2 } from "lucide-react";

export default function ProfilePage() {
  const profile = trpc.profile.get.useQuery();
  const saveProfile = trpc.profile.save.useMutation({
    onSuccess: () => { toast.success('资料已保存'); profile.refetch(); },
    onError: (err) => toast.error(err.message),
  });
  const uploadAsset = trpc.profile.uploadAsset.useMutation({
    onSuccess: () => { toast.success('文件已上传'); profile.refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const [form, setForm] = useState({
    companyName: '', website: '', mainProducts: '', coreAdvantages: '',
    certifications: '', moqLeadTime: '', samplePolicy: '', customization: '',
  });

  useEffect(() => {
    if (profile.data) {
      setForm({
        companyName: profile.data.companyName || '',
        website: profile.data.website || '',
        mainProducts: profile.data.mainProducts || '',
        coreAdvantages: profile.data.coreAdvantages || '',
        certifications: profile.data.certifications || '',
        moqLeadTime: profile.data.moqLeadTime || '',
        samplePolicy: profile.data.samplePolicy || '',
        customization: profile.data.customization || '',
      });
    }
  }, [profile.data]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error('文件大小不能超过 10MB'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      uploadAsset.mutate({
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
        fileBase64: base64,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  if (profile.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">发件人资料</h1>
        <p className="text-muted-foreground mt-1">AI 根据这些信息为你生成个性化的开发信</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!form.companyName) { toast.error('请填写公司名称'); return; }
          saveProfile.mutate({ ...form, onboardingComplete: true });
        }}
        className="space-y-6"
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              公司基本信息
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>公司名称 *</Label>
                <Input
                  value={form.companyName}
                  onChange={(e) => setForm(p => ({ ...p, companyName: e.target.value }))}
                  placeholder="Your Company Inc."
                />
              </div>
              <div className="space-y-2">
                <Label>公司网站</Label>
                <Input
                  value={form.website}
                  onChange={(e) => setForm(p => ({ ...p, website: e.target.value }))}
                  placeholder="https://yourcompany.com"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              产品与优势
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>主营产品</Label>
              <Textarea
                value={form.mainProducts}
                onChange={(e) => setForm(p => ({ ...p, mainProducts: e.target.value }))}
                placeholder="例如：SPC 地板、WPC 墙板、LVT 地砖..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>核心优势</Label>
              <Textarea
                value={form.coreAdvantages}
                onChange={(e) => setForm(p => ({ ...p, coreAdvantages: e.target.value }))}
                placeholder="例如：自有工厂、10年出口经验、年产能500万㎡..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5 text-primary" />
              资质与认证
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>认证资质</Label>
              <Textarea
                value={form.certifications}
                onChange={(e) => setForm(p => ({ ...p, certifications: e.target.value }))}
                placeholder="例如：CE、SGS、ISO9001、FloorScore..."
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              交易条件
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>MOQ & 交期</Label>
                <Input
                  value={form.moqLeadTime}
                  onChange={(e) => setForm(p => ({ ...p, moqLeadTime: e.target.value }))}
                  placeholder="MOQ 500㎡, 15天交期"
                />
              </div>
              <div className="space-y-2">
                <Label>样品政策</Label>
                <Input
                  value={form.samplePolicy}
                  onChange={(e) => setForm(p => ({ ...p, samplePolicy: e.target.value }))}
                  placeholder="免费样品，运费到付"
                />
              </div>
              <div className="space-y-2">
                <Label>定制能力</Label>
                <Input
                  value={form.customization}
                  onChange={(e) => setForm(p => ({ ...p, customization: e.target.value }))}
                  placeholder="支持OEM/ODM"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Button type="submit" disabled={saveProfile.isPending} size="lg" className="w-full">
          {saveProfile.isPending
            ? <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />保存中...</span>
            : <span className="flex items-center gap-2"><Save className="h-4 w-4" />保存资料</span>
          }
        </Button>
      </form>

      {/* Assets Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileUp className="h-5 w-5 text-primary" />
            素材文件
          </CardTitle>
          <CardDescription>上传产品手册、认证文件等，AI 会提取内容用于邮件生成</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label
              htmlFor="file-upload"
              className="flex items-center justify-center border-2 border-dashed rounded-lg p-8 cursor-pointer hover:border-primary/50 transition-colors"
            >
              {uploadAsset.isPending ? (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : (
                <div className="text-center">
                  <FileUp className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">点击上传文件（PDF、图片等，最大 10MB）</p>
                </div>
              )}
            </Label>
            <input id="file-upload" type="file" className="hidden" onChange={handleFileUpload} accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" />
          </div>

          {profile.data?.assets && profile.data.assets.length > 0 && (
            <div className="space-y-2">
              {profile.data.assets.map((asset: any) => (
                <div key={asset.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileUp className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{asset.fileName}</p>
                      <p className="text-xs text-muted-foreground">{asset.fileSize ? `${(asset.fileSize / 1024).toFixed(1)} KB` : ''}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
