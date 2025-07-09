(function () {
    'use strict';

    alert(AndroidApp.getUserLanguage() ||"not working")
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