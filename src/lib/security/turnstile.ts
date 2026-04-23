/**
 * Cloudflare Turnstile 服务端校验模块
 */

// Turnstile 配置
export function getTurnstileConfig() {
  return {
    secretKey: process.env.TURNSTILE_SECRET_KEY || '',
    siteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '',
    verifyUrl: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
  };
}

// 校验结果
export interface TurnstileVerifyResult {
  success: boolean;
  error?: string;
  // 是否因服务不可用导致失败（而非 token 无效）
  serviceUnavailable?: boolean;
}

/**
 * 调用 Cloudflare Turnstile siteverify 校验 token
 * @param token - 客户端提交的 turnstile token
 * @param ip - 客户端 IP（可选，用于增强验证）
 * @param timeout - 超时时间（毫秒）
 */
export async function verifyTurnstile(
  token: string,
  ip?: string,
  timeout = 5000
): Promise<TurnstileVerifyResult> {
  const config = getTurnstileConfig();

  if (!config.secretKey) {
    return {
      success: false,
      error: 'Turnstile secret key not configured',
      serviceUnavailable: true,
    };
  }

  if (!token) {
    return {
      success: false,
      error: 'Token is required',
    };
  }

  try {
    const body = new URLSearchParams({
      secret: config.secretKey,
      response: token,
      remoteip: ip || '',
    });

    const response = await fetch(config.verifyUrl, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(timeout),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Turnstile service error: ${response.status}`,
        serviceUnavailable: true,
      };
    }

    const result = await response.json();

    if (result.success === true) {
      return { success: true };
    }

    return {
      success: false,
      error: result['error-codes']?.join(', ') || 'Verification failed',
    };
  } catch (err) {
    // 超时或网络错误
    if (err instanceof Error && err.name === 'TimeoutError') {
      return {
        success: false,
        error: 'Turnstile verification timeout',
        serviceUnavailable: true,
      };
    }

    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
      serviceUnavailable: true,
    };
  }
}