(function() {
  var canvas = document.getElementById('dotTerrain');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');

  var SPACING = 28;
  var dots = [];
  var ripples = [];
  var mouseX = -9999, mouseY = -9999;
  var lastX = 0, lastY = 0;
  var smoothMouseX = -9999, smoothMouseY = -9999;

  function init() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    dots = [];

    var cols = Math.ceil(canvas.width / SPACING) + 1;
    var rows = Math.ceil(canvas.height / SPACING) + 1;

    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        dots.push({
          baseX: c * SPACING,
          baseY: r * SPACING,
          x: 0, y: 0,
          brightness: 0.15,
          targetBrightness: 0.15,
          radius: 1.5,
          targetRadius: 1.5
        });
      }
    }
  }

  document.addEventListener('mousemove', function(e) {
    mouseX = e.clientX;
    mouseY = e.clientY;

    var dx = e.clientX - lastX;
    var dy = e.clientY - lastY;
    var dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 30) {
      ripples.push({ x: e.clientX, y: e.clientY, radius: 0, strength: 1 });
      lastX = e.clientX;
      lastY = e.clientY;
    }
  });

  function animate() {
    smoothMouseX += (mouseX - smoothMouseX) * 0.2;
    smoothMouseY += (mouseY - smoothMouseY) * 0.2;

    for (var i = ripples.length - 1; i >= 0; i--) {
      ripples[i].radius += 7;
      ripples[i].strength *= 0.97;
      if (ripples[i].strength < 0.01) ripples.splice(i, 1);
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (var d = 0; d < dots.length; d++) {
      var dot = dots[d];
      var bx = dot.baseX + SPACING / 2;
      var by = dot.baseY + SPACING / 2;

      dot.targetBrightness = 0.2;
      dot.targetRadius = 1.8;

      var mdx = bx - smoothMouseX;
      var mdy = by - smoothMouseY;
      var mdist = Math.sqrt(mdx * mdx + mdy * mdy);

      if (mdist < 220) {
        var factor = 1 - mdist / 220;
        factor = factor * factor;
        dot.targetBrightness = 0.2 + factor * 0.6;
        dot.targetRadius = 1.8 + factor * 3;
      }

      for (var r = 0; r < ripples.length; r++) {
        var rip = ripples[r];
        var rdx = bx - rip.x;
        var rdy = by - rip.y;
        var rdist = Math.sqrt(rdx * rdx + rdy * rdy);
        var wavePos = rdist - rip.radius;

        var waveWidth = 120;
        if (wavePos > -40 && wavePos < waveWidth) {
          var falloff = 1 - Math.max(0, wavePos) / waveWidth;
          falloff = falloff * falloff;

          var edgeFactor = 1 - Math.abs(wavePos + 20) / 60;
          edgeFactor = Math.max(0, edgeFactor);

          var bump = (falloff * 0.5 + edgeFactor * 0.5) * rip.strength * 0.6;
          dot.targetBrightness = Math.max(dot.targetBrightness, 0.2 + bump);
          dot.targetRadius = Math.max(dot.targetRadius, 1.8 + bump * 3);
        }
      }

      dot.brightness += (dot.targetBrightness - dot.brightness) * 0.3;
      dot.radius += (dot.targetRadius - dot.radius) * 0.3;

      ctx.beginPath();
      ctx.arc(bx, by, dot.radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,' + dot.brightness + ')';
      ctx.fill();
    }

    requestAnimationFrame(animate);
  }

  window.addEventListener('resize', init);
  init();
  animate();
})();
