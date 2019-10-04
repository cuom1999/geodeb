function init(resourceDir) {
    initDom();
    initScripts(resourceDir, runApp);
}

function initScripts(dir, callback) {
    var scripts = ['rainbow.js', 'viewport.js', 'movieroll.js', 'source-view.js'];
    var loaded = 0;
    scripts.forEach(function(script, i) {
  var scriptTag = document.createElement('script');
  scriptTag.src = dir + script;
  scriptTag.onload = function () {
      loaded += 1;
      if (loaded == scripts.length) {
    callback();
      }
  };
  document.head.appendChild(scriptTag);
    });
    var cssTag = document.createElement('link');
    cssTag.rel = 'stylesheet';
    cssTag.href = dir + 'main.css';
    document.head.appendChild(cssTag);
}

function initDom() {
    var rootElement = document.getElementById('rootElement');
    rootElement.innerHTML = `
<div class="top-panel">
  <div class="message-panel" id="messagePanel"></div>
  <div class="vertical-bar"></div>
  <div class="frame-panel">
    <button id="jumpPrev">&#8676;</button>
    <button class='step' id="stepPrev">&#8672;</button>
    <span class="tmp"></span>
    <button class='step' id="stepNext">&#8674;</button>
    <button id="jumpNext">&#8677;</button>
  </div>
  <div class="vertical-bar"></div>
  <div class="coords-panel" id="coordsPanel"></div>
  <div class="vertical-bar"></div>
  <div class="options-panel">
    <input type="checkbox" id="gridCheckbox" checked>Show grid</input>
    <input type="checkbox" id="freeCameraCheckbox">Free camera</input>
  </div>
</div>
<canvas id="canvas">
</canvas>
<div class="source-panel">
  <pre id="sourceElement"><code id="sourceBox"></code></pre>
</div>
`
}

