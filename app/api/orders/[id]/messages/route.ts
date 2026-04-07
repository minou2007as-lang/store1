import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { z } from 'zod'

async function verifyOrderParticipant(orderId: string, userId: string) {
  const { data: order, error } = await supabase
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

    const { data, error } = await supabase
      .from('order_messages')
      .select('id, content, created_at, sender:sender_id(username, avatar_url)')
      .eq('order_id', id)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Fetch chat messages error:', error)
      return NextResponse.json({ error: 'Unable to load messages' }, { status: 500 })
    }

    return NextResponse.json({ success: true, messages: data ?? [] })
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

    const { data: message, error } = await supabase
      .from('order_messages')
      .insert({
        order_id: id,
        sender_id: auth.id,
        content: payload.content,
      })
      .select('id, content, created_at, sender:sender_id(username, avatar_url)')
      .single()

    if (error || !message) {
      console.error('Send chat message error:', error)
      return NextResponse.json({ error: 'Unable to send message' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message })
  } catch (error) {
    console.error('Send chat route error:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
