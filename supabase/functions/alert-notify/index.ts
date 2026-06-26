import { corsHeaders } from '../_shared/cors.ts'

interface AlertPayload {
  level: 'error' | 'warning' | 'info'
  title: string
  message: string
  details?: Record<string, unknown>
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const payload: AlertPayload = await req.json()
    const webhookUrl = Deno.env.get('WECHAT_WEBHOOK_URL')
    const resendKey = Deno.env.get('RESEND_API_KEY')
    const emailTo = Deno.env.get('ALERT_EMAIL')

    const levelEmoji = { error: '🔴', warning: '🟡', info: '🔵' }[payload.level]
    const timeStr = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
    const detailStr = payload.details ? '\n详情：' + JSON.stringify(payload.details) : ''
    const content = `${levelEmoji} **${payload.title}**\n${payload.message}${detailStr}\n时间：${timeStr}`

    await Promise.allSettled([
      webhookUrl ? fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msgtype: 'markdown',
          markdown: { content },
        }),
      }) : Promise.resolve(),

      (resendKey && emailTo) ? fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from: 'onboarding@resend.dev',
          to: emailTo,
          subject: `${levelEmoji} 法律助手告警：${payload.title}`,
          text: content.replace(/\*\*/g, ''),
        }),
      }) : Promise.resolve(),
    ])

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[alert-notify] 发送失败:', error)
    return new Response(
      JSON.stringify({ error: '告警发送失败' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
