'use client';

import Link from 'next/link';
import { LogOut, Shield, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { useAccount } from '@/components/auth/account-guard';

export function AccountMenu() {
  const { user } = useAccount();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    location.reload();
  }

  return (
    <div className="relative group">
      <button className="p-2 rounded-full text-gray-400 dark:text-gray-500 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 hover:shadow-sm transition-all">
        <UserRound className="w-4 h-4" />
      </button>
      <div className="absolute top-full right-0 mt-2 hidden group-focus-within:block group-hover:block w-56 overflow-hidden rounded-xl border border-border bg-background shadow-lg z-50">
        <div className="px-3 py-2 border-b border-border">
          <div className="text-sm font-medium truncate">{user.profile.nickname || user.email}</div>
          <div className="text-xs text-muted-foreground truncate">{user.email}</div>
        </div>
        {user.role === 'super_admin' && (
          <Link
            href="/admin"
            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors"
          >
            <Shield className="size-4" />
            用户管理
          </Link>
        )}
        <button
          onClick={() => {
            toast.message('正在退出账户');
            void logout();
          }}
          className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted transition-colors"
        >
          <LogOut className="size-4" />
          退出登录
        </button>
      </div>
    </div>
  );
}
