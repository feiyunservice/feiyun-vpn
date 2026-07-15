(function(){
  // Auto-number visible steps
  function renumberSteps(){
    document.querySelectorAll('.step-list').forEach(function(list){
      var n = 0;
      list.querySelectorAll('.step').forEach(function(step){
        if(step.offsetParent !== null){
          n++;
          var num = step.querySelector('.step-num');
          if(num) num.textContent = n;
        }
      });
    });
  }
  renumberSteps();

  // Platform tabs
  var btns = document.querySelectorAll('.tab-btn');
  var panels = document.querySelectorAll('.tutorial-panel');
  function switchTab(name){
    btns.forEach(function(b){b.classList.remove('active');});
    panels.forEach(function(p){p.classList.remove('active');});
    var target = document.querySelector('.tab-btn[data-tab="'+name+'"]');
    var panel = document.getElementById('panel-'+name);
    if(target) target.classList.add('active');
    if(panel) panel.classList.add('active');
    renumberSteps();
  }
  btns.forEach(function(btn){
    btn.addEventListener('click', function(){ switchTab(btn.dataset.tab); });
  });
  // Auto-select tab from URL hash
  if(window.location.hash){
    var h = window.location.hash.replace('#','').toLowerCase();
    if(h === 'faq'){
      // Scroll to FAQ section
      var faqEl = document.getElementById('faq');
      if(faqEl) setTimeout(function(){ faqEl.scrollIntoView({behavior:'smooth'}); }, 100);
    } else {
      switchTab(h);
    }
  }

  // Install method sub-tabs
  document.querySelectorAll('.install-tab').forEach(function(tab){
    tab.addEventListener('click', function(){
      var parent = tab.closest('.step-list');
      parent.querySelectorAll('.install-tab').forEach(function(t){t.classList.remove('active');});
      parent.querySelectorAll('.install-panel').forEach(function(p){p.classList.remove('active');});
      tab.classList.add('active');
      parent.querySelector('#install-'+tab.dataset.install).classList.add('active');
      renumberSteps();
    });
  });

  // FAQ accordion
  document.querySelectorAll('.faq-q').forEach(function(q){
    q.addEventListener('click', function(){
      q.parentElement.classList.toggle('open');
    });
  });

  // Download address dropdowns
  var dlMenus = document.querySelectorAll('.dl-menu');
  dlMenus.forEach(function(menu){
    var trigger = menu.querySelector('.dl-trigger');
    if(!trigger) return;
    trigger.addEventListener('click', function(e){
      e.stopPropagation();
      var isOpen = menu.classList.contains('open');
      dlMenus.forEach(function(m){ m.classList.remove('open'); });
      if(!isOpen) menu.classList.add('open');
    });
  });
  document.addEventListener('click', function(){
    dlMenus.forEach(function(m){ m.classList.remove('open'); });
  });
})();
