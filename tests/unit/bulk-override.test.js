import { describe, expect, it } from '@jest/globals';

// Minimal mock of BaseActionDialog focusing on bulk override behavior
class MockDialog {
    constructor(outcomes) {
        this.outcomes = outcomes;
        this.bulkActionState = 'initial';
    }
    visibilityConfig(s) { return { value: s, icon: '', label: s, cssClass: `vis-${s}` }; }
    _buildBulkOverrideStates() {
        const states = ['observed', 'concealed', 'hidden', 'undetected'];
        return states.map(s => ({ value: s, ...this.visibilityConfig(s) }));
    }
    markInitialSelections() { /* noop for test */ }
    updateChangesCount() { /* noop for test */ }
    updateBulkActionButtons() { /* noop for test */ }
    getOutcomeTokenId(o) { return o?.target?.id || o?.token?.id; }
    _onBulkOverrideSet(event) {
        const state = event.currentTarget?.dataset?.state;
        if (!state || !Array.isArray(this.outcomes)) return;
        for (const o of this.outcomes) {
            const tokenId = this.getOutcomeTokenId(o);
            if (!tokenId && !o._isWall) continue;
            const oldState = o.oldVisibility ?? o.currentVisibility ?? null;
            o.overrideState = state;
            o.hasActionableChange = oldState != null && state !== null && state !== oldState;
            if (o.hasActionableChange) o.hasRevertableChange = true;
        }
        this.markInitialSelections();
        this.updateChangesCount();
        this.updateBulkActionButtons();
    }
    _onBulkOverrideClear() {
        if (!Array.isArray(this.outcomes)) return;
        for (const o of this.outcomes) {
            o.overrideState = null;
            const effective = o.newVisibility;
            const oldState = o.oldVisibility ?? o.currentVisibility ?? null;
            o.hasActionableChange = oldState != null && effective != null && effective !== oldState;
            if (!o.hasActionableChange) o.hasRevertableChange = false;
        }
        this.markInitialSelections();
        this.updateChangesCount();
        this.updateBulkActionButtons();
    }
}

describe('Bulk Override Logic', () => {
    const mkEvent = (state) => ({ currentTarget: { dataset: { state } } });

    it('sets overrideState and actionable flags for all outcomes', () => {
        const outcomes = [
            { target: { id: 'a' }, oldVisibility: 'observed', newVisibility: 'hidden', overrideState: null },
            { target: { id: 'b' }, oldVisibility: 'concealed', newVisibility: 'hidden', overrideState: null },
        ];
        const dlg = new MockDialog(outcomes);
        dlg._onBulkOverrideSet(mkEvent('hidden'));
        expect(outcomes.every(o => o.overrideState === 'hidden')).toBe(true);
        expect(outcomes[0].hasActionableChange).toBe(true); // observed -> hidden
        expect(outcomes[1].hasActionableChange).toBe(true); // concealed -> hidden
    });

    it('clears overrideState and recomputes actionable flags', () => {
        const outcomes = [
            { target: { id: 'a' }, oldVisibility: 'observed', newVisibility: 'hidden', overrideState: 'hidden', hasActionableChange: true },
            { target: { id: 'b' }, oldVisibility: 'concealed', newVisibility: 'concealed', overrideState: 'hidden', hasActionableChange: true },
        ];
        const dlg = new MockDialog(outcomes);
        dlg._onBulkOverrideClear();
        expect(outcomes.every(o => o.overrideState === null)).toBe(true);
        // First remains actionable because calculated change still differs
        expect(outcomes[0].hasActionableChange).toBe(true);
        // Second no longer actionable because newVisibility matches old
        expect(outcomes[1].hasActionableChange).toBe(false);
    });
});
