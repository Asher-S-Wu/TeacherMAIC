import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu';

export interface ContextmenuItem {
  text?: string;
  subText?: string;
  divider?: boolean;
  disable?: boolean;
  hide?: boolean;
  children?: ContextmenuItem[];
  handler?: () => void;
}

interface ContextMenuItemsProps {
  readonly items: ContextmenuItem[];
}

export function ContextMenuItems({ items }: ContextMenuItemsProps) {
  return items.map((item, index) => renderContextMenuItem(item, index));
}

function renderContextMenuItem(item: ContextmenuItem, index: number) {
  if (item.divider) {
    return <ContextMenuSeparator key={index} />;
  }

  if (item.children?.length) {
    return (
      <ContextMenuSub key={index}>
        <ContextMenuSubTrigger disabled={item.disable} hidden={item.hide}>
          {item.text}
          {item.subText && <ContextMenuShortcut>{item.subText}</ContextMenuShortcut>}
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          {item.children.map((child, childIndex) => renderContextMenuItem(child, childIndex))}
        </ContextMenuSubContent>
      </ContextMenuSub>
    );
  }

  return (
    <ContextMenuItem
      key={index}
      onClick={(event) => {
        event.stopPropagation();
        item.handler?.();
      }}
      disabled={item.disable}
      hidden={item.hide}
    >
      {item.text}
      {item.subText && <ContextMenuShortcut>{item.subText}</ContextMenuShortcut>}
    </ContextMenuItem>
  );
}
