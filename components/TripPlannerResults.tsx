'use client';

import { motion } from 'motion/react';
import { PlaneTakeoff, Hotel, Bus, MapPin, Star, DollarSign, Sparkles, TrendingUp, ArrowUpRight, Award, AlertTriangle } from 'lucide-react';
import FlightCard from './FlightCard';
import HotelCard from './HotelCard';
import BusCard from './BusCard';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface TripPlannerResultsProps {
  results: any;
  onUpsell: (extraBudget: number) => void;
  isUpselling: boolean;
  selectedVibes?: string[];
  plannerData?: any;
  onNavigateToStep?: (step: number) => void;
}

const VIBE_LABEL_MAP: Record<string, { label: string; emoji: string }> = {
  food_drink: { label: 'Food & Drink', emoji: '🍕' },
  nature_outdoors: { label: 'Nature & Outdoors', emoji: '🌿' },
  culture_history: { label: 'Culture & History', emoji: '🏛️' },
  shopping_exploring: { label: 'Shopping & Exploring', emoji: '🛍️' },
  nightlife_entertainment: { label: 'Nightlife & Entertainment', emoji: '🎉' },
  relaxation_wellness: { label: 'Relaxation & Wellness', emoji: '🧘' },
  art_architecture: { label: 'Art & Architecture', emoji: '🎨' },
  family_friendly: { label: 'Family Friendly', emoji: '👨‍👩‍👧' },
};

const BUDGET_COLORS = ['#000000', '#404040', '#808080', '#b0b0b0'];

