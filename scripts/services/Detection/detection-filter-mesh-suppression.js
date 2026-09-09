const suppressedMeshes = new WeakSet();

export function suppressDetectionFilterPrimaryMesh(token) {
  const mesh = token?.mesh;
  if (!mesh) return;
  if ('visible' in mesh) mesh.visible = false;
  if ('renderable' in mesh) {
    suppressedMeshes.add(mesh);
    mesh.renderable = false;
  }
}

export function releaseDetectionFilterPrimaryMesh(token) {
  const mesh = token?.mesh;
  if (!mesh || !suppressedMeshes.has(mesh)) return;
  suppressedMeshes.delete(mesh);
  // Core owns visible/alpha; only release the render flag set by our filter presentation.
  // Clearing a filter can happen after Core's visibility refresh during a door update.
  mesh.renderable = true;
}
