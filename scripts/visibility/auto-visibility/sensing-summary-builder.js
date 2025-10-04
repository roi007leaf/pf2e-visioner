const PRECISE_DEFAULT = 'precise';
const IMPRECISE_DEFAULT = 'imprecise';

const DETECTION_MODE_MAPPING = {
    lightPerception: { type: 'light-perception', acuity: PRECISE_DEFAULT },
    basicSight: { type: 'vision', acuity: PRECISE_DEFAULT },
    seeInvisibility: { type: 'see-invisibility', acuity: PRECISE_DEFAULT },
    seeAll: { type: 'see-all', acuity: PRECISE_DEFAULT },
    darkvision: { type: 'darkvision', acuity: PRECISE_DEFAULT },
    greaterDarkvision: { type: 'greater-darkvision', acuity: PRECISE_DEFAULT },
    lowLightVision: { type: 'low-light-vision', acuity: PRECISE_DEFAULT },
    senseInvisibility: { type: 'sense-invisibility', acuity: PRECISE_DEFAULT },
    feelTremor: { type: 'tremorsense', acuity: IMPRECISE_DEFAULT },
    senseAll: { type: 'sense-all', acuity: PRECISE_DEFAULT },
    hearing: { type: 'hearing', acuity: IMPRECISE_DEFAULT },
};

/**
 * Normalize sense type strings to consistent lowercase dash-separated format.
 * Dedicated function keeps builder agnostic from calling context helpers.
 */
const normalizeSenseType = (type) => String(type || '').toLowerCase();

const toRange = (raw) => {
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : Infinity;
};

const ensureIndividualSenseMap = (summary) => {
    if (!summary.individualSenses) summary.individualSenses = {};
    return summary.individualSenses;
};

const createEmptySummary = () => ({
    precise: [],
    imprecise: [],
    hearing: null,
    echolocationActive: false,
    echolocationRange: 0,
    lifesense: null,
    individualSenses: {},
});

const addSense = (
    summary,
    {
        type,
        acuity = IMPRECISE_DEFAULT,
        range,
        allowOverride = false,
        isBlinded = false,
        isDeafened = false,
        isEcholocationActive = false,
        echolocationRange = 40,
    },
) => {
    if (!type) {
        if ('hearing'.includes(String(type))) throw new Error('[DEBUG] type is falsy for hearing!');
        return;
    }

    const senseType = normalizeSenseType(type);
    const normalizedRange = toRange(range);
    const normalizedAcuity = String(acuity || IMPRECISE_DEFAULT).toLowerCase();

    // Skip visual senses when blinded.
    if (
        isBlinded &&
        (senseType === 'vision' ||
            senseType === 'sight' ||
            senseType === 'darkvision' ||
            senseType === 'greater-darkvision' ||
            senseType === 'greaterdarkvision' ||
            senseType === 'low-light-vision' ||
            senseType === 'lowlightvision' ||
            senseType.includes('vision') ||
            senseType.includes('sight'))
    ) {
        if (senseType === 'hearing') throw new Error('[DEBUG] hearing blocked by vision check!');
        return;
    }

    // Skip hearing when deafened.
    if (senseType === 'hearing' && isDeafened) {
        throw new Error(`[DEBUG] hearing blocked by deafened check! isDeafened=${isDeafened}`);
    }

    const precise = summary.precise;
    const imprecise = summary.imprecise;
    const individualSenses = ensureIndividualSenseMap(summary);

    if (allowOverride) {
        const preciseIndex = precise.findIndex((s) => s.type === senseType);
        if (preciseIndex !== -1) {
            precise.splice(preciseIndex, 1);
        }

        const impreciseIndex = imprecise.findIndex((s) => s.type === senseType);
        if (impreciseIndex !== -1) {
            imprecise.splice(impreciseIndex, 1);
        }

        if (individualSenses[senseType]) {
            delete individualSenses[senseType];
        }

        if (senseType === 'hearing') {
            summary.hearing = null;
        } else if (senseType === 'lifesense') {
            summary.lifesense = null;
        }
    }

    // Prevent duplicates unless overriding.
    const alreadyPresent =
        (!allowOverride && precise.some((s) => s.type === senseType && s.range === normalizedRange)) ||
        (!allowOverride && imprecise.some((s) => s.type === senseType && s.range === normalizedRange));

    if (alreadyPresent) {
        return;
    }

    const entry = { type: senseType, range: normalizedRange };
    let finalAcuity = normalizedAcuity;

    if (senseType === 'hearing' && isEcholocationActive) {
        finalAcuity = PRECISE_DEFAULT;
        entry.range = echolocationRange || normalizedRange;
    }

    if (senseType === 'echolocation' && finalAcuity !== PRECISE_DEFAULT) {
        finalAcuity = PRECISE_DEFAULT;
    }

    if (senseType === 'hearing') {
        throw new Error(`[FINAL] About to set hearing: finalAcuity=${finalAcuity}, entry.range=${entry.range}`);
    } else if (senseType === 'lifesense') {
        summary.lifesense = { acuity: finalAcuity, range: entry.range };
    } else {
        individualSenses[senseType] = { acuity: finalAcuity, range: entry.range };
    }

    if (senseType !== 'hearing') {
        if (finalAcuity === PRECISE_DEFAULT) {
            precise.push(entry);
        } else {
            imprecise.push(entry);
        }
    }
};

