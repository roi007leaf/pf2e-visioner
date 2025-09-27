/**
 * Modern CSS styles for the chat automation system
 * Provides styling for automation panels and preview dialogs
 */

/**
 * Initialize and inject CSS styles for chat automation
 */
export function injectChatAutomationStyles() {
    // Re-enable CSS injection for chat automation styles
    const css = getChatAutomationCSS();

    // Check if styles are already injected
    if (document.getElementById('pf2e-visioner-chat-styles')) {
        return;
    }

    // Create and inject style element
    const style = document.createElement('style');
    style.id = 'pf2e-visioner-chat-styles';
    style.textContent = css;
    document.head.appendChild(style);

    // Add event listener to fix scrolling in dialogs
    Hooks.on('renderApplication', (app, html, data) => {
        if (app.constructor.name.includes('PreviewDialog')) {
            fixDialogScrolling(html);
        }
    });
}

/**
 * Re-inject chat automation styles (for colorblind mode changes)
 */
export function reinjectChatAutomationStyles() {
    // Remove existing styles
    const existingStyle = document.getElementById('pf2e-visioner-chat-styles');
    if (existingStyle) {
        existingStyle.remove();
    }

    // Re-inject with updated styles
    const css = getChatAutomationCSS();
    const style = document.createElement('style');
    style.id = 'pf2e-visioner-chat-styles';
    style.textContent = css;
    document.head.appendChild(style);
}

/**
 * Fix scrolling in dialog containers
 * @param {jQuery} html - The rendered HTML of the dialog
 */
function fixDialogScrolling(html) {
    // Ensure the results table container can scroll
    const container = html.find('.results-table-container');
    if (container.length) {
        // Force the container to take up available space
        container.css({
            flex: '1 1 auto',
            'overflow-y': 'auto',
            'min-height': '150px',
            'max-height': 'calc(100% - 180px)',
        });

        // Ensure the table headers are sticky
        const headers = container.find('thead th');
        if (headers.length) {
            headers.css({
                position: 'sticky',
                top: '0',
                'z-index': '2',
            });
        }
    }
}

/**
 * Get the complete CSS for chat automation
 * @returns {string} Complete CSS string
 */
