import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { callEdgeFunction } from '@/utils/callEdgeFunction'
import Taro from '@tarojs/taro'

// 模拟 Taro 环境为 H5（WEB），使 callEdgeFunction 走 fetch 分支
vi.mock('@tarojs/taro', () => ({
  default: {
    getEnv: vi.fn(() => 'WEB'),
    ENV_TYPE: { WEB: 'WEB' },
  },
}))

describe('callEdgeFunction (H5)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    vi.stubGlobal('process', {
      env: {
        TARO_APP_SUPABASE_URL: 'https://test.supabase.co',
        TARO_APP_SUPABASE_ANON_KEY: 'test-anon-key',
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('正常响应返回 { data, error: null }', async () => {
    const mockData = { content: '测试回复' }
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockData),
      } as Response)
    ))

    const result = await callEdgeFunction('legal-chat', { body: { messages: [] } })
    expect(result.data).toEqual(mockData)
    expect(result.error).toBeNull()
  })

  it('HTTP 4xx 返回 { data: null, error: { message } }', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 429,
        json: () => Promise.resolve({ error: '请求过于频繁' }),
      } as Response)
    ))

    const result = await callEdgeFunction('legal-chat', { body: { messages: [] } })
    expect(result.data).toBeNull()
    expect(result.error).not.toBeNull()
    expect(result.error?.message).toContain('请求过于频繁')
  })

  it('网络错误返回 { data: null, error: { message: "网络请求失败" } }', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.reject(new Error('Failed to fetch'))
    ))

    const result = await callEdgeFunction('legal-chat', { body: { messages: [] } })
    expect(result.data).toBeNull()
    expect(result.error).not.toBeNull()
    expect(result.error?.message).toBe('网络请求失败')
  })
})
