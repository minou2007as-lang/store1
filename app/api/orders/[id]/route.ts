import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { verifyToken } from '@/lib/auth'

async function releaseOrderFunds(order: any) {
  if (!order.assigned_seller_id) {
    return { success: false, error: 'Order has no assigned seller' }
  }

  if (order.status === 'completed' || order.confirmed_at) {
    return { success: true }
  }

  const sellerEarnings = Number(order.seller_earnings ?? 0)
  const platformFee = Number(order.platform_fee ?? 0)
  const paymentAmount = Number(order.points_amount ?? 0)
  const payoutAmount = sellerEarnings > 0 ? sellerEarnings : paymentAmount - platformFee

  if (payoutAmount <= 0) {
    return { success: false, error: 'No seller payout is configured for this order' }
  }

  const { data: sellerUser, error: sellerUserError } = await supabase
    .from('users')
    .select('id, balance, points')
    .eq('id', order.assigned_seller_id)
    .single()

  if (sellerUserError || !sellerUser) {
    return { success: false, error: 'Seller user not found' }
  }

  const previousBalance = Number(sellerUser.balance ?? 0)
  const newBalance = previousBalance + payoutAmount
  const previousTotalPoints = Number(sellerUser.points ?? 0)
  const newTotalPoints = previousTotalPoints + payoutAmount

  const { error: userUpdateError } = await supabase
    .from('users')
    .update({
      balance: newBalance,
      points: newTotalPoints,
    })
    .eq('id', sellerUser.id)

  if (userUpdateError) {
    console.error('Seller balance update error:', userUpdateError)
    return { success: false, error: 'Unable to credit seller account' }
  }

  const { error: txError } = await supabase
    .from('point_transactions')
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
  const { error: orderUpdateError } = await supabase
    .from('orders')
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

async function handleAutoConfirm(order: any) {
  if (!order.delivered_at || order.confirmed_at || !order.auto_release_at) {
    return { success: false }
  }

  const autoReleaseDate = new Date(order.auto_release_at)
  if (autoReleaseDate <= new Date()) {
    return releaseOrderFunds(order)
  }

  return { success: false }
}

// ================= GET ORDER =================
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

    // 🔥 Fetch order with relations
    const orderResponse = await supabase
      .from('orders')
      .select(`
        *,
        seller:assigned_seller_id(username, avatar_url),
        customer:customer_id(username),
        offer:offer_id(points_price, product:product_id(name, game:game_id(name)))
      `)
      .eq('id', id)
      .single()

    let order = orderResponse.data
    const error = orderResponse.error

    if (error || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const isAuthorized =
      order.customer_id === auth.id ||
      order.assigned_seller_id === auth.id ||
      auth.role === 'admin'

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const autoConfirmResult = await handleAutoConfirm(order)
    if (autoConfirmResult.success) {
      const refreshed = await supabase
        .from('orders')
        .select(`
          *,
          seller:assigned_seller_id(username, avatar_url),
          customer:customer_id(username),
          offer:offer_id(points_price, product:product_id(name, game:game_id(name)))
        `)
        .eq('id', id)
        .single()

      if (!refreshed.error && refreshed.data) {
        order = refreshed.data
      }
    }

    // 🔒 Hide account before seller picks order
    if (auth.role === 'seller' && auth.id !== order.assigned_seller_id) {
      delete order.game_account_id
    }

    return NextResponse.json({
      success: true,
      order,
    })
  } catch (error) {
    console.error('Get order error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// ================= UPDATE ORDER =================
export async function PUT(
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

    const body = await request.json()
    const { status } = body

    if (!status) {
      return NextResponse.json(
        { error: 'Status is required' },
        { status: 400 }
      )
    }

    // 🔍 Get order
    const { data: order, error } = await supabase
      .from('orders')
      .select('customer_id, assigned_seller_id, status')
      .eq('id', id)
      .single()

    if (error || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // 🔒 Only assigned seller can mark completed
    if (status === 'completed' && auth.id !== order.assigned_seller_id) {
      return NextResponse.json(
        { error: 'Only assigned seller can complete order' },
        { status: 403 }
      )
    }

    // 🔒 Authorization check
    const isAuthorized =
      order.customer_id === auth.id ||
      order.assigned_seller_id === auth.id ||
      auth.role === 'admin'

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // 🔥 Update order
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Order updated successfully',
    })
  } catch (error) {
    console.error('Update order error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}