'use client';

import { motion } from 'motion/react';
import { Sparkles, TrendingUp, Clock, DollarSign, Award } from 'lucide-react';

interface AIRecommendationProps {
  recommendation: {
    type: 'cheapest' | 'fastest' | 'best_value';
    title: string;
    description: string;
    offerId: string;
    reasoning: string;
  } | null;
  isLoading: boolean;
  onBook: (offerId: string) => void;
}

export default function AIRecommendation({ recommendation, isLoading, onBook }: AIRecommendationProps) {
  if (isLoading) {
    return (
      <div className="w-full glass-card p-8 rounded-[32px] animate-pulse border border-border">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-6 h-6 bg-muted rounded-full" />
          <div className="h-4 w-48 bg-muted rounded" />
        </div>
        <div className="h-8 w-3/4 bg-muted rounded mb-4" />
        <div className="h-4 w-full bg-muted rounded" />
      </div>
    );
  }

  if (!recommendation) return null;

  const getIcon = () => {
    switch (recommendation.type) {
      case 'cheapest': return <DollarSign className="w-5 h-5 text-emerald-500" />;
      case 'fastest': return <Clock className="w-5 h-5 text-blue-500" />;
      case 'best_value': return <TrendingUp className="w-5 h-5 text-amber-500" />;
      default: return <Sparkles className="w-5 h-5 text-foreground" />;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full relative group"
    >
      <div className="absolute -inset-1 bg-gradient-to-r from-foreground/5 via-foreground/10 to-foreground/5 rounded-[36px] blur-xl opacity-50 group-hover:opacity-100 transition duration-1000 group-hover:duration-200" />
      
      <div className="relative glass-card p-8 md:p-10 rounded-[32px] overflow-hidden border border-border shadow-2xl">
        <div className="absolute top-0 right-0 p-8 opacity-5">
          <Award className="w-32 h-32 text-foreground" />
        </div>

        <div className="flex flex-col md:flex-row gap-8 items-start relative z-10">
          <div className="flex-1 space-y-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-muted backdrop-blur-md border border-border">
                <Sparkles className="w-5 h-5 text-foreground" />
              </div>
              <span className="small-caps tracking-[0.2em] text-muted-foreground">AI Smart Selection</span>
            </div>

            <div className="space-y-2">
              <h3 className="text-4xl title-text text-foreground leading-tight">
                {recommendation.title}
              </h3>
              <p className="text-muted-foreground/60 font-light leading-relaxed max-w-2xl">
                {recommendation.description}
              </p>
            </div>

            <div className="flex flex-wrap gap-4 pt-2">
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-muted border border-border">
                {getIcon()}
                <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
                  {recommendation.type.replace('_', ' ')}
                </span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-muted border border-border">
                <Award className="w-4 h-4 text-muted-foreground/40" />
                <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Top Rated</span>
              </div>
            </div>
          </div>

          <div className="w-full md:w-72 p-6 rounded-2xl bg-muted border border-border backdrop-blur-sm">
            <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground/40 mb-3">Why this?</div>
            <p className="text-xs text-muted-foreground/80 leading-relaxed italic">
              &quot;{recommendation.reasoning}&quot;
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <button 
              onClick={() => onBook(recommendation.offerId)}
              className="btn-primary flex items-center justify-center gap-3 px-10 py-5 group/btn whitespace-nowrap"
            >
              <span className="text-[10px] uppercase tracking-[0.2em] font-bold">Confirm AI Selection</span>
              <Award className="w-4 h-4 group-hover/btn:scale-110 transition-transform" />
            </button>
            <p className="text-[9px] text-center text-muted-foreground/40 uppercase tracking-widest font-medium">Special Concierge Pricing Included</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
