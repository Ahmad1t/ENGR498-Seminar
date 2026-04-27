import { NextResponse } from 'next/server';
import { duffel } from '@/lib/duffel';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query');

    if (!query || query.length < 2) {
      return NextResponse.json([]);
    }

    const suggestions = await duffel.suggestions.list({
      query,
    });

    return NextResponse.json(suggestions.data);
  } catch (error: any) {
    console.error('Duffel Suggestions Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch suggestions' }, { status: 500 });
  }
}
