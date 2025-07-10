(function () {
    'use strict';

(async function monitorUrlChange() {
if (window.__myInjectedScriptHasRun__) {
     return
    }
  let currentUrl = window.location.href;

    window.__myInjectedScriptHasRun__ = true;

          console.log("Injected script is running once!",Date.now());

})();
    return
    // Your DOM manipulation code here
    // Example: document.getElementById('myElement').style.color = 'red';
    document.querySelector("body").style.backgroundColor="red"
    console.log("hello")
    function replaceTextNodes(element) {
      for (const node of element.childNodes) {
        if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim() !== '') {
          node.nodeValue = AndroidApp.getUserLanguage() ||"not working"
        } else {
          replaceTextNodes(node);
        }
      }
    }

    replaceTextNodes(document.body);


})();