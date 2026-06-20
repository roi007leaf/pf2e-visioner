import fs from 'fs';
import path from 'path';

describe('sneak dialog module ownership', () => {
  const root = path.resolve(__dirname, '../../..');
  const sneakDialogPath = path.join(root, 'scripts/chat/dialogs/SneakPreviewDialog.js');
  const positionPath = path.join(
    root,
    'scripts/chat/dialogs/Sneak/sneak-position-qualification.js',
  );
  const contextPath = path.join(root, 'scripts/chat/dialogs/Sneak/sneak-dialog-context.js');
  const transitionsPath = path.join(
    root,
    'scripts/chat/dialogs/Sneak/sneak-position-transitions.js',
  );

  test('sneak dialog delegates position qualification workflow', () => {
    const source = fs.readFileSync(sneakDialogPath, 'utf8');
    const positionSource = fs.readFileSync(positionPath, 'utf8');

    expect(source).toContain("from './Sneak/sneak-position-qualification.js'");
    expect(source).toContain('startPositionQualifiesForSneak(this, observerToken, outcome)');
    expect(source).toContain('endPositionQualifiesForSneak(this, observerToken, outcome)');
    expect(source).toContain('recalculateSneakOutcomeVisibility(this, outcome)');
    expect(source).not.toContain('autoCoverSystem');
    expect(source).not.toContain('getCoverBetween');
    expect(source).not.toContain('overrideToDisplayVisibility');

    expect(positionSource).toContain('export function startPositionQualifiesForSneak');
    expect(positionSource).toContain('export function endPositionQualifiesForSneak');
    expect(positionSource).toContain('export async function recalculateSneakOutcomeVisibility');
    expect(positionSource).toContain('autoCoverSystem');
    expect(positionSource).toContain('getCoverBetween');
    expect(positionSource).toContain('overrideToDisplayVisibility');
  });

  test('sneak dialog delegates render context assembly', () => {
    const source = fs.readFileSync(sneakDialogPath, 'utf8');
    const contextSource = fs.readFileSync(contextPath, 'utf8');

    expect(source).toContain("from './Sneak/sneak-dialog-context.js'");
    expect(source).toContain('prepareSneakDialogContext(this, context)');
    expect(source).not.toContain('getSneakMaxDistanceFeet');
    expect(source).not.toContain('sneak-original-walk-speed');
    expect(source).not.toContain('getSneakSpeedMultiplier');
    expect(source).not.toContain('getCustomMessages(this.sneakingToken');

    expect(contextSource).toContain('export async function prepareSneakDialogContext');
    expect(contextSource).toContain('getSneakMaxDistanceFeet');
    expect(contextSource).toContain('sneak-original-walk-speed');
    expect(contextSource).toContain('getSneakSpeedMultiplier');
    expect(contextSource).toContain('getCustomMessages(app.sneakingToken');
  });

  test('sneak dialog delegates position transition capture and lookup', () => {
    const source = fs.readFileSync(sneakDialogPath, 'utf8');
    const transitionsSource = fs.readFileSync(transitionsPath, 'utf8');

    expect(source).toContain("from './Sneak/sneak-position-transitions.js'");
    expect(source).toContain('captureCurrentSneakEndPositions(this, outcomes)');
    expect(source).toContain('extractSneakPositionTransitions(this, outcomes)');
    expect(source).toContain('getSneakPositionTransitionForToken(this, token)');
    expect(source).not.toContain('optimizedVisibilityCalculator');
    expect(source).not.toContain('_capturePositionState');

    expect(transitionsSource).toContain('export async function captureCurrentSneakEndPositions');
    expect(transitionsSource).toContain('export async function extractSneakPositionTransitions');
    expect(transitionsSource).toContain('export function getSneakPositionTransitionForToken');
    expect(transitionsSource).toContain('optimizedVisibilityCalculator');
    expect(transitionsSource).toContain('_capturePositionState');
  });
});
