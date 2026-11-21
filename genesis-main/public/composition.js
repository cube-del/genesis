// Estimate visual salience from local edges and colour contrast at the scale of a subject.
export function findFocus(pixels, size, ratio) {
  const mean = [0, 0, 0], count = size * size;
  for (let i = 0; i < pixels.length; i += 4) {
    for (let c = 0; c < 3; c++) mean[c] += pixels[i + c] / count;
  }
  const integral = new Float64Array((size + 1) ** 2), stride = size + 1;
  for (let y = 0; y < size; y++) {
    let line = 0;
    for (let x = 0; x < size; x++) {
      const i = 4 * (y * size + x);
      let energy = 0;
      for (let c = 0; c < 3; c++) {
        const value = pixels[i + c];
        const dx = x ? value - pixels[i + c - 4] : 0;
        const dy = y ? value - pixels[i + c - 4 * size] : 0;
        energy += Math.abs(dx) + Math.abs(dy) + Math.abs(value - mean[c]) * .28;
      }
      line += energy;
      integral[(y + 1) * stride + x + 1] = line + integral[y * stride + x + 1];
    }
  }
  const radius = Math.max(1, Math.round(size * .12));
  let best = 0, focus = { x: .5, y: .5, ratio };
  for (let y = radius; y <= size - radius; y++) {
    for (let x = radius; x <= size - radius; x++) {
      const left = x - radius, right = x + radius, top = (y - radius) * stride, bottom = (y + radius) * stride;
      const area = integral[bottom + right] - integral[top + right] - integral[bottom + left] + integral[top + left];
      const score = area * (1 - .35 * Math.hypot(x / size - .5, y / size - .5));
      if (score > best) { best = score; focus = { x: x / size, y: y / size, ratio }; }
    }
  }
  return focus;
}

export function imageFocus(img) {
  const size = 48, canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = 'white'; ctx.fillRect(0, 0, size, size);
  ctx.drawImage(img, 0, 0, size, size);
  return findFocus(ctx.getImageData(0, 0, size, size).data, size, img.naturalWidth / img.naturalHeight);
}

// x and y are fractions of the overflow, shared by object-position, Canvas and WebGL.
export function frameComposition(photo, mood) {
  const f = photo?.focus;
  if (!f) return { x: .5, y: .5, top: false, align: 'left' };
  const top = f.y > .57 || (mood === 'dream' && f.y > .43);
  const align = f.x < .41 ? 'right' : mood === 'joy' && f.x <= .6 ? 'center' : 'left';
  const position = (focus, visible, target) => visible >= 1 ? .5 :
    Math.min(1, Math.max(0, (focus - target * visible) / (1 - visible)));
  const crop = .8 / f.ratio;
  return { x: position(f.x, Math.min(1, crop), align === 'right' ? .34 : .61),
    y: position(f.y, Math.min(1, 1 / crop), top ? .69 : .32), top, align };
}
