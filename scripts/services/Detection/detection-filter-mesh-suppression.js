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

export function withDetectionFilterPrimaryMesh(token, render) {
  const mesh = token?.mesh;
  if (!token?.detectionFilter || !mesh || !suppressedMeshes.has(mesh)) return render();
  // Core draws the filter by calling the primary mesh directly. Permit that draw only;
  // keep the separate, unfiltered primary pass suppressed before and after it.
  const visible = mesh.visible;
  const renderable = mesh.renderable;
  mesh.visible = true;
  mesh.renderable = true;
  try {
    return render();
  } finally {
    mesh.visible = visible;
    mesh.renderable = renderable;
  }
}

// Core may assign a new filter without a stored visibility transition. Keep
// ownership of the container flags we clear so that refresh can release them.
const clearedFilterMeshes = new WeakMap();
const clearedFilterValues = { visible: false, renderable: false, alpha: 0 };

export function suppressDetectionFilterMesh(token) {
  const mesh = token?.detectionFilterMesh;
  if (!mesh) return;
  if (!clearedFilterMeshes.has(mesh)) {
    const previous = {};
    for (const key of Object.keys(clearedFilterValues)) if (key in mesh) previous[key] = mesh[key];
    clearedFilterMeshes.set(mesh, previous);
  }
  for (const [key, value] of Object.entries(clearedFilterValues)) if (key in mesh) mesh[key] = value;
}

export function releaseDetectionFilterMesh(token) {
  const mesh = token?.detectionFilterMesh;
  const previous = mesh && clearedFilterMeshes.get(mesh);
  if (!previous) return;
  clearedFilterMeshes.delete(mesh);
  for (const [key, value] of Object.entries(previous)) {
    if (mesh[key] === clearedFilterValues[key]) mesh[key] = value;
  }
}
