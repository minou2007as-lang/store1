import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { z } from 'zod'

const rejectSchema = z.object({
  admin_notes: z.string().trim().min(3).max(500),
})

async function insertNotification(
  adminClient: NonNullable<typeof supabaseAdmin>,
  notification: { user_id: string; title: string; message: string; type: string }
) {
  let result = await adminClient.from('notifications').insert({
    user_id: notification.user_id,
    title: notification.title,
    message: notification.message,
    type: notification.type,
    is_read: false,
  })

  if (result.error?.code === '42703') {
    result = await adminClient.from('notifications').insert({
      user_id: notification.user_id,
      title: notification.title,
      message: notification.message,
      is_read: false,
    })
  }

  return result.error
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

    if (!auth || auth.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only admins can reject top-up requests' },
        { status: 403 }
      )
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Server misconfiguration', message: 'Admin top-up service is not configured' },
        { status: 500 }
      )
    }

    const body = await request.json()
    const payload = rejectSchema.parse(body)

    const { data: topup, error: topupError } = await supabaseAdmin
      .from('point_topups')
      .select('*')
      .eq('id', id)
      .single()

    if (topupError || !topup) {
      console.error('Top-up request lookup error:', topupError)
      return NextResponse.json({ error: 'Top-up request not found' }, { status: 404 })
    }

    if (topup.status !== 'pending') {
      return NextResponse.json(
        { error: 'Only pending top-up requests can be rejected' },
        { status: 400 }
      )
    }

    const rejectionReason = payload.admin_notes.trim()

    let requestUpdateResult = await supabaseAdmin
      .from('point_topups')
      .update({
        status: 'rejected',
        rejection_reason: rejectionReason,
      })
      .eq('id', id)
      .eq('status', 'pending')

    if (requestUpdateResult.error?.code === '42703') {
      requestUpdateResult = await supabaseAdmin
        .from('point_topups')
        .update({
          status: 'rejected',
        })
        .eq('id', id)
        .eq('status', 'pending')
    }

    const { error: requestUpdateError } = requestUpdateResult

    let transactionUpdateResult = await supabaseAdmin
      .from('point_transactions')
      .update({ status: 'rejected' })
      .eq('reference_id', id)

    if (transactionUpdateResult.error?.code === '42703') {
      transactionUpdateResult = { error: null } as any
    }

    if (transactionUpdateResult.error) {
      console.error('Top-up rejection transaction update error:', transactionUpdateResult.error)
    }

    if (!requestUpdateError) {
      const rejectionMessage = `Your top-up request was rejected. Reason: ${rejectionReason}`

      const notesNotificationError = await insertNotification(supabaseAdmin, {
        user_id: topup.user_id,
        title: 'Top-up rejected',
        message: rejectionMessage,
        type: 'topup',
      })

      if (notesNotificationError) {
        console.error('Top-up rejection notification error:', notesNotificationError)
      }
    }

    if (requestUpdateError) {
      console.error('Top-up request rejection error:', requestUpdateError)
      return NextResponse.json(
        { error: requestUpdateError.message ?? 'Unable to reject top-up request' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Top-up request rejected successfully',
      topup_id: id,
      rejection_reason: rejectionReason,
    })
  } catch (error) {
    console.error('Reject top-up request error:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
