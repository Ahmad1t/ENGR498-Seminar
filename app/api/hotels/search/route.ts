import { NextResponse } from 'next/server';
import Amadeus from 'amadeus';

let amadeus: any = null;

function getAmadeus() {
  if (!amadeus) {
    amadeus = new Amadeus({
      clientId: process.env.AMADEUS_CLIENT_ID || 'dummy',
      clientSecret: process.env.AMADEUS_CLIENT_SECRET || 'dummy'
    });
  }
  return amadeus;
}

export async function POST(req: Request) {
  try {
    const amadeusClient = getAmadeus();
    const { cityCode, maxBudget } = await req.json();

    if (!cityCode) {
      return NextResponse.json({ error: 'City code is required' }, { status: 400 });
    }

    // 1. Get hotel list by city
    const hotelListResponse = await amadeusClient.referenceData.locations.hotels.byCity.get({
      cityCode: cityCode
    });

    const hotelIds = hotelListResponse.data.slice(0, 10).map((h: any) => h.hotelId);

    if (hotelIds.length === 0) {
      return NextResponse.json({ offers: [] });
    }

    // 2. Get hotel offers for these hotels
    const offersResponse = await amadeusClient.shopping.hotelOffersSearch.get({
      hotelIds: hotelIds.join(','),
      adults: '1'
    });

    const filteredOffers = offersResponse.data
      .filter((offer: any) => {
        const price = parseFloat(offer.offers[0].price.total);
        return !maxBudget || price <= maxBudget;
      })
      .map((offer: any) => ({
        id: offer.hotel.hotelId,
        type: 'hotel',
        name: offer.hotel.name,
        price: offer.offers[0].price.total,
        currency: offer.offers[0].price.currency,
        description: offer.hotel.description?.text || 'Luxury accommodation in the heart of the city.',
        rating: offer.hotel.rating || 4,
        image: `https://picsum.photos/seed/${offer.hotel.hotelId}/800/600`,
        address: offer.hotel.address?.lines?.join(', ') || 'City Center'
      }));

    return NextResponse.json({ offers: filteredOffers });
  } catch (error: any) {
    console.error('Amadeus Hotel Search Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to search hotels' }, { status: 500 });
  }
}