function getChatAutomationCSS() {
    return `
        /* Automation Panel Styles - Base */
        .pf2e-visioner-automation-panel {
            border-radius: 8px;
            margin: 12px 0 8px 0;
            padding: 12px;
            position: relative;
            z-index: 10;
        }
        
                /* Seek Panel - Blue Theme */
        .pf2e-visioner-automation-panel.seek-panel {
            background: linear-gradient(135deg, var(--pf2e-visioner-info-light, #e3f2fd), var(--pf2e-visioner-info-lighter, #bbdefb));
            border: 2px solid var(--pf2e-visioner-info, var(--pf2e-visioner-info));
            box-shadow: 0 4px 8px rgba(44, 90, 160, 0.15);
        }
        
        /* Point Out Panel - Orange Theme */
        .pf2e-visioner-automation-panel.point-out-panel {
            background: linear-gradient(135deg, var(--pf2e-visioner-warning-light, #fff3e0), var(--pf2e-visioner-warning-lighter, #ffe0b2));
            border: 2px solid var(--pf2e-visioner-warning, var(--visibility-hidden));
            box-shadow: 0 4px 8px var(--visibility-hidden-bg-medium);
        }
        
        /* Hide Panel - Purple Theme */
        .pf2e-visioner-automation-panel.hide-panel {
            background: linear-gradient(135deg, var(--pf2e-visioner-purple-light, #f3e5f5), var(--pf2e-visioner-purple-lighter, #e1bee7));
            border: 2px solid var(--pf2e-visioner-purple, var(--pf2e-visioner-purple));
            box-shadow: 0 4px 8px rgba(142, 36, 170, 0.15);
        }
        
        /* Sneak Panel - Gray Theme */
        .pf2e-visioner-automation-panel.sneak-panel {
            background: linear-gradient(135deg, var(--pf2e-visioner-gray-light, #f8f9fa), var(--pf2e-visioner-gray-lighter, #e9ecef));
            border: 2px solid var(--pf2e-visioner-gray, var(--pf2e-visioner-gray));
            box-shadow: 0 4px 8px rgba(108, 117, 125, 0.15);
        }
        
        /* Create a Diversion Panel - Teal Theme */
        .pf2e-visioner-automation-panel.create-a-diversion-panel {
            background: linear-gradient(135deg, var(--pf2e-visioner-teal-light, #e0f7fa), var(--pf2e-visioner-teal-lighter, #b2ebf2));
            border: 2px solid var(--pf2e-visioner-teal, var(--pf2e-visioner-teal));
            box-shadow: 0 4px 8px rgba(23, 162, 184, 0.15);
        }
        
        /* Consequences Panel - Red Theme */
        .pf2e-visioner-automation-panel.consequences-panel {
            background: linear-gradient(135deg, var(--pf2e-visioner-danger-light, #ffebee), var(--pf2e-visioner-danger-lighter, #ffcdd2));
            border: 2px solid var(--pf2e-visioner-danger, var(--visibility-undetected));
            box-shadow: 0 4px 8px var(--visibility-undetected-bg-medium);
        }
        
        /* Take Cover Panel - Brown Theme */
        .pf2e-visioner-automation-panel.take-cover-panel {
            background: linear-gradient(135deg, var(--pf2e-visioner-brown-light, #efebe9), var(--pf2e-visioner-brown-lighter, #d7ccc8));
            border: 2px solid var(--pf2e-visioner-brown, var(--pf2e-visioner-brown));
            box-shadow: 0 4px 8px var(--visibility-undetected-bg-medium);
        }
        
        .automation-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
            font-weight: 600;
            color: var(--pf2e-visioner-gray);
        }
        
        .automation-actions {
            display: flex;
            gap: 8px;
            justify-content: flex-end;
        }
        
        .visioner-btn {
            border: none;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            min-height: 36px;
            text-decoration: none;
            user-select: none;
        }
        
        .visioner-btn-primary {
            background: linear-gradient(135deg, var(--pf2e-visioner-info), var(--pf2e-visioner-info));
            color: white;
        }
        
        /* Action-Specific Button Styles */
        .visioner-btn-seek {
            background: linear-gradient(135deg, var(--pf2e-visioner-info), var(--pf2e-visioner-info));
            color: white;
        }
        
        .visioner-btn-point-out {
            background: linear-gradient(135deg, var(--visibility-hidden), var(--visibility-hidden));
            color: white;
        }
        
        .visioner-btn-hide {
            background: linear-gradient(135deg, var(--pf2e-visioner-purple), var(--pf2e-visioner-purple));
            color: white;
        }
        
        .visioner-btn-sneak {
            background: linear-gradient(135deg, var(--pf2e-visioner-gray), var(--pf2e-visioner-gray));
            color: white;
        }
        
        .visioner-btn-create-a-diversion {
            background: linear-gradient(135deg, var(--pf2e-visioner-teal), var(--pf2e-visioner-teal));
            color: white;
        }
        
        .visioner-btn-consequences {
            background: linear-gradient(135deg, var(--visibility-undetected), var(--visibility-undetected));
            color: white;
        }

        .visioner-btn-take-cover {
            background: linear-gradient(135deg, var(--pf2e-visioner-brown), var(--pf2e-visioner-brown));
            color: white;
        }
        
        .visioner-btn:hover:not(:disabled) {
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        
        /* Consequences Dialog Bulk Actions */
        .consequences-preview-dialog-bulk-actions-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px;
            background: var(--color-bg-option, rgba(255, 255, 255, 0.05));
            border-top: 1px solid var(--color-border-light-primary, #555);
            margin-top: 12px;
        }
        
        .consequences-preview-dialog-bulk-actions-info {
            color: var(--color-text-primary, #f0f0f0);
            font-size: 13px;
            font-weight: 500;
        }
        
        .consequences-preview-dialog-changes-count,
        .consequences-preview-dialog-total-count {
            color: var(--visibility-undetected) !important;
            font-weight: 700 !important;
        }
        
        .consequences-preview-dialog-bulk-actions-buttons {
            display: flex;
            gap: 8px;
        }
        
        .consequences-preview-dialog-bulk-action-btn {
            padding: 8px 16px;
            border: none;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            color: white;
        }
        
        .consequences-preview-dialog-bulk-action-btn.apply-all {
            background: linear-gradient(135deg, var(--visibility-observed), var(--visibility-observed));
        }
        
        .consequences-preview-dialog-bulk-action-btn.apply-all:hover:not(:disabled) {
            background: linear-gradient(135deg, var(--visibility-observed), var(--visibility-observed));
            transform: translateY(-1px);
        }
        
        .consequences-preview-dialog-bulk-action-btn.revert-all {
            background: var(--visibility-undetected);
            border-color: var(--visibility-undetected);
            color: white;
        }
        
        .consequences-preview-dialog-bulk-action-btn.revert-all:hover:not(:disabled) {
            background: var(--visibility-undetected);
            border-color: var(--visibility-undetected);
        }
        
        .consequences-preview-dialog-bulk-action-btn:disabled {
            background: var(--pf2e-visioner-gray) !important;
            cursor: not-allowed;
            transform: none;
        }
        
        /* Unified Bulk Action Button Styles */
        .bulk-action-btn {
            padding: 8px 16px;
            border: none;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            flex-shrink: 0;
            white-space: nowrap;
        }
        
        .bulk-action-btn.apply-all {
            background: linear-gradient(135deg, var(--visibility-observed), var(--visibility-observed));
            color: white;
            border: 1px solid var(--visibility-observed);
        }
        
        .bulk-action-btn.apply-all:hover:not(:disabled) {
            background: linear-gradient(135deg, var(--visibility-observed), var(--visibility-observed));
            transform: translateY(-1px);
            box-shadow: 0 2px 8px var(--visibility-observed-bg-strong);
        }
        
        .bulk-action-btn.apply-all:disabled {
            background: linear-gradient(135deg, var(--pf2e-visioner-gray), var(--pf2e-visioner-gray));
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
            box-shadow: none;
        }
        
        .bulk-action-btn.revert-all {
            background: linear-gradient(135deg, var(--pf2e-visioner-gray), var(--pf2e-visioner-gray));
            color: white;
            border: 1px solid var(--pf2e-visioner-gray);
        }
        
        .bulk-action-btn.revert-all:hover:not(:disabled) {
            background: linear-gradient(135deg, var(--pf2e-visioner-gray), var(--pf2e-visioner-gray));
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(108, 117, 125, 0.3);
        }
        
        .bulk-action-btn.revert-all:disabled {
            background: linear-gradient(135deg, var(--pf2e-visioner-gray), var(--pf2e-visioner-gray));
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
            box-shadow: none;
        }
        
        /* Seek Preview Dialog Styles */
        .seek-preview-dialog {
            min-width: 600px;
        }
        
        .seek-preview-dialog .window-header {
            background: linear-gradient(135deg, var(--pf2e-visioner-info) 0%, var(--pf2e-visioner-info) 100%);
            color: white;
            border-bottom: 2px solid var(--pf2e-visioner-info);
        }
        
        .seek-preview-dialog .window-header .window-title {
            color: white;
            font-weight: bold;
        }
        
        .seek-preview-dialog .window-header .header-button {
            color: white;
        }
        
        .seek-preview-dialog .window-content {
            padding: 0;
            background: var(--color-bg-primary, #2a2a2a);
            color: var(--color-text-primary, #f0f0f0);
        }
        
        /* Hide Preview Dialog Styles */
        .hide-preview-dialog {
            min-width: 600px;
        }
        
        .hide-preview-dialog .window-header {
            background: linear-gradient(135deg, var(--pf2e-visioner-purple) 0%, var(--pf2e-visioner-purple) 100%);
            color: white;
            border-bottom: 2px solid var(--pf2e-visioner-purple);
        }
        
        .hide-preview-dialog .window-header .window-title {
            color: white;
            font-weight: bold;
        }
        
        .hide-preview-dialog .window-header .header-button {
            color: white;
        }
        
        .hide-preview-dialog .window-content {
            padding: 0;
            background: var(--color-bg-primary, #2a2a2a);
            color: var(--color-text-primary, #f0f0f0);
        }
        
        .hide-preview-content {
            padding: 12px;
            background: var(--color-bg-primary, #2a2a2a);
            color: var(--color-text-primary, #f0f0f0);
        }
        
        .hider-info {
            display: flex;
            align-items: center;
            margin-bottom: 4px;
            padding: 12px;
            background: var(--color-bg-option, rgba(142, 36, 170, 0.15));
            border-radius: 6px;
            border-left: 4px solid var(--pf2e-visioner-purple);
        }
        
        .hider-image img {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            border: 2px solid var(--pf2e-visioner-purple);
            margin-right: 12px;
            object-fit: cover;
            object-position: top;
        }
        
        .hider-details {
            flex: 1;
        }
        
        .hider-name {
            margin: 0 0 4px 0;
            font-size: 16px;
            font-weight: bold;
            color: var(--pf2e-visioner-purple);
        }
        
        /* Hide Dialog Table Headers - Purple Theme Override */
        .hide-results-table th {
            background: linear-gradient(135deg, var(--pf2e-visioner-purple), var(--pf2e-visioner-purple)) !important;
            color: white !important;
        }

        
        /* Hide Dialog Visibility Change Column */
        .hide-results-table .visibility-change {
            text-align: center;
            width: 115px;
            min-width: 115px;
            padding: 8px 12px;
        }
        
        /* Hide Dialog Actions Column */
        .hide-results-table .actions {
            text-align: center;
            width: 100px;
            padding: 12px;
        }
        
        .hide-results-table .row-actions {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 6px;
        }

        
        /* Hide Dialog specific styling now uses unified styles above */
        
        /* Hide Dialog Bulk Action Buttons */
        .hide-preview-dialog-bulk-action-btn {
            padding: 6px 12px !important;
            font-size: 12px !important;
            border-radius: 4px !important;
            font-weight: 500 !important;
            display: inline-flex !important;
            align-items: center !important;
            gap: 4px !important;
            cursor: pointer !important;
            transition: all 0.2s ease !important;
        }
        
        .hide-preview-dialog-bulk-action-btn.apply-all {
            background: linear-gradient(135deg, var(--visibility-observed), var(--visibility-observed)) !important;
            color: white !important;
            border: 1px solid var(--visibility-observed) !important;
        }
        
        .hide-preview-dialog-bulk-action-btn.apply-all:hover:not(:disabled) {
            background: linear-gradient(135deg, var(--visibility-observed), var(--visibility-observed)) !important;
            transform: translateY(-1px);
            box-shadow: 0 2px 8px var(--visibility-observed-bg-strong) !important;
        }
        
        .hide-preview-dialog-bulk-action-btn.revert-all {
            background: linear-gradient(135deg, var(--pf2e-visioner-gray), var(--pf2e-visioner-gray)) !important;
            color: white !important;
            border: 1px solid var(--pf2e-visioner-gray) !important;
        }
        
        .hide-preview-dialog-bulk-action-btn.revert-all:hover:not(:disabled) {
            background: linear-gradient(135deg, var(--pf2e-visioner-gray), var(--pf2e-visioner-gray)) !important;
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(108, 117, 125, 0.3) !important;
        }
        
        .hide-preview-dialog-bulk-action-btn.revert-all:disabled {
            background: linear-gradient(135deg, var(--pf2e-visioner-gray), var(--pf2e-visioner-gray)) !important;
            opacity: 0.6 !important;
            cursor: not-allowed !important;
            transform: none !important;
            box-shadow: none !important;
        }
        
        .seek-preview-content {
            padding: 12px;
            background: var(--color-bg-primary, #2a2a2a);
            color: var(--color-text-primary, #f0f0f0);
        }
        
        .seeker-info {
            display: flex;
            align-items: center;
            margin-bottom: 4px;
            padding: 12px;
            background: var(--color-bg-option, rgba(44, 90, 160, 0.15));
            border-radius: 6px;
            border-left: 4px solid var(--pf2e-visioner-info);
        }
        
        .seeker-image img {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            border: 2px solid var(--pf2e-visioner-info);
            margin-right: 12px;
            object-fit: cover;
            object-position: top;
        }
        
        .seeker-name {
            margin: 0 0 4px 0;
            color: var(--color-text-primary, #f0f0f0);
            font-size: 16px;
            font-weight: bold;
        }
        
        .hint {
            margin: 0;
            color: var(--color-text-secondary, #b0b0b0);
            font-style: italic;
            font-size: 12px;
        }
        
        /* ===== UNIFIED TABLE STYLES ===== */
        
        /* Base Results Table Container */
        .results-table-container {
            margin-bottom: 16px;
            border: 1px solid var(--color-border-light-primary, #555);
            border-radius: 6px;
            overflow: hidden;
            background: var(--color-bg-primary, #2a2a2a);
        }
        
        /* Unified Results Table Base Styles */
        .results-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
            background: var(--color-bg-primary, #2a2a2a);
            color: var(--color-text-primary, #f0f0f0);
            table-layout: fixed;
        }
        
        /* Unified Table Headers */
        .results-table thead {
            background: var(--color-bg-option, rgba(255, 255, 255, 0.1));
        }
        
        .results-table th {
            padding: 8px 6px;
            text-align: center;
            font-weight: bold;
            font-size: 12px;
            color: var(--color-text-primary, #f0f0f0);
            border-bottom: 2px solid var(--color-border-light-primary, #555);
            background: var(--color-bg-option, rgba(255, 255, 255, 0.1));
        }
        
        /* Unified Table Cells */
        .results-table td {
            padding: 8px 6px;
            text-align: center;
            border-bottom: 1px solid var(--color-border-light-tertiary, #444);
            vertical-align: middle;
            background: var(--color-bg-primary, #2a2a2a);
            color: var(--color-text-primary, #f0f0f0);
        }
        
        .results-table tbody tr:nth-child(even) td {
            background: var(--color-bg-option, rgba(255, 255, 255, 0.05));
        }
        
        /* Apply unified styles to all dialog tables */
        .seek-results-table,
        .hide-results-table,
        .point-out-results-table,
        .create-a-diversion-preview-dialog .results-table,
        .sneak-results-table,
        .consequences-results-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
            background: var(--color-bg-primary, #2a2a2a);
            color: var(--color-text-primary, #f0f0f0);
            table-layout: fixed;
        }
        
        .seek-results-table thead,
        .hide-results-table thead,
        .point-out-results-table thead,
        .create-a-diversion-preview-dialog .results-table thead,
        .sneak-results-table thead,
        .consequences-results-table thead {
            background: var(--color-bg-option, rgba(255, 255, 255, 0.1));
        }
        
        .seek-results-table th,
        .hide-results-table th,
        .point-out-results-table th,
        .create-a-diversion-preview-dialog .results-table th,
        .sneak-results-table th,
        .consequences-results-table th {
            padding: 8px 6px;
            text-align: center;
            font-weight: bold;
            font-size: 12px !important;
            color: var(--color-text-primary, #f0f0f0);
            background: var(--color-bg-option, rgba(255, 255, 255, 0.1));
        }
        
        .seek-results-table td,
        .hide-results-table td,
        .create-a-diversion-preview-dialog .results-table td,
        .sneak-results-table td,
        .consequences-results-table td {
            padding: 8px 6px;
            text-align: center;
            border-bottom: 1px solid var(--color-border-light-tertiary, #444);
            vertical-align: middle;
            background: var(--color-bg-primary, #2a2a2a);
            color: var(--color-text-primary, #f0f0f0);
        }
        
        .seek-results-table tbody tr:nth-child(even) td,
        .hide-results-table tbody tr:nth-child(even) td,
        .create-a-diversion-preview-dialog .results-table tbody tr:nth-child(even) td,
        .sneak-results-table tbody tr:nth-child(even) td,
        .consequences-results-table tbody tr:nth-child(even) td {
            background: var(--color-bg-option, rgba(255, 255, 255, 0.05));
        }

        .point-out-results-table td {
            padding: 8px 6px;
            text-align: center;
            vertical-align: middle;
        }

        .point-out-results-table tbody tr:nth-child(even) td {
            padding: 8px 6px;
            text-align: center;
            vertical-align: middle;
        }

        /* Point Out Dialog Row Hover - Orange Theme */
        .point-out-preview-dialog .results-table-container tr.row-hover,
        .point-out-preview-dialog .results-table-container tr[data-token-id].row-hover {
            outline-color: var(--pf2e-visioner-warning);
            box-shadow: inset 0 0 0 2px rgba(255, 102, 0, 0.35);
            background: rgba(255, 102, 0, 0.1) !important;
        }
        
        /* ===== UNIFIED TOKEN IMAGE STYLING ===== */
        
        /* Token Image Column Styling - Unified */
        .results-table .token-image,
        .seek-results-table .token-image,
        .hide-results-table .token-image,
        .point-out-results-table .token-image,
        .create-a-diversion-preview-dialog .results-table .token-image,
        .sneak-results-table .token-image {
            width: 50px;
            min-width: 50px;
            text-align: center;
            padding: 8px 4px;
            object-fit: cover;
            object-position: top;
        }
        
        /* Token Image Styling - Unified */
        .results-table .token-image img,
        .seek-results-table .token-image img,
        .hide-results-table .token-image img,
        .point-out-results-table .token-image img,
        .sneak-results-table .token-image img,
        .visibility-table .token-image img,
        .create-a-diversion-preview-dialog .visibility-table .token-image img,
        .cover-table .token-image img,
        .visibility-table.sneak-results-table .token-image img {
            width: 32px !important;
            height: 32px !important;
            border-radius: 4px;
            border: 1px solid var(--color-border-light-primary, #555);
            object-fit: cover;
            object-position: top;
            display: block;
            margin: 0 auto;
        }
        
        /* Force Sneak Dialog Token Image Border - High Priority */
        .sneak-preview-dialog .visibility-table .token-image img,
        .sneak-preview-dialog .sneak-results-table .token-image img,
        .sneak-preview-dialog .visibility-table.sneak-results-table .token-image img {
            border: 1px solid #555 !important;
            border-radius: 4px !important;
            width: 32px !important;
            height: 32px !important;
            box-sizing: border-box !important;
        }
        
        /* Alternative selector in case dialog class is different */
        .sneak-results-preview .visibility-table .token-image img,
        .sneak-results-preview .sneak-results-table .token-image img {
            border: 1px solid #555 !important;
            border-radius: 4px !important;
            width: 32px !important;
            height: 32px !important;
            box-sizing: border-box !important;
        }
        
        /* ===== UNIFIED ROLL VS DC STYLING ===== */
        
        /* DC Number Styling - Unified */
        .results-table .dc-value,
        .seek-results-table .dc-value,
        .hide-results-table .dc-value,
        .point-out-results-table .dc-value,
        .sneak-results-table .dc-value {
            color: var(--visibility-undetected) !important;
            font-weight: bold !important;
            font-size: 16px;
            line-height: 1.2;
        }
        
        /* Roll vs DC Column Styling - Unified */
        .results-table .roll-vs-dc,
        .seek-results-table .roll-vs-dc,
        .hide-results-table .roll-vs-dc,
        .point-out-results-table .roll-vs-dc,
        .sneak-results-table .roll-vs-dc {
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            line-height: 1.2;
        }
        
        .results-table .roll-result,
        .seek-results-table .roll-result,
        .hide-results-table .roll-result,
        .point-out-results-table .roll-result,
        .sneak-results-table .roll-result {
            text-align: center;
        }
        
        .results-table .roll-dc-line,
        .seek-results-table .roll-dc-line,
        .hide-results-table .roll-dc-line,
        .point-out-results-table .roll-dc-line,
        .sneak-results-table .roll-dc-line {
            margin: 0;
            padding: 0;
            line-height: 1.2;
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 4px;
        }
        
        .results-table .vs-text,
        .seek-results-table .vs-text,
        .hide-results-table .vs-text,
        .point-out-results-table .vs-text,
        .sneak-results-table .vs-text {
            color: var(--color-text-primary, #f0f0f0);
            font-size: 12px;
            line-height: 1.2;
        }
        
        .results-table .margin-display,
        .seek-results-table .margin-display,
        .hide-results-table .margin-display,
        .point-out-results-table .margin-display,
        .sneak-results-table .margin-display {
            font-size: 12px;
            color: var(--color-text-secondary);
            text-align: center;
            margin-top: 2px;
            display: block;
            line-height: 1.2;
        }
        
        /* Roll Total Styling - Blue - Unified */
        .results-table .roll-total,
        .seek-results-table .roll-total,
        .hide-results-table .roll-total,
        .point-out-results-table .roll-total,
        .sneak-results-table .roll-total {
            color: var(--pf2e-visioner-info) !important;
            font-weight: bold !important;
            font-size: 16px;
            line-height: 1.2;
        }
        
        /* ===== UNIFIED OUTCOME STYLING ===== */
        
        /* Outcome Base Styling - Unified */
        .results-table .outcome,
        .seek-results-table .outcome,
        .hide-results-table .outcome,
        .point-out-results-table .outcome,
        .sneak-results-table .outcome {
            text-align: center;
            font-weight: bold;
        }
        
        .results-table thead .outcome,
        .seek-results-table thead .outcome,
        .hide-results-table thead .outcome,
        .point-out-results-table thead .outcome,
        .sneak-results-table thead .outcome {
            color: inherit; /* Use default header text color */
        }
        
        /* Critical Success - Green - Unified */
        .results-table tbody td.outcome.critical-success,
        .seek-results-table tbody td.outcome.critical-success,
        .hide-results-table tbody td.outcome.critical-success,
        .point-out-results-table tbody td.outcome.critical-success,
        .create-a-diversion-preview-dialog .results-table tbody td.outcome.critical-success,
        .sneak-results-table tbody td.outcome.critical-success {
            color: var(--visibility-observed); /* Green */
        }
        
        /* Success - Blue - Unified */
        .results-table tbody td.outcome.success,
        .seek-results-table tbody td.outcome.success,
        .hide-results-table tbody td.outcome.success,
        .point-out-results-table tbody td.outcome.success,
        .create-a-diversion-preview-dialog .results-table tbody td.outcome.success,
        .sneak-results-table tbody td.outcome.success {
            color: #4a9eff; /* Blue */
        }
        
        /* Failure - Yellow/Orange - Unified */
        .results-table tbody td.outcome.failure,
        .seek-results-table tbody td.outcome.failure,
        .hide-results-table tbody td.outcome.failure,
        .point-out-results-table tbody td.outcome.failure,
        .create-a-diversion-preview-dialog .results-table tbody td.outcome.failure,
        .sneak-results-table tbody td.outcome.failure {
            color: var(--visibility-concealed); /* Yellow/orange */
        }
        
        /* Critical Failure - Red - Unified */
        .results-table tbody td.outcome.critical-failure,
        .seek-results-table tbody td.outcome.critical-failure,
        .hide-results-table tbody td.outcome.critical-failure,
        .point-out-results-table tbody td.outcome.critical-failure,
        .create-a-diversion-preview-dialog .results-table tbody td.outcome.critical-failure,
        .sneak-results-table tbody td.outcome.critical-failure {
            color: var(--visibility-undetected); /* Red */
        }
        
        /* Out of Range - Gray - Unified */
        .results-table tbody td.outcome.out-of-range,
        .seek-results-table tbody td.outcome.out-of-range,
        .hide-results-table tbody td.outcome.out-of-range,
        .point-out-results-table tbody td.outcome.out-of-range,
        .create-a-diversion-preview-dialog .results-table tbody td.outcome.out-of-range,
        .sneak-results-table tbody td.outcome.out-of-range {
            color: #888888; /* Gray */
            font-style: italic;
        }
        
        /* Unmet Conditions - Orange - Unified */
        .results-table tbody td.outcome.unmet-conditions,
        .seek-results-table tbody td.outcome.unmet-conditions,
        .hide-results-table tbody td.outcome.unmet-conditions,
        .point-out-results-table tbody td.outcome.unmet-conditions,
        .create-a-diversion-preview-dialog .results-table tbody td.outcome.unmet-conditions,
        .sneak-results-table tbody td.outcome.unmet-conditions {
            color: #ff8c00; /* Orange */
            font-style: italic;
        }

        /* Sneaky Feat Indicator */
        .sneaky-feat-indicator {
            display: block !important;
            margin-top: 4px !important;
            padding: 2px 6px !important;
            background: rgba(138, 43, 226, 0.2) !important; /* Purple background */
            border: 1px solid rgba(138, 43, 226, 0.5) !important;
            border-radius: 3px !important;
            font-size: 10px !important;
            font-weight: 600 !important;
            color: #dda0dd !important; /* Light purple text */
            text-transform: uppercase !important;
            letter-spacing: 0.5px !important;
            cursor: help !important;
        }

        .sneaky-feat-indicator i {
            margin-right: 3px !important;
            font-size: 9px !important;
        }

        /* Colorblind support for Sneaky feat indicator */
        .colorblind .sneaky-feat-indicator {
            background: rgba(255, 165, 0, 0.2) !important; /* Orange background for colorblind */
            border-color: rgba(255, 165, 0, 0.5) !important;
            color: #ffb347 !important; /* Light orange text */
        }

        /* Sneak Adept Feat Indicator */
        .sneak-adept-indicator {
            display: block !important;
            margin-top: 4px !important;
            padding: 2px 6px !important;
            background: rgba(34, 197, 94, 0.2) !important; /* Green background */
            border: 1px solid rgba(34, 197, 94, 0.5) !important;
            border-radius: 3px !important;
            font-size: 10px !important;
            font-weight: 600 !important;
            color: #86efac !important; /* Light green text */
            text-transform: uppercase !important;
            letter-spacing: 0.5px !important;
            cursor: help !important;
        }

        .sneak-adept-indicator i {
            margin-right: 3px !important;
            font-size: 9px !important;
        }

        /* Colorblind support for Sneak Adept indicator */
        .colorblind .sneak-adept-indicator {
            background: rgba(59, 130, 246, 0.2) !important; /* Blue background for colorblind */
            border-color: rgba(59, 130, 246, 0.5) !important;
            color: #93c5fd !important; /* Light blue text */
        }
        
        /* Bulk Action Buttons */
        .seek-preview-dialog-bulk-action-btn {
            padding: 6px 12px;
            border: 1px solid var(--color-border-light-primary, #555);
            border-radius: 4px;
            background: var(--color-bg-option, rgba(255, 255, 255, 0.1));
            color: var(--color-text-primary, #f0f0f0);
            cursor: pointer;
            font-size: 12px;
            font-weight: 600;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        
        .seek-preview-dialog-bulk-action-btn:hover {
            background: var(--color-bg-btn-hover, rgba(255, 255, 255, 0.2));
            transform: translateY(-1px);
        }
        
        .seek-preview-dialog-bulk-action-btn:disabled {
            opacity: 0.8;
            cursor: not-allowed;
            background: #cccccc !important;
            border-color: #cccccc !important;
            color: #666666 !important;
            transform: none !important;
        }
        
        /* Row Action Buttons */
        .row-action-btn {
            padding: 3px 6px;
            border: 1px solid var(--color-border-light-primary, #555);
            border-radius: 3px;
            background: var(--color-bg-option, rgba(255, 255, 255, 0.1));
            color: var(--color-text-primary, #f0f0f0);
            cursor: pointer;
            font-size: 10px;
            margin: 0 2px;
            transition: all 0.2s ease;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 20px;
        }
        
        .row-action-btn:hover {
            background: var(--color-bg-btn-hover, rgba(255, 255, 255, 0.2));
            transform: translateY(-1px);
        }
        
        .row-action-btn:disabled {
            opacity: 0.8;
            cursor: not-allowed;
            background: #cccccc !important;
            border-color: #cccccc !important;
            color: #666666 !important;
            transform: none !important;
        }
        
        /* Specific colors for apply and revert row buttons */
        .row-action-btn.apply-change {
            background: var(--visibility-observed);
            border-color: var(--visibility-observed);
            color: white;
        }
        
        .row-action-btn.apply-change:hover:not(:disabled) {
            background: var(--visibility-observed);
            border-color: var(--visibility-observed);
        }
        
        .row-action-btn.revert-change {
            background: var(--visibility-hidden);
            border-color: var(--visibility-hidden);
            color: white;
        }
        
        .row-action-btn.revert-change:hover:not(:disabled) {
            background: var(--visibility-hidden);
            border-color: var(--visibility-hidden);
        }
        
        /* ===== UNIFIED STATE ICON SELECTION ===== */
        
        /* Override Icons Container - Unified */
        .override-icons,
        .seek-preview-dialog .override-icons,
        .hide-preview-dialog .override-icons,
        .point-out-preview-dialog .override-icons,
        .sneak-preview-dialog .override-icons {
            display: flex;
            gap: 2px;
            align-items: center;
            justify-content: center;
            flex-wrap: nowrap;
        }
        
        /* ===== OLD VISIBILITY STATUS ICONS (Plain Icons - No Button Styling) ===== */
        
        /* Old Visibility State Icons - Plain Style */
        .visibility-change-inline > .state-icon:first-child,
        .visibility-change > .state-icon:first-child,
        .hide-preview-dialog .visibility-change-inline > .state-icon:first-child,
        .point-out-preview-dialog .visibility-change > .state-icon:first-child,
        .sneak-preview-dialog .visibility-change > .state-icon:first-child {
            background: transparent !important;
            border: none !important;
            border-radius: 0 !important;
            padding: 0 !important;
            cursor: default !important;
            transition: none !important;
            font-size: 14px !important;
            min-width: auto !important;
            width: auto !important;
            height: auto !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            opacity: 1 !important;
            position: relative !important;
            box-sizing: content-box !important;
            box-shadow: none !important;
            transform: none !important;
        }
        
        /* Old Visibility State Icons - No Hover Effects */
        .visibility-change-inline > .state-icon:first-child:hover,
        .visibility-change > .state-icon:first-child:hover,
        .hide-preview-dialog .visibility-change-inline > .state-icon:first-child:hover,
        .point-out-preview-dialog .visibility-change > .state-icon:first-child:hover,
        .sneak-preview-dialog .visibility-change > .state-icon:first-child:hover {
            background: transparent !important;
            border: none !important;
            opacity: 1 !important;
            transform: none !important;
            box-shadow: none !important;
        }
        
        /* Old Visibility State Icons - Inner Elements */
        .visibility-change-inline > .state-icon:first-child i,
        .visibility-change > .state-icon:first-child i,
        .hide-preview-dialog .visibility-change-inline > .state-icon:first-child i,
        .point-out-preview-dialog .visibility-change > .state-icon:first-child i,
        .sneak-preview-dialog .visibility-change > .state-icon:first-child i {
            font-size: 14px !important;
            pointer-events: none !important;
        }
        
        /* State Icon Base Styles - Unified (Excludes Old Visibility Icons) */
        .state-icon,
        .seek-preview-dialog .state-icon,
        .hide-preview-dialog .state-icon,
        .point-out-preview-dialog .state-icon,
        .sneak-preview-dialog .state-icon,
        .visibility-table .state-icon,
        .point-out-results-table .state-icon,
        .sneak-results-table .state-icon,
        .override-icons .state-icon {
            /* Note: Excludes .visibility-change .state-icon:first-child for plain old visibility styling */
            background: transparent !important;
            border: 1px solid var(--color-border-light-primary, #555) !important;
            border-radius: 4px !important;
            padding: 4px !important;
            cursor: pointer !important;
            transition: all 0.2s ease !important;
            font-size: 12px !important;
            min-width: 24px !important;
            width: 24px !important;
            height: 24px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            opacity: 0.6 !important;
            position: relative !important;
            box-sizing: border-box !important;
        }
        
        /* State Icon Hover - Unified (Excludes Old Visibility Icons) */
        .state-icon:hover,
        .seek-preview-dialog .state-icon:hover,
        .hide-preview-dialog .state-icon:hover,
        .point-out-preview-dialog .state-icon:hover,
        .sneak-preview-dialog .state-icon:hover,
        .visibility-table .state-icon:hover,
        .point-out-results-table .state-icon:hover,
        .sneak-results-table .state-icon:hover,
        .override-icons .state-icon:hover {
            opacity: 1 !important;
            background: rgba(255, 255, 255, 0.1) !important;
            border-color: currentColor !important;
            transform: translateY(-1px) !important;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2) !important;
        }
        
        /* State Icon Selected - Unified (Excludes Old Visibility Icons) */
        .state-icon.selected,
        .seek-preview-dialog .state-icon.selected,
        .hide-preview-dialog .state-icon.selected,
        .point-out-preview-dialog .state-icon.selected,
        .sneak-preview-dialog .state-icon.selected,
        .visibility-table .state-icon.selected,
        .point-out-results-table .state-icon.selected,
        .sneak-results-table .state-icon.selected,
        .override-icons .state-icon.selected {
            opacity: 1 !important;
            background: rgba(255, 255, 255, 0.2) !important;
            border-color: currentColor !important;
            border-width: 2px !important;
            box-shadow: 0 0 12px rgba(255, 255, 255, 0.4) !important;
            transform: scale(1.1) !important;
        }
        
        /* State-specific selected overrides - ensures proper colors for each visibility state */
        .state-icon[data-state='observed'].selected,
        .seek-preview-dialog .state-icon[data-state='observed'].selected,
        .hide-preview-dialog .state-icon[data-state='observed'].selected,
        .sneak-preview-dialog .state-icon[data-state='observed'].selected,
        .visibility-table .state-icon[data-state='observed'].selected,
        .override-icons .state-icon[data-state='observed'].selected {
            background: var(--visibility-observed-bg-strong) !important;
            color: var(--visibility-observed) !important;
            border-color: var(--visibility-observed) !important;
            box-shadow: 0 0 12px var(--visibility-observed) !important;
        }
        
        .state-icon[data-state='concealed'].selected,
        .seek-preview-dialog .state-icon[data-state='concealed'].selected,
        .hide-preview-dialog .state-icon[data-state='concealed'].selected,
        .sneak-preview-dialog .state-icon[data-state='concealed'].selected,
        .visibility-table .state-icon[data-state='concealed'].selected,
        .override-icons .state-icon[data-state='concealed'].selected {
            background: var(--visibility-concealed-bg-strong) !important;
            color: var(--visibility-concealed) !important;
            border-color: var(--visibility-concealed) !important;
            box-shadow: 0 0 12px var(--visibility-concealed) !important;
        }
        
        .state-icon[data-state='hidden'].selected,
        .seek-preview-dialog .state-icon[data-state='hidden'].selected,
        .hide-preview-dialog .state-icon[data-state='hidden'].selected,
        .sneak-preview-dialog .state-icon[data-state='hidden'].selected,
        .visibility-table .state-icon[data-state='hidden'].selected,
        .override-icons .state-icon[data-state='hidden'].selected {
            background: var(--visibility-hidden-bg-strong) !important;
            color: var(--visibility-hidden) !important;
            border-color: var(--visibility-hidden) !important;
            box-shadow: 0 0 12px var(--visibility-hidden) !important;
        }
        
        .state-icon[data-state='undetected'].selected,
        .seek-preview-dialog .state-icon[data-state='undetected'].selected,
        .hide-preview-dialog .state-icon[data-state='undetected'].selected,
        .sneak-preview-dialog .state-icon[data-state='undetected'].selected,
        .visibility-table .state-icon[data-state='undetected'].selected,
        .override-icons .state-icon[data-state='undetected'].selected {
            background: var(--visibility-undetected-bg-strong) !important;
            color: var(--visibility-undetected) !important;
            border-color: var(--visibility-undetected) !important;
            box-shadow: 0 0 12px var(--visibility-undetected) !important;
        }
        
        /* Enhanced Point Out Dialog Selected State Glow */
        .point-out-preview-dialog .override-icons .state-icon.selected,
        .point-out-preview-dialog .visibility-change .state-icon.selected {
            box-shadow: 0 0 12px rgba(255, 255, 255, 0.5) !important;
            background: rgba(255, 255, 255, 0.25) !important;
            border-width: 2px !important;
            transform: scale(1.15) !important;
        }
        
        /* State Icon Calculated Outcome - Unified (Excludes Old Visibility Icons) */
        .state-icon.calculated-outcome,
        .seek-preview-dialog .state-icon.calculated-outcome,
        .hide-preview-dialog .state-icon.calculated-outcome,
        .point-out-preview-dialog .state-icon.calculated-outcome,
        .sneak-preview-dialog .state-icon.calculated-outcome,
        .visibility-table .state-icon.calculated-outcome,
        .point-out-results-table .state-icon.calculated-outcome,
        .sneak-results-table .state-icon.calculated-outcome,
        .override-icons .state-icon.calculated-outcome,
        .create-a-diversion-preview-dialog .state-icon.calculated-outcome {
            background: rgba(255, 255, 255, 0.1) !important;
            border-color: currentColor !important;
            border-width: 2px !important;
            animation: pulse-glow 2s infinite !important;
        }
        
        /* State Icon Inner Elements - Unified (Excludes Old Visibility Icons) */
        .state-icon i,
        .seek-preview-dialog .state-icon i,
        .hide-preview-dialog .state-icon i,
        .point-out-preview-dialog .state-icon i,
        .sneak-preview-dialog .state-icon i,
        .visibility-table .state-icon i,
        .point-out-results-table .state-icon i,
        .sneak-results-table .state-icon i,
        .override-icons .state-icon i {
            font-size: 12px !important;
            pointer-events: none !important;
        }

        
        .point-out-preview-dialog .window-header {
            background: linear-gradient(135deg, var(--visibility-hidden) 0%, var(--visibility-hidden) 100%);
            color: white;
        }
        
        .point-out-preview-dialog .window-content {
            padding: 0;
            background: var(--color-bg-primary, #2a2a2a);
            color: var(--color-text-primary, #f0f0f0);
            max-height: 80vh;
            overflow-y: auto;
        }

        /* ===== TAKE COVER PREVIEW DIALOG - BROWN THEME ===== */
        .take-cover-preview-dialog .window-header {
            background: linear-gradient(135deg, var(--pf2e-visioner-brown) 0%, var(--pf2e-visioner-brown) 100%);
            color: white;
            border-bottom: 2px solid var(--pf2e-visioner-brown);
        }
        .take-cover-preview-content { padding: 12px; background: var(--color-bg-primary, #2a2a2a); color: var(--color-text-primary, #f0f0f0); }
        .take-cover-preview-dialog .actor-info {
            display: flex; align-items: center; margin-bottom: 4px; padding: 12px;
            background: var(--visibility-undetected-bg-medium); border-radius: 6px; border-left: 4px solid var(--pf2e-visioner-brown);
        }
        .take-cover-preview-dialog .hider-image img { width: 48px; height: 48px; border-radius: 50%; border: 2px solid var(--pf2e-visioner-brown); margin-right: 12px; }
        .take-cover-preview-dialog .hider-name { margin: 0 0 4px 0; font-size: 16px; font-weight: bold; color: #ffcdd2; color: #ffecb3; color: #d7ccc8; color: #d7ccc8; }
        .take-cover-preview-dialog .hider-name { color: #d7ccc8; }
        .take-cover-results-table th { background: linear-gradient(135deg, var(--pf2e-visioner-brown), var(--pf2e-visioner-brown)) !important; color: white !important; }
        .take-cover-results-table .visibility-change, .take-cover-results-table .actions { text-align: center; }
        .take-cover-preview-dialog .visibility-arrow { color: #bdbdbd; }

        /* State icon theming based on state color using currentColor */
        .take-cover-preview-dialog .override-icons .state-icon[data-state="none"] { color: var(--cover-none); }
        .take-cover-preview-dialog .override-icons .state-icon[data-state="lesser"] { color: var(--cover-lesser); }
        .take-cover-preview-dialog .override-icons .state-icon[data-state="standard"] { color: var(--cover-standard); }
        .take-cover-preview-dialog .override-icons .state-icon[data-state="greater"] { color: var(--cover-greater); }

        .take-cover-preview-dialog .override-icons .state-icon.selected {
            border-color: currentColor !important;
            background: rgba(255, 255, 255, 0.15) !important;
            box-shadow: 0 0 10px currentColor !important;
            transform: scale(1.1) !important;
        }
        .take-cover-preview-dialog .override-icons .state-icon.calculated-outcome {
            border-color: currentColor !important;
            animation: tcGlow 1.5s ease-in-out infinite !important;
        }
        @keyframes tcGlow {
            0% { box-shadow: 0 0 8px currentColor; transform: scale(1.05); }
            50% { box-shadow: 0 0 18px currentColor; transform: scale(1.1); }
            100% { box-shadow: 0 0 8px currentColor; transform: scale(1.05); }
        }
        
        .point-out-preview-content {
            padding: 12px;
            background: var(--color-bg-primary, #2a2a2a);
            color: var(--color-text-primary, #f0f0f0);
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        
        .actor-info {
            display: flex;
            align-items: center;
            margin-bottom: 4px;
            padding: 12px;
            background: var(--color-bg-option, var(--visibility-hidden-bg-medium));
            border-radius: 6px;
            border-left: 4px solid var(--visibility-hidden);
        }
        
        .actor-image img {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            border: 2px solid var(--visibility-hidden);
            margin-right: 12px;
            object-fit: cover;
            object-position: top;
        }
        
        .actor-name {
            margin: 0 0 4px 0;
            color: var(--color-text-primary, #f0f0f0);
            font-size: 16px;
            font-weight: bold;
        }
        
        /* Point Out Dialog Table - Orange Theme Override */
        .point-out-results-table {
            margin: 0px;
        }
        
        .point-out-results-table th {
            background: linear-gradient(135deg, var(--visibility-hidden), var(--visibility-hidden)) !important;
            color: white !important;
        }
        
        /* Point Out Dialog Bulk Actions Header */
        .point-out-preview-dialog-bulk-actions-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px;
            background: var(--visibility-hidden-bg);
            border-radius: 6px;
            border-top: 1px solid var(--visibility-hidden);
            gap: 20px;
        }
        
        .point-out-preview-dialog-bulk-actions-info {
            font-size: 12px;
            font-weight: 600;
            color: var(--color-text-primary, #f0f0f0);
            flex: 1;
        }
        
        /* ===== UNIFIED BULK ACTIONS TEXT STYLING WITH THEME COLORS ===== */
        
        /* Base Styling for All Changes Count and Total Count */
        .point-out-preview-dialog-changes-count,
        .point-out-preview-dialog-total-count,
        .sneak-preview-dialog .sneak-preview-dialog-changes-count,
        .sneak-preview-dialog .sneak-preview-dialog-total-count,
        .seek-preview-dialog-changes-count,
        .seek-preview-dialog-total-count,
        .hide-preview-dialog-changes-count,
        .hide-preview-dialog-total-count,
        .create-a-diversion-preview-dialog-changes-count,
        .create-a-diversion-preview-dialog-total-count {
            font-weight: 700 !important;
        }

        /* Create a Diversion - Cyan Theme */
        .create-a-diversion-preview-dialog-changes-count,
        .create-a-diversion-preview-dialog-total-count {
            color: #20b2aa !important;
        }
        
        /* Point Out Dialog - Orange Theme */
        .point-out-preview-dialog-changes-count,
        .point-out-preview-dialog-total-count {
            color: var(--visibility-hidden) !important;
        }
        
        /* Sneak Dialog - Gray Theme */
        .sneak-preview-dialog .sneak-preview-dialog-changes-count,
        .sneak-preview-dialog .sneak-preview-dialog-total-count {
            color:rgb(123, 126, 129) !important;
        }
        
        /* Seek Dialog - Blue Theme */
        .seek-preview-dialog-changes-count,
        .seek-preview-dialog-total-count {
            color:rgb(78, 127, 199) !important;
        }
        
        /* Hide Dialog - Purple Theme */
        .hide-preview-dialog-changes-count,
        .hide-preview-dialog-total-count {
            color:rgb(175, 52, 209) !important;
        }
        
        .point-out-preview-dialog-bulk-actions-buttons {
            display: flex;
            gap: 12px;
            flex-wrap: nowrap;
            align-items: center;
            margin-left: 20px;
        }
        
        /* Seek Dialog Table Headers - Blue Theme Override */
        .seek-results-table th {
            background: linear-gradient(135deg, var(--pf2e-visioner-info), var(--pf2e-visioner-info)) !important;
            color: white !important;
        }
        
        /* Sneak Dialog Table Headers - Gray Theme Override */
        .sneak-results-table th {
            background: linear-gradient(135deg, var(--pf2e-visioner-gray), var(--pf2e-visioner-gray)) !important;
            color: white !important;
        }
        
        /* Point Out Dialog Visibility Change Layout */
        .point-out-preview-dialog .visibility-change {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            min-height: 32px;
        }
        
        .point-out-preview-dialog .visibility-arrow {
            color: var(--color-text-secondary, #b0b0b0);
            font-size: 12px;
            margin: 0 4px;
        }
        
        /* Point Out state icon styles removed - now using unified styles */
        
        .point-out-preview-dialog .no-change-indicator {
            color: var(--color-text-secondary, #b0b0b0);
            font-style: italic;
            font-size: 11px;
        }
        
        .point-out-preview-dialog-bulk-action-btn {
            background: var(--color-bg-option, rgba(255, 255, 255, 0.1));
            color: var(--color-text-primary, #f0f0f0);
            border: 1px solid var(--color-border-light-primary, #555);
            border-radius: 6px;
            padding: 10px 20px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            margin: 0 6px;
            min-width: 120px;
            justify-content: center;
        }
        
        .point-out-preview-dialog-bulk-action-btn:hover:not(:disabled) {
            background: var(--color-bg-btn-hover, rgba(255, 255, 255, 0.2));
            transform: translateY(-1px);
        }
        
        .point-out-preview-dialog-bulk-action-btn:disabled {
            opacity: 0.8;
            cursor: not-allowed;
            background: #cccccc !important;
            border-color: #cccccc !important;
            color: #666666 !important;
            transform: none !important;
        }
        
        .point-out-preview-dialog-bulk-action-btn.apply-all {
            background: var(--visibility-observed);
            border-color: var(--visibility-observed);
            color: white;
        }
        
        .point-out-preview-dialog-bulk-action-btn.apply-all:hover:not(:disabled) {
            background: var(--visibility-observed);
            border-color: var(--visibility-observed);
        }
        
        .point-out-preview-dialog-bulk-action-btn.revert-all {
            background: var(--visibility-hidden);
            border-color: var(--visibility-hidden);
            color: white;
        }
        
        .point-out-preview-dialog-bulk-action-btn.revert-all:hover:not(:disabled) {
            background: var(--visibility-hidden);
            border-color: var(--visibility-hidden);
        }
        
        /* Point Out Dialog Bulk Actions Header */
        .point-out-preview-dialog-bulk-actions-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px;
            background: var(--color-bg-option, rgba(255, 255, 255, 0.05));
            border-top: 1px solid var(--color-border-light-primary, #555);
            margin-top: 12px;
        }
        
        .point-out-preview-dialog-bulk-actions-info {
            color: var(--color-text-primary, #f0f0f0);
            font-size: 13px;
            font-weight: 500;
        }
        
        .point-out-preview-dialog-changes-count {
            font-weight: bold;
            color: var(--color-text-highlight, #ffffff);
        }
        
        .point-out-preview-dialog-bulk-actions-buttons {
            display: flex;
            gap: 8px;
        }
        
        /* Action Type Specific Styles */
        .pf2e-visioner-automation-panel[data-action-type="point-out"] {
            border-color: var(--visibility-hidden);
        }
        
        .pf2e-visioner-automation-panel[data-action-type="point-out"] .visioner-btn-primary {
            background: linear-gradient(135deg, var(--visibility-hidden), var(--visibility-hidden));
            border-color: var(--visibility-hidden);
            color: white;
        }
        
        .pf2e-visioner-automation-panel[data-action-type="point-out"] .visioner-btn-primary:hover {
            background: linear-gradient(135deg, var(--visibility-hidden), #d84315);
            border-color: var(--visibility-hidden);
            transform: translateY(-1px);
            box-shadow: 0 2px 8px var(--visibility-hidden-bg-strong);
        }
        
        /* State Icon Selection */
        .icon-selection {
            display: flex;
            gap: 2px;
            align-items: center;
            justify-content: center;
            flex-wrap: nowrap;
        }
        
        .state-icon {
            background: transparent;
            border: 1px solid var(--color-border-light-primary, #555);
            border-radius: 4px;
            padding: 4px;
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            position: relative;
        }
        
        .state-icon:hover {
            background: var(--color-bg-option, rgba(255, 255, 255, 0.1));
            border-color: var(--color-border-highlight, #777);
            transform: scale(1.05);
        }
        
        .state-icon.selected {
            background: var(--color-bg-btn, rgba(255, 255, 255, 0.2));
            border-color: currentColor;
            border-width: 2px;
            box-shadow: 0 0 4px rgba(255, 255, 255, 0.3);
            transform: scale(1.1);
        }
        
        .state-icon.calculated-outcome {
            background: rgba(255, 255, 255, 0.1);
            border-color: currentColor;
            border-width: 2px;
            animation: pulse-glow 2s infinite;
        }
        
        @keyframes pulse-glow {
            0%, 100% { 
                box-shadow: 0 0 4px rgba(255, 255, 255, 0.3);
                transform: scale(1.0);
            }
            50% { 
                box-shadow: 0 0 8px rgba(255, 255, 255, 0.5);
                transform: scale(1.05);
            }
        }
        
        .state-icon i {
            font-size: 12px;
            pointer-events: none;
        }
        
        .override-icons {
            display: flex;
            gap: 2px;
            align-items: center;
            justify-content: center;
        }
        
        .visibility-change-with-override {
            display: flex;
            align-items: center;
            gap: 8px;
            justify-content: center;
        }
        
        .visibility-change-with-override > i {
            font-size: 14px;
        }
        
        /* Row Action Buttons */
        .row-action-btn {
            background: var(--color-bg-option, rgba(255, 255, 255, 0.1));
            color: var(--color-text-primary, #f0f0f0);
            border: 1px solid var(--color-border-light-primary, #555);
            border-radius: 4px;
            padding: 4px 6px;
            cursor: pointer;
            transition: all 0.2s ease;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            margin: 0 2px;
            font-size: 10px;
        }
        
        .row-action-btn:hover:not(:disabled) {
            background: var(--color-bg-btn-hover, rgba(255, 255, 255, 0.2));
            border-color: var(--color-border-highlight, #777);
            transform: translateY(-1px);
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
        
        .row-action-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            background: var(--color-bg-disabled, #444);
            border-color: var(--color-border-disabled, #666);
            color: var(--color-text-disabled, #888);
            transform: none;
        }
        
        .row-action-btn.applied {
            background: var(--visibility-observed);
            border-color: var(--visibility-observed);
            color: white;
        }
        
        .row-action-btn.reverted {
            background: var(--visibility-hidden);
            border-color: var(--visibility-hidden);
            color: white;
        }
        
        /* Bulk Action Buttons */
        .seek-preview-dialog-bulk-actions-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px;
            background: var(--color-bg-option, rgba(255, 255, 255, 0.05));
            border-top: 1px solid var(--color-border-light-primary, #555);
            margin-top: 12px;
        }
        
        .seek-preview-dialog-bulk-actions-info {
            color: var(--color-text-primary, #f0f0f0);
            font-size: 13px;
            font-weight: 500;
        }
        
        .seek-preview-dialog-changes-count {
            font-weight: bold;
            color: var(--color-text-highlight, #ffffff);
        }
        
        .seek-preview-dialog-total-count {
            font-weight: bold;
        }
        
        .seek-preview-dialog-bulk-actions-buttons {
            display: flex;
            gap: 8px;
        }
        
        .seek-preview-dialog-bulk-action-btn {
            background: var(--color-bg-option, rgba(255, 255, 255, 0.1));
            color: var(--color-text-primary, #f0f0f0);
            border: 1px solid var(--color-border-light-primary, #555);
            border-radius: 6px;
            padding: 8px 16px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            min-width: 100px;
            justify-content: center;
        }
        
        .seek-preview-dialog-bulk-action-btn:hover:not(:disabled) {
            background: var(--color-bg-btn-hover, rgba(255, 255, 255, 0.2));
            border-color: var(--color-border-highlight, #777);
            transform: translateY(-1px);
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
        
        .seek-preview-dialog-bulk-action-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            background: var(--color-bg-disabled, #444);
            border-color: var(--color-border-disabled, #666);
            color: var(--color-text-disabled, #888);
            transform: none;
        }
        
        .seek-preview-dialog-bulk-action-btn.apply-all {
            background: var(--visibility-observed);
            border-color: var(--visibility-observed);
            color: white;
        }
        
        .seek-preview-dialog-bulk-action-btn.apply-all:hover:not(:disabled) {
            background: var(--visibility-observed);
            border-color: var(--visibility-observed);
        }
        
        .seek-preview-dialog-bulk-action-btn.revert-all {
            background: var(--visibility-hidden);
            border-color: var(--visibility-hidden);
            color: white;
        }
        
        .seek-preview-dialog-bulk-action-btn.revert-all:hover:not(:disabled) {
            background: var(--visibility-hidden);
            border-color: var(--visibility-hidden);
        }
        
        /* Encounter Filter Section */
        .senses-buttons-container-clean {
            display: flex !important;
            flex-direction: column !important;
            gap: 6px !important;
            margin: 6px 0 !important;
            /* Match original styling but use safer flex implementation */
            contain: layout !important; /* Prevents sticky positioning interference */
        }

        /* Senses Button Styling - Dynamic Override */
        .seek-preview-dialog .senses-button {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 8px !important;
            width: fit-content !important;
            max-width: 100% !important;
            padding: 8px 12px !important;
            border-radius: 999px !important;
            border: 1px solid color-mix(in srgb, var(--pf2e-visioner-info) 55%, transparent) !important;
            background: linear-gradient(180deg,
                color-mix(in srgb, var(--pf2e-visioner-info) 18%, transparent) 0%,
                color-mix(in srgb, var(--pf2e-visioner-info) 12%, transparent) 100%) !important;
            color: var(--color-text-light-primary) !important;
            cursor: pointer !important;
            font-size: 12px !important;
            font-weight: 700 !important;
            line-height: 1 !important;
            transition: all 0.2s ease !important;
            text-decoration: none !important;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.06) !important;
        }

        .seek-preview-dialog .senses-button:hover {
            transform: translateY(-1px) !important;
            border-color: var(--pf2e-visioner-info) !important;
            box-shadow:
                0 2px 6px rgba(0, 0, 0, 0.25),
                0 0 0 2px color-mix(in srgb, var(--pf2e-visioner-info) 25%, transparent) !important;
        }

        .seek-preview-dialog .senses-button i {
            font-size: 14px !important;
            line-height: 1 !important;
        }

        .seek-preview-dialog .senses-button .button-text {
            white-space: nowrap !important;
        }

        .seek-preview-dialog .senses-button .count-badge {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            min-width: 20px !important;
            height: 20px !important;
            padding: 0 6px !important;
            border-radius: 999px !important;
            font-size: 11px !important;
            font-weight: 800 !important;
            background: color-mix(in srgb, #000 20%, var(--pf2e-visioner-info) 30%) !important;
            border: 1px solid color-mix(in srgb, var(--pf2e-visioner-info) 55%, transparent) !important;
            color: var(--color-text-light-primary) !important;
        }

        .seek-preview-dialog .senses-button .chevron {
            opacity: 0.9 !important;
            margin-left: 2px !important;
        }

        .seek-preview-dialog .senses-button .used-sense-indicator {
            margin-left: 6px !important;
            padding: 2px 6px !important;
            border-radius: 999px !important;
            font-size: 11px !important;
            font-weight: 700 !important;
            color: var(--color-text-light-primary) !important;
            background: color-mix(in srgb, var(--pf2e-visioner-warning) 22%, transparent) !important;
            border: 1px solid color-mix(in srgb, var(--pf2e-visioner-warning) 55%, transparent) !important;
        }

        .seek-preview-dialog .senses-button.used-senses {
            background: color-mix(in srgb, var(--pf2e-visioner-warning) 20%, transparent) !important;
            border-color: color-mix(in srgb, var(--pf2e-visioner-warning) 60%, transparent) !important;
            color: var(--color-text-light-primary) !important;
        }

        .seek-preview-dialog .senses-button.used-senses:hover {
            background: color-mix(in srgb, var(--pf2e-visioner-warning) 30%, transparent) !important;
            border-color: var(--pf2e-visioner-warning) !important;
        }

        .encounter-filter-section {
            margin-bottom: 12px;
            padding: 8px 12px;
            background: var(--color-bg-option, rgba(255, 255, 255, 0.05));
            border-radius: 6px;
            border: 1px solid var(--color-border-light-primary, #555);
            position: sticky;
            top: 0;
            z-index: 10;
        }
        
        .encounter-filter-checkbox {
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            user-select: none;
        }
        
        .encounter-filter-checkbox input[type="checkbox"] {
            margin: 0;
            cursor: pointer;
        }
        
        .encounter-filter-label {
            color: var(--color-text-primary, #f0f0f0);
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
        }
        
        .encounter-filter-checkbox:hover .encounter-filter-label {
            color: var(--color-text-highlight, #ffffff);
        }
        
        /* ===== SNEAK PREVIEW DIALOG STYLES ===== */
        
        /* Sneak Preview Dialog - Gray Theme */
        .sneak-preview-dialog {
            min-width: 600px;
        }
        
        .sneak-preview-dialog .window-header {
            background: linear-gradient(135deg, var(--pf2e-visioner-gray) 0%, var(--pf2e-visioner-gray) 100%);
            color: white;
            border-bottom: 2px solid var(--pf2e-visioner-gray);
        }
        
        .sneak-preview-dialog .window-header .window-title {
            color: white;
            font-weight: bold;
        }
        
        .sneak-preview-dialog .window-header .header-button {
            color: white;
        }
        
        .sneak-preview-dialog .window-content {
            padding: 0;
            background: var(--color-bg-primary, #2a2a2a);
            color: var(--color-text-primary, #f0f0f0);
        }
        
        .sneak-preview-content {
            padding: 12px;
            background: var(--color-bg-primary, #2a2a2a);
            color: var(--color-text-primary, #f0f0f0);
        }
        
        .sneaker-info {
            display: flex;
            align-items: center;
            margin-bottom: 4px;
            padding: 12px;
            background: rgb(53, 55, 59);
            border-radius: 6px;
            border-left: 4px solid var(--pf2e-visioner-gray);
        }
        
        .sneaker-image img {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            border: 2px solid var(--pf2e-visioner-gray);
            margin-right: 12px;
            object-fit: cover;
            object-position: top;
        }
        
        .sneaker-details {
            flex: 1;
        }
        
        .sneaker-name {
            margin: 0 0 4px 0;
            font-size: 16px;
            font-weight: bold;
            color: var(--pf2e-visioner-gray);
        }
        
        /* Sneak Dialog Bulk Action Buttons */
        .sneak-preview-dialog-bulk-action-btn {
            padding: 6px 12px !important;
            font-size: 12px !important;
            border-radius: 4px !important;
            font-weight: 500 !important;
            display: inline-flex !important;
            align-items: center !important;
            gap: 4px !important;
            cursor: pointer !important;
            transition: all 0.2s ease !important;
        }
        
        .sneak-preview-dialog-bulk-action-btn.apply-all {
            background: linear-gradient(135deg, var(--visibility-observed), var(--visibility-observed)) !important;
            color: white !important;
            border: 1px solid var(--visibility-observed) !important;
        }
        
        .sneak-preview-dialog-bulk-action-btn.apply-all:hover:not(:disabled) {
            background: linear-gradient(135deg, var(--visibility-observed), var(--visibility-observed)) !important;
            transform: translateY(-1px);
            box-shadow: 0 2px 8px var(--visibility-observed-bg-strong) !important;
        }
        
        .sneak-preview-dialog-bulk-action-btn.revert-all {
            background: linear-gradient(135deg, var(--pf2e-visioner-gray), var(--pf2e-visioner-gray)) !important;
            color: white !important;
            border: 1px solid var(--pf2e-visioner-gray) !important;
        }
        
        .sneak-preview-dialog-bulk-action-btn.revert-all:hover:not(:disabled) {
            background: linear-gradient(135deg, var(--pf2e-visioner-gray), var(--pf2e-visioner-gray)) !important;
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(108, 117, 125, 0.3) !important;
        }
        
        .sneak-preview-dialog-bulk-action-btn.revert-all:disabled {
            background: linear-gradient(135deg, var(--pf2e-visioner-gray), var(--pf2e-visioner-gray)) !important;
            opacity: 0.6 !important;
            cursor: not-allowed !important;
            transform: none !important;
            box-shadow: none !important;
        }
        
        /* Hide Preview Dialog Styles - Purple Theme */
        .hide-preview-dialog {
            min-width: 600px;
        }
        
        .hide-preview-dialog .window-header {
            background: linear-gradient(135deg, var(--pf2e-visioner-purple) 0%, var(--pf2e-visioner-purple) 100%);
            color: white;
            border-bottom: 2px solid var(--pf2e-visioner-purple);
        }
        
        .hide-preview-dialog .window-header .window-title {
            color: white;
            font-weight: bold;
        }
        
        .hide-preview-dialog .window-header .header-button {
            color: white;
        }
        
        .hide-preview-dialog .window-content {
            padding: 0;
            background: var(--color-bg-primary, #2a2a2a);
            color: var(--color-text-primary, #f0f0f0);
        }
        
        .hide-preview-content {
            padding: 12px;
            background: var(--color-bg-primary, #2a2a2a);
            color: var(--color-text-primary, #f0f0f0);
        }
        
        .hider-info {
            display: flex;
            align-items: center;
            margin-bottom: 4px;
            padding: 12px;
            background: var(--color-bg-option, rgba(142, 36, 170, 0.15));
            border-radius: 6px;
            border-left: 4px solid var(--pf2e-visioner-purple);
        }
        
        .hider-image img {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            border: 2px solid var(--pf2e-visioner-purple);
            margin-right: 12px;
            object-fit: cover;
            object-position: top;
        }
        
        .hiding-name {
            margin: 0 0 4px 0;
            color: var(--color-text-primary, #f0f0f0);
            font-size: 16px;
            font-weight: bold;
        }
        
        .hide-results-table {
            width: 100%;
            border-collapse: collapse;
            background: var(--color-bg-primary, #2a2a2a);
            border-radius: 6px;
            overflow: hidden;
            border: 1px solid var(--color-border-light-primary, #555);
        }
        
        .hide-results-table th {
            background: var(--color-bg-option, rgba(255, 255, 255, 0.1));
            color: var(--color-text-primary, #f0f0f0);
            padding: 8px 6px;
            width: 80px;
            min-width: 80px;
            text-align: center;
            font-weight: bold;
            font-size: 12px;
            border-bottom: 1px solid var(--color-border-light-primary, #555);
        }
        
        .hide-results-table td {
            padding: 6px;
            border-bottom: 1px solid var(--color-border-light-tertiary, #444);
            vertical-align: middle;
            text-align: center;
        }
        
        .hide-results-table tr:hover {
            background: var(--color-bg-option, rgba(255, 255, 255, 0.05));
        }
        
        /* Hide Dialog Visibility Change Inline Layout */
        .visibility-change-inline {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
        }
        
        .visibility-change-inline .visibility-arrow {
            color: #9e9e9e;
            margin: 0 4px;
        }
        
        .visibility-change-inline .no-change-indicator {
            color: #9e9e9e;
            font-style: italic;
            font-size: 0.9em;
        }
        
        .visibility-change-inline .override-icons {
            display: flex;
            gap: 6px;
        }
        
        .visibility-change-inline .state-icon {
            cursor: pointer;
            opacity: 0.7;
            transition: all 0.2s ease;
        }
        
        .visibility-change-inline .state-icon:hover {
            opacity: 1;
            transform: scale(1.1);
        }
        
        .visibility-change-inline .state-icon.selected {
            opacity: 1;
            transform: scale(1.1);
            text-shadow: 0 0 8px currentColor;
        }
        
        /* Hide Dialog Bulk Action Buttons */
        .hide-preview-dialog-bulk-actions-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px;
            background: var(--color-bg-option, rgba(255, 255, 255, 0.05));
            border-top: 1px solid var(--color-border-light-primary, #555);
            margin-top: 12px;
        }
        
        .hide-preview-dialog-bulk-actions-info {
            color: var(--color-text-primary, #f0f0f0);
            font-size: 13px;
            font-weight: 500;
        }
        
        .hide-preview-dialog-changes-count {
            font-weight: bold;
            color: var(--color-text-highlight, #ffffff);
        }
        
        .hide-preview-dialog-total-count {
            font-weight: bold;
        }
        
        .hide-preview-dialog-bulk-actions-buttons {
            display: flex;
            gap: 8px;
        }
        
        .hide-preview-dialog-bulk-action-btn {
            background: var(--color-bg-option, rgba(255, 255, 255, 0.1));
            color: var(--color-text-primary, #f0f0f0);
            border: 1px solid var(--color-border-light-primary, #555);
            border-radius: 6px;
            padding: 8px 16px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            min-width: 100px;
            justify-content: center;
        }
        
        .hide-preview-dialog-bulk-action-btn:hover:not(:disabled) {
            background: var(--color-bg-btn-hover, rgba(255, 255, 255, 0.2));
            border-color: var(--color-border-highlight, #777);
            transform: translateY(-1px);
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
        
        .hide-preview-dialog-bulk-action-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            background: var(--color-bg-disabled, #444);
            border-color: var(--color-border-disabled, #666);
            color: var(--color-text-disabled, #888);
            transform: none;
        }
        
        .hide-preview-dialog-bulk-action-btn.apply-all {
            background: var(--pf2e-visioner-purple);
            border-color: var(--pf2e-visioner-purple);
            color: white;
        }
        
        .hide-preview-dialog-bulk-action-btn.apply-all:hover:not(:disabled) {
            background: #7b1fa2;
            border-color: #7b1fa2;
        }
        
        .hide-preview-dialog-bulk-action-btn.revert-all {
            background: var(--visibility-hidden);
            border-color: var(--visibility-hidden);
            color: white;
        }
        
        .hide-preview-dialog-bulk-action-btn.revert-all:hover:not(:disabled) {
            background: var(--visibility-hidden);
            border-color: var(--visibility-hidden);
        }
        
        /* Sneak Preview Dialog Styles - Gray Theme */
        .sneak-preview-dialog {
            min-width: 600px;
        }
        
        .sneak-preview-dialog .window-header {
            background: linear-gradient(135deg, var(--pf2e-visioner-gray) 0%, var(--pf2e-visioner-gray) 100%);
            color: white;
            border-bottom: 2px solid var(--pf2e-visioner-gray);
        }
        
        .sneak-preview-dialog .window-header .window-title {
            color: white;
            font-weight: bold;
        }
        
        .sneak-preview-dialog .window-header .header-button {
            color: white;
        }
        
        .sneak-preview-dialog .window-content {
            padding: 0;
            background: var(--color-bg-primary, #2a2a2a);
            color: var(--color-text-primary, #f0f0f0);
        }
        
        /* Sneak Dialog Content Structure - Match Seek Design */
        .sneak-preview-dialog .sneak-preview-content {
            padding: 16px;
        }
        
        .sneak-preview-dialog .seeker-info {
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 16px;
            background: linear-gradient(135deg, var(--pf2e-visioner-gray), var(--pf2e-visioner-gray));
            border-radius: 8px;
            margin-bottom: 16px;
        }
        
        
        .sneak-preview-dialog .sneaker-details h3 {
            margin: 0 0 4px 0;
            color: white;
            font-size: 14px;
            font-weight: bold;
        }
        
        .sneak-preview-dialog .sneaker-details .hint {
            margin: 0;
            color: rgba(255, 255, 255, 0.8);
            font-size: 11px;
            font-style: italic;
        }
        
        .sneak-preview-dialog .encounter-filter-section {
            padding: 12px 16px;
            background: rgba(108, 117, 125, 0.1);
            border-radius: 6px;
            margin-bottom: 16px;
        }
        
        .sneak-preview-dialog .encounter-filter-checkbox {
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: 600;
            color: var(--color-text-primary, #f0f0f0);
            cursor: pointer;
        }
        
        .sneak-preview-dialog .results-table-container {
            margin-bottom: 16px;
        }
        
        .sneak-preview-dialog .visibility-table {
            width: 100%;
            border-collapse: collapse;
            background: var(--color-bg-primary, #2a2a2a);
        }
        
        
        .sneak-preview-dialog th {
            padding: 6px 4px;
            text-align: center;
            width: 80px;
            font-weight: bold;
            font-size: 11px;
            color: var(--color-text-primary, #f0f0f0);
            border-bottom: 2px solid var(--color-border-light-primary, #555);
            background: var(--color-bg-option, rgba(255, 255, 255, 0.1));
        }
        
        .sneak-preview-dialog .visibility-table td {
            padding: 8px 6px;
            border-bottom: 1px solid var(--pf2e-visioner-gray);
            vertical-align: middle;
            font-size: 12px;
        }
        
        /* Optimize column widths */
        .sneak-preview-dialog .visibility-table .token-image {
            width: 50px;
            text-align: center;
        }
        
        .sneak-preview-dialog .visibility-table .token-image img {
            border: none;
            border-radius: 3px;
        }
        
        .sneak-preview-dialog .visibility-table .token-name {
            width: 50px;
            text-align: center;
            word-break: normal;
            word-wrap: normal;
            overflow-wrap: break-word;
        }
        
        .sneak-preview-dialog .visibility-table .roll-result {
            width: 100px;
            text-align: center;
        }
        
        .sneak-preview-dialog .visibility-table .outcome {
            width: 80px;
            text-align: center;
        }
        
        .sneak-preview-dialog .visibility-table .visibility-change {
            width: 130px;
            text-align: center;
        }
        
        /* Sneak-specific styles removed - now using unified styles above */
        
        .sneak-preview-dialog .visibility-change-with-override {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .sneak-preview-dialog .override-icons {
            display: flex;
            gap: 4px;
        }
        
        .sneak-preview-dialog .state-icon {
            width: 24px;
            height: 24px;
            border: 1px solid var(--color-border-light-primary, #555);
            border-radius: 4px;
            background: transparent;
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
        }
        
        .sneak-preview-dialog .state-icon:hover {
            background: rgba(255, 255, 255, 0.1);
            border-color: currentColor;
            transform: scale(1.1);
        }
        
        .sneak-preview-dialog .state-icon.selected {
            background: rgba(255, 255, 255, 0.2) !important;
            border-color: currentColor !important;
            color: currentColor !important;
            box-shadow: 0 0 8px currentColor !important;
            transform: scale(1.1) !important;
        }
        
        .sneak-preview-dialog .state-icon.calculated-outcome {
            background: rgba(108, 117, 125, 0.3);
            border: 2px solid var(--pf2e-visioner-gray);
            animation: pulse-gray 2s infinite;
        }
        
        /* State-specific colors for sneak dialog icons */
        .sneak-preview-dialog .state-icon[data-state='observed'] {
            color: var(--visibility-observed) !important;
        }
        
        .sneak-preview-dialog .state-icon[data-state='concealed'] {
            color: var(--visibility-concealed) !important;
        }
        
        .sneak-preview-dialog .state-icon[data-state='hidden'] {
            color: var(--visibility-hidden) !important;
        }
        
        .sneak-preview-dialog .state-icon[data-state='undetected'] {
            color: var(--visibility-undetected) !important;
        }
        
        .sneak-preview-dialog .sneak-preview-dialog-bulk-actions-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px;
            background: rgba(108, 117, 125, 0.1);
            border-radius: 6px;
            border-top: 1px solid var(--pf2e-visioner-gray);
        }
        
        .sneak-preview-dialog .sneak-preview-dialog-bulk-actions-info {
            font-size: 12px;
            font-weight: 600;
            color: var(--color-text-primary, #f0f0f0);
        }
        
        /* Sneak dialog changes count styles moved to unified section above */
        
        .sneak-preview-dialog .sneak-preview-dialog-bulk-actions-buttons {
            display: flex;
            gap: 12px;
            flex-wrap: nowrap;
            align-items: center;
        }
        

        
        /* Row Action Buttons */
        .sneak-preview-dialog .row-action-btn {
            background: rgba(108, 117, 125, 0.2);
            color: var(--color-text-primary, #f0f0f0);
            border: 1px solid var(--pf2e-visioner-gray);
            border-radius: 4px;
            padding: 6px 8px;
            margin: 0 2px;
            cursor: pointer;
            transition: all 0.2s ease;
            font-size: 12px;
        }
        
        .sneak-preview-dialog .row-action-btn:hover:not(:disabled) {
            background: rgba(108, 117, 125, 0.4);
            border-color: var(--pf2e-visioner-gray);
            transform: translateY(-1px);
        }
        
        .sneak-preview-dialog .row-action-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        
        .sneak-preview-dialog .row-action-btn.apply-change {
            background: var(--visibility-observed);
            border-color: var(--visibility-observed);
            color: white;
        }
        
        .sneak-preview-dialog .row-action-btn.apply-change:hover:not(:disabled) {
            background: var(--visibility-observed);
            border-color: var(--visibility-observed);
        }
        
        .sneak-preview-dialog .row-action-btn.revert-change {
            background: var(--visibility-hidden);
            border-color: var(--visibility-hidden);
            color: white;
        }
        
        .sneak-preview-dialog .row-action-btn.revert-change:hover:not(:disabled) {
            background: var(--visibility-hidden);
            border-color: var(--visibility-hidden);
        }
        
        .sneak-preview-dialog .no-action {
            font-style: italic;
            color: var(--color-text-secondary, #ccc);
            font-size: 12px;
        }
        
        /* All Sneak dialog styles are now unified above */
        
        /* ===== CREATE A DIVERSION DIALOG STYLES - TEAL THEME ===== */
        
        /* Create a Diversion Dialog Window Title */
        .create-a-diversion-preview-dialog .window-header {
            background: linear-gradient(135deg, var(--pf2e-visioner-teal), var(--pf2e-visioner-teal));
            border-bottom: 2px solid var(--pf2e-visioner-teal);
            color: white;
        }
        
        /* Consequences Dialog Window Title - Red Theme */
        .consequences-preview-dialog .window-header {
            background: linear-gradient(135deg, var(--visibility-undetected), var(--visibility-undetected));
            border-bottom: 2px solid var(--visibility-undetected);
            color: white;
        }
        
        .consequences-preview-dialog .window-title {
            color: white;
            font-weight: bold;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
        }
        
        .consequences-preview-dialog .window-header .window-controls .control {
            color: white;
            opacity: 0.8;
        }
        
        .consequences-preview-dialog .window-header .window-controls .control:hover {
            opacity: 1;
            background: rgba(255, 255, 255, 0.1);
        }
        
        .consequences-preview-dialog .window-content {
            padding: 0;
            background: var(--color-bg-primary, #2a2a2a);
            color: var(--color-text-primary, #f0f0f0);
        }
        
        /* Consequences Dialog Content Structure */
        .consequences-preview-dialog .consequences-preview-content {
            padding: 16px;
        }
        
        .consequences-preview-dialog .attacker-info {
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 16px;
            background: linear-gradient(135deg, rgba(189, 11, 11, 0.14), rgba(255, 0, 0, 0.14));
            border-radius: 8px;
            margin-bottom: 16px;
            border-left: 4px solid #ff6b6b;
        }
        
        .attacker-image img {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            border: 2px solid #ff6b6b;
            margin-right: 12px;
            object-fit: cover;
            object-position: top;
        }
        
        .consequences-preview-dialog .attacker-details {
            flex: 1;
        }
        
        .consequences-preview-dialog .attacker-name {
            margin: 0 0 4px 0;
            font-size: 18px;
            font-weight: 600;
            color: white;
        }
        
        .consequences-preview-dialog .attacker-details .hint {
            margin: 0;
            font-size: 13px;
            color: rgba(255, 255, 255, 0.8);
            font-style: italic;
        }
        
        .create-a-diversion-preview-dialog .window-title {
            color: white;
            font-weight: bold;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
        }
        
        .create-a-diversion-preview-dialog .window-header .window-controls .control {
            color: white;
            opacity: 0.8;
        }
        
        .create-a-diversion-preview-dialog .window-header .window-controls .control:hover {
            opacity: 1;
            background: rgba(255, 255, 255, 0.1);
        }
        
        .create-a-diversion-preview-dialog .window-content {
            padding: 0;
            background: var(--color-bg-primary, #2a2a2a);
            color: var(--color-text-primary, #f0f0f0);
        }
        
        /* Create a Diversion Dialog Content Structure */
        .create-a-diversion-preview-dialog .create-a-diversion-preview-content {
            padding: 16px;
        }
        
        .create-a-diversion-preview-dialog .diverter-info {
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 16px;
            background: linear-gradient(135deg, rgb(37, 244, 251, 0.2), rgb(37, 244, 251, 0.1));
            border-radius: 8px;
            margin-bottom: 16px;
            border-left: 4px solid rgb(37, 244, 251);
        }
        
        .diverter-image img {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            border: 2px solid rgb(13, 201, 230);
            margin-right: 12px;
            object-fit: cover;
            object-position: top;
        }
        
        .create-a-diversion-preview-dialog .diverter-details {
            flex: 1;
        }
        
        .create-a-diversion-preview-dialog .diverter-name {
            margin: 0 0 4px 0;
            font-size: 18px;
            font-weight: 600;
            color: white;
        }
        
        .create-a-diversion-preview-dialog .diverter-details .hint {
            margin: 0;
            font-size: 13px;
            color: rgba(255, 255, 255, 0.8);
            font-style: italic;
        }
        
        .create-a-diversion-preview-dialog .diverter-content {
            display: flex;
            align-items: center;
            gap: 16px;
            width: 100%;
        }
        
        .create-a-diversion-preview-dialog .token-image img {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            border: 2px solid white;
        }
        
        .create-a-diversion-preview-dialog .diverter-details h3 {
            margin: 0 0 4px 0;
            color: white;
            font-size: 14px;
            font-weight: bold;
        }
        
        .create-a-diversion-preview-dialog .diverter-details .subtitle {
            margin: 0;
            color: rgba(255, 255, 255, 0.8);
            font-size: 11px;
            font-style: italic;
        }
        
        .create-a-diversion-preview-dialog .mode-toggle .mode-label {
            background: rgba(255, 255, 255, 0.2);
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: bold;
            color: white;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .create-a-diversion-preview-dialog .encounter-filter-section {
            padding: 12px 16px;
            background: rgba(23, 162, 184, 0.1);
            border-radius: 6px;
            margin-bottom: 16px;
        }
        
        /* Create a Diversion Table Styling */
        .create-a-diversion-preview-dialog .results-table-container {
            margin-bottom: 16px;
        }
        
        .create-a-diversion-preview-dialog .visibility-table {
            width: 100%;
            border-collapse: collapse;
            background: var(--color-bg-secondary, #333);
            border-radius: 8px;
            overflow: hidden;
        }
        
        .create-a-diversion-preview-dialog .visibility-table thead {
            background: linear-gradient(135deg, var(--pf2e-visioner-teal), var(--pf2e-visioner-teal));
        }
        
        .create-a-diversion-preview-dialog .visibility-table th {
            padding: 12px 8px;
            text-align: left;
            font-weight: 600;
            color: white;
            font-size: 13px;
            border-bottom: 2px solid rgba(255, 255, 255, 0.2);
        }
        
        .create-a-diversion-preview-dialog .visibility-table td {
            padding: 10px 8px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            vertical-align: middle;
            text-align: center;
        }
        
        .create-a-diversion-preview-dialog .token-row:hover {
            background: rgba(23, 162, 184, 0.1);
        }
        
        .create-a-diversion-preview-dialog .token-image img {
            width: 28px;
            height: 28px;
            border-radius: 4px;
            border: 1px solid rgba(255, 255, 255, 0.2);
        }
        
        .create-a-diversion-preview-dialog .roll-vs-dc {
            font-family: monospace;
        }
        
        .create-a-diversion-preview-dialog .roll-total {
            font-weight: bold;
            color: var(--pf2e-visioner-teal);
        }
        
        .create-a-diversion-preview-dialog .dc-value {
            font-weight: bold;
            color: var(--visibility-undetected);
        }
        
        .create-a-diversion-preview-dialog .margin-display {
            font-size: 11px;
            color: var(--color-text-secondary, #ccc);
        }

        .create-a-diversion-preview-dialog td {
            text-align: center;
        }
        
        /* Outcome styling */
        .create-a-diversion-preview-dialog .outcome.critical-success {
            color: var(--visibility-observed);
            font-weight: bold;
        }
        
        .create-a-diversion-preview-dialog .outcome.success {
            color: var(--pf2e-visioner-teal);
            font-weight: bold;
        }
        
        .create-a-diversion-preview-dialog .outcome.failure {
            color: var(--visibility-concealed);
            font-weight: bold;
        }
        
        .create-a-diversion-preview-dialog .outcome.critical-failure {
            color: var(--visibility-undetected);
            font-weight: bold;
        }
        
        .create-a-diversion-preview-dialog .state-icon {
            background: none;
            border: 2px solid transparent;
            border-radius: 4px;
            padding: 4px;
            margin: 0 2px;
            cursor: pointer;
            transition: all 0.2s ease;
        }
        
        .create-a-diversion-preview-dialog .state-icon.selected {
            border-color: var(--pf2e-visioner-teal);
            background: rgba(23, 162, 184, 0.2);
        }
        
        .create-a-diversion-preview-dialog .row-action-btn {
            background: var(--pf2e-visioner-teal);
            border: none;
            border-radius: 4px;
            padding: 6px 8px;
            color: white;
            cursor: pointer;
            margin: 0 2px;
            transition: all 0.2s ease;
        }
        
        .create-a-diversion-preview-dialog .row-action-btn:hover {
            background: var(--pf2e-visioner-teal);
            transform: translateY(-1px);
        }
        
        .create-a-diversion-preview-dialog .row-action-btn:disabled {
            background: var(--pf2e-visioner-gray);
            cursor: not-allowed;
            transform: none;
        }
        
        .create-a-diversion-preview-dialog .encounter-filter-label {
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: 600;
            color: var(--color-text-primary, #f0f0f0);
            cursor: pointer;
        }
        
        .create-a-diversion-preview-dialog .diversion-results-table {
            margin-bottom: 16px;
        }
        
        .create-a-diversion-preview-dialog .visibility-table {
            width: 100%;
            border-collapse: collapse;
            background: var(--color-bg-primary, #2a2a2a);
        }
        
        .create-a-diversion-preview-dialog .visibility-table th {
            padding: 8px 6px;
            text-align: center;
            font-weight: bold;
            font-size: 12px;
            color: var(--color-text-primary, #f0f0f0);
            border-bottom: 2px solid var(--color-border-light-primary, #555);
            background: var(--color-bg-option, rgba(255, 255, 255, 0.1));
        }
        
        .create-a-diversion-preview-dialog .visibility-table td {
            padding: 8px 6px;
            vertical-align: middle;
            font-size: 12px;
        }
        
        .create-a-diversion-preview-dialog .token-info {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .create-a-diversion-preview-dialog .token-image {
            width: 40px;
            min-width: 40px;
            text-align: center;
        }
        
        .create-a-diversion-preview-dialog .token-image img {
            width: 32px;
            height: 32px;
            border-radius: 4px;
            object-fit: cover;
            object-position: top;
        }
        
        .create-a-diversion-preview-dialog .roll-info {
            text-align: center;
        }
        
        .create-a-diversion-preview-dialog .roll-vs-dc {
            font-weight: bold;
            margin-bottom: 2px;
        }
        
        .create-a-diversion-preview-dialog .roll-total {
            color: #4a9eff;
            font-weight: bold;
        }
        
        .create-a-diversion-preview-dialog .dc-value {
            color: #ff6b6b;
            font-weight: bold;
        }
        
        .create-a-diversion-preview-dialog .margin {
            font-size: 11px;
            color: var(--color-text-secondary, #ccc);
        }
        
        .create-a-diversion-preview-dialog .outcome-label {
            padding: 4px 8px;
            border-radius: 4px;
            font-weight: bold;
            font-size: 11px;
            text-transform: uppercase;
        }
        
        .create-a-diversion-preview-dialog .visibility-transition {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .create-a-diversion-preview-dialog .current-state {
            font-weight: bold;
            color: var(--color-text-primary, #f0f0f0);
        }
        
        .create-a-diversion-preview-dialog .action-buttons {
            display: flex;
            gap: 4px;
            justify-content: center;
        }
        
        .create-a-diversion-preview-dialog .apply-change {
            background: var(--visibility-observed);
            color: white;
        }
        
        .create-a-diversion-preview-dialog .apply-change:hover:not(:disabled) {
            background: var(--visibility-observed);
        }
        
        .create-a-diversion-preview-dialog .apply-change:disabled {
            background: var(--pf2e-visioner-gray);
            cursor: not-allowed;
        }
        
        .create-a-diversion-preview-dialog .revert-change {
            background: var(--visibility-undetected);
            color: white;
        }
        
        .create-a-diversion-preview-dialog .revert-change:hover:not(:disabled) {
            background: var(--visibility-undetected);
        }
        
        .create-a-diversion-preview-dialog .revert-change:disabled {
            background: var(--pf2e-visioner-gray);
            cursor: not-allowed;
        }
        
        .create-a-diversion-preview-dialog .bulk-actions-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px;
            background: rgba(23, 162, 184, 0.1);
            border-radius: 8px;
            border-top: 1px solid var(--pf2e-visioner-teal);
        }
        
        .create-a-diversion-preview-dialog .summary-text {
            font-weight: bold;
            color: var(--color-text-primary, #f0f0f0);
        }
        
        .create-a-diversion-preview-dialog .bulk-action-buttons {
            display: flex;
            gap: 8px;
        }
        
        .create-a-diversion-preview-dialog-bulk-action-btn {
            padding: 8px 16px;
            border: none;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            color: white;
        }
        
        .create-a-diversion-preview-dialog-bulk-action-btn.apply-all {
            background: linear-gradient(135deg, var(--visibility-observed), var(--visibility-observed));
        }
        
        .create-a-diversion-preview-dialog-bulk-action-btn.apply-all:hover:not(:disabled) {
            background: linear-gradient(135deg, var(--visibility-observed), var(--visibility-observed));
            transform: translateY(-1px);
        }
        
        .create-a-diversion-preview-dialog-bulk-action-btn.revert-all {
            background: var(--visibility-hidden);
            border-color: var(--visibility-hidden);
            color: white;
        }
        
        .create-a-diversion-preview-dialog-bulk-action-btn.revert-all:hover:not(:disabled) {
            background: var(--visibility-hidden);
            border-color: var(--visibility-hidden);
        }
        
        .create-a-diversion-preview-dialog-bulk-action-btn:disabled {
            background: var(--pf2e-visioner-gray) !important;
            cursor: not-allowed;
            transform: none;
        }
                    
        .create-a-diversion-preview-dialog-bulk-actions-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px;
            background: var(--color-bg-option, rgba(255, 255, 255, 0.05));
            border-top: 1px solid var(--color-border-light-primary, #555);
            margin-top: 12px;
        }

        .create-a-diversion-preview-dialog-bulk-actions-info {
            color: var(--color-text-primary, #f0f0f0);
            font-size: 13px;
            font-weight: 500;
        }

        .create-a-diversion-preview-dialog-bulk-actions-buttons {
            display: flex;
            gap: 8px;
        }
        
        /* Row Action Button Styles */
        .create-a-diversion-preview-dialog .row-action-btn {
            background: rgba(108, 117, 125, 0.2);
            color: var(--color-text-primary, #f0f0f0);
            border: 1px solid var(--pf2e-visioner-gray);
            border-radius: 4px;
            padding: 6px 8px;
            margin: 0 2px;
            cursor: pointer;
            transition: all 0.2s ease;
            font-size: 12px;
        }
        
        .create-a-diversion-preview-dialog .row-action-btn:hover:not(:disabled) {
            background: rgba(108, 117, 125, 0.4);
            border-color: var(--pf2e-visioner-gray);
            transform: translateY(-1px);
        }
        
        .create-a-diversion-preview-dialog .row-action-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        
        .create-a-diversion-preview-dialog .row-action-btn.apply-change {
            background: var(--visibility-observed);
            border-color: var(--visibility-observed);
            color: white;
        }
        
        .create-a-diversion-preview-dialog .row-action-btn.apply-change:hover:not(:disabled) {
            background: var(--visibility-observed);
            border-color: var(--visibility-observed);
        }
        
        .create-a-diversion-preview-dialog .row-action-btn.revert-change {
            background: var(--visibility-hidden);
            border-color: var(--visibility-hidden);
            color: white;
        }
        
        .create-a-diversion-preview-dialog .row-action-btn.revert-change:hover:not(:disabled) {
            background: var(--visibility-hidden);
            border-color: var(--visibility-hidden);
        }
        
        .create-a-diversion-preview-dialog .no-action {
            font-style: italic;
            color: var(--color-text-secondary, #ccc);
            font-size: 12px;
        }

        /* Sense the Unseen Button Styles - High Priority Override */
        .seek-preview-dialog .sense-unseen-section {
          margin: 16px 0 !important;
          padding: 16px !important;
          border: 2px solid #8b5cf6 !important;
          border-radius: 12px !important;
          background: linear-gradient(135deg, rgba(139, 92, 246, 0.08), rgba(168, 85, 247, 0.12)) !important;
          box-shadow: 0 4px 12px rgba(139, 92, 246, 0.15) !important;
          position: relative !important;
          overflow: hidden !important;
        }

        .seek-preview-dialog .sense-unseen-section::before {
          content: '' !important;
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          height: 3px !important;
          background: linear-gradient(90deg, #8b5cf6, #a855f7, #c084fc) !important;
          border-radius: 12px 12px 0 0 !important;
        }

        .seek-preview-dialog .sense-unseen-button {
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 10px !important;
          width: 100% !important;
          padding: 14px 20px !important;
          background: linear-gradient(135deg, #8b5cf6 0%, #a855f7 50%, #c084fc 100%) !important;
          color: white !important;
          border: none !important;
          border-radius: 8px !important;
          font-size: 15px !important;
          font-weight: 700 !important;
          cursor: pointer !important;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
          box-shadow: 
            0 4px 14px rgba(139, 92, 246, 0.4),
            inset 0 1px 0 rgba(255, 255, 255, 0.2) !important;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3) !important;
          position: relative !important;
          overflow: hidden !important;
          font-family: inherit !important;
          text-decoration: none !important;
          outline: none !important;
        }

        .seek-preview-dialog .sense-unseen-button::before {
          content: '' !important;
          position: absolute !important;
          top: 0 !important;
          left: -100% !important;
          width: 100% !important;
          height: 100% !important;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent) !important;
          transition: left 0.5s ease !important;
        }

        .seek-preview-dialog .sense-unseen-button:hover::before {
          left: 100% !important;
        }

        .seek-preview-dialog .sense-unseen-button:hover {
          background: linear-gradient(135deg, #7c3aed 0%, #9333ea 50%, #a855f7 100%) !important;
          transform: translateY(-2px) !important;
          box-shadow: 
            0 6px 20px rgba(139, 92, 246, 0.5),
            inset 0 1px 0 rgba(255, 255, 255, 0.3) !important;
        }

        .seek-preview-dialog .sense-unseen-button:active {
          transform: translateY(-1px) !important;
          box-shadow: 
            0 4px 14px rgba(139, 92, 246, 0.4),
            inset 0 1px 0 rgba(255, 255, 255, 0.2) !important;
        }

        .seek-preview-dialog .sense-unseen-button i {
          font-size: 18px !important;
          filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3)) !important;
        }

        .seek-preview-dialog .sense-unseen-button .button-label {
          font-weight: 700 !important;
          letter-spacing: 0.5px !important;
        }

        /* Applied State - High Priority Override */
        .seek-preview-dialog .sense-unseen-button.applied,
        .sense-unseen-button.applied {
          background: linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%) !important;
          cursor: not-allowed !important;
          box-shadow: 
            0 4px 14px rgba(16, 185, 129, 0.4),
            inset 0 1px 0 rgba(255, 255, 255, 0.2) !important;
          opacity: 0.9 !important;
        }

        .seek-preview-dialog .sense-unseen-button.applied:hover,
        .sense-unseen-button.applied:hover {
          background: linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%) !important;
          transform: none !important;
          box-shadow: 
            0 4px 14px rgba(16, 185, 129, 0.4),
            inset 0 1px 0 rgba(255, 255, 255, 0.2) !important;
          opacity: 0.9 !important;
        }

        .seek-preview-dialog .sense-unseen-button.applied::before {
          display: none !important;
        }

        .seek-preview-dialog .sense-unseen-button.applied i {
          animation: checkPulse 0.6s ease-out !important;
        }

        @keyframes checkPulse {
          0% { transform: scale(0.8); opacity: 0; }
          50% { transform: scale(1.2); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }

        /* Applied section styling */
        .seek-preview-dialog .sense-unseen-section.applied {
          border-color: #10b981 !important;
          background: linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(5, 150, 105, 0.12)) !important;
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.15) !important;
        }

        .seek-preview-dialog .sense-unseen-section.applied::before {
          background: linear-gradient(90deg, #10b981, #059669, #047857) !important;
        }

        /* Reactions System Styles */
        .seek-preview-dialog .reactions-section {
          margin: 16px 0 !important;
          width: auto !important;
          display: block !important;
          max-width: 100% !important;
        }

        .seek-preview-dialog .reactions-header {
          display: flex !important;
          align-items: center !important;
          justify-content: flex-start !important;
          padding: 0 !important;
          margin-bottom: 12px !important;
        }

        .seek-preview-dialog .reactions-toggle-button {
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 8px !important;
          width: auto !important;
          min-width: 140px !important;
          padding: 12px 16px !important;
          background: linear-gradient(135deg, #f59e0b 0%, #fbbf24 50%, #fcd34d 100%) !important;
          color: white !important;
          border: none !important;
          border-radius: 8px !important;
          font-size: 14px !important;
          font-weight: 600 !important;
          cursor: pointer !important;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
          box-shadow:
            0 4px 14px rgba(245, 158, 11, 0.4),
            inset 0 1px 0 rgba(255, 255, 255, 0.2) !important;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3) !important;
          position: relative !important;
          overflow: hidden !important;
          font-family: inherit !important;
          text-decoration: none !important;
          outline: none !important;
        }

        .seek-preview-dialog .reactions-toggle-button:hover {
          background: linear-gradient(135deg, #d97706 0%, #f59e0b 50%, #fbbf24 100%) !important;
          transform: translateY(-1px) !important;
          box-shadow:
            0 6px 20px rgba(245, 158, 11, 0.5),
            inset 0 1px 0 rgba(255, 255, 255, 0.3) !important;
        }

        .seek-preview-dialog .reactions-toggle-button.active {
          background: linear-gradient(135deg, #d97706 0%, #f59e0b 50%, #fbbf24 100%) !important;
        }

        .seek-preview-dialog .reactions-chevron {
          transition: transform 0.3s ease !important;
          margin-left: 8px !important;
        }

        .seek-preview-dialog .reactions-chevron.rotated {
          transform: rotate(180deg) !important;
        }

        /* Pulsing animation for available reactions */
        .seek-preview-dialog .reactions-toggle-button.has-available {
          animation: reactionPulse 2s ease-in-out infinite !important;
        }

        @keyframes reactionPulse {
          0% { 
            transform: scale(1);
            box-shadow: 
              0 4px 14px rgba(245, 158, 11, 0.4),
              inset 0 1px 0 rgba(255, 255, 255, 0.2),
              0 0 0 0 rgba(245, 158, 11, 0.8);
          }
          50% { 
            transform: scale(1.05);
            box-shadow: 
              0 6px 20px rgba(245, 158, 11, 0.6),
              inset 0 1px 0 rgba(255, 255, 255, 0.3),
              0 0 0 10px rgba(245, 158, 11, 0);
          }
          100% { 
            transform: scale(1);
            box-shadow: 
              0 4px 14px rgba(245, 158, 11, 0.4),
              inset 0 1px 0 rgba(255, 255, 255, 0.2),
              0 0 0 0 rgba(245, 158, 11, 0);
          }
        }

        .seek-preview-dialog .reactions-dropdown {
          padding: 12px 0 0 0 !important;
          background: transparent !important;
          border: none !important;
          margin-top: 8px !important;
          max-height: none !important;
          overflow: visible !important;
          height: auto !important;
        }

        .seek-preview-dialog .reactions-dropdown-header h4 {
          margin: 0 0 12px 0 !important;
          color: var(--color-text-primary, #f0f0f0) !important;
          font-size: 16px !important;
          font-weight: 600 !important;
        }

        .seek-preview-dialog .reactions-list {
          display: flex !important;
          flex-direction: column !important;
          gap: 12px !important;
          width: 100% !important;
          max-width: none !important;
        }

        .seek-preview-dialog .reaction-item {
          border-radius: 8px !important;
          overflow: visible !important;
          border: 1px solid rgba(245, 158, 11, 0.3) !important;
          background: rgba(0, 0, 0, 0.1) !important;
          margin-bottom: 8px !important;
          min-height: auto !important;
          height: auto !important;
        }

        .seek-preview-dialog .reaction-item.applied {
          border-color: rgba(16, 185, 129, 0.5) !important;
          background: rgba(16, 185, 129, 0.1) !important;
        }

        .seek-preview-dialog .reaction-item.available {
          animation: reactionItemGlow 2.5s ease-in-out infinite !important;
          border-color: rgba(245, 158, 11, 0.7) !important;
        }

        @keyframes reactionItemGlow {
          0% { 
            border-color: rgba(245, 158, 11, 0.7);
            box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.5);
            background: rgba(0, 0, 0, 0.1);
          }
          50% { 
            border-color: rgba(245, 158, 11, 1);
            box-shadow: 0 0 0 6px rgba(245, 158, 11, 0);
            background: rgba(245, 158, 11, 0.05);
          }
          100% { 
            border-color: rgba(245, 158, 11, 0.7);
            box-shadow: 0 0 0 0 rgba(245, 158, 11, 0);
            background: rgba(0, 0, 0, 0.1);
          }
        }

        .seek-preview-dialog .reaction-button {
          display: flex !important;
          align-items: flex-start !important;
          width: 100% !important;
          padding: 16px !important;
          background: transparent !important;
          border: none !important;
          color: var(--color-text-primary, #f0f0f0) !important;
          cursor: pointer !important;
          transition: all 0.2s ease !important;
          text-align: left !important;
          font-family: inherit !important;
          min-height: auto !important;
          height: auto !important;
          box-sizing: border-box !important;
        }

        .seek-preview-dialog .reaction-button:hover:not(:disabled) {
          background: rgba(245, 158, 11, 0.1) !important;
        }

        .seek-preview-dialog .reaction-button:disabled {
          cursor: not-allowed !important;
          opacity: 0.7 !important;
        }

        .seek-preview-dialog .reaction-icon {
          flex-shrink: 0 !important;
          width: 36px !important;
          height: 36px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          background: rgba(245, 158, 11, 0.2) !important;
          border-radius: 6px !important;
          margin-right: 12px !important;
          margin-top: 2px !important;
        }

        .seek-preview-dialog .reaction-item.applied .reaction-icon {
          background: rgba(16, 185, 129, 0.2) !important;
        }

        .seek-preview-dialog .reaction-icon i {
          font-size: 16px !important;
          color: #f59e0b !important;
        }

        .seek-preview-dialog .reaction-item.applied .reaction-icon i {
          color: #10b981 !important;
        }

        .seek-preview-dialog .reaction-content {
          flex: 1 !important;
          margin-right: 12px !important;
          padding-top: 4px !important;
        }

        .seek-preview-dialog .reaction-name {
          font-weight: 600 !important;
          font-size: 15px !important;
          margin-bottom: 6px !important;
          color: var(--color-text-primary, #f0f0f0) !important;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5) !important;
          line-height: 1.2 !important;
        }

        .seek-preview-dialog .reaction-description {
          font-size: 12px !important;
          color: var(--color-text-dark-secondary, #cccccc) !important;
          line-height: 1.5 !important;
          text-shadow: 0 1px 1px rgba(0, 0, 0, 0.3) !important;
          word-wrap: break-word !important;
          overflow-wrap: break-word !important;
          white-space: normal !important;
          overflow: visible !important;
          max-width: none !important;
          width: 100% !important;
        }

        .seek-preview-dialog .reaction-status {
          flex-shrink: 0 !important;
          margin-left: 12px !important;
          padding-top: 8px !important;
          align-self: flex-start !important;
        }

        .seek-preview-dialog .applied-icon {
          color: #10b981 !important;
          font-size: 18px !important;
        }

        .seek-preview-dialog .use-icon {
          color: #f59e0b !important;
          font-size: 14px !important;
          opacity: 0.7 !important;
        }

        .seek-preview-dialog .reaction-item.available .use-icon {
          opacity: 1 !important;
          animation: iconPulse 2s ease-in-out infinite !important;
        }

        @keyframes iconPulse {
          0% { 
            opacity: 0.7;
            transform: scale(1);
          }
          50% { 
            opacity: 1;
            transform: scale(1.1);
          }
          100% { 
            opacity: 0.7;
            transform: scale(1);
          }
        }
    `;
}
