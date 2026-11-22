export type Recommendation = 'Permitido' | 'Moderado' | 'Não permitido';

export interface FoodItem {
  id: string;
  name: string;
  recommendation: Recommendation;
  category: string;
  notes?: string;
}

export interface Meal {
  id: string;
  name: string;
  foodIds: string[];
}
