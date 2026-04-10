import { NextRequest, NextResponse } from 'next/server'
import { supabase, supabaseAdmin } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { z } from 'zod'

async function verifyOrderParticipant(orderId: string, userId: string) {
  const db = supabaseAdmin ?? supabase
  const { data: order, error } = await db
    .from('orders')
    .select('id, customer_id, assigned_seller_id')
    .eq('id', orderId)
    .single()

  if (error || !order) {
    return { error: 'Order not found' }
  }

  const isParticipant = order.customer_id === userId || order.assigned_seller_id === userId
  if (!isParticipant) {
    return { error: 'Unauthorized' }
  }

  return { order }
}

const createMessageSchema = z.object({
  content: z.string().trim().min(1),
})

function getOrderChatTitle(orderId: string) {
  return `Order Chat #${orderId}`
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authHeader = request.headers.get('authorization')

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const auth = verifyToken(token)

    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const participant = await verifyOrderParticipant(id, auth.id)
    if ('error' in participant) {
      return NextResponse.json({ error: participant.error }, { status: 403 })
    }

    const db = supabaseAdmin ?? supabase
    const { data, error } = await db
      .from('notifications')
      .select('id, message, created_at')
      .eq('user_id', auth.id)
      .eq('type', 'order_chat')
      .eq('title', getOrderChatTitle(id))
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Fetch chat messages error:', error)
      return NextResponse.json({ error: 'Unable to load messages' }, { status: 500 })
    }

    const messages = (data ?? []).map((row: any) => {
      const raw = String(row.message ?? '')
      const parts = raw.split(':')
      const senderName = parts.length > 1 ? parts[0].trim() : 'User'
      const content = parts.length > 1 ? parts.slice(1).join(':').trim() : raw
      return {
        id: row.id,
        content,
        created_at: row.created_at,
        sender: {
          username: senderName,
          avatar_url: null,
        },
      }
    })

    return NextResponse.json({ success: true, messages })
  } catch (error) {
    console.error('Load chat messages error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authHeader = request.headers.get('authorization')

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const auth = verifyToken(token)

    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const participant = await verifyOrderParticipant(id, auth.id)
    if ('error' in participant) {
      return NextResponse.json({ error: participant.error }, { status: 403 })
    }

    const body = await request.json()
    const payload = createMessageSchema.parse(body)

    const db = supabaseAdmin ?? supabase
    const order = (participant as any).order
    const otherUserId = auth.id === order.customer_id ? order.assigned_seller_id : order.customer_id

    if (!otherUserId) {
      return NextResponse.json(
        { error: 'Cannot send message until both participants are assigned' },
        { status: 400 }
      )
    }

    const chatTitle = getOrderChatTitle(id)
    const chatMessage = `${auth.username}: ${payload.content}`

    const { data: insertedRows, error: insertError } = await db
      .from('notifications')
      .insert([
        {
          user_id: auth.id,
          title: chatTitle,
          message: chatMessage,
          type: 'order_chat',
          is_read: false,
        },
        {
          user_id: otherUserId,
          title: chatTitle,
          message: chatMessage,
          type: 'order_chat',
          is_read: false,
        },
      ])
      .select('id, message, created_at')

    if (insertError || !insertedRows || insertedRows.length === 0) {
      console.error('Send chat message error:', insertError)
      return NextResponse.json({ error: 'Unable to send message' }, { status: 500 })
    }

    const selfRow = insertedRows.find((row: any) => row.message === chatMessage) ?? insertedRows[0]

    return NextResponse.json({
      success: true,
      message: {
        id: selfRow.id,
        content: payload.content,
        created_at: selfRow.created_at,
        sender: {
          username: auth.username,
          avatar_url: null,
        },
      },
    })
  } catch (error) {
    console.error('Send chat route error:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
