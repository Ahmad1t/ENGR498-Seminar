import { NextResponse } from 'next/server';
import { duffel } from '@/lib/duffel';
import { GoogleGenAI, Type } from '@google/genai';

const LOCATIONIQ_KEY = 'pk.35eee2d341d3d4fca912eeafc74ba5a4';

// ──────────────────────────────────────────────────────────────
// LocationIQ Helpers
// ──────────────────────────────────────────────────────────────

/**
 * Calculate the great-circle distance between two points on the Earth using the Haversine formula.
 * Returns distance in kilometers.
 */
function haversineDistance(lat1Str: string, lon1Str: string, lat2Str: string, lon2Str: string): number {
  const lat1 = parseFloat(lat1Str);
  const lon1 = parseFloat(lon1Str);
  const lat2 = parseFloat(lat2Str);
  const lon2 = parseFloat(lon2Str);

  if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) return 0;

  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c;
}

/**
 * Resolve a destination IATA code to its city name, airport name, country name, and ISO country code using the Duffel API.
 */
async function resolveIATAToCity(iataCode: string): Promise<{ cityName: string; countryName: string; airportName: string; countryCode: string } | null> {
  try {
    const suggestions = await duffel.suggestions.list({ query: iataCode });
    const match = suggestions.data?.find((s: any) => s.iata_code === iataCode);
    if (match) {
      // Extract the 2-letter ISO country code from various possible Duffel response shapes
      const cc = (match as any).city?.country?.iata_code
        || (match as any).country?.iata_code
        || (match as any).iata_country_code
        || '';
      return {
        cityName: match.city_name || match.name || iataCode,
        countryName: (match as any).city?.country_name || (match as any).country_name || '',
        airportName: match.name || `${iataCode} Airport`,
        countryCode: cc.toLowerCase(),
      };
    }
    return { cityName: iataCode, countryName: '', airportName: `${iataCode} Airport`, countryCode: '' };
  } catch (err) {
    console.warn('Duffel IATA resolve failed:', err);
    return { cityName: iataCode, countryName: '', airportName: `${iataCode} Airport`, countryCode: '' };
  }
}

/**
 * Geocode a CITY NAME (not IATA code) to lat/lon using LocationIQ.
 * This ensures we get city-center coordinates, not airport coordinates.
 */
async function geocodeCity(cityName: string, countryName: string = ''): Promise<{ lat: string; lon: string; displayName: string } | null> {
  const searchQuery = countryName ? `${cityName}, ${countryName}` : cityName;
  try {
    const res = await fetch(
      `https://us1.locationiq.com/v1/search?key=${LOCATIONIQ_KEY}&q=${encodeURIComponent(searchQuery)}&format=json&limit=1&addressdetails=1`
    );
    if (!res.ok) {
      console.warn(`LocationIQ geocoding HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      return { lat: data[0].lat, lon: data[0].lon, displayName: data[0].display_name };
    }
  } catch (err) {
    console.warn('LocationIQ geocoding failed:', err);
  }
  return null;
}

/**
 * Geocode a place name using LocationIQ (with country code restriction) + Nominatim fallback.
 * Returns coordinates only if they are within maxDistKm of the destination.
 */
async function geocodePlaceName(
  placeName: string,
  cityName: string,
  countryName: string = '',
  countryCode: string = '',
  destLat: string = '',
  destLon: string = ''
): Promise<{ lat: string; lon: string } | null> {
  const MAX_DIST = 100; // km — reject if further than this

  // Helper to check if coords are close enough to destination
  const isCloseEnough = (lat: string, lon: string): boolean => {
    if (!destLat || !destLon) return true; // can't check, accept
    const dist = haversineDistance(destLat, destLon, lat, lon);
    return dist <= MAX_DIST;
  };

  // ── Attempt 1: LocationIQ with country code ──
  const liqQuery = countryName
    ? `${placeName}, ${cityName}, ${countryName}`
    : `${placeName}, ${cityName}`;
  try {
    await new Promise(r => setTimeout(r, 300));
    const countryParam = countryCode ? `&countrycodes=${countryCode}` : '';
    const res = await fetch(
      `https://us1.locationiq.com/v1/search?key=${LOCATIONIQ_KEY}&q=${encodeURIComponent(liqQuery)}&format=json&limit=1${countryParam}`
    );
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const { lat, lon } = data[0];
        if (isCloseEnough(lat, lon)) {
          console.log(`  📍 LocationIQ: "${placeName}" → lat=${lat}, lon=${lon} (OK)`);
          return { lat, lon };
        } else {
          const dist = haversineDistance(destLat, destLon, lat, lon);
          console.log(`  ⚠️ LocationIQ: "${placeName}" → lat=${lat}, lon=${lon} → ${dist.toFixed(0)} km (TOO FAR, trying Nominatim)`);
        }
      }
    }
  } catch { /* continue to Nominatim */ }

  // ── Attempt 2: Nominatim fallback ──
  const nomQuery = countryName
    ? `${placeName}, ${cityName}, ${countryName}`
    : `${placeName}, ${cityName}`;
  try {
    await new Promise(r => setTimeout(r, 1000)); // Nominatim rate limit: 1 req/sec
    const countryParam = countryCode ? `&countrycodes=${countryCode}` : '';
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(nomQuery)}&format=json&limit=1${countryParam}`,
      { headers: { 'User-Agent': 'TravelPlannerWebsite/1.0' } }
    );
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const { lat, lon } = data[0];
        const dist = destLat && destLon ? haversineDistance(destLat, destLon, lat, lon) : 0;
        console.log(`  📍 NOMINATIM FALLBACK: "${placeName}" → lat=${lat}, lon=${lon} → ${dist.toFixed(1)} km`);
        if (isCloseEnough(lat, lon)) {
          return { lat, lon };
        } else {
          console.log(`  ❌ Nominatim result also too far (${dist.toFixed(0)} km)`);
        }
      }
    }
  } catch { /* both failed */ }

  console.log(`  ❌ REJECTED — both geocoders failed for: "${placeName}"`);
  return null;
}

/**
 * Find nearby POIs by tag within a radius of the given coordinates.
 * Uses LocationIQ's Nearby API.
 */
async function findNearby(lat: string, lon: string, tag: string, radiusMeters: number = 20000, limit: number = 10): Promise<any[]> {
  try {
    const res = await fetch(
      `https://us1.locationiq.com/v1/nearby?key=${LOCATIONIQ_KEY}&lat=${lat}&lon=${lon}&tag=${tag}&radius=${radiusMeters}&limit=${limit}&format=json`
    );
    if (!res.ok) {
      console.warn(`LocationIQ nearby (${tag}) HTTP ${res.status}`);
      return [];
    }
    const data = await res.json();
    if (Array.isArray(data)) {
      return data;
    }
  } catch (err) {
    console.warn(`LocationIQ nearby (${tag}) failed:`, err);
  }
  return [];
}

