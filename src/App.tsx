import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudOff,
  Copy,
  GripVertical,
  ListFilter,
  Loader2,
  LogOut,
  Moon,
  Pencil,
  Plus,
  Search,
  Sun,
  Trash2,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { LoginPage } from './components/LoginPage';
import { Modal } from './components/Modal';
import { CATEGORIES, FOODS } from './data/foods';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import { FoodItem, Meal, Recommendation } from './types';

type ActiveTab = 'tabela' | 'refeicoes';
type RecommendationFilter = 'Todos' | Recommendation;
type Theme = 'light' | 'dark';
type SyncStatus = 'idle' | 'saving' | 'saved' | 'error';

const STORAGE_KEY = 'dieta-fase1-meals-v1';
const THEME_STORAGE_KEY = 'dieta-fase1-theme-v1';
const MIGRATED_PREFIX = 'dieta-fase1-migrated-v1:';

function loadTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
  } catch {
    // Fallback to light theme
  }
  return 'light';
}

const DEFAULT_MEALS: Meal[] = [
  { id: 'cafe-da-manha', name: 'Café da manhã', foodIds: [] },
  { id: 'almoco', name: 'Almoço', foodIds: [] },
  { id: 'jantar', name: 'Jantar', foodIds: [] },
];

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function loadMeals(): Meal[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_MEALS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Fallback to default meals if storage is unavailable or corrupted
  }
  return DEFAULT_MEALS;
}

function getRecDotClass(rec: Recommendation): string {
  if (rec === 'Permitido') return 'dot-green';
  if (rec === 'Moderado') return 'dot-amber';
  return 'dot-red';
}

function sanitizeMeals(raw: unknown): Meal[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is Meal =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as Meal).id === 'string' &&
        typeof (item as Meal).name === 'string' &&
        Array.isArray((item as Meal).foodIds)
    )
    .map((m) => ({
      id: m.id,
      name: m.name,
      foodIds: m.foodIds.filter((id): id is string => typeof id === 'string'),
    }));
}

function countMealItems(list: Meal[]): number {
  return list.reduce((sum, meal) => sum + meal.foodIds.length, 0);
}

function hasMeaningfulMeals(list: Meal[]): boolean {
  if (countMealItems(list) > 0) return true;
  if (list.length !== DEFAULT_MEALS.length) return true;
  return list.some((meal, idx) => meal.name !== DEFAULT_MEALS[idx]?.name);
}

