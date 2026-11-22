import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  GripVertical,
  ListFilter,
  Pencil,
  Plus,
  Search,
  Trash2,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { CATEGORIES, FOODS } from './data/foods';
import { FoodItem, Meal, Recommendation } from './types';

type ActiveTab = 'tabela' | 'refeicoes';
type RecommendationFilter = 'Todos' | Recommendation;

const STORAGE_KEY = 'dieta-fase1-meals-v1';

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

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('tabela');
  const [search, setSearch] = useState('');
  const [recFilter, setRecFilter] = useState<RecommendationFilter>('Todos');
  const [categoryFilter, setCategoryFilter] = useState<string>('Todas');

  const [meals, setMeals] = useState<Meal[]>(loadMeals);
  const [activeMealId, setActiveMealId] = useState<string>(() => loadMeals()[0]?.id ?? '');
  const [newMealName, setNewMealName] = useState('');
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [editingMealName, setEditingMealName] = useState('');
  const [dragOverMealId, setDragOverMealId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(meals));
    } catch {
      // Ignore storage quota errors
    }
  }, [meals]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

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

  const filteredFoods = useMemo(() => {
    const query = normalizeText(search.trim());
    return FOODS.filter((food) => {
      if (recFilter !== 'Todos' && food.recommendation !== recFilter) return false;
      if (categoryFilter !== 'Todas' && food.category !== categoryFilter) return false;
      if (!query) return true;
      const haystack = normalizeText(
        `${food.name} ${food.category} ${food.notes ?? ''}`
      );
      return haystack.includes(query);
    });
  }, [search, recFilter, categoryFilter]);

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

  function handleQuickAddFromTable(food: FoodItem) {
    if (meals.length === 0) {
      const id = `meal-${Date.now()}`;
      setMeals([{ id, name: 'Minha refeição', foodIds: [food.id] }]);
      setActiveMealId(id);
      showToast(`${food.name} adicionado em "Minha refeição"`);
      return;
    }
    const targetId = meals.some((m) => m.id === activeMealId)
      ? activeMealId
      : meals[0].id;
    addFoodToMeal(targetId, food.id);
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
    e.dataTransfer.setData('text/plain', foodId);
    e.dataTransfer.effectAllowed = 'copy';
  }

  function handleDropOnMeal(e: React.DragEvent, mealId: string) {
    e.preventDefault();
    setDragOverMealId(null);
    const foodId = e.dataTransfer.getData('text/plain');
    if (foodId) {
      addFoodToMeal(mealId, foodId);
    }
  }

  const activeMealName =
    meals.find((m) => m.id === activeMealId)?.name ?? meals[0]?.name;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <span className="brand-eyebrow">Dieta Fase 1 • 15 Dias</span>
          <h1 className="app-title">Guia de Alimentos & Refeições</h1>
          <p className="app-subtitle">
            Baseado na tabela de Teco Mendes Nutricionista ({FOODS.length} alimentos)
          </p>
        </div>

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
      </header>

      <section className="rules-strip" aria-label="Regras da Fase 1">
        <div className="rule-card">
          <span className="rule-dot green" />
          <span>
            <strong>Permitido:</strong> Consumo livre, em qualquer horário do dia
          </span>
        </div>
        <div className="rule-card">
          <span className="rule-dot amber" />
          <span>
            <strong>Moderado:</strong> Escolher apenas 1 opção e consumir uma vez no dia
          </span>
        </div>
        <div className="rule-card">
          <span className="rule-dot red" />
          <span>
            <strong>Não permitido:</strong> Evitar durante os 15 dias da Fase 1
          </span>
        </div>
      </section>

      <section className="filters-card" aria-label="Filtros">
        <div className="filters-top">
          <div className="search-wrap">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="Buscar alimento ou observação (ex: queijo, café, açúcar)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                className="clear-btn"
                onClick={() => setSearch('')}
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
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
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

        <div className="rec-pills">
          <div className="pill-group" role="group" aria-label="Filtrar por recomendação">
            {(
              [
                ['Todos', FOODS.length],
                ['Permitido', countsByRec.Permitido],
                ['Moderado', countsByRec.Moderado],
                ['Não permitido', countsByRec['Não permitido']],
              ] as const
            ).map(([label, count]) => (
              <button
                key={label}
                type="button"
                className={`rec-pill ${
                  recFilter === label
                    ? label === 'Todos'
                      ? 'active-all'
                      : `active-${label}`
                    : ''
                }`}
                onClick={() => setRecFilter(label)}
              >
                {label} ({count})
              </button>
            ))}
          </div>

          <span className="results-meta">
            Mostrando <strong>{filteredFoods.length}</strong> de {FOODS.length} itens
          </span>
        </div>
      </section>

      {activeTab === 'tabela' ? (
        <section className="table-card">
          {filteredFoods.length === 0 ? (
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
                {filteredFoods.map((food) => (
                  <tr key={food.id}>
                    <td className="food-name">{food.name}</td>
                    <td>
                      <span className={`badge badge-${food.recommendation}`}>
                        {food.recommendation}
                      </span>
                    </td>
                    <td className="food-category">{food.category}</td>
                    <td className="food-notes">{food.notes ?? '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="quick-add-btn"
                        onClick={() => handleQuickAddFromTable(food)}
                        title={
                          activeMealName
                            ? `Adicionar em ${activeMealName}`
                            : 'Criar refeição e adicionar'
                        }
                      >
                        <Plus size={14} />
                        {activeMealName ? activeMealName : 'Adicionar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : (
        <section className="builder-layout">
          <aside className="ingredients-panel">
            <div className="panel-header">
              <h2 className="panel-title">Ingredientes</h2>
              <span className="results-meta">{filteredFoods.length} itens</span>
            </div>
            <p className="panel-hint">
              Arraste um ingrediente para uma refeição ao lado ou clique no <strong>+</strong> para adicionar em{' '}
              <strong>{activeMealName ?? 'uma refeição'}</strong>.
            </p>

            <div className="ingredients-list">
              {filteredFoods.length === 0 ? (
                <div className="empty-state" style={{ padding: '24px 8px' }}>
                  Nenhum ingrediente encontrado.
                </div>
              ) : (
                filteredFoods.map((food) => (
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
                        <div className="draggable-cat">{food.category}</div>
                      </div>
                    </div>

                    <div className="draggable-actions">
                      <span className={`badge badge-${food.recommendation}`}>
                        {food.recommendation === 'Não permitido'
                          ? 'Evitar'
                          : food.recommendation}
                      </span>
                      <button
                        type="button"
                        className="icon-btn add"
                        onClick={() => handleQuickAddFromTable(food)}
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
                    <span className="alert-pill amber">
                      <AlertTriangle size={14} />
                      {dayStats.moderateCount} itens moderados hoje (limite: 1/dia)
                    </span>
                  )}

                  {dayStats.forbiddenCount > 0 && (
                    <span className="alert-pill red">
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
                {meals.map((meal) => {
                  const isActive = meal.id === activeMealId;
                  const isDragOver = dragOverMealId === meal.id;

                  return (
                    <div
                      key={meal.id}
                      className={`meal-card ${isActive ? 'is-active' : ''} ${
                        isDragOver ? 'is-drag-over' : ''
                      }`}
                      onClick={() => setActiveMealId(meal.id)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'copy';
                        if (dragOverMealId !== meal.id) setDragOverMealId(meal.id);
                      }}
                      onDragLeave={() => {
                        if (dragOverMealId === meal.id) setDragOverMealId(null);
                      }}
                      onDrop={(e) => handleDropOnMeal(e, meal.id)}
                    >
                      <div className="meal-card-header">
                        <div className="meal-title-wrap">
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
                              title="Clique duas vezes para renomear"
                            >
                              {meal.name}
                            </h3>
                          )}
                        </div>

                        <div className="draggable-actions">
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
                                    {food.recommendation} • {food.category}
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

      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  );
}
