interface DiscoveryInfoCardItem {
    label: string;
    title: string;
    body: string;
}

interface DiscoveryInfoCardsProps {
    cards: DiscoveryInfoCardItem[];
}

export function DiscoveryInfoCards({ cards }: DiscoveryInfoCardsProps) {
    return (
        <section className="grid gap-4 md:grid-cols-3">
            {cards.map((card) => (
                <article key={`${card.label}-${card.title}`} className="rounded-[24px] bg-[#fffdf8] p-6 shadow-[0_10px_24px_rgba(23,32,43,0.06)]">
                    <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">{card.label}</p>
                    <h2 className="mt-1 text-[1.35rem] font-semibold text-[#17202b]">{card.title}</h2>
                    <p className="mt-3 text-sm leading-7 text-[#5b6470]">{card.body}</p>
                </article>
            ))}
        </section>
    );
}
