export function casePassed(result) {
  return result?.status === 'passed' && result.mode === 'automated' && Array.isArray(result.steps) && result.steps.length > 0 && result.steps.every(step =>
    step.status === 'passed' && step.review === undefined && (step.assertions === undefined ||
      Array.isArray(step.assertions) && step.assertions.length > 0 && step.assertions.every(a => a.status === 'passed')));
}

export function coverageFor(required, results) {
  const byName = new Map(results.map(result => [result.name, result]));
  return {
    required: required.length,
    passed: required.filter(c => casePassed(byName.get(c.name))).map(c => c.name),
    failed: required.filter(c => byName.has(c.name) && !casePassed(byName.get(c.name))).map(c => c.name),
    unrun: required.filter(c => !byName.has(c.name)).map(c => c.name),
  };
}

export function validateCases(cases) {
  const names = new Set();
  for (const testCase of cases) {
    if (!/^[a-z0-9-]+$/.test(testCase.name) || names.has(testCase.name)) throw Error(`Invalid or duplicate case: ${testCase.name}`);
    names.add(testCase.name);
    if (testCase.steps?.some(s => s.review)) throw Error(`Manual review is forbidden: ${testCase.name}`);
    if (!testCase.steps?.some(s => s.expect && Object.keys(s.expect).length || s.art !== undefined || s.actionMessage || s.expectSetting || s.workflow)) {
      throw Error(`Case has no observable assertion: ${testCase.name}`);
    }
    for (const step of testCase.steps) {
      if (step.art !== undefined && ![true, false, 'dim'].includes(step.art)) throw Error(`Invalid artwork expectation: ${testCase.name}`);
      if ((step.setting || step.restoreSettings || step.expectSetting) && !testCase.disposableWorld) throw Error(`Settings test requires disposable world: ${testCase.name}`);
      if (step.animate && (!Number.isFinite(step.animate.duration) || step.animate.duration <= 0 || step.animate.duration > 10000 || !(step.animate.maxP95FrameMs > 0) || !(step.animate.maxFrameMs > 0))) throw Error(`Invalid animation limits: ${testCase.name}`);
      if (step.session !== undefined && !['gm', 'player'].includes(step.session)) throw Error(`Unknown test session: ${step.session}`);
    }
  }
}
