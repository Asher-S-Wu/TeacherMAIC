'use client';

import { useState, useCallback } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Loader2, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { createLogger } from '@/lib/logger';

const log = createLogger('GeneralSettings');

const CONFIRM_PHRASE = '确认删除';
const CLEAR_CACHE_ITEMS = ['课堂和场景数据', '对话历史记录', '音频和图片缓存', '应用设置和偏好'];

export function GeneralSettings() {
  // Clear cache state
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [clearing, setClearing] = useState(false);

  const isConfirmValid = confirmInput === CONFIRM_PHRASE;

  const handleClearCache = useCallback(async () => {
    if (!isConfirmValid) return;
    setClearing(true);
    try {
      sessionStorage.clear();

      toast.success('缓存已清空，页面即将刷新');

      // Reload page after a short delay
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      log.error('Failed to clear cache:', error);
      toast.error('清空缓存失败，请重试');
      setClearing(false);
    }
  }, [isConfirmValid]);

  return (
    <div className="flex flex-col gap-8">
      {/* Danger Zone - Clear Cache */}
      <div className="relative rounded-xl border border-destructive/30 bg-destructive/[0.03] dark:bg-destructive/[0.06] overflow-hidden">
        {/* Subtle diagonal stripe pattern for danger emphasis */}
        <div
          className="absolute inset-0 opacity-[0.015] dark:opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: `repeating-linear-gradient(
              -45deg,
              transparent,
              transparent 10px,
              currentColor 10px,
              currentColor 11px
            )`,
          }}
        />

        <div className="relative p-4 space-y-4">
          {/* Header */}
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-md bg-destructive/10 text-destructive">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-destructive">危险区域</h3>
          </div>

          {/* Content */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">清空本地缓存</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                删除所有本地存储的数据，包括课堂记录、对话历史、音频缓存和应用配置。此操作不可撤销。
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              className="shrink-0"
              onClick={() => {
                setConfirmInput('');
                setShowClearDialog(true);
              }}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              清空本地缓存
            </Button>
          </div>
        </div>
      </div>

      {/* Clear Cache Confirmation Dialog */}
      <AlertDialog
        open={showClearDialog}
        onOpenChange={(open) => {
          if (!clearing) {
            setShowClearDialog(open);
            if (!open) setConfirmInput('');
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              确定要清空所有缓存吗？
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>此操作将永久删除以下所有数据，且无法恢复：</p>
                <ul className="space-y-1.5 ml-1">
                  {CLEAR_CACHE_ITEMS.map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-destructive/60 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
                <div className="pt-1">
                  <Label className="text-xs font-medium text-foreground">
                    请输入「确认删除」以继续
                  </Label>
                  <Input
                    className="mt-1.5 h-9 text-sm"
                    placeholder={CONFIRM_PHRASE}
                    value={confirmInput}
                    onChange={(e) => setConfirmInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && isConfirmValid) {
                        handleClearCache();
                      }
                    }}
                    autoFocus
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearing}>取消</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={!isConfirmValid || clearing}
              onClick={handleClearCache}
            >
              {clearing ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-1.5" />
              )}
              永久删除所有数据
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
