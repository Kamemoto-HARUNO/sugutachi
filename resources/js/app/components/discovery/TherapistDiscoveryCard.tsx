import { Link } from 'react-router-dom';
import { buildEstimatedPriceLabel, formatTrainingStatus, formatWalkingTimeRange } from '../../lib/discovery';

interface TherapistDiscoveryCardProps {
    name: string;
    age?: number | null;
    heightCm?: number | null;
    weightKg?: number | null;
    pSizeCm?: number | null;
    ratingAverage: number;
    reviewCount: number;
    walkingTimeRange: string | null | undefined;
    estimatedTotalAmount: number | null | undefined;
    durationMinutes?: number | null;
    trainingStatus?: string | null;
    therapistCancellationCount?: number;
    tags?: string[];
    photoUrl?: string | null;
    to?: string;
    footerHint?: string;
}

function buildMetaLine(reviewCount: number, ratingAverage: number): string {
    return `★${ratingAverage.toFixed(1)}（${reviewCount}件）`;
}

function buildProfileLine({
    heightCm,
    weightKg,
    age,
    pSizeCm,
}: Pick<TherapistDiscoveryCardProps, 'heightCm' | 'weightKg' | 'age' | 'pSizeCm'>): string | null {
    const values = [
        heightCm != null ? String(heightCm) : null,
        weightKg != null ? String(weightKg) : null,
        age != null ? String(age) : null,
        pSizeCm != null ? `P${pSizeCm}` : null,
    ].filter((value): value is string => value !== null);

    return values.length > 0 ? values.join(' / ') : null;
}

function CardBody({
    name,
    age,
    heightCm,
    weightKg,
    pSizeCm,
    ratingAverage,
    reviewCount,
    walkingTimeRange,
    estimatedTotalAmount,
    durationMinutes,
    trainingStatus,
    tags,
    photoUrl,
    footerHint,
}: Omit<TherapistDiscoveryCardProps, 'to'>) {
    const resolvedTags = tags && tags.length > 0 ? tags : [];
    const profileLine = buildProfileLine({ heightCm, weightKg, age, pSizeCm });

    return (
        <div className="flex h-full flex-col">
            <div className="flex gap-4 p-5 md:p-6">
                <div className="h-[92px] w-[92px] shrink-0 overflow-hidden rounded-[28px] bg-[#ede2cf] shadow-inner">
                    {photoUrl ? (
                        <img src={photoUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(160deg,#e8d5b2_0%,#cbb08a_100%)] text-3xl font-semibold text-[#17202b]">
                            {name.slice(0, 1).toUpperCase()}
                        </div>
                    )}
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-3">
                    <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-[1.65rem] font-semibold leading-none text-[#17202b]">{name}</h3>
                            {trainingStatus ? (
                                <span className="rounded-full bg-[#e8f1eb] px-2.5 py-1 text-xs font-medium text-[#2d5b3d]">
                                    {formatTrainingStatus(trainingStatus)}
                                </span>
                            ) : null}
                        </div>
                        {profileLine ? (
                            <p className="text-sm font-medium tracking-wide text-[#68707a]">
                                {profileLine}
                            </p>
                        ) : null}

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#68707a]">
                            <span>{buildMetaLine(reviewCount, ratingAverage)}</span>
                            <span>{formatWalkingTimeRange(walkingTimeRange)}</span>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <p className="text-xl font-bold text-[#17202b]">
                            {buildEstimatedPriceLabel(durationMinutes, estimatedTotalAmount)}
                        </p>
                    </div>

                    {resolvedTags.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                            {resolvedTags.map((tag) => (
                                <span key={tag} className="rounded-full bg-[#f5efe4] px-3 py-1 text-xs text-[#48505a]">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    ) : null}
                </div>
            </div>

            <div className="mt-auto border-t border-[#efe5d7] px-5 pb-4 pt-3 text-center text-xs text-[#9a8d79] md:px-6">
                {footerHint ?? '詳細を見る'}
            </div>
        </div>
    );
}

export function TherapistDiscoveryCard(props: TherapistDiscoveryCardProps) {
    const cardClassName =
        'group block h-full overflow-hidden rounded-[28px] bg-[#fffcf7] shadow-[0_10px_24px_rgba(23,32,43,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_36px_rgba(23,32,43,0.12)]';

    if (!props.to) {
        return (
            <article className={cardClassName}>
                <CardBody {...props} />
            </article>
        );
    }

    return (
        <Link to={props.to} className={cardClassName}>
            <CardBody {...props} />
        </Link>
    );
}
