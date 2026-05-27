import Taro from '@tarojs/taro'

interface CallEdgeFunctionOptions {
  body?: unknown
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  headers?: Record<string, string>
}

interface CallEdgeFunctionResult<T = unknown> {
  data: T | null
  error: { message: string } | null
}

/**
 * 统一调用 Supabase Edge Function 的工具函数。
 *
 * 背景：supabase.functions.invoke 内部经过 customFetch → Taro.request 传递时，
 * body 序列化存在兼容问题，导致 WeChat 小程序环境下请求无法发出。
 * 同时 Taro.request 在 H5（浏览器）模式下 fail 回调行为异常，故 H5 用原生 fetch，
 * WeChat 小程序用 Taro.request，两套路径均绕过 supabase.functions.invoke。
 */
export function callEdgeFunction<T = unknown>(
  functionName: string,
  options: CallEdgeFunctionOptions = {}
): Promise<CallEdgeFunctionResult<T>> {
  const { body, method = 'POST', headers = {} } = options
  const url = `${process.env.TARO_APP_SUPABASE_URL}/functions/v1/${functionName}`
  const anonKey = process.env.TARO_APP_SUPABASE_ANON_KEY || ''
  const reqHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${anonKey}`,
    'apikey': anonKey,
    ...headers,
  }
  const reqBody = body !== undefined ? JSON.stringify(body) : undefined

  // H5（浏览器）环境：直接用原生 fetch，避免 Taro.request 在 H5 下 fail 回调异常
  if (Taro.getEnv() === Taro.ENV_TYPE.WEB) {
    return fetch(url, { method, headers: reqHeaders, body: reqBody })
      .then(async (res) => {
        const parsed = await res.json().catch(() => null)
        if (res.ok) return { data: parsed as T, error: null }
        const msg = (parsed as Record<string, unknown>)?.error
          || (parsed as Record<string, unknown>)?.message
          || `HTTP ${res.status}`
        return { data: null, error: { message: String(msg) } }
      })
      .catch((err: unknown) => ({
        data: null,
        error: { message: (err as Error)?.message || '网络请求失败' },
      }))
  }

  // WeChat 小程序环境：使用 Taro.request，避免 customFetch 的 body 序列化问题
  return new Promise((resolve) => {
    Taro.request({
      url,
      method,
      header: reqHeaders,
      data: reqBody,
      success(res) {
        const parsed = typeof res.data === 'string'
          ? (() => { try { return JSON.parse(res.data) } catch { return res.data } })()
          : res.data
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ data: parsed as T, error: null })
        } else {
          const p = parsed as Record<string, unknown> | null
          const msg = p?.error || p?.message || `HTTP ${res.statusCode}`
          resolve({ data: null, error: { message: String(msg) } })
        }
      },
      fail(err) {
        resolve({ data: null, error: { message: err.errMsg || '网络请求失败' } })
      },
    })
  })
}
