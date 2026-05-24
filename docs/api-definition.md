# PF2E Visioner API Definition

External modules can access the API after Foundry `ready`:

```js
const visioner = game.modules.get('pf2e-visioner')?.api;
```

TypeScript-style definition:

```ts
type TokenId = string;
type TokenLike = Token | TokenDocument | Combatant | string;
type ActorLike = Token | Actor | string;

type VisibilityState = 'observed' | 'concealed' | 'hidden' | 'undetected';
type CoverState = 'none' | 'lesser' | 'standard' | 'greater';

type DetectionState = 'observed' | 'hidden' | 'undetected';
type AwarenessState = 'unnoticed' | null;

interface PerceptionProfile {
  detectionState: DetectionState;
  hasConcealment: boolean;
  coverState: CoverState;
  detectionSense: string | null;
  awarenessState: AwarenessState;
}

type PerceptionProfileInput =
  | VisibilityState
  | 'unnoticed'
  | {
      state?: VisibilityState | 'unnoticed';
      detectionState?: DetectionState | 'concealed' | 'unnoticed';
      hasConcealment?: boolean;
      coverState?: CoverState;
      detectionSense?: string | null;
      awarenessState?: AwarenessState;
      [key: string]: unknown;
    };

type PerceptionProfileMap = Record<TokenId, PerceptionProfileInput>;

interface VisibilityWriteOptions {
  skipEphemeralUpdate?: boolean;
  direction?: 'observer_to_target' | 'target_to_observer';
  skipCleanup?: boolean;
  isAutomatic?: boolean;
  preserveEncounterUnnoticed?: boolean;
}

interface AutoCoverOptions {
  rawPrereq?: boolean;
  forceRecalculate?: boolean;
}

interface BulkVisibilityUpdate {
  observerId: TokenId;
  targetId: TokenId;
  state: VisibilityState;
}

interface AvsOverrideSummary {
  observerId: TokenId;
  targetId: TokenId;
  observerName?: string;
  targetName?: string;
  observerImg?: string | null;
  targetImg?: string | null;
  state: VisibilityState | 'unnoticed';
  source?: string;
  hasCover?: boolean;
  hasConcealment?: boolean;
  expectedCover?: CoverState;
  timestamp?: number;
}

interface MovementPerformanceSnapshot {
  active: boolean;
  currentSession: unknown | null;
  totals: Record<string, number>;
  [key: string]: unknown;
}

interface Pf2eVisionerAutoVisibilityApi {
  enable(): unknown;
  disable(): unknown;
  recalculateAll(force?: boolean): unknown;
  updateTokens(tokens: Token[]): unknown;
  calculateVisibility(observer: Token, target: Token): unknown;

  getPerceptionProfile(observerId: TokenId, targetId: TokenId): PerceptionProfile | null;
  getPerceptionProfileMap(observerId: TokenId): Record<TokenId, PerceptionProfile>;
  setPerceptionProfile(
    observerId: TokenId,
    targetId: TokenId,
    profile: PerceptionProfileInput,
    options?: VisibilityWriteOptions,
  ): Promise<boolean>;
  setPerceptionProfileMap(
    observerId: TokenId,
    profileMap: PerceptionProfileMap,
    options?: VisibilityWriteOptions,
  ): Promise<boolean>;

  getMovementPerformanceSnapshot(): MovementPerformanceSnapshot;
  debugPendingMovementVisualRefresh(enabled?: boolean): boolean;
  debugMovementPerformanceDiagnostics(enabled?: boolean): boolean;

  clearLightCache(): void;
  clearVisionCache(actorId?: string | null): void;
  forceRecalculate(): void;
  testInvisibility(): void;
  resetSceneConfigFlag(): void;
  testLifesense(observerId: TokenId, targetId: TokenId): Promise<Record<string, unknown>>;
  testDarknessSources(): Array<Record<string, unknown>>;
  debugTokenLighting(observer?: Token | null, target?: Token | null): Promise<Record<string, unknown> | void>;

  setVisionMaster(
    minionToken: Token,
    masterToken: Token | null,
    mode?: 'one-way' | 'two-way' | string,
  ): Promise<void>;
  clearVisionMaster(minionToken: Token): Promise<void>;
  getVisionMaster(minionToken: Token): Token | null;
  getVisionSharingMode(token: Token): string | null;
}

interface Pf2eVisionerApi {
  autoVisibility: Pf2eVisionerAutoVisibilityApi;
  levels: unknown;

  openTokenManager(observer?: Token | null, options?: { mode?: string }): Promise<unknown>;
  openTokenManagerWithMode(observer: Token | null, mode?: string): Promise<unknown>;

  bulkSetVisibility(
    updates:
      | BulkVisibilityUpdate[]
      | Map<TokenId, Array<{ targetId: TokenId; state: VisibilityState }>>,
    options?: VisibilityWriteOptions & {
      effectTarget?: 'observer' | 'subject';
    },
  ): Promise<void>;

  getVisibility(observerId: TokenId, targetId: TokenId): VisibilityState | null;
  setVisibility(
    observerId: TokenId,
    targetId: TokenId,
    state: VisibilityState,
    options?: VisibilityWriteOptions,
  ): Promise<boolean>;

  getPerceptionProfile(observerId: TokenId, targetId: TokenId): PerceptionProfile | null;
  getPerceptionProfileMap(observerId: TokenId): Record<TokenId, PerceptionProfile>;
  setPerceptionProfile(
    observerId: TokenId,
    targetId: TokenId,
    profile: PerceptionProfileInput,
    options?: VisibilityWriteOptions,
  ): Promise<boolean>;
  setPerceptionProfileMap(
    observerId: TokenId,
    profileMap: PerceptionProfileMap,
    options?: VisibilityWriteOptions,
  ): Promise<boolean>;

  getVisibilityFactors(observerId: TokenId, targetId: TokenId): Promise<Record<string, unknown> | null>;
  updateTokenVisuals(): Promise<void>;

  getCover(observerId: TokenId, targetId: TokenId): CoverState | null;
  setCover(
    observerId: TokenId,
    targetId: TokenId,
    state: CoverState,
    options?: Record<string, unknown>,
  ): Promise<boolean>;

  refreshEveryonesPerception(): void;
  restorePartyTokens(): Promise<unknown>;

  getRollOptions(observerId: TokenId, targetId: TokenId): string[];
  addRollOptions(rollOptions: Record<string, boolean>, observerId: TokenId, targetId: TokenId): void;
  getVisibilityStates(): VisibilityState[];
  getCoverStates(): CoverState[];

  setSnipingDuoSpotter(sniperTokenOrActor: ActorLike, spotterTokenOrActor: ActorLike): Promise<boolean>;
  clearSnipingDuoSpotter(sniperTokenOrActor: ActorLike): Promise<boolean>;
  getSnipingDuoSpotter(sniperTokenOrActor: ActorLike): string | null;

  getConditionManager(): unknown;
  explainVisibility(observer: Token | TokenId, target: Token | TokenId): Promise<Record<string, unknown> | null>;

  clearAllSneakFlags(): Promise<boolean>;
  clearAllSceneData(): Promise<boolean>;
  getAutoCoverState(observer: Token | TokenId, target: Token | TokenId, options?: AutoCoverOptions): CoverState | null;
  clearAllDataForSelectedTokens(tokens?: Token[]): Promise<boolean>;

  clearAllAVSOverrides(tokens?: TokenLike | TokenLike[]): Promise<void>;
  hasAVSOverrides(token: TokenLike): boolean;
  getAVSOverrides(token: TokenLike): AvsOverrideSummary[];
}

declare const visioner: Pf2eVisionerApi | undefined;
```

Preferred v2 usage:

```js
const api = game.modules.get('pf2e-visioner')?.api;

await api.autoVisibility.setPerceptionProfile(observer.id, target.id, {
  detectionState: 'hidden',
  hasConcealment: true,
  coverState: 'standard',
});

const profile = api.autoVisibility.getPerceptionProfile(observer.id, target.id);
```

Notes:

- `detectionState` does not accept `'concealed'`; concealed is represented as `{ detectionState: 'observed', hasConcealment: true }`.
- `'unnoticed'` is represented as `{ detectionState: 'undetected', awarenessState: 'unnoticed' }`.
- Passing legacy strings to `setPerceptionProfile` is accepted and normalized, but new integrations should send profile objects.
- `setVisibility` remains for compatibility and writes through the v2 store internally.
