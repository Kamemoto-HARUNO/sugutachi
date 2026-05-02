import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { formatJstDateTime } from '../lib/datetime';
import { formatRejectionReason } from '../lib/therapist';
import type {
    ApiEnvelope,
    MeProfileRecord,
    SelfProfilePhotoSummary,
    TempFileRecord,
    TherapistMenu,
    TherapistProfileRecord,
} from '../lib/types';

interface TherapistProfilePageProps {
    tab?: 'profile' | 'menus';
}

interface MenuDraft {
    public_id: string | null;
    name: string;
    description: string;
    minimum_duration_minutes: number;
    hourly_rate_amount: number;
    is_free: boolean;
    is_active: boolean;
    sort_order: number;
}

interface MenuReorderSession {
    menuId: string;
    pointerId: number;
    pointerType: string;
    startClientX: number;
    startClientY: number;
    isDragging: boolean;
    longPressTimeoutId: number | null;
    originalOrder: string[];
}

interface MenuDragOffset {
    x: number;
    y: number;
}

interface MenuToggleSwitchProps {
    checked: boolean;
    label: string;
    ariaLabel: string;
    onChange: (checked: boolean) => void;
}

async function uploadProfilePhotoTempFile(token: string, file: File): Promise<TempFileRecord> {
    const formData = new FormData();
    formData.append('purpose', 'profile_photo');
    formData.append('file', file);

    const payload = await apiRequest<ApiEnvelope<TempFileRecord>>('/temp-files', {
        method: 'POST',
        token,
        body: formData,
    });

    return unwrapData(payload);
}

function photoStatusLabel(status: string): string {
    switch (status) {
        case 'pending':
            return '確認中';
        case 'approved':
            return '公開中';
        case 'rejected':
            return '非公開';
        default:
            return status;
    }
}

function photoStatusTone(status: string): string {
    switch (status) {
        case 'approved':
            return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100';
        case 'pending':
            return 'border-amber-300/30 bg-amber-300/10 text-amber-100';
        case 'rejected':
            return 'border-rose-300/30 bg-rose-300/10 text-rose-100';
        default:
            return 'border-white/10 bg-white/5 text-slate-300';
    }
}

function photoVisibilityLabel(visibility: 'public' | 'private'): string {
    return visibility === 'private' ? '非公開写真' : '公開写真';
}

function formatFileSize(sizeBytes: number): string {
    if (sizeBytes < 1024 * 1024) {
        return `${Math.max(1, Math.round(sizeBytes / 1024))}KB`;
    }

    return `${(sizeBytes / (1024 * 1024)).toFixed(1)}MB`;
}

function createMenuDraft(menu?: TherapistMenu): MenuDraft {
    return {
        public_id: menu?.public_id ?? null,
        name: menu?.name ?? '',
        description: menu?.description ?? '',
        minimum_duration_minutes: menu?.minimum_duration_minutes ?? menu?.duration_minutes ?? 60,
        hourly_rate_amount: menu?.hourly_rate_amount ?? 12000,
        is_free: menu?.is_free ?? false,
        is_active: menu?.is_active ?? true,
        sort_order: menu?.sort_order ?? 0,
    };
}

function toOptionalNumber(value: string): number | null {
    if (!value.trim()) {
        return null;
    }

    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
}

function formatMenuPrice(amount: number): string {
    return `${amount.toLocaleString('ja-JP')}円`;
}

function MenuToggleSwitch({ checked, label, ariaLabel, onChange }: MenuToggleSwitchProps) {
    return (
        <div className="flex items-center gap-3">
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                aria-label={ariaLabel}
                onClick={() => onChange(!checked)}
                className={[
                    'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition',
                    checked
                        ? 'border-rose-300 bg-rose-300'
                        : 'border-white/10 bg-white/10',
                ].join(' ')}
            >
                <span
                    className={[
                        'inline-block h-5 w-5 rounded-full bg-[#111923] shadow-sm transition',
                        checked ? 'translate-x-6' : 'translate-x-1',
                    ].join(' ')}
                />
            </button>
            <span className="text-sm font-semibold text-slate-200">{label}</span>
        </div>
    );
}

function normalizeMenuSortOrder(drafts: MenuDraft[]): MenuDraft[] {
    return drafts.map((draft, index) => ({
        ...draft,
        sort_order: index,
    }));
}

function areMenuOrdersEqual(left: string[], right: string[]): boolean {
    if (left.length !== right.length) {
        return false;
    }

    return left.every((value, index) => value === right[index]);
}

function moveMenuDraft(
    drafts: MenuDraft[],
    draggedId: string,
    targetId: string,
    insertAfter: boolean,
): MenuDraft[] {
    const draggedIndex = drafts.findIndex((draft) => draft.public_id === draggedId);
    const targetIndex = drafts.findIndex((draft) => draft.public_id === targetId);

    if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) {
        return drafts;
    }

    const nextDrafts = [...drafts];
    const [draggedDraft] = nextDrafts.splice(draggedIndex, 1);
    let insertIndex = targetIndex;

    if (draggedIndex < targetIndex) {
        insertIndex -= 1;
    }

    if (insertAfter) {
        insertIndex += 1;
    }

    nextDrafts.splice(insertIndex, 0, draggedDraft);

    return normalizeMenuSortOrder(nextDrafts);
}

