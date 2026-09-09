// Ephemeral only: do not persist conversation content in browser storage.
export interface DirectMessageDraft {
    body: string;
    file: File | null;
    sendKey: string;
}
const drafts = new Map<string, DirectMessageDraft>();
export const getDirectMessageDraft = (key: string) => drafts.get(key);
export const setDirectMessageDraft = (
    key: string,
    value: DirectMessageDraft,
) => {
    if (!value.body && !value.file) drafts.delete(key);
    else drafts.set(key, value);
};
export const clearDirectMessageDrafts = () => drafts.clear();
