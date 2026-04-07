import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { verifyToken } from '@/lib/auth'

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

    if (!auth || auth.role !== 'seller') {
      return NextResponse.json({ error: 'Only sellers can mark delivery' }, { status: 403 })
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, assigned_seller_id, status, delivered_at, auto_release_days')
      .eq('id', id)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (order.assigned_seller_id !== auth.id) {
      return NextResponse.json({ error: 'Only the assigned seller can mark this order as delivered' }, { status: 403 })
    }

    if (order.status !== 'in_progress') {
      return NextResponse.json({ error: 'Only in-progress orders can be marked delivered' }, { status: 400 })
    }

    if (order.delivered_at) {
      return NextResponse.json({ error: 'This order is already marked as delivered' }, { status: 400 })
    }

    const now = new Date()
    const releaseDays = Number(order.auto_release_days ?? 7)
    const autoReleaseAt = new Date(now.getTime() + releaseDays * 24 * 60 * 60 * 1000).toISOString()

    const { error: updateError } = await supabase
      .from('orders')
      .update({
        delivered_at: now.toISOString(),
        auto_release_at: autoReleaseAt,
        updated_at: now.toISOString(),
      })
      .eq('id', id)

    if (updateError) {
      console.error('Mark delivered error:', updateError)
      return NextResponse.json({ error: 'Unable to mark order delivered' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Order marked as delivered' })
  } catch (error) {
    console.error('Deliver route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
