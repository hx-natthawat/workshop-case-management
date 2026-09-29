export const config = {
  appSecret: () => {
    const s = process.env.APP_SECRET;
    if (!s || s.length < 16) throw new Error('APP_SECRET must be set (min 16 chars)');
    return s;
  },
  baseUrl: () => (process.env.APP_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
  simulatorEnabled: () => process.env.SIMULATOR_ENABLED === 'true',
  line: {
    channelSecret: () => process.env.LINE_CHANNEL_SECRET ?? '',
    accessToken: () => process.env.LINE_CHANNEL_ACCESS_TOKEN ?? '',
    loginChannelId: () => process.env.LINE_LOGIN_CHANNEL_ID ?? '',
    liffId: () => process.env.NEXT_PUBLIC_LIFF_ID ?? '',
  },
};

/** Simulated LINE users have ids starting with this prefix (ADR 0005). */
export const SIM_PREFIX = 'Usim';
export const isSimUser = (lineUserId: string) => lineUserId.startsWith(SIM_PREFIX);

/** LIFF URL on real LINE, local register page for simulator users. */
export function registerUrl(lineUserId: string): string {
  if (isSimUser(lineUserId)) return `${config.baseUrl()}/liff/register?sim=${encodeURIComponent(lineUserId)}`;
  const liff = config.line.liffId();
  return liff ? `https://liff.line.me/${liff}` : `${config.baseUrl()}/liff/register`;
}
