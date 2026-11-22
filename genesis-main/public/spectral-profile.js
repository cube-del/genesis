// Windowed Fourier magnitudes for the spectral centroid and positive spectral
// flux. The latter measures attacks independently of a repeating beat or BPM.
export function spectralProfile(samples, rate, length) {
  const size = 2 ** Math.max(8, Math.min(13, Math.round(Math.log2(rate * .04))));
  const half = size / 2;
  if (length < size) return {};
  const window = new Float64Array(size), reversed = new Uint16Array(size);
  const cosine = new Float64Array(half), sine = new Float64Array(half);
  const real = new Float64Array(size), imag = new Float64Array(size);
  const previous = new Float64Array(half);
  for (let i = 0; i < size; i++) {
    window[i] = .5 - .5 * Math.cos(2 * Math.PI * i / (size - 1));
    reversed[i] = (reversed[i >> 1] >> 1) | ((i & 1) * half);
    if (i < half) {
      cosine[i] = Math.cos(2 * Math.PI * i / size);
      sine[i] = -Math.sin(2 * Math.PI * i / size);
    }
  }
  let mass = 0, moment = 0, positiveFlux = 0, comparedMass = 0;
  // 10 ms between observations gives onset strength comparable across rates.
  const hop = Math.max(1, Math.round(rate * .01));
  for (let offset = 0; offset + size <= length; offset += hop) {
    for (let i = 0; i < size; i++) {
      real[reversed[i]] = samples[offset + i] * window[i];
    }
    imag.fill(0);
    for (let width = 2; width <= size; width *= 2) {
      const wing = width / 2, stride = size / width;
      for (let start = 0; start < size; start += width) {
        for (let j = 0; j < wing; j++) {
          const a = start + j, b = a + wing, k = j * stride;
          const x = real[b] * cosine[k] - imag[b] * sine[k];
          const y = real[b] * sine[k] + imag[b] * cosine[k];
          real[b] = real[a] - x; imag[b] = imag[a] - y;
          real[a] += x; imag[a] += y;
        }
      }
    }
    for (let bin = 1; bin < half; bin++) {
      const magnitude = Math.sqrt(real[bin] ** 2 + imag[bin] ** 2);
      moment += magnitude * bin;
      mass += magnitude;
      if (offset) {
        positiveFlux += Math.max(0, magnitude - previous[bin]);
        comparedMass += magnitude;
      }
      previous[bin] = magnitude;
    }
  }
  if (!mass) return {};
  const hz = moment / mass * rate / size;
  return {
    spectralCentroidHz: Math.round(hz),
    brightness: hz / (hz + 1500),
    percussiveness: Math.min(1, 4 * positiveFlux / (comparedMass || 1))
  };
}
