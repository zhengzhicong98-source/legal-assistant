import { corsHeaders } from './cors.ts'

/** 标准 JSON 成功响应 */
export function ok(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    ...init,
  })
}

/** 标准 JSON 错误响应 */
export function err(message: string, status = 400, code?: string): Response {
  return new Response(
    JSON.stringify({ success: false, error: message, code: code || `HTTP_${status}` }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}

/** OPTIONS 预检请求快速返回 */
export function handleOptions(): Response {
  return new Response(null, { headers: corsHeaders })
}

/** 简单的请求日志（仅记录 method + path，不打敏感 body） */
export function logRequest(req: Request, label = ''): void {
  const url = new URL(req.url)
  console.log(`[${label || 'fn'}] ${req.method} ${url.pathname}${url.search}`)
}
