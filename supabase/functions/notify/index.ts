import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { ok, err, handleOptions, logRequest } from '../_shared/response.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()

  try {
    logRequest(req, 'notify')
    const body = await req.json()
    const { to_user_id, type, title, body: notifyBody, related_id } = body

    if (!to_user_id || !type || !title) return err('缺少必要参数', 400)
    if (!['like', 'save', 'comment', 'system'].includes(type)) return err('无效的通知类型', 400)

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { error } = await supabaseAdmin.from('notifications').insert({
      user_id: to_user_id,
      type,
      title,
      body: notifyBody || '',
      related_id: related_id || null,
    })

    if (error) { console.error('[notify] insert error:', error); return err('通知写入失败', 500) }
    return ok({ success: true })
  } catch (e) {
    console.error('[notify] 错误:', e)
    return err('服务异常', 500)
  }
})