function mergeMealLists(cloudMeals: Meal[], localMeals: Meal[]): Meal[] {
  const result = cloudMeals.map((m) => ({ ...m, foodIds: [...m.foodIds] }));

  for (const localMeal of localMeals) {
    const normalizedLocalName = normalizeText(localMeal.name.trim());
    const existing = result.find(
      (m) =>
        m.id === localMeal.id ||
        normalizeText(m.name.trim()) === normalizedLocalName
    );

    if (existing) {
      for (const foodId of localMeal.foodIds) {
        if (!existing.foodIds.includes(foodId)) {
          existing.foodIds.push(foodId);
        }
      }
    } else if (localMeal.foodIds.length > 0 || !DEFAULT_MEALS.some((d) => d.id === localMeal.id)) {
      result.push({ ...localMeal, foodIds: [...localMeal.foodIds] });
    }
  }

  return result;
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [activeTab, setActiveTab] = useState<ActiveTab>('tabela');

  // Auth & sync state
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(isSupabaseConfigured);
  const [recoveryMode, setRecoveryMode] = useState<boolean>(false);
  const [cloudReady, setCloudReady] = useState<boolean>(!isSupabaseConfigured);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [migrationPrompt, setMigrationPrompt] = useState<{
    cloudMeals: Meal[];
    localMeals: Meal[];
  } | null>(null);
  const skipNextCloudSaveRef = useRef<boolean>(false);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('no-theme-transitions');
    root.setAttribute('data-theme', theme);
    void root.offsetHeight;
    const raf = requestAnimationFrame(() => {
      root.classList.remove('no-theme-transitions');
    });
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage errors
    }
    return () => cancelAnimationFrame(raf);
  }, [theme]);

  // Table tab filters
  const [tableSearch, setTableSearch] = useState('');
  const [tableRecFilter, setTableRecFilter] = useState<RecommendationFilter>('Todos');
  const [tableCategoryFilter, setTableCategoryFilter] = useState<string>('Todas');

  // Meal builder tab filters
  const [builderSearch, setBuilderSearch] = useState('');
  const [builderRecFilter, setBuilderRecFilter] = useState<RecommendationFilter>('Todos');
  const [builderCategoryFilter, setBuilderCategoryFilter] = useState<string>('Todas');

  // Meals state
  const [meals, setMeals] = useState<Meal[]>(loadMeals);
  const [activeMealId, setActiveMealId] = useState<string>(() => loadMeals()[0]?.id ?? '');
  const [newMealName, setNewMealName] = useState('');
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [editingMealName, setEditingMealName] = useState('');
  const [dragOverMealId, setDragOverMealId] = useState<string | null>(null);
  const [draggingMealId, setDraggingMealId] = useState<string | null>(null);

  // Per-row meal dropdown in table
  const [openRowDropdownId, setOpenRowDropdownId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const [toast, setToast] = useState<string | null>(null);

  const persistMealsToCloud = useCallback(
    async (userId: string, nextMeals: Meal[]) => {
      if (!supabase) return;
      setSyncStatus('saving');
      const { error } = await supabase.from('user_meal_plans').upsert(
        {
          user_id: userId,
          meals: nextMeals,
        },
        { onConflict: 'user_id' }
      );
      if (error) {
        setSyncStatus('error');
        return;
      }
      setSyncStatus('saved');
    },
    []
  );

  // Initialize Supabase session & listen to auth events (including PKCE recovery)
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setAuthLoading(false);
      return;
    }

    let mounted = true;
    const url = new URL(window.location.href);
    const hasAuthParams =
      url.searchParams.has('code') ||
      window.location.hash.includes('type=recovery') ||
      window.location.hash.includes('access_token=');

    if (window.location.hash.includes('type=recovery')) {
      setRecoveryMode(true);
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setAuthLoading(false);
      if (hasAuthParams) {
        window.history.replaceState({}, '', `${url.origin}${url.pathname}`);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (!mounted) return;
        setSession(nextSession ?? null);
        setAuthLoading(false);

        if (event === 'PASSWORD_RECOVERY') {
          setRecoveryMode(true);
        } else if (event === 'SIGNED_OUT') {
          setCloudReady(false);
          setSyncStatus('idle');
          setMigrationPrompt(null);
        }

        if (hasAuthParams || window.location.search.includes('code=')) {
          const cleanUrl = new URL(window.location.href);
          window.history.replaceState({}, '', `${cleanUrl.origin}${cleanUrl.pathname}`);
        }
      }
    );

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  // Load meals from cloud on login & safely migrate localStorage meals
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !session?.user || recoveryMode) {
      return;
    }

    const userId = session.user.id;
    let active = true;
    setCloudReady(false);

    async function loadAndMigrate() {
      if (!supabase) return;
      const { data, error } = await supabase
        .from('user_meal_plans')
        .select('meals')
        .eq('user_id', userId)
        .maybeSingle();

      if (!active) return;
      if (error) {
        setSyncStatus('error');
        setCloudReady(true);
        return;
      }

      const cloudMeals = data ? sanitizeMeals(data.meals) : null;
      const localMeals = loadMeals();
      const alreadyMigrated =
        localStorage.getItem(`${MIGRATED_PREFIX}${userId}`) === '1';

      if (!cloudMeals || (cloudMeals.length === 0 && !hasMeaningfulMeals(cloudMeals))) {
        const initialMeals = hasMeaningfulMeals(localMeals)
          ? localMeals
          : DEFAULT_MEALS;
        skipNextCloudSaveRef.current = true;
        setMeals(initialMeals);
        setActiveMealId(initialMeals[0]?.id ?? '');
        await persistMealsToCloud(userId, initialMeals);
        localStorage.setItem(`${MIGRATED_PREFIX}${userId}`, '1');
        if (countMealItems(localMeals) > 0) {
          setToast('Refeições deste aparelho sincronizadas com sua conta!');
        }
        if (active) setCloudReady(true);
        return;
      }

      if (
        !alreadyMigrated &&
        countMealItems(localMeals) > 0 &&
        JSON.stringify(localMeals) !== JSON.stringify(cloudMeals)
      ) {
        skipNextCloudSaveRef.current = true;
        setMeals(cloudMeals);
        setActiveMealId(cloudMeals[0]?.id ?? '');
        setMigrationPrompt({ cloudMeals, localMeals });
        if (active) setCloudReady(true);
        return;
      }

      skipNextCloudSaveRef.current = true;
      setMeals(cloudMeals);
      setActiveMealId((prev) =>
        cloudMeals.some((m) => m.id === prev) ? prev : cloudMeals[0]?.id ?? ''
      );
      localStorage.setItem(`${MIGRATED_PREFIX}${userId}`, '1');
      setSyncStatus('saved');
      if (active) setCloudReady(true);
    }

    loadAndMigrate();

    return () => {
      active = false;
    };
  }, [session?.user?.id, recoveryMode, persistMealsToCloud]);

  // Subscribe to realtime changes and refresh when returning to tab
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !session?.user || !cloudReady) {
      return;
    }

    const userId = session.user.id;
    const channel = supabase
      .channel(`meal-plan-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_meal_plans',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const nextRow = payload.new as { meals?: unknown } | null;
          if (!nextRow || !nextRow.meals) return;
          const incoming = sanitizeMeals(nextRow.meals);
          skipNextCloudSaveRef.current = true;
          setMeals(incoming);
          setActiveMealId((prev) =>
            incoming.some((m) => m.id === prev) ? prev : incoming[0]?.id ?? ''
          );
          setSyncStatus('saved');
        }
      )
      .subscribe();

    async function handleVisibilityChange() {
      if (document.visibilityState !== 'visible' || !supabase) return;
      const { data } = await supabase
        .from('user_meal_plans')
        .select('meals')
        .eq('user_id', userId)
        .maybeSingle();
      if (data?.meals) {
        const incoming = sanitizeMeals(data.meals);
        skipNextCloudSaveRef.current = true;
        setMeals(incoming);
        setSyncStatus('saved');
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      supabase?.removeChannel(channel);
    };
  }, [session?.user?.id, cloudReady]);

  // Save locally & debounce save to Supabase
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(meals));
    } catch {
      // Ignore storage quota errors
    }

    if (!isSupabaseConfigured || !supabase || !session?.user || !cloudReady) {
      return;
    }

    if (skipNextCloudSaveRef.current) {
      skipNextCloudSaveRef.current = false;
      return;
    }

    setSyncStatus('saving');
    const userId = session.user.id;
    const timer = setTimeout(() => {
      persistMealsToCloud(userId, meals);
    }, 450);

    return () => clearTimeout(timer);
  }, [meals, session?.user?.id, cloudReady, persistMealsToCloud]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!openRowDropdownId) return;
    function handleOutsideClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenRowDropdownId(null);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenRowDropdownId(null);
    }
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [openRowDropdownId]);

  const foodMap = useMemo(() => {
    const map = new Map<string, FoodItem>();
    for (const food of FOODS) {
      map.set(food.id, food);
    }
    return map;
  }, []);

  const countsByRec = useMemo(() => {
    const counts = { Permitido: 0, Moderado: 0, 'Não permitido': 0 };
    for (const food of FOODS) {
      counts[food.recommendation]++;
    }
    return counts;
  }, []);

  const tableFoods = useMemo(() => {
    const query = normalizeText(tableSearch.trim());
    return FOODS.filter((food) => {
      if (tableRecFilter !== 'Todos' && food.recommendation !== tableRecFilter) return false;
      if (tableCategoryFilter !== 'Todas' && food.category !== tableCategoryFilter) return false;
      if (!query) return true;
      const haystack = normalizeText(`${food.name} ${food.category} ${food.notes ?? ''}`);
      return haystack.includes(query);
    });
  }, [tableSearch, tableRecFilter, tableCategoryFilter]);

  const builderFoods = useMemo(() => {
    const query = normalizeText(builderSearch.trim());
    return FOODS.filter((food) => {
      if (builderRecFilter !== 'Todos' && food.recommendation !== builderRecFilter) return false;
      if (builderCategoryFilter !== 'Todas' && food.category !== builderCategoryFilter) return false;
      if (!query) return true;
      const haystack = normalizeText(`${food.name} ${food.category} ${food.notes ?? ''}`);
      return haystack.includes(query);
    });
  }, [builderSearch, builderRecFilter, builderCategoryFilter]);

  const dayStats = useMemo(() => {
    let totalItems = 0;
    let moderateCount = 0;
    let forbiddenCount = 0;

    for (const meal of meals) {
      for (const foodId of meal.foodIds) {
        const food = foodMap.get(foodId);
        if (!food) continue;
        totalItems++;
        if (food.recommendation === 'Moderado') moderateCount++;
        if (food.recommendation === 'Não permitido') forbiddenCount++;
      }
    }

    return { totalItems, moderateCount, forbiddenCount };
  }, [meals, foodMap]);

  function showToast(message: string) {
    setToast(message);
  }

  function handleCreateMeal(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newMealName.trim();
    if (!trimmed) return;
    const id = `meal-${Date.now()}`;
    const created: Meal = { id, name: trimmed, foodIds: [] };
    setMeals((prev) => [...prev, created]);
    setActiveMealId(id);
    setNewMealName('');
    showToast(`Refeição "${trimmed}" criada`);
  }

  function handleDeleteMeal(mealId: string) {
    setMeals((prev) => {
      const next = prev.filter((m) => m.id !== mealId);
      if (activeMealId === mealId) {
        setActiveMealId(next[0]?.id ?? '');
      }
      return next;
    });
  }

  function startRenameMeal(meal: Meal) {
    setEditingMealId(meal.id);
    setEditingMealName(meal.name);
  }

  function commitRenameMeal(mealId: string) {
    const trimmed = editingMealName.trim();
    if (trimmed) {
      setMeals((prev) =>
        prev.map((m) => (m.id === mealId ? { ...m, name: trimmed } : m))
      );
    }
    setEditingMealId(null);
  }

  function addFoodToMeal(mealId: string, foodId: string) {
    const targetMeal = meals.find((m) => m.id === mealId);
    const food = foodMap.get(foodId);
    if (!targetMeal || !food) return;

    setMeals((prev) =>
      prev.map((m) =>
        m.id === mealId ? { ...m, foodIds: [...m.foodIds, foodId] } : m
      )
    );
    setActiveMealId(mealId);
    showToast(`${food.name} adicionado em "${targetMeal.name}"`);
  }

  function removeFoodFromMeal(mealId: string, index: number) {
    setMeals((prev) =>
      prev.map((m) =>
        m.id === mealId
          ? { ...m, foodIds: m.foodIds.filter((_, idx) => idx !== index) }
          : m
      )
    );
  }

  function handleQuickAdd(food: FoodItem, specificMealId?: string) {
    if (meals.length === 0) {
      const id = `meal-${Date.now()}`;
      setMeals([{ id, name: 'Minha refeição', foodIds: [food.id] }]);
      setActiveMealId(id);
      setOpenRowDropdownId(null);
      showToast(`${food.name} adicionado em "Minha refeição"`);
      return;
    }

    const targetId =
      specificMealId ??
      (meals.some((m) => m.id === activeMealId) ? activeMealId : meals[0].id);

    addFoodToMeal(targetId, food.id);
    setOpenRowDropdownId(null);
  }

  async function handleCopySummary() {
    const lines = meals.map((meal) => {
      const items = meal.foodIds
        .map((id) => foodMap.get(id))
        .filter((f): f is FoodItem => Boolean(f))
        .map((f) => `  • ${f.name} (${f.recommendation})`);
      return `${meal.name}:\n${items.length ? items.join('\n') : '  (vazio)'}`;
    });
    const text = `Cardápio — Dieta Fase 1\n\n${lines.join('\n\n')}`;
    try {
      await navigator.clipboard.writeText(text);
      showToast('Cardápio copiado para a área de transferência');
    } catch {
      showToast('Não foi possível copiar automaticamente');
    }
  }

  function handleDragStart(e: React.DragEvent, foodId: string) {
    setDraggingMealId(null);
    e.dataTransfer.setData('application/x-food-id', foodId);
    e.dataTransfer.setData('text/plain', foodId);
    e.dataTransfer.effectAllowed = 'copy';
  }

  function moveMeal(mealId: string, direction: -1 | 1) {
    setMeals((prev) => {
      const index = prev.findIndex((m) => m.id === mealId);
      const targetIndex = index + direction;
      if (index === -1 || targetIndex < 0 || targetIndex >= prev.length) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }

  function reorderMeals(fromId: string, toId: string) {
    if (fromId === toId) return;
    setMeals((prev) => {
      const fromIndex = prev.findIndex((m) => m.id === fromId);
      const toIndex = prev.findIndex((m) => m.id === toId);
      if (fromIndex === -1 || toIndex === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  function handleMealDragStart(e: React.DragEvent, mealId: string) {
    setDraggingMealId(mealId);
    e.dataTransfer.setData('application/x-meal-id', mealId);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDropOnMeal(e: React.DragEvent, mealId: string) {
    e.preventDefault();
    setDragOverMealId(null);

    const draggedMeal =
      draggingMealId || e.dataTransfer.getData('application/x-meal-id');
    if (draggedMeal) {
      reorderMeals(draggedMeal, mealId);
      setDraggingMealId(null);
      return;
    }

    const foodId =
      e.dataTransfer.getData('application/x-food-id') ||
      e.dataTransfer.getData('text/plain');
    if (foodId) {
      addFoodToMeal(mealId, foodId);
    }
  }

  const activeMealName =
    meals.find((m) => m.id === activeMealId)?.name ?? meals[0]?.name;

  async function handleResolveMigration(choice: 'merge' | 'cloud' | 'local') {
    if (!migrationPrompt || !session?.user) return;
    const userId = session.user.id;
    let resolved: Meal[];

    if (choice === 'merge') {
      resolved = mergeMealLists(
        migrationPrompt.cloudMeals,
        migrationPrompt.localMeals
      );
    } else if (choice === 'local') {
      resolved = migrationPrompt.localMeals;
    } else {
      resolved = migrationPrompt.cloudMeals;
    }

    skipNextCloudSaveRef.current = true;
    setMeals(resolved);
    setActiveMealId(resolved[0]?.id ?? '');
    setMigrationPrompt(null);
    localStorage.setItem(`${MIGRATED_PREFIX}${userId}`, '1');
    await persistMealsToCloud(userId, resolved);
    showToast(
      choice === 'merge'
        ? 'Refeições mescladas e sincronizadas!'
        : 'Refeições sincronizadas com sua conta!'
    );
  }

  async function handleSignOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    showToast('Sessão encerrada');
  }

  if (authLoading) {
    return (
      <div className="auth-loading-screen">
        <Loader2 size={24} className="spin" />
        <span>Carregando sua conta...</span>
      </div>
    );
  }

  if (isSupabaseConfigured && (!session || recoveryMode)) {
    return (
      <LoginPage
        theme={theme}
        onToggleTheme={() =>
          setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))
        }
        localMealItemsCount={countMealItems(loadMeals())}
        recoveryMode={recoveryMode}
        onRecoveryComplete={() => {
          setRecoveryMode(false);
          showToast('Senha atualizada com sucesso!');
        }}
      />
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="brand-eyebrow">Dieta Fase 1 • 15 dias</p>
          <h1 className="app-title">Guia de Alimentos & Refeições</h1>
          <p className="app-subtitle">
            Baseado na tabela de Teco Mendes Nutricionista ({FOODS.length} alimentos)
          </p>
        </div>

        <div className="header-right">
          {session?.user && (
            <div className="account-bar">
              <span className="account-email" title={session.user.email ?? ''}>
                {session.user.email}
              </span>
              <span className={`sync-pill sync-${syncStatus}`}>
                {syncStatus === 'saving' ? (
                  <>
                    <Loader2 size={12} className="spin" />
                    Salvando
                  </>
                ) : syncStatus === 'error' ? (
                  <>
                    <CloudOff size={12} />
                    Erro ao sincronizar
                  </>
                ) : (
                  <>
                    <Cloud size={12} />
                    Sincronizado
                  </>
                )}
              </span>
              <button
                type="button"
                className="logout-btn"
                onClick={handleSignOut}
                title="Sair da conta"
              >
                <LogOut size={13} />
                <span>Sair</span>
              </button>
            </div>
          )}

          <div className="header-actions">
          <nav className="tabs" aria-label="Modos de visualização">
            <button
              type="button"
              className={`tab-btn ${activeTab === 'tabela' ? 'active' : ''}`}
              onClick={() => setActiveTab('tabela')}
            >
              <ListFilter size={16} />
              Tabela de Alimentos
              <span className="tab-count">{FOODS.length}</span>
            </button>
            <button
              type="button"
              className={`tab-btn ${activeTab === 'refeicoes' ? 'active' : ''}`}
              onClick={() => setActiveTab('refeicoes')}
            >
              <UtensilsCrossed size={16} />
              Montar Refeições
              <span className="tab-count">{dayStats.totalItems}</span>
            </button>
          </nav>

          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
            aria-label={theme === 'light' ? 'Ativar modo escuro' : 'Ativar modo claro'}
            title={theme === 'light' ? 'Modo escuro' : 'Modo claro'}
          >
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          </div>
        </div>
      </header>

      <section className="rules-strip" aria-label="Regras da Fase 1">
        <div className="rule-card">
          <span className="rule-dot dot-green" />
          <span>
            <strong>Permitido:</strong> Consumo livre, em qualquer horário do dia
          </span>
        </div>
        <div className="rule-card">
          <span className="rule-dot dot-amber" />
          <span>
            <strong>Moderado:</strong> Escolher apenas 1 opção e consumir uma vez no dia
          </span>
        </div>
        <div className="rule-card">
          <span className="rule-dot dot-red" />
          <span>
            <strong>Não permitido:</strong> Evitar durante os 15 dias da Fase 1
          </span>
        </div>
      </section>

      {activeTab === 'tabela' ? (
        <>
          <section className="filters-card" aria-label="Filtros da tabela">
            <div className="filters-top">
              <div className="search-wrap">
                <Search size={16} className="search-icon" />
                <input
                  type="text"
                  className="search-input"
                  placeholder="Buscar alimento ou observação (ex: queijo, café, açúcar)..."
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                />
                {tableSearch && (
                  <button
                    type="button"
                    className="clear-btn"
                    onClick={() => setTableSearch('')}
                    aria-label="Limpar busca"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>

              <div className="select-wrap">
                <select
                  className="category-select"
                  aria-label="Filtrar por descrição"
                  value={tableCategoryFilter}
                  onChange={(e) => setTableCategoryFilter(e.target.value)}
                >
                  <option value="Todas">Todas as descrições ({CATEGORIES.length})</option>
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rec-bar">
              <div className="segmented" role="group" aria-label="Filtrar por recomendação">
                {(
                  [
                    ['Todos', FOODS.length, null],
                    ['Permitido', countsByRec.Permitido, 'dot-green'],
                    ['Moderado', countsByRec.Moderado, 'dot-amber'],
                    ['Não permitido', countsByRec['Não permitido'], 'dot-red'],
                  ] as const
                ).map(([label, count, dotClass]) => (
                  <button
                    key={label}
                    type="button"
                    className={`seg-btn ${tableRecFilter === label ? 'active' : ''}`}
                    onClick={() => setTableRecFilter(label)}
                  >
                    {dotClass && <span className={`rule-dot ${dotClass}`} />}
                    <span>{label}</span>
                    <span className="seg-count">{count}</span>
                  </button>
                ))}
              </div>

              <span className="results-meta">
                Mostrando <strong>{tableFoods.length}</strong> de {FOODS.length} itens
              </span>
            </div>
          </section>

          <section className="table-card">
            {tableFoods.length === 0 ? (
              <div className="empty-state">
                Nenhum alimento encontrado com esses filtros.
              </div>
            ) : (
              <table className="food-table">
                <thead>
                  <tr>
                    <th>Alimento</th>
                    <th>Recomendação</th>
                    <th>Descrição</th>
                    <th>Observações</th>
                    <th style={{ width: '1%' }}>Refeição</th>
                  </tr>
                </thead>
                <tbody>
                  {tableFoods.map((food) => {
                    const isDropdownOpen = openRowDropdownId === food.id;
                    return (
                      <tr key={food.id}>
                        <td className="food-name">{food.name}</td>
                        <td>
                          <span className={`rec-text rec-${food.recommendation}`}>
                            <span
                              className={`rule-dot ${getRecDotClass(food.recommendation)}`}
                            />
                            {food.recommendation}
                          </span>
                        </td>
                        <td className="food-category">{food.category}</td>
                        <td className={`food-notes ${!food.notes ? 'is-empty' : ''}`}>
                          {food.notes ?? '—'}
                        </td>
                        <td>
                          <div
                            className="meal-hover-menu"
                            ref={isDropdownOpen ? dropdownRef : undefined}
                            onMouseEnter={() => setOpenRowDropdownId(food.id)}
                            onMouseLeave={() =>
                              setOpenRowDropdownId((prev) =>
                                prev === food.id ? null : prev
                              )
                            }
                          >
                            <button
                              type="button"
                              className="add-meal-btn"
                              aria-haspopup="menu"
                              aria-expanded={isDropdownOpen}
                              onClick={() =>
                                setOpenRowDropdownId(isDropdownOpen ? null : food.id)
                              }
                            >
                              <Plus size={14} />
                              <span>Adicionar a uma refeição</span>
                              <ChevronDown size={13} className="add-meal-chevron" />
                            </button>

                            {isDropdownOpen && (
                              <div className="row-dropdown-wrap">
                                <div className="row-dropdown" role="menu">
                                  <div className="row-dropdown-header">Escolha a refeição</div>
                                  {meals.length === 0 ? (
                                    <button
                                      type="button"
                                      className="row-dropdown-item"
                                      onClick={() => handleQuickAdd(food)}
                                    >
                                      <Plus size={13} />
                                      Criar &quot;Minha refeição&quot;
                                    </button>
                                  ) : (
                                    meals.map((meal) => (
                                      <button
                                        key={meal.id}
                                        type="button"
                                        role="menuitem"
                                        className="row-dropdown-item"
                                        onClick={() => handleQuickAdd(food, meal.id)}
                                      >
                                        <span>{meal.name}</span>
                                        <span className="row-dropdown-count">
                                          {meal.foodIds.length}
                                        </span>
                                      </button>
                                    ))
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        </>
      ) : (
        <section className="builder-layout">
          <aside className="ingredients-panel">
            <div className="panel-header">
              <h2 className="panel-title">Ingredientes</h2>
              <span className="results-meta">{builderFoods.length} itens</span>
            </div>

            <div className="search-wrap">
              <Search size={15} className="search-icon" />
              <input
                type="text"
                className="search-input compact"
                placeholder="Buscar ingrediente..."
                value={builderSearch}
                onChange={(e) => setBuilderSearch(e.target.value)}
              />
              {builderSearch && (
                <button
                  type="button"
                  className="clear-btn"
                  onClick={() => setBuilderSearch('')}
                  aria-label="Limpar busca de ingrediente"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="builder-subfilters">
              <select
                className="compact-select"
                aria-label="Filtrar ingredientes por recomendação"
                value={builderRecFilter}
                onChange={(e) =>
                  setBuilderRecFilter(e.target.value as RecommendationFilter)
                }
              >
                <option value="Todos">Todas recomendações</option>
                <option value="Permitido">Permitido ({countsByRec.Permitido})</option>
                <option value="Moderado">Moderado ({countsByRec.Moderado})</option>
                <option value="Não permitido">
                  Não permitido ({countsByRec['Não permitido']})
                </option>
              </select>

              <select
                className="compact-select"
                aria-label="Filtrar ingredientes por descrição"
                value={builderCategoryFilter}
                onChange={(e) => setBuilderCategoryFilter(e.target.value)}
              >
                <option value="Todas">Todas descrições</option>
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="builder-target-bar">
              <label htmlFor="builder-active-meal" className="builder-target-label">
                Adicionar com <strong>+</strong> em:
              </label>
              <select
                id="builder-active-meal"
                className="compact-select builder-target-select"
                value={activeMealId}
                onChange={(e) => setActiveMealId(e.target.value)}
                disabled={meals.length === 0}
              >
                {meals.length === 0 ? (
                  <option value="">Criar nova refeição</option>
                ) : (
                  meals.map((meal) => (
                    <option key={meal.id} value={meal.id}>
                      {meal.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="ingredients-list">
              {builderFoods.length === 0 ? (
                <div className="empty-state" style={{ padding: '24px 8px' }}>
                  Nenhum ingrediente encontrado.
                </div>
              ) : (
                builderFoods.map((food) => (
                  <div
                    key={food.id}
                    className="draggable-item"
                    draggable
                    onDragStart={(e) => handleDragStart(e, food.id)}
                  >
                    <div className="draggable-left">
                      <GripVertical size={15} className="drag-handle" />
                      <div className="draggable-info">
                        <div className="draggable-name" title={food.name}>
                          {food.name}
                        </div>
                        <div className="draggable-meta">
                          <span
                            className={`rule-dot ${getRecDotClass(food.recommendation)}`}
                          />
                          <span>{food.recommendation}</span>
                          <span className="meta-sep">•</span>
                          <span>{food.category}</span>
                        </div>
                      </div>
                    </div>

                    <div className="draggable-actions">
                      <button
                        type="button"
                        className="icon-btn add"
                        onClick={() => handleQuickAdd(food)}
                        title={`Adicionar em ${activeMealName ?? 'refeição'}`}
                        aria-label={`Adicionar ${food.name}`}
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>

          <div className="meals-column">
            <div className="meals-toolbar">
              <form className="new-meal-form" onSubmit={handleCreateMeal}>
                <input
                  type="text"
                  className="new-meal-input"
                  placeholder="Nome da nova refeição (ex: Lanche da tarde, Ceia)..."
                  value={newMealName}
                  onChange={(e) => setNewMealName(e.target.value)}
                />
                <button type="submit" className="primary-btn">
                  <Plus size={16} />
                  Criar refeição
                </button>
              </form>

              <div className="day-summary">
                <div className="summary-stats">
                  <span>
                    <strong>{meals.length}</strong> refeições •{' '}
                    <strong>{dayStats.totalItems}</strong> ingredientes
                  </span>

                  {dayStats.moderateCount > 1 && (
                    <span className="inline-alert amber">
                      <AlertTriangle size={14} />
                      {dayStats.moderateCount} itens moderados hoje (limite: 1/dia)
                    </span>
                  )}

                  {dayStats.forbiddenCount > 0 && (
                    <span className="inline-alert red">
                      <AlertTriangle size={14} />
                      {dayStats.forbiddenCount}{' '}
                      {dayStats.forbiddenCount === 1
                        ? 'item não permitido'
                        : 'itens não permitidos'}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  className="secondary-btn"
                  onClick={handleCopySummary}
                >
                  <Copy size={14} />
                  Copiar cardápio
                </button>
              </div>
            </div>

            {meals.length === 0 ? (
              <div className="table-card empty-state">
                Crie sua primeira refeição acima para começar a montar o dia.
              </div>
            ) : (
              <div className="meals-grid">
                {meals.map((meal, mealIndex) => {
                  const isActive = meal.id === activeMealId;
                  const isDragOver = dragOverMealId === meal.id;
                  const isDragging = draggingMealId === meal.id;

                  return (
                    <div
                      key={meal.id}
                      className={`meal-card ${isActive ? 'is-active' : ''} ${
                        isDragOver ? 'is-drag-over' : ''
                      } ${isDragging ? 'is-dragging' : ''}`}
                      draggable={editingMealId !== meal.id}
                      onDragStart={(e) => handleMealDragStart(e, meal.id)}
                      onDragEnd={() => {
                        setDraggingMealId(null);
                        setDragOverMealId(null);
                      }}
                      onClick={() => setActiveMealId(meal.id)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = draggingMealId ? 'move' : 'copy';
                        if (dragOverMealId !== meal.id) setDragOverMealId(meal.id);
                      }}
                      onDragLeave={() => {
                        if (dragOverMealId === meal.id) setDragOverMealId(null);
                      }}
                      onDrop={(e) => handleDropOnMeal(e, meal.id)}
                    >
                      <div className="meal-card-header">
                        <div className="meal-title-wrap">
                          <GripVertical
                            size={15}
                            className="meal-drag-icon"
                            aria-hidden="true"
                          />
                          {editingMealId === meal.id ? (
                            <input
                              type="text"
                              className="meal-rename-input"
                              value={editingMealName}
                              autoFocus
                              onChange={(e) => setEditingMealName(e.target.value)}
                              onBlur={() => commitRenameMeal(meal.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') commitRenameMeal(meal.id);
                                if (e.key === 'Escape') setEditingMealId(null);
                              }}
                            />
                          ) : (
                            <h3
                              className="meal-title"
                              onDoubleClick={() => startRenameMeal(meal)}
                              title="Clique duas vezes para renomear ou arraste para reordenar"
                            >
                              {meal.name}
                            </h3>
                          )}
                        </div>

                        <div className="draggable-actions">
                          <button
                            type="button"
                            className="icon-btn"
                            disabled={mealIndex === 0}
                            onClick={(e) => {
                              e.stopPropagation();
                              moveMeal(meal.id, -1);
                            }}
                            aria-label="Mover refeição para antes"
                            title="Mover para antes"
                          >
                            <ChevronLeft size={14} />
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            disabled={mealIndex === meals.length - 1}
                            onClick={(e) => {
                              e.stopPropagation();
                              moveMeal(meal.id, 1);
                            }}
                            aria-label="Mover refeição para depois"
                            title="Mover para depois"
                          >
                            <ChevronRight size={14} />
                          </button>
                          {editingMealId === meal.id ? (
                            <button
                              type="button"
                              className="icon-btn add"
                              onClick={() => commitRenameMeal(meal.id)}
                              aria-label="Salvar nome"
                            >
                              <Check size={14} />
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="icon-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                startRenameMeal(meal);
                              }}
                              aria-label="Renomear refeição"
                              title="Renomear"
                            >
                              <Pencil size={13} />
                            </button>
                          )}

                          <button
                            type="button"
                            className="icon-btn danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteMeal(meal.id);
                            }}
                            aria-label="Excluir refeição"
                            title="Excluir refeição"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      <div className="meal-items">
                        {meal.foodIds.length === 0 ? (
                          <div className="meal-empty">
                            Arraste ingredientes para cá ou clique no + ao lado
                          </div>
                        ) : (
                          meal.foodIds.map((foodId, index) => {
                            const food = foodMap.get(foodId);
                            if (!food) return null;
                            return (
                              <div
                                key={`${meal.id}-${foodId}-${index}`}
                                className="meal-food-chip"
                              >
                                <div className="meal-food-info">
                                  <div className="meal-food-name">{food.name}</div>
                                  <div className="meal-food-sub">
                                    <span
                                      className={`rule-dot ${getRecDotClass(
                                        food.recommendation
                                      )}`}
                                    />
                                    <span>{food.recommendation}</span>
                                    <span className="meta-sep">•</span>
                                    <span>{food.category}</span>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  className="icon-btn danger"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeFoodFromMeal(meal.id, index);
                                  }}
                                  aria-label={`Remover ${food.name}`}
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      <Modal
        open={Boolean(migrationPrompt)}
        title="Refeições encontradas neste aparelho"
        subtitle="Você já tem refeições salvas na nuvem e também montou itens neste navegador antes de entrar. Como prefere continuar?"
        closeDisabled
      >
        <div className="migration-actions">
          <button
            type="button"
            className="pill-submit-btn"
            onClick={() => handleResolveMigration('merge')}
          >
            Mesclar tudo (não perder nada)
          </button>
          <button
            type="button"
            className="secondary-btn migration-alt-btn"
            onClick={() => handleResolveMigration('cloud')}
          >
            Manter apenas o que está na nuvem
          </button>
          <button
            type="button"
            className="secondary-btn migration-alt-btn"
            onClick={() => handleResolveMigration('local')}
          >
            Substituir nuvem pelo deste aparelho
          </button>
        </div>
      </Modal>

      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  );
}
