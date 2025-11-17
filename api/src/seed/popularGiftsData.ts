// api/src/seed/popularGiftsData.ts
// =======================================================
// Ten plik tylko RE-EKSportuje dane z katalogu shared.
// Musimy używać ścieżki względnej, bo aliasy @shared
// nie działają po kompilacji w Node.js / GitHub Actions.
// =======================================================

// ŚCIEŻKA: api/src/seed → src → api → (root) → shared
// czyli: ../../../shared/popularGiftsData

import popularGiftsData, { type PopularGift } from "../../../shared/popularGiftsData";

// eksport typu (dla TypeScript)
export type { PopularGift };

// eksport nazwany (używany np. jako popularGiftsData)
export { popularGiftsData };

// eksport domyślny (używany jako import popularGiftsData from ...)
export default popularGiftsData;
