import { useEffect, useState } from 'react';

export function useConversationSearch() {
    const [search, setSearch] = useState('');
    const [query, setQuery] = useState('');
    useEffect(() => {
        const timer = window.setTimeout(() => setQuery(search.trim()), 300);
        return () => clearTimeout(timer);
    }, [search]);

    return { search, setSearch, query, pending: search.trim() !== query };
}
