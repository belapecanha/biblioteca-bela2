export const GENEROS = [
  'Romance',
  'Fantasia',
  'Ficção científica',
  'Mistério',
  'Suspense',
  'Terror',
  'Thriller psicológico',
  'Aventura',
  'Drama',
  'Ficção histórica',
  'Romance policial',
  'Distopia',
  'Comédia / Humor',
  'Biografia e autobiografia',
  'Desenvolvimento pessoal',
  'Filosofia',
  'História',
  'Política',
  'Economia e finanças',
  'Divulgação científica'
] as const

export const TEMAS = [
  'Romantasia',
  'Dark Romance',
  'Enemies to Lovers',
  'Friends to Lovers',
  'Slow Burn',
  'Fake Dating',
  'Forbidden Romance',
  'Second Chance Romance',
  'Sports Romance',
  'College Romance',
  'Romance de Época',
  'Paranormal Romance',
  'High Fantasy',
  'Urban Fantasy',
  'Dark Academia',
  'Psychological Thriller',
  'Cozy Mystery'
] as const

export const MOODS = [
  'Cozy',
  'Dark',
  'Leve',
  'Emocionante',
  'Devastador',
  'Romântico',
  'Divertido',
  'Tenso',
  'Misterioso',
  'Arrepiante',
  'Mágico',
  'Whimsical',
  'Aventureiro',
  'Épico',
  'Melancólico',
  'Nostálgico',
  'Esperançoso',
  'Reflexivo',
  'Imersivo',
  'Angustiante'
] as const

export type TipoClassificacao = 'genero' | 'tema' | 'mood'

export const LISTAS_CLASSIFICACAO: Record<TipoClassificacao, readonly string[]> = {
  genero: GENEROS,
  tema: TEMAS,
  mood: MOODS
}
