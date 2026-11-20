export function drawPostcardDesign(ctx, width, height, mood) {
  if (!ctx) return;
  ctx.save();
  ctx.scale(width / 880, height / 1100);
  const path = (...points) => {
    ctx.beginPath();
    ctx.moveTo(...points[0]);
    for (const point of points.slice(1)) ctx.lineTo(...point);
    ctx.stroke();
  };
  const ring = (x, y, radius) => {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
  };

  ctx.lineWidth = 1.6;
  ctx.strokeStyle = '#fff7df94';
  ctx.strokeRect(24, 24, 832, 1052);
  switch (mood) {
    case 'joy': {
      // A small sun seal leaves the photograph and its caption in focus.
      ctx.strokeStyle = '#ffe2a0e8';
      ring(757, 123, 55);
      ring(757, 123, 38);
      for (let i = 0; i < 12; i++) {
        const angle = i * Math.PI / 6;
        const x = Math.cos(angle), y = Math.sin(angle);
        path([757 + x * 47, 123 + y * 47], [757 + x * 52, 123 + y * 52]);
      }
      ctx.fillStyle = '#ffdda612';
      ctx.fillRect(25, 25, 830, 5);
      break;
    }
    case 'dream': {
      ctx.strokeStyle = '#e2d8f9b0';
      for (const width of [40, 52]) {
        ctx.beginPath();
        ctx.ellipse(760, 133, width, 67, Math.PI / 7, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (const [x, y, size] of [[760, 133, 22], [692, 175, 7], [815, 76, 8]]) {
        path([x - size, y], [x + size, y]);
        path([x, y - size], [x, y + size]);
      }
      ctx.setLineDash([2, 8]);
      path([46, 193], [46, 378]);
      path([834, 193], [834, 378]);
      break;
    }
    case 'energy':
      ctx.strokeStyle = '#ffac83ec';
      ctx.lineWidth = 3;
      path([664, 24], [856, 177]);
      path([718, 24], [856, 132]);
      ctx.lineWidth = 1.6;
      path([786, 24], [856, 79]);
      path([24, 1005], [110, 1076]);
      ctx.fillStyle = '#ff88562e';
      ctx.beginPath();
      ctx.moveTo(664, 24);
      ctx.lineTo(856, 177);
      ctx.lineTo(856, 132);
      ctx.lineTo(718, 24);
      ctx.closePath();
      ctx.fill();
      break;
    default:
      ctx.strokeStyle = '#e8eed3a8';
      path([42, 177], [42, 42], [190, 42]);
      path([690, 1058], [838, 1058], [838, 923]);
      ctx.beginPath();
      ctx.arc(796, 85, 32, 0, Math.PI * 2);
      ctx.stroke();
      path([754, 85], [838, 85]);
  }
  ctx.restore();
}