const detectEcholocationState = (actor) => {
    const state = {
        active: false,
        range: 0,
    };

    try {
        const effects =
            actor.itemTypes?.effect ?? actor.items?.filter?.((i) => i?.type === 'effect') ?? [];
        const hasEffect = effects?.some?.(
            (effect) => (effect?.slug || effect?.system?.slug || effect?.name)?.toLowerCase?.() === 'effect-echolocation',
        );

        if (hasEffect) {
            state.active = true;
            state.range = 40;
            return state;
        }

        const flag = actor.getFlag?.('pf2e-visioner', 'echolocation');
        if (flag?.active) {
            state.active = true;
            state.range = Number(flag.range) || 40;
        }
    } catch (error) {
        void error;
    }

    return state;
};

const processDetectionModes = ({
    summary,
    detectionModes,
    isBlinded,
    isDeafened,
    echolocationState,
}) => {
    if (!detectionModes) return;

    for (const [modeId, modeData] of Object.entries(detectionModes)) {
        if (!modeData?.enabled || modeData.range <= 0) continue;

        const mapping = DETECTION_MODE_MAPPING[modeId];
        const type = mapping?.type || modeId;
        const acuity = modeData.acuity?.trim?.() || mapping?.acuity || IMPRECISE_DEFAULT;

        addSense(summary, {
            type,
            acuity,
            range: modeData.range,
            isBlinded,
            isDeafened,
            isEcholocationActive: echolocationState.active,
            echolocationRange: echolocationState.range,
        });
    }
};

const processTraditionalSenses = ({
    summary,
    senses,
    token,
    isBlinded,
    isDeafened,
    echolocationState,
}) => {
    if (!senses) return;

    const appendSense = (senseType, config) => {
        if (!senseType || !config) return;
        const acuity = config?.acuity ?? config?.value;
        const range = config?.range ?? config;

        addSense(summary, {
            type: senseType,
            acuity,
            range,
            allowOverride: true,
            isBlinded,
            isDeafened,
            isEcholocationActive: echolocationState.active,
            echolocationRange: echolocationState.range,
        });
    };

    if (Array.isArray(senses)) {
        for (const sense of senses) {
            if (sense?.id && !sense?.type && !sense?.slug && !sense?.name && !sense?.label) {
                continue;
            }

            const type = sense?.type ?? sense?.slug ?? sense?.name ?? sense?.label ?? sense?.id;
            const val = sense?.value ?? sense;
            const acuity = val?.acuity ?? sense?.acuity ?? val?.value;
            const range = val?.range ?? sense?.range;

            appendSense(type, { acuity, range });
        }
        return;
    }

    if (typeof senses === 'object') {
        for (const [type, obj] of Object.entries(senses)) {
            appendSense(type, obj);
        }
    }

    void token;
};

const ensureBasicVision = ({ summary, actor, isBlinded }) => {
    if (isBlinded) return;
    const hasVisualSense = summary.precise.some((sense) =>
        sense.type === 'vision' ||
        sense.type === 'sight' ||
        sense.type === 'basic-sight' ||
        sense.type === 'darkvision' ||
        sense.type === 'greater-darkvision' ||
        sense.type === 'low-light-vision',
    );

    if (!hasVisualSense && actor?.system?.perception?.vision !== false && summary.precise.length === 0) {
        addSense(summary, {
            type: 'vision',
            acuity: PRECISE_DEFAULT,
            range: Infinity,
            isBlinded,
            isDeafened: false,
        });
    }
};

export function buildSensingSummary({
    token,
    actor,
    senses,
    detectionModes,
    isBlinded,
    isDeafened,
}) {
    const summary = createEmptySummary();
    if (!actor) return summary;

    const echolocationState = detectEcholocationState(actor);
    summary.echolocationActive = echolocationState.active;
    summary.echolocationRange = echolocationState.range;

    processDetectionModes({
        summary,
        detectionModes,
        isBlinded,
        isDeafened,
        echolocationState,
    });

    processTraditionalSenses({
        summary,
        senses,
        token,
        isBlinded,
        isDeafened,
        echolocationState,
    });

    ensureBasicVision({ summary, actor, isBlinded });

    return summary;
}

export function registerManualSense(summary, { type, range, acuity = PRECISE_DEFAULT }) {
    addSense(summary, {
        type,
        range,
        acuity,
        allowOverride: true,
    });
}

export function applyLegacySense(summary, { type, range }) {
    addSense(summary, {
        type,
        range,
        acuity: PRECISE_DEFAULT,
    });
}
