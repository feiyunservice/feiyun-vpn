// Libredesk chat widget — shared across pages.
//
// Usage:
//   <script src="assets/libredesk.js"></script>
//
// Include it near the end of <body> on any page that should show the
// customer-service chat widget. Config MUST be assigned before widget.js
// runs, so we set it synchronously here and then inject widget.js
// asynchronously afterwards.

window.LibredeskSettings = {
  baseURL: 'https://service.feiyun.app',
  inboxID: 'f6bb3686-29bb-4417-b055-fb94b28603e7'
};

(function () {
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://service.feiyun.app/widget.js';
  document.head.appendChild(s);
})();
