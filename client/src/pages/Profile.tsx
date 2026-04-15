import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import {
  Loader2, Save, Building2, Package, Award, Clock, FileUp, Trash2,
  Upload, CheckCircle2, XCircle,
} from "lucide-react";

export default function ProfilePage() {
  const profile = trpc.profile.get.useQuery();
  const saveProfile = trpc.profile.save.useMutation({
    onSuccess: () => { toast.success('资料已保存'); profile.refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const deleteAsset = trpc.profile.deleteAsset.useMutation({
    onSuccess: () => { toast.success('文件已删除'); profile.refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const [isDragging, setIsDragging] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<
    { file: File; status: 'pending' | 'uploading' | 'done' | 'error'; progress?: string }[]
  >([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isUploading = uploadQueue.some((item) => item.status === 'uploading');
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

const uploadSingleFile = useCallback(async (file, queueIndex) => {
    if (file.size > 100 * 1024 * 1024) {
      setUploadQueue((prev) => prev.map((item, i) => i === queueIndex ? { ...item, status: 'error', progress: '超过 100MB' } : item));
      return;
    }
    setUploadQueue((prev) => prev.map((item, i) => i === queueIndex ? { ...item, status: 'uploading', progress: '读取中...' } : item));
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.readAsDataURL(file);
      });
      setUploadQueue((prev) => prev.map((item, i) => i === queueIndex ? { ...item, progress: '上传中...' } : item));
      await uploadAsset.mutateAsync({ fileName: file.name, mimeType: file.type || 'application/octet-stream', fileSize: file.size, fileBase64: base64 });
      setUploadQueue((prev) => prev.map((item, i) => i === queueIndex ? { ...item, status: 'done', progress: '完成' } : item));
    } catch (err) {
      setUploadQueue((prev) => prev.map((item, i) => i === queueIndex ? { ...item, status: 'error', progress: err?.message || '上传失败' } : item));
    }
  }, [uploadAsset]);

  const handleFiles = useCallback(async (files) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;
    const startIndex = uploadQueue.length;
    const newItems = fileArray.map((file) => ({ file, status: 'pending', progress: '等待中...' }));
    setUploadQueue((prev) => [...prev, ...newItems]);
    for (let i = 0; i < fileArray.length; i++) { await uploadSingleFile(fileArray[i], startIndex + i); }
    setTimeout(() => { setUploadQueue((prev) => prev.filter((item) => item.status !== 'done')); }, 3000);
  }, [uploadQueue.length, uploadSingleFile]);

  const handleFileChange = useCallback((e) => {
    const files = e.target.files;
    if (files && files.length > 0) handleFiles(files);
    e.target.value = '';
  }, [handleFiles]);

  const handleDragOver = useCallback((e) => { e.preventDefault(); e.stopPropagation(); }, []);
  const handleDragEnter = useCallback((e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e) => { e.preventDefault(); e.stopPropagation(); if (e.currentTarget === e.target) setIsDragging(false); }, []);
  const handleDrop = useCallback((e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); const files = e.dataTransfer.files; if (files && files.length > 0) handleFiles(files); }, [handleFiles]);

  const handleDeleteAsset = useCallback((assetId) => {
    if (window.confirm('确定要删除这个文件吗？')) { deleteAsset.mutate({ assetId }); }
  }, [deleteAsset]);

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
          <CardDescription>上传产品手册、认证文件、PPT 等任意格式文件，AI 会自动提取内容用于邮件生成</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div onDragOver={handleDragOver} onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDrop={handleDrop} onClick={() => fileInputRef.current?.click()}
            className={`flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 cursor-pointer transition-all duration-200 ${isDragging ? 'border-primary bg-primary/5 scale-[1.02]' : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'}`}>
            {isUploading ? (<Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />) : (<Upload className={`h-8 w-8 mb-2 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />)}
            <p className={`text-sm font-medium ${isDragging ? 'text-primary' : 'text-muted-foreground'}`}>
              {isDragging ? '松开鼠标即可上传' : '拖拽文件到此处，或点击选择文件'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">支持所有文件格式（PDF、Word、PPT、图片等），单文件最大 100MB，支持批量上传</p>
          </div>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} multiple />
          {uploadQueue.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">上传进度</p>
              {uploadQueue.map((item, index) => (
                <div key={`queue-${index}`} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50 text-sm">
                  {item.status === 'uploading' && <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />}
                  {item.status === 'done' && <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />}
                  {item.status === 'error' && <XCircle className="h-4 w-4 text-destructive shrink-0" />}
                  {item.status === 'pending' && <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 shrink-0" />}
                  <span className="truncate flex-1">{item.file.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{item.progress}</span>
                </div>
              ))}
            </div>
          )}
          {profile.data?.assets && profile.data.assets.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">已上传 {profile.data.assets.length} 个文件</p>
              {profile.data.assets.map((asset) => (
                <div key={asset.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 group">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileUp className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{asset.fileName}</p>
                      {asset.fileSize && (<p className="text-xs text-muted-foreground">{(asset.fileSize / 1024).toFixed(1)} KB</p>)}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive" onClick={() => handleDeleteAsset(asset.id)} disabled={deleteAsset.isPending}>
                    {deleteAsset.isPending ? (<Loader2 className="h-4 w-4 animate-spin" />) : (<Trash2 className="h-4 w-4" />)}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
