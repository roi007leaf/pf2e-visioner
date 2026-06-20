// Centralized message-scoped caches and deduplication structures

export const MESSAGE_CACHE_ENTRY_LIMIT = 500;

class BoundedSet extends Set {
  constructor(limit) {
    super();
    this.limit = limit;
  }

  add(value) {
    if (this.has(value)) super.delete(value);
    super.add(value);
    this.#evictOverflow();
    return this;
  }

  #evictOverflow() {
    while (this.size > this.limit) {
      const oldest = this.values().next().value;
      super.delete(oldest);
    }
  }
}

class BoundedMap extends Map {
  constructor(limit) {
    super();
    this.limit = limit;
  }

  set(key, value) {
    if (this.has(key)) super.delete(key);
    super.set(key, value);
    this.#evictOverflow();
    return this;
  }

  #evictOverflow() {
    while (this.size > this.limit) {
      const oldest = this.keys().next().value;
      super.delete(oldest);
    }
  }
}

const createMessageSet = () => new BoundedSet(MESSAGE_CACHE_ENTRY_LIMIT);
const createMessageMap = () => new BoundedMap(MESSAGE_CACHE_ENTRY_LIMIT);

export const processedMessages = createMessageSet();

// Seek: messageId -> Array<{ targetId: string, oldVisibility: string }>
export const appliedSeekChangesByMessage = createMessageMap();

// Hide: messageId -> Array<{ observerId: string, oldVisibility: string }>
export const appliedHideChangesByMessage = createMessageMap();

// Sneak: messageId -> Array<{ observerId: string, oldVisibility: string }>
export const appliedSneakChangesByMessage = createMessageMap();

// Create a Diversion: messageId -> Array<{ observerId: string, oldVisibility: string }>
export const appliedDiversionChangesByMessage = createMessageMap();

// Consequences: messageId -> Array<{ observerId: string, oldVisibility: string }>
export const appliedConsequencesChangesByMessage = createMessageMap();

// Point Out: messageId -> Array<{ allyId: string, targetTokenId: string, oldVisibility: string }>
export const appliedPointOutChangesByMessage = createMessageMap();

// Take Cover: messageId -> Array<{ observerId: string, oldCover: string }>
export const appliedTakeCoverChangesByMessage = createMessageMap();
