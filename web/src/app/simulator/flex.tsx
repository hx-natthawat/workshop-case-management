'use client';

import clsx from 'clsx';
import type { CSSProperties, ReactNode } from 'react';
import type { FlexBubble, FlexCarousel, FlexComponent, LineAction } from '@/server/bot/line-types';

/**
 * Renders the subset of LINE Flex Message we send (line-types.ts), following LINE's layout rules
 * closely enough that the simulator looks like the approved prototype and like real LINE.
 */

type Act = (a: LineAction) => void;
type Box = Extract<FlexComponent, { type: 'box' }>;
type Section = 'header' | 'hero' | 'body' | 'footer';

const SPACE: Record<string, number> = { none: 0, xs: 2, sm: 4, md: 8, lg: 12, xl: 16, xxl: 20 };
const TEXT_SIZE: Record<string, number> = { xxs: 10, xs: 12, sm: 13.5, md: 15, lg: 17, xl: 20, xxl: 26, '3xl': 30, '4xl': 34, '5xl': 40 };
const BUBBLE_W: Record<string, number> = { nano: 120, micro: 170, kilo: 240, mega: 282, giga: 300 };
// LINE default padding per block when the box does not set one.
const DEFAULT_PAD: Record<Section, number> = { header: 20, hero: 0, body: 20, footer: 10 };

const px = (v: string | undefined, fallback = 0) => (v == null ? fallback : v in SPACE ? SPACE[v] : parseInt(v, 10) || fallback);

export function FlexContents({ contents, onAction, disabled }: { contents: FlexBubble | FlexCarousel; onAction: Act; disabled?: boolean }) {
  if (contents.type === 'carousel') {
    return (
      <div className="-mr-3 flex snap-x items-stretch gap-2 overflow-x-auto pb-1 pr-3 [scrollbar-width:thin]">
        {contents.contents.map((b, i) => (
          <div key={i} className="flex shrink-0 snap-start">
            <Bubble bubble={b} onAction={onAction} disabled={disabled} />
          </div>
        ))}
      </div>
    );
  }
  return <Bubble bubble={contents} onAction={onAction} disabled={disabled} />;
}

function Bubble({ bubble, onAction, disabled }: { bubble: FlexBubble; onAction: Act; disabled?: boolean }) {
  const width = BUBBLE_W[bubble.size ?? 'mega'];
  const sections = (['header', 'hero', 'body', 'footer'] as Section[]).filter((s) => bubble[s]);
  return (
    <div className="flex flex-col overflow-hidden rounded-[16px] bg-white" style={{ width }}>
      {sections.map((s, i) => {
        const style = bubble.styles?.[s];
        const block = bubble[s]!;
        const separator = i > 0 && style?.separator;
        return (
          <div key={s} className={clsx(s === 'body' && 'flex-1')}
            style={{ backgroundColor: style?.backgroundColor, borderTop: separator ? `1px solid ${style?.separatorColor ?? '#EEEDEA'}` : undefined }}>
            {block.type === 'image'
              ? <Node c={block} parent="vertical" onAction={onAction} disabled={disabled} first />
              : <BoxNode c={block} parent="vertical" onAction={onAction} disabled={disabled} first defaultPad={DEFAULT_PAD[s]} />}
          </div>
        );
      })}
    </div>
  );
}

function marginStyle(margin: string | undefined, parent: Box['layout']): CSSProperties {
  if (!margin) return {};
  const m = px(margin);
  return parent === 'vertical' ? { marginTop: m } : { marginLeft: m };
}