/**
 * Reverse-geocode a lat/lon to verify it falls within the expected city.
 * Returns the city/town name from the coordinates.
 */
async function reverseGeocode(lat: string, lon: string): Promise<string> {
  try {
    const res = await fetch(
      `https://us1.locationiq.com/v1/reverse?key=${LOCATIONIQ_KEY}&lat=${lat}&lon=${lon}&format=json&addressdetails=1`
    );
    if (!res.ok) return '';
    const data = await res.json();
    return data?.address?.city || data?.address?.town || data?.address?.county || data?.address?.state || '';
  } catch {
    return '';
  }
}

// ──────────────────────────────────────────────────────────────
// Main API Handler
// ──────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      origin, destination, tripType, departureDate, returnDate,
      adults, children, cabinClass, includeBaggage, baggageCount, directOnly,
      budgetMode, totalBudget, flightBudget, hotelBudget, transportBudget, dailyExpenseBudget,
      hotelStars, hotelRooms, hotelBeds, hotelAmenities, nearAirport, nights,
      includeFlight = true, includeHotel = true, includeTransport, transportTypes, transportPriority,
      vibes,
    } = body;

    // ═══════════ STEP 1: USER INPUT ═══════════
    console.log('\n\n═══════════ STEP 1: USER INPUT RECEIVED ═══════════');
    console.log('🧳 Trip type:', tripType);
    console.log('✈️ Origin:', origin);
    console.log('🏁 Destination:', destination);
    console.log('📅 Departure date:', departureDate);
    console.log('📅 Return date:', returnDate);
    console.log('👥 Travelers:', adults, 'adults,', children, 'children');
    console.log('💺 Cabin class:', cabinClass);
    console.log('💰 Budget mode:', budgetMode, '| Total:', totalBudget, '| Flight:', flightBudget, '| Hotel:', hotelBudget, '| Transport:', transportBudget, '| Daily:', dailyExpenseBudget);
    console.log('⭐ Hotel stars:', hotelStars);
    console.log('🛏️ Rooms:', hotelRooms, '| Beds per room:', hotelBeds);
    console.log('🏨 Hotel amenities:', JSON.stringify(hotelAmenities));
    console.log('🚗 Include transport:', includeTransport, '| Types:', JSON.stringify(transportTypes));
    console.log('🎯 Transport priority:', transportPriority);
    console.log('🎨 Vibes:', JSON.stringify(vibes), '| Type:', typeof vibes, '| Is array:', Array.isArray(vibes), '| Length:', Array.isArray(vibes) ? vibes.length : 'N/A');
    console.log('═══════════════════════════════════════════════════\n');

    // ────────────────────────────────────────────────────────
    // STEP 1: Resolve IATA code to real city/airport name
    // ────────────────────────────────────────────────────────
    const destInfo = await resolveIATAToCity(destination);
    const destinationCity = destInfo?.cityName || destination;
    const destinationCountry = destInfo?.countryName || '';
    const airportName = destInfo?.airportName || `${destination} Airport`;
    const countryCode = destInfo?.countryCode || '';

    // ────────────────────────────────────────────────────────
    // STEP 2: Geocode the EXACT destination (airport or city)
    //         Bug 6 fix: geocode the full airport name from Duffel
    // ────────────────────────────────────────────────────────
    // Use the FULL airport name (e.g. "Milan Malpensa Airport") for precise geocoding
    const airportGeo = await geocodeCity(airportName, destinationCountry);
    const cityGeo = await geocodeCity(destinationCity, destinationCountry);
    // Prefer airport coordinates since the user selected an airport code
    const geo = airportGeo || cityGeo;
    const geoLat = geo?.lat || '';
    const geoLon = geo?.lon || '';
    // Label used in distance strings — shows the IATA code for clarity
    const destinationLabel = destination; // e.g. "MXP", "CDG", "JFK"

    // ═══════════ STEP 2: DESTINATION RESOLUTION ═══════════
    console.log('═══════════ STEP 2: DESTINATION RESOLUTION ═══════════');
    console.log('📍 Destination resolved:', destinationCity, '|', airportName, '|', destinationCountry);
    console.log('🌍 Destination coordinates:', geoLat, geoLon, '| Source:', airportGeo ? 'AIRPORT geocode' : 'CITY geocode');
    console.log('🌍 Country code for API calls:', countryCode);
    console.log('🌍 Full display name:', geo?.displayName || 'N/A');
    console.log('═══════════════════════════════════════════════════════\n');

    // ────────────────────────────────────────────────────────
    // STEP 3: Search flights via Duffel
    // ────────────────────────────────────────────────────────
    let flights: any[] = [];
    if (includeFlight) {
    const slices: any[] = [{ origin, destination, departure_date: departureDate }];
    if (tripType === 'round_trip' && returnDate) {
      slices.push({ origin: destination, destination: origin, departure_date: returnDate });
    }

    const passengers = [
      ...Array(adults).fill(null).map(() => ({ type: 'adult' as const })),
      ...Array(children).fill(null).map(() => ({ type: 'child' as const })),
    ];

    try {
      const offerRequest = await duffel.offerRequests.create({
        slices: slices as any,
        passengers,
        ...(cabinClass && cabinClass !== 'economy' && { cabin_class: cabinClass }),
      });

      const offers = await duffel.offers.list({
        offer_request_id: offerRequest.data.id,
        sort: 'total_amount',
      });

      flights = (offers.data || []).slice(0, 10).map((offer: any) => {
        const detailedSlices = offer.slices.map((slice: any) => ({
          ...slice,
          segments: slice.segments.map((seg: any) => ({
            ...seg,
            origin_name: seg.origin?.name || seg.origin?.city_name || seg.origin?.iata_code,
            destination_name: seg.destination?.name || seg.destination?.city_name || seg.destination?.iata_code,
            origin_terminal: seg.origin_terminal || '-',
            destination_terminal: seg.destination_terminal || '-',
            aircraft_name: seg.aircraft?.name || 'Aircraft',
            marketing_carrier_name: seg.marketing_carrier?.name || 'Airline',
            marketing_carrier_flight_number: seg.marketing_carrier_flight_number || '',
            cabin_class: seg.passengers?.[0]?.cabin_class_marketing_name || seg.cabin_class || cabinClass || 'economy',
          })),
        }));

        const totalIncludedBaggage = offer.passengers.reduce((acc: number, p: any) => {
          return acc + (p.allowed_baggage?.filter((b: any) => b.type === 'checked').length || 0);
        }, 0);

        return {
          ...offer,
          slices: detailedSlices,
          display_price: parseFloat(offer.total_amount),
          baggage_metadata: { carry_on: 1, checked: totalIncludedBaggage },
          estimated_baggage_fee: 0,
          total_included_baggage: totalIncludedBaggage,
        };
      });

      if (directOnly) {
        flights = flights.filter(f => f.slices.every((s: any) => s.segments.length === 1));
      }
    } catch (flightErr: any) {
      console.error('Flight search error:', flightErr.message);
    }
    } else {
      console.log('✈️ Flights SKIPPED — user toggled off includeFlight');
    }

    // ═══════════ STEP 3: FLIGHT SEARCH ═══════════
    console.log('═══════════ STEP 3: FLIGHT SEARCH ═══════════');
    console.log('✈️ Flights API response — total results:', flights.length);
    if (flights.length > 0) {
      const prices = flights.map((f: any) => parseFloat(f.total_amount));
      console.log('✈️ Price range: $' + Math.min(...prices).toFixed(0) + ' to $' + Math.max(...prices).toFixed(0));
      console.log('✈️ First flight:', flights[0]?.owner?.name || 'unknown airline', '| $' + flights[0]?.total_amount);
    } else {
      console.log('✈️ No flights found');
    }
    console.log('════════════════════════════════════════════\n');

    // ────────────────────────────────────────────────────────
    // STEP 4: Fetch REAL nearby hotels from LocationIQ
    //         Anchored to CITY CENTER coordinates
    // ────────────────────────────────────────────────────────
    let hotels: any[] = [];
    if (includeHotel) {
    if (geoLat && geoLon) {
      // Search within 20km of city center for hotels
      const nearbyHotels = await findNearby(geoLat, geoLon, 'hotel', 20000, 20);

      const estimateStars = (place: any): number => {
        const name = (place.display_name || '').toLowerCase();
        // 5★ — ultra-luxury brands
        if (name.includes('ritz') || name.includes('palace') || name.includes('four seasons') || name.includes('mandarin') || name.includes('bulgari') || name.includes('aman') || name.includes('peninsula') || name.includes('waldorf') || name.includes('rosewood') || name.includes('bvlgari')) return 5;
        // 4★ — major upscale brands
        if (name.includes('hilton') || name.includes('grand') || name.includes('marriott') || name.includes('sheraton') || name.includes('hyatt') || name.includes('westin') || name.includes('radisson') || name.includes('novotel') || name.includes('sofitel') || name.includes('crowne plaza') || name.includes('courtyard') || name.includes('pullman') || name.includes('intercontinental') || name.includes('renaissance') || name.includes('doubletree') || name.includes('wyndham') || name.includes('delta hotels') || name.includes('le meridien') || name.includes('autograph')) return 4;
        // 3★ — midscale brands
        if (name.includes('ibis') || name.includes('holiday inn') || name.includes('best western') || name.includes('ramada') || name.includes('quality inn') || name.includes('comfort inn') || name.includes('hampton')) return 3;
        // 2★ — budget/economy
        if (name.includes('inn') || name.includes('motel') || name.includes('budget') || name.includes('express') || name.includes('lodge') || name.includes('guesthouse') || name.includes('hostel')) return 2;
        return 3;
      };

      // Hardcoded fallback prices per star tier (used if Gemini doesn't return pricing)
      const FALLBACK_PRICES: Record<number, number> = { 2: 100, 3: 160, 4: 280, 5: 450 };
      const estimatePrice = (stars: number): number => FALLBACK_PRICES[stars] || 160;

      const generateAmenities = (stars: number): string[] => {
        const base = ['wifi'];
        if (stars >= 3) base.push('breakfast', 'coffee');
        if (stars >= 4) base.push('gym', 'pool', 'shuttle');
        if (stars >= 5) base.push('spa', 'toiletries');
        return base;
      };

      // Map and validate each hotel — ensure it's actually in the destination city
      const hotelCandidates = nearbyHotels
        .filter((h: any) => h.display_name)
        .map((h: any, idx: number) => {
          const stars = estimateStars(h);
          const amenities = generateAmenities(stars);
          const distanceKm = h.distance ? (parseFloat(h.distance) / 1000).toFixed(1) : '';
          const fullName = h.display_name || `Hotel ${idx + 1}`;
          const cleanName = fullName.split(',')[0].trim();
          const locationParts = fullName.split(',').slice(1, 3).join(',').trim();

          return {
            id: `liq-h-${idx}`,
            type: 'hotel',
            name: cleanName,
            price: estimatePrice(stars),
            rating: stars,
            description: `Located ${distanceKm ? distanceKm + ' km from ' + destinationCity + ' center' : 'in ' + destinationCity}. ${cleanName} offers quality accommodation in ${destinationCity}.`,
            location: locationParts || `${destinationCity} City Area`,
            amenities,
            lat: h.lat,
            lon: h.lon,
            distanceKm: distanceKm ? parseFloat(distanceKm) : 0,
            source: 'locationiq',
            verified: true,
          };
        });

      // Filter by star preference and sort by distance (closest first)
      hotels = hotelCandidates
        .filter(h => h.rating >= hotelStars)
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, 6);

      // Sort by amenity match if user specified amenities
      if (hotelAmenities && hotelAmenities.length > 0) {
        hotels.sort((a: any, b: any) => {
          const aMatch = hotelAmenities.filter((am: string) => a.amenities.includes(am)).length;
          const bMatch = hotelAmenities.filter((am: string) => b.amenities.includes(am)).length;
          return bMatch - aMatch;
        });
      }
    }

    // Fallback hotels — clearly labeled as being in the destination city
    if (hotels.length === 0) {
      hotels = [
        { id: 'h1', type: 'hotel', name: `Grand ${destinationCity} Resort`, price: 450, rating: 5, description: `Premium luxury hotel in the heart of ${destinationCity}. Includes complimentary breakfast, high-speed WiFi, pool, and luxury toiletries.`, location: `${destinationCity} City Center`, amenities: ['breakfast', 'wifi', 'pool', 'toiletries', 'spa', 'gym'], verified: false },
        { id: 'h2', type: 'hotel', name: `${destinationCity} Metropolitan Suites`, price: 280, rating: 4, description: `Modern downtown hotel in ${destinationCity} with panoramic views. Features high-speed WiFi, in-room coffee, and fitness center.`, location: `Downtown ${destinationCity}`, amenities: ['wifi', 'coffee', 'gym', 'breakfast'], verified: false },
        { id: 'h3', type: 'hotel', name: `${destinationCity} Boutique Hotel`, price: 190, rating: 3, description: `Charming boutique hotel in ${destinationCity}: free WiFi, in-room coffee, and complimentary breakfast.`, location: `${destinationCity} Historic District`, amenities: ['wifi', 'coffee', 'breakfast'], verified: false },
      ].filter(h => h.rating >= hotelStars);
    }
    } else {
      console.log('🏨 Hotels SKIPPED — user toggled off includeHotel');
    }

    // ═══════════ STEP 4: HOTEL SEARCH ═══════════
    console.log('═══════════ STEP 4: HOTEL SEARCH ═══════════');
    console.log('🏨 Hotels found:', hotels.length, '| Source:', hotels.length > 0 && hotels[0].source === 'locationiq' ? 'LocationIQ GPS' : 'Fallback mock data');
    hotels.forEach((h: any, i: number) => console.log(`   ${i+1}. "${h.name}" | ${h.rating}⭐ | $${h.price}/night | ${h.location}`));
    console.log('════════════════════════════════════════════\n');

    // ────────────────────────────────────────────────────────
    // STEP 5: Fetch nearby attractions via LocationIQ
    //         Anchored to CITY CENTER coordinates
    // ────────────────────────────────────────────────────────
    let nearbyAttractions: any[] = [];
    if (geoLat && geoLon) {
      const tourism = await findNearby(geoLat, geoLon, 'tourism', 20000, 15);

      // Blocklist: filter out non-tourist utility locations
      // Blocklist: filter out non-tourist utility locations AND accommodations
      const BLOCKED_TYPES = ['atm', 'bank', 'pharmacy', 'fuel', 'post_office', 'police', 'fire_station', 'hospital', 'clinic', 'dentist', 'veterinary', 'car_wash', 'car_repair', 'parking', 'bus_stop', 'taxi', 'hotel', 'motel', 'hostel', 'guest_house', 'chalet', 'accommodation'];
      const BLOCKED_NAMES = ['atm', 'bancomat', 'cash point', 'cash machine', 'parking', 'bus stop', 'taxi stand', 'gas station', 'petrol', 'hotel', 'motel', 'hostel', 'b&b', 'bed and breakfast'];

      const filtered = tourism
        .filter((p: any) => {
          if (!p.display_name) return false;
          const type = (p.type || '').toLowerCase();
          const name = (p.display_name?.split(',')[0]?.trim() || '').toLowerCase();
          // Reject if type matches blocklist
          if (BLOCKED_TYPES.some(bt => type.includes(bt))) return false;
          // Reject if name matches blocklist
          if (BLOCKED_NAMES.some(bn => name.includes(bn))) return false;
          return true;
        });

      // Deduplicate by name (case-insensitive)
      const seen = new Set<string>();
      nearbyAttractions = filtered
        .map((p: any) => {
          const name = p.display_name?.split(',')[0]?.trim() || 'Local Attraction';
          const distVal = haversineDistance(geoLat, geoLon, p.lat, p.lon);
          const distanceKm = distVal > 0 ? (distVal).toFixed(1) : '';
          return {
            name,
            distance: distanceKm ? `${distanceKm} km from ${destinationLabel}` : `Near ${destinationLabel}`,
            type: p.type || 'attraction',
            lat: p.lat,
            lon: p.lon,
          };
        })
        .filter(a => {
          const key = a.name.toLowerCase().trim();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 10);
    }

    // ═══════════ STEP 5: LOCATIONIQ POI FETCH ═══════════
    console.log('═══════════ STEP 5: LOCATIONIQ POI FETCH ═══════════');
    console.log('🔍 LocationIQ search coords:', geoLat, geoLon);
    console.log('📍 POIs after filtering & dedup:', nearbyAttractions.length);
    nearbyAttractions.forEach((a: any, i: number) => console.log(`   ${i+1}. "${a.name}" (type: ${a.type}) — ${a.distance}`));
    console.log('═══════════════════════════════════════════════════\n');

    // ────────────────────────────────────────────────────────
    // STEP 6: Generate mock transport data
    // ────────────────────────────────────────────────────────
    let transport: any[] = [];
    if (includeTransport) {
      const allTransport = [
        { id: 't1', type: 'bus', operator: 'Elite Express', price: 85, duration: '1h 30m', class: 'First Class', amenities: ['WiFi', 'Reclining Seats', 'Power Outlets', 'Refreshments'], location: `${destinationCity} Central Station`, transportType: 'private_car' },
        { id: 't2', type: 'bus', operator: 'Royal Coach', price: 45, duration: '2h 15m', class: 'Business', amenities: ['WiFi', 'Snacks', 'Extra Legroom'], location: `${destinationCity} North Terminal`, transportType: 'shared_shuttle' },
        { id: 't3', type: 'bus', operator: 'Skyline Transit', price: 25, duration: '3h 00m', class: 'Standard', amenities: ['WiFi', 'USB Charging'], location: `${destinationCity} Downtown Hub`, transportType: 'bus' },
        { id: 't4', type: 'bus', operator: 'Metro Rail Express', price: 35, duration: '1h 45m', class: 'Standard Plus', amenities: ['WiFi', 'Power Outlets', 'Scenic Route'], location: `${destinationCity} Rail Terminal`, transportType: 'train' },
      ];

      transport = allTransport.filter(t => transportTypes && transportTypes.includes(t.transportType));
      if (transport.length === 0) transport = allTransport.slice(0, 2);

      if (transportPriority === 'cheapest') transport.sort((a, b) => a.price - b.price);
      else if (transportPriority === 'fastest') transport.sort((a, b) => parseFloat(a.duration) - parseFloat(b.duration));
    }

    // ────────────────────────────────────────────────────────
    // STEP 7: Validate nights + compute effective budget
    //         (Budget breakdown moved to AFTER Gemini so hotel
    //          prices reflect destination-aware Gemini estimates)
    // ────────────────────────────────────────────────────────
    const effectiveBudget = budgetMode === 'total' ? totalBudget : (flightBudget + hotelBudget + transportBudget + dailyExpenseBudget);
    // Use the user-provided nights from the wizard (no hardcoded fallback)
    const tripNights = typeof nights === 'number' && nights > 0 ? nights : null;
    if (tripNights === null) {
      return NextResponse.json({ error: 'Missing or invalid nights value. Please select the number of nights in the Stay step.' }, { status: 400 });
    }

    // ────────────────────────────────────────────────────────
    // STEP 8: Call Gemini AI — with STRICT location anchoring
    // ────────────────────────────────────────────────────────
    let aiSummary = null;
    let placesToVisit: any[] = [];
    let upsellOptions: any[] = [];
    let geminiHotelPricing: Record<string, number> | null = null;

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY });
      const model = 'gemini-2.5-flash';

      // Build context from REAL LocationIQ data
      const hasVibes = vibes && Array.isArray(vibes) && vibes.length > 0;
      const vibeLabels = hasVibes ? vibes.map((v: string) => {
        const labelMap: Record<string, string> = {
          food_drink: 'Food & Drink (restaurants, food markets, cafés, wine bars, street food tours, local eateries)',
          nature_outdoors: 'Nature & Outdoors (parks, gardens, nature reserves, hiking trails, scenic viewpoints, lakes)',
          culture_history: 'Culture & History (museums, historical sites, cultural landmarks, monuments, heritage sites)',
          shopping_exploring: 'Shopping & Exploring (markets, shopping districts, bazaars, unique local stores, flea markets)',
          nightlife_entertainment: 'Nightlife & Entertainment (bars, clubs, live music venues, theaters, entertainment districts)',
          relaxation_wellness: 'Relaxation & Wellness (spas, thermal baths, peaceful gardens, wellness centers, yoga retreats)',
          art_architecture: 'Art & Architecture (galleries, architectural landmarks, street art, design districts, art museums)',
          family_friendly: 'Family Friendly (theme parks, zoos, aquariums, interactive museums, playgrounds, family activities)',
        };
        return labelMap[v] || v;
      }).join('; ') : '';

      // When vibes are selected, COMPLETELY OMIT LocationIQ POI data to prevent Gemini from
      // picking aviation/transport museums that happen to be near the airport.
      const attractionContext = hasVibes
        ? `\n\nIMPORTANT: Ignore any nearby POI data. Use your own knowledge to suggest places in ${destinationCity} that match ONLY the user's selected vibes listed above.`
        : nearbyAttractions.length > 0
          ? `\n\nREAL VERIFIED ATTRACTIONS found via GPS within ${destinationCity} (lat: ${geoLat}, lon: ${geoLon}):\n${nearbyAttractions.map((a, i) => `${i + 1}. "${a.name}" (${a.type}) — ${a.distance}, GPS: ${a.lat},${a.lon}`).join('\n')}\n\nYou MUST use these real GPS-verified places as the primary basis for "placesToVisit". You may add 1-2 additional WELL-KNOWN landmarks that are definitely in ${destinationCity}, ${destinationCountry}, but DO NOT invent or hallucinate places.`
          : `\n\nNo GPS-verified attractions data available. For "placesToVisit", ONLY suggest well-known, real landmarks and attractions that are definitely located within ${destinationCity}, ${destinationCountry}. Do NOT suggest places from other cities or countries.`;

      console.log(`\n📍 PLACES DATA SOURCE: ${hasVibes ? 'gemini-only (LocationIQ data OMITTED because vibes are active)' : nearbyAttractions.length > 0 ? 'combined (LocationIQ POIs fed to Gemini)' : 'gemini-only (no LocationIQ data available)'}`);

      const hotelContext = hotels.length > 0
        ? `\n\nREAL HOTELS found within 20km of ${destinationLabel} (lat: ${geoLat}, lon: ${geoLon}):\n${hotels.map((h, i) => `${i + 1}. "${h.name}" — ${h.rating}-star, $${h.price}/night, located at ${h.location}`).join('\n')}`
        : '';

      const prompt = `You are an elite AI travel concierge planning a trip to ${destinationCity}, ${destinationCountry}.

CRITICAL LOCATION CONSTRAINT:
- The destination is ${destinationCity}, ${destinationCountry}
- The user is arriving at ${airportName} (${destination}), GPS coordinates: latitude ${geoLat}, longitude ${geoLon}
- Suggest places that are either:
  (a) Right near the airport in the surrounding area (e.g. Ferno, Somma Lombardo, Cardano al Campo for MXP), OR
  (b) In ${destinationCity} city center, which is accessible by train/transport from the airport
- For each place, mention in the description which area it is in and approximately how far from ${destination}
- DO NOT suggest any place that is not in ${destinationCity} or the area near ${destination}
- DO NOT hallucinate or invent fictional places

CRITICAL QUALITY RULES FOR "placesToVisit":
- Each place MUST be a genuine tourist attraction, landmark, museum, park, restaurant, or cultural experience
- DO NOT include utility locations like ATMs, banks, pharmacies, bus stops, parking lots, gas stations, or transport hubs
- DO NOT include hotels, hostels, or any type of accommodation in the Places to Visit list
- DO NOT return duplicate places — every entry in the list must have a UNIQUE name
- If the source data contains duplicates, keep only the first occurrence
${hasVibes ? `
*** MOST IMPORTANT INSTRUCTION — VIBE FILTER ***
The user has selected these travel vibes: ${vibeLabels}

