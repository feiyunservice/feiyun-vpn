// Shared mobile hamburger menu (used by index / pricing / tutorial)
(function(){
  var btn = document.getElementById('navToggle');
  var links = document.querySelector('.navlinks');
  if(!btn || !links) return;
  btn.addEventListener('click', function(e){
    e.stopPropagation();
    links.classList.toggle('open');
    btn.textContent = links.classList.contains('open') ? '✕' : '☰';
  });
  links.addEventListener('click', function(){
    links.classList.remove('open');
    btn.textContent = '☰';
  });
  document.addEventListener('click', function(e){
    if(!links.contains(e.target) && e.target !== btn){
      links.classList.remove('open');
      btn.textContent = '☰';
    }
  });
})();
