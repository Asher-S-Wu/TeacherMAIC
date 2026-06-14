import tinycolor from 'tinycolor2';
import type { PPTElement, PPTLineElement } from '@/lib/types/slides';

interface RotatedElementData {
  left: number;
  top: number;
  width: number;
  height: number;
  rotate: number;
}

/**
 * 计算元素在画布中的矩形范围旋转后的新位置范围
 * @param element 元素的位置大小和旋转角度信息
 */
export const getRectRotatedRange = (element: RotatedElementData) => {
  const { left, top, width, height, rotate = 0 } = element;

  const radius = Math.sqrt(Math.pow(width, 2) + Math.pow(height, 2)) / 2;
  const auxiliaryAngle = (Math.atan(height / width) * 180) / Math.PI;

  const tlbraRadian = ((180 - rotate - auxiliaryAngle) * Math.PI) / 180;
  const trblaRadian = ((auxiliaryAngle - rotate) * Math.PI) / 180;

  const middleLeft = left + width / 2;
  const middleTop = top + height / 2;

  const xAxis = [
    middleLeft + radius * Math.cos(tlbraRadian),
    middleLeft + radius * Math.cos(trblaRadian),
    middleLeft - radius * Math.cos(tlbraRadian),
    middleLeft - radius * Math.cos(trblaRadian),
  ];
  const yAxis = [
    middleTop - radius * Math.sin(tlbraRadian),
    middleTop - radius * Math.sin(trblaRadian),
    middleTop + radius * Math.sin(tlbraRadian),
    middleTop + radius * Math.sin(trblaRadian),
  ];

  return {
    xRange: [Math.min(...xAxis), Math.max(...xAxis)],
    yRange: [Math.min(...yAxis), Math.max(...yAxis)],
  };
};

/**
 * 计算元素在画布中的位置范围
 * @param element 元素信息
 */
export const getElementRange = (element: PPTElement) => {
  let minX, maxX, minY, maxY;

  if (element.type === 'line') {
    minX = element.left;
    maxX = element.left + Math.max(element.start[0], element.end[0]);
    minY = element.top;
    maxY = element.top + Math.max(element.start[1], element.end[1]);
  } else if ('rotate' in element && element.rotate) {
    const { left, top, width, height, rotate } = element;
    const { xRange, yRange } = getRectRotatedRange({
      left,
      top,
      width,
      height,
      rotate,
    });
    minX = xRange[0];
    maxX = xRange[1];
    minY = yRange[0];
    maxY = yRange[1];
  } else {
    minX = element.left;
    maxX = element.left + element.width;
    minY = element.top;
    maxY = element.top + element.height;
  }
  return { minX, maxX, minY, maxY };
};

/**
 * 计算一组元素在画布中的位置范围
 * @param elementList 一组元素信息
 */
export const getElementListRange = (elementList: PPTElement[]) => {
  const leftValues: number[] = [];
  const topValues: number[] = [];
  const rightValues: number[] = [];
  const bottomValues: number[] = [];

  elementList.forEach((element) => {
    const { minX, maxX, minY, maxY } = getElementRange(element);
    leftValues.push(minX);
    topValues.push(minY);
    rightValues.push(maxX);
    bottomValues.push(maxY);
  });

  const minX = Math.min(...leftValues);
  const maxX = Math.max(...rightValues);
  const minY = Math.min(...topValues);
  const maxY = Math.max(...bottomValues);

  return { minX, maxX, minY, maxY };
};

export interface AlignLine {
  value: number;
  range: [number, number];
}

/**
 * 将一组对齐吸附线进行去重：同位置的的多条对齐吸附线仅留下一条，取该位置所有对齐吸附线的最大值和最小值为新的范围
 * @param lines 一组对齐吸附线信息
 */
export const uniqAlignLines = (lines: AlignLine[]) => {
  const uniqLines: AlignLine[] = [];
  lines.forEach((line) => {
    const index = uniqLines.findIndex((_line) => _line.value === line.value);
    if (index === -1) uniqLines.push(line);
    else {
      const uniqLine = uniqLines[index];
      const rangeMin = Math.min(uniqLine.range[0], line.range[0]);
      const rangeMax = Math.max(uniqLine.range[1], line.range[1]);
      const range: [number, number] = [rangeMin, rangeMax];
      const _line = { value: line.value, range };
      uniqLines[index] = _line;
    }
  });
  return uniqLines;
};

/**
 * 根据表格的主题色，获取对应用于配色的子颜色
 * @param themeColor 主题色
 */
export const getTableSubThemeColor = (themeColor: string) => {
  const rgba = tinycolor(themeColor);
  return [rgba.setAlpha(0.3).toRgbString(), rgba.setAlpha(0.1).toRgbString()];
};

/**
 * 获取线条元素路径字符串
 * @param element 线条元素
 */
export const getLineElementPath = (element: PPTLineElement) => {
  // Defensive: ensure start and end are arrays
  const startArr = Array.isArray(element.start) ? element.start : [0, 0];
  const endArr = Array.isArray(element.end) ? element.end : [100, 100];
  const start = startArr.join(',');
  const end = endArr.join(',');
  if (element.broken) {
    const mid = element.broken.join(',');
    return `M${start} L${mid} L${end}`;
  } else if (element.broken2) {
    const { minX, maxX, minY, maxY } = getElementRange(element);
    if (maxX - minX >= maxY - minY)
      return `M${start} L${element.broken2[0]},${startArr[1]} L${element.broken2[0]},${endArr[1]} ${end}`;
    return `M${start} L${startArr[0]},${element.broken2[1]} L${endArr[0]},${element.broken2[1]} ${end}`;
  } else if (element.curve) {
    const mid = element.curve.join(',');
    return `M${start} Q${mid} ${end}`;
  } else if (element.cubic) {
    const [c1, c2] = element.cubic;
    const p1 = c1.join(',');
    const p2 = c2.join(',');
    return `M${start} C${p1} ${p2} ${end}`;
  }
  return `M${start} L${end}`;
};
