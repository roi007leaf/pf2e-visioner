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
