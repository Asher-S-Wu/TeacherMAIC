declare module 'svg-arc-to-cubic-bezier' {
  export interface ArcToBezierInput {
    px: number;
    py: number;
    cx: number;
    cy: number;
    rx: number;
    ry: number;
    xAxisRotation: number;
    largeArcFlag: number;
    sweepFlag: number;
  }

  export interface CubicBezierPoint {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    x: number;
    y: number;
  }

  export default function arcToBezier(input: ArcToBezierInput): CubicBezierPoint[];
}