function runApp() {
  var jumpPrevButton = document.getElementById('jumpPrev');
  var jumpNextButton = document.getElementById('jumpNext');
  var stepPrevButton = document.getElementById('stepPrev');
  var stepNextButton = document.getElementById('stepNext');
  var coordsPanel = document.getElementById('coordsPanel');
  var gridCheckbox = document.getElementById('gridCheckbox');
  var freeCameraCheckbox = document.getElementById('freeCameraCheckbox');
  var messagePanel = document.getElementById('messagePanel');
  var rootElement = document.getElementById('rootElement');
  var sourceElement = document.getElementById('sourceElement');
  var sourceBox = document.getElementById('sourceBox');
  var canvas = document.getElementById('canvas');
  var viewport = new Viewport(canvas);
  var W = 0;
  var H = 0;
  var dark = false;
  var sourceView = new SourceView(sourceBox);
  var movieRoll = null;
  var drawStack = []; 
  function restart() {
      sourceView.setSource([]);
      messagePanel.innerHTML = '';
      movieRoll = null;
      drawStack = [];
      dark = false;
      resize();
      draw();
      if (jsonData.root) {
          if (jsonData.source_code) {
              sourceView.setSource(jsonData.source_code);
          }
          dark = jsonData.theme == 'dark';
          movieRoll = new MovieRoll(jsonData.root);
      }
      if (dark) {
          rootElement.classList.add('dark');
      } else {
          rootElement.classList.remove('dark');
      }
      resize();
      if (movieRoll != null) {
          messagePanel.innerHTML = '<span class="ok">Success</span>';
          nextFrame();
      } else {
          draw();
          messagePanel.innerHTML = '<span class="error">Error</span>';
      }
  }

  function updateControls() {
      if (movieRoll == null) {
          jumpPrevButton.disabled = true;
          jumpNextButton.disabled = true;
          stepPrevButton.disabled = true;
          stepNextButton.disabled = true;
      } else {
          var frame = movieRoll.currentFrame;
          jumpPrevButton.disabled = frame.prev == null;
          jumpNextButton.disabled = frame.next == null;
          stepPrevButton.disabled = frame.prev == null;
          stepNextButton.disabled = frame.next == null;
      }
  }
    
  function resize() {
      W = window.innerWidth;
      H = window.innerHeight - 41;
      var targetWidth = sourceView.lines.length == 0 ? 180 : 700;
      var actualWidth = Math.min(targetWidth, Math.floor(W / 2));
      sourceElement.style.height = H + 'px';
      sourceElement.style.width = actualWidth + 'px';
      canvas.width = W - actualWidth;
      canvas.height = H;
  }


  function canvasX(x) { return (x - viewport.x0) / viewport.scale; }
  function canvasY(y) { return H - (y - viewport.y0) / viewport.scale; }
  function planeX(x) { return viewport.x0 + x * viewport.scale; }
  function planeY(y) { return viewport.y0 + (H - y) * viewport.scale; }
  function rgbToString(rgb) {
      return 'rgb(' + rgb[0] + ', ' + rgb[1] + ', ' + rgb[2] + ')';
  }

  function drawGrid(ctx) {
      var draw = gridCheckbox.checked;
      if (draw == false) return;
      var x1 = planeX(0);
      var y1 = planeY(H);
      var x2 = planeX(W);
      var y2 = planeY(0);
      var p0 = 1;
      while (p0 / viewport.scale < 15) p0 *= 2;
      var pAdjustment = p0 / viewport.scale / 15;
      ctx.lineWidth = 1;
      for (var p = p0; p <= p0 * 16; p *= 2) {
          var spacing = p / viewport.scale;
          var pp = p / p0;
          var grey = Math.max(175, 255 - (p / viewport.scale / 15) * 5);
          if (dark) {
              grey = 255 - grey + 50;
          }
          ctx.strokeStyle = rgbToString([grey, grey, grey]);
          for (var i = Math.floor(x1 / p); i * p <= x2; i += 1) {
              var t = (i & -i);
              if (pp < 16 && t >= 2) continue;
              var x = canvasX(i * p);
              ctx.beginPath();
              ctx.moveTo(x, 0);
              ctx.lineTo(x, H);
              ctx.stroke();
          } 
          for (var i = Math.floor(y1 / p); i * p <= y2; i += 1) {
              var t = (i & -i);
              if (pp < 16 && t >= 2) continue;
              var y = canvasY(i * p);
              ctx.beginPath();
              ctx.moveTo(0, y);
              ctx.lineTo(W, y);
              ctx.stroke();
          }
      }
  }
  
  function draw() {
      updateControls();
      var ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, W, H);
      drawGrid(ctx, W, H);
      drawStack.forEach(function(item) {
          ctx.strokeStyle = dark ? 'white' : 'black';
          ctx.fillStyle = dark ? 'white' : 'black';
          var lineWidth = 1;
          var hasFill = false;
          var attr = 'attr' in item ? item.attr : '';
          attr.split(' ').forEach(function(s) {
              if (s == 'bold') {
                  lineWidth += 2;
              } else {
                  tokens = s.split(':');
                  if (tokens.length >= 1) {
                      if (tokens[0] == 'rainbow') {
                          ctx.strokeStyle = rgbToString(rainbow(item.progress)); 
                      } else if (tokens[0] == 'lightrainbow') {
                          ctx.strokeStyle = rgbToString(lightRainbow(item.progress));
                      } else {
                          ctx.strokeStyle = tokens[0];
                      }
                  }
                  if (tokens.length >= 2) {
                      if (tokens[1] == 'rainbow') {
                          ctx.fillStyle = rgbToString(rainbow(item.progress)); 
                      } else if (tokens[1] == 'lightrainbow') {
                          ctx.fillStyle = rgbToString(lightRainbow(item.progress));
                      } else {
                          ctx.fillStyle = tokens[1];
                      }
                      hasFill = true;
                  }
              }
          });
          ctx.lineWidth = lineWidth;
          var isPolygon = (item.type == 'polygon' ||
                           item.type == 'triangle' ||
                           item.type == 'rect');
          var isPolyline = (item.type == 'polyline' ||
                            item.type == 'segment');
          if (item.type == 'point') {
              if (!hasFill) {
                  ctx.fillStyle = ctx.strokeStyle;
              }
              ctx.beginPath();
              ctx.arc(canvasX(item.x), canvasY(item.y), 3, 0, 2 * Math.PI, true);
              ctx.fill();
              ctx.stroke();
          } else if (item.type == 'circ') {
              ctx.beginPath();
              ctx.arc(canvasX(item.x), canvasY(item.y), item.r / viewport.scale,
                      0, 2 * Math.PI, true);
              if (hasFill) {
                  ctx.fill();
              }
              ctx.stroke();
          } else if (item.type == 'arc' || item.type == 'pie') {
              ctx.beginPath();
              var centerX = canvasX(item.x);
              var centerY = canvasY(item.y);
              if (item.type == 'pie') {
                  ctx.moveTo(centerX, centerY);
              }
              ctx.arc(centerX, centerY, item.r / viewport.scale,
                      -item.eAngle, -item.sAngle, false);
              if (item.type == 'pie') {
                  ctx.lineTo(centerX, centerY);
              }
              if (hasFill) {
                  ctx.fill();
              }
              ctx.stroke();
          } else if (isPolygon || isPolyline) {
              var firstX = null;
              var firxtY = null;
              ctx.beginPath();
              item.points.forEach(function(point, i) {
                  var x = canvasX(point[0]);
                  var y = canvasY(point[1]);
                  if (i == 0) {
                      firstX = x;
                      firstY = y;
                      ctx.moveTo(x, y);
                  } else {
                      ctx.lineTo(x, y);
                  }
              });
              if (isPolygon) {
                  ctx.lineTo(firstX, firstY);
                  if (hasFill) {
                      ctx.fill();
                  }
              }
              ctx.stroke();
          } else if (item.type == 'line') {
              var x1 = planeX(0);
              var x2 = planeX(W);
              var y1 = planeY(H);
              var y2 = planeY(0);
              var noPoints = true;
              var xMin = null;
              var yMin = null;
              var xMax = null;
              var yMax = null;
              
              function considerPoint(x, y) {
                  if (x < x1 - 1 || x > x2 + 1) return;
                  if (y < y1 - 1 || y > y2 + 1) return;
                  if (noPoints || (x < xMin || x == xMin && (y < yMin))) {
                      xMin = x;
                      yMin = y;
                  }
                  if (noPoints || (x > xMax || x == xMax && (y > yMax))) {
                      xMax = x;
                      yMax = y;
                  }
                  noPoints = false;
              }

              var x0 = item.x1;
              var y0 = item.y1;
              var dx = item.x2 - item.x1;
              var dy = item.y2 - item.y1;
              [x1, x2].forEach(function(x) {
                  if (dx != 0) {
                      considerPoint(x, y0 + (x - x0) * dy / dx);
                  }
              });
              [y1, y2].forEach(function(y) {
                  if (dy != 0) {
                      considerPoint(x0 + (y - y0) * dx / dy, y);
                  }
              });
              
              if (!noPoints) {
                  ctx.beginPath();
                  ctx.moveTo(canvasX(xMin), canvasY(yMin));
                  ctx.lineTo(canvasX(xMax), canvasY(yMax));
                  ctx.stroke();
              }
          }
      });
  }

  function nextFrame(step) {
      if (movieRoll == null) return;
      for (;;) {
          var transition = movieRoll.currentFrame.next;
          if (transition == null) break;
          transition.actions.forEach(function(action) {
              if (action.type == 'add') {
                  drawStack.push(action.data);
              } else if (action.type == 'remove') {
                  drawStack.pop();
              } else if (action.type == 'execute') {
                  sourceView.highlight(action.data.line, action.data.type, 'added');
                  sourceView.updateTooltip(action.data.line, action.data.type,
                                           action.data.newLabel, true);
              }
          });
          movieRoll.currentFrame = transition.next;
          if (step || movieRoll.currentFrame.breakpoint) break;
      }
      if (!freeCameraCheckbox.checked) {
          var b = movieRoll.currentFrame.box;
          viewport.setBox(b.minX, b.minY, b.maxX, b.maxY, true);
      }
      draw();
  }

  function prevFrame(step) {
      if (movieRoll == null) return;
      for (;;) {
          var transition = movieRoll.currentFrame.prev;
          if (transition == null) break;
          transition.actions.slice().reverse().forEach(function(action) {
              if (action.type == 'remove') {
                  drawStack.push(action.data);
              } else if (action.type == 'add') {
                  drawStack.pop();
              } else if (action.type == 'execute') {
                  sourceView.highlight(action.data.line, action.data.type, 'removed');
                  sourceView.updateTooltip(action.data.line, action.data.type,
                                           action.data.oldLabel, true);
              }
          });
          movieRoll.currentFrame = transition.prev;
          if (step || movieRoll.currentFrame.breakpoint) break;
      }
      if (!freeCameraCheckbox.checked) {
          var b = movieRoll.currentFrame.box;
          viewport.setBox(b.minX, b.minY, b.maxX, b.maxY, true);
      }
      draw();
  }

  function keypress(e) {
      if (e.key == 'ArrowRight') {
          nextFrame(false);
      } else if (e.key == 'ArrowLeft') {
          prevFrame(false);
      } else if (e.key == ',') {
          prevFrame(true);
      } else if (e.key == '.') {
          nextFrame(true);
      }
  }

  function updateCoords() {
      if (viewport.coordsX == null || viewport.coordsY == null) {
          coordsPanel.innerHTML = '';
      } else {
          var digits = Math.max(0,
                                -Math.floor(Math.log10(viewport.scale)));
          coordsPanel.innerHTML =
              (viewport.coordsX.toFixed(digits) + ', ' +
               viewport.coordsY.toFixed(digits));
      }
  }

  restart();
  updateCoords();
  viewport.addDrawEventListener(draw);
  viewport.addCoordsEventListener(updateCoords);
  window.addEventListener('resize', function() { resize(); draw(); }, false);
  document.addEventListener('keydown', keypress, false);
  gridCheckbox.addEventListener('change', function() { draw(); }, false);
  jumpPrevButton.addEventListener('click', function() { prevFrame(false); }, false);
  stepPrevButton.addEventListener('click', function() { prevFrame(true); }, false);
  stepNextButton.addEventListener('click', function() { nextFrame(true); }, false);
  jumpNextButton.addEventListener('click', function() { nextFrame(false); }, false);
}
