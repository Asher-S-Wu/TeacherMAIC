'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, LoaderCircle, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAccount } from '@/components/auth/account-guard';

interface AdminUser {
  id: string;
  email: string;
  role: 'user' | 'super_admin';
  status: 'active' | 'disabled';
  profile: {
    nickname?: string;
  };
  createdAt: string;
  lastLoginAt?: string;
}

export default function AdminPage() {
  const { user } = useAccount();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [passwords, setPasswords] = useState<Record<string, string>>({});

  async function loadUsers() {
    setLoading(true);
    const response = await fetch('/api/admin/users');
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.success) {
      toast.error(data?.error || '无法读取用户列表');
      setLoading(false);
      return;
    }
    setUsers(data.users);
    setLoading(false);
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  async function setStatus(id: string, status: 'active' | 'disabled') {
    const response = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.success) {
      toast.error(data?.error || '操作失败');
      return;
    }
    await loadUsers();
  }

  async function deleteUser(id: string) {
    const response = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.success) {
      toast.error(data?.error || '删除失败');
      return;
    }
    toast.success('用户已删除');
    await loadUsers();
  }

  async function resetPassword(id: string) {
    const password = passwords[id] || '';
    const response = await fetch(`/api/admin/users/${id}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, confirmPassword: password }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.success) {
      toast.error(data?.error || '重置失败');
      return;
    }
    setPasswords((prev) => ({ ...prev, [id]: '' }));
    toast.success('密码已重置');
  }

  if (user.role !== 'super_admin') {
    return (
      <main className="min-h-[100dvh] flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-lg font-semibold">只有超级管理员可以访问这里</p>
          <Link href="/" className="mt-4 inline-block text-sm text-muted-foreground hover:text-foreground">
            返回首页
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-slate-50 dark:bg-slate-950 p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-4" />
              返回首页
            </Link>
            <h1 className="mt-3 text-2xl font-semibold tracking-normal flex items-center gap-2">
              <ShieldCheck className="size-6 text-emerald-600" />
              用户管理
            </h1>
          </div>
          <Button variant="outline" onClick={() => void loadUsers()} disabled={loading}>
            {loading ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            刷新
          </Button>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-background">
          <div className="grid grid-cols-[1.4fr_0.7fr_0.8fr_1.2fr_1.5fr] gap-3 border-b border-border px-4 py-3 text-sm font-medium text-muted-foreground">
            <div>用户</div>
            <div>身份</div>
            <div>状态</div>
            <div>最近登录</div>
            <div>操作</div>
          </div>
          {loading ? (
            <div className="p-10 flex justify-center">
              <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            users.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-[1.4fr_0.7fr_0.8fr_1.2fr_1.5fr] gap-3 items-center border-b border-border/60 px-4 py-3 text-sm last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">{item.profile.nickname || item.email}</div>
                  <div className="text-xs text-muted-foreground truncate">{item.email}</div>
                </div>
                <div>{item.role === 'super_admin' ? '超级管理员' : '普通用户'}</div>
                <div>{item.status === 'active' ? '可使用' : '已停用'}</div>
                <div className="text-muted-foreground">
                  {item.lastLoginAt ? new Date(item.lastLoginAt).toLocaleString() : '暂无'}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void setStatus(item.id, item.status === 'active' ? 'disabled' : 'active')}
                    disabled={item.role === 'super_admin'}
                  >
                    {item.status === 'active' ? '停用' : '启用'}
                  </Button>
                  <Input
                    className="h-9 w-32"
                    type="password"
                    placeholder="新密码"
                    value={passwords[item.id] || ''}
                    onChange={(e) => setPasswords((prev) => ({ ...prev, [item.id]: e.target.value }))}
                  />
                  <Button size="sm" variant="outline" onClick={() => void resetPassword(item.id)}>
                    重置
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => void deleteUser(item.id)}
                    disabled={item.role === 'super_admin'}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
