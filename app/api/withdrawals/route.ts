import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { z } from 'zod'

const withdrawalSchema = z.object({
  amount: z.preprocess((value) => Number(value), z.number().int().positive()),
  currency: z.string().trim().min(1).max(10).optional(),
  bank_account_info: z.string().trim().min(5).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const auth = verifyToken(token)

    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const status = url.searchParams.get('status')

    let queryBuilder = supabase
      .from('withdrawal_requests')
      .select('*')
      .eq('user_id', auth.id)
      .order('created_at', { ascending: false })

    if (status) {
      queryBuilder = queryBuilder.eq('status', status)
    }

    const { data, error } = await queryBuilder

    if (error) {
      console.error('Get withdrawal requests error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, withdrawals: data ?? [] })
  } catch (error) {
    console.error('Get withdrawal requests error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const auth = verifyToken(token)

    if (!auth || auth.role !== 'seller') {
      return NextResponse.json(
        { error: 'Only sellers can request withdrawals' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const payload = withdrawalSchema.parse(body)

    const { data, error: userError } = await supabase
      .from('users')
      .select('id, points, balance')
      .eq('id', auth.id)
      .single()

    const user = data as any

    if (userError || !user) {
      console.error('Seller lookup error:', userError)
      return NextResponse.json({ error: 'Seller not found' }, { status: 404 })
    }

    const availablePoints = Number(user.balance ?? user.points ?? 0)

    if (payload.amount > availablePoints) {
      return NextResponse.json(
        { error: 'Insufficient points available for withdrawal' },
        { status: 400 }
      )
    }

    const { data: newRequest, error: insertError } = await (supabase
      .from('withdrawal_requests') as any)
      .insert([
        {
          user_id: auth.id,
          amount: payload.amount,
          currency: payload.currency ?? 'USD',
          bank_account_encrypted: payload.bank_account_info ?? null,
          status: 'pending',
        },
      ])
      .select('*')
      .single()

    if (insertError || !newRequest) {
      console.error('Create withdrawal request error:', insertError)
      return NextResponse.json(
        { error: insertError?.message ?? 'Unable to create withdrawal request' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        withdrawal: newRequest,
        message: 'Withdrawal request submitted and awaiting approval.',
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Create withdrawal request error:', error)
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
