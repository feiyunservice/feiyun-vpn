(function(){
  // ── Config ──────────────────────────────────────────────────────
  var API_BASE = '/api';  // Change to your actual API URL
  var STORAGE_KEY = 'feiyun_web_device_id';
  var TURNSTILE_SITE_KEY = '0x4AAAAAADzcJqMixzWyW_xj';  // Change to your Cloudflare Turnstile site key

  // Cache config — bump CACHE_VERSION when you update packages/payment-methods on the backend
  // (this invalidates old caches for all users on their next visit).
  var CACHE_VERSION = '1';
  var CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
  var CACHE_PREFIX = 'feiyun_cache_v' + CACHE_VERSION + '_';

  function readCache(key){
    try{
      var raw = localStorage.getItem(CACHE_PREFIX + key);
      if(!raw) return null;
      var obj = JSON.parse(raw);
      if(Date.now() - obj.t > CACHE_TTL){ localStorage.removeItem(CACHE_PREFIX + key); return null; }
      return obj.d;
    }catch(e){ return null; }
  }
  function writeCache(key, data){
    try{ localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({d:data, t:Date.now()})); }catch(e){}
  }

  // ── Fallback packages (shown if API fails) ──────────────────────
  var FALLBACK = [
    {package_id:'monthly',name:'月付',duration_days:30,traffic_gb:50,price:'9.00',currency:'CNY',description:'适合短期使用或先体验一下。',max_devices:3},
    {package_id:'halfyear',name:'半年付',duration_days:180,traffic_gb:400,price:'49.00',currency:'CNY',description:'平均每月仅 ¥10.7，性价比最高。',max_devices:4},
    {package_id:'yearly',name:'年付',duration_days:365,traffic_gb:1000,price:'89.00',currency:'CNY',description:'适合全家或多设备共享使用。',max_devices:5},
  ];

  // ── State ───────────────────────────────────────────────────────
  var packages = [];
  var paymentMethods = [];
  var selectedPkg = null;
  var selectedPayMethod = null;
  var webDeviceId = null;
  var pollTimer = null;
  var captchaToken = null;
  var cfWidgetId = null;

  // ── Helpers ─────────────────────────────────────────────────────
  function uuid(){
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){
      var r=Math.random()*16|0;return(c==='x'?r:(r&0x3|0x8)).toString(16);
    });
  }
  function getDeviceId(){
    if(webDeviceId) return webDeviceId;
    webDeviceId = localStorage.getItem(STORAGE_KEY);
    if(!webDeviceId){ webDeviceId = uuid(); localStorage.setItem(STORAGE_KEY, webDeviceId); }
    return webDeviceId;
  }
  function $(id){ return document.getElementById(id); }
  // Detect HTTP 429 (Too Many Requests) or DRF throttle payload
  function isRateLimited(status, body){
    if(status === 429) return true;
    if(body && body.detail && /throttle/i.test(body.detail)) return true;
    return false;
  }
  var RATE_LIMIT_MSG = '请求过快，请稍后尝试';
  function formatPrice(pkg){
    var p = parseFloat(pkg.price);
    return '¥' + (p % 1 === 0 ? p.toFixed(0) : p.toFixed(2));
  }
  function durationLabel(days){
    if(days <= 7) return '周';
    if(days <= 31) return '月';
    if(days <= 93) return '季度';
    if(days <= 186) return '半年';
    return '年';
  }
  function isFeatured(idx, total){
    return total === 3 ? idx === 1 : (total > 1 ? idx === Math.floor(total/2) : false);
  }

  // ── Turnstile (human verification) ─────────────────────────
  function turnstileEnabled(){
    return TURNSTILE_SITE_KEY && TURNSTILE_SITE_KEY !== 'YOUR_SITE_KEY' && window.turnstile;
  }
  function updatePayBtn(){
    var captchaOk = !turnstileEnabled() || !!captchaToken;
    var ready = selectedPayMethod && captchaOk;
    $('payBtn').disabled = !ready;
    if(ready){
      $('payBtn').textContent = '立即支付 ' + formatPrice(selectedPkg);
    } else if(!selectedPayMethod){
      $('payBtn').textContent = '选择支付方式后继续';
    } else {
      $('payBtn').textContent = '请完成人机验证';
    }
  }
  window.onCaptchaOk = function(token){ captchaToken = token; updatePayBtn(); };
  window.onCaptchaExpire = function(){ captchaToken = null; updatePayBtn(); };
  function renderTurnstile(){
    if(!turnstileEnabled()) return;
    if(cfWidgetId !== null){ window.turnstile.reset(cfWidgetId); captchaToken = null; updatePayBtn(); return; }
    cfWidgetId = window.turnstile.render('#cfWidget', {
      sitekey: TURNSTILE_SITE_KEY,
      callback: window.onCaptchaOk,
      'expired-callback': window.onCaptchaExpire,
      'error-callback': window.onCaptchaExpire
    });
  }

  function renderPackages(pkgs){
    packages = pkgs;
    var grid = $('priceGrid');
    if(!pkgs || pkgs.length === 0){
      grid.innerHTML = '<div class="loading">暂无可用套餐</div>';
      return;
    }
    var html = '';
    pkgs.forEach(function(pkg, i){
      var featured = isFeatured(i, pkgs.length);
      var label = durationLabel(pkg.duration_days);
      html += '<div class="price-card' + (featured ? ' featured' : '') + '">';
      if(featured) html += '<div class="price-badge">最划算</div>';
      html += '<div class="price-tier">' + pkg.name + '</div>';
      html += '<div class="price-amount">' + formatPrice(pkg) + '<span>/ ' + label + '</span></div>';
      html += '<div class="price-desc">' + (pkg.description || '') + '</div>';
      html += '<ul class="price-list">';
      html += '<li>' + pkg.traffic_gb + 'G 流量</li>';
      var devs = pkg.max_devices || (pkg.duration_days <= 31 ? 3 : pkg.duration_days <= 186 ? 4 : 5);
      html += '<li>支持 ' + devs + ' 台设备</li>';
      html += '<li>节点不限速</li>';
      html += '<li>在线客服支持</li>';
      if(pkg.duration_days > 186) html += '<li>专属节点优先体验</li>';
      html += '</ul>';
      html += '<button class="price-btn" onclick="openPurchase(\'' + pkg.package_id + '\')">' + (featured ? '立即购买' : '选择' + pkg.name) + '</button>';
      html += '</div>';
    });
    grid.innerHTML = html;
  }

  // ── Load packages from API (with localStorage cache) ──────────
  function loadPackages(){
    var cached = readCache('packages');
    if(cached && cached.length){
      renderPackages(cached); // cache hit — render and stop, no network request
      return;
    }
    // cache miss or expired — fetch
    fetch(API_BASE + '/web/packages/', { cache: 'no-store' })
      .then(function(r){ if(!r.ok) throw new Error(r.status); return r.json(); })
      .then(function(data){
        var list = Array.isArray(data) ? data : [];
        if(list.length) writeCache('packages', list);
        renderPackages(list.length ? list : FALLBACK);
      })
      .catch(function(){ renderPackages(FALLBACK); });
  }

  // ── Load payment methods (with localStorage cache) ──────────────
  function loadPaymentMethods(cb){
    var cached = readCache('pay_methods');
    if(cached && cached.length){
      paymentMethods = cached;
      cb(cached); // cache hit — use cached list and stop, no network request
      return;
    }
    // cache miss or expired — fetch
    fetch(API_BASE + '/web/payment-methods/', { cache: 'no-store' })
      .then(function(r){ if(!r.ok) throw new Error(r.status); return r.json(); })
      .then(function(data){
        var list = Array.isArray(data) ? data : [];
        if(list.length) writeCache('pay_methods', list);
        paymentMethods = list.length ? list : [{type_id:'alipay',name:'支付宝'},{type_id:'wxpay',name:'微信支付'}];
        cb(paymentMethods);
      })
      .catch(function(){
        paymentMethods = [{type_id:'alipay',name:'支付宝'},{type_id:'wxpay',name:'微信支付'}];
        cb(paymentMethods);
      });
  }

  // ── Purchase flow ───────────────────────────────────────────────
  window.openPurchase = function(pkgId){
    selectedPkg = packages.find(function(p){ return p.package_id === pkgId; });
    if(!selectedPkg) selectedPkg = FALLBACK.find(function(p){ return p.package_id === pkgId; });
    if(!selectedPkg) return;

    selectedPayMethod = null;
    captchaToken = null;
    showStep('step-pay');
    $('payBtn').disabled = true;
    $('payBtn').textContent = '选择支付方式后继续';

    // Render package info
    $('modalInfo').innerHTML =
      '<div class="info-row"><span class="label">套餐</span><span class="value">' + selectedPkg.name + '</span></div>' +
      '<div class="info-row"><span class="label">流量</span><span class="value">' + selectedPkg.traffic_gb + ' GB</span></div>' +
      '<div class="info-row"><span class="label">时长</span><span class="value">' + selectedPkg.duration_days + ' 天</span></div>' +
      '<div class="info-row"><span class="label">价格</span><span class="value" style="color:var(--amber)">' + formatPrice(selectedPkg) + '</span></div>';

    // Load payment methods
    $('payMethods').innerHTML = '<div class="loading"><span class="spinner"></span> 加载支付方式...</div>';
    loadPaymentMethods(function(methods){
      var html = '';
      methods.forEach(function(m){
        var icon = m.type_id === 'alipay' ? '💙' : (m.type_id === 'wxpay' ? '💚' : '💳');
        html += '<div class="pay-method" data-method="' + m.type_id + '" onclick="selectPayMethod(\'' + m.type_id + '\')">';
        html += '<span class="radio"></span>';
        html += '<span class="pm-name">' + icon + ' ' + (m.name || m.type_id) + '</span>';
        html += '</div>';
      });
      $('payMethods').innerHTML = html;
    });

    $('modal').classList.add('active');
    renderTurnstile();
  };

  window.selectPayMethod = function(methodId){
    selectedPayMethod = methodId;
    document.querySelectorAll('.pay-method').forEach(function(el){
      el.classList.toggle('selected', el.getAttribute('data-method') === methodId);
    });
    updatePayBtn();
  };

  $('payBtn').addEventListener('click', function(){
    if(!selectedPkg || !selectedPayMethod) return;
    $('payBtn').disabled = true;
    $('payBtn').innerHTML = '<span class="spinner"></span> 创建订单中...';

    fetch(API_BASE + '/web/purchase/', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        package_id: selectedPkg.package_id,
        payment_method: selectedPayMethod,
        web_device_id: getDeviceId(),
        captcha_token: captchaToken || ''
      })
    })
    .then(function(r){
      return r.json().then(function(data){ return {status: r.status, data: data}; });
    })
    .then(function(res){
      if(isRateLimited(res.status, res.data)){
        showStep('step-result');
        $('resultBox').innerHTML =
          '<div class="icon">⏱️</div>' +
          '<div class="msg">' + RATE_LIMIT_MSG + '</div>' +
          '<button class="copy-btn" onclick="closeModal()">关闭</button>';
        return;
      }
      var data = res.data;
      if(data.success && data.payment_url){
        showStep('step-result');
        $('resultBox').innerHTML =
          '<div class="icon">🔗</div>' +
          '<div class="msg">订单已创建，正在跳转到支付页面...<br>支付完成后请返回此页面查看激活码。</div>' +
          '<div id="pollStatus"><span class="spinner"></span> 等待支付完成...</div>';
        // Open payment in new tab
        window.open(data.payment_url, '_blank');
        // Start polling
        startPolling(data.order_no);
      } else {
        showStep('step-result');
        $('resultBox').innerHTML =
          '<div class="icon">❌</div>' +
          '<div class="msg">' + (data.message || '创建订单失败，请稍后重试') + '</div>' +
          '<button class="copy-btn" onclick="closeModal()">关闭</button>';
      }
    })
    .catch(function(e){
      showStep('step-result');
      $('resultBox').innerHTML =
        '<div class="icon">❌</div>' +
        '<div class="msg">网络错误，请检查网络后重试</div>' +
        '<button class="copy-btn" onclick="closeModal()">关闭</button>';
    });
  });

  // ── Poll order status ───────────────────────────────────────────
  function startPolling(orderNo){
    var attempts = 0;
    var maxAttempts = 120; // 5 minutes at 2.5s interval
    pollTimer = setInterval(function(){
      attempts++;
      if(attempts > maxAttempts){
        clearInterval(pollTimer);
        $('pollStatus').innerHTML = '<span style="color:var(--text-faint)">支付超时，请检查支付状态后刷新页面</span>';
        return;
      }
      fetch(API_BASE + '/web/order-status/' + orderNo + '/?web_device_id=' + getDeviceId())
        .then(function(r){ return r.json(); })
        .then(function(data){
          if(data.status === 'paid' && data.activation_code){
            clearInterval(pollTimer);
            $('resultBox').innerHTML =
              '<div class="icon">🎉</div>' +
              '<div class="msg">支付成功！你的激活码：</div>' +
              '<div class="code-display">' + data.activation_code + '</div>' +
              '<button class="copy-btn" onclick="copyCode(\'' + data.activation_code + '\')">复制激活码</button>' +
              '<a href="tutorial.html" class="copy-btn" style="text-decoration:none;">打开飞云激活 →</a>';
          } else if(data.status === 'failed' || data.status === 'expired'){
            clearInterval(pollTimer);
            $('pollStatus').innerHTML = '<span style="color:var(--text-faint)">订单已' + (data.status === 'expired' ? '过期' : '失败') + '</span>';
          }
          // else keep polling (pending)
        })
        .catch(function(){}); // silently retry
    }, 2500);
  }

  window.copyCode = function(code){
    navigator.clipboard.writeText(code).then(function(){
      var btn = event.target;
      var orig = btn.textContent;
      btn.textContent = '已复制!';
      btn.style.borderColor = 'var(--green)';
      btn.style.color = 'var(--green)';
      setTimeout(function(){ btn.textContent = orig; btn.style.borderColor = ''; btn.style.color = ''; }, 2000);
    });
  };

  // ── Modal helpers ───────────────────────────────────────────────
  function showStep(id){
    document.querySelectorAll('.modal-step').forEach(function(el){ el.classList.remove('active'); });
    $(id).classList.add('active');
  }
  window.closeModal = function(){
    $('modal').classList.remove('active');
    if(pollTimer) clearInterval(pollTimer);
  };
  $('modalClose').addEventListener('click', closeModal);
  $('modal').addEventListener('click', function(e){ if(e.target === $('modal')) closeModal(); });

  // ── My orders modal ─────────────────────────────────────────
  function openOrdersModal(){
    $('ordersModal').classList.add('active');
    $('ordersContent').innerHTML = '<div class="loading"><span class="spinner"></span> 加载中...</div>';
    loadMyOrders();
  }
  function closeOrdersModal(){ $('ordersModal').classList.remove('active'); }

  function fmtDate(iso){
    if(!iso) return '';
    var d = new Date(iso);
    return d.getFullYear() + '-' +
      String(d.getMonth()+1).padStart(2,'0') + '-' +
      String(d.getDate()).padStart(2,'0') + ' ' +
      String(d.getHours()).padStart(2,'0') + ':' +
      String(d.getMinutes()).padStart(2,'0');
  }

  function loadMyOrders(){
    var uuid = getDeviceId();
    fetch(API_BASE + '/web/my-orders/?web_device_id=' + encodeURIComponent(uuid))
      .then(function(r){
        return r.json().then(function(data){ return {status: r.status, data: data}; });
      })
      .then(function(res){
        if(isRateLimited(res.status, res.data)){
          $('ordersContent').innerHTML = '<div class="orders-empty">⏱️ ' + RATE_LIMIT_MSG + '</div>';
          return;
        }
        var data = res.data;
        if(!data.success){
          $('ordersContent').innerHTML = '<div class="orders-empty">查询失败：' + (data.message || '未知错误') + '</div>';
          return;
        }
        renderOrders(data.orders || []);
      })
      .catch(function(){
        $('ordersContent').innerHTML = '<div class="orders-empty">网络错误，请稍后重试</div>';
      });
  }

  function renderOrders(orders){
    if(!orders.length){
      $('ordersContent').innerHTML =
        '<div class="orders-empty">'
        + '当前浏览器下暂无订单记录<br><br>'
        + '· 更换浏览器或清除缓存后订单将无法找回<br>'
        + '· 如有问题请联系客服并提供支付凭证'
        + '</div>';
      return;
    }
    var statusLabel = { paid:'已支付', pending:'待支付', failed:'失败', expired:'已过期' };
    var statusColor = { paid:'var(--amber)', pending:'var(--text-dim)', failed:'#d9534f', expired:'var(--text-faint)' };
    var html = '';
    orders.forEach(function(o){
      var color = statusColor[o.status] || 'var(--text-dim)';
      var label = statusLabel[o.status] || o.status;
      html += '<div class="order-item">';
      html += '  <div class="order-head">';
      html += '    <b>' + (o.package_name || '套餐') + '</b>';
      html += '    <span style="color:' + color + ';font-weight:600;">' + label + '</span>';
      html += '  </div>';
      html += '  <div class="order-head">';
      html += '    <span>订单号：' + o.order_no + '</span>';
      html += '    <span>' + fmtDate(o.created_at) + '</span>';
      html += '  </div>';
      html += '  <div class="order-head"><span>¥' + o.amount + '</span></div>';
      if(o.status === 'paid' && o.activation_code){
        html += '  <div class="order-code">';
        html += '    <span>' + o.activation_code + '</span>';
        html += '    <button onclick="copyOrderCode(this,\'' + o.activation_code + '\')">复制</button>';
        html += '  </div>';
      } else if(o.status === 'pending'){
        html += '  <div style="font-size:13px;color:var(--text-faint);margin-top:8px;">尚未支付，请在 30 分钟内完成支付</div>';
      } else if(o.status === 'failed'){
        html += '  <div style="font-size:13px;color:#d9534f;margin-top:8px;">支付失败，请重新下单</div>';
      } else if(o.status === 'expired'){
        html += '  <div style="font-size:13px;color:var(--text-faint);margin-top:8px;">订单已过期，请重新下单</div>';
      } else if(o.status === 'paid' && !o.activation_code){
        html += '  <div style="font-size:13px;color:var(--text-faint);margin-top:8px;">激活码尚未生成，请稍后刷新</div>';
      }
      html += '</div>';
    });
    $('ordersContent').innerHTML = html;
  }

  window.copyOrderCode = function(btn, code){
    navigator.clipboard.writeText(code).then(function(){
      var orig = btn.textContent;
      btn.textContent = '已复制!';
      setTimeout(function(){ btn.textContent = orig; }, 1500);
    });
  };

  $('myOrdersBtn').addEventListener('click', function(e){
    e.preventDefault();
    openOrdersModal();
  });
  $('ordersModalClose').addEventListener('click', closeOrdersModal);
  $('ordersModal').addEventListener('click', function(e){ if(e.target === $('ordersModal')) closeOrdersModal(); });

  // ── Init ────────────────────────────────────────────────────────
  loadPackages();
})();