export default function TripPlannerResults({ results, onUpsell, isUpselling, selectedVibes = [], plannerData, onNavigateToStep }: TripPlannerResultsProps) {
  if (!results) return null;

  const {
    flights = [],
    hotels = [],
    transport = [],
    budgetBreakdown,
    placesToVisit = [],
    upsellOptions = [],
    aiSummary,
  } = results;

  // ── Budget values from backend (single source of truth) ──
  const userTotalBudget = budgetBreakdown?.totalBudget || 0;
  const bIncludeFlight = budgetBreakdown?.includeFlight !== false;
  const bIncludeHotel = budgetBreakdown?.includeHotel !== false;
  const bIncludeTransport = budgetBreakdown?.includeTransport !== false;

  const bFlights = budgetBreakdown?.flights || 0;
  const bHotels = budgetBreakdown?.hotels || 0;
  const bTransport = budgetBreakdown?.transport || 0;
  const bDaily = budgetBreakdown?.dailyExpenses || 0;

  // Categories that are included AND have a positive value go into the donut chart
  const allCategories = [
    { name: 'Flights', value: bFlights, included: bIncludeFlight },
    { name: 'Hotels', value: bHotels, included: bIncludeHotel },
    { name: 'Transport', value: bTransport, included: bIncludeTransport },
    { name: 'Daily Expenses', value: bDaily, included: true },
  ];

  // Donut chart only shows included categories with value > 0
  const budgetChartData = userTotalBudget > 0
    ? allCategories.filter(d => d.included && d.value > 0)
    : [];

  const totalBudgetUsed = budgetChartData.reduce((s, d) => s + d.value, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-24"
    >
      {/* AI Summary */}
      {aiSummary && (
        <div className="space-y-8">
          <div className="flex items-center gap-3 text-muted-foreground mb-2">
            <Sparkles className="w-5 h-5" />
            <span className="small-caps tracking-widest">AI Trip Analysis</span>
          </div>
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-foreground/5 via-foreground/10 to-foreground/5 rounded-[36px] blur-xl opacity-50 group-hover:opacity-100 transition duration-1000" />
            <div className="relative glass-card p-10 rounded-[32px] border border-border">
              <div className="flex items-start gap-6">
                <div className="p-3 rounded-2xl bg-muted border border-border shrink-0">
                  <Award className="w-6 h-6 text-foreground" />
                </div>
                <div className="space-y-3">
                  <h3 className="text-3xl title-text text-foreground">{aiSummary.title}</h3>
                  <p className="text-muted-foreground/70 font-light leading-relaxed">{aiSummary.description}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Budget Breakdown */}
      {userTotalBudget > 0 && (
        <div className="space-y-8">
          <div className="border-b border-border pb-8">
            <div className="flex items-center gap-3 text-muted-foreground mb-2">
              <DollarSign className="w-5 h-5" />
              <span className="small-caps tracking-widest">Budget Allocation</span>
            </div>
            <h2 className="text-5xl title-text text-foreground">Smart Breakdown</h2>
            <p className="text-muted-foreground text-sm font-light mt-2">How the AI allocated your ${budgetBreakdown.totalBudget?.toLocaleString()} budget</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            {budgetChartData.length > 0 && (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={budgetChartData} cx="50%" cy="50%" innerRadius={70} outerRadius={110}
                    paddingAngle={4} dataKey="value" stroke="none">
                    {budgetChartData.map((_, i) => (
                      <Cell key={i} fill={BUDGET_COLORS[i % BUDGET_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `$${Number(value).toLocaleString()}`}
                    contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            )}
            <div className="space-y-4">
              {allCategories.map((d, i) => (
                <div key={d.name} className="flex items-center justify-between py-4 px-6 rounded-2xl bg-muted border border-border">
                  <div className="flex items-center gap-4">
                    <div className="w-3 h-3 rounded-full" style={{ background: d.included ? BUDGET_COLORS[budgetChartData.findIndex(c => c.name === d.name) % BUDGET_COLORS.length] || '#d4d4d4' : '#d4d4d4' }} />
                    <div>
                      <span className="text-sm font-bold text-foreground">{d.name}</span>
                      {d.included && d.name === 'Hotels' && bHotels > 0 && (budgetBreakdown?.nights || 0) > 0 && (
                        <div className="text-[10px] text-muted-foreground/50 font-mono mt-0.5">
                          ${hotels.length > 0 ? Math.min(...hotels.map((h: any) => h.price)).toLocaleString() : Math.round(bHotels / (budgetBreakdown?.nights || 1)).toLocaleString()}/night × {budgetBreakdown.nights} night{budgetBreakdown.nights !== 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    {d.included ? (
                      <>
                        <div className="text-sm font-bold text-foreground font-mono">${d.value.toLocaleString()}</div>
                        <div className="text-[9px] text-muted-foreground/40 uppercase tracking-wider">{totalBudgetUsed > 0 ? Math.round((d.value / totalBudgetUsed) * 100) : 0}%</div>
                      </>
                    ) : (
                      <div className="text-sm text-muted-foreground/50 italic">Not included</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {userTotalBudget > 0 && (bFlights + bHotels) > userTotalBudget && (
            <>
            <div className="flex items-center gap-3 py-4 px-6 rounded-2xl bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <p className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed">
                ⚠️ Your selected options exceed your budget. The cheapest flight + hotel alone costs ${(bFlights + bHotels).toLocaleString()}, which is over your ${userTotalBudget.toLocaleString()} budget.
              </p>
            </div>
            {/* Smart Suggestion Cards */}
            <div className="space-y-2 mt-3">
              {/* Suggestion 1: Lower hotel stars */}
              {bIncludeHotel && plannerData?.hotelStars > 1 && (() => {
                const cheapestNightly = hotels.length > 0 ? Math.min(...hotels.map((h: any) => h.price)) : 0;
                const savings = Math.round(cheapestNightly * 0.4);
                return savings > 0 ? (
                  <div className="flex items-center justify-between py-3 px-5 rounded-xl bg-amber-500/5 border border-amber-500/10">
                    <p className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed">
                      💡 Switching to {plannerData.hotelStars - 1}-star hotels could save approximately ${savings.toLocaleString()}/night.
                    </p>
                    {onNavigateToStep && (
                      <button onClick={() => onNavigateToStep(4)}
                        className="ml-4 shrink-0 px-4 py-1.5 rounded-full border border-amber-500/30 text-[10px] uppercase tracking-widest font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 transition-colors">
                        Adjust hotel preferences
                      </button>
                    )}
                  </div>
                ) : null;
              })()}
              {/* Suggestion 2: Lower cabin class */}
              {(() => {
                const cabin = plannerData?.cabinClass;
                const overrun = (bFlights + bHotels) - userTotalBudget;
                const flightShareOfOverrun = bFlights > 0 ? bFlights / (bFlights + bHotels) : 0;
                const isHighCabin = cabin === 'business' || cabin === 'first';
                return isHighCabin && (flightShareOfOverrun * overrun) > (overrun * 0.15) ? (
                  <div className="flex items-center justify-between py-3 px-5 rounded-xl bg-amber-500/5 border border-amber-500/10">
                    <p className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed">
                      💡 Switching to Economy could reduce your flight costs.
                    </p>
                    {onNavigateToStep && (
                      <button onClick={() => onNavigateToStep(3)}
                        className="ml-4 shrink-0 px-4 py-1.5 rounded-full border border-amber-500/30 text-[10px] uppercase tracking-widest font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 transition-colors">
                        Adjust flight preferences
                      </button>
                    )}
                  </div>
                ) : null;
              })()}
              {/* Suggestion 3: Increase budget (always shown when over budget) */}
              <div className="flex items-center justify-between py-3 px-5 rounded-xl bg-amber-500/5 border border-amber-500/10">
                <p className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed">
                  💡 Your selected options exceed your budget. You can adjust your budget in Step 8.
                </p>
                {onNavigateToStep && (
                  <button onClick={() => onNavigateToStep(7)}
                    className="ml-4 shrink-0 px-4 py-1.5 rounded-full border border-amber-500/30 text-[10px] uppercase tracking-widest font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 transition-colors">
                    Adjust budget
                  </button>
                )}
              </div>
            </div>
            </>
          )}
        </div>
      )}

      {/* Flights */}
      {flights.length > 0 && (
        <div className="space-y-8">
          <div className="border-b border-border pb-8">
            <div className="flex items-center gap-3 text-muted-foreground mb-2">
              <PlaneTakeoff className="w-5 h-5" />
              <span className="small-caps tracking-widest">Recommended Flights</span>
            </div>
            <h2 className="text-5xl title-text text-foreground">Curated Flights</h2>
            <p className="text-muted-foreground text-sm font-light mt-2">Top {flights.length} flights matching your preferences</p>
          </div>
          <div className="grid gap-8">
            {flights.map((offer: any, idx: number) => (
              <div key={offer.id} className="relative">
                {idx === 0 && (
                  <div className="absolute -top-3 left-8 z-10 px-4 py-1.5 rounded-full bg-foreground text-background text-[9px] uppercase tracking-widest font-black flex items-center gap-2 shadow-lg">
                    <Sparkles className="w-3 h-3" /> AI Best Pick
                  </div>
                )}
                <FlightCard offer={offer} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hotels */}
      {hotels.length > 0 && (
        <div className="space-y-8">
          <div className="border-b border-border pb-8">
            <div className="flex items-center gap-3 text-muted-foreground mb-2">
              <Hotel className="w-5 h-5" />
              <span className="small-caps tracking-widest">Premium Stays</span>
            </div>
            <h2 className="text-5xl title-text text-foreground">Matched Hotels</h2>
            <p className="text-muted-foreground text-sm font-light mt-2">Filtered by your star rating and amenity preferences</p>
          </div>
          <div className="grid gap-8">
            {hotels.map((hotel: any) => (
              <HotelCard key={hotel.id} offer={hotel} />
            ))}
          </div>
        </div>
      )}

      {/* Transport */}
      {transport.length > 0 && (
        <div className="space-y-8">
          <div className="border-b border-border pb-8">
            <div className="flex items-center gap-3 text-muted-foreground mb-2">
              <Bus className="w-5 h-5" />
              <span className="small-caps tracking-widest">Ground Transport</span>
            </div>
            <h2 className="text-5xl title-text text-foreground">Transport Options</h2>
          </div>
          <div className="grid gap-8">
            {transport.map((t: any) => (
              <BusCard key={t.id} offer={t} />
            ))}
          </div>
        </div>
      )}

      {/* Places to Visit */}
      {placesToVisit.length > 0 && (
        <div className="space-y-8">
          <div className="border-b border-border pb-8">
            <div className="flex items-center gap-3 text-muted-foreground mb-2">
              <MapPin className="w-5 h-5" />
              <span className="small-caps tracking-widest">Destination Guide</span>
            </div>
            <h2 className="text-5xl title-text text-foreground">Places to Visit</h2>
            <p className="text-muted-foreground text-sm font-light mt-2">AI-curated attractions and activities</p>
          </div>

          {/* Vibe filter chips (read-only) */}
          {selectedVibes.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedVibes.map(vId => {
                const vibe = VIBE_LABEL_MAP[vId];
                if (!vibe) return null;
                return (
                  <div key={vId} className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                    <span className="text-sm">{vibe.emoji}</span>
                    <span className="text-[10px] uppercase tracking-widest font-bold">{vibe.label}</span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {placesToVisit.map((place: any, i: number) => (
              <motion.div key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="group glass-card p-8 rounded-[28px] border border-border hover:shadow-xl transition-all duration-500"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="p-2.5 rounded-xl bg-muted border border-border group-hover:bg-foreground group-hover:text-background transition-all duration-500">
                    <MapPin className="w-5 h-5" />
                  </div>
                  {place.estimatedCost && (
                    <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground/40">
                      ~${place.estimatedCost}/day
                    </div>
                  )}
                </div>
                <h4 className="text-xl font-bold text-foreground mb-2">{place.name}</h4>
                <p className="text-sm text-muted-foreground/70 font-light leading-relaxed">{place.description}</p>
                {place.distance && (
                  <p className="text-[10px] text-muted-foreground/40 uppercase tracking-wider font-bold mt-3">{place.distance}</p>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Upsell Section */}
      {upsellOptions.length > 0 && (
        <div className="space-y-8">
          <div className="border-b border-border pb-8">
            <div className="flex items-center gap-3 text-muted-foreground mb-2">
              <TrendingUp className="w-5 h-5" />
              <span className="small-caps tracking-widest">Upgrade Your Experience</span>
            </div>
            <h2 className="text-5xl title-text text-foreground">Want More?</h2>
            <p className="text-muted-foreground text-sm font-light mt-2">See what a bigger budget unlocks</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {upsellOptions.map((opt: any, i: number) => (
              <motion.button key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.15 }}
                onClick={() => onUpsell(opt.extraAmount)}
                disabled={isUpselling}
                className="group text-left glass-card p-8 rounded-[28px] border border-border hover:border-foreground/30 transition-all duration-500 disabled:opacity-50"
              >
                <div className="flex items-center justify-between mb-6">
                  <div className="px-4 py-2 rounded-full bg-foreground text-background text-sm font-bold font-mono">
                    +${opt.extraAmount}
                  </div>
                  <ArrowUpRight className="w-5 h-5 text-muted-foreground/30 group-hover:text-foreground group-hover:translate-x-1 group-hover:-translate-y-1 transition-all" />
                </div>
                <h4 className="text-lg font-bold text-foreground mb-2">{opt.title}</h4>
                <p className="text-sm text-muted-foreground/60 font-light leading-relaxed">{opt.description}</p>
              </motion.button>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
