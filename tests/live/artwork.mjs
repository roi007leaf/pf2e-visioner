// Recognize the fixture's solid green/red/blue bars, including grayscale
// darkvision. Faint line patterns from nonvisual detection are not full art.
export function artworkPattern(png, rect) {
  if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > png.width || rect.y + rect.height > png.height || rect.width < 20 || rect.height < 20) {
    throw Error('Target outside viewport or too small to verify artwork');
  }
  const patch = (fraction) => {
    const values = [];
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const x = Math.round(rect.x + rect.width * fraction) + dx;
      const y = Math.round(rect.y + rect.height / 2) + dy;
      const offset = (y * png.width + x) * 4;
      values.push([png.data[offset], png.data[offset + 1], png.data[offset + 2]]);
    }
    return [0, 1, 2].map(channel => values.map(rgb => rgb[channel]).sort((a, b) => a - b)[24]);
  };
  const colors = [0.3, 0.5, 0.7].map(patch);
  const [green, red, blue] = colors.map(rgb => rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722);
  // Dim or desaturated Core lighting preserves the three distinct solid bar hues.
  // Gray soundwaves or a uniform sense tint cannot satisfy this signature.
  const dimArtwork = colors.every((rgb, index) => {
    const dominant = [1, 0, 2][index];
    return rgb[dominant] > 30 && rgb.every((value, channel) => channel === dominant || value + 10 < rgb[dominant]);
  });
  return { artwork: green > 110 && green > red + 35 && red > blue + 20, dimArtwork, luminance: [green, red, blue].map(Math.round) };
}

export function matchesArtwork(pattern, expected) {
  if (expected === 'dim') return pattern.artwork || pattern.dimArtwork;
  if (expected === true) return pattern.artwork;
  if (expected === false) return !pattern.artwork && !pattern.dimArtwork;
  throw Error('Unknown artwork expectation');
}

// Fixtures have a flat background. Require visible linework in the inner token
// area, independently of mesh flags; an entirely missing soundwave must fail.
export function detectionPattern(png, rect) {
  const art = artworkPattern(png, rect);
  const rgb = (x, y) => {
    const offset = (Math.round(y) * png.width + Math.round(x)) * 4;
    return [...png.data.subarray(offset, offset + 3)];
  };
  const background = rgb(Math.max(0, rect.x - 6), rect.y + rect.height / 2);
  let count = 0, signal = 0, colored = 0;
  for (let y = 0.15; y <= 0.85; y += 0.02) for (let x = 0.15; x <= 0.85; x += 0.02) {
    if (Math.hypot(x - 0.5, y - 0.5) > 0.35) continue;
    count++;
    const color = rgb(rect.x + x * rect.width, rect.y + y * rect.height);
    if (color.some((v, channel) => Math.abs(v - background[channel]) >= 15)) {
      signal++;
      if (Math.max(...color) - Math.min(...color) > 18) colored++;
    }
  }
  return { visible: !art.artwork && !art.dimArtwork && signal / count > 0.02,
    neutral: colored <= signal * 0.05, signalPixels: signal, coloredPixels: colored, samples: count };
}

export function stateOutlinePattern(png, rect, expected) {
  if (!['orange', 'yellow'].includes(expected)) throw Error('Unknown state outline color');
  let coloredPixels = 0;
  const left = Math.max(0, Math.floor(rect.x - 5));
  const top = Math.max(0, Math.floor(rect.y - 5));
  const right = Math.min(png.width - 1, Math.ceil(rect.x + rect.width + 5));
  const bottom = Math.min(png.height - 1, Math.ceil(rect.y + rect.height + 5));
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
    const edgeDistance = Math.min(
      Math.abs(x - rect.x), Math.abs(x - (rect.x + rect.width)),
      Math.abs(y - rect.y), Math.abs(y - (rect.y + rect.height)),
    );
    if (edgeDistance > 7) continue;
    const offset = (y * png.width + x) * 4;
    const [red, green, blue] = png.data.subarray(offset, offset + 3);
    const matches = expected === 'orange'
      ? red >= 100 && green >= 25 && green <= 120 && blue <= 70 && red >= green * 1.35
      : red >= 100 && green >= 70 && blue <= 70 && red <= green * 1.6;
    if (matches) coloredPixels += 1;
  }
  return { visible: coloredPixels >= 3, coloredPixels };
}

export function gmObserverHiddenCompositePattern(png, rect, laterPng = null) {
  const art = artworkPattern(png, rect);
  const [green, red, blue] = art.luminance;
  const artwork = green > 70 && green > red + 15 && red > blue + 8;
  const ranges = [0.3, 0.5, 0.7].map(fraction => {
    const values = [];
    for (let y = 0.2; y <= 0.8; y += 0.02) {
      const xPixel = Math.round(rect.x + rect.width * fraction);
      const yPixel = Math.round(rect.y + rect.height * y);
      const offset = (yPixel * png.width + xPixel) * 4;
      values.push(
        png.data[offset] * 0.2126 +
        png.data[offset + 1] * 0.7152 +
        png.data[offset + 2] * 0.0722,
      );
    }
    return Math.max(...values) - Math.min(...values);
  });
  let animatedPixels = 0;
  if (laterPng) {
    for (let y = Math.floor(rect.y + rect.height * 0.12); y < rect.y + rect.height * 0.88; y++) {
      for (let x = Math.floor(rect.x + rect.width * 0.12); x < rect.x + rect.width * 0.88; x++) {
        const offset = (y * png.width + x) * 4;
        const delta = Math.max(
          Math.abs(png.data[offset] - laterPng.data[offset]),
          Math.abs(png.data[offset + 1] - laterPng.data[offset + 1]),
          Math.abs(png.data[offset + 2] - laterPng.data[offset + 2]),
        );
        if (delta >= 14) animatedPixels++;
      }
    }
  }
  // Static orange art or linework is not a soundwave. Foundry's hearing filter
  // must visibly animate between frames while the underlying artwork remains.
  const soundwaves = !!laterPng && animatedPixels >= 8;
  return { visible: artwork && soundwaves, artwork, soundwaves, animatedPixels, luminance: art.luminance, ranges };
}
