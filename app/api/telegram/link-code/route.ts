import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'
import { verifyToken } from '@/lib/auth'

function generateLinkCode() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

async function getAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }

  const token = authHeader.substring(7)
  return verifyToken(token)
}

export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Admin client not configured' }, { status: 500 })
    }

    const auth = await getAuth(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('id, telegram_id, telegram_code, telegram_linked_at')
      .eq('id', auth.id)
      .single()

    if (error || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const botUsername = process.env.TELEGRAM_BOT_USERNAME || ''
    const bot_url = botUsername ? `https://t.me/${botUsername}` : null
    const deeplink = user.telegram_code && botUsername
      ? `https://t.me/${botUsername}?start=${user.telegram_code}`
      : null

    return NextResponse.json({
      connected: Boolean(user.telegram_id),
      telegram_id: user.telegram_id ?? null,
      telegram_code: user.telegram_code ?? null,
      telegram_linked_at: user.telegram_linked_at ?? null,
      bot_url,
      deeplink,
    })
  } catch (error) {
    console.error('Get Telegram link code error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Admin client not configured' }, { status: 500 })
    }

    const auth = await getAuth(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let code = generateLinkCode()

    for (let i = 0; i < 5; i += 1) {
      const { data: collision } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('telegram_code', code)
        .maybeSingle()

      if (!collision) {
        break
      }

      code = generateLinkCode()
    }

    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ telegram_code: code })
      .eq('id', auth.id)

    if (updateError) {
      console.error('Generate Telegram code error:', updateError)
      return NextResponse.json({ error: 'Unable to generate code' }, { status: 500 })
    }

    const botUsername = process.env.TELEGRAM_BOT_USERNAME || ''
    const bot_url = botUsername ? `https://t.me/${botUsername}` : null
    const deeplink = botUsername ? `https://t.me/${botUsername}?start=${code}` : null

    return NextResponse.json({
      success: true,
      message: 'Telegram link code generated successfully.',
      telegram_code: code,
      command: `/start ${code}`,
      bot_url,
      deeplink,
    })
  } catch (error) {
    console.error('Generate Telegram link code API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
