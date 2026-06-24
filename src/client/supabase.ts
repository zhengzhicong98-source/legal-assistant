import {createClient} from '@supabase/supabase-js'
import Taro, {showToast} from '@tarojs/taro'

const supabaseUrl: string = process.env.TARO_APP_SUPABASE_URL!
const supabaseAnonKey: string = process.env.TARO_APP_SUPABASE_ANON_KEY || ''
const appId: string = process.env.TARO_APP_APP_ID || ''

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[supabase] 缺少 TARO_APP_SUPABASE_URL 或 TARO_APP_SUPABASE_ANON_KEY 环境变量')
}

let noticed = false

/**
 * 自定义 fetch 实现，将标准 fetch 请求适配为 Taro.request 调用。
 *
 * 为什么不用原生 fetch：
 * - 微信小程序环境不支持标准 fetch API，必须通过 Taro.request 发起网络请求。
 * - Supabase JS SDK 内部使用 fetch 与 Supabase API 通信，通过注入 customFetch
 *   使 SDK 在微信环境下正常工作。
 * - H5 环境下另有 callEdgeFunction 工具函数处理，此处聚焦微信端适配。
 *
 * 同时提供统一的错误处理：当 Supabase 返回错误时，通过 Toast 提示用户。
 */
export const customFetch: typeof fetch = async (url: string, options: RequestInit) => {
  let headers: HeadersInit = options.headers || {}
  const {method = 'GET', body} = options

  if (options.headers instanceof Map) {
    headers = Object.fromEntries(options.headers)
  }

  return new Promise((resolve) => {
    // BUG FIX 2026/06/22: 修复请求体序列化问题，将 JSON 字符串解析为对象，因为 Taro.request 会自动序列化 data
    let requestData;
    if (typeof body === 'string') {
      try {
        requestData = JSON.parse(body);
      } catch {
        requestData = body;
      }
    } else {
      requestData = body;
    }

    Taro.request({
      url,
      method: method as keyof Taro.request.Method,
      header: headers,
      data: requestData,
      responseType: 'text',
      timeout: 30000,
      success(res) {
        if (res.statusCode > 300 && res.data?.code === 'SupabaseNotReady' && !noticed) {
          const tip = res.data.message || res.data.msg || '服务端报错'
          noticed = true
          showToast({ title: tip, icon: 'error', duration: 5000 })
        }

        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          json: async () => {
            // BUG FIX 2026/06/22: 修复 json() 方法，需要将字符串解析为 JSON 对象
            if (typeof res.data === 'string') {
              try {
                return JSON.parse(res.data);
              } catch {
                return res.data;
              }
            }
            return res.data;
          },
          text: async () => {
            // BUG FIX 2026/06/22: 修复 text() 方法，直接返回字符串而不是双重序列化
            if (typeof res.data === 'string') {
              return res.data;
            }
            return JSON.stringify(res.data);
          },
          data: res.data,
          headers: {
            get: (key: string) => {
              if (!res.header || !key) return null
              const lowerKey = key.toLowerCase()
              for (const [k, v] of Object.entries(res.header)) {
                if (k.toLowerCase() === lowerKey) return v as string
              }
              return null
            }
          }
        // @ts-expect-error Taro.request 返回结构与标准 Response 不完全兼容
        } as unknown as Response)
      },
      fail(err) {
        // fail 时 resolve 而非 reject，避免未捕获异常导致页面崩溃
        resolve({
          ok: false,
          status: 0,
          json: async () => ({ error: err.errMsg }),
          text: async () => JSON.stringify({ error: err.errMsg }),
          data: null,
          headers: { get: () => null }
        // @ts-expect-error Taro.request 返回结构与标准 Response 不完全兼容
        } as unknown as Response)
      },
    })
  })
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: customFetch
  },
  auth: {
    storageKey: `${appId}-auth-token`
  }
})
