import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { data, error } = await supabase
      .from('offers')
      .select(
        `id, quantity, unit, points_price, created_at,
         product:product_id(id, name, description,
           game:game_id(id, name))`
      )
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      console.error('Get products error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const offers = (data ?? []).map((offer: any) => ({
      id: offer.id,
      product_name: offer.product?.name ?? '',
      product_description: offer.product?.description ?? '',
      game_name: offer.product?.game?.name ?? '',
      quantity: offer.quantity,
      unit: offer.unit,
      points_price: offer.points_price,
      created_at: offer.created_at,
    }))

    return NextResponse.json({ success: true, offers })
  } catch (error) {
    console.error('Get products error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
