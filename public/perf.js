// Loads the latest verified Myfxbook snapshot from /api/performance and
// updates the performance section. The HTML already contains a static
// snapshot, so the page still works if this request fails.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  var MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  function pct(v, signed) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    var s = Math.abs(v).toFixed(2) + '%';
    if (!signed) return s;
    return (v >= 0 ? '+' : '−') + s;
  }
  function set(id, text, color) {
    var el = $(id); if (!el) return;
    el.textContent = text;
    if (color) el.style.color = color;
  }
  var GREEN = '#7FC79A', RED = '#E0877A';

  function chart(growth) {
    var svg = $('fx-chart'); if (!svg || !growth.length) return;
    var vals = growth.map(function (p) { return p[1]; });
    var max = Math.max.apply(null, vals), min = Math.min(0, Math.min.apply(null, vals));
    var step = max > 400 ? 200 : max > 150 ? 100 : max > 60 ? 50 : 20;
    var top = Math.ceil(max / step) * step || step;
    var y0 = 235, H = 210, W = 712;
    var Y = function (v) { return y0 - (v - 0) * (H / (top - min)) - (0 - min) * 0; };
    var k = H / (top - min); Y = function (v) { return y0 - (v - min) * k; };
    var n = growth.length - 1 || 1, d = '';
    growth.forEach(function (p, i) { d += (i ? ' L' : 'M') + (i * W / n).toFixed(1) + ' ' + Y(p[1]).toFixed(1); });
    var g = '';
    for (var v = 0; v <= top; v += step) {
      g += '<line x1="0" y1="' + Y(v).toFixed(1) + '" x2="712" y2="' + Y(v).toFixed(1) + '" stroke="' + (v === 0 ? '#3A3A3F' : '#26262A') + '"></line>' +
           '<text x="722" y="' + (Y(v) + 4).toFixed(1) + '" fill="#94918B" font-family="Inter, sans-serif" font-size="11">' + v + '%</text>';
    }
    var first = growth[0][0], last = growth[growth.length - 1][0];
    var lbl = function (s) { return MONTHS[+s.slice(5, 7) - 1] + ' ' + s.slice(0, 4); };
    var lastV = vals[vals.length - 1];
    svg.setAttribute('aria-label', 'Equity growth since ' + lbl(first) + ': ' + pct(lastV, true));
    svg.innerHTML = g +
      '<path d="' + d + ' L712 ' + Y(0).toFixed(1) + ' L0 ' + Y(0).toFixed(1) + ' Z" fill="#ECEAE6" fill-opacity="0.05"></path>' +
      '<path d="' + d + '" fill="none" stroke="#ECEAE6" stroke-width="1.4" stroke-linejoin="round"></path>' +
      '<circle cx="712" cy="' + Y(lastV).toFixed(1) + '" r="3.5" fill="#ECEAE6"></circle>' +
      '<text x="0" y="274" fill="#94918B" font-family="Inter, sans-serif" font-size="11">' + lbl(first) + '</text>' +
      '<text x="712" y="274" fill="#94918B" font-family="Inter, sans-serif" font-size="11" text-anchor="end">' + lbl(last) + '</text>';

    var sp = $('fx-spark');
    if (sp) {
      var sd = '';
      growth.forEach(function (p, i) { sd += (i ? ' L' : 'M') + (i * 240 / n).toFixed(1) + ' ' + (84 - (p[1] - min) * (78 / (max - min || 1))).toFixed(1); });
      sp.innerHTML = '<path d="' + sd + ' L240 90 L0 90 Z" fill="#ECEAE6" fill-opacity="0.05"></path><path d="' + sd + '" fill="none" stroke="#DAD7D1" stroke-width="2" vector-effect="non-scaling-stroke"></path>';
    }
  }

  function monthly(m) {
    var body = $('fx-monthly'); if (!body) return;
    var years = {};
    Object.keys(m).forEach(function (k) { (years[k.slice(0, 4)] = years[k.slice(0, 4)] || {})[+k.slice(5, 7)] = m[k]; });
    var html = '';
    Object.keys(years).sort().reverse().forEach(function (y) {
      var row = '<tr style="border-top: 1px solid #2C2C31; color: #94918B"><th scope="row" style="padding: 18px 8px; text-align: left; font-weight: 400; color: #ECEAE6">' + y + '</th>';
      var tot = 1;
      for (var i = 1; i <= 12; i++) {
        var v = years[y][i];
        if (v === undefined) { row += '<td style="padding: 6px 3px"><div style="padding: 12px 0; background: #202024">—</div></td>'; continue; }
        tot *= 1 + v / 100;
        var pos = v >= 0;
        row += '<td style="padding: 6px 3px"><div style="padding: 12px 0; background: ' + (pos ? 'rgba(127,199,154,0.14)' : 'rgba(224,135,122,0.16)') + '; color: ' + (pos ? '#9AD6AE' : '#E9A196') + '">' + pct(v, true) + '</div></td>';
      }
      var t = (tot - 1) * 100;
      row += '<td style="padding: 6px 8px; color: ' + (t >= 0 ? '#9AD6AE' : '#E9A196') + '">' + pct(t, true) + '</td></tr>';
      html += row;
    });
    body.innerHTML = html;
  }

  fetch('/api/performance', { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d || !d.growth || !d.growth.length) return;
      var dt = new Date(d.asOf);
      set('fx-asof', 'UPDATED ' + dt.getUTCDate() + ' ' + MONTHS[dt.getUTCMonth()] + ' ' + dt.getUTCFullYear());
      set('fx-asof2', dt.getUTCDate() + ' ' + MONTHS_LONG[dt.getUTCMonth()] + ' ' + dt.getUTCFullYear());
      var since = d.liveSince || d.growth[0][0];
      var sinceTxt = MONTHS_LONG[+since.slice(5, 7) - 1] + ' ' + since.slice(0, 4);
      set('fx-gain', pct(d.gain, true));
      set('fx-since', 'since ' + sinceTxt);
      set('fx-t-gain-l', 'GAIN ' + dt.getUTCFullYear());
      set('fx-t-gain', pct(d.ytd, true));
      set('fx-t-dd', pct(d.drawdown));
      set('fx-t-month', pct(d.monthlyAvg, true));
      if (d.profitFactor != null) set('fx-t-pf', Number(d.profitFactor).toFixed(2));
      set('fx-r-month', pct(d.monthGain, true), d.monthGain >= 0 ? GREEN : RED);
      set('fx-r-ytd', pct(d.ytd, true), d.ytd >= 0 ? GREEN : RED);
      set('fx-r-total', pct(d.gain, true), d.gain >= 0 ? GREEN : RED);
      set('fx-r-dd', pct(d.drawdown));
      chart(d.growth);
      if (d.monthly) monthly(d.monthly);
    })
    .catch(function () {});
})();
