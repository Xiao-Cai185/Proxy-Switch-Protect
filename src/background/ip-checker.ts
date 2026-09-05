import { runChecker } from '../shared/checkers';
import { primaryMatchIp, runDualStackCheck } from '../shared/dual-stack';
import {
  loadActiveProfileId,
  loadProfileChecks,
  loadSettings,
  saveProfileChecks,
  setCheckState,
} from '../shared/storage';
import type { CheckerConfig, CheckState, ProfileCheckResult } from '../shared/types';

/** 未选择档案时的指纹占位 */
export function activeKeyOf(id: string | null): string {
  return id ?? 'default';
}

let inFlight: Promise<CheckState> | null = null;
let runSeq = 0;

/**
 * 确保有一次落地 IP 检测。
 * 守护场景一律 force=true，禁止复用旧结果，避免意外放行。
 * force=false 仅用于非关键路径；若已有进行中的检测则等待其完成。
 */
export async function ensureCheck(force: boolean): Promise<CheckState> {
  if (!force && inFlight) return inFlight;
  // force=true：取消「复用旧 ok」；若已有 inFlight，仍等待同一轮（避免并发风暴），
  // 但若需要强制新一轮，递增 runSeq 使旧写入失效并开新检测。
  if (force) {
    const p = doCheck().finally(() => {
      if (inFlight === p) inFlight = null;
    });
    inFlight = p;
    return p;
  }
  if (inFlight) return inFlight;
  const p = doCheck().finally(() => {
    if (inFlight === p) inFlight = null;
  });
  inFlight = p;
  return p;
}

async function doCheck(): Promise<CheckState> {
  const myId = ++runSeq;
  const write = async (st: CheckState) => {
    if (myId === runSeq) await setCheckState(st);
  };

  const settings = await loadSettings();
  const activeKey = activeKeyOf(await loadActiveProfileId());
  await write({ status: 'checking', updatedAt: Date.now() });

  try {
    const out = await runDualStackCheck(settings.checkers, settings.timeoutMs);
    const checkedTime = Date.now();
    const st: CheckState = {
      status: 'ok',
      result: { ...out, checkedAt: checkedTime, profileId: activeKey },
      updatedAt: checkedTime,
    };
    await write(st);

    // 同步持久化该节点的落地检测结果（供代理档案页面展示旗帜与周期同步）
    const activeId = (await loadActiveProfileId()) ?? 'direct';
    const checkRes: ProfileCheckResult = {
      countryCode: out.countryCode,
      ip: out.ip,
      city: out.city,
      isp: out.isp,
      checkedAt: checkedTime,
    };
    try {
      const prevMap = await loadProfileChecks();
      prevMap[activeId] = checkRes;
      await saveProfileChecks(prevMap);
    } catch {
      // 忽略持久化异常
    }

    return st;
  } catch (e) {
    const st: CheckState = {
      status: 'error',
      error: e instanceof Error ? e.message : String(e),
      updatedAt: Date.now(),
    };
    await write(st);
    return st;
  }
}

/** 设置页「测试检测源」按钮 */
export async function testChecker(cfg: CheckerConfig) {
  const settings = await loadSettings();
  return runChecker(cfg, settings.timeoutMs);
}

export { primaryMatchIp };