You MUST return places that match ONLY these travel vibes. Here is what each vibe means:
- Food & Drink: restaurants, food markets, cafes, street food, local cuisine spots, wine bars, bakeries, food tours.
- Nature & Outdoors: parks, gardens, lakes, hiking trails, natural reserves, botanical gardens, scenic viewpoints.
- Culture & History: historical monuments, museums of art/history/culture, heritage sites, old town areas, castles, churches.
- Shopping & Exploring: shopping streets, local markets, bazaars, boutiques, flea markets, artisan shops.
- Nightlife & Entertainment: bars, clubs, live music venues, comedy clubs, rooftop bars, entertainment districts, theaters.
- Relaxation & Wellness: spas, thermal baths, hammams, wellness centers, peaceful gardens, yoga retreats.
- Art & Architecture: art galleries, architectural landmarks, street art districts, design museums, sculpture gardens.
- Family Friendly: theme parks, zoos, aquariums, interactive science museums, playgrounds, family activity centers.

Do NOT return aviation museums, transport museums, aircraft exhibitions, motorcycle museums, or any technology/vehicle museum unless the user specifically selected a matching vibe.
Do NOT return generic popular attractions that don't match the selected vibes.
Every single result MUST clearly belong to one of the selected vibes: ${vibes.join(', ')}.
If you are unsure whether a place matches, do NOT include it.
` : ''}

Trip Details:
- Route: ${origin} → ${destination} (IATA: ${destination}, City: ${destinationCity})
- Trip type: ${tripType}
- Departure: ${departureDate} ${returnDate ? '/ Return: ' + returnDate : ''}
- Travelers: ${adults} adults, ${children} children
- Cabin class: ${cabinClass}
- Budget: $${effectiveBudget.toLocaleString()} (${budgetMode === 'total' ? 'AI-allocated' : 'per-category'})
- Hotel: ${hotelStars}-star, ${hotelRooms} rooms, ${hotelBeds || 2} beds per room, amenities: ${hotelAmenities?.join(', ') || 'none specified'}
- Transport: ${includeTransport ? (transportTypes || []).map((t: string) => t.replace('_', ' ')).join(', ') + ', priority: ' + transportPriority : 'not included'}

There are ${flights.length} flight options ranging from $${flights.length > 0 ? Math.min(...flights.map((f: any) => parseFloat(f.total_amount))).toLocaleString() : '0'} to $${flights.length > 0 ? Math.max(...flights.map((f: any) => parseFloat(f.total_amount))).toLocaleString() : '0'}.
${hotelContext}${attractionContext}

Please provide a JSON response with:
1. "aiSummary" - An object with "title" (catchy trip title mentioning ${destinationCity}) and "description" (2-3 sentence persuasive trip summary about visiting ${destinationCity})
2. "placesToVisit" - Array of 12 objects (extra buffer for filtering). Each MUST be a UNIQUE real place in ${destinationCity}, ${destinationCountry}.${hasVibes ? ` CRITICAL: Each place MUST match one of these vibes: ${vibes.join(', ')}. Do NOT return aviation museums, transport museums, aircraft exhibitions, or motorcycle museums. ONLY return places matching the selected vibes.` : ''} NO duplicates allowed. Each object has "name" (the full real name of the place, minimum 4 characters), "description" (1-2 sentences about this specific place), and "estimatedCost" (estimated daily cost in USD as a number)
3. "upsellOptions" - Array of 3 objects, each with "extraAmount" (number, like 100, 250, 500), "title" (what you get), and "description" (1 sentence explanation of the upgrade)
4. "estimatedHotelPricePerNight" - An object mapping star rating to estimated average nightly hotel price in USD for ${destinationCity} specifically. Keys are "2", "3", "4", "5". Example for a cheap city: {"2": 40, "3": 80, "4": 150, "5": 280}. Example for an expensive city: {"2": 120, "3": 200, "4": 350, "5": 600}. Use your knowledge of real hotel pricing in ${destinationCity}.`;

      // ═══════════ STEP 6: GEMINI PROMPT CONSTRUCTION ═══════════
      console.log('\n═══════════ STEP 6: GEMINI PROMPT CONSTRUCTION ═══════════');
      console.log('🤖 Variables injected into prompt:');
      console.log('   - Destination city:', destinationCity);
      console.log('   - Coordinates:', geoLat, geoLon);
      console.log('   - Effective budget: $' + effectiveBudget);
      console.log('   - Cabin class:', cabinClass);
      console.log('   - Hotel stars:', hotelStars);
      console.log('   - Vibes:', JSON.stringify(vibes));
      console.log('   - Has vibes:', hasVibes);
      console.log('   - Flights count passed:', flights.length);
      console.log('   - Hotels count passed:', hotels.length);
      console.log('   - POIs count passed:', nearbyAttractions.length);
      console.log('   - LocationIQ data omitted?:', hasVibes);
      console.log('🤖 FULL PROMPT SENT TO GEMINI:');
      console.log(prompt);
      console.log('══════════════════════════════════════════════════════════\n');

      const response = await ai.models.generateContent({
        model,
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              aiSummary: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                },
                required: ['title', 'description'],
              },
              placesToVisit: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    description: { type: Type.STRING },
                    estimatedCost: { type: Type.NUMBER },
                  },
                  required: ['name', 'description', 'estimatedCost'],
                },
              },
              upsellOptions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    extraAmount: { type: Type.NUMBER },
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                  },
                  required: ['extraAmount', 'title', 'description'],
                },
              },
              estimatedHotelPricePerNight: {
                type: Type.OBJECT,
                properties: {
                  '2': { type: Type.NUMBER },
                  '3': { type: Type.NUMBER },
                  '4': { type: Type.NUMBER },
                  '5': { type: Type.NUMBER },
                },
              },
            },
            required: ['aiSummary', 'placesToVisit', 'upsellOptions'],
          },
        },
      });

      const aiResult = typeof response.text === 'string' ? JSON.parse(response.text || '{}') : {};

      // ═══════════ STEP 7: GEMINI RAW RESPONSE ═══════════
      console.log('\n═══════════ STEP 7: GEMINI RAW RESPONSE ═══════════');
      console.log('🤖 Code path: Gemini AI (NOT fallback)');
      console.log('🤖 AI Summary title:', aiResult.aiSummary?.title || 'N/A');
      console.log('🤖 placesToVisit count:', (aiResult.placesToVisit || []).length);
      console.log('🤖 upsellOptions count:', (aiResult.upsellOptions || []).length);
      console.log('🤖 Raw placesToVisit:');
      (aiResult.placesToVisit || []).forEach((p: any, i: number) => console.log(`   ${i+1}. "${p.name}" | $${p.estimatedCost} | ${(p.description || '').substring(0, 80)}...`));
      console.log('════════════════════════════════════════════════════\n');

      aiSummary = aiResult.aiSummary || null;
      upsellOptions = aiResult.upsellOptions || [];

      // Stash Gemini's destination-aware hotel pricing for use after this try block
      if (aiResult.estimatedHotelPricePerNight && typeof aiResult.estimatedHotelPricePerNight === 'object') {
        geminiHotelPricing = aiResult.estimatedHotelPricePerNight;
        console.log('🏨 Gemini estimatedHotelPricePerNight:', JSON.stringify(geminiHotelPricing));
      }

      // ── STEP A: Validate place names (reject broken/empty names like "AS") ──
      const rawPlaces: any[] = (aiResult.placesToVisit || []).filter((p: any) => {
        const name = (p.name || '').trim();
        if (name.length < 4) {
          console.log(`  ❌ Rejected place with invalid name: "${name}"`);
          return false;
        }
        return true;
      });

      // ── STEP B: Deduplicate (case-insensitive by name) ──
      const seenPlaces = new Set<string>();
      let dedupedPlaces = rawPlaces.filter(p => {
        const key = (p.name || '').toLowerCase().trim();
        if (!key || seenPlaces.has(key)) return false;
        seenPlaces.add(key);
        return true;
      });

      // ── STEP C: Post-AI vibe enforcement (filter non-matching results) ──
      if (hasVibes) {
        // Keywords that each vibe maps to — used to validate Gemini's results
        const vibeKeywordMap: Record<string, string[]> = {
          food_drink: ['restaurant', 'ristorante', 'trattoria', 'osteria', 'pizzeria', 'cafe', 'café', 'bakery', 'food', 'market', 'cuisine', 'wine', 'bar', 'bistro', 'gelato', 'pastry', 'dining', 'eatery', 'tavern', 'pub', 'street food', 'brewery', 'brunch'],
          nature_outdoors: ['park', 'garden', 'lake', 'trail', 'nature', 'forest', 'botanical', 'scenic', 'mountain', 'river', 'valley', 'hill', 'reserve', 'outdoor', 'green', 'waterfall', 'beach', 'island'],
          culture_history: ['museum', 'castle', 'cathedral', 'church', 'basilica', 'monument', 'historic', 'heritage', 'palace', 'temple', 'ruins', 'archaeological', 'medieval', 'ancient', 'cultural', 'history', 'memorial', 'fortress', 'abbey', 'chapel', 'duomo', 'gallery'],
          shopping_exploring: ['market', 'shopping', 'store', 'boutique', 'mall', 'bazaar', 'flea', 'artisan', 'district', 'quarter', 'souk', 'galleria', 'corso', 'street'],
          nightlife_entertainment: ['bar', 'club', 'nightclub', 'live music', 'comedy', 'rooftop', 'lounge', 'entertainment', 'theater', 'theatre', 'disco', 'cabaret', 'jazz', 'karaoke', 'concert'],
          relaxation_wellness: ['spa', 'thermal', 'bath', 'wellness', 'yoga', 'hammam', 'retreat', 'sauna', 'massage', 'relaxation', 'peaceful', 'zen'],
          art_architecture: ['gallery', 'art', 'architecture', 'design', 'sculpture', 'fresco', 'mural', 'street art', 'modern art', 'contemporary', 'exhibition', 'pinacoteca'],
          family_friendly: ['zoo', 'aquarium', 'theme park', 'playground', 'amusement', 'interactive', 'science', 'children', 'family', 'kids', 'fun', 'adventure'],
        };

        // Collect all relevant keywords from selected vibes
        const allowedKeywords: string[] = [];
        for (const v of vibes) {
          if (vibeKeywordMap[v]) allowedKeywords.push(...vibeKeywordMap[v]);
        }

        // Words that indicate non-matching results
        const VIBE_BLOCKLIST = ['aviation', 'aircraft', 'airplane', 'aeroplane', 'helicopter', 'transport museum', 'motorcycle', 'automobile', 'car museum', 'vehicle', 'locomotive', 'railway museum', 'flight simulator'];

        dedupedPlaces = dedupedPlaces.filter(p => {
          const combined = `${p.name} ${p.description}`.toLowerCase();
          // Reject if it matches the blocklist
          if (VIBE_BLOCKLIST.some(blocked => combined.includes(blocked))) {
            console.log(`  🔍 CHECKING PLACE: "${p.name}" → BLOCKED: true (matched blocklist)`);
            return false;
          }
          // Check if at least one keyword from the selected vibes matches
          const matchedKw = allowedKeywords.find(kw => combined.includes(kw));
          if (!matchedKw) {
            console.log(`  🔍 CHECKING PLACE: "${p.name}" → BLOCKED: false (no vibe keyword match, keeping as fallback)`);
            p._vibeScore = 0;
          } else {
            console.log(`  🔍 CHECKING PLACE: "${p.name}" → BLOCKED: false (matched vibe keyword: "${matchedKw}")`);
            p._vibeScore = 1;
          }
          return true;
        });

        // Sort so vibe-matched results come first
        dedupedPlaces.sort((a, b) => (b._vibeScore || 0) - (a._vibeScore || 0));
        console.log(`  ✅ After vibe filtering: ${dedupedPlaces.length} places remain`);
      }

      // ── STEP D: Geocode each place, compute distance, validate ──
      const MAX_DISTANCE_KM = 100;
      if (geoLat && geoLon) {
        const geocodeResults = await Promise.all(
          dedupedPlaces.slice(0, 12).map(async (place) => {
            const coords = await geocodePlaceName(place.name, destinationCity, destinationCountry, countryCode, geoLat, geoLon);
            if (coords) {
              const dist = haversineDistance(geoLat, geoLon, coords.lat, coords.lon);
              console.log(`  📍 PLACE COORDS: "${place.name}" → lat=${coords.lat}, lon=${coords.lon} → distance: ${dist.toFixed(1)} km`);
              return {
                ...place,
                lat: coords.lat,
                lon: coords.lon,
                distance: `${dist.toFixed(1)} km from ${destinationLabel}`,
              };
            }
            // Both geocoders failed or returned coords too far away
            return null;
          })
        );
        // Remove nulls (failed geocode or too far) and internal fields, take first 6
        placesToVisit = geocodeResults
          .filter((p): p is NonNullable<typeof p> => p !== null)
          .slice(0, 6)
          .map(({ _vibeScore, ...rest }: any) => rest);
      } else {
        placesToVisit = dedupedPlaces.slice(0, 6).map(({ _vibeScore, ...rest }: any) => rest);
      }

      // ═══════════ STEP 8: PLACES GEOCODING + FILTERING ═══════════
      console.log('\n═══════════ STEP 8: PLACES GEOCODING + FILTERING ═══════════');
      console.log('✅ Final places after all filtering:', placesToVisit.length);
      placesToVisit.forEach((p: any, i: number) => console.log(`   ${i+1}. "${p.name}" — ${p.distance || 'no distance'} | lat=${p.lat || 'N/A'} lon=${p.lon || 'N/A'}`));
      console.log('════════════════════════════════════════════════════════════\n');
    } catch (aiErr: any) {
      console.warn('\n❌ AI analysis failed — using FALLBACK code path:', aiErr.message);
      console.log('🤖 CODE PATH: FALLBACK (not Gemini)');
      aiSummary = {
        title: `Your Journey to ${destinationCity}`,
        description: `We've curated the best options for your ${tripType.replace('_', ' ')} trip to ${destinationCity}. Browse through the flights, hotels, and activities below to build your perfect itinerary.`,
      };
      if (nearbyAttractions.length > 0) {
        placesToVisit = nearbyAttractions.slice(0, 6).map(a => ({
          name: a.name,
          description: `A popular ${a.type} in ${destinationCity}, ${a.distance}. A must-visit during your trip.`,
          estimatedCost: Math.floor(Math.random() * 50) + 10,
        }));
      } else {
        placesToVisit = [
          { name: `${destinationCity} City Center`, description: `Explore the vibrant heart of ${destinationCity}.`, estimatedCost: 20 },
          { name: `${destinationCity} Historic Quarter`, description: `Walk through centuries of history in ${destinationCity}.`, estimatedCost: 15 },
        ];
      }
      upsellOptions = [
        { extraAmount: 100, title: 'Better Hotel', description: 'Upgrade to a higher-rated hotel with more amenities.' },
        { extraAmount: 250, title: 'Premium Cabin', description: 'Switch to a premium cabin class for a more comfortable flight.' },
        { extraAmount: 500, title: 'Full Luxury Package', description: 'Unlock first-class flights, 5-star hotels, and private transfers.' },
      ];
    }

    // ────────────────────────────────────────────────────────
    // STEP 8b: Re-price hotels using Gemini's destination-aware estimates
    // ────────────────────────────────────────────────────────
    if (geminiHotelPricing) {
      console.log('🏨 Re-pricing hotels with Gemini estimates:', JSON.stringify(geminiHotelPricing));
      hotels.forEach((h: any) => {
        const geminiPrice = geminiHotelPricing![String(h.rating)];
        if (typeof geminiPrice === 'number' && geminiPrice > 0) {
          h.price = geminiPrice;
        }
        // else: keep the hardcoded fallback price already assigned at Step 4
      });
    } else {
      console.log('🏨 No Gemini hotel pricing — using hardcoded fallback prices');
    }

    // ────────────────────────────────────────────────────────
    // STEP 8c: Calculate budget breakdown (after hotel re-pricing)
    // ────────────────────────────────────────────────────────
    // ── Fixed percentage ceilings (never redistributed) ──
    const flightCeiling  = Math.round(effectiveBudget * 0.45);
    const hotelCeiling   = Math.round(effectiveBudget * 0.30);
    const transportFixed = Math.round(effectiveBudget * 0.10);
    const dailyFixed     = Math.round(effectiveBudget * 0.15);

    const cheapestFlightPrice = flights.length > 0
      ? Math.min(...flights.map((f: any) => parseFloat(f.total_amount) || Infinity))
      : 0;
    const cheapestHotelTotal = hotels.length > 0
      ? Math.min(...hotels.map((h: any) => (typeof h.price === 'number' ? h.price : Infinity))) * tripNights
      : 0;

    let budgetBreakdown;
    if (budgetMode === 'total') {
      budgetBreakdown = {
        flights: includeFlight ? Math.round(Math.min(cheapestFlightPrice || flightCeiling, flightCeiling)) : 0,
        hotels:  includeHotel  ? Math.round(Math.min(cheapestHotelTotal  || hotelCeiling,  hotelCeiling))  : 0,
        transport: includeTransport ? transportFixed : 0,
        dailyExpenses: dailyFixed,
        nights: tripNights,
        totalBudget: totalBudget,
        includeFlight: !!includeFlight,
        includeHotel: !!includeHotel,
        includeTransport: !!includeTransport,
      };
    } else {
      budgetBreakdown = {
        flights: includeFlight ? flightBudget : 0,
        hotels: includeHotel ? hotelBudget : 0,
        transport: includeTransport ? transportBudget : 0,
        dailyExpenses: dailyExpenseBudget,
        nights: tripNights,
        totalBudget: effectiveBudget,
        includeFlight: !!includeFlight,
        includeHotel: !!includeHotel,
        includeTransport: !!includeTransport,
      };
    }

    // ═══════════ STEP 9: FINAL RESPONSE TO FRONTEND ═══════════
    const finalResponse = {
      flights,
      hotels,
      transport,
      budgetBreakdown,
      aiSummary,
      placesToVisit,
      upsellOptions,
      _debug: {
        resolvedDestination: { iata: destination, city: destinationCity, country: destinationCountry },
        geocodedCenter: geo ? { lat: geoLat, lon: geoLon, displayName: geo.displayName } : null,
        nearbyHotelsFound: hotels.length,
        nearbyAttractionsFound: nearbyAttractions.length,
        hotelSource: hotels.length > 0 && hotels[0].source === 'locationiq' ? 'LocationIQ GPS' : 'Fallback',
      },
    };

    console.log('═══════════ STEP 9: FINAL RESPONSE TO FRONTEND ═══════════');
    console.log('✅ Flights in response:', flights.length);
    console.log('✅ Hotels in response:', hotels.length);
    console.log('✅ Transport in response:', transport.length);
    console.log('✅ Places in response:', placesToVisit.length);
    console.log('✅ AI summary title:', aiSummary?.title || 'N/A');
    console.log('✅ Budget breakdown:', JSON.stringify(budgetBreakdown));
    console.log('✅ Upsell options:', upsellOptions.length);
    console.log('✅ Total response size:', JSON.stringify(finalResponse).length, 'chars');
    console.log('══════════════════════════════════════════════════════════\n');

    return NextResponse.json(finalResponse);
  } catch (error: any) {
    console.error('Planner API Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to generate trip plan' }, { status: 500 });
  }
}
