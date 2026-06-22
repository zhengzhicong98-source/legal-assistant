import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    })
  }

  try {
    const { code } = await req.json().catch(() => ({}))
    if (!code) {
      return new Response(JSON.stringify({ message: '缺少code' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }

    const APP_ID = Deno.env.get('WECHAT_MINIPROGRAM_LOGIN_APP_ID')
    const APP_SECRET = Deno.env.get('WECHAT_MINIPROGRAM_LOGIN_APP_SECRET')

    // BUG FIX 2026/06/22: 添加环境变量缺失检查
    if (!APP_ID || !APP_SECRET) {
      return new Response(JSON.stringify({ message: '微信小程序配置缺失，请联系管理员' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }

    const wxRes = await fetch(
      `https://api.weixin.qq.com/sns/jscode2session?appid=${APP_ID}&secret=${APP_SECRET}&js_code=${code}&grant_type=authorization_code`
    )
    const wxData = await wxRes.json()

    if (wxData.errcode) {
      return new Response(JSON.stringify({ message: `微信接口错误: ${wxData.errmsg}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }

    const { openid } = wxData
    const email = `${openid}@wechat.login`

    // 确保用户存在，忽略「已注册」错误
    const { error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { from: 'wechat', openid },
    })
    if (createError && !createError.message.includes('already been registered')) {
      return new Response(JSON.stringify({ message: createError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }

    const { data: magicLinkData, error: magicLinkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: { data: { from: 'wechat', openid } },
      })

    if (magicLinkError) {
      return new Response(JSON.stringify({ message: magicLinkError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }

    const hashedToken = magicLinkData?.properties?.hashed_token ?? ''
    if (!hashedToken) {
      return new Response(JSON.stringify({ message: '无法生成token' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }

    return new Response(JSON.stringify({
      token: hashedToken,
      verification_type: magicLinkData?.properties?.verification_type ?? 'email',
      openid,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ message: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  }
})
