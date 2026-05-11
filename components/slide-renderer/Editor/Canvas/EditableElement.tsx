import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu';
import { useCanvasOperations } from '@/lib/hooks/use-canvas-operations';
import { ElementOrderCommands, ElementAlignCommands } from '@/lib/types/edit';
import type { PPTElement } from '@/lib/types/slides';
import { ContextMenuItems, type ContextmenuItem } from './ContextMenuItems';
import { EDITABLE_ELEMENT_COMPONENTS } from '../../element-registry';

interface EditableElementProps {
  readonly elementInfo: PPTElement;
  readonly elementIndex: number;
  readonly isMultiSelect: boolean;
  readonly selectElement: (
    e: React.MouseEvent | React.TouchEvent,
    element: PPTElement,
    canMove?: boolean,
  ) => void;
}

export function EditableElement({
  elementInfo,
  elementIndex,
  isMultiSelect,
  selectElement,
}: EditableElementProps) {
  const CurrentElementComponent = EDITABLE_ELEMENT_COMPONENTS[elementInfo.type];
  const {
    copyElement,
    pasteElement,
    cutElement,
    deleteElement,
    lockElement,
    unlockElement,
    selectAllElements,
    alignElementToCanvas,
    orderElement,
    combineElements,
    uncombineElements,
  } = useCanvasOperations();

  const contextmenus = (): ContextmenuItem[] => {
    if (elementInfo.lock) {
      return [
        {
          text: '解锁',
          handler: () => unlockElement(elementInfo),
        },
      ];
    }

    return [
      {
        text: '剪切',
        subText: 'Ctrl + X',
        handler: cutElement,
      },
      {
        text: '复制',
        subText: 'Ctrl + C',
        handler: copyElement,
      },
      {
        text: '粘贴',
        subText: 'Ctrl + V',
        handler: pasteElement,
      },
      { divider: true },
      {
        text: '水平居中',
        handler: () => alignElementToCanvas(ElementAlignCommands.HORIZONTAL),
        children: [
          {
            text: '水平垂直居中',
            handler: () => alignElementToCanvas(ElementAlignCommands.CENTER),
          },
          {
            text: '水平居中',
            handler: () => alignElementToCanvas(ElementAlignCommands.HORIZONTAL),
          },
          {
            text: '左对齐',
            handler: () => alignElementToCanvas(ElementAlignCommands.LEFT),
          },
          {
            text: '右对齐',
            handler: () => alignElementToCanvas(ElementAlignCommands.RIGHT),
          },
        ],
      },
      {
        text: '垂直居中',
        handler: () => alignElementToCanvas(ElementAlignCommands.VERTICAL),
        children: [
          {
            text: '水平垂直居中',
            handler: () => alignElementToCanvas(ElementAlignCommands.CENTER),
          },
          {
            text: '垂直居中',
            handler: () => alignElementToCanvas(ElementAlignCommands.VERTICAL),
          },
          {
            text: '顶部对齐',
            handler: () => alignElementToCanvas(ElementAlignCommands.TOP),
          },
          {
            text: '底部对齐',
            handler: () => alignElementToCanvas(ElementAlignCommands.BOTTOM),
          },
        ],
      },
      { divider: true },
      {
        text: '置于顶层',
        disable: isMultiSelect && !elementInfo.groupId,
        handler: () => orderElement(elementInfo, ElementOrderCommands.TOP),
        children: [
          {
            text: '置于顶层',
            handler: () => orderElement(elementInfo, ElementOrderCommands.TOP),
          },
          {
            text: '上移一层',
            handler: () => orderElement(elementInfo, ElementOrderCommands.UP),
          },
        ],
      },
      {
        text: '置于底层',
        disable: isMultiSelect && !elementInfo.groupId,
        handler: () => orderElement(elementInfo, ElementOrderCommands.BOTTOM),
        children: [
          {
            text: '置于底层',
            handler: () => orderElement(elementInfo, ElementOrderCommands.BOTTOM),
          },
          {
            text: '下移一层',
            handler: () => orderElement(elementInfo, ElementOrderCommands.DOWN),
          },
        ],
      },
      { divider: true },
      {
        text: '设置链接',
        disable: true,
      },
      {
        text: elementInfo.groupId ? '取消组合' : '组合',
        subText: 'Ctrl + G',
        handler: elementInfo.groupId ? uncombineElements : combineElements,
        hide: !isMultiSelect,
      },
      {
        text: '全选',
        subText: 'Ctrl + A',
        handler: selectAllElements,
      },
      {
        text: '锁定',
        subText: 'Ctrl + L',
        handler: lockElement,
      },
      {
        text: '删除',
        subText: 'Delete',
        handler: deleteElement,
      },
    ];
  };

  if (!CurrentElementComponent) {
    return (
      <div
        id={`editable-element-${elementInfo.id}`}
        className="editable-element absolute"
        style={{
          zIndex: elementIndex,
          left: elementInfo.left + 'px',
          top: elementInfo.top + 'px',
          width: elementInfo.width + 'px',
        }}
      >
        <div className="p-2 bg-gray-100 border border-gray-300 text-xs text-gray-500">
          {elementInfo.type} element (not implemented)
        </div>
      </div>
    );
  }

  return (
    <div
      id={`editable-element-${elementInfo.id}`}
      className="editable-element absolute"
      style={{
        zIndex: elementIndex,
      }}
    >
      <ContextMenu>
        <ContextMenuTrigger>
          <CurrentElementComponent elementInfo={elementInfo} selectElement={selectElement} />
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItems items={contextmenus()} />
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
}
