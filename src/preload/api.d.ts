import type { ApiBela } from '../shared/api'

declare global {
  interface Window {
    bela: ApiBela
  }
}
