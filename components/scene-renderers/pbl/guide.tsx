'use client';

import { HelpCircle } from 'lucide-react';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card';

/**
 * Inline guide shown below the role selection cards.
 * Hover to reveal the 3-step PBL workflow as a popover above.
 */
export function PBLGuideInline() {
  return (
    <HoverCard openDelay={0} closeDelay={150}>
      <div className="w-full flex justify-center">
        <HoverCardTrigger asChild>
          <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <HelpCircle className="w-4 h-4" />
            <span>如何参与项目</span>
          </button>
        </HoverCardTrigger>
      </div>
      <HoverCardContent
        side="top"
        collisionPadding={16}
        className="w-[380px] overflow-y-auto rounded-xl p-5"
        style={{
          maxHeight: 'var(--radix-hover-card-content-available-height, 70vh)',
        }}
      >
        <GuideContent />
      </HoverCardContent>
    </HoverCard>
  );
}

/**
 * Help button in workspace toolbar — hover to show guide popover.
 */
export function PBLGuidePanel() {
  return (
    <HoverCard openDelay={0} closeDelay={150}>
      <HoverCardTrigger asChild>
        <button
          className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="使用帮助"
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        side="bottom"
        align="end"
        collisionPadding={16}
        className="w-[380px] overflow-y-auto rounded-xl p-5"
        style={{
          maxHeight: 'var(--radix-hover-card-content-available-height, 80vh)',
        }}
      >
        <GuideContent />
      </HoverCardContent>
    </HoverCard>
  );
}

function GuideContent() {
  return (
    <div className="space-y-5 text-[13px] leading-relaxed text-foreground">
      {/* Step 1 */}
      <section>
        <h4 className="font-semibold mb-1">第一步：选择角色</h4>
        <p className="text-muted-foreground">项目生成后，从角色列表中选择一个角色（标记为🟢的非系统角色）</p>
      </section>

      <hr className="border-border" />

      {/* Step 2 */}
      <section>
        <h4 className="font-semibold mb-1">第二步：完成任务</h4>
        <p className="text-muted-foreground mb-3">每个任务代表一个学习目标：</p>

        <ol className="list-decimal list-inside space-y-3 text-muted-foreground">
          {/* 2-1 */}
          <li>
            <span className="font-medium text-foreground">查看当前任务</span>
            <p className="mt-0.5 ml-[1.125rem]">查看任务的标题、描述、负责人</p>
          </li>

          {/* 2-2 */}
          <li>
            <span className="font-medium text-foreground">获取指导</span>
            <code className="ml-1.5 text-xs bg-muted rounded px-1.5 py-0.5 font-mono">
              @question
            </code>
            <div className="mt-1.5 ml-[1.125rem] space-y-1.5">
              <pre className="text-xs bg-muted/70 rounded-md px-3 py-2 font-mono leading-relaxed overflow-x-auto">
                {'@question 我应该从哪里开始？\n@question 如何实现这个功能？'}
              </pre>
              <p>提问助手会提供引导性问题和提示（不直接给答案）</p>
            </div>
          </li>

          {/* 2-3 */}
          <li>
            <span className="font-medium text-foreground">提交作品</span>
            <code className="ml-1.5 text-xs bg-muted rounded px-1.5 py-0.5 font-mono">@judge</code>
            <div className="mt-1.5 ml-[1.125rem] space-y-1.5">
              <pre className="text-xs bg-muted/70 rounded-md px-3 py-2 font-mono leading-relaxed overflow-x-auto">
                {'@judge 我已经完成了，请检查'}
              </pre>
              <p>评审助手会评估你的工作并给出反馈：</p>
              <ul className="space-y-0.5 mt-1">
                <li>
                  ✅ <span className="font-medium text-foreground">COMPLETE</span> →{' '}
                  自动进入下一个任务
                </li>
                <li>
                  🔄 <span className="font-medium text-foreground">NEEDS_REVISION</span> →{' '}
                  根据反馈改进
                </li>
              </ul>
            </div>
          </li>
        </ol>
      </section>

      <hr className="border-border" />

      {/* Step 3 */}
      <section>
        <h4 className="font-semibold mb-1">第三步：完成项目</h4>
        <p className="text-muted-foreground">所有任务完成后，系统会显示「🎉 项目已完成！」</p>
      </section>
    </div>
  );
}
