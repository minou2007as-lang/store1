import { NextRequest, NextResponse } from 'next/server'
import { supabase, supabaseAdmin } from '@/lib/db'
import { headers } from 'next/headers'

export async function GET(_request: NextRequest) {
  try {
    // Fetch all exclusive offers with seller information
    const { data: offers, error } = await supabase
      .from('exclusive_offers')
      .select(
        `
        id,
        name,
        description,
        price,
        created_at,
        seller_id,
        game_id,
        games(id, name),
        users!exclusive_offers_seller_id_fkey(id, username, avatar_url)
        `
      )
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Exclusive offers fetch error:', error)
      return NextResponse.json({ error: 'Failed to fetch offers' }, { status: 500 })
    }

    const enrichedOffers = (offers ?? []).map((offer: any) => ({
      id: offer.id,
      name: offer.name,
      description: offer.description,
      price: offer.price,
      created_at: offer.created_at,
      seller: {
        id: offer.users?.id,
        username: offer.users?.username,
        avatar_url: offer.users?.avatar_url,
      },
      game: offer.games ? {
        id: offer.games.id,
        name: offer.games.name,
      } : null,
    }))

    return NextResponse.json({
      offers: enrichedOffers,
      total: enrichedOffers.length,
    })
  } catch (error) {
    console.error('Exclusive offers API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Admin client not configured' },
        { status: 500 }
      )
    }

    const headersList = headers()
    const authHeader = headersList.get('authorization')

    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Verify user is a seller
    const { data: seller, error: sellerError } = await supabaseAdmin
      .from('sellers')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (sellerError || !seller) {
      return NextResponse.json(
        { error: 'Only sellers can create exclusive offers' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { name, description, price, game_id } = body

    // Validate required fields
    if (!name || !price) {
      return NextResponse.json(
        { error: 'Name and price are required' },
        { status: 400 }
      )
    }

    if (typeof price !== 'number' || price <= 0) {
      return NextResponse.json(
        { error: 'Price must be a positive number' },
        { status: 400 }
      )
    }

    // Create the exclusive offer
    const { data: newOffer, error: createError } = await supabaseAdmin
      .from('exclusive_offers')
      .insert({
        seller_id: user.id,
        name,
        description: description || null,
        price,
        game_id: game_id || null,
        is_active: true,
      })
      .select()
      .single()

    if (createError) {
      console.error('Create exclusive offer error:', createError)
      return NextResponse.json(
        { error: 'Failed to create offer' },
        { status: 500 }
      )
    }

    return NextResponse.json(newOffer, { status: 201 })
  } catch (error) {
    console.error('Create exclusive offer API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
