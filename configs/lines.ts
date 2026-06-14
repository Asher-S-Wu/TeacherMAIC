import type { LinePoint, LineStyleType } from '@/lib/types/slides';

export interface LinePoolItem {
  path: string;
  style: LineStyleType;
  points: [LinePoint, LinePoint];
  isBroken?: boolean;
  isBroken2?: boolean;
  isCurve?: boolean;
  isCubic?: boolean;
}