export function TherapistProfilePage({ tab = 'profile' }: TherapistProfilePageProps) {
    const { token } = useAuth();
    const isMenuTab = tab === 'menus';
    const [meProfile, setMeProfile] = useState<MeProfileRecord | null>(null);
    const [profile, setProfile] = useState<TherapistProfileRecord | null>(null);
    const [publicName, setPublicName] = useState('');
    const [bio, setBio] = useState('');
    const [heightCm, setHeightCm] = useState('');
    const [weightKg, setWeightKg] = useState('');
    const [pSizeCm, setPSizeCm] = useState('');
    const [trainingStatus, setTrainingStatus] = useState('none');
    const [menuDrafts, setMenuDrafts] = useState<MenuDraft[]>([]);
    const [newMenuDraft, setNewMenuDraft] = useState<MenuDraft>(createMenuDraft());
    const [error, setError] = useState<string | null>(null);
    const [photoError, setPhotoError] = useState<string | null>(null);
    const [photoSuccessMessage, setPhotoSuccessMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
    const [photoVisibility, setPhotoVisibility] = useState<'public' | 'private'>('public');
    const [isLoading, setIsLoading] = useState(true);
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const [isDeletingPhotoId, setIsDeletingPhotoId] = useState<number | null>(null);
    const [pendingMenuId, setPendingMenuId] = useState<string | null>(null);
    const [editingMenuId, setEditingMenuId] = useState<string | null>(null);
    const [isCreatingMenu, setIsCreatingMenu] = useState(false);
    const [draggingMenuId, setDraggingMenuId] = useState<string | null>(null);
    const [draggingMenuOffset, setDraggingMenuOffset] = useState<MenuDragOffset>({ x: 0, y: 0 });
    const [isSavingMenuOrder, setIsSavingMenuOrder] = useState(false);
    const menuDraftsRef = useRef<MenuDraft[]>([]);
    const menuReorderSessionRef = useRef<MenuReorderSession | null>(null);

    usePageTitle(isMenuTab ? 'タチキャストメニュー' : 'タチキャストプロフィール');
    useToastOnMessage(successMessage, 'success');
    useToastOnMessage(error, 'error');
    useToastOnMessage(photoSuccessMessage, 'success');
    useToastOnMessage(photoError, 'error');

    const loadData = useCallback(async () => {
        if (!token) {
            return;
        }

        const [meProfilePayload, profilePayload] = await Promise.all([
            apiRequest<ApiEnvelope<MeProfileRecord>>('/me/profile', { token }),
            apiRequest<ApiEnvelope<TherapistProfileRecord>>('/me/therapist-profile', { token }),
        ]);

        const nextMeProfile = unwrapData(meProfilePayload);
        const nextProfile = unwrapData(profilePayload);

        setMeProfile(nextMeProfile);
        setProfile(nextProfile);
        setPublicName(nextProfile.public_name ?? '');
        setBio(nextProfile.bio ?? '');
        setHeightCm(nextProfile.height_cm != null ? String(nextProfile.height_cm) : '');
        setWeightKg(nextProfile.weight_kg != null ? String(nextProfile.weight_kg) : '');
        setPSizeCm(nextProfile.p_size_cm != null ? String(nextProfile.p_size_cm) : '');
        setTrainingStatus(nextProfile.training_status ?? 'none');
        setMenuDrafts(nextProfile.menus.map((menu) => createMenuDraft(menu)));
    }, [token]);

    useEffect(() => {
        let isMounted = true;

        void loadData()
            .catch((requestError: unknown) => {
                if (!isMounted) {
                    return;
                }

                const message =
                    requestError instanceof ApiError
                        ? requestError.message
                        : 'プロフィール情報の取得に失敗しました。';

                setError(message);
            })
            .finally(() => {
                if (isMounted) {
                    setIsLoading(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [loadData]);

    const therapistPhotos = useMemo(
        () => (meProfile?.photos ?? []).filter((photo) => photo.usage_type === 'therapist_profile'),
        [meProfile],
    );
    const privateTherapistPhotos = useMemo(
        () => therapistPhotos.filter((photo) => photo.visibility === 'private'),
        [therapistPhotos],
    );
    const isPrivatePhotoLimitReached = privateTherapistPhotos.length >= 3;
    const isMenuEditorOpen = editingMenuId !== null || isCreatingMenu;
    useEffect(() => {
        if (!photoFile) {
            setPhotoPreviewUrl((currentUrl) => {
                if (currentUrl) {
                    URL.revokeObjectURL(currentUrl);
                }

                return null;
            });

            return;
        }

        const nextPreviewUrl = URL.createObjectURL(photoFile);

        setPhotoPreviewUrl((currentUrl) => {
            if (currentUrl) {
                URL.revokeObjectURL(currentUrl);
            }

            return nextPreviewUrl;
        });

        return () => {
            URL.revokeObjectURL(nextPreviewUrl);
        };
    }, [photoFile]);

    useEffect(() => {
        menuDraftsRef.current = menuDrafts;
    }, [menuDrafts]);

    useEffect(() => {
        if (editingMenuId && !menuDrafts.some((draft) => draft.public_id === editingMenuId)) {
            setEditingMenuId(null);
        }
    }, [editingMenuId, menuDrafts]);

    useEffect(() => {
        if (isMenuTab || isLoading || window.location.hash !== '#profile-photos') {
            return;
        }

        window.requestAnimationFrame(() => {
            document.getElementById('profile-photos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }, [isLoading, isMenuTab]);

    function updateMenuDraft(publicId: string | null, patch: Partial<MenuDraft>) {
        setMenuDrafts((current) => current.map((draft) => (
            draft.public_id === publicId ? { ...draft, ...patch } : draft
        )));
    }

    const persistMenuOrder = useCallback(async (originalOrder: string[]) => {
        if (!token) {
            return;
        }

        const normalizedDrafts = normalizeMenuSortOrder(menuDraftsRef.current);
        const previousIndexMap = new Map(originalOrder.map((menuId, index) => [menuId, index]));
        const changedDrafts = normalizedDrafts.filter((draft) => {
            if (!draft.public_id) {
                return false;
            }

            return previousIndexMap.get(draft.public_id) !== draft.sort_order;
        });

        if (changedDrafts.length === 0) {
            setMenuDrafts(normalizedDrafts);
            return;
        }

        setMenuDrafts(normalizedDrafts);
        setIsSavingMenuOrder(true);
        setError(null);
        setSuccessMessage(null);

        try {
            await Promise.all(changedDrafts.map((draft) => (
                apiRequest<ApiEnvelope<TherapistMenu>>(`/me/therapist/menus/${draft.public_id}`, {
                    method: 'PATCH',
                    token,
                    body: {
                        sort_order: draft.sort_order,
                    },
                })
            )));

            await loadData();
            setSuccessMessage('メニューの並び順を更新しました。');
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : 'メニューの並び替えに失敗しました。';

            setError(message);
            await loadData().catch(() => undefined);
        } finally {
            setIsSavingMenuOrder(false);
        }
    }, [loadData, token]);

    const handleMenuReorderGlobalPointerMove = useCallback((event: PointerEvent) => {
        const session = menuReorderSessionRef.current;

        if (!session || session.pointerId !== event.pointerId) {
            return;
        }

        const deltaX = event.clientX - session.startClientX;
        const deltaY = event.clientY - session.startClientY;

        if (!session.isDragging) {
            if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
                if (session.longPressTimeoutId !== null) {
                    window.clearTimeout(session.longPressTimeoutId);
                }

                menuReorderSessionRef.current = null;
                setDraggingMenuId(null);
                setDraggingMenuOffset({ x: 0, y: 0 });
                window.removeEventListener('pointermove', handleMenuReorderGlobalPointerMove);
                window.removeEventListener('pointerup', handleMenuReorderGlobalPointerUp);
                window.removeEventListener('pointercancel', handleMenuReorderGlobalPointerUp);
            }

            return;
        }

        event.preventDefault();
        setDraggingMenuOffset({
            x: deltaX,
            y: deltaY,
        });
        const hoveredElement = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-menu-public-id]');
        const targetId = hoveredElement?.dataset.menuPublicId ?? null;

        if (!targetId || targetId === session.menuId) {
            return;
        }

        const targetRect = hoveredElement?.getBoundingClientRect();
        if (!targetRect) {
            return;
        }

        const insertAfter = event.clientY > targetRect.top + (targetRect.height / 2);

        setMenuDrafts((current) => moveMenuDraft(current, session.menuId, targetId, insertAfter));
    }, []);

    const handleMenuReorderGlobalPointerUp = useCallback((event: PointerEvent) => {
        const session = menuReorderSessionRef.current;

        if (!session || session.pointerId !== event.pointerId) {
            return;
        }

        if (session.longPressTimeoutId !== null) {
            window.clearTimeout(session.longPressTimeoutId);
        }

        menuReorderSessionRef.current = null;
        setDraggingMenuId(null);
        setDraggingMenuOffset({ x: 0, y: 0 });
        window.removeEventListener('pointermove', handleMenuReorderGlobalPointerMove);
        window.removeEventListener('pointerup', handleMenuReorderGlobalPointerUp);
        window.removeEventListener('pointercancel', handleMenuReorderGlobalPointerUp);

        if (!session.isDragging) {
            return;
        }

        const nextOrder = menuDraftsRef.current
            .map((draft) => draft.public_id)
            .filter((menuId): menuId is string => Boolean(menuId));

        if (!areMenuOrdersEqual(session.originalOrder, nextOrder)) {
            void persistMenuOrder(session.originalOrder);
        }
    }, [handleMenuReorderGlobalPointerMove, persistMenuOrder]);

    const handleMenuReorderPointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>, menuId: string) => {
        if (isMenuEditorOpen || isSavingMenuOrder || pendingMenuId !== null) {
            return;
        }

        if (event.pointerType === 'mouse' && event.button !== 0) {
            return;
        }

        event.preventDefault();

        const existingLongPressTimeoutId = menuReorderSessionRef.current?.longPressTimeoutId;
        if (existingLongPressTimeoutId !== null && existingLongPressTimeoutId !== undefined) {
            window.clearTimeout(existingLongPressTimeoutId);
        }

        window.removeEventListener('pointermove', handleMenuReorderGlobalPointerMove);
        window.removeEventListener('pointerup', handleMenuReorderGlobalPointerUp);
        window.removeEventListener('pointercancel', handleMenuReorderGlobalPointerUp);

        const nextSession: MenuReorderSession = {
            menuId,
            pointerId: event.pointerId,
            pointerType: event.pointerType,
            startClientX: event.clientX,
            startClientY: event.clientY,
            isDragging: event.pointerType === 'mouse',
            longPressTimeoutId: null,
            originalOrder: menuDraftsRef.current
                .map((draft) => draft.public_id)
                .filter((draftId): draftId is string => Boolean(draftId)),
        };

        if (nextSession.isDragging) {
            setDraggingMenuId(menuId);
            setDraggingMenuOffset({ x: 0, y: 0 });
        } else {
            nextSession.longPressTimeoutId = window.setTimeout(() => {
                const currentSession = menuReorderSessionRef.current;

                if (!currentSession || currentSession.pointerId !== event.pointerId) {
                    return;
                }

                menuReorderSessionRef.current = {
                    ...currentSession,
                    isDragging: true,
                    longPressTimeoutId: null,
                };
                setDraggingMenuId(menuId);
                setDraggingMenuOffset({ x: 0, y: 0 });
            }, 260);
        }

        menuReorderSessionRef.current = nextSession;
        window.addEventListener('pointermove', handleMenuReorderGlobalPointerMove);
        window.addEventListener('pointerup', handleMenuReorderGlobalPointerUp);
        window.addEventListener('pointercancel', handleMenuReorderGlobalPointerUp);
    }, [
        handleMenuReorderGlobalPointerMove,
        handleMenuReorderGlobalPointerUp,
        isMenuEditorOpen,
        isSavingMenuOrder,
        pendingMenuId,
    ]);

    useEffect(() => {
        return () => {
            const longPressTimeoutId = menuReorderSessionRef.current?.longPressTimeoutId;

            if (longPressTimeoutId !== null && longPressTimeoutId !== undefined) {
                window.clearTimeout(longPressTimeoutId);
            }

            setDraggingMenuOffset({ x: 0, y: 0 });
            window.removeEventListener('pointermove', handleMenuReorderGlobalPointerMove);
            window.removeEventListener('pointerup', handleMenuReorderGlobalPointerUp);
            window.removeEventListener('pointercancel', handleMenuReorderGlobalPointerUp);
        };
    }, [handleMenuReorderGlobalPointerMove, handleMenuReorderGlobalPointerUp]);

    function handlePhotoFileChange(event: ChangeEvent<HTMLInputElement>) {
        const nextFile = event.target.files?.[0] ?? null;

        if (!nextFile) {
            setPhotoFile(null);
            setPhotoError(null);
            return;
        }

        const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];

        if (!allowedMimeTypes.includes(nextFile.type)) {
            setPhotoFile(null);
            setPhotoSuccessMessage(null);
            setPhotoError('jpg / png / webp の画像を選択してください。');
            return;
        }

        if (nextFile.size > 10 * 1024 * 1024) {
            setPhotoFile(null);
            setPhotoSuccessMessage(null);
            setPhotoError('画像サイズは10MB以下にしてください。');
            return;
        }

        setPhotoError(null);
        setPhotoSuccessMessage(null);
        setPhotoFile(nextFile);
    }

    async function refreshAfterMutation(nextSuccessMessage?: string) {
        await loadData();
        if (nextSuccessMessage) {
            setSuccessMessage(nextSuccessMessage);
        }
    }

    async function refreshAfterPhotoMutation(nextSuccessMessage?: string) {
        await loadData();
        if (nextSuccessMessage) {
            setPhotoSuccessMessage(nextSuccessMessage);
        }
    }

    async function handleProfileSave(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token) {
            return;
        }

        setIsSavingProfile(true);
        setError(null);
        setSuccessMessage(null);

        try {
            const payload = await apiRequest<ApiEnvelope<TherapistProfileRecord>>('/me/therapist-profile', {
                method: 'PUT',
                token,
                body: {
                    public_name: publicName,
                    bio,
                    height_cm: toOptionalNumber(heightCm),
                    weight_kg: toOptionalNumber(weightKg),
                    p_size_cm: toOptionalNumber(pSizeCm),
                    training_status: trainingStatus,
                },
            });

            const nextProfile = unwrapData(payload);
            setProfile(nextProfile);
            await refreshAfterMutation('プロフィールを保存しました。');
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : 'プロフィールの保存に失敗しました。';

            setError(message);
        } finally {
            setIsSavingProfile(false);
        }
    }

    async function handlePhotoUpload(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token || !photoFile) {
            return;
        }

        if (photoVisibility === 'private' && isPrivatePhotoLimitReached) {
            setPhotoError('非公開写真は最大3枚までです。既存の非公開写真を削除してから追加してください。');
            return;
        }

        setIsUploadingPhoto(true);
        setError(null);
        setPhotoError(null);
        setPhotoSuccessMessage(null);
        setSuccessMessage(null);

        try {
            const tempFile = await uploadProfilePhotoTempFile(token, photoFile);

            await apiRequest<ApiEnvelope<SelfProfilePhotoSummary>>('/me/profile/photos', {
                method: 'POST',
                token,
                body: {
                    temp_file_id: tempFile.file_id,
                    usage_type: 'therapist_profile',
                    visibility: photoVisibility,
                },
            });

            const uploadedVisibility = photoVisibility;
            setPhotoFile(null);
            setPhotoVisibility('public');
            await refreshAfterPhotoMutation(
                uploadedVisibility === 'private'
                    ? '非公開写真を追加しました。公開プロフィールには表示されません。'
                    : '公開写真を追加しました。公開プロフィールに反映されます。',
            );
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : 'プロフィール写真の追加に失敗しました。';

            setPhotoError(message);
        } finally {
            setIsUploadingPhoto(false);
        }
    }

    async function deletePhoto(photoId: number) {
        if (!token) {
            return;
        }

        setIsDeletingPhotoId(photoId);
        setError(null);
        setPhotoError(null);
        setPhotoSuccessMessage(null);
        setSuccessMessage(null);

        try {
            await apiRequest<null>(`/me/profile/photos/${photoId}`, {
                method: 'DELETE',
                token,
            });

            await refreshAfterPhotoMutation('プロフィール写真を削除しました。');
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : 'プロフィール写真の削除に失敗しました。';

            setPhotoError(message);
        } finally {
            setIsDeletingPhotoId(null);
        }
    }

    async function saveMenu(draft: MenuDraft) {
        if (!token || !draft.public_id) {
            return;
        }

        setPendingMenuId(draft.public_id);
        setError(null);
        setSuccessMessage(null);

        try {
            await apiRequest<ApiEnvelope<TherapistMenu>>(`/me/therapist/menus/${draft.public_id}`, {
                method: 'PATCH',
                token,
                body: {
                    name: draft.name,
                    description: draft.description || null,
                    minimum_duration_minutes: draft.minimum_duration_minutes,
                    hourly_rate_amount: draft.is_free ? null : draft.hourly_rate_amount,
                    is_free: draft.is_free,
                    is_active: draft.is_active,
                    sort_order: draft.sort_order,
                },
            });

            await refreshAfterMutation('対応内容を更新しました。');
            setEditingMenuId(null);
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : '対応内容の更新に失敗しました。';

            setError(message);
        } finally {
            setPendingMenuId(null);
        }
    }

    async function createMenu() {
        if (!token) {
            return;
        }

        setPendingMenuId('new');
        setError(null);
        setSuccessMessage(null);

        try {
            await apiRequest<ApiEnvelope<TherapistMenu>>('/me/therapist/menus', {
                method: 'POST',
                token,
                body: {
                    name: newMenuDraft.name,
                    description: newMenuDraft.description || null,
                    minimum_duration_minutes: newMenuDraft.minimum_duration_minutes,
                    hourly_rate_amount: newMenuDraft.is_free ? null : newMenuDraft.hourly_rate_amount,
                    is_free: newMenuDraft.is_free,
                    sort_order: menuDraftsRef.current.length,
                },
            });

            setNewMenuDraft(createMenuDraft());
            await refreshAfterMutation('対応内容を追加しました。');
            setIsCreatingMenu(false);
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : '対応内容の追加に失敗しました。';

            setError(message);
        } finally {
            setPendingMenuId(null);
        }
    }

    async function deleteMenu(publicId: string) {
        if (!token) {
            return;
        }

        setPendingMenuId(publicId);
        setError(null);
        setSuccessMessage(null);

        try {
            await apiRequest<null>(`/me/therapist/menus/${publicId}`, {
                method: 'DELETE',
                token,
            });

            await refreshAfterMutation('対応内容を削除しました。');
            setEditingMenuId(null);
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : '対応内容の削除に失敗しました。';

            setError(message);
        } finally {
            setPendingMenuId(null);
        }
    }

    function startEditingMenu(publicId: string) {
        setIsCreatingMenu(false);
        setEditingMenuId(publicId);
        setError(null);
        setSuccessMessage(null);
    }

    function startCreatingMenu() {
        setEditingMenuId(null);
        setIsCreatingMenu(true);
        setNewMenuDraft({
            ...createMenuDraft(),
            sort_order: menuDraftsRef.current.length,
        });
        setError(null);
        setSuccessMessage(null);
    }

    function cancelCreatingMenu() {
        setIsCreatingMenu(false);
        setNewMenuDraft({
            ...createMenuDraft(),
            sort_order: menuDraftsRef.current.length,
        });
    }

    function cancelEditingMenu() {
        setEditingMenuId(null);
        void loadData().catch(() => undefined);
    }

    const activeMenuCount = useMemo(() => {
        return menuDrafts.filter((menu) => menu.is_active).length;
    }, [menuDrafts]);
    const canReorderMenus = !isMenuEditorOpen && !isSavingMenuOrder && pendingMenuId === null;

    if (isLoading) {
        return isMenuTab
            ? <LoadingScreen title="メニューを読み込み中" message="提供内容と料金を準備しています。" />
            : <LoadingScreen title="プロフィールを読み込み中" message="公開プロフィールと写真を準備しています。" />;
    }

    return (
        <div className="space-y-8">
            {isMenuTab ? (
                <>
                    {profile?.rejected_reason_code ? (
                        <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm leading-7 text-amber-100">
                            差し戻し理由: {formatRejectionReason(profile.rejected_reason_code)}
                        </div>
                    ) : null}

                    <section className="space-y-5 rounded-[24px] border border-white/10 bg-white/5 p-6">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-3">
                                    <h2 className="text-xl font-semibold text-white">登録済みメニュー</h2>
                                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                                        {menuDrafts.length}件登録 / 公開中 {activeMenuCount}件
                                    </span>
                                </div>
                                <p className="text-sm leading-7 text-slate-300">
                                    {canReorderMenus
                                        ? '一覧はドラッグで並び替えできます。スマホでは長押しで移動可能です。'
                                        : isSavingMenuOrder
                                            ? '並び順を保存中です。完了するまで少しお待ちください。'
                                            : '編集中は並び替えを一時停止しています。'}
                                </p>
                                <p className="text-xs leading-6 text-slate-400">
                                    「まずは相談」のような無料メニューも登録できます。無料メニューはカード決済なしで予約リクエストを受け付けます。
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={startCreatingMenu}
                                disabled={isMenuEditorOpen || isSavingMenuOrder || pendingMenuId !== null}
                                className="inline-flex items-center justify-center rounded-full bg-rose-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                新規作成
                            </button>
                        </div>

                        <div className="space-y-3">
                            {menuDrafts.length === 0 && !isCreatingMenu ? (
                                <div className="rounded-[22px] border border-dashed border-white/15 bg-[#111923] px-5 py-6 text-sm leading-7 text-slate-300">
                                    まだメニューがありません。新規作成から最初のメニューを追加してください。
                                </div>
                            ) : null}

                            {menuDrafts.map((draft, index) => (
                                editingMenuId === draft.public_id ? (
                                    <article key={draft.public_id ?? 'draft'} className="space-y-4 rounded-[22px] border border-rose-300/30 bg-[#111923] p-5">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-semibold text-white">{draft.name || 'メニューを編集中'}</p>
                                                <p className="mt-1 text-xs text-slate-400">必要な項目だけ整えて保存できます。</p>
                                            </div>
                                            <span className="rounded-full border border-rose-300/20 bg-rose-300/10 px-3 py-1 text-xs font-semibold text-rose-100">
                                                編集中
                                            </span>
                                        </div>

                                        <div className="grid gap-4 md:grid-cols-2">
                                            <label className="space-y-2">
                                                <span className="text-sm font-semibold text-white">対応内容名</span>
                                                <input
                                                    value={draft.name}
                                                    onChange={(event) => updateMenuDraft(draft.public_id, { name: event.target.value })}
                                                    className="w-full rounded-[16px] border border-white/10 bg-transparent px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                                />
                                            </label>
                                            <label className="space-y-2">
                                                <span className="text-sm font-semibold text-white">最短時間（分）</span>
                                                <input
                                                    type="number"
                                                    min={30}
                                                    max={240}
                                                    step={15}
                                                    value={draft.minimum_duration_minutes}
                                                    onChange={(event) => updateMenuDraft(draft.public_id, { minimum_duration_minutes: Number(event.target.value) })}
                                                    className="w-full rounded-[16px] border border-white/10 bg-transparent px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                                />
                                            </label>
                                        </div>

                                        <div className="space-y-4">
                                            <label className="space-y-2">
                                                <span className="text-sm font-semibold text-white">説明</span>
                                                <input
                                                    value={draft.description}
                                                    onChange={(event) => updateMenuDraft(draft.public_id, { description: event.target.value })}
                                                    className="w-full rounded-[16px] border border-white/10 bg-transparent px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                                />
                                            </label>
                                            <div className="space-y-4 pt-2">
                                                <span className="text-sm font-semibold text-white">料金設定</span>
                                                <div className="pt-2">
                                                    <MenuToggleSwitch
                                                        checked={draft.is_free}
                                                        label="無料メニュー"
                                                        ariaLabel="無料メニューを切り替える"
                                                        onChange={(checked) => updateMenuDraft(draft.public_id, {
                                                            is_free: checked,
                                                            hourly_rate_amount: checked ? draft.hourly_rate_amount : Math.max(draft.hourly_rate_amount, 12000),
                                                        })}
                                                    />
                                                </div>
                                                {!draft.is_free ? (
                                                    <label className="space-y-2">
                                                        <span className="text-sm font-semibold text-white">60分料金（円）</span>
                                                        <input
                                                            type="number"
                                                            min={1000}
                                                            max={300000}
                                                            step={500}
                                                            value={draft.hourly_rate_amount}
                                                            onChange={(event) => updateMenuDraft(draft.public_id, { hourly_rate_amount: Number(event.target.value) })}
                                                            className="w-full rounded-[16px] border border-white/10 bg-transparent px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                                        />
                                                    </label>
                                                ) : null}
                                            </div>
                                        </div>

                                        {draft.is_free ? (
                                            <p className="text-xs leading-6 text-slate-400">
                                                無料メニューでは料金ルール、手数料、カード決済は適用されません。
                                            </p>
                                        ) : null}

                                        <div className="pt-2">
                                            <MenuToggleSwitch
                                                checked={draft.is_active}
                                                label="公開"
                                                ariaLabel="メニューの公開状態を切り替える"
                                                onChange={(checked) => updateMenuDraft(draft.public_id, { is_active: checked })}
                                            />
                                        </div>

                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div className="flex flex-wrap gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        void saveMenu(draft);
                                                    }}
                                                    disabled={pendingMenuId === draft.public_id}
                                                    className="inline-flex items-center rounded-full bg-rose-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                                                >
                                                    {pendingMenuId === draft.public_id ? '保存中...' : '保存する'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={cancelEditingMenu}
                                                    disabled={pendingMenuId === draft.public_id}
                                                    className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
                                                >
                                                    キャンセル
                                                </button>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (draft.public_id) {
                                                        void deleteMenu(draft.public_id);
                                                    }
                                                }}
                                                disabled={pendingMenuId === draft.public_id}
                                                className="inline-flex items-center text-xs font-medium text-slate-500 transition hover:text-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                {pendingMenuId === draft.public_id ? '削除中...' : 'このメニューを削除'}
                                            </button>
                                        </div>
                                    </article>
                                ) : (
                                    <article
                                        key={draft.public_id ?? `menu-${index}`}
                                        data-menu-public-id={draft.public_id ?? undefined}
                                        className={[
                                            'rounded-[22px] border bg-[#111923] p-4 transition',
                                            draggingMenuId === draft.public_id
                                                ? 'border-rose-300/40 bg-rose-300/10 shadow-2xl shadow-rose-950/30'
                                                : 'border-white/10',
                                        ].join(' ')}
                                        style={draggingMenuId === draft.public_id ? {
                                            opacity: 0.58,
                                            transform: `translate3d(${draggingMenuOffset.x}px, ${draggingMenuOffset.y}px, 0) scale(1.01)`,
                                            zIndex: 20,
                                            position: 'relative',
                                            pointerEvents: 'none',
                                        } : undefined}
                                    >
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                            <div className="flex items-start gap-3">
                                                <button
                                                    type="button"
                                                    onPointerDown={(event) => {
                                                        if (draft.public_id) {
                                                            handleMenuReorderPointerDown(event, draft.public_id);
                                                        }
                                                    }}
                                                    disabled={!canReorderMenus}
                                                    aria-label={`${draft.name || 'メニュー'}の並び順を変更`}
                                                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-3 text-xs font-semibold text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                                                    style={{ touchAction: 'none' }}
                                                >
                                                    移動
                                                </button>
                                                <div className="space-y-2">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <p className="text-sm font-semibold text-white">{draft.name}</p>
                                                        <span className={[
                                                            'rounded-full border px-3 py-1 text-xs font-semibold',
                                                            draft.is_active
                                                                ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100'
                                                                : 'border-white/10 bg-white/5 text-slate-300',
                                                        ].join(' ')}>
                                                            {draft.is_active ? '公開中' : '非公開'}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-wrap gap-3 text-sm text-slate-300">
                                                        <span>最短 {draft.minimum_duration_minutes}分</span>
                                                        <span>{draft.is_free ? '無料' : `60分 ${formatMenuPrice(draft.hourly_rate_amount)}`}</span>
                                                    </div>
                                                    {draft.description ? (
                                                        <p className="text-sm leading-7 text-slate-400">{draft.description}</p>
                                                    ) : (
                                                        <p className="text-sm leading-7 text-slate-500">説明はまだありません。</p>
                                                    )}
                                                </div>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (draft.public_id) {
                                                        startEditingMenu(draft.public_id);
                                                    }
                                                }}
                                                disabled={!draft.public_id || !canReorderMenus}
                                                className="inline-flex items-center justify-center rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                編集
                                            </button>
                                        </div>
                                    </article>
                                )
                            ))}

                            {isCreatingMenu ? (
                                <article className="space-y-4 rounded-[22px] border border-rose-300/30 bg-[#111923] p-5">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-semibold text-white">新しいメニューを作成</p>
                                                <p className="mt-1 text-xs text-slate-400">まずは名前、最短時間、料金設定を整えると一覧に追加できます。</p>
                                            </div>
                                            <span className="rounded-full border border-rose-300/20 bg-rose-300/10 px-3 py-1 text-xs font-semibold text-rose-100">
                                                新規作成中
                                            </span>
                                    </div>

                                    <div className="grid gap-4 md:grid-cols-2">
                                        <label className="space-y-2">
                                            <span className="text-sm font-semibold text-white">対応内容名</span>
                                            <input
                                                value={newMenuDraft.name}
                                                onChange={(event) => setNewMenuDraft((current) => ({ ...current, name: event.target.value }))}
                                                className="w-full rounded-[16px] border border-white/10 bg-transparent px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                                placeholder="例: リラクゼーション / デート / ご飯"
                                            />
                                        </label>
                                        <label className="space-y-2">
                                            <span className="text-sm font-semibold text-white">最短時間（分）</span>
                                            <input
                                                type="number"
                                                min={30}
                                                max={240}
                                                step={15}
                                                value={newMenuDraft.minimum_duration_minutes}
                                                onChange={(event) => setNewMenuDraft((current) => ({ ...current, minimum_duration_minutes: Number(event.target.value) }))}
                                                className="w-full rounded-[16px] border border-white/10 bg-transparent px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                            />
                                        </label>
                                    </div>

                                    <div className="space-y-4">
                                        <label className="space-y-2">
                                            <span className="text-sm font-semibold text-white">説明</span>
                                            <input
                                                value={newMenuDraft.description}
                                                onChange={(event) => setNewMenuDraft((current) => ({ ...current, description: event.target.value }))}
                                                className="w-full rounded-[16px] border border-white/10 bg-transparent px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                                placeholder="例: もみほぐし中心 / ゆったり会話OK / 食事のみも可"
                                            />
                                        </label>
                                        <div className="space-y-4 pt-2">
                                            <span className="text-sm font-semibold text-white">料金設定</span>
                                            <div className="pt-2">
                                                <MenuToggleSwitch
                                                    checked={newMenuDraft.is_free}
                                                    label="無料メニュー"
                                                    ariaLabel="無料メニューを切り替える"
                                                    onChange={(checked) => setNewMenuDraft((current) => ({
                                                        ...current,
                                                        is_free: checked,
                                                        hourly_rate_amount: checked ? current.hourly_rate_amount : Math.max(current.hourly_rate_amount, 12000),
                                                    }))}
                                                />
                                            </div>
                                            {!newMenuDraft.is_free ? (
                                                <label className="space-y-2">
                                                    <span className="text-sm font-semibold text-white">60分料金（円）</span>
                                                    <input
                                                        type="number"
                                                        min={1000}
                                                        max={300000}
                                                        step={500}
                                                        value={newMenuDraft.hourly_rate_amount}
                                                        onChange={(event) => setNewMenuDraft((current) => ({ ...current, hourly_rate_amount: Number(event.target.value) }))}
                                                        className="w-full rounded-[16px] border border-white/10 bg-transparent px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                                    />
                                                </label>
                                            ) : null}
                                        </div>
                                    </div>

                                    {newMenuDraft.is_free ? (
                                        <p className="text-xs leading-6 text-slate-400">
                                            無料メニューでは料金ルール、手数料、カード決済は適用されません。
                                        </p>
                                    ) : null}

                                    <div className="flex flex-wrap gap-3">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                void createMenu();
                                            }}
                                            disabled={pendingMenuId === 'new'}
                                            className="inline-flex items-center rounded-full bg-rose-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {pendingMenuId === 'new' ? '作成中...' : '作成する'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={cancelCreatingMenu}
                                            disabled={pendingMenuId === 'new'}
                                            className="inline-flex items-center rounded-full border border-white/10 px-5 py-3 text-sm text-slate-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            キャンセル
                                        </button>
                                    </div>
                                </article>
                            ) : null}
                        </div>
                    </section>
                </>
            ) : (
                <>
                    {profile?.rejected_reason_code ? (
                        <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm leading-7 text-amber-100">
                            差し戻し理由: {formatRejectionReason(profile.rejected_reason_code)}
                        </div>
                    ) : null}

                    <div className="flex flex-wrap gap-3">
                        {profile?.public_id ? (
                            <Link
                                to={`/therapists/${profile.public_id}`}
                                className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
                            >
                                自分のページを確認
                            </Link>
                        ) : null}
                    </div>

                    <form onSubmit={handleProfileSave} className="space-y-5 rounded-[24px] border border-white/10 bg-white/5 p-6">
                        <div className="space-y-2">
                            <p className="text-xs font-semibold tracking-wide text-rose-200">基本情報</p>
                            <h2 className="text-xl font-semibold text-white">公開プロフィール</h2>
                        </div>

                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-white">公開名</span>
                            <input
                                value={publicName}
                                onChange={(event) => setPublicName(event.target.value)}
                                className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                placeholder="公開用の表示名"
                                required
                            />
                        </label>

                        <div className="grid gap-4 md:grid-cols-2">
                            <label className="space-y-2">
                                <span className="text-sm font-semibold text-white">年齢</span>
                                <input
                                    value={profile?.age != null ? `${profile.age}歳` : ''}
                                    readOnly
                                    disabled
                                    className="w-full rounded-[18px] border border-white/10 bg-[#0c141d] px-4 py-3 text-sm text-slate-300 outline-none"
                                    placeholder="本人確認後に自動表示"
                                />
                                <p className="text-xs leading-6 text-slate-400">
                                    本人確認で提出した生年月日から自動で計算されます。ここでは変更できません。
                                </p>
                            </label>

                            <label className="space-y-2">
                                <span className="text-sm font-semibold text-white">身長（cm）</span>
                                <input
                                    type="number"
                                    min={100}
                                    max={250}
                                    value={heightCm}
                                    onChange={(event) => setHeightCm(event.target.value)}
                                    className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                    placeholder="175"
                                />
                            </label>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <label className="space-y-2">
                                <span className="text-sm font-semibold text-white">体重（kg）</span>
                                <input
                                    type="number"
                                    min={30}
                                    max={250}
                                    value={weightKg}
                                    onChange={(event) => setWeightKg(event.target.value)}
                                    className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                    placeholder="68"
                                />
                            </label>

                            <label className="space-y-2">
                                <span className="text-sm font-semibold text-white">Pサイズ（cm）</span>
                                <input
                                    type="number"
                                    min={1}
                                    max={50}
                                    value={pSizeCm}
                                    onChange={(event) => setPSizeCm(event.target.value)}
                                    className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                    placeholder="15"
                                />
                            </label>
                        </div>

                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-white">自己紹介</span>
                            <textarea
                                value={bio}
                                onChange={(event) => setBio(event.target.value)}
                                rows={6}
                                className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                placeholder="対応の雰囲気や得意なケア、安心してもらうための自己紹介を入力"
                            />
                        </label>

                        <button
                            type="submit"
                            disabled={isSavingProfile}
                            className="inline-flex items-center rounded-full bg-rose-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isSavingProfile ? '保存中...' : 'プロフィールを保存する'}
                        </button>
                    </form>

                    <section id="profile-photos" className="space-y-5 rounded-[24px] border border-white/10 bg-white/5 p-6">
                        <div className="space-y-2">
                            <p className="text-xs font-semibold tracking-wide text-rose-200">写真</p>
                            <h2 className="text-xl font-semibold text-white">プロフィール写真</h2>
                            <p className="text-sm leading-7 text-slate-300">
                                顔や雰囲気が分かる写真を登録します。公開写真はプロフィールに表示され、非公開写真は自分だけが管理できる控えとして保存されます。
                            </p>
                        </div>

                        <form onSubmit={handlePhotoUpload} className="space-y-4 rounded-[22px] border border-white/10 bg-[#111923] p-5">
                            <div className="space-y-2">
                                <p className="text-sm font-semibold text-white">公開設定</p>
                                <div className="flex flex-wrap gap-3">
                                    {([
                                        { value: 'public', label: '公開写真', description: 'プロフィールにそのまま表示されます。' },
                                        { value: 'private', label: '非公開写真', description: '公開プロフィールには表示されません。' },
                                    ] as const).map((option) => (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => setPhotoVisibility(option.value)}
                                            className={[
                                                'rounded-2xl border px-4 py-3 text-left text-sm transition',
                                                photoVisibility === option.value
                                                    ? 'border-rose-300/40 bg-rose-300/10 text-white'
                                                    : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10',
                                            ].join(' ')}
                                        >
                                            <p className="font-semibold">{option.label}</p>
                                            <p className="mt-1 text-xs leading-6 text-slate-400">{option.description}</p>
                                        </button>
                                    ))}
                                </div>
                                <p className="text-xs leading-6 text-slate-400">
                                    非公開写真は最大3枚までです。現在 {privateTherapistPhotos.length} / 3 枚登録しています。
                                </p>
                            </div>

                        <label className="block space-y-2">
                            <span className="text-sm font-semibold text-white">写真を追加</span>
                            <input
                                type="file"
                                accept=".jpg,.jpeg,.png,.webp"
                                onChange={handlePhotoFileChange}
                                className="block w-full rounded-[18px] border border-white/10 bg-transparent px-4 py-3 text-sm text-white"
                            />
                            <p className="text-xs text-slate-400">
                                {photoFile ? photoFile.name : 'jpg / png / webp の画像を選択'}
                            </p>
                        </label>

                        {photoFile && photoPreviewUrl ? (
                            <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                                    <div className="h-28 w-28 overflow-hidden rounded-[18px] bg-[#1d2a37]">
                                        <img src={photoPreviewUrl} alt="" className="h-full w-full object-cover" />
                                    </div>
                                    <div className="space-y-2 text-sm text-slate-300">
                                        <p className="font-semibold text-white">{photoFile.name}</p>
                                        <p>{formatFileSize(photoFile.size)}</p>
                                        <p className="text-xs leading-6 text-slate-400">
                                            {photoVisibility === 'private'
                                                ? '非公開写真もここでプレビューしながら管理できます。'
                                                : '明るくて見やすい写真ほど、公開後の安心感につながります。'}
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => setPhotoFile(null)}
                                            className="inline-flex items-center rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/5"
                                        >
                                            選択を取り消す
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : null}

                        <button
                            type="submit"
                            disabled={isUploadingPhoto || !photoFile || (photoVisibility === 'private' && isPrivatePhotoLimitReached)}
                            className="inline-flex items-center rounded-full bg-rose-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isUploadingPhoto ? 'アップロード中...' : '写真を追加する'}
                        </button>
                    </form>

                    {therapistPhotos.length > 0 ? (
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            {therapistPhotos.map((photo) => (
                                <article
                                    key={photo.id}
                                    className="overflow-hidden rounded-[22px] border border-white/10 bg-[#111923]"
                                >
                                    <div className="aspect-[1.05] bg-[#1d2a37]">
                                        {photo.url ? (
                                            <img src={photo.url} alt="" className="h-full w-full object-cover" />
                                        ) : (
                                            <div className="flex h-full items-center justify-center text-sm font-semibold text-slate-400">
                                                画像を準備中
                                            </div>
                                        )}
                                    </div>
                                    <div className="space-y-3 px-4 py-4 text-sm text-slate-300">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                                                {photoVisibilityLabel(photo.visibility)}
                                            </span>
                                            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${photoStatusTone(photo.status)}`}>
                                                {photoStatusLabel(photo.status)}
                                            </span>
                                        </div>

                                        {photo.rejection_reason_code ? (
                                            <p className="text-xs leading-6 text-rose-200">
                                                差し戻し理由: {formatRejectionReason(photo.rejection_reason_code)}
                                            </p>
                                        ) : (
                                            <p className="text-xs leading-6 text-slate-400">
                                                登録日時: {formatJstDateTime(photo.created_at, {
                                                    month: 'numeric',
                                                    day: 'numeric',
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                }) ?? '未設定'}
                                            </p>
                                        )}

                                        <button
                                            type="button"
                                            onClick={() => {
                                                void deletePhoto(photo.id);
                                            }}
                                            disabled={isDeletingPhotoId === photo.id}
                                            className="inline-flex items-center rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {isDeletingPhotoId === photo.id ? '削除中...' : '削除'}
                                        </button>
                                    </div>
                                </article>
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-[22px] border border-dashed border-white/15 bg-[#111923] px-4 py-5 text-sm leading-7 text-slate-300">
                            まだタチキャスト用のプロフィール写真はありません。まず1枚追加すると、公開プロフィールの印象が伝わりやすくなります。
                        </div>
                    )}
                    </section>
                </>
            )}
        </div>
    );
}
