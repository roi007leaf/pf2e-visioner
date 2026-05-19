/**
 * TelemetryReporter centralizes AVS START/STOP batch logs and optional debug breakdowns.
 */
import { buildBatchPerformanceReport } from './BatchPerformanceReport.js';

export class TelemetryReporter {
    constructor({ reportSink = null } = {}) {
        this.reportSink = reportSink;
        this.lastReport = null;
    }

    start(info) {
        try {
        } catch { /* noop */ }
    }

    stop(info) {
        try {
            const report = buildBatchPerformanceReport(info);
            this.lastReport = report;
            this.reportSink?.(report);
            return report;
        } catch { /* noop */ }
        return null;
    }

    debugBreakdown(breakdown) {
        return breakdown;
    }

    getLastReport() {
        return this.lastReport;
    }
}