function BoxNode({ c, parent, onAction, disabled, first, defaultPad = 0 }: { c: Box; parent: Box['layout']; onAction: Act; disabled?: boolean; first?: boolean; defaultPad?: number }) {
  const gap = px(c.spacing);
  const pad = c.paddingAll != null ? px(c.paddingAll) : defaultPad;
  const style: CSSProperties = {
    ...(first ? {} : marginStyle(c.margin, parent)),
    paddingTop: c.paddingTop != null ? px(c.paddingTop) : pad,
    paddingBottom: c.paddingBottom != null ? px(c.paddingBottom) : pad,
    paddingLeft: c.paddingStart != null ? px(c.paddingStart) : pad,
    paddingRight: c.paddingEnd != null ? px(c.paddingEnd) : pad,
    backgroundColor: c.backgroundColor,
    borderRadius: c.cornerRadius ? px(c.cornerRadius) : undefined,
    border: c.borderWidth ? `${px(c.borderWidth, 1)}px solid ${c.borderColor ?? '#E2E0DA'}` : undefined,
    height: c.height ? px(c.height) : undefined,
    justifyContent: c.justifyContent,
    alignItems: c.alignItems ?? (c.layout === 'baseline' ? 'baseline' : undefined),
  };
  const children = c.contents.map((child, i) => {
    const hasOwnMargin = 'margin' in child && !!child.margin;
    const g = i > 0 && gap && !hasOwnMargin ? gap : 0;
    const childFlex = 'flex' in child ? child.flex : undefined;
    const isSep = child.type === 'separator';
    const wrap: CSSProperties = c.layout === 'vertical'
      ? { marginTop: g || undefined }
      : isSep ? { marginLeft: g || undefined, alignSelf: 'stretch', display: 'flex' }
      : { marginLeft: g || undefined, flex: childFlex === 0 ? '0 0 auto' : childFlex ?? 1, minWidth: 0 };
    return (
      <div key={i} style={wrap}>
        <Node c={child} parent={c.layout} onAction={onAction} disabled={disabled} first={i === 0} />
      </div>
    );
  });
  const cls = clsx('flex', c.layout === 'vertical' ? 'flex-col' : 'flex-row');
  if (c.action) {
    const a = c.action;
    return (
      <button type="button" disabled={disabled} onClick={() => onAction(a)} aria-label={a.label}
        className={clsx(cls, 'w-full text-left transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60')} style={style}>
        {children}
      </button>
    );
  }
  return <div className={cls} style={style}>{children}</div>;
}

function Node({ c, parent, onAction, disabled, first }: { c: FlexComponent; parent: Box['layout']; onAction: Act; disabled?: boolean; first?: boolean }): ReactNode {
  switch (c.type) {
    case 'box':
      return <BoxNode c={c} parent={parent} onAction={onAction} disabled={disabled} first={first} />;
    case 'image': {
      const size = c.size?.endsWith('px') ? parseInt(c.size, 10) : c.size === 'full' ? undefined : 60;
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.url} alt="" className="mx-auto block" style={{ ...(first ? {} : marginStyle(c.margin, parent)), width: size ?? '100%', height: size ?? 'auto', objectFit: c.aspectMode === 'cover' ? 'cover' : 'contain', backgroundColor: c.backgroundColor }} />
      );
    }
    case 'text':
      return (
        <p
          className={clsx('leading-snug', c.wrap ? 'whitespace-pre-wrap break-words' : 'truncate', /^CS-\d{4}-\d{5}$/.test(c.text) && 'font-mono')}
          style={{
            ...(first ? {} : marginStyle(c.margin, parent)),
            fontSize: TEXT_SIZE[c.size ?? 'md'] ?? 15,
            fontWeight: c.weight === 'bold' ? 600 : 400,
            color: c.color ?? '#1A1C1E',
            textAlign: c.align === 'end' ? 'right' : c.align === 'center' ? 'center' : 'left',
            alignSelf: c.gravity === 'center' ? 'center' : undefined,
          }}
        >
          {c.text}
        </p>
      );
    case 'separator':
      return parent === 'horizontal'
        ? <span aria-hidden className="block w-px self-stretch bg-[#E2E0DA]" />
        : <hr className="w-full border-0 border-t border-divider" style={first ? {} : marginStyle(c.margin, parent)} />;
    case 'button': {
      const style = c.style ?? 'link';
      const color = c.color ?? '#0B6B5D';
      return (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onAction(c.action)}
          className={clsx(
            'flex w-full items-center justify-center px-3 text-center text-[15.5px] font-semibold transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50',
            c.height === 'sm' ? 'min-h-11 rounded-lg' : 'min-h-[52px]',
            style === 'secondary' && 'bg-[#F1F0EC] text-text',
            style === 'primary' && 'text-white',
          )}
          style={{
            ...(first ? {} : marginStyle(c.margin, parent)),
            ...(style === 'primary' ? { backgroundColor: color } : style === 'link' ? { color } : {}),
          }}
        >
          {c.action.label}
        </button>
      );
    }
  }
}
