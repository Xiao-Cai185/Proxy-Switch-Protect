import { loadSettings } from '../shared/storage';

/**
 * WebRTC 防泄漏：通过 chrome.privacy 将策略设为 disable_non_proxied_udp，
 * 禁止未经代理路径的 UDP（STUN/ICE 等），降低真实源 IP 泄漏风险。
 * 注意：这不是 UDP 代理，而是禁用非代理 UDP；可能影响部分音视频通话。
 */

const POLICY = chrome.privacy?.network?.webRTCIPHandlingPolicy;

function setPolicy(value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!POLICY) {
      reject(new Error('当前浏览器不支持 webRTCIPHandlingPolicy'));
      return;
    }
    POLICY.set({ value: value as chrome.privacy.IPHandlingPolicy }, () => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve();
    });
  });
}

function clearPolicy(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!POLICY) {
      resolve();
      return;
    }
    POLICY.clear({}, () => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve();
    });
  });
}

/** 按设置应用或清除 WebRTC 保护策略 */
export async function applyWebRtcPolicy(enabled?: boolean): Promise<void> {
  const on = enabled ?? (await loadSettings()).webrtcProtect;
  if (on) {
    await setPolicy('disable_non_proxied_udp');
  } else {
    await clearPolicy();
  }
}
