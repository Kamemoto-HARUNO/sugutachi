import { TherapistDiscoveryCard } from './TherapistDiscoveryCard';
import type { TherapistSearchResult } from '../../lib/types';

interface TherapistDiscoveryGridProps {
    therapists: TherapistSearchResult[];
    durationMinutes: number;
    footerHint: string;
    buildLink: (therapist: TherapistSearchResult) => string;
    emptyState?: React.ReactNode;
    className?: string;
}

export function TherapistDiscoveryGrid({
    therapists,
    durationMinutes,
    footerHint,
    buildLink,
    emptyState = null,
    className = '',
}: TherapistDiscoveryGridProps) {
    if (therapists.length === 0) {
        return <>{emptyState}</>;
    }

    return (
        <div className={['grid content-start items-start gap-5 xl:grid-cols-2', className].join(' ').trim()}>
            {therapists.map((therapist) => (
                <TherapistDiscoveryCard
                    key={therapist.public_id}
                    name={therapist.public_name}
                    age={therapist.age}
                    heightCm={therapist.height_cm}
                    weightKg={therapist.weight_kg}
                    pSizeCm={therapist.p_size_cm}
                    ratingAverage={therapist.rating_average}
                    reviewCount={therapist.review_count}
                    travelMode={therapist.travel_mode}
                    walkingTimeRange={therapist.walking_time_range}
                    estimatedTotalAmount={therapist.estimated_total_amount}
                    durationMinutes={durationMinutes}
                    trainingStatus={therapist.training_status}
                    therapistCancellationCount={therapist.therapist_cancellation_count}
                    photoUrl={therapist.photos[0]?.url ?? null}
                    to={buildLink(therapist)}
                    footerHint={footerHint}
                />
            ))}
        </div>
    );
}
