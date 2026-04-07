import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'

export async function GET(_request: NextRequest) {
  try {
    const { data, error } = await supabase
      .from('games')
      .select('id, name')
      .order('name', { ascending: true })

    if (error) {
      console.error('Games API error:', error)
      return NextResponse.json({ games: [] }, { status: 500 })
    }

    return NextResponse.json({ games: data ?? [] })
  } catch (error) {
    console.error('Games API unexpected error:', error)
    return NextResponse.json({ games: [] }, { status: 500 })
  }
}
