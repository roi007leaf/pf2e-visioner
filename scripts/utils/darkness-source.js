export function getLightConfig(lightOrDocument) {
  return lightOrDocument?.document?.config ?? lightOrDocument?.config ?? lightOrDocument ?? {};
}

export function isDarknessSource(lightOrDocument) {
  const config = getLightConfig(lightOrDocument);
  return !!(
    lightOrDocument?.isDarknessSource ||
    config?.negative ||
    config?.darkness?.negative
  );
}
