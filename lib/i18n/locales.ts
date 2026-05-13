export type LocaleEntry = {
  code: string;
  label: string;
  shortLabel: string;
};

export const supportedLocales = [
  { code: 'zh-CN', label: '简体中文', shortLabel: 'CN' },
] as const satisfies readonly LocaleEntry[];
