import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { verifyToken } from '@/lib/auth'

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

    const { data, error } = await supabase
      .from('game_accounts')
      .select('id, game_id, account_identifier, created_at')
      .eq('user_id', auth.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Game accounts query error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const gameIds = Array.from(new Set((data ?? []).map((item: any) => item.game_id).filter(Boolean)))

    const { data: gamesData, error: gamesError } = gameIds.length
      ? await supabase.from('games').select('id, name').in('id', gameIds)
      : { data: [], error: null }

    if (gamesError) {
      console.error('Games lookup query error:', gamesError)
      return NextResponse.json({ error: gamesError.message }, { status: 500 })
    }

    const gameMap = new Map<string, string>()
    ;(gamesData ?? []).forEach((game: any) => {
      gameMap.set(String(game.id), String(game.name))
    })

    const accounts = (data ?? []).map((item: any) => ({
      id: String(item.id),
      game_id: item.game_id,
      game_name: item.game_id ? gameMap.get(String(item.game_id)) ?? null : null,
      account_identifier: item.account_identifier,
      created_at: item.created_at,
    }))

    if (process.env.NODE_ENV !== 'production') {
      console.log('[api/game-accounts] returning accounts', {
        userId: auth.id,
        count: accounts.length,
      })
    }

    return NextResponse.json({ accounts })
  } catch (error) {
    console.error('Game accounts error:', error)
    return NextResponse.json({ error: 'Unable to load game accounts' }, { status: 500 })
  }
}
