/**
 * The subset of LINE Messaging API message objects this app sends.
 * The simulator renders exactly these shapes, so both paths share one format.
 */
export type LineAction =
  | { type: 'postback'; label: string; data: string; displayText?: string }
  | { type: 'message'; label: string; text: string }
  | { type: 'uri'; label: string; uri: string }
  | { type: 'datetimepicker'; label: string; data: string; mode: 'datetime' | 'date' | 'time'; max?: string; initial?: string }
  | { type: 'location'; label: string }
  | { type: 'camera'; label: string }
  | { type: 'cameraRoll'; label: string };

export interface QuickReply {
  items: { type: 'action'; action: LineAction }[];
}

export type FlexComponent =
  | {
      type: 'box';
      layout: 'vertical' | 'horizontal' | 'baseline';
      contents: FlexComponent[];
      spacing?: string;
      margin?: string;
      paddingAll?: string;
      paddingTop?: string;
      paddingBottom?: string;
      paddingStart?: string;
      paddingEnd?: string;
      backgroundColor?: string;
      borderColor?: string;
      borderWidth?: string;
      cornerRadius?: string;
      height?: string;
      justifyContent?: 'flex-start' | 'center' | 'flex-end' | 'space-between';
      alignItems?: 'flex-start' | 'center' | 'flex-end';
      flex?: number;
      action?: LineAction;
    }
  | { type: 'image'; url: string; size?: string; aspectRatio?: string; aspectMode?: 'fit' | 'cover'; backgroundColor?: string; margin?: string; flex?: number }
  | {
      type: 'text';
      text: string;
      size?: string;
      weight?: 'regular' | 'bold';
      color?: string;
      wrap?: boolean;
      flex?: number;
      align?: 'start' | 'end' | 'center';
      margin?: string;
      gravity?: 'top' | 'center' | 'bottom';
    }
  | { type: 'button'; action: LineAction; style?: 'primary' | 'secondary' | 'link'; color?: string; height?: 'sm' | 'md'; margin?: string }
  | { type: 'separator'; margin?: string };

export interface FlexBubble {
  type: 'bubble';
  size?: 'nano' | 'micro' | 'kilo' | 'mega' | 'giga';
  header?: Extract<FlexComponent, { type: 'box' }>;
  hero?: Extract<FlexComponent, { type: 'box' | 'image' }>;
  body?: Extract<FlexComponent, { type: 'box' }>;
  footer?: Extract<FlexComponent, { type: 'box' }>;
  styles?: Partial<Record<'header' | 'hero' | 'body' | 'footer', { backgroundColor?: string; separator?: boolean; separatorColor?: string }>>;
}

/** Custom sender name/icon for one message (Messaging API "sender"; name max 20 chars). */
export interface LineSender { name?: string; iconUrl?: string }

export interface FlexCarousel {
  type: 'carousel';
  contents: FlexBubble[];
}

export type LineMessage =
  | { type: 'text'; text: string; quickReply?: QuickReply; sender?: LineSender }
  | { type: 'flex'; altText: string; contents: FlexBubble | FlexCarousel; quickReply?: QuickReply; sender?: LineSender };

/** Inbound webhook event (subset). */
export interface LineEvent {
  type: 'message' | 'postback' | 'follow' | 'unfollow' | string;
  webhookEventId: string;
  timestamp: number;
  replyToken?: string;
  mode?: 'active' | 'standby';
  deliveryContext?: { isRedelivery: boolean };
  source: { type: 'user' | 'group' | 'room'; userId?: string };
  message?:
    | { type: 'text'; id: string; text: string }
    | { type: 'image'; id: string; contentProvider?: { type: 'line' | 'external'; originalContentUrl?: string } }
    | { type: 'location'; id: string; title?: string; address?: string; latitude: number; longitude: number }
    | { type: string; id: string };
  postback?: { data: string; params?: { datetime?: string; date?: string; time?: string } };
}
