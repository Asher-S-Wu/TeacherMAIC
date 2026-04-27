/**
 * User Profile Store
 * Keeps avatar, nickname & bio in memory and saves changes to the account.
 */

import { create } from 'zustand';

/** Predefined avatar options */
export const AVATAR_OPTIONS = [
  '/avatars/user.png',
  '/avatars/teacher-2.png',
  '/avatars/assist-2.png',
  '/avatars/clown-2.png',
  '/avatars/curious-2.png',
  '/avatars/note-taker-2.png',
  '/avatars/thinker-2.png',
] as const;

export interface UserProfileState {
  /** Local avatar path or data-URL (for custom uploads) */
  avatar: string;
  nickname: string;
  bio: string;
  setAvatar: (avatar: string) => void;
  setNickname: (nickname: string) => void;
  setBio: (bio: string) => void;
}

function saveProfile(profile: Partial<Pick<UserProfileState, 'avatar' | 'nickname' | 'bio'>>) {
  void fetch('/api/auth/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  }).catch(() => {});
}

export const useUserProfileStore = create<UserProfileState>()((set, get) => ({
  avatar: AVATAR_OPTIONS[0],
  nickname: '',
  bio: '',
  setAvatar: (avatar) => {
    set({ avatar });
    const { nickname, bio } = get();
    saveProfile({ avatar, nickname, bio });
  },
  setNickname: (nickname) => {
    set({ nickname });
    const { avatar, bio } = get();
    saveProfile({ avatar, nickname, bio });
  },
  setBio: (bio) => {
    set({ bio });
    const { avatar, nickname } = get();
    saveProfile({ avatar, nickname, bio });
  },
}));
