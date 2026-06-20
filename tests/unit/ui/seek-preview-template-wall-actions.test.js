import fs from 'fs';
import path from 'path';

describe('Seek preview template wall row actions', () => {
  test('wall rows render wall-aware override and apply/revert buttons', () => {
    const template = fs.readFileSync(
      path.resolve(process.cwd(), 'templates/seek-preview.hbs'),
      'utf8',
    );

    expect(template).toContain('data-wall-id="{{#if outcome._isWall}}{{outcome.wallId}}{{/if}}"');
    expect(template).toContain(
      'class="row-action-btn apply-change" data-action="applyChange" data-wall-id="{{outcome.wallId}}"',
    );
    expect(template).toContain(
      'class="row-action-btn revert-change" data-action="revertChange" data-wall-id="{{outcome.wallId}}"',
    );
  });

  test('search exploration rows show only the seeker name in the Searcher column', () => {
    const template = fs.readFileSync(
      path.resolve(process.cwd(), 'templates/seek-preview.hbs'),
      'utf8',
    );

    expect(template).not.toContain(
      '<small class="search-exploration-seeker">{{outcome.searchExplorationTargetName}}</small>',
    );
  });

  test('invisible Seek capped rows render an explanation indicator', () => {
    const template = fs.readFileSync(
      path.resolve(process.cwd(), 'templates/seek-preview.hbs'),
      'utf8',
    );

    expect(template).toContain('{{#if outcome.invisibleSeekCapApplied}}');
    expect(template).toContain('seek-invisible-cap-indicator');
    expect(template).toContain('PF2E_VISIONER.SEEK_AUTOMATION.INVISIBLE_CAP_TOOLTIP');
  });
});
