'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { LogIn, UserPlus, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSettingsStore } from '@/lib/store/settings';
import { useUserProfileStore } from '@/lib/store/user-profile';

export interface AccountUser {
  id: string;
  email: string;
  role: 'user' | 'super_admin';
  status: 'active' | 'disabled';
  profile: {
    nickname?: string;
    bio?: string;
    avatar?: string;
  };
}

interface AccountContextValue {
  user: AccountUser;
  refreshUser: () => Promise<void>;
}

const AccountContext = createContext<AccountContextValue | null>(null);

export function useAccount() {
  const ctx = useContext(AccountContext);
  if (!ctx) {
    throw new Error('useAccount must be used inside AccountGuard');
  }
  return ctx;
}

async function fetchMe(): Promise<AccountUser | null> {
  const response = await fetch('/api/auth/me');
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.success) return null;
  return data.user;
}

export function AccountGuard({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AccountUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [settingsReady, setSettingsReady] = useState(false);

  const refreshUser = useCallback(async () => {
    setSettingsReady(false);
    const current = await fetchMe();
    setUser(current);
    if (current?.profile) {
      useUserProfileStore.setState({
        nickname: current.profile.nickname || '',
        bio: current.profile.bio || '',
        avatar: current.profile.avatar || useUserProfileStore.getState().avatar,
      });
    }
    if (current) {
      await useSettingsStore.persist.rehydrate();
    }
    setSettingsReady(true);
  }, []);

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  const value = useMemo(() => (user ? { user, refreshUser } : null), [user, refreshUser]);

  if (loading || !settingsReady) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-slate-950 text-white">
        <LoaderCircle className="size-6 animate-spin" />
      </div>
    );
  }

  if (!user || !value) {
    return <AuthScreen onAuthed={refreshUser} />;
  }

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

function AuthScreen({ onAuthed }: { onAuthed: () => Promise<void> }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await fetch(mode === 'login' ? '/api/auth/login' : '/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, confirmPassword }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        setError(data?.error || '操作失败，请检查输入');
        return;
      }
      await onAuthed();
    } catch {
      setError('网络连接失败，请稍后再试');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-[100dvh] bg-[#f7f4ed] text-slate-950 flex items-center justify-center px-4">
      <div className="absolute inset-0 pointer-events-none opacity-[0.08] bg-[linear-gradient(90deg,#0f172a_1px,transparent_1px),linear-gradient(#0f172a_1px,transparent_1px)] bg-[size:42px_42px]" />
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-[420px] rounded-[24px] border border-slate-950/10 bg-white p-7 shadow-[0_24px_80px_rgba(15,23,42,0.18)]"
      >
        <div className="mb-7">
          <img src="/logo-horizontal.png" alt="李雪 AI 教育平台" className="h-12 -ml-2 mb-4" />
          <h1 className="text-2xl font-semibold tracking-normal">
            {mode === 'login' ? '登录账户' : '注册账户'}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {mode === 'login' ? '登录后访问你的课堂和生成记录。' : '使用邮箱和密码创建账户。'}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="邮箱"
            autoComplete="email"
            required
          />
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密码"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
          />
          {mode === 'register' && (
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="再次输入密码"
              autoComplete="new-password"
              required
            />
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button type="submit" className="w-full gap-2" disabled={loading}>
            {loading ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : mode === 'login' ? (
              <LogIn className="size-4" />
            ) : (
              <UserPlus className="size-4" />
            )}
            {mode === 'login' ? '登录' : '注册'}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => {
            setError('');
            setMode(mode === 'login' ? 'register' : 'login');
          }}
          className="mt-5 text-sm text-slate-500 hover:text-slate-950"
        >
          {mode === 'login' ? '没有账户？去注册' : '已有账户？去登录'}
        </button>
      </motion.section>
    </main>
  );
}
