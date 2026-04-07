import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { verifyToken } from '@/lib/auth'

async function releaseOrderFunds(order: any) {
  if (!order.assigned_seller_id) {
    return { success: false, error: 'Order has no assigned seller' }
  }

  const sellerEarnings = Number(order.seller_earnings ?? 0)
  const platformFee = Number(order.platform_fee ?? 0)
  const paymentAmount = Number(order.points_amount ?? 0)
  const payoutAmount = sellerEarnings > 0 ? sellerEarnings : paymentAmount - platformFee

  if (payoutAmount <= 0) {
    return { success: false, error: 'No seller payout is configured for this order' }
  }

  const { data: sellerUserData, error: sellerUserError } = await (supabase
    .from('users') as any)
    .select('id, balance, points')
    .eq('id', order.assigned_seller_id)
    .single()

  const sellerUser = sellerUserData as any

  if (sellerUserError || !sellerUser) {
    return { success: false, error: 'Seller user not found' }
  }

  const previousBalance = Number(sellerUser.balance ?? 0)
  const previousTotalPoints = Number(sellerUser.points ?? 0)
  const newBalance = previousBalance + payoutAmount
  const newTotalPoints = previousTotalPoints + payoutAmount

  const { error: userUpdateError } = await (supabase
    .from('users') as any)
    .update({
      balance: newBalance,
      points: newTotalPoints,
    })
    .eq('id', sellerUser.id)

  if (userUpdateError) {
    console.error('Seller balance update error:', userUpdateError)
    return { success: false, error: 'Unable to credit seller account' }
  }

  const { error: txError } = await (supabase
    .from('point_transactions') as any)
    .insert({
      user_id: sellerUser.id,
      amount: payoutAmount,
      transaction_type: 'order',
      fee: platformFee,
      status: 'completed',
      reference_id: order.id,
      related_order_id: order.id,
      description: 'Order confirmation payout',
      balance_before: previousBalance,
      balance_after: newBalance,
    })

  if (txError) {
    console.error('Order payout transaction log error:', txError)
    return { success: false, error: 'Unable to record payout transaction' }
  }

  const now = new Date().toISOString()
  const { error: orderUpdateError } = await (supabase
    .from('orders') as any)
    .update({
      status: 'completed',
      confirmed_at: now,
      completed_at: now,
      updated_at: now,
    })
    .eq('id', order.id)

  if (orderUpdateError) {
    console.error('Order complete update error:', orderUpdateError)
    return { success: false, error: 'Unable to finalize order' }
  }

  return { success: true }
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

    if (!auth || auth.role !== 'customer') {
      return NextResponse.json({ error: 'Only customers can confirm delivery' }, { status: 403 })
    }

    const { data: orderData, error: orderError } = await (supabase
      .from('orders') as any)
      .select('id, customer_id, assigned_seller_id, delivered_at, confirmed_at, status, points_amount, seller_earnings, platform_fee')
      .eq('id', id)
      .single()

    const order = orderData as any

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (order.customer_id !== auth.id) {
      return NextResponse.json({ error: 'Only the customer can confirm delivery' }, { status: 403 })
    }

    if (!order.delivered_at) {
      return NextResponse.json({ error: 'Seller has not marked this order as delivered yet' }, { status: 400 })
    }

    if (order.confirmed_at) {
      return NextResponse.json({ error: 'Delivery is already confirmed' }, { status: 400 })
    }

    const result = await releaseOrderFunds(order)
    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Unable to confirm delivery' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Delivery confirmed and funds released' })
  } catch (error) {
    console.error('Confirm delivery error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
