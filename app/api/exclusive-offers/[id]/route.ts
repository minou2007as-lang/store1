import { NextRequest, NextResponse } from 'next/server'
import { supabase, supabaseAdmin } from '@/lib/db'
import { headers } from 'next/headers'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { data: offer, error } = await supabase
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
      .eq('id', params.id)
      .eq('is_active', true)
      .single()

    if (error || !offer) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
    }

    return NextResponse.json({
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
    })
  } catch (error) {
    console.error('Get exclusive offer error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    // Verify this offer belongs to the user
    const { data: offer, error: offerError } = await supabaseAdmin
      .from('exclusive_offers')
      .select('seller_id')
      .eq('id', params.id)
      .single()

    if (offerError || !offer) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
    }

    if (offer.seller_id !== user.id) {
      return NextResponse.json(
        { error: 'You can only edit your own offers' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const updates: any = {}

    // Only allow updating these fields
    if ('name' in body) updates.name = body.name
    if ('description' in body) updates.description = body.description
    if ('price' in body) {
      if (typeof body.price !== 'number' || body.price <= 0) {
        return NextResponse.json(
          { error: 'Price must be a positive number' },
          { status: 400 }
        )
      }
      updates.price = body.price
    }
    if ('game_id' in body) updates.game_id = body.game_id

    updates.updated_at = new Date().toISOString()

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('exclusive_offers')
      .update(updates)
      .eq('id', params.id)
      .select()
      .single()

    if (updateError) {
      console.error('Update exclusive offer error:', updateError)
      return NextResponse.json(
        { error: 'Failed to update offer' },
        { status: 500 }
      )
    }

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Update exclusive offer API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    // Verify this offer belongs to the user
    const { data: offer, error: offerError } = await supabaseAdmin
      .from('exclusive_offers')
      .select('seller_id')
      .eq('id', params.id)
      .single()

    if (offerError || !offer) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
    }

    if (offer.seller_id !== user.id) {
      return NextResponse.json(
        { error: 'You can only delete your own offers' },
        { status: 403 }
      )
    }

    // Soft delete - set is_active to false
    const { error: deleteError } = await supabaseAdmin
      .from('exclusive_offers')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', params.id)

    if (deleteError) {
      console.error('Delete exclusive offer error:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete offer' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete exclusive offer API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
