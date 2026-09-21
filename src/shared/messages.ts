import type { CheckerConfig, CheckState } from './types';

/** 页面 -> 后台 的指令 */
export type BgCommand =
  | { type: 'switchProfile'; profileId: string }
  | { type: 'recheckIp' }
  | { type: 'forceAllow'; siteId: string; minutes?: number }
  | { type: 'relockAll' }
  | { type: 'pauseGuard'; minutes?: number }
  | {
      type: 'acceptSuggestion';
      domain: string;
      countryCode: string;
      expectedIpRanges?: string[];
      matchMode?: 'any' | 'all';
    }
  | { type: 'dismissSuggestion'; domain: string }
  | { type: 'testChecker'; checker: CheckerConfig }
  | { type: 'testProfile'; profileId: string }
  | { type: 'getLevelOfControl' }
  | { type: 'verifyAndAllowTab'; siteId: string; tabId: number };

export interface VerifyTabResult {
  pass: boolean;
  reason?: string;
}

export type BgResponse<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

function sendRaw(cmd: BgCommand): Promise<BgResponse> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(cmd, (resp: BgResponse) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(resp);
    });
  });
}

/** 发送指令并解包结果 */
export async function sendCmd<T = unknown>(cmd: BgCommand): Promise<T> {
  const resp = await sendRaw(cmd);
  if (!resp) throw new Error('后台无响应');
  if (resp.ok) return resp.data as T;
  throw new Error(resp.error);
}

/** getLevelOfControl 的返回 */
export interface LevelOfControlInfo {
  levelOfControl: string;
  controlled: boolean;
}

/** testChecker 的返回 */
export interface TestCheckerResult {
  ip: string;
  countryCode: string;
  city?: string;
  isp?: string;
  source: string;
}

/** recheckIp 的返回 */
export type RecheckResult = CheckState;
