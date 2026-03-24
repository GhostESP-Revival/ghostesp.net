/**
 * Dot Terrain - Simple debug version
 */
console.log('[DT] Script loaded');

var dtCanvas = document.getElementById('dotTerrain');
console.log('[DT] Canvas:', dtCanvas ? 'FOUND' : 'NOT FOUND', dtCanvas);

if (dtCanvas) {
  var dtCtx = dtCanvas.getContext('2d');
  console.log('[DT] Context:', dtCtx ? 'OK' : 'FAIL');
  
  // Sizing
  dtCanvas.width = window.innerWidth;
  dtCanvas.height = window.innerHeight;
  
  // Dot config
  var DT_SPACING = 35;
  var DT_COLS = Math.ceil(dtCanvas.width / DT_SPACING);
  var DT_ROWS = Math.ceil(dtCanvas.height / DT_SPACING);
  
  console.log('[DT] Grid:', DT_COLS, 'x', DT_ROWS, '=', DT_COLS * DT_ROWS, 'dots');
  
  // Mouse state
  var dtMouseX = -10000;
  var dtMouseY = -10000;
  var dtMouseActive = false;
  
  // Track mouse
  document.addEventListener('mousemove', function(e) {
    dtMouseX = e.clientX;
    dtMouseY = e.clientY;
    dtMouseActive = true;
  });
  
  document.addEventListener('mouseleave', function() {
    dtMouseActive = false;
  });
  
  console.log('[DT] Mouse listener attached');
  
  // Animation loop
  var dtFrame = 0;
  function dtAnimate() {
    dtFrame++;
    
    // Clear
    dtCtx.clearRect(0, 0, dtCanvas.width, dtCanvas.height);
    
    // Draw dots
    for (var row = 0; row < DT_ROWS; row++) {
      for (var col = 0; col < DT_COLS; col++) {
        var x = col * DT_SPACING + DT_SPACING/2;
        var y = row * DT_SPACING + DT_SPACING/2;
        
        var radius = 1.5;
        var opacity = 0.15;
        
        // Mouse effect
        if (dtMouseActive) {
          var dx = x - dtMouseX;
          var dy = y - dtMouseY;
          var dist = Math.sqrt(dx*dx + dy*dy);
          
          if (dist < 200) {
            var factor = 1 - (dist / 200);
            radius = 1.5 + factor * 3;
            opacity = 0.15 + factor * 0.5;
          }
        }
        
        // Draw
        dtCtx.beginPath();
        dtCtx.arc(x, y, radius, 0, Math.PI * 2);
        dtCtx.fillStyle = 'rgba(255,255,255,' + opacity + ')';
        dtCtx.fill();
      }
    }
    
    // Log occasionally
    if (dtFrame % 120 === 0) {
      console.log('[DT] Frame', dtFrame, 'Mouse:', dtMouseX, dtMouseY, 'Active:', dtMouseActive);
    }
    
    requestAnimationFrame(dtAnimate);
  }
  
  // Start
  dtAnimate();
  console.log('[DT] STARTED - watching for movement');
  
} else {
  console.error('[DT] ABORT - no canvas element');
}
